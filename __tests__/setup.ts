import "@testing-library/jest-dom/vitest";
import { vi, beforeAll, afterEach } from "vitest";

// Mock Tauri APIs
beforeAll(() => {
  vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(),
  }));

  vi.mock("@tauri-apps/api/event", () => ({
    listen: vi.fn(() => Promise.resolve(() => {})),
    emit: vi.fn(),
  }));

  vi.mock("@tauri-apps/plugin-dialog", () => ({
    open: vi.fn(),
    save: vi.fn(),
  }));

  vi.mock("@tauri-apps/plugin-opener", () => ({
    openPath: vi.fn(),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});
