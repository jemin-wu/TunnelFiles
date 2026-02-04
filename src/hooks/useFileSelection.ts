/**
 * 文件选中状态管理 Hook - 支持多选
 *
 * 选择行为模式（遵循 Finder/Explorer 规范）：
 * - 单击：选中单个，取消其他
 * - Cmd+Click (Mac) / Ctrl+Click (Win)：切换选中状态
 * - Shift+Click：从锚点到当前的范围选择
 * - Cmd+A：全选
 */

import { useState, useCallback, useMemo } from "react";
import type { FileEntry } from "@/types";

export interface SelectionModifiers {
  /** Cmd (Mac) or Ctrl (Windows/Linux) key pressed */
  metaKey?: boolean;
  /** Shift key pressed */
  shiftKey?: boolean;
}

interface UseFileSelectionReturn {
  /** 所有选中的路径 Set */
  selectedPaths: Set<string>;
  /** 选中的文件数组 */
  selectedFiles: FileEntry[];
  /** 第一个选中的路径（向后兼容） */
  selectedPath: string | null;
  /** 第一个选中的文件（向后兼容） */
  selectedFile: FileEntry | null;
  /** 选择文件，支持修饰键 */
  selectFile: (path: string, modifiers?: SelectionModifiers) => void;
  /** 全选 */
  selectAll: () => void;
  /** 清空选择 */
  clearSelection: () => void;
  /** 按索引选择 */
  selectByIndex: (index: number, modifiers?: SelectionModifiers) => void;
  /** 向上移动选择 */
  moveSelectionUp: (modifiers?: SelectionModifiers) => void;
  /** 向下移动选择 */
  moveSelectionDown: (modifiers?: SelectionModifiers) => void;
  /** 检查路径是否选中 */
  isSelected: (path: string) => boolean;
  /** 选中数量 */
  selectionCount: number;
}

export function useFileSelection(files: FileEntry[]): UseFileSelectionReturn {
  // 多选状态
  const [rawSelectedPaths, setRawSelectedPaths] = useState<Set<string>>(new Set());
  // 锚点路径（用于 Shift+Click 范围选择的起点）
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  // 焦点路径（用于键盘导航时的当前位置）
  const [focusPath, setFocusPath] = useState<string | null>(null);

  // 过滤出在当前文件列表中存在的选中路径
  const selectedPaths = useMemo(() => {
    const validPaths = new Set<string>();
    const filePathSet = new Set(files.map((f) => f.path));
    for (const path of rawSelectedPaths) {
      if (filePathSet.has(path)) {
        validPaths.add(path);
      }
    }
    return validPaths;
  }, [files, rawSelectedPaths]);

  // 选中的文件数组
  const selectedFiles = useMemo(
    () => files.filter((f) => selectedPaths.has(f.path)),
    [files, selectedPaths]
  );

  // 向后兼容：第一个选中的路径
  const selectedPath = useMemo(() => {
    if (selectedPaths.size === 0) return null;
    // 返回第一个在文件列表顺序中的选中项
    for (const file of files) {
      if (selectedPaths.has(file.path)) {
        return file.path;
      }
    }
    return null;
  }, [files, selectedPaths]);

  // 向后兼容：第一个选中的文件
  const selectedFile = useMemo(
    () => (selectedPath ? (files.find((f) => f.path === selectedPath) ?? null) : null),
    [files, selectedPath]
  );

  // 获取文件索引的辅助函数
  const getFileIndex = useCallback(
    (path: string): number => files.findIndex((f) => f.path === path),
    [files]
  );

  // 范围选择辅助函数
  const selectRange = useCallback(
    (fromPath: string, toPath: string) => {
      const fromIndex = getFileIndex(fromPath);
      const toIndex = getFileIndex(toPath);

      if (fromIndex === -1 || toIndex === -1) return new Set<string>();

      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);

      const pathsInRange = new Set<string>();
      for (let i = start; i <= end; i++) {
        pathsInRange.add(files[i].path);
      }
      return pathsInRange;
    },
    [files, getFileIndex]
  );

  // 核心选择逻辑
  const selectFile = useCallback(
    (path: string, modifiers?: SelectionModifiers) => {
      const { metaKey = false, shiftKey = false } = modifiers ?? {};

      if (shiftKey && anchorPath) {
        // Shift+Click: 范围选择
        const rangePaths = selectRange(anchorPath, path);
        if (metaKey) {
          // Shift+Cmd+Click: 添加范围到现有选择
          setRawSelectedPaths((prev) => new Set([...prev, ...rangePaths]));
        } else {
          // Shift+Click: 替换为范围选择
          setRawSelectedPaths(rangePaths);
        }
        // 更新焦点到目标位置
        setFocusPath(path);
      } else if (metaKey) {
        // Cmd+Click: 切换选中状态
        setRawSelectedPaths((prev) => {
          const next = new Set(prev);
          if (next.has(path)) {
            next.delete(path);
          } else {
            next.add(path);
          }
          return next;
        });
        // 更新锚点和焦点
        setAnchorPath(path);
        setFocusPath(path);
      } else {
        // 普通点击: 单选
        setRawSelectedPaths(new Set([path]));
        setAnchorPath(path);
        setFocusPath(path);
      }
    },
    [anchorPath, selectRange]
  );

  // 全选
  const selectAll = useCallback(() => {
    const allPaths = new Set(files.map((f) => f.path));
    setRawSelectedPaths(allPaths);
    if (files.length > 0) {
      setAnchorPath(files[0].path);
    }
  }, [files]);

  // 清空选择
  const clearSelection = useCallback(() => {
    setRawSelectedPaths(new Set());
    setAnchorPath(null);
    setFocusPath(null);
  }, []);

  // 按索引选择
  const selectByIndex = useCallback(
    (index: number, modifiers?: SelectionModifiers) => {
      if (index >= 0 && index < files.length) {
        selectFile(files[index].path, modifiers);
      }
    },
    [files, selectFile]
  );

  // 向上移动选择
  const moveSelectionUp = useCallback(
    (modifiers?: SelectionModifiers) => {
      if (files.length === 0) return;

      const { shiftKey = false } = modifiers ?? {};
      // 使用 focusPath 作为当前位置，如果没有则使用 selectedPath
      const currentPath = focusPath ?? selectedPath;

      if (currentPath === null) {
        // 没有选中时，选中最后一个
        const lastPath = files[files.length - 1].path;
        setRawSelectedPaths(new Set([lastPath]));
        setAnchorPath(lastPath);
        setFocusPath(lastPath);
        return;
      }

      const currentIndex = getFileIndex(currentPath);
      if (currentIndex > 0) {
        const newPath = files[currentIndex - 1].path;

        if (shiftKey && anchorPath) {
          // Shift+Up: 扩展选择
          const rangePaths = selectRange(anchorPath, newPath);
          setRawSelectedPaths(rangePaths);
          setFocusPath(newPath);
        } else {
          // 普通 Up: 单选移动
          setRawSelectedPaths(new Set([newPath]));
          setAnchorPath(newPath);
          setFocusPath(newPath);
        }
      }
    },
    [files, focusPath, selectedPath, anchorPath, getFileIndex, selectRange]
  );

  // 向下移动选择
  const moveSelectionDown = useCallback(
    (modifiers?: SelectionModifiers) => {
      if (files.length === 0) return;

      const { shiftKey = false } = modifiers ?? {};
      // 使用 focusPath 作为当前位置，如果没有则使用 selectedPath
      const currentPath = focusPath ?? selectedPath;

      if (currentPath === null) {
        // 没有选中时，选中第一个
        const firstPath = files[0].path;
        setRawSelectedPaths(new Set([firstPath]));
        setAnchorPath(firstPath);
        setFocusPath(firstPath);
        return;
      }

      const currentIndex = getFileIndex(currentPath);
      if (currentIndex < files.length - 1) {
        const newPath = files[currentIndex + 1].path;

        if (shiftKey && anchorPath) {
          // Shift+Down: 扩展选择
          const rangePaths = selectRange(anchorPath, newPath);
          setRawSelectedPaths(rangePaths);
          setFocusPath(newPath);
        } else {
          // 普通 Down: 单选移动
          setRawSelectedPaths(new Set([newPath]));
          setAnchorPath(newPath);
          setFocusPath(newPath);
        }
      }
    },
    [files, focusPath, selectedPath, anchorPath, getFileIndex, selectRange]
  );

  // 检查是否选中
  const isSelected = useCallback((path: string) => selectedPaths.has(path), [selectedPaths]);

  return {
    selectedPaths,
    selectedFiles,
    selectedPath,
    selectedFile,
    selectFile,
    selectAll,
    clearSelection,
    selectByIndex,
    moveSelectionUp,
    moveSelectionDown,
    isSelected,
    selectionCount: selectedPaths.size,
  };
}
