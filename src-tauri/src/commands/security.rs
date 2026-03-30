//! Security 相关命令
//!
//! - security_trust_hostkey: 信任服务器指纹
//! - security_remove_hostkey: 移除信任的指纹

use std::sync::Arc;
use tauri::State;
#[cfg(test)]
use ts_rs::TS;

use crate::models::error::AppResult;
use crate::services::security_service::trust_hostkey;
use crate::services::storage_service::Database;

/// 信任 HostKey 输入
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct TrustHostKeyInput {
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub fingerprint: String,
}

/// 信任服务器 HostKey
///
/// 用户在首次连接确认对话框中点击"信任"后调用此命令
#[tauri::command]
pub async fn security_trust_hostkey(
    db: State<'_, Arc<Database>>,
    input: TrustHostKeyInput,
) -> AppResult<()> {
    tracing::info!(
        host = %input.host,
        port = input.port,
        key_type = %input.key_type,
        "用户信任 HostKey"
    );

    trust_hostkey(
        &db,
        &input.host,
        input.port,
        &input.key_type,
        &input.fingerprint,
    )?;

    Ok(())
}

/// 移除信任的 HostKey
///
/// 允许用户手动移除已信任的服务器指纹
#[tauri::command]
pub async fn security_remove_hostkey(
    db: State<'_, Arc<Database>>,
    host: String,
    port: u16,
) -> AppResult<bool> {
    tracing::info!(host = %host, port = port, "移除 HostKey 信任");

    let removed = db.known_host_remove(&host, port)?;

    Ok(removed)
}

/// 检查 HostKey 是否已信任
#[tauri::command]
pub async fn security_check_hostkey(
    db: State<'_, Arc<Database>>,
    host: String,
    port: u16,
) -> AppResult<Option<String>> {
    let fingerprint = db.known_host_check(&host, port)?;
    Ok(fingerprint)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── TrustHostKeyInput deserialization ──

    #[test]
    fn trust_hostkey_input_deserializes_camel_case() {
        let json = r#"{
            "host": "example.com",
            "port": 22,
            "keyType": "ssh-ed25519",
            "fingerprint": "SHA256:abc123"
        }"#;
        let input: TrustHostKeyInput = serde_json::from_str(json).unwrap();

        assert_eq!(input.host, "example.com");
        assert_eq!(input.port, 22);
        assert_eq!(input.key_type, "ssh-ed25519");
        assert_eq!(input.fingerprint, "SHA256:abc123");
    }

    #[test]
    fn trust_hostkey_input_rejects_snake_case() {
        let json = r#"{
            "host": "example.com",
            "port": 22,
            "key_type": "ssh-ed25519",
            "fingerprint": "SHA256:abc123"
        }"#;
        let result = serde_json::from_str::<TrustHostKeyInput>(json);
        assert!(result.is_err(), "snake_case key_type should be rejected");
    }

    #[test]
    fn trust_hostkey_input_non_standard_port() {
        let json = r#"{
            "host": "192.168.1.100",
            "port": 2222,
            "keyType": "ssh-rsa",
            "fingerprint": "SHA256:xyz789"
        }"#;
        let input: TrustHostKeyInput = serde_json::from_str(json).unwrap();

        assert_eq!(input.host, "192.168.1.100");
        assert_eq!(input.port, 2222);
        assert_eq!(input.key_type, "ssh-rsa");
    }

    #[test]
    fn trust_hostkey_input_rejects_missing_required_field() {
        // Missing fingerprint
        let json = r#"{
            "host": "example.com",
            "port": 22,
            "keyType": "ssh-ed25519"
        }"#;
        let result = serde_json::from_str::<TrustHostKeyInput>(json);
        assert!(result.is_err());
    }
}
