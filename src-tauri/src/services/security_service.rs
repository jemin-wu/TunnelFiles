//! 安全服务
//!
//! 负责:
//! - 系统安全存储 (Keychain/Vault)
//! - HostKey 校验和 known_hosts 管理
//! - 凭据加密存储

use keyring::Entry;

use crate::models::error::{AppError, AppResult, ErrorCode};

/// 服务名称 - 用于系统钥匙串中标识应用
const SERVICE_NAME: &str = "com.tunnelfiles.app";

/// 凭据类型前缀
const PASSWORD_PREFIX: &str = "password";
const PASSPHRASE_PREFIX: &str = "passphrase";

// ============================================
// 凭据存储
// ============================================

/// 保存密码到系统安全存储
///
/// # Arguments
/// * `profile_id` - 连接配置 ID
/// * `password` - 密码明文
///
/// # Returns
/// * `Ok(String)` - 凭据引用 key（用于关联 Profile）
pub fn credential_store_password(profile_id: &str, password: &str) -> AppResult<String> {
    let key = format!("{}:{}", PASSWORD_PREFIX, profile_id);
    credential_store(&key, password)?;
    Ok(key)
}

/// 保存 passphrase 到系统安全存储
///
/// # Arguments
/// * `profile_id` - 连接配置 ID
/// * `passphrase` - 私钥密码明文
///
/// # Returns
/// * `Ok(String)` - 凭据引用 key
pub fn credential_store_passphrase(profile_id: &str, passphrase: &str) -> AppResult<String> {
    let key = format!("{}:{}", PASSPHRASE_PREFIX, profile_id);
    credential_store(&key, passphrase)?;
    Ok(key)
}

/// 获取密码
///
/// # Arguments
/// * `credential_ref` - 凭据引用 key（从 Profile.password_ref 获取）
///
/// # Returns
/// * `Ok(Some(String))` - 密码明文
/// * `Ok(None)` - 凭据不存在
/// * `Err` - 系统错误
pub fn credential_get(credential_ref: &str) -> AppResult<Option<String>> {
    let entry = Entry::new(SERVICE_NAME, credential_ref)?;

    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 删除凭据
///
/// # Arguments
/// * `credential_ref` - 凭据引用 key
///
/// # Returns
/// * `Ok(true)` - 删除成功
/// * `Ok(false)` - 凭据不存在
/// * `Err` - 系统错误
pub fn credential_delete(credential_ref: &str) -> AppResult<bool> {
    let entry = Entry::new(SERVICE_NAME, credential_ref)?;

    match entry.delete_password() {
        Ok(()) => {
            tracing::debug!(key = %credential_ref, "凭据已删除");
            Ok(true)
        }
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(AppError::from(e)),
    }
}

/// 删除 Profile 关联的所有凭据
///
/// # Arguments
/// * `profile_id` - 连接配置 ID
pub fn credential_delete_for_profile(profile_id: &str) -> AppResult<()> {
    let password_key = format!("{}:{}", PASSWORD_PREFIX, profile_id);
    let passphrase_key = format!("{}:{}", PASSPHRASE_PREFIX, profile_id);

    // 删除密码（忽略不存在的情况）
    let _ = credential_delete(&password_key);
    // 删除 passphrase（忽略不存在的情况）
    let _ = credential_delete(&passphrase_key);

    tracing::debug!(profile_id = %profile_id, "Profile 凭据已清理");

    Ok(())
}

// ============================================
// 内部函数
// ============================================

/// 存储凭据到系统安全存储
fn credential_store(key: &str, secret: &str) -> AppResult<()> {
    let entry = Entry::new(SERVICE_NAME, key)?;
    entry.set_password(secret)?;

    tracing::debug!(key = %key, "凭据已保存到系统安全存储");

    Ok(())
}

// ============================================
// HostKey 相关
// ============================================

/// HostKey 信息
#[derive(Debug, Clone)]
pub struct HostKeyInfo {
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub fingerprint: String,
}

impl HostKeyInfo {
    pub fn new(host: &str, port: u16, key_type: &str, fingerprint: &str) -> Self {
        Self {
            host: host.to_string(),
            port,
            key_type: key_type.to_string(),
            fingerprint: fingerprint.to_string(),
        }
    }
}

/// HostKey 校验结果
#[derive(Debug, Clone)]
pub enum HostKeyVerifyResult {
    /// 首次连接，需要用户确认
    FirstConnection(HostKeyInfo),
    /// HostKey 匹配，可以继续连接
    Matched,
    /// HostKey 不匹配，可能存在中间人攻击
    Mismatch { stored: String, received: String },
}

/// 校验 HostKey
///
/// # Arguments
/// * `db` - 数据库引用
/// * `host` - 主机地址
/// * `port` - 端口
/// * `key_type` - 密钥类型（如 ssh-ed25519, ssh-rsa）
/// * `fingerprint` - 密钥指纹（如 SHA256:xxx）
///
/// # Returns
/// * `HostKeyVerifyResult` - 校验结果
///
/// # 安全降级
/// 如果 known_hosts 数据库损坏或查询失败，会安全降级为"首次连接"行为，
/// 要求用户确认指纹，而不是直接阻止连接。
pub fn verify_hostkey(
    db: &crate::services::storage_service::Database,
    host: &str,
    port: u16,
    key_type: &str,
    fingerprint: &str,
) -> AppResult<HostKeyVerifyResult> {
    // 尝试从数据库获取已知主机信息，失败时安全降级
    let check_result = match db.known_host_check(host, port) {
        Ok(result) => result,
        Err(e) => {
            // 数据库查询失败，安全降级为首次连接行为
            tracing::warn!(
                host = %host,
                port = port,
                error = %e,
                "known_hosts 查询失败，安全降级为首次连接模式"
            );
            None
        }
    };

    match check_result {
        None => {
            // 首次连接
            Ok(HostKeyVerifyResult::FirstConnection(HostKeyInfo::new(
                host,
                port,
                key_type,
                fingerprint,
            )))
        }
        Some(stored_fingerprint) => {
            if stored_fingerprint == fingerprint {
                // 匹配
                Ok(HostKeyVerifyResult::Matched)
            } else {
                // 不匹配 - 可能存在安全风险
                tracing::warn!(
                    host = %host,
                    port = port,
                    stored = %stored_fingerprint,
                    received = %fingerprint,
                    "HostKey 不匹配，可能存在中间人攻击"
                );
                Ok(HostKeyVerifyResult::Mismatch {
                    stored: stored_fingerprint,
                    received: fingerprint.to_string(),
                })
            }
        }
    }
}

/// 信任 HostKey
///
/// 用户确认后调用此函数保存 HostKey
pub fn trust_hostkey(
    db: &crate::services::storage_service::Database,
    host: &str,
    port: u16,
    key_type: &str,
    fingerprint: &str,
) -> AppResult<()> {
    db.known_host_trust(host, port, key_type, fingerprint)?;
    Ok(())
}

/// 检查是否应该拒绝连接（HostKey 不匹配时）
pub fn should_reject_connection(result: &HostKeyVerifyResult) -> bool {
    matches!(result, HostKeyVerifyResult::Mismatch { .. })
}

/// 生成 HostKey 不匹配错误
pub fn hostkey_mismatch_error(stored: &str, received: &str) -> AppError {
    AppError::new(ErrorCode::HostkeyMismatch, "服务器主机密钥已更改")
        .with_detail(format!(
        "存储的指纹: {}\n接收的指纹: {}\n\n这可能表示服务器已重新配置，或存在中间人攻击的风险。",
        stored, received
    ))
        .with_retryable(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hostkey_info() {
        let info = HostKeyInfo::new("example.com", 22, "ssh-ed25519", "SHA256:abc123");
        assert_eq!(info.host, "example.com");
        assert_eq!(info.port, 22);
        assert_eq!(info.key_type, "ssh-ed25519");
        assert_eq!(info.fingerprint, "SHA256:abc123");
    }

    #[test]
    fn test_should_reject_connection() {
        let matched = HostKeyVerifyResult::Matched;
        assert!(!should_reject_connection(&matched));

        let first = HostKeyVerifyResult::FirstConnection(HostKeyInfo::new(
            "test.com",
            22,
            "ssh-ed25519",
            "SHA256:test",
        ));
        assert!(!should_reject_connection(&first));

        let mismatch = HostKeyVerifyResult::Mismatch {
            stored: "SHA256:old".to_string(),
            received: "SHA256:new".to_string(),
        };
        assert!(should_reject_connection(&mismatch));
    }

    // Note: 凭据存储测试需要在真实环境中运行，因为依赖系统钥匙串
    // 在 CI 环境中可能会失败
    #[test]
    #[ignore] // 忽略此测试，除非在本地手动运行
    fn test_credential_operations() {
        let profile_id = "test-profile-id";

        // 存储密码
        let password_ref = credential_store_password(profile_id, "test-password").unwrap();
        assert!(password_ref.contains(profile_id));

        // 获取密码
        let password = credential_get(&password_ref).unwrap();
        assert_eq!(password, Some("test-password".to_string()));

        // 删除密码
        let deleted = credential_delete(&password_ref).unwrap();
        assert!(deleted);

        // 确认已删除
        let password = credential_get(&password_ref).unwrap();
        assert!(password.is_none());
    }
}
