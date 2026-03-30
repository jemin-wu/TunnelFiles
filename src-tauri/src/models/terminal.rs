//! 终端相关数据模型

use serde::{Deserialize, Serialize};
#[cfg(test)]
use ts_rs::TS;

/// 终端状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "lowercase")]
pub enum TerminalStatus {
    Connected,
    Disconnected,
    Reconnecting,
    Error,
}

/// 终端信息（返回给前端）
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    pub terminal_id: String,
    pub session_id: String,
}

/// 终端输出事件 payload
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputPayload {
    pub terminal_id: String,
    /// Base64 编码的输出数据
    pub data: String,
}

/// 终端状态事件 payload
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct TerminalStatusPayload {
    pub terminal_id: String,
    pub status: TerminalStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// 当前重连尝试次数 (1-based)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reconnect_attempt: Option<u8>,
    /// 最大重连尝试次数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_reconnect_attempts: Option<u8>,
}
