/**
 * 拖拽上传 Hook
 * 使用 Tauri webview onDragDropEvent API 获取文件路径
 * 支持文件和目录上传
 */

import { useState, useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { stat } from "@tauri-apps/plugin-fs";
import { useQueryClient } from "@tanstack/react-query";
import { uploadFile, uploadDirectory, getTransfer } from "@/lib/transfer";
import { useTransferStore } from "@/stores/useTransferStore";
import { useToast } from "@/hooks/useToast";

interface UseDropUploadOptions {
  sessionId: string;
  remotePath: string;
  enabled?: boolean;
}

interface UseDropUploadReturn {
  isDragging: boolean;
}

export function useDropUpload(options: UseDropUploadOptions): UseDropUploadReturn {
  const { sessionId, remotePath, enabled = true } = options;
  const [isDragging, setIsDragging] = useState(false);
  // Zustand selector returns stable function reference
  const addTask = useTransferStore((s) => s.addTask);
  // useToast returns a stable singleton object
  const toast = useToast();
  const queryClient = useQueryClient();

  // Ref to track latest values, avoiding stale closures in event handler
  const optionsRef = useRef({ sessionId, remotePath, enabled, queryClient });

  useEffect(() => {
    optionsRef.current = { sessionId, remotePath, enabled, queryClient };
  }, [sessionId, remotePath, enabled, queryClient]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    const setup = async () => {
      const webview = getCurrentWebview();
      const unlistenFn = await webview.onDragDropEvent(async (event) => {
        if (cancelled) return;
        if (!optionsRef.current.enabled) return;
        const { type } = event.payload;

        switch (type) {
          case "enter":
          case "over":
            setIsDragging(true);
            break;
          case "leave":
            setIsDragging(false);
            break;
          case "drop": {
            setIsDragging(false);
            const paths = event.payload.paths;
            const { sessionId: sid, remotePath: rpath, queryClient: qc } = optionsRef.current;

            if (paths.length === 0) return;

            // 并行处理多个文件/目录上传
            await Promise.all(
              paths.map(async (localPath) => {
                try {
                  // 检测是文件还是目录
                  const metadata = await stat(localPath);

                  if (metadata.isDirectory) {
                    // 上传目录（后端会先创建远程目录再返回）
                    const taskIds = await uploadDirectory(sid, localPath, rpath);
                    // 后端已创建远程目录，立即刷新文件列表以显示新文件夹
                    qc.invalidateQueries({
                      queryKey: ["files", sid, rpath],
                    });
                    const tasks = await Promise.all(taskIds.map((id) => getTransfer(id)));
                    for (const task of tasks) {
                      if (task) {
                        addTask(task);
                      }
                    }
                    if (taskIds.length > 0) {
                      toast.success(`Created ${taskIds.length} upload tasks`);
                    } else {
                      toast.info("Directory is empty, no files to upload");
                    }
                  } else {
                    // 上传文件
                    const taskId = await uploadFile(sid, localPath, rpath);
                    const task = await getTransfer(taskId);
                    if (task) {
                      addTask(task);
                    }
                  }
                } catch (error) {
                  toast.error(error);
                }
              })
            );
            break;
          }
        }
      });

      if (cancelled) {
        unlistenFn();
      } else {
        unlisten = unlistenFn;
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [addTask, toast]);

  return {
    isDragging,
  };
}
