import { useCallback } from "react";
import { AlertTriangle, Clock } from "lucide-react";

import { ChatContainerContent, ChatContainerRoot } from "@/components/prompt-kit/chat-container";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import { cn } from "@/lib/utils";
import { useAiChat } from "@/hooks/useAiChat";
import { useAiSessionStore } from "@/stores/useAiSessionStore";
import { encodeTerminalData, getTerminalBySession, writeTerminalInput } from "@/lib/terminal";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";

interface ChatPanelProps {
  /** Tab / terminal session id —— per-tab 隔离的对话归属。 */
  sessionId: string;
  /**
   * 显式覆盖发送 handler。**默认走 `useAiChat`** —— 接 `ai_chat_send` IPC
   * 并订阅 `ai:token` / `ai:done` / `ai:error` 事件更新 store。
   *
   * 显式传入用于：
   * - 测试桩（fake handler）
   * - storybook 预览（auto-complete echo 模式）
   *
   * 注意：传 `onSend` 时**不会**自动订阅事件 —— 调用方需自己驱动 store 收尾。
   */
  onSend?: (sessionId: string, text: string) => Promise<void>;
  /**
   * 覆盖代码块"插入终端"行为。**默认**通过 `getTerminalBySession` 找到当前
   * tab 关联的 terminalId，再 `writeTerminalInput` 不带换行写入。
   */
  onInsertCommand?: (command: string) => void | Promise<void>;
  className?: string;
}

/**
 * 聊天面板组合体。
 *
 * 职责切割：
 * - **MessageList**：纯渲染消息历史（prompt-kit Message + Markdown）
 * - **ChatInput**：prompt-kit PromptInput 输入 + 提交事件
 * - **ChatPanel** (本文件)：粘合 store 状态 + handleSubmit 流水线 +
 *   滚动容器 ChatContainerRoot（use-stick-to-bottom 接管自动贴底 / 手动上滑暂停）
 */
export function ChatPanel({ sessionId, onSend, onInsertCommand, className }: ChatPanelProps) {
  // selector 订阅单条 session，避免其他 tab 改动触发本组件 rerender
  const session = useAiSessionStore((s) => s.sessions.get(sessionId));
  const appendUserMessage = useAiSessionStore((s) => s.appendUserMessage);
  const beginThinking = useAiSessionStore((s) => s.beginThinking);
  const failStream = useAiSessionStore((s) => s.failStream);

  // 默认订阅 IPC 事件 + 提供 send 回调；外部 onSend 覆盖时仅作为发送入口，
  // listener 仍然订阅（事件契约固定，外部 handler 改不了响应通路）。
  const { send: defaultSend, cancel } = useAiChat(sessionId);

  const messages = session?.messages ?? [];
  const streamState = session?.streamState ?? "idle";
  const isStreaming = streamState === "thinking" || streamState === "streaming";
  const isError = streamState === "error";
  const pendingAssistantId = session?.pendingAssistantId ?? null;
  const probeQueuePosition = session?.probeQueuePosition ?? null;

  const handleStop = useCallback(() => {
    if (!pendingAssistantId) return;
    void cancel(pendingAssistantId);
  }, [cancel, pendingAssistantId]);

  /**
   * 默认插入流程：sessionId → 当前 terminalId → base64 → 写入 PTY，**不带换行**。
   * 终端可能未打开（用户在 Files tab 时）—— 此时静默忽略；UI 不抛错。
   */
  const defaultInsertCommand = useCallback(
    async (command: string) => {
      const terminalId = await getTerminalBySession(sessionId);
      if (!terminalId) return;
      await writeTerminalInput({
        terminalId,
        data: encodeTerminalData(command),
      });
    },
    [sessionId]
  );

  const insertCommand = onInsertCommand ?? defaultInsertCommand;

  const handleSubmit = useCallback(
    async (text: string) => {
      appendUserMessage(sessionId, text);
      beginThinking(sessionId);
      try {
        if (onSend) {
          await onSend(sessionId, text);
        } else {
          await defaultSend(text);
        }
        // 流式收尾由 ai:done 事件驱动（useAiChat 内部）；外部 onSend 也
        // 应通过同样的事件流推动 store。这里不在 try 块内 complete。
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failStream(sessionId, msg);
      }
    },
    [sessionId, onSend, defaultSend, appendUserMessage, beginThinking, failStream]
  );

  return (
    <div
      className={cn("flex h-full flex-col", className)}
      data-slot="chat-panel"
      data-session-id={sessionId}
      data-stream-state={streamState}
    >
      <ChatContainerRoot className="relative min-h-0 flex-1">
        <ChatContainerContent className="px-4 py-3">
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            onInsertCommand={insertCommand}
          />
        </ChatContainerContent>
        <div className="pointer-events-none absolute right-3 bottom-3 z-10">
          <div className="pointer-events-auto">
            <ScrollButton size="icon" className="size-8" />
          </div>
        </div>
      </ChatContainerRoot>

      {probeQueuePosition !== null && (
        <div
          className="border-border/50 bg-muted text-muted-foreground flex items-center gap-2 border-t px-4 py-2 text-xs"
          role="status"
          data-slot="chat-probe-queue"
        >
          <Clock className="size-3.5 shrink-0" aria-hidden />
          <span>AI 队列中（第 {probeQueuePosition} 位）</span>
        </div>
      )}

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
          onStop={pendingAssistantId ? handleStop : undefined}
          placeholder={isStreaming ? "Waiting for response..." : "Ask the local assistant..."}
        />
      </div>
    </div>
  );
}
