import { vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

type InvokeHandler = (...args: unknown[]) => unknown;

/**
 * Set up an invoke router that dispatches invoke() calls to named handlers.
 * Unhandled commands log a warning and return null (to avoid breaking integration tests
 * where components may call many different invoke commands).
 * Use strict mode to throw on unhandled commands instead.
 */
export function setupInvokeRouter(
  handlers: Record<string, InvokeHandler>,
  options?: { strict?: boolean }
) {
  const { strict = false } = options ?? {};
  const mockedInvoke = vi.mocked(invoke);
  mockedInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    const handler = handlers[cmd];
    if (!handler) {
      if (strict) {
        throw new Error(`Unhandled invoke command: ${cmd}. Add a handler for this command.`);
      }
      console.warn(`[invoke-router] Unhandled command: ${cmd}`);
      return null;
    }
    return handler(args);
  });
  return mockedInvoke;
}
