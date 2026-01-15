import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useFileOperations } from "@/hooks/useFileOperations";
import type { ReactNode } from "react";

// Mock modules
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// 工厂函数创建错误对象
const createMockError = (overrides: { code?: string; message?: string } = {}) => ({
  code: "UNKNOWN",
  message: "Unknown error",
  ...overrides,
});

describe("useFileOperations", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  describe("createFolder", () => {
    it("should call sftp_mkdir with correct path", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const { result } = renderHook(
        () => useFileOperations({ sessionId: "session-1", currentPath: "/home/user" }),
        { wrapper }
      );

      result.current.createFolder.mutate("new-folder");

      await waitFor(() => {
        expect(result.current.createFolder.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("sftp_mkdir", {
        sessionId: "session-1",
        path: "/home/user/new-folder",
      });
      expect(toast.success).toHaveBeenCalledWith("文件夹创建成功", expect.anything());
    });

    it("should handle root path correctly", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const { result } = renderHook(
        () => useFileOperations({ sessionId: "session-1", currentPath: "/" }),
        { wrapper }
      );

      result.current.createFolder.mutate("new-folder");

      await waitFor(() => {
        expect(result.current.createFolder.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("sftp_mkdir", {
        sessionId: "session-1",
        path: "/new-folder",
      });
    });

    it("should show error toast on failure", async () => {
      const error = createMockError({ code: "PERMISSION_DENIED", message: "Permission denied" });
      vi.mocked(invoke).mockRejectedValueOnce(error);

      const { result } = renderHook(
        () => useFileOperations({ sessionId: "session-1", currentPath: "/home" }),
        { wrapper }
      );

      result.current.createFolder.mutate("folder");

      await waitFor(() => {
        expect(result.current.createFolder.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe("rename", () => {
    it("should call sftp_rename with correct paths", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const { result } = renderHook(
        () => useFileOperations({ sessionId: "session-1", currentPath: "/home/user" }),
        { wrapper }
      );

      result.current.rename.mutate({
        fromPath: "/home/user/old-name.txt",
        newName: "new-name.txt",
      });

      await waitFor(() => {
        expect(result.current.rename.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("sftp_rename", {
        sessionId: "session-1",
        fromPath: "/home/user/old-name.txt",
        toPath: "/home/user/new-name.txt",
      });
      expect(toast.success).toHaveBeenCalledWith("重命名成功", expect.anything());
    });

    it("should handle root level rename", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const { result } = renderHook(
        () => useFileOperations({ sessionId: "session-1", currentPath: "/" }),
        { wrapper }
      );

      result.current.rename.mutate({
        fromPath: "/old-file.txt",
        newName: "new-file.txt",
      });

      await waitFor(() => {
        expect(result.current.rename.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("sftp_rename", {
        sessionId: "session-1",
        fromPath: "/old-file.txt",
        toPath: "/new-file.txt",
      });
    });

    it("should show error toast on failure", async () => {
      const error = createMockError({ code: "ALREADY_EXISTS", message: "Already exists" });
      vi.mocked(invoke).mockRejectedValueOnce(error);

      const { result } = renderHook(
        () => useFileOperations({ sessionId: "session-1", currentPath: "/home" }),
        { wrapper }
      );

      result.current.rename.mutate({
        fromPath: "/home/old.txt",
        newName: "new.txt",
      });

      await waitFor(() => {
        expect(result.current.rename.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe("deleteItem", () => {
    it("should call sftp_delete for file", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const { result } = renderHook(
        () => useFileOperations({ sessionId: "session-1", currentPath: "/home/user" }),
        { wrapper }
      );

      result.current.deleteItem.mutate({
        path: "/home/user/file.txt",
        isDir: false,
      });

      await waitFor(() => {
        expect(result.current.deleteItem.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("sftp_delete", {
        sessionId: "session-1",
        path: "/home/user/file.txt",
        isDir: false,
      });
      expect(toast.success).toHaveBeenCalledWith("删除成功", expect.anything());
    });

    it("should call sftp_delete for directory", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const { result } = renderHook(
        () => useFileOperations({ sessionId: "session-1", currentPath: "/home/user" }),
        { wrapper }
      );

      result.current.deleteItem.mutate({
        path: "/home/user/folder",
        isDir: true,
      });

      await waitFor(() => {
        expect(result.current.deleteItem.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("sftp_delete", {
        sessionId: "session-1",
        path: "/home/user/folder",
        isDir: true,
      });
    });

    it("should show error for non-empty directory", async () => {
      const error = createMockError({ code: "DIR_NOT_EMPTY", message: "Directory not empty" });
      vi.mocked(invoke).mockRejectedValueOnce(error);

      const { result } = renderHook(
        () => useFileOperations({ sessionId: "session-1", currentPath: "/home" }),
        { wrapper }
      );

      result.current.deleteItem.mutate({
        path: "/home/non-empty-folder",
        isDir: true,
      });

      await waitFor(() => {
        expect(result.current.deleteItem.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe("isOperating", () => {
    it("should be true when any mutation is pending", async () => {
      // Never resolve to keep pending
      vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(
        () => useFileOperations({ sessionId: "session-1", currentPath: "/home" }),
        { wrapper }
      );

      expect(result.current.isOperating).toBe(false);

      result.current.createFolder.mutate("folder");

      await waitFor(() => {
        expect(result.current.isOperating).toBe(true);
      });
    });
  });
});
