//! AI 相关命令（SPEC §3）。
//!
//! 命令层只做参数解析 + spawn_blocking + 错误包装；健康检查 / 路径 /
//! runtime 业务在 `services::ai::*`。

use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::models::ai_events::{AiDownloadPhase, AiDownloadProgressPayload};
use crate::models::ai_health::AiHealthResult;
use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::settings::{Settings, SettingsPatch};
use crate::services::ai::llama_runtime::{LlamaRuntime, LoadOptions, SystemRamProbe};
use crate::services::ai::model_download::{
    self, DownloadOutcome, SysDiskProbe, MODEL_DISK_REQUIRED_BYTES, MODEL_DOWNLOAD_URL,
    MODEL_EXPECTED_SHA256_HEX, MODEL_EXPECTED_SIZE_BYTES,
};
use crate::services::ai::{chat, context, health, llama_runtime, paths};
use crate::services::session_manager::SessionManager;
use crate::services::storage_service::Database;
use crate::services::terminal_manager::TerminalManager;

// Download 事件名 —— `ai:download_progress` 每阶段重复；`ai:download_done` 终态
// 仅发一次。命名约定与 chat 事件（`ai:thinking` / `ai:token` / `ai:done`）对齐。
pub(crate) const EVENT_DOWNLOAD_PROGRESS: &str = "ai:download_progress";
pub(crate) const EVENT_DOWNLOAD_DONE: &str = "ai:download_done";

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

// ---- ai_model_download ------------------------------------------------------

/// `ai_model_download_cancel` 返回值。
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(Deserialize, PartialEq, Eq, TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiModelDownloadCancelResult {
    /// 是否成功取消了一个正在进行的下载。false 代表没有活跃下载（race-tolerant noop）。
    pub canceled: bool,
}

/// 单例 cancel 槽 —— v0.1 只允许一次一个下载（模型本身就一份）。
/// 并发 `ai_model_download` 发起会在 `try_register_download_cancel` 处被拒。
static DOWNLOAD_CANCEL_SLOT: OnceLock<Mutex<Option<CancellationToken>>> = OnceLock::new();

fn download_slot() -> &'static Mutex<Option<CancellationToken>> {
    DOWNLOAD_CANCEL_SLOT.get_or_init(|| Mutex::new(None))
}

/// 尝试登记一个新的下载 cancel token。已有下载在进行 → 返回 None（调用方应
/// 返回 `AiUnavailable`，提示用户等待 / 手动 cancel）。
fn try_register_download_cancel() -> Option<CancellationToken> {
    let mut slot = download_slot().lock().ok()?;
    if slot.is_some() {
        return None;
    }
    let token = CancellationToken::new();
    *slot = Some(token.clone());
    Some(token)
}

/// 下载结束后清除槽位 —— 即便失败 / 取消也要清，否则 second start 会被永久拒。
fn clear_download_cancel() {
    if let Ok(mut slot) = download_slot().lock() {
        *slot = None;
    }
}

/// 取消活跃下载。返回 true 表示找到并触发了 cancel；false 表示槽位为空。
fn cancel_active_download() -> bool {
    let mut slot = match download_slot().lock() {
        Ok(s) => s,
        Err(_) => return false,
    };
    if let Some(token) = slot.take() {
        token.cancel();
        true
    } else {
        false
    }
}

/// 纯函数：license 门检查。Settings 可从数据库读，也可从单测直接构造。
pub(crate) fn check_license_accepted(settings: &Settings) -> AppResult<()> {
    if settings.ai_license_accepted_at.is_some() {
        return Ok(());
    }
    Err(
        AppError::new(ErrorCode::AiUnavailable, "需先接受 Gemma Terms of Use")
            .with_detail("license not accepted")
            .with_retryable(false),
    )
}

/// 根据 settings 中的模型名解析目标 GGUF 路径；解析失败说明系统没有 data_local_dir
/// （罕见：非 Linux desktop 无 XDG_DATA_HOME）。
fn resolve_model_dest(settings: &Settings) -> AppResult<PathBuf> {
    paths::model_file_path(&settings.ai_model_name).ok_or_else(|| {
        AppError::new(ErrorCode::AiUnavailable, "无法解析模型存储路径")
            .with_detail("dirs::data_local_dir() returned None")
            .with_retryable(false)
    })
}

/// `ai_model_download`：启动 Gemma 4 E4B Q4_K_M GGUF 下载（SPEC §5 T1.5）。
///
/// 立即返回 `Ok(())` —— 实际下载在 spawned task 中跑，通过
/// `ai:download_progress` + `ai:download_done` 事件反馈。并发调用（前一次未结束时
/// 再点击 "Download"）返回 `AiUnavailable { retryable=false }`。
///
/// 前置检查（同步发生，错误会立即返回，不 spawn task）：
/// 1. license 已接受
/// 2. 磁盘空间 ≥ 7GB（SysDiskProbe 查不到时 fail-open）
/// 3. 无活跃下载
#[tauri::command]
pub async fn ai_model_download(app: AppHandle, db: State<'_, Arc<Database>>) -> AppResult<()> {
    let db = (*db).clone();
    let settings = tokio::task::spawn_blocking({
        let db = db.clone();
        move || db.settings_load()
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Unknown, format!("读取 settings 失败: {}", e)))??;

    check_license_accepted(&settings)?;
    let dest = resolve_model_dest(&settings)?;

    let dest_dir = dest.parent().ok_or_else(|| {
        AppError::new(ErrorCode::AiUnavailable, "模型路径无父目录")
            .with_detail(dest.display().to_string())
            .with_retryable(false)
    })?;
    model_download::check_disk_available(&SysDiskProbe, dest_dir, MODEL_DISK_REQUIRED_BYTES)?;

    let token = try_register_download_cancel().ok_or_else(|| {
        AppError::new(ErrorCode::AiUnavailable, "模型下载已在进行中")
            .with_detail("concurrent ai_model_download rejected")
            .with_retryable(false)
    })?;

    tracing::info!(
        dest = %dest.display(),
        expected_size = MODEL_EXPECTED_SIZE_BYTES,
        "AI 模型下载开始"
    );

    tauri::async_runtime::spawn(run_model_download(app, dest, token));
    Ok(())
}

/// 下载编排：download_gguf → verify_sha256 → 终态事件。
///
/// 任何失败都汇总成一个 `ai:download_done { canceled, error }` 事件；调用方
/// （前端）据此决定重试 / 转报错 UI。
async fn run_model_download(app: AppHandle, dest: PathBuf, token: CancellationToken) {
    let outcome = do_model_download(&app, &dest, &token).await;
    clear_download_cancel();

    let payload = match outcome {
        Ok(DownloadOutcome::Completed) | Ok(DownloadOutcome::AlreadyPresent) => {
            crate::models::ai_events::AiDownloadDonePayload {
                canceled: false,
                error: None,
            }
        }
        Ok(DownloadOutcome::Cancelled) => crate::models::ai_events::AiDownloadDonePayload {
            canceled: true,
            error: None,
        },
        Err(error) => crate::models::ai_events::AiDownloadDonePayload {
            canceled: false,
            error: Some(error),
        },
    };
    let _ = app.emit(EVENT_DOWNLOAD_DONE, &payload);
    tracing::info!(
        canceled = payload.canceled,
        has_error = payload.error.is_some(),
        "AI 模型下载结束"
    );
}

async fn do_model_download(
    app: &AppHandle,
    dest: &std::path::Path,
    token: &CancellationToken,
) -> AppResult<DownloadOutcome> {
    // --- Phase 1: fetching ----
    let app_for_cb = app.clone();
    let emit_fetching = move |tick: model_download::ProgressTick| {
        let _ = app_for_cb.emit(
            EVENT_DOWNLOAD_PROGRESS,
            &AiDownloadProgressPayload {
                phase: AiDownloadPhase::Fetching,
                downloaded: tick.downloaded,
                total: tick.total,
                percent: tick.percent,
            },
        );
    };
    let outcome = model_download::download_gguf(
        MODEL_DOWNLOAD_URL,
        dest,
        MODEL_EXPECTED_SIZE_BYTES,
        emit_fetching,
        token,
    )
    .await?;

    if matches!(outcome, DownloadOutcome::Cancelled) {
        return Ok(outcome);
    }

    // --- Phase 2: verifying ----
    let _ = app.emit(
        EVENT_DOWNLOAD_PROGRESS,
        &AiDownloadProgressPayload {
            phase: AiDownloadPhase::Verifying,
            downloaded: 0,
            total: MODEL_EXPECTED_SIZE_BYTES,
            percent: 0,
        },
    );
    let dest_owned = dest.to_path_buf();
    tokio::task::spawn_blocking(move || {
        model_download::verify_sha256(&dest_owned, MODEL_EXPECTED_SHA256_HEX)
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Unknown, format!("verify 任务 join 失败: {}", e)))??;
    let _ = app.emit(
        EVENT_DOWNLOAD_PROGRESS,
        &AiDownloadProgressPayload {
            phase: AiDownloadPhase::Verifying,
            downloaded: MODEL_EXPECTED_SIZE_BYTES,
            total: MODEL_EXPECTED_SIZE_BYTES,
            percent: 100,
        },
    );

    // --- Phase 3: loading (runtime mmap + Metal buffers) ----
    let _ = app.emit(
        EVENT_DOWNLOAD_PROGRESS,
        &AiDownloadProgressPayload {
            phase: AiDownloadPhase::Loading,
            downloaded: 0,
            total: MODEL_EXPECTED_SIZE_BYTES,
            percent: 0,
        },
    );
    let dest_for_load = dest.to_path_buf();
    tokio::task::spawn_blocking(move || {
        LlamaRuntime::load(
            &dest_for_load,
            MODEL_EXPECTED_SHA256_HEX,
            LoadOptions::default(),
            &SystemRamProbe,
        )
        .map(|_| ())
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Unknown, format!("runtime load join 失败: {}", e)))??;
    let _ = app.emit(
        EVENT_DOWNLOAD_PROGRESS,
        &AiDownloadProgressPayload {
            phase: AiDownloadPhase::Loading,
            downloaded: MODEL_EXPECTED_SIZE_BYTES,
            total: MODEL_EXPECTED_SIZE_BYTES,
            percent: 100,
        },
    );

    Ok(outcome)
}

/// `ai_model_download_cancel`：中断正在进行的下载。返回 `{ canceled: false }`
/// 是良性 noop（下载已结束 / 从未启动）。
#[tauri::command]
pub async fn ai_model_download_cancel() -> AppResult<AiModelDownloadCancelResult> {
    let canceled = cancel_active_download();
    tracing::debug!(canceled, "AI 模型下载取消请求");
    Ok(AiModelDownloadCancelResult { canceled })
}

/// `ai_runtime_load`：把磁盘上已存在的 GGUF 载入到 llama.cpp runtime。
///
/// 幂等：runtime 已加载直接返回 Ok（LOADED_RUNTIME OnceLock 首次 set 后后续 set 被忽略，
/// mark_runtime_loaded 二次 store(true) 也是 noop）。
/// 前置：模型文件必须在 paths::model_file_path 解析出的路径上存在；sha256 必须匹配 pin。
/// 用途：
///   - 前端健康检查看到 `modelPresent && !runtimeReady` 时触发（app 重启场景）
///   - 下载成功时内部已调一次，不需要前端再调
#[tauri::command]
pub async fn ai_runtime_load(db: State<'_, Arc<Database>>) -> AppResult<()> {
    if llama_runtime::is_runtime_loaded() {
        tracing::debug!("ai_runtime_load: runtime 已加载，noop");
        return Ok(());
    }
    let db = (*db).clone();
    let settings = tokio::task::spawn_blocking({
        let db = db.clone();
        move || db.settings_load()
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Unknown, format!("读取 settings 失败: {}", e)))??;

    let path = resolve_model_dest(&settings)?;
    if !path.exists() {
        return Err(
            AppError::new(ErrorCode::AiUnavailable, "模型文件不存在，请先下载")
                .with_detail(path.display().to_string())
                .with_retryable(false),
        );
    }

    tracing::info!(path = %path.display(), "AI runtime 开始加载");
    tokio::task::spawn_blocking(move || {
        LlamaRuntime::load(
            &path,
            MODEL_EXPECTED_SHA256_HEX,
            LoadOptions::default(),
            &SystemRamProbe,
        )
        .map(|_| ())
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Unknown, format!("runtime load join 失败: {}", e)))??;
    tracing::info!("AI runtime 加载完成");
    Ok(())
}

/// `ai_model_delete` 返回值。
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(Deserialize, PartialEq, Eq, TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiModelDeleteResult {
    /// 本次调用前文件是否存在（true = 实际删除；false = 本来就不在 = noop）
    pub deleted: bool,
    /// 解析出的目标路径（便于调试 / UI 展示）
    pub path: String,
}

/// `ai_model_delete`：删除已下载的 GGUF。license accept 记录保留 —— 用户已知情
/// 同意，重新下载不需要再 accept 一次。下载进行中调用 → 拒绝（先 cancel 再删）。
#[tauri::command]
pub async fn ai_model_delete(db: State<'_, Arc<Database>>) -> AppResult<AiModelDeleteResult> {
    // 下载进行中禁止删除 —— 不然同时 remove + write 同一文件 UB
    if download_slot()
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|_| ()))
        .is_some()
    {
        return Err(AppError::new(
            ErrorCode::AiUnavailable,
            "下载进行中，无法删除模型。请先取消下载。",
        )
        .with_retryable(false));
    }

    let db = (*db).clone();
    let settings = tokio::task::spawn_blocking({
        let db = db.clone();
        move || db.settings_load()
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Unknown, format!("读取 settings 失败: {}", e)))??;

    let dest = resolve_model_dest(&settings)?;
    let path_str = dest.to_string_lossy().into_owned();

    let existed = dest.exists();
    if existed {
        let dest_owned = dest.clone();
        tokio::task::spawn_blocking(move || std::fs::remove_file(&dest_owned))
            .await
            .map_err(|e| AppError::new(ErrorCode::Unknown, format!("删除任务 join 失败: {}", e)))?
            .map_err(AppError::from)?;
        tracing::info!(path = %dest.display(), "AI 模型已删除");
    } else {
        tracing::debug!(path = %dest.display(), "ai_model_delete: 文件不存在，noop");
    }

    Ok(AiModelDeleteResult {
        deleted: existed,
        path: path_str,
    })
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
        // 用随机 UUID 当模型名 —— 保证 paths::model_file_path 解析出的路径
        // 在任何开发机 / CI / 已下载过其他模型的机器上都不存在
        let name = format!("definitely-absent-{}", uuid::Uuid::new_v4());
        let settings = make_settings(&name);
        let result = compute_health_with_state(&settings, false);
        assert!(
            !result.model_present,
            "model should be absent for random name, got present=true"
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

    // ---- ai_model_download gate + singleton ---------------------------

    #[test]
    fn check_license_accepted_rejects_when_missing() {
        let settings = Settings::default();
        let err = check_license_accepted(&settings).unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
        assert_eq!(err.retryable, Some(false));
        assert_eq!(err.detail.as_deref(), Some("license not accepted"));
    }

    #[test]
    fn check_license_accepted_passes_when_timestamp_present() {
        let mut settings = Settings::default();
        settings.ai_license_accepted_at = Some(1_700_000_000_000);
        check_license_accepted(&settings).expect("ok");
    }

    #[test]
    fn download_singleton_register_twice_rejects_second() {
        // 前一轮测试可能留下的状态：强制清一次以保证本测试起始干净
        clear_download_cancel();

        let first = try_register_download_cancel();
        assert!(first.is_some(), "首次登记必须成功");
        let second = try_register_download_cancel();
        assert!(second.is_none(), "未清空时第二次登记必须返回 None");

        // 清理后再次登记又可以成功
        clear_download_cancel();
        assert!(try_register_download_cancel().is_some());
        clear_download_cancel(); // tear down
    }

    #[test]
    fn cancel_active_download_triggers_token_and_clears_slot() {
        clear_download_cancel();
        let token = try_register_download_cancel().expect("register");
        assert!(!token.is_cancelled());

        assert!(cancel_active_download(), "有活跃下载 → 返回 true");
        assert!(token.is_cancelled(), "cancel 必须触发 token");

        // 再次 cancel 应为 noop
        assert!(!cancel_active_download(), "已清空 → 返回 false");
        clear_download_cancel(); // defensive
    }

    #[test]
    fn cancel_active_download_is_noop_when_no_active_download() {
        clear_download_cancel();
        assert!(!cancel_active_download());
    }

    #[test]
    fn ai_model_delete_result_round_trips_camel_case() {
        let r = AiModelDeleteResult {
            deleted: true,
            path: "/tmp/model.gguf".into(),
        };
        let json = serde_json::to_string(&r).expect("serialize");
        assert!(json.contains("\"deleted\""));
        assert!(json.contains("\"path\""));
        let back: AiModelDeleteResult = serde_json::from_str(&json).expect("round trip");
        assert_eq!(back, r);
    }

    #[test]
    fn ai_model_download_cancel_result_uses_camel_case() {
        let r = AiModelDownloadCancelResult { canceled: true };
        let json = serde_json::to_string(&r).expect("serialize");
        assert!(json.contains("\"canceled\""));
    }

    #[tokio::test]
    async fn ai_model_download_cancel_returns_false_when_idle() {
        clear_download_cancel();
        let result = ai_model_download_cancel().await.expect("ok");
        assert!(!result.canceled);
    }

    #[tokio::test]
    async fn ai_model_download_cancel_returns_true_when_active() {
        clear_download_cancel();
        let _token = try_register_download_cancel().expect("register");
        let result = ai_model_download_cancel().await.expect("ok");
        assert!(result.canceled);
        clear_download_cancel();
    }

    #[test]
    fn resolve_model_dest_uses_ai_model_name_from_settings() {
        let mut s = Settings::default();
        s.ai_model_name = "gemma-4-E4B-it-Q4_K_M".into();
        let path = resolve_model_dest(&s).expect("dest");
        let s = path.to_string_lossy();
        assert!(s.ends_with("gemma-4-E4B-it-Q4_K_M.gguf"));
        assert!(s.contains("TunnelFiles"));
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
