import { useState, useCallback, useRef, useEffect } from "react";

import {
  openTerminal,
  closeTerminal,
  writeTerminalInput,
  resizeTerminal,
  encodeTerminalData,
} from "@/lib/terminal";
import { showErrorToast } from "@/lib/error";
import type { TerminalInfo, TerminalStatus } from "@/types/terminal";

interface UseTerminalOptions {
  sessionId: string;
  cols?: number;
  rows?: number;
}

interface UseTerminalReturn {
  terminalInfo: TerminalInfo | null;
  status: TerminalStatus;
  isOpening: boolean;
  error: unknown;
  open: () => Promise<void>;
  close: () => Promise<void>;
  writeInput: (data: string) => void;
  resize: (cols: number, rows: number) => Promise<void>;
  setStatus: (status: TerminalStatus) => void;
}

export function useTerminal(options: UseTerminalOptions): UseTerminalReturn {
  const { sessionId, cols, rows } = options;
  const [terminalInfo, setTerminalInfo] = useState<TerminalInfo | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("disconnected");
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Refs for cleanup and preventing concurrent opens
  const terminalInfoRef = useRef<TerminalInfo | null>(null);
  const isOpeningRef = useRef(false);
  const hasShownWriteErrorRef = useRef(false);

  useEffect(() => {
    terminalInfoRef.current = terminalInfo;
  }, [terminalInfo]);

  const open = useCallback(async () => {
    if (terminalInfoRef.current || isOpeningRef.current) {
      return;
    }
    isOpeningRef.current = true;
    hasShownWriteErrorRef.current = false; // 重置错误状态
    setIsOpening(true);
    setError(null);

    try {
      const info = await openTerminal({ sessionId, cols, rows });
      setTerminalInfo(info);
      setStatus("connected");
    } catch (err) {
      setError(err);
      setStatus("error");
      showErrorToast(err);
    } finally {
      isOpeningRef.current = false;
      setIsOpening(false);
    }
  }, [sessionId, cols, rows]);

  const close = useCallback(async () => {
    if (!terminalInfo) return;

    try {
      await closeTerminal(terminalInfo.terminalId);
      setTerminalInfo(null);
      setStatus("disconnected");
    } catch (err) {
      showErrorToast(err);
    }
  }, [terminalInfo]);

  const writeInput = useCallback(
    (data: string) => {
      if (!terminalInfo) return;

      const base64 = encodeTerminalData(data);
      // Fire-and-forget 模式：不等待响应，依赖 PTY 回显
      writeTerminalInput({
        terminalId: terminalInfo.terminalId,
        data: base64,
      }).catch((err) => {
        // 仅在首次失败时显示 toast，避免快速输入时弹出多个错误
        if (!hasShownWriteErrorRef.current) {
          hasShownWriteErrorRef.current = true;
          setStatus("error");
          showErrorToast(err);
        }
      });
    },
    [terminalInfo]
  );

  const resize = useCallback(
    async (newCols: number, newRows: number) => {
      if (!terminalInfo) return;

      try {
        await resizeTerminal({
          terminalId: terminalInfo.terminalId,
          cols: newCols,
          rows: newRows,
        });
      } catch (err) {
        console.warn("Failed to resize terminal:", err);
      }
    },
    [terminalInfo]
  );

  // 当 sessionId 变化或组件卸载时关闭终端，防止资源泄漏
  useEffect(() => {
    return () => {
      const info = terminalInfoRef.current;
      if (info) {
        closeTerminal(info.terminalId).catch((err) => {
          // 仅记录错误，不阻塞清理流程
          console.warn("[useTerminal] cleanup close error:", err);
        });
        // 重置状态以便下次打开
        terminalInfoRef.current = null;
      }
    };
  }, [sessionId]);

  return {
    terminalInfo,
    status,
    isOpening,
    error,
    open,
    close,
    writeInput,
    resize,
    setStatus,
  };
}
