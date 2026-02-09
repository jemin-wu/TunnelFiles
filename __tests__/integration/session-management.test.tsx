import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { setupInvokeRouter } from "../helpers/invoke-router";
import { renderWithProviders } from "../helpers/test-wrapper";
import type { SessionInfo } from "@/types/events";
import { DEFAULT_SETTINGS } from "@/types/settings";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    dismiss: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock terminal to avoid xterm deps
vi.mock("@/components/terminal", () => ({
  Terminal: () => null,
}));

// Mock resizable panels - jsdom has no layout engine
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div />,
}));

// Mock react-virtual - jsdom cannot measure element sizes for virtualization
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: i,
        start: i * 32,
        size: 32,
        end: (i + 1) * 32,
      })),
    getTotalSize: () => count * 32,
    scrollToIndex: vi.fn(),
    measureElement: vi.fn(),
  }),
}));

const validSession: SessionInfo = {
  sessionId: "session-valid",
  profileId: "p1",
  homePath: "/home/user",
  fingerprint: "SHA256:test",
};

describe("Session management integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /connections when session_info returns null", async () => {
    setupInvokeRouter({
      session_info: () => null,
      settings_get: () => DEFAULT_SETTINGS,
      profile_list: () => [],
    });

    renderWithProviders(["/files/invalid-session-id"]);

    // Should redirect to connections page
    await waitFor(() => {
      expect(screen.getByText("Connections")).toBeInTheDocument();
    });
  });

  it("redirects to /connections when session_info throws", async () => {
    setupInvokeRouter({
      session_info: () => {
        throw new Error("Session not found");
      },
      settings_get: () => DEFAULT_SETTINGS,
      profile_list: () => [],
    });

    renderWithProviders(["/files/bad-session"]);

    // Should redirect to connections
    await waitFor(() => {
      expect(screen.getByText("Connections")).toBeInTheDocument();
    });
  });

  it("shows file browser for valid session", async () => {
    setupInvokeRouter({
      session_info: () => validSession,
      sftp_list_dir: () => [
        { name: "test.txt", path: "/home/user/test.txt", isDir: false, size: 100 },
      ],
      settings_get: () => DEFAULT_SETTINGS,
    });

    renderWithProviders(["/files/session-valid"]);

    // Should show file browser
    await waitFor(() => {
      expect(screen.getByText("File browser")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("test.txt")).toBeInTheDocument();
    });
  });

  it("navigates back to connections via back button", async () => {
    setupInvokeRouter({
      session_info: () => validSession,
      sftp_list_dir: () => [],
      settings_get: () => DEFAULT_SETTINGS,
      profile_list: () => [],
    });

    const { user } = { user: (await import("@testing-library/user-event")).default.setup() };

    renderWithProviders(["/files/session-valid"]);

    await waitFor(() => {
      expect(screen.getByText("File browser")).toBeInTheDocument();
    });

    // Click back button in header
    const backBtn = screen.getByRole("button", { name: /back/i });
    await user.click(backBtn);

    // Should be on connections page
    await waitFor(() => {
      expect(screen.getByText("Connections")).toBeInTheDocument();
    });
  });
});
