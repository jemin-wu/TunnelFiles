//! 生成循环编排（slice 3a）。
//!
//! `run_generation_loop` 是纯协调层：从 `TokenSource` 拉 token、检查
//! `CancellationToken`、计数到达 `max_tokens` 上限就截断。它对 llama.cpp
//! 一无所知 —— 真 FFI 实现的 `LlamaTokenSource` 在 slice 3b 落地。
//!
//! 这层独立的好处：
//! - cancel 边界、token cap 截断、自然 EOG 三种 outcome 全可单测，无需真模型
//! - FFI bug 与编排 bug 分离，上线后调试时 narrow 范围
//! - 未来换 backend（candle / mistral.rs / ...）只需新 `TokenSource` impl

use std::num::NonZeroU32;

use tokio_util::sync::CancellationToken;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::context::LlamaContext;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;

use crate::models::error::{AppError, AppResult};

/// 生成参数。
#[derive(Debug, Clone, Copy)]
pub struct GenerateOptions {
    /// 单次生成最多 emit 的 token 数。SPEC §5：硬 cap 防 OOM DoS。
    ///
    /// 1024 是 shell 辅助场景的实用上限：在 Gemma 4 E4B 的 8K context 预算下，
    /// 留给历史 ~5K 够 20+ 轮对话；真正需要长输出的场景（大段命令解释）也极少
    /// 超过 500-800 tokens。
    pub max_tokens: u32,
}

impl Default for GenerateOptions {
    fn default() -> Self {
        Self { max_tokens: 1024 }
    }
}

/// 生成结束原因。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GenerationOutcome {
    /// 模型自然 EOG（end-of-generation）。
    Completed,
    /// 触达 `max_tokens` 上限被截断。
    Truncated,
    /// `cancel_token` 命中，循环退出。
    Cancelled,
}

/// 抽象 token 源。生产实现 wrap `llama_cpp_2::context::LlamaContext` +
/// sampler；测试可用 `VecTokenSource` 喂死定 token 流。
///
/// 返回值语义：
/// - `Ok(Some(token))`：emit 一个 token 给上层
/// - `Ok(None)`：EOG，自然结束
/// - `Err(e)`：FFI 失败 / decode 错误，编排层立即冒泡终止生成
pub trait TokenSource {
    fn next_token(&mut self) -> AppResult<Option<String>>;
}

// ---- LlamaTokenLoop: 真 FFI TokenSource 实现 -------------------------------

/// 把 prompt feed 进 KV cache 后，按 token 边界 sample → detokenize → decode
/// 推进。生命周期 `'model` 绑死到 `LlamaModel` —— 由 `LlamaRuntime::generate`
/// 在调用栈上构造，确保 ctx 借用期内 model 不消失。
///
/// 默认 sampler 用 `LlamaSampler::greedy()` —— 决定性输出，方便 golden prompt
/// 回归套件比对。后续若要走 top-k / top-p / temperature，从 `Settings` 拉。
pub struct LlamaTokenLoop<'model> {
    model: &'model LlamaModel,
    ctx: LlamaContext<'model>,
    sampler: LlamaSampler,
    batch: LlamaBatch<'static>,
    decoder: encoding_rs::Decoder,
    num_ctx: u32,
    n_pos: i32,
    finished: bool,
    /// 流式未 flush 的字符缓冲。用于 stop-word 过滤 —— 某些 GGUF（特别是 unsloth
    /// 的 Gemma 4 E4B 量化）会把 `<eos>` / `<end_of_turn>` / `</start_of_turn>`
    /// 作为**字面文本**输出（不是 control tokens）。我们累积 pending，检测到
    /// 完整 stop pattern 就截断并终止；尾部有 stop 前缀的几字节暂不吐出，等
    /// 下一 token 再判定。
    pending: String,
}

/// 模型输出里需要截断的"特殊 token 文本泄漏"。所有值只含 ASCII，
/// [`unsafe_suffix_len`] 做字节级比对。
const STOP_PATTERNS: &[&str] = &[
    "<eos>",
    "<end_of_turn>",
    "<start_of_turn>",
    // 某些 Gemma 量化吐错的闭合语法
    "</start_of_turn>",
    "</end_of_turn>",
];

fn remaining_generation_slots(num_ctx: u32, prompt_tokens: usize) -> u32 {
    let prompt_tokens = u32::try_from(prompt_tokens).unwrap_or(u32::MAX);
    num_ctx.saturating_sub(prompt_tokens)
}

fn ensure_prompt_fits_context(prompt_tokens: usize, num_ctx: u32) -> AppResult<u32> {
    let remaining = remaining_generation_slots(num_ctx, prompt_tokens);
    if remaining == 0 {
        return Err(AppError::ai_unavailable("prompt exceeds context window")
            .with_detail(format!(
                "prompt uses {prompt_tokens} tokens but context window is only {num_ctx}"
            ))
            .with_retryable(false));
    }
    Ok(remaining)
}

fn context_params_for_num_ctx(num_ctx: u32) -> LlamaContextParams {
    LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(num_ctx))
        .with_n_batch(num_ctx.max(1))
}

impl<'model> LlamaTokenLoop<'model> {
    pub fn new(
        backend: &'static LlamaBackend,
        model: &'model LlamaModel,
        num_ctx: u32,
        prompt: &str,
    ) -> AppResult<Self> {
        if prompt.is_empty() {
            return Err(AppError::invalid_argument("prompt cannot be empty"));
        }

        // 1. tokenize。`prompt` 已由 `prompt::build` 渲染为 Gemma 4 chat
        //    template（`<start_of_turn>…<end_of_turn>` 对）。BOS 由 tokenizer
        //    的 `AddBos::Always` 自动加，不要在 template 字符串里手写 `<bos>`。
        //    自然 EOG：模型吐 `<end_of_turn>` 时 llama-cpp-2 的 `is_eog_token`
        //    会基于 GGUF 的 tokenizer 元数据返回 true，循环即退出。
        let tokens = model.str_to_token(prompt, AddBos::Always).map_err(|e| {
            AppError::ai_unavailable("tokenize failed")
                .with_detail(format!("str_to_token: {e}"))
                .with_retryable(false)
        })?;
        if tokens.is_empty() {
            return Err(AppError::ai_unavailable("empty token sequence")
                .with_detail("str_to_token returned 0 tokens".to_string())
                .with_retryable(false));
        }
        let n_prompt = tokens.len();
        ensure_prompt_fits_context(n_prompt, num_ctx)?;

        // 2. 创建 context（KV cache 上限 = num_ctx）。llama.cpp 默认 n_batch
        // 是 2048；我们会一次性 decode 整个 prompt，因此必须把 batch 上限
        // 对齐到 num_ctx，避免 2K+ prompt 触发 C++ abort。
        let ctx_params = context_params_for_num_ctx(num_ctx);
        let mut ctx = model.new_context(backend, ctx_params).map_err(|e| {
            AppError::ai_unavailable("context creation failed")
                .with_detail(format!("new_context: {e}"))
                .with_retryable(false)
        })?;

        // 3. 把 prompt 全推进 batch + decode（最后一个 token 要 logits 用于首次采样）
        let mut batch = LlamaBatch::new(n_prompt, 1);
        for (i, &tok) in tokens.iter().enumerate() {
            let is_last = i == n_prompt - 1;
            batch.add(tok, i as i32, &[0], is_last).map_err(|e| {
                AppError::ai_unavailable("batch add failed")
                    .with_detail(format!("batch.add prompt[{i}]: {e}"))
                    .with_retryable(false)
            })?;
        }
        ctx.decode(&mut batch).map_err(|e| {
            AppError::ai_unavailable("prompt decode failed")
                .with_detail(format!("ctx.decode: {e}"))
                .with_retryable(false)
        })?;

        Ok(Self {
            model,
            ctx,
            sampler: LlamaSampler::greedy(),
            batch,
            decoder: encoding_rs::UTF_8.new_decoder(),
            num_ctx,
            n_pos: n_prompt as i32,
            finished: false,
            pending: String::new(),
        })
    }

    pub fn remaining_generation_tokens(&self) -> u32 {
        self.num_ctx.saturating_sub(self.n_pos.max(0) as u32)
    }

    /// 推进一个 token：sample → detokenize → 喂回 batch → decode 下一次的 logits。
    /// 返回 None 表示模型自然 EOG；Some(piece) 是未加 stop-filter 的原始 piece。
    fn advance_one(&mut self) -> AppResult<Option<String>> {
        let last_idx = self.batch.n_tokens() - 1;
        let next = self.sampler.sample(&self.ctx, last_idx);

        if self.model.is_eog_token(next) {
            return Ok(None);
        }

        let piece = self
            .model
            .token_to_piece(next, &mut self.decoder, false, None)
            .map_err(|e| {
                AppError::ai_unavailable("detokenize failed")
                    .with_detail(format!("token_to_piece: {e}"))
                    .with_retryable(false)
            })?;

        self.batch.clear();
        self.batch.add(next, self.n_pos, &[0], true).map_err(|e| {
            AppError::ai_unavailable("batch add failed")
                .with_detail(format!("batch.add gen[{}]: {e}", self.n_pos))
                .with_retryable(false)
        })?;
        self.n_pos = self.n_pos.saturating_add(1);
        self.ctx.decode(&mut self.batch).map_err(|e| {
            AppError::ai_unavailable("decode failed")
                .with_detail(format!("ctx.decode pos={}: {e}", self.n_pos))
                .with_retryable(false)
        })?;

        Ok(Some(piece))
    }
}

impl<'model> TokenSource for LlamaTokenLoop<'model> {
    /// 流式缓冲 + stop-word 过滤。每次调用可能内部多次 `advance_one`：
    /// - 如果 `pending` 已经能安全吐出一段文本（后缀不是 stop pattern 前缀），立即返回
    /// - 如果命中 stop pattern，截断前置部分吐出，`finished=true`，下次返回 None
    /// - 如果自然 EOG，flush 剩余 pending 作为最后一次吐出
    fn next_token(&mut self) -> AppResult<Option<String>> {
        if self.finished {
            return Ok(None);
        }

        loop {
            match self.advance_one()? {
                None => {
                    // 自然 EOG。flush 剩余 pending（可能还有几个字节暂存在"不确定区"）。
                    self.finished = true;
                    let flushed = std::mem::take(&mut self.pending);
                    return Ok(if flushed.is_empty() {
                        None
                    } else {
                        Some(flushed)
                    });
                }
                Some(piece) => {
                    self.pending.push_str(&piece);
                }
            }

            // 命中完整 stop pattern：截断并结束流
            if let Some(pos) = first_stop_match(&self.pending) {
                self.finished = true;
                let flushed = self.pending[..pos].to_string();
                self.pending.clear();
                return Ok(if flushed.is_empty() {
                    None
                } else {
                    Some(flushed)
                });
            }

            // 安全区：吐出前面"确定不会构成 stop pattern 前缀"的部分。
            // 尾部可能是 stop pattern 的 prefix —— 留 suffix_len 字节继续观察。
            let suffix_len = unsafe_suffix_len(&self.pending);
            let safe_len = self.pending.len() - suffix_len;
            let cut = prev_char_boundary(&self.pending, safe_len);
            if cut > 0 {
                let emit: String = self.pending.drain(..cut).collect();
                return Ok(Some(emit));
            }
            // 否则 pending 还太短，继续下一轮拉 token
        }
    }
}

// ---- Stop-word filter（纯函数，便于单测） -----------------------------------

/// 在 `buf` 里找最早的完整 stop pattern 出现位置（字节 index）。没匹配返回 None。
fn first_stop_match(buf: &str) -> Option<usize> {
    STOP_PATTERNS.iter().filter_map(|p| buf.find(p)).min()
}

/// `buf` 的最长**后缀**，同时也是某个 stop pattern 的**前缀**的长度（字节）。
/// 这段尾巴不能立即 flush —— 再读几个 token 后可能变成完整 stop pattern。
///
/// 完整 stop pattern 的命中不在这里处理（交给 `first_stop_match`），所以当
/// `buf.len() >= pat.len()` 时上限取 `pat.len() - 1`（排除全长命中）；
/// 当 `buf.len() < pat.len()` 时上限取 `buf.len()`（尾部仍可能是完整前缀）。
fn unsafe_suffix_len(buf: &str) -> usize {
    let bytes = buf.as_bytes();
    let mut max_l = 0;
    for pat in STOP_PATTERNS {
        let pat_bytes = pat.as_bytes();
        let upper = (pat_bytes.len() - 1).min(bytes.len());
        for l in (1..=upper).rev() {
            if bytes.ends_with(&pat_bytes[..l]) {
                max_l = max_l.max(l);
                break;
            }
        }
    }
    max_l
}

/// 返回 `s` 中 `<=byte_pos` 的最大 char boundary（防 utf-8 切码点）。
fn prev_char_boundary(s: &str, byte_pos: usize) -> usize {
    let byte_pos = byte_pos.min(s.len());
    (0..=byte_pos)
        .rev()
        .find(|&i| s.is_char_boundary(i))
        .unwrap_or(0)
}

// ----------------------------------------------------------------------------

/// 跑生成循环。
///
/// 优先级（每个 token 边界检查一次）：
/// 1. cancel 命中 → `Cancelled`（最高优先；用户预期立即响应）
/// 2. emit 计数 ≥ max_tokens → `Truncated`（防 DoS 硬 cap）
/// 3. source 给 None → `Completed`（自然结束）
/// 4. 否则 emit token，计数 +1，下一轮
///
/// `on_token` 在每次 emit 时同步调用，调用方决定怎么处理（emit Tauri event
/// / 累加到 buffer / 等等）。
pub fn run_generation_loop<S, F>(
    source: &mut S,
    options: GenerateOptions,
    cancel: &CancellationToken,
    mut on_token: F,
) -> AppResult<GenerationOutcome>
where
    S: TokenSource,
    F: FnMut(&str),
{
    let mut emitted: u32 = 0;
    loop {
        if cancel.is_cancelled() {
            return Ok(GenerationOutcome::Cancelled);
        }
        if emitted >= options.max_tokens {
            return Ok(GenerationOutcome::Truncated);
        }
        match source.next_token()? {
            Some(t) => {
                on_token(&t);
                emitted = emitted.saturating_add(1);
            }
            None => return Ok(GenerationOutcome::Completed),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 单测用：把预定义 token 序列依次吐出。
    struct VecTokenSource {
        tokens: std::collections::VecDeque<String>,
    }

    impl VecTokenSource {
        fn new<I: IntoIterator<Item = &'static str>>(iter: I) -> Self {
            Self {
                tokens: iter.into_iter().map(String::from).collect(),
            }
        }
    }

    impl TokenSource for VecTokenSource {
        fn next_token(&mut self) -> AppResult<Option<String>> {
            Ok(self.tokens.pop_front())
        }
    }

    /// 第 N 次调用注入失败的 source —— 用于验证错误冒泡。
    struct FailingTokenSource {
        emit_before_failing: usize,
        called: usize,
    }

    impl TokenSource for FailingTokenSource {
        fn next_token(&mut self) -> AppResult<Option<String>> {
            self.called += 1;
            if self.called > self.emit_before_failing {
                Err(crate::models::error::AppError::ai_unavailable(
                    "stub decode failure",
                ))
            } else {
                Ok(Some(format!("t{}", self.called)))
            }
        }
    }

    fn collect<F: FnOnce(&mut Vec<String>)>(f: F) -> Vec<String> {
        let mut out = Vec::new();
        f(&mut out);
        out
    }

    #[test]
    fn options_default_max_tokens_is_1024() {
        // SPEC §5 硬 cap 不变量。shell 辅助场景常规输出 <500 tokens；
        // 8K context 下留给历史的空间不能被过大的输出预算挤掉。
        assert_eq!(GenerateOptions::default().max_tokens, 1024);
    }

    #[test]
    fn empty_source_returns_completed_immediately() {
        let mut src = VecTokenSource::new([]);
        let cancel = CancellationToken::new();
        let outcome =
            run_generation_loop(&mut src, GenerateOptions::default(), &cancel, |_| {}).expect("ok");
        assert_eq!(outcome, GenerationOutcome::Completed);
    }

    #[test]
    fn fully_emits_when_under_cap_and_not_cancelled() {
        let mut src = VecTokenSource::new(["He", "llo", " ", "World"]);
        let cancel = CancellationToken::new();
        let mut emitted = Vec::new();
        let outcome = run_generation_loop(
            &mut src,
            GenerateOptions { max_tokens: 100 },
            &cancel,
            |t| emitted.push(t.to_string()),
        )
        .expect("ok");
        assert_eq!(outcome, GenerationOutcome::Completed);
        assert_eq!(emitted, vec!["He", "llo", " ", "World"]);
    }

    #[test]
    fn truncates_when_emit_count_reaches_max_tokens() {
        let mut src = VecTokenSource::new(["a", "b", "c", "d", "e"]);
        let cancel = CancellationToken::new();
        let mut emitted = Vec::new();
        let outcome =
            run_generation_loop(&mut src, GenerateOptions { max_tokens: 3 }, &cancel, |t| {
                emitted.push(t.to_string())
            })
            .expect("ok");
        assert_eq!(outcome, GenerationOutcome::Truncated);
        assert_eq!(emitted, vec!["a", "b", "c"]);
    }

    #[test]
    fn truncates_at_zero_max_tokens_without_emitting() {
        let mut src = VecTokenSource::new(["a", "b"]);
        let cancel = CancellationToken::new();
        let mut emitted = Vec::new();
        let outcome =
            run_generation_loop(&mut src, GenerateOptions { max_tokens: 0 }, &cancel, |t| {
                emitted.push(t.to_string())
            })
            .expect("ok");
        assert_eq!(outcome, GenerationOutcome::Truncated);
        assert_eq!(emitted.len(), 0);
    }

    #[test]
    fn cancelled_before_first_token_returns_cancelled_no_emit() {
        let mut src = VecTokenSource::new(["a", "b"]);
        let cancel = CancellationToken::new();
        cancel.cancel();
        let mut emitted = Vec::new();
        let outcome = run_generation_loop(&mut src, GenerateOptions::default(), &cancel, |t| {
            emitted.push(t.to_string())
        })
        .expect("ok");
        assert_eq!(outcome, GenerationOutcome::Cancelled);
        assert_eq!(emitted.len(), 0);
    }

    #[test]
    fn cancel_takes_precedence_over_truncate_at_same_boundary() {
        // emitted == max_tokens AND cancel triggered: cancel wins (用户体验更直接)
        let mut src = VecTokenSource::new(["a"]);
        let cancel = CancellationToken::new();
        cancel.cancel();
        let outcome =
            run_generation_loop(&mut src, GenerateOptions { max_tokens: 0 }, &cancel, |_| {})
                .expect("ok");
        assert_eq!(outcome, GenerationOutcome::Cancelled);
    }

    #[test]
    fn cancellation_mid_stream_via_callback() {
        // 模拟流程：在第二个 token 后外部 cancel
        let mut src = VecTokenSource::new(["a", "b", "c", "d"]);
        let cancel = CancellationToken::new();
        let cancel_clone = cancel.clone();
        let mut emitted = Vec::new();
        let outcome = run_generation_loop(&mut src, GenerateOptions::default(), &cancel, |t| {
            emitted.push(t.to_string());
            if emitted.len() == 2 {
                cancel_clone.cancel();
            }
        })
        .expect("ok");
        assert_eq!(outcome, GenerationOutcome::Cancelled);
        // 已 emit 的 token 保留（流式写入下游已经发生）
        assert_eq!(emitted, vec!["a", "b"]);
    }

    #[test]
    fn multibyte_tokens_pass_through_unchanged() {
        // 中文 / emoji token 必须按 utf-8 串透传，不能切码点
        let mut src = VecTokenSource::new(["你好", "🌍", "！"]);
        let cancel = CancellationToken::new();
        let emitted = collect(|out| {
            run_generation_loop(&mut src, GenerateOptions::default(), &cancel, |t| {
                out.push(t.to_string())
            })
            .expect("ok");
        });
        assert_eq!(emitted, vec!["你好", "🌍", "！"]);
    }

    #[test]
    fn does_not_call_on_token_after_completed() {
        let mut src = VecTokenSource::new(["only"]);
        let cancel = CancellationToken::new();
        let mut count = 0;
        let outcome = run_generation_loop(&mut src, GenerateOptions::default(), &cancel, |_| {
            count += 1
        })
        .expect("ok");
        assert_eq!(outcome, GenerationOutcome::Completed);
        assert_eq!(
            count, 1,
            "callback should fire exactly once for one-token stream"
        );
    }

    #[test]
    fn source_error_propagates_to_caller() {
        // FFI decode 失败 → AppError 上抛 → 编排不再 emit 后续
        let mut src = FailingTokenSource {
            emit_before_failing: 2,
            called: 0,
        };
        let cancel = CancellationToken::new();
        let mut emitted = Vec::new();
        let result = run_generation_loop(&mut src, GenerateOptions::default(), &cancel, |t| {
            emitted.push(t.to_string())
        });
        assert!(result.is_err());
        // 已 emit 的 2 个 token 保留（流式下游已经收到，回滚不可能）
        assert_eq!(emitted, vec!["t1", "t2"]);
        assert_eq!(
            result.unwrap_err().code,
            crate::models::error::ErrorCode::AiUnavailable
        );
    }

    #[test]
    fn remaining_generation_slots_clamps_to_zero_when_prompt_overflows_context() {
        assert_eq!(remaining_generation_slots(4096, 4097), 0);
    }

    #[test]
    fn ensure_prompt_fits_context_rejects_prompt_that_fills_window() {
        let err = ensure_prompt_fits_context(4096, 4096).unwrap_err();
        assert_eq!(err.code, crate::models::error::ErrorCode::AiUnavailable);
        assert_eq!(err.message, "prompt exceeds context window");
        assert_eq!(err.retryable, Some(false));
        assert!(
            err.detail
                .as_ref()
                .is_some_and(|detail| detail.contains("prompt uses 4096 tokens")),
            "detail should explain the prompt/context sizes, got: {:?}",
            err.detail
        );
    }

    #[test]
    fn ensure_prompt_fits_context_returns_remaining_generation_budget() {
        assert_eq!(ensure_prompt_fits_context(4000, 4096).unwrap(), 96);
    }

    #[test]
    fn context_params_batch_matches_context_window() {
        let params = context_params_for_num_ctx(4096);
        assert_eq!(params.n_batch(), 4096);
    }

    // ---- stop-word filter pure functions ----

    #[test]
    fn first_stop_match_returns_none_when_clean() {
        assert_eq!(first_stop_match(""), None);
        assert_eq!(first_stop_match("df -h\n"), None);
        assert_eq!(first_stop_match("shell prompt discussion"), None);
    }

    #[test]
    fn first_stop_match_finds_exact_eos() {
        assert_eq!(first_stop_match("pwd\n<eos>trailing"), Some(4));
    }

    #[test]
    fn first_stop_match_returns_earliest_when_multiple() {
        // 同时存在 `<end_of_turn>` 和 `</start_of_turn>` —— 返回更早的那个
        let input = "a<end_of_turn>b</start_of_turn>";
        assert_eq!(first_stop_match(input), Some(1));
    }

    #[test]
    fn first_stop_match_finds_stop_at_start() {
        assert_eq!(first_stop_match("<eos>"), Some(0));
    }

    #[test]
    fn unsafe_suffix_len_zero_when_no_prefix_match() {
        assert_eq!(unsafe_suffix_len(""), 0);
        assert_eq!(unsafe_suffix_len("hello world"), 0);
        assert_eq!(unsafe_suffix_len("pwd\n"), 0);
    }

    #[test]
    fn unsafe_suffix_len_matches_partial_stop_prefix() {
        // "<eo" 是 "<eos>" / "<end_of_turn>" 的前缀
        assert_eq!(unsafe_suffix_len("pwd\n<eo"), 3);
        // "<" 是所有 stop pattern 的前缀
        assert_eq!(unsafe_suffix_len("pwd\n<"), 1);
        // "<end_of_tur" 是 "<end_of_turn>" 的前缀
        assert_eq!(unsafe_suffix_len("<end_of_tur"), 11);
    }

    #[test]
    fn unsafe_suffix_len_zero_when_complete_pattern_inside() {
        // 完整命中交给 first_stop_match 处理；这里只关心"真前缀"，
        // 完整字符串不算 unsafe suffix
        assert_eq!(unsafe_suffix_len("<eos>"), 0);
    }

    #[test]
    fn prev_char_boundary_clamps_to_end() {
        assert_eq!(prev_char_boundary("hello", 100), 5);
    }

    #[test]
    fn prev_char_boundary_snaps_back_from_utf8_midpoint() {
        // "你" is 3 bytes; byte 1 is mid-char, must snap to 0
        let s = "你好";
        assert_eq!(prev_char_boundary(s, 1), 0);
        assert_eq!(prev_char_boundary(s, 2), 0);
        assert_eq!(prev_char_boundary(s, 3), 3);
        assert_eq!(prev_char_boundary(s, 4), 3);
    }

    #[test]
    fn prev_char_boundary_handles_empty() {
        assert_eq!(prev_char_boundary("", 0), 0);
        assert_eq!(prev_char_boundary("", 10), 0);
    }

    #[test]
    fn stop_patterns_are_ascii_only() {
        // unsafe_suffix_len 做字节级比对；非 ASCII 会在 UTF-8 多字节处踩空
        for pat in STOP_PATTERNS {
            assert!(pat.is_ascii(), "stop pattern {pat:?} must be ASCII-only");
        }
    }

    // ---- stop-word filter end-to-end simulation ----

    /// 镜像 `LlamaTokenLoop::next_token` 的 buffer+filter 算法。输入 token piece
    /// 流，返回 (flushed_chunks, finished_early)。
    ///
    /// 不覆盖 FFI / batch / decode —— 只看字符串过滤层。
    fn simulate_filter(pieces: &[&str]) -> (Vec<String>, bool) {
        let mut pending = String::new();
        let mut emitted = Vec::new();
        let mut finished = false;
        for piece in pieces {
            pending.push_str(piece);
            if let Some(pos) = first_stop_match(&pending) {
                finished = true;
                let flushed = pending[..pos].to_string();
                pending.clear();
                if !flushed.is_empty() {
                    emitted.push(flushed);
                }
                break;
            }
            let suffix_len = unsafe_suffix_len(&pending);
            let safe_len = pending.len() - suffix_len;
            let cut = prev_char_boundary(&pending, safe_len);
            if cut > 0 {
                let emit: String = pending.drain(..cut).collect();
                emitted.push(emit);
            }
        }
        if !finished && !pending.is_empty() {
            emitted.push(std::mem::take(&mut pending));
        }
        (emitted, finished)
    }

    #[test]
    fn filter_passes_clean_text_unchanged() {
        let (chunks, finished) = simulate_filter(&["df", " -h", "\n"]);
        assert!(!finished);
        assert_eq!(chunks.concat(), "df -h\n");
    }

    #[test]
    fn filter_stops_at_eos_and_truncates_marker() {
        // 模型流：["pwd\n", "<", "eos>", "trailing"]
        let (chunks, finished) = simulate_filter(&["pwd\n", "<", "eos>", "trailing"]);
        assert!(finished, "filter should terminate on <eos>");
        let merged = chunks.concat();
        assert_eq!(merged, "pwd\n", "only pre-stop content should emit");
        assert!(!merged.contains("<eos>"));
        assert!(!merged.contains("trailing"));
    }

    #[test]
    fn filter_stops_at_split_end_of_turn() {
        // token 切分跨 pattern 边界：["sudo systemctl restart nginx", "<end_", "of_turn>"]
        let (chunks, finished) =
            simulate_filter(&["sudo systemctl restart nginx", "<end_", "of_turn>", "rest"]);
        assert!(finished);
        assert_eq!(chunks.concat(), "sudo systemctl restart nginx");
    }

    #[test]
    fn filter_stops_at_mismatched_closing_syntax() {
        // Gemma 4 有时吐错的 `</start_of_turn>` 闭合语法 —— 也要被拦
        let (chunks, finished) = simulate_filter(&["answer", "</start_of_turn>"]);
        assert!(finished);
        assert_eq!(chunks.concat(), "answer");
    }

    #[test]
    fn filter_does_not_emit_partial_stop_prefix_prematurely() {
        // pending 尾部 "<eo" 在被判定前不应作为独立 chunk emit；
        // 再收到 "llama" 后 "<eollama" 不再是 stop 前缀，一次性 flush。
        let (chunks, finished) = simulate_filter(&["hello", "<eo", "llama"]);
        assert!(!finished);
        // 整体内容完整
        assert_eq!(chunks.concat(), "hello<eollama");
        // 但 "<eo" 本身不作为独立 chunk emit
        assert!(!chunks.iter().any(|c| c == "<eo"));
    }

    #[test]
    fn filter_flushes_harmless_leading_angle_bracket() {
        // "<" 后面跟正常文本（不是 stop pattern）→ 最终都吐出
        let (chunks, finished) = simulate_filter(&["file <", "path>"]);
        assert!(!finished);
        assert_eq!(chunks.concat(), "file <path>");
    }

    #[test]
    fn filter_preserves_multibyte_utf8_across_buffer() {
        // 中文字符 3 字节；确保 prev_char_boundary 不把 "你" 切开
        let (chunks, _finished) = simulate_filter(&["查看", "目录", "<end_of_turn>"]);
        let merged = chunks.concat();
        assert_eq!(merged, "查看目录");
    }

    #[test]
    fn filter_flushes_residual_on_natural_end_without_stop() {
        // 流自然结束时，pending 里的未 flush 尾巴要一次性吐完
        let (chunks, finished) = simulate_filter(&["pwd", " && ", "echo ", "<"]);
        assert!(!finished);
        assert_eq!(chunks.concat(), "pwd && echo <");
    }

    #[test]
    fn filter_handles_stop_at_very_start() {
        // 流一开始就是 stop → 立即结束，零吐出
        let (chunks, finished) = simulate_filter(&["<eos>", "anything"]);
        assert!(finished);
        assert_eq!(chunks.concat(), "");
    }
}
