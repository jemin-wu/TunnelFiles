import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAiChat } from "@/hooks/useAiChat";
import { useAiSessionStore } from "@/stores/useAiSessionStore";

type Handler = (event: { payload: unknown }) => void;

let listeners: Map<string, Handler>;
let unsubscribed: Set<string>;

beforeEach(() => {
  vi.clearAllMocks();
  useAiSessionStore.setState({ sessions: new Map() });
  listeners = new Map();
  unsubscribed = new Set();

  vi.mocked(listen).mockImplementation(async (event, handler) => {
    listeners.set(event as string, handler as unknown as Handler);
    return () => {
      unsubscribed.add(event as string);
    };
  });
});

async function waitForListenerRegistered(name: string) {
  await waitFor(() => expect(listeners.has(name)).toBe(true));
}

describe("useAiChat", () => {
  it("registers listeners for ai:token, ai:done, ai:error, ai:probe_queued", async () => {
    renderHook(() => useAiChat("tab-1"));
    await waitForListenerRegistered("ai:token");
    await waitForListenerRegistered("ai:done");
    await waitForListenerRegistered("ai:error");
    await waitForListenerRegistered("ai:probe_queued");
  });

  it("appendAssistantToken on ai:token matching sessionId", async () => {
    // 先在 store 里准备一个 pending assistant 占位
    useAiSessionStore.getState().appendUserMessage("tab-1", "hi");
    useAiSessionStore.getState().beginThinking("tab-1");

    renderHook(() => useAiChat("tab-1"));
    await waitForListenerRegistered("ai:token");

    act(() => {
      listeners.get("ai:token")!({
        payload: { sessionId: "tab-1", messageId: "m1", token: "He" },
      });
      listeners.get("ai:token")!({
        payload: { sessionId: "tab-1", messageId: "m1", token: "llo" },
      });
    });

    const session = useAiSessionStore.getState().getSession("tab-1")!;
    const assistant = session.messages.find((m) => m.role === "assistant")!;
    expect(assistant.content).toBe("Hello");
    expect(session.streamState).toBe("streaming");
  });

  it("ignores ai:token for a different sessionId", async () => {
    useAiSessionStore.getState().appendUserMessage("tab-1", "hi");
    useAiSessionStore.getState().beginThinking("tab-1");

    renderHook(() => useAiChat("tab-1"));
    await waitForListenerRegistered("ai:token");

    act(() => {
      listeners.get("ai:token")!({
        payload: { sessionId: "tab-OTHER", messageId: "m9", token: "leak" },
      });
    });

    const session = useAiSessionStore.getState().getSession("tab-1")!;
    const assistant = session.messages.find((m) => m.role === "assistant")!;
    expect(assistant.content).toBe(""); // unchanged
  });

  it("completes stream on ai:done matching sessionId", async () => {
    useAiSessionStore.getState().appendUserMessage("tab-1", "hi");
    useAiSessionStore.getState().beginThinking("tab-1");

    renderHook(() => useAiChat("tab-1"));
    await waitForListenerRegistered("ai:done");

    act(() => {
      listeners.get("ai:done")!({
        payload: { sessionId: "tab-1", messageId: "m1", truncated: false },
      });
    });

    expect(useAiSessionStore.getState().getSession("tab-1")?.streamState).toBe("idle");
  });

  it("fails stream on ai:error and surfaces error.message", async () => {
    useAiSessionStore.getState().appendUserMessage("tab-1", "hi");
    useAiSessionStore.getState().beginThinking("tab-1");

    renderHook(() => useAiChat("tab-1"));
    await waitForListenerRegistered("ai:error");

    act(() => {
      listeners.get("ai:error")!({
        payload: {
          sessionId: "tab-1",
          messageId: "m1",
          error: {
            code: "AI_UNAVAILABLE",
            message: "runtime crashed",
            retryable: true,
          },
        },
      });
    });

    const s = useAiSessionStore.getState().getSession("tab-1")!;
    expect(s.streamState).toBe("error");
    expect(s.error).toBe("runtime crashed");
  });

  it("falls back to a default error message when payload error is malformed", async () => {
    useAiSessionStore.getState().appendUserMessage("tab-1", "hi");
    useAiSessionStore.getState().beginThinking("tab-1");

    renderHook(() => useAiChat("tab-1"));
    await waitForListenerRegistered("ai:error");

    act(() => {
      listeners.get("ai:error")!({
        payload: { sessionId: "tab-1", messageId: "m1", error: null },
      });
    });

    expect(useAiSessionStore.getState().getSession("tab-1")?.error).toBe("AI runtime error");
  });

  it("unsubscribes all four listeners on unmount", async () => {
    const { unmount } = renderHook(() => useAiChat("tab-1"));
    await waitForListenerRegistered("ai:token");
    await waitForListenerRegistered("ai:done");
    await waitForListenerRegistered("ai:error");
    await waitForListenerRegistered("ai:probe_queued");
    unmount();
    expect(unsubscribed.has("ai:token")).toBe(true);
    expect(unsubscribed.has("ai:done")).toBe(true);
    expect(unsubscribed.has("ai:error")).toBe(true);
    expect(unsubscribed.has("ai:probe_queued")).toBe(true);
  });

  it("sets probeQueuePosition on ai:probe_queued matching sessionId", async () => {
    renderHook(() => useAiChat("tab-1"));
    await waitForListenerRegistered("ai:probe_queued");

    act(() => {
      listeners.get("ai:probe_queued")!({
        payload: { sessionId: "tab-1", position: 2 },
      });
    });

    expect(useAiSessionStore.getState().getSession("tab-1")?.probeQueuePosition).toBe(2);
  });

  it("clears probeQueuePosition when ai:probe_queued position=0", async () => {
    renderHook(() => useAiChat("tab-1"));
    await waitForListenerRegistered("ai:probe_queued");

    act(() => {
      listeners.get("ai:probe_queued")!({ payload: { sessionId: "tab-1", position: 3 } });
    });
    act(() => {
      listeners.get("ai:probe_queued")!({ payload: { sessionId: "tab-1", position: 0 } });
    });

    expect(useAiSessionStore.getState().getSession("tab-1")?.probeQueuePosition).toBeNull();
  });

  it("ignores ai:probe_queued for a different sessionId", async () => {
    renderHook(() => useAiChat("tab-1"));
    await waitForListenerRegistered("ai:probe_queued");

    act(() => {
      listeners.get("ai:probe_queued")!({
        payload: { sessionId: "tab-OTHER", position: 1 },
      });
    });

    expect(useAiSessionStore.getState().getSession("tab-1")).toBeUndefined();
  });

  it("send() invokes ai_chat_send with current sessionId", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ messageId: "m-from-stub" });
    const { result } = renderHook(() => useAiChat("tab-send"));
    await waitForListenerRegistered("ai:token");

    await act(async () => {
      await result.current.send("ping");
    });

    expect(invoke).toHaveBeenCalledWith("ai_chat_send", {
      input: { sessionId: "tab-send", text: "ping", history: [] },
    });
  });

  it("changing sessionId prop updates ref without remounting listeners", async () => {
    const { result, rerender } = renderHook(({ id }) => useAiChat(id), {
      initialProps: { id: "tab-A" },
    });
    await waitForListenerRegistered("ai:token");

    rerender({ id: "tab-B" });

    // listener 不应被 unsubscribe 后又新订（依赖 ref 切换）
    expect(unsubscribed.size).toBe(0);

    vi.mocked(invoke).mockResolvedValueOnce({ messageId: "m" });
    await act(async () => {
      await result.current.send("after switch");
    });
    expect(invoke).toHaveBeenCalledWith("ai_chat_send", {
      input: { sessionId: "tab-B", text: "after switch", history: [] },
    });
  });

  it("cancel() invokes ai_chat_cancel with the given messageId", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ canceled: true });
    const { result } = renderHook(() => useAiChat("tab-cancel"));
    await waitForListenerRegistered("ai:token");

    await act(async () => {
      await result.current.cancel("msg-99");
    });

    expect(invoke).toHaveBeenCalledWith("ai_chat_cancel", {
      input: { messageId: "msg-99" },
    });
  });
});
