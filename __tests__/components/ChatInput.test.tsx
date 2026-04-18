import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "@/components/ai/ChatInput";

describe("ChatInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders textarea + submit button", () => {
    render(<ChatInput onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Chat input")).toBeInTheDocument();
    expect(screen.getByLabelText("Send message")).toBeInTheDocument();
  });

  it("calls onSubmit with trimmed text on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Chat input");
    await user.click(input);
    await user.keyboard("  list ports  ");
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("list ports");
  });

  it("does not submit on Shift+Enter (newline preserved)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Chat input") as HTMLTextAreaElement;
    await user.click(input);
    await user.keyboard("line1");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.keyboard("line2");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe("line1\nline2");
  });

  it("ignores empty input on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Chat input");
    await user.click(input);
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ignores whitespace-only input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Chat input");
    await user.click(input);
    await user.keyboard("   {Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the textarea after successful submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Chat input") as HTMLTextAreaElement;
    await user.click(input);
    await user.keyboard("hello{Enter}");
    expect(input.value).toBe("");
  });

  it("submits via clicking the send button", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Chat input"), "ping");
    await user.click(screen.getByLabelText("Send message"));
    expect(onSubmit).toHaveBeenCalledWith("ping");
  });

  it("disables both controls when disabled prop set", () => {
    render(<ChatInput onSubmit={vi.fn()} disabled />);
    expect(screen.getByLabelText("Chat input")).toBeDisabled();
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("does not call onSubmit when disabled, even if Enter is pressed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} disabled />);
    const input = screen.getByLabelText("Chat input");
    await user.click(input);
    // disabled textarea may still receive keys in jsdom; verify handler ignores
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("send button stays disabled while textarea is empty/whitespace", async () => {
    const user = userEvent.setup();
    render(<ChatInput onSubmit={vi.fn()} />);
    const button = screen.getByLabelText("Send message");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Chat input"), "  ");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Chat input"), "x");
    expect(button).not.toBeDisabled();
  });

  it("uses custom placeholder when provided", () => {
    render(<ChatInput onSubmit={vi.fn()} placeholder="Custom prompt" />);
    expect(screen.getByPlaceholderText("Custom prompt")).toBeInTheDocument();
  });

  describe("Stop button (cancel UX)", () => {
    it("renders Stop button instead of Send when disabled + onStop provided", () => {
      render(<ChatInput onSubmit={vi.fn()} disabled onStop={vi.fn()} />);
      expect(screen.getByLabelText("Stop response")).toBeInTheDocument();
      expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();
    });

    it("Stop button stays enabled even with empty textarea", () => {
      render(<ChatInput onSubmit={vi.fn()} disabled onStop={vi.fn()} />);
      expect(screen.getByLabelText("Stop response")).not.toBeDisabled();
    });

    it("clicking Stop fires onStop callback", async () => {
      const user = userEvent.setup();
      const onStop = vi.fn();
      render(<ChatInput onSubmit={vi.fn()} disabled onStop={onStop} />);
      await user.click(screen.getByLabelText("Stop response"));
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("falls back to disabled Send button when disabled but no onStop given", () => {
      render(<ChatInput onSubmit={vi.fn()} disabled />);
      expect(screen.queryByLabelText("Stop response")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Send message")).toBeDisabled();
    });

    it("shows Send (not Stop) when not disabled even if onStop is provided", () => {
      render(<ChatInput onSubmit={vi.fn()} onStop={vi.fn()} />);
      expect(screen.getByLabelText("Send message")).toBeInTheDocument();
      expect(screen.queryByLabelText("Stop response")).not.toBeInTheDocument();
    });
  });
});
