import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiHealthBadge } from "@/components/ai/AiHealthBadge";

describe("AiHealthBadge", () => {
  it("renders nothing when status is 'disabled'", () => {
    const { container } = render(<AiHealthBadge status="disabled" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders model-missing state with download hint", () => {
    render(<AiHealthBadge status="model-missing" />);
    const badge = screen.getByLabelText(/AI 状态/);
    expect(badge).toHaveAttribute("data-status", "model-missing");
    expect(badge).toHaveTextContent("未下载");
  });

  it("renders loading state with spinner", () => {
    render(<AiHealthBadge status="loading" />);
    const badge = screen.getByLabelText(/AI 状态/);
    expect(badge).toHaveAttribute("data-status", "loading");
    expect(badge).toHaveTextContent("载入中");
    // spinner class present (SVGElement.className is SVGAnimatedString, use getAttribute)
    const icon = badge.querySelector("svg");
    expect(icon?.getAttribute("class")).toMatch(/animate-spin/);
  });

  it("renders ready state", () => {
    render(<AiHealthBadge status="ready" />);
    const badge = screen.getByLabelText(/AI 状态/);
    expect(badge).toHaveAttribute("data-status", "ready");
    expect(badge).toHaveTextContent("就绪");
  });

  it("renders error state", () => {
    render(<AiHealthBadge status="error" />);
    const badge = screen.getByLabelText(/AI 状态/);
    expect(badge).toHaveAttribute("data-status", "error");
    expect(badge).toHaveTextContent("异常");
  });

  it("exposes a tooltip title explaining each state", () => {
    const states: Array<"model-missing" | "loading" | "ready" | "error"> = [
      "model-missing",
      "loading",
      "ready",
      "error",
    ];
    for (const status of states) {
      const { unmount } = render(<AiHealthBadge status={status} />);
      const badge = screen.getByLabelText(/AI 状态/);
      expect(badge.getAttribute("title")).toBeTruthy();
      unmount();
    }
  });

  it("applies additional className without replacing base classes", () => {
    render(<AiHealthBadge status="ready" className="ml-2" />);
    const badge = screen.getByLabelText(/AI 状态/);
    expect(badge.className).toMatch(/ml-2/);
  });
});
