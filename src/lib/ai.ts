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
