//! llama.cpp in-process runtime（`llama-cpp-2` 封装）
//!
//! 本切片（T1.3 slice 1a）仅提供资源检查层；模型加载 / 生成 / 取消在后续切片补。
//! `llama-cpp-2` crate 尚未在此处引用，本模块当前全 safe Rust，方便先跑 RAM gate 测试。

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
}
