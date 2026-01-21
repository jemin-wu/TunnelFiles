//! 终端相关数据模型

use serde::{Deserialize, Serialize};

/// 终端状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TerminalStatus {
    Connected,
    Disconnected,
    Error,
}

/// 终端信息（返回给前端）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    pub terminal_id: String,
    pub session_id: String,
}

/// 终端输出事件 payload
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputPayload {
    pub terminal_id: String,
    /// Base64 编码的输出数据
    pub data: String,
}

/// 终端状态事件 payload
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStatusPayload {
    pub terminal_id: String,
    pub status: TerminalStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
