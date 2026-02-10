/**
 * 传输事件监听 Hook
 * 监听后端传输进度和状态事件，更新 Zustand store
 * 上传成功后自动刷新文件列表
 */

import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";

import { EVENTS, type TransferProgressPayload, type TransferStatusPayload } from "@/types/events";
import { useTransferStore } from "@/stores/useTransferStore";

export function useTransferEvents(): void {
  const queryClient = useQueryClient();
  const updateProgress = useTransferStore((s) => s.updateProgress);
  const updateStatus = useTransferStore((s) => s.updateStatus);
  const getTask = useTransferStore((s) => s.getTask);

  // 用 ref 保存依赖，避免 useEffect 重复执行
  const depsRef = useRef({ queryClient, updateProgress, updateStatus, getTask });
  useEffect(() => {
    depsRef.current = { queryClient, updateProgress, updateStatus, getTask };
  }, [queryClient, updateProgress, updateStatus, getTask]);

  // Debounce timer for batch upload invalidation
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      const unlistenProgress = await listen<TransferProgressPayload>(
        EVENTS.TRANSFER_PROGRESS,
        (event) => {
          depsRef.current.updateProgress(event.payload);
        }
      );
      if (cancelled) {
        unlistenProgress();
        return;
      }
      unlisteners.push(unlistenProgress);

      const unlistenStatus = await listen<TransferStatusPayload>(
        EVENTS.TRANSFER_STATUS,
        (event) => {
          const { updateStatus: update, getTask: get, queryClient: qc } = depsRef.current;
          const payload = event.payload;

          // 先更新状态
          update(payload);

          // 上传成功时刷新该 session 的所有文件列表（去抖动 300ms）
          // 使用 session 级别失效（而非精确路径匹配），因为：
          // 1. 文件夹上传时，每个文件的父目录可能不是用户正在浏览的目录
          // 2. 去抖动避免批量上传时每个文件完成都触发 refetch
          if (payload.status === "success") {
            const task = get(payload.taskId);
            if (task && task.direction === "upload") {
              if (invalidateTimerRef.current) {
                clearTimeout(invalidateTimerRef.current);
              }
              const sessionId = task.sessionId;
              invalidateTimerRef.current = setTimeout(() => {
                qc.invalidateQueries({
                  queryKey: ["files", sessionId],
                });
                invalidateTimerRef.current = null;
              }, 300);
            }
          }
        }
      );
      if (cancelled) {
        unlistenStatus();
        return;
      }
      unlisteners.push(unlistenStatus);
    };

    setup();

    return () => {
      cancelled = true;
      unlisteners.forEach((unlisten) => unlisten());
      if (invalidateTimerRef.current) {
        clearTimeout(invalidateTimerRef.current);
      }
    };
  }, []);
}
