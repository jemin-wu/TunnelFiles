/**
 * 文件列表组件 - Cyberpunk Terminal Style
 * 支持列宽拖拽调整
 */

import { useRef, useCallback, useEffect, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronUp, ChevronDown, FolderOpen } from "lucide-react";

import { FileIcon } from "./FileIcon";
import { FileContextMenu } from "./FileContextMenu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatFileTime } from "@/lib/file";
import { formatFileSize } from "@/types/file";
import { cn } from "@/lib/utils";
import { useColumnWidths, type ColumnKey, type ColumnWidths } from "@/hooks/useColumnWidths";
import type { FileEntry, SortField, SortSpec } from "@/types";

interface FileListProps {
  files: FileEntry[];
  /** 检查文件是否选中 */
  isSelected: (path: string) => boolean;
  /** 选中数量 */
  selectionCount: number;
  sort: SortSpec;
  onFileClick: (file: FileEntry, modifiers: { metaKey: boolean; shiftKey: boolean }) => void;
  onFileDblClick: (file: FileEntry) => void;
  onSortChange: (field: SortField) => void;
  onDownload?: (file: FileEntry) => void;
  onRename?: (file: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onChmod?: (file: FileEntry) => void;
  /** 键盘快捷键处理 */
  onKeyAction?: (action: "selectAll" | "clearSelection" | "delete" | "newFolder" | "preview" | "parentDir" | "rename") => void;
  isLoading?: boolean;
}

const ROW_HEIGHT = 40;
const ICON_WIDTH = 32;

// 列宽分隔符组件
interface ResizeHandleProps {
  column: ColumnKey;
  onMouseDown: (column: ColumnKey, e: React.MouseEvent) => void;
}

function ResizeHandle({ column, onMouseDown }: ResizeHandleProps) {
  return (
    <div
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary group z-10"
      onMouseDown={(e) => {
        e.preventDefault();
        onMouseDown(column, e);
      }}
    >
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-4 bg-border group-hover:bg-primary/50 group-active:bg-primary" />
    </div>
  );
}

// 表头组件
interface HeaderCellProps {
  field: SortField;
  currentSort: SortSpec;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  resizable?: boolean;
  onResizeStart?: (column: ColumnKey, e: React.MouseEvent) => void;
}

function HeaderCell({
  field,
  currentSort,
  onSort,
  children,
  className,
  style,
  resizable,
  onResizeStart,
}: HeaderCellProps) {
  const isActive = currentSort.field === field;

  return (
    <div className="relative" style={style}>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-auto p-0 gap-1 w-full justify-start text-[10px] font-mono font-medium text-muted-foreground hover:text-primary hover:bg-transparent transition-colors tracking-wider",
          isActive && "text-primary",
          className
        )}
        onClick={() => onSort(field)}
      >
        {children}
        {isActive &&
          (currentSort.order === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </Button>
      {resizable && onResizeStart && (
        <ResizeHandle column={field as ColumnKey} onMouseDown={onResizeStart} />
      )}
    </div>
  );
}

// 文件行组件
interface FileRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onClick"> {
  file: FileEntry;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  columnWidths: ColumnWidths;
}

const FileRow = memo(function FileRow({
  file,
  isSelected,
  onClick,
  onDoubleClick,
  columnWidths,
  className,
  ...rest
}: FileRowProps) {
  const sizeWidth = columnWidths.size;
  const mtimeWidth = columnWidths.mtime;
  const nameWidth = columnWidths.name;

  return (
    <div
      role="row"
      tabIndex={0}
      className={cn(
        "flex items-center h-10 px-3 cursor-pointer select-none border-b border-border/30",
        "hover:bg-primary/5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset",
        isSelected && "bg-primary/15 border-l-2 border-l-primary",
        className
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDoubleClick();
      }}
      {...rest}
    >
      {/* 图标 */}
      <div style={{ width: ICON_WIDTH }} className="flex-shrink-0">
        <FileIcon file={file} />
      </div>

      {/* 名称 */}
      <TooltipProvider delayDuration={500}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="min-w-0 truncate text-sm font-mono"
              style={nameWidth > 0 ? { width: nameWidth, flexShrink: 0 } : { flex: 1 }}
            >
              {file.name}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="font-mono text-xs">
            {file.name}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* 大小 */}
      <div
        className="flex-shrink-0 text-right text-xs font-mono text-muted-foreground"
        style={{ width: sizeWidth }}
      >
        {file.isDir ? <span className="text-primary/50">DIR</span> : formatFileSize(file.size)}
      </div>

      {/* 修改时间 */}
      <div
        className="flex-shrink-0 text-right text-xs font-mono text-muted-foreground"
        style={{ width: mtimeWidth }}
      >
        {formatFileTime(file.mtime)}
      </div>
    </div>
  );
});

export function FileList({
  files,
  isSelected,
  selectionCount,
  sort,
  onFileClick,
  onFileDblClick,
  onSortChange,
  onDownload,
  onRename,
  onDelete,
  onChmod,
  onKeyAction,
  isLoading,
}: FileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const { widths, startResize } = useColumnWidths();

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  // 处理列宽拖拽开始
  const handleResizeStart = useCallback(
    (column: ColumnKey, e: React.MouseEvent) => {
      const containerWidth = headerRef.current?.clientWidth ?? 0;
      startResize(column, e.clientX, containerWidth);
    },
    [startResize]
  );

  // 获取当前选中的第一个文件索引
  const getFirstSelectedIndex = useCallback(() => {
    for (let i = 0; i < files.length; i++) {
      if (isSelected(files[i].path)) {
        return i;
      }
    }
    return -1;
  }, [files, isSelected]);

  // 键盘导航和快捷键
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!parentRef.current?.contains(document.activeElement)) return;

      const currentIndex = getFirstSelectedIndex();
      const modifiers = { metaKey: e.metaKey || e.ctrlKey, shiftKey: e.shiftKey };

      // Escape: 清除选择
      if (e.key === "Escape") {
        e.preventDefault();
        onKeyAction?.("clearSelection");
        return;
      }

      // Cmd+A: 全选
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        onKeyAction?.("selectAll");
        return;
      }

      // Delete / Cmd+Backspace: 删除
      if (e.key === "Delete" || ((e.metaKey || e.ctrlKey) && e.key === "Backspace")) {
        e.preventDefault();
        if (selectionCount > 0) {
          onKeyAction?.("delete");
        }
        return;
      }

      // Cmd+N: 新建文件夹
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onKeyAction?.("newFolder");
        return;
      }

      // Space: 快速预览 (Quick Look)
      if (e.key === " " && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        if (selectionCount === 1 && currentIndex >= 0) {
          onKeyAction?.("preview");
        }
        return;
      }

      // Cmd+↑: 返回上级目录
      if ((e.metaKey || e.ctrlKey) && e.key === "ArrowUp") {
        e.preventDefault();
        onKeyAction?.("parentDir");
        return;
      }

      // Cmd+R / F2: 重命名
      if (((e.metaKey || e.ctrlKey) && e.key === "r") || e.key === "F2") {
        e.preventDefault();
        if (selectionCount === 1) {
          onKeyAction?.("rename");
        }
        return;
      }

      // 方向键导航
      if (e.key === "ArrowUp" && currentIndex > 0) {
        e.preventDefault();
        onFileClick(files[currentIndex - 1], modifiers);
        virtualizer.scrollToIndex(currentIndex - 1);
      } else if (e.key === "ArrowDown" && currentIndex < files.length - 1) {
        e.preventDefault();
        onFileClick(files[currentIndex + 1], modifiers);
        virtualizer.scrollToIndex(currentIndex + 1);
      } else if (e.key === "Enter" && currentIndex >= 0) {
        e.preventDefault();
        onFileDblClick(files[currentIndex]);
      }
    },
    [files, getFirstSelectedIndex, isSelected, selectionCount, onFileClick, onFileDblClick, onKeyAction, virtualizer]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // 空状态
  if (!isLoading && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground animate-fade-in">
        <div className="relative">
          <div className="w-16 h-16 flex items-center justify-center rounded bg-primary/10 border border-primary/20">
            <FolderOpen className="h-8 w-8 text-primary/60" />
          </div>
          {/* Corner decorations */}
          <div className="absolute -top-0.5 -left-0.5 w-2 h-2 border-l border-t border-primary/40" />
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 border-r border-t border-primary/40" />
          <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 border-l border-b border-primary/40" />
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 border-r border-b border-primary/40" />
        </div>
        <p className="text-sm font-mono mt-4">DIR_EMPTY</p>
        <p className="text-xs font-mono text-muted-foreground/60 mt-1">
          <span className="text-primary">&gt;</span> 拖拽文件到此上传
        </p>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();
  const nameWidth = widths.name;
  const sizeWidth = widths.size;
  const mtimeWidth = widths.mtime;

  return (
    <div className="flex flex-col h-full">
      {/* 表头 */}
      <div
        ref={headerRef}
        className="flex items-center h-8 px-3 border-b border-border bg-card/50 flex-shrink-0"
      >
        <div style={{ width: ICON_WIDTH }} className="flex-shrink-0" />
        <HeaderCell
          field="name"
          currentSort={sort}
          onSort={onSortChange}
          style={nameWidth > 0 ? { width: nameWidth, flexShrink: 0 } : { flex: 1 }}
          resizable
          onResizeStart={handleResizeStart}
        >
          NAME
        </HeaderCell>
        <HeaderCell
          field="size"
          currentSort={sort}
          onSort={onSortChange}
          className="justify-end"
          style={{ width: sizeWidth, flexShrink: 0 }}
          resizable
          onResizeStart={handleResizeStart}
        >
          SIZE
        </HeaderCell>
        <HeaderCell
          field="mtime"
          currentSort={sort}
          onSort={onSortChange}
          className="justify-end"
          style={{ width: mtimeWidth, flexShrink: 0 }}
          resizable
          onResizeStart={handleResizeStart}
        >
          MODIFIED
        </HeaderCell>
      </div>

      {/* 虚拟列表 */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        tabIndex={0}
        onClick={(e) => {
          // 点击空白处清除选择
          if (e.target === e.currentTarget) {
            onKeyAction?.("clearSelection");
          }
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
          onClick={(e) => {
            // 点击虚拟容器空白处也清除选择
            if (e.target === e.currentTarget) {
              onKeyAction?.("clearSelection");
            }
          }}
        >
          {items.map((virtualItem) => {
            const file = files[virtualItem.index];
            if (!file) return null;
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <FileContextMenu
                  file={file}
                  selectionCount={selectionCount}
                  onEnterDir={file.isDir ? () => onFileDblClick(file) : undefined}
                  onDownload={onDownload ? () => onDownload(file) : undefined}
                  onRename={onRename ? () => onRename(file) : undefined}
                  onDelete={onDelete ? () => onDelete(file) : undefined}
                  onChmod={onChmod ? () => onChmod(file) : undefined}
                  onNewFolder={() => onKeyAction?.("newFolder")}
                >
                  <FileRow
                    file={file}
                    isSelected={isSelected(file.path)}
                    onClick={(e: React.MouseEvent) =>
                      onFileClick(file, { metaKey: e.metaKey || e.ctrlKey, shiftKey: e.shiftKey })
                    }
                    onDoubleClick={() => onFileDblClick(file)}
                    columnWidths={widths}
                  />
                </FileContextMenu>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
