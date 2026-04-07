import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useTerminalDirectorySync } from "@/hooks/useTerminalDirectorySync";
import { EVENTS } from "@/types/events";

// Mock terminal lib
vi.mock("@/lib/terminal", () => ({
  decodeTerminalData: vi.fn((base64: string) => {
    const binary = atob(base64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  }),
}));

// Mock event system
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { listen } from "@tauri-apps/api/event";

/**
 * Helper: controllable listen mock with emit
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

/** Encode string to base64 (matches terminal data encoding) */
function toBase64(str: string): string {
  return btoa(str);
}

/** Emit a terminal output event with text content */
function emitOutput(
  mockListen: ReturnType<typeof createListenMock>,
  terminalId: string,
  text: string
) {
  mockListen.emit(EVENTS.TERMINAL_OUTPUT, {
    terminalId,
    data: toBase64(text),
  });
}

describe("useTerminalDirectorySync", () => {
  let mockListen: ReturnType<typeof createListenMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockListen = createListenMock();
    vi.mocked(listen).mockImplementation(mockListen.listenMock as unknown as typeof listen);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    terminalId: "term-001" as string | null,
    currentPath: "/home/user",
    terminalStatus: "connected",
    writeInput: vi.fn(),
    enabled: true,
  };

  it("does not sync when enabled is false", async () => {
    const writeInput = vi.fn();
    renderHook(() =>
      useTerminalDirectorySync({
        ...defaultProps,
        writeInput,
        enabled: false,
        currentPath: "/var/log",
      })
    );

    // Wait for listener setup
    await act(async () => {});

    // Simulate prompt output
    act(() => {
      emitOutput(mockListen, "term-001", "user@host:~$ ");
    });

    // Advance past idle debounce
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(writeInput).not.toHaveBeenCalled();
  });

  it("does not sync when terminal is not connected", async () => {
    const writeInput = vi.fn();
    renderHook(() =>
      useTerminalDirectorySync({
        ...defaultProps,
        writeInput,
        terminalStatus: "disconnected",
        currentPath: "/var/log",
      })
    );

    await act(async () => {});

    act(() => {
      emitOutput(mockListen, "term-001", "user@host:~$ ");
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(writeInput).not.toHaveBeenCalled();
  });

  it("does not sync when terminalId is null", () => {
    const writeInput = vi.fn();
    renderHook(() =>
      useTerminalDirectorySync({
        ...defaultProps,
        writeInput,
        terminalId: null,
      })
    );

    // No listener should be set up
    expect(mockListen.listenMock).not.toHaveBeenCalled();
    expect(writeInput).not.toHaveBeenCalled();
  });

  it("syncs after idle detected and path differs from initial", async () => {
    const writeInput = vi.fn();
    renderHook(() =>
      useTerminalDirectorySync({
        ...defaultProps,
        writeInput,
        currentPath: "/var/log",
      })
    );

    await act(async () => {});

    // Simulate prompt output
    act(() => {
      emitOutput(mockListen, "term-001", "user@host:~$ ");
    });

    // Advance past idle debounce (500ms)
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(writeInput).toHaveBeenCalledTimes(1);
    expect(writeInput).toHaveBeenCalledWith("cd '/var/log'\n");
  });

  it("does not sync when path matches last synced path", async () => {
    const writeInput = vi.fn();
    const { rerender } = renderHook(
      ({ currentPath }) =>
        useTerminalDirectorySync({
          ...defaultProps,
          writeInput,
          currentPath,
        }),
      { initialProps: { currentPath: "/var/log" } }
    );

    await act(async () => {});

    // First sync
    act(() => {
      emitOutput(mockListen, "term-001", "user@host:~$ ");
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(writeInput).toHaveBeenCalledTimes(1);

    // Advance past cooldown
    act(() => {
      vi.advanceTimersByTime(900);
    });

    // Rerender with same path — should not sync again
    rerender({ currentPath: "/var/log" });

    act(() => {
      emitOutput(mockListen, "term-001", "user@host:/var/log$ ");
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(writeInput).toHaveBeenCalledTimes(1);
  });

  it("ignores output from other terminal IDs", async () => {
    const writeInput = vi.fn();
    renderHook(() =>
      useTerminalDirectorySync({
        ...defaultProps,
        writeInput,
        currentPath: "/var/log",
      })
    );

    await act(async () => {});

    // Output from a different terminal
    act(() => {
      emitOutput(mockListen, "term-OTHER", "user@host:~$ ");
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(writeInput).not.toHaveBeenCalled();
  });

  it("does not sync during non-prompt output", async () => {
    const writeInput = vi.fn();
    renderHook(() =>
      useTerminalDirectorySync({
        ...defaultProps,
        writeInput,
        currentPath: "/var/log",
      })
    );

    await act(async () => {});

    // Output that doesn't look like a prompt
    act(() => {
      emitOutput(mockListen, "term-001", "processing files...\n");
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(writeInput).not.toHaveBeenCalled();
  });

  it("syncs when path changes while already idle", async () => {
    const writeInput = vi.fn();
    const { rerender } = renderHook(
      ({ currentPath }) =>
        useTerminalDirectorySync({
          ...defaultProps,
          writeInput,
          currentPath,
        }),
      { initialProps: { currentPath: "/home/user" } }
    );

    await act(async () => {});

    // Become idle with matching path (no sync expected since last synced is null initially,
    // but path differs from null so it will sync)
    act(() => {
      emitOutput(mockListen, "term-001", "user@host:~$ ");
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(writeInput).toHaveBeenCalledTimes(1);
    writeInput.mockClear();

    // Advance past cooldown
    act(() => {
      vi.advanceTimersByTime(900);
    });

    // Make idle again
    act(() => {
      emitOutput(mockListen, "term-001", "user@host:~$ ");
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // Now change path — should sync immediately since idle
    rerender({ currentPath: "/var/log" });

    expect(writeInput).toHaveBeenCalledTimes(1);
    expect(writeInput).toHaveBeenCalledWith("cd '/var/log'\n");
  });

  it("escapes paths with special characters", async () => {
    const writeInput = vi.fn();
    renderHook(() =>
      useTerminalDirectorySync({
        ...defaultProps,
        writeInput,
        currentPath: "/path/with space/it's",
      })
    );

    await act(async () => {});

    act(() => {
      emitOutput(mockListen, "term-001", "user@host:~$ ");
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(writeInput).toHaveBeenCalledWith("cd '/path/with space/it'\\''s'\n");
  });

  it("cleans up listeners on unmount", async () => {
    const { unmount } = renderHook(() => useTerminalDirectorySync(defaultProps));

    await act(async () => {});

    expect(mockListen.unlistenFns.length).toBeGreaterThan(0);

    unmount();

    // All unlisten functions should have been called
    mockListen.unlistenFns.forEach((fn) => {
      expect(fn).toHaveBeenCalled();
    });
  });
});
