/**
 * 设置管理 Hook
 * 使用 TanStack Query 进行缓存管理
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { showSuccessToast, showErrorToast } from "@/lib/error";
import { getSettings, updateSettings as updateSettingsApi } from "@/lib/settings";
import type { Settings, SettingsPatch } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";

const SETTINGS_QUERY_KEY = ["settings"] as const;

interface UseSettingsReturn {
  settings: Settings;
  isLoading: boolean;
  error: unknown;
  updateSettings: (patch: SettingsPatch) => Promise<void>;
  isUpdating: boolean;
  refetch: () => void;
}

export function useSettings(): UseSettingsReturn {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: getSettings,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: updateSettingsApi,
    onSuccess: (newSettings) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, newSettings);
      showSuccessToast("设置已保存");
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });

  const updateSettings = async (patch: SettingsPatch): Promise<void> => {
    await mutation.mutateAsync(patch);
  };

  return {
    settings: query.data ?? DEFAULT_SETTINGS,
    isLoading: query.isLoading,
    error: query.error,
    updateSettings,
    isUpdating: mutation.isPending,
    refetch: query.refetch,
  };
}
