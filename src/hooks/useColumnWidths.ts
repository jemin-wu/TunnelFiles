/**
 * Column width configuration hook
 * Supports drag-to-resize with localStorage persistence
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface ColumnWidths {
  name: number;
  size: number;
  mtime: number;
}

/** Shared layout constants for file list columns */
export const ICON_WIDTH = 28;
export const PERM_WIDTH = 96;
const CONTAINER_PADDING = 24;

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

  // Start resize drag
  const startResize = useCallback(
    (column: ColumnKey, startX: number, containerWidth: number) => {
      let startWidth = widths[column];
      // If name column is 0 (auto-fill), calculate actual width
      if (column === "name" && startWidth === 0) {
        startWidth = Math.max(
          containerWidth - ICON_WIDTH - widths.size - PERM_WIDTH - widths.mtime - CONTAINER_PADDING,
          MIN_WIDTHS.name
        );
      }
      dragStateRef.current = { column, startX, startWidth };
    },
    [widths]
  );

  // During resize drag
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

  // End resize drag
  const endResize = useCallback(() => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      setWidths((prev) => {
        saveWidths(prev);
        return prev;
      });
    }
  }, []);

  // Reset column widths
  const resetWidths = useCallback(() => {
    setWidths(DEFAULT_WIDTHS);
    saveWidths(DEFAULT_WIDTHS);
  }, []);

  // Global mouse event handlers
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
