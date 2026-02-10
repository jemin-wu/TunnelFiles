//! SFTP 相关命令
//!
//! - sftp_list_dir: 列出目录内容
//! - sftp_stat: 获取文件信息
//! - sftp_mkdir: 创建目录
//! - sftp_rename: 重命名/移动
//! - sftp_delete: 删除
//! - sftp_chmod: 修改权限
//! - sftp_get_dir_stats: 获取目录统计信息
//! - sftp_delete_recursive: 递归删除目录
//!
//! 所有 SFTP 操作都使用 spawn_blocking 避免阻塞 Tokio 运行时

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::task::spawn_blocking;

use crate::models::error::AppError;
use crate::models::file_entry::{FileEntry, SortSpec};
use crate::services::session_manager::SessionManager;
use crate::services::sftp_service::SftpService;

/// 目录统计信息（用于删除确认对话框）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryStats {
    /// 文件总数
    pub file_count: u64,
    /// 目录总数（不含自身）
    pub dir_count: u64,
    /// 总大小（字节）
    pub total_size: u64,
}

/// 递归删除输入参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecursiveDeleteInput {
    /// 会话 ID
    pub session_id: String,
    /// 要删除的路径（文件或目录）
    pub path: String,
}

/// 递归删除进度事件
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteProgress {
    /// 删除任务 ID (使用 path 作为标识)
    pub path: String,
    /// 已删除的文件/目录数
    pub deleted_count: u64,
    /// 总文件/目录数
    pub total_count: u64,
    /// 当前正在删除的路径
    pub current_path: String,
}

/// 删除失败项
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFailure {
    pub path: String,
    pub error: String,
}

/// 递归删除结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecursiveDeleteResult {
    /// 成功删除的文件数
    pub deleted_files: u64,
    /// 成功删除的目录数
    pub deleted_dirs: u64,
    /// 删除失败的项
    pub failures: Vec<DeleteFailure>,
}

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

    let entries = spawn_blocking(move || SftpService::list_dir(&session.sftp, &path, sort))
        .await
        .map_err(|e| {
            AppError::new(
                crate::models::error::ErrorCode::Unknown,
                format!("spawn_blocking failed: {}", e),
            )
        })??;

    tracing::debug!(
        session_id = %session_id,
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

    let entry = spawn_blocking(move || SftpService::stat(&session.sftp, &path))
        .await
        .map_err(|e| {
            AppError::new(
                crate::models::error::ErrorCode::Unknown,
                format!("spawn_blocking failed: {}", e),
            )
        })??;

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
    let path_clone = path.clone();

    spawn_blocking(move || SftpService::mkdir(&session.sftp, &path_clone))
        .await
        .map_err(|e| {
            AppError::new(
                crate::models::error::ErrorCode::Unknown,
                format!("spawn_blocking failed: {}", e),
            )
        })??;

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
    let from_clone = from_path.clone();
    let to_clone = to_path.clone();

    spawn_blocking(move || SftpService::rename(&session.sftp, &from_clone, &to_clone))
        .await
        .map_err(|e| {
            AppError::new(
                crate::models::error::ErrorCode::Unknown,
                format!("spawn_blocking failed: {}", e),
            )
        })??;

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
    let path_clone = path.clone();

    spawn_blocking(move || SftpService::delete(&session.sftp, &path_clone, is_dir))
        .await
        .map_err(|e| {
            AppError::new(
                crate::models::error::ErrorCode::Unknown,
                format!("spawn_blocking failed: {}", e),
            )
        })??;

    tracing::info!(
        session_id = %session_id,
        path = %path,
        "删除成功"
    );

    Ok(())
}

/// chmod 结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChmodResult {
    /// 成功修改的文件数量
    pub success_count: usize,
    /// 失败的文件及错误信息
    pub failures: Vec<ChmodFailure>,
}

/// chmod 失败项
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChmodFailure {
    pub path: String,
    pub error: String,
}

/// chmod 输入参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChmodInput {
    /// 会话 ID
    pub session_id: String,
    /// 要修改的文件/目录路径列表
    pub paths: Vec<String>,
    /// 新的权限值 (Unix mode, e.g., 0o755)
    pub mode: u32,
}

/// 修改文件/目录权限
///
/// 支持批量修改，返回成功/失败统计
#[tauri::command]
pub async fn sftp_chmod(
    session_manager: State<'_, Arc<SessionManager>>,
    input: ChmodInput,
) -> Result<ChmodResult, AppError> {
    if input.session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("会话 ID 不能为空"));
    }

    if input.paths.is_empty() {
        return Err(AppError::invalid_argument("路径列表不能为空"));
    }

    tracing::debug!(
        session_id = %input.session_id,
        paths = ?input.paths,
        mode = format!("{:o}", input.mode),
        "修改权限"
    );

    let session = session_manager.get_session(&input.session_id)?;
    let session_id = input.session_id.clone();
    let paths = input.paths.clone();
    let mode = input.mode;

    let result = spawn_blocking(move || {
        let mut success_count = 0;
        let mut failures = Vec::new();

        for path in &paths {
            match SftpService::chmod(&session.sftp, path, mode) {
                Ok(()) => {
                    success_count += 1;
                    tracing::debug!(path = %path, mode = format!("{:o}", mode), "权限修改成功");
                }
                Err(e) => {
                    tracing::warn!(path = %path, error = %e, "权限修改失败");
                    failures.push(ChmodFailure {
                        path: path.clone(),
                        error: e.message.clone(),
                    });
                }
            }
        }

        ChmodResult {
            success_count,
            failures,
        }
    })
    .await
    .map_err(|e| {
        AppError::new(
            crate::models::error::ErrorCode::Unknown,
            format!("spawn_blocking failed: {}", e),
        )
    })?;

    tracing::info!(
        session_id = %session_id,
        success_count = result.success_count,
        failure_count = result.failures.len(),
        "chmod 操作完成"
    );

    Ok(result)
}

/// 获取目录统计信息
///
/// 用于删除确认对话框显示文件数量和总大小
#[tauri::command]
pub async fn sftp_get_dir_stats(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
) -> Result<DirectoryStats, AppError> {
    if session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("会话 ID 不能为空"));
    }

    tracing::debug!(
        session_id = %session_id,
        path = %path,
        "获取目录统计信息"
    );

    let session = session_manager.get_session(&session_id)?;
    let path_clone = path.clone();

    let stats =
        spawn_blocking(move || SftpService::get_directory_stats(&session.sftp, &path_clone))
            .await
            .map_err(|e| {
                AppError::new(
                    crate::models::error::ErrorCode::Unknown,
                    format!("spawn_blocking failed: {}", e),
                )
            })??;

    tracing::debug!(
        session_id = %session_id,
        path = %path,
        file_count = stats.file_count,
        dir_count = stats.dir_count,
        total_size = stats.total_size,
        "目录统计完成"
    );

    Ok(stats)
}

/// 递归删除目录
///
/// 删除目录及其所有内容，通过事件发送删除进度
#[tauri::command]
pub async fn sftp_delete_recursive(
    app: AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    input: RecursiveDeleteInput,
) -> Result<RecursiveDeleteResult, AppError> {
    if input.session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("会话 ID 不能为空"));
    }

    if input.path.trim().is_empty() {
        return Err(AppError::invalid_argument("路径不能为空"));
    }

    tracing::debug!(
        session_id = %input.session_id,
        path = %input.path,
        "递归删除"
    );

    let session = session_manager.get_session(&input.session_id)?;
    let session_id = input.session_id.clone();
    let path = input.path.clone();

    let result = spawn_blocking(move || {
        // 创建进度回调，通过 Tauri 事件发送进度
        let app_clone = app.clone();
        let progress_callback: Box<dyn Fn(DeleteProgress) + Send> = Box::new(move |progress| {
            if let Err(e) = app_clone.emit("delete:progress", &progress) {
                tracing::warn!(error = %e, "发送删除进度事件失败");
            }
        });

        SftpService::delete_recursive(&session.sftp, &path, Some(progress_callback))
    })
    .await
    .map_err(|e| {
        AppError::new(
            crate::models::error::ErrorCode::Unknown,
            format!("spawn_blocking failed: {}", e),
        )
    })??;

    tracing::info!(
        session_id = %session_id,
        path = %input.path,
        deleted_files = result.deleted_files,
        deleted_dirs = result.deleted_dirs,
        failures = result.failures.len(),
        "递归删除完成"
    );

    Ok(result)
}
