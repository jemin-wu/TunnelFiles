//! 终端 IPC 命令

use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
#[cfg(test)]
use ts_rs::TS;

use crate::models::error::{AppError, AppResult};
use crate::models::terminal::TerminalInfo;
use crate::services::session_manager::SessionManager;
use crate::services::storage_service::Database;
use crate::services::terminal_manager::TerminalManager;

fn join_err(e: tokio::task::JoinError) -> AppError {
    AppError::remote_io_error(format!("Task join error: {}", e))
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct TerminalOpenInput {
    pub session_id: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[tauri::command]
pub async fn terminal_open(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    session_manager: State<'_, Arc<SessionManager>>,
    terminal_manager: State<'_, Arc<TerminalManager>>,
    input: TerminalOpenInput,
) -> AppResult<TerminalInfo> {
    let db = db.inner().clone();
    let sm = session_manager.inner().clone();
    let tm = terminal_manager.inner().clone();
    let session_id = input.session_id;
    tokio::task::spawn_blocking(move || tm.open(app, db, sm, &session_id, input.cols, input.rows))
        .await
        .map_err(join_err)?
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct TerminalInputData {
    pub terminal_id: String,
    pub data: String, // Base64 编码
}

#[tauri::command]
pub async fn terminal_input(
    terminal_manager: State<'_, Arc<TerminalManager>>,
    input: TerminalInputData,
) -> AppResult<()> {
    let data = BASE64
        .decode(&input.data)
        .map_err(|e| AppError::invalid_argument(format!("Base64 解码失败: {}", e)))?;

    let tm = terminal_manager.inner().clone();
    let terminal_id = input.terminal_id;
    tokio::task::spawn_blocking(move || tm.write_input(&terminal_id, &data))
        .await
        .map_err(join_err)?
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct TerminalResizeInput {
    pub terminal_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn terminal_resize(
    terminal_manager: State<'_, Arc<TerminalManager>>,
    input: TerminalResizeInput,
) -> AppResult<()> {
    let tm = terminal_manager.inner().clone();
    tokio::task::spawn_blocking(move || tm.resize(&input.terminal_id, input.cols, input.rows))
        .await
        .map_err(join_err)?
}

#[tauri::command]
pub async fn terminal_close(
    terminal_manager: State<'_, Arc<TerminalManager>>,
    terminal_id: String,
) -> AppResult<()> {
    let tm = terminal_manager.inner().clone();
    tokio::task::spawn_blocking(move || tm.close(&terminal_id))
        .await
        .map_err(join_err)?
}

#[tauri::command]
pub async fn terminal_reconnect(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    session_manager: State<'_, Arc<SessionManager>>,
    terminal_manager: State<'_, Arc<TerminalManager>>,
    terminal_id: String,
) -> AppResult<()> {
    let db = db.inner().clone();
    let session_manager = session_manager.inner().clone();
    let terminal_manager = terminal_manager.inner().clone();

    tokio::task::spawn_blocking(move || {
        terminal_manager.reconnect(app, db, session_manager, &terminal_id)
    })
    .await
    .map_err(join_err)?
}

#[tauri::command]
pub async fn terminal_get_by_session(
    terminal_manager: State<'_, Arc<TerminalManager>>,
    session_id: String,
) -> AppResult<Option<String>> {
    Ok(terminal_manager.get_terminal_by_session(&session_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── join_err helper ──

    #[test]
    fn join_err_produces_remote_io_error() {
        // Create a JoinError by cancelling a spawned task
        let rt = tokio::runtime::Runtime::new().unwrap();
        let err = rt.block_on(async {
            let handle = tokio::spawn(async {
                // This will be cancelled before completing
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                42
            });
            handle.abort();
            handle.await.unwrap_err()
        });

        let app_err = join_err(err);
        assert!(
            app_err.message.contains("Task join error"),
            "Error message should contain 'Task join error', got: {}",
            app_err.message
        );
    }

    // ── TerminalOpenInput deserialization ──

    #[test]
    fn terminal_open_input_deserializes_camel_case() {
        let json = r#"{
            "sessionId": "sess-1",
            "cols": 120,
            "rows": 40
        }"#;
        let input: TerminalOpenInput = serde_json::from_str(json).unwrap();

        assert_eq!(input.session_id, "sess-1");
        assert_eq!(input.cols, Some(120));
        assert_eq!(input.rows, Some(40));
    }

    #[test]
    fn terminal_open_input_optional_cols_rows() {
        let json = r#"{"sessionId": "sess-1"}"#;
        let input: TerminalOpenInput = serde_json::from_str(json).unwrap();

        assert_eq!(input.session_id, "sess-1");
        assert!(input.cols.is_none());
        assert!(input.rows.is_none());
    }

    #[test]
    fn terminal_open_input_rejects_snake_case() {
        let json = r#"{"session_id": "sess-1"}"#;
        let result = serde_json::from_str::<TerminalOpenInput>(json);
        assert!(result.is_err());
    }

    // ── TerminalInputData deserialization ──

    #[test]
    fn terminal_input_data_deserializes_camel_case() {
        let json = r#"{
            "terminalId": "term-1",
            "data": "aGVsbG8="
        }"#;
        let input: TerminalInputData = serde_json::from_str(json).unwrap();

        assert_eq!(input.terminal_id, "term-1");
        assert_eq!(input.data, "aGVsbG8=");
    }

    #[test]
    fn terminal_input_data_rejects_snake_case() {
        let json = r#"{"terminal_id": "term-1", "data": "aGVsbG8="}"#;
        let result = serde_json::from_str::<TerminalInputData>(json);
        assert!(result.is_err());
    }

    #[test]
    fn terminal_input_data_base64_decode_round_trip() {
        let original = b"hello world";
        let encoded = BASE64.encode(original);

        let json = format!(r#"{{"terminalId": "t1", "data": "{}"}}"#, encoded);
        let input: TerminalInputData = serde_json::from_str(&json).unwrap();

        let decoded = BASE64.decode(&input.data).unwrap();
        assert_eq!(decoded, original);
    }

    // ── TerminalResizeInput deserialization ──

    #[test]
    fn terminal_resize_input_deserializes_camel_case() {
        let json = r#"{
            "terminalId": "term-1",
            "cols": 200,
            "rows": 50
        }"#;
        let input: TerminalResizeInput = serde_json::from_str(json).unwrap();

        assert_eq!(input.terminal_id, "term-1");
        assert_eq!(input.cols, 200);
        assert_eq!(input.rows, 50);
    }

    #[test]
    fn terminal_resize_input_rejects_snake_case() {
        let json = r#"{"terminal_id": "term-1", "cols": 80, "rows": 24}"#;
        let result = serde_json::from_str::<TerminalResizeInput>(json);
        assert!(result.is_err());
    }

    #[test]
    fn terminal_resize_input_boundary_values() {
        // u16::MAX for cols and rows
        let json = r#"{"terminalId": "t1", "cols": 65535, "rows": 65535}"#;
        let input: TerminalResizeInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.cols, u16::MAX);
        assert_eq!(input.rows, u16::MAX);
    }
}
