import { describe, it, expect } from "vitest";

import { isTerminal, onboardingReducer, type OnboardingState } from "@/hooks/useModelOnboarding";

const IDLE: OnboardingState = { kind: "idle" };
const LICENSE_PROMPT: OnboardingState = { kind: "licensePrompt" };
const ACCEPTING: OnboardingState = { kind: "accepting" };
const STARTING: OnboardingState = { kind: "starting" };
const VERIFYING: OnboardingState = { kind: "verifying" };
const COMPLETED: OnboardingState = { kind: "completed" };
const CANCELED: OnboardingState = { kind: "canceled" };
const ERROR: OnboardingState = {
  kind: "error",
  message: "boom",
  retryable: true,
};

describe("isTerminal", () => {
  it("marks completed / canceled / error as terminal", () => {
    expect(isTerminal(COMPLETED)).toBe(true);
    expect(isTerminal(CANCELED)).toBe(true);
    expect(isTerminal(ERROR)).toBe(true);
  });

  it("marks active states as non-terminal", () => {
    expect(isTerminal(IDLE)).toBe(false);
    expect(isTerminal(LICENSE_PROMPT)).toBe(false);
    expect(isTerminal(STARTING)).toBe(false);
    expect(isTerminal(VERIFYING)).toBe(false);
  });
});

describe("onboardingReducer", () => {
  describe("open", () => {
    it("transitions idle → licensePrompt", () => {
      expect(onboardingReducer(IDLE, { type: "open" })).toEqual(LICENSE_PROMPT);
    });

    it("allows reopen from terminal completed", () => {
      expect(onboardingReducer(COMPLETED, { type: "open" })).toEqual(LICENSE_PROMPT);
    });

    it("allows reopen from terminal error (retry path)", () => {
      expect(onboardingReducer(ERROR, { type: "open" })).toEqual(LICENSE_PROMPT);
    });

    it("is noop mid-download (fetching)", () => {
      const fetching: OnboardingState = {
        kind: "fetching",
        percent: 30,
        downloaded: 100,
        total: 1000,
      };
      expect(onboardingReducer(fetching, { type: "open" })).toEqual(fetching);
    });
  });

  describe("accept-start → accept-done → download-starting", () => {
    it("licensePrompt → accepting", () => {
      expect(onboardingReducer(LICENSE_PROMPT, { type: "accept-start" })).toEqual(ACCEPTING);
    });

    it("accepting → starting via accept-done", () => {
      expect(onboardingReducer(ACCEPTING, { type: "accept-done" })).toEqual(STARTING);
    });

    it("download-starting from terminal error → starting (retry)", () => {
      expect(onboardingReducer(ERROR, { type: "download-starting" })).toEqual(STARTING);
    });

    it("download-starting from terminal canceled → starting (resume)", () => {
      expect(onboardingReducer(CANCELED, { type: "download-starting" })).toEqual(STARTING);
    });

    it("accept-start is noop outside licensePrompt", () => {
      expect(onboardingReducer(IDLE, { type: "accept-start" })).toEqual(IDLE);
    });
  });

  describe("progress", () => {
    it("fetching phase sets percent + bytes", () => {
      const next = onboardingReducer(STARTING, {
        type: "progress",
        payload: { phase: "fetching", percent: 42, downloaded: 420, total: 1000 },
      });
      expect(next).toEqual({
        kind: "fetching",
        percent: 42,
        downloaded: 420,
        total: 1000,
      });
    });

    it("verifying phase sets kind to verifying", () => {
      const fetching: OnboardingState = {
        kind: "fetching",
        percent: 100,
        downloaded: 1000,
        total: 1000,
      };
      const next = onboardingReducer(fetching, {
        type: "progress",
        payload: { phase: "verifying", percent: 0, downloaded: 0, total: 1000 },
      });
      expect(next).toEqual(VERIFYING);
    });

    it("loading phase is ignored (tracked separately by health check)", () => {
      expect(
        onboardingReducer(VERIFYING, {
          type: "progress",
          payload: { phase: "loading", percent: 0, downloaded: 0, total: 0 },
        })
      ).toEqual(VERIFYING);
    });

    it("ignores progress events when state is idle or terminal", () => {
      const prog = {
        type: "progress",
        payload: { phase: "fetching", percent: 50, downloaded: 500, total: 1000 },
      } as const;
      expect(onboardingReducer(IDLE, prog)).toEqual(IDLE);
      expect(onboardingReducer(COMPLETED, prog)).toEqual(COMPLETED);
      expect(onboardingReducer(ERROR, prog)).toEqual(ERROR);
    });

    it("coerces bigint-like downloaded/total values via Number()", () => {
      // ts-rs 从 Rust u64 导出为 number；即便前端误把 string 传入也不能让 UI 炸
      const next = onboardingReducer(STARTING, {
        type: "progress",
        payload: {
          phase: "fetching",
          percent: 10,
          downloaded: "100" as unknown as number,
          total: "1000" as unknown as number,
        },
      });
      expect(next).toEqual({
        kind: "fetching",
        percent: 10,
        downloaded: 100,
        total: 1000,
      });
    });
  });

  describe("done", () => {
    it("canceled=true → canceled state", () => {
      expect(
        onboardingReducer(VERIFYING, {
          type: "done",
          payload: { canceled: true, error: null },
        })
      ).toEqual(CANCELED);
    });

    it("error present → error state with fields", () => {
      const next = onboardingReducer(STARTING, {
        type: "done",
        payload: {
          canceled: false,
          error: {
            code: "AI_UNAVAILABLE",
            message: "sha256 mismatch",
            detail: "expected a, got b",
            retryable: true,
          },
        },
      });
      expect(next).toEqual({
        kind: "error",
        message: "sha256 mismatch",
        detail: "expected a, got b",
        retryable: true,
      });
    });

    it("both false → completed", () => {
      expect(
        onboardingReducer(VERIFYING, {
          type: "done",
          payload: { canceled: false, error: null },
        })
      ).toEqual(COMPLETED);
    });

    it("defaults message when backend error lacks one", () => {
      const next = onboardingReducer(STARTING, {
        type: "done",
        payload: {
          canceled: false,
          error: {
            code: "AI_UNAVAILABLE",
            message: "",
            detail: null,
            retryable: false,
          },
        },
      });
      if (next.kind !== "error") throw new Error("expected error state");
      expect(next.message.length).toBeGreaterThan(0);
      expect(next.retryable).toBe(false);
    });
  });

  describe("fail (synchronous IPC rejection)", () => {
    it("pushes into error state regardless of prior state", () => {
      const next = onboardingReducer(ACCEPTING, {
        type: "fail",
        error: { message: "db locked", retryable: true },
      });
      expect(next).toEqual({ kind: "error", message: "db locked", retryable: true });
    });

    it("carries detail when present", () => {
      const next = onboardingReducer(LICENSE_PROMPT, {
        type: "fail",
        error: {
          message: "license not accepted",
          detail: "settings.ai_license_accepted_at is null",
          retryable: false,
        },
      });
      if (next.kind !== "error") throw new Error("expected error");
      expect(next.detail).toBe("settings.ai_license_accepted_at is null");
    });
  });

  describe("dismiss", () => {
    it("terminal → idle", () => {
      expect(onboardingReducer(COMPLETED, { type: "dismiss" })).toEqual(IDLE);
      expect(onboardingReducer(CANCELED, { type: "dismiss" })).toEqual(IDLE);
      expect(onboardingReducer(ERROR, { type: "dismiss" })).toEqual(IDLE);
    });

    it("refuses dismiss mid-flight (protect user from accidental close)", () => {
      expect(onboardingReducer(ACCEPTING, { type: "dismiss" })).toEqual(ACCEPTING);
      expect(onboardingReducer(STARTING, { type: "dismiss" })).toEqual(STARTING);
      expect(onboardingReducer(VERIFYING, { type: "dismiss" })).toEqual(VERIFYING);
      const fetching: OnboardingState = {
        kind: "fetching",
        percent: 20,
        downloaded: 0,
        total: 0,
      };
      expect(onboardingReducer(fetching, { type: "dismiss" })).toEqual(fetching);
    });
  });
});
