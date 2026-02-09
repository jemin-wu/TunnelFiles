/**
 * ConnectionItem - Compact list row with context menu
 * 34px height, VS Code Remote Explorer style
 */

import { Loader2, Plug, Pencil, Trash2, Key } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="listitem"
          tabIndex={0}
          className={cn(
            "group flex items-center h-[34px] px-3 gap-2 cursor-default",
            "transition-colors duration-100",
            "hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none",
            "animate-fade-in",
            isConnecting && "opacity-50 pointer-events-none"
          )}
          style={{ animationDelay: `${animationDelay}ms` }}
          onDoubleClick={() => onConnect(profile.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onConnect(profile.id);
            } else if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              onDelete(profile);
            } else if (e.key === "e" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onEdit(profile);
            }
          }}
        >
          {/* Name */}
          <span className="text-sm font-medium truncate min-w-0 shrink" title={profile.name}>
            {profile.name}
          </span>

          {/* Host info */}
          <span
            className="text-xs font-mono text-muted-foreground truncate min-w-0 shrink"
            title={`${profile.username}@${profile.host}:${profile.port}`}
          >
            {profile.username}@{profile.host}:{profile.port}
          </span>

          {/* SSH key badge */}
          {profile.authType === "key" && (
            <Badge
              variant="secondary"
              className="h-4 gap-0.5 px-1 shrink-0 text-xs bg-primary/10 text-primary border-primary/30"
            >
              <Key className="h-2.5 w-2.5" />
              key
            </Badge>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action icons (hover) / Spinner (connecting) */}
          {isConnecting ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          ) : (
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                onClick={(e) => {
                  e.stopPropagation();
                  onConnect(profile.id);
                }}
                aria-label={`Connect to ${profile.name}`}
              >
                <Plug className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(profile);
                }}
                aria-label={`Edit ${profile.name}`}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(profile);
                }}
                aria-label={`Delete ${profile.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={() => onConnect(profile.id)}>
          <Plug className="h-3.5 w-3.5" />
          Connect
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onEdit(profile)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => onDelete(profile)}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
