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

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        cursorAccent: "#1e1e1e",
        selectionBackground: "#264f78",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#e5e5e5",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(containerRef.current);

    // 延迟 fit 确保容器尺寸已确定
    requestAnimationFrame(() => {
      fitAddon.fit();
      onResize(xterm.cols, xterm.rows);
    });

    // 监听输入
    const inputDisposable = xterm.onData((data) => {
      onInput(data);
    });

    // 监听尺寸变化
    const resizeDisposable = xterm.onResize(({ cols, rows }) => {
      onResize(cols, rows);
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
  }, [onInput, onResize]);

  // terminalId 变化时清空终端内容
  useEffect(() => {
    xtermRef.current?.clear();
  }, [terminalId]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{
        padding: "8px",
        backgroundColor: "#1e1e1e",
        boxSizing: "border-box",
      }}
    />
  );
});
