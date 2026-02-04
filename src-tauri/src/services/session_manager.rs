//! 会话管理器
//!
//! 负责:
//! - SSH Session 的创建、维护、回收
//! - Session 池管理
//! - 连接状态跟踪
//! - 认证流程（密码/Key）

use std::collections::HashMap;
use std::io::Read;
use std::net::TcpStream;
use std::path::Path;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use sha2::{Digest, Sha256};
use ssh2::{Session, Sftp};
use zeroize::Zeroize;

use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::profile::{AuthType, Profile};
use crate::services::security_service::{credential_get, verify_hostkey, HostKeyVerifyResult};
use crate::services::storage_service::Database;

/// 缓存的认证凭据（用于 Terminal 等需要独立 session 的场景）
///
/// 这避免了多次访问系统钥匙串，用户无需在没有点"始终允许"时输入多次密码。
/// 凭据在 session 关闭时通过 Drop trait 自动清零。
pub struct CachedCredentials {
    /// 密码（密码认证）
    password: Option<String>,
    /// Passphrase（Key 认证）
    passphrase: Option<String>,
}

impl Drop for CachedCredentials {
    fn drop(&mut self) {
        // 安全清零凭据
        if let Some(ref mut pwd) = self.password {
            pwd.zeroize();
        }
        if let Some(ref mut pp) = self.passphrase {
            pp.zeroize();
        }
    }
}

/// 托管的 SSH 会话
pub struct ManagedSession {
    /// 会话 ID
    pub session_id: String,
    /// SSH Session
    pub session: Session,
    /// SFTP Channel
    pub sftp: Sftp,
    /// 关联的 Profile ID
    pub profile_id: String,
    /// 服务器指纹
    pub fingerprint: String,
    /// 远程 home 目录
    pub home_path: String,
    /// 创建时间
    pub created_at: Instant,
    /// 最后活动时间
    pub last_activity: RwLock<Instant>,
    /// 缓存的认证凭据（用于创建 Terminal 等独立 session）
    cached_credentials: RwLock<CachedCredentials>,
}

impl ManagedSession {
    /// 更新最后活动时间
    pub fn touch(&self) {
        if let Ok(mut last) = self.last_activity.write() {
            *last = Instant::now();
        }
    }

    /// 获取空闲时长（秒）
    pub fn idle_secs(&self) -> u64 {
        self.last_activity
            .read()
            .map(|t| t.elapsed().as_secs())
            .unwrap_or(0)
    }

    /// 获取缓存的密码（如果存在）
    pub fn get_cached_password(&self) -> Option<String> {
        self.cached_credentials
            .read()
            .ok()
            .and_then(|creds| creds.password.clone())
    }

    /// 获取缓存的 passphrase（如果存在）
    pub fn get_cached_passphrase(&self) -> Option<String> {
        self.cached_credentials
            .read()
            .ok()
            .and_then(|creds| creds.passphrase.clone())
    }
}

/// 连接结果
pub struct ConnectResult {
    /// 会话 ID
    pub session_id: String,
    /// 远程 home 目录
    pub home_path: String,
    /// 服务器指纹
    pub fingerprint: String,
}

/// HostKey 需要确认的信息
pub struct HostKeyPending {
    /// Profile ID
    pub profile_id: String,
    /// 主机
    pub host: String,
    /// 端口
    pub port: u16,
    /// 指纹
    pub fingerprint: String,
    /// 密钥类型
    pub key_type: String,
}

/// 连接状态
pub enum ConnectStatus {
    /// 连接成功
    Connected(ConnectResult),
    /// 需要确认 HostKey
    NeedHostKeyConfirm(HostKeyPending),
}

/// 认证失败记录
struct AuthFailureRecord {
    count: u32,
    last_failure: Instant,
}

/// 默认认证失败锁定阈值
const AUTH_FAILURE_THRESHOLD: u32 = 5;
/// 认证失败锁定时间（秒）
const AUTH_LOCKOUT_SECS: u64 = 300;

/// 会话管理器
pub struct SessionManager {
    /// 会话池
    sessions: RwLock<HashMap<String, Arc<ManagedSession>>>,
    /// 认证失败计数 (key: profile_id)
    auth_failures: RwLock<HashMap<String, AuthFailureRecord>>,
}

impl SessionManager {
    /// 创建新的会话管理器
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            auth_failures: RwLock::new(HashMap::new()),
        }
    }

    /// 建立 SSH 连接
    ///
    /// # Arguments
    /// * `db` - 数据库引用（用于 known_hosts 查询）
    /// * `profile` - 连接配置
    /// * `password` - 可选的临时密码（未记住时由前端传入）
    /// * `passphrase` - 可选的临时 passphrase
    /// * `timeout_secs` - 连接超时秒数
    pub fn connect(
        &self,
        db: &Database,
        profile: &Profile,
        password: Option<&str>,
        passphrase: Option<&str>,
        timeout_secs: u64,
    ) -> AppResult<ConnectStatus> {
        let timeout = Duration::from_secs(timeout_secs);

        // 1. 建立 SSH 连接
        let session = self.establish_ssh_session(&profile.host, profile.port, timeout)?;

        // 2. 获取并验证 HostKey
        let (key_type, fingerprint) = self.get_host_key_info(&session)?;
        tracing::debug!(
            host = %profile.host,
            port = profile.port,
            key_type = %key_type,
            fingerprint = %fingerprint,
            "获取到服务器指纹"
        );

        let verify_result =
            verify_hostkey(db, &profile.host, profile.port, &key_type, &fingerprint)?;

        match verify_result {
            HostKeyVerifyResult::FirstConnection(_) => {
                tracing::info!(
                    host = %profile.host,
                    port = profile.port,
                    "首次连接，需要用户确认指纹"
                );
                return Ok(ConnectStatus::NeedHostKeyConfirm(HostKeyPending {
                    profile_id: profile.id.clone(),
                    host: profile.host.clone(),
                    port: profile.port,
                    fingerprint,
                    key_type,
                }));
            }
            HostKeyVerifyResult::Mismatch { stored, received } => {
                return Err(AppError::new(ErrorCode::HostkeyMismatch, "服务器主机密钥已更改")
                    .with_detail(format!(
                        "存储的指纹: {}\n接收的指纹: {}\n\n这可能表示服务器已重新配置，或存在中间人攻击的风险。",
                        stored, received
                    ))
                    .with_retryable(false));
            }
            HostKeyVerifyResult::Matched => {
                tracing::debug!("HostKey 验证通过");
            }
        }

        // 3. 认证（并获取缓存的凭据）
        let cached_credentials = self.authenticate(&session, profile, password, passphrase)?;

        // 4. 完成连接并存储会话（包含缓存的凭据）
        let result = self.finalize_connection(session, &profile.id, fingerprint, cached_credentials)?;

        tracing::info!(
            session_id = %result.session_id,
            profile_id = %profile.id,
            host = %profile.host,
            "SSH 会话已建立"
        );

        Ok(ConnectStatus::Connected(result))
    }

    /// 在 HostKey 确认后继续连接
    pub fn connect_after_trust(
        &self,
        profile: &Profile,
        password: Option<&str>,
        passphrase: Option<&str>,
        timeout_secs: u64,
    ) -> AppResult<ConnectResult> {
        let timeout = Duration::from_secs(timeout_secs);

        // 1. 建立 SSH 连接
        let session = self.establish_ssh_session(&profile.host, profile.port, timeout)?;

        // 2. 获取指纹（已信任，不再验证）
        let (_, fingerprint) = self.get_host_key_info(&session)?;

        // 3. 认证（并获取缓存的凭据）
        let cached_credentials = self.authenticate(&session, profile, password, passphrase)?;

        // 4. 完成连接并存储会话（包含缓存的凭据）
        let result = self.finalize_connection(session, &profile.id, fingerprint, cached_credentials)?;

        tracing::info!(
            session_id = %result.session_id,
            profile_id = %profile.id,
            host = %profile.host,
            "SSH 会话已建立（HostKey 已确认）"
        );

        Ok(result)
    }

    /// 获取会话（同时更新最后活动时间）
    pub fn get_session(&self, session_id: &str) -> AppResult<Arc<ManagedSession>> {
        let sessions = self
            .sessions
            .read()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "会话池锁获取失败"))?;

        let session = sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| AppError::not_found(format!("会话 {} 不存在", session_id)))?;

        // 更新最后活动时间
        session.touch();

        Ok(session)
    }

    /// 关闭会话
    pub fn close_session(&self, session_id: &str) -> AppResult<()> {
        let mut sessions = self
            .sessions
            .write()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "会话池锁获取失败"))?;

        if let Some(session) = sessions.remove(session_id) {
            // SSH Session 会在 drop 时自动关闭
            tracing::info!(
                session_id = %session_id,
                profile_id = %session.profile_id,
                "会话已关闭"
            );
        }

        Ok(())
    }

    /// 获取所有会话 ID
    pub fn list_sessions(&self) -> AppResult<Vec<String>> {
        let sessions = self
            .sessions
            .read()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "会话池锁获取失败"))?;

        Ok(sessions.keys().cloned().collect())
    }

    /// 为 Terminal 创建独立的 SSH session（阻塞模式，调用方负责后续设置非阻塞）
    ///
    /// 使用主 session 中缓存的凭据进行认证，避免再次访问系统钥匙串。
    pub fn create_terminal_session(
        &self,
        db: &crate::services::storage_service::Database,
        session_id: &str,
    ) -> AppResult<Session> {
        // 获取原始会话信息
        let managed_session = self.get_session(session_id)?;
        let profile_id = &managed_session.profile_id;

        // 从缓存获取凭据（避免再次访问钥匙串）
        let cached_password = managed_session.get_cached_password();
        let cached_passphrase = managed_session.get_cached_passphrase();

        tracing::debug!(
            session_id = %session_id,
            has_cached_password = cached_password.is_some(),
            has_cached_passphrase = cached_passphrase.is_some(),
            "使用缓存的凭据创建 Terminal session"
        );

        // 从数据库获取 profile
        let profile = db
            .profile_get(profile_id)?
            .ok_or_else(|| AppError::not_found(format!("Profile {} 不存在", profile_id)))?;

        // 建立新的 SSH 连接（默认 30 秒超时）
        let timeout = Duration::from_secs(30);
        let session = self.establish_ssh_session(&profile.host, profile.port, timeout)?;

        // 使用缓存的凭据进行认证
        match profile.auth_type {
            AuthType::Password => {
                self.auth_password(
                    &session,
                    &profile.username,
                    &profile,
                    cached_password.as_deref(),
                )?;
            }
            AuthType::Key => {
                self.auth_key(
                    &session,
                    &profile.username,
                    &profile,
                    cached_passphrase.as_deref(),
                )?;
            }
        }

        tracing::info!(
            session_id = %session_id,
            profile_id = %profile_id,
            "Terminal 专用 session 已创建（使用缓存凭据）"
        );

        Ok(session)
    }

    /// 检查会话是否活跃
    pub fn is_session_alive(&self, session_id: &str) -> bool {
        if let Ok(session) = self.get_session(session_id) {
            // 尝试执行简单命令检测连接
            session.sftp.readdir(Path::new(".")).is_ok()
        } else {
            false
        }
    }

    /// 清理超时的空闲会话
    ///
    /// # Arguments
    /// * `idle_timeout_secs` - 空闲超时秒数（默认 1800 = 30 分钟）
    ///
    /// # Returns
    /// 清理的会话数量
    pub fn cleanup_stale_sessions(&self, idle_timeout_secs: u64) -> usize {
        let stale_ids: Vec<String> = {
            let sessions = match self.sessions.read() {
                Ok(s) => s,
                Err(_) => return 0,
            };

            sessions
                .iter()
                .filter(|(_, s)| s.idle_secs() > idle_timeout_secs)
                .map(|(id, _)| id.clone())
                .collect()
        };

        if stale_ids.is_empty() {
            return 0;
        }

        let mut cleaned = 0;
        for id in &stale_ids {
            if self.close_session(id).is_ok() {
                tracing::info!(session_id = %id, idle_timeout_secs, "会话因空闲超时已清理");
                cleaned += 1;
            }
        }

        cleaned
    }

    // ============================================
    // 内部方法
    // ============================================

    /// 建立 TCP 连接并完成 SSH 握手
    fn establish_ssh_session(
        &self,
        host: &str,
        port: u16,
        timeout: Duration,
    ) -> AppResult<Session> {
        let addr = format!("{}:{}", host, port);
        tracing::debug!(addr = %addr, "正在建立 TCP 连接");

        let tcp = TcpStream::connect_timeout(
            &addr.parse().map_err(|e| {
                AppError::new(ErrorCode::InvalidArgument, format!("无效的地址: {}", e))
            })?,
            timeout,
        )
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::TimedOut => AppError::timeout("连接超时"),
            std::io::ErrorKind::ConnectionRefused => {
                AppError::network_lost("连接被拒绝，请检查主机和端口")
            }
            _ => AppError::network_lost(format!("无法连接到服务器: {}", e)),
        })?;

        tcp.set_read_timeout(Some(timeout))?;
        tcp.set_write_timeout(Some(timeout))?;
        tcp.set_nodelay(true)?; // 禁用 Nagle 算法，减少终端输入延迟

        tracing::debug!("正在进行 SSH 握手");
        let mut session = Session::new()
            .map_err(|e| AppError::new(ErrorCode::Unknown, format!("无法创建 SSH 会话: {}", e)))?;

        session.set_tcp_stream(tcp);
        session
            .handshake()
            .map_err(|e| AppError::network_lost(format!("SSH 握手失败: {}", e)))?;

        // 设置 SSH keepalive（每 60 秒发送一次，保持连接活跃）
        session.set_keepalive(true, 60);
        tracing::debug!("SSH keepalive 已启用，间隔 60 秒");

        Ok(session)
    }

    /// 完成连接后续步骤并存储会话
    fn finalize_connection(
        &self,
        session: Session,
        profile_id: &str,
        fingerprint: String,
        cached_credentials: CachedCredentials,
    ) -> AppResult<ConnectResult> {
        tracing::debug!("正在创建 SFTP 通道");
        let sftp = session.sftp().map_err(|e| {
            AppError::new(
                ErrorCode::RemoteIoError,
                format!("无法创建 SFTP 通道: {}", e),
            )
        })?;

        let home_path = self.get_home_path(&session)?;
        let session_id = uuid::Uuid::new_v4().to_string();

        let now = Instant::now();
        let managed_session = Arc::new(ManagedSession {
            session_id: session_id.clone(),
            session,
            sftp,
            profile_id: profile_id.to_string(),
            fingerprint: fingerprint.clone(),
            home_path: home_path.clone(),
            created_at: now,
            last_activity: RwLock::new(now),
            cached_credentials: RwLock::new(cached_credentials),
        });

        {
            let mut sessions = self
                .sessions
                .write()
                .map_err(|_| AppError::new(ErrorCode::Unknown, "会话池锁获取失败"))?;
            sessions.insert(session_id.clone(), managed_session);
        }

        Ok(ConnectResult {
            session_id,
            home_path,
            fingerprint,
        })
    }

    /// 获取 HostKey 信息
    fn get_host_key_info(&self, session: &Session) -> AppResult<(String, String)> {
        let (key, key_type) = session
            .host_key()
            .ok_or_else(|| AppError::new(ErrorCode::Unknown, "无法获取服务器主机密钥"))?;

        let key_type_str = match key_type {
            ssh2::HostKeyType::Rsa => "ssh-rsa",
            ssh2::HostKeyType::Dss => "ssh-dss",
            ssh2::HostKeyType::Ecdsa256 => "ecdsa-sha2-nistp256",
            ssh2::HostKeyType::Ecdsa384 => "ecdsa-sha2-nistp384",
            ssh2::HostKeyType::Ecdsa521 => "ecdsa-sha2-nistp521",
            ssh2::HostKeyType::Ed25519 => "ssh-ed25519",
            ssh2::HostKeyType::Unknown => "unknown",
        };

        // 计算 SHA256 指纹
        let mut hasher = Sha256::new();
        hasher.update(key);
        let hash = hasher.finalize();
        let fingerprint = format!("SHA256:{}", BASE64.encode(hash));

        Ok((key_type_str.to_string(), fingerprint))
    }

    /// 执行认证并返回缓存的凭据
    ///
    /// 返回 CachedCredentials 用于后续创建独立 session（如 Terminal），
    /// 避免多次访问系统钥匙串。
    fn authenticate(
        &self,
        session: &Session,
        profile: &Profile,
        password: Option<&str>,
        passphrase: Option<&str>,
    ) -> AppResult<CachedCredentials> {
        // 检查是否被锁定
        self.check_auth_lockout(&profile.id)?;

        let result = match profile.auth_type {
            AuthType::Password => {
                let pwd = self.auth_password(session, &profile.username, profile, password)?;
                Ok(CachedCredentials {
                    password: Some(pwd),
                    passphrase: None,
                })
            }
            AuthType::Key => {
                let pp = self.auth_key(session, &profile.username, profile, passphrase)?;
                Ok(CachedCredentials {
                    password: None,
                    passphrase: pp,
                })
            }
        };

        // 记录认证结果
        if result.is_err() {
            self.record_auth_failure(&profile.id);
        } else {
            self.clear_auth_failures(&profile.id);
        }

        result
    }

    /// 检查是否被锁定
    fn check_auth_lockout(&self, profile_id: &str) -> AppResult<()> {
        let failures = self
            .auth_failures
            .read()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "认证锁获取失败"))?;

        if let Some(record) = failures.get(profile_id) {
            if record.count >= AUTH_FAILURE_THRESHOLD {
                let elapsed = record.last_failure.elapsed().as_secs();
                if elapsed < AUTH_LOCKOUT_SECS {
                    let remaining = AUTH_LOCKOUT_SECS - elapsed;
                    return Err(AppError::new(
                        ErrorCode::AuthFailed,
                        format!("认证失败次数过多，请等待 {} 秒后重试", remaining),
                    )
                    .with_retryable(false));
                }
            }
        }

        Ok(())
    }

    /// 记录认证失败
    fn record_auth_failure(&self, profile_id: &str) {
        if let Ok(mut failures) = self.auth_failures.write() {
            let record = failures
                .entry(profile_id.to_string())
                .or_insert(AuthFailureRecord {
                    count: 0,
                    last_failure: Instant::now(),
                });
            record.count += 1;
            record.last_failure = Instant::now();

            tracing::warn!(
                profile_id = %profile_id,
                failure_count = record.count,
                "认证失败，计数增加"
            );
        }
    }

    /// 清除认证失败记录
    fn clear_auth_failures(&self, profile_id: &str) {
        if let Ok(mut failures) = self.auth_failures.write() {
            failures.remove(profile_id);
        }
    }

    /// 密码认证
    ///
    /// 返回使用的密码，用于缓存以便后续创建独立 session
    fn auth_password(
        &self,
        session: &Session,
        username: &str,
        profile: &Profile,
        temp_password: Option<&str>,
    ) -> AppResult<String> {
        tracing::debug!(username = %username, "正在进行密码认证");

        // 优先使用临时密码，否则从 Keychain 获取
        let password = if let Some(pwd) = temp_password {
            pwd.to_string()
        } else if let Some(ref pwd_ref) = profile.password_ref {
            credential_get(pwd_ref)?
                .ok_or_else(|| AppError::auth_failed("密码未保存，请重新输入"))?
        } else {
            return Err(AppError::auth_failed("需要提供密码"));
        };

        let result = session.userauth_password(username, &password);

        result.map_err(|e| {
            tracing::warn!(error = %e, "密码认证失败");
            AppError::auth_failed("密码认证失败，请检查用户名和密码")
        })?;

        if !session.authenticated() {
            return Err(AppError::auth_failed("认证失败"));
        }

        tracing::info!(username = %username, "密码认证成功");
        Ok(password)
    }

    /// SSH Key 认证
    ///
    /// 返回使用的 passphrase（如果有），用于缓存以便后续创建独立 session
    fn auth_key(
        &self,
        session: &Session,
        username: &str,
        profile: &Profile,
        temp_passphrase: Option<&str>,
    ) -> AppResult<Option<String>> {
        tracing::debug!(username = %username, "正在进行 Key 认证");

        let key_path = profile
            .private_key_path
            .as_ref()
            .ok_or_else(|| AppError::auth_failed("未配置私钥路径"))?;

        let key_path = Path::new(key_path);
        if !key_path.exists() {
            return Err(AppError::not_found(format!(
                "私钥文件不存在: {}",
                key_path.display()
            )));
        }

        // 检查私钥文件权限（仅 Unix 系统）
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = std::fs::metadata(key_path) {
                let mode = metadata.permissions().mode();
                // 检查是否有 group/other 可读权限
                if mode & 0o077 != 0 {
                    tracing::warn!(
                        key_path = %key_path.display(),
                        mode = format!("{:o}", mode),
                        "私钥文件权限过宽，建议设置为 600 或 400"
                    );
                }
            }
        }

        // 获取 passphrase（如果需要）
        let passphrase = if let Some(pp) = temp_passphrase {
            Some(pp.to_string())
        } else if let Some(ref pp_ref) = profile.passphrase_ref {
            credential_get(pp_ref)?
        } else {
            None
        };

        let has_passphrase = passphrase.is_some();
        let result = session.userauth_pubkey_file(username, None, key_path, passphrase.as_deref());

        result.map_err(|e| {
            tracing::warn!(error = %e, "Key 认证失败");
            let msg = if has_passphrase {
                "Key 认证失败，请检查私钥文件和密码"
            } else {
                "Key 认证失败，请检查私钥文件（可能需要 passphrase）"
            };
            AppError::auth_failed(msg)
        })?;

        if !session.authenticated() {
            return Err(AppError::auth_failed("认证失败"));
        }

        tracing::info!(username = %username, "Key 认证成功");
        Ok(passphrase)
    }

    /// 获取远程 home 目录
    fn get_home_path(&self, session: &Session) -> AppResult<String> {
        // 执行 echo $HOME 获取 home 目录
        let mut channel = session
            .channel_session()
            .map_err(|e| AppError::new(ErrorCode::RemoteIoError, format!("无法创建通道: {}", e)))?;

        channel
            .exec("echo $HOME")
            .map_err(|e| AppError::new(ErrorCode::RemoteIoError, format!("无法执行命令: {}", e)))?;

        let mut output = String::new();
        channel
            .read_to_string(&mut output)
            .map_err(|e| AppError::new(ErrorCode::RemoteIoError, format!("无法读取输出: {}", e)))?;

        channel.wait_close().ok();

        let home = output.trim();
        Ok(if home.is_empty() { "/" } else { home }.to_string())
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

// SAFETY: SessionManager 手动实现 Send 和 Sync
//
// 背景:
// - `ssh2::Session` 和 `ssh2::Sftp` 类型是 `!Send` 和 `!Sync`，因为底层的
//   libssh2 C 库不是线程安全的。这导致包含它们的 `ManagedSession` 也是 `!Send + !Sync`。
// - 然而，`SessionManager` 需要作为 Tauri State 跨线程共享，因此需要 `Send + Sync`。
//
// 为什么这是安全的:
//
// 1. 数据结构安全性:
//    - `SessionManager` 只包含 `RwLock<HashMap<String, Arc<ManagedSession>>>`
//    - `RwLock` 和 `HashMap` 本身是 `Send + Sync`（当内容类型满足条件时）
//    - 问题仅来自 `ManagedSession` 内部的 `Session` 和 `Sftp`
//
// 2. 访问模式安全性:
//    - SessionManager 的公共 API 只返回 `Arc<ManagedSession>` 的克隆引用
//    - 调用者获取到 Arc 后，必须在 `tokio::task::spawn_blocking` 中执行所有
//      SSH/SFTP 操作，确保这些操作在单个专用线程上顺序执行
//    - 参见: src/commands/session.rs 和 src/services/transfer_manager.rs
//
// 3. 内部字段安全性:
//    - `ManagedSession::last_activity` 和 `cached_credentials` 使用 `RwLock` 保护
//    - 其他字段（`session_id`, `profile_id` 等）是不可变的 `String`/`Instant`
//    - `Session` 和 `Sftp` 字段虽然是 `!Send`，但只在 `spawn_blocking` 闭包中使用
//
// 不变量 (Invariants):
// - 所有对 `session.sftp` 或 `session.session` 的方法调用必须在 `spawn_blocking` 中
// - 永远不要在异步上下文中直接调用 ssh2 的同步方法
// - 修改此模块时必须维护这些不变量
//
// 违反安全性的情况（请勿这样做）:
// ```ignore
// // 错误: 在 async 函数中直接调用 sftp 方法
// async fn bad_example(session: Arc<ManagedSession>) {
//     session.sftp.stat(path); // 这会阻塞 tokio 运行时且不是线程安全的
// }
//
// // 正确: 使用 spawn_blocking
// async fn good_example(session: Arc<ManagedSession>) {
//     tokio::task::spawn_blocking(move || {
//         session.sftp.stat(path) // 在专用线程中安全执行
//     }).await
// }
// ```
unsafe impl Send for SessionManager {}
unsafe impl Sync for SessionManager {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_manager_creation() {
        let manager = SessionManager::new();
        let sessions = manager.list_sessions().unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn test_get_nonexistent_session() {
        let manager = SessionManager::new();
        let result = manager.get_session("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_close_nonexistent_session() {
        let manager = SessionManager::new();
        // 关闭不存在的会话应该静默成功
        let result = manager.close_session("nonexistent");
        assert!(result.is_ok());
    }
}
