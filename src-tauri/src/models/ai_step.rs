use serde::{Deserialize, Serialize};
#[cfg(test)]
use ts_rs::TS;

/// 单个步骤的类别。v0.2 只有 probe/write；v0.3 起补 verify；v0.3a 扩 action。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "lowercase")]
pub enum AiStepKind {
    #[default]
    Probe,
    Write,
    Verify,
    Action,
}

/// 单步执行状态。Planner 状态机会在 T3.4 消费这些离散状态。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "snake_case")]
pub enum AiStepStatus {
    #[default]
    Pending,
    Running,
    AwaitingConfirm,
    Executing,
    Verifying,
    Done,
    Failed,
    Canceled,
    RolledBack,
}

/// 内置 verify 模板。`Custom(cmd)` 保留给 v0.3 自定义 verify 命令，但执行前仍
/// 必须再次过 allowlist。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "snake_case")]
pub enum AiVerifyTemplate {
    NginxCheck,
    SystemctlIsActive,
    CurlHead,
    Custom(String),
}

/// 计划中的单个步骤。字段默认值保证能兼容 v0.2 的极简 JSON：
/// `{"kind":"probe","command":"..."}` / `{"kind":"write","path":"...","content":"..."}`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export))]
#[serde(rename_all = "camelCase")]
pub struct AiStep {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub kind: AiStepKind,
    #[serde(default)]
    pub status: AiStepStatus,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default)]
    pub target_files: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verify_template: Option<AiVerifyTemplate>,
    #[serde(default)]
    pub expected_observation: String,
}

impl AiStep {
    pub fn probe(command: impl Into<String>) -> Self {
        Self {
            kind: AiStepKind::Probe,
            command: command.into(),
            ..Default::default()
        }
    }

    pub fn write(path: impl Into<String>, content: impl Into<String>) -> Self {
        let path = path.into();
        Self {
            kind: AiStepKind::Write,
            path: Some(path.clone()),
            content: Some(content.into()),
            target_files: vec![path],
            ..Default::default()
        }
    }

    pub fn verify(template: AiVerifyTemplate) -> Self {
        Self {
            kind: AiStepKind::Verify,
            verify_template: Some(template),
            ..Default::default()
        }
    }

    pub fn action(command: impl Into<String>) -> Self {
        Self {
            kind: AiStepKind::Action,
            command: command.into(),
            ..Default::default()
        }
    }

    /// 兼容 v0.2 的 write 结构：若缺 `targetFiles`，退回到 `path`。
    pub fn normalize(&mut self) {
        if self.kind == AiStepKind::Write && self.target_files.is_empty() {
            if let Some(path) = &self.path {
                self.target_files.push(path.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_step_normalize_backfills_target_files_from_path() {
        let mut step = AiStep {
            kind: AiStepKind::Write,
            path: Some("/etc/nginx/nginx.conf".to_string()),
            content: Some("events {}".to_string()),
            ..Default::default()
        };
        step.normalize();
        assert_eq!(step.target_files, vec!["/etc/nginx/nginx.conf"]);
    }

    #[test]
    fn custom_verify_template_deserializes_from_enum_object() {
        let step: AiStep = serde_json::from_str(
            r#"{"kind":"verify","verifyTemplate":{"custom":"systemctl is-active nginx"}}"#,
        )
        .unwrap();
        assert_eq!(
            step.verify_template,
            Some(AiVerifyTemplate::Custom(
                "systemctl is-active nginx".to_string()
            ))
        );
    }

    #[test]
    fn action_step_deserializes_from_command_shape() {
        let step: AiStep =
            serde_json::from_str(r#"{"kind":"action","command":"nginx -s reload"}"#).unwrap();
        assert_eq!(step.kind, AiStepKind::Action);
        assert_eq!(step.command, "nginx -s reload");
    }
}
