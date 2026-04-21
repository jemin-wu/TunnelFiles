//! AI plan JSON schema 解析（T2.9 / SPEC §5 v0.2）。
//!
//! LLM 在 `PromptMode::Plan` 下输出纯 JSON plan：
//! `{ "steps": [{ "kind": "probe", "command": "..." }, ...] }`
//!
//! `parse_plan_response` 容忍常见格式噪音（markdown fences、前后空格）并返回
//! typed `AiPlan`，失败时返回 `Err(String)` 由调用方决定重试（最多 `PLAN_MAX_RETRIES` 次）。

use serde::{Deserialize, Serialize};

/// 最多重试解析次数（不含首次）。
pub const PLAN_MAX_RETRIES: u32 = 2;

/// 一个执行计划，包含有序步骤列表。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AiPlan {
    pub steps: Vec<AiPlanStep>,
}

/// 计划中的单个步骤。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AiPlanStep {
    /// 只读探针命令（cat/ls/ps/df 等）。
    Probe { command: String },
    /// 文件写入（覆盖）。
    Write { path: String, content: String },
}

/// 从 LLM 原始输出解析 `AiPlan`。
///
/// 容忍：
/// - ` ``` json ... ``` ` markdown fences
/// - 首尾空白
/// - JSON 后跟随的额外文本（截取到第一个顶层 `}` 为止）
///
/// 失败时返回 `Err(String)` 描述原因，调用方可按 `PLAN_MAX_RETRIES` 重试。
pub fn parse_plan_response(raw: &str) -> Result<AiPlan, String> {
    let trimmed = raw.trim();

    // 剥离 markdown 代码围栏（```json ... ``` 或 ``` ... ```）
    let json_str = if let Some(inner) = strip_fence(trimmed) {
        inner.trim()
    } else {
        trimmed
    };

    // 截取到首个完整 JSON 对象（`{` ... `}`），丢弃尾部杂文
    let json_str = extract_first_object(json_str).unwrap_or(json_str);

    serde_json::from_str::<AiPlan>(json_str)
        .map_err(|e| format!("plan JSON parse error: {e}\nraw input: {raw}"))
}

fn strip_fence(s: &str) -> Option<&str> {
    let s = if s.starts_with("```json") {
        &s["```json".len()..]
    } else if s.starts_with("```") {
        &s["```".len()..]
    } else {
        return None;
    };
    // 去掉可能的换行
    let s = s.trim_start_matches('\n');
    // 找结尾 ```
    if let Some(end) = s.rfind("```") {
        Some(&s[..end])
    } else {
        Some(s)
    }
}

/// 提取字符串中第一个平衡 `{...}` 对象子串（简单栈计数，不处理字符串内括号）。
fn extract_first_object(s: &str) -> Option<&str> {
    let start = s.find('{')?;
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escape = false;
    let bytes = s.as_bytes();
    for (i, &b) in bytes[start..].iter().enumerate() {
        if escape {
            escape = false;
            continue;
        }
        match b {
            b'\\' if in_string => escape = true,
            b'"' => in_string = !in_string,
            b'{' if !in_string => depth += 1,
            b'}' if !in_string => {
                depth -= 1;
                if depth == 0 {
                    return Some(&s[start..=start + i]);
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe(cmd: &str) -> AiPlanStep {
        AiPlanStep::Probe {
            command: cmd.to_string(),
        }
    }

    fn write_step(path: &str, content: &str) -> AiPlanStep {
        AiPlanStep::Write {
            path: path.to_string(),
            content: content.to_string(),
        }
    }

    #[test]
    fn parse_minimal_probe_plan() {
        let raw = r#"{"steps":[{"kind":"probe","command":"cat /etc/nginx/nginx.conf"}]}"#;
        let plan = parse_plan_response(raw).unwrap();
        assert_eq!(plan.steps, vec![probe("cat /etc/nginx/nginx.conf")]);
    }

    #[test]
    fn parse_probe_and_write_plan() {
        let raw = r#"{
            "steps": [
                {"kind": "probe", "command": "cat /etc/nginx/nginx.conf"},
                {"kind": "write", "path": "/etc/nginx/nginx.conf", "content": "server { listen 80; }"}
            ]
        }"#;
        let plan = parse_plan_response(raw).unwrap();
        assert_eq!(
            plan.steps,
            vec![
                probe("cat /etc/nginx/nginx.conf"),
                write_step("/etc/nginx/nginx.conf", "server { listen 80; }"),
            ]
        );
    }

    #[test]
    fn parse_with_markdown_json_fence() {
        let raw = "```json\n{\"steps\":[{\"kind\":\"probe\",\"command\":\"df -h\"}]}\n```";
        let plan = parse_plan_response(raw).unwrap();
        assert_eq!(plan.steps, vec![probe("df -h")]);
    }

    #[test]
    fn parse_with_plain_code_fence() {
        let raw = "```\n{\"steps\":[{\"kind\":\"probe\",\"command\":\"ps aux\"}]}\n```";
        let plan = parse_plan_response(raw).unwrap();
        assert_eq!(plan.steps, vec![probe("ps aux")]);
    }

    #[test]
    fn parse_with_trailing_text_after_json() {
        let raw = r#"{"steps":[{"kind":"probe","command":"ls /"}]} Here is my plan."#;
        let plan = parse_plan_response(raw).unwrap();
        assert_eq!(plan.steps, vec![probe("ls /")]);
    }

    #[test]
    fn parse_empty_steps_is_valid() {
        let raw = r#"{"steps":[]}"#;
        let plan = parse_plan_response(raw).unwrap();
        assert!(plan.steps.is_empty());
    }

    #[test]
    fn parse_invalid_json_returns_err() {
        let raw = "not json at all";
        assert!(parse_plan_response(raw).is_err());
    }

    #[test]
    fn parse_unknown_step_kind_returns_err() {
        let raw = r#"{"steps":[{"kind":"delete","path":"/etc/passwd"}]}"#;
        assert!(parse_plan_response(raw).is_err());
    }

    #[test]
    fn plan_max_retries_constant_is_two() {
        assert_eq!(PLAN_MAX_RETRIES, 2);
    }
}
