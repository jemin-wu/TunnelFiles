use serde::{Deserialize, Serialize};
#[cfg(test)]
use ts_rs::TS;

use crate::models::ai_step::AiStep;

/// 计划整体状态。v0.3a 先覆盖固定 plan 的单向生命周期；rolling revise 另行扩展。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "snake_case")]
pub enum AiPlanStatus {
    #[default]
    Draft,
    Planning,
    Ready,
    Running,
    AwaitingConfirm,
    Done,
    Failed,
    Canceled,
}

/// AI 生成的完整执行计划。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiPlan {
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub steps: Vec<AiStep>,
    #[serde(default)]
    pub risks: Vec<String>,
    #[serde(default)]
    pub assumptions: Vec<String>,
    #[serde(default)]
    pub status: AiPlanStatus,
}
