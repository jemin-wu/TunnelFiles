import { create } from "zustand";
import type { AiAwaitConfirmPayload } from "@/types/bindings/AiAwaitConfirmPayload";
import type { AiDonePayload } from "@/types/bindings/AiDonePayload";
import type { AiPlan } from "@/types/bindings/AiPlan";
import type { AiRollbackProgressPayload } from "@/types/bindings/AiRollbackProgressPayload";
import type { AiServiceStateWarningPayload } from "@/types/bindings/AiServiceStateWarningPayload";
import type { AiStepEventPayload } from "@/types/bindings/AiStepEventPayload";

/**
 * Per-tab AI chat 会话状态。每个 terminal tab 对应一条独立的对话，
 * 彼此隔离（SPEC §7 Never "AI 对话共享跨 tab 上下文"）。
 *
 * 本文件只做状态管理 —— 不订阅 Tauri 事件、不调 IPC。T1.6 chat streaming
 * 再挂 listener，IPC 封装走 `@/lib/ai`。
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Unix ms */
  createdAt: number;
}

export type StreamState = "idle" | "thinking" | "streaming" | "error";

export interface PlanRuntimeState {
  planId: string;
  plan: AiPlan;
  createdAt: number;
  currentStepId: string | null;
  awaitingConfirm: AiAwaitConfirmPayload | null;
  rollbackProgress: AiRollbackProgressPayload | null;
  serviceWarnings: AiServiceStateWarningPayload[];
  lastDone: AiDonePayload | null;
  stepEvents: Record<string, AiStepEventPayload>;
}

export interface ChatSession {
  messages: ChatMessage[];
  streamState: StreamState;
  /** 当前 in-flight assistant 消息 id；null = 无流 */
  pendingAssistantId: string | null;
  /** streamState === "error" 时填 */
  error: string | null;
  /** Probe 并发队列位置（T2.8）：null = 不在队列，1+ = 等待中 */
  probeQueuePosition: number | null;
  /** 当前 tab 下的所有 AI plan（按创建时间持久保留直到 tab/session 清理）。 */
  plans: PlanRuntimeState[];
}

interface AiSessionState {
  sessions: Map<string, ChatSession>;

  // ---- Selectors ----
  getSession: (sessionId: string) => ChatSession | undefined;
  getStreamState: (sessionId: string) => StreamState;

  // ---- Actions ----
  /** 追加一条用户消息，返回 messageId。session 不存在则自动创建。 */
  appendUserMessage: (sessionId: string, content: string) => string;
  /** 进入 thinking 态，占位一条空 assistant 消息。返回 assistant messageId。 */
  beginThinking: (sessionId: string) => string;
  /** 收到首个 token：thinking → streaming；并追加 token 到 pending assistant。 */
  appendAssistantToken: (sessionId: string, token: string) => void;
  /** 结束流式：streamState → idle；保留 messages。 */
  completeStream: (sessionId: string) => void;
  /** 失败：streamState → error；保留已收到的 tokens。 */
  failStream: (sessionId: string, error: string) => void;
  /** 清空当前 session 的消息 + 状态（保留条目）。 */
  resetSession: (sessionId: string) => void;
  /** 彻底移除 session（tab 关闭场景）。 */
  removeSession: (sessionId: string) => void;
  /** 更新 probe 队列位置（T2.8）：position=0 表示出队，清除 banner。 */
  setProbeQueuePosition: (sessionId: string, position: number) => void;
  /** 新建或整体覆盖一条 plan 的最新快照。 */
  upsertPlan: (
    sessionId: string,
    planId: string,
    plan: AiPlan,
    currentStepId?: string | null
  ) => void;
  /** 根据 ai:step 增量更新 step 运行态。 */
  applyPlanStepEvent: (sessionId: string, payload: AiStepEventPayload) => void;
  /** 写入确认暂停事件。 */
  setPlanAwaitConfirm: (sessionId: string, payload: AiAwaitConfirmPayload) => void;
  /** rollback 进度事件。 */
  setPlanRollbackProgress: (sessionId: string, payload: AiRollbackProgressPayload) => void;
  /** 服务状态警告事件。 */
  pushPlanServiceWarning: (sessionId: string, payload: AiServiceStateWarningPayload) => void;
  /** plan done 事件。 */
  setPlanDone: (sessionId: string, payload: AiDonePayload) => void;
}

function emptySession(): ChatSession {
  return {
    messages: [],
    streamState: "idle",
    pendingAssistantId: null,
    error: null,
    probeQueuePosition: null,
    plans: [],
  };
}

function patchPlanSteps(plan: AiPlan, payload: AiStepEventPayload): AiPlan {
  const steps = plan.steps.map((step, index) =>
    step.id === payload.stepId || index === payload.stepIndex
      ? { ...step, status: payload.status }
      : step
  );
  return {
    ...plan,
    status: derivePlanStatusFromStepEvent(plan.status, steps, payload.status),
    steps,
  };
}

function derivePlanStatusFromStepEvent(
  currentStatus: AiPlan["status"],
  steps: AiPlan["steps"],
  stepStatus: AiStepEventPayload["status"]
): AiPlan["status"] {
  switch (stepStatus) {
    case "failed":
    case "rolled_back":
      return "failed";
    case "canceled":
      return "canceled";
    case "awaiting_confirm":
      return "awaiting_confirm";
    case "running":
    case "executing":
    case "verifying":
      return "running";
    case "done":
      return steps.every((step) => step.status === "done") ? "done" : "ready";
    default:
      return currentStatus;
  }
}

function newId(): string {
  // globalThis.crypto.randomUUID 在 Tauri webview (modern WebKit) 可用。
  // fallback：无 —— 应用运行环境固定，不引入占位 polyfill 以免被误用为外部通用工具。
  return globalThis.crypto.randomUUID();
}

/** 工厂导出 —— 方便测试构造独立 store 实例，避免跨 case 污染。 */
export function createAiSessionStore() {
  return create<AiSessionState>((set, get) => ({
    sessions: new Map(),

    getSession: (sessionId) => get().sessions.get(sessionId),

    getStreamState: (sessionId) => get().sessions.get(sessionId)?.streamState ?? "idle",

    appendUserMessage: (sessionId, content) => {
      const id = newId();
      set((state) => {
        const sessions = new Map(state.sessions);
        const current = sessions.get(sessionId) ?? emptySession();
        sessions.set(sessionId, {
          ...current,
          messages: [...current.messages, { id, role: "user", content, createdAt: Date.now() }],
          error: null,
        });
        return { sessions };
      });
      return id;
    },

    beginThinking: (sessionId) => {
      const assistantId = newId();
      set((state) => {
        const sessions = new Map(state.sessions);
        const current = sessions.get(sessionId) ?? emptySession();
        sessions.set(sessionId, {
          ...current,
          streamState: "thinking",
          pendingAssistantId: assistantId,
          error: null,
          messages: [
            ...current.messages,
            { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
          ],
        });
        return { sessions };
      });
      return assistantId;
    },

    appendAssistantToken: (sessionId, token) =>
      set((state) => {
        const current = state.sessions.get(sessionId);
        if (!current || !current.pendingAssistantId) return state;
        const pendingId = current.pendingAssistantId;
        // thinking → streaming 在第一个 token 到来时自动切
        const nextStream: StreamState =
          current.streamState === "thinking" ? "streaming" : current.streamState;
        const messages = current.messages.map((m) =>
          m.id === pendingId ? { ...m, content: m.content + token } : m
        );
        const sessions = new Map(state.sessions);
        sessions.set(sessionId, {
          ...current,
          streamState: nextStream,
          messages,
        });
        return { sessions };
      }),

    completeStream: (sessionId) =>
      set((state) => {
        const current = state.sessions.get(sessionId);
        if (!current) return state;
        const sessions = new Map(state.sessions);
        sessions.set(sessionId, {
          ...current,
          streamState: "idle",
          pendingAssistantId: null,
          error: null,
        });
        return { sessions };
      }),

    failStream: (sessionId, error) =>
      set((state) => {
        const current = state.sessions.get(sessionId) ?? emptySession();
        const sessions = new Map(state.sessions);
        sessions.set(sessionId, {
          ...current,
          streamState: "error",
          error,
        });
        return { sessions };
      }),

    resetSession: (sessionId) =>
      set((state) => {
        if (!state.sessions.has(sessionId)) return state;
        const sessions = new Map(state.sessions);
        sessions.set(sessionId, emptySession());
        return { sessions };
      }),

    removeSession: (sessionId) =>
      set((state) => {
        if (!state.sessions.has(sessionId)) return state;
        const sessions = new Map(state.sessions);
        sessions.delete(sessionId);
        return { sessions };
      }),

    setProbeQueuePosition: (sessionId, position) =>
      set((state) => {
        const current = state.sessions.get(sessionId) ?? emptySession();
        const sessions = new Map(state.sessions);
        sessions.set(sessionId, {
          ...current,
          probeQueuePosition: position === 0 ? null : position,
        });
        return { sessions };
      }),

    upsertPlan: (sessionId, planId, plan, currentStepId = null) =>
      set((state) => {
        const sessions = new Map(state.sessions);
        const current = sessions.get(sessionId) ?? emptySession();
        const existing = current.plans.find((item) => item.planId === planId);
        const nextPlan: PlanRuntimeState = existing
          ? {
              ...existing,
              plan,
              currentStepId,
              awaitingConfirm: plan.status === "awaiting_confirm" ? existing.awaitingConfirm : null,
            }
          : {
              planId,
              plan,
              createdAt: Date.now(),
              currentStepId,
              awaitingConfirm: null,
              rollbackProgress: null,
              serviceWarnings: [],
              lastDone: null,
              stepEvents: {},
            };
        const plans = existing
          ? current.plans.map((item) => (item.planId === planId ? nextPlan : item))
          : [...current.plans, nextPlan];
        sessions.set(sessionId, { ...current, plans });
        return { sessions };
      }),

    applyPlanStepEvent: (sessionId, payload) =>
      set((state) => {
        const current = state.sessions.get(sessionId) ?? emptySession();
        const sessions = new Map(state.sessions);
        const plans = current.plans.map((item) =>
          item.planId === payload.planId
            ? {
                ...item,
                plan: patchPlanSteps(item.plan, payload),
                currentStepId: payload.stepId,
                awaitingConfirm:
                  payload.status === "awaiting_confirm" ? item.awaitingConfirm : null,
                stepEvents: { ...item.stepEvents, [payload.stepId]: payload },
              }
            : item
        );
        sessions.set(sessionId, { ...current, plans });
        return { sessions };
      }),

    setPlanAwaitConfirm: (sessionId, payload) =>
      set((state) => {
        const current = state.sessions.get(sessionId) ?? emptySession();
        const sessions = new Map(state.sessions);
        const plans = current.plans.map((item) =>
          item.planId === payload.planId
            ? {
                ...item,
                currentStepId: payload.stepId,
                awaitingConfirm: payload,
              }
            : item
        );
        sessions.set(sessionId, { ...current, plans });
        return { sessions };
      }),

    setPlanRollbackProgress: (sessionId, payload) =>
      set((state) => {
        const current = state.sessions.get(sessionId) ?? emptySession();
        const sessions = new Map(state.sessions);
        const plans = current.plans.map((item) =>
          item.planId === payload.planId ? { ...item, rollbackProgress: payload } : item
        );
        sessions.set(sessionId, { ...current, plans });
        return { sessions };
      }),

    pushPlanServiceWarning: (sessionId, payload) =>
      set((state) => {
        const current = state.sessions.get(sessionId) ?? emptySession();
        const sessions = new Map(state.sessions);
        const plans = current.plans.map((item) =>
          item.planId === payload.planId
            ? {
                ...item,
                serviceWarnings: [...item.serviceWarnings, payload],
              }
            : item
        );
        sessions.set(sessionId, { ...current, plans });
        return { sessions };
      }),

    setPlanDone: (sessionId, payload) =>
      set((state) => {
        const planId = payload.planId ?? null;
        if (!planId) return state;
        const current = state.sessions.get(sessionId) ?? emptySession();
        const sessions = new Map(state.sessions);
        const plans = current.plans.map((item) =>
          item.planId === planId
            ? {
                ...item,
                lastDone: payload,
                awaitingConfirm: payload.canceled ? null : item.awaitingConfirm,
              }
            : item
        );
        sessions.set(sessionId, { ...current, plans });
        return { sessions };
      }),
  }));
}

/** 单例 store —— 生产使用。 */
export const useAiSessionStore = createAiSessionStore();
