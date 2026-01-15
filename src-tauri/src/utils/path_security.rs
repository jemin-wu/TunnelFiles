//! 路径安全工具
//!
//! 防止路径遍历攻击

use crate::models::error::{AppError, AppResult, ErrorCode};

/// 验证并规范化远程路径
///
/// 检查并防止路径遍历攻击（如 `../`、`..%2f` 等）
pub fn validate_remote_path(path: &str) -> AppResult<String> {
    // 空路径默认为根目录
    if path.is_empty() {
        return Ok("/".to_string());
    }

    // 检测 URL 编码的路径遍历
    let decoded = path
        .replace("%2e", ".")
        .replace("%2E", ".")
        .replace("%2f", "/")
        .replace("%2F", "/")
        .replace("%5c", "\\")
        .replace("%5C", "\\");

    // 检测路径遍历模式
    if contains_traversal(&decoded) {
        return Err(AppError::new(
            ErrorCode::PermissionDenied,
            "路径包含非法字符或遍历模式",
        ));
    }

    // 检测空字节注入
    if decoded.contains('\0') {
        return Err(AppError::new(ErrorCode::PermissionDenied, "路径包含空字节"));
    }

    Ok(normalize_path(&decoded))
}

/// 检测路径遍历模式
fn contains_traversal(path: &str) -> bool {
    // 分割路径组件
    let components: Vec<&str> = path.split('/').collect();

    for component in components {
        // 检测 ".." 组件
        if component == ".." {
            return true;
        }

        // 检测隐藏的 ".." 变体（如空格填充）
        if component.trim() == ".." {
            return true;
        }
    }

    // 检测 Windows 风格路径遍历
    if path.contains("..\\") || path.contains("\\..") {
        return true;
    }

    false
}

/// 规范化路径（移除冗余的 `/` 和 `.`）
fn normalize_path(path: &str) -> String {
    let mut result = Vec::new();
    let is_absolute = path.starts_with('/');

    for component in path.split('/') {
        match component {
            "" | "." => continue,
            ".." => {
                // 对于绝对路径，不允许越过根目录
                if !result.is_empty() {
                    result.pop();
                }
            }
            _ => result.push(component),
        }
    }

    let joined = result.join("/");
    if is_absolute {
        format!("/{}", joined)
    } else if joined.is_empty() {
        ".".to_string()
    } else {
        joined
    }
}

/// 验证路径是否在允许的基础目录内
pub fn is_within_base(base: &str, path: &str) -> bool {
    let base_normalized = normalize_path(base);
    let path_normalized = normalize_path(path);

    // 路径必须以基础目录开始
    path_normalized.starts_with(&base_normalized) || path_normalized == base_normalized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_normal_path() {
        assert!(validate_remote_path("/home/user/file.txt").is_ok());
        assert!(validate_remote_path("/var/log").is_ok());
        assert!(validate_remote_path("relative/path").is_ok());
    }

    #[test]
    fn test_detect_traversal() {
        assert!(validate_remote_path("/home/../etc/passwd").is_err());
        assert!(validate_remote_path("../etc/passwd").is_err());
        assert!(validate_remote_path("/home/user/../../etc").is_err());
    }

    #[test]
    fn test_detect_encoded_traversal() {
        assert!(validate_remote_path("/home/%2e%2e/etc").is_err());
        assert!(validate_remote_path("/home/%2E%2E/etc").is_err());
    }

    #[test]
    fn test_null_byte() {
        assert!(validate_remote_path("/home/user\0/file").is_err());
    }

    #[test]
    fn test_normalize() {
        assert_eq!(normalize_path("/home//user/./file"), "/home/user/file");
        assert_eq!(normalize_path("/home/user/"), "/home/user");
    }
}
