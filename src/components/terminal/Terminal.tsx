/**
 * XTerm 终端组件
 * 封装 xterm.js，处理渲染和交互
 */

import { useEffect, useRef, useCallback, memo } from "react";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { useTerminalEvents } from "@/hooks/useTerminalEvents";
import { useTheme } from "@/lib/theme";
import type { TerminalStatusPayload } from "@/types/terminal";

/** 终端主题颜色映射 — 与 index.css 中的 --terminal-* 变量保持同步 */
const TERMINAL_THEMES: Record<"dark" | "light", ITheme> = {
  dark: {
    background: "#1e1e24",
    foreground: "#d4d4d8",
    cursor: "#6b9eff",
    cursorAccent: "#1e1e24",
    selectionBackground: "rgba(107, 158, 255, 0.25)",
    black: "#1e1e24",
    red: "#e05566",
    green: "#4caf7a",
    yellow: "#d4a040",
    blue: "#6b9eff",
    magenta: "#c084d8",
    cyan: "#56b6c2",
    white: "#d4d4d8",
    brightBlack: "#555566",
    brightRed: "#f06070",
    brightGreen: "#5cc08a",
    brightYellow: "#e4b050",
    brightBlue: "#7baaff",
    brightMagenta: "#d094e8",
    brightCyan: "#66c6d2",
    brightWhite: "#ffffff",
  },
  light: {
    background: "#f5f5f7",
    foreground: "#2a2a35",
    cursor: "#3d6ec0",
    cursorAccent: "#f5f5f7",
    selectionBackground: "rgba(61, 110, 192, 0.2)",
    black: "#2a2a35",
    red: "#c43c50",
    green: "#2d7a4e",
    yellow: "#b8860b",
    blue: "#3d6ec0",
    magenta: "#9050a0",
    cyan: "#2a8fa0",
    white: "#f5f5f7",
    brightBlack: "#555566",
    brightRed: "#e05566",
    brightGreen: "#3d9a5e",
    brightYellow: "#d9a61b",
    brightBlue: "#4d7ed0",
    brightMagenta: "#a060b0",
    brightCyan: "#3aafb0",
    brightWhite: "#ffffff",
  },
};

interface TerminalProps {
  terminalId: string;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onStatusChange?: (status: TerminalStatusPayload) => void;
}

/** 将任意 CSS 颜色值（rgb、oklch 等）转换为 #rrggbb hex */
function cssColorToHex(color: string): string {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.fillStyle = color;
  return ctx.fillStyle; // Canvas API 始终返回 #rrggbb
}

/** 从 <html> class 判断当前主题 */
function getCurrentTheme(): "dark" | "light" {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

/** 构建终端主题，背景色从 body 实际渲染色读取以精确匹配应用背景 */
function buildTerminalTheme(): ITheme {
  const mode = getCurrentTheme();
  const appBg = cssColorToHex(getComputedStyle(document.body).backgroundColor);
  return { ...TERMINAL_THEMES[mode], background: appBg, cursorAccent: appBg, black: appBg };
}

export const Terminal = memo(function Terminal({
  terminalId,
  onInput,
  onResize,
  onStatusChange,
}: TerminalProps) {
  useTheme(); // 保持 context 订阅以触发重渲染
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

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "IBM Plex Mono", "SF Mono", "Fira Code", monospace',
      theme: buildTerminalTheme(),
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

    // 强制同步所有 xterm 容器元素的背景色
    const syncBackground = (bg: string) => {
      if (!containerRef.current) return;
      containerRef.current.style.background = bg;
      containerRef.current
        .querySelectorAll<HTMLElement>(".xterm, .xterm-viewport")
        .forEach((el) => (el.style.backgroundColor = bg));
    };

    // 初始同步容器背景
    syncBackground(buildTerminalTheme().background!);

    // 监听 <html> class 变化来同步终端主题（不依赖 React effect 时序）
    // eslint-disable-next-line no-undef
    const themeObserver = new MutationObserver(() => {
      const theme = buildTerminalTheme();
      xterm.options.theme = theme;
      xterm.refresh(0, xterm.rows - 1);
      syncBackground(theme.background!);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // 聚焦终端
    xterm.focus();

    return () => {
      themeObserver.disconnect();
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
      role="region"
      aria-label="Terminal"
    />
  );
});
