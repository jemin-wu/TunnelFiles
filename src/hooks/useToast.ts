/**
 * Toast Hook
 *
 * 提供组件级别的 Toast 调用接口
 */

import {
  showErrorToast,
  showSuccessToast,
  showInfoToast,
  showWarningToast,
  showLoadingToast,
} from "@/lib/error.js";

interface ToastErrorOptions {
  onRetry?: () => void;
}

interface ToastMethods {
  error: (err: unknown, options?: ToastErrorOptions) => void;
  success: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  loading: (message: string) => ReturnType<typeof showLoadingToast>;
}

const toastMethods: ToastMethods = {
  error: (err, options) => showErrorToast(err, options),
  success: (message, description) => showSuccessToast(message, description),
  info: (message, description) => showInfoToast(message, description),
  warning: (message, description) => showWarningToast(message, description),
  loading: (message) => showLoadingToast(message),
};

/**
 * Toast Hook
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const toast = useToast();
 *
 *   const handleSave = async () => {
 *     try {
 *       await saveData();
 *       toast.success("保存成功");
 *     } catch (err) {
 *       toast.error(err, { onRetry: handleSave });
 *     }
 *   };
 *
 *   return <button onClick={handleSave}>保存</button>;
 * }
 * ```
 */
export function useToast(): ToastMethods {
  return toastMethods;
}
