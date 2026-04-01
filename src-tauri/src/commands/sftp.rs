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
#[cfg(test)]
use ts_rs::TS;

use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::file_entry::{FileEntry, SortSpec};
use crate::services::session_manager::SessionManager;
use crate::services::sftp_service::SftpService;

/// Run a blocking closure on the Tokio blocking thread-pool,
/// converting `JoinError` into `AppError` automatically.
async fn spawn_sftp<F, T>(f: F) -> AppResult<T>
where
    F: FnOnce() -> AppResult<T> + Send + 'static,
    T: Send + 'static,
{
    spawn_blocking(f)
        .await
        .map_err(|e| AppError::new(ErrorCode::Unknown, format!("spawn_blocking failed: {}", e)))?
}

/// 目录统计信息（用于删除确认对话框）
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
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

/// 批量删除单项
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDeleteItem {
    pub path: String,
    pub is_dir: bool,
}

/// 批量删除输入参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDeleteInput {
    pub session_id: String,
    pub items: Vec<BatchDeleteItem>,
}

/// 批量删除结果
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct BatchDeleteResult {
    pub deleted_count: usize,
    pub failures: Vec<DeleteFailure>,
}

/// 递归删除进度事件
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
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
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct DeleteFailure {
    pub path: String,
    pub error: String,
}

/// 递归删除结果
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct RecursiveDeleteResult {
    /// 成功删除的文件数
    pub deleted_files: u64,
    /// 成功删除的目录数
    pub deleted_dirs: u64,
    /// 删除失败的项
    pub failures: Vec<DeleteFailure>,
}

/// 文件预览输入参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileInput {
    /// 会话 ID
    pub session_id: String,
    /// 远程文件路径
    pub path: String,
    /// 最大读取字节数（默认 256KB）
    pub max_bytes: Option<u64>,
}

/// 文件预览结果
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ReadPreviewResult {
    /// 内容类型: "text" 或 "binary"
    pub content_type: String,
    /// 文本内容（text 类型为 UTF-8 字符串，binary 类型为 None）
    pub content: Option<String>,
    /// 实际文件大小（字节）
    pub size: u64,
    /// 内容是否被截断
    pub truncated: bool,
    /// 根据扩展名猜测的 MIME 类型
    pub mime_guess: Option<String>,
}

/// 读取远程文件预览
///
/// 安全规则:
/// - 使用 lstat 检查文件类型（拒绝符号链接和目录）
/// - 强制 max_bytes 限制（默认 256KB）
/// - 路径安全验证
#[tauri::command]
pub async fn sftp_read_file(
    session_manager: State<'_, Arc<SessionManager>>,
    input: ReadFileInput,
) -> Result<ReadPreviewResult, AppError> {
    if input.session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("会话 ID 不能为空"));
    }

    if input.path.trim().is_empty() {
        return Err(AppError::invalid_argument("路径不能为空"));
    }

    tracing::debug!(
        session_id = %input.session_id,
        path = %input.path,
        max_bytes = ?input.max_bytes,
        "读取文件预览"
    );

    let session = session_manager.get_session(&input.session_id)?;
    let path = input.path.clone();
    let max_bytes = input.max_bytes;

    let result =
        spawn_sftp(move || SftpService::read_file_preview(&session.sftp, &path, max_bytes)).await?;

    tracing::debug!(
        session_id = %input.session_id,
        path = %input.path,
        content_type = %result.content_type,
        size = result.size,
        truncated = result.truncated,
        "文件预览完成"
    );

    Ok(result)
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

    let entries = spawn_sftp(move || SftpService::list_dir(&session.sftp, &path, sort)).await?;

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

    let entry = spawn_sftp(move || SftpService::stat(&session.sftp, &path)).await?;

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

    spawn_sftp(move || SftpService::mkdir(&session.sftp, &path_clone)).await?;

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

    spawn_sftp(move || SftpService::rename(&session.sftp, &from_clone, &to_clone)).await?;

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

    spawn_sftp(move || SftpService::delete(&session.sftp, &path_clone, is_dir)).await?;

    tracing::info!(
        session_id = %session_id,
        path = %path,
        "删除成功"
    );

    Ok(())
}

/// 批量删除文件和目录
///
/// 支持混合文件/目录删除，自动进行父子路径去重（父目录在列表中时跳过子路径），
/// 目录使用递归删除，返回聚合结果
#[tauri::command]
pub async fn sftp_batch_delete(
    app: AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    input: BatchDeleteInput,
) -> Result<BatchDeleteResult, AppError> {
    if input.session_id.trim().is_empty() {
        return Err(AppError::invalid_argument("会话 ID 不能为空"));
    }
    if input.items.is_empty() {
        return Err(AppError::invalid_argument("删除列表不能为空"));
    }

    tracing::debug!(
        session_id = %input.session_id,
        count = input.items.len(),
        "批量删除"
    );

    let session = session_manager.get_session(&input.session_id)?;
    let session_id = input.session_id.clone();

    let result = spawn_sftp(move || {
        // Canonicalize: sort paths, skip children when parent dir is in the list
        let mut dir_paths: Vec<String> = input
            .items
            .iter()
            .filter(|i| i.is_dir)
            .map(|i| {
                let p = i.path.clone();
                if p.ends_with('/') {
                    p
                } else {
                    format!("{}/", p)
                }
            })
            .collect();
        dir_paths.sort();

        let is_child_of_selected_dir = |path: &str| -> bool {
            for dp in &dir_paths {
                if path.starts_with(dp.as_str()) && path != dp.trim_end_matches('/') {
                    return true;
                }
            }
            false
        };

        let mut deleted_count = 0usize;
        let mut failures = Vec::new();

        for item in &input.items {
            // Skip children of already-selected parent directories
            if is_child_of_selected_dir(&item.path) {
                continue;
            }

            if item.is_dir {
                // Use recursive delete for directories
                let app_clone = app.clone();
                let progress_callback: Box<dyn Fn(DeleteProgress) + Send> =
                    Box::new(move |progress| {
                        let _ = app_clone.emit("delete:progress", &progress);
                    });

                match SftpService::delete_recursive(
                    &session.sftp,
                    &item.path,
                    Some(progress_callback),
                ) {
                    Ok(r) => {
                        deleted_count += (r.deleted_files + r.deleted_dirs) as usize;
                        failures.extend(r.failures);
                    }
                    Err(e) => {
                        failures.push(DeleteFailure {
                            path: item.path.clone(),
                            error: e.message.clone(),
                        });
                    }
                }
            } else {
                match SftpService::delete(&session.sftp, &item.path, false) {
                    Ok(()) => {
                        deleted_count += 1;
                    }
                    Err(e) => {
                        failures.push(DeleteFailure {
                            path: item.path.clone(),
                            error: e.message.clone(),
                        });
                    }
                }
            }
        }

        Ok(BatchDeleteResult {
            deleted_count,
            failures,
        })
    })
    .await?;

    tracing::info!(
        session_id = %session_id,
        deleted = result.deleted_count,
        failures = result.failures.len(),
        "批量删除完成"
    );

    Ok(result)
}

/// chmod 结果
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ChmodResult {
    /// 成功修改的文件数量
    pub success_count: usize,
    /// 失败的文件及错误信息
    pub failures: Vec<ChmodFailure>,
}

/// chmod 失败项
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
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

    let result = spawn_sftp(move || {
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

        Ok(ChmodResult {
            success_count,
            failures,
        })
    })
    .await?;

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
        spawn_sftp(move || SftpService::get_directory_stats(&session.sftp, &path_clone)).await?;

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

#[cfg(test)]
mod tests {
    use super::*;

    // ── spawn_sftp helper ──

    #[tokio::test]
    async fn spawn_sftp_returns_ok_on_success() {
        let result = spawn_sftp(|| Ok(42)).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn spawn_sftp_propagates_app_error() {
        let result: AppResult<i32> =
            spawn_sftp(|| Err(AppError::new(ErrorCode::NotFound, "not found"))).await;
        let err = result.unwrap_err();
        assert_eq!(err.code, ErrorCode::NotFound);
        assert_eq!(err.message, "not found");
    }

    #[tokio::test]
    async fn spawn_sftp_returns_string_value() {
        let result = spawn_sftp(|| Ok("hello".to_string())).await;
        assert_eq!(result.unwrap(), "hello");
    }

    // ── DirectoryStats serialization ──

    #[test]
    fn directory_stats_serializes_camel_case() {
        let stats = DirectoryStats {
            file_count: 10,
            dir_count: 3,
            total_size: 1024 * 1024,
        };
        let json = serde_json::to_value(&stats).unwrap();

        assert_eq!(json["fileCount"], 10);
        assert_eq!(json["dirCount"], 3);
        assert_eq!(json["totalSize"], 1024 * 1024);
        assert!(json.get("file_count").is_none());
        assert!(json.get("dir_count").is_none());
        assert!(json.get("total_size").is_none());
    }

    #[test]
    fn directory_stats_zero_values() {
        let stats = DirectoryStats {
            file_count: 0,
            dir_count: 0,
            total_size: 0,
        };
        let json = serde_json::to_value(&stats).unwrap();

        assert_eq!(json["fileCount"], 0);
        assert_eq!(json["dirCount"], 0);
        assert_eq!(json["totalSize"], 0);
    }

    // ── RecursiveDeleteInput deserialization ──

    #[test]
    fn recursive_delete_input_deserializes_camel_case() {
        let json = r#"{"sessionId": "sess-1", "path": "/tmp/dir"}"#;
        let input: RecursiveDeleteInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.session_id, "sess-1");
        assert_eq!(input.path, "/tmp/dir");
    }

    #[test]
    fn recursive_delete_input_rejects_snake_case() {
        let json = r#"{"session_id": "sess-1", "path": "/tmp/dir"}"#;
        let result = serde_json::from_str::<RecursiveDeleteInput>(json);
        assert!(result.is_err());
    }

    // ── DeleteProgress serialization ──

    #[test]
    fn delete_progress_serializes_camel_case() {
        let progress = DeleteProgress {
            path: "/tmp/dir".to_string(),
            deleted_count: 5,
            total_count: 20,
            current_path: "/tmp/dir/sub/file.txt".to_string(),
        };
        let json = serde_json::to_value(&progress).unwrap();

        assert_eq!(json["path"], "/tmp/dir");
        assert_eq!(json["deletedCount"], 5);
        assert_eq!(json["totalCount"], 20);
        assert_eq!(json["currentPath"], "/tmp/dir/sub/file.txt");
        assert!(json.get("deleted_count").is_none());
        assert!(json.get("total_count").is_none());
        assert!(json.get("current_path").is_none());
    }

    // ── DeleteFailure serialization ──

    #[test]
    fn delete_failure_serializes_camel_case() {
        let failure = DeleteFailure {
            path: "/tmp/locked".to_string(),
            error: "permission denied".to_string(),
        };
        let json = serde_json::to_value(&failure).unwrap();

        assert_eq!(json["path"], "/tmp/locked");
        assert_eq!(json["error"], "permission denied");
    }

    // ── RecursiveDeleteResult serialization ──

    #[test]
    fn recursive_delete_result_serializes_camel_case() {
        let result = RecursiveDeleteResult {
            deleted_files: 10,
            deleted_dirs: 3,
            failures: vec![DeleteFailure {
                path: "/tmp/locked".to_string(),
                error: "busy".to_string(),
            }],
        };
        let json = serde_json::to_value(&result).unwrap();

        assert_eq!(json["deletedFiles"], 10);
        assert_eq!(json["deletedDirs"], 3);
        assert!(json.get("deleted_files").is_none());
        assert!(json.get("deleted_dirs").is_none());

        let failures = json["failures"].as_array().unwrap();
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0]["path"], "/tmp/locked");
    }

    #[test]
    fn recursive_delete_result_empty_failures() {
        let result = RecursiveDeleteResult {
            deleted_files: 5,
            deleted_dirs: 1,
            failures: vec![],
        };
        let json = serde_json::to_value(&result).unwrap();

        let failures = json["failures"].as_array().unwrap();
        assert!(failures.is_empty());
    }

    // ── ChmodResult serialization ──

    #[test]
    fn chmod_result_serializes_camel_case() {
        let result = ChmodResult {
            success_count: 3,
            failures: vec![ChmodFailure {
                path: "/etc/hosts".to_string(),
                error: "operation not permitted".to_string(),
            }],
        };
        let json = serde_json::to_value(&result).unwrap();

        assert_eq!(json["successCount"], 3);
        assert!(json.get("success_count").is_none());

        let failures = json["failures"].as_array().unwrap();
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0]["path"], "/etc/hosts");
        assert_eq!(failures[0]["error"], "operation not permitted");
    }

    #[test]
    fn chmod_result_all_success() {
        let result = ChmodResult {
            success_count: 5,
            failures: vec![],
        };
        let json = serde_json::to_value(&result).unwrap();

        assert_eq!(json["successCount"], 5);
        assert!(json["failures"].as_array().unwrap().is_empty());
    }

    // ── ChmodInput deserialization ──

    #[test]
    fn chmod_input_deserializes_camel_case() {
        let json = r#"{
            "sessionId": "sess-1",
            "paths": ["/home/user/file.txt", "/home/user/dir"],
            "mode": 493
        }"#;
        let input: ChmodInput = serde_json::from_str(json).unwrap();

        assert_eq!(input.session_id, "sess-1");
        assert_eq!(input.paths.len(), 2);
        assert_eq!(input.paths[0], "/home/user/file.txt");
        assert_eq!(input.mode, 493); // 0o755
    }

    #[test]
    fn chmod_input_rejects_snake_case() {
        let json = r#"{"session_id": "sess-1", "paths": ["/a"], "mode": 493}"#;
        let result = serde_json::from_str::<ChmodInput>(json);
        assert!(result.is_err());
    }

    // ── ChmodFailure serialization ──

    #[test]
    fn chmod_failure_serializes_camel_case() {
        let failure = ChmodFailure {
            path: "/root/secret".to_string(),
            error: "denied".to_string(),
        };
        let json = serde_json::to_value(&failure).unwrap();

        assert_eq!(json["path"], "/root/secret");
        assert_eq!(json["error"], "denied");
    }
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

    let result = spawn_sftp(move || {
        // 创建进度回调，通过 Tauri 事件发送进度
        let app_clone = app.clone();
        let progress_callback: Box<dyn Fn(DeleteProgress) + Send> = Box::new(move |progress| {
            if let Err(e) = app_clone.emit("delete:progress", &progress) {
                tracing::warn!(error = %e, "发送删除进度事件失败");
            }
        });

        SftpService::delete_recursive(&session.sftp, &path, Some(progress_callback))
    })
    .await?;

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
