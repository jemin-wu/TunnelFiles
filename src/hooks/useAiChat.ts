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

import { aiChatSend } from "@/lib/ai";
import { useAiSessionStore } from "@/stores/useAiSessionStore";
import type { AiTokenPayload } from "@/types/bindings/AiTokenPayload";
import type { AiDonePayload } from "@/types/bindings/AiDonePayload";
import type { AiErrorPayload } from "@/types/bindings/AiErrorPayload";

export const AI_EVENT_TOKEN = "ai:token";
export const AI_EVENT_DONE = "ai:done";
export const AI_EVENT_ERROR = "ai:error";

export interface UseAiChatReturn {
  send: (text: string) => Promise<void>;
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
        completeStream(sessionIdRef.current);
      });
      const u3 = await listen<AiErrorPayload>(AI_EVENT_ERROR, (e) => {
        if (cancelled) return;
        if (e.payload.sessionId !== sessionIdRef.current) return;
        const msg = e.payload.error?.message ?? "AI runtime error";
        failStream(sessionIdRef.current, msg);
      });

      if (cancelled) {
        u1();
        u2();
        u3();
      } else {
        unsubs.push(u1, u2, u3);
      }
    };
    void setup();

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
    // session id 走 ref；store actions 是 stable Zustand 引用，不会引起重订阅
  }, [appendAssistantToken, completeStream, failStream]);

  const send = useCallback(async (text: string) => {
    await aiChatSend(sessionIdRef.current, text);
  }, []);

  return { send };
}
