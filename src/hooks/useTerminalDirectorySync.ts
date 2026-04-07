/**
 * Terminal Directory Sync Hook
 *
 * Monitors terminal output to detect shell idle state (prompt visible),
 * then auto-cd to the file browser's current directory.
 */

import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { EVENTS } from "@/types/events";
import { decodeTerminalData } from "@/lib/terminal";
import { detectShellPrompt, shellEscapePath } from "@/lib/terminal-utils";
import type { TerminalOutputPayload } from "@/types/terminal";

/** Max rolling buffer size (bytes of decoded text) */
const BUFFER_MAX = 2048;
/** Idle detection debounce — wait this long after last output to check for prompt */
const IDLE_DEBOUNCE_MS = 500;
/** Post-cd cooldown — suppress prompt detection while cd echo is printing */
const CD_COOLDOWN_MS = 800;

interface UseTerminalDirectorySyncOptions {
  terminalId: string | null;
  currentPath: string;
  terminalStatus: string;
  writeInput: (data: string) => void;
  enabled: boolean;
}

export function useTerminalDirectorySync(options: UseTerminalDirectorySyncOptions): void {
  const { terminalId, currentPath, terminalStatus, writeInput, enabled } = options;

  // Refs for mutable state accessed inside event handlers (prevents stale closures)
  const currentPathRef = useRef(currentPath);
  const terminalStatusRef = useRef(terminalStatus);
  const writeInputRef = useRef(writeInput);
  const enabledRef = useRef(enabled);

  // Internal state
  const outputBufferRef = useRef("");
  const lastSyncedPathRef = useRef<string | null>(null);
  const isIdleRef = useRef(false);
  const isCoolingDownRef = useRef(false);
  const pendingPathRef = useRef<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with props
  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    terminalStatusRef.current = terminalStatus;
  }, [terminalStatus]);

  useEffect(() => {
    writeInputRef.current = writeInput;
  }, [writeInput]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Attempt to sync terminal directory
  const attemptSyncRef = useRef(() => {
    if (
      !enabledRef.current ||
      !terminalStatusRef.current ||
      terminalStatusRef.current !== "connected" ||
      !isIdleRef.current ||
      isCoolingDownRef.current
    ) {
      return;
    }

    const targetPath = currentPathRef.current;
    if (targetPath === lastSyncedPathRef.current) {
      return;
    }

    writeInputRef.current("cd " + shellEscapePath(targetPath) + "\n");
    lastSyncedPathRef.current = targetPath;
    isIdleRef.current = false;

    // Enter cooldown to prevent cd echo from re-triggering sync
    isCoolingDownRef.current = true;
    pendingPathRef.current = null;

    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      isCoolingDownRef.current = false;
      // Check if a new path was queued during cooldown
      if (pendingPathRef.current && pendingPathRef.current !== lastSyncedPathRef.current) {
        currentPathRef.current = pendingPathRef.current;
        pendingPathRef.current = null;
        attemptSyncRef.current();
      }
    }, CD_COOLDOWN_MS);
  });

  // Listen to terminal output for idle/prompt detection
  useEffect(() => {
    if (!terminalId) return;

    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    const setup = async () => {
      const fn = await listen<TerminalOutputPayload>(EVENTS.TERMINAL_OUTPUT, (event) => {
        if (cancelled || event.payload.terminalId !== terminalId) return;

        // Decode and append to rolling buffer
        const data = decodeTerminalData(event.payload.data);
        const text = new TextDecoder().decode(data);
        const buffer = outputBufferRef.current + text;
        outputBufferRef.current =
          buffer.length > BUFFER_MAX ? buffer.slice(buffer.length - BUFFER_MAX) : buffer;

        // Reset idle state
        isIdleRef.current = false;
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

        // After quiet period, check for prompt
        if (!isCoolingDownRef.current) {
          idleTimerRef.current = setTimeout(() => {
            if (cancelled) return;
            if (detectShellPrompt(outputBufferRef.current)) {
              isIdleRef.current = true;
              attemptSyncRef.current();
            }
          }, IDLE_DEBOUNCE_MS);
        }
      });

      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    };

    setup();

    return () => {
      cancelled = true;
      unlisten?.();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [terminalId]);

  // When currentPath changes, attempt sync if already idle
  useEffect(() => {
    if (!terminalId || !enabled) return;

    if (isIdleRef.current && !isCoolingDownRef.current) {
      attemptSyncRef.current();
    } else if (isCoolingDownRef.current) {
      pendingPathRef.current = currentPath;
    }
  }, [currentPath, terminalId, enabled]);

  // Reset state when terminal changes
  useEffect(() => {
    outputBufferRef.current = "";
    lastSyncedPathRef.current = null;
    isIdleRef.current = false;
    isCoolingDownRef.current = false;
    pendingPathRef.current = null;
  }, [terminalId]);
}
