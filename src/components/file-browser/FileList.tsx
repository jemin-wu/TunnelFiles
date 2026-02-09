/**
 * File List Component - Precision Engineering
 * Supports column width drag resizing
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
  /** Check if file is selected */
  isSelected: (path: string) => boolean;
  /** Selection count */
  selectionCount: number;
  sort: SortSpec;
  onFileClick: (file: FileEntry, modifiers: { metaKey: boolean; shiftKey: boolean }) => void;
  onFileDblClick: (file: FileEntry) => void;
  onSortChange: (field: SortField) => void;
  onDownload?: (file: FileEntry) => void;
  onRename?: (file: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onChmod?: (file: FileEntry) => void;
  /** Keyboard shortcut handler */
  onKeyAction?: (
    action:
      | "selectAll"
      | "clearSelection"
      | "delete"
      | "newFolder"
      | "preview"
      | "parentDir"
      | "rename"
  ) => void;
  isLoading?: boolean;
}

const ROW_HEIGHT = 40;
const ICON_WIDTH = 32;

// Column resize handle component
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

// Header cell component
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
          "h-auto p-0 gap-1 w-full justify-start text-[10px] font-medium text-muted-foreground hover:text-primary hover:bg-transparent transition-colors tracking-wide",
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

// File row component
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
      {/* Icon */}
      <div style={{ width: ICON_WIDTH }} className="flex-shrink-0">
        <FileIcon file={file} />
      </div>

      {/* Name */}
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

      {/* Size */}
      <div
        className="flex-shrink-0 text-right text-xs font-mono text-muted-foreground"
        style={{ width: sizeWidth }}
      >
        {file.isDir ? (
          <span className="text-muted-foreground/50">&mdash;</span>
        ) : (
          formatFileSize(file.size)
        )}
      </div>

      {/* Modified time */}
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

  // Handle column width resize start
  const handleResizeStart = useCallback(
    (column: ColumnKey, e: React.MouseEvent) => {
      const containerWidth = headerRef.current?.clientWidth ?? 0;
      startResize(column, e.clientX, containerWidth);
    },
    [startResize]
  );

  // Get first selected file index
  const getFirstSelectedIndex = useCallback(() => {
    for (let i = 0; i < files.length; i++) {
      if (isSelected(files[i].path)) {
        return i;
      }
    }
    return -1;
  }, [files, isSelected]);

  // Keyboard navigation and shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!parentRef.current?.contains(document.activeElement)) return;

      const currentIndex = getFirstSelectedIndex();
      const modifiers = { metaKey: e.metaKey || e.ctrlKey, shiftKey: e.shiftKey };

      // Escape: clear selection
      if (e.key === "Escape") {
        e.preventDefault();
        onKeyAction?.("clearSelection");
        return;
      }

      // Cmd+A: select all
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        onKeyAction?.("selectAll");
        return;
      }

      // Delete / Cmd+Backspace: delete
      if (e.key === "Delete" || ((e.metaKey || e.ctrlKey) && e.key === "Backspace")) {
        e.preventDefault();
        if (selectionCount > 0) {
          onKeyAction?.("delete");
        }
        return;
      }

      // Cmd+N: new folder
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onKeyAction?.("newFolder");
        return;
      }

      // Space: quick preview (Quick Look)
      if (e.key === " " && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        if (selectionCount === 1 && currentIndex >= 0) {
          onKeyAction?.("preview");
        }
        return;
      }

      // Cmd+Up: go to parent directory
      if ((e.metaKey || e.ctrlKey) && e.key === "ArrowUp") {
        e.preventDefault();
        onKeyAction?.("parentDir");
        return;
      }

      // Cmd+R / F2: rename
      if (((e.metaKey || e.ctrlKey) && e.key === "r") || e.key === "F2") {
        e.preventDefault();
        if (selectionCount === 1) {
          onKeyAction?.("rename");
        }
        return;
      }

      // Arrow key navigation
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
    [
      files,
      getFirstSelectedIndex,
      isSelected,
      selectionCount,
      onFileClick,
      onFileDblClick,
      onKeyAction,
      virtualizer,
    ]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Empty state
  if (!isLoading && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground animate-fade-in">
        <div className="w-14 h-14 flex items-center justify-center rounded-lg bg-muted/50 border border-border">
          <FolderOpen className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <p className="text-sm mt-4">Directory is empty</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Drag files here to upload</p>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();
  const nameWidth = widths.name;
  const sizeWidth = widths.size;
  const mtimeWidth = widths.mtime;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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
          Name
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
          Size
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
          Modified
        </HeaderCell>
      </div>

      {/* Virtual list */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        tabIndex={0}
        onClick={(e) => {
          // Click empty area to clear selection
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
            // Click virtual container empty area to clear selection
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
