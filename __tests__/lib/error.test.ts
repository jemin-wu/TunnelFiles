import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import {
  isAppError,
  getErrorMessage,
  getErrorDetail,
  isRetryable,
  getErrorCode,
  showErrorToast,
  showSuccessToast,
  invokeWithErrorHandling,
  handleErrorByCode,
} from "@/lib/error";
import { ErrorCode, ERROR_MESSAGES, type AppError } from "@/types";

// 工厂函数创建 AppError
const createAppError = (overrides: Partial<AppError> = {}): AppError => ({
  code: ErrorCode.UNKNOWN,
  message: "Test error",
  ...overrides,
});

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    dismiss: vi.fn(),
  },
}));

describe("error utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isAppError", () => {
    it("should return true for valid AppError", () => {
      const error = createAppError({ code: ErrorCode.AUTH_FAILED, message: "Authentication failed" });
      expect(isAppError(error)).toBe(true);
    });

    it("should return false for plain Error", () => {
      const error = new Error("Something went wrong");
      expect(isAppError(error)).toBe(false);
    });

    it("should return false for string", () => {
      expect(isAppError("error string")).toBe(false);
    });

    it("should return false for null", () => {
      expect(isAppError(null)).toBe(false);
    });

    it("should return false for object without code", () => {
      expect(isAppError({ message: "test" })).toBe(false);
    });

    it("should return false for object without message", () => {
      expect(isAppError({ code: "TEST" })).toBe(false);
    });
  });

  describe("getErrorMessage", () => {
    it("should return AppError message", () => {
      const error = createAppError({ code: ErrorCode.AUTH_FAILED, message: "Custom auth message" });
      expect(getErrorMessage(error)).toBe("Custom auth message");
    });

    it("should fallback to ERROR_MESSAGES when AppError message is empty", () => {
      const error = createAppError({ code: ErrorCode.AUTH_FAILED, message: "" });
      expect(getErrorMessage(error)).toBe(ERROR_MESSAGES[ErrorCode.AUTH_FAILED]);
    });

    it("should return Error message for plain Error", () => {
      const error = new Error("Plain error message");
      expect(getErrorMessage(error)).toBe("Plain error message");
    });

    it("should return string as-is", () => {
      expect(getErrorMessage("string error")).toBe("string error");
    });

    it("should return UNKNOWN message for other types", () => {
      expect(getErrorMessage(123)).toBe(ERROR_MESSAGES[ErrorCode.UNKNOWN]);
      expect(getErrorMessage(undefined)).toBe(ERROR_MESSAGES[ErrorCode.UNKNOWN]);
    });
  });

  describe("getErrorDetail", () => {
    it("should return detail from AppError", () => {
      const error = createAppError({
        code: ErrorCode.AUTH_FAILED,
        message: "Auth failed",
        detail: "Wrong password",
      });
      expect(getErrorDetail(error)).toBe("Wrong password");
    });

    it("should return undefined when AppError has no detail", () => {
      const error = createAppError({ code: ErrorCode.AUTH_FAILED, message: "Auth failed" });
      expect(getErrorDetail(error)).toBeUndefined();
    });

    it("should return undefined for non-AppError", () => {
      expect(getErrorDetail(new Error("test"))).toBeUndefined();
      expect(getErrorDetail("string error")).toBeUndefined();
    });
  });

  describe("isRetryable", () => {
    it("should return true when AppError is retryable", () => {
      const error = createAppError({
        code: ErrorCode.NETWORK_LOST,
        message: "Network lost",
        retryable: true,
      });
      expect(isRetryable(error)).toBe(true);
    });

    it("should return false when AppError is not retryable", () => {
      const error = createAppError({
        code: ErrorCode.AUTH_FAILED,
        message: "Auth failed",
        retryable: false,
      });
      expect(isRetryable(error)).toBe(false);
    });

    it("should return false when retryable is undefined", () => {
      const error = createAppError({ code: ErrorCode.AUTH_FAILED, message: "Auth failed" });
      expect(isRetryable(error)).toBe(false);
    });

    it("should return false for non-AppError", () => {
      expect(isRetryable(new Error("test"))).toBe(false);
    });
  });

  describe("getErrorCode", () => {
    it("should return code from AppError", () => {
      const error = createAppError({ code: ErrorCode.PERMISSION_DENIED, message: "Permission denied" });
      expect(getErrorCode(error)).toBe(ErrorCode.PERMISSION_DENIED);
    });

    it("should return UNKNOWN for non-AppError", () => {
      expect(getErrorCode(new Error("test"))).toBe(ErrorCode.UNKNOWN);
      expect(getErrorCode("string")).toBe(ErrorCode.UNKNOWN);
    });
  });

  describe("showErrorToast", () => {
    it("should call toast.error with message", () => {
      const error = createAppError({ code: ErrorCode.AUTH_FAILED, message: "Auth failed" });
      showErrorToast(error);

      expect(toast.error).toHaveBeenCalledWith(
        "Auth failed",
        expect.objectContaining({
          duration: 5000,
        })
      );
    });

    it("should include detail as description", () => {
      const error = createAppError({
        code: ErrorCode.AUTH_FAILED,
        message: "Auth failed",
        detail: "Wrong credentials",
      });
      showErrorToast(error);

      expect(toast.error).toHaveBeenCalledWith(
        "Auth failed",
        expect.objectContaining({
          description: "Wrong credentials",
        })
      );
    });

    it("should show retry action when retryable and onRetry provided", () => {
      const error = createAppError({
        code: ErrorCode.NETWORK_LOST,
        message: "Network lost",
        retryable: true,
      });
      const onRetry = vi.fn();
      showErrorToast(error, { onRetry });

      expect(toast.error).toHaveBeenCalledWith(
        "Network lost",
        expect.objectContaining({
          action: expect.objectContaining({
            label: "重试",
          }),
        })
      );
    });
  });

  describe("showSuccessToast", () => {
    it("should call toast.success with message", () => {
      showSuccessToast("Operation completed");

      expect(toast.success).toHaveBeenCalledWith(
        "Operation completed",
        expect.objectContaining({
          duration: 3000,
        })
      );
    });

    it("should include description when provided", () => {
      showSuccessToast("Success", "File uploaded");

      expect(toast.success).toHaveBeenCalledWith(
        "Success",
        expect.objectContaining({
          description: "File uploaded",
        })
      );
    });
  });

  describe("invokeWithErrorHandling", () => {
    it("should return result on success", async () => {
      const fn = vi.fn().mockResolvedValue("result");

      const result = await invokeWithErrorHandling(fn);

      expect(result).toBe("result");
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("should show toast and throw on error by default", async () => {
      const error = createAppError({ code: ErrorCode.AUTH_FAILED, message: "Auth failed" });
      const fn = vi.fn().mockRejectedValue(error);

      await expect(invokeWithErrorHandling(fn)).rejects.toEqual(error);
      expect(toast.error).toHaveBeenCalled();
    });

    it("should return undefined in silent mode", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("test"));

      const result = await invokeWithErrorHandling(fn, { silent: true });

      expect(result).toBeUndefined();
    });

    it("should not show toast when showToast is false", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("test"));

      await expect(invokeWithErrorHandling(fn, { showToast: false })).rejects.toThrow();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe("handleErrorByCode", () => {
    it("should call handler for matching error code", () => {
      const error = createAppError({ code: ErrorCode.AUTH_FAILED, message: "Auth failed" });
      const handler = vi.fn();

      handleErrorByCode(error, {
        [ErrorCode.AUTH_FAILED]: handler,
      });

      expect(handler).toHaveBeenCalledWith(error);
    });

    it("should call default handler when no match", () => {
      const error = createAppError({ code: ErrorCode.PERMISSION_DENIED, message: "Denied" });
      const defaultHandler = vi.fn();

      handleErrorByCode(
        error,
        {
          [ErrorCode.AUTH_FAILED]: vi.fn(),
        },
        defaultHandler
      );

      expect(defaultHandler).toHaveBeenCalledWith(error);
    });

    it("should show error toast when no handlers match", () => {
      const error = createAppError({ code: ErrorCode.UNKNOWN, message: "Unknown error" });

      handleErrorByCode(error, {});

      expect(toast.error).toHaveBeenCalled();
    });

    it("should call default handler for non-AppError", () => {
      const error = new Error("Plain error");
      const defaultHandler = vi.fn();

      handleErrorByCode(error, {}, defaultHandler);

      expect(defaultHandler).toHaveBeenCalledWith(error);
    });
  });
});
