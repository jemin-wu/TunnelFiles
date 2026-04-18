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

/// `ai:done` —— 模型自然结束（EOG）或达到 max_tokens。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiDonePayload {
    pub session_id: String,
    pub message_id: String,
    /// true 表示因 max_tokens 截断；false 表示自然结束。
    pub truncated: bool,
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
