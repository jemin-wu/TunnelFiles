//! 传输管理器
//!
//! 负责:
//! - 上传/下载队列管理
//! - 并发控制
//! - 进度跟踪和事件推送
//! - 取消和重试

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use ssh2::Sftp;
use tauri::{AppHandle, Emitter};
use tokio::sync::{RwLock, Semaphore};
use tokio_util::sync::CancellationToken;

use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::transfer_task::{
    TransferDirection, TransferProgressPayload, TransferStatus, TransferStatusPayload, TransferTask,
};
use crate::services::session_manager::{ManagedSession, SessionManager};

/// 传输块大小 (64KB)
const CHUNK_SIZE: usize = 64 * 1024;

/// 进度推送节流间隔 (200ms)
const PROGRESS_THROTTLE_MS: u128 = 200;

/// 默认重试次数
const DEFAULT_RETRY_COUNT: u8 = 2;

/// 进度追踪器
struct ProgressTracker<'a> {
    app: &'a AppHandle,
    task_id: &'a str,
    total: u64,
    start_time: Instant,
    last_emit: Instant,
    transferred: u64,
}

impl<'a> ProgressTracker<'a> {
    fn new(app: &'a AppHandle, task_id: &'a str, total: u64) -> Self {
        let now = Instant::now();
        Self {
            app,
            task_id,
            total,
            start_time: now,
            last_emit: now,
            transferred: 0,
        }
    }

    fn update(&mut self, bytes: u64) {
        self.transferred += bytes;
        if self.last_emit.elapsed().as_millis() >= PROGRESS_THROTTLE_MS {
            self.emit();
            self.last_emit = Instant::now();
        }
    }

    fn finish(&self) {
        let payload = TransferProgressPayload {
            task_id: self.task_id.to_string(),
            transferred: self.transferred,
            total: self.total,
            speed: calculate_speed(self.transferred, self.start_time.elapsed().as_secs_f64()),
            percent: 100,
        };
        self.app.emit("transfer:progress", &payload).ok();
    }

    fn emit(&self) {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        let payload = TransferProgressPayload {
            task_id: self.task_id.to_string(),
            transferred: self.transferred,
            total: self.total,
            speed: calculate_speed(self.transferred, elapsed),
            percent: calculate_percent(self.transferred, self.total),
        };
        self.app.emit("transfer:progress", &payload).ok();
    }
}

/// 计算传输速度 (bytes/s)
fn calculate_speed(transferred: u64, elapsed_secs: f64) -> u64 {
    if elapsed_secs > 0.0 {
        (transferred as f64 / elapsed_secs) as u64
    } else {
        0
    }
}

/// 计算传输进度百分比
fn calculate_percent(transferred: u64, total: u64) -> u8 {
    if total > 0 {
        ((transferred as f64 / total as f64) * 100.0) as u8
    } else {
        0
    }
}

/// 序列化错误码
fn serialize_error_code(code: &crate::models::error::ErrorCode) -> String {
    serde_json::to_string(code)
        .unwrap_or_default()
        .trim_matches('"')
        .to_string()
}

/// 内部任务状态（包含 CancellationToken）
struct InternalTask {
    task: TransferTask,
    cancel_token: CancellationToken,
    retry_count: u8,
}

/// 传输管理器
pub struct TransferManager {
    /// 任务队列
    tasks: RwLock<HashMap<String, InternalTask>>,
    /// 并发控制信号量
    semaphore: Arc<Semaphore>,
}

impl TransferManager {
    /// 创建新的传输管理器
    ///
    /// max_concurrent: 最大并发传输数 (1-6)
    pub fn new(max_concurrent: u8) -> Self {
        let max_concurrent = max_concurrent.clamp(1, 6);

        Self {
            tasks: RwLock::new(HashMap::new()),
            semaphore: Arc::new(Semaphore::new(max_concurrent as usize)),
        }
    }

    /// 创建上传任务
    pub async fn create_upload(
        &self,
        session_id: String,
        local_path: String,
        remote_dir: String,
    ) -> AppResult<String> {
        // 验证本地文件存在
        let path = Path::new(&local_path);
        if !path.exists() {
            return Err(AppError::not_found(format!(
                "本地文件不存在: {}",
                local_path
            )));
        }
        if !path.is_file() {
            return Err(AppError::new(
                ErrorCode::InvalidArgument,
                "暂不支持上传目录",
            ));
        }

        // 获取文件名
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| AppError::new(ErrorCode::InvalidArgument, "无效的文件名"))?
            .to_string();

        // 构建远程路径
        let remote_path = if remote_dir == "/" {
            format!("/{}", file_name)
        } else {
            format!("{}/{}", remote_dir.trim_end_matches('/'), file_name)
        };

        // 获取文件大小
        let metadata = std::fs::metadata(&local_path)?;
        let total = metadata.len();

        self.create_task(
            session_id,
            TransferDirection::Upload,
            local_path,
            remote_path,
            file_name,
            Some(total),
        )
        .await
    }

    /// 创建下载任务
    pub async fn create_download(
        &self,
        session_id: String,
        remote_path: String,
        local_dir: String,
    ) -> AppResult<String> {
        // 验证本地目录存在
        let dir = Path::new(&local_dir);
        if !dir.exists() {
            return Err(AppError::not_found(format!(
                "本地目录不存在: {}",
                local_dir
            )));
        }
        if !dir.is_dir() {
            return Err(AppError::new(
                ErrorCode::InvalidArgument,
                "目标路径不是目录",
            ));
        }

        // 获取文件名
        let file_name = Path::new(&remote_path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| AppError::new(ErrorCode::InvalidArgument, "无效的远程路径"))?
            .to_string();

        // 构建本地路径
        let local_path = dir.join(&file_name);

        self.create_task(
            session_id,
            TransferDirection::Download,
            local_path.to_string_lossy().to_string(),
            remote_path,
            file_name,
            None, // 下载时不知道大小，执行时获取
        )
        .await
    }

    /// 创建目录下载任务（递归下载所有文件）
    ///
    /// 返回所有创建的任务 ID
    pub async fn create_download_dir(
        &self,
        session_manager: Arc<SessionManager>,
        session_id: String,
        remote_path: String,
        local_base_dir: String,
    ) -> AppResult<Vec<String>> {
        use crate::services::sftp_service::SftpService;

        // 验证本地目录存在
        let base_dir = Path::new(&local_base_dir);
        if !base_dir.exists() {
            return Err(AppError::not_found(format!(
                "本地目录不存在: {}",
                local_base_dir
            )));
        }
        if !base_dir.is_dir() {
            return Err(AppError::new(
                ErrorCode::InvalidArgument,
                "目标路径不是目录",
            ));
        }

        // 获取远程目录名作为本地子目录
        let dir_name = Path::new(&remote_path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| AppError::new(ErrorCode::InvalidArgument, "无效的远程路径"))?
            .to_string();

        // 获取会话并递归列出文件
        let session = session_manager.get_session(&session_id)?;
        let files = tokio::task::spawn_blocking({
            let session = session.clone();
            let remote = remote_path.clone();
            move || SftpService::list_dir_recursive(&session.sftp, &remote)
        })
        .await
        .map_err(|e| AppError::new(ErrorCode::Unknown, format!("任务执行失败: {}", e)))??;

        if files.is_empty() {
            tracing::info!(remote_path = %remote_path, "目录为空，无文件可下载");
            return Ok(vec![]);
        }

        // 为每个文件创建下载任务
        let mut task_ids = Vec::new();

        for (remote_file_path, relative_path) in files {
            // 构建本地路径: base_dir/dir_name/relative_path
            let local_path = base_dir.join(&dir_name).join(&relative_path);

            // 确保父目录存在
            if let Some(parent) = local_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    AppError::new(ErrorCode::LocalIoError, format!("无法创建本地目录: {}", e))
                })?;
            }

            // 提取文件名
            let file_name = Path::new(&relative_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            // 创建任务
            let task_id = self
                .create_task(
                    session_id.clone(),
                    TransferDirection::Download,
                    local_path.to_string_lossy().to_string(),
                    remote_file_path,
                    file_name,
                    None, // 下载时在执行时获取大小
                )
                .await?;

            task_ids.push(task_id);
        }

        tracing::info!(
            remote_path = %remote_path,
            file_count = task_ids.len(),
            "目录下载任务已创建"
        );

        Ok(task_ids)
    }

    /// 创建目录上传任务（递归上传所有文件）
    ///
    /// 返回所有创建的任务 ID
    pub async fn create_upload_dir(
        &self,
        session_manager: Arc<SessionManager>,
        session_id: String,
        local_path: String,
        remote_base_dir: String,
    ) -> AppResult<Vec<String>> {
        use crate::services::sftp_service::SftpService;

        let local_base = Path::new(&local_path);
        if !local_base.exists() {
            return Err(AppError::not_found(format!(
                "本地路径不存在: {}",
                local_path
            )));
        }
        if !local_base.is_dir() {
            return Err(AppError::invalid_argument("指定的路径是文件而非目录"));
        }

        let dir_name = local_base
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| AppError::invalid_argument("无效的本地路径"))?
            .to_string();

        let files = Self::list_local_dir_recursive(&local_path)?;
        if files.is_empty() {
            tracing::info!(local_path = %local_path, "目录为空，无文件可上传");
            return Ok(vec![]);
        }

        let session = session_manager.get_session(&session_id)?;
        let remote_base = SftpService::normalize_path(&remote_base_dir);

        // 验证远程基础目录存在
        Self::verify_remote_dir(session.clone(), &remote_base).await?;

        // 收集文件信息和远程父目录
        let (file_infos, unique_parents) =
            Self::collect_upload_file_infos(&files, &remote_base, &dir_name)?;

        // 创建所有远程目录
        let parents: Vec<String> = unique_parents.into_iter().collect();
        tokio::task::spawn_blocking({
            let session = session.clone();
            move || {
                for parent in parents {
                    Self::ensure_remote_dir_exists(&session.sftp, &parent)?;
                }
                Ok::<(), AppError>(())
            }
        })
        .await
        .map_err(|e| AppError::new(ErrorCode::Unknown, format!("任务执行失败: {}", e)))??;

        // 创建上传任务
        let mut task_ids = Vec::with_capacity(file_infos.len());
        for (local_file_path, remote_file_path, file_name, total) in file_infos {
            let task_id = self
                .create_task(
                    session_id.clone(),
                    TransferDirection::Upload,
                    local_file_path,
                    remote_file_path,
                    file_name,
                    Some(total),
                )
                .await?;
            task_ids.push(task_id);
        }

        tracing::info!(
            local_path = %local_path,
            file_count = task_ids.len(),
            "目录上传任务已创建"
        );

        Ok(task_ids)
    }

    /// 验证远程目录存在
    async fn verify_remote_dir(session: Arc<ManagedSession>, path: &str) -> AppResult<()> {
        let path = path.to_string();
        tokio::task::spawn_blocking(move || {
            let path_obj = Path::new(&path);
            let stat = session.sftp.stat(path_obj).map_err(|e| {
                if e.code() == ssh2::ErrorCode::SFTP(2) {
                    AppError::not_found(format!("远程目录不存在: {}", path))
                } else {
                    AppError::from(e)
                }
            })?;
            if !stat.is_dir() {
                return Err(AppError::invalid_argument("远程路径不是目录"));
            }
            Ok(())
        })
        .await
        .map_err(|e| AppError::new(ErrorCode::Unknown, format!("任务执行失败: {}", e)))?
    }

    /// 收集上传文件信息
    ///
    /// 返回 (文件信息列表, 唯一父目录集合)
    #[allow(clippy::type_complexity)]
    fn collect_upload_file_infos(
        files: &[(String, String)],
        remote_base: &str,
        dir_name: &str,
    ) -> AppResult<(
        Vec<(String, String, String, u64)>,
        std::collections::HashSet<String>,
    )> {
        let mut file_infos = Vec::with_capacity(files.len());
        let mut unique_parents = std::collections::HashSet::new();

        for (local_file_path, relative_path) in files {
            let remote_file_path = if remote_base == "/" {
                format!("/{}/{}", dir_name, relative_path)
            } else {
                format!(
                    "{}/{}/{}",
                    remote_base.trim_end_matches('/'),
                    dir_name,
                    relative_path
                )
            };

            if let Some(parent) = Path::new(&remote_file_path).parent() {
                unique_parents.insert(parent.to_string_lossy().to_string());
            }

            let file_name = Path::new(relative_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let total = std::fs::metadata(local_file_path)
                .map_err(|e| {
                    AppError::new(ErrorCode::LocalIoError, format!("无法获取文件信息: {}", e))
                })?
                .len();

            file_infos.push((local_file_path.clone(), remote_file_path, file_name, total));
        }

        Ok((file_infos, unique_parents))
    }

    /// 递归列出本地目录下的所有文件
    ///
    /// 返回 (local_path, relative_path) 元组列表，仅包含文件（不含目录）
    /// 跳过符号链接以避免无限循环
    fn list_local_dir_recursive(base_path: &str) -> AppResult<Vec<(String, String)>> {
        let base = Path::new(base_path);

        let metadata = std::fs::metadata(base).map_err(|e| {
            AppError::new(ErrorCode::LocalIoError, format!("无法访问本地路径: {}", e))
        })?;

        if !metadata.is_dir() {
            return Err(AppError::invalid_argument("指定的路径是文件而非目录"));
        }

        let mut files = Vec::new();
        let mut stack = vec![base.to_path_buf()];

        while let Some(current_path) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&current_path) else {
                tracing::warn!(path = %current_path.display(), "无法读取目录，跳过");
                continue;
            };

            for entry in entries.flatten() {
                let entry_path = entry.path();
                let Ok(metadata) = entry_path.symlink_metadata() else {
                    tracing::warn!(path = %entry_path.display(), "无法获取文件信息，跳过");
                    continue;
                };

                if metadata.is_symlink() {
                    tracing::debug!(path = %entry_path.display(), "跳过符号链接");
                    continue;
                }

                if metadata.is_dir() {
                    stack.push(entry_path);
                } else if metadata.is_file() {
                    let Ok(relative) = entry_path.strip_prefix(base) else {
                        tracing::error!(path = %entry_path.display(), "路径前缀不匹配，跳过");
                        continue;
                    };
                    files.push((
                        entry_path.to_string_lossy().to_string(),
                        relative.to_string_lossy().to_string(),
                    ));
                }
            }
        }

        Ok(files)
    }

    /// 确保远程目录存在（递归创建，类似 mkdir -p）
    fn ensure_remote_dir_exists(sftp: &Sftp, path: &str) -> AppResult<()> {
        use crate::services::sftp_service::SftpService;

        let normalized = SftpService::normalize_path(path);
        if normalized == "/" {
            return Ok(());
        }

        let path_obj = Path::new(&normalized);

        // 检查目录是否已存在
        if let Ok(stat) = sftp.stat(path_obj) {
            return if stat.is_dir() {
                Ok(())
            } else {
                Err(AppError::invalid_argument(format!(
                    "路径已存在但不是目录: {}",
                    normalized
                )))
            };
        }

        // 递归确保父目录存在
        if let Some(parent) = path_obj.parent() {
            let parent_str = parent.to_string_lossy();
            if parent_str != "/" && !parent_str.is_empty() {
                Self::ensure_remote_dir_exists(sftp, &parent_str)?;
            }
        }

        // 创建当前目录，忽略已存在错误（可能在并发上传时已创建）
        sftp.mkdir(path_obj, 0o755).or_else(|e| {
            let is_already_exists =
                e.code() == ssh2::ErrorCode::SFTP(11) || e.code() == ssh2::ErrorCode::SFTP(4);
            if is_already_exists {
                tracing::debug!(path = %normalized, "目录已存在，跳过创建");
                Ok(())
            } else {
                Err(AppError::from(e))
            }
        })
    }

    /// 创建任务（内部方法）
    async fn create_task(
        &self,
        session_id: String,
        direction: TransferDirection,
        local_path: String,
        remote_path: String,
        file_name: String,
        total: Option<u64>,
    ) -> AppResult<String> {
        let task_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let task = TransferTask {
            task_id: task_id.clone(),
            session_id,
            direction,
            local_path,
            remote_path,
            file_name,
            status: TransferStatus::Waiting,
            transferred: 0,
            total,
            speed: None,
            percent: Some(0),
            error_message: None,
            error_code: None,
            retryable: None,
            created_at: now,
            completed_at: None,
        };

        let internal = InternalTask {
            task,
            cancel_token: CancellationToken::new(),
            retry_count: 0,
        };

        {
            let mut tasks = self.tasks.write().await;
            tasks.insert(task_id.clone(), internal);
        }

        tracing::info!(task_id = %task_id, "传输任务已创建");
        Ok(task_id)
    }

    /// 执行传输任务
    pub async fn execute_task(
        &self,
        app: AppHandle,
        session_manager: Arc<SessionManager>,
        task_id: String,
    ) -> AppResult<()> {
        // 获取任务信息
        let (task_clone, cancel_token, retry_count) = {
            let tasks = self.tasks.read().await;
            let internal = tasks
                .get(&task_id)
                .ok_or_else(|| AppError::not_found(format!("任务不存在: {}", task_id)))?;
            (
                internal.task.clone(),
                internal.cancel_token.clone(),
                internal.retry_count,
            )
        };

        // 检查任务状态
        if task_clone.status != TransferStatus::Waiting {
            return Err(AppError::new(
                ErrorCode::InvalidArgument,
                format!("任务状态无效: {:?}", task_clone.status),
            ));
        }

        // 获取会话
        let session = session_manager.get_session(&task_clone.session_id)?;

        // 获取信号量许可
        let semaphore = self.semaphore.clone();
        let _permit = semaphore
            .acquire()
            .await
            .map_err(|_| AppError::new(ErrorCode::Unknown, "无法获取传输许可"))?;

        // 更新状态为 Running
        self.update_status(&task_id, TransferStatus::Running).await;
        self.emit_status(&app, &task_id, TransferStatus::Running, None);

        // 执行传输（在阻塞线程中，传递整个 session）
        let result = tokio::task::spawn_blocking({
            let app = app.clone();
            let task = task_clone.clone();
            let cancel_token = cancel_token.clone();
            move || match task.direction {
                TransferDirection::Upload => {
                    Self::do_upload_sync(&app, &session.sftp, &task, &cancel_token)
                }
                TransferDirection::Download => {
                    Self::do_download_sync(&app, &session.sftp, &task, &cancel_token)
                }
            }
        })
        .await
        .map_err(|e| AppError::new(ErrorCode::Unknown, format!("任务执行失败: {}", e)))?;

        match result {
            Ok(()) => {
                self.update_status(&task_id, TransferStatus::Success).await;
                self.emit_status(&app, &task_id, TransferStatus::Success, None);
                tracing::info!(task_id = %task_id, "传输成功");
            }
            Err(e) if e.code == ErrorCode::Canceled => {
                self.update_status(&task_id, TransferStatus::Canceled).await;
                self.emit_status(&app, &task_id, TransferStatus::Canceled, None);
                tracing::info!(task_id = %task_id, "传输已取消");
            }
            Err(e) => {
                let retryable = e.retryable.unwrap_or(false);

                // 自动重试
                if retryable && retry_count < DEFAULT_RETRY_COUNT {
                    let delay = Duration::from_secs(1 << retry_count); // 1s, 2s, 4s...
                    tracing::info!(
                        task_id = %task_id,
                        retry_count = retry_count + 1,
                        delay_secs = delay.as_secs(),
                        "将自动重试"
                    );

                    {
                        let mut tasks = self.tasks.write().await;
                        if let Some(internal) = tasks.get_mut(&task_id) {
                            internal.retry_count += 1;
                            internal.task.status = TransferStatus::Waiting;
                            internal.task.transferred = 0;
                        }
                    }

                    tokio::time::sleep(delay).await;

                    // 递归重试
                    return Box::pin(self.execute_task(app, session_manager, task_id)).await;
                }

                // 最终失败
                self.update_error(&task_id, &e).await;
                self.emit_status(&app, &task_id, TransferStatus::Failed, Some(&e));
                tracing::error!(task_id = %task_id, error = %e.message, "传输失败");
            }
        }

        Ok(())
    }

    /// 同步执行上传
    fn do_upload_sync(
        app: &AppHandle,
        sftp: &Sftp,
        task: &TransferTask,
        cancel_token: &CancellationToken,
    ) -> AppResult<()> {
        let task_id = &task.task_id;
        let local_path = &task.local_path;
        let remote_path = &task.remote_path;
        let total = task.total.unwrap_or(0);

        // 打开本地文件
        let mut local_file = File::open(local_path).map_err(|e| {
            AppError::new(ErrorCode::LocalIoError, format!("无法打开本地文件: {}", e))
                .with_retryable(false)
        })?;

        // 创建远程文件
        let mut remote_file = sftp.create(Path::new(remote_path)).map_err(|e| {
            let msg = format!("无法创建远程文件: {}", e);
            if msg.contains("Permission denied") {
                AppError::permission_denied("无权限写入远程文件")
            } else {
                AppError::new(ErrorCode::RemoteIoError, msg).with_retryable(true)
            }
        })?;

        let mut buffer = vec![0u8; CHUNK_SIZE];
        let mut progress = ProgressTracker::new(app, task_id, total);

        loop {
            if cancel_token.is_cancelled() {
                return Err(AppError::canceled());
            }

            let bytes_read = local_file.read(&mut buffer).map_err(|e| {
                AppError::new(ErrorCode::LocalIoError, format!("读取本地文件失败: {}", e))
                    .with_retryable(false)
            })?;

            if bytes_read == 0 {
                break;
            }

            remote_file.write_all(&buffer[..bytes_read]).map_err(|e| {
                AppError::new(ErrorCode::RemoteIoError, format!("写入远程文件失败: {}", e))
                    .with_retryable(true)
            })?;

            progress.update(bytes_read as u64);
        }

        progress.finish();
        Ok(())
    }

    /// 同步执行下载
    fn do_download_sync(
        app: &AppHandle,
        sftp: &Sftp,
        task: &TransferTask,
        cancel_token: &CancellationToken,
    ) -> AppResult<()> {
        let task_id = &task.task_id;
        let local_path = &task.local_path;
        let remote_path = &task.remote_path;

        // 获取远程文件信息
        let stat = sftp.stat(Path::new(remote_path)).map_err(|e| {
            let msg = format!("{}", e);
            if msg.contains("No such file") {
                AppError::not_found(format!("远程文件不存在: {}", remote_path))
            } else {
                AppError::new(ErrorCode::RemoteIoError, format!("无法获取文件信息: {}", e))
                    .with_retryable(true)
            }
        })?;

        let total = stat.size.unwrap_or(0);

        // 打开远程文件
        let mut remote_file = sftp.open(Path::new(remote_path)).map_err(|e| {
            let msg = format!("{}", e);
            if msg.contains("Permission denied") {
                AppError::permission_denied("无权限读取远程文件")
            } else {
                AppError::new(ErrorCode::RemoteIoError, format!("无法打开远程文件: {}", e))
                    .with_retryable(true)
            }
        })?;

        // 创建本地文件
        let mut local_file = File::create(local_path).map_err(|e| {
            AppError::new(ErrorCode::LocalIoError, format!("无法创建本地文件: {}", e))
                .with_retryable(false)
        })?;

        let mut buffer = vec![0u8; CHUNK_SIZE];
        let mut progress = ProgressTracker::new(app, task_id, total);

        loop {
            if cancel_token.is_cancelled() {
                drop(local_file);
                std::fs::remove_file(local_path).ok();
                return Err(AppError::canceled());
            }

            let bytes_read = remote_file.read(&mut buffer).map_err(|e| {
                AppError::new(ErrorCode::RemoteIoError, format!("读取远程文件失败: {}", e))
                    .with_retryable(true)
            })?;

            if bytes_read == 0 {
                break;
            }

            local_file.write_all(&buffer[..bytes_read]).map_err(|e| {
                AppError::new(ErrorCode::LocalIoError, format!("写入本地文件失败: {}", e))
                    .with_retryable(false)
            })?;

            progress.update(bytes_read as u64);
        }

        progress.finish();
        Ok(())
    }

    /// 取消任务
    pub async fn cancel_task(&self, task_id: &str) -> AppResult<()> {
        let tasks = self.tasks.read().await;
        let internal = tasks
            .get(task_id)
            .ok_or_else(|| AppError::not_found(format!("任务不存在: {}", task_id)))?;

        match internal.task.status {
            TransferStatus::Waiting | TransferStatus::Running => {
                internal.cancel_token.cancel();
                tracing::info!(task_id = %task_id, "取消信号已发送");
                Ok(())
            }
            // 已完成的任务取消静默成功（幂等）
            _ => Ok(()),
        }
    }

    /// 重试失败的任务
    pub async fn retry_task(&self, task_id: &str) -> AppResult<String> {
        let task = {
            let tasks = self.tasks.read().await;
            let internal = tasks
                .get(task_id)
                .ok_or_else(|| AppError::not_found(format!("任务不存在: {}", task_id)))?;

            if internal.task.status != TransferStatus::Failed {
                return Err(AppError::new(
                    ErrorCode::InvalidArgument,
                    "只能重试失败的任务",
                ));
            }

            internal.task.clone()
        };

        // 创建新任务
        self.create_task(
            task.session_id,
            task.direction,
            task.local_path,
            task.remote_path,
            task.file_name,
            task.total,
        )
        .await
    }

    /// 获取任务列表
    pub async fn list_tasks(&self) -> Vec<TransferTask> {
        let tasks = self.tasks.read().await;
        tasks.values().map(|i| i.task.clone()).collect()
    }

    /// 获取单个任务
    pub async fn get_task(&self, task_id: &str) -> Option<TransferTask> {
        let tasks = self.tasks.read().await;
        tasks.get(task_id).map(|i| i.task.clone())
    }

    /// 清理已完成的任务
    pub async fn cleanup_completed(&self) {
        let mut tasks = self.tasks.write().await;
        tasks.retain(|_, internal| {
            !matches!(
                internal.task.status,
                TransferStatus::Success | TransferStatus::Canceled
            )
        });
    }

    // ============================================
    // 内部辅助方法
    // ============================================

    /// 更新任务状态
    async fn update_status(&self, task_id: &str, status: TransferStatus) {
        let mut tasks = self.tasks.write().await;
        if let Some(internal) = tasks.get_mut(task_id) {
            internal.task.status = status.clone();
            if matches!(
                status,
                TransferStatus::Success | TransferStatus::Failed | TransferStatus::Canceled
            ) {
                internal.task.completed_at = Some(chrono::Utc::now().timestamp_millis());
            }
        }
    }

    /// 更新任务错误信息
    async fn update_error(&self, task_id: &str, error: &AppError) {
        let mut tasks = self.tasks.write().await;
        if let Some(internal) = tasks.get_mut(task_id) {
            internal.task.status = TransferStatus::Failed;
            internal.task.error_message = Some(error.message.clone());
            internal.task.error_code = Some(serialize_error_code(&error.code));
            internal.task.retryable = error.retryable;
            internal.task.completed_at = Some(chrono::Utc::now().timestamp_millis());
        }
    }

    /// 推送状态事件
    fn emit_status(
        &self,
        app: &AppHandle,
        task_id: &str,
        status: TransferStatus,
        error: Option<&AppError>,
    ) {
        let payload = TransferStatusPayload {
            task_id: task_id.to_string(),
            status,
            error_code: error.map(|e| serialize_error_code(&e.code)),
            error_message: error.map(|e| e.message.clone()),
        };
        app.emit("transfer:status", &payload).ok();
    }
}

impl Default for TransferManager {
    fn default() -> Self {
        Self::new(3) // 默认最大并发数
    }
}

// 安全性：TransferManager 可以跨线程共享
unsafe impl Send for TransferManager {}
unsafe impl Sync for TransferManager {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::Arc;
    use tempfile::NamedTempFile;
    use tokio::time::Duration;

    // ========== 辅助函数 ==========

    /// 创建临时测试文件
    fn create_temp_file(content: &[u8]) -> NamedTempFile {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(content).unwrap();
        file.flush().unwrap();
        file
    }

    // ========== 辅助函数测试 ==========

    #[test]
    fn test_calculate_speed_normal() {
        let speed = calculate_speed(1024 * 1024, 1.0); // 1MB in 1 second
        assert_eq!(speed, 1024 * 1024);
    }

    #[test]
    fn test_calculate_speed_zero_time() {
        let speed = calculate_speed(1000, 0.0);
        assert_eq!(speed, 0);
    }

    #[test]
    fn test_calculate_speed_fractional() {
        let speed = calculate_speed(500, 0.5); // 500 bytes in 0.5 seconds = 1000 bytes/s
        assert_eq!(speed, 1000);
    }

    #[test]
    fn test_calculate_percent_normal() {
        let percent = calculate_percent(50, 100);
        assert_eq!(percent, 50);
    }

    #[test]
    fn test_calculate_percent_zero_total() {
        let percent = calculate_percent(50, 0);
        assert_eq!(percent, 0);
    }

    #[test]
    fn test_calculate_percent_full() {
        let percent = calculate_percent(100, 100);
        assert_eq!(percent, 100);
    }

    #[test]
    fn test_serialize_error_code_canceled() {
        let code = ErrorCode::Canceled;
        let serialized = serialize_error_code(&code);
        assert_eq!(serialized, "CANCELED");
    }

    #[test]
    fn test_serialize_error_code_network_lost() {
        let code = ErrorCode::NetworkLost;
        let serialized = serialize_error_code(&code);
        assert_eq!(serialized, "NETWORK_LOST");
    }

    // ========== 基础创建测试 ==========

    #[tokio::test]
    async fn test_transfer_manager_creation() {
        let manager = TransferManager::new(3);
        let tasks = manager.list_tasks().await;
        assert!(tasks.is_empty());
    }

    #[tokio::test]
    async fn test_create_upload_nonexistent_file() {
        let manager = TransferManager::new(3);
        let result = manager
            .create_upload(
                "session_id".to_string(),
                "/nonexistent/file.txt".to_string(),
                "/remote/dir".to_string(),
            )
            .await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFound);
    }

    #[tokio::test]
    async fn test_create_upload_success() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"hello world");

        let result = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/remote/dir".to_string(),
            )
            .await;

        assert!(result.is_ok());
        let task_id = result.unwrap();

        let task = manager.get_task(&task_id).await;
        assert!(task.is_some());
        let task = task.unwrap();
        assert_eq!(task.status, TransferStatus::Waiting);
        assert_eq!(task.direction, TransferDirection::Upload);
        assert_eq!(task.transferred, 0);
        assert_eq!(task.total, Some(11)); // "hello world" = 11 bytes
        assert_eq!(task.session_id, "session_123");
    }

    #[tokio::test]
    async fn test_create_upload_directory_rejected() {
        let manager = TransferManager::new(3);
        let temp_dir = tempfile::tempdir().unwrap();

        let result = manager
            .create_upload(
                "session_123".to_string(),
                temp_dir.path().to_str().unwrap().to_string(),
                "/remote".to_string(),
            )
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidArgument);
        assert!(err.message.contains("不支持上传目录"));
    }

    #[tokio::test]
    async fn test_create_download_invalid_local_dir() {
        let manager = TransferManager::new(3);

        let result = manager
            .create_download(
                "session_123".to_string(),
                "/remote/file.txt".to_string(),
                "/nonexistent/dir".to_string(),
            )
            .await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFound);
    }

    #[tokio::test]
    async fn test_create_download_local_path_is_file() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"test");

        let result = manager
            .create_download(
                "session_123".to_string(),
                "/remote/file.txt".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
            )
            .await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::InvalidArgument);
    }

    #[tokio::test]
    async fn test_remote_path_construction_root() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        let task = manager.get_task(&task_id).await.unwrap();
        assert!(task.remote_path.starts_with("/"));
    }

    #[tokio::test]
    async fn test_remote_path_construction_with_trailing_slash() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/dir/".to_string(),
            )
            .await
            .unwrap();

        let task = manager.get_task(&task_id).await.unwrap();
        assert!(task.remote_path.starts_with("/dir/"));
        assert!(!task.remote_path.contains("//"));
    }

    // ========== 任务查询测试 ==========

    #[tokio::test]
    async fn test_list_tasks_empty() {
        let manager = TransferManager::new(3);
        let tasks = manager.list_tasks().await;
        assert_eq!(tasks.len(), 0);
    }

    #[tokio::test]
    async fn test_list_tasks_multiple() {
        let manager = TransferManager::new(3);
        let temp1 = create_temp_file(b"test1");
        let temp2 = create_temp_file(b"test2");

        manager
            .create_upload(
                "s1".to_string(),
                temp1.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();
        manager
            .create_upload(
                "s2".to_string(),
                temp2.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        let tasks = manager.list_tasks().await;
        assert_eq!(tasks.len(), 2);
    }

    #[tokio::test]
    async fn test_get_task_nonexistent() {
        let manager = TransferManager::new(3);
        let task = manager.get_task("nonexistent-id").await;
        assert!(task.is_none());
    }

    #[tokio::test]
    async fn test_get_task_exists() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        let task = manager.get_task(&task_id).await;
        assert!(task.is_some());
        assert_eq!(task.unwrap().task_id, task_id);
    }

    // ========== 状态机测试 ==========

    #[tokio::test]
    async fn test_update_status_to_running() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        manager
            .update_status(&task_id, TransferStatus::Running)
            .await;

        let task = manager.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, TransferStatus::Running);
        assert!(task.completed_at.is_none()); // Running 不是终态
    }

    #[tokio::test]
    async fn test_update_status_to_success_sets_completed_at() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        let before = chrono::Utc::now().timestamp_millis();
        manager
            .update_status(&task_id, TransferStatus::Success)
            .await;
        let after = chrono::Utc::now().timestamp_millis();

        let task = manager.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, TransferStatus::Success);
        assert!(task.completed_at.is_some());
        let completed = task.completed_at.unwrap();
        assert!(completed >= before && completed <= after);
    }

    #[tokio::test]
    async fn test_update_error_sets_all_fields() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        let error = AppError::network_lost("Connection lost").with_retryable(true);
        manager.update_error(&task_id, &error).await;

        let task = manager.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, TransferStatus::Failed);
        assert_eq!(task.error_message, Some("Connection lost".to_string()));
        assert_eq!(task.error_code, Some("NETWORK_LOST".to_string()));
        assert_eq!(task.retryable, Some(true));
        assert!(task.completed_at.is_some());
    }

    // ========== 取消测试 ==========

    #[tokio::test]
    async fn test_cancel_nonexistent_task() {
        let manager = TransferManager::new(3);
        let result = manager.cancel_task("nonexistent").await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFound);
    }

    #[tokio::test]
    async fn test_cancel_waiting_task_sets_token() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        // 获取取消 token 以验证
        let cancel_token = {
            let tasks = manager.tasks.read().await;
            tasks.get(&task_id).unwrap().cancel_token.clone()
        };

        assert!(!cancel_token.is_cancelled());

        manager.cancel_task(&task_id).await.unwrap();

        assert!(cancel_token.is_cancelled());
    }

    #[tokio::test]
    async fn test_cancel_completed_task_is_idempotent() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        // 标记为成功
        manager
            .update_status(&task_id, TransferStatus::Success)
            .await;

        // 取消应该静默成功
        let result = manager.cancel_task(&task_id).await;
        assert!(result.is_ok());

        // 状态不变
        let task = manager.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, TransferStatus::Success);
    }

    // ========== 清理测试 ==========

    #[tokio::test]
    async fn test_cleanup_removes_success_and_canceled() {
        let manager = TransferManager::new(3);
        let temp1 = create_temp_file(b"data1");
        let temp2 = create_temp_file(b"data2");

        let task1 = manager
            .create_upload(
                "s1".to_string(),
                temp1.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();
        let task2 = manager
            .create_upload(
                "s2".to_string(),
                temp2.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        manager.update_status(&task1, TransferStatus::Success).await;
        manager
            .update_status(&task2, TransferStatus::Canceled)
            .await;

        manager.cleanup_completed().await;

        let tasks = manager.list_tasks().await;
        assert_eq!(tasks.len(), 0);
    }

    #[tokio::test]
    async fn test_cleanup_keeps_waiting_running_failed() {
        let manager = TransferManager::new(3);
        let temp1 = create_temp_file(b"data1");
        let temp2 = create_temp_file(b"data2");
        let temp3 = create_temp_file(b"data3");

        let _task1 = manager
            .create_upload(
                "s1".to_string(),
                temp1.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap(); // Waiting
        let task2 = manager
            .create_upload(
                "s2".to_string(),
                temp2.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();
        let task3 = manager
            .create_upload(
                "s3".to_string(),
                temp3.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        manager.update_status(&task2, TransferStatus::Running).await;
        manager.update_status(&task3, TransferStatus::Failed).await;

        manager.cleanup_completed().await;

        let tasks = manager.list_tasks().await;
        assert_eq!(tasks.len(), 3);
    }

    // ========== 重试测试 ==========

    #[tokio::test]
    async fn test_retry_failed_task_creates_new_task() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/remote/dir".to_string(),
            )
            .await
            .unwrap();

        // 标记为失败
        let error = AppError::network_lost("Connection lost");
        manager.update_error(&task_id, &error).await;

        // 重试
        let new_task_id = manager.retry_task(&task_id).await.unwrap();

        assert_ne!(task_id, new_task_id);

        let new_task = manager.get_task(&new_task_id).await.unwrap();
        assert_eq!(new_task.status, TransferStatus::Waiting);
        assert_eq!(new_task.transferred, 0);
    }

    #[tokio::test]
    async fn test_retry_preserves_paths() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/remote/dir".to_string(),
            )
            .await
            .unwrap();

        let original = manager.get_task(&task_id).await.unwrap();

        manager
            .update_status(&task_id, TransferStatus::Failed)
            .await;
        let new_task_id = manager.retry_task(&task_id).await.unwrap();
        let new_task = manager.get_task(&new_task_id).await.unwrap();

        assert_eq!(new_task.local_path, original.local_path);
        assert_eq!(new_task.remote_path, original.remote_path);
        assert_eq!(new_task.session_id, original.session_id);
        assert_eq!(new_task.direction, original.direction);
        assert_eq!(new_task.total, original.total);
    }

    #[tokio::test]
    async fn test_retry_only_works_on_failed_tasks() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session_123".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        // 任务是 Waiting，不是 Failed
        let result = manager.retry_task(&task_id).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::InvalidArgument);
    }

    #[tokio::test]
    async fn test_retry_nonexistent_task() {
        let manager = TransferManager::new(3);
        let result = manager.retry_task("nonexistent").await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFound);
    }

    // ========== 并发测试 ==========

    #[tokio::test]
    async fn test_concurrent_task_creation() {
        let manager = Arc::new(TransferManager::new(3));
        let mut handles = vec![];

        // 并发创建 10 个任务
        for i in 0..10 {
            let manager_clone = manager.clone();
            let handle = tokio::spawn(async move {
                let temp_file = create_temp_file(format!("data_{}", i).as_bytes());
                manager_clone
                    .create_upload(
                        "session".to_string(),
                        temp_file.path().to_str().unwrap().to_string(),
                        "/remote".to_string(),
                    )
                    .await
            });
            handles.push(handle);
        }

        // 等待所有完成
        let results: Vec<_> = futures::future::join_all(handles).await;

        // 所有应该成功
        let task_ids: Vec<String> = results.into_iter().map(|r| r.unwrap().unwrap()).collect();

        assert_eq!(task_ids.len(), 10);

        // 验证无重复
        let unique: std::collections::HashSet<_> = task_ids.iter().collect();
        assert_eq!(unique.len(), 10);

        // 列表应该包含所有任务
        let tasks = manager.list_tasks().await;
        assert_eq!(tasks.len(), 10);
    }

    #[tokio::test]
    async fn test_concurrent_reads_and_writes() {
        let manager = Arc::new(TransferManager::new(3));
        let temp_file = create_temp_file(b"data");

        let task_id = manager
            .create_upload(
                "session".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/".to_string(),
            )
            .await
            .unwrap();

        let mut handles = vec![];

        // 5 个读者
        for _ in 0..5 {
            let manager_clone = manager.clone();
            let task_id_clone = task_id.clone();
            handles.push(tokio::spawn(async move {
                for _ in 0..50 {
                    manager_clone.get_task(&task_id_clone).await;
                    tokio::time::sleep(Duration::from_micros(10)).await;
                }
            }));
        }

        // 2 个写者（模拟状态更新）
        for _ in 0..2 {
            let manager_clone = manager.clone();
            let task_id_clone = task_id.clone();
            handles.push(tokio::spawn(async move {
                for _ in 0..25 {
                    let mut tasks = manager_clone.tasks.write().await;
                    if let Some(internal) = tasks.get_mut(&task_id_clone) {
                        internal.task.transferred += 100;
                    }
                    drop(tasks);
                    tokio::time::sleep(Duration::from_micros(20)).await;
                }
            }));
        }

        // 所有应该完成（无死锁）
        futures::future::join_all(handles).await;

        // 验证最终状态一致
        let task = manager.get_task(&task_id).await.unwrap();
        assert_eq!(task.transferred, 5000); // 2 writers * 25 iterations * 100 bytes
    }

    // ========== Semaphore 测试 ==========

    #[tokio::test]
    async fn test_semaphore_available_permits() {
        let manager = TransferManager::new(3);
        // 默认是 3（从 settings）
        let available = manager.semaphore.available_permits();
        assert!(available >= 1 && available <= 6); // Settings 范围 1-6
    }

    #[tokio::test]
    async fn test_semaphore_acquire_release() {
        let manager = TransferManager::new(3);
        let initial = manager.semaphore.available_permits();

        // 获取一个许可
        let _permit1 = manager.semaphore.acquire().await.unwrap();
        assert_eq!(manager.semaphore.available_permits(), initial - 1);

        // 获取另一个
        let _permit2 = manager.semaphore.acquire().await.unwrap();
        assert_eq!(manager.semaphore.available_permits(), initial - 2);

        // 释放第一个
        drop(_permit1);
        assert_eq!(manager.semaphore.available_permits(), initial - 1);
    }

    #[tokio::test]
    async fn test_semaphore_blocks_when_exhausted() {
        let manager = TransferManager::new(3);
        let max_permits = manager.semaphore.available_permits();

        // 获取所有许可
        let mut permits = vec![];
        for _ in 0..max_permits {
            permits.push(manager.semaphore.acquire().await.unwrap());
        }

        assert_eq!(manager.semaphore.available_permits(), 0);

        // 尝试获取更多应该超时
        let result =
            tokio::time::timeout(Duration::from_millis(100), manager.semaphore.acquire()).await;

        assert!(result.is_err()); // 超时错误

        // 释放一个许可
        drop(permits.pop());
        assert_eq!(manager.semaphore.available_permits(), 1);

        // 现在应该能立即获取
        let _new_permit =
            tokio::time::timeout(Duration::from_millis(100), manager.semaphore.acquire())
                .await
                .unwrap()
                .unwrap();

        assert_eq!(manager.semaphore.available_permits(), 0);
    }

    #[tokio::test]
    async fn test_concurrent_semaphore_limit_enforcement() {
        use std::sync::atomic::{AtomicU32, Ordering};

        let manager = Arc::new(TransferManager::new(3));
        let max_permits = manager.semaphore.available_permits();
        let counter = Arc::new(AtomicU32::new(0));

        let mut handles = vec![];
        for _ in 0..10 {
            let mgr = manager.clone();
            let c = counter.clone();
            let handle = tokio::spawn(async move {
                let _permit = mgr.semaphore.acquire().await.unwrap();
                let current = c.fetch_add(1, Ordering::SeqCst) + 1;

                // 最多同时运行 max_permits 个
                assert!(current <= max_permits as u32);

                tokio::time::sleep(Duration::from_millis(50)).await;
                c.fetch_sub(1, Ordering::SeqCst);
            });
            handles.push(handle);
        }

        for h in handles {
            h.await.unwrap();
        }
    }
}
