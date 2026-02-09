/**
 * File Operations Hook
 * Wraps mkdir, rename, delete, chmod, getDirStats operations
 */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { showSuccessToast, showErrorToast } from "@/lib/error";
import * as sftp from "@/lib/sftp";

interface UseFileOperationsOptions {
  sessionId: string;
  currentPath: string;
}

export function useFileOperations({ sessionId, currentPath }: UseFileOperationsOptions) {
  const queryClient = useQueryClient();

  const invalidateFileList = () => {
    queryClient.invalidateQueries({
      queryKey: ["files", sessionId, currentPath],
    });
  };

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const path = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
      await sftp.mkdir(sessionId, path);
    },
    onSuccess: () => {
      showSuccessToast("Folder created");
      invalidateFileList();
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });

  const rename = useMutation({
    mutationFn: async ({ fromPath, newName }: { fromPath: string; newName: string }) => {
      const parentPath = fromPath.substring(0, fromPath.lastIndexOf("/")) || "/";
      const toPath = parentPath === "/" ? `/${newName}` : `${parentPath}/${newName}`;
      await sftp.rename(sessionId, fromPath, toPath);
    },
    onSuccess: () => {
      showSuccessToast("Renamed successfully");
      invalidateFileList();
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });

  const deleteItem = useMutation({
    mutationFn: async ({ path, isDir }: { path: string; isDir: boolean }) => {
      await sftp.deleteItem(sessionId, path, isDir);
    },
    onSuccess: () => {
      showSuccessToast("Deleted successfully");
      invalidateFileList();
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });

  const deleteRecursive = useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      return await sftp.deleteRecursive(sessionId, path);
    },
    onSuccess: (result) => {
      const total = result.deletedFiles + result.deletedDirs;
      if (result.failures.length === 0) {
        showSuccessToast(`Deleted ${result.deletedFiles} files, ${result.deletedDirs} directories`);
      } else if (total > 0) {
        showSuccessToast(`Partial delete: ${total} succeeded, ${result.failures.length} failed`);
      } else {
        showErrorToast(new Error(`Delete failed: ${result.failures[0]?.error}`));
      }
      invalidateFileList();
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });

  const chmod = useMutation({
    mutationFn: async ({ paths, mode }: { paths: string[]; mode: number }) => {
      return await sftp.chmod(sessionId, paths, mode);
    },
    onSuccess: (result) => {
      if (result.failures.length === 0) {
        showSuccessToast(`Permissions changed (${result.successCount} files)`);
      } else if (result.successCount > 0) {
        showSuccessToast(
          `Partial success: ${result.successCount} succeeded, ${result.failures.length} failed`
        );
      } else {
        showErrorToast(new Error(`Permission change failed: ${result.failures[0]?.error}`));
      }
      invalidateFileList();
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });

  const getDirStats = useCallback((path: string) => sftp.getDirStats(sessionId, path), [sessionId]);

  return {
    createFolder,
    rename,
    deleteItem,
    deleteRecursive,
    chmod,
    getDirStats,
    isOperating:
      createFolder.isPending ||
      rename.isPending ||
      deleteItem.isPending ||
      deleteRecursive.isPending ||
      chmod.isPending,
  };
}
