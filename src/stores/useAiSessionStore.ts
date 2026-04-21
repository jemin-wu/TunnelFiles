import { create } from "zustand";

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

export interface ChatSession {
  messages: ChatMessage[];
  streamState: StreamState;
  /** 当前 in-flight assistant 消息 id；null = 无流 */
  pendingAssistantId: string | null;
  /** streamState === "error" 时填 */
  error: string | null;
  /** Probe 并发队列位置（T2.8）：null = 不在队列，1+ = 等待中 */
  probeQueuePosition: number | null;
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
}

function emptySession(): ChatSession {
  return {
    messages: [],
    streamState: "idle",
    pendingAssistantId: null,
    error: null,
    probeQueuePosition: null,
  };
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
  }));
}

/** 单例 store —— 生产使用。 */
export const useAiSessionStore = createAiSessionStore();
