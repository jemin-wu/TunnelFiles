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
      <DialogContent className="border-border bg-card sm:max-w-md" showCloseButton={!isPending}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="text-primary h-4 w-4" />
              <span>Rename</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enter a new name for the selected file or folder
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {/* Current name */}
            <div className="text-muted-foreground bg-muted/30 flex items-center gap-2 rounded px-3 py-2 text-xs">
              <span>Current:</span>
              <span className="text-foreground truncate font-mono">{currentName}</span>
            </div>

            <Label htmlFor="new-name" className="text-muted-foreground text-sm">
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
                "bg-background/50 font-mono",
                error
                  ? "border-destructive focus-visible:ring-destructive/50"
                  : "border-border focus-visible:ring-ring/50"
              )}
            />
            {error && (
              <p className="text-destructive flex items-center gap-1 text-xs">
                <span className="text-destructive">!</span> {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
              {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
