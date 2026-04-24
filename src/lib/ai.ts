/**
 * AI IPC wrapper
 *
 * Thin, timedInvoke + Zod layer over the `commands::ai::*` endpoints.
 * Every call goes through this file — direct `invoke()` from components
 * violates `.claude/rules/stack-tauri.md`.
 */

import { z } from "zod";
import { parseInvokeResult, timedInvoke } from "./error";
import type { AiHealthResult } from "@/types/bindings/AiHealthResult";
import type { AiChatSendResult } from "@/types/bindings/AiChatSendResult";
import type { ChatHistoryTurn } from "@/types/bindings/ChatHistoryTurn";
import type { AiChatCancelResult } from "@/types/bindings/AiChatCancelResult";
import type { AiContextSnapshotResult } from "@/types/bindings/AiContextSnapshotResult";
import type { AiPlan } from "@/types/bindings/AiPlan";
import type { AiPlanCreateResult } from "@/types/bindings/AiPlanCreateResult";
import type { AiPlanRollbackResult } from "@/types/bindings/AiPlanRollbackResult";
import type { AiPlanStepReviseInput } from "@/types/bindings/AiPlanStepReviseInput";
import type { AiPlanStepResult } from "@/types/bindings/AiPlanStepResult";
import type { AiModelDeleteResult } from "@/types/bindings/AiModelDeleteResult";
import type { AiModelDownloadCancelResult } from "@/types/bindings/AiModelDownloadCancelResult";
import type { Settings } from "@/types/settings";

// ============================================================================
// Schemas
// ============================================================================

const AcceleratorKindSchema = z.enum(["metal", "cpu", "none"]);
const AiStepKindSchema = z.enum(["probe", "write", "verify", "action"]);
const AiStepStatusSchema = z.enum([
  "pending",
  "running",
  "awaiting_confirm",
  "executing",
  "verifying",
  "done",
  "failed",
  "canceled",
  "rolled_back",
]);
const AiPlanStatusSchema = z.enum([
  "draft",
  "planning",
  "ready",
  "running",
  "awaiting_confirm",
  "done",
  "failed",
  "canceled",
]);
const AiVerifyTemplateSchema = z.union([
  z.literal("nginx_check"),
  z.literal("systemctl_is_active"),
  z.literal("curl_head"),
  z.object({ custom: z.string() }),
]);
const NullableStringSchema = z.string().nullable().default(null);
const NullableVerifyTemplateSchema = AiVerifyTemplateSchema.nullable().default(null);

const AiHealthResultSchema: z.ZodType<AiHealthResult> = z.object({
  runtimeReady: z.boolean(),
  modelPresent: z.boolean(),
  modelName: z.string(),
  acceleratorKind: AcceleratorKindSchema,
});

const AiPlanSchema: z.ZodType<AiPlan> = z.object({
  summary: z.string(),
  steps: z.array(
    z.object({
      id: z.string(),
      kind: AiStepKindSchema,
      status: AiStepStatusSchema,
      intent: z.string(),
      command: z.string(),
      path: NullableStringSchema,
      content: NullableStringSchema,
      targetFiles: z.array(z.string()),
      verifyTemplate: NullableVerifyTemplateSchema,
      expectedObservation: z.string(),
    })
  ),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
  status: AiPlanStatusSchema,
});

const AiPlanCreateResultSchema: z.ZodType<AiPlanCreateResult> = z.object({
  planId: z.string(),
  plan: AiPlanSchema,
});

const AiPlanStepResultSchema: z.ZodType<AiPlanStepResult> = z.object({
  plan: AiPlanSchema,
  awaitingConfirm: z.boolean(),
  currentStepId: NullableStringSchema,
});

const AiPlanRollbackResultSchema: z.ZodType<AiPlanRollbackResult> = z.object({
  plan: AiPlanSchema,
  rolledBack: z.boolean(),
  snapshotPath: NullableStringSchema,
});

// ============================================================================
// Health Check
// ============================================================================

/**
 * Query the AI runtime health. Fast: only file-stat + compile-time
 * accelerator detection on the backend. Safe to call on a 5s interval.
 */
export async function aiHealthCheck(): Promise<AiHealthResult> {
  const result = await timedInvoke("ai_health_check");
  return parseInvokeResult(AiHealthResultSchema, result, "ai_health_check");
}

// ============================================================================
// Chat Send
// ============================================================================

const AiChatSendResultSchema: z.ZodType<AiChatSendResult> = z.object({
  messageId: z.string(),
});

/**
 * Submit a chat message. Returns the assigned messageId immediately;
 * the actual response streams over `ai:token` events tagged with that id.
 *
 * `history` carries the prior multi-turn conversation (ascending), **not**
 * including the current `text`. Caller should pass the last N turns (N ~ 20
 * for ~3K token ceiling under Gemma 4 8K context budget). Empty array for
 * first turn or if multi-turn is disabled.
 */
export async function aiChatSend(
  sessionId: string,
  text: string,
  history: ChatHistoryTurn[] = []
): Promise<AiChatSendResult> {
  const result = await timedInvoke("ai_chat_send", {
    input: { sessionId, text, history },
  });
  return parseInvokeResult(AiChatSendResultSchema, result, "ai_chat_send");
}

// ============================================================================
// Chat Cancel
// ============================================================================

const AiChatCancelResultSchema: z.ZodType<AiChatCancelResult> = z.object({
  canceled: z.boolean(),
});

/**
 * Stop an in-flight chat response. `canceled === false` means the message
 * had already finished or never existed — safe to ignore (race-tolerant).
 */
export async function aiChatCancel(messageId: string): Promise<AiChatCancelResult> {
  const result = await timedInvoke("ai_chat_cancel", {
    input: { messageId },
  });
  return parseInvokeResult(AiChatCancelResultSchema, result, "ai_chat_cancel");
}

// ============================================================================
// License Accept (T1.5)
// ============================================================================

// 同 lib/settings.ts SettingsSchema；复制而非 import 以避免循环依赖 /
// 耦合升级。字段增减由 bindings + 双方 schema 同步保证。
const SettingsSchema: z.ZodType<Settings> = z.object({
  defaultDownloadDir: z.string().optional(),
  maxConcurrentTransfers: z.number(),
  connectionTimeoutSecs: z.number(),
  transferRetryCount: z.number(),
  logLevel: z.enum(["error", "warn", "info", "debug"]),
  terminalFontSize: z.number(),
  terminalScrollbackLines: z.number(),
  terminalFollowDirectory: z.boolean(),
  aiEnabled: z.boolean(),
  aiModelName: z.string(),
  maxConcurrentAiProbes: z.number(),
  aiOutputTokenCap: z.number(),
  aiLicenseAcceptedAt: z.number().optional(),
});

/**
 * Record that the user has accepted the Gemma Terms of Use. Must be called
 * before `ai_model_download` — otherwise download returns AI_UNAVAILABLE
 * with `detail: "license not accepted"`.
 *
 * Idempotent: repeat calls refresh the stored timestamp (for future "re-accept
 * latest ToU" UX). Returns the updated Settings so callers can read the new
 * `aiLicenseAcceptedAt` without a separate fetch.
 */
export async function aiLicenseAccept(): Promise<Settings> {
  const result = await timedInvoke("ai_license_accept");
  return parseInvokeResult(SettingsSchema, result, "ai_license_accept");
}

// ============================================================================
// Context Snapshot (T1.7)
// ============================================================================

const AiContextSnapshotResultSchema: z.ZodType<AiContextSnapshotResult> = z.object({
  sessionId: z.string(),
  pwd: z.string(),
  recentOutput: z.string(),
});

/**
 * Fetch the current terminal context snapshot for an AI session.
 *
 * chat send auto-injects this server-side; call this wrapper only when you
 * need to inspect / preview the snapshot independently (e.g. debug panel,
 * "attach context" UI). Returns empty strings for `pwd` / `recentOutput`
 * when the session or terminal is missing — best-effort, never errors on
 * missing state.
 *
 * The `recentOutput` has already been routed through the probe-output
 * scrubber (hard-erased secrets) and line-boundary aligned on the backend.
 */
export async function aiContextSnapshot(sessionId: string): Promise<AiContextSnapshotResult> {
  const result = await timedInvoke("ai_context_snapshot", {
    input: { sessionId },
  });
  return parseInvokeResult(AiContextSnapshotResultSchema, result, "ai_context_snapshot");
}

// ============================================================================
// Plan Mode (T3)
// ============================================================================

export async function aiPlanCreate(sessionId: string, text: string): Promise<AiPlanCreateResult> {
  const result = await timedInvoke("ai_plan_create", {
    input: { sessionId, text },
  });
  return parseInvokeResult(AiPlanCreateResultSchema, result, "ai_plan_create");
}

export async function aiPlanStepExecute(planId: string): Promise<AiPlanStepResult> {
  const result = await timedInvoke("ai_plan_step_execute", {
    input: { planId },
  });
  return parseInvokeResult(AiPlanStepResultSchema, result, "ai_plan_step_execute");
}

export async function aiPlanStepConfirm(planId: string): Promise<AiPlanStepResult> {
  const result = await timedInvoke("ai_plan_step_confirm", {
    input: { planId },
  });
  return parseInvokeResult(AiPlanStepResultSchema, result, "ai_plan_step_confirm");
}

export async function aiPlanStepRevise(
  planId: string,
  newObservation: string
): Promise<AiPlanStepResult> {
  const input: AiPlanStepReviseInput = { planId, newObservation };
  const result = await timedInvoke("ai_plan_step_revise", {
    input,
  });
  return parseInvokeResult(AiPlanStepResultSchema, result, "ai_plan_step_revise");
}

export async function aiPlanCancel(planId: string): Promise<AiPlanStepResult> {
  const result = await timedInvoke("ai_plan_cancel", {
    input: { planId },
  });
  return parseInvokeResult(AiPlanStepResultSchema, result, "ai_plan_cancel");
}

export async function aiPlanRollback(
  planId: string,
  stepId: string
): Promise<AiPlanRollbackResult> {
  const result = await timedInvoke(
    "ai_plan_rollback",
    {
      input: { planId, stepId },
    },
    300_000
  );
  return parseInvokeResult(AiPlanRollbackResultSchema, result, "ai_plan_rollback");
}

// ============================================================================
// Model Download (T1.5)
// ============================================================================

const AiModelDownloadCancelResultSchema: z.ZodType<AiModelDownloadCancelResult> = z.object({
  canceled: z.boolean(),
});

/**
 * Start downloading the pinned Gemma 4 E4B Q4_K_M GGUF. Resolves immediately
 * with `void` once the backend has validated preconditions (license accepted,
 * disk space, no concurrent download) and spawned the async task. Actual
 * progress reaches the UI via `ai:download_progress` + `ai:download_done`
 * events — subscribe there.
 *
 * Rejects synchronously with an AppError when:
 * - license not accepted → `AI_UNAVAILABLE` with `detail: "license not accepted"`
 * - insufficient disk → `AI_UNAVAILABLE`, `retryable=false`
 * - another download already running → `AI_UNAVAILABLE`, `retryable=false`
 *
 * The 300000 ms timeout covers only the bootstrap phase; the download itself
 * drives its lifecycle via events and is not bounded by `timedInvoke`.
 */
export async function aiModelDownload(): Promise<void> {
  await timedInvoke("ai_model_download", undefined, 300_000);
}

/**
 * Cancel the in-flight model download. `canceled === false` means no active
 * download was found (either already finished or never started) — safe to
 * ignore.
 */
export async function aiModelDownloadCancel(): Promise<AiModelDownloadCancelResult> {
  const result = await timedInvoke("ai_model_download_cancel");
  return parseInvokeResult(AiModelDownloadCancelResultSchema, result, "ai_model_download_cancel");
}

const AiModelDeleteResultSchema: z.ZodType<AiModelDeleteResult> = z.object({
  deleted: z.boolean(),
  path: z.string(),
});

/**
 * Delete the downloaded GGUF from disk. License acceptance is preserved so the
 * user can re-download without re-accepting the ToU. Rejects with
 * AI_UNAVAILABLE if a download is currently in progress (cancel it first).
 */
export async function aiModelDelete(): Promise<AiModelDeleteResult> {
  const result = await timedInvoke("ai_model_delete");
  return parseInvokeResult(AiModelDeleteResultSchema, result, "ai_model_delete");
}

/**
 * Load the pinned GGUF into the llama.cpp runtime. Idempotent: already-loaded
 * returns Ok immediately. Used for the "model was downloaded in a previous
 * session, app just restarted, need to bring the runtime up" path.
 *
 * The download command chains this internally after verify-sha256, so callers
 * only need to invoke this explicitly during health-check-driven recovery.
 *
 * Cold-path cost on first launch: sha256 verify of the 4.6GB GGUF (~5 s with
 * hardware SHA on Apple Silicon, cache miss) + LlamaModel::load_from_file
 * mmap + Metal shader compile (~5–15 s). Warm path (cache hit) is < 1 s.
 * Budget of 5 min matches sftp_delete_recursive — covers degraded disk IO
 * without hiding genuine hangs.
 */
export async function aiRuntimeLoad(): Promise<void> {
  await timedInvoke("ai_runtime_load", undefined, 300_000);
}
