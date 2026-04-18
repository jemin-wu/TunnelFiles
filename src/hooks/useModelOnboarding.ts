/**
 * Model onboarding state machine + event listeners (SPEC §5 T1.5).
 *
 * Flow:
 *   idle → licensePrompt → accepting → starting → fetching → verifying
 *   → (completed | canceled | error)
 *
 * - The dialog is shown whenever state is not `idle`. Terminal states
 *   (completed / canceled / error) stay on-screen until the user dismisses.
 * - `ai:download_progress` and `ai:download_done` are subscribed with the
 *   cancelled-flag pattern so StrictMode double-mount is safe.
 * - The reducer is exported pure for unit testing; the hook wraps it with
 *   `useReducer` + event plumbing + IPC calls.
 */

import { useCallback, useEffect, useReducer } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { aiLicenseAccept, aiModelDownload, aiModelDownloadCancel } from "@/lib/ai";
import type { AiDownloadDonePayload } from "@/types/bindings/AiDownloadDonePayload";
import type { AiDownloadProgressPayload } from "@/types/bindings/AiDownloadProgressPayload";

export const AI_EVENT_DOWNLOAD_PROGRESS = "ai:download_progress";
export const AI_EVENT_DOWNLOAD_DONE = "ai:download_done";

// ---- State shape ----------------------------------------------------------

export type OnboardingState =
  | { kind: "idle" }
  | { kind: "licensePrompt" }
  | { kind: "accepting" }
  | { kind: "starting" }
  | { kind: "fetching"; percent: number; downloaded: number; total: number }
  | { kind: "verifying" }
  | { kind: "completed" }
  | { kind: "canceled" }
  | { kind: "error"; message: string; detail?: string; retryable: boolean };

const INITIAL_STATE: OnboardingState = { kind: "idle" };

/** Terminal states (dialog shows a "close" affordance). */
export function isTerminal(state: OnboardingState): boolean {
  return state.kind === "completed" || state.kind === "canceled" || state.kind === "error";
}

/** States during which progress events should mutate state. */
function isActive(state: OnboardingState): boolean {
  return state.kind === "starting" || state.kind === "fetching" || state.kind === "verifying";
}

// ---- Actions --------------------------------------------------------------

export type OnboardingAction =
  | { type: "open" }
  | { type: "accept-start" }
  | { type: "accept-done" }
  | { type: "download-starting" }
  | { type: "progress"; payload: AiDownloadProgressPayload }
  | { type: "done"; payload: AiDownloadDonePayload }
  | {
      type: "fail";
      error: { message: string; detail?: string; retryable: boolean };
    }
  | { type: "dismiss" };

// ---- Pure reducer ---------------------------------------------------------

export function onboardingReducer(
  state: OnboardingState,
  action: OnboardingAction
): OnboardingState {
  switch (action.type) {
    case "open":
      // 允许从 idle 或终态重开（用户完成/失败后再次进入）
      if (state.kind === "idle" || isTerminal(state)) {
        return { kind: "licensePrompt" };
      }
      return state;

    case "accept-start":
      if (state.kind === "licensePrompt") {
        return { kind: "accepting" };
      }
      return state;

    case "accept-done":
      // accept IPC 成功 → 立刻 starting（等 download IPC 返回前的短暂态）
      if (state.kind === "accepting") {
        return { kind: "starting" };
      }
      return state;

    case "download-starting":
      // 直接 starting（license 已接受场景，跳过 accept 步）
      if (state.kind === "licensePrompt" || state.kind === "accepting" || isTerminal(state)) {
        return { kind: "starting" };
      }
      return state;

    case "progress": {
      if (!isActive(state)) return state;
      const p = action.payload;
      if (p.phase === "fetching") {
        return {
          kind: "fetching",
          percent: p.percent,
          downloaded: Number(p.downloaded),
          total: Number(p.total),
        };
      }
      if (p.phase === "verifying") {
        return { kind: "verifying" };
      }
      // "loading" 目前由独立流程（health check 轮询）接管，本 Dialog 不跟踪
      return state;
    }

    case "done": {
      if (action.payload.canceled) {
        return { kind: "canceled" };
      }
      if (action.payload.error) {
        const e = action.payload.error;
        // 空字符串也视为"无消息"走默认文案 —— 防 UI 出现空行
        const message =
          typeof e.message === "string" && e.message.length > 0 ? e.message : "下载失败";
        return {
          kind: "error",
          message,
          detail: e.detail ?? undefined,
          retryable: e.retryable ?? false,
        };
      }
      return { kind: "completed" };
    }

    case "fail":
      // IPC 层面的同步失败（如 license gate 未过 / 并发锁），不走 done 事件
      return {
        kind: "error",
        message: action.error.message,
        detail: action.error.detail,
        retryable: action.error.retryable,
      };

    case "dismiss":
      if (isTerminal(state)) {
        return { kind: "idle" };
      }
      return state;
  }
}

// ---- Hook -----------------------------------------------------------------

export interface UseModelOnboardingReturn {
  state: OnboardingState;
  /** 打开 Dialog 到 licensePrompt 态（或从终态重开）。 */
  openDialog: () => void;
  /** 用户已勾选 checkbox + 点击 Accept & Download：调 license accept → model download。 */
  acceptAndDownload: () => Promise<void>;
  /** license 已接受的跳过分支：直接启动下载（用于"重试失败/取消"场景）。 */
  startDownload: () => Promise<void>;
  /** 取消进行中的下载（调 `ai_model_download_cancel`，事件侧负责 state 转 canceled）。 */
  cancel: () => Promise<void>;
  /** 从终态关闭 Dialog 回 idle。 */
  dismiss: () => void;
}

/** 从 IPC 抛出的 AppError-like 对象里提取字段，容忍字段缺失。 */
function extractError(err: unknown): {
  message: string;
  detail?: string;
  retryable: boolean;
} {
  if (typeof err === "object" && err !== null) {
    const e = err as { message?: unknown; detail?: unknown; retryable?: unknown };
    return {
      message: typeof e.message === "string" ? e.message : "下载失败",
      detail: typeof e.detail === "string" ? e.detail : undefined,
      retryable: e.retryable === true,
    };
  }
  return { message: "下载失败", retryable: false };
}

export function useModelOnboarding(): UseModelOnboardingReturn {
  const [state, dispatch] = useReducer(onboardingReducer, INITIAL_STATE);

  // Tauri event listeners（StrictMode-safe cancelled-flag）
  useEffect(() => {
    let cancelled = false;
    const unsubs: UnlistenFn[] = [];

    const setup = async () => {
      const u1 = await listen<AiDownloadProgressPayload>(AI_EVENT_DOWNLOAD_PROGRESS, (e) => {
        if (cancelled) return;
        dispatch({ type: "progress", payload: e.payload });
      });
      const u2 = await listen<AiDownloadDonePayload>(AI_EVENT_DOWNLOAD_DONE, (e) => {
        if (cancelled) return;
        dispatch({ type: "done", payload: e.payload });
      });
      if (cancelled) {
        u1();
        u2();
      } else {
        unsubs.push(u1, u2);
      }
    };
    void setup();

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
  }, []);

  const openDialog = useCallback(() => dispatch({ type: "open" }), []);
  const dismiss = useCallback(() => dispatch({ type: "dismiss" }), []);

  const acceptAndDownload = useCallback(async () => {
    dispatch({ type: "accept-start" });
    try {
      await aiLicenseAccept();
    } catch (err) {
      dispatch({ type: "fail", error: extractError(err) });
      return;
    }
    dispatch({ type: "accept-done" });
    try {
      await aiModelDownload();
    } catch (err) {
      dispatch({ type: "fail", error: extractError(err) });
    }
  }, []);

  const startDownload = useCallback(async () => {
    dispatch({ type: "download-starting" });
    try {
      await aiModelDownload();
    } catch (err) {
      dispatch({ type: "fail", error: extractError(err) });
    }
  }, []);

  const cancel = useCallback(async () => {
    // 事件总线推进到 canceled；我们不乐观 dispatch，避免事件漏发时状态错乱
    try {
      await aiModelDownloadCancel();
    } catch (err) {
      dispatch({ type: "fail", error: extractError(err) });
    }
  }, []);

  return { state, openDialog, acceptAndDownload, startDownload, cancel, dismiss };
}
