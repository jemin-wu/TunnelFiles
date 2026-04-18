import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  aiHealthCheck,
  aiChatSend,
  aiChatCancel,
  aiContextSnapshot,
  aiLicenseAccept,
  aiModelDownload,
  aiModelDownloadCancel,
} from "@/lib/ai";
import { DEFAULT_SETTINGS } from "@/types/settings";

// lib/ai.ts 是 IPC 边界本身 —— 它的单测必须 mock invoke（上面一层禁止）。
// 功能层测试仍要 mock `@/lib/ai`，见 core-testing.md。
const mockedInvoke = vi.mocked(invoke);

describe("lib/ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("aiHealthCheck", () => {
    it("invokes the ai_health_check command with no args", async () => {
      mockedInvoke.mockResolvedValueOnce({
        runtimeReady: false,
        modelPresent: true,
        modelName: "gemma-4-E4B-it-Q4_K_M",
        acceleratorKind: "metal",
      });
      await aiHealthCheck();
      expect(mockedInvoke).toHaveBeenCalledWith("ai_health_check");
    });

    it("returns parsed AiHealthResult on success", async () => {
      mockedInvoke.mockResolvedValueOnce({
        runtimeReady: true,
        modelPresent: true,
        modelName: "gemma-4-E4B-it-Q4_K_M",
        acceleratorKind: "metal",
      });
      const result = await aiHealthCheck();
      expect(result).toEqual({
        runtimeReady: true,
        modelPresent: true,
        modelName: "gemma-4-E4B-it-Q4_K_M",
        acceleratorKind: "metal",
      });
    });

    it("accepts all three acceleratorKind values", async () => {
      const kinds = ["metal", "cpu", "none"] as const;
      for (const kind of kinds) {
        mockedInvoke.mockResolvedValueOnce({
          runtimeReady: false,
          modelPresent: false,
          modelName: "gemma-4-E4B-it-Q4_K_M",
          acceleratorKind: kind,
        });
        const result = await aiHealthCheck();
        expect(result.acceleratorKind).toBe(kind);
      }
    });

    it("rejects with AppError on invalid acceleratorKind", async () => {
      mockedInvoke.mockResolvedValueOnce({
        runtimeReady: false,
        modelPresent: false,
        modelName: "gemma-4-E4B-it-Q4_K_M",
        acceleratorKind: "cuda", // 未批准的 backend
      });
      await expect(aiHealthCheck()).rejects.toMatchObject({
        code: "UNKNOWN",
        message: expect.stringContaining("ai_health_check"),
      });
    });

    it("rejects with AppError on missing required field", async () => {
      mockedInvoke.mockResolvedValueOnce({
        runtimeReady: true,
        // modelPresent 缺失
        modelName: "gemma-4-E4B-it-Q4_K_M",
        acceleratorKind: "metal",
      });
      await expect(aiHealthCheck()).rejects.toMatchObject({
        code: "UNKNOWN",
        message: expect.stringContaining("ai_health_check"),
      });
    });

    it("rejects with AppError on wrong field type", async () => {
      mockedInvoke.mockResolvedValueOnce({
        runtimeReady: "yes", // string, 不是 boolean
        modelPresent: true,
        modelName: "gemma-4-E4B-it-Q4_K_M",
        acceleratorKind: "metal",
      });
      await expect(aiHealthCheck()).rejects.toMatchObject({
        code: "UNKNOWN",
      });
    });

    it("propagates invoke rejection unchanged", async () => {
      const appError = {
        code: "AI_UNAVAILABLE",
        message: "runtime down",
        retryable: true,
      };
      mockedInvoke.mockRejectedValueOnce(appError);
      await expect(aiHealthCheck()).rejects.toBe(appError);
    });
  });

  describe("aiChatSend", () => {
    it("invokes ai_chat_send with input wrapper carrying sessionId + text", async () => {
      mockedInvoke.mockResolvedValueOnce({ messageId: "abc-123" });
      await aiChatSend("tab-1", "hello");
      expect(mockedInvoke).toHaveBeenCalledWith("ai_chat_send", {
        input: { sessionId: "tab-1", text: "hello" },
      });
    });

    it("returns the parsed messageId", async () => {
      mockedInvoke.mockResolvedValueOnce({ messageId: "abc-123" });
      const result = await aiChatSend("tab-1", "hello");
      expect(result).toEqual({ messageId: "abc-123" });
    });

    it("rejects with AppError when backend returns wrong shape", async () => {
      mockedInvoke.mockResolvedValueOnce({ wrongField: "x" });
      await expect(aiChatSend("tab-1", "hello")).rejects.toMatchObject({
        code: "UNKNOWN",
        message: expect.stringContaining("ai_chat_send"),
      });
    });

    it("propagates invoke rejection unchanged", async () => {
      const appError = {
        code: "INVALID_ARGUMENT",
        message: "chat text cannot be empty",
        retryable: false,
      };
      mockedInvoke.mockRejectedValueOnce(appError);
      await expect(aiChatSend("tab-1", "  ")).rejects.toBe(appError);
    });
  });

  describe("aiChatCancel", () => {
    it("invokes ai_chat_cancel with input wrapper carrying messageId", async () => {
      mockedInvoke.mockResolvedValueOnce({ canceled: true });
      await aiChatCancel("msg-42");
      expect(mockedInvoke).toHaveBeenCalledWith("ai_chat_cancel", {
        input: { messageId: "msg-42" },
      });
    });

    it("returns parsed AiChatCancelResult", async () => {
      mockedInvoke.mockResolvedValueOnce({ canceled: true });
      const result = await aiChatCancel("msg-42");
      expect(result).toEqual({ canceled: true });
    });

    it("returns canceled=false when backend reports message already finished", async () => {
      mockedInvoke.mockResolvedValueOnce({ canceled: false });
      const result = await aiChatCancel("stale-msg");
      expect(result.canceled).toBe(false);
    });

    it("rejects with AppError when backend returns wrong shape", async () => {
      mockedInvoke.mockResolvedValueOnce({ wrongField: true });
      await expect(aiChatCancel("msg-42")).rejects.toMatchObject({
        code: "UNKNOWN",
        message: expect.stringContaining("ai_chat_cancel"),
      });
    });
  });

  describe("aiContextSnapshot", () => {
    it("invokes ai_context_snapshot with input wrapper carrying sessionId", async () => {
      mockedInvoke.mockResolvedValueOnce({
        sessionId: "tab-1",
        pwd: "/home/user",
        recentOutput: "ls\nfile\n",
      });
      await aiContextSnapshot("tab-1");
      expect(mockedInvoke).toHaveBeenCalledWith("ai_context_snapshot", {
        input: { sessionId: "tab-1" },
      });
    });

    it("returns the parsed snapshot on success", async () => {
      mockedInvoke.mockResolvedValueOnce({
        sessionId: "tab-1",
        pwd: "/home/user",
        recentOutput: "ls\nfile\n",
      });
      const result = await aiContextSnapshot("tab-1");
      expect(result).toEqual({
        sessionId: "tab-1",
        pwd: "/home/user",
        recentOutput: "ls\nfile\n",
      });
    });

    it("accepts empty strings (best-effort when session/terminal missing)", async () => {
      mockedInvoke.mockResolvedValueOnce({
        sessionId: "gone",
        pwd: "",
        recentOutput: "",
      });
      const result = await aiContextSnapshot("gone");
      expect(result.pwd).toBe("");
      expect(result.recentOutput).toBe("");
    });

    it("rejects with AppError when backend returns wrong shape", async () => {
      mockedInvoke.mockResolvedValueOnce({
        sessionId: "tab-1",
        // pwd 缺失
        recentOutput: "",
      });
      await expect(aiContextSnapshot("tab-1")).rejects.toMatchObject({
        code: "UNKNOWN",
        message: expect.stringContaining("ai_context_snapshot"),
      });
    });

    it("rejects with AppError on wrong field type", async () => {
      mockedInvoke.mockResolvedValueOnce({
        sessionId: "tab-1",
        pwd: 42, // number, 不是 string
        recentOutput: "",
      });
      await expect(aiContextSnapshot("tab-1")).rejects.toMatchObject({
        code: "UNKNOWN",
      });
    });

    it("propagates invoke rejection unchanged", async () => {
      const appError = {
        code: "INVALID_ARGUMENT",
        message: "sessionId cannot be empty",
        retryable: false,
      };
      mockedInvoke.mockRejectedValueOnce(appError);
      await expect(aiContextSnapshot("  ")).rejects.toBe(appError);
    });
  });

  describe("aiLicenseAccept", () => {
    it("invokes ai_license_accept with no args", async () => {
      mockedInvoke.mockResolvedValueOnce({
        ...DEFAULT_SETTINGS,
        aiLicenseAcceptedAt: 1700000000000,
      });
      await aiLicenseAccept();
      expect(mockedInvoke).toHaveBeenCalledWith("ai_license_accept");
    });

    it("returns parsed Settings with accepted_at timestamp", async () => {
      mockedInvoke.mockResolvedValueOnce({
        ...DEFAULT_SETTINGS,
        aiLicenseAcceptedAt: 1700000000000,
      });
      const result = await aiLicenseAccept();
      expect(result.aiLicenseAcceptedAt).toBe(1700000000000);
    });

    it("rejects with AppError when backend returns wrong shape", async () => {
      mockedInvoke.mockResolvedValueOnce({ wrongField: "x" });
      await expect(aiLicenseAccept()).rejects.toMatchObject({
        code: "UNKNOWN",
        message: expect.stringContaining("ai_license_accept"),
      });
    });

    it("propagates invoke rejection unchanged", async () => {
      const appError = {
        code: "LOCAL_IO_ERROR",
        message: "db locked",
        retryable: true,
      };
      mockedInvoke.mockRejectedValueOnce(appError);
      await expect(aiLicenseAccept()).rejects.toBe(appError);
    });
  });

  describe("aiModelDownload", () => {
    it("invokes ai_model_download with no args", async () => {
      mockedInvoke.mockResolvedValueOnce(null);
      await aiModelDownload();
      // 不传 args（undefined 作为可选参数） —— 后端命令签名不收 input
      expect(mockedInvoke).toHaveBeenCalledWith("ai_model_download");
    });

    it("resolves void on success", async () => {
      mockedInvoke.mockResolvedValueOnce(null);
      await expect(aiModelDownload()).resolves.toBeUndefined();
    });

    it("propagates AI_UNAVAILABLE from license gate", async () => {
      const appError = {
        code: "AI_UNAVAILABLE",
        message: "需先接受 Gemma Terms of Use",
        detail: "license not accepted",
        retryable: false,
      };
      mockedInvoke.mockRejectedValueOnce(appError);
      await expect(aiModelDownload()).rejects.toBe(appError);
    });

    it("propagates AI_UNAVAILABLE from concurrent-download gate", async () => {
      const appError = {
        code: "AI_UNAVAILABLE",
        message: "模型下载已在进行中",
        retryable: false,
      };
      mockedInvoke.mockRejectedValueOnce(appError);
      await expect(aiModelDownload()).rejects.toBe(appError);
    });
  });

  describe("aiModelDownloadCancel", () => {
    it("invokes ai_model_download_cancel with no args", async () => {
      mockedInvoke.mockResolvedValueOnce({ canceled: true });
      await aiModelDownloadCancel();
      expect(mockedInvoke).toHaveBeenCalledWith("ai_model_download_cancel");
    });

    it("returns canceled=true when active download was cancelled", async () => {
      mockedInvoke.mockResolvedValueOnce({ canceled: true });
      const result = await aiModelDownloadCancel();
      expect(result.canceled).toBe(true);
    });

    it("returns canceled=false when idle (race-tolerant noop)", async () => {
      mockedInvoke.mockResolvedValueOnce({ canceled: false });
      const result = await aiModelDownloadCancel();
      expect(result.canceled).toBe(false);
    });

    it("rejects with AppError when backend returns wrong shape", async () => {
      mockedInvoke.mockResolvedValueOnce({ wrongField: true });
      await expect(aiModelDownloadCancel()).rejects.toMatchObject({
        code: "UNKNOWN",
        message: expect.stringContaining("ai_model_download_cancel"),
      });
    });
  });
});
