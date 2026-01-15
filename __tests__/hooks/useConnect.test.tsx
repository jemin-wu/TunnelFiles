import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConnect } from "@/hooks/useConnect";
import * as sessionLib from "@/lib/session";
import * as errorLib from "@/lib/error";
import type { Profile } from "@/types/profile";
import type { SessionConnectResult } from "@/types/events";

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// Mock session lib
vi.mock("@/lib/session", () => ({
  connect: vi.fn(),
  trustHostKey: vi.fn(),
  reconnectWithTrustedKey: vi.fn(),
}));

// Mock error lib
vi.mock("@/lib/error", () => ({
  showErrorToast: vi.fn(),
}));

const mockProfile: Profile = {
  id: "profile-1",
  name: "Test Server",
  host: "192.168.1.100",
  port: 22,
  username: "testuser",
  authType: "password",
  passwordRef: "ref-123",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockProfileNoPassword: Profile = {
  ...mockProfile,
  id: "profile-2",
  passwordRef: undefined,
};

// Helper to create complete SessionConnectResult
const createConnectResult = (
  overrides: Partial<SessionConnectResult> = {}
): SessionConnectResult => ({
  sessionId: null,
  homePath: null,
  needHostKeyConfirm: false,
  serverFingerprint: null,
  ...overrides,
});

describe("useConnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const { result } = renderHook(() => useConnect());

      expect(result.current.isConnecting).toBe(false);
      expect(result.current.connectingProfileId).toBeNull();
      expect(result.current.needPassword).toBe(false);
      expect(result.current.needPassphrase).toBe(false);
      expect(result.current.hostKeyPayload).toBeNull();
      expect(result.current.currentProfile).toBeNull();
    });
  });

  describe("startConnect", () => {
    it("should navigate on successful connection", async () => {
      const connectResult = createConnectResult({ sessionId: "session-123" });
      vi.mocked(sessionLib.connect).mockResolvedValueOnce(connectResult);

      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.startConnect(mockProfile);
      });

      expect(sessionLib.connect).toHaveBeenCalledWith({
        profileId: "profile-1",
      });
      expect(mockNavigate).toHaveBeenCalledWith("/files/session-123");
    });

    it("should set needPassword when password not stored", async () => {
      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.startConnect(mockProfileNoPassword);
      });

      expect(result.current.needPassword).toBe(true);
      expect(result.current.isConnecting).toBe(false);
      expect(sessionLib.connect).not.toHaveBeenCalled();
    });

    it("should set hostKeyPayload when host key confirmation needed", async () => {
      const connectResult = createConnectResult({
        needHostKeyConfirm: true,
        serverFingerprint: "SHA256:abc123",
      });
      vi.mocked(sessionLib.connect).mockResolvedValueOnce(connectResult);

      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.startConnect(mockProfile);
      });

      expect(result.current.hostKeyPayload).toMatchObject({
        profileId: "profile-1",
        host: "192.168.1.100",
        fingerprint: "SHA256:abc123",
      });
      expect(result.current.isConnecting).toBe(false);
    });

    it("should handle AUTH_FAILED error for password auth", async () => {
      vi.mocked(sessionLib.connect).mockRejectedValueOnce(
        new Error("AUTH_FAILED: password required")
      );

      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.startConnect(mockProfile);
      });

      expect(result.current.needPassword).toBe(true);
      expect(result.current.isConnecting).toBe(false);
    });

    it("should show error toast for other errors", async () => {
      const error = new Error("Connection timeout");
      vi.mocked(sessionLib.connect).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.startConnect(mockProfile);
      });

      expect(errorLib.showErrorToast).toHaveBeenCalledWith(error);
      expect(result.current.isConnecting).toBe(false);
    });
  });

  describe("submitCredentials", () => {
    it("should connect with provided password", async () => {
      const connectResult = createConnectResult({ sessionId: "session-456" });
      vi.mocked(sessionLib.connect).mockResolvedValueOnce(connectResult);

      const { result } = renderHook(() => useConnect());

      // First set up the state by starting connect
      await act(async () => {
        await result.current.startConnect(mockProfileNoPassword);
      });

      expect(result.current.needPassword).toBe(true);

      // Now submit credentials
      await act(async () => {
        await result.current.submitCredentials("mypassword");
      });

      expect(sessionLib.connect).toHaveBeenCalledWith({
        profileId: "profile-2",
        password: "mypassword",
        passphrase: undefined,
      });
      expect(mockNavigate).toHaveBeenCalledWith("/files/session-456");
    });

    it("should do nothing if no current profile", async () => {
      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.submitCredentials("password");
      });

      expect(sessionLib.connect).not.toHaveBeenCalled();
    });

    it("should show error on failure", async () => {
      const error = new Error("Wrong password");
      vi.mocked(sessionLib.connect).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.startConnect(mockProfileNoPassword);
      });

      await act(async () => {
        await result.current.submitCredentials("wrongpassword");
      });

      expect(errorLib.showErrorToast).toHaveBeenCalledWith(error);
    });
  });

  describe("confirmHostKey", () => {
    it("should trust host key and reconnect", async () => {
      // First connection needs host key confirm
      const firstResult = createConnectResult({
        needHostKeyConfirm: true,
        serverFingerprint: "SHA256:abc123",
      });
      vi.mocked(sessionLib.connect).mockResolvedValueOnce(firstResult);

      // Second connection succeeds
      const secondResult = createConnectResult({ sessionId: "session-789" });
      vi.mocked(sessionLib.reconnectWithTrustedKey).mockResolvedValueOnce(secondResult);
      vi.mocked(sessionLib.trustHostKey).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.startConnect(mockProfile);
      });

      expect(result.current.hostKeyPayload).not.toBeNull();

      await act(async () => {
        await result.current.confirmHostKey();
      });

      expect(sessionLib.trustHostKey).toHaveBeenCalledWith({
        host: "192.168.1.100",
        port: 22,
        keyType: "ssh-rsa",
        fingerprint: "SHA256:abc123",
      });
      expect(sessionLib.reconnectWithTrustedKey).toHaveBeenCalledWith({
        profileId: "profile-1",
      });
      expect(mockNavigate).toHaveBeenCalledWith("/files/session-789");
    });

    it("should do nothing if no host key payload", async () => {
      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.confirmHostKey();
      });

      expect(sessionLib.trustHostKey).not.toHaveBeenCalled();
    });
  });

  describe("rejectHostKey", () => {
    it("should reset state", async () => {
      const connectResult = createConnectResult({
        needHostKeyConfirm: true,
        serverFingerprint: "SHA256:abc123",
      });
      vi.mocked(sessionLib.connect).mockResolvedValueOnce(connectResult);

      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.startConnect(mockProfile);
      });

      expect(result.current.hostKeyPayload).not.toBeNull();

      act(() => {
        result.current.rejectHostKey();
      });

      expect(result.current.hostKeyPayload).toBeNull();
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.currentProfile).toBeNull();
    });
  });

  describe("cancelConnect", () => {
    it("should reset all state", async () => {
      const { result } = renderHook(() => useConnect());

      await act(async () => {
        await result.current.startConnect(mockProfileNoPassword);
      });

      expect(result.current.needPassword).toBe(true);

      act(() => {
        result.current.cancelConnect();
      });

      expect(result.current.needPassword).toBe(false);
      expect(result.current.currentProfile).toBeNull();
      expect(result.current.isConnecting).toBe(false);
    });
  });
});
