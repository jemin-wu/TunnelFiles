/**
 * Terminal IPC wrapper
 *
 * All terminal-related Tauri IPC call wrappers with Zod validation
 */

import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { parseInvokeResult } from "./error";
import type {
  TerminalInfo,
  TerminalOpenInput,
  TerminalInputData,
  TerminalResizeInput,
} from "@/types/terminal";

// ============================================================================
// Schemas
// ============================================================================

const TerminalInfoSchema = z.object({
  terminalId: z.string(),
  sessionId: z.string(),
});

// ============================================================================
// Terminal Operations
// ============================================================================

/** 打开终端 */
export async function openTerminal(input: TerminalOpenInput): Promise<TerminalInfo> {
  const result = await invoke("terminal_open", { input });
  return parseInvokeResult(TerminalInfoSchema, result, "terminal_open");
}

/** 写入终端输入 */
export async function writeTerminalInput(input: TerminalInputData): Promise<void> {
  await invoke("terminal_input", { input });
}

/** 调整终端尺寸 */
export async function resizeTerminal(input: TerminalResizeInput): Promise<void> {
  await invoke("terminal_resize", { input });
}

/** 关闭终端 */
export async function closeTerminal(terminalId: string): Promise<void> {
  await invoke("terminal_close", { terminalId });
}

/** 手动重连终端 */
export async function reconnectTerminal(terminalId: string): Promise<void> {
  await invoke("terminal_reconnect", { terminalId });
}

/** 通过 sessionId 获取终端 ID */
export async function getTerminalBySession(sessionId: string): Promise<string | null> {
  const result = await invoke("terminal_get_by_session", { sessionId });
  return parseInvokeResult(z.string().nullable(), result, "terminal_get_by_session");
}

/** Base64 编码（用于发送输入，支持 UTF-8） */
export function encodeTerminalData(data: string): string {
  const bytes = new TextEncoder().encode(data);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary);
}

/** Base64 解码（用于接收输出） */
export function decodeTerminalData(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
