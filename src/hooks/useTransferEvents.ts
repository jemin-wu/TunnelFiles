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

/** 从文件路径提取目录路径 */
function getDirectoryPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return filePath.substring(0, lastSlash);
}

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

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      const unlistenProgress = await listen<TransferProgressPayload>(
        EVENTS.TRANSFER_PROGRESS,
        (event) => {
          depsRef.current.updateProgress(event.payload);
        }
      );
      unlisteners.push(unlistenProgress);

      const unlistenStatus = await listen<TransferStatusPayload>(
        EVENTS.TRANSFER_STATUS,
        (event) => {
          const { updateStatus: update, getTask: get, queryClient: qc } = depsRef.current;
          const payload = event.payload;

          // 先更新状态
          update(payload);

          // 上传成功时刷新对应目录的文件列表
          if (payload.status === "success") {
            const task = get(payload.taskId);
            if (task && task.direction === "upload") {
              const dirPath = getDirectoryPath(task.remotePath);
              qc.invalidateQueries({
                queryKey: ["files", task.sessionId, dirPath],
              });
            }
          }
        }
      );
      unlisteners.push(unlistenStatus);
    };

    setup();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
}
