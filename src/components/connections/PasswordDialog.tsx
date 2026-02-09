/**
 * 密码输入弹窗 - Precision Engineering
 * 用于连接时输入密码或 passphrase
 */

import { useState, useCallback } from "react";
import { Loader2, Eye, EyeOff, Key, Lock, Terminal, Shield } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 密码类型 */
  type: "password" | "passphrase";
  /** 主机信息（用于展示） */
  hostInfo?: string;
  /** 是否正在连接 */
  isConnecting?: boolean;
  /** 提交密码 */
  onSubmit: (value: string) => void;
  /** 取消 */
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
  const [showValue, setShowValue] = useState(false);

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
        setShowValue(false);
        onCancel();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, onCancel]
  );

  const isPassword = type === "password";
  const Icon = isPassword ? Lock : Key;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md border-border bg-card" showCloseButton={!isConnecting}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <span>{isPassword ? "Password required" : "Passphrase required"}</span>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="pt-2 space-y-2">
              {hostInfo && (
                <div className="flex items-center gap-2 text-xs bg-background/30 px-3 py-2 rounded">
                  <Terminal className="h-3 w-3 text-primary" />
                  <span className="text-primary font-mono">{hostInfo}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {isPassword
                  ? "Enter your SSH password"
                  : "Enter the passphrase for your private key"}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label
              htmlFor="credential"
              className="text-xs text-muted-foreground flex items-center gap-1"
            >
              <Shield className="h-3 w-3" />
              {isPassword ? "Password" : "Passphrase"}
            </Label>
            <div className="relative">
              <Input
                id="credential"
                type={showValue ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={isPassword ? "••••••••" : "••••••••"}
                disabled={isConnecting}
                autoFocus
                className="pr-10 bg-background/50 border-border focus-visible:ring-primary"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent hover:text-primary"
                onClick={() => setShowValue(!showValue)}
                tabIndex={-1}
              >
                {showValue ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isConnecting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isConnecting || !value.trim()} className="text-xs">
              {isConnecting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
              Connect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
