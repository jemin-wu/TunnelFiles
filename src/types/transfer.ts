/**
 * 传输方向
 */
export type TransferDirection = "upload" | "download";

/**
 * 传输状态
 */
export type TransferStatus = "waiting" | "running" | "success" | "failed" | "canceled";

/**
 * 传输任务
 */
export interface TransferTask {
  taskId: string;
  sessionId: string;
  direction: TransferDirection;
  localPath: string;
  remotePath: string;
  fileName: string;
  status: TransferStatus;
  /** 已传输字节数 */
  transferred: number;
  /** 总字节数 */
  total?: number;
  /** 传输速度 (字节/秒) */
  speed?: number;
  /** 百分比 (0-100) */
  percent?: number;
  /** 错误信息 */
  errorMessage?: string;
  /** 错误码 */
  errorCode?: string;
  /** 是否可重试 */
  retryable?: boolean;
  /** 创建时间 */
  createdAt: number;
  /** 完成时间 */
  completedAt?: number;
}

/**
 * 格式化传输速度
 */
export function formatSpeed(bytesPerSecond?: number): string {
  if (!bytesPerSecond) return "-";

  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  const k = 1024;
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));

  return `${parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * 计算预计剩余时间
 */
export function estimateRemainingTime(transferred: number, total: number, speed: number): string {
  if (!speed || speed === 0 || !total) return "-";

  const remaining = total - transferred;
  const seconds = Math.ceil(remaining / speed);

  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}分钟`;
  return `${Math.ceil(seconds / 3600)}小时`;
}
