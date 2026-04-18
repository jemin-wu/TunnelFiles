//! Model download helpers (plan.md T1.5 slice B — pure functions, no HTTP).
//!
//! 这一层只管 "文件已经在磁盘上" 和 "判断磁盘够不够下载" 两件事：
//!
//! - `compute_sha256_hex` / `verify_sha256`: 落盘后的哈希校验，失败硬删坏文件
//! - `DiskProbe` trait + `check_disk_available`: 下载前磁盘空闲量 gate
//! - 模型权重 pin（URL / sha256 / 字节数 / 磁盘阈值）都集中在这个模块的顶部常量，
//!   升级三方源（见 `docs/approved-model-sources.md`）时只改本文件
//!
//! HTTP 本身 + progress 事件发射在 slice C（引入 `reqwest` 之后）。

use std::fs;
use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::models::error::{AppError, AppResult, ErrorCode};

// ---- Pin constants ---------------------------------------------------------

/// Gemma 4 E4B Q4_K_M GGUF 下载直链。
///
/// 来源：`unsloth/gemma-4-E4B-it-GGUF`（SPEC §Never 允许清单，见
/// `docs/approved-model-sources.md`）。升级源或变体时同步这三个常量 + sha256
/// pin + 文件大小 pin，确保校验一致。
pub const MODEL_DOWNLOAD_URL: &str =
    "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf";

/// 期望的 sha256 （lowercase hex，64 字符）。
pub const MODEL_EXPECTED_SHA256_HEX: &str =
    "dff0ffba4c90b4082d70214d53ce9504a28d4d8d998276dcb3b8881a656c742a";

/// 期望的文件字节数。服务端 Content-Length 若不一致 → 不信任直接拒绝下载。
pub const MODEL_EXPECTED_SIZE_BYTES: u64 = 4_977_169_088;

/// 下载前要求的磁盘空闲空间（SPEC §5：≥ 7GB，考虑模型 ~5GB + 临时文件 + 余量）。
pub const MODEL_DISK_REQUIRED_BYTES: u64 = 7_000_000_000;

/// sha256 流式读取缓冲 —— 8 KB 平衡吞吐和内存占用。
const HASH_CHUNK_BYTES: usize = 8 * 1024;

// ---- sha256 verification ---------------------------------------------------

/// 以 8KB chunk 流式读文件计算 sha256，返回 64 字符 lowercase hex。
///
/// 不读全文件到内存（GGUF 4.98GB 一次性读会直接爆 RAM gate）。IO 错误走标准
/// `From<std::io::Error>` 转 `AppError::LocalIoError`。
pub fn compute_sha256_hex(path: &Path) -> AppResult<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; HASH_CHUNK_BYTES];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let digest = hasher.finalize();
    // sha2 的 GenericArray → 64 字符 hex（lowercase，无 `0x` 前缀）
    let mut hex = String::with_capacity(64);
    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }
    Ok(hex)
}

/// 校验文件 sha256 是否匹配期望值（case-insensitive 比较）；不匹配即硬删坏文件
/// 并返回 `AiUnavailable { retryable: true }`。
///
/// 删除失败不覆盖原始错误 —— 单独记 `tracing::warn!`，避免磁盘权限问题遮住真正的
/// sha256 原因。
pub fn verify_sha256(path: &Path, expected_hex: &str) -> AppResult<()> {
    let actual = compute_sha256_hex(path)?;
    if actual.eq_ignore_ascii_case(expected_hex) {
        return Ok(());
    }
    tracing::warn!(
        path = %path.display(),
        expected = expected_hex,
        actual = %actual,
        "GGUF sha256 不匹配，删除坏文件"
    );
    if let Err(e) = fs::remove_file(path) {
        tracing::warn!(path = %path.display(), error = %e, "删除 sha256 不匹配的文件失败");
    }
    Err(
        AppError::new(ErrorCode::AiUnavailable, "GGUF 完整性校验失败")
            .with_detail(format!("expected {expected_hex}, got {actual}"))
            .with_retryable(true),
    )
}

// ---- Disk space gate -------------------------------------------------------

/// 磁盘空间探针抽象 —— 生产实现（Slice C 引入跨平台依赖后落盘）与测试 fake
/// 共用同一签名。本 slice 故意不提供生产实现，待依赖选型定下来一起进。
pub trait DiskProbe {
    /// 返回 `path` 所在分区的空闲字节数。返回 `None` 表示探测失败（权限不足 /
    /// 路径不存在 / 平台不支持），调用方按 "保守通过" 处理 —— 不能阻塞用户的
    /// 下载仅因为我们查不到磁盘数据。
    fn available_bytes(&self, path: &Path) -> Option<u64>;
}

/// 校验目标目录所在分区空闲空间 ≥ `required`。`None` 探测结果视为 "保守通过"。
pub fn check_disk_available<P: DiskProbe>(
    probe: &P,
    dest_dir: &Path,
    required: u64,
) -> AppResult<()> {
    match probe.available_bytes(dest_dir) {
        None => {
            tracing::warn!(
                dir = %dest_dir.display(),
                "无法探测磁盘空闲空间，放行下载（fail-open）"
            );
            Ok(())
        }
        Some(available) if available >= required => Ok(()),
        Some(available) => Err(AppError::new(
            ErrorCode::AiUnavailable,
            "磁盘空闲空间不足以下载模型",
        )
        .with_detail(format!(
            "需要 {} 字节，实际剩余 {} 字节",
            required, available
        ))
        .with_retryable(false)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::{tempdir, NamedTempFile};

    // ---- Pin 常量合理性 ---------------------------------------------------

    #[test]
    fn pinned_sha256_is_64_lowercase_hex() {
        assert_eq!(MODEL_EXPECTED_SHA256_HEX.len(), 64);
        assert!(
            MODEL_EXPECTED_SHA256_HEX
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
            "sha256 pin 必须全是小写 hex: {MODEL_EXPECTED_SHA256_HEX}"
        );
    }

    #[test]
    fn pinned_download_url_points_to_allowlisted_repo() {
        // SPEC §Never：只允许 docs/approved-model-sources.md 登记的仓库
        assert!(MODEL_DOWNLOAD_URL.starts_with("https://huggingface.co/unsloth/"));
        assert!(MODEL_DOWNLOAD_URL.contains("/resolve/main/"));
        assert!(MODEL_DOWNLOAD_URL.ends_with(".gguf"));
    }

    #[test]
    fn pinned_disk_threshold_exceeds_model_size() {
        // 防止磁盘 gate 小于模型本身，留出量化 / 临时文件余量
        assert!(
            MODEL_DISK_REQUIRED_BYTES > MODEL_EXPECTED_SIZE_BYTES,
            "磁盘阈值 {} 必须 > 模型字节数 {}",
            MODEL_DISK_REQUIRED_BYTES,
            MODEL_EXPECTED_SIZE_BYTES
        );
    }

    // ---- compute_sha256_hex -----------------------------------------------

    fn write_tmp(bytes: &[u8]) -> NamedTempFile {
        let mut f = NamedTempFile::new().expect("tempfile");
        f.write_all(bytes).expect("write");
        f.flush().expect("flush");
        f
    }

    #[test]
    fn compute_sha256_hex_empty_file() {
        // SHA256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        let f = write_tmp(b"");
        let hex = compute_sha256_hex(f.path()).expect("hash");
        assert_eq!(
            hex,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn compute_sha256_hex_known_string() {
        // SHA256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
        let f = write_tmp(b"abc");
        let hex = compute_sha256_hex(f.path()).expect("hash");
        assert_eq!(
            hex,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn compute_sha256_hex_is_deterministic() {
        let f = write_tmp(b"deterministic payload");
        let a = compute_sha256_hex(f.path()).unwrap();
        let b = compute_sha256_hex(f.path()).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn compute_sha256_hex_handles_chunk_boundary() {
        // HASH_CHUNK_BYTES = 8KB；塞刚好 8KB + 1 字节以覆盖 chunk 循环二次迭代
        let payload = vec![0x5Au8; HASH_CHUNK_BYTES + 1];
        let f = write_tmp(&payload);
        let hex = compute_sha256_hex(f.path()).expect("hash");
        assert_eq!(hex.len(), 64);
    }

    #[test]
    fn compute_sha256_hex_missing_file_returns_not_found() {
        // std::io::Error::NotFound → AppError::NotFound（see domain-errors.md）
        let dir = tempdir().unwrap();
        let missing = dir.path().join("does-not-exist");
        let err = compute_sha256_hex(&missing).unwrap_err();
        assert_eq!(err.code, ErrorCode::NotFound);
    }

    // ---- verify_sha256 -----------------------------------------------------

    #[test]
    fn verify_sha256_accepts_matching_hex() {
        let f = write_tmp(b"abc");
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        verify_sha256(f.path(), expected).expect("match");
    }

    #[test]
    fn verify_sha256_is_case_insensitive() {
        let f = write_tmp(b"abc");
        let upper = "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD";
        verify_sha256(f.path(), upper).expect("match uppercase expected");
    }

    #[test]
    fn verify_sha256_mismatch_returns_ai_unavailable_and_deletes_file() {
        let f = write_tmp(b"abc");
        let path = f.path().to_path_buf();
        // tempfile 在 close 时删文件；先 persist 避开自动清理以确认 verify 做了删除
        let persisted = f.persist(&path).expect("persist");
        drop(persisted);
        assert!(path.exists());

        let err = verify_sha256(&path, "00".repeat(32).as_str()).unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
        assert_eq!(err.retryable, Some(true));
        assert!(
            !path.exists(),
            "verify_sha256 必须在 sha256 不匹配时删掉坏文件"
        );
    }

    #[test]
    fn verify_sha256_mismatch_error_detail_includes_both_hashes() {
        let f = write_tmp(b"abc");
        let err = verify_sha256(f.path(), "00".repeat(32).as_str()).unwrap_err();
        let detail = err.detail.unwrap_or_default();
        assert!(detail.contains("expected"));
        assert!(detail.contains("got"));
    }

    // ---- DiskProbe + check_disk_available ---------------------------------

    struct FakeDiskProbe(Option<u64>);

    impl DiskProbe for FakeDiskProbe {
        fn available_bytes(&self, _: &Path) -> Option<u64> {
            self.0
        }
    }

    #[test]
    fn check_disk_passes_when_available_meets_required() {
        let probe = FakeDiskProbe(Some(10_000_000_000));
        check_disk_available(&probe, Path::new("/tmp"), 7_000_000_000).expect("pass");
    }

    #[test]
    fn check_disk_passes_at_exact_boundary() {
        let probe = FakeDiskProbe(Some(7_000_000_000));
        check_disk_available(&probe, Path::new("/tmp"), 7_000_000_000).expect("pass");
    }

    #[test]
    fn check_disk_fails_when_available_below_required() {
        let probe = FakeDiskProbe(Some(3_000_000_000));
        let err = check_disk_available(&probe, Path::new("/tmp"), 7_000_000_000).unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
        assert_eq!(err.retryable, Some(false));
        let detail = err.detail.unwrap_or_default();
        assert!(detail.contains("7000000000"));
        assert!(detail.contains("3000000000"));
    }

    #[test]
    fn check_disk_fail_opens_when_probe_returns_none() {
        // 生产环境探测失败（权限 / 平台不支持）不应阻塞用户下载 —— 保守通过
        let probe = FakeDiskProbe(None);
        check_disk_available(&probe, Path::new("/tmp"), 7_000_000_000).expect("fail-open");
    }
}
