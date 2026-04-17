//! Session 相关命令
//!
//! - session_connect: 连接到服务器
//! - session_disconnect: 断开连接
//! - session_connect_after_trust: HostKey 确认后继续连接

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
#[cfg(test)]
use ts_rs::TS;

use crate::models::error::{AppError, AppResult};
use crate::models::profile::RecentConnection;
use crate::services::session_manager::{ConnectStatus, SessionManager};
use crate::services::storage_service::Database;
use crate::services::terminal_manager::TerminalManager;
use crate::services::transfer_manager::TransferManager;

/// 连接输入参数
#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ConnectInput {
    /// Profile ID
    pub profile_id: String,
    /// 临时密码（未记住时由前端传入）
    #[serde(default)]
    pub password: Option<String>,
    /// 临时 passphrase（未记住时由前端传入）
    #[serde(default)]
    pub passphrase: Option<String>,
    /// 期望的服务器指纹（connect_after_trust 时用于验证）
    #[serde(default)]
    pub expected_fingerprint: Option<String>,
}

/// 连接结果
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SessionConnectResult {
    /// 会话 ID（连接成功时返回）
    pub session_id: Option<String>,
    /// 远程 home 目录
    pub home_path: Option<String>,
    /// 服务器指纹
    pub server_fingerprint: Option<String>,
    /// 服务器密钥类型（如 ssh-ed25519, ssh-rsa）
    pub server_key_type: Option<String>,
    /// 是否需要确认 HostKey
    pub need_host_key_confirm: bool,
    /// HostKey 是否为不匹配（服务器密钥已变更，非首次连接）
    pub host_key_mismatch: bool,
}

/// 会话状态事件 payload
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SessionStatusPayload {
    pub session_id: String,
    pub status: String, // "connected" | "disconnected" | "error"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

use crate::models::profile::Profile;
use crate::services::session_manager::ConnectResult;

/// 准备连接所需的数据
fn prepare_connection(db: &Database, profile_id: &str) -> AppResult<(Profile, u64)> {
    let profile = db
        .profile_get(profile_id)?
        .ok_or_else(|| AppError::not_found(format!("Profile {} 不存在", profile_id)))?;
    let settings = db.settings_load()?;
    Ok((profile, settings.connection_timeout_secs))
}

/// 连接成功后的处理
fn finalize_connection(app: &AppHandle, db: &Database, profile: &Profile, result: &ConnectResult) {
    record_recent_connection(db, profile);
    emit_session_connected(app, &result.session_id);
}

fn record_recent_connection(db: &Database, profile: &Profile) {
    let recent = RecentConnection {
        id: uuid::Uuid::new_v4().to_string(),
        profile_id: profile.id.clone(),
        profile_name: profile.name.clone(),
        host: profile.host.clone(),
        username: profile.username.clone(),
        connected_at: chrono::Utc::now().timestamp_millis(),
    };
    if let Err(e) = db.recent_connection_add(&recent) {
        tracing::warn!(error = %e, "记录最近连接失败");
    }
}

fn emit_session_connected(app: &AppHandle, session_id: &str) {
    let payload = SessionStatusPayload {
        session_id: session_id.to_string(),
        status: "connected".to_string(),
        message: None,
    };
    app.emit("session:status", &payload).ok();
}

fn build_connected_result(result: ConnectResult) -> SessionConnectResult {
    SessionConnectResult {
        session_id: Some(result.session_id),
        home_path: Some(result.home_path),
        server_fingerprint: Some(result.fingerprint),
        server_key_type: None,
        need_host_key_confirm: false,
        host_key_mismatch: false,
    }
}

/// 连接到服务器
///
/// 完整连接流程：
/// 1. 获取 Profile
/// 2. TCP 连接
/// 3. SSH 握手
/// 4. HostKey 校验
///    - 首次连接：返回 need_host_key_confirm=true，前端弹窗确认
///    - 已信任：继续
///    - 不匹配：返回错误
/// 5. 认证（密码/Key）
/// 6. 创建 SFTP Channel
/// 7. 返回 session_id
#[tauri::command]
pub async fn session_connect(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    session_manager: State<'_, Arc<SessionManager>>,
    input: ConnectInput,
) -> AppResult<SessionConnectResult> {
    tracing::info!(profile_id = %input.profile_id, "开始连接");

    let (profile, timeout_secs) = prepare_connection(&db, &input.profile_id)?;

    // 执行连接（同步操作，需要在阻塞线程中执行）
    let db_clone = (*db).clone();
    let profile_clone = profile.clone();
    let password = input.password.clone();
    let passphrase = input.passphrase.clone();
    let session_manager_clone = (*session_manager).clone();

    let connect_result = tokio::task::spawn_blocking(move || {
        session_manager_clone.connect(
            &db_clone,
            &profile_clone,
            password.as_deref(),
            passphrase.as_deref(),
            timeout_secs,
        )
    })
    .await
    .map_err(|e| {
        AppError::new(
            crate::models::error::ErrorCode::Unknown,
            format!("连接任务失败: {}", e),
        )
    })??;

    // 4. 处理连接结果
    match connect_result {
        ConnectStatus::NeedHostKeyConfirm(pending) => {
            // 返回需要确认 HostKey 的结果，前端通过返回值处理
            Ok(SessionConnectResult {
                session_id: None,
                home_path: None,
                server_fingerprint: Some(pending.fingerprint),
                server_key_type: Some(pending.key_type),
                need_host_key_confirm: true,
                host_key_mismatch: pending.is_mismatch,
            })
        }
        ConnectStatus::Connected(result) => {
            finalize_connection(&app, &db, &profile, &result);
            tracing::info!(session_id = %result.session_id, profile_id = %input.profile_id, "连接成功");
            Ok(build_connected_result(result))
        }
    }
}

/// HostKey 确认后继续连接
///
/// 用户在 HostKey 确认弹窗中点击"信任"后：
/// 1. 前端调用 security_trust_hostkey 保存信任
/// 2. 前端调用此命令继续连接
#[tauri::command]
pub async fn session_connect_after_trust(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    session_manager: State<'_, Arc<SessionManager>>,
    input: ConnectInput,
) -> AppResult<SessionConnectResult> {
    tracing::info!(profile_id = %input.profile_id, "HostKey 已信任，继续连接");

    let (profile, timeout_secs) = prepare_connection(&db, &input.profile_id)?;

    // 执行连接
    let profile_clone = profile.clone();
    let password = input.password.clone();
    let passphrase = input.passphrase.clone();
    let expected_fingerprint = input.expected_fingerprint.clone().unwrap_or_default();
    let session_manager_clone = (*session_manager).clone();

    let result = tokio::task::spawn_blocking(move || {
        session_manager_clone.connect_after_trust(
            &profile_clone,
            password.as_deref(),
            passphrase.as_deref(),
            timeout_secs,
            &expected_fingerprint,
        )
    })
    .await
    .map_err(|e| {
        AppError::new(
            crate::models::error::ErrorCode::Unknown,
            format!("连接任务失败: {}", e),
        )
    })??;

    finalize_connection(&app, &db, &profile, &result);
    tracing::info!(session_id = %result.session_id, profile_id = %input.profile_id, "连接成功（HostKey 已确认）");
    Ok(build_connected_result(result))
}

/// 断开连接
///
/// 关闭 SSH 会话，释放资源（同时清理关联的终端）
#[tauri::command]
pub async fn session_disconnect(
    app: AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    terminal_manager: State<'_, Arc<TerminalManager>>,
    transfer_manager: State<'_, Arc<TransferManager>>,
    session_id: String,
) -> AppResult<()> {
    tracing::info!(session_id = %session_id, "断开连接");

    // 1. 先取消关联的传输任务（确保状态为 Canceled 而非 Failed）
    transfer_manager
        .cancel_tasks_by_session(Some(&app), &session_id)
        .await;

    // 2. 清理关联的终端
    if let Err(e) = terminal_manager.close_by_session(&session_id) {
        tracing::warn!(session_id = %session_id, error = %e, "清理关联终端失败");
    }

    // 3. 关闭 SSH 会话
    session_manager.close_session(&session_id)?;

    // 发送断开事件
    let status_payload = SessionStatusPayload {
        session_id: session_id.clone(),
        status: "disconnected".to_string(),
        message: None,
    };
    app.emit("session:status", &status_payload).ok();

    Ok(())
}

/// 获取会话信息
#[tauri::command]
pub async fn session_info(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
) -> AppResult<SessionInfo> {
    let session = session_manager.get_session(&session_id)?;

    Ok(SessionInfo {
        session_id: session.session_id.clone(),
        profile_id: session.profile_id.clone(),
        home_path: session.home_path.clone(),
        fingerprint: session.fingerprint.clone(),
    })
}

/// 会话信息
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    pub profile_id: String,
    pub home_path: String,
    pub fingerprint: String,
}

/// 列出所有活跃会话
#[tauri::command]
pub async fn session_list(
    session_manager: State<'_, Arc<SessionManager>>,
) -> AppResult<Vec<String>> {
    session_manager.list_sessions()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── ConnectInput deserialization ──

    #[test]
    fn connect_input_deserializes_camel_case() {
        let json = r#"{
            "profileId": "abc-123",
            "password": "secret",
            "passphrase": "phrase"
        }"#;
        let input: ConnectInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.profile_id, "abc-123");
        assert_eq!(input.password.as_deref(), Some("secret"));
        assert_eq!(input.passphrase.as_deref(), Some("phrase"));
    }

    #[test]
    fn connect_input_optional_fields_default_to_none() {
        let json = r#"{"profileId": "abc-123"}"#;
        let input: ConnectInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.profile_id, "abc-123");
        assert!(input.password.is_none());
        assert!(input.passphrase.is_none());
    }

    #[test]
    fn connect_input_rejects_snake_case_profile_id() {
        let json = r#"{"profile_id": "abc-123"}"#;
        let result = serde_json::from_str::<ConnectInput>(json);
        assert!(result.is_err(), "snake_case profileId should be rejected");
    }

    // ── SessionConnectResult serialization ──

    #[test]
    fn session_connect_result_serializes_camel_case() {
        let result = SessionConnectResult {
            session_id: Some("sess-1".to_string()),
            home_path: Some("/home/user".to_string()),
            server_fingerprint: Some("SHA256:abc".to_string()),
            server_key_type: Some("ssh-ed25519".to_string()),
            need_host_key_confirm: false,
            host_key_mismatch: false,
        };
        let json = serde_json::to_value(&result).unwrap();

        assert_eq!(json["sessionId"], "sess-1");
        assert_eq!(json["homePath"], "/home/user");
        assert_eq!(json["serverFingerprint"], "SHA256:abc");
        assert_eq!(json["serverKeyType"], "ssh-ed25519");
        assert_eq!(json["needHostKeyConfirm"], false);
        assert_eq!(json["hostKeyMismatch"], false);
        // Ensure snake_case keys are absent
        assert!(json.get("session_id").is_none());
        assert!(json.get("home_path").is_none());
        assert!(json.get("server_fingerprint").is_none());
        assert!(json.get("host_key_mismatch").is_none());
    }

    #[test]
    fn session_connect_result_serializes_none_as_null() {
        let result = SessionConnectResult {
            session_id: None,
            home_path: None,
            server_fingerprint: Some("SHA256:xyz".to_string()),
            server_key_type: Some("ssh-rsa".to_string()),
            need_host_key_confirm: true,
            host_key_mismatch: false,
        };
        let json = serde_json::to_value(&result).unwrap();

        // None fields serialize as null (not omitted) for Zod nullable() compatibility
        assert_eq!(json["sessionId"], serde_json::Value::Null);
        assert_eq!(json["homePath"], serde_json::Value::Null);
        // Present fields remain
        assert_eq!(json["serverFingerprint"], "SHA256:xyz");
        assert_eq!(json["needHostKeyConfirm"], true);
        assert_eq!(json["hostKeyMismatch"], false);
    }

    #[test]
    fn session_connect_result_host_key_confirm_first_connection() {
        // Simulates the TOFU flow: no session yet, need user confirmation
        let result = SessionConnectResult {
            session_id: None,
            home_path: None,
            server_fingerprint: Some("SHA256:fingerprint".to_string()),
            server_key_type: Some("ssh-ed25519".to_string()),
            need_host_key_confirm: true,
            host_key_mismatch: false,
        };
        let json = serde_json::to_value(&result).unwrap();

        assert_eq!(json["needHostKeyConfirm"], true);
        assert_eq!(json["hostKeyMismatch"], false);
        assert_eq!(json["sessionId"], serde_json::Value::Null);
        assert_eq!(json["serverFingerprint"], "SHA256:fingerprint");
    }

    #[test]
    fn session_connect_result_host_key_mismatch_scenario() {
        // Simulates server key change: need user confirmation with mismatch warning
        let result = SessionConnectResult {
            session_id: None,
            home_path: None,
            server_fingerprint: Some("SHA256:new_fingerprint".to_string()),
            server_key_type: Some("ssh-ed25519".to_string()),
            need_host_key_confirm: true,
            host_key_mismatch: true,
        };
        let json = serde_json::to_value(&result).unwrap();

        assert_eq!(json["needHostKeyConfirm"], true);
        assert_eq!(json["hostKeyMismatch"], true);
        assert_eq!(json["serverFingerprint"], "SHA256:new_fingerprint");
    }

    // ── SessionStatusPayload serialization ──

    #[test]
    fn session_status_payload_serializes_camel_case() {
        let payload = SessionStatusPayload {
            session_id: "sess-1".to_string(),
            status: "connected".to_string(),
            message: None,
        };
        let json = serde_json::to_value(&payload).unwrap();

        assert_eq!(json["sessionId"], "sess-1");
        assert_eq!(json["status"], "connected");
        assert!(json.get("session_id").is_none());
        assert!(json.get("message").is_none()); // skip_serializing_if
    }

    #[test]
    fn session_status_payload_includes_message_when_present() {
        let payload = SessionStatusPayload {
            session_id: "sess-2".to_string(),
            status: "error".to_string(),
            message: Some("connection refused".to_string()),
        };
        let json = serde_json::to_value(&payload).unwrap();

        assert_eq!(json["message"], "connection refused");
    }

    // ── SessionInfo serialization ──

    #[test]
    fn session_info_serializes_camel_case() {
        let info = SessionInfo {
            session_id: "sess-1".to_string(),
            profile_id: "prof-1".to_string(),
            home_path: "/home/user".to_string(),
            fingerprint: "SHA256:abc".to_string(),
        };
        let json = serde_json::to_value(&info).unwrap();

        assert_eq!(json["sessionId"], "sess-1");
        assert_eq!(json["profileId"], "prof-1");
        assert_eq!(json["homePath"], "/home/user");
        assert_eq!(json["fingerprint"], "SHA256:abc");
        assert!(json.get("session_id").is_none());
        assert!(json.get("profile_id").is_none());
    }

    // ── build_connected_result helper ──

    #[test]
    fn build_connected_result_maps_fields_correctly() {
        let connect_result = ConnectResult {
            session_id: "sess-99".to_string(),
            home_path: "/root".to_string(),
            fingerprint: "SHA256:test".to_string(),
        };
        let result = build_connected_result(connect_result);

        assert_eq!(result.session_id.as_deref(), Some("sess-99"));
        assert_eq!(result.home_path.as_deref(), Some("/root"));
        assert_eq!(result.server_fingerprint.as_deref(), Some("SHA256:test"));
        assert!(result.server_key_type.is_none());
        assert!(!result.need_host_key_confirm);
        assert!(!result.host_key_mismatch);
    }
}
