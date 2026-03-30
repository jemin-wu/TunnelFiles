import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";

import { useTerminalEvents } from "@/hooks/useTerminalEvents";
import { EVENTS } from "@/types/events";
import type { TerminalOutputPayload, TerminalStatusPayload } from "@/types/terminal";

// Mock terminal lib (only decodeTerminalData is used by this hook)
vi.mock("@/lib/terminal", () => ({
  decodeTerminalData: vi.fn((base64: string) => {
    const binary = atob(base64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  }),
}));

import { decodeTerminalData } from "@/lib/terminal";

/**
 * Helper: set up a controllable listen mock that captures event handlers
 * and provides an emit function to simulate Tauri events.
 */
function createListenMock() {
  const handlers = new Map<string, ((event: { payload: unknown }) => void)[]>();
  const unlistenFns: Mock[] = [];

  const listenMock = vi.fn((eventName: string, handler: (event: { payload: unknown }) => void) => {
    if (!handlers.has(eventName)) {
      handlers.set(eventName, []);
    }
    handlers.get(eventName)!.push(handler);

    const unlisten = vi.fn(() => {
      const eventHandlers = handlers.get(eventName);
      if (eventHandlers) {
        const idx = eventHandlers.indexOf(handler);
        if (idx > -1) eventHandlers.splice(idx, 1);
      }
    });
    unlistenFns.push(unlisten);

    return Promise.resolve(unlisten);
  });

  const emit = (eventName: string, payload: unknown) => {
    const eventHandlers = handlers.get(eventName);
    if (eventHandlers) {
      eventHandlers.forEach((handler) => handler({ payload }));
    }
  };

  return { listenMock, emit, handlers, unlistenFns };
}

describe("useTerminalEvents", () => {
  let mockListen: ReturnType<typeof createListenMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockListen = createListenMock();
    vi.mocked(listen).mockImplementation(mockListen.listenMock as unknown as typeof listen);
  });

  describe("event registration", () => {
    it("should register listeners for terminal output and status events", async () => {
      const onOutput = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
          onStatusChange,
        })
      );

      // Wait for async setup to complete
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(listen).toHaveBeenCalledTimes(2);
      expect(listen).toHaveBeenCalledWith(EVENTS.TERMINAL_OUTPUT, expect.any(Function));
      expect(listen).toHaveBeenCalledWith(EVENTS.TERMINAL_STATUS, expect.any(Function));
    });

    it("should register listeners even without onStatusChange callback", async () => {
      const onOutput = vi.fn();

      renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Both listeners are always registered (status handler is optional via ?.)
      expect(listen).toHaveBeenCalledTimes(2);
    });
  });

  describe("terminal output events", () => {
    it("should decode and forward output data to onOutput callback", async () => {
      const onOutput = vi.fn();
      const inputData = "Hello, terminal!";
      const base64Data = btoa(inputData);

      renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Simulate terminal output event
      act(() => {
        const payload: TerminalOutputPayload = {
          terminalId: "term-001",
          data: base64Data,
        };
        mockListen.emit(EVENTS.TERMINAL_OUTPUT, payload);
      });

      expect(decodeTerminalData).toHaveBeenCalledWith(base64Data);
      expect(onOutput).toHaveBeenCalledTimes(1);
      expect(onOutput).toHaveBeenCalledWith(expect.any(Uint8Array));

      // Verify decoded content
      const receivedData = onOutput.mock.calls[0][0] as Uint8Array;
      const decoded = new TextDecoder().decode(receivedData);
      expect(decoded).toBe(inputData);
    });

    it("should filter events by terminalId", async () => {
      const onOutput = vi.fn();

      renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Event for a different terminal — should be ignored
      act(() => {
        const payload: TerminalOutputPayload = {
          terminalId: "term-OTHER",
          data: btoa("wrong terminal"),
        };
        mockListen.emit(EVENTS.TERMINAL_OUTPUT, payload);
      });

      expect(onOutput).not.toHaveBeenCalled();
    });

    it("should ignore output events when terminalId is null", async () => {
      const onOutput = vi.fn();

      renderHook(() =>
        useTerminalEvents({
          terminalId: null,
          onOutput,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      act(() => {
        const payload: TerminalOutputPayload = {
          terminalId: "term-001",
          data: btoa("data"),
        };
        mockListen.emit(EVENTS.TERMINAL_OUTPUT, payload);
      });

      expect(onOutput).not.toHaveBeenCalled();
    });
  });

  describe("terminal status events", () => {
    it("should forward status change events to onStatusChange callback", async () => {
      const onOutput = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
          onStatusChange,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      act(() => {
        const payload: TerminalStatusPayload = {
          terminalId: "term-001",
          status: "disconnected",
          message: "Connection lost",
        };
        mockListen.emit(EVENTS.TERMINAL_STATUS, payload);
      });

      expect(onStatusChange).toHaveBeenCalledTimes(1);
      expect(onStatusChange).toHaveBeenCalledWith({
        terminalId: "term-001",
        status: "disconnected",
        message: "Connection lost",
      });
    });

    it("should forward reconnecting status with attempt info", async () => {
      const onOutput = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
          onStatusChange,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      act(() => {
        const payload: TerminalStatusPayload = {
          terminalId: "term-001",
          status: "reconnecting",
          reconnectAttempt: 3,
          maxReconnectAttempts: 5,
        };
        mockListen.emit(EVENTS.TERMINAL_STATUS, payload);
      });

      expect(onStatusChange).toHaveBeenCalledWith({
        terminalId: "term-001",
        status: "reconnecting",
        reconnectAttempt: 3,
        maxReconnectAttempts: 5,
      });
    });

    it("should filter status events by terminalId", async () => {
      const onOutput = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
          onStatusChange,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      act(() => {
        const payload: TerminalStatusPayload = {
          terminalId: "term-OTHER",
          status: "error",
        };
        mockListen.emit(EVENTS.TERMINAL_STATUS, payload);
      });

      expect(onStatusChange).not.toHaveBeenCalled();
    });

    it("should not throw when onStatusChange is not provided", async () => {
      const onOutput = vi.fn();

      renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
          // onStatusChange intentionally omitted
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Should not throw
      act(() => {
        const payload: TerminalStatusPayload = {
          terminalId: "term-001",
          status: "disconnected",
        };
        mockListen.emit(EVENTS.TERMINAL_STATUS, payload);
      });
    });
  });

  describe("cleanup", () => {
    it("should call all unlisten functions on unmount", async () => {
      const onOutput = vi.fn();

      const { unmount } = renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Should have registered 2 listeners
      expect(mockListen.unlistenFns).toHaveLength(2);

      unmount();

      // All unlisten functions should have been called
      for (const unlisten of mockListen.unlistenFns) {
        expect(unlisten).toHaveBeenCalledTimes(1);
      }
    });

    it("should not process events after unmount", async () => {
      const onOutput = vi.fn();

      const { unmount } = renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      unmount();

      // Emit event after unmount — handler was removed by unlisten
      act(() => {
        const payload: TerminalOutputPayload = {
          terminalId: "term-001",
          data: btoa("after unmount"),
        };
        mockListen.emit(EVENTS.TERMINAL_OUTPUT, payload);
      });

      expect(onOutput).not.toHaveBeenCalled();
    });

    it("should handle early unmount before setup completes (cancelled guard)", async () => {
      // Simulate slow listen that resolves after unmount
      let resolveFirst: (fn: () => void) => void;
      vi.mocked(listen).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }) as Promise<() => void>
      );

      const onOutput = vi.fn();

      const { unmount } = renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
        })
      );

      // Unmount before listen resolves
      unmount();

      // Now resolve the listen — the cancelled guard should call unlisten immediately
      const unlisten = vi.fn();
      await act(async () => {
        resolveFirst!(unlisten);
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(unlisten).toHaveBeenCalled();
    });
  });

  describe("terminalId ref updates", () => {
    it("should use latest terminalId without re-subscribing", async () => {
      const onOutput = vi.fn();

      const { rerender } = renderHook(
        ({ terminalId }) =>
          useTerminalEvents({
            terminalId,
            onOutput,
          }),
        { initialProps: { terminalId: "term-001" as string | null } }
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Listeners should only be set up once ([] dependency)
      const initialCallCount = (listen as Mock).mock.calls.length;

      // Update terminalId via re-render
      rerender({ terminalId: "term-002" });

      // No new listeners should be registered
      expect((listen as Mock).mock.calls.length).toBe(initialCallCount);

      // Event for new terminalId should be processed
      act(() => {
        const payload: TerminalOutputPayload = {
          terminalId: "term-002",
          data: btoa("new terminal"),
        };
        mockListen.emit(EVENTS.TERMINAL_OUTPUT, payload);
      });

      expect(onOutput).toHaveBeenCalledTimes(1);

      // Event for old terminalId should be ignored
      act(() => {
        const payload: TerminalOutputPayload = {
          terminalId: "term-001",
          data: btoa("old terminal"),
        };
        mockListen.emit(EVENTS.TERMINAL_OUTPUT, payload);
      });

      // Still only 1 call (old terminal event was ignored)
      expect(onOutput).toHaveBeenCalledTimes(1);
    });
  });

  describe("callback ref updates", () => {
    it("should use latest callback without re-subscribing", async () => {
      const onOutput1 = vi.fn();
      const onOutput2 = vi.fn();

      const { rerender } = renderHook(
        ({ onOutput }) =>
          useTerminalEvents({
            terminalId: "term-001",
            onOutput,
          }),
        { initialProps: { onOutput: onOutput1 } }
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Switch callback
      rerender({ onOutput: onOutput2 });

      // Emit event — should go to new callback
      act(() => {
        const payload: TerminalOutputPayload = {
          terminalId: "term-001",
          data: btoa("data"),
        };
        mockListen.emit(EVENTS.TERMINAL_OUTPUT, payload);
      });

      expect(onOutput1).not.toHaveBeenCalled();
      expect(onOutput2).toHaveBeenCalledTimes(1);
    });
  });

  describe("multiple mount/unmount cycles", () => {
    it("should not leak listeners across mount cycles", async () => {
      const onOutput = vi.fn();

      // First mount
      const { unmount: unmount1 } = renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      unmount1();

      // Reset mock to track new calls
      vi.mocked(listen).mockImplementation(mockListen.listenMock as unknown as typeof listen);

      // Re-create listen mock for second mount
      const secondMock = createListenMock();
      vi.mocked(listen).mockImplementation(secondMock.listenMock as unknown as typeof listen);

      // Second mount
      const { unmount: unmount2 } = renderHook(() =>
        useTerminalEvents({
          terminalId: "term-001",
          onOutput,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      unmount2();

      // All unlisten fns from second mount should be called
      for (const unlisten of secondMock.unlistenFns) {
        expect(unlisten).toHaveBeenCalledTimes(1);
      }
    });
  });
});
