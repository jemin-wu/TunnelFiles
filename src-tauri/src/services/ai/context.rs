//! Terminal context snapshot for AI chat (plan.md T1.7).
//!
//! 纯函数层：把 session 初始 home_path 和 terminal 的 recent_output 环形缓冲
//! （见 T1.0a）拼成发给前端 / 注入 prompt 的 snapshot。IPC 胶水在
//! `commands::ai::ai_context_snapshot`。
//!
//! 安全策略（SPEC §5）：
//! - `recent_output` 走 `scrubber::redact_probe_output` 硬擦（正则 + entropy）
//! - 环形缓冲若填满（≥ LINE_TRUNCATE_THRESHOLD），首行可能被切半，丢到第一个
//!   `\n` 之后以对齐行边界
//! - `pwd` 当前承载 session 初始 home_path（v0.1 不跟踪 live cwd）；AI 应优先
//!   从 `recent_output` 里的 shell prompt 推真实 cwd

use crate::commands::ai::AiContextSnapshotResult;
use crate::services::ai::prompt::ContextSnapshot;
use crate::services::ai::scrubber;

/// 行边界对齐触发阈值 —— 与 `terminal_manager::RECENT_OUTPUT_CAP` 保持一致。
/// 独立声明避免模块循环依赖，单元测试直接验证此阈值行为即可。
const LINE_TRUNCATE_THRESHOLD: usize = 8192;

/// 纯函数：由原始 home_path 和 PTY 字节组装 snapshot 结果。
///
/// 该函数是后端 scrubber 防线的**唯一**入口 —— 任何 recent_output 数据在
/// 成为前端 / LLM 可见结果前，必须经此路径。
pub fn compose_snapshot(
    session_id: String,
    home_path: String,
    raw_output: Vec<u8>,
) -> AiContextSnapshotResult {
    let text = String::from_utf8_lossy(&raw_output).into_owned();
    let aligned = align_to_line_boundary(&text);
    let scrubbed = scrubber::redact_probe_output(&aligned);
    AiContextSnapshotResult {
        session_id,
        pwd: home_path,
        recent_output: scrubbed,
    }
}

/// 把 IPC 形状的 snapshot 转成 prompt 组装用的 `ContextSnapshot`。
///
/// pwd 和 recent_output 都空时返回 `None` —— 调用方据此决定是否注入 context 块；
/// 任一有内容则原样传入。不重复跑 scrubber：`compose_snapshot` 已经擦过。
pub fn to_prompt_snapshot(result: &AiContextSnapshotResult) -> Option<ContextSnapshot> {
    if result.pwd.is_empty() && result.recent_output.is_empty() {
        None
    } else {
        Some(ContextSnapshot {
            pwd: result.pwd.clone(),
            recent_output: result.recent_output.clone(),
        })
    }
}

/// 若文本长度达 `LINE_TRUNCATE_THRESHOLD`，去除第一个 `\n` 之前的内容并
/// 丢弃该 `\n`；否则原样返回。单行超长（无 `\n`）退化时原样返回，不丢整块。
pub fn align_to_line_boundary(text: &str) -> String {
    if text.len() < LINE_TRUNCATE_THRESHOLD {
        return text.to_string();
    }
    match text.find('\n') {
        Some(idx) => text[idx + 1..].to_string(),
        None => text.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn align_to_line_boundary_leaves_short_text_untouched() {
        let input = "line1\nline2\nline3";
        assert_eq!(align_to_line_boundary(input), input);
    }

    #[test]
    fn align_to_line_boundary_returns_empty_for_empty() {
        assert_eq!(align_to_line_boundary(""), "");
    }

    #[test]
    fn align_to_line_boundary_keeps_full_text_when_under_threshold() {
        // 正好在阈值下一字节
        let input = "a".repeat(LINE_TRUNCATE_THRESHOLD - 1);
        assert_eq!(align_to_line_boundary(&input), input);
    }

    #[test]
    fn align_to_line_boundary_drops_partial_first_line_at_threshold() {
        // 首行残缺场景：half-A + \n + full-B lines
        let partial = "partial-cut-line";
        let complete_tail = "b".repeat(LINE_TRUNCATE_THRESHOLD);
        let full = format!("{partial}\n{complete_tail}");
        assert!(full.len() >= LINE_TRUNCATE_THRESHOLD);
        let out = align_to_line_boundary(&full);
        assert!(!out.contains(partial), "partial first line must be dropped");
        assert!(out.starts_with(&complete_tail[..10]));
    }

    #[test]
    fn align_to_line_boundary_keeps_single_huge_line_when_no_newline() {
        // 无换行的整块大输出：不硬丢，留给 scrubber 和下游决策
        let input = "x".repeat(LINE_TRUNCATE_THRESHOLD + 100);
        assert_eq!(align_to_line_boundary(&input), input);
    }

    #[test]
    fn compose_snapshot_populates_all_fields() {
        let result = compose_snapshot(
            "sess-1".into(),
            "/home/alice".into(),
            b"ls\nfile1 file2\n".to_vec(),
        );
        assert_eq!(result.session_id, "sess-1");
        assert_eq!(result.pwd, "/home/alice");
        assert_eq!(result.recent_output, "ls\nfile1 file2\n");
    }

    #[test]
    fn compose_snapshot_accepts_empty_inputs() {
        let result = compose_snapshot(String::new(), String::new(), Vec::new());
        assert_eq!(result.session_id, "");
        assert_eq!(result.pwd, "");
        assert_eq!(result.recent_output, "");
    }

    #[test]
    fn compose_snapshot_tolerates_invalid_utf8_bytes() {
        // PTY 输出可能包含非 UTF-8 字节序列（截断的多字节字符等）
        let bytes = vec![b'o', b'k', 0xFF, 0xFE, b'\n'];
        let result = compose_snapshot("s".into(), "/".into(), bytes);
        // 不 panic；lossy 解码产生 U+FFFD 替换字符
        assert!(result.recent_output.contains("ok"));
    }

    #[test]
    fn compose_snapshot_scrubs_pem_in_recent_output() {
        let pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAABODY\n-----END RSA PRIVATE KEY-----";
        let result = compose_snapshot("s".into(), "/".into(), pem.as_bytes().to_vec());
        assert!(
            !result.recent_output.contains("MIIEowIBAABODY"),
            "PEM body must be scrubbed from snapshot"
        );
        assert!(result
            .recent_output
            .contains(scrubber::REDACTED_PLACEHOLDER));
    }

    #[test]
    fn compose_snapshot_scrubs_aws_access_key_in_recent_output() {
        let raw = b"DEBUG: key=AKIAIOSFODNN7EXAMPLE was loaded\n".to_vec();
        let result = compose_snapshot("s".into(), "/".into(), raw);
        assert!(
            !result.recent_output.contains("AKIAIOSFODNN7EXAMPLE"),
            "AWS key must be scrubbed from snapshot"
        );
    }

    #[test]
    fn compose_snapshot_does_not_scrub_pwd() {
        // pwd 不走 probe-output scrubber —— 它来自 session 本身（可信）
        let result = compose_snapshot(
            "s".into(),
            "/home/user-AKIAIOSFODNN7EXAMPLE".into(),
            Vec::new(),
        );
        // 现场决定：pwd 直接透传（session.home_path 不可能含凭据；若未来 pwd
        // 来源改变，此测试作为提醒需同步评估）
        assert_eq!(result.pwd, "/home/user-AKIAIOSFODNN7EXAMPLE");
    }

    #[test]
    fn to_prompt_snapshot_returns_none_when_both_empty() {
        let result = AiContextSnapshotResult {
            session_id: "s".into(),
            pwd: String::new(),
            recent_output: String::new(),
        };
        assert!(to_prompt_snapshot(&result).is_none());
    }

    #[test]
    fn to_prompt_snapshot_returns_some_when_only_pwd_set() {
        let result = AiContextSnapshotResult {
            session_id: "s".into(),
            pwd: "/home".into(),
            recent_output: String::new(),
        };
        let snap = to_prompt_snapshot(&result).expect("some");
        assert_eq!(snap.pwd, "/home");
        assert_eq!(snap.recent_output, "");
    }

    #[test]
    fn to_prompt_snapshot_returns_some_when_only_recent_output_set() {
        let result = AiContextSnapshotResult {
            session_id: "s".into(),
            pwd: String::new(),
            recent_output: "ls".into(),
        };
        let snap = to_prompt_snapshot(&result).expect("some");
        assert_eq!(snap.recent_output, "ls");
    }

    #[test]
    fn to_prompt_snapshot_preserves_already_scrubbed_content() {
        // compose_snapshot 已经跑过 scrubber；to_prompt_snapshot 不二次跑
        let result = AiContextSnapshotResult {
            session_id: "s".into(),
            pwd: "/home".into(),
            recent_output: format!("safe text {}", scrubber::REDACTED_PLACEHOLDER),
        };
        let snap = to_prompt_snapshot(&result).expect("some");
        assert!(snap.recent_output.contains(scrubber::REDACTED_PLACEHOLDER));
    }

    #[test]
    fn compose_snapshot_applies_line_alignment_before_scrubbing() {
        // 环形缓冲填满导致首行被切 + 首行里藏 partial AWS key（scrubber 不应被
        // 对齐前的内容打扰；对齐后残留部分仍走 scrubber）
        let partial_with_key_fragment = "XXXIAIOSFODNN7EXAMPLE-truncated";
        let safe_tail = "b".repeat(LINE_TRUNCATE_THRESHOLD);
        let raw = format!("{partial_with_key_fragment}\n{safe_tail}").into_bytes();
        let result = compose_snapshot("s".into(), "/".into(), raw);
        // 残行（含伪 key fragment）应被行对齐丢掉
        assert!(!result.recent_output.contains("XXXIAIOSFODNN7EXAMPLE"));
        // 有效尾部保留
        assert!(result.recent_output.starts_with("bb"));
    }
}
