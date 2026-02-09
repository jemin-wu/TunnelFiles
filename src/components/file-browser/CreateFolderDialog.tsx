/**
 * Create Folder Dialog - Precision Engineering
 */

import { useState, useCallback } from "react";
import { Loader2, FolderPlus } from "lucide-react";

import { cn } from "@/lib/utils";
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

// Validate folder name
function validateFolderName(name: string): string | null {
  if (!name.trim()) {
    return "Folder name cannot be empty";
  }
  if (name.includes("/")) {
    return "Folder name cannot contain /";
  }
  if (name.includes("\0")) {
    return "Folder name contains invalid characters";
  }
  if (name === "." || name === "..") {
    return "Folder name cannot be . or ..";
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
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-4 w-4 text-primary" />
              <span>New folder</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <Label htmlFor="folder-name" className="text-sm text-muted-foreground">
              Enter folder name
            </Label>
            <Input
              id="folder-name"
              value={name}
              onChange={handleNameChange}
              placeholder="new_folder"
              disabled={isPending}
              autoFocus
              className={cn(
                "font-mono bg-background/50",
                error
                  ? "border-destructive focus-visible:ring-destructive"
                  : "border-border focus-visible:ring-primary"
              )}
            />
            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
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
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
