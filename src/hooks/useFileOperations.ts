/**
 * 文件操作 Hook
 * 封装 mkdir, rename, delete, chmod 操作
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { showSuccessToast, showErrorToast } from "@/lib/error";
import * as sftp from "@/lib/sftp";

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
      await sftp.mkdir(sessionId, path);
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
      await sftp.rename(sessionId, fromPath, toPath);
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
      await sftp.deleteItem(sessionId, path, isDir);
    },
    onSuccess: () => {
      showSuccessToast("删除成功");
      invalidateFileList();
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });

  // 修改权限
  const chmod = useMutation({
    mutationFn: async ({ paths, mode }: { paths: string[]; mode: number }) => {
      return await sftp.chmod(sessionId, paths, mode);
    },
    onSuccess: (result) => {
      if (result.failures.length === 0) {
        showSuccessToast(`权限修改成功 (${result.successCount} 个文件)`);
      } else if (result.successCount > 0) {
        showSuccessToast(
          `部分成功: ${result.successCount} 成功, ${result.failures.length} 失败`
        );
      } else {
        showErrorToast(new Error(`权限修改失败: ${result.failures[0]?.error}`));
      }
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
    chmod,
    isOperating:
      createFolder.isPending ||
      rename.isPending ||
      deleteItem.isPending ||
      chmod.isPending,
  };
}
