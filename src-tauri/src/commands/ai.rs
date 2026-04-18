//! AI 相关命令（SPEC §3）。
//!
//! 命令层只做参数解析 + spawn_blocking + 错误包装；健康检查 / 路径 /
//! runtime 业务在 `services::ai::*`。

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::models::ai_health::AiHealthResult;
use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::settings::Settings;
use crate::services::ai::{chat, health, llama_runtime, paths};
use crate::services::storage_service::Database;

/// 不依赖 Tauri State 的底层健康检查 —— 单测入口。
///
/// 显式接收 `runtime_ready` —— 调用方决定真值来源（生产用全局 atomic，单测可
/// 注入 true/false）。`compute_health_default` 是生产用的 wrapper：读全局
/// `llama_runtime::is_runtime_loaded()`。
pub(crate) fn compute_health_with_state(
    settings: &Settings,
    runtime_ready: bool,
) -> AiHealthResult {
    match paths::model_file_path(&settings.ai_model_name) {
        Some(path) => health::check(&path, &settings.ai_model_name, runtime_ready),
        None => AiHealthResult {
            runtime_ready,
            model_present: false,
            model_name: settings.ai_model_name.clone(),
            accelerator_kind: health::detect_accelerator(),
        },
    }
}

/// 生产用入口：runtime_ready 来自全局 `IS_LOADED` atomic。
pub(crate) fn compute_health(settings: &Settings) -> AiHealthResult {
    compute_health_with_state(settings, llama_runtime::is_runtime_loaded())
}

/// `ai_health_check`：5 秒轮询端点，只做廉价探测（文件 stat + 编译时
/// 加速器探测），不触发 sha256 / FFI。
#[tauri::command]
pub async fn ai_health_check(db: State<'_, Arc<Database>>) -> AppResult<AiHealthResult> {
    tracing::debug!("AI 健康检查");
    let db = (*db).clone();
    let settings = tokio::task::spawn_blocking(move || db.settings_load())
        .await
        .map_err(|e| AppError::new(ErrorCode::Unknown, format!("健康检查任务失败: {}", e)))??;
    Ok(compute_health(&settings))
}

/// `ai_chat_send` 入参（v0.1）。
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(Serialize, TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiChatSendInput {
    pub session_id: String,
    pub text: String,
}

/// `ai_chat_cancel` 入参（v0.1）。
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(Serialize, TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiChatCancelInput {
    pub message_id: String,
}

/// `ai_chat_cancel` 返回值。`canceled=false` 表示该 messageId 已结束 /
/// 不存在 —— 这是良性 noop（防 race），调用方不需要处理。
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(Deserialize, PartialEq, Eq, TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiChatCancelResult {
    pub canceled: bool,
}

/// `ai_chat_send` 返回值。
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(Deserialize, PartialEq, Eq, TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiChatSendResult {
    pub message_id: String,
}

/// `ai_chat_send` (v0.1 stub)：立即返回 messageId，异步发射 `ai:thinking`
/// → 多次 `ai:token` → `ai:done` 事件。真实 LlamaRuntime::generate 在
/// T1.3 slice 3 之后接入；事件契约不会变。
#[tauri::command]
pub async fn ai_chat_send(app: AppHandle, input: AiChatSendInput) -> AppResult<AiChatSendResult> {
    if input.text.trim().is_empty() {
        return Err(AppError::invalid_argument("chat text cannot be empty"));
    }
    if input.session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("sessionId cannot be empty"));
    }
    let message_id = Uuid::new_v4().to_string();
    tracing::debug!(
        session_id = %input.session_id,
        message_id = %message_id,
        text_len = input.text.chars().count(),
        "AI chat send (stub)"
    );

    // spawn 异步任务驱动事件；命令立即返回 messageId 让前端登记 pending 状态。
    // run_chat_stream 内部根据 loaded_runtime() 自动选真 generate 或 stub echo。
    tauri::async_runtime::spawn(chat::run_chat_stream(
        app,
        input.session_id,
        message_id.clone(),
        input.text,
    ));

    Ok(AiChatSendResult { message_id })
}

/// `ai_chat_cancel`：触发指定 messageId 的取消。返回的 canceled=false 表示
/// 该消息已完成或从未存在 —— 视为 noop，前端可忽略（例如用户连点 stop）。
#[tauri::command]
pub async fn ai_chat_cancel(input: AiChatCancelInput) -> AppResult<AiChatCancelResult> {
    if input.message_id.trim().is_empty() {
        return Err(AppError::invalid_argument("messageId cannot be empty"));
    }
    let canceled = chat::cancel_message(&input.message_id);
    tracing::debug!(message_id = %input.message_id, canceled, "AI chat cancel");
    Ok(AiChatCancelResult { canceled })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai_health::AcceleratorKind;

    fn make_settings(model_name: &str) -> Settings {
        let mut s = Settings::default();
        s.ai_model_name = model_name.to_string();
        s
    }

    #[test]
    fn compute_health_with_state_propagates_runtime_ready_false() {
        let settings = make_settings("gemma4:e4b");
        let result = compute_health_with_state(&settings, false);
        assert!(!result.runtime_ready);
    }

    #[test]
    fn compute_health_with_state_propagates_runtime_ready_true() {
        let settings = make_settings("gemma4:e4b");
        let result = compute_health_with_state(&settings, true);
        assert!(result.runtime_ready);
    }

    #[test]
    fn compute_health_reads_global_runtime_loaded_state() {
        // 不变式：生产 wrapper 必须读全局 atomic 当下值。
        let settings = make_settings("gemma4:e4b");
        let result = compute_health(&settings);
        assert_eq!(result.runtime_ready, llama_runtime::is_runtime_loaded());
    }

    #[test]
    fn compute_health_propagates_settings_model_name() {
        let settings = make_settings("gemma5:e2b");
        let result = compute_health_with_state(&settings, false);
        assert_eq!(result.model_name, "gemma5:e2b");
    }

    #[test]
    fn compute_health_reports_model_absent_when_not_downloaded() {
        // 默认环境下不会预置 gemma4 GGUF 文件
        let settings = make_settings("gemma4:e4b");
        let result = compute_health_with_state(&settings, false);
        assert!(
            !result.model_present,
            "model should be absent in test env, got present=true"
        );
    }

    #[test]
    fn compute_health_returns_platform_accelerator() {
        let settings = make_settings("gemma4:e4b");
        let result = compute_health_with_state(&settings, false);
        #[cfg(target_os = "macos")]
        assert_eq!(result.accelerator_kind, AcceleratorKind::Metal);
        #[cfg(not(target_os = "macos"))]
        assert_eq!(result.accelerator_kind, AcceleratorKind::Cpu);
    }

    #[test]
    fn ai_chat_send_input_round_trips_camel_case() {
        let input = AiChatSendInput {
            session_id: "tab-1".into(),
            text: "ping".into(),
        };
        let json = serde_json::to_string(&input).expect("serialize");
        assert!(json.contains("\"sessionId\""));
        assert!(json.contains("\"text\""));
        let back: AiChatSendInput = serde_json::from_str(&json).expect("round trip");
        assert_eq!(back.session_id, "tab-1");
        assert_eq!(back.text, "ping");
    }

    #[test]
    fn ai_chat_send_result_round_trips_camel_case() {
        let r = AiChatSendResult {
            message_id: "abc".into(),
        };
        let json = serde_json::to_string(&r).expect("serialize");
        assert!(json.contains("\"messageId\""));
        let back: AiChatSendResult = serde_json::from_str(&json).expect("round trip");
        assert_eq!(back, r);
    }

    #[test]
    fn ai_chat_cancel_input_uses_camel_case() {
        let input = AiChatCancelInput {
            message_id: "msg-1".into(),
        };
        let json = serde_json::to_string(&input).expect("serialize");
        assert!(json.contains("\"messageId\""));
        let back: AiChatCancelInput = serde_json::from_str(&json).expect("round trip");
        assert_eq!(back.message_id, "msg-1");
    }

    #[test]
    fn ai_chat_cancel_result_uses_camel_case() {
        let r = AiChatCancelResult { canceled: true };
        let json = serde_json::to_string(&r).expect("serialize");
        assert!(json.contains("\"canceled\""));
        let back: AiChatCancelResult = serde_json::from_str(&json).expect("round trip");
        assert_eq!(back, r);
    }

    #[tokio::test]
    async fn ai_chat_cancel_returns_false_for_unknown_message() {
        // 命令层不需要 Tauri State —— 直接走入参逻辑
        let input = AiChatCancelInput {
            message_id: "definitely-not-registered".into(),
        };
        let result = ai_chat_cancel(input).await.expect("ok");
        assert!(!result.canceled);
    }

    #[tokio::test]
    async fn ai_chat_cancel_rejects_empty_message_id() {
        let input = AiChatCancelInput {
            message_id: "   ".into(),
        };
        let err = ai_chat_cancel(input).await.unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidArgument);
    }

    #[tokio::test]
    async fn ai_chat_cancel_returns_true_when_message_registered() {
        let id = format!("test-cmd-{}", uuid::Uuid::new_v4());
        let _token = crate::services::ai::chat::register_cancel_token(&id);
        let result = ai_chat_cancel(AiChatCancelInput {
            message_id: id.clone(),
        })
        .await
        .expect("ok");
        assert!(result.canceled);
        // 二次取消应 noop（registry 已清空）
        let result2 = ai_chat_cancel(AiChatCancelInput { message_id: id })
            .await
            .expect("ok");
        assert!(!result2.canceled);
    }
}
