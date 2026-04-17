//! AI runtime 健康检查（SPEC §3 `ai_health_check`）。
//!
//! 5 秒轮询调用点，必须快 —— 只做 file stat + 编译时加速器探测，不触发
//! sha256 校验和 FFI 调用。runtime_ready 在 T1.3 后续切片集成 llama.cpp
//! 时由 `LlamaRuntime` 状态驱动，当前切片恒 false。

use std::path::Path;

use crate::models::ai_health::{AcceleratorKind, AiHealthResult};

/// 编译时探测当前 build 支持的加速器。
///
/// - macOS → `Metal`
/// - 其他平台 → `Cpu`
///
/// `None` 预留给 runtime 初始化失败后的显式兜底，编译时不会产生。
pub const fn detect_accelerator() -> AcceleratorKind {
    #[cfg(target_os = "macos")]
    {
        AcceleratorKind::Metal
    }
    #[cfg(not(target_os = "macos"))]
    {
        AcceleratorKind::Cpu
    }
}

/// 执行一次健康检查。
///
/// 输入明确（path + name），无隐式全局状态 —— 测试可用 tempfile 任意构造
/// 场景。runtime 就绪状态暂未接入，T1.3 后续切片会补。
pub fn check(model_path: &Path, model_name: &str) -> AiHealthResult {
    let model_present = model_path.is_file();
    AiHealthResult {
        runtime_ready: false,
        model_present,
        model_name: model_name.to_string(),
        accelerator_kind: detect_accelerator(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::{NamedTempFile, TempDir};

    #[test]
    fn runtime_ready_is_false_until_llama_cpp_integrated() {
        // T1.3 runtime 未接入 → 任何状态下都应 false，防 UI 误报 "就绪"
        let tmp = NamedTempFile::new().expect("tempfile");
        let result = check(tmp.path(), "gemma4:e4b");
        assert!(!result.runtime_ready);
    }

    #[test]
    fn model_present_is_true_when_file_exists() {
        let mut tmp = NamedTempFile::new().expect("tempfile");
        tmp.write_all(b"fake gguf content").expect("write");
        tmp.flush().expect("flush");
        let result = check(tmp.path(), "gemma4:e4b");
        assert!(result.model_present);
    }

    #[test]
    fn model_present_is_false_when_file_missing() {
        let missing = std::path::PathBuf::from("/nonexistent/dir/model.gguf");
        let result = check(&missing, "gemma4:e4b");
        assert!(!result.model_present);
    }

    #[test]
    fn model_present_is_false_for_directory_path() {
        // 防止 GGUF 路径误指向目录被当成"存在"
        let dir = TempDir::new().expect("tempdir");
        let result = check(dir.path(), "gemma4:e4b");
        assert!(!result.model_present);
    }

    #[test]
    fn model_name_round_trips_from_settings() {
        let tmp = NamedTempFile::new().expect("tempfile");
        let result = check(tmp.path(), "gemma5:e2b");
        assert_eq!(result.model_name, "gemma5:e2b");
    }

    #[test]
    fn accelerator_matches_build_target() {
        let tmp = NamedTempFile::new().expect("tempfile");
        let result = check(tmp.path(), "gemma4:e4b");
        #[cfg(target_os = "macos")]
        assert_eq!(result.accelerator_kind, AcceleratorKind::Metal);
        #[cfg(not(target_os = "macos"))]
        assert_eq!(result.accelerator_kind, AcceleratorKind::Cpu);
    }

    #[test]
    fn health_result_is_serde_round_trip() {
        // IPC 边界：JSON round-trip 必须保持值
        let tmp = NamedTempFile::new().expect("tempfile");
        let result = check(tmp.path(), "gemma4:e4b");
        let json = serde_json::to_string(&result).expect("serialize");
        let back: AiHealthResult = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(result, back);
        // camelCase 序列化验证：后端 field 是 snake_case，IPC 应该是 camelCase
        assert!(json.contains("\"runtimeReady\""));
        assert!(json.contains("\"modelPresent\""));
        assert!(json.contains("\"modelName\""));
        assert!(json.contains("\"acceleratorKind\""));
    }
}
