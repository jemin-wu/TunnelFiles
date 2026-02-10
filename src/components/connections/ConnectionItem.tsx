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
        "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer",
        "transition-colors duration-100",
        "hover:bg-accent/50",
        "focus-visible:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none",
        "animate-fade-in",
        isConnecting && "opacity-50 pointer-events-none"
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
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary shrink-0">
        {isConnecting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plug className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate" title={profile.name}>
            {profile.name}
          </span>
          {profile.authType === "key" && (
            <span
              className="flex items-center gap-0.5 text-xs text-primary/70 shrink-0"
              aria-label="SSH key authentication"
            >
              <Key className="h-2.5 w-2.5" />
              <span className="sr-only">SSH key</span>
            </span>
          )}
        </div>
        <span
          className="text-xs font-mono text-muted-foreground truncate block"
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
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onConnect(profile.id);
        }}
      >
        <ArrowRight className="h-3.5 w-3.5" />
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
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
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
            <Pencil className="h-3.5 w-3.5" />
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
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
