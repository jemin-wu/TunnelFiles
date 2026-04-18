import { useEffect, useRef } from "react";
import { TerminalSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isInsertableLanguage, parseMessageBlocks } from "@/lib/parseMessageBlocks";
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
  /**
   * 传入后，assistant 消息中的可注入代码块（bash/sh/shell/zsh/无 lang）会
   * 显示 "Insert to terminal" 按钮。SPEC §5：插入**不带换行**，由用户回车。
   */
  onInsertCommand?: (command: string) => void | Promise<void>;
  className?: string;
}

/**
 * 纯渲染聊天历史。messages 数组按时间升序，从上往下排版。
 *
 * 滚动行为：每次 `messages.length` 增加（新消息）或最后一条 assistant 内容
 * 变化（流式追加）时滚到底部。用户手动上滑暂不识别 —— v0.1 简化处理。
 *
 * 内容渲染：用户消息保持纯 prose；assistant 消息走 `parseMessageBlocks`
 * 拆出 fenced code blocks，可注入语言额外渲染插入按钮。其他 markdown 不
 * 渲染（react-markdown 仍在 Ask First 队列）。
 */
export function MessageList({
  messages,
  isStreaming,
  onInsertCommand,
  className,
}: MessageListProps) {
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
            {m.role === "assistant" ? (
              <AssistantContent content={m.content} onInsertCommand={onInsertCommand} />
            ) : (
              <span className="break-words whitespace-pre-wrap">{m.content}</span>
            )}
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

interface AssistantContentProps {
  content: string;
  onInsertCommand?: (command: string) => void | Promise<void>;
}

function AssistantContent({ content, onInsertCommand }: AssistantContentProps) {
  const blocks = parseMessageBlocks(content);
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, i) => {
        if (block.kind === "text") {
          return (
            <span key={i} className="break-words whitespace-pre-wrap">
              {block.content}
            </span>
          );
        }
        const insertable = onInsertCommand && isInsertableLanguage(block.language);
        return (
          <div
            key={i}
            data-slot="code-block"
            data-language={block.language || "shell"}
            className="border-border bg-muted/50 overflow-hidden rounded-md border"
          >
            <pre className="overflow-x-auto px-3 py-2 font-mono text-xs">
              <code>{block.content.replace(/\n$/, "")}</code>
            </pre>
            {insertable && (
              <div className="border-border/50 flex justify-end border-t px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => void onInsertCommand?.(stripTrailingNewline(block.content))}
                  data-slot="insert-to-terminal"
                  aria-label="Insert command to terminal"
                >
                  <TerminalSquare className="mr-1 size-3" aria-hidden />
                  Insert to terminal
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 去掉尾随换行 —— SPEC §5 "插入不带换行" 由用户决定何时执行。 */
function stripTrailingNewline(s: string): string {
  return s.replace(/\n+$/, "");
}
