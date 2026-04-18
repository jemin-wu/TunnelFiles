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
use crate::models::settings::{Settings, SettingsPatch};
use crate::services::ai::{chat, context, health, llama_runtime, paths};
use crate::services::session_manager::SessionManager;
use crate::services::storage_service::Database;
use crate::services::terminal_manager::TerminalManager;

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

/// 纯函数：用当前时间构造 "接受 license" 的 settings patch。独立出来便于单测。
pub(crate) fn build_license_accept_patch(now_millis: i64) -> SettingsPatch {
    SettingsPatch {
        ai_license_accepted_at: Some(now_millis),
        ..Default::default()
    }
}

/// `ai_license_accept`：用户在 ModelOnboardingDialog 点 "Accept & Download" 时
/// 调用。写入 Gemma ToU 接受时间戳；未调用前 `ai_model_download` 会拒绝执行
/// （返回 `AiUnavailable { detail: "license not accepted" }`）。
///
/// 幂等：重复调用刷新时间戳（用户重新 accept 最新版本 ToU 的场景）。
#[tauri::command]
pub async fn ai_license_accept(db: State<'_, Arc<Database>>) -> AppResult<Settings> {
    let db = (*db).clone();
    let now = chrono::Utc::now().timestamp_millis();
    let patch = build_license_accept_patch(now);
    let settings = tokio::task::spawn_blocking(move || db.settings_update(&patch))
        .await
        .map_err(|e| {
            AppError::new(
                ErrorCode::Unknown,
                format!("license accept 任务失败: {}", e),
            )
        })??;
    tracing::info!(accepted_at = now, "Gemma ToU accepted");
    Ok(settings)
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

/// `ai_chat_send`：立即返回 messageId，异步发射 `ai:thinking` →
/// 多次 `ai:token` → `ai:done` 事件。真 FFI 路径在 runtime 已加载时生效，
/// 否则走 stub echo（T1.3 slice 3 之后已接入）。
///
/// T1.7：发送前自动采集终端 context snapshot，透传给 `run_chat_stream`。
/// 若 session / terminal 缺失 gather_snapshot_from_state 返回空结果，
/// 转换为 `None` 后不注入 context 块。
#[tauri::command]
pub async fn ai_chat_send(
    app: AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    terminal_manager: State<'_, Arc<TerminalManager>>,
    input: AiChatSendInput,
) -> AppResult<AiChatSendResult> {
    if input.text.trim().is_empty() {
        return Err(AppError::invalid_argument("chat text cannot be empty"));
    }
    if input.session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("sessionId cannot be empty"));
    }
    let message_id = Uuid::new_v4().to_string();
    let snapshot_result = gather_snapshot_from_state(
        session_manager.inner(),
        terminal_manager.inner(),
        &input.session_id,
    );
    let prompt_context = context::to_prompt_snapshot(&snapshot_result);
    tracing::debug!(
        session_id = %input.session_id,
        message_id = %message_id,
        text_len = input.text.chars().count(),
        context_present = prompt_context.is_some(),
        "AI chat send"
    );

    tauri::async_runtime::spawn(chat::run_chat_stream(
        app,
        input.session_id,
        message_id.clone(),
        input.text,
        prompt_context,
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

/// `ai_context_snapshot` 入参。
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(Serialize, TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiContextSnapshotInput {
    pub session_id: String,
}

/// `ai_context_snapshot` 返回值。
///
/// - `pwd`：当前承载 session 初始 home_path（v0.1 不跟踪 live cwd）
/// - `recent_output`：已走 `scrubber::redact_probe_output` 硬擦策略 + 行边界对齐
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(Deserialize, PartialEq, Eq, TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiContextSnapshotResult {
    pub session_id: String,
    pub pwd: String,
    pub recent_output: String,
}

/// 共享采集入口：`ai_context_snapshot` 命令和 `ai_chat_send` 自动注入都走这里。
///
/// session / terminal 任意缺失时对应字段返回空串 —— best-effort 语义。调用方
/// 可通过 `context::to_prompt_snapshot` 判断是否需要注入 prompt。
pub(crate) fn gather_snapshot_from_state(
    session_manager: &Arc<SessionManager>,
    terminal_manager: &Arc<TerminalManager>,
    session_id: &str,
) -> AiContextSnapshotResult {
    let home_path = session_manager
        .get_session(session_id)
        .map(|s| s.home_path.clone())
        .unwrap_or_default();
    let raw_output = terminal_manager
        .get_managed_terminal_by_session(session_id)
        .map(|t| t.snapshot_recent_output())
        .unwrap_or_default();
    context::compose_snapshot(session_id.to_string(), home_path, raw_output)
}

/// `ai_context_snapshot`：采集指定 session 的终端上下文快照（T1.7）。
///
/// session / terminal 任意缺失时对应字段返回空串 —— best-effort 语义，不 error。
/// 调用方可用空结果判断是否值得注入 prompt。
#[tauri::command]
pub async fn ai_context_snapshot(
    session_manager: State<'_, Arc<SessionManager>>,
    terminal_manager: State<'_, Arc<TerminalManager>>,
    input: AiContextSnapshotInput,
) -> AppResult<AiContextSnapshotResult> {
    if input.session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("sessionId cannot be empty"));
    }
    let result = gather_snapshot_from_state(
        session_manager.inner(),
        terminal_manager.inner(),
        &input.session_id,
    );
    tracing::debug!(
        session_id = %input.session_id,
        recent_bytes = result.recent_output.len(),
        home_present = !result.pwd.is_empty(),
        "AI context snapshot"
    );
    Ok(result)
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

    #[test]
    fn ai_context_snapshot_input_uses_camel_case() {
        let input = AiContextSnapshotInput {
            session_id: "sess-a".into(),
        };
        let json = serde_json::to_string(&input).expect("serialize");
        assert!(json.contains("\"sessionId\""));
        let back: AiContextSnapshotInput = serde_json::from_str(&json).expect("round trip");
        assert_eq!(back.session_id, "sess-a");
    }

    #[test]
    fn ai_context_snapshot_result_uses_camel_case() {
        let r = AiContextSnapshotResult {
            session_id: "sess-a".into(),
            pwd: "/home/alice".into(),
            recent_output: "ls\nfile\n".into(),
        };
        let json = serde_json::to_string(&r).expect("serialize");
        assert!(json.contains("\"sessionId\""));
        assert!(json.contains("\"pwd\""));
        assert!(json.contains("\"recentOutput\""));
        let back: AiContextSnapshotResult = serde_json::from_str(&json).expect("round trip");
        assert_eq!(back, r);
    }

    #[test]
    fn build_license_accept_patch_carries_timestamp_only() {
        let patch = build_license_accept_patch(1_700_000_000_000);
        assert_eq!(patch.ai_license_accepted_at, Some(1_700_000_000_000));
        // 其他字段必须为 None，防止 license accept 意外改动其他设置
        assert!(patch.ai_enabled.is_none());
        assert!(patch.ai_model_name.is_none());
        assert!(patch.default_download_dir.is_none());
        assert!(patch.max_concurrent_transfers.is_none());
        assert!(patch.terminal_font_size.is_none());
    }

    #[test]
    fn build_license_accept_patch_accepts_current_timestamp() {
        let now = chrono::Utc::now().timestamp_millis();
        let patch = build_license_accept_patch(now);
        assert_eq!(patch.ai_license_accepted_at, Some(now));
        assert!(
            now > 1_700_000_000_000,
            "sanity: chrono returned a post-2023 timestamp"
        );
    }

    #[test]
    fn gather_snapshot_returns_empty_fields_when_session_missing() {
        let sm = Arc::new(SessionManager::new());
        let tm = Arc::new(TerminalManager::new());
        let result = gather_snapshot_from_state(&sm, &tm, "nonexistent-session");
        assert_eq!(result.session_id, "nonexistent-session");
        assert_eq!(result.pwd, "");
        assert_eq!(result.recent_output, "");
    }

    #[test]
    fn gather_snapshot_result_maps_to_none_prompt_context_when_empty() {
        let sm = Arc::new(SessionManager::new());
        let tm = Arc::new(TerminalManager::new());
        let result = gather_snapshot_from_state(&sm, &tm, "absent");
        assert!(context::to_prompt_snapshot(&result).is_none());
    }
}
