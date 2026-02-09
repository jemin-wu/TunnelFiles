/**
 * Rename Dialog - Precision Engineering
 */

import { useState, useCallback } from "react";
import { Loader2, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

// Validate file name
function validateName(name: string, originalName: string): string | null {
  if (!name.trim()) {
    return "Name cannot be empty";
  }
  if (name.includes("/")) {
    return "Name cannot contain /";
  }
  if (name.includes("\0")) {
    return "Name contains invalid characters";
  }
  if (name === "." || name === "..") {
    return "Name cannot be . or ..";
  }
  if (name.trim() === originalName) {
    return "New name is the same as the original";
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
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              <span>Rename</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enter a new name for the selected file or folder
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            {/* Current name */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded">
              <span>Current:</span>
              <span className="font-mono text-foreground truncate">{currentName}</span>
            </div>

            <Label htmlFor="new-name" className="text-sm text-muted-foreground">
              Enter new name
            </Label>
            <Input
              id="new-name"
              value={name}
              onChange={handleNameChange}
              placeholder="new_name"
              disabled={isPending}
              autoFocus
              onFocus={(e) => {
                // Select file name part (without extension)
                const dotIndex = e.target.value.lastIndexOf(".");
                if (dotIndex > 0) {
                  e.target.setSelectionRange(0, dotIndex);
                } else {
                  e.target.select();
                }
              }}
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
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
