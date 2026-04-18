import { useCallback, useState, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  /** 用户提交后回调，参数已 trim。返回 promise/void 都行。 */
  onSubmit: (text: string) => void | Promise<void>;
  /** true 时禁用输入框 + 按钮（流式中 / runtime 未就绪 / etc）。 */
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * 单行 form 包裹 textarea + 提交按钮。
 *
 * 键位：
 * - `Enter` 提交（与 textarea 默认换行行为相反，覆盖以匹配 chat 习惯）
 * - `Shift+Enter` 真换行
 * - `Cmd/Ctrl+Enter` 也提交（macOS 用户习惯）
 *
 * 空白文本不提交。提交后清空 value。disabled 状态下两边都锁。
 */
export function ChatInput({ onSubmit, disabled, placeholder, className }: ChatInputProps) {
  const [value, setValue] = useState("");

  const submit = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    setValue(""); // optimistic clear；onSubmit 失败由父层回填
    await onSubmit(trimmed);
  }, [value, disabled, onSubmit]);

  const handleSubmit = useCallback(
    (e: FormEvent<globalThis.HTMLFormElement>) => {
      e.preventDefault();
      void submit();
    },
    [submit]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<globalThis.HTMLTextAreaElement>) => {
      if (e.key !== "Enter") return;
      // Shift+Enter 保留原生换行行为
      if (e.shiftKey) return;
      e.preventDefault();
      void submit();
    },
    [submit]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("flex items-end gap-2", className)}
      data-slot="chat-input"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder ?? "Ask the local assistant..."}
        rows={2}
        aria-label="Chat input"
        className={cn(
          "border-input bg-background text-foreground placeholder:text-muted-foreground",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "min-h-16 flex-1 resize-none rounded-md border px-3 py-2 text-xs outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || value.trim().length === 0}
        aria-label="Send message"
      >
        <Send />
      </Button>
    </form>
  );
}
