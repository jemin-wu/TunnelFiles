import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { useAiSessionStore } from "@/stores/useAiSessionStore";
import type { AiPlan } from "@/types/bindings/AiPlan";

vi.mock("react-diff-viewer-continued", () => ({
  default: () => <div data-slot="mock-diff-viewer" />,
}));

beforeEach(() => {
  // 重置全局 store 防 case 间状态泄漏
  useAiSessionStore.setState({ sessions: new Map() });
  Element.prototype.scrollIntoView = vi.fn();
  // ScrollArea 使用 ResizeObserver；jsdom 不实现，stub 之
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  vi.clearAllMocks();
});

describe("ChatPanel", () => {
  const demoPlan: AiPlan = {
    summary: "给 nginx 加 gzip",
    steps: [
      {
        id: "step-1",
        kind: "probe",
        status: "done",
        intent: "读取 nginx.conf",
        command: "cat /etc/nginx/nginx.conf",
        path: null,
        content: null,
        targetFiles: [],
        verifyTemplate: null,
        expectedObservation: "看到现有 gzip 配置",
      },
    ],
    risks: [],
    assumptions: [],
    status: "ready",
  };

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
        input: { sessionId: "tab-default", text: "hello", history: [] },
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

  it("default insert command writes to terminal looked up by sessionId", async () => {
    const user = userEvent.setup();
    // Seed an assistant message with a code block
    useAiSessionStore.getState().appendUserMessage("tab-insert", "?");
    const assistantId = useAiSessionStore.getState().beginThinking("tab-insert");
    useAiSessionStore.getState().appendAssistantToken("tab-insert", "```bash\nuptime\n```");
    useAiSessionStore.getState().completeStream("tab-insert");
    expect(assistantId).toBeTruthy();

    // Mock IPC: terminal_get_by_session → "term-xyz", terminal_input → ok
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "terminal_get_by_session") return "term-xyz";
      if (cmd === "terminal_input") return null;
      return null;
    });

    render(<ChatPanel sessionId="tab-insert" />);

    await user.click(screen.getByLabelText("Insert command to terminal"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("terminal_get_by_session", {
        sessionId: "tab-insert",
      });
    });
    // base64("uptime") = "dXB0aW1l"
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("terminal_input", {
        input: { terminalId: "term-xyz", data: "dXB0aW1l" },
      });
    });
  });

  it("insert is a noop when no terminal is open for the session", async () => {
    const user = userEvent.setup();
    useAiSessionStore.getState().appendUserMessage("tab-noterm", "?");
    useAiSessionStore.getState().beginThinking("tab-noterm");
    useAiSessionStore.getState().appendAssistantToken("tab-noterm", "```bash\nls\n```");
    useAiSessionStore.getState().completeStream("tab-noterm");

    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "terminal_get_by_session") return null;
      throw new Error("should not reach terminal_input");
    });

    render(<ChatPanel sessionId="tab-noterm" />);
    await user.click(screen.getByLabelText("Insert command to terminal"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("terminal_get_by_session", {
        sessionId: "tab-noterm",
      })
    );
    // terminal_input must NOT be called
    const calls = vi.mocked(invoke).mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("terminal_input");
  });

  it("respects onInsertCommand prop override", async () => {
    const user = userEvent.setup();
    useAiSessionStore.getState().appendUserMessage("tab-override", "?");
    useAiSessionStore.getState().beginThinking("tab-override");
    useAiSessionStore.getState().appendAssistantToken("tab-override", "```\nfoo\n```");
    useAiSessionStore.getState().completeStream("tab-override");

    const onInsertCommand = vi.fn();
    render(<ChatPanel sessionId="tab-override" onInsertCommand={onInsertCommand} />);

    await user.click(screen.getByLabelText("Insert command to terminal"));

    expect(onInsertCommand).toHaveBeenCalledWith("foo");
    // 默认路径未走（不会调 terminal_get_by_session）
    const calls = vi.mocked(invoke).mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("terminal_get_by_session");
  });

  it("plan mode creates a plan then auto-executes the first step", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ planId: "plan-1", plan: demoPlan })
      .mockResolvedValueOnce({
        plan: { ...demoPlan, status: "running" },
        awaitingConfirm: false,
        currentStepId: "step-1",
      });

    render(<ChatPanel sessionId="tab-plan" />);
    await user.click(screen.getByText("Plan"));
    await user.type(screen.getByLabelText("Chat input"), "给 nginx 加 gzip 并验证");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("ai_plan_create", {
        input: { sessionId: "tab-plan", text: "给 nginx 加 gzip 并验证" },
      })
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("ai_plan_step_execute", {
        input: { planId: "plan-1" },
      })
    );
    expect(screen.getByText("给 nginx 加 gzip")).toBeInTheDocument();
  });

  it("submits revise observation through ai_plan_step_revise and updates the plan card", async () => {
    const user = userEvent.setup();
    const revisablePlan: AiPlan = {
      ...demoPlan,
      steps: [
        {
          ...demoPlan.steps[0],
          status: "pending",
          expectedObservation: "读取当前 gzip 配置",
        },
      ],
    };

    useAiSessionStore.getState().upsertPlan("tab-revise", "plan-1", revisablePlan, "step-1");
    vi.mocked(invoke).mockResolvedValueOnce({
      plan: {
        ...revisablePlan,
        summary: "根据 verify 失败修订的计划",
        steps: [
          {
            ...revisablePlan.steps[0],
            expectedObservation: "先修复语法，再重新 verify",
          },
        ],
      },
      awaitingConfirm: false,
      currentStepId: null,
    });

    render(<ChatPanel sessionId="tab-revise" />);

    await user.type(
      screen.getByPlaceholderText("补充新的观察结果，修订未执行的后续步骤..."),
      "nginx -t failed after edit"
    );
    await user.click(screen.getByRole("button", { name: "修订计划" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("ai_plan_step_revise", {
        input: {
          planId: "plan-1",
          newObservation: "nginx -t failed after edit",
        },
      })
    );
    expect(screen.getByText("根据 verify 失败修订的计划")).toBeInTheDocument();
    expect(screen.getByText("预期：先修复语法，再重新 verify")).toBeInTheDocument();
  });

  it("renders confirm dialog from awaitingConfirm payload and confirms write with planId", async () => {
    const user = userEvent.setup();
    useAiSessionStore.getState().upsertPlan("tab-confirm", "plan-1", demoPlan, "step-2");
    useAiSessionStore.getState().setPlanAwaitConfirm("tab-confirm", {
      sessionId: "tab-confirm",
      planId: "plan-1",
      stepId: "step-2",
      stepIndex: 1,
      kind: "write",
      argv: ["sftp-write", "/etc/nginx/nginx.conf"],
      targetFiles: ["/etc/nginx/nginx.conf"],
      diff: "--- before\n+++ after\n@@ -1 +1 @@\n-old\n+new\n",
      snapshotPath: "/tmp/snapshot",
      warnings: [],
    });
    vi.mocked(invoke).mockResolvedValueOnce({
      plan: { ...demoPlan, status: "done" },
      awaitingConfirm: false,
      currentStepId: "step-2",
    });

    render(<ChatPanel sessionId="tab-confirm" />);
    expect(screen.getByRole("heading", { name: "确认写入" })).toBeInTheDocument();
    expect(screen.getAllByText("/etc/nginx/nginx.conf").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认写入" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("ai_plan_step_confirm", {
        input: { planId: "plan-1" },
      })
    );
  });
});
