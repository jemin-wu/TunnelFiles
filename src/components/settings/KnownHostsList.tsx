/**
 * KnownHostsList - Displays and manages trusted SSH host keys
 */

import { useState } from "react";
import { Loader2, Trash2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useKnownHosts, useRemoveKnownHost } from "@/hooks/useKnownHosts";
import type { KnownHost } from "@/lib/session";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncateFingerprint(fingerprint: string): string {
  // Show first 16 chars of the hash part (after "SHA256:" prefix if present)
  const prefix = fingerprint.startsWith("SHA256:") ? "SHA256:" : "";
  const hash = prefix ? fingerprint.slice(7) : fingerprint;
  if (hash.length > 16) {
    return `${prefix}${hash.slice(0, 16)}...`;
  }
  return fingerprint;
}

function KnownHostRow({
  host,
  onRemove,
  isRemoving,
}: {
  host: KnownHost;
  onRemove: (host: KnownHost) => void;
  isRemoving: boolean;
}) {
  return (
    <div className="border-border/30 flex items-center justify-between gap-3 border-b py-3 first:pt-0 last:border-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-foreground/90 truncate text-sm font-medium"
            title={`${host.host}:${host.port}`}
          >
            {host.host}
            {host.port !== 22 && <span className="text-muted-foreground ml-0.5">:{host.port}</span>}
          </span>
          {host.keyType && (
            <span className="bg-muted/50 text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs">
              {host.keyType}
            </span>
          )}
        </div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
          <span className="truncate" title={host.fingerprint}>
            {truncateFingerprint(host.fingerprint)}
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="shrink-0">Trusted {formatDate(host.trustedAt)}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
        onClick={() => onRemove(host)}
        disabled={isRemoving}
        aria-label="Remove trusted host"
        title="Remove trusted host"
      >
        {isRemoving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="bg-muted/50 flex size-10 items-center justify-center rounded-lg">
        <ShieldCheck className="text-muted-foreground size-5" />
      </div>
      <div>
        <p className="text-foreground/90 text-sm font-medium">No trusted hosts</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Host keys will appear here after your first connection to a server
        </p>
      </div>
    </div>
  );
}

export function KnownHostsList() {
  const { data: hosts, isLoading, error } = useKnownHosts();
  const removeKnownHost = useRemoveKnownHost();
  const [hostToRemove, setHostToRemove] = useState<KnownHost | null>(null);

  const handleConfirmRemove = async () => {
    if (!hostToRemove) return;
    await removeKnownHost.mutateAsync({
      host: hostToRemove.host,
      port: hostToRemove.port,
    });
    setHostToRemove(null);
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="text-destructive py-4 text-center text-sm">Failed to load known hosts</div>
    );
  }

  if (!hosts || hosts.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <div>
        {hosts.map((host) => (
          <KnownHostRow
            key={`${host.host}:${host.port}`}
            host={host}
            onRemove={setHostToRemove}
            isRemoving={
              removeKnownHost.isPending &&
              removeKnownHost.variables?.host === host.host &&
              removeKnownHost.variables?.port === host.port
            }
          />
        ))}
      </div>

      <AlertDialog open={!!hostToRemove} onOpenChange={(open) => !open && setHostToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove trusted host?</AlertDialogTitle>
            <AlertDialogDescription>
              Removing the host key for{" "}
              <span className="text-foreground font-medium">
                {hostToRemove?.host}
                {hostToRemove?.port !== 22 && `:${hostToRemove?.port}`}
              </span>{" "}
              will require re-verification on next connect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeKnownHost.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              disabled={removeKnownHost.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeKnownHost.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
