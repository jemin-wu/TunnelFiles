/**
 * 列宽配置 Hook
 *
 * 支持拖拽调整列宽并持久化到 localStorage
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface ColumnWidths {
  name: number;
  size: number;
  mtime: number;
}

const STORAGE_KEY = "tunnelfiles:column-widths";

const DEFAULT_WIDTHS: ColumnWidths = {
  name: 0, // 0 表示自动填充
  size: 96,
  mtime: 128,
};

const MIN_WIDTHS: ColumnWidths = {
  name: 100,
  size: 60,
  mtime: 80,
};

const MAX_WIDTHS: ColumnWidths = {
  name: 600,
  size: 200,
  mtime: 200,
};

function loadWidths(): ColumnWidths {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_WIDTHS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_WIDTHS;
}

function saveWidths(widths: ColumnWidths) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // ignore
  }
}

export type ColumnKey = keyof ColumnWidths;

interface DragState {
  column: ColumnKey;
  startX: number;
  startWidth: number;
}

export function useColumnWidths() {
  const [widths, setWidths] = useState<ColumnWidths>(loadWidths);
  const dragStateRef = useRef<DragState | null>(null);

  // 开始拖拽
  const startResize = useCallback(
    (column: ColumnKey, startX: number, containerWidth: number) => {
      let startWidth = widths[column];
      // 如果 name 列宽度为 0（自动），计算实际宽度
      if (column === "name" && startWidth === 0) {
        // 图标宽度 32px + 大小列 + 时间列 + padding
        startWidth = Math.max(
          containerWidth - 32 - widths.size - widths.mtime - 24,
          MIN_WIDTHS.name
        );
      }
      dragStateRef.current = { column, startX, startWidth };
    },
    [widths]
  );

  // 拖拽中
  const onResize = useCallback((clientX: number) => {
    if (!dragStateRef.current) return;

    const { column, startX, startWidth } = dragStateRef.current;
    const delta = clientX - startX;
    const newWidth = Math.max(MIN_WIDTHS[column], Math.min(MAX_WIDTHS[column], startWidth + delta));

    setWidths((prev) => ({
      ...prev,
      [column]: newWidth,
    }));
  }, []);

  // 结束拖拽
  const endResize = useCallback(() => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      setWidths((prev) => {
        saveWidths(prev);
        return prev;
      });
    }
  }, []);

  // 重置列宽
  const resetWidths = useCallback(() => {
    setWidths(DEFAULT_WIDTHS);
    saveWidths(DEFAULT_WIDTHS);
  }, []);

  // 全局鼠标事件处理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragStateRef.current) {
        e.preventDefault();
        onResize(e.clientX);
      }
    };

    const handleMouseUp = () => {
      endResize();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onResize, endResize]);

  return {
    widths,
    startResize,
    resetWidths,
  };
}
