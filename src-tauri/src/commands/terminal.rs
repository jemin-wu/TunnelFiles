//! 终端 IPC 命令

use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::models::error::{AppError, AppResult};
use crate::models::terminal::TerminalInfo;
use crate::services::session_manager::SessionManager;
use crate::services::storage_service::Database;
use crate::services::terminal_manager::TerminalManager;

#[derive(Debug, Deserialize)]
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
    terminal_manager.open(
        app,
        db.inner().clone(),
        session_manager.inner().clone(),
        &input.session_id,
        input.cols,
        input.rows,
    )
}

#[derive(Debug, Deserialize)]
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

    terminal_manager.write_input(&input.terminal_id, &data)
}

#[derive(Debug, Deserialize)]
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
    terminal_manager.resize(&input.terminal_id, input.cols, input.rows)
}

#[tauri::command]
pub async fn terminal_close(
    terminal_manager: State<'_, Arc<TerminalManager>>,
    terminal_id: String,
) -> AppResult<()> {
    terminal_manager.close(&terminal_id)
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
    .map_err(|e| AppError::remote_io_error(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn terminal_get_by_session(
    terminal_manager: State<'_, Arc<TerminalManager>>,
    session_id: String,
) -> AppResult<Option<String>> {
    Ok(terminal_manager.get_terminal_by_session(&session_id))
}
