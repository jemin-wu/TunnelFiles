import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useTerminal } from "@/hooks/useTerminal";
import type { TerminalInfo } from "@/types/terminal";

// Mock terminal lib (IPC wrappers)
// closeTerminal must default to returning a Promise because the cleanup effect calls .catch() on it
vi.mock("@/lib/terminal", () => ({
  openTerminal: vi.fn(),
  closeTerminal: vi.fn(() => Promise.resolve()),
  writeTerminalInput: vi.fn(() => Promise.resolve()),
  resizeTerminal: vi.fn(() => Promise.resolve()),
  reconnectTerminal: vi.fn(() => Promise.resolve()),
  encodeTerminalData: vi.fn((data: string) => btoa(data)),
}));

// Mock perf instrumentation (no-op in tests)
vi.mock("@/lib/terminal-perf", () => ({
  measureInputStart: vi.fn(() => 0),
  measureInputEnd: vi.fn(),
}));

// Mock error toast
vi.mock("@/lib/error", () => ({
  showErrorToast: vi.fn(),
}));

import {
  openTerminal,
  closeTerminal,
  writeTerminalInput,
  resizeTerminal,
  reconnectTerminal,
} from "@/lib/terminal";
import { showErrorToast } from "@/lib/error";

const mockTerminalInfo: TerminalInfo = {
  terminalId: "term-001",
  sessionId: "session-abc",
};

describe("useTerminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default Promise return values after clearAllMocks
    // closeTerminal MUST return a Promise because the cleanup effect calls .catch() on it
    vi.mocked(closeTerminal).mockReturnValue(Promise.resolve());
    vi.mocked(writeTerminalInput).mockReturnValue(Promise.resolve());
    vi.mocked(resizeTerminal).mockReturnValue(Promise.resolve());
    vi.mocked(reconnectTerminal).mockReturnValue(Promise.resolve());
  });

  describe("initial state", () => {
    it("should return correct initial values", () => {
      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      expect(result.current.terminalInfo).toBeNull();
      expect(result.current.status).toBe("disconnected");
      expect(result.current.isOpening).toBe(false);
      expect(result.current.isReconnecting).toBe(false);
      expect(result.current.reconnectAttempt).toBeNull();
      expect(result.current.maxReconnectAttempts).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("should expose all expected functions", () => {
      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      expect(typeof result.current.open).toBe("function");
      expect(typeof result.current.close).toBe("function");
      expect(typeof result.current.reconnect).toBe("function");
      expect(typeof result.current.writeInput).toBe("function");
      expect(typeof result.current.resize).toBe("function");
      expect(typeof result.current.setStatus).toBe("function");
    });
  });

  describe("open", () => {
    it("should open terminal and update state on success", async () => {
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      expect(openTerminal).toHaveBeenCalledWith({
        sessionId: "session-abc",
        cols: undefined,
        rows: undefined,
      });
      expect(result.current.terminalInfo).toEqual(mockTerminalInfo);
      expect(result.current.status).toBe("connected");
      expect(result.current.isOpening).toBe(false);
    });

    it("should pass cols and rows when provided", async () => {
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);

      const { result } = renderHook(() =>
        useTerminal({ sessionId: "session-abc", cols: 120, rows: 40 })
      );

      await act(async () => {
        await result.current.open();
      });

      expect(openTerminal).toHaveBeenCalledWith({
        sessionId: "session-abc",
        cols: 120,
        rows: 40,
      });
    });

    it("should set error state and show toast on failure", async () => {
      const error = new Error("SSH connection failed");
      vi.mocked(openTerminal).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      expect(result.current.terminalInfo).toBeNull();
      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe(error);
      expect(result.current.isOpening).toBe(false);
      expect(showErrorToast).toHaveBeenCalledWith(error);
    });

    it("should not open if already has terminal info (idempotent guard)", async () => {
      vi.mocked(openTerminal).mockResolvedValue(mockTerminalInfo);

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      // First open succeeds
      await act(async () => {
        await result.current.open();
      });

      // Second open should be no-op
      await act(async () => {
        await result.current.open();
      });

      expect(openTerminal).toHaveBeenCalledTimes(1);
    });

    it("should not open concurrently (isOpeningRef guard)", async () => {
      let resolveOpen: (val: TerminalInfo) => void;
      vi.mocked(openTerminal).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveOpen = resolve;
          })
      );

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      // Start first open (won't resolve yet)
      let firstOpen: Promise<void>;
      act(() => {
        firstOpen = result.current.open();
      });

      // Try second open while first is in progress
      await act(async () => {
        await result.current.open();
      });

      // Only one IPC call should have been made
      expect(openTerminal).toHaveBeenCalledTimes(1);

      // Resolve first open
      await act(async () => {
        resolveOpen!(mockTerminalInfo);
        await firstOpen!;
      });
    });
  });

  describe("close", () => {
    it("should close terminal and reset state", async () => {
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);
      vi.mocked(closeTerminal).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      expect(result.current.terminalInfo).not.toBeNull();

      await act(async () => {
        await result.current.close();
      });

      expect(closeTerminal).toHaveBeenCalledWith("term-001");
      expect(result.current.terminalInfo).toBeNull();
      expect(result.current.status).toBe("disconnected");
    });

    it("should do nothing if no terminal is open", async () => {
      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.close();
      });

      expect(closeTerminal).not.toHaveBeenCalled();
    });

    it("should show error toast on close failure", async () => {
      const error = new Error("Close failed");
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);
      vi.mocked(closeTerminal).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      await act(async () => {
        await result.current.close();
      });

      expect(showErrorToast).toHaveBeenCalledWith(error);
    });
  });

  describe("writeInput", () => {
    it("should send encoded input via IPC", async () => {
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);
      vi.mocked(writeTerminalInput).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      act(() => {
        result.current.writeInput("ls\n");
      });

      // writeTerminalInput is fire-and-forget, wait for promise to flush
      await act(async () => {
        await vi.waitFor(() => {
          expect(writeTerminalInput).toHaveBeenCalledWith({
            terminalId: "term-001",
            data: btoa("ls\n"),
          });
        });
      });
    });

    it("should do nothing if terminal is not open", () => {
      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      act(() => {
        result.current.writeInput("ls\n");
      });

      expect(writeTerminalInput).not.toHaveBeenCalled();
    });

    it("should show error toast only once on repeated write failures", async () => {
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);
      const error = new Error("Write failed");
      vi.mocked(writeTerminalInput).mockRejectedValue(error);

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      // Send multiple inputs that will all fail
      act(() => {
        result.current.writeInput("a");
      });

      // Wait for the fire-and-forget promise to reject
      await act(async () => {
        // Allow microtasks to process
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.writeInput("b");
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // showErrorToast should be called only once
      expect(showErrorToast).toHaveBeenCalledTimes(1);
      expect(showErrorToast).toHaveBeenCalledWith(error);
      expect(result.current.status).toBe("error");
    });
  });

  describe("resize", () => {
    it("should send resize command via IPC", async () => {
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);
      vi.mocked(resizeTerminal).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      await act(async () => {
        await result.current.resize(120, 40);
      });

      expect(resizeTerminal).toHaveBeenCalledWith({
        terminalId: "term-001",
        cols: 120,
        rows: 40,
      });
    });

    it("should do nothing if terminal is not open", async () => {
      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.resize(120, 40);
      });

      expect(resizeTerminal).not.toHaveBeenCalled();
    });

    it("should not throw on resize failure (only warns)", async () => {
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);
      vi.mocked(resizeTerminal).mockRejectedValueOnce(new Error("Resize failed"));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      // Should not throw
      await act(async () => {
        await result.current.resize(120, 40);
      });

      expect(warnSpy).toHaveBeenCalledWith("Failed to resize terminal:", expect.any(Error));

      warnSpy.mockRestore();
    });
  });

  describe("reconnect", () => {
    it("should reconnect and update status on success", async () => {
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);
      vi.mocked(reconnectTerminal).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      await act(async () => {
        await result.current.reconnect();
      });

      expect(reconnectTerminal).toHaveBeenCalledWith("term-001");
      expect(result.current.status).toBe("connected");
      expect(result.current.isReconnecting).toBe(false);
      expect(result.current.reconnectAttempt).toBeNull();
      expect(result.current.maxReconnectAttempts).toBeNull();
    });

    it("should do nothing if no terminal is open", async () => {
      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.reconnect();
      });

      expect(reconnectTerminal).not.toHaveBeenCalled();
    });

    it("should set error state and show toast on reconnect failure", async () => {
      const error = new Error("Reconnect failed");
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);
      vi.mocked(reconnectTerminal).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      await act(async () => {
        await result.current.reconnect();
      });

      expect(result.current.status).toBe("disconnected");
      expect(result.current.error).toBe(error);
      expect(result.current.isReconnecting).toBe(false);
      expect(showErrorToast).toHaveBeenCalledWith(error);
    });
  });

  describe("setStatus", () => {
    it("should update status to connected and clear reconnect state", () => {
      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      act(() => {
        result.current.setStatus({
          terminalId: "term-001",
          status: "connected",
        });
      });

      expect(result.current.status).toBe("connected");
      expect(result.current.isReconnecting).toBe(false);
      expect(result.current.reconnectAttempt).toBeNull();
      expect(result.current.maxReconnectAttempts).toBeNull();
    });

    it("should update status to disconnected and clear reconnect state", () => {
      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      act(() => {
        result.current.setStatus({
          terminalId: "term-001",
          status: "disconnected",
        });
      });

      expect(result.current.status).toBe("disconnected");
      expect(result.current.isReconnecting).toBe(false);
    });

    it("should update reconnect progress when status is reconnecting", () => {
      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      act(() => {
        result.current.setStatus({
          terminalId: "term-001",
          status: "reconnecting",
          reconnectAttempt: 2,
          maxReconnectAttempts: 5,
        });
      });

      expect(result.current.status).toBe("reconnecting");
      expect(result.current.isReconnecting).toBe(true);
      expect(result.current.reconnectAttempt).toBe(2);
      expect(result.current.maxReconnectAttempts).toBe(5);
    });

    it("should handle error status", () => {
      const { result } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      act(() => {
        result.current.setStatus({
          terminalId: "term-001",
          status: "error",
        });
      });

      expect(result.current.status).toBe("error");
    });
  });

  describe("cleanup on sessionId change", () => {
    it("should close terminal when sessionId changes", async () => {
      vi.mocked(openTerminal).mockResolvedValue(mockTerminalInfo);
      vi.mocked(closeTerminal).mockResolvedValue(undefined);

      const { result, rerender } = renderHook(({ sessionId }) => useTerminal({ sessionId }), {
        initialProps: { sessionId: "session-abc" },
      });

      await act(async () => {
        await result.current.open();
      });

      expect(result.current.terminalInfo).toEqual(mockTerminalInfo);

      // Change sessionId triggers cleanup
      rerender({ sessionId: "session-xyz" });

      // Cleanup effect calls closeTerminal with the old terminalId
      expect(closeTerminal).toHaveBeenCalledWith("term-001");
    });

    it("should close terminal on unmount", async () => {
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);
      vi.mocked(closeTerminal).mockResolvedValue(undefined);

      const { result, unmount } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      unmount();

      expect(closeTerminal).toHaveBeenCalledWith("term-001");
    });

    it("should not call closeTerminal on unmount if no terminal was opened", () => {
      const { unmount } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      unmount();

      expect(closeTerminal).not.toHaveBeenCalled();
    });

    it("should handle cleanup close error gracefully", async () => {
      vi.mocked(openTerminal).mockResolvedValueOnce(mockTerminalInfo);
      vi.mocked(closeTerminal).mockRejectedValue(new Error("Cleanup close failed"));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { result, unmount } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      // unmount should not throw even if closeTerminal fails
      unmount();

      // Allow the async rejection to be caught
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(closeTerminal).toHaveBeenCalledWith("term-001");
      warnSpy.mockRestore();
    });
  });

  describe("StrictMode safety", () => {
    it("should not create duplicate terminals when hook is re-initialized", async () => {
      vi.mocked(openTerminal).mockResolvedValue(mockTerminalInfo);
      vi.mocked(closeTerminal).mockResolvedValue(undefined);

      // Simulate StrictMode: mount, unmount, remount
      const { result, unmount } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      await act(async () => {
        await result.current.open();
      });

      unmount();

      // Remount
      const { result: result2 } = renderHook(() => useTerminal({ sessionId: "session-abc" }));

      // New instance should start clean
      expect(result2.current.terminalInfo).toBeNull();
      expect(result2.current.status).toBe("disconnected");
    });
  });
});
