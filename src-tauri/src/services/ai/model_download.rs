//! Model download helpers (plan.md T1.5 slice B + C).
//!
//! 一层覆盖从磁盘 gate 到实际字节下载的所有"非 IPC"逻辑：
//!
//! - `compute_sha256_hex` / `verify_sha256`：落盘后的哈希校验，失败硬删坏文件
//! - `DiskProbe` / `SysDiskProbe` / `check_disk_available`：下载前磁盘 gate
//! - `plan_download`：根据 dest 现存文件与期望大小决定 Fresh / Resume / Complete / Oversized
//! - `ProgressTracker`：节流 200ms + 4MB 阈值
//! - `download_gguf`：基于 `reqwest` 的 Range-resume 流式下载 + 进度回调 + cancel
//! - 权重 pin 集中在模块顶部常量（URL / sha256 / 字节数 / 磁盘阈值），升级三方源
//!   （见 `docs/approved-model-sources.md`）时只改本文件
//!
//! IPC 命令 `ai_model_download` + `ai:download_progress` 事件发射在 slice D。

use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

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

/// 下载进度事件节流窗口 —— 200ms 与 transfer_manager 保持一致（SPEC §Performance）。
const PROGRESS_THROTTLE: Duration = Duration::from_millis(200);

/// 即便节流窗口未到，也在累计这么多字节时强制刷一次进度。保证小文件 / 局部快读
/// 场景有起码的反馈。
const PROGRESS_BYTES_FORCE_EMIT: u64 = 4 * 1024 * 1024;

/// HTTP 响应读取缓冲。reqwest 的 stream 本身已按 chunk 切，这里再攒到 64KB 再写盘，
/// 平衡系统调用次数和内存占用（跟 SSH 传输 `CHUNK_SIZE` 一致）。
const WRITE_CHUNK_BYTES: usize = 64 * 1024;

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

/// 生产磁盘探针：委托 `fs4::available_space`，路径必须存在（若目标目录尚未
/// 创建，先从父目录查询）。失败一律返回 None 走 fail-open。
pub struct SysDiskProbe;

impl DiskProbe for SysDiskProbe {
    fn available_bytes(&self, path: &Path) -> Option<u64> {
        // fs4 要求传入的路径必须存在；若 dest_dir 还没 mkdir，向上找到第一个
        // 存在的祖先。极端情况下连根都不存在就只能返回 None。
        let mut probe_target = path;
        while !probe_target.exists() {
            probe_target = probe_target.parent()?;
        }
        fs4::available_space(probe_target).ok()
    }
}

// ---- Download planning ------------------------------------------------------

/// 对比 dest 现有文件与期望大小，决定下载策略。纯函数，便于单测。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DownloadPlan {
    /// 目标文件不存在，从头下载。
    StartFresh,
    /// 目标文件已存在但不完整（size < expected_size），从 `from_offset` 续传。
    Resume { from_offset: u64 },
    /// 目标文件恰好等于期望大小，跳过下载直接进 sha256 校验。
    AlreadyComplete,
    /// 目标文件大于期望大小（或 metadata 异常）—— 由调用方决定是删除重下还是报错。
    Oversized { actual_size: u64 },
}

/// 检查 dest 现有文件 vs 期望大小 → 决定 Fresh / Resume / Complete / Oversized。
pub fn plan_download(dest: &Path, expected_size: u64) -> AppResult<DownloadPlan> {
    match fs::metadata(dest) {
        Ok(md) if !md.is_file() => Err(AppError::new(
            ErrorCode::LocalIoError,
            "模型存储路径已被非文件对象占用",
        )
        .with_detail(dest.display().to_string())
        .with_retryable(false)),
        Ok(md) => {
            let size = md.len();
            if size == expected_size {
                Ok(DownloadPlan::AlreadyComplete)
            } else if size < expected_size {
                Ok(DownloadPlan::Resume { from_offset: size })
            } else {
                Ok(DownloadPlan::Oversized { actual_size: size })
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(DownloadPlan::StartFresh),
        Err(e) => Err(e.into()),
    }
}

// ---- Progress tracker -------------------------------------------------------

/// 进度回调节流：最多每 `PROGRESS_THROTTLE` 刷一次，或累计
/// `PROGRESS_BYTES_FORCE_EMIT` 字节强制刷。外部保证 `finish()` 在流结束时调用，
/// 保证 UI 能看到终态事件。
pub struct ProgressTracker {
    downloaded: u64,
    total: u64,
    last_emit_at: Option<Instant>,
    last_emit_downloaded: u64,
}

impl ProgressTracker {
    pub fn new(total: u64, initial_downloaded: u64) -> Self {
        Self {
            downloaded: initial_downloaded,
            total,
            last_emit_at: None,
            last_emit_downloaded: 0,
        }
    }

    pub fn downloaded(&self) -> u64 {
        self.downloaded
    }

    /// 追加一块字节数 —— 如果距上次 emit 过了节流窗口 / 字节阈值，返回 Some 让
    /// 调用方发事件；否则 None。
    pub fn advance(&mut self, bytes_added: u64, now: Instant) -> Option<ProgressTick> {
        self.downloaded = self.downloaded.saturating_add(bytes_added);
        if self.should_emit(now) {
            self.stamp(now);
            Some(self.tick())
        } else {
            None
        }
    }

    /// 强制在流结束时刷一次进度（即便节流窗口没到）。
    pub fn finish(&mut self, now: Instant) -> ProgressTick {
        self.stamp(now);
        self.tick()
    }

    fn should_emit(&self, now: Instant) -> bool {
        match self.last_emit_at {
            None => true,
            Some(prev) => {
                now.duration_since(prev) >= PROGRESS_THROTTLE
                    || self.downloaded.saturating_sub(self.last_emit_downloaded)
                        >= PROGRESS_BYTES_FORCE_EMIT
            }
        }
    }

    fn stamp(&mut self, now: Instant) {
        self.last_emit_at = Some(now);
        self.last_emit_downloaded = self.downloaded;
    }

    fn tick(&self) -> ProgressTick {
        let percent = if self.total == 0 {
            0
        } else {
            // floor 策略；total == 0 时走上分支。u64 乘 100 在极端情况下不会溢
            // 出（downloaded ≤ total < 2^57 对 5GB 量级足够）
            let raw = (self.downloaded.saturating_mul(100)) / self.total;
            u64::min(raw, 100) as u8
        };
        ProgressTick {
            downloaded: self.downloaded,
            total: self.total,
            percent,
        }
    }
}

/// 单次进度事件快照。调用方据此构造 `AiDownloadProgressPayload`（补 phase 字段）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProgressTick {
    pub downloaded: u64,
    pub total: u64,
    pub percent: u8,
}

// ---- HTTP download ---------------------------------------------------------

/// 下载结果 —— Slice D 的 IPC 层据此判断接下来要走 verify 还是 skip。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadOutcome {
    /// 首次完整下载或断点续传后到达期望大小。
    Completed,
    /// 本地文件已等于期望大小；整次调用未发起 HTTP 请求。
    AlreadyPresent,
    /// 用户取消 —— 已写入的字节保留在磁盘（方便下次续传）。
    Cancelled,
}

/// 执行 GGUF 下载 —— 自动续传 + 节流进度回调 + 取消感知。
///
/// 约定：
/// - 服务端声明的总字节数若与 `expected_size` 冲突 → `AiUnavailable`（retryable）
/// - Range resume 失败（服务端返回 200 而非 206） → 当前实现丢弃已有字节，从头覆盖写
/// - 取消发生时写盘立即停止 —— 未 flush 的字节可能被丢（OS level），可接受
/// - 下载完成但实际字节数与期望不符 → `AiUnavailable`（retryable），留文件由调用方决定
///
/// 本函数**不**做 sha256 校验；调用方（Slice D IPC）依次调
/// `download_gguf` → `verify_sha256` → 继续 runtime load。
pub async fn download_gguf(
    url: &str,
    dest: &Path,
    expected_size: u64,
    mut on_progress: impl FnMut(ProgressTick),
    cancel: &CancellationToken,
) -> AppResult<DownloadOutcome> {
    let plan = plan_download(dest, expected_size)?;
    let resume_offset = match plan {
        DownloadPlan::AlreadyComplete => return Ok(DownloadOutcome::AlreadyPresent),
        DownloadPlan::Oversized { actual_size } => {
            tracing::warn!(
                dest = %dest.display(),
                actual_size,
                expected_size,
                "既有文件大于期望大小，删除后重下"
            );
            fs::remove_file(dest)?;
            0u64
        }
        DownloadPlan::StartFresh => 0u64,
        DownloadPlan::Resume { from_offset } => from_offset,
    };

    // 确保父目录存在
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| {
            AppError::new(ErrorCode::AiUnavailable, "HTTP client 构造失败")
                .with_detail(e.to_string())
                .with_retryable(true)
        })?;

    let mut request = client.get(url);
    if resume_offset > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={resume_offset}-"));
    }

    let response = request.send().await.map_err(|e| {
        AppError::new(ErrorCode::NetworkLost, "GGUF 下载请求失败")
            .with_detail(e.to_string())
            .with_retryable(true)
    })?;

    let status = response.status();
    // 206 Partial Content → 续传成功；200 OK → 服务器未接受 Range，从头开始
    let write_mode_append = if resume_offset > 0 && status == reqwest::StatusCode::PARTIAL_CONTENT {
        true
    } else if resume_offset > 0 && status == reqwest::StatusCode::OK {
        tracing::warn!(
            url,
            resume_offset,
            "服务端未接受 Range（返回 200），删除部分文件从头下"
        );
        fs::remove_file(dest).ok();
        false
    } else if status.is_success() {
        false
    } else {
        return Err(AppError::new(
            ErrorCode::AiUnavailable,
            format!("GGUF 下载返回非预期状态 {status}"),
        )
        .with_retryable(true));
    };

    // Content-Length 校验：206 返回的是 "本段" 长度（期望 - offset），需加回 offset
    // 后与 expected_size 比对；200 直接比。
    if let Some(content_length) = response.content_length() {
        let reported_total = if write_mode_append {
            resume_offset + content_length
        } else {
            content_length
        };
        if reported_total != expected_size {
            return Err(
                AppError::new(ErrorCode::AiUnavailable, "GGUF 服务端声明字节数与期望不符")
                    .with_detail(format!("expected {expected_size}, server {reported_total}"))
                    .with_retryable(true),
            );
        }
    }

    let file = fs::OpenOptions::new()
        .create(true)
        .append(write_mode_append)
        .truncate(!write_mode_append)
        .write(true)
        .open(dest)?;
    let mut writer = std::io::BufWriter::with_capacity(WRITE_CHUNK_BYTES, file);

    let mut tracker = ProgressTracker::new(
        expected_size,
        if write_mode_append { resume_offset } else { 0 },
    );
    // 立即发一次起始事件（便于 UI 显示 0% 或续传起点）
    on_progress(tracker.finish(Instant::now()));

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.is_cancelled() {
            writer.flush().ok();
            return Ok(DownloadOutcome::Cancelled);
        }
        let bytes = chunk.map_err(|e| {
            AppError::new(ErrorCode::NetworkLost, "GGUF 下载流中断")
                .with_detail(e.to_string())
                .with_retryable(true)
        })?;
        writer.write_all(&bytes)?;
        if let Some(tick) = tracker.advance(bytes.len() as u64, Instant::now()) {
            on_progress(tick);
        }
    }
    writer.flush()?;
    drop(writer);

    // 流结束后发最终进度
    on_progress(tracker.finish(Instant::now()));

    // 字节数最终校验 —— 防止服务器提前截断但未返回错误
    let final_size = fs::metadata(dest)?.len();
    if final_size != expected_size {
        return Err(
            AppError::new(ErrorCode::AiUnavailable, "GGUF 下载结束后字节数与期望不符")
                .with_detail(format!("expected {expected_size}, actual {final_size}"))
                .with_retryable(true),
        );
    }

    Ok(DownloadOutcome::Completed)
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
        const {
            assert!(MODEL_DISK_REQUIRED_BYTES > MODEL_EXPECTED_SIZE_BYTES);
        }
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

    // ---- SysDiskProbe smoke test ------------------------------------------

    #[test]
    fn sys_disk_probe_returns_positive_for_tempdir() {
        // 在能正常查询磁盘的平台，tempdir 应有 > 0 空闲空间。查询失败（容器 /
        // 权限问题）时返回 None 是合理的，不把它当 test failure。
        let dir = tempdir().expect("tempdir");
        let probe = SysDiskProbe;
        let result = probe.available_bytes(dir.path());
        if let Some(bytes) = result {
            assert!(bytes > 0, "available_bytes 应 > 0，实际 {bytes}");
        }
    }

    #[test]
    fn sys_disk_probe_falls_back_to_existing_ancestor() {
        // dest 路径本身不存在，但父目录存在 —— 应能查到祖先的空闲空间
        let dir = tempdir().expect("tempdir");
        let nonexistent = dir.path().join("subdir-not-yet-created/model.gguf");
        assert!(!nonexistent.exists());
        let probe = SysDiskProbe;
        let result = probe.available_bytes(&nonexistent);
        if let Some(bytes) = result {
            assert!(bytes > 0);
        }
    }

    // ---- plan_download ----------------------------------------------------

    #[test]
    fn plan_download_returns_start_fresh_for_absent_file() {
        let dir = tempdir().unwrap();
        let dest = dir.path().join("model.gguf");
        assert_eq!(
            plan_download(&dest, 1000).unwrap(),
            DownloadPlan::StartFresh
        );
    }

    #[test]
    fn plan_download_returns_already_complete_for_exact_size() {
        let f = write_tmp(&vec![0u8; 512]);
        let plan = plan_download(f.path(), 512).unwrap();
        assert_eq!(plan, DownloadPlan::AlreadyComplete);
    }

    #[test]
    fn plan_download_returns_resume_when_partial() {
        let f = write_tmp(&vec![0u8; 256]);
        let plan = plan_download(f.path(), 512).unwrap();
        assert_eq!(plan, DownloadPlan::Resume { from_offset: 256 });
    }

    #[test]
    fn plan_download_returns_oversized_when_bigger_than_expected() {
        let f = write_tmp(&vec![0u8; 1024]);
        let plan = plan_download(f.path(), 512).unwrap();
        assert_eq!(plan, DownloadPlan::Oversized { actual_size: 1024 });
    }

    #[test]
    fn plan_download_rejects_directory_at_dest_path() {
        let dir = tempdir().unwrap();
        let err = plan_download(dir.path(), 512).unwrap_err();
        assert_eq!(err.code, ErrorCode::LocalIoError);
    }

    // ---- ProgressTracker --------------------------------------------------

    #[test]
    fn progress_tracker_computes_percent_floor() {
        let mut t = ProgressTracker::new(1000, 0);
        t.advance(590, Instant::now()); // 59%
        let tick = t.finish(Instant::now());
        assert_eq!(tick.percent, 59);
    }

    #[test]
    fn progress_tracker_percent_caps_at_100() {
        // downloaded > total 的退化场景（例如服务器 over-send），percent 不超 100
        let mut t = ProgressTracker::new(100, 0);
        t.advance(200, Instant::now());
        let tick = t.finish(Instant::now());
        assert_eq!(tick.percent, 100);
    }

    #[test]
    fn progress_tracker_reports_zero_percent_for_unknown_total() {
        let mut t = ProgressTracker::new(0, 0);
        t.advance(12345, Instant::now());
        let tick = t.finish(Instant::now());
        assert_eq!(tick.percent, 0);
    }

    #[test]
    fn progress_tracker_first_advance_emits_immediately() {
        // 第一次 advance 应 emit（last_emit_at = None）
        let mut t = ProgressTracker::new(1000, 0);
        assert!(t.advance(100, Instant::now()).is_some());
    }

    #[test]
    fn progress_tracker_throttles_rapid_successive_advances() {
        let now = Instant::now();
        let mut t = ProgressTracker::new(1_000_000, 0);
        assert!(t.advance(10, now).is_some()); // 首次 emit
                                               // 紧随其后的同一瞬间再 advance 应被节流
        assert!(t.advance(10, now).is_none());
    }

    #[test]
    fn progress_tracker_force_emits_after_byte_threshold() {
        let now = Instant::now();
        let mut t = ProgressTracker::new(100 * 1024 * 1024, 0);
        assert!(t.advance(10, now).is_some()); // 初次
                                               // 同一瞬间但累积 >= PROGRESS_BYTES_FORCE_EMIT → 强制 emit
        assert!(t.advance(PROGRESS_BYTES_FORCE_EMIT, now).is_some());
    }

    #[test]
    fn progress_tracker_emits_after_throttle_window() {
        let start = Instant::now();
        let mut t = ProgressTracker::new(1_000_000, 0);
        t.advance(10, start);
        // 模拟 200ms 后 advance —— 应再次 emit
        let later = start + PROGRESS_THROTTLE + Duration::from_millis(1);
        assert!(t.advance(10, later).is_some());
    }

    #[test]
    fn progress_tracker_finish_always_emits() {
        let mut t = ProgressTracker::new(1000, 0);
        t.advance(500, Instant::now());
        // finish 不做节流判断 —— 始终返回终态
        let tick = t.finish(Instant::now());
        assert_eq!(tick.downloaded, 500);
        assert_eq!(tick.percent, 50);
    }

    #[test]
    fn progress_tracker_honors_initial_offset_for_resume() {
        let mut t = ProgressTracker::new(1000, 300);
        assert_eq!(t.downloaded(), 300);
        t.advance(100, Instant::now());
        assert_eq!(t.downloaded(), 400);
        let tick = t.finish(Instant::now());
        assert_eq!(tick.percent, 40);
    }
}
