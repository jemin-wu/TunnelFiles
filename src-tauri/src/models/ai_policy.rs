use serde::{Deserialize, Serialize};
#[cfg(test)]
use ts_rs::TS;

/// 策略层对命令的最终裁决。和执行器内的 AST 判定结果对齐，但留在 models 中供
/// audit / ts-rs / UI 状态复用。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "snake_case")]
pub enum AiAllowlistDecision {
    Allow,
    RequireConfirm,
    #[default]
    Deny,
}

/// Scrubber 执行所用的策略路径。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "snake_case")]
pub enum AiScrubMode {
    #[default]
    UserInput,
    ProbeOutput,
}

/// 一次 scrub 决策的审计记录。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiScrubRecord {
    #[serde(default)]
    pub mode: AiScrubMode,
    #[serde(default)]
    pub redacted: bool,
    #[serde(default)]
    pub warnings: Vec<String>,
}
