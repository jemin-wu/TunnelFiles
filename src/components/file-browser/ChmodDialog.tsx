/**
 * Change Permissions Dialog - Precision Engineering
 *
 * Supports single and multi-file permission changes
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { Loader2, Shield, FileText, Folder } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  /** Whether the dialog is open */
  open: boolean;
  /** Open state change handler */
  onOpenChange: (open: boolean) => void;
  /** Selected file list */
  files: FileEntry[];
  /** Submit callback (mode is octal permission value) */
  onSubmit: (mode: number) => void;
  /** Whether submission is pending */
  isPending: boolean;
}

/**
 * Calculate initial permissions from file list
 * - Single file: use file permissions directly
 * - Multiple files: use first file with permissions, otherwise default 644
 */
function getInitialMode(files: FileEntry[]): number {
  for (const file of files) {
    if (file.mode !== undefined) {
      // Only take lower 9 bits (permission bits)
      return file.mode & 0o777;
    }
  }
  return 0o644; // default
}

export function ChmodDialog({ open, onOpenChange, files, onSubmit, isPending }: ChmodDialogProps) {
  const initialMode = useMemo(() => getInitialMode(files), [files]);
  const [permissions, setPermissions] = useState<PermissionBits>(() =>
    modeToPermissions(initialMode)
  );

  // Reset permissions when dialog opens (using memoized initialMode to avoid unexpected resets from files reference changes)
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
      <DialogContent className="border-border bg-card sm:max-w-md" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="text-primary h-4 w-4" />
            <span>Change permissions</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Set read, write, and execute permissions for the selected items
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selected file list */}
          <div className="space-y-2">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span>Selected:</span>
              <span>
                {files.length} {files.length === 1 ? "item" : "items"}
              </span>
            </div>

            <ScrollArea className="bg-background/30 border-border/50 h-24 rounded border">
              <div className="space-y-1 p-2">
                {files.map((file) => (
                  <div
                    key={file.path}
                    className="text-muted-foreground flex items-center gap-2 font-mono text-xs"
                  >
                    {file.isDir ? (
                      <Folder className="text-primary h-3 w-3 shrink-0" />
                    ) : (
                      <FileText className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">{file.name}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Permission matrix */}
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
            size="sm"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
