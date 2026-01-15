/**
 * 连接列表项组件 - Cyberpunk Terminal Style
 */

import { useCallback, useState } from "react";
import {
  Server,
  Pencil,
  Trash2,
  Loader2,
  Plug,
  Key,
  Clock,
  Terminal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { formatRelativeTime } from "@/lib/file";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

interface ConnectionListItemProps {
  profile: Profile;
  isConnecting?: boolean;
  onEdit: (profileId: string) => void;
  onDelete: (profileId: string) => Promise<void>;
  onConnect: (profileId: string) => Promise<void>;
}

export function ConnectionListItem({
  profile,
  isConnecting = false,
  onEdit,
  onDelete,
  onConnect,
}: ConnectionListItemProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConnect = useCallback(async () => {
    await onConnect(profile.id);
  }, [profile.id, onConnect]);

  const handleEdit = useCallback(() => {
    onEdit(profile.id);
  }, [profile.id, onEdit]);

  const handleDeleteConfirm = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(profile.id);
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  }, [profile.id, onDelete]);

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-4 px-4 py-3 rounded border border-border bg-card/50",
          "hover:bg-primary/5 hover:border-primary/30 transition-all",
          isConnecting && "opacity-60 pointer-events-none"
        )}
      >
        {/* 图标 */}
        <div className="flex items-center justify-center w-10 h-10 rounded bg-primary/10 border border-primary/20 shrink-0">
          <Server className="h-5 w-5 text-primary" />
        </div>

        {/* 主要信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-mono font-medium text-sm truncate" title={profile.name}>
              {profile.name}
            </h3>
            {profile.authType === "key" && (
              <Badge variant="secondary" className="h-5 gap-1 px-1.5 shrink-0 font-mono text-[10px] bg-primary/10 text-primary border-primary/30">
                <Key className="h-3 w-3" />
                SSH_KEY
              </Badge>
            )}
          </div>
          <p
            className="font-mono text-xs text-muted-foreground truncate mt-0.5"
            title={`${profile.username}@${profile.host}:${profile.port}`}
          >
            <span className="text-primary">$</span> {profile.username}@{profile.host}:{profile.port}
          </p>
        </div>

        {/* 最近连接时间 */}
        {profile.updatedAt && (
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono shrink-0">
            <Clock className="h-3 w-3" />
            <span>{formatRelativeTime(profile.updatedAt)}</span>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 shrink-0">
          <TooltipProvider delayDuration={300}>
            {/* 编辑按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10 hover:text-primary"
                  onClick={handleEdit}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="font-mono text-xs">EDIT</TooltipContent>
            </Tooltip>

            {/* 删除按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="font-mono text-xs">DELETE</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* 连接按钮 */}
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            size="sm"
            className="gap-1.5 ml-2 font-mono text-xs btn-cyber"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">CONNECTING</span>
              </>
            ) : (
              <>
                <Plug className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">CONNECT</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-destructive/30 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-mono text-destructive">
              <Trash2 className="h-4 w-4" />
              <span>&gt;</span>
              <span>DELETE_PROFILE</span>
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded px-3 py-2 font-mono text-sm">
                  <Terminal className="h-4 w-4 text-destructive/70 shrink-0" />
                  <span className="text-foreground truncate">{profile.name}</span>
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  <span className="text-destructive">!</span> 此操作无法撤销，确定要删除吗？
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={isDeleting} className="font-mono text-xs btn-cyber">
              CANCEL
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="font-mono text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  DELETING...
                </>
              ) : (
                "DELETE"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
