/**
 * Session IPC wrapper
 *
 * All session-related Tauri IPC call wrappers with Zod validation
 */

import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { parseInvokeResult } from "./error";
import type {
  ConnectInput,
  SessionConnectResult,
  SessionInfo,
  TrustHostKeyInput,
} from "@/types/events";

// ============================================================================
// Schemas
// ============================================================================

const SessionConnectResultSchema = z.object({
  sessionId: z.string().nullable(),
  homePath: z.string().nullable(),
  needHostKeyConfirm: z.boolean(),
  serverFingerprint: z.string().nullable(),
  serverKeyType: z.string().nullable(),
  hostKeyMismatch: z.boolean(),
});

const SessionInfoSchema = z.object({
  sessionId: z.string(),
  profileId: z.string(),
  homePath: z.string(),
  fingerprint: z.string(),
});

// ============================================================================
// Session Operations
// ============================================================================

/**
 * 连接到服务器
 */
export async function connect(input: ConnectInput): Promise<SessionConnectResult> {
  const result = await invoke("session_connect", { input });
  return parseInvokeResult(SessionConnectResultSchema, result, "session_connect");
}

/**
 * 断开连接
 */
export async function disconnect(sessionId: string): Promise<void> {
  await invoke("session_disconnect", { sessionId });
}

/**
 * 获取会话信息
 */
export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  const result = await invoke("session_info", { sessionId });
  return parseInvokeResult(SessionInfoSchema.nullable(), result, "session_info");
}

/**
 * 信任 HostKey
 */
export async function trustHostKey(input: TrustHostKeyInput): Promise<void> {
  await invoke("security_trust_hostkey", { input });
}

/**
 * 使用已信任的 HostKey 重新连接
 */
export async function reconnectWithTrustedKey(input: ConnectInput): Promise<SessionConnectResult> {
  const result = await invoke("session_connect_after_trust", { input });
  return parseInvokeResult(SessionConnectResultSchema, result, "session_connect_after_trust");
}

/**
 * 列出所有活跃会话 ID
 */
export async function listSessions(): Promise<string[]> {
  const result = await invoke("session_list");
  return parseInvokeResult(z.array(z.string()), result, "session_list");
}

/**
 * 移除已信任的 HostKey
 */
export async function removeHostKey(host: string, port: number): Promise<boolean> {
  const result = await invoke("security_remove_hostkey", { host, port });
  return parseInvokeResult(z.boolean(), result, "security_remove_hostkey");
}

/**
 * 检查 HostKey 信任状态
 */
export async function checkHostKey(host: string, port: number): Promise<string | null> {
  const result = await invoke("security_check_hostkey", { host, port });
  return parseInvokeResult(z.string().nullable(), result, "security_check_hostkey");
}

// ============================================================================
// Known Hosts
// ============================================================================

const KnownHostSchema = z.object({
  host: z.string(),
  port: z.number(),
  keyType: z.string(),
  fingerprint: z.string(),
  trustedAt: z.number(),
});

export type KnownHost = z.infer<typeof KnownHostSchema>;

/**
 * 获取所有已信任的 Known Hosts
 */
export async function listKnownHosts(): Promise<KnownHost[]> {
  const result = await invoke("security_list_known_hosts");
  return parseInvokeResult(z.array(KnownHostSchema), result, "security_list_known_hosts");
}
