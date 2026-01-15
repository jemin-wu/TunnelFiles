/**
 * 错误码枚举
 */
export enum ErrorCode {
  AUTH_FAILED = "AUTH_FAILED",
  HOSTKEY_MISMATCH = "HOSTKEY_MISMATCH",
  TIMEOUT = "TIMEOUT",
  NETWORK_LOST = "NETWORK_LOST",
  NOT_FOUND = "NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  DIR_NOT_EMPTY = "DIR_NOT_EMPTY",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  LOCAL_IO_ERROR = "LOCAL_IO_ERROR",
  REMOTE_IO_ERROR = "REMOTE_IO_ERROR",
  CANCELED = "CANCELED",
  INVALID_ARGUMENT = "INVALID_ARGUMENT",
  UNKNOWN = "UNKNOWN",
}

/**
 * 统一错误模型
 */
export interface AppError {
  code: ErrorCode;
  message: string;
  detail?: string;
  retryable?: boolean;
}

/**
 * 错误码对应的用户友好提示
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_FAILED]: "认证失败，请检查用户名和密码",
  [ErrorCode.HOSTKEY_MISMATCH]: "服务器指纹已变更，可能存在安全风险",
  [ErrorCode.TIMEOUT]: "连接超时，请检查网络或服务器状态",
  [ErrorCode.NETWORK_LOST]: "网络连接已断开",
  [ErrorCode.NOT_FOUND]: "文件或目录不存在",
  [ErrorCode.PERMISSION_DENIED]: "权限不足",
  [ErrorCode.DIR_NOT_EMPTY]: "目录非空，无法删除",
  [ErrorCode.ALREADY_EXISTS]: "文件或目录已存在",
  [ErrorCode.LOCAL_IO_ERROR]: "本地文件操作失败",
  [ErrorCode.REMOTE_IO_ERROR]: "远程文件操作失败",
  [ErrorCode.CANCELED]: "操作已取消",
  [ErrorCode.INVALID_ARGUMENT]: "参数无效",
  [ErrorCode.UNKNOWN]: "未知错误",
};
