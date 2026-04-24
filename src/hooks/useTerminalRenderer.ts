/**
 * 终端渲染器 Hook
 * 管理 xterm.js 实例、WebGL/Canvas/DOM 渲染器、主题、字体大小、scrollback
 */

import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import "@xterm/xterm/css/xterm.css";

import { useSettings } from "@/hooks/useSettings";
import { useTheme } from "@/lib/theme";
import {
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_DEFAULT,
} from "@/types/settings";

/** 终端主题颜色映射 — 与 index.css 中的 --terminal-* 变量保持同步 */
const TERMINAL_THEMES: Record<"dark" | "light", ITheme> = {
  dark: {
    background: "#111b20",
    foreground: "#d7e1e4",
    cursor: "#33c7d2",
    cursorAccent: "#111b20",
    selectionBackground: "rgba(51, 199, 210, 0.26)",
    black: "#111b20",
    red: "#e05a6a",
    green: "#55bd8d",
    yellow: "#d7aa48",
    blue: "#4ab3f4",
    magenta: "#c48adb",
    cyan: "#33c7d2",
    white: "#d7e1e4",
    brightBlack: "#52666d",
    brightRed: "#f06b7a",
    brightGreen: "#66cf9e",
    brightYellow: "#e7bd59",
    brightBlue: "#62c5ff",
    brightMagenta: "#d79bea",
    brightCyan: "#55d9e2",
    brightWhite: "#ffffff",
  },
  light: {
    background: "#f4f8fa",
    foreground: "#223036",
    cursor: "#008b98",
    cursorAccent: "#f4f8fa",
    selectionBackground: "rgba(0, 139, 152, 0.18)",
    black: "#223036",
    red: "#c74458",
    green: "#2e7d59",
    yellow: "#ae7f00",
    blue: "#1f78b4",
    magenta: "#8b529c",
    cyan: "#008b98",
    white: "#f4f8fa",
    brightBlack: "#53656c",
    brightRed: "#de596b",
    brightGreen: "#399568",
    brightYellow: "#c89512",
    brightBlue: "#2e8fd0",
    brightMagenta: "#9f64b0",
    brightCyan: "#00a6b5",
    brightWhite: "#ffffff",
  },
};

/** 将任意 CSS 颜色值（rgb、oklch 等）转换为 #rrggbb hex */
const _colorCtx = document.createElement("canvas").getContext("2d")!;
function cssColorToHex(color: string): string {
  _colorCtx.fillStyle = color;
  return _colorCtx.fillStyle;
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

interface UseTerminalRendererOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}

interface UseTerminalRendererReturn {
  /** 写入数据到终端 */
  write: (data: Uint8Array) => void;
  /** 清空终端内容 */
  clear: () => void;
  /** 聚焦终端 */
  focus: () => void;
}

export function useTerminalRenderer({
  containerRef,
  onInput,
  onResize,
}: UseTerminalRendererOptions): UseTerminalRendererReturn {
  useTheme(); // 保持 context 订阅以触发重渲染

  const { settings, updateSettings } = useSettings();

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

  // 初始化 XTerm + 渲染器 addon
  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: settings.terminalFontSize,
      fontFamily: '"JetBrains Mono", "IBM Plex Mono", "SF Mono", "Fira Code", monospace',
      theme: buildTerminalTheme(),
      allowProposedApi: true,
      scrollback: settings.terminalScrollbackLines,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(containerRef.current);

    // WebGL → Canvas → DOM fallback chain (must load AFTER xterm.open)
    let rendererAddon: WebglAddon | CanvasAddon | null = null;
    let disposed = false;
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        if (disposed) return; // guard: xterm may already be disposed after unmount
        console.warn("[terminal] WebGL context lost, falling back to Canvas");
        webgl.dispose();
        try {
          const canvas = new CanvasAddon();
          xterm.loadAddon(canvas);
          rendererAddon = canvas;
        } catch {
          console.warn("[terminal] Canvas addon failed, keeping DOM renderer");
          rendererAddon = null;
        }
      });
      xterm.loadAddon(webgl);
      rendererAddon = webgl;
    } catch {
      console.warn("[terminal] WebGL addon failed, trying Canvas");
      try {
        const canvas = new CanvasAddon();
        xterm.loadAddon(canvas);
        rendererAddon = canvas;
      } catch {
        console.warn("[terminal] Canvas addon failed, keeping DOM renderer");
      }
    }

    // 延迟 fit 确保容器尺寸已确定
    requestAnimationFrame(() => {
      fitAddon.fit();
      onResizeRef.current(xterm.cols, xterm.rows);
    });

    // 监听输入
    const inputDisposable = xterm.onData((data) => {
      onInputRef.current(data);
    });

    // 监听尺寸变化
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

    // ResizeObserver 监听容器尺寸变化
    const resizeObserver = new ResizeObserver(() => {
      debouncedFit();
    });
    resizeObserver.observe(containerRef.current);
    window.addEventListener("resize", debouncedFit);

    // 强制同步所有 xterm 容器元素的背景色
    const syncBackground = (bg: string) => {
      if (!containerRef.current) return;
      containerRef.current.style.background = bg;
      containerRef.current
        .querySelectorAll<HTMLElement>(".xterm, .xterm-viewport")
        .forEach((el) => (el.style.backgroundColor = bg));
    };

    syncBackground(buildTerminalTheme().background!);

    // 监听主题切换
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

    xterm.focus();

    return () => {
      disposed = true;
      themeObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", debouncedFit);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      inputDisposable.dispose();
      resizeDisposable.dispose();
      rendererAddon?.dispose();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 响应 Settings 变化：字体大小和 scrollback
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;

    if (xterm.options.fontSize !== settings.terminalFontSize) {
      xterm.options.fontSize = settings.terminalFontSize;
      fitAddonRef.current?.fit();
    }
    if (xterm.options.scrollback !== settings.terminalScrollbackLines) {
      xterm.options.scrollback = settings.terminalScrollbackLines;
    }
  }, [settings.terminalFontSize, settings.terminalScrollbackLines]);

  // Cmd+/Cmd-/Cmd+0 字体大小快捷键（仅在终端容器聚焦时生效）
  const fontSizeRef = useRef(settings.terminalFontSize);
  useEffect(() => {
    fontSizeRef.current = settings.terminalFontSize;
  }, [settings.terminalFontSize]);

  // 使用 ref 存储 updateSettings，避免每次渲染重新注册 keydown listener
  const updateSettingsRef = useRef(updateSettings);
  useEffect(() => {
    updateSettingsRef.current = updateSettings;
  }, [updateSettings]);

  // Debounce 持久化，避免快速按键 spam DB writes
  const persistTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      let newSize: number | null = null;

      if (e.key === "=" || e.key === "+") {
        newSize = Math.min(fontSizeRef.current + 1, TERMINAL_FONT_SIZE_MAX);
      } else if (e.key === "-") {
        newSize = Math.max(fontSizeRef.current - 1, TERMINAL_FONT_SIZE_MIN);
      } else if (e.key === "0") {
        newSize = TERMINAL_FONT_SIZE_DEFAULT;
      }

      if (newSize !== null && newSize !== fontSizeRef.current) {
        e.preventDefault();
        e.stopPropagation();
        fontSizeRef.current = newSize;
        // Apply immediately for instant feedback
        const xterm = xtermRef.current;
        if (xterm) {
          xterm.options.fontSize = newSize;
          fitAddonRef.current?.fit();
        }
        // Debounced persist: only write to DB after 300ms of no more keypresses
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        const size = newSize;
        persistTimerRef.current = window.setTimeout(() => {
          updateSettingsRef.current({ terminalFontSize: size });
        }, 300);
      } else if (newSize !== null) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [containerRef]); // stable deps only — updateSettings via ref

  const write = useCallback((data: Uint8Array) => {
    xtermRef.current?.write(data);
  }, []);

  const clear = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  const focus = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  return { write, clear, focus };
}
