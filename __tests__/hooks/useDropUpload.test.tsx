import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDropUpload } from "@/hooks/useDropUpload";
import * as transferLib from "@/lib/transfer";
import { useTransferStore } from "@/stores/useTransferStore";

// Mock Tauri webview API
const mockUnlisten = vi.fn();
let mockDragDropHandler: ((event: { payload: { type: string; paths?: string[] } }) => void) | null = null;

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn((handler) => {
      mockDragDropHandler = handler;
      return Promise.resolve(mockUnlisten);
    }),
  }),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  stat: vi.fn().mockResolvedValue({ isDirectory: false }),
}));

vi.mock("@/lib/transfer", () => ({
  uploadFile: vi.fn(),
  uploadDirectory: vi.fn(),
  getTransfer: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

describe("useDropUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDragDropHandler = null;
    useTransferStore.setState({ tasks: new Map() });
  });

  afterEach(() => {
    mockDragDropHandler = null;
  });

  describe("initial state", () => {
    it("should have isDragging false initially", () => {
      const { result } = renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user" })
      );

      expect(result.current.isDragging).toBe(false);
    });

    it("should only return isDragging", () => {
      const { result } = renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user" })
      );

      expect(Object.keys(result.current)).toEqual(["isDragging"]);
    });
  });

  describe("drag events", () => {
    it("should set isDragging true on enter event", async () => {
      const { result } = renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user" })
      );

      await waitFor(() => {
        expect(mockDragDropHandler).not.toBeNull();
      });

      act(() => {
        mockDragDropHandler!({ payload: { type: "enter" } });
      });

      expect(result.current.isDragging).toBe(true);
    });

    it("should set isDragging true on over event", async () => {
      const { result } = renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user" })
      );

      await waitFor(() => {
        expect(mockDragDropHandler).not.toBeNull();
      });

      act(() => {
        mockDragDropHandler!({ payload: { type: "over" } });
      });

      expect(result.current.isDragging).toBe(true);
    });

    it("should set isDragging false on leave event", async () => {
      const { result } = renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user" })
      );

      await waitFor(() => {
        expect(mockDragDropHandler).not.toBeNull();
      });

      act(() => {
        mockDragDropHandler!({ payload: { type: "enter" } });
      });
      expect(result.current.isDragging).toBe(true);

      act(() => {
        mockDragDropHandler!({ payload: { type: "leave" } });
      });
      expect(result.current.isDragging).toBe(false);
    });

    it("should not respond when disabled", async () => {
      const { result } = renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user", enabled: false })
      );

      await waitFor(() => {
        expect(mockDragDropHandler).not.toBeNull();
      });

      act(() => {
        mockDragDropHandler!({ payload: { type: "enter" } });
      });

      expect(result.current.isDragging).toBe(false);
    });
  });

  describe("drop event", () => {
    it("should reset isDragging and upload files on drop", async () => {
      vi.mocked(transferLib.uploadFile).mockResolvedValueOnce("task-1");
      vi.mocked(transferLib.getTransfer).mockResolvedValueOnce({
        taskId: "task-1",
        sessionId: "session-1",
        direction: "upload",
        localPath: "/local/file.txt",
        remotePath: "/home/user/file.txt",
        fileName: "file.txt",
        status: "waiting",
        transferred: 0,
        total: 1024,
        createdAt: Date.now(),
      });

      const { result } = renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user" })
      );

      await waitFor(() => {
        expect(mockDragDropHandler).not.toBeNull();
      });

      act(() => {
        mockDragDropHandler!({ payload: { type: "enter" } });
      });
      expect(result.current.isDragging).toBe(true);

      await act(async () => {
        await mockDragDropHandler!({
          payload: { type: "drop", paths: ["/local/file.txt"] },
        });
      });

      expect(result.current.isDragging).toBe(false);

      await waitFor(() => {
        expect(transferLib.uploadFile).toHaveBeenCalledWith(
          "session-1",
          "/local/file.txt",
          "/home/user"
        );
      });
    });

    it("should upload multiple files", async () => {
      vi.mocked(transferLib.uploadFile)
        .mockResolvedValueOnce("task-1")
        .mockResolvedValueOnce("task-2");
      vi.mocked(transferLib.getTransfer)
        .mockResolvedValueOnce({
          taskId: "task-1",
          sessionId: "session-1",
          direction: "upload",
          localPath: "/local/file1.txt",
          remotePath: "/home/user/file1.txt",
          fileName: "file1.txt",
          status: "waiting",
          transferred: 0,
          total: 1024,
          createdAt: Date.now(),
        })
        .mockResolvedValueOnce({
          taskId: "task-2",
          sessionId: "session-1",
          direction: "upload",
          localPath: "/local/file2.txt",
          remotePath: "/home/user/file2.txt",
          fileName: "file2.txt",
          status: "waiting",
          transferred: 0,
          total: 2048,
          createdAt: Date.now(),
        });

      renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user" })
      );

      await waitFor(() => {
        expect(mockDragDropHandler).not.toBeNull();
      });

      await act(async () => {
        await mockDragDropHandler!({
          payload: { type: "drop", paths: ["/local/file1.txt", "/local/file2.txt"] },
        });
      });

      await waitFor(() => {
        expect(transferLib.uploadFile).toHaveBeenCalledTimes(2);
        expect(transferLib.uploadFile).toHaveBeenCalledWith(
          "session-1",
          "/local/file1.txt",
          "/home/user"
        );
        expect(transferLib.uploadFile).toHaveBeenCalledWith(
          "session-1",
          "/local/file2.txt",
          "/home/user"
        );
      });
    });

    it("should not upload when disabled", async () => {
      renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user", enabled: false })
      );

      await waitFor(() => {
        expect(mockDragDropHandler).not.toBeNull();
      });

      await act(async () => {
        await mockDragDropHandler!({
          payload: { type: "drop", paths: ["/local/file.txt"] },
        });
      });

      expect(transferLib.uploadFile).not.toHaveBeenCalled();
    });

    it("should not upload when paths is empty", async () => {
      renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user" })
      );

      await waitFor(() => {
        expect(mockDragDropHandler).not.toBeNull();
      });

      await act(async () => {
        await mockDragDropHandler!({
          payload: { type: "drop", paths: [] },
        });
      });

      expect(transferLib.uploadFile).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should call unlisten on unmount", async () => {
      const { unmount } = renderHook(() =>
        useDropUpload({ sessionId: "session-1", remotePath: "/home/user" })
      );

      await waitFor(() => {
        expect(mockDragDropHandler).not.toBeNull();
      });

      unmount();

      expect(mockUnlisten).toHaveBeenCalled();
    });
  });

  describe("ref updates", () => {
    it("should use updated sessionId and remotePath on drop", async () => {
      vi.mocked(transferLib.uploadFile).mockResolvedValueOnce("task-1");
      vi.mocked(transferLib.getTransfer).mockResolvedValueOnce({
        taskId: "task-1",
        sessionId: "session-2",
        direction: "upload",
        localPath: "/local/file.txt",
        remotePath: "/new/path/file.txt",
        fileName: "file.txt",
        status: "waiting",
        transferred: 0,
        total: 1024,
        createdAt: Date.now(),
      });

      const { rerender } = renderHook(
        ({ sessionId, remotePath }) =>
          useDropUpload({ sessionId, remotePath }),
        { initialProps: { sessionId: "session-1", remotePath: "/home/user" } }
      );

      await waitFor(() => {
        expect(mockDragDropHandler).not.toBeNull();
      });

      // Update props
      rerender({ sessionId: "session-2", remotePath: "/new/path" });

      await act(async () => {
        await mockDragDropHandler!({
          payload: { type: "drop", paths: ["/local/file.txt"] },
        });
      });

      await waitFor(() => {
        expect(transferLib.uploadFile).toHaveBeenCalledWith(
          "session-2",
          "/local/file.txt",
          "/new/path"
        );
      });
    });
  });
});
