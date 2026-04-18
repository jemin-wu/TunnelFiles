import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { useAiSessionStore } from "@/stores/useAiSessionStore";

beforeEach(() => {
  // 重置全局 store 防 case 间状态泄漏
  useAiSessionStore.setState({ sessions: new Map() });
  Element.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
});

describe("ChatPanel", () => {
  it("renders empty placeholder when session has no history", () => {
    render(<ChatPanel sessionId="tab-1" />);
    expect(screen.getByText(/Ask the local assistant/i)).toBeInTheDocument();
  });

  it("default send invokes ai_chat_send IPC and stays in thinking until events arrive", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockResolvedValue({ messageId: "m-stub" });
    render(<ChatPanel sessionId="tab-default" />);
    await user.type(screen.getByLabelText("Chat input"), "hello");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("ai_chat_send", {
        input: { sessionId: "tab-default", text: "hello" },
      });
    });
    const session = useAiSessionStore.getState().getSession("tab-default");
    expect(session?.messages.some((m) => m.role === "user" && m.content === "hello")).toBe(true);
    // 没有 ai:done 事件 → 仍在 thinking（不应自动 complete）
    expect(session?.streamState).toBe("thinking");
  });

  it("default send fails stream when ai_chat_send IPC rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockRejectedValue({
      code: "INVALID_ARGUMENT",
      message: "stub rejection",
    });
    render(<ChatPanel sessionId="tab-fail-default" />);
    await user.type(screen.getByLabelText("Chat input"), "hi");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() =>
      expect(useAiSessionStore.getState().getSession("tab-fail-default")?.streamState).toBe("error")
    );
  });

  it("calls onSend with sessionId and text", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ChatPanel sessionId="tab-2" onSend={onSend} />);
    await user.type(screen.getByLabelText("Chat input"), "ping");
    await user.click(screen.getByLabelText("Send message"));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("tab-2", "ping"));
  });

  it("stays in thinking state while onSend is pending (no auto-complete)", async () => {
    const user = userEvent.setup();
    let resolveSend: () => void = () => {};
    const onSend = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveSend = res;
        })
    );
    render(<ChatPanel sessionId="tab-pending" onSend={onSend} />);
    await user.type(screen.getByLabelText("Chat input"), "go");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() =>
      expect(useAiSessionStore.getState().getSession("tab-pending")?.streamState).toBe("thinking")
    );

    // 解除 promise，组件不应自动 complete —— 真实 IPC 由 ai:done 事件驱动
    resolveSend();
    await waitFor(() =>
      expect(useAiSessionStore.getState().getSession("tab-pending")?.streamState).toBe("thinking")
    );
  });

  it("transitions to error state when onSend rejects", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockRejectedValue(new Error("ipc dropped"));
    render(<ChatPanel sessionId="tab-fail" onSend={onSend} />);
    await user.type(screen.getByLabelText("Chat input"), "hi");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      const s = useAiSessionStore.getState().getSession("tab-fail");
      expect(s?.streamState).toBe("error");
      expect(s?.error).toBe("ipc dropped");
    });
    // banner 渲染
    expect(screen.getByRole("alert")).toHaveTextContent("ipc dropped");
  });

  it("disables textarea + swaps Send for Stop while streaming", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => new Promise<void>(() => {})); // never resolves
    render(<ChatPanel sessionId="tab-busy" onSend={onSend} />);
    await user.type(screen.getByLabelText("Chat input"), "long");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() =>
      expect(useAiSessionStore.getState().getSession("tab-busy")?.streamState).toBe("thinking")
    );
    expect(screen.getByLabelText("Chat input")).toBeDisabled();
    // Send button replaced by Stop button (cancel UX)
    expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Stop response")).toBeInTheDocument();
  });

  it("clicking Stop calls ai_chat_cancel with the pending assistant id", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => new Promise<void>(() => {})); // never resolves
    vi.mocked(invoke).mockResolvedValue({ canceled: true });
    render(<ChatPanel sessionId="tab-stop" onSend={onSend} />);
    await user.type(screen.getByLabelText("Chat input"), "stop me");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() =>
      expect(useAiSessionStore.getState().getSession("tab-stop")?.streamState).toBe("thinking")
    );
    const pendingId = useAiSessionStore.getState().getSession("tab-stop")?.pendingAssistantId;
    expect(pendingId).toBeTruthy();

    await user.click(screen.getByLabelText("Stop response"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("ai_chat_cancel", {
        input: { messageId: pendingId },
      })
    );
  });

  it("isolates state across sessionIds (multi-tab)", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ChatPanel sessionId="tab-A" onSend={onSend} />);
    await user.type(screen.getByLabelText("Chat input"), "from A");
    await user.click(screen.getByLabelText("Send message"));

    rerender(<ChatPanel sessionId="tab-B" onSend={onSend} />);
    // tab-B 应该是空的 — 不应看到 tab-A 的消息
    expect(screen.queryByText("from A")).not.toBeInTheDocument();
    expect(screen.getByText(/Ask the local assistant/i)).toBeInTheDocument();
  });

  it("exposes data attributes for E2E selectors", () => {
    render(<ChatPanel sessionId="tab-attrs" />);
    const panel = document.querySelector("[data-slot='chat-panel']");
    expect(panel?.getAttribute("data-session-id")).toBe("tab-attrs");
    expect(panel?.getAttribute("data-stream-state")).toBe("idle");
  });
});
