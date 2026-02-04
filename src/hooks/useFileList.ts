/**
 * 文件列表数据获取 Hook
 */

import { useQuery } from "@tanstack/react-query";

import { invokeWithErrorHandling } from "@/lib/error";
import * as sftp from "@/lib/sftp";
import type { FileEntry, SortSpec } from "@/types";

interface UseFileListOptions {
  sessionId: string;
  path: string;
  sort?: SortSpec;
  enabled?: boolean;
}

interface UseFileListReturn {
  files: FileEntry[];
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  isFetching: boolean;
}

export function useFileList(options: UseFileListOptions): UseFileListReturn {
  const { sessionId, path, sort, enabled = true } = options;

  const query = useQuery({
    queryKey: ["files", sessionId, path, sort],
    queryFn: async () => {
      const files = await invokeWithErrorHandling<FileEntry[]>(
        () => sftp.listDir(sessionId, path, sort),
        { showToast: true }
      );
      return files ?? [];
    },
    enabled: enabled && !!sessionId && !!path,
    staleTime: 5000,
    gcTime: 5 * 60 * 1000,
  });

  return {
    files: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}
