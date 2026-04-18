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
use crate::services::ai::{chat, health, paths};
use crate::services::storage_service::Database;

/// 不依赖 Tauri State 的底层健康检查 —— 单测入口。
pub(crate) fn compute_health(settings: &Settings) -> AiHealthResult {
    match paths::model_file_path(&settings.ai_model_name) {
        Some(path) => health::check(&path, &settings.ai_model_name),
        None => AiHealthResult {
            runtime_ready: false,
            model_present: false,
            model_name: settings.ai_model_name.clone(),
            accelerator_kind: health::detect_accelerator(),
        },
    }
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

    // spawn 异步任务驱动事件；命令立即返回 messageId 让前端登记 pending 状态
    tauri::async_runtime::spawn(chat::run_stub_stream(
        app,
        input.session_id,
        message_id.clone(),
        input.text,
    ));

    Ok(AiChatSendResult { message_id })
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
    fn compute_health_returns_runtime_not_ready() {
        // 没接入 llama.cpp 前，runtime_ready 必须恒 false
        let settings = make_settings("gemma4:e4b");
        let result = compute_health(&settings);
        assert!(!result.runtime_ready);
    }

    #[test]
    fn compute_health_propagates_settings_model_name() {
        let settings = make_settings("gemma5:e2b");
        let result = compute_health(&settings);
        assert_eq!(result.model_name, "gemma5:e2b");
    }

    #[test]
    fn compute_health_reports_model_absent_when_not_downloaded() {
        // 默认环境下不会预置 gemma4 GGUF 文件
        let settings = make_settings("gemma4:e4b");
        let result = compute_health(&settings);
        assert!(
            !result.model_present,
            "model should be absent in test env, got present=true"
        );
    }

    #[test]
    fn compute_health_returns_platform_accelerator() {
        let settings = make_settings("gemma4:e4b");
        let result = compute_health(&settings);
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
}
