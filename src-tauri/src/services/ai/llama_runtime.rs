//! llama.cpp in-process runtime（`llama-cpp-2` 封装）
//!
//! 提供 pre-load 安全层（RAM 资源检查 + GGUF sha256 校验）+ load 入口
//! 把所有 gate 串起来再调 FFI。生成 / 取消在后续切片补。

use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};

use sha2::{Digest, Sha256};

use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;

use crate::models::error::{AppError, AppResult};

/// E4B q4_k_m 载入 ~4GB + KV cache ~1GB + 余量 = 6GB 硬门槛（SPEC §5）。
pub const MIN_RAM_BYTES: u64 = 6 * 1024 * 1024 * 1024;

/// 内存探针抽象 —— 生产实现读总物理 RAM；测试用 FakeProbe 注入固定值。
///
/// `available_ram_bytes` 命名描述"调用方关心的量"；生产实现实际返回总物理
/// RAM（"机器档次"代理），不读 free/available 实时值 —— 后者波动太大不
/// 适合做启动 gate，且实际是否够装下模型由 `LlamaModel::load_from_file`
/// 的真失败兜底。
pub trait MemoryProbe: Send + Sync {
    fn available_ram_bytes(&self) -> u64;
}

/// 生产用 RAM 探针：macOS 走 `sysctlbyname("hw.memsize")`；Linux 读
/// `/proc/meminfo` `MemTotal`；其他平台返回 0（启动 gate 必失败，安全侧）。
///
/// Windows 支持留给后续 Ask First（`sysinfo` 依赖审批），目前 v0.1 主战场
/// 是 Mac/Linux。
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemRamProbe;

impl MemoryProbe for SystemRamProbe {
    fn available_ram_bytes(&self) -> u64 {
        physical_ram_bytes().unwrap_or(0)
    }
}

/// 实际探测函数 —— 平台分派。
fn physical_ram_bytes() -> Option<u64> {
    #[cfg(target_os = "macos")]
    {
        macos_physical_ram_bytes()
    }
    #[cfg(target_os = "linux")]
    {
        linux_physical_ram_bytes()
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

#[cfg(target_os = "macos")]
fn macos_physical_ram_bytes() -> Option<u64> {
    // SAFETY: sysctlbyname 是 BSD/macOS 标准只读 syscall。`hw.memsize`
    // 返回 u64（字节）。我们传 u64 缓冲 + 正确的 size_t 长度。
    let mut mem: u64 = 0;
    let mut len: libc::size_t = std::mem::size_of::<u64>();
    let name = std::ffi::CString::new("hw.memsize").ok()?;
    let result = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            &mut mem as *mut u64 as *mut libc::c_void,
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    if result == 0 && len == std::mem::size_of::<u64>() {
        Some(mem)
    } else {
        None
    }
}

#[cfg(target_os = "linux")]
fn linux_physical_ram_bytes() -> Option<u64> {
    // /proc/meminfo 的 MemTotal 单位是 kB（kibibyte = 1024 bytes，行尾
    // 标识 "kB" 实际就是 KiB —— Linux 内核传统）。
    let content = std::fs::read_to_string("/proc/meminfo").ok()?;
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("MemTotal:") {
            let kib: u64 = rest.split_whitespace().next()?.parse().ok()?;
            return Some(kib.saturating_mul(1024));
        }
    }
    None
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
///
/// 1MB 在 M 系 Mac 上跑满 SHA-NI 硬件加速；64KB 每秒触发 ~72K 次 read
/// syscall，4.6GB 模型下成了启动瓶颈（实测 3+ 秒 CPU 满载）。
const CHECKSUM_READ_BUFFER: usize = 1024 * 1024;

/// 流式计算文件 SHA256，返回小写 hex（64 字符）。
///
/// 用途：
/// - T1.5 model_download：写盘后立即算 sha 与官方常量比对
/// - 集成测试 / 调试：手工得知本地 GGUF 的 hash
///
/// 失败统一为 `AiUnavailable`，`retryable=false`（坏文件重试无意义）。
pub fn compute_gguf_sha256(path: &Path) -> AppResult<String> {
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
    Ok(hex_lower(&hasher.finalize()))
}

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

    let got_hex = compute_gguf_sha256(path)?;
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

/// 同 `verify_gguf_checksum`，但先查 (size, mtime) cache；命中直接比对
/// 缓存值与 expected_hex，绕过完整 re-hash。
///
/// 未命中时走完整 sha256 路径，成功后把结果写回 cache。cache IO 失败
/// 静默忽略 —— 性能优化，不是正确性保证。
pub fn verify_gguf_checksum_cached(path: &Path, expected_hex: &str) -> AppResult<()> {
    if expected_hex.len() != 64 || !expected_hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::ai_unavailable("GGUF 校验失败")
            .with_detail(format!(
                "invalid expected checksum: want 64 hex chars, got {} chars",
                expected_hex.len()
            ))
            .with_retryable(false));
    }
    let expected_lower = expected_hex.to_ascii_lowercase();

    if let Some(cached) = super::checksum_cache::lookup(path) {
        if cached == expected_lower {
            return Ok(());
        }
        // Cache hit 但值与 pin 不一致：可能是 pin 升级或缓存被篡改，走完整
        // 重算路径兜底（重算后若还不一致，才报 mismatch）。
    }

    let got_hex = compute_gguf_sha256(path)?;
    if got_hex != expected_lower {
        return Err(AppError::ai_unavailable("GGUF 校验失败")
            .with_detail(format!(
                "checksum mismatch: expected {expected_lower}, got {got_hex}"
            ))
            .with_retryable(false));
    }
    super::checksum_cache::store(path, &got_hex);
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

// ---- Runtime-loaded flag ----------------------------------------------------

/// 进程级 "model + backend 都已加载就绪" 标志。
///
/// `LlamaRuntime::load` 成功后由生产代码调 `mark_runtime_loaded()` 翻 true
/// （目前等 slice 3 的真 generate 集成接入；当前测试环境不会触发）。
/// `health::check` 通过 `is_runtime_loaded()` 把它透到前端 badge。
static IS_LOADED: AtomicBool = AtomicBool::new(false);

/// 当前进程是否已加载 LlamaRuntime。健康检查 5s 轮询调用，必须廉价。
pub fn is_runtime_loaded() -> bool {
    IS_LOADED.load(Ordering::Acquire)
}

/// 设置层把 AI 关闭时，健康检查 / UI 必须把 runtime 视作未加载。
///
/// 这不会主动 unload 已存在的 runtime；它只负责把 disabled 状态映射成
/// "不可用 / 不就绪"，满足 AI off-by-default 的 release gate 语义。
pub fn runtime_ready_for_settings(ai_enabled: bool) -> bool {
    ai_enabled && is_runtime_loaded()
}

/// 标记 runtime 已加载。`Release` 顺序确保对 model 的写入对后续读 happens-before。
pub fn mark_runtime_loaded() {
    IS_LOADED.store(true, Ordering::Release);
}

/// 测试用：单测之间隔离 atomic 状态。生产代码无需 unload。
#[cfg(test)]
pub fn reset_runtime_loaded_for_tests() {
    IS_LOADED.store(false, Ordering::Release);
}

// ---- Loaded runtime registry -----------------------------------------------

/// 进程级单例：load 成功后存放的 `Arc<LlamaRuntime>`，供 chat / future
/// generate 命令通过 `loaded_runtime()` 取用。
///
/// `OnceLock`：set-once 语义匹配 v0.1 "一进程一模型" 模型；reset 不暴露 ——
/// 若需切模型需要重启进程（避免 in-flight generate 持有 Arc 时切换出现
/// half-released FFI 状态）。
static LOADED_RUNTIME: OnceLock<Arc<LlamaRuntime>> = OnceLock::new();

/// 返回当前已加载的 runtime（如有）。chat 命令在没真模型时回退 stub。
pub fn loaded_runtime() -> Option<Arc<LlamaRuntime>> {
    LOADED_RUNTIME.get().cloned()
}

// ---- Backend singleton ------------------------------------------------------

/// `LlamaBackend::init()` 在进程内只能调一次（再调返回 BackendAlreadyInitialized）。
/// 用 OnceLock 保证多线程环境下幂等且无竞态。`Result` 形态让初始化失败 sticky
/// —— 失败一次后没必要重试（C++ runtime state 已脏）。
static BACKEND_INIT: OnceLock<Result<LlamaBackend, String>> = OnceLock::new();

fn ensure_backend() -> AppResult<&'static LlamaBackend> {
    let result = BACKEND_INIT.get_or_init(|| {
        LlamaBackend::init().map_err(|e| format!("LlamaBackend::init failed: {e}"))
    });
    match result {
        Ok(backend) => Ok(backend),
        Err(detail) => Err(AppError::ai_unavailable("AI runtime 不可用")
            .with_detail(detail.clone())
            .with_retryable(false)),
    }
}

// ---- Load options + runtime handle -----------------------------------------

/// 加载参数。`num_ctx` 透传 llama.cpp（影响 KV cache 大小）；GPU 层数由
/// `select_gpu_layers` 按编译目标自动选，调用方不直接配（防误启 CUDA 等）。
#[derive(Debug, Clone, Copy)]
pub struct LoadOptions {
    /// 上下文窗口 token 数（默认 4096，SPEC §5）。
    pub num_ctx: u32,
    /// 是否把加载成功的 runtime 注册到进程级全局 registry。
    ///
    /// 生产路径需要注册，供 chat/generate 命令复用同一个模型；合同测试和
    /// nightly smoke 测试应关闭注册，让模型在测试结束前正常 drop，避免
    /// macOS Metal backend 在进程退出时遇到仍存活的 residency set。
    pub register_global: bool,
}

impl Default for LoadOptions {
    fn default() -> Self {
        Self {
            num_ctx: 4096,
            register_global: true,
        }
    }
}

/// 编译时根据目标平台决定要 offload 多少层到 GPU。
///
/// - macOS（metal feature）：`u32::MAX` 让 llama.cpp 把所有层放 Metal
/// - 非 macOS：0（CPU only）
///
/// 这里**不**读 runtime 探测的 GPU —— 防止"运行时探测发现可用 GPU 就启用"
/// 这种隐式行为绕过 SPEC §7 backend whitelist。
pub const fn select_gpu_layers() -> u32 {
    #[cfg(target_os = "macos")]
    {
        u32::MAX
    }
    #[cfg(not(target_os = "macos"))]
    {
        0
    }
}

/// 加载完成的 runtime —— 持有 GGUF 模型 handle。生成 / 上下文 / 取消会在
/// 后续切片往这里挂。`backend` 是进程级单例，只持引用避免重复释放。
pub struct LlamaRuntime {
    backend: &'static LlamaBackend,
    model: LlamaModel,
    num_ctx: u32,
}

// LlamaModel 没实现 Debug。手写一个不打印模型内部的 Debug，避免日志意外
// dump 模型字节。
impl std::fmt::Debug for LlamaRuntime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LlamaRuntime")
            .field("num_ctx", &self.num_ctx)
            .field("backend", &"<LlamaBackend singleton>")
            .field("model", &"<LlamaModel handle>")
            .finish()
    }
}

impl LlamaRuntime {
    /// pre-FFI gates → backend init → model load。三道顺序错了会出现：
    /// - sha 在 RAM 之后：低 RAM 机器仍会读 3.5GB 文件再失败，浪费 IO
    /// - backend init 在 sha 之前：坏文件也会触发 C++ 初始化
    pub fn load<P: AsRef<Path>>(
        path: P,
        expected_sha256: &str,
        opts: LoadOptions,
        probe: &dyn MemoryProbe,
    ) -> AppResult<Arc<Self>> {
        let path = path.as_ref();

        // Gate 1: 廉价的 RAM 检查（µs 级，先做）
        resource_check(probe)?;

        // Gate 2: 流式 sha256（依赖磁盘 IO，但远比 FFI load 廉价）；
        // (path, size, mtime_ns) 命中缓存时跳过完整重算
        verify_gguf_checksum_cached(path, expected_sha256)?;

        // Gate 3: 进程级 backend 单例（C++ runtime 状态）
        let backend = ensure_backend()?;

        // 真正进 FFI：load_from_file 会 mmap 整个 GGUF
        let params = LlamaModelParams::default().with_n_gpu_layers(select_gpu_layers());
        let model = LlamaModel::load_from_file(backend, path, &params).map_err(|e| {
            AppError::ai_unavailable("AI 模型载入失败")
                .with_detail(format!("LlamaModel::load_from_file: {e}"))
                .with_retryable(false)
        })?;

        let runtime = Arc::new(Self {
            backend,
            model,
            num_ctx: opts.num_ctx,
        });

        if opts.register_global {
            // 注册到全局 registry（chat / generate 命令通过 `loaded_runtime()` 取）。
            // OnceLock::set 第二次会失败（已加载）—— 生产路径只 load 一次。
            let _ = LOADED_RUNTIME.set(runtime.clone());

            // 加载成功 —— 翻全局 ready 标志。健康检查后续轮询会立即看到 ready。
            mark_runtime_loaded();
        }

        Ok(runtime)
    }

    /// 暴露给后续切片（context / generate）使用的 model 引用。
    pub fn model(&self) -> &LlamaModel {
        &self.model
    }

    /// 暴露给后续切片创建 LlamaContext 时用。
    pub fn backend(&self) -> &'static LlamaBackend {
        self.backend
    }

    pub fn num_ctx(&self) -> u32 {
        self.num_ctx
    }

    /// 跑一次完整生成。每个 token 通过 `on_token` 同步回调；`cancel_token`
    /// 命中或达到 `options.max_tokens` 上限即停。
    ///
    /// FFI 路径未在单测覆盖（需要真实 Gemma GGUF）—— 集成 smoke 测试在
    /// `tests/llama_load_real.rs` 后续切片补充。
    pub fn generate<F>(
        &self,
        prompt: &str,
        options: crate::services::ai::generate::GenerateOptions,
        cancel: &tokio_util::sync::CancellationToken,
        on_token: F,
    ) -> AppResult<crate::services::ai::generate::GenerationOutcome>
    where
        F: FnMut(&str),
    {
        use crate::services::ai::generate::{run_generation_loop, LlamaTokenLoop};
        let mut source = LlamaTokenLoop::new(self.backend, &self.model, self.num_ctx, prompt)?;
        let effective_options = crate::services::ai::generate::GenerateOptions {
            max_tokens: options.max_tokens.min(source.remaining_generation_tokens()),
        };
        run_generation_loop(&mut source, effective_options, cancel, on_token)
    }
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

    // ---- LlamaRuntime::load gate-ordering tests --------------------------------
    // 这些测试不需要真实 GGUF —— 它们验证 pre-FFI gates 在 FFI 之前短路。
    // 真实模型加载走 #[ignore] 的 integration test（src-tauri/tests/llama_load_real.rs，
    // 后续切片创建）。

    #[test]
    fn load_short_circuits_on_low_ram_before_touching_file() {
        // 文件路径不存在 —— 如果 RAM gate 没先 fire，就会到 sha256 的"unreadable"路径
        let probe = FakeProbe {
            available: 1024, // < 6GB threshold
        };
        let bogus_path = std::path::PathBuf::from("/nonexistent/should-never-open.gguf");
        let err = LlamaRuntime::load(&bogus_path, HELLO_SHA256, LoadOptions::default(), &probe)
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
        assert!(
            err.detail
                .as_ref()
                .map(|d| d.contains("insufficient RAM"))
                .unwrap_or(false),
            "RAM gate must fire before file IO; got detail: {:?}",
            err.detail
        );
    }

    #[test]
    fn load_short_circuits_on_bad_sha_before_touching_backend() {
        let probe = FakeProbe {
            available: 16 * 1024 * 1024 * 1024,
        };
        let f = make_file(b"hello");
        let wrong_sha = "0".repeat(64);
        let err =
            LlamaRuntime::load(f.path(), &wrong_sha, LoadOptions::default(), &probe).unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
        assert!(
            err.detail
                .as_ref()
                .map(|d| d.contains("checksum mismatch"))
                .unwrap_or(false),
            "sha gate must fire before backend init / model load; got: {:?}",
            err.detail
        );
    }

    #[test]
    fn load_options_default_is_4096_ctx() {
        // SPEC §5 默认 num_ctx=4096
        assert_eq!(LoadOptions::default().num_ctx, 4096);
    }

    #[test]
    fn select_gpu_layers_is_all_on_macos_zero_elsewhere() {
        let layers = select_gpu_layers();
        #[cfg(target_os = "macos")]
        assert_eq!(layers, u32::MAX);
        #[cfg(not(target_os = "macos"))]
        assert_eq!(layers, 0);
    }

    // ---- SystemRamProbe tests ----------------------------------------------

    #[test]
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    fn system_ram_probe_returns_nonzero_on_supported_platforms() {
        // 任何能跑测试的开发机 / CI runner 都至少有 1 字节 RAM
        let probe = SystemRamProbe;
        let bytes = probe.available_ram_bytes();
        assert!(bytes > 0, "SystemRamProbe returned 0 on supported platform");
    }

    #[test]
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    fn system_ram_probe_returns_at_least_1_gib_on_supported_platforms() {
        // 任何现代开发 / CI 机至少 2GiB；用 1GiB 做下界放宽
        let probe = SystemRamProbe;
        let bytes = probe.available_ram_bytes();
        assert!(
            bytes >= 1 * 1024 * 1024 * 1024,
            "SystemRamProbe returned suspiciously low value: {bytes}"
        );
    }

    #[test]
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    fn system_ram_probe_is_clone_and_default_constructible() {
        // unit struct 用例：UI / IPC 命令需要默认构造
        let _: SystemRamProbe = SystemRamProbe;
        let _: SystemRamProbe = Default::default();
    }

    // ---- runtime_loaded flag -----------------------------------------------
    // IS_LOADED 是进程级全局，cargo test 并行调度下需要序列化对它的写访问。

    use std::sync::Mutex;
    static LOADED_FLAG_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn is_runtime_loaded_returns_false_initially() {
        let _g = LOADED_FLAG_LOCK.lock().unwrap();
        reset_runtime_loaded_for_tests();
        assert!(!is_runtime_loaded());
    }

    #[test]
    fn mark_runtime_loaded_flips_to_true() {
        let _g = LOADED_FLAG_LOCK.lock().unwrap();
        reset_runtime_loaded_for_tests();
        mark_runtime_loaded();
        assert!(is_runtime_loaded());
        reset_runtime_loaded_for_tests();
    }

    #[test]
    fn runtime_stays_unloaded_when_disabled() {
        let _g = LOADED_FLAG_LOCK.lock().unwrap();
        reset_runtime_loaded_for_tests();
        mark_runtime_loaded();
        assert!(
            !runtime_ready_for_settings(false),
            "ai_enabled=false 时必须把 runtime 视为未加载"
        );
        assert!(runtime_ready_for_settings(true));
        reset_runtime_loaded_for_tests();
    }

    #[test]
    fn reset_runtime_loaded_for_tests_clears_flag() {
        let _g = LOADED_FLAG_LOCK.lock().unwrap();
        mark_runtime_loaded();
        reset_runtime_loaded_for_tests();
        assert!(!is_runtime_loaded());
    }

    // ---- loaded_runtime() registry ----------------------------------------
    // OnceLock 不能 reset；本套测试只做 "未 load 时返回 None" 的不变量，避免
    // 污染全局状态。真 load + Some 路径在 ignored 集成测试中验证。

    #[test]
    fn loaded_runtime_returns_none_when_no_load_has_succeeded() {
        // 单测环境无 GGUF 文件 → load 必失败 → registry 维持 None
        let result = loaded_runtime();
        if result.is_some() {
            // 若 ignored 集成测试 "leak" 了状态进单测环境，这里说明测试隔离已破
            panic!(
                "LOADED_RUNTIME unexpectedly populated in unit test scope; \
                 some test (likely #[ignore]) called load() successfully without isolation"
            );
        }
    }

    #[test]
    fn loaded_runtime_consistent_with_is_runtime_loaded() {
        // 不变式：loaded_runtime().is_some() ⇒ is_runtime_loaded() === true
        // （反向不必：marker 早于 registry set 一行，理论上 is_loaded=true 时
        // registry 仍可能 None，但 v0.1 单进程一模型场景下这窗口可忽略）
        if loaded_runtime().is_some() {
            assert!(is_runtime_loaded());
        }
    }

    // ---- compute_gguf_sha256 tests --------------------------------------

    #[test]
    fn compute_gguf_sha256_matches_known_hash() {
        let f = make_file(b"hello");
        let sha = compute_gguf_sha256(f.path()).expect("compute");
        assert_eq!(sha, HELLO_SHA256);
    }

    #[test]
    fn compute_gguf_sha256_returns_lowercase_hex_64_chars() {
        let f = make_file(b"anything");
        let sha = compute_gguf_sha256(f.path()).expect("compute");
        assert_eq!(sha.len(), 64);
        assert!(sha
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn compute_gguf_sha256_errors_on_missing_file() {
        let missing = std::path::PathBuf::from("/nonexistent/x.gguf");
        let err = compute_gguf_sha256(&missing).unwrap_err();
        assert_eq!(err.code, ErrorCode::AiUnavailable);
    }

    #[test]
    fn compute_gguf_sha256_round_trips_with_verify() {
        // 自洽性：算出来的 sha 反过来 verify 必通过
        let f = make_file(b"some random content for round trip");
        let sha = compute_gguf_sha256(f.path()).expect("compute");
        assert!(verify_gguf_checksum(f.path(), &sha).is_ok());
    }
}
