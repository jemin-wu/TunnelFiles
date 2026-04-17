import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { aiHealthCheck } from "@/lib/ai";

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
        modelName: "gemma4:e4b",
        acceleratorKind: "metal",
      });
      await aiHealthCheck();
      expect(mockedInvoke).toHaveBeenCalledWith("ai_health_check");
    });

    it("returns parsed AiHealthResult on success", async () => {
      mockedInvoke.mockResolvedValueOnce({
        runtimeReady: true,
        modelPresent: true,
        modelName: "gemma4:e4b",
        acceleratorKind: "metal",
      });
      const result = await aiHealthCheck();
      expect(result).toEqual({
        runtimeReady: true,
        modelPresent: true,
        modelName: "gemma4:e4b",
        acceleratorKind: "metal",
      });
    });

    it("accepts all three acceleratorKind values", async () => {
      const kinds = ["metal", "cpu", "none"] as const;
      for (const kind of kinds) {
        mockedInvoke.mockResolvedValueOnce({
          runtimeReady: false,
          modelPresent: false,
          modelName: "gemma4:e4b",
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
        modelName: "gemma4:e4b",
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
        modelName: "gemma4:e4b",
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
        modelName: "gemma4:e4b",
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
});
