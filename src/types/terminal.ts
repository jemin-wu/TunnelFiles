/**
 * 终端相关类型定义
 */

/** 终端状态 */
export type TerminalStatus = "connected" | "disconnected" | "reconnecting" | "error";

/** 终端信息 */
export interface TerminalInfo {
  terminalId: string;
  sessionId: string;
}

/** 终端输出事件 payload */
export interface TerminalOutputPayload {
  terminalId: string;
  /** Base64 编码的输出数据 */
  data: string;
}

/** 终端状态事件 payload */
export interface TerminalStatusPayload {
  terminalId: string;
  status: TerminalStatus;
  message?: string;
  /** 当前重连尝试次数 (1-based)，仅在 status 为 "reconnecting" 时存在 */
  reconnectAttempt?: number;
  /** 最大重连尝试次数，仅在 status 为 "reconnecting" 时存在 */
  maxReconnectAttempts?: number;
}

/** 打开终端输入 */
export interface TerminalOpenInput {
  sessionId: string;
  cols?: number;
  rows?: number;
}

/** 终端输入数据 */
export interface TerminalInputData {
  terminalId: string;
  /** Base64 编码的输入数据 */
  data: string;
}

/** 终端尺寸调整输入 */
export interface TerminalResizeInput {
  terminalId: string;
  cols: number;
  rows: number;
}
