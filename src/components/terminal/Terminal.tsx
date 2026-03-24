/**
 * XTerm 终端组件
 * 使用 useTerminalRenderer hook 管理 xterm.js 渲染、WebGL/Canvas/DOM fallback、主题和字体
 */

import { useEffect, useRef, useCallback, memo } from "react";

import { useTerminalEvents } from "@/hooks/useTerminalEvents";
import { useTerminalRenderer } from "@/hooks/useTerminalRenderer";
import { measureRenderStart, measureRenderEnd } from "@/lib/terminal-perf";
import type { TerminalStatusPayload } from "@/types/terminal";

interface TerminalProps {
  terminalId: string;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onStatusChange?: (status: TerminalStatusPayload) => void;
}

export const Terminal = memo(function Terminal({
  terminalId,
  onInput,
  onResize,
  onStatusChange,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { write, clear, focus } = useTerminalRenderer({
    containerRef,
    onInput,
    onResize,
  });

  // 处理终端输出（带渲染管线延迟埋点）
  const handleOutput = useCallback(
    (data: Uint8Array) => {
      const t = measureRenderStart();
      write(data);
      measureRenderEnd(t);
    },
    [write]
  );

  // 监听终端事件
  useTerminalEvents({
    terminalId,
    onOutput: handleOutput,
    onStatusChange,
  });

  // terminalId 变化时清空终端内容
  useEffect(() => {
    clear();
  }, [terminalId, clear]);

  // 初始聚焦
  useEffect(() => {
    focus();
  }, [focus]);

  return (
    <div
      ref={containerRef}
      className="terminal-container h-full w-full"
      role="region"
      aria-label="Terminal"
    />
  );
});
