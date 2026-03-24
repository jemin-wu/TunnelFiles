use serde::{Deserialize, Serialize};

/// 终端字体大小边界
pub const TERMINAL_FONT_SIZE_MIN: u8 = 10;
pub const TERMINAL_FONT_SIZE_MAX: u8 = 24;
pub const TERMINAL_FONT_SIZE_DEFAULT: u8 = 14;
/// 终端 scrollback 边界
pub const TERMINAL_SCROLLBACK_MIN: u32 = 1000;
pub const TERMINAL_SCROLLBACK_MAX: u32 = 50000;
pub const TERMINAL_SCROLLBACK_DEFAULT: u32 = 5000;

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
    /// 终端字体大小 (10-24px)
    pub terminal_font_size: u8,
    /// 终端 scrollback 行数 (1000-50000)
    pub terminal_scrollback_lines: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_download_dir: None,
            max_concurrent_transfers: 3,
            connection_timeout_secs: 30,
            transfer_retry_count: 2,
            log_level: LogLevel::Info,
            terminal_font_size: TERMINAL_FONT_SIZE_DEFAULT,
            terminal_scrollback_lines: TERMINAL_SCROLLBACK_DEFAULT,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_font_size: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_scrollback_lines: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_default_terminal_fields() {
        let settings = Settings::default();
        assert_eq!(settings.terminal_font_size, 14);
        assert_eq!(settings.terminal_scrollback_lines, 5000);
    }

    #[test]
    fn test_settings_serialization_includes_terminal_fields() {
        let settings = Settings::default();
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("\"terminalFontSize\":14"));
        assert!(json.contains("\"terminalScrollbackLines\":5000"));
    }

    #[test]
    fn test_settings_patch_deserialize_terminal_fields() {
        let json = r#"{"terminalFontSize":16,"terminalScrollbackLines":10000}"#;
        let patch: SettingsPatch = serde_json::from_str(json).unwrap();
        assert_eq!(patch.terminal_font_size, Some(16));
        assert_eq!(patch.terminal_scrollback_lines, Some(10000));
    }
}
