/**
 * 文件操作 Hook
 * 封装 mkdir, rename, delete 操作
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { showSuccessToast, showErrorToast } from "@/lib/error";

interface UseFileOperationsOptions {
  sessionId: string;
  currentPath: string;
}

export function useFileOperations({ sessionId, currentPath }: UseFileOperationsOptions) {
  const queryClient = useQueryClient();

  // 刷新当前目录列表
  const invalidateFileList = () => {
    queryClient.invalidateQueries({
      queryKey: ["files", sessionId, currentPath],
    });
  };

  // 创建目录
  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const path = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
      await invoke("sftp_mkdir", { sessionId, path });
    },
    onSuccess: () => {
      showSuccessToast("文件夹创建成功");
      invalidateFileList();
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });

  // 重命名
  const rename = useMutation({
    mutationFn: async ({ fromPath, newName }: { fromPath: string; newName: string }) => {
      const parentPath = fromPath.substring(0, fromPath.lastIndexOf("/")) || "/";
      const toPath = parentPath === "/" ? `/${newName}` : `${parentPath}/${newName}`;
      await invoke("sftp_rename", { sessionId, fromPath, toPath });
    },
    onSuccess: () => {
      showSuccessToast("重命名成功");
      invalidateFileList();
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });

  // 删除
  const deleteItem = useMutation({
    mutationFn: async ({ path, isDir }: { path: string; isDir: boolean }) => {
      await invoke("sftp_delete", { sessionId, path, isDir });
    },
    onSuccess: () => {
      showSuccessToast("删除成功");
      invalidateFileList();
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });

  return {
    createFolder,
    rename,
    deleteItem,
    isOperating: createFolder.isPending || rename.isPending || deleteItem.isPending,
  };
}
