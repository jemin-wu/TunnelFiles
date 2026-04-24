import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { setupInvokeRouter } from "../helpers/invoke-router";
import { renderWithProviders } from "../helpers/test-wrapper";
import type { SessionInfo } from "@/types/events";
import type { Settings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";

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

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div />,
}));

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

const mockSessionInfo: SessionInfo = {
  sessionId: "session-disabled",
  profileId: "p-disabled",
  homePath: "/home/user",
  fingerprint: "SHA256:test",
};

function settingsWithAiDisabled(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    aiEnabled: false,
  };
}

describe("SettingsPage AI-disabled plumbing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInvokeRouter({
      session_info: () => mockSessionInfo,
      sftp_list_dir: () => [],
      transfer_history_list: () => [],
      settings_get: () => settingsWithAiDisabled(),
    });
  });

  it("does not mount the chat launcher in FileManagerPage when AI is disabled", async () => {
    renderWithProviders(["/files/session-disabled"]);

    await waitFor(() => {
      expect(screen.getByText("File browser")).toBeInTheDocument();
    });

    expect(screen.queryByLabelText("Open AI chat")).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot='chat-launcher-trigger']")).toBeNull();
    expect(screen.queryByText(/Ask the local assistant/i)).not.toBeInTheDocument();
  });
});
