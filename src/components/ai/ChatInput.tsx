import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Send, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
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
 * 基于 prompt-kit 的 `PromptInput` 构建：
 * - auto-resize textarea
 * - Enter 提交 / Shift+Enter 换行（PromptInputTextarea 内置）
 * - Send / Stop 按钮切换（disabled + onStop 时）
 * - 实时安全告警条（detectInputWarnings，不阻塞 submit）
 */
export function ChatInput({ onSubmit, disabled, onStop, placeholder, className }: ChatInputProps) {
  const [value, setValue] = useState("");

  const warnings = useMemo(() => detectInputWarnings(value), [value]);

  const submit = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    setValue(""); // optimistic clear；onSubmit 失败由父层回填
    await onSubmit(trimmed);
  }, [value, disabled, onSubmit]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-slot="chat-input">
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
      <PromptInput
        value={value}
        onValueChange={setValue}
        onSubmit={() => void submit()}
        disabled={disabled}
        maxHeight={160}
      >
        <PromptInputTextarea
          placeholder={placeholder ?? "Ask the local assistant..."}
          aria-label="Chat input"
          className="text-xs"
        />
        <PromptInputActions className="mt-1 justify-end">
          {disabled && onStop ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={onStop}
              aria-label="Stop response"
              data-slot="chat-stop"
              className="h-8 w-8"
            >
              <Square />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              disabled={disabled || value.trim().length === 0}
              aria-label="Send message"
              onClick={() => void submit()}
              className="h-8 w-8"
            >
              <Send />
            </Button>
          )}
        </PromptInputActions>
      </PromptInput>
    </div>
  );
}
