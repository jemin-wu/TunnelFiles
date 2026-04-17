/**
 * AI runtime 健康检查轮询 hook（SPEC §3 `ai_health_check`）。
 *
 * 5 秒轮询 `ai_health_check` IPC。开关关闭（settings.ai_enabled=false）时
 * 完全不发请求、不加载 llama.cpp（SPEC §7 Always: "AI 默认关闭"）。
 */

import { useQuery } from "@tanstack/react-query";
import { aiHealthCheck } from "@/lib/ai";
import type { AiHealthResult } from "@/types/bindings/AiHealthResult";

export type AiHealthStatus =
  | "disabled" // ai_enabled=false，UI 不该显示 badge
  | "model-missing" // 需引导下载
  | "loading" // 轮询中 / runtime 载入中
  | "ready" // 可以对话
  | "error"; // IPC 异常（retry 轮询解）

export const AI_HEALTH_QUERY_KEY = ["ai", "health"] as const;
export const AI_HEALTH_REFETCH_MS = 5_000;

/**
 * 把 `ai_enabled` + 后端返回的 `AiHealthResult` + query 错误映射到 UI
 * 要展示的 `AiHealthStatus`。
 *
 * 纯函数 —— 不读全局、不副作用 —— 便于穷举单测。
 */
export function deriveAiHealthStatus(
  aiEnabled: boolean,
  health: AiHealthResult | undefined,
  error: unknown
): AiHealthStatus {
  if (!aiEnabled) return "disabled";
  if (error) return "error";
  if (!health) return "loading";
  if (!health.modelPresent) return "model-missing";
  if (!health.runtimeReady) return "loading";
  return "ready";
}

export interface UseAiHealthCheckReturn {
  status: AiHealthStatus;
  data: AiHealthResult | undefined;
  error: unknown;
  refetch: () => void;
}

export function useAiHealthCheck(aiEnabled: boolean): UseAiHealthCheckReturn {
  const query = useQuery({
    queryKey: AI_HEALTH_QUERY_KEY,
    queryFn: aiHealthCheck,
    enabled: aiEnabled,
    refetchInterval: aiEnabled ? AI_HEALTH_REFETCH_MS : false,
    // 稍短于刷新间隔，确保 refetch 周期内视为 fresh，避免手工 invalidate 抖动
    staleTime: AI_HEALTH_REFETCH_MS - 500,
    retry: false,
  });

  return {
    status: deriveAiHealthStatus(aiEnabled, query.data, query.error),
    data: query.data,
    error: query.error,
    refetch: query.refetch,
  };
}
