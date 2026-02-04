/**
 * 删除确认弹窗 - Cyberpunk Terminal Style
 *
 * 支持：
 * - 文件删除
 * - 空目录删除
 * - 非空目录递归删除（显示统计信息和进度）
 */

import { Loader2, Trash2, AlertTriangle, Folder, File, HardDrive } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/types/file";
import type { FileEntry, DirectoryStats, DeleteProgress } from "@/types/file";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileEntry | null;
  onConfirm: () => void;
  isPending?: boolean;
  /** 目录统计信息（非空目录时显示） */
  stats?: DirectoryStats | null;
  /** 是否正在加载统计信息 */
  isLoadingStats?: boolean;
  /** 删除进度（递归删除时显示） */
  progress?: DeleteProgress | null;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  file,
  onConfirm,
  isPending = false,
  stats,
  isLoadingStats = false,
  progress,
}: DeleteConfirmDialogProps) {
  if (!file) return null;

  const Icon = file.isDir ? Folder : File;
  const isNonEmptyDir = file.isDir && stats && (stats.fileCount > 0 || stats.dirCount > 0);
  const isDeleting = isPending && progress !== null && progress !== undefined;

  // 计算删除进度百分比
  const progressPercent = progress
    ? Math.round((progress.deletedCount / Math.max(progress.totalCount, 1)) * 100)
    : 0;

  return (
    <AlertDialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <AlertDialogContent className="border-destructive/30 bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-mono text-destructive">
            <Trash2 className="h-4 w-4" />
            <span>&gt;</span>
            <span>{isDeleting ? "DELETING" : "DELETE_CONFIRM"}</span>
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2">
              {/* Target info */}
              <div className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded px-3 py-2 font-mono text-sm">
                <Icon className="h-4 w-4 text-destructive/70 shrink-0" />
                <span className="text-foreground truncate">{file.name}</span>
              </div>

              {/* Loading stats indicator */}
              {file.isDir && isLoadingStats && (
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>正在扫描目录...</span>
                </div>
              )}

              {/* Directory stats for non-empty directories */}
              {isNonEmptyDir && !isLoadingStats && !isDeleting && (
                <div className="space-y-2 bg-amber-500/5 border border-amber-500/20 rounded p-3">
                  <div className="flex items-start gap-2 text-xs font-mono text-amber-500">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>警告：此目录包含以下内容</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="flex flex-col items-center p-2 bg-background/30 rounded">
                      <File className="h-3.5 w-3.5 text-muted-foreground mb-1" />
                      <span className="text-foreground font-semibold">{stats.fileCount}</span>
                      <span className="text-muted-foreground text-[10px]">文件</span>
                    </div>
                    <div className="flex flex-col items-center p-2 bg-background/30 rounded">
                      <Folder className="h-3.5 w-3.5 text-muted-foreground mb-1" />
                      <span className="text-foreground font-semibold">{stats.dirCount}</span>
                      <span className="text-muted-foreground text-[10px]">目录</span>
                    </div>
                    <div className="flex flex-col items-center p-2 bg-background/30 rounded">
                      <HardDrive className="h-3.5 w-3.5 text-muted-foreground mb-1" />
                      <span className="text-foreground font-semibold">{formatFileSize(stats.totalSize)}</span>
                      <span className="text-muted-foreground text-[10px]">总大小</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning for empty directory (original behavior) */}
              {file.isDir && !isNonEmptyDir && !isLoadingStats && !isDeleting && (
                <div className="flex items-start gap-2 text-xs font-mono text-muted-foreground">
                  <Folder className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>空目录</span>
                </div>
              )}

              {/* Delete progress */}
              {isDeleting && progress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground">进度</span>
                    <span className="text-foreground">
                      {progress.deletedCount} / {progress.totalCount}
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                  <div className="text-[10px] font-mono text-muted-foreground truncate">
                    <span className="text-destructive/70">→</span> {progress.currentPath}
                  </div>
                </div>
              )}

              {/* Confirmation message */}
              {!isDeleting && (
                <div className="text-xs font-mono text-muted-foreground">
                  <span className="text-destructive">!</span> 此操作无法撤销，确定要删除吗？
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            disabled={isPending}
            className="font-mono text-xs btn-cyber"
          >
            {isDeleting ? "关闭" : "CANCEL"}
          </AlertDialogCancel>
          {!isDeleting && (
            <AlertDialogAction
              onClick={onConfirm}
              disabled={isPending || isLoadingStats}
              className="font-mono text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {isNonEmptyDir ? "DELETE_ALL" : "DELETE"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
