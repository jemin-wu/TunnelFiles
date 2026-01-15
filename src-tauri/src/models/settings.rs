use serde::{Deserialize, Serialize};

/// 日志级别
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    #[default]
    Info,
    Debug,
}

impl LogLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Error => "error",
            LogLevel::Warn => "warn",
            LogLevel::Info => "info",
            LogLevel::Debug => "debug",
        }
    }

    pub fn to_tracing_level(&self) -> tracing::Level {
        match self {
            LogLevel::Error => tracing::Level::ERROR,
            LogLevel::Warn => tracing::Level::WARN,
            LogLevel::Info => tracing::Level::INFO,
            LogLevel::Debug => tracing::Level::DEBUG,
        }
    }
}

/// 应用设置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// 默认下载目录
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_download_dir: Option<String>,
    /// 最大并发传输数 (1-6)
    pub max_concurrent_transfers: u8,
    /// 连接超时时间 (秒)
    pub connection_timeout_secs: u64,
    /// 传输失败重试次数
    pub transfer_retry_count: u8,
    /// 日志级别
    pub log_level: LogLevel,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_download_dir: None,
            max_concurrent_transfers: 3,
            connection_timeout_secs: 30,
            transfer_retry_count: 2,
            log_level: LogLevel::Info,
        }
    }
}

/// 设置更新补丁
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_download_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_concurrent_transfers: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_timeout_secs: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transfer_retry_count: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_level: Option<LogLevel>,
}
