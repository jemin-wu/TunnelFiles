//! Snapshot 存储、diff 生成与文件级 rollback（T3.2 / T3.2a / T3.3）。
//!
//! 设计约束：
//! - 路径固定在 `{data_local_dir}/TunnelFiles/ai-backups/...`
//! - snapshot 只保留文件级内容，不做服务状态 rollback
//! - 任何 snapshot 前置条件失败都 fail-closed，拒绝 write step 执行

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use similar::TextDiff;
use ssh2::Sftp;

use crate::models::error::{AppError, AppResult};
use crate::services::session_manager::ManagedSession;
use crate::services::sftp_service::SftpService;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

const S_IFMT: u32 = 0o170000;
const S_IFLNK: u32 = 0o120000;

pub const SNAPSHOT_DIR_NAME: &str = "ai-backups";
pub const SNAPSHOT_DISK_REJECT_BYTES: u64 = 100 * 1024 * 1024;
pub const SNAPSHOT_FILE_WARN_BYTES: u64 = 10 * 1024 * 1024;
pub const SNAPSHOT_FILE_REJECT_BYTES: u64 = 100 * 1024 * 1024;
pub const SNAPSHOT_TTL_HOURS_DEFAULT: u64 = 24;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SnapshotFileEntry {
    pub target_path: String,
    pub snapshot_file: String,
    pub existed: bool,
    pub size: u64,
    pub mode: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SnapshotManifest {
    pub profile_id: String,
    pub session_id: String,
    pub step_id: String,
    pub created_at_millis: i64,
    pub entries: Vec<SnapshotFileEntry>,
}

#[derive(Debug, Clone)]
pub struct SnapshotBundle {
    pub snapshot_dir: PathBuf,
    pub manifest_path: PathBuf,
    pub manifest: SnapshotManifest,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotDiskAssessment {
    pub total_bytes: u64,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RollbackDiff {
    pub target_path: String,
    pub unified_diff: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RollbackProgress {
    pub current_path: String,
    pub restored_files: u32,
    pub total_files: u32,
}

pub fn backup_root_dir() -> AppResult<PathBuf> {
    let base = dirs::data_local_dir().ok_or_else(|| {
        AppError::local_io_error("无法解析 data_local_dir，拒绝创建 AI snapshot")
            .with_retryable(false)
    })?;
    Ok(base.join("TunnelFiles").join(SNAPSHOT_DIR_NAME))
}

pub fn snapshot_dir_for(profile_id: &str, session_id: &str, step_id: &str) -> AppResult<PathBuf> {
    validate_snapshot_component("profile_id", profile_id)?;
    validate_snapshot_component("session_id", session_id)?;
    validate_snapshot_component("step_id", step_id)?;

    Ok(backup_root_dir()?
        .join(profile_id)
        .join(session_id)
        .join(step_id))
}

fn validate_snapshot_component(label: &str, value: &str) -> AppResult<()> {
    let valid = !value.is_empty()
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'));
    if valid {
        return Ok(());
    }

    Err(
        AppError::invalid_argument(format!("invalid snapshot path component {label}"))
            .with_retryable(false),
    )
}

pub fn ensure_snapshot_dir(path: &Path) -> AppResult<()> {
    fs::create_dir_all(path).map_err(|e| {
        AppError::local_io_error(format!("无法创建 snapshot 目录: {}", e)).with_retryable(false)
    })?;
    lock_down_local_path(path)?;
    Ok(())
}

fn lock_down_local_path(path: &Path) -> AppResult<()> {
    #[cfg(unix)]
    {
        let mode = if path.is_dir() { 0o700 } else { 0o600 };
        let perms = fs::Permissions::from_mode(mode);
        fs::set_permissions(path, perms).map_err(|e| {
            AppError::local_io_error(format!("无法收紧 snapshot 权限: {}", e)).with_retryable(false)
        })?;
    }

    #[cfg(windows)]
    {
        // Windows 当前先依赖 LocalAppData 的用户隔离语义。若后续引入显式 ACL
        // 收紧实现，可在此处替换，不影响上层 snapshot/rollback 协议。
        let _ = path;
    }

    Ok(())
}

fn nearest_existing_path(path: &Path) -> Option<PathBuf> {
    let mut current = Some(path.to_path_buf());
    while let Some(candidate) = current {
        if candidate.exists() {
            return Some(candidate);
        }
        current = candidate.parent().map(Path::to_path_buf);
    }
    None
}

pub fn assess_snapshot_targets(
    file_sizes: &[(String, u64)],
    free_bytes: u64,
) -> AppResult<SnapshotDiskAssessment> {
    if free_bytes < SNAPSHOT_DISK_REJECT_BYTES {
        return Err(AppError::ai_unavailable("snapshot 磁盘空间不足")
            .with_detail(format!(
                "available={} bytes < required floor={} bytes",
                free_bytes, SNAPSHOT_DISK_REJECT_BYTES
            ))
            .with_retryable(false));
    }

    let mut total_bytes = 0u64;
    let mut warnings = Vec::new();
    for (path, size) in file_sizes {
        total_bytes = total_bytes.saturating_add(*size);
        if *size > SNAPSHOT_FILE_REJECT_BYTES {
            return Err(
                AppError::ai_unavailable(format!("snapshot 拒绝大文件: {}", path))
                    .with_detail(format!(
                        "size={} bytes > reject threshold={} bytes",
                        size, SNAPSHOT_FILE_REJECT_BYTES
                    ))
                    .with_retryable(false),
            );
        }
        if *size > SNAPSHOT_FILE_WARN_BYTES {
            warnings.push(format!(
                "{} 大于 10MB，确认对话框应提示大文件风险（{} bytes）",
                path, size
            ));
        }
    }

    if total_bytes > free_bytes {
        return Err(AppError::ai_unavailable("snapshot 可用磁盘空间不足")
            .with_detail(format!(
                "snapshot_bytes={} > free_bytes={}",
                total_bytes, free_bytes
            ))
            .with_retryable(false));
    }

    Ok(SnapshotDiskAssessment {
        total_bytes,
        warnings,
    })
}

pub fn unified_diff(old_text: &str, new_text: &str) -> String {
    TextDiff::from_lines(old_text, new_text)
        .unified_diff()
        .context_radius(3)
        .header("before", "after")
        .to_string()
}

pub fn build_diff_for_file(target_path: &str, before: &[u8], after: &[u8]) -> RollbackDiff {
    let unified = match (std::str::from_utf8(before), std::str::from_utf8(after)) {
        (Ok(old_text), Ok(new_text)) => unified_diff(old_text, new_text),
        _ => format!(
            "--- before\n+++ after\n@@ {}\n[binary diff omitted for {}]\n",
            target_path, target_path
        ),
    };

    RollbackDiff {
        target_path: target_path.to_string(),
        unified_diff: unified,
    }
}

pub fn snapshot_remote_files(
    session: &Arc<ManagedSession>,
    session_id: &str,
    step_id: &str,
    target_files: &[String],
) -> AppResult<SnapshotBundle> {
    if target_files.is_empty() {
        return Err(AppError::invalid_argument("snapshot target_files 不能为空"));
    }

    let snapshot_dir = snapshot_dir_for(&session.profile_id, session_id, step_id)?;
    ensure_snapshot_dir(&snapshot_dir)?;

    let free_bytes = fs4::available_space(
        nearest_existing_path(&snapshot_dir).unwrap_or_else(|| snapshot_dir.clone()),
    )
    .map_err(|e| AppError::local_io_error(format!("读取 snapshot 磁盘空间失败: {}", e)))?;

    let mut sftp = session.lock_sftp()?;
    let target_sizes = collect_target_sizes(&mut sftp, target_files)?;
    let assessment = assess_snapshot_targets(&target_sizes, free_bytes)?;
    let manifest = write_snapshot_manifest(
        &mut sftp,
        &snapshot_dir,
        &session.profile_id,
        session_id,
        step_id,
        target_files,
    )?;
    let manifest_path = snapshot_dir.join("manifest.json");
    fs::write(
        &manifest_path,
        serde_json::to_vec_pretty(&manifest).map_err(AppError::from)?,
    )
    .map_err(|e| AppError::local_io_error(format!("写入 snapshot manifest 失败: {}", e)))?;
    lock_down_local_path(&manifest_path)?;

    Ok(SnapshotBundle {
        snapshot_dir,
        manifest_path,
        manifest,
        warnings: assessment.warnings,
    })
}

pub fn rollback_snapshot<F>(
    session: &Arc<ManagedSession>,
    bundle: &SnapshotBundle,
    mut progress_cb: F,
) -> AppResult<()>
where
    F: FnMut(RollbackProgress),
{
    let total = bundle.manifest.entries.len() as u32;
    let mut sftp = session.lock_sftp()?;

    for (idx, entry) in bundle.manifest.entries.iter().enumerate() {
        if entry.existed {
            let bytes = fs::read(bundle.snapshot_dir.join(&entry.snapshot_file)).map_err(|e| {
                AppError::local_io_error(format!("读取本地 snapshot 失败: {}", e))
                    .with_retryable(false)
            })?;
            write_remote_bytes(&mut sftp, &entry.target_path, &bytes, entry.mode)?;
        } else {
            let normalized = SftpService::normalize_path(&entry.target_path);
            let path = Path::new(&normalized);
            match sftp.unlink(path) {
                Ok(()) => {}
                Err(e) if e.code() == ssh2::ErrorCode::SFTP(2) => {}
                Err(e) => return Err(AppError::from(e)),
            }
        }

        progress_cb(RollbackProgress {
            current_path: entry.target_path.clone(),
            restored_files: (idx + 1) as u32,
            total_files: total,
        });
    }

    Ok(())
}

pub fn apply_text_write(
    session: &Arc<ManagedSession>,
    target_path: &str,
    content: &str,
    mode: Option<u32>,
) -> AppResult<()> {
    let mut sftp = session.lock_sftp()?;
    write_remote_bytes(&mut sftp, target_path, content.as_bytes(), mode)
}

pub fn load_snapshot_bytes(bundle: &SnapshotBundle, target_path: &str) -> AppResult<Vec<u8>> {
    let entry = bundle
        .manifest
        .entries
        .iter()
        .find(|entry| entry.target_path == target_path)
        .ok_or_else(|| AppError::not_found(format!("snapshot entry 不存在: {}", target_path)))?;
    if !entry.existed {
        return Ok(Vec::new());
    }
    fs::read(bundle.snapshot_dir.join(&entry.snapshot_file))
        .map_err(|e| AppError::local_io_error(format!("读取 snapshot 内容失败: {}", e)))
}

pub fn load_snapshot_bundle(snapshot_dir: &Path) -> AppResult<SnapshotBundle> {
    let manifest_path = snapshot_dir.join("manifest.json");
    let manifest =
        serde_json::from_slice::<SnapshotManifest>(&fs::read(&manifest_path).map_err(|e| {
            AppError::local_io_error(format!("读取 snapshot manifest 失败: {}", e))
        })?)
        .map_err(AppError::from)?;

    Ok(SnapshotBundle {
        snapshot_dir: snapshot_dir.to_path_buf(),
        manifest_path,
        manifest,
        warnings: Vec::new(),
    })
}

pub fn cleanup_orphans_at_startup(ttl_hours: u64) -> AppResult<usize> {
    let root = backup_root_dir()?;
    if !root.exists() {
        return Ok(0);
    }

    let ttl = Duration::from_secs(ttl_hours.saturating_mul(3600));
    let now = SystemTime::now();
    cleanup_orphans_in(&root, now, ttl)
}

fn cleanup_orphans_in(root: &Path, now: SystemTime, ttl: Duration) -> AppResult<usize> {
    if !root.exists() {
        return Ok(0);
    }

    let mut removed = 0usize;

    for profile_dir in fs::read_dir(root)
        .map_err(|e| AppError::local_io_error(format!("读取 snapshot 根目录失败: {}", e)))?
    {
        let profile_dir = profile_dir.map_err(|e| {
            AppError::local_io_error(format!("遍历 snapshot profile 目录失败: {}", e))
        })?;
        if !profile_dir.path().is_dir() {
            continue;
        }

        for session_dir in fs::read_dir(profile_dir.path()).map_err(|e| {
            AppError::local_io_error(format!("遍历 snapshot session 目录失败: {}", e))
        })? {
            let session_dir = session_dir
                .map_err(|e| AppError::local_io_error(format!("遍历 snapshot 项失败: {}", e)))?;
            let path = session_dir.path();
            if !path.is_dir() {
                continue;
            }

            let modified = session_dir
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .unwrap_or(now);
            let age = now.duration_since(modified).unwrap_or_default();
            if age > ttl {
                fs::remove_dir_all(&path).map_err(|e| {
                    AppError::local_io_error(format!("删除过期 snapshot 失败: {}", e))
                })?;
                removed += 1;
            }
        }
    }

    Ok(removed)
}

fn collect_target_sizes(sftp: &mut Sftp, target_files: &[String]) -> AppResult<Vec<(String, u64)>> {
    let mut sizes = Vec::with_capacity(target_files.len());
    for target in target_files {
        let normalized = SftpService::normalize_path(target);
        SftpService::validate_path(&normalized)?;
        match sftp.lstat(Path::new(&normalized)) {
            Ok(stat) => {
                let is_symlink = stat
                    .perm
                    .map(|mode| (mode & S_IFMT) == S_IFLNK)
                    .unwrap_or(false);
                if is_symlink {
                    return Err(AppError::invalid_argument(format!(
                        "snapshot 不支持符号链接: {}",
                        normalized
                    )));
                }
                if stat.is_dir() {
                    return Err(AppError::invalid_argument(format!(
                        "snapshot 仅支持文件，不支持目录: {}",
                        normalized
                    )));
                }
                sizes.push((normalized, stat.size.unwrap_or(0)));
            }
            Err(e) if e.code() == ssh2::ErrorCode::SFTP(2) => {
                sizes.push((normalized, 0));
            }
            Err(e) => return Err(AppError::from(e)),
        }
    }
    Ok(sizes)
}

fn write_snapshot_manifest(
    sftp: &mut Sftp,
    snapshot_dir: &Path,
    profile_id: &str,
    session_id: &str,
    step_id: &str,
    target_files: &[String],
) -> AppResult<SnapshotManifest> {
    let mut entries = Vec::with_capacity(target_files.len());

    for (idx, target) in target_files.iter().enumerate() {
        let normalized = SftpService::normalize_path(target);
        SftpService::validate_path(&normalized)?;
        let snapshot_file = format!("file-{}.bin", idx + 1);
        let local_path = snapshot_dir.join(&snapshot_file);

        match sftp.lstat(Path::new(&normalized)) {
            Ok(stat) => {
                let is_symlink = stat
                    .perm
                    .map(|mode| (mode & S_IFMT) == S_IFLNK)
                    .unwrap_or(false);
                if is_symlink || stat.is_dir() {
                    return Err(AppError::invalid_argument(format!(
                        "snapshot 仅支持普通文件: {}",
                        normalized
                    )));
                }

                let mut remote = sftp.open(Path::new(&normalized)).map_err(AppError::from)?;
                let mut buf = Vec::new();
                remote
                    .read_to_end(&mut buf)
                    .map_err(|e| AppError::remote_io_error(format!("读取远程文件失败: {}", e)))?;
                fs::write(&local_path, &buf).map_err(|e| {
                    AppError::local_io_error(format!("写入本地 snapshot 失败: {}", e))
                })?;
                lock_down_local_path(&local_path)?;

                entries.push(SnapshotFileEntry {
                    target_path: normalized,
                    snapshot_file,
                    existed: true,
                    size: buf.len() as u64,
                    mode: stat.perm,
                });
            }
            Err(e) if e.code() == ssh2::ErrorCode::SFTP(2) => {
                entries.push(SnapshotFileEntry {
                    target_path: normalized,
                    snapshot_file,
                    existed: false,
                    size: 0,
                    mode: None,
                });
            }
            Err(e) => return Err(AppError::from(e)),
        }
    }

    Ok(SnapshotManifest {
        profile_id: profile_id.to_string(),
        session_id: session_id.to_string(),
        step_id: step_id.to_string(),
        created_at_millis: Utc::now().timestamp_millis(),
        entries,
    })
}

fn write_remote_bytes(
    sftp: &mut Sftp,
    target_path: &str,
    bytes: &[u8],
    mode: Option<u32>,
) -> AppResult<()> {
    let normalized = SftpService::normalize_path(target_path);
    SftpService::validate_path(&normalized)?;
    let path = Path::new(&normalized);

    let mut remote = sftp
        .create(path)
        .map_err(|e| AppError::remote_io_error(format!("创建远程文件失败: {}", e)))?;
    remote
        .write_all(bytes)
        .map_err(|e| AppError::remote_io_error(format!("写入远程文件失败: {}", e)))?;
    drop(remote);

    if let Some(mode) = mode {
        sftp.setstat(
            path,
            ssh2::FileStat {
                size: None,
                uid: None,
                gid: None,
                perm: Some(mode),
                atime: None,
                mtime: None,
            },
        )
        .map_err(AppError::from)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::error::ErrorCode;

    #[test]
    fn unified_diff_contains_expected_hunks() {
        let diff = unified_diff("line1\nline2\n", "line1\nlineX\n");
        assert!(diff.contains("--- before"));
        assert!(diff.contains("+++ after"));
        assert!(diff.contains("-line2"));
        assert!(diff.contains("+lineX"));
    }

    #[test]
    fn assess_snapshot_targets_rejects_low_disk() {
        let err = assess_snapshot_targets(&[("/etc/nginx/nginx.conf".to_string(), 1024)], 99)
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
    }

    #[test]
    fn assess_snapshot_targets_warns_on_large_file_and_rejects_huge_file() {
        let assessment = assess_snapshot_targets(
            &[(
                "/etc/nginx/nginx.conf".to_string(),
                SNAPSHOT_FILE_WARN_BYTES + 1,
            )],
            SNAPSHOT_DISK_REJECT_BYTES * 2,
        )
        .unwrap();
        assert_eq!(assessment.warnings.len(), 1);

        let err = assess_snapshot_targets(
            &[(
                "/etc/nginx/nginx.conf".to_string(),
                SNAPSHOT_FILE_REJECT_BYTES + 1,
            )],
            SNAPSHOT_DISK_REJECT_BYTES * 2,
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
    }

    #[cfg(unix)]
    #[test]
    fn cleanup_orphans_removes_expired_session_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join(SNAPSHOT_DIR_NAME);
        let expired = root.join("profile-a").join("session-old");
        let fresh = root.join("profile-a").join("session-new");
        fs::create_dir_all(&expired).unwrap();
        fs::create_dir_all(&fresh).unwrap();
        let old_time =
            SystemTime::now() - Duration::from_secs(SNAPSHOT_TTL_HOURS_DEFAULT * 3600 + 60);
        let expired_handle = fs::File::options().read(true).open(&expired).unwrap();
        expired_handle.set_modified(old_time).unwrap();

        let removed = cleanup_orphans_in(
            &root,
            SystemTime::now(),
            Duration::from_secs(SNAPSHOT_TTL_HOURS_DEFAULT * 3600),
        )
        .unwrap();

        assert_eq!(removed, 1);
        assert!(!expired.exists());
        assert!(fresh.exists());
    }

    #[test]
    fn cleanup_orphans_ignores_missing_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("missing");
        let removed =
            cleanup_orphans_in(&root, SystemTime::now(), Duration::from_secs(3600)).unwrap();
        assert_eq!(removed, 0);
    }

    #[test]
    fn snapshot_dir_for_accepts_safe_components() {
        let path = snapshot_dir_for("profile-1", "session_2", "step-3").unwrap();
        assert!(path.ends_with(Path::new("profile-1").join("session_2").join("step-3")));
    }

    #[test]
    fn snapshot_dir_for_rejects_path_traversal_components() {
        for bad in ["../escape", "nested/step", "/abs", "step..", ""] {
            let err = snapshot_dir_for("profile-1", "session-1", bad).unwrap_err();
            assert_eq!(err.code, ErrorCode::InvalidArgument);
            assert_eq!(err.retryable, Some(false));
        }
    }
}
