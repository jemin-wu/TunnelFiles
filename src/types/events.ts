import type { TransferStatus } from "./transfer";

/**
 * 会话状态
 */
export type SessionStatus = "connected" | "disconnected" | "error";

/**
 * HostKey 状态
 */
export type HostKeyStatus = "trusted" | "unknown" | "mismatch";

/**
 * 传输进度事件 payload
 */
export interface TransferProgressPayload {
  taskId: string;
  transferred: number;
  total: number;
  speed: number;
  percent: number;
}

/**
 * 传输状态事件 payload
 */
export interface TransferStatusPayload {
  taskId: string;
  status: TransferStatus;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * 会话状态事件 payload
 */
export interface SessionStatusPayload {
  sessionId: string;
  status: SessionStatus;
  message?: string;
}

/**
 * HostKey 确认事件 payload
 */
export interface HostKeyPayload {
  profileId: string;
  host: string;
  port: number;
  fingerprint: string;
  keyType: string;
  status: HostKeyStatus;
}

/**
 * 连接结果
 */
export interface SessionConnectResult {
  /** 会话 ID（连接成功时返回，需要 HostKey 确认时为 null） */
  sessionId: string | null;
  /** 远程 home 目录 */
  homePath: string | null;
  /** 需要确认 HostKey */
  needHostKeyConfirm: boolean;
  /** 服务器指纹 */
  serverFingerprint: string | null;
}

/**
 * 会话信息
 */
export interface SessionInfo {
  sessionId: string;
  profileId: string;
  homePath: string;
  fingerprint: string;
}

/**
 * 连接输入参数
 */
export interface ConnectInput {
  profileId: string;
  /** 临时密码（未记住时由前端传入） */
  password?: string;
  /** 临时 passphrase（未记住时由前端传入） */
  passphrase?: string;
}

/**
 * 信任 HostKey 输入
 */
export interface TrustHostKeyInput {
  host: string;
  port: number;
  keyType: string;
  fingerprint: string;
}

/**
 * 事件名称常量
 */
export const EVENTS = {
  TRANSFER_PROGRESS: "transfer:progress",
  TRANSFER_STATUS: "transfer:status",
  SESSION_STATUS: "session:status",
  SECURITY_HOSTKEY: "security:hostkey",
  // 终端事件
  TERMINAL_OUTPUT: "terminal:output",
  TERMINAL_STATUS: "terminal:status",
} as const;
