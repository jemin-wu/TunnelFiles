/**
 * 文件右键菜单 - Cyberpunk Terminal Style
 * 支持单选和多选操作
 */

import { useCallback } from "react";
import { Download, Pencil, Trash2, FolderOpen, FolderPlus, Copy, Files } from "lucide-react";

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
  /** 当前右键点击的文件 */
  file: FileEntry;
  /** 选中的文件数量（用于显示批量操作） */
  selectionCount?: number;
  children: React.ReactNode;
  onEnterDir?: () => void;
  onDownload?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onNewFolder?: () => void;
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
}: FileContextMenuProps) {
  const isMultiSelect = selectionCount > 1;

  // 复制路径到剪贴板
  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(file.path);
      showSuccessToast("路径已复制");
    } catch (error) {
      showErrorToast(error);
    }
  }, [file.path]);

  // 复制文件名到剪贴板
  const handleCopyName = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(file.name);
      showSuccessToast("文件名已复制");
    } catch (error) {
      showErrorToast(error);
    }
  }, [file.name]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52 font-mono border-border bg-card">
        {/* 目录专属：进入 */}
        {file.isDir && onEnterDir && !isMultiSelect && (
          <>
            <ContextMenuItem onClick={onEnterDir} className="text-xs gap-2 justify-between">
              <span className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-primary" />
                <span>CD_INTO</span>
              </span>
              <span className="text-muted-foreground text-[10px]">↵</span>
            </ContextMenuItem>
            <ContextMenuSeparator className="bg-border" />
          </>
        )}

        {/* 下载 - 支持批量 */}
        {onDownload && (
          <ContextMenuItem onClick={onDownload} className="text-xs gap-2">
            <Download className="h-3.5 w-3.5 text-primary" />
            <span>{isMultiSelect ? `DOWNLOAD_${selectionCount}_ITEMS` : "DOWNLOAD"}</span>
          </ContextMenuItem>
        )}

        {/* 复制操作组 */}
        <ContextMenuSeparator className="bg-border" />

        <ContextMenuItem onClick={handleCopyPath} className="text-xs gap-2">
          <Copy className="h-3.5 w-3.5" />
          <span>COPY_PATH</span>
        </ContextMenuItem>

        {!isMultiSelect && (
          <ContextMenuItem onClick={handleCopyName} className="text-xs gap-2">
            <Files className="h-3.5 w-3.5" />
            <span>COPY_NAME</span>
          </ContextMenuItem>
        )}

        {/* 编辑操作组 */}
        <ContextMenuSeparator className="bg-border" />

        {/* 新建文件夹 */}
        {onNewFolder && (
          <ContextMenuItem onClick={onNewFolder} className="text-xs gap-2 justify-between">
            <span className="flex items-center gap-2">
              <FolderPlus className="h-3.5 w-3.5 text-primary" />
              <span>NEW_FOLDER</span>
            </span>
            <span className="text-muted-foreground text-[10px]">⌘N</span>
          </ContextMenuItem>
        )}

        {/* 重命名 - 仅单选 */}
        {!isMultiSelect && onRename && (
          <ContextMenuItem onClick={onRename} className="text-xs gap-2 justify-between">
            <span className="flex items-center gap-2">
              <Pencil className="h-3.5 w-3.5" />
              <span>RENAME</span>
            </span>
            <span className="text-muted-foreground text-[10px]">⌘R</span>
          </ContextMenuItem>
        )}

        <ContextMenuSeparator className="bg-border" />

        {/* 删除 - 支持批量 */}
        <ContextMenuItem variant="destructive" onClick={onDelete} className="text-xs gap-2 justify-between">
          <span className="flex items-center gap-2">
            <Trash2 className="h-3.5 w-3.5" />
            <span>{isMultiSelect ? `DELETE_${selectionCount}_ITEMS` : "DELETE"}</span>
          </span>
          <span className="text-[10px] opacity-70">⌘⌫</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
