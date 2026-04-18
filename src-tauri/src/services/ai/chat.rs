//! Chat 流式推理 —— 自动选择真 LlamaRuntime 或 stub echo。
//!
//! 入口 `run_chat_stream` 在每条消息开始时检查 `loaded_runtime()`：
//! - `Some(runtime)`：走真路径 —— `spawn_blocking` 包 FFI generate，
//!   每 token emit `ai:token`；FFI 失败 emit `ai:error` 替代 `ai:done`
//! - `None`：走 stub —— 字符级回放用户输入（v0.1 模型未下载/未加载时
//!   仍能演示完整事件流）
//!
//! 共享部分（事件命名、cancel registry、ai:thinking / ai:done 包络）保留
//! 在本模块顶部，两条分支都复用。

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use crate::models::ai_events::{AiDonePayload, AiErrorPayload, AiThinkingPayload, AiTokenPayload};
use crate::models::error::AppError;
use crate::services::ai::generate::{GenerateOptions, GenerationOutcome};
use crate::services::ai::llama_runtime::{self, LlamaRuntime};

pub const EVENT_THINKING: &str = "ai:thinking";
pub const EVENT_TOKEN: &str = "ai:token";
pub const EVENT_DONE: &str = "ai:done";
pub const EVENT_ERROR: &str = "ai:error";

/// stub 输出节奏：20ms / 字符 —— 模拟一个 ~50 token/s 的真实流式速度。
const STUB_TOKEN_INTERVAL: Duration = Duration::from_millis(20);

// ---- Cancel registry --------------------------------------------------------

static CANCEL_REGISTRY: OnceLock<Mutex<HashMap<String, CancellationToken>>> = OnceLock::new();

fn registry() -> &'static Mutex<HashMap<String, CancellationToken>> {
    CANCEL_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 给一条 in-flight 消息注册 cancel token。返回的 token clone 可被流循环
/// 持有，原 token 留在 registry 等 `cancel_message` 调用。
pub fn register_cancel_token(message_id: &str) -> CancellationToken {
    let token = CancellationToken::new();
    registry()
        .lock()
        .expect("cancel registry poisoned")
        .insert(message_id.to_string(), token.clone());
    token
}

/// 流循环结束后清理 registry。在 `unregister_cancel_token` 后再调
/// `cancel_message` 不会有任何效果（返回 false）。
pub fn unregister_cancel_token(message_id: &str) {
    registry()
        .lock()
        .expect("cancel registry poisoned")
        .remove(message_id);
}

/// 触发指定 messageId 的 cancel。返回 true 表示找到并取消；false 表示
/// 该消息已结束 / 从未存在 —— 调用方可视为 noop（防 race）。
pub fn cancel_message(message_id: &str) -> bool {
    if let Some(token) = registry()
        .lock()
        .expect("cancel registry poisoned")
        .remove(message_id)
    {
        token.cancel();
        true
    } else {
        false
    }
}

#[cfg(test)]
fn registry_size() -> usize {
    registry().lock().expect("cancel registry poisoned").len()
}

// ---- Stream outcome 抽象（real / stub 共享） --------------------------------

#[derive(Debug, Clone)]
enum StreamOutcome {
    Done { canceled: bool, truncated: bool },
    Error(AppError),
}

// ---- Public entrypoint ------------------------------------------------------

/// chat send 命令调度的真异步入口。根据 runtime 加载状态分流。
pub async fn run_chat_stream(
    app: AppHandle,
    session_id: String,
    message_id: String,
    user_text: String,
) {
    let cancel_token = register_cancel_token(&message_id);

    let _ = app.emit(
        EVENT_THINKING,
        &AiThinkingPayload {
            session_id: session_id.clone(),
            message_id: message_id.clone(),
        },
    );

    let outcome = match llama_runtime::loaded_runtime() {
        Some(runtime) => {
            run_real_stream(
                app.clone(),
                runtime,
                session_id.clone(),
                message_id.clone(),
                user_text,
                cancel_token,
            )
            .await
        }
        None => {
            run_stub_stream(
                app.clone(),
                session_id.clone(),
                message_id.clone(),
                user_text,
                cancel_token,
            )
            .await
        }
    };

    match outcome {
        StreamOutcome::Done {
            canceled,
            truncated,
        } => {
            let _ = app.emit(
                EVENT_DONE,
                &AiDonePayload {
                    session_id,
                    message_id: message_id.clone(),
                    truncated,
                    canceled,
                },
            );
        }
        StreamOutcome::Error(error) => {
            let _ = app.emit(
                EVENT_ERROR,
                &AiErrorPayload {
                    session_id,
                    message_id: message_id.clone(),
                    error,
                },
            );
        }
    }

    unregister_cancel_token(&message_id);
}

// ---- Real path (FFI) --------------------------------------------------------

async fn run_real_stream(
    app: AppHandle,
    runtime: Arc<LlamaRuntime>,
    session_id: String,
    message_id: String,
    user_text: String,
    cancel_token: CancellationToken,
) -> StreamOutcome {
    // FFI 调用必须在 spawn_blocking —— llama.cpp 是 sync + blocking。
    // 闭包 move 进 worker 线程；token emit 通过 AppHandle clone（Send）。
    let session_id_for_cb = session_id.clone();
    let message_id_for_cb = message_id.clone();
    let app_for_cb = app.clone();
    let cancel_for_loop = cancel_token.clone();

    let join = tokio::task::spawn_blocking(move || {
        runtime.generate(
            &user_text,
            GenerateOptions::default(),
            &cancel_for_loop,
            |tok| {
                let _ = app_for_cb.emit(
                    EVENT_TOKEN,
                    &AiTokenPayload {
                        session_id: session_id_for_cb.clone(),
                        message_id: message_id_for_cb.clone(),
                        token: tok.to_string(),
                    },
                );
            },
        )
    })
    .await;

    match join {
        Ok(Ok(GenerationOutcome::Cancelled)) => StreamOutcome::Done {
            canceled: true,
            truncated: false,
        },
        Ok(Ok(GenerationOutcome::Truncated)) => StreamOutcome::Done {
            canceled: false,
            truncated: true,
        },
        Ok(Ok(GenerationOutcome::Completed)) => StreamOutcome::Done {
            canceled: false,
            truncated: false,
        },
        Ok(Err(app_err)) => StreamOutcome::Error(app_err),
        Err(join_err) => StreamOutcome::Error(
            AppError::ai_unavailable("AI 任务异常退出")
                .with_detail(format!("spawn_blocking join error: {join_err}"))
                .with_retryable(false),
        ),
    }
}

// ---- Stub path (model not loaded yet) ---------------------------------------

/// stub 实现：把用户输入回声回去，便于打通端到端 UI。
fn produce_response_chars(user_text: &str) -> Vec<String> {
    let banner = "Echo (stub, no model loaded yet): ";
    let combined = format!("{banner}{user_text}");
    combined.chars().map(|c| c.to_string()).collect()
}

async fn run_stub_stream(
    app: AppHandle,
    session_id: String,
    message_id: String,
    user_text: String,
    cancel_token: CancellationToken,
) -> StreamOutcome {
    let tokens = produce_response_chars(&user_text);
    let mut canceled = false;
    for tok in tokens {
        tokio::select! {
            _ = tokio::time::sleep(STUB_TOKEN_INTERVAL) => {
                let _ = app.emit(
                    EVENT_TOKEN,
                    &AiTokenPayload {
                        session_id: session_id.clone(),
                        message_id: message_id.clone(),
                        token: tok,
                    },
                );
            }
            _ = cancel_token.cancelled() => {
                canceled = true;
                break;
            }
        }
    }
    StreamOutcome::Done {
        canceled,
        truncated: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn produce_response_chars_starts_with_stub_banner() {
        let chars = produce_response_chars("hi");
        let joined: String = chars.join("");
        assert!(joined.starts_with("Echo (stub, no model loaded yet): "));
        assert!(joined.ends_with("hi"));
    }

    #[test]
    fn produce_response_chars_returns_one_string_per_unicode_char() {
        let chars = produce_response_chars("你好");
        let banner_chars = "Echo (stub, no model loaded yet): ".chars().count();
        assert_eq!(chars.len(), banner_chars + 2);
    }

    #[test]
    fn event_names_are_stable_constants() {
        assert_eq!(EVENT_THINKING, "ai:thinking");
        assert_eq!(EVENT_TOKEN, "ai:token");
        assert_eq!(EVENT_DONE, "ai:done");
        assert_eq!(EVENT_ERROR, "ai:error");
    }

    #[test]
    fn produce_response_chars_handles_empty_input() {
        let chars = produce_response_chars("");
        let joined: String = chars.join("");
        assert_eq!(joined, "Echo (stub, no model loaded yet): ");
    }

    // ---- Cancel registry tests --------------------------------------------

    #[test]
    fn register_then_cancel_returns_true() {
        let id = format!("test-msg-{}", uuid::Uuid::new_v4());
        let token = register_cancel_token(&id);
        assert!(!token.is_cancelled());
        assert!(cancel_message(&id));
        assert!(token.is_cancelled());
    }

    #[test]
    fn cancel_unknown_message_returns_false() {
        let id = format!("never-registered-{}", uuid::Uuid::new_v4());
        assert!(!cancel_message(&id));
    }

    #[test]
    fn cancel_message_removes_from_registry() {
        let id = format!("test-msg-{}", uuid::Uuid::new_v4());
        register_cancel_token(&id);
        let before = registry_size();
        cancel_message(&id);
        let after = registry_size();
        assert_eq!(after, before - 1);
    }

    #[test]
    fn unregister_after_completion_makes_cancel_noop() {
        let id = format!("test-msg-{}", uuid::Uuid::new_v4());
        let token = register_cancel_token(&id);
        unregister_cancel_token(&id);
        assert!(!cancel_message(&id));
        assert!(
            !token.is_cancelled(),
            "completion-time unregister must not cancel"
        );
    }

    #[test]
    fn double_register_replaces_previous_token() {
        let id = format!("test-msg-{}", uuid::Uuid::new_v4());
        let _t1 = register_cancel_token(&id);
        let _t2 = register_cancel_token(&id);
        assert!(cancel_message(&id));
        assert!(!cancel_message(&id), "second cancel finds nothing");
    }

    // ---- Stream outcome shape ---------------------------------------------

    #[test]
    fn stream_outcome_done_carries_canceled_and_truncated_flags() {
        // 用模式匹配验证三种 done 场景独立可区分（AppError 不实现 PartialEq，
        // 所以 enum 走模式匹配而非整体 ==）。
        let cases = [(true, false), (false, true), (false, false)];
        for (canceled, truncated) in cases {
            let outcome = StreamOutcome::Done {
                canceled,
                truncated,
            };
            match outcome {
                StreamOutcome::Done {
                    canceled: c,
                    truncated: t,
                } => {
                    assert_eq!(c, canceled);
                    assert_eq!(t, truncated);
                }
                StreamOutcome::Error(_) => panic!("expected Done variant"),
            }
        }
    }

    #[test]
    fn stream_outcome_error_carries_app_error() {
        let outcome = StreamOutcome::Error(AppError::ai_unavailable("boom"));
        match outcome {
            StreamOutcome::Error(e) => {
                assert_eq!(e.code, crate::models::error::ErrorCode::AiUnavailable);
            }
            _ => panic!("expected Error variant"),
        }
    }
}
