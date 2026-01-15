/**
 * 拖拽上传 Hook
 * 使用 Tauri webview onDragDropEvent API 获取文件路径
 * 支持文件和目录上传
 */

import { useState, useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { stat } from "@tauri-apps/plugin-fs";
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
  const addTask = useTransferStore((s) => s.addTask);
  const toast = useToast();

  // 用 ref 保存最新的 props 和依赖，避免事件监听器闭包捕获旧值
  const optionsRef = useRef({ sessionId, remotePath, enabled });
  const depsRef = useRef({ addTask, toast });

  useEffect(() => {
    optionsRef.current = { sessionId, remotePath, enabled };
  }, [sessionId, remotePath, enabled]);

  useEffect(() => {
    depsRef.current = { addTask, toast };
  }, [addTask, toast]);

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
            const { sessionId: sid, remotePath: rpath } = optionsRef.current;
            const { addTask: add, toast: t } = depsRef.current;

            if (paths.length === 0) return;

            for (const localPath of paths) {
              try {
                // 检测是文件还是目录
                const metadata = await stat(localPath);

                if (metadata.isDirectory) {
                  // 上传目录
                  const taskIds = await uploadDirectory(sid, localPath, rpath);
                  for (const taskId of taskIds) {
                    const task = await getTransfer(taskId);
                    if (task) {
                      add(task);
                    }
                  }
                  if (taskIds.length > 0) {
                    t.success(`已创建 ${taskIds.length} 个上传任务`);
                  } else {
                    t.info("目录为空，无文件可上传");
                  }
                } else {
                  // 上传文件
                  const taskId = await uploadFile(sid, localPath, rpath);
                  const task = await getTransfer(taskId);
                  if (task) {
                    add(task);
                  }
                }
              } catch (error) {
                t.error(error);
              }
            }
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
  }, []); // 空依赖，只在挂载时注册一次

  return {
    isDragging,
  };
}
