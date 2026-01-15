/**
 * Profile 管理 Hooks
 * 使用 TanStack Query 进行缓存管理
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { showSuccessToast, showErrorToast } from "@/lib/error";
import { listProfiles, upsertProfile, deleteProfile } from "@/lib/profile";

const PROFILES_QUERY_KEY = ["profiles"] as const;

/**
 * 获取所有连接配置
 */
export function useProfiles() {
  return useQuery({
    queryKey: PROFILES_QUERY_KEY,
    queryFn: listProfiles,
  });
}

/**
 * 获取单个连接配置
 */
export function useProfile(id: string | undefined) {
  const { data: profiles, ...rest } = useProfiles();
  const profile = id ? profiles?.find((p) => p.id === id) : undefined;
  return { data: profile, ...rest };
}

/**
 * 创建或更新连接配置
 */
export function useUpsertProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: upsertProfile,
    onSuccess: (_profileId, variables) => {
      queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
      showSuccessToast(variables.id ? "连接已更新" : "连接已添加");
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
}

/**
 * 删除连接配置
 */
export function useDeleteProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
      showSuccessToast("连接已删除");
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
}

/**
 * 获取最近连接记录（基于 updatedAt 排序）
 */
export function useRecentConnections(limit: number = 10) {
  const { data: profiles, ...rest } = useProfiles();

  const recentProfiles = profiles
    ? [...profiles]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit)
    : [];

  return {
    ...rest,
    data: recentProfiles,
  };
}
