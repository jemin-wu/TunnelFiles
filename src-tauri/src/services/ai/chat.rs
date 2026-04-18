//! Chat 流式推理（v0.1 stub）。
//!
//! 当前实现是 echo —— 字符级回放用户输入，演示完整事件流（`ai:thinking`
//! → 多个 `ai:token` → `ai:done`）。真正的 `LlamaRuntime::generate()`
//! 集成走 T1.3 slice 3，集成后只替换 `produce_response_chars()` 即可，
//! 事件契约不变。
//!
//! 事件命名常量集中在此模块，前端 `src/lib/ai.ts` 同步对照。

use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::models::ai_events::{AiDonePayload, AiThinkingPayload, AiTokenPayload};

pub const EVENT_THINKING: &str = "ai:thinking";
pub const EVENT_TOKEN: &str = "ai:token";
pub const EVENT_DONE: &str = "ai:done";
pub const EVENT_ERROR: &str = "ai:error";

/// stub 输出节奏：20ms / 字符 —— 模拟一个 ~50 token/s 的真实流式速度。
const STUB_TOKEN_INTERVAL: Duration = Duration::from_millis(20);

/// stub 实现：把用户输入回声回去，便于打通端到端 UI。
fn produce_response_chars(user_text: &str) -> Vec<String> {
    let banner = "Echo (stub, no model loaded yet): ";
    let combined = format!("{banner}{user_text}");
    combined.chars().map(|c| c.to_string()).collect()
}

/// 异步驱动 stub 流：先 emit `ai:thinking`，按节奏 emit `ai:token`，最后
/// `ai:done { truncated: false }`。emit 失败（窗口关闭等）时静默忽略。
pub async fn run_stub_stream(
    app: AppHandle,
    session_id: String,
    message_id: String,
    user_text: String,
) {
    let _ = app.emit(
        EVENT_THINKING,
        &AiThinkingPayload {
            session_id: session_id.clone(),
            message_id: message_id.clone(),
        },
    );

    let tokens = produce_response_chars(&user_text);
    for tok in tokens {
        tokio::time::sleep(STUB_TOKEN_INTERVAL).await;
        let _ = app.emit(
            EVENT_TOKEN,
            &AiTokenPayload {
                session_id: session_id.clone(),
                message_id: message_id.clone(),
                token: tok,
            },
        );
    }

    let _ = app.emit(
        EVENT_DONE,
        &AiDonePayload {
            session_id,
            message_id,
            truncated: false,
        },
    );
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
        // 多字节中文字符应该按 char 单位拆，不是 byte
        let chars = produce_response_chars("你好");
        // banner 长度 + 2 个中文字符
        let banner_chars = "Echo (stub, no model loaded yet): ".chars().count();
        assert_eq!(chars.len(), banner_chars + 2);
    }

    #[test]
    fn event_names_are_stable_constants() {
        // 防止有人不小心改了事件名打破前端订阅
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
}
