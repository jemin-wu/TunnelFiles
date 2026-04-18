/**
 * AI runtime 健康检查轮询 hook（SPEC §3 `ai_health_check`）。
 *
 * 5 秒轮询 `ai_health_check` IPC。开关关闭（settings.ai_enabled=false）时
 * 完全不发请求、不加载 llama.cpp（SPEC §7 Always: "AI 默认关闭"）。
 */

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { aiHealthCheck, aiRuntimeLoad } from "@/lib/ai";
import { showErrorToast } from "@/lib/error";
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

  // 自动 bootstrap runtime：一旦 health 确认 modelPresent=true 但
  // runtimeReady=false（app 启动且模型已下好但没人调 load 的场景），触发
  // `ai_runtime_load`。单次触发 —— 用 ref guard 防止 5 秒轮询反复打 FFI load。
  // 失败不重试（报错给用户），因为 runtime load 失败通常是 RAM 不够 / 文件
  // 损坏，反复试也徒劳。
  const loadTriggeredRef = useRef(false);
  useEffect(() => {
    if (!aiEnabled) {
      // 禁用 AI 时允许下次启用重试
      loadTriggeredRef.current = false;
      return;
    }
    const health = query.data;
    if (!health) return;
    if (!health.modelPresent) return;
    if (health.runtimeReady) return;
    if (loadTriggeredRef.current) return;

    loadTriggeredRef.current = true;
    void aiRuntimeLoad()
      .then(() => {
        // 下次 refetch 就能看到 runtimeReady=true；无需手工刷新
      })
      .catch((err) => {
        // 失败 → 允许用户后续手工重试（例如释放 RAM 后切 AI off/on）
        loadTriggeredRef.current = false;
        showErrorToast(err);
      });
  }, [aiEnabled, query.data]);

  return {
    status: deriveAiHealthStatus(aiEnabled, query.data, query.error),
    data: query.data,
    error: query.error,
    refetch: query.refetch,
  };
}
