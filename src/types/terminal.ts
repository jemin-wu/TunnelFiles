/**
 * 终端相关类型定义
 */

/** 终端状态 */
export type TerminalStatus = "connected" | "disconnected" | "error";

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
