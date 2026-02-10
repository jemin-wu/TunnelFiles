/**
 * ConnectionItem - Card-style connection entry
 * Single click to connect, compact card with clear visual hierarchy
 */

import { Loader2, Plug, Pencil, Trash2, Key, MoreHorizontal, ArrowRight } from "lucide-react";

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

interface ConnectionItemProps {
  profile: Profile;
  isConnecting: boolean;
  animationDelay: number;
  onConnect: (id: string) => void;
  onEdit: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
}

export function ConnectionItem({
  profile,
  isConnecting,
  animationDelay,
  onConnect,
  onEdit,
  onDelete,
}: ConnectionItemProps) {
  return (
    <div
      role="listitem"
      tabIndex={0}
      data-profile-id={profile.id}
      data-profile-name={profile.name}
      data-testid="connection-row"
      data-connecting={isConnecting ? "true" : "false"}
      className={cn(
        "group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
        "transition-colors duration-100",
        "hover:bg-accent/50",
        "focus-visible:bg-accent/50 focus-visible:ring-ring/50 focus-visible:ring-1 focus-visible:outline-none",
        "animate-fade-in",
        isConnecting && "pointer-events-none opacity-50"
      )}
      style={{ animationDelay: `${animationDelay}ms` }}
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
      {/* Connection indicator */}
      <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
        {isConnecting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plug className="size-3.5" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={profile.name}>
            {profile.name}
          </span>
          {profile.authType === "key" && (
            <span
              className="text-primary/70 flex shrink-0 items-center gap-0.5 text-xs"
              aria-label="SSH key authentication"
            >
              <Key className="size-3" />
              <span className="sr-only">SSH key</span>
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
      </div>

      {/* Connect action (hover) */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Connect to ${profile.name}`}
        data-profile-id={profile.id}
        data-profile-name={profile.name}
        data-testid="connection-action-connect"
        className="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0 opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onConnect(profile.id);
        }}
      >
        <ArrowRight className="size-3.5" />
      </Button>

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${profile.name}`}
            data-profile-id={profile.id}
            data-profile-name={profile.name}
            data-testid="connection-actions-trigger"
            className="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0 opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            data-testid="connection-action-edit"
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
            data-testid="connection-action-delete"
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
  );
}
