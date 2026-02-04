/**
 * 删除进度监听 Hook
 *
 * 监听 delete:progress 事件，用于显示递归删除进度
 */

import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

import { DeleteProgressSchema } from "@/lib/sftp";
import type { DeleteProgress } from "@/types/file";

interface UseDeleteProgressOptions {
  /** 要监听的删除任务路径，null 表示不监听 */
  path: string | null;
  /** 进度更新回调 */
  onProgress?: (progress: DeleteProgress) => void;
}

interface UseDeleteProgressReturn {
  /** 当前进度 */
  progress: DeleteProgress | null;
  /** 是否正在删除 */
  isDeleting: boolean;
  /** 重置进度状态 */
  reset: () => void;
}

/**
 * 监听删除进度事件
 *
 * @example
 * ```tsx
 * const { progress, isDeleting } = useDeleteProgress({
 *   path: deletingPath,
 *   onProgress: (p) => console.log(`Deleted ${p.deletedCount}/${p.totalCount}`),
 * });
 * ```
 */
export function useDeleteProgress({
  path,
  onProgress,
}: UseDeleteProgressOptions): UseDeleteProgressReturn {
  const [progress, setProgress] = useState<DeleteProgress | null>(null);
  const [completed, setCompleted] = useState(false);
  const prevPathRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setProgress(null);
    setCompleted(false);
  }, []);

  // 派生 isDeleting 状态：有路径且未完成时为 true
  const isDeleting = useMemo(() => {
    return path !== null && !completed;
  }, [path, completed]);

  useEffect(() => {
    // 当 path 变化时重置状态
    // 这是重置依赖 prop 变化的状态的合法模式
    if (prevPathRef.current !== path) {
      prevPathRef.current = path;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset state when path prop changes
      setProgress(null);
      setCompleted(false);
    }

    if (!path) {
      return;
    }

    // StrictMode-safe: 防止清理后继续更新状态
    let cancelled = false;

    const unlisten = listen<unknown>("delete:progress", (event) => {
      // 如果已清理，跳过处理
      if (cancelled) return;

      // 验证并解析事件数据
      const parseResult = DeleteProgressSchema.safeParse(event.payload);
      if (!parseResult.success) {
        return;
      }

      const progressData = parseResult.data;

      // 只处理当前路径的进度
      if (progressData.path === path) {
        setProgress(progressData);
        onProgress?.(progressData);

        // 如果删除完成，标记完成
        if (progressData.deletedCount >= progressData.totalCount) {
          setCompleted(true);
        }
      }
    });

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [path, onProgress]);

  return {
    progress,
    isDeleting,
    reset,
  };
}
