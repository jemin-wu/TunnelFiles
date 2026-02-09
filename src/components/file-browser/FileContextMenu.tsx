/**
 * File Context Menu - Precision Engineering
 * Supports single and multi-selection operations
 */

import { useCallback } from "react";
import {
  Download,
  Pencil,
  Trash2,
  FolderOpen,
  FolderPlus,
  Copy,
  Files,
  Shield,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { showSuccessToast, showErrorToast } from "@/lib/error";
import type { FileEntry } from "@/types";

interface FileContextMenuProps {
  /** The file that was right-clicked */
  file: FileEntry;
  /** Number of selected files (for batch operations) */
  selectionCount?: number;
  children: React.ReactNode;
  onEnterDir?: () => void;
  onDownload?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onNewFolder?: () => void;
  onChmod?: () => void;
}

export function FileContextMenu({
  file,
  selectionCount = 1,
  children,
  onEnterDir,
  onDownload,
  onRename,
  onDelete,
  onNewFolder,
  onChmod,
}: FileContextMenuProps) {
  const isMultiSelect = selectionCount > 1;

  // Copy path to clipboard
  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(file.path);
      showSuccessToast("Path copied");
    } catch (error) {
      showErrorToast(error);
    }
  }, [file.path]);

  // Copy file name to clipboard
  const handleCopyName = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(file.name);
      showSuccessToast("Name copied");
    } catch (error) {
      showErrorToast(error);
    }
  }, [file.name]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52 border-border bg-card">
        {/* Directory only: enter */}
        {file.isDir && onEnterDir && !isMultiSelect && (
          <>
            <ContextMenuItem onClick={onEnterDir} className="text-xs gap-2 justify-between">
              <span className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-primary" />
                <span>Open</span>
              </span>
              <span className="text-muted-foreground text-[10px]">↵</span>
            </ContextMenuItem>
            <ContextMenuSeparator className="bg-border" />
          </>
        )}

        {/* Download - supports batch */}
        {onDownload && (
          <ContextMenuItem onClick={onDownload} className="text-xs gap-2">
            <Download className="h-3.5 w-3.5 text-primary" />
            <span>{isMultiSelect ? `Download ${selectionCount} items` : "Download"}</span>
          </ContextMenuItem>
        )}

        {/* Copy operations */}
        <ContextMenuSeparator className="bg-border" />

        <ContextMenuItem onClick={handleCopyPath} className="text-xs gap-2">
          <Copy className="h-3.5 w-3.5" />
          <span>Copy path</span>
        </ContextMenuItem>

        {!isMultiSelect && (
          <ContextMenuItem onClick={handleCopyName} className="text-xs gap-2">
            <Files className="h-3.5 w-3.5" />
            <span>Copy name</span>
          </ContextMenuItem>
        )}

        {/* Edit operations */}
        <ContextMenuSeparator className="bg-border" />

        {/* New folder */}
        {onNewFolder && (
          <ContextMenuItem onClick={onNewFolder} className="text-xs gap-2 justify-between">
            <span className="flex items-center gap-2">
              <FolderPlus className="h-3.5 w-3.5 text-primary" />
              <span>New folder</span>
            </span>
            <span className="text-muted-foreground text-[10px]">⌘N</span>
          </ContextMenuItem>
        )}

        {/* Rename - single selection only */}
        {!isMultiSelect && onRename && (
          <ContextMenuItem onClick={onRename} className="text-xs gap-2 justify-between">
            <span className="flex items-center gap-2">
              <Pencil className="h-3.5 w-3.5" />
              <span>Rename</span>
            </span>
            <span className="text-muted-foreground text-[10px]">⌘R</span>
          </ContextMenuItem>
        )}

        {/* Change permissions - supports batch */}
        {onChmod && (
          <ContextMenuItem onClick={onChmod} className="text-xs gap-2">
            <Shield className="h-3.5 w-3.5" />
            <span>{isMultiSelect ? `Chmod ${selectionCount} items` : "Chmod"}</span>
          </ContextMenuItem>
        )}

        <ContextMenuSeparator className="bg-border" />

        {/* Delete current file (no batch, always operates on right-clicked file) */}
        <ContextMenuItem
          variant="destructive"
          onClick={onDelete}
          className="text-xs gap-2 justify-between"
        >
          <span className="flex items-center gap-2">
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </span>
          <span className="text-[10px] opacity-70">⌘⌫</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
