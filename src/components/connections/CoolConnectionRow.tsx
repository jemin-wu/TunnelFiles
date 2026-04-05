/**
 * CoolConnectionRow — compact row for rarely-used connections
 * Lower visual weight but still spatially present (Polanyi: peripheral awareness)
 */

import { ArrowRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

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

interface CoolConnectionRowProps {
  profile: Profile;
  isConnecting: boolean;
  onConnect: (id: string) => void;
  onEdit: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
}

export function CoolConnectionRow({
  profile,
  isConnecting,
  onConnect,
  onEdit,
  onDelete,
}: CoolConnectionRowProps) {
  return (
    <div
      role="listitem"
      tabIndex={0}
      data-profile-id={profile.id}
      data-testid="connection-cool-row"
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5",
        "transition-colors duration-100",
        "hover:bg-accent/30",
        "focus-visible:bg-accent/30 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
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
      <span className="bg-muted-foreground/40 size-1 shrink-0 rounded-full" />
      <span className="text-muted-foreground truncate text-xs font-medium" title={profile.name}>
        {profile.name}
      </span>
      <span
        className="text-muted-foreground/60 ml-auto truncate font-mono text-xs"
        title={`${profile.username}@${profile.host}:${profile.port}`}
      >
        {profile.username}@{profile.host}
        {profile.port !== 22 && `:${profile.port}`}
      </span>

      {/* Hover-reveal actions */}
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Connect to ${profile.name}`}
          className="text-muted-foreground hover:text-foreground h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onConnect(profile.id);
          }}
        >
          <ArrowRight className="size-3" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${profile.name}`}
              className="text-muted-foreground hover:text-foreground h-6 w-6"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-3" />
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
