/**
 * File List Component - Precision Engineering
 * Supports column width drag resizing
 */

import { useRef, useCallback, useEffect, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronUp, ChevronDown, FolderOpen, Loader2 } from "lucide-react";

import { FileIcon } from "./FileIcon";
import { FileContextMenu } from "./FileContextMenu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatFileTime } from "@/lib/file";
import { formatFileSize, formatFileMode } from "@/types/file";
import { cn } from "@/lib/utils";
import {
  useColumnWidths,
  ICON_WIDTH,
  PERM_WIDTH,
  type ColumnKey,
  type ColumnWidths,
} from "@/hooks/useColumnWidths";
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

const ROW_HEIGHT = 32;

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
          "h-auto p-0 px-2 gap-1 w-full justify-start text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-primary hover:bg-transparent transition-colors",
          isActive && "text-primary bg-primary/5",
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
        "flex items-center px-3 cursor-pointer select-none border-l-[3px] border-l-transparent",
        "hover:bg-accent/5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:ring-inset",
        isSelected && "bg-primary/10 !border-l-primary",
        className
      )}
      style={{ height: ROW_HEIGHT }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDoubleClick();
      }}
      {...rest}
    >
      {/* Icon */}
      <div style={{ width: ICON_WIDTH }} className="flex-shrink-0 flex items-center">
        <FileIcon file={file} className="h-3.5 w-3.5" />
      </div>

      {/* Name */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "min-w-0 truncate text-xs px-2",
              file.isDir ? "text-foreground font-medium" : "text-foreground/80"
            )}
            style={nameWidth > 0 ? { width: nameWidth, flexShrink: 0 } : { flex: 1 }}
          >
            {file.name}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="font-mono text-xs">
          {file.name}
        </TooltipContent>
      </Tooltip>

      {/* Size */}
      <div
        className="flex-shrink-0 text-right text-[11px] font-mono text-muted-foreground px-2"
        style={{ width: sizeWidth }}
      >
        {file.isDir ? (
          <span className="text-muted-foreground/40">&mdash;</span>
        ) : (
          formatFileSize(file.size)
        )}
      </div>

      {/* Permissions */}
      <div
        className="flex-shrink-0 text-right text-[11px] font-mono text-muted-foreground px-2"
        style={{ width: PERM_WIDTH }}
      >
        {formatFileMode(file.mode)}
      </div>

      {/* Modified time */}
      <div
        className="flex-shrink-0 text-right text-[11px] font-mono text-muted-foreground pr-2"
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

  // Loading state
  if (isLoading && files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  // Empty state
  if (!isLoading && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground animate-fade-in">
        <div className="flex flex-col items-center gap-3 px-8 py-6 border border-dashed border-border/50 rounded-lg">
          <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-muted/30 border border-border/50">
            <FolderOpen className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-xs">Directory is empty</p>
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-[11px] text-muted-foreground/50">Drag files here to upload</p>
            <p className="text-[11px] text-muted-foreground/40">
              or press &#8984;N to create a folder
            </p>
          </div>
        </div>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();
  const nameWidth = widths.name;
  const sizeWidth = widths.size;
  const mtimeWidth = widths.mtime;

  return (
    <TooltipProvider delayDuration={500}>
      <div className="flex flex-col h-full" role="grid" aria-label="File list">
        {/* Header */}
        <div
          ref={headerRef}
          role="row"
          className="flex items-center h-7 px-3 border-b border-border bg-card/30 flex-shrink-0"
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
          <div
            className="flex-shrink-0 flex items-center justify-end px-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider"
            style={{ width: PERM_WIDTH }}
          >
            Perms
          </div>
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
          >
            {items.map((virtualItem) => {
              const file = files[virtualItem.index];
              if (!file) return null;
              const isEven = virtualItem.index % 2 === 0;
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
                      className={isEven ? "bg-muted/[0.07]" : undefined}
                    />
                  </FileContextMenu>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
