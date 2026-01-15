/**
 * 内联编辑单元格
 * 支持双击编辑文件/文件夹名称，类似 Finder
 */

import { useRef, useCallback, memo } from "react";
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

// 内部编辑组件，通过 key 重新挂载来重置状态
function EditInput({
  value,
  onSubmit,
  onCancel,
  className,
  style,
}: {
  value: string;
  onSubmit: (newValue: string) => void;
  onCancel: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const tempValueRef = useRef(value);
  const errorRef = useRef<string | null>(null);

  const handleSubmit = useCallback(() => {
    const trimmedValue = tempValueRef.current.trim();
    const validationError = validateFileName(trimmedValue, value);
    if (validationError) {
      errorRef.current = validationError;
      return;
    }
    onSubmit(trimmedValue);
  }, [value, onSubmit]);

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
    const trimmedValue = tempValueRef.current.trim();
    if (trimmedValue !== value) {
      handleSubmit();
    } else {
      onCancel();
    }
  }, [value, handleSubmit, onCancel]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    tempValueRef.current = e.target.value;
    errorRef.current = null;
  }, []);

  // 自动聚焦并选择文件名
  const handleRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) {
        el.focus();
        const dotIndex = value.lastIndexOf(".");
        if (dotIndex > 0) {
          el.setSelectionRange(0, dotIndex);
        } else {
          el.select();
        }
      }
    },
    [value]
  );

  return (
    <div className={cn("relative", className)} style={style}>
      <Input
        ref={handleRef}
        defaultValue={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="h-7 px-2 text-sm"
      />
    </div>
  );
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
  const handleDoubleClick = useCallback(() => {
    if (!disabled) {
      onStartEdit();
    }
  }, [disabled, onStartEdit]);

  if (isEditing) {
    return (
      <EditInput
        key={value}
        value={value}
        onSubmit={onSubmit}
        onCancel={onCancel}
        className={className}
        style={style}
      />
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
