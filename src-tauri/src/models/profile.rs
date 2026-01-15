use serde::{Deserialize, Serialize};

/// 认证方式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthType {
    Password,
    Key,
}

/// 连接配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: AuthType,
    /// 密码引用 (指向系统安全存储的 key)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password_ref: Option<String>,
    /// 私钥路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key_path: Option<String>,
    /// passphrase 引用
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passphrase_ref: Option<String>,
    /// 初始远程路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_path: Option<String>,
    /// 创建时间 (Unix 时间戳毫秒)
    pub created_at: i64,
    /// 更新时间 (Unix 时间戳毫秒)
    pub updated_at: i64,
}

/// 创建/更新连接配置的输入
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: AuthType,
    /// 密码 (仅用于输入，不会存储在 Profile 中)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    /// 是否记住密码
    #[serde(default)]
    pub remember_password: bool,
    /// 私钥路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key_path: Option<String>,
    /// passphrase (仅用于输入)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>,
    /// 是否记住 passphrase
    #[serde(default)]
    pub remember_passphrase: bool,
    /// 初始远程路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_path: Option<String>,
}

impl ProfileInput {
    /// 验证输入参数
    pub fn validate(&self) -> Result<(), String> {
        // 名称不能为空
        if self.name.trim().is_empty() {
            return Err("连接名称不能为空".to_string());
        }

        // Host 不能为空
        if self.host.trim().is_empty() {
            return Err("主机地址不能为空".to_string());
        }

        // Host 格式校验：不能包含空格或非法字符
        if self.host.contains(' ') || self.host.contains('\t') {
            return Err("主机地址不能包含空格".to_string());
        }

        // Port 范围校验 (1-65535)
        if self.port == 0 {
            return Err("端口号不能为 0".to_string());
        }

        // Username 不能为空
        if self.username.trim().is_empty() {
            return Err("用户名不能为空".to_string());
        }

        // Key 认证时必须提供私钥路径
        if self.auth_type == AuthType::Key && self.private_key_path.is_none() {
            return Err("Key 认证方式需要提供私钥路径".to_string());
        }

        Ok(())
    }
}

/// 最近连接记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentConnection {
    pub id: String,
    pub profile_id: String,
    pub profile_name: String,
    pub host: String,
    pub username: String,
    pub connected_at: i64,
}
