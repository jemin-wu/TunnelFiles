/**
 * XTerm 终端组件
 * 封装 xterm.js，处理渲染和交互
 */

import { useEffect, useRef, useCallback, memo } from "react";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { useTerminalEvents } from "@/hooks/useTerminalEvents";
import type { TerminalStatusPayload } from "@/types/terminal";

/** 从 CSS 变量获取终端主题颜色 */
function getTerminalTheme(): ITheme {
  const style = getComputedStyle(document.documentElement);
  const getVar = (name: string) => style.getPropertyValue(name).trim();

  return {
    background: getVar("--terminal-background"),
    foreground: getVar("--terminal-foreground"),
    cursor: getVar("--terminal-cursor"),
    cursorAccent: getVar("--terminal-cursor-accent"),
    selectionBackground: getVar("--terminal-selection"),
    black: getVar("--terminal-black"),
    red: getVar("--terminal-red"),
    green: getVar("--terminal-green"),
    yellow: getVar("--terminal-yellow"),
    blue: getVar("--terminal-blue"),
    magenta: getVar("--terminal-magenta"),
    cyan: getVar("--terminal-cyan"),
    white: getVar("--terminal-white"),
    brightBlack: getVar("--terminal-bright-black"),
    brightRed: getVar("--terminal-bright-red"),
    brightGreen: getVar("--terminal-bright-green"),
    brightYellow: getVar("--terminal-bright-yellow"),
    brightBlue: getVar("--terminal-bright-blue"),
    brightMagenta: getVar("--terminal-bright-magenta"),
    brightCyan: getVar("--terminal-bright-cyan"),
    brightWhite: getVar("--terminal-bright-white"),
  };
}

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
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);

  // 使用 ref 存储回调，避免依赖数组变化导致终端重建
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  useEffect(() => {
    onInputRef.current = onInput;
    onResizeRef.current = onResize;
  }, [onInput, onResize]);

  // 处理终端输出
  const handleOutput = useCallback((data: Uint8Array) => {
    xtermRef.current?.write(data);
  }, []);

  // 监听终端事件
  useTerminalEvents({
    terminalId,
    onOutput: handleOutput,
    onStatusChange,
  });

  // 初始化 XTerm
  useEffect(() => {
    if (!containerRef.current) return;

    // 从 CSS 变量获取主题颜色，支持主题切换
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "IBM Plex Mono", "SF Mono", "Fira Code", monospace',
      theme: getTerminalTheme(),
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(containerRef.current);

    // 延迟 fit 确保容器尺寸已确定
    requestAnimationFrame(() => {
      fitAddon.fit();
      onResizeRef.current(xterm.cols, xterm.rows);
    });

    // 监听输入（通过 ref 访问最新回调）
    const inputDisposable = xterm.onData((data) => {
      onInputRef.current(data);
    });

    // 监听尺寸变化（通过 ref 访问最新回调）
    const resizeDisposable = xterm.onResize(({ cols, rows }) => {
      onResizeRef.current(cols, rows);
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // 防抖处理 fit 调用
    const debouncedFit = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        fitAddon.fit();
      }, 100);
    };

    // 使用 ResizeObserver 监听容器尺寸变化（面板拖拽等）
    const resizeObserver = new ResizeObserver(() => {
      debouncedFit();
    });
    resizeObserver.observe(containerRef.current);

    // 窗口尺寸变化时也触发（作为备用）
    window.addEventListener("resize", debouncedFit);

    // 聚焦终端
    xterm.focus();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", debouncedFit);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      inputDisposable.dispose();
      resizeDisposable.dispose();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // terminalId 变化时清空终端内容
  useEffect(() => {
    xtermRef.current?.clear();
  }, [terminalId]);

  return (
    <div
      ref={containerRef}
      className="terminal-container h-full w-full"
    />
  );
});
