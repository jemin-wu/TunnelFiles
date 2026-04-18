//! 真实 GGUF 模型加载集成测试（T1.3 slice 5）。
//!
//! `#[ignore]`：默认不跑，避免 CI 没模型时假阳性。本机要跑：
//! ```
//! cargo test --test llama_load_real -- --ignored --nocapture
//! ```
//!
//! 当 T1.5 model_download 落地后，下载完即可在 dev 机器上跑这个测试
//! 验证完整 FFI 加载链路。golden-prompts 套件（`docs/llama-cpp-golden-prompts.md`）
//! 后续也会复用这里的加载入口。
//!
//! 测试**不**比对预期 SHA —— 它使用文件自身的 SHA 作为 expected，仅验证
//! load() 三道 gate + FFI 都能跑通；canonical SHA 校验是 T1.5 下载阶段的事。

use tunnelfiles_lib::services::ai::llama_runtime::{
    compute_gguf_sha256, LlamaRuntime, LoadOptions, SystemRamProbe,
};
use tunnelfiles_lib::services::ai::paths::model_file_path;

const MODEL_NAME: &str = "gemma4:e4b";

#[test]
#[ignore = "requires Gemma 4 E4B GGUF at the standard data_local_dir path; run with --ignored"]
fn load_real_gemma_when_present() {
    let path = match model_file_path(MODEL_NAME) {
        Some(p) => p,
        None => {
            eprintln!("SKIPPED: data_local_dir() unavailable on this platform");
            return;
        }
    };

    if !path.is_file() {
        eprintln!("SKIPPED: model file not present at {path:?}");
        eprintln!("  Download via T1.5 ai_model_download (TBD) or place manually.");
        return;
    }

    eprintln!("Computing SHA256 of {path:?} ...");
    let sha = compute_gguf_sha256(&path).expect("compute sha");
    eprintln!("SHA256: {sha}");

    let probe = SystemRamProbe;
    eprintln!("Loading model (Metal on macOS, CPU elsewhere) ...");
    let runtime = LlamaRuntime::load(&path, &sha, LoadOptions::default(), &probe)
        .expect("load real Gemma model");

    assert_eq!(runtime.num_ctx(), 4096);
    // model() / backend() 拿到非空引用即可证明 FFI 句柄有效
    let _ = runtime.model();
    let _ = runtime.backend();
    eprintln!("Load succeeded; runtime ready.");
}
