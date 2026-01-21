/**
 * 终端事件监听 Hook
 * 监听后端终端输出和状态事件
 */

import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { EVENTS } from "@/types/events";
import type { TerminalOutputPayload, TerminalStatusPayload } from "@/types/terminal";
import { decodeTerminalData } from "@/lib/terminal";

interface UseTerminalEventsOptions {
  terminalId: string | null;
  onOutput: (data: Uint8Array) => void;
  onStatusChange?: (status: TerminalStatusPayload) => void;
}

export function useTerminalEvents(options: UseTerminalEventsOptions): void {
  const { terminalId, onOutput, onStatusChange } = options;

  // 用 ref 保存回调，避免 useEffect 重复执行
  const callbacksRef = useRef({ onOutput, onStatusChange });
  useEffect(() => {
    callbacksRef.current = { onOutput, onStatusChange };
  }, [onOutput, onStatusChange]);

  useEffect(() => {
    if (!terminalId) return;

    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      const unlistenOutput = await listen<TerminalOutputPayload>(
        EVENTS.TERMINAL_OUTPUT,
        (event) => {
          if (event.payload.terminalId === terminalId) {
            const data = decodeTerminalData(event.payload.data);
            callbacksRef.current.onOutput(data);
          }
        }
      );
      unlisteners.push(unlistenOutput);

      const unlistenStatus = await listen<TerminalStatusPayload>(
        EVENTS.TERMINAL_STATUS,
        (event) => {
          if (event.payload.terminalId === terminalId) {
            callbacksRef.current.onStatusChange?.(event.payload);
          }
        }
      );
      unlisteners.push(unlistenStatus);
    };

    setup();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [terminalId]);
}
