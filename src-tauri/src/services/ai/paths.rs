//! AI 模型文件路径规范（SPEC §5 "{data_local_dir}/TunnelFiles/models/..."）。
//!
//! 路径解析在一个位置集中，健康检查 / 下载 / 校验 / 加载共用同一规则，
//! 避免多处拼接导致的分歧。

use std::path::PathBuf;

/// 模型名转 GGUF 文件名。
///
/// 规则：`":"` 替换为 `"-"`，追加 `"-q4_k_m.gguf"`。例："gemma4:e4b" →
/// "gemma4-e4b-q4_k_m.gguf"。仅支持 q4_k_m 量化（SPEC §5 冻结），其他量化
/// 等级需新量化策略落地后再扩展。
pub fn gguf_filename(model_name: &str) -> String {
    let sanitized = model_name.replace(':', "-");
    format!("{sanitized}-q4_k_m.gguf")
}

/// 计算当前平台下 GGUF 模型文件的绝对路径。
///
/// 基于 `dirs::data_local_dir()`（Windows: `%LOCALAPPDATA%`；macOS:
/// `~/Library/Application Support`；Linux: `~/.local/share`）。该函数在
/// 无家目录 / 无 HOME 的极端环境返回 `None`，健康检查调用点需按 "模型
/// 缺失" 语义处理。
pub fn model_file_path(model_name: &str) -> Option<PathBuf> {
    let base = dirs::data_local_dir()?;
    Some(
        base.join("TunnelFiles")
            .join("models")
            .join(gguf_filename(model_name)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gguf_filename_replaces_colon_with_dash() {
        assert_eq!(gguf_filename("gemma4:e4b"), "gemma4-e4b-q4_k_m.gguf");
    }

    #[test]
    fn gguf_filename_replaces_multiple_colons() {
        assert_eq!(gguf_filename("a:b:c"), "a-b-c-q4_k_m.gguf");
    }

    #[test]
    fn gguf_filename_preserves_hyphens_and_underscores() {
        assert_eq!(gguf_filename("my-model_v2"), "my-model_v2-q4_k_m.gguf");
    }

    #[test]
    fn gguf_filename_handles_empty_name() {
        assert_eq!(gguf_filename(""), "-q4_k_m.gguf");
    }

    #[test]
    fn gguf_filename_is_stable_for_same_input() {
        let a = gguf_filename("gemma4:e4b");
        let b = gguf_filename("gemma4:e4b");
        assert_eq!(a, b);
    }

    #[test]
    fn model_file_path_contains_tunnelfiles_models_suffix() {
        // dirs::data_local_dir() 在 CI + 开发机都能得到值；极小概率 None
        let path = model_file_path("gemma4:e4b");
        if let Some(p) = path {
            let s = p.to_string_lossy().to_string();
            assert!(s.contains("TunnelFiles"), "path missing TunnelFiles: {s}");
            assert!(s.contains("models"), "path missing models dir: {s}");
            assert!(
                s.ends_with("gemma4-e4b-q4_k_m.gguf"),
                "path should end with gguf filename: {s}"
            );
        }
    }
}
