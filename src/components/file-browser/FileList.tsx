/**
 * File List Component - Precision Engineering
 */

import { useRef, useCallback, useEffect, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronUp, ChevronDown, FolderOpen, Search, X } from "lucide-react";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FileIcon } from "./FileIcon";
import { FileContextMenu } from "./FileContextMenu";
import { Button } from "@/components/ui/button";
import { formatFileTime } from "@/lib/file";
import { formatFileSize, formatFileMode } from "@/types/file";
import { cn } from "@/lib/utils";
import { formatShortcut } from "@/lib/platform";
import type { FileEntry, SortField, SortSpec } from "@/types";

interface FileListProps {
  files: FileEntry[];
  /** Check if file is selected */
  isSelected: (path: string) => boolean;
  /** Selection count */
  selectionCount: number;
  sort: SortSpec | null;
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
  /** Directory filter */
  filterQuery?: string;
  onFilterChange?: (query: string) => void;
}

const ROW_HEIGHT = 36;
const ICON_WIDTH = 24;
const PERM_WIDTH = 88;
const SIZE_WIDTH = 72;
const MTIME_WIDTH = 120;

// Header cell component
interface HeaderCellProps {
  field: SortField;
  currentSort: SortSpec | null;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function HeaderCell({ field, currentSort, onSort, children, className, style }: HeaderCellProps) {
  const isActive = currentSort?.field === field;

  return (
    <div className={cn("flex", className)} style={style}>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "text-muted-foreground hover:text-primary h-auto gap-1 p-0 text-xs font-medium tracking-wider uppercase transition-colors duration-100 hover:bg-transparent! has-[>svg]:px-0",
          isActive && "text-primary"
        )}
        onClick={() => onSort(field)}
        aria-label={`Sort by ${field}`}
      >
        {children}
        {isActive ? (
          currentSort!.order === "asc" ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )
        ) : (
          <ChevronUp className="size-3 opacity-0" />
        )}
      </Button>
    </div>
  );
}

// File row component
interface FileRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onClick"> {
  file: FileEntry;
  isSelected: boolean;
  onFileClick: (file: FileEntry, modifiers: { metaKey: boolean; shiftKey: boolean }) => void;
  onFileDblClick: (file: FileEntry) => void;
}

const FileRow = memo(function FileRow({
  file,
  isSelected,
  onFileClick,
  onFileDblClick,
  className,
  style,
  ...rest
}: FileRowProps) {
  return (
    <div
      role="row"
      aria-selected={isSelected}
      tabIndex={0}
      data-file-name={file.name}
      data-file-path={file.path}
      data-file-type={file.isDir ? "dir" : "file"}
      className={cn(
        "flex cursor-pointer items-center overflow-hidden border-l-[3px] border-l-transparent px-3 select-none",
        "hover:bg-accent/50 transition-colors duration-100",
        "focus-visible:ring-ring/50 focus-visible:ring-1 focus-visible:outline-none focus-visible:ring-inset",
        isSelected && "bg-primary/10 !border-l-primary",
        className
      )}
      style={{ ...style, height: ROW_HEIGHT }}
      onClick={(e) => onFileClick(file, { metaKey: e.metaKey || e.ctrlKey, shiftKey: e.shiftKey })}
      onDoubleClick={() => onFileDblClick(file)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onFileDblClick(file);
      }}
      {...rest}
    >
      {/* Icon */}
      <div style={{ width: ICON_WIDTH }} className="flex flex-shrink-0 items-center">
        <FileIcon file={file} className="size-3.5" />
      </div>

      {/* Name */}
      <div
        title={file.name}
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          file.isDir ? "text-foreground font-medium" : "text-foreground/80"
        )}
      >
        {file.name}
      </div>

      {/* Size */}
      <div
        className="text-muted-foreground flex-shrink-0 text-right font-mono text-xs"
        style={{ width: SIZE_WIDTH }}
      >
        {file.isDir ? (
          <span className="text-muted-foreground/40">&mdash;</span>
        ) : (
          formatFileSize(file.size)
        )}
      </div>

      {/* Permissions */}
      <div
        className="text-muted-foreground flex-shrink-0 text-right font-mono text-xs"
        style={{ width: PERM_WIDTH }}
      >
        {formatFileMode(file.mode)}
      </div>

      {/* Modified time */}
      <div
        className="text-muted-foreground flex-shrink-0 text-right font-mono text-xs"
        style={{ width: MTIME_WIDTH }}
      >
        {formatFileTime(file.mtime)}
      </div>
    </div>
  );
});

function FilterBar({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="border-border bg-muted/30 flex h-7 items-center gap-1.5 border-b px-3">
      <Search className="text-muted-foreground size-3" />
      <span className="text-xs">
        Filter: <span className="text-foreground font-medium">{query}</span>
      </span>
      <button
        onClick={onClear}
        className="text-muted-foreground hover:text-foreground ml-auto"
        aria-label="Clear filter"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

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
  filterQuery = "",
  onFilterChange,
}: FileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

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

      // Escape: clear filter first, then clear selection
      if (e.key === "Escape") {
        e.preventDefault();
        if (filterQuery) {
          onFilterChange?.("");
        } else {
          onKeyAction?.("clearSelection");
        }
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

      // Space: filter character when filter active, otherwise preview
      if (e.key === " " && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        if (filterQuery) {
          onFilterChange?.(filterQuery + " ");
        } else if (selectionCount === 1 && currentIndex >= 0) {
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

      // Backspace: remove last filter character
      if (e.key === "Backspace" && filterQuery && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onFilterChange?.(filterQuery.slice(0, -1));
        return;
      }

      // Alphanumeric typing: activate/extend filter
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && /^[a-zA-Z0-9._-]$/.test(e.key)) {
        e.preventDefault();
        onFilterChange?.((filterQuery ?? "") + e.key);
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
      filterQuery,
      onFilterChange,
    ]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Loading state
  if (isLoading && files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  // Filter no-match state
  if (!isLoading && files.length === 0 && filterQuery) {
    return (
      <div className="flex h-full flex-col">
        <FilterBar query={filterQuery} onClear={() => onFilterChange?.("")} />
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2">
          <p className="text-sm">No matches for &quot;{filterQuery}&quot;</p>
          <Button variant="ghost" size="sm" onClick={() => onFilterChange?.("")}>
            Clear filter
          </Button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!isLoading && files.length === 0) {
    return (
      <div className="text-muted-foreground animate-fade-in flex h-full flex-col items-center justify-center">
        <div className="border-border/50 flex flex-col items-center gap-3 rounded-lg border border-dashed px-8 py-6">
          <div className="bg-muted/30 border-border/50 flex h-10 w-10 items-center justify-center rounded-lg border">
            <FolderOpen className="text-muted-foreground/50 size-6" />
          </div>
          <p className="text-sm">Directory is empty</p>
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-muted-foreground/50 text-xs">Drag files here to upload</p>
            <p className="text-muted-foreground/40 text-xs">
              or press {formatShortcut("Mod+N")} to create a folder
            </p>
          </div>
        </div>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col" role="grid" aria-label="File list">
      {/* Filter bar */}
      {filterQuery && <FilterBar query={filterQuery} onClear={() => onFilterChange?.("")} />}

      {/* Header */}
      <div
        role="row"
        className="border-border bg-card/30 flex h-8 flex-shrink-0 items-center overflow-hidden border-b px-3"
      >
        <div style={{ width: ICON_WIDTH }} className="flex-shrink-0" />
        <HeaderCell field="name" currentSort={sort} onSort={onSortChange} style={{ flex: 1 }}>
          Name
        </HeaderCell>
        <HeaderCell
          field="size"
          currentSort={sort}
          onSort={onSortChange}
          className="justify-end"
          style={{ width: SIZE_WIDTH, flexShrink: 0 }}
        >
          Size
        </HeaderCell>
        <div
          className="text-muted-foreground flex flex-shrink-0 items-center justify-end text-xs font-medium tracking-wider uppercase"
          style={{ width: PERM_WIDTH }}
        >
          Perms
        </div>
        <HeaderCell
          field="mtime"
          currentSort={sort}
          onSort={onSortChange}
          className="justify-end"
          style={{ width: MTIME_WIDTH, flexShrink: 0 }}
        >
          Modified
        </HeaderCell>
      </div>

      {/* Virtual list */}
      <div
        ref={parentRef}
        role="rowgroup"
        aria-label="File entries"
        className="flex-1 overflow-x-hidden overflow-y-auto"
        tabIndex={0}
        onClick={(e) => {
          // Click empty area to clear selection
          if (e.target === e.currentTarget) {
            onKeyAction?.("clearSelection");
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
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
                  isFileInSelection={isSelected(file.path)}
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
                    onFileClick={onFileClick}
                    onFileDblClick={onFileDblClick}
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
