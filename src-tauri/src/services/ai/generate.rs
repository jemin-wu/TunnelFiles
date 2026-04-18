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

use tokio_util::sync::CancellationToken;

use crate::models::error::AppResult;

/// 生成参数。
#[derive(Debug, Clone, Copy)]
pub struct GenerateOptions {
    /// 单次生成最多 emit 的 token 数。SPEC §5：硬 cap 4096，防 OOM DoS。
    pub max_tokens: u32,
}

impl Default for GenerateOptions {
    fn default() -> Self {
        Self { max_tokens: 4096 }
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
    fn options_default_max_tokens_is_4096() {
        // SPEC §5 硬 cap 不变量
        assert_eq!(GenerateOptions::default().max_tokens, 4096);
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
}
