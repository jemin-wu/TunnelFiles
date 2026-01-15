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
