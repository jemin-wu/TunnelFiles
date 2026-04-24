import { useMemo, useState } from "react";
import { Check, Copy, TerminalSquare } from "lucide-react";
import type { Components } from "react-markdown";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isInsertableLanguage } from "@/lib/parseMessageBlocks";
import { CodeBlock, CodeBlockCode } from "@/components/prompt-kit/code-block";
import { Markdown } from "@/components/prompt-kit/markdown";
import { Message, MessageContent } from "@/components/prompt-kit/message";
import type { ChatMessage } from "@/stores/useAiSessionStore";

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
 * 滚动由父级 `ChatContainerRoot` + use-stick-to-bottom 接管 —— 本组件不再
 * 手写 `bottomRef.scrollIntoView`。
 *
 * 内容渲染：
 * - 用户消息：纯 prose（`whitespace-pre-wrap break-words`，不走 markdown）
 * - Assistant 消息：`Markdown`（react-markdown + remark-gfm）+ shiki 代码高亮
 * - Assistant 消息中可注入代码块（bash/sh/shell/zsh/无 lang）额外渲染
 *   "Insert to terminal" 按钮（SPEC §5：插入不带换行）
 */
export function MessageList({
  messages,
  isStreaming,
  onInsertCommand,
  className,
}: MessageListProps) {
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
    <div className={cn("flex flex-col gap-3 py-1", className)} data-slot="message-list">
      {messages.map((m, idx) => {
        const isLastAssistant = m.role === "assistant" && idx === messages.length - 1;
        const showCaret = Boolean(isStreaming && isLastAssistant);
        return (
          <ChatBubble
            key={m.id}
            message={m}
            showCaret={showCaret}
            onInsertCommand={onInsertCommand}
          />
        );
      })}
    </div>
  );
}

interface ChatBubbleProps {
  message: ChatMessage;
  showCaret: boolean;
  onInsertCommand?: (command: string) => void | Promise<void>;
}

function ChatBubble({ message, showCaret, onInsertCommand }: ChatBubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <Message className="justify-end" data-slot="message" data-role="user">
        <MessageContent className="selectable border-primary/30 bg-primary/10 text-foreground max-w-[85%] rounded-md border px-3 py-2 text-xs break-words whitespace-pre-wrap">
          {message.content}
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message className="justify-start" data-slot="message" data-role="assistant">
      <AssistantBubble
        content={message.content}
        showCaret={showCaret}
        onInsertCommand={onInsertCommand}
      />
    </Message>
  );
}

interface AssistantBubbleProps {
  content: string;
  showCaret: boolean;
  onInsertCommand?: (command: string) => void | Promise<void>;
}

function AssistantBubble({ content, showCaret, onInsertCommand }: AssistantBubbleProps) {
  const components = useMemo<Partial<Components>>(
    () => ({
      code({ className, children, node, ...props }) {
        const lang = extractLanguage(className);
        const codeText = String(children ?? "");
        // react-markdown: inline code 时 node.position 跨行为 false（单行起止相同）
        const isInline =
          !node?.position?.start.line || node?.position?.start.line === node?.position?.end.line;

        if (isInline) {
          return (
            <code
              className={cn(
                "bg-muted text-foreground rounded-sm px-1 py-0.5 font-mono text-[11px]",
                className
              )}
              {...props}
            >
              {children}
            </code>
          );
        }

        const trimmed = stripTrailingNewline(codeText);
        const insertable = Boolean(onInsertCommand) && isInsertableLanguage(lang);

        return (
          <AssistantCodeBlock
            className={className}
            code={trimmed}
            language={lang}
            insertable={insertable}
            onInsertCommand={onInsertCommand}
          />
        );
      },
      pre({ children }) {
        // code renderer 已经渲染了 CodeBlock 容器 —— 透传 children 避免嵌套 <pre>
        return <>{children}</>;
      },
    }),
    [onInsertCommand]
  );

  return (
    <div
      className={cn(
        "selectable border-border bg-card text-foreground max-w-[85%] rounded-md border px-3 py-2 text-xs"
      )}
    >
      <Markdown
        className="prose prose-sm dark:prose-invert max-w-none text-xs [&_ol]:my-1 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-1 [&_ul]:my-1"
        components={components}
      >
        {content}
      </Markdown>
      {showCaret && (
        <span aria-hidden className="ml-0.5 inline-block animate-pulse" data-slot="streaming-caret">
          ▍
        </span>
      )}
    </div>
  );
}

function extractLanguage(className?: string): string {
  if (!className) return "";
  const match = className.match(/language-([a-zA-Z0-9_+-]+)/);
  return match ? match[1] : "";
}

/** 去掉尾随换行 —— SPEC §5 "插入不带换行" 由用户决定何时执行。 */
function stripTrailingNewline(s: string): string {
  return s.replace(/\n+$/, "");
}

interface AssistantCodeBlockProps {
  className?: string;
  code: string;
  language: string;
  insertable: boolean;
  onInsertCommand?: (command: string) => void | Promise<void>;
}

function AssistantCodeBlock({
  className,
  code,
  language,
  insertable,
  onInsertCommand,
}: AssistantCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <CodeBlock
      className={cn("selectable", className)}
      data-slot="code-block"
      data-language={language || "shell"}
    >
      <CodeBlockCode className="selectable" code={code} language={language || "bash"} />
      <div className="border-border/50 flex justify-end gap-1 border-t px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => void handleCopy()}
          data-slot="copy-code"
          aria-label="Copy command"
        >
          {copied ? (
            <>
              <Check className="mr-1 size-3" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-1 size-3" aria-hidden />
              Copy
            </>
          )}
        </Button>
        {insertable && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => void onInsertCommand?.(code)}
            data-slot="insert-to-terminal"
            aria-label="Insert command to terminal"
          >
            <TerminalSquare className="mr-1 size-3" aria-hidden />
            Insert to terminal
          </Button>
        )}
      </div>
    </CodeBlock>
  );
}
