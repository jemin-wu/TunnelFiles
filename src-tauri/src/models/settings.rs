use serde::{Deserialize, Serialize};
#[cfg(test)]
use ts_rs::TS;

/// 终端字体大小边界
pub const TERMINAL_FONT_SIZE_MIN: u8 = 10;
pub const TERMINAL_FONT_SIZE_MAX: u8 = 24;
pub const TERMINAL_FONT_SIZE_DEFAULT: u8 = 14;
/// 终端 scrollback 边界
pub const TERMINAL_SCROLLBACK_MIN: u32 = 1000;
pub const TERMINAL_SCROLLBACK_MAX: u32 = 50000;
pub const TERMINAL_SCROLLBACK_DEFAULT: u32 = 5000;

/// AI 并发 probe 边界（SPEC §7 "probe session 连接数上限"）
pub const AI_MAX_CONCURRENT_PROBES_MIN: u8 = 1;
pub const AI_MAX_CONCURRENT_PROBES_MAX: u8 = 10;
pub const AI_MAX_CONCURRENT_PROBES_DEFAULT: u8 = 3;

/// AI 输出 token hard cap（SPEC §5 "Output token hard cap 4096"）
pub const AI_OUTPUT_TOKEN_CAP_MIN: u32 = 256;
pub const AI_OUTPUT_TOKEN_CAP_MAX: u32 = 4096;
pub const AI_OUTPUT_TOKEN_CAP_DEFAULT: u32 = 4096;

/// AI 默认模型名（GGUF 文件名，见 `docs/approved-model-sources.md`）
pub const AI_MODEL_NAME_DEFAULT: &str = "gemma-4-E4B-it-Q4_K_M";

/// 日志级别
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
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
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
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
    /// 终端跟随文件浏览器目录
    pub terminal_follow_directory: bool,
    /// AI Shell Copilot 启用开关（默认 false，off-by-default）
    pub ai_enabled: bool,
    /// AI 模型名（GGUF 文件名 stem，默认 "gemma-4-E4B-it-Q4_K_M"；与
    /// `docs/approved-model-sources.md` 中 pin 的文件对齐）
    pub ai_model_name: String,
    /// AI 并发独立只读 probe session 上限（1-10，默认 3）
    pub max_concurrent_ai_probes: u8,
    /// AI 单次生成输出 token 上限（256-4096，DoS 防线）
    pub ai_output_token_cap: u32,
    /// Gemma Terms of Use 接受时间戳（Unix millis UTC）。未接受即 None；
    /// `ai_model_download` 未接受前返回 `AiUnavailable { detail: "license not accepted" }`。
    /// SPEC §7 要求：accept 后该字段只能被用户显式重置设置清空。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_license_accepted_at: Option<i64>,
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
            terminal_follow_directory: true,
            ai_enabled: false,
            ai_model_name: AI_MODEL_NAME_DEFAULT.to_string(),
            max_concurrent_ai_probes: AI_MAX_CONCURRENT_PROBES_DEFAULT,
            ai_output_token_cap: AI_OUTPUT_TOKEN_CAP_DEFAULT,
            ai_license_accepted_at: None,
        }
    }
}

/// 设置更新补丁
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_follow_directory: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_model_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_concurrent_ai_probes: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_output_token_cap: Option<u32>,
    /// License accept 时间戳。设置 `Some(ts)` 写入；设置 `Some(0)` 或
    /// `settings_reset` 清空。patch 里缺省（None）= 不变动。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_license_accepted_at: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_default_terminal_fields() {
        let settings = Settings::default();
        assert_eq!(settings.terminal_font_size, 14);
        assert_eq!(settings.terminal_scrollback_lines, 5000);
        assert!(settings.terminal_follow_directory);
    }

    #[test]
    fn test_settings_serialization_includes_terminal_fields() {
        let settings = Settings::default();
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("\"terminalFontSize\":14"));
        assert!(json.contains("\"terminalScrollbackLines\":5000"));
        assert!(json.contains("\"terminalFollowDirectory\":true"));
    }

    #[test]
    fn test_settings_patch_deserialize_terminal_fields() {
        let json = r#"{"terminalFontSize":16,"terminalScrollbackLines":10000,"terminalFollowDirectory":false}"#;
        let patch: SettingsPatch = serde_json::from_str(json).unwrap();
        assert_eq!(patch.terminal_font_size, Some(16));
        assert_eq!(patch.terminal_scrollback_lines, Some(10000));
        assert_eq!(patch.terminal_follow_directory, Some(false));
    }

    #[test]
    fn test_settings_default_ai_fields_off_by_default() {
        // SPEC §7 Always: AI 默认关闭（ai_enabled=false），
        // 删掉设置后 ChatPanel 不渲染、不加载 llama.cpp runtime、不创建 probe
        let settings = Settings::default();
        assert!(!settings.ai_enabled, "AI 必须默认关闭");
        assert_eq!(settings.ai_model_name, "gemma-4-E4B-it-Q4_K_M");
        assert_eq!(settings.max_concurrent_ai_probes, 3);
        assert_eq!(settings.ai_output_token_cap, 4096);
        assert!(
            settings.ai_license_accepted_at.is_none(),
            "首次安装必须未接受 Gemma license"
        );
    }

    #[test]
    fn test_settings_serialization_includes_ai_fields() {
        let settings = Settings::default();
        let json = serde_json::to_string(&settings).unwrap();
        // camelCase 序列化（SPEC §3 rename_all = "camelCase"）
        assert!(json.contains("\"aiEnabled\":false"));
        assert!(json.contains("\"aiModelName\":\"gemma-4-E4B-it-Q4_K_M\""));
        assert!(json.contains("\"maxConcurrentAiProbes\":3"));
        assert!(json.contains("\"aiOutputTokenCap\":4096"));
        // ai_license_accepted_at = None → skip_serializing_if 跳过
        assert!(!json.contains("aiLicenseAcceptedAt"));
    }

    #[test]
    fn test_settings_serializes_license_timestamp_when_set() {
        let mut settings = Settings::default();
        settings.ai_license_accepted_at = Some(1_700_000_000_000);
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("\"aiLicenseAcceptedAt\":1700000000000"));
    }

    #[test]
    fn test_settings_deserialization_round_trips_license_timestamp() {
        let mut original = Settings::default();
        original.ai_license_accepted_at = Some(42);
        let json = serde_json::to_string(&original).unwrap();
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.ai_license_accepted_at, Some(42));
    }

    #[test]
    fn test_settings_patch_deserialize_license_timestamp() {
        let json = r#"{"aiLicenseAcceptedAt":1700000000000}"#;
        let patch: SettingsPatch = serde_json::from_str(json).unwrap();
        assert_eq!(patch.ai_license_accepted_at, Some(1_700_000_000_000));
    }

    #[test]
    fn test_settings_patch_omits_license_when_not_provided() {
        let json = r#"{"aiEnabled":true}"#;
        let patch: SettingsPatch = serde_json::from_str(json).unwrap();
        assert_eq!(patch.ai_license_accepted_at, None);
    }

    #[test]
    fn test_settings_patch_deserialize_ai_fields() {
        let json = r#"{"aiEnabled":true,"aiModelName":"gemma4:e2b","maxConcurrentAiProbes":5,"aiOutputTokenCap":2048}"#;
        let patch: SettingsPatch = serde_json::from_str(json).unwrap();
        assert_eq!(patch.ai_enabled, Some(true));
        assert_eq!(patch.ai_model_name.as_deref(), Some("gemma4:e2b"));
        assert_eq!(patch.max_concurrent_ai_probes, Some(5));
        assert_eq!(patch.ai_output_token_cap, Some(2048));
    }

    #[test]
    fn test_settings_patch_partial_omits_missing_ai_fields() {
        let json = r#"{"aiEnabled":true}"#;
        let patch: SettingsPatch = serde_json::from_str(json).unwrap();
        assert_eq!(patch.ai_enabled, Some(true));
        assert_eq!(patch.ai_model_name, None);
        assert_eq!(patch.max_concurrent_ai_probes, None);
        assert_eq!(patch.ai_output_token_cap, None);
    }
}
