//! SFTP 相关命令
//!
//! - sftp_list_dir: 列出目录内容
//! - sftp_stat: 获取文件信息
//! - sftp_mkdir: 创建目录
//! - sftp_rename: 重命名/移动
//! - sftp_delete: 删除

use std::sync::Arc;

use tauri::State;

use crate::models::error::AppError;
use crate::models::file_entry::{FileEntry, SortSpec};
use crate::services::session_manager::SessionManager;
use crate::services::sftp_service::SftpService;

/// 列出远程目录内容
///
/// 返回目录下所有文件和子目录，支持排序
#[tauri::command]
pub async fn sftp_list_dir(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
    sort: Option<SortSpec>,
) -> Result<Vec<FileEntry>, AppError> {
    if session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("会话 ID 不能为空"));
    }

    tracing::debug!(
        session_id = %session_id,
        path = %path,
        "列出目录内容"
    );

    let session = session_manager.get_session(&session_id)?;
    let entries = SftpService::list_dir(&session.sftp, &path, sort)?;

    tracing::debug!(
        session_id = %session_id,
        path = %path,
        count = entries.len(),
        "目录列表完成"
    );

    Ok(entries)
}

/// 获取文件/目录信息
#[tauri::command]
pub async fn sftp_stat(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
) -> Result<FileEntry, AppError> {
    if session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("会话 ID 不能为空"));
    }

    tracing::debug!(
        session_id = %session_id,
        path = %path,
        "获取文件信息"
    );

    let session = session_manager.get_session(&session_id)?;
    let entry = SftpService::stat(&session.sftp, &path)?;

    Ok(entry)
}

/// 创建远程目录
#[tauri::command]
pub async fn sftp_mkdir(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
) -> Result<(), AppError> {
    if session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("会话 ID 不能为空"));
    }

    tracing::debug!(
        session_id = %session_id,
        path = %path,
        "创建目录"
    );

    let session = session_manager.get_session(&session_id)?;
    SftpService::mkdir(&session.sftp, &path)?;

    tracing::info!(
        session_id = %session_id,
        path = %path,
        "目录创建成功"
    );

    Ok(())
}

/// 重命名/移动文件或目录
#[tauri::command]
pub async fn sftp_rename(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    from_path: String,
    to_path: String,
) -> Result<(), AppError> {
    if session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("会话 ID 不能为空"));
    }

    tracing::debug!(
        session_id = %session_id,
        from = %from_path,
        to = %to_path,
        "重命名"
    );

    let session = session_manager.get_session(&session_id)?;
    SftpService::rename(&session.sftp, &from_path, &to_path)?;

    tracing::info!(
        session_id = %session_id,
        from = %from_path,
        to = %to_path,
        "重命名成功"
    );

    Ok(())
}

/// 删除文件或空目录
#[tauri::command]
pub async fn sftp_delete(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), AppError> {
    if session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("会话 ID 不能为空"));
    }

    tracing::debug!(
        session_id = %session_id,
        path = %path,
        is_dir = %is_dir,
        "删除"
    );

    let session = session_manager.get_session(&session_id)?;
    SftpService::delete(&session.sftp, &path, is_dir)?;

    tracing::info!(
        session_id = %session_id,
        path = %path,
        "删除成功"
    );

    Ok(())
}
