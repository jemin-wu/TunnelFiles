/**
 * 内联编辑单元格
 * 支持双击编辑文件/文件夹名称，类似 Finder
 */

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { Input } from "@/components/ui/input";
import { validateFileName } from "@/lib/validation";
import { cn } from "@/lib/utils";

interface InlineEditableCellProps {
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSubmit: (newValue: string) => void;
  onCancel: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const InlineEditableCell = memo(function InlineEditableCell({
  value,
  isEditing,
  onStartEdit,
  onSubmit,
  onCancel,
  disabled = false,
  className,
  style,
}: InlineEditableCellProps) {
  const [tempValue, setTempValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 进入编辑模式时，初始化值并聚焦
  useEffect(() => {
    if (isEditing) {
      setTempValue(value);
      setError(null);
      // 延迟聚焦，确保 DOM 已更新
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // 选中文件名部分（不含扩展名）
          const dotIndex = value.lastIndexOf(".");
          if (dotIndex > 0) {
            inputRef.current.setSelectionRange(0, dotIndex);
          } else {
            inputRef.current.select();
          }
        }
      });
    }
  }, [isEditing, value]);

  const handleSubmit = useCallback(() => {
    const trimmedValue = tempValue.trim();
    const validationError = validateFileName(trimmedValue, value);
    if (validationError) {
      setError(validationError);
      return;
    }
    onSubmit(trimmedValue);
  }, [tempValue, value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel]
  );

  const handleBlur = useCallback(() => {
    // 失焦时提交（如果值有变化）
    const trimmedValue = tempValue.trim();
    if (trimmedValue !== value) {
      handleSubmit();
    } else {
      onCancel();
    }
  }, [tempValue, value, handleSubmit, onCancel]);

  const handleDoubleClick = useCallback(() => {
    if (!disabled) {
      onStartEdit();
    }
  }, [disabled, onStartEdit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTempValue(e.target.value);
    setError(null);
  }, []);

  if (isEditing) {
    return (
      <div className={cn("relative", className)} style={style}>
        <Input
          ref={inputRef}
          value={tempValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={cn(
            "h-7 px-2 text-sm",
            error && "border-destructive focus-visible:ring-destructive"
          )}
        />
        {error && (
          <div className="absolute top-full left-0 mt-1 px-2 py-1 text-xs text-destructive bg-background border border-destructive/20 rounded shadow-sm z-50 whitespace-nowrap">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("truncate cursor-default select-none", className)}
      style={style}
      onDoubleClick={handleDoubleClick}
      title={value}
    >
      {value}
    </div>
  );
});
