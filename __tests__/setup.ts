import "@testing-library/jest-dom/vitest";
import { vi, beforeAll, afterEach } from "vitest";

// jsdom 不实现 ResizeObserver —— use-stick-to-bottom / Radix ScrollArea 等依赖它
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Mock Tauri APIs
beforeAll(() => {
  vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(),
  }));

  vi.mock("@tauri-apps/api/event", () => ({
    listen: vi.fn(() => Promise.resolve(() => {})),
    emit: vi.fn(),
  }));

  vi.mock("@tauri-apps/api/webview", () => ({
    getCurrentWebview: vi.fn(() => ({
      onDragDropEvent: vi.fn(() => Promise.resolve(() => {})),
    })),
  }));

  vi.mock("@tauri-apps/api/window", () => ({
    getCurrentWindow: vi.fn(() => ({
      listen: vi.fn(() => Promise.resolve(() => {})),
    })),
  }));

  vi.mock("@tauri-apps/plugin-dialog", () => ({
    open: vi.fn(),
    save: vi.fn(),
  }));

  vi.mock("@tauri-apps/plugin-opener", () => ({
    openPath: vi.fn(),
  }));

  vi.mock("@tauri-apps/plugin-fs", () => ({
    stat: vi.fn(),
    readDir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});
