use serde::{Deserialize, Serialize};
use thiserror::Error;

/// 错误码枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    AuthFailed,
    HostkeyMismatch,
    Timeout,
    NetworkLost,
    NotFound,
    PermissionDenied,
    DirNotEmpty,
    AlreadyExists,
    LocalIoError,
    RemoteIoError,
    Canceled,
    InvalidArgument,
    Unknown,
}

/// 统一错误模型
#[derive(Debug, Clone, Serialize, Deserialize, Error)]
#[error("{message}")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
            retryable: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn with_retryable(mut self, retryable: bool) -> Self {
        self.retryable = Some(retryable);
        self
    }

    // 便捷构造方法
    pub fn auth_failed(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::AuthFailed, message)
    }

    pub fn hostkey_mismatch(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::HostkeyMismatch, message)
    }

    pub fn timeout(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Timeout, message).with_retryable(true)
    }

    pub fn network_lost(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NetworkLost, message).with_retryable(true)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NotFound, message)
    }

    pub fn permission_denied(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::PermissionDenied, message)
    }

    pub fn dir_not_empty(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::DirNotEmpty, message)
    }

    pub fn already_exists(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::AlreadyExists, message)
    }

    pub fn local_io_error(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::LocalIoError, message).with_retryable(true)
    }

    pub fn remote_io_error(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::RemoteIoError, message).with_retryable(true)
    }

    pub fn canceled() -> Self {
        Self::new(ErrorCode::Canceled, "操作已取消")
    }

    pub fn invalid_argument(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidArgument, message)
    }
}

// 从 ssh2::Error 转换
impl From<ssh2::Error> for AppError {
    fn from(err: ssh2::Error) -> Self {
        let message = err.message().to_string();
        match err.code() {
            ssh2::ErrorCode::Session(-18) => {
                // LIBSSH2_ERROR_AUTHENTICATION_FAILED
                AppError::auth_failed(message)
            }
            ssh2::ErrorCode::Session(-43) => {
                // LIBSSH2_ERROR_TIMEOUT
                AppError::timeout(message)
            }
            ssh2::ErrorCode::SFTP(2) => {
                // LIBSSH2_FX_NO_SUCH_FILE
                AppError::not_found(message)
            }
            ssh2::ErrorCode::SFTP(3) => {
                // LIBSSH2_FX_PERMISSION_DENIED
                AppError::permission_denied(message)
            }
            ssh2::ErrorCode::SFTP(4) => {
                // LIBSSH2_FX_FAILURE (通常是目录非空)
                AppError::dir_not_empty(message)
            }
            ssh2::ErrorCode::SFTP(11) => {
                // LIBSSH2_FX_FILE_ALREADY_EXISTS
                AppError::already_exists(message)
            }
            _ => AppError::new(ErrorCode::RemoteIoError, message),
        }
    }
}

// 从 std::io::Error 转换
impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        use std::io::ErrorKind;
        match err.kind() {
            ErrorKind::NotFound => AppError::not_found(err.to_string()),
            ErrorKind::PermissionDenied => AppError::permission_denied(err.to_string()),
            ErrorKind::TimedOut => AppError::timeout(err.to_string()),
            ErrorKind::ConnectionReset | ErrorKind::ConnectionAborted => {
                AppError::network_lost(err.to_string())
            }
            _ => AppError::local_io_error(err.to_string()),
        }
    }
}

// 从 rusqlite::Error 转换
impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::new(ErrorCode::LocalIoError, format!("数据库错误: {}", err))
    }
}

// 从 serde_json::Error 转换
impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::new(ErrorCode::LocalIoError, format!("JSON 解析错误: {}", err))
    }
}

// 从 keyring::Error 转换
impl From<keyring::Error> for AppError {
    fn from(err: keyring::Error) -> Self {
        match err {
            keyring::Error::NoEntry => AppError::not_found("凭据不存在"),
            keyring::Error::Ambiguous(_) => {
                AppError::new(ErrorCode::LocalIoError, "凭据存储存在多个匹配项")
            }
            _ => AppError::new(ErrorCode::LocalIoError, format!("凭据存储错误: {}", err)),
        }
    }
}

// 从 String 转换（用于自定义错误消息）
impl From<String> for AppError {
    fn from(msg: String) -> Self {
        AppError::new(ErrorCode::Unknown, msg)
    }
}

impl From<&str> for AppError {
    fn from(msg: &str) -> Self {
        AppError::new(ErrorCode::Unknown, msg)
    }
}

/// Result 类型别名
pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_serialization() {
        let err = AppError::auth_failed("认证失败")
            .with_detail("密码错误")
            .with_retryable(false);

        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("AUTH_FAILED"));
        assert!(json.contains("认证失败"));
    }

    #[test]
    fn test_error_code_serialization() {
        let code = ErrorCode::HostkeyMismatch;
        let json = serde_json::to_string(&code).unwrap();
        assert_eq!(json, "\"HOSTKEY_MISMATCH\"");
    }
}
