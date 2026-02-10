/**
 * HostKey 确认弹窗 - Precision Engineering
 * 首次连接或 HostKey 变更时显示
 */

import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Fingerprint,
  Server,
  AlertTriangle,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HostKeyPayload } from "@/types/events";

interface HostKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** HostKey 信息 */
  payload: HostKeyPayload | null;
  /** 是否正在处理 */
  isProcessing?: boolean;
  /** 信任此 Key */
  onTrust: () => void;
  /** 拒绝 */
  onReject: () => void;
}

export function HostKeyDialog({
  open,
  onOpenChange,
  payload,
  isProcessing = false,
  onTrust,
  onReject,
}: HostKeyDialogProps) {
  if (!payload) return null;

  const isMismatch = payload.status === "mismatch";
  const Icon = isMismatch ? ShieldAlert : ShieldCheck;

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isProcessing) {
      onReject();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "bg-card sm:max-w-lg",
          isMismatch ? "border-destructive/50" : "border-warning/50"
        )}
        showCloseButton={!isProcessing}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", isMismatch ? "text-destructive" : "text-warning")} />
            <span>{isMismatch ? "Host key mismatch" : "Verify host key"}</span>
          </DialogTitle>
          <DialogDescription asChild>
            <p className="text-muted-foreground pt-1 text-xs">
              {isMismatch
                ? "Server fingerprint does not match the stored record. This may indicate a security risk."
                : "First connection to this server. Please verify the fingerprint."}
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 服务器信息 */}
          <div className="bg-background/30 flex items-center justify-between rounded px-3 py-2 text-xs">
            <span className="text-muted-foreground flex items-center gap-2">
              <Server className="h-3 w-3" />
              Server
            </span>
            <span className="text-primary font-mono">
              {payload.host}:{payload.port}
            </span>
          </div>

          {/* 密钥类型 */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Key type</span>
            <Badge
              variant="secondary"
              className="bg-primary/10 text-primary border-primary/30 font-mono text-xs"
            >
              {payload.keyType}
            </Badge>
          </div>

          {/* 指纹 */}
          <div className="space-y-2">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Fingerprint className="text-primary h-3.5 w-3.5" />
              <span>SHA256 fingerprint</span>
            </div>
            <div className="bg-background/50 border-border text-foreground rounded border p-3 font-mono text-xs leading-relaxed break-all">
              {payload.fingerprint}
            </div>
          </div>

          {/* 警告提示 */}
          {isMismatch && (
            <div className="bg-destructive/10 border-destructive/20 flex items-start gap-2 rounded border p-3 text-xs">
              <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="text-destructive font-medium">Security warning</p>
                <p className="text-destructive/80">
                  Carefully verify the server fingerprint. If unsure, contact your server
                  administrator.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onReject} disabled={isProcessing}>
            Reject
          </Button>
          <Button
            onClick={onTrust}
            disabled={isProcessing}
            size="sm"
            variant={isMismatch ? "destructive" : "default"}
          >
            {isProcessing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {isMismatch ? "Trust anyway" : "Trust"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
