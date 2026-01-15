/**
 * 错误处理工具函数
 *
 * 提供统一的错误处理和展示逻辑
 */

import { toast } from "sonner";
import { type AppError, ErrorCode, ERROR_MESSAGES } from "@/types";

/**
 * 检查是否为 AppError
 */
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as AppError).code === "string" &&
    typeof (error as AppError).message === "string"
  );
}

/**
 * 获取错误消息
 *
 * 优先使用 AppError 的 message，否则使用错误码对应的默认消息
 */
export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message || ERROR_MESSAGES[error.code] || ERROR_MESSAGES[ErrorCode.UNKNOWN];
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return ERROR_MESSAGES[ErrorCode.UNKNOWN];
}

/**
 * 获取错误详情
 */
export function getErrorDetail(error: unknown): string | undefined {
  if (isAppError(error)) {
    return error.detail;
  }
  return undefined;
}

/**
 * 检查错误是否可重试
 */
export function isRetryable(error: unknown): boolean {
  if (isAppError(error)) {
    return error.retryable ?? false;
  }
  return false;
}

/**
 * 获取错误码
 */
export function getErrorCode(error: unknown): ErrorCode {
  if (isAppError(error)) {
    return error.code;
  }
  return ErrorCode.UNKNOWN;
}

// ============================================
// Toast 相关
// ============================================

interface ToastErrorOptions {
  /** 是否显示重试按钮 */
  showRetry?: boolean;
  /** 重试回调 */
  onRetry?: () => void;
  /** 持续时间（毫秒） */
  duration?: number;
}

/**
 * 显示错误 Toast
 */
export function showErrorToast(error: unknown, options: ToastErrorOptions = {}) {
  const message = getErrorMessage(error);
  const detail = getErrorDetail(error);
  const retryable = isRetryable(error);
  const { showRetry = retryable, onRetry, duration = 5000 } = options;

  toast.error(message, {
    description: detail,
    duration,
    action:
      showRetry && onRetry
        ? {
            label: "重试",
            onClick: onRetry,
          }
        : undefined,
  });
}

/**
 * 显示成功 Toast
 */
export function showSuccessToast(message: string, description?: string) {
  toast.success(message, {
    description,
    duration: 3000,
  });
}

/**
 * 显示信息 Toast
 */
export function showInfoToast(message: string, description?: string) {
  toast.info(message, {
    description,
    duration: 4000,
  });
}

/**
 * 显示警告 Toast
 */
export function showWarningToast(message: string, description?: string) {
  toast.warning(message, {
    description,
    duration: 4000,
  });
}

/**
 * 显示加载 Toast
 *
 * 返回一个函数，用于更新或关闭 Toast
 */
export function showLoadingToast(message: string) {
  const toastId = toast.loading(message);

  return {
    /** 更新为成功状态 */
    success: (successMessage: string) => {
      toast.success(successMessage, { id: toastId });
    },
    /** 更新为错误状态 */
    error: (error: unknown) => {
      toast.error(getErrorMessage(error), {
        id: toastId,
        description: getErrorDetail(error),
      });
    },
    /** 关闭 Toast */
    dismiss: () => {
      toast.dismiss(toastId);
    },
  };
}

// ============================================
// IPC 错误处理
// ============================================

/**
 * 包装 Tauri IPC 调用，统一处理错误
 *
 * @example
 * ```ts
 * const profiles = await invokeWithErrorHandling(
 *   () => invoke("profile_list"),
 *   { showToast: true }
 * );
 * ```
 */
export async function invokeWithErrorHandling<T>(
  fn: () => Promise<T>,
  options: {
    /** 是否显示错误 Toast，默认 true */
    showToast?: boolean;
    /** 重试回调 */
    onRetry?: () => void;
    /** 静默错误（不 throw，返回 undefined） */
    silent?: boolean;
  } = {}
): Promise<T | undefined> {
  const { showToast = true, onRetry, silent = false } = options;

  try {
    return await fn();
  } catch (error) {
    if (showToast) {
      showErrorToast(error, { onRetry });
    }

    if (silent) {
      console.error("IPC Error:", error);
      return undefined;
    }

    throw error;
  }
}

/**
 * 处理特定错误码
 *
 * @example
 * ```ts
 * try {
 *   await invoke("session_connect", { profileId });
 * } catch (error) {
 *   handleErrorByCode(error, {
 *     [ErrorCode.AUTH_FAILED]: () => openAuthDialog(),
 *     [ErrorCode.HOSTKEY_MISMATCH]: () => showHostKeyWarning(error),
 *   });
 * }
 * ```
 */
export function handleErrorByCode(
  error: unknown,
  handlers: Partial<Record<ErrorCode, (error: AppError) => void>>,
  defaultHandler?: (error: unknown) => void
) {
  if (isAppError(error)) {
    const handler = handlers[error.code];
    if (handler) {
      handler(error);
      return;
    }
  }

  if (defaultHandler) {
    defaultHandler(error);
  } else {
    showErrorToast(error);
  }
}
