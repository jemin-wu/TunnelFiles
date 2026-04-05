/**
 * HotConnectionTile — promoted card for frequently-used connections
 * Larger visual weight communicates higher usage frequency (Polanyi: tacit spatial recognition)
 */

import { Loader2, Key, ArrowRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

interface HotConnectionTileProps {
  profile: Profile;
  isConnecting: boolean;
  recencyLabel?: string;
  onConnect: (id: string) => void;
  onEdit: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
}

export function HotConnectionTile({
  profile,
  isConnecting,
  recencyLabel,
  onConnect,
  onEdit,
  onDelete,
}: HotConnectionTileProps) {
  return (
    <div
      role="listitem"
      tabIndex={0}
      data-profile-id={profile.id}
      data-testid="connection-hot-tile"
      className={cn(
        "group border-border bg-card relative flex cursor-pointer items-start gap-2.5 rounded-lg border p-3",
        "transition-colors duration-100",
        "hover:border-border/80 hover:bg-accent/50",
        "focus-visible:bg-accent/50 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
        isConnecting && "pointer-events-none opacity-50"
      )}
      onClick={() => onConnect(profile.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onConnect(profile.id);
        } else if (e.key === "Delete") {
          e.preventDefault();
          onDelete(profile);
        } else if (e.key === "e" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onEdit(profile);
        }
      }}
    >
      {/* Recency glow — top edge gradient */}
      <div className="bg-primary/30 absolute top-0 right-4 left-4 h-px rounded-full" />

      {/* Info — no icon: every connection had the same icon, adding zero information */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isConnecting && <Loader2 className="text-primary size-3.5 shrink-0 animate-spin" />}
          <span className="truncate text-sm font-semibold" title={profile.name}>
            {profile.name}
          </span>
          {profile.authType === "key" && (
            <span
              className="text-primary/70 flex shrink-0 items-center gap-0.5 text-xs"
              aria-label="SSH key authentication"
            >
              <Key className="size-3" />
            </span>
          )}
        </div>
        <span
          className="text-muted-foreground block truncate font-mono text-xs"
          title={`${profile.username}@${profile.host}:${profile.port}`}
        >
          {profile.username}@{profile.host}
          {profile.port !== 22 && `:${profile.port}`}
        </span>
        {recencyLabel && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="bg-success size-1.5 shrink-0 animate-pulse rounded-full" />
            <span className="text-muted-foreground text-[10px]">{recencyLabel}</span>
          </div>
        )}
      </div>

      {/* Hover-reveal actions */}
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Connect to ${profile.name}`}
          data-testid="connection-action-connect"
          className="text-muted-foreground hover:text-foreground h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onConnect(profile.id);
          }}
        >
          <ArrowRight className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${profile.name}`}
              data-testid="connection-actions-trigger"
              className="text-muted-foreground hover:text-foreground h-6 w-6"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit(profile);
              }}
            >
              <Pencil className="size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(profile);
              }}
            >
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
