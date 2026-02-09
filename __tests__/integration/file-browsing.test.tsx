import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupInvokeRouter } from "../helpers/invoke-router";
import { renderWithProviders } from "../helpers/test-wrapper";
import type { FileEntry } from "@/types/file";
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

// Mock resizable panels - jsdom has no layout engine for these
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

const mockSessionInfo: SessionInfo = {
  sessionId: "session-1",
  profileId: "p1",
  homePath: "/home/user",
  fingerprint: "SHA256:test",
};

const mockFiles: FileEntry[] = [
  { name: "documents", path: "/home/user/documents", isDir: true, mtime: 1700000000 },
  { name: "projects", path: "/home/user/projects", isDir: true, mtime: 1700000100 },
  {
    name: "readme.md",
    path: "/home/user/readme.md",
    isDir: false,
    size: 2048,
    mtime: 1700000200,
    mode: 0o644,
  },
  {
    name: "config.json",
    path: "/home/user/config.json",
    isDir: false,
    size: 512,
    mtime: 1700000300,
    mode: 0o600,
  },
];

const documentsFiles: FileEntry[] = [
  { name: "report.pdf", path: "/home/user/documents/report.pdf", isDir: false, size: 1024000 },
  { name: "notes.txt", path: "/home/user/documents/notes.txt", isDir: false, size: 256 },
];

function setupDefaultRouter(overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  return setupInvokeRouter({
    session_info: () => mockSessionInfo,
    sftp_list_dir: (args: unknown) => {
      const { path } = args as { path: string };
      if (path === "/home/user/documents") return documentsFiles;
      return mockFiles;
    },
    settings_get: () => DEFAULT_SETTINGS,
    ...overrides,
  });
}

describe("File browsing integration", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  it("renders file browser with file list from session", async () => {
    setupDefaultRouter();

    renderWithProviders(["/files/session-1"]);

    // Should show file browser title in header
    await waitFor(() => {
      expect(screen.getByText("File browser")).toBeInTheDocument();
    });

    // Wait for files to load
    await waitFor(
      () => {
        expect(screen.getByText("documents")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText("projects")).toBeInTheDocument();
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    expect(screen.getByText("config.json")).toBeInTheDocument();

    // File count should show (4 items)
    expect(screen.getByText("4 items")).toBeInTheDocument();
  });

  it("navigates into directory on double-click", async () => {
    setupDefaultRouter();

    renderWithProviders(["/files/session-1"]);

    // Wait for initial file list
    await waitFor(() => {
      expect(screen.getByText("documents")).toBeInTheDocument();
    });

    // Double-click on "documents" directory
    const documentsRow = screen.getByText("documents");
    await user.dblClick(documentsRow);

    // Should show files from documents directory
    await waitFor(() => {
      expect(screen.getByText("report.pdf")).toBeInTheDocument();
    });

    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("redirects to connections when session is invalid", async () => {
    setupInvokeRouter({
      session_info: () => null,
      settings_get: () => DEFAULT_SETTINGS,
    });

    renderWithProviders(["/files/nonexistent-session"]);

    // Should redirect to connections page
    await waitFor(() => {
      expect(screen.getByText("Connections")).toBeInTheDocument();
    });
  });

  it("shows loading state while session is initializing", async () => {
    setupInvokeRouter({
      session_info: () => new Promise(() => {}), // never resolves
      settings_get: () => DEFAULT_SETTINGS,
    });

    renderWithProviders(["/files/session-1"]);

    // Should show loading indicator
    expect(screen.getByText("Initializing SFTP...")).toBeInTheDocument();
  });
});
