import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupInvokeRouter } from "../helpers/invoke-router";
import { renderWithProviders } from "../helpers/test-wrapper";
import type { Profile } from "@/types/profile";
import type { SessionConnectResult } from "@/types/events";
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

const mockProfiles: Profile[] = [
  {
    id: "p1",
    name: "Production Server",
    host: "10.0.0.1",
    port: 22,
    username: "deploy",
    authType: "password",
    passwordRef: "keychain-ref-1",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: "p2",
    name: "Dev Server",
    host: "192.168.1.50",
    port: 2222,
    username: "dev",
    authType: "password",
    createdAt: 1700000100000,
    updatedAt: 1700000100000,
  },
];

const connectedResult: SessionConnectResult = {
  sessionId: "session-abc",
  homePath: "/home/deploy",
  needHostKeyConfirm: false,
  serverFingerprint: null,
};

const hostKeyResult: SessionConnectResult = {
  sessionId: null,
  homePath: null,
  needHostKeyConfirm: true,
  serverFingerprint: "SHA256:xyzHostFingerprint123",
};

describe("Connection flow integration", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  it("renders connections page with profiles list", async () => {
    setupInvokeRouter({
      profile_list: () => mockProfiles,
      settings_get: () => DEFAULT_SETTINGS,
    });

    renderWithProviders(["/connections"]);

    // Wait for profiles to load
    await waitFor(() => {
      expect(screen.getByText("Production Server")).toBeInTheDocument();
    });

    expect(screen.getByText("Dev Server")).toBeInTheDocument();
    expect(screen.getByText("2 connections")).toBeInTheDocument();
  });

  it("shows empty state when no profiles exist", async () => {
    setupInvokeRouter({
      profile_list: () => [],
      settings_get: () => DEFAULT_SETTINGS,
    });

    renderWithProviders(["/connections"]);

    await waitFor(() => {
      expect(screen.getByText("No connections found")).toBeInTheDocument();
    });

    expect(screen.getByText("No connections")).toBeInTheDocument();
  });

  it("connects to server and navigates to file browser", async () => {
    setupInvokeRouter({
      profile_list: () => mockProfiles,
      settings_get: () => DEFAULT_SETTINGS,
      session_connect: () => connectedResult,
      session_info: () => ({
        sessionId: "session-abc",
        profileId: "p1",
        homePath: "/home/deploy",
        fingerprint: "SHA256:abc",
      }),
      sftp_list_dir: () => [],
    });

    renderWithProviders(["/connections"]);

    // Wait for profiles
    await waitFor(() => {
      expect(screen.getByText("Production Server")).toBeInTheDocument();
    });

    // Click the connect button for "Production Server"
    const connectBtn = screen.getByRole("button", { name: "Connect to Production Server" });
    await user.click(connectBtn);

    // Should navigate to /files/session-abc which shows file browser
    await waitFor(() => {
      expect(screen.getByText("File browser")).toBeInTheDocument();
    });
  });

  it("shows password dialog for profile without stored password", async () => {
    setupInvokeRouter({
      profile_list: () => mockProfiles,
      settings_get: () => DEFAULT_SETTINGS,
    });

    renderWithProviders(["/connections"]);

    await waitFor(() => {
      expect(screen.getByText("Dev Server")).toBeInTheDocument();
    });

    // Click connect on "Dev Server" (no passwordRef => needs password)
    const connectBtn = screen.getByRole("button", { name: "Connect to Dev Server" });
    await user.click(connectBtn);

    // Password dialog should appear
    await waitFor(() => {
      expect(screen.getByText("Password required")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("Enter SSH password")).toBeInTheDocument();
  });

  it("submits password and connects successfully", async () => {
    setupInvokeRouter({
      profile_list: () => mockProfiles,
      settings_get: () => DEFAULT_SETTINGS,
      session_connect: () => connectedResult,
      session_info: () => ({
        sessionId: "session-abc",
        profileId: "p2",
        homePath: "/home/dev",
        fingerprint: "SHA256:def",
      }),
      sftp_list_dir: () => [],
    });

    renderWithProviders(["/connections"]);

    await waitFor(() => {
      expect(screen.getByText("Dev Server")).toBeInTheDocument();
    });

    // Click connect on Dev Server (no passwordRef)
    const connectBtn = screen.getByRole("button", { name: "Connect to Dev Server" });
    await user.click(connectBtn);

    // Wait for password dialog
    await waitFor(() => {
      expect(screen.getByText("Password required")).toBeInTheDocument();
    });

    // Type password and submit
    const passwordInput = screen.getByPlaceholderText("Enter SSH password");
    await user.type(passwordInput, "mysecretpassword");

    const submitBtn = screen.getByRole("button", { name: "Connect" });
    await user.click(submitBtn);

    // Should navigate to file browser
    await waitFor(() => {
      expect(screen.getByText("File browser")).toBeInTheDocument();
    });
  });

  it("shows host key dialog and connects after trust", async () => {
    let connectCallCount = 0;
    setupInvokeRouter({
      profile_list: () => mockProfiles,
      settings_get: () => DEFAULT_SETTINGS,
      session_connect: () => {
        connectCallCount++;
        return hostKeyResult;
      },
      security_trust_hostkey: () => undefined,
      session_connect_after_trust: () => connectedResult,
      session_info: () => ({
        sessionId: "session-abc",
        profileId: "p1",
        homePath: "/home/deploy",
        fingerprint: "SHA256:abc",
      }),
      sftp_list_dir: () => [],
    });

    renderWithProviders(["/connections"]);

    await waitFor(() => {
      expect(screen.getByText("Production Server")).toBeInTheDocument();
    });

    // Connect
    const connectBtn = screen.getByRole("button", { name: "Connect to Production Server" });
    await user.click(connectBtn);

    // Host key dialog should appear
    await waitFor(() => {
      expect(screen.getByText("Verify host key")).toBeInTheDocument();
    });

    expect(screen.getByText("SHA256:xyzHostFingerprint123")).toBeInTheDocument();

    // Trust the key
    const trustBtn = screen.getByRole("button", { name: "Trust" });
    await user.click(trustBtn);

    // Should navigate to file browser
    await waitFor(() => {
      expect(screen.getByText("File browser")).toBeInTheDocument();
    });
  });

  it("shows error toast on connection failure", async () => {
    const { toast } = await import("sonner");

    setupInvokeRouter({
      profile_list: () => mockProfiles,
      settings_get: () => DEFAULT_SETTINGS,
      session_connect: () => {
        throw { code: "CONNECTION_ERROR", message: "Connection timed out" };
      },
    });

    renderWithProviders(["/connections"]);

    await waitFor(() => {
      expect(screen.getByText("Production Server")).toBeInTheDocument();
    });

    const connectBtn = screen.getByRole("button", { name: "Connect to Production Server" });
    await user.click(connectBtn);

    // Error toast should be shown
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
