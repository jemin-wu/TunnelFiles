/**
 * 终端 IPC 调用封装
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  TerminalInfo,
  TerminalOpenInput,
  TerminalInputData,
  TerminalResizeInput,
} from "@/types/terminal";

/** 打开终端 */
export async function openTerminal(input: TerminalOpenInput): Promise<TerminalInfo> {
  return invoke("terminal_open", { input });
}

/** 写入终端输入 */
export async function writeTerminalInput(input: TerminalInputData): Promise<void> {
  return invoke("terminal_input", { input });
}

/** 调整终端尺寸 */
export async function resizeTerminal(input: TerminalResizeInput): Promise<void> {
  return invoke("terminal_resize", { input });
}

/** 关闭终端 */
export async function closeTerminal(terminalId: string): Promise<void> {
  return invoke("terminal_close", { terminalId });
}

/** 通过 sessionId 获取终端 ID */
export async function getTerminalBySession(sessionId: string): Promise<string | null> {
  return invoke("terminal_get_by_session", { sessionId });
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
