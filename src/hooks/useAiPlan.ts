import { useCallback, useEffect, useMemo, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import {
  aiPlanCancel,
  aiPlanCreate,
  aiPlanRollback,
  aiPlanStepConfirm,
  aiPlanStepExecute,
  aiPlanStepRevise,
} from "@/lib/ai";
import { useAiSessionStore } from "@/stores/useAiSessionStore";
import type { AiAwaitConfirmPayload } from "@/types/bindings/AiAwaitConfirmPayload";
import type { AiDonePayload } from "@/types/bindings/AiDonePayload";
import type { AiRollbackProgressPayload } from "@/types/bindings/AiRollbackProgressPayload";
import type { AiServiceStateWarningPayload } from "@/types/bindings/AiServiceStateWarningPayload";
import type { AiStepEventPayload } from "@/types/bindings/AiStepEventPayload";

export const AI_EVENT_STEP = "ai:step";
export const AI_EVENT_AWAIT_CONFIRM = "ai:await_confirm";
export const AI_EVENT_ROLLBACK_PROGRESS = "ai:rollback_progress";
export const AI_EVENT_SERVICE_STATE_WARNING = "ai:service_state_warning";
export const AI_EVENT_DONE = "ai:done";
const EMPTY_PLANS: never[] = [];

export function useAiPlan(sessionId: string) {
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const planSession = useAiSessionStore((s) => s.sessions.get(sessionId));
  const plans = planSession?.plans ?? EMPTY_PLANS;
  const upsertPlan = useAiSessionStore((s) => s.upsertPlan);
  const applyPlanStepEvent = useAiSessionStore((s) => s.applyPlanStepEvent);
  const setPlanAwaitConfirm = useAiSessionStore((s) => s.setPlanAwaitConfirm);
  const setPlanRollbackProgress = useAiSessionStore((s) => s.setPlanRollbackProgress);
  const pushPlanServiceWarning = useAiSessionStore((s) => s.pushPlanServiceWarning);
  const setPlanDone = useAiSessionStore((s) => s.setPlanDone);

  useEffect(() => {
    let cancelled = false;
    const unsubs: UnlistenFn[] = [];

    const setup = async () => {
      const u1 = await listen<AiStepEventPayload>(AI_EVENT_STEP, (e) => {
        if (cancelled) return;
        if (e.payload.sessionId !== sessionIdRef.current) return;
        applyPlanStepEvent(sessionIdRef.current, e.payload);
      });
      const u2 = await listen<AiAwaitConfirmPayload>(AI_EVENT_AWAIT_CONFIRM, (e) => {
        if (cancelled) return;
        if (e.payload.sessionId !== sessionIdRef.current) return;
        setPlanAwaitConfirm(sessionIdRef.current, e.payload);
      });
      const u3 = await listen<AiRollbackProgressPayload>(AI_EVENT_ROLLBACK_PROGRESS, (e) => {
        if (cancelled) return;
        if (e.payload.sessionId !== sessionIdRef.current) return;
        setPlanRollbackProgress(sessionIdRef.current, e.payload);
      });
      const u4 = await listen<AiServiceStateWarningPayload>(AI_EVENT_SERVICE_STATE_WARNING, (e) => {
        if (cancelled) return;
        if (e.payload.sessionId !== sessionIdRef.current) return;
        pushPlanServiceWarning(sessionIdRef.current, e.payload);
      });
      const u5 = await listen<AiDonePayload>(AI_EVENT_DONE, (e) => {
        if (cancelled) return;
        if (e.payload.sessionId !== sessionIdRef.current) return;
        if (e.payload.kind !== "plan") return;
        setPlanDone(sessionIdRef.current, e.payload);
      });

      if (cancelled) {
        u1();
        u2();
        u3();
        u4();
        u5();
      } else {
        unsubs.push(u1, u2, u3, u4, u5);
      }
    };
    void setup();

    return () => {
      cancelled = true;
      for (const unlisten of unsubs) unlisten();
    };
  }, [
    applyPlanStepEvent,
    pushPlanServiceWarning,
    setPlanAwaitConfirm,
    setPlanDone,
    setPlanRollbackProgress,
  ]);

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => a.createdAt - b.createdAt), [plans]);

  const createPlan = useCallback(
    async (text: string) => {
      const result = await aiPlanCreate(sessionIdRef.current, text);
      upsertPlan(sessionIdRef.current, result.planId, result.plan, null);
      return result;
    },
    [upsertPlan]
  );

  const executeNext = useCallback(
    async (planId: string) => {
      const result = await aiPlanStepExecute(planId);
      upsertPlan(sessionIdRef.current, planId, result.plan, result.currentStepId ?? null);
      return result;
    },
    [upsertPlan]
  );

  const confirmWrite = useCallback(
    async (planId: string) => {
      const result = await aiPlanStepConfirm(planId);
      upsertPlan(sessionIdRef.current, planId, result.plan, result.currentStepId ?? null);
      return result;
    },
    [upsertPlan]
  );

  const cancelPlan = useCallback(
    async (planId: string) => {
      const result = await aiPlanCancel(planId);
      upsertPlan(sessionIdRef.current, planId, result.plan, result.currentStepId ?? null);
      return result;
    },
    [upsertPlan]
  );

  const rollbackStep = useCallback(
    async (planId: string, stepId: string) => {
      const result = await aiPlanRollback(planId, stepId);
      upsertPlan(sessionIdRef.current, planId, result.plan, stepId);
      return result;
    },
    [upsertPlan]
  );

  const revisePlan = useCallback(
    async (planId: string, newObservation: string) => {
      const result = await aiPlanStepRevise(planId, newObservation);
      upsertPlan(sessionIdRef.current, planId, result.plan, result.currentStepId ?? null);
      return result;
    },
    [upsertPlan]
  );

  return {
    plans: sortedPlans,
    createPlan,
    executeNext,
    confirmWrite,
    revisePlan,
    cancelPlan,
    rollbackStep,
  };
}
