//! AI runtime 健康检查结果模型（SPEC §3 `ai_health_check`）。

use serde::{Deserialize, Serialize};
#[cfg(test)]
use ts_rs::TS;

/// 加速器类型。当前仅 `Metal` / `Cpu` 生产使用；`None` 预留给 runtime
/// 初始化失败时的明确兜底（SPEC §3 `acceleratorKind`）。
/// 未来扩展 CUDA / Vulkan 必须走 SPEC §7 Ask First（feature flag whitelist）。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "lowercase")]
pub enum AcceleratorKind {
    Metal,
    Cpu,
    None,
}

/// 健康检查输出（5 秒轮询一次，字段必须快 —— 不做 sha256 等重活）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiHealthResult {
    /// llama.cpp runtime 是否已加载（模型 + backend 就绪）
    pub runtime_ready: bool,
    /// GGUF 模型文件是否存在于预期路径（只 stat，不校验哈希）
    pub model_present: bool,
    /// 模型名（来自 Settings.ai_model_name，例："gemma-4-E4B-it-Q4_K_M"）
    pub model_name: String,
    /// 当前编译目标支持的加速器
    pub accelerator_kind: AcceleratorKind,
}
