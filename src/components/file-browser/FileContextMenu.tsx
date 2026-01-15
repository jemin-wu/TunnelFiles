/**
 * 文件右键菜单 - Cyberpunk Terminal Style
 */

import { Download, Pencil, Trash2, FolderOpen } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { FileEntry } from "@/types";

interface FileContextMenuProps {
  file: FileEntry;
  children: React.ReactNode;
  onEnterDir?: () => void;
  onDownload?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

export function FileContextMenu({
  file,
  children,
  onEnterDir,
  onDownload,
  onRename,
  onDelete,
}: FileContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48 font-mono border-border bg-card">
        {/* 目录专属：进入 */}
        {file.isDir && onEnterDir && (
          <>
            <ContextMenuItem onClick={onEnterDir} className="text-xs gap-2">
              <FolderOpen className="h-3.5 w-3.5 text-primary" />
              <span>CD_INTO</span>
            </ContextMenuItem>
            <ContextMenuSeparator className="bg-border" />
          </>
        )}

        {/* 下载 */}
        {onDownload && (
          <ContextMenuItem onClick={onDownload} className="text-xs gap-2">
            <Download className="h-3.5 w-3.5 text-primary" />
            <span>DOWNLOAD</span>
          </ContextMenuItem>
        )}

        {/* 重命名 */}
        <ContextMenuItem onClick={onRename} className="text-xs gap-2">
          <Pencil className="h-3.5 w-3.5" />
          <span>RENAME</span>
        </ContextMenuItem>

        <ContextMenuSeparator className="bg-border" />

        {/* 删除 */}
        <ContextMenuItem variant="destructive" onClick={onDelete} className="text-xs gap-2">
          <Trash2 className="h-3.5 w-3.5" />
          <span>DELETE</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
