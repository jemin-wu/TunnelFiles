import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/stores/useAiSessionStore";

/**
 * 反向遍历找最后一条 assistant 消息内容（用 Array.findLast 需要 ES2023
 * lib，目标 lib 还在 ES2022 阶段；手写避免改全局编译目标。
 */
function findLastAssistantContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "assistant") return messages[i].content;
  }
  return "";
}

interface MessageListProps {
  messages: ChatMessage[];
  /** 流式中：最后一条 assistant 消息显示 caret 提示。 */
  isStreaming?: boolean;
  className?: string;
}

/**
 * 纯渲染聊天历史。messages 数组按时间升序，从上往下排版。
 *
 * 滚动行为：每次 `messages.length` 增加（新消息）或最后一条 assistant 内容
 * 变化（流式追加）时滚到底部。用户手动上滑暂不识别 —— v0.1 简化处理。
 *
 * 不渲染 markdown：T1.6 等 react-markdown Ask First 落地后再升级；当前
 * `whitespace-pre-wrap` 保留换行 + 缩进足够看 bash 命令片段。
 */
export function MessageList({ messages, isStreaming, className }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAssistantContent = findLastAssistantContent(messages);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
    // messages.length 触发新消息滚动；lastAssistantContent 触发流式追加滚动
  }, [messages.length, lastAssistantContent]);

  if (messages.length === 0) {
    return (
      <div
        className={cn(
          "text-muted-foreground flex h-full items-center justify-center text-xs",
          className
        )}
        data-slot="message-list-empty"
      >
        Ask the local assistant about the current shell context.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)} data-slot="message-list">
      {messages.map((m, idx) => {
        const isLastAssistant = m.role === "assistant" && idx === messages.length - 1;
        const showCaret = isStreaming && isLastAssistant;
        return (
          <article
            key={m.id}
            data-slot="message"
            data-role={m.role}
            className={cn(
              "max-w-[85%] rounded-md border px-3 py-2 text-xs",
              m.role === "user"
                ? "border-primary/30 bg-primary/10 text-foreground self-end"
                : "border-border bg-card text-foreground self-start"
            )}
          >
            <span className="break-words whitespace-pre-wrap">{m.content}</span>
            {showCaret && (
              <span
                aria-hidden
                className="ml-0.5 inline-block animate-pulse"
                data-slot="streaming-caret"
              >
                ▍
              </span>
            )}
          </article>
        );
      })}
      <div ref={bottomRef} aria-hidden />
    </div>
  );
}
