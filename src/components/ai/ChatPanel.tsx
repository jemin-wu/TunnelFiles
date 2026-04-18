import { useCallback } from "react";
import { AlertTriangle } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAiSessionStore } from "@/stores/useAiSessionStore";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";

interface ChatPanelProps {
  /** Tab / terminal session id —— per-tab 隔离的对话归属。 */
  sessionId: string;
  /**
   * 真实 IPC handler。提供后：appendUserMessage + beginThinking 后
   * await onSend；调用方负责通过 ai:token / ai:done 事件去更新 store
   * （由 T1.6 chat-streaming hook 实现，本组件不订阅）。
   *
   * 不提供时：组件进入 "echo mode" —— 提交后立即 completeStream，方便
   * UI 视觉调试或 storybook 预览。
   */
  onSend?: (sessionId: string, text: string) => Promise<void>;
  className?: string;
}

/**
 * 聊天面板组合体（T1.6 前置骨架）。
 *
 * 职责切割：
 * - **MessageList**：纯渲染消息历史
 * - **ChatInput**：纯输入 + 提交事件
 * - **ChatPanel** (本文件)：粘合 store 状态 + handleSubmit 流水线
 *
 * 真正的 IPC 订阅 / token 推送在 T1.6 chat-streaming hook 里加。
 */
export function ChatPanel({ sessionId, onSend, className }: ChatPanelProps) {
  // selector 订阅单条 session，避免其他 tab 改动触发本组件 rerender
  const session = useAiSessionStore((s) => s.sessions.get(sessionId));
  const appendUserMessage = useAiSessionStore((s) => s.appendUserMessage);
  const beginThinking = useAiSessionStore((s) => s.beginThinking);
  const completeStream = useAiSessionStore((s) => s.completeStream);
  const failStream = useAiSessionStore((s) => s.failStream);

  const messages = session?.messages ?? [];
  const streamState = session?.streamState ?? "idle";
  const isStreaming = streamState === "thinking" || streamState === "streaming";
  const isError = streamState === "error";

  const handleSubmit = useCallback(
    async (text: string) => {
      appendUserMessage(sessionId, text);
      beginThinking(sessionId);
      try {
        if (onSend) {
          await onSend(sessionId, text);
          // 不在此处 complete —— 真实 IPC 由 ai:done 事件驱动。
        } else {
          // echo mode（无 IPC 提供时）—— 直接收尾，避免 UI 卡 thinking
          completeStream(sessionId);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failStream(sessionId, msg);
      }
    },
    [sessionId, onSend, appendUserMessage, beginThinking, completeStream, failStream]
  );

  return (
    <div
      className={cn("flex h-full flex-col", className)}
      data-slot="chat-panel"
      data-session-id={sessionId}
      data-stream-state={streamState}
    >
      <ScrollArea className="flex-1 px-4 py-3">
        <MessageList messages={messages} isStreaming={isStreaming} />
      </ScrollArea>

      {isError && (
        <div
          className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 border-t px-4 py-2 text-xs"
          role="alert"
          data-slot="chat-error"
        >
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate" title={session?.error ?? undefined}>
            {session?.error ?? "Unknown error"}
          </span>
        </div>
      )}

      <div className="border-border/50 bg-background border-t px-4 py-3">
        <ChatInput
          onSubmit={handleSubmit}
          disabled={isStreaming}
          placeholder={isStreaming ? "Waiting for response..." : "Ask the local assistant..."}
        />
      </div>
    </div>
  );
}
