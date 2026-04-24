/**
 * 把 chat 流式事件 (`ai:token` / `ai:done` / `ai:error`) 与
 * `useAiSessionStore` 串起来，对外只暴露一个 `send(text)`。
 *
 * - per-tab 隔离：listener 按 payload.sessionId 过滤，跨 tab 事件直接丢
 * - StrictMode 安全：用 cancelled-flag + async setup 防双订阅泄漏
 * - handler 用 ref 持当前 sessionId，避免 useEffect deps 因 sessionId
 *   变更而频繁 unsubscribe / resubscribe（StrictMode + 切 tab 场景常见）
 */

import { useCallback, useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { aiChatSend, aiChatCancel } from "@/lib/ai";
import { useAiSessionStore } from "@/stores/useAiSessionStore";
import type { AiTokenPayload } from "@/types/bindings/AiTokenPayload";
import type { AiDonePayload } from "@/types/bindings/AiDonePayload";
import type { AiErrorPayload } from "@/types/bindings/AiErrorPayload";
import type { AiProbeQueuedPayload } from "@/types/bindings/AiProbeQueuedPayload";
import type { ChatHistoryTurn } from "@/types/bindings/ChatHistoryTurn";

export const AI_EVENT_TOKEN = "ai:token";
export const AI_EVENT_DONE = "ai:done";
export const AI_EVENT_ERROR = "ai:error";
export const AI_EVENT_PROBE_QUEUED = "ai:probe_queued";

/**
 * 滑窗上限：最近 N 条消息（user + assistant 交替）透传给后端拼 Gemma 4
 * chat template。Gemma 4 E4B 默认 8K context，预算分配：
 *   system(~200) + context_snapshot(~1000) + output(1024) + current_user(~50)
 *     → 留给历史 ~5900 tokens
 *   按 ~150 tokens/消息平均估 → 能装 ~40 条消息
 * 我们保守取 40（20 轮往返）。真正爆了由后端截断，前端先滑窗减压。
 */
const HISTORY_WINDOW: number = 40;

export interface UseAiChatReturn {
  send: (text: string) => Promise<void>;
  /**
   * Stop an in-flight assistant response by messageId. Safe noop if the
   * message has already completed (backend returns canceled=false).
   */
  cancel: (messageId: string) => Promise<void>;
}

export function useAiChat(sessionId: string): UseAiChatReturn {
  const sessionIdRef = useRef(sessionId);
  // 用 effect 同步 ref，避免 render 期 mutation。listener 用 ref 读最新
  // sessionId，rerender 切 tab 不必 unsubscribe + resubscribe。
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const appendAssistantToken = useAiSessionStore((s) => s.appendAssistantToken);
  const completeStream = useAiSessionStore((s) => s.completeStream);
  const failStream = useAiSessionStore((s) => s.failStream);
  const setProbeQueuePosition = useAiSessionStore((s) => s.setProbeQueuePosition);

  useEffect(() => {
    let cancelled = false;
    const unsubs: UnlistenFn[] = [];

    const setup = async () => {
      const u1 = await listen<AiTokenPayload>(AI_EVENT_TOKEN, (e) => {
        if (cancelled) return;
        if (e.payload.sessionId !== sessionIdRef.current) return;
        appendAssistantToken(sessionIdRef.current, e.payload.token);
      });
      const u2 = await listen<AiDonePayload>(AI_EVENT_DONE, (e) => {
        if (cancelled) return;
        if (e.payload.sessionId !== sessionIdRef.current) return;
        if (e.payload.kind !== "chat") return;
        completeStream(sessionIdRef.current);
      });
      const u3 = await listen<AiErrorPayload>(AI_EVENT_ERROR, (e) => {
        if (cancelled) return;
        if (e.payload.sessionId !== sessionIdRef.current) return;
        const msg = e.payload.error?.message ?? "AI runtime error";
        failStream(sessionIdRef.current, msg);
      });
      const u4 = await listen<AiProbeQueuedPayload>(AI_EVENT_PROBE_QUEUED, (e) => {
        if (cancelled) return;
        if (e.payload.sessionId !== sessionIdRef.current) return;
        setProbeQueuePosition(sessionIdRef.current, e.payload.position);
      });

      if (cancelled) {
        u1();
        u2();
        u3();
        u4();
      } else {
        unsubs.push(u1, u2, u3, u4);
      }
    };
    void setup();

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
    // session id 走 ref；store actions 是 stable Zustand 引用，不会引起重订阅
  }, [appendAssistantToken, completeStream, failStream, setProbeQueuePosition]);

  const send = useCallback(async (text: string) => {
    // 发送前从 store 拉历史：ChatPanel.handleSubmit 已经先后调过
    // `appendUserMessage`（当前 user 已 push）+ `beginThinking`（assistant
    // 占位已 push），所以 store 里最后两条就是本轮。截掉末尾 2 条 + 再取
    // 滑窗末尾 HISTORY_WINDOW 条。
    const session = useAiSessionStore.getState().getSession(sessionIdRef.current);
    const messages = session?.messages ?? [];
    const priorMessages = messages.slice(0, -2);
    const window = priorMessages.slice(-HISTORY_WINDOW);
    const history: ChatHistoryTurn[] = window.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    await aiChatSend(sessionIdRef.current, text, history);
  }, []);

  const cancel = useCallback(async (messageId: string) => {
    await aiChatCancel(messageId);
  }, []);

  return { send, cancel };
}
