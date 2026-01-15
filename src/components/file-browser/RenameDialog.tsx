/**
 * 重命名弹窗 - Cyberpunk Terminal Style
 */

import { useState, useCallback } from "react";
import { Loader2, Pencil, Terminal } from "lucide-react";

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

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onSubmit: (newName: string) => void;
  isPending?: boolean;
}

// 校验文件名
function validateName(name: string, originalName: string): string | null {
  if (!name.trim()) {
    return "名称不能为空";
  }
  if (name.includes("/")) {
    return "名称不能包含 /";
  }
  if (name.includes("\0")) {
    return "名称包含非法字符";
  }
  if (name === "." || name === "..") {
    return "名称不能是 . 或 ..";
  }
  if (name.trim() === originalName) {
    return "新名称与原名称相同";
  }
  return null;
}

export function RenameDialog({
  open,
  onOpenChange,
  currentName,
  onSubmit,
  isPending = false,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setName(currentName);
        setError(null);
      }
      onOpenChange(nextOpen);
    },
    [currentName, onOpenChange]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const validationError = validateName(name, currentName);
      if (validationError) {
        setError(validationError);
        return;
      }
      onSubmit(name.trim());
    },
    [name, currentName, onSubmit]
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
              <Pencil className="h-4 w-4 text-primary" />
              <span className="text-primary">&gt;</span>
              <span>RENAME</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-3">
            {/* 当前名称 */}
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-background/30 px-3 py-2 rounded">
              <span className="text-primary">FROM:</span>
              <span className="text-foreground truncate">{currentName}</span>
            </div>

            <Label htmlFor="new-name" className="text-xs font-mono text-muted-foreground">
              <Terminal className="inline h-3 w-3 mr-1" />
              输入新名称
            </Label>
            <Input
              id="new-name"
              value={name}
              onChange={handleNameChange}
              placeholder="new_name"
              disabled={isPending}
              autoFocus
              onFocus={(e) => {
                // 选中文件名部分（不含扩展名）
                const dotIndex = e.target.value.lastIndexOf(".");
                if (dotIndex > 0) {
                  e.target.setSelectionRange(0, dotIndex);
                } else {
                  e.target.select();
                }
              }}
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
              CONFIRM
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
