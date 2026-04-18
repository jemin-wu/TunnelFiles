import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("preserves multiline content (whitespace-pre-wrap)", () => {
    render(
      <MessageList
        messages={[
          msg({
            role: "assistant",
            content: "line1\nline2\n  indented",
          }),
        ]}
      />
    );
    const item = document.querySelector("[data-slot='message']");
    // textContent collapses whitespace differently per browser; check class is on inner span
    const span = item?.querySelector("span");
    expect(span?.getAttribute("class")).toMatch(/whitespace-pre-wrap/);
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

  it("calls scrollIntoView when a new message is appended", () => {
    const scrollSpy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const initial = [msg({ role: "user", content: "hi" })];
    const { rerender } = render(<MessageList messages={initial} />);
    scrollSpy.mockClear();
    rerender(
      <MessageList messages={[...initial, msg({ role: "assistant", content: "Hello!" })]} />
    );
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("calls scrollIntoView when assistant content grows (streaming append)", () => {
    const scrollSpy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const userMsg = msg({ role: "user", content: "go" });
    const assistantId = "assistant-1";
    const { rerender } = render(
      <MessageList
        isStreaming
        messages={[userMsg, msg({ id: assistantId, role: "assistant", content: "Hel" })]}
      />
    );
    scrollSpy.mockClear();
    rerender(
      <MessageList
        isStreaming
        messages={[userMsg, msg({ id: assistantId, role: "assistant", content: "Hello world" })]}
      />
    );
    expect(scrollSpy).toHaveBeenCalled();
  });
});
