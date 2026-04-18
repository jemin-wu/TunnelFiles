//! Chat 流式推理（v0.1 stub）。
//!
//! 当前实现是 echo —— 字符级回放用户输入，演示完整事件流（`ai:thinking`
//! → 多个 `ai:token` → `ai:done`）。真正的 `LlamaRuntime::generate()`
//! 集成走 T1.3 slice 3，集成后只替换 `produce_response_chars()` 即可，
//! 事件契约不变。
//!
//! 取消机制：`register_cancel_token` 在每次 stream 启动时注册一个
//! `CancellationToken`，命令层 `ai_chat_cancel(messageId)` 通过
//! `cancel_message` 触发。流循环在 `tokio::select!` 中检查 token，
//! 命中即 emit `ai:done { canceled: true }` 并退出。
//!
//! 事件命名常量集中在此模块，前端 `src/lib/ai.ts` 同步对照。

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use crate::models::ai_events::{AiDonePayload, AiThinkingPayload, AiTokenPayload};

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

// ---- Stub stream ------------------------------------------------------------

/// stub 实现：把用户输入回声回去，便于打通端到端 UI。
fn produce_response_chars(user_text: &str) -> Vec<String> {
    let banner = "Echo (stub, no model loaded yet): ";
    let combined = format!("{banner}{user_text}");
    combined.chars().map(|c| c.to_string()).collect()
}

/// 异步驱动 stub 流。emit 失败（窗口关闭等）静默忽略 —— 不重试也不
/// 阻塞，按 fire-and-forget 处理。
pub async fn run_stub_stream(
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

    let _ = app.emit(
        EVENT_DONE,
        &AiDonePayload {
            session_id,
            message_id: message_id.clone(),
            truncated: false,
            canceled,
        },
    );

    unregister_cancel_token(&message_id);
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
        // 同 messageId 重复注册（不应发生但要稳健）—— 后注册的覆盖前者
        let id = format!("test-msg-{}", uuid::Uuid::new_v4());
        let _t1 = register_cancel_token(&id);
        let _t2 = register_cancel_token(&id);
        // cancel_message 取出当前 registry 里的（即 t2），t1 不变
        assert!(cancel_message(&id));
        assert!(!cancel_message(&id), "second cancel finds nothing");
    }
}
