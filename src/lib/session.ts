/**
 * Session 相关 API 函数
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  ConnectInput,
  SessionConnectResult,
  SessionInfo,
  TrustHostKeyInput,
} from "@/types/events";

/**
 * 连接到服务器
 */
export async function connect(input: ConnectInput): Promise<SessionConnectResult> {
  return invoke<SessionConnectResult>("session_connect", { input });
}

/**
 * 断开连接
 */
export async function disconnect(sessionId: string): Promise<void> {
  return invoke("session_disconnect", { sessionId });
}

/**
 * 获取会话信息
 */
export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  return invoke<SessionInfo | null>("session_info", { sessionId });
}

/**
 * 信任 HostKey
 */
export async function trustHostKey(input: TrustHostKeyInput): Promise<void> {
  return invoke("security_trust_hostkey", { input });
}

/**
 * 使用已信任的 HostKey 重新连接
 */
export async function reconnectWithTrustedKey(input: ConnectInput): Promise<SessionConnectResult> {
  return invoke<SessionConnectResult>("session_connect_after_trust", { input });
}

/**
 * 列出所有活跃会话 ID
 */
export async function listSessions(): Promise<string[]> {
  return invoke<string[]>("session_list");
}

/**
 * 移除已信任的 HostKey
 */
export async function removeHostKey(host: string, port: number): Promise<boolean> {
  return invoke<boolean>("security_remove_hostkey", { host, port });
}

/**
 * 检查 HostKey 信任状态
 */
export async function checkHostKey(host: string, port: number): Promise<string | null> {
  return invoke<string | null>("security_check_hostkey", { host, port });
}
