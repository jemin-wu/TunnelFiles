/**
 * 终端管理 Hook
 * 处理终端的打开、关闭、输入、尺寸调整
 */

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
  writeInput: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  setStatus: (status: TerminalStatus) => void;
}

export function useTerminal(options: UseTerminalOptions): UseTerminalReturn {
  const { sessionId, cols, rows } = options;
  const [terminalInfo, setTerminalInfo] = useState<TerminalInfo | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("disconnected");
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // 用 ref 保存 terminalInfo，用于 cleanup
  const terminalInfoRef = useRef<TerminalInfo | null>(null);
  useEffect(() => {
    terminalInfoRef.current = terminalInfo;
  }, [terminalInfo]);

  const open = useCallback(async () => {
    if (terminalInfo || isOpening) {
      return; // 已打开或正在打开
    }

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
      setIsOpening(false);
    }
  }, [sessionId, cols, rows, terminalInfo, isOpening]);

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
    async (data: string) => {
      if (!terminalInfo) return;

      try {
        const base64 = encodeTerminalData(data);
        await writeTerminalInput({
          terminalId: terminalInfo.terminalId,
          data: base64,
        });
      } catch (err) {
        showErrorToast(err);
      }
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
        // 尺寸调整失败不中断使用，仅记录
        console.warn("Failed to resize terminal:", err);
      }
    },
    [terminalInfo]
  );

  // 组件卸载时关闭终端
  useEffect(() => {
    return () => {
      const info = terminalInfoRef.current;
      if (info) {
        closeTerminal(info.terminalId).catch(console.error);
      }
    };
  }, []);

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
