//! llama.cpp in-process runtime（`llama-cpp-2` 封装）
//!
//! 当前切片只提供 pre-load 安全层：RAM 资源检查（1a）+ GGUF sha256 校验（2a）。
//! 模型加载 / 生成 / 取消在后续切片补。`llama-cpp-2` crate 尚未引用，本模块
//! 全 safe Rust，可独立测试。

use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::models::error::{AppError, AppResult};

/// E4B q4_k_m 载入 ~4GB + KV cache ~1GB + 余量 = 6GB 硬门槛（SPEC §5）。
pub const MIN_RAM_BYTES: u64 = 6 * 1024 * 1024 * 1024;

/// 内存探针抽象 —— 生产实现读系统可用 RAM；测试用 FakeProbe 注入固定值。
pub trait MemoryProbe: Send + Sync {
    fn available_ram_bytes(&self) -> u64;
}

/// 加载模型前的资源检查（SPEC §5 T1.3 Verify）。
///
/// 可用 RAM 不足 `MIN_RAM_BYTES` → `AiUnavailable { detail: "insufficient RAM" }`。
pub fn resource_check(probe: &dyn MemoryProbe) -> AppResult<()> {
    let available = probe.available_ram_bytes();
    if available < MIN_RAM_BYTES {
        return Err(AppError::ai_unavailable("AI runtime 不可用")
            .with_detail(format!(
                "insufficient RAM: available {} bytes, required {} bytes",
                available, MIN_RAM_BYTES
            ))
            .with_retryable(false));
    }
    Ok(())
}

/// 流式读取计算 GGUF 文件 SHA256，读缓冲避免 ~3.5GB 模型占用堆。
const CHECKSUM_READ_BUFFER: usize = 64 * 1024;

/// 校验 GGUF 模型文件 SHA256 与预期值（小写 hex，64 字符）是否匹配。
///
/// 失败路径（均返回 `AiUnavailable`，`retryable=false`）：
/// - 预期 hex 长度 / 字符不合法 → `detail: "invalid expected checksum"`
/// - 文件缺失或无权限 → `detail: "GGUF file unreadable: {io error}"`
/// - 计算结果不匹配 → `detail: "checksum mismatch: expected {}, got {}"`
///
/// 校验层故意独立于 `llama-cpp-2`：恶意量化 / 半拉下载 / 存储损坏要在进入 FFI
/// 前拦住（SPEC §5、SPEC §7 Never "从非官方 google/gemma-*-GGUF 仓库下载"）。
pub fn verify_gguf_checksum(path: &Path, expected_hex: &str) -> AppResult<()> {
    if expected_hex.len() != 64 || !expected_hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::ai_unavailable("GGUF 校验失败")
            .with_detail(format!(
                "invalid expected checksum: want 64 hex chars, got {} chars",
                expected_hex.len()
            ))
            .with_retryable(false));
    }

    let file = File::open(path).map_err(|e| {
        AppError::ai_unavailable("GGUF 文件不可读")
            .with_detail(format!("GGUF file unreadable: {e}"))
            .with_retryable(false)
    })?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; CHECKSUM_READ_BUFFER];
    loop {
        let n = reader.read(&mut buf).map_err(|e| {
            AppError::ai_unavailable("GGUF 读取失败")
                .with_detail(format!("GGUF read error: {e}"))
                .with_retryable(false)
        })?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let got = hasher.finalize();
    let got_hex = hex_lower(&got);
    // 比较时 lowercase 两边，防用户填大写
    let expected_lower = expected_hex.to_ascii_lowercase();
    if got_hex != expected_lower {
        return Err(AppError::ai_unavailable("GGUF 校验失败")
            .with_detail(format!(
                "checksum mismatch: expected {expected_lower}, got {got_hex}"
            ))
            .with_retryable(false));
    }
    Ok(())
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::error::ErrorCode;

    struct FakeProbe {
        available: u64,
    }

    impl MemoryProbe for FakeProbe {
        fn available_ram_bytes(&self) -> u64 {
            self.available
        }
    }

    #[test]
    fn resource_check_rejects_insufficient_ram() {
        let probe = FakeProbe {
            available: 4 * 1024 * 1024 * 1024, // 4 GB < 6 GB 门槛
        };
        let err = resource_check(&probe).unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
        assert!(
            err.detail
                .as_ref()
                .map(|d| d.contains("insufficient RAM"))
                .unwrap_or(false),
            "detail should indicate insufficient RAM, got: {:?}",
            err.detail
        );
        // RAM 不足不是短暂问题（不释放内存就不会变），与默认 retryable=true 区分
        assert_eq!(err.retryable, Some(false));
    }

    #[test]
    fn resource_check_accepts_exactly_threshold() {
        let probe = FakeProbe {
            available: MIN_RAM_BYTES,
        };
        assert!(resource_check(&probe).is_ok());
    }

    #[test]
    fn resource_check_accepts_ample_ram() {
        let probe = FakeProbe {
            available: 16 * 1024 * 1024 * 1024, // 16 GB
        };
        assert!(resource_check(&probe).is_ok());
    }

    #[test]
    fn resource_check_rejects_just_below_threshold() {
        let probe = FakeProbe {
            available: MIN_RAM_BYTES - 1,
        };
        assert!(resource_check(&probe).is_err());
    }

    use std::io::Write;
    use tempfile::NamedTempFile;

    /// 预计算好 `b"hello"` 的 sha256（lowercase hex）。
    const HELLO_SHA256: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

    fn make_file(content: &[u8]) -> NamedTempFile {
        let mut f = NamedTempFile::new().expect("create temp file");
        f.write_all(content).expect("write temp file");
        f.flush().expect("flush temp file");
        f
    }

    #[test]
    fn verify_gguf_checksum_accepts_matching_hash() {
        let f = make_file(b"hello");
        assert!(verify_gguf_checksum(f.path(), HELLO_SHA256).is_ok());
    }

    #[test]
    fn verify_gguf_checksum_accepts_uppercase_expected_hex() {
        let f = make_file(b"hello");
        let upper = HELLO_SHA256.to_ascii_uppercase();
        assert!(verify_gguf_checksum(f.path(), &upper).is_ok());
    }

    #[test]
    fn verify_gguf_checksum_rejects_mismatched_hash() {
        let f = make_file(b"hello");
        let wrong = "0".repeat(64);
        let err = verify_gguf_checksum(f.path(), &wrong).unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
        assert!(
            err.detail
                .as_ref()
                .map(|d| d.contains("checksum mismatch"))
                .unwrap_or(false),
            "detail should include 'checksum mismatch', got: {:?}",
            err.detail
        );
        assert_eq!(err.retryable, Some(false));
    }

    #[test]
    fn verify_gguf_checksum_rejects_invalid_expected_format() {
        let f = make_file(b"hello");
        let err = verify_gguf_checksum(f.path(), "not-a-hex").unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
        assert!(err
            .detail
            .as_ref()
            .map(|d| d.contains("invalid expected checksum"))
            .unwrap_or(false));
    }

    #[test]
    fn verify_gguf_checksum_rejects_non_hex_chars_in_expected() {
        // 64 字符但含非 hex：右长度骗不过字符校验
        let bad = "g".repeat(64);
        let f = make_file(b"hello");
        let err = verify_gguf_checksum(f.path(), &bad).unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
        assert!(err
            .detail
            .as_ref()
            .map(|d| d.contains("invalid expected checksum"))
            .unwrap_or(false));
    }

    #[test]
    fn verify_gguf_checksum_rejects_missing_file() {
        let missing = std::path::PathBuf::from("/nonexistent/path/to/model.gguf");
        let err = verify_gguf_checksum(&missing, HELLO_SHA256).unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
        assert!(err
            .detail
            .as_ref()
            .map(|d| d.contains("unreadable"))
            .unwrap_or(false));
    }

    #[test]
    fn verify_gguf_checksum_handles_large_streamed_input() {
        // 超过单次 read buffer 的数据路径（确保流式 hash 正确）
        let size = CHECKSUM_READ_BUFFER * 3 + 7;
        let big = vec![0xABu8; size];
        let mut hasher = Sha256::new();
        hasher.update(&big);
        let expected = hex_lower(&hasher.finalize());
        let f = make_file(&big);
        assert!(verify_gguf_checksum(f.path(), &expected).is_ok());
    }
}
