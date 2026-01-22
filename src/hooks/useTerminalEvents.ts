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

  // Use refs to access latest values in event handlers without re-subscribing
  const terminalIdRef = useRef(terminalId);
  const callbacksRef = useRef({ onOutput, onStatusChange });
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    terminalIdRef.current = terminalId;
  }, [terminalId]);

  useEffect(() => {
    callbacksRef.current = { onOutput, onStatusChange };
  }, [onOutput, onStatusChange]);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      const unlistenOutput = await listen<TerminalOutputPayload>(
        EVENTS.TERMINAL_OUTPUT,
        (event) => {
          const currentId = terminalIdRef.current;
          if (currentId && event.payload.terminalId === currentId) {
            const data = decodeTerminalData(event.payload.data);
            callbacksRef.current.onOutput(data);
          }
        }
      );

      if (cancelled) {
        unlistenOutput();
        return;
      }
      unlistenersRef.current.push(unlistenOutput);

      const unlistenStatus = await listen<TerminalStatusPayload>(
        EVENTS.TERMINAL_STATUS,
        (event) => {
          const currentId = terminalIdRef.current;
          if (currentId && event.payload.terminalId === currentId) {
            callbacksRef.current.onStatusChange?.(event.payload);
          }
        }
      );

      if (cancelled) {
        unlistenStatus();
        return;
      }
      unlistenersRef.current.push(unlistenStatus);
    };

    setup();

    return () => {
      cancelled = true;
      unlistenersRef.current.forEach((unlisten) => unlisten());
      unlistenersRef.current = [];
    };
  }, []);
}
