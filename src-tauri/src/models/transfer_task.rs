use serde::{Deserialize, Serialize};

/// 传输方向
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransferDirection {
    Upload,
    Download,
}

/// 传输状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransferStatus {
    Waiting,
    Running,
    Success,
    Failed,
    Canceled,
}

/// 传输任务
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferTask {
    pub task_id: String,
    pub session_id: String,
    pub direction: TransferDirection,
    pub local_path: String,
    pub remote_path: String,
    pub file_name: String,
    pub status: TransferStatus,
    /// 已传输字节数
    pub transferred: u64,
    /// 总字节数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    /// 传输速度 (字节/秒)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<u64>,
    /// 百分比 (0-100)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<u8>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    /// 错误码
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    /// 是否可重试
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
    /// 创建时间 (Unix 时间戳毫秒)
    pub created_at: i64,
    /// 完成时间 (Unix 时间戳毫秒)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<i64>,
}

/// 传输进度事件 payload
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgressPayload {
    pub task_id: String,
    pub transferred: u64,
    pub total: u64,
    pub speed: u64,
    pub percent: u8,
}

/// 传输状态事件 payload
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferStatusPayload {
    pub task_id: String,
    pub status: TransferStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}
