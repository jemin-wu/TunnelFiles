/**
 * 文件选中状态管理 Hook
 */

import { useState, useCallback, useMemo } from "react";
import type { FileEntry } from "@/types";

interface UseFileSelectionReturn {
  selectedPath: string | null;
  selectedFile: FileEntry | null;
  selectFile: (path: string | null) => void;
  clearSelection: () => void;
  selectByIndex: (index: number) => void;
  moveSelectionUp: () => void;
  moveSelectionDown: () => void;
}

export function useFileSelection(files: FileEntry[]): UseFileSelectionReturn {
  const [rawSelectedPath, setRawSelectedPath] = useState<string | null>(null);

  // 计算有效的选中路径（如果选中的文件不存在于列表中，返回 null）
  const selectedPath = useMemo(() => {
    if (!rawSelectedPath) return null;
    return files.some((f) => f.path === rawSelectedPath) ? rawSelectedPath : null;
  }, [files, rawSelectedPath]);

  const selectedFile = useMemo(
    () => (selectedPath ? (files.find((f) => f.path === selectedPath) ?? null) : null),
    [files, selectedPath]
  );

  const selectFile = useCallback((path: string | null) => {
    setRawSelectedPath(path);
  }, []);

  const clearSelection = useCallback(() => {
    setRawSelectedPath(null);
  }, []);

  const selectByIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < files.length) {
        setRawSelectedPath(files[index].path);
      }
    },
    [files]
  );

  const moveSelectionUp = useCallback(() => {
    if (files.length === 0) return;

    if (selectedPath === null) {
      // 没有选中时，选中最后一个
      setRawSelectedPath(files[files.length - 1].path);
      return;
    }

    const currentIndex = files.findIndex((f) => f.path === selectedPath);
    if (currentIndex > 0) {
      setRawSelectedPath(files[currentIndex - 1].path);
    }
  }, [files, selectedPath]);

  const moveSelectionDown = useCallback(() => {
    if (files.length === 0) return;

    if (selectedPath === null) {
      // 没有选中时，选中第一个
      setRawSelectedPath(files[0].path);
      return;
    }

    const currentIndex = files.findIndex((f) => f.path === selectedPath);
    if (currentIndex < files.length - 1) {
      setRawSelectedPath(files[currentIndex + 1].path);
    }
  }, [files, selectedPath]);

  return {
    selectedPath,
    selectedFile,
    selectFile,
    clearSelection,
    selectByIndex,
    moveSelectionUp,
    moveSelectionDown,
  };
}
