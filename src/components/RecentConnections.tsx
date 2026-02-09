/**
 * 最近连接组件
 * 展示最近连接的服务器，支持一键重连
 */

import { Clock, Server, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRecentConnections } from "@/hooks/useProfiles";
import { formatRelativeTime } from "@/lib/file";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/profile";

interface RecentConnectionsProps {
  onConnect: (profileId: string) => void;
  connectingId?: string | null;
  className?: string;
}

export function RecentConnections({ onConnect, connectingId, className }: RecentConnectionsProps) {
  const { data: recentProfiles, isLoading } = useRecentConnections(10);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (recentProfiles.length === 0) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No recent connections</p>
      </div>
    );
  }

  return (
    <div className={cn("", className)}>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Recent connections</span>
      </div>
      <ScrollArea className="h-[200px]">
        <div className="space-y-1">
          {recentProfiles.map((profile) => (
            <RecentConnectionItem
              key={profile.id}
              profile={profile}
              isConnecting={connectingId === profile.id}
              onConnect={onConnect}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface RecentConnectionItemProps {
  profile: Profile;
  isConnecting: boolean;
  onConnect: (profileId: string) => void;
}

function RecentConnectionItem({ profile, isConnecting, onConnect }: RecentConnectionItemProps) {
  return (
    <Button
      variant="ghost"
      className={cn("w-full justify-start h-auto py-2 px-3", "hover:bg-accent/50")}
      disabled={isConnecting}
      onClick={() => onConnect(profile.id)}
    >
      <div className="flex items-center gap-3 w-full min-w-0">
        {isConnecting ? (
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
        ) : (
          <Server className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium truncate">{profile.name}</div>
          <div className="text-xs text-muted-foreground truncate font-mono">
            {profile.username}@{profile.host}
            {profile.port !== 22 && `:${profile.port}`}
          </div>
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {formatRelativeTime(profile.updatedAt)}
        </span>
      </div>
    </Button>
  );
}
