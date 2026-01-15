import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useFileList } from "@/hooks/useFileList";
import type { ReactNode } from "react";
import type { FileEntry } from "@/types";

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

// 工厂函数创建 FileEntry
const createFileEntry = (overrides: Partial<FileEntry> = {}): FileEntry => ({
  name: "file.txt",
  path: "/home/user/file.txt",
  isDir: false,
  size: 1024,
  mtime: 1700000000,
  ...overrides,
});

// 创建 mock 文件列表
const createMockFiles = (): FileEntry[] => [
  createFileEntry({ name: "folder1", path: "/home/user/folder1", isDir: true }),
  createFileEntry({ name: "file1.txt", path: "/home/user/file1.txt", mtime: 1700000100 }),
  createFileEntry({ name: "file2.txt", path: "/home/user/file2.txt", size: 2048, mtime: 1700000200 }),
];

describe("useFileList", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  describe("initial state", () => {
    it("should return empty files array initially", () => {
      vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(
        () => useFileList({ sessionId: "session-1", path: "/home/user" }),
        { wrapper }
      );

      expect(result.current.files).toEqual([]);
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("data fetching", () => {
    it("should fetch files successfully", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(createMockFiles());

      const { result } = renderHook(
        () => useFileList({ sessionId: "session-1", path: "/home/user" }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.files).toEqual(createMockFiles());
      expect(invoke).toHaveBeenCalledWith("sftp_list_dir", {
        sessionId: "session-1",
        path: "/home/user",
        sort: undefined,
      });
    });

    it("should pass sort option to backend", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(createMockFiles());

      const { result } = renderHook(
        () =>
          useFileList({
            sessionId: "session-1",
            path: "/home/user",
            sort: { field: "mtime", order: "desc" },
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(invoke).toHaveBeenCalledWith("sftp_list_dir", {
        sessionId: "session-1",
        path: "/home/user",
        sort: { field: "mtime", order: "desc" },
      });
    });

    it("should return empty array when backend returns null", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(null);

      const { result } = renderHook(
        () => useFileList({ sessionId: "session-1", path: "/home/user" }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.files).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should set error on failure", async () => {
      const error = { code: "NOT_FOUND", message: "Directory not found" };
      vi.mocked(invoke).mockRejectedValueOnce(error);

      const { result } = renderHook(
        () => useFileList({ sessionId: "session-1", path: "/nonexistent" }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.files).toEqual([]);
    });
  });

  describe("enabled option", () => {
    it("should not fetch when enabled is false", () => {
      const { result } = renderHook(
        () => useFileList({ sessionId: "session-1", path: "/home/user", enabled: false }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("should not fetch when sessionId is empty", () => {
      const { result } = renderHook(
        () => useFileList({ sessionId: "", path: "/home/user" }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("should not fetch when path is empty", () => {
      const { result } = renderHook(
        () => useFileList({ sessionId: "session-1", path: "" }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("refetch", () => {
    it("should refetch data when refetch is called", async () => {
      vi.mocked(invoke).mockResolvedValue(createMockFiles());

      const { result } = renderHook(
        () => useFileList({ sessionId: "session-1", path: "/home/user" }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(invoke).toHaveBeenCalledTimes(1);

      // Trigger refetch
      result.current.refetch();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("query key", () => {
    it("should refetch when path changes", async () => {
      vi.mocked(invoke).mockResolvedValue(createMockFiles());

      const { result, rerender } = renderHook(
        ({ path }) => useFileList({ sessionId: "session-1", path }),
        { wrapper, initialProps: { path: "/home/user" } }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(invoke).toHaveBeenCalledTimes(1);

      // Change path
      rerender({ path: "/home/user/subfolder" });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(2);
      });

      expect(invoke).toHaveBeenLastCalledWith("sftp_list_dir", {
        sessionId: "session-1",
        path: "/home/user/subfolder",
        sort: undefined,
      });
    });
  });
});
