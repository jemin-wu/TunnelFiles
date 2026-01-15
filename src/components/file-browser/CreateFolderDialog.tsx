/**
 * 新建文件夹弹窗 - Cyberpunk Terminal Style
 */

import { useState, useCallback } from "react";
import { Loader2, FolderPlus, Terminal } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
  isPending?: boolean;
}

// 校验文件夹名称
function validateFolderName(name: string): string | null {
  if (!name.trim()) {
    return "文件夹名称不能为空";
  }
  if (name.includes("/")) {
    return "文件夹名称不能包含 /";
  }
  if (name.includes("\0")) {
    return "文件夹名称包含非法字符";
  }
  if (name === "." || name === "..") {
    return "文件夹名称不能是 . 或 ..";
  }
  return null;
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending = false,
}: CreateFolderDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setName("");
        setError(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const validationError = validateFolderName(name);
      if (validationError) {
        setError(validationError);
        return;
      }
      onSubmit(name.trim());
    },
    [name, onSubmit]
  );

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setError(null);
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md border-border bg-card" showCloseButton={!isPending}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono">
              <FolderPlus className="h-4 w-4 text-primary" />
              <span className="text-primary">&gt;</span>
              <span>MKDIR</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <Label htmlFor="folder-name" className="text-xs font-mono text-muted-foreground">
              <Terminal className="inline h-3 w-3 mr-1" />
              输入文件夹名称
            </Label>
            <Input
              id="folder-name"
              value={name}
              onChange={handleNameChange}
              placeholder="new_folder"
              disabled={isPending}
              autoFocus
              className={`font-mono bg-background/50 ${error ? "border-destructive focus-visible:ring-destructive" : "border-border focus-visible:ring-primary"}`}
            />
            {error && (
              <p className="text-xs text-destructive font-mono flex items-center gap-1">
                <span className="text-destructive">!</span> {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="font-mono text-xs btn-cyber"
            >
              CANCEL
            </Button>
            <Button
              type="submit"
              disabled={isPending || !name.trim()}
              className="font-mono text-xs btn-cyber"
            >
              {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              CREATE
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
