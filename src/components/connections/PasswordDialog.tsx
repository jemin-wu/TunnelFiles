/**
 * Password dialog - Precision Engineering
 * Compact credential prompt for SSH connection flow
 */

import { useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/connections/PasswordInput";

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "password" | "passphrase";
  hostInfo?: string;
  isConnecting?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PasswordDialog({
  open,
  onOpenChange,
  type,
  hostInfo,
  isConnecting = false,
  onSubmit,
  onCancel,
}: PasswordDialogProps) {
  const [value, setValue] = useState("");

  // Reset value when dialog opens to avoid stale credential
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset state on prop change (intentional pattern)
    if (open) setValue("");
  }, [open]);

  const isPassword = type === "password";

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (value.trim()) {
        onSubmit(value);
      }
    },
    [value, onSubmit]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setValue("");
        onCancel();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, onCancel]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-sm border-border bg-card p-5 gap-0"
        showCloseButton={!isConnecting}
      >
        <DialogHeader className="gap-1.5">
          <DialogTitle>{isPassword ? "Password required" : "Passphrase required"}</DialogTitle>
          <DialogDescription className="text-xs">
            {hostInfo ? (
              <>
                Enter {isPassword ? "password" : "passphrase"} for{" "}
                <span className="font-mono text-foreground">{hostInfo}</span>
              </>
            ) : (
              <>Enter your {isPassword ? "SSH password" : "private key passphrase"} to connect</>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4">
          <PasswordInput
            id="credential"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isPassword ? "Enter SSH password" : "Enter key passphrase"}
            disabled={isConnecting}
            autoFocus
            className="h-9"
          />

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={isConnecting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isConnecting || !value.trim()}>
              {isConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
