/**
 * XTerm 终端组件
 * 封装 xterm.js，处理渲染和交互
 */

import { useEffect, useRef, useCallback, memo } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { useTerminalEvents } from "@/hooks/useTerminalEvents";
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

    // Cyberpunk Terminal Theme - 与应用主题保持一致
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "IBM Plex Mono", "SF Mono", "Fira Code", monospace',
      theme: {
        background: "#0f0d14",      // oklch(0.08 0.02 280) - Deep purple-black
        foreground: "#d4e4e4",      // oklch(0.88 0.02 180) - Cyan-tinted white
        cursor: "#00ff9f",          // oklch(0.78 0.22 155) - Neon green (primary)
        cursorAccent: "#0f0d14",
        selectionBackground: "rgba(0, 255, 159, 0.25)", // Primary with alpha
        black: "#0f0d14",
        red: "#ff4466",             // oklch(0.65 0.25 15) - Destructive
        green: "#00ff9f",           // oklch(0.78 0.22 155) - Primary
        yellow: "#ffcc00",          // oklch(0.82 0.18 85) - Warning
        blue: "#00d4ff",            // oklch(0.72 0.18 195) - Accent/Cyan
        magenta: "#ff66b2",         // oklch(0.7 0.2 320) - Magenta
        cyan: "#00d4ff",            // oklch(0.72 0.18 195) - Accent
        white: "#d4e4e4",
        brightBlack: "#555566",
        brightRed: "#ff6688",
        brightGreen: "#33ffb2",
        brightYellow: "#ffdd44",
        brightBlue: "#44ddff",
        brightMagenta: "#ff88cc",
        brightCyan: "#44ddff",
        brightWhite: "#ffffff",
      },
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

    // 窗口尺寸变化时自动调整（防抖）
    const handleWindowResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        fitAddon.fit();
      }, 100);
    };
    window.addEventListener("resize", handleWindowResize);

    // 聚焦终端
    xterm.focus();

    return () => {
      window.removeEventListener("resize", handleWindowResize);
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
