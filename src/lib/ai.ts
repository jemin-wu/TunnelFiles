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
import type { AiChatCancelResult } from "@/types/bindings/AiChatCancelResult";
import type { AiContextSnapshotResult } from "@/types/bindings/AiContextSnapshotResult";

// ============================================================================
// Schemas
// ============================================================================

const AcceleratorKindSchema = z.enum(["metal", "cpu", "none"]);

const AiHealthResultSchema: z.ZodType<AiHealthResult> = z.object({
  runtimeReady: z.boolean(),
  modelPresent: z.boolean(),
  modelName: z.string(),
  acceleratorKind: AcceleratorKindSchema,
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
 * v0.1: backend is an echo stub until LlamaRuntime::generate lands.
 */
export async function aiChatSend(sessionId: string, text: string): Promise<AiChatSendResult> {
  const result = await timedInvoke("ai_chat_send", {
    input: { sessionId, text },
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
