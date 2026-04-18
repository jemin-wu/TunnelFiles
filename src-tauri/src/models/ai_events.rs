//! AI 事件 payload 模型（SPEC §3 events）。
//!
//! 命名约定 `ai:token` / `ai:done` 在 `services/ai/chat.rs` emit 处集中
//! 声明，常量 + payload 一一对应。所有 payload 走 ts-rs 导出，前端订阅
//! 时通过 bindings 拿到强类型。

use serde::{Deserialize, Serialize};
#[cfg(test)]
use ts_rs::TS;

use crate::models::error::AppError;

/// `ai:thinking` —— LLM 进入 prompt eval / planning 阶段（首 token 之前）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiThinkingPayload {
    pub session_id: String,
    pub message_id: String,
}

/// `ai:token` —— 模型生成的下一个 token（可能是单字符，也可能是多字节单字）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiTokenPayload {
    pub session_id: String,
    pub message_id: String,
    pub token: String,
}

/// `ai:done` —— 推理流结束（自然终止 / 截断 / 用户取消）。
///
/// `truncated` 与 `canceled` 互斥：truncated 表示模型生成达到 max_tokens
/// 上限被截断；canceled 表示用户主动调用 `ai_chat_cancel` 中止。两者皆
/// false 表示模型 EOG 自然结束。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiDonePayload {
    pub session_id: String,
    pub message_id: String,
    /// true 表示生成达到 max_tokens 上限。
    pub truncated: bool,
    /// true 表示流被 `ai_chat_cancel` 中断。
    pub canceled: bool,
}

/// `ai:error` —— 推理失败 / 取消 / 任意 IPC 异常。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiErrorPayload {
    pub session_id: String,
    pub message_id: String,
    pub error: AppError,
}

/// 模型下载进度阶段（SPEC §5 T1.5）。`fetching` 是 HTTP 字节下载；
/// `verifying` 是落盘后 sha256 校验（占时 ~30 秒）；`loading` 是
/// `LlamaRuntime::load` 把 GGUF 读入内存 + Metal buffer 初始化。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub enum AiDownloadPhase {
    Fetching,
    Verifying,
    Loading,
}

/// `ai:download_progress` —— 下载 / 校验 / 加载阶段进度（SPEC §5 T1.5）。
///
/// `downloaded` / `total` 单位均为字节；`verifying` 与 `loading` 阶段没有
/// 字节级进度时 `downloaded == total` 同步发一次即可。`percent` 预计算
/// `0..=100` 整数方便 UI 直接渲染（floor 策略：59.99% → 59）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiDownloadProgressPayload {
    pub phase: AiDownloadPhase,
    pub downloaded: u64,
    pub total: u64,
    pub percent: u8,
}

/// `ai:download_done` —— 下载流程终态（成功 / 取消 / 失败）。
///
/// - `canceled=true` 表示用户通过 `ai_model_download_cancel` 中断；`error=None`
/// - `error=Some` 表示任意环节失败（HTTP / sha256 / 磁盘 IO）；`canceled=false`
/// - 两者都 false 表示正常完成（verify 通过，GGUF 可被下次 health check 发现）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiDownloadDonePayload {
    pub canceled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AppError>,
}
