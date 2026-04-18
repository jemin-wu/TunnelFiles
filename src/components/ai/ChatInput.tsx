import { useCallback, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertTriangle, Send, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { detectInputWarnings } from "@/lib/inputSafetyWarnings";

interface ChatInputProps {
  /** 用户提交后回调，参数已 trim。返回 promise/void 都行。 */
  onSubmit: (text: string) => void | Promise<void>;
  /** true 时禁用输入框 + 按钮（流式中 / runtime 未就绪 / etc）。 */
  disabled?: boolean;
  /**
   * 流式中点击 Stop 按钮的回调。`disabled === true` AND 提供 `onStop`：
   * 右侧 Send 按钮替换为 Stop 按钮（destructive 样式），始终可点。
   * 不提供时：disabled 状态下 Send 按钮维持禁用样式（无 stop UX）。
   */
  onStop?: () => void;
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
export function ChatInput({ onSubmit, disabled, onStop, placeholder, className }: ChatInputProps) {
  const [value, setValue] = useState("");

  // 实时安全告警 —— 不阻塞 submit，仅 inline 提醒。后端仍会再 scrub 一次。
  const warnings = useMemo(() => detectInputWarnings(value), [value]);

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
      className={cn("flex flex-col gap-1.5", className)}
      data-slot="chat-input"
    >
      {warnings.length > 0 && (
        <ul
          className="text-destructive border-destructive/30 bg-destructive/5 flex flex-col gap-1 rounded-md border px-2 py-1.5 text-[11px]"
          role="status"
          aria-live="polite"
          data-slot="chat-input-warnings"
        >
          {warnings.map((w, i) => (
            <li key={`${w.kind}-${i}`} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">{w.label}</span>
                <span className="text-muted-foreground ml-1">
                  — 后端仍会脱敏，但建议确认后再发送
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
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
        {disabled && onStop ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            onClick={onStop}
            aria-label="Stop response"
            data-slot="chat-stop"
          >
            <Square />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={disabled || value.trim().length === 0}
            aria-label="Send message"
          >
            <Send />
          </Button>
        )}
      </div>
    </form>
  );
}
