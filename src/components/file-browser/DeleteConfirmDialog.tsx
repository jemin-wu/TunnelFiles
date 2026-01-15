/**
 * 删除确认弹窗 - Cyberpunk Terminal Style
 */

import { Loader2, Trash2, AlertTriangle, Folder, File } from "lucide-react";

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
import type { FileEntry } from "@/types";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileEntry | null;
  onConfirm: () => void;
  isPending?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  file,
  onConfirm,
  isPending = false,
}: DeleteConfirmDialogProps) {
  if (!file) return null;

  const Icon = file.isDir ? Folder : File;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-destructive/30 bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-mono text-destructive">
            <Trash2 className="h-4 w-4" />
            <span>&gt;</span>
            <span>DELETE_CONFIRM</span>
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2">
              {/* Target info */}
              <div className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded px-3 py-2 font-mono text-sm">
                <Icon className="h-4 w-4 text-destructive/70 shrink-0" />
                <span className="text-foreground truncate">{file.name}</span>
              </div>

              {/* Warning for directory */}
              {file.isDir && (
                <div className="flex items-start gap-2 text-xs font-mono text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>注意：仅支持删除空文件夹</span>
                </div>
              )}

              {/* Confirmation message */}
              <div className="text-xs font-mono text-muted-foreground">
                <span className="text-destructive">!</span> 此操作无法撤销，确定要删除吗？
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={isPending} className="font-mono text-xs btn-cyber">
            CANCEL
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="font-mono text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            DELETE
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
