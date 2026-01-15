/**
 * TanStack Query 配置
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000, // 5 秒内认为数据是新鲜的
      gcTime: 5 * 60 * 1000, // 5 分钟后清理缓存
      retry: 1, // 失败后重试 1 次
      refetchOnWindowFocus: false, // 窗口聚焦时不自动刷新
    },
  },
});
