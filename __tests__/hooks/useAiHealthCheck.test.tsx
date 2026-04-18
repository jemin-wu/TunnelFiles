import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  deriveAiHealthStatus,
  useAiHealthCheck,
  AI_HEALTH_REFETCH_MS,
} from "@/hooks/useAiHealthCheck";
import type { AiHealthResult } from "@/types/bindings/AiHealthResult";

const baseHealth: AiHealthResult = {
  runtimeReady: false,
  modelPresent: false,
  modelName: "gemma-4-E4B-it-Q4_K_M",
  acceleratorKind: "metal",
};

describe("deriveAiHealthStatus", () => {
  it("returns 'disabled' when aiEnabled=false regardless of data", () => {
    expect(deriveAiHealthStatus(false, undefined, undefined)).toBe("disabled");
    expect(
      deriveAiHealthStatus(
        false,
        { ...baseHealth, runtimeReady: true, modelPresent: true },
        undefined
      )
    ).toBe("disabled");
    expect(deriveAiHealthStatus(false, undefined, new Error("x"))).toBe("disabled");
  });

  it("returns 'error' when aiEnabled=true and query errored", () => {
    expect(deriveAiHealthStatus(true, undefined, new Error("ipc failed"))).toBe("error");
    // error 优先于 data
    expect(deriveAiHealthStatus(true, baseHealth, new Error("ipc failed"))).toBe("error");
  });

  it("returns 'loading' while first fetch is pending", () => {
    expect(deriveAiHealthStatus(true, undefined, undefined)).toBe("loading");
  });

  it("returns 'model-missing' when GGUF file not downloaded", () => {
    expect(
      deriveAiHealthStatus(
        true,
        { ...baseHealth, modelPresent: false, runtimeReady: false },
        undefined
      )
    ).toBe("model-missing");
  });

  it("returns 'loading' when model present but runtime not ready", () => {
    expect(
      deriveAiHealthStatus(
        true,
        { ...baseHealth, modelPresent: true, runtimeReady: false },
        undefined
      )
    ).toBe("loading");
  });

  it("returns 'ready' when both model present and runtime ready", () => {
    expect(
      deriveAiHealthStatus(
        true,
        { ...baseHealth, modelPresent: true, runtimeReady: true },
        undefined
      )
    ).toBe("ready");
  });
});

describe("useAiHealthCheck", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it("does not call invoke when aiEnabled=false", () => {
    const { result } = renderHook(() => useAiHealthCheck(false), { wrapper });
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.status).toBe("disabled");
  });

  it("fetches on mount when aiEnabled=true", async () => {
    vi.mocked(invoke).mockResolvedValue({
      runtimeReady: false,
      modelPresent: false,
      modelName: "gemma-4-E4B-it-Q4_K_M",
      acceleratorKind: "metal",
    } satisfies AiHealthResult);

    const { result } = renderHook(() => useAiHealthCheck(true), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("model-missing");
    });
    expect(invoke).toHaveBeenCalledWith("ai_health_check");
  });

  it("transitions to ready when backend reports model+runtime up", async () => {
    vi.mocked(invoke).mockResolvedValue({
      runtimeReady: true,
      modelPresent: true,
      modelName: "gemma-4-E4B-it-Q4_K_M",
      acceleratorKind: "metal",
    } satisfies AiHealthResult);

    const { result } = renderHook(() => useAiHealthCheck(true), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
  });

  it("surfaces error state when IPC rejects", async () => {
    vi.mocked(invoke).mockRejectedValue({
      code: "UNKNOWN",
      message: "boom",
    });

    const { result } = renderHook(() => useAiHealthCheck(true), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
  });

  it("exposes refetch for manual trigger", async () => {
    vi.mocked(invoke).mockResolvedValue({
      runtimeReady: true,
      modelPresent: true,
      modelName: "gemma-4-E4B-it-Q4_K_M",
      acceleratorKind: "metal",
    } satisfies AiHealthResult);

    const { result } = renderHook(() => useAiHealthCheck(true), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(typeof result.current.refetch).toBe("function");
  });

  it("uses a 5-second poll interval constant", () => {
    // 防止有人把轮询改成 500ms 打爆后端（SPEC §3 "5s 轮询"）
    expect(AI_HEALTH_REFETCH_MS).toBe(5_000);
  });
});
