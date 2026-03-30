import { vi } from "vitest";

/**
 * Mock xterm.js Terminal instance
 *
 * Provides a mock that mirrors the xterm.js Terminal API surface
 * used by useTerminalRenderer (open, write, dispose, onData, onResize, etc.)
 */
export function createMockTerminal() {
  return {
    open: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onResize: vi.fn(() => ({ dispose: vi.fn() })),
    onTitleChange: vi.fn(() => ({ dispose: vi.fn() })),
    resize: vi.fn(),
    focus: vi.fn(),
    clear: vi.fn(),
    refresh: vi.fn(),
    cols: 80,
    rows: 24,
    loadAddon: vi.fn(),
    options: {} as Record<string, unknown>,
  };
}

/**
 * Mock FitAddon
 */
export function createMockFitAddon() {
  return {
    fit: vi.fn(),
    proposeDimensions: vi.fn(() => ({ cols: 80, rows: 24 })),
    dispose: vi.fn(),
    activate: vi.fn(),
  };
}

/**
 * Mock WebglAddon
 */
export function createMockWebglAddon() {
  return {
    onContextLoss: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
    activate: vi.fn(),
  };
}

/**
 * Mock CanvasAddon
 */
export function createMockCanvasAddon() {
  return {
    dispose: vi.fn(),
    activate: vi.fn(),
  };
}
