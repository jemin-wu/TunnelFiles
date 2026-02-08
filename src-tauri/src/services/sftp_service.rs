//! SFTP 服务
//!
//! 负责:
//! - 目录列表
//! - 文件操作 (mkdir, rename, delete)
//! - 路径处理与安全验证

use std::cmp::Ordering;
use std::path::Path;

use ssh2::Sftp;

use crate::models::error::{AppError, AppResult};

// Unix 文件类型常量
const S_IFMT: u32 = 0o170000; // 文件类型掩码
const S_IFLNK: u32 = 0o120000; // 符号链接
use crate::models::file_entry::{FileEntry, SortField, SortOrder, SortSpec};

/// 将 SFTP 错误映射为 AppError，处理常见错误码
fn map_sftp_error(e: ssh2::Error, path: &str) -> AppError {
    if e.code() == ssh2::ErrorCode::SFTP(2) {
        AppError::not_found(format!("路径不存在: {}", path))
    } else {
        AppError::from(e)
    }
}

/// SFTP 服务
pub struct SftpService;

impl SftpService {
    /// 规范化路径
    ///
    /// 处理 `..`, `.`, 重复 `/`，确保路径格式统一
    pub fn normalize_path(path: &str) -> String {
        let path = path.trim();
        if path.is_empty() {
            return "/".to_string();
        }

        let is_absolute = path.starts_with('/');
        let mut components: Vec<&str> = Vec::new();

        for part in path.split('/') {
            match part {
                "" | "." => continue,
                ".." => {
                    if !components.is_empty() && components.last() != Some(&"..") {
                        components.pop();
                    } else if !is_absolute {
                        components.push("..");
                    }
                }
                _ => components.push(part),
            }
        }

        if is_absolute {
            format!("/{}", components.join("/"))
        } else if components.is_empty() {
            ".".to_string()
        } else {
            components.join("/")
        }
    }

    /// 验证路径安全性
    ///
    /// 确保路径不会导致路径遍历攻击
    pub fn validate_path(path: &str) -> AppResult<()> {
        let normalized = Self::normalize_path(path);

        // 相对路径中包含 .. 是不安全的
        if normalized.starts_with("..") || normalized.contains("/..") {
            return Err(AppError::invalid_argument("不允许访问父目录之上的路径"));
        }

        Ok(())
    }

    /// 列出目录内容
    pub fn list_dir(sftp: &Sftp, path: &str, sort: Option<SortSpec>) -> AppResult<Vec<FileEntry>> {
        let normalized = Self::normalize_path(path);
        Self::validate_path(&normalized)?;

        let path_obj = Path::new(&normalized);

        // 先检查路径是否存在且是目录
        let stat = sftp
            .stat(path_obj)
            .map_err(|e| map_sftp_error(e, &normalized))?;

        if !stat.is_dir() {
            return Err(AppError::invalid_argument(format!(
                "指定的路径是文件而非目录: {}",
                normalized
            )));
        }

        // 读取目录内容
        let dir_entries = sftp
            .readdir(path_obj)
            .map_err(|e| AppError::from(e).with_detail(format!("读取目录失败: {}", normalized)))?;

        // 转换为 FileEntry，过滤 . 和 ..
        let mut entries: Vec<FileEntry> = dir_entries
            .into_iter()
            .filter_map(|(path_buf, file_stat)| {
                let name = path_buf.file_name()?.to_str()?.to_string();

                // 过滤 . 和 ..
                if name == "." || name == ".." {
                    return None;
                }

                let full_path = path_buf.to_string_lossy().to_string();

                Some(Self::file_stat_to_entry(name, full_path, file_stat))
            })
            .collect();

        // 排序
        let sort_spec = sort.unwrap_or_default();
        Self::sort_entries(&mut entries, &sort_spec);

        Ok(entries)
    }

    /// 创建目录
    ///
    /// 名称校验: 非空、无 `/`、无 `\0`
    pub fn mkdir(sftp: &Sftp, path: &str) -> AppResult<()> {
        let normalized = Self::normalize_path(path);
        Self::validate_path(&normalized)?;

        // 校验目录名
        let name = Path::new(&normalized)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if name.is_empty() {
            return Err(AppError::invalid_argument("目录名不能为空"));
        }
        if name.contains('/') || name.contains('\0') {
            return Err(AppError::invalid_argument("目录名包含非法字符"));
        }

        let path_obj = Path::new(&normalized);

        // 检查父目录是否存在
        if let Some(parent) = path_obj.parent() {
            if parent != Path::new("/") && parent != Path::new("") {
                let parent_str = parent.to_string_lossy();
                sftp.stat(parent).map_err(|e| {
                    if e.code() == ssh2::ErrorCode::SFTP(2) {
                        AppError::not_found(format!("父目录不存在: {}", parent_str))
                    } else {
                        AppError::from(e)
                    }
                })?;
            }
        }

        // 创建目录，权限 755
        sftp.mkdir(path_obj, 0o755).map_err(|e| {
            if e.code() == ssh2::ErrorCode::SFTP(11) {
                AppError::already_exists(format!("目录已存在: {}", normalized))
            } else if e.code() == ssh2::ErrorCode::SFTP(4) {
                // SFTP(4) 可能是已存在或其他错误
                AppError::already_exists(format!("目录已存在: {}", normalized))
            } else {
                AppError::from(e)
            }
        })?;

        Ok(())
    }

    /// 重命名/移动文件或目录
    pub fn rename(sftp: &Sftp, from: &str, to: &str) -> AppResult<()> {
        let from_normalized = Self::normalize_path(from);
        let to_normalized = Self::normalize_path(to);
        Self::validate_path(&from_normalized)?;
        Self::validate_path(&to_normalized)?;

        let from_path = Path::new(&from_normalized);
        let to_path = Path::new(&to_normalized);

        // 检查源路径是否存在
        sftp.stat(from_path)
            .map_err(|e| map_sftp_error(e, &from_normalized))?;

        // 检查目标是否已存在
        if sftp.stat(to_path).is_ok() {
            return Err(AppError::already_exists(format!(
                "目标路径已存在: {}",
                to_normalized
            )));
        }

        // 检查是否移动到自身子目录 (源是目录时)
        let from_stat = sftp.stat(from_path)?;
        if from_stat.is_dir() && to_normalized.starts_with(&format!("{}/", from_normalized)) {
            return Err(AppError::invalid_argument("不能将目录移动到自身子目录"));
        }

        // 执行重命名
        sftp.rename(from_path, to_path, None)
            .map_err(AppError::from)?;

        Ok(())
    }

    /// 删除文件、符号链接或空目录
    ///
    /// MVP 策略: 仅允许删除空目录
    /// 符号链接: 删除链接本身，不删除目标
    pub fn delete(sftp: &Sftp, path: &str, is_dir: bool) -> AppResult<()> {
        let normalized = Self::normalize_path(path);
        Self::validate_path(&normalized)?;

        let path_obj = Path::new(&normalized);

        // 禁止删除根目录
        if normalized == "/" {
            return Err(AppError::invalid_argument("不允许删除根目录"));
        }

        // 禁止删除 . 和 ..
        let name = path_obj.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name == "." || name == ".." {
            return Err(AppError::invalid_argument("不允许删除 . 或 .."));
        }

        // 使用 lstat 获取链接自身信息（不跟随符号链接）
        let lstat = sftp
            .lstat(path_obj)
            .map_err(|e| map_sftp_error(e, &normalized))?;

        // 检查是否是符号链接
        let is_symlink = lstat
            .perm
            .map(|mode| (mode & S_IFMT) == S_IFLNK)
            .unwrap_or(false);

        if is_symlink {
            // 符号链接直接删除链接本身（使用 unlink）
            sftp.unlink(path_obj).map_err(AppError::from)?;
            return Ok(());
        }

        // 非符号链接：验证 is_dir 参数与实际类型匹配
        if is_dir && !lstat.is_dir() {
            return Err(AppError::invalid_argument(format!(
                "指定路径是文件而非目录: {}",
                normalized
            )));
        }
        if !is_dir && lstat.is_dir() {
            return Err(AppError::invalid_argument(format!(
                "指定路径是目录而非文件: {}",
                normalized
            )));
        }

        if is_dir {
            // 检查目录是否为空
            let entries = sftp.readdir(path_obj).map_err(AppError::from)?;
            let non_dot_entries: Vec<_> = entries
                .iter()
                .filter(|(p, _)| {
                    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    name != "." && name != ".."
                })
                .collect();

            if !non_dot_entries.is_empty() {
                return Err(AppError::dir_not_empty(format!(
                    "目录非空，包含 {} 个条目",
                    non_dot_entries.len()
                )));
            }

            sftp.rmdir(path_obj).map_err(AppError::from)?;
        } else {
            sftp.unlink(path_obj).map_err(AppError::from)?;
        }

        Ok(())
    }

    /// 获取目录统计信息（文件数、目录数、总大小）
    ///
    /// 用于删除确认对话框显示
    /// 使用迭代而非递归，避免栈溢出
    /// 跳过符号链接防止无限循环
    pub fn get_directory_stats(sftp: &Sftp, path: &str) -> AppResult<DirectoryStats> {
        let normalized = Self::normalize_path(path);
        Self::validate_path(&normalized)?;

        let path_obj = Path::new(&normalized);

        // 使用 lstat 检查是否为符号链接
        let lstat = sftp
            .lstat(path_obj)
            .map_err(|e| map_sftp_error(e, &normalized))?;

        let is_symlink = lstat
            .perm
            .map(|mode| (mode & S_IFMT) == S_IFLNK)
            .unwrap_or(false);

        if is_symlink {
            return Err(AppError::invalid_argument("符号链接不支持统计"));
        }

        // 使用 stat 检查是否为目录（跟随符号链接）
        let stat = sftp
            .stat(path_obj)
            .map_err(|e| map_sftp_error(e, &normalized))?;

        if !stat.is_dir() {
            // 如果是文件，返回单个文件的统计信息
            return Ok(DirectoryStats {
                file_count: 1,
                dir_count: 0,
                total_size: stat.size.unwrap_or(0),
            });
        }

        let mut file_count: u64 = 0;
        let mut dir_count: u64 = 0;
        let mut total_size: u64 = 0;

        // 使用栈进行迭代遍历（避免递归导致栈溢出）
        let mut stack = vec![normalized.clone()];

        while let Some(current_path) = stack.pop() {
            let current_obj = Path::new(&current_path);

            let entries = match sftp.readdir(current_obj) {
                Ok(entries) => entries,
                Err(e) => {
                    tracing::warn!(path = %current_path, error = %e, "无法读取目录，跳过");
                    continue;
                }
            };

            for (path_buf, _) in entries {
                // 过滤 . 和 ..
                let file_name = path_buf.file_name().and_then(|n| n.to_str());
                if matches!(file_name, None | Some(".") | Some("..")) {
                    continue;
                }

                let full_path = path_buf.to_string_lossy().to_string();

                // 使用 lstat 检查每个条目（避免跟随符号链接）
                let entry_lstat = match sftp.lstat(&path_buf) {
                    Ok(s) => s,
                    Err(e) => {
                        tracing::warn!(path = %full_path, error = %e, "无法获取文件信息，跳过");
                        continue;
                    }
                };

                // 跳过符号链接
                let is_symlink = entry_lstat
                    .perm
                    .map(|mode| (mode & S_IFMT) == S_IFLNK)
                    .unwrap_or(false);

                if is_symlink {
                    tracing::debug!(path = %full_path, "跳过符号链接");
                    continue;
                }

                if entry_lstat.is_dir() {
                    dir_count += 1;
                    stack.push(full_path);
                } else {
                    file_count += 1;
                    total_size += entry_lstat.size.unwrap_or(0);
                }
            }
        }

        Ok(DirectoryStats {
            file_count,
            dir_count,
            total_size,
        })
    }

    /// 递归删除目录及其所有内容
    ///
    /// 策略：深度优先遍历，先删除文件和子目录，最后删除目录本身
    /// 符号链接：只删除链接本身，不跟随
    /// 错误处理：记录失败项但继续删除其他文件
    pub fn delete_recursive(
        sftp: &Sftp,
        path: &str,
        progress_callback: Option<DeleteProgressCallback>,
    ) -> AppResult<RecursiveDeleteResult> {
        let normalized = Self::normalize_path(path);
        Self::validate_delete_path(&normalized)?;

        let path_obj = Path::new(&normalized);

        // 使用 lstat 检查是否为符号链接
        let lstat = sftp
            .lstat(path_obj)
            .map_err(|e| map_sftp_error(e, &normalized))?;

        let is_symlink = lstat
            .perm
            .map(|mode| (mode & S_IFMT) == S_IFLNK)
            .unwrap_or(false);

        // 如果是符号链接，直接删除链接本身
        if is_symlink {
            sftp.unlink(path_obj).map_err(AppError::from)?;
            return Ok(RecursiveDeleteResult {
                deleted_files: 1,
                deleted_dirs: 0,
                failures: vec![],
            });
        }

        // 如果是文件，直接删除
        if !lstat.is_dir() {
            sftp.unlink(path_obj).map_err(AppError::from)?;
            return Ok(RecursiveDeleteResult {
                deleted_files: 1,
                deleted_dirs: 0,
                failures: vec![],
            });
        }

        // 收集所有需要删除的项（深度优先）
        // 使用两个列表：files（文件和符号链接）和 dirs（目录，按深度逆序）
        let mut files: Vec<String> = Vec::new();
        let mut dirs: Vec<String> = Vec::new();
        let mut stack = vec![normalized.clone()];

        while let Some(current_path) = stack.pop() {
            let current_obj = Path::new(&current_path);

            let entries = match sftp.readdir(current_obj) {
                Ok(entries) => entries,
                Err(e) => {
                    tracing::warn!(path = %current_path, error = %e, "无法读取目录");
                    continue;
                }
            };

            for (path_buf, _) in entries {
                let file_name = path_buf.file_name().and_then(|n| n.to_str());
                if matches!(file_name, None | Some(".") | Some("..")) {
                    continue;
                }

                let full_path = path_buf.to_string_lossy().to_string();

                let entry_lstat = match sftp.lstat(&path_buf) {
                    Ok(s) => s,
                    Err(e) => {
                        tracing::warn!(path = %full_path, error = %e, "无法获取文件信息");
                        continue;
                    }
                };

                // 检查是否是符号链接
                let is_symlink = entry_lstat
                    .perm
                    .map(|mode| (mode & S_IFMT) == S_IFLNK)
                    .unwrap_or(false);

                if is_symlink || !entry_lstat.is_dir() {
                    files.push(full_path);
                } else {
                    // 目录：先递归进入，稍后删除
                    stack.push(full_path.clone());
                    dirs.push(full_path);
                }
            }
        }

        // 将根目录也加入待删除列表
        dirs.push(normalized.clone());

        // 目录按路径长度降序排序（最深的路径最长，先删除）
        // 不能用 reverse()，因为 stack-based DFS 的发现顺序不保证深度顺序
        dirs.sort_by_key(|d| std::cmp::Reverse(d.len()));

        let total_count = (files.len() + dirs.len()) as u64;
        let mut deleted_count: u64 = 0;
        let mut deleted_files: u64 = 0;
        let mut deleted_dirs: u64 = 0;
        let mut failures: Vec<DeleteFailure> = Vec::new();

        // 用于进度节流
        let mut last_progress_time = std::time::Instant::now();
        let progress_interval = std::time::Duration::from_millis(200);

        // 先删除文件和符号链接
        for file_path in files {
            let file_obj = Path::new(&file_path);
            match sftp.unlink(file_obj) {
                Ok(()) => {
                    deleted_files += 1;
                    deleted_count += 1;
                    tracing::debug!(path = %file_path, "删除文件成功");
                }
                Err(e) => {
                    tracing::warn!(path = %file_path, error = %e, "删除文件失败");
                    failures.push(DeleteFailure {
                        path: file_path.clone(),
                        error: e.message().to_string(),
                    });
                    deleted_count += 1; // 仍然计入进度
                }
            }

            // 发送进度（节流）
            if let Some(ref callback) = progress_callback {
                if last_progress_time.elapsed() >= progress_interval {
                    callback(DeleteProgress {
                        path: normalized.clone(),
                        deleted_count,
                        total_count,
                        current_path: file_path,
                    });
                    last_progress_time = std::time::Instant::now();
                }
            }
        }

        // 再删除目录（从最深的开始）
        for dir_path in dirs {
            let dir_obj = Path::new(&dir_path);
            match sftp.rmdir(dir_obj) {
                Ok(()) => {
                    deleted_dirs += 1;
                    deleted_count += 1;
                    tracing::debug!(path = %dir_path, "删除目录成功");
                }
                Err(e) => {
                    tracing::warn!(path = %dir_path, error = %e, "删除目录失败");
                    failures.push(DeleteFailure {
                        path: dir_path.clone(),
                        error: e.message().to_string(),
                    });
                    deleted_count += 1; // 仍然计入进度
                }
            }

            // 发送进度（节流）
            if let Some(ref callback) = progress_callback {
                if last_progress_time.elapsed() >= progress_interval {
                    callback(DeleteProgress {
                        path: normalized.clone(),
                        deleted_count,
                        total_count,
                        current_path: dir_path,
                    });
                    last_progress_time = std::time::Instant::now();
                }
            }
        }

        // 发送最终进度
        if let Some(ref callback) = progress_callback {
            callback(DeleteProgress {
                path: normalized.clone(),
                deleted_count,
                total_count,
                current_path: String::new(),
            });
        }

        Ok(RecursiveDeleteResult {
            deleted_files,
            deleted_dirs,
            failures,
        })
    }

    /// 验证删除路径安全性
    ///
    /// 禁止删除根目录、. 和 ..
    pub fn validate_delete_path(path: &str) -> AppResult<()> {
        let trimmed = path.trim();

        // 禁止删除 . 和 ..（直接检查，因为它们可能会被规范化掉）
        if trimmed == "." || trimmed == ".." {
            return Err(AppError::invalid_argument("不允许删除 . 或 .."));
        }

        // 检查路径是否以 /. 或 /.. 结尾
        if trimmed.ends_with("/.") || trimmed.ends_with("/..") {
            return Err(AppError::invalid_argument("不允许删除 . 或 .."));
        }

        let normalized = Self::normalize_path(path);
        Self::validate_path(&normalized)?;

        // 禁止删除根目录
        if normalized == "/" {
            return Err(AppError::invalid_argument("不允许删除根目录"));
        }

        Ok(())
    }

    /// 修改文件/目录权限
    ///
    /// 使用 SFTP setstat 修改权限
    /// mode 范围: 0o000 - 0o777
    pub fn chmod(sftp: &Sftp, path: &str, mode: u32) -> AppResult<()> {
        let normalized = Self::normalize_path(path);
        Self::validate_path(&normalized)?;

        let path_obj = Path::new(&normalized);

        // 禁止修改根目录权限
        if normalized == "/" {
            return Err(AppError::invalid_argument("不允许修改根目录权限"));
        }

        // 禁止修改 . 和 ..
        let name = path_obj.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name == "." || name == ".." {
            return Err(AppError::invalid_argument("不允许修改 . 或 .. 的权限"));
        }

        // 验证权限值范围
        if mode > 0o777 {
            return Err(AppError::invalid_argument(format!(
                "权限值超出范围: {} (最大 0o777)",
                mode
            )));
        }

        // 检查路径是否存在
        sftp.stat(path_obj)
            .map_err(|e| map_sftp_error(e, &normalized))?;

        // 使用 setstat 修改权限
        // FileStat 需要手动构建，只设置 perm 字段
        let file_stat = ssh2::FileStat {
            size: None,
            uid: None,
            gid: None,
            perm: Some(mode),
            atime: None,
            mtime: None,
        };

        sftp.setstat(path_obj, file_stat).map_err(|e| {
            if e.code() == ssh2::ErrorCode::SFTP(3) {
                AppError::permission_denied(format!("无权修改文件权限: {}", normalized))
            } else {
                AppError::from(e)
            }
        })?;

        Ok(())
    }

    /// 递归列出目录下的所有文件
    ///
    /// 返回 (remote_path, relative_path) 元组列表，仅包含文件（不含目录）
    /// relative_path 相对于输入的 base_path
    /// 注意：会跳过符号链接以避免无限循环
    pub fn list_dir_recursive(sftp: &Sftp, base_path: &str) -> AppResult<Vec<(String, String)>> {
        let normalized = Self::normalize_path(base_path);
        Self::validate_path(&normalized)?;

        let path_obj = Path::new(&normalized);

        // 确认是目录（使用 lstat 检查是否为符号链接）
        let lstat = sftp
            .lstat(path_obj)
            .map_err(|e| map_sftp_error(e, &normalized))?;

        // 检查是否是符号链接
        let is_symlink = lstat
            .perm
            .map(|mode| (mode & S_IFMT) == S_IFLNK)
            .unwrap_or(false);
        if is_symlink {
            return Err(AppError::invalid_argument("不支持下载符号链接"));
        }

        let stat = sftp
            .stat(path_obj)
            .map_err(|e| map_sftp_error(e, &normalized))?;
        if !stat.is_dir() {
            return Err(AppError::invalid_argument(format!(
                "指定的路径是文件而非目录: {}",
                normalized
            )));
        }

        let mut files = Vec::new();
        let mut stack = vec![normalized.clone()];

        while let Some(current_path) = stack.pop() {
            let current_obj = Path::new(&current_path);

            let entries = match sftp.readdir(current_obj) {
                Ok(entries) => entries,
                Err(e) => {
                    tracing::warn!(path = %current_path, error = %e, "无法读取目录，跳过");
                    continue;
                }
            };

            for (path_buf, _) in entries {
                // 过滤 . 和 ..
                let file_name = path_buf.file_name().and_then(|n| n.to_str());
                if matches!(file_name, None | Some(".") | Some("..")) {
                    continue;
                }

                let full_path = path_buf.to_string_lossy().to_string();

                // 使用 lstat 检查每个条目（避免跟随符号链接）
                let lstat = match sftp.lstat(&path_buf) {
                    Ok(s) => s,
                    Err(e) => {
                        tracing::warn!(path = %full_path, error = %e, "无法获取文件信息，跳过");
                        continue;
                    }
                };

                // 跳过符号链接
                let is_symlink = lstat
                    .perm
                    .map(|mode| (mode & S_IFMT) == S_IFLNK)
                    .unwrap_or(false);
                if is_symlink {
                    tracing::debug!(path = %full_path, "跳过符号链接");
                    continue;
                }

                if lstat.is_dir() {
                    stack.push(full_path);
                } else {
                    // 计算相对路径
                    let relative = match full_path.strip_prefix(&normalized) {
                        Some(rel) => rel.trim_start_matches('/').to_string(),
                        None => {
                            tracing::error!(
                                full_path = %full_path,
                                base = %normalized,
                                "路径前缀不匹配，跳过"
                            );
                            continue;
                        }
                    };
                    files.push((full_path, relative));
                }
            }
        }

        Ok(files)
    }

    /// 获取文件/目录信息
    pub fn stat(sftp: &Sftp, path: &str) -> AppResult<FileEntry> {
        let normalized = Self::normalize_path(path);
        Self::validate_path(&normalized)?;

        let path_obj = Path::new(&normalized);

        // 使用 stat 而非 lstat，自动解析符号链接
        let file_stat = sftp
            .stat(path_obj)
            .map_err(|e| map_sftp_error(e, &normalized))?;

        // 提取文件名
        let name = path_obj
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        Ok(Self::file_stat_to_entry(name, normalized, file_stat))
    }

    /// 将 ssh2::FileStat 转换为 FileEntry
    fn file_stat_to_entry(name: String, path: String, stat: ssh2::FileStat) -> FileEntry {
        FileEntry {
            name,
            path,
            is_dir: stat.is_dir(),
            size: stat.size,
            mtime: stat.mtime.map(|t| t as i64),
            mode: stat.perm,
        }
    }

    /// 排序文件条目（目录优先）
    fn sort_entries(entries: &mut [FileEntry], sort: &SortSpec) {
        entries.sort_by(|a, b| {
            // 目录优先
            match (a.is_dir, b.is_dir) {
                (true, false) => return Ordering::Less,
                (false, true) => return Ordering::Greater,
                _ => {}
            }

            // 按字段排序
            let ordering = match sort.field {
                SortField::Name => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                SortField::Size => {
                    let a_size = a.size.unwrap_or(0);
                    let b_size = b.size.unwrap_or(0);
                    a_size.cmp(&b_size)
                }
                SortField::Mtime => {
                    let a_time = a.mtime.unwrap_or(0);
                    let b_time = b.mtime.unwrap_or(0);
                    a_time.cmp(&b_time)
                }
            };

            // 应用升降序
            match sort.order {
                SortOrder::Asc => ordering,
                SortOrder::Desc => ordering.reverse(),
            }
        });
    }
}

use crate::commands::sftp::{DeleteFailure, DeleteProgress, DirectoryStats, RecursiveDeleteResult};

/// 递归删除进度回调类型
pub type DeleteProgressCallback = Box<dyn Fn(DeleteProgress) + Send>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_path_basic() {
        assert_eq!(SftpService::normalize_path("/home/user"), "/home/user");
        assert_eq!(SftpService::normalize_path("/home//user/"), "/home/user");
        assert_eq!(SftpService::normalize_path("/"), "/");
        assert_eq!(SftpService::normalize_path(""), "/");
    }

    #[test]
    fn test_normalize_path_dot() {
        assert_eq!(SftpService::normalize_path("/home/./user"), "/home/user");
        assert_eq!(
            SftpService::normalize_path("/home/user/./data"),
            "/home/user/data"
        );
    }

    #[test]
    fn test_normalize_path_dot_dot() {
        assert_eq!(
            SftpService::normalize_path("/home/user/../data"),
            "/home/data"
        );
        assert_eq!(
            SftpService::normalize_path("/home/../home/user"),
            "/home/user"
        );
        assert_eq!(SftpService::normalize_path("/home/user/../../etc"), "/etc");
    }

    #[test]
    fn test_normalize_path_relative() {
        assert_eq!(SftpService::normalize_path("home/user"), "home/user");
        assert_eq!(SftpService::normalize_path("./home/user"), "home/user");
        assert_eq!(SftpService::normalize_path("../home"), "../home");
    }

    #[test]
    fn test_normalize_path_root_traversal() {
        // 尝试跳出根目录时应该停在根目录
        assert_eq!(SftpService::normalize_path("/../../../etc"), "/etc");
        assert_eq!(SftpService::normalize_path("/home/../../etc"), "/etc");
    }

    #[test]
    fn test_validate_path_safe() {
        assert!(SftpService::validate_path("/home/user").is_ok());
        assert!(SftpService::validate_path("/etc/passwd").is_ok());
        assert!(SftpService::validate_path("/").is_ok());
    }

    #[test]
    fn test_validate_path_unsafe() {
        // 相对路径尝试向上遍历
        assert!(SftpService::validate_path("../etc/passwd").is_err());
        assert!(SftpService::validate_path("../../root").is_err());
    }

    #[test]
    fn test_sort_entries_name_asc() {
        let mut entries = vec![
            FileEntry {
                name: "zebra.txt".to_string(),
                path: "/zebra.txt".to_string(),
                is_dir: false,
                size: Some(100),
                mtime: None,
                mode: None,
            },
            FileEntry {
                name: "alpha.txt".to_string(),
                path: "/alpha.txt".to_string(),
                is_dir: false,
                size: Some(200),
                mtime: None,
                mode: None,
            },
            FileEntry {
                name: "folder".to_string(),
                path: "/folder".to_string(),
                is_dir: true,
                size: None,
                mtime: None,
                mode: None,
            },
        ];

        let sort = SortSpec {
            field: SortField::Name,
            order: SortOrder::Asc,
        };

        SftpService::sort_entries(&mut entries, &sort);

        // 目录优先
        assert_eq!(entries[0].name, "folder");
        assert_eq!(entries[1].name, "alpha.txt");
        assert_eq!(entries[2].name, "zebra.txt");
    }

    #[test]
    fn test_sort_entries_size_desc() {
        let mut entries = vec![
            FileEntry {
                name: "small.txt".to_string(),
                path: "/small.txt".to_string(),
                is_dir: false,
                size: Some(100),
                mtime: None,
                mode: None,
            },
            FileEntry {
                name: "large.txt".to_string(),
                path: "/large.txt".to_string(),
                is_dir: false,
                size: Some(1000),
                mtime: None,
                mode: None,
            },
        ];

        let sort = SortSpec {
            field: SortField::Size,
            order: SortOrder::Desc,
        };

        SftpService::sort_entries(&mut entries, &sort);

        assert_eq!(entries[0].name, "large.txt");
        assert_eq!(entries[1].name, "small.txt");
    }

    // ========================
    // Tests for DirectoryStats
    // ========================

    #[test]
    fn test_directory_stats_struct_exists() {
        // This test verifies the DirectoryStats struct exists and has the expected fields
        let stats = crate::commands::sftp::DirectoryStats {
            file_count: 10,
            dir_count: 3,
            total_size: 1024,
        };
        assert_eq!(stats.file_count, 10);
        assert_eq!(stats.dir_count, 3);
        assert_eq!(stats.total_size, 1024);
    }

    #[test]
    fn test_recursive_delete_result_struct_exists() {
        // This test verifies the RecursiveDeleteResult struct exists
        let result = crate::commands::sftp::RecursiveDeleteResult {
            deleted_files: 5,
            deleted_dirs: 2,
            failures: vec![crate::commands::sftp::DeleteFailure {
                path: "/test/file.txt".to_string(),
                error: "Permission denied".to_string(),
            }],
        };
        assert_eq!(result.deleted_files, 5);
        assert_eq!(result.deleted_dirs, 2);
        assert_eq!(result.failures.len(), 1);
    }

    #[test]
    fn test_delete_progress_struct_exists() {
        // This test verifies the DeleteProgress struct exists
        let progress = crate::commands::sftp::DeleteProgress {
            path: "/test/dir".to_string(),
            deleted_count: 3,
            total_count: 10,
            current_path: "/test/dir/subfile.txt".to_string(),
        };
        assert_eq!(progress.path, "/test/dir");
        assert_eq!(progress.deleted_count, 3);
        assert_eq!(progress.total_count, 10);
    }

    #[test]
    fn test_delete_root_directory_rejected() {
        // This test verifies that attempting to delete "/" is rejected
        // Note: This tests the validation logic, not actual SFTP operation
        let result = SftpService::validate_delete_path("/");
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_dot_directories_rejected() {
        // This test verifies that attempting to delete "." or ".." is rejected
        // Note: We need to test paths that actually end with . or .. as the last component
        // Testing standalone "." and ".."
        let result_dot = SftpService::validate_delete_path(".");
        let result_dotdot = SftpService::validate_delete_path("..");
        assert!(result_dot.is_err(), "Should reject '.'");
        assert!(result_dotdot.is_err(), "Should reject '..'");
    }
}
