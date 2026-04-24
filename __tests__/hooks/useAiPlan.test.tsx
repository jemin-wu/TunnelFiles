import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

import { useAiPlan } from "@/hooks/useAiPlan";
import { useAiSessionStore } from "@/stores/useAiSessionStore";
import type { AiPlan } from "@/types/bindings/AiPlan";

type Handler = (event: { payload: unknown }) => void;

let listeners: Map<string, Handler>;

const plan: AiPlan = {
  summary: "给 nginx 加 gzip",
  steps: [
    {
      id: "step-1",
      kind: "probe",
      status: "pending",
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

beforeEach(() => {
  vi.clearAllMocks();
  useAiSessionStore.setState({ sessions: new Map() });
  listeners = new Map();

  vi.mocked(listen).mockImplementation(async (event, handler) => {
    listeners.set(event as string, handler as unknown as Handler);
    return () => {};
  });
});

async function waitForListenerRegistered(name: string) {
  await waitFor(() => expect(listeners.has(name)).toBe(true));
}

describe("useAiPlan", () => {
  it("registers listeners for plan events", async () => {
    renderHook(() => useAiPlan("tab-1"));
    await waitForListenerRegistered("ai:step");
    await waitForListenerRegistered("ai:await_confirm");
    await waitForListenerRegistered("ai:rollback_progress");
    await waitForListenerRegistered("ai:service_state_warning");
    await waitForListenerRegistered("ai:done");
  });

  it("updates awaitingConfirm from ai:await_confirm", async () => {
    useAiSessionStore.getState().upsertPlan("tab-1", "plan-1", plan, null);
    renderHook(() => useAiPlan("tab-1"));
    await waitForListenerRegistered("ai:await_confirm");

    act(() => {
      listeners.get("ai:await_confirm")!({
        payload: {
          sessionId: "tab-1",
          planId: "plan-1",
          stepId: "step-2",
          stepIndex: 1,
          kind: "write",
          argv: ["sftp-write", "/etc/nginx/nginx.conf"],
          targetFiles: ["/etc/nginx/nginx.conf"],
          diff: "--- before\n+++ after\n",
          snapshotPath: "/tmp/snapshot",
          warnings: [],
        },
      });
    });

    const stored = useAiSessionStore.getState().getSession("tab-1")?.plans[0];
    expect(stored?.awaitingConfirm?.planId).toBe("plan-1");
  });

  it("records plan done only for kind=plan", async () => {
    useAiSessionStore.getState().upsertPlan("tab-1", "plan-1", plan, null);
    renderHook(() => useAiPlan("tab-1"));
    await waitForListenerRegistered("ai:done");

    act(() => {
      listeners.get("ai:done")!({
        payload: {
          kind: "plan",
          sessionId: "tab-1",
          messageId: null,
          planId: "plan-1",
          truncated: false,
          canceled: false,
        },
      });
    });

    const stored = useAiSessionStore.getState().getSession("tab-1")?.plans[0];
    expect(stored?.lastDone?.kind).toBe("plan");
  });

  it("revisePlan updates the stored plan with revised suffix", async () => {
    useAiSessionStore.getState().upsertPlan("tab-1", "plan-1", plan, null);
    vi.mocked(invoke).mockResolvedValueOnce({
      plan: {
        ...plan,
        summary: "按新观察修订后的计划",
        steps: [
          {
            ...plan.steps[0],
            status: "pending",
            expectedObservation: "已按失败原因改写后续步骤",
          },
        ],
      },
      awaitingConfirm: false,
      currentStepId: null,
    });

    const { result } = renderHook(() => useAiPlan("tab-1"));

    await act(async () => {
      await result.current.revisePlan("plan-1", "nginx -t failed after edit");
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("ai_plan_step_revise", {
      input: {
        planId: "plan-1",
        newObservation: "nginx -t failed after edit",
      },
    });

    const stored = useAiSessionStore.getState().getSession("tab-1")?.plans[0];
    expect(stored?.plan.summary).toBe("按新观察修订后的计划");
    expect(stored?.plan.steps[0]?.expectedObservation).toBe("已按失败原因改写后续步骤");
  });
});
