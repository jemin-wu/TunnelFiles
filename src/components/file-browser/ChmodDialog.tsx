/**
 * 权限修改弹窗 - Cyberpunk Terminal Style
 *
 * 支持单选和多选文件的权限修改
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { Loader2, Shield, FileText, Folder } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PermissionMatrix } from "./PermissionMatrix";
import { modeToPermissions, permissionsToMode } from "@/lib/file";
import type { FileEntry, PermissionBits } from "@/types/file";

interface ChmodDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 打开状态变更 */
  onOpenChange: (open: boolean) => void;
  /** 选中的文件列表 */
  files: FileEntry[];
  /** 提交回调 (mode 为八进制权限值) */
  onSubmit: (mode: number) => void;
  /** 是否正在提交 */
  isPending: boolean;
}

/**
 * 从文件列表计算初始权限
 * - 单文件: 直接使用文件权限
 * - 多文件: 使用第一个有权限的文件，否则默认 644
 */
function getInitialMode(files: FileEntry[]): number {
  for (const file of files) {
    if (file.mode !== undefined) {
      // 只取低 9 位 (权限位)
      return file.mode & 0o777;
    }
  }
  return 0o644; // 默认
}

export function ChmodDialog({ open, onOpenChange, files, onSubmit, isPending }: ChmodDialogProps) {
  const initialMode = useMemo(() => getInitialMode(files), [files]);
  const [permissions, setPermissions] = useState<PermissionBits>(() =>
    modeToPermissions(initialMode)
  );

  // 当 dialog 打开时重置权限（使用已 memoize 的 initialMode，避免 files 引用变化导致意外重置）
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when dialog opens
      setPermissions(modeToPermissions(initialMode));
    }
  }, [open, initialMode]);

  const handleSubmit = useCallback(() => {
    const mode = permissionsToMode(permissions);
    onSubmit(mode);
  }, [permissions, onSubmit]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border bg-card" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-primary">&gt;</span>
            <span>CHMOD_PERMISSIONS</span>
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* 选中文件列表 */}
          <div className="space-y-2">
            <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
              <span className="text-primary">SELECTED:</span>
              <span>
                {files.length} {files.length === 1 ? "item" : "items"}
              </span>
            </div>

            <ScrollArea className="h-24 bg-background/30 rounded border border-border/50">
              <div className="p-2 space-y-1">
                {files.map((file) => (
                  <div
                    key={file.path}
                    className="text-xs font-mono flex items-center gap-2 text-muted-foreground"
                  >
                    {file.isDir ? (
                      <Folder className="h-3 w-3 text-primary shrink-0" />
                    ) : (
                      <FileText className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">{file.name}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* 权限矩阵 */}
          <PermissionMatrix
            permissions={permissions}
            onChange={setPermissions}
            disabled={isPending}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isPending}
            className="font-mono text-xs btn-cyber"
          >
            CANCEL
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="font-mono text-xs btn-cyber"
          >
            {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            APPLY
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
