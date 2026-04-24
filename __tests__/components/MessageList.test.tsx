import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MessageList } from "@/components/ai/MessageList";
import type { ChatMessage } from "@/stores/useAiSessionStore";

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "role" | "content">): ChatMessage {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    createdAt: partial.createdAt ?? Date.now(),
    ...partial,
  };
}

describe("MessageList", () => {
  beforeEach(() => {
    // jsdom doesn't implement scrollIntoView; stub it so useEffect doesn't throw
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empty placeholder when no messages", () => {
    render(<MessageList messages={[]} />);
    const empty = screen.getByText(/Ask the local assistant/i);
    expect(empty).toBeInTheDocument();
  });

  it("renders user and assistant messages with role attribute", () => {
    render(
      <MessageList
        messages={[
          msg({ role: "user", content: "list ports" }),
          msg({ role: "assistant", content: "ss -tlnp" }),
        ]}
      />
    );
    const items = document.querySelectorAll("[data-slot='message']");
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute("data-role")).toBe("user");
    expect(items[1].getAttribute("data-role")).toBe("assistant");
    expect(items[0]).toHaveTextContent("list ports");
    expect(items[1]).toHaveTextContent("ss -tlnp");
  });

  it("preserves multiline content (whitespace-pre-wrap) on user messages", () => {
    render(
      <MessageList
        messages={[
          msg({
            role: "user",
            content: "line1\nline2\n  indented",
          }),
        ]}
      />
    );
    const item = document.querySelector("[data-slot='message'][data-role='user']");
    // 新架构：user 消息内容挂在 MessageContent（div），保留 whitespace-pre-wrap
    const bubble = item?.querySelector("[class*='whitespace-pre-wrap']");
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toContain("line1\nline2\n  indented");
    expect(bubble).toHaveClass("selectable");
  });

  it("shows streaming caret only on the last assistant message during streaming", () => {
    render(
      <MessageList
        isStreaming
        messages={[msg({ role: "user", content: "go" }), msg({ role: "assistant", content: "He" })]}
      />
    );
    const carets = document.querySelectorAll("[data-slot='streaming-caret']");
    expect(carets).toHaveLength(1);
  });

  it("does not show caret when isStreaming is false", () => {
    render(<MessageList messages={[msg({ role: "assistant", content: "done" })]} />);
    const carets = document.querySelectorAll("[data-slot='streaming-caret']");
    expect(carets).toHaveLength(0);
  });

  it("does not show caret on a user message even when streaming", () => {
    // 流式开始但 assistant 还没占位（pendingAssistantId 失效场景）—— 不应给 user 加 caret
    render(<MessageList isStreaming messages={[msg({ role: "user", content: "hi" })]} />);
    const carets = document.querySelectorAll("[data-slot='streaming-caret']");
    expect(carets).toHaveLength(0);
  });

  // 注：MessageList 不再手写 scrollIntoView —— 自动滚动由父级 ChatContainerRoot
  // (use-stick-to-bottom) 接管，保留 scroll-up 暂停语义。这部分回归测试移至
  // ChatPanel 集成测试覆盖。

  describe("assistant code blocks + insert button", () => {
    it("renders fenced bash block as a distinct code element", () => {
      render(
        <MessageList
          messages={[
            msg({
              role: "assistant",
              content: "Try:\n```bash\nls -la\n```\nthen review.",
            }),
          ]}
        />
      );
      const code = document.querySelector("[data-slot='code-block']");
      expect(code).not.toBeNull();
      expect(code?.getAttribute("data-language")).toBe("bash");
      expect(code).toHaveTextContent("ls -la");
      expect(code).toHaveClass("selectable");
    });

    it("marks assistant text bubbles as selectable for mouse copy", () => {
      render(
        <MessageList
          messages={[
            msg({
              role: "assistant",
              content: "你可以先运行 pwd 查看当前目录。",
            }),
          ]}
        />
      );
      const bubble = document.querySelector("[data-slot='message'][data-role='assistant'] > div");
      expect(bubble).toHaveClass("selectable");
    });

    it("does not show Insert button when onInsertCommand is not provided", () => {
      render(
        <MessageList
          messages={[
            msg({
              role: "assistant",
              content: "```bash\nls\n```",
            }),
          ]}
        />
      );
      expect(screen.queryByLabelText("Insert command to terminal")).not.toBeInTheDocument();
    });

    it("always shows Copy button for assistant code blocks", () => {
      render(
        <MessageList
          messages={[
            msg({
              role: "assistant",
              content: "```bash\nls\n```",
            }),
          ]}
        />
      );
      expect(screen.getByLabelText("Copy command")).toBeInTheDocument();
    });

    it("shows Insert button for bash code block when onInsertCommand provided", () => {
      render(
        <MessageList
          onInsertCommand={vi.fn()}
          messages={[
            msg({
              role: "assistant",
              content: "```bash\nsudo systemctl restart nginx\n```",
            }),
          ]}
        />
      );
      const buttons = screen.getAllByLabelText("Insert command to terminal");
      expect(buttons.length).toBe(1);
    });

    it("adds Insert button when onInsertCommand becomes available after initial render", () => {
      const message = msg({
        role: "assistant",
        content: "```bash\nsudo systemctl restart nginx\n```",
      });
      const { rerender } = render(<MessageList messages={[message]} />);
      expect(screen.queryByLabelText("Insert command to terminal")).not.toBeInTheDocument();

      rerender(<MessageList onInsertCommand={vi.fn()} messages={[message]} />);

      expect(screen.getByLabelText("Insert command to terminal")).toBeInTheDocument();
    });

    it("does not show Insert button for non-shell languages (eg python)", () => {
      render(
        <MessageList
          onInsertCommand={vi.fn()}
          messages={[
            msg({
              role: "assistant",
              content: "```python\nprint('hi')\n```",
            }),
          ]}
        />
      );
      expect(screen.queryByLabelText("Insert command to terminal")).not.toBeInTheDocument();
    });

    it("shows Insert button for fence with no language (treated as shell)", () => {
      render(
        <MessageList
          onInsertCommand={vi.fn()}
          messages={[
            msg({
              role: "assistant",
              content: "```\nuptime\n```",
            }),
          ]}
        />
      );
      expect(screen.getByLabelText("Insert command to terminal")).toBeInTheDocument();
    });

    it("clicking Insert calls onInsertCommand with code, no trailing newline", async () => {
      const user = (await import("@testing-library/user-event")).default.setup();
      const onInsertCommand = vi.fn();
      render(
        <MessageList
          onInsertCommand={onInsertCommand}
          messages={[
            msg({
              role: "assistant",
              content: "```bash\nsudo systemctl restart nginx\n```",
            }),
          ]}
        />
      );
      await user.click(screen.getByLabelText("Insert command to terminal"));
      expect(onInsertCommand).toHaveBeenCalledTimes(1);
      expect(onInsertCommand).toHaveBeenCalledWith("sudo systemctl restart nginx");
    });

    it("clicking Copy writes code to clipboard and shows copied state", async () => {
      const user = (await import("@testing-library/user-event")).default.setup();
      const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
      render(
        <MessageList
          messages={[
            msg({
              role: "assistant",
              content: "```bash\nsudo systemctl restart nginx\n```",
            }),
          ]}
        />
      );

      await user.click(screen.getByLabelText("Copy command"));

      await waitFor(() => {
        expect(writeTextSpy).toHaveBeenCalledWith("sudo systemctl restart nginx");
      });
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });

    it("renders multiple code blocks each with their own button", () => {
      render(
        <MessageList
          onInsertCommand={vi.fn()}
          messages={[
            msg({
              role: "assistant",
              content: "first:\n```bash\nls\n```\n\nthen:\n```sh\npwd\n```",
            }),
          ]}
        />
      );
      const buttons = screen.getAllByLabelText("Insert command to terminal");
      expect(buttons.length).toBe(2);
    });

    it("user messages do not get code block parsing (single span path)", () => {
      // 用户输入即使含 ``` 也应原样展示，不拆 code block（防 user 输入触发"假"插入按钮）
      render(
        <MessageList
          onInsertCommand={vi.fn()}
          messages={[
            msg({
              role: "user",
              content: "```bash\nrm -rf /\n```",
            }),
          ]}
        />
      );
      expect(screen.queryByLabelText("Insert command to terminal")).not.toBeInTheDocument();
      expect(document.querySelector("[data-slot='code-block']")).toBeNull();
    });
  });
});
