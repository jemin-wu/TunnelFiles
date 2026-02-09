import React from "react";
import { vi } from "vitest";
import { render, type RenderOptions } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MainLayout } from "@/layouts/MainLayout";
import { ConnectionsPage } from "@/pages/ConnectionsPage";
import { FileManagerPage } from "@/pages/FileManagerPage";
import { SettingsPage } from "@/pages/SettingsPage";

// --- jsdom polyfills ---

// ResizeObserver (used by radix-ui ScrollArea)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// localStorage (jsdom sometimes lacks full implementation)
if (typeof globalThis.localStorage === "undefined" || !globalThis.localStorage?.getItem) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    },
    writable: true,
  });
}

// --- Module mocks ---

// Mock theme module to avoid theme-related side effects in tests
vi.mock("@/lib/theme", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: "dark" as const, setTheme: vi.fn(), resolvedTheme: "dark" as const }),
}));

// Mock Tauri webview API (used by useDropUpload via DropZone)
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn(() => Promise.resolve(() => {})),
  })),
}));

// Mock Tauri window API
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    label: "main",
    listen: vi.fn(() => Promise.resolve(() => {})),
  })),
}));

// Mock terminal component to avoid xterm dependency
vi.mock("@/components/terminal", () => ({
  Terminal: () => <div data-testid="terminal-mock">Terminal</div>,
}));

/**
 * Create app routes matching src/router.tsx but using memory router
 */
function createAppRoutes() {
  return [
    {
      path: "/",
      element: <MainLayout />,
      children: [
        { index: true, element: <Navigate to="/connections" replace /> },
        { path: "connections", element: <ConnectionsPage /> },
        { path: "files/:sessionId", element: <FileManagerPage /> },
        { path: "settings", element: <SettingsPage /> },
      ],
    },
  ];
}

/**
 * Create a memory router with optional initial entries
 */
export function createTestRouter(initialEntries: string[] = ["/connections"]) {
  return createMemoryRouter(createAppRoutes(), { initialEntries });
}

/**
 * Create a QueryClient configured for testing
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Render with full app context (router + query client)
 */
export function renderWithProviders(
  initialEntries: string[] = ["/connections"],
  options?: Omit<RenderOptions, "wrapper">
) {
  const queryClient = createTestQueryClient();
  const router = createTestRouter(initialEntries);

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
    options
  );

  return { ...result, queryClient, router };
}
