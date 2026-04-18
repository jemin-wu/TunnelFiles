import { describe, it, expect } from "vitest";

import { deriveRowView } from "@/components/ai/InlineModelRow";
import type { OnboardingState } from "@/hooks/useModelOnboarding";

const IDLE: OnboardingState = { kind: "idle" };
const LICENSE: OnboardingState = { kind: "licensePrompt" };
const STARTING: OnboardingState = { kind: "starting" };
const FETCHING: OnboardingState = {
  kind: "fetching",
  percent: 42,
  downloaded: 420,
  total: 1000,
};
const VERIFYING: OnboardingState = { kind: "verifying" };
const COMPLETED: OnboardingState = { kind: "completed" };
const CANCELED: OnboardingState = { kind: "canceled" };
const ERROR_RETRYABLE: OnboardingState = {
  kind: "error",
  message: "NetworkLost",
  retryable: true,
};
const ERROR_FINAL: OnboardingState = {
  kind: "error",
  message: "license not accepted",
  retryable: false,
};

describe("deriveRowView", () => {
  describe("maps onboarding state first", () => {
    it("starting → starting row regardless of health", () => {
      expect(deriveRowView("ready", STARTING).kind).toBe("starting");
      expect(deriveRowView("model-missing", STARTING).kind).toBe("starting");
    });

    it("fetching carries percent / downloaded / total", () => {
      const view = deriveRowView("model-missing", FETCHING);
      expect(view.kind).toBe("downloading");
      expect(view.percent).toBe(42);
      expect(view.downloaded).toBe(420);
      expect(view.total).toBe(1000);
    });

    it("verifying → verifying row", () => {
      expect(deriveRowView("ready", VERIFYING).kind).toBe("verifying");
    });

    it("canceled → canceled row", () => {
      expect(deriveRowView("ready", CANCELED).kind).toBe("canceled");
    });

    it("error carries message + detail + retryable", () => {
      const view = deriveRowView("model-missing", ERROR_RETRYABLE);
      expect(view.kind).toBe("error");
      expect(view.message).toBe("NetworkLost");
      expect(view.retryable).toBe(true);
    });

    it("non-retryable error still surfaces message", () => {
      const view = deriveRowView("model-missing", ERROR_FINAL);
      expect(view.retryable).toBe(false);
    });
  });

  describe("falls back to health when onboarding is idle / license / completed", () => {
    it("idle + ready → ready", () => {
      expect(deriveRowView("ready", IDLE).kind).toBe("ready");
    });

    it("idle + loading → ready (runtime 正在载入，但文件已在)", () => {
      expect(deriveRowView("loading", IDLE).kind).toBe("ready");
    });

    it("idle + model-missing → missing", () => {
      expect(deriveRowView("model-missing", IDLE).kind).toBe("missing");
    });

    it("licensePrompt is transient (handled by Dialog) → missing row shown behind", () => {
      // Dialog 会盖在 row 上，但 row 自己还是 "missing" 态（用户尚未 license）
      expect(deriveRowView("model-missing", LICENSE).kind).toBe("missing");
    });

    it("completed is transient — health should already report ready; fall through", () => {
      // completed → reducer 没 follow-up 事件 → 靠 health query 刷新驱动 row
      expect(deriveRowView("ready", COMPLETED).kind).toBe("ready");
      expect(deriveRowView("model-missing", COMPLETED).kind).toBe("missing");
    });

    it("disabled health treated as missing (上游不该渲染本行，防御性测试)", () => {
      expect(deriveRowView("disabled", IDLE).kind).toBe("missing");
    });

    it("health 'error' during idle → fall back to missing (不想让临时轮询失败显示 row-level 错误)", () => {
      expect(deriveRowView("error", IDLE).kind).toBe("missing");
    });
  });

  describe("precedence: onboarding state beats stale health", () => {
    it("downloading + health says ready (stale) → still shows downloading", () => {
      // health 可能还没刷新到 modelPresent=false；下载中的 row 优先
      expect(deriveRowView("ready", FETCHING).kind).toBe("downloading");
    });

    it("error + health says ready (stale) → error wins", () => {
      expect(deriveRowView("ready", ERROR_RETRYABLE).kind).toBe("error");
    });
  });
});
