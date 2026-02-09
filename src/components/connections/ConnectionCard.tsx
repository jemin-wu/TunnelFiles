/**
 * 连接卡片组件 - Precision Engineering
 * 双行小卡片：名称 + host + 认证类型
 */

import { useCallback, useState } from "react";
import { MoreVertical, Pencil, Trash2, Loader2, Play, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

interface ConnectionCardProps {
  profile: Profile;
  isConnecting?: boolean;
  onEdit: (profileId: string) => void;
  onDelete: (profileId: string) => Promise<void>;
  onConnect: (profileId: string) => Promise<void>;
}

export function ConnectionCard({
  profile,
  isConnecting = false,
  onEdit,
  onDelete,
  onConnect,
}: ConnectionCardProps) {
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

  const isKeyAuth = profile.authType === "key";

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-3 px-3 py-2.5",
          "bg-card/50 border border-border/50 rounded",
          "hover:border-primary/60 hover:bg-card/70",
          "transition-all duration-150",
          isConnecting && "opacity-50 pointer-events-none"
        )}
      >
        {/* 左侧内容区 */}
        <div className="flex-1 min-w-0">
          {/* 第一行：名称 + 认证标签 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium truncate" title={profile.name}>
              {profile.name}
            </span>
            {isKeyAuth && (
              <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0 font-medium bg-primary/20 text-primary">
                SSH key
              </span>
            )}
          </div>

          {/* 第二行：host */}
          <div className="mt-1">
            <span className="text-[10px] text-muted-foreground/80 truncate block">
              {profile.host}
            </span>
          </div>
        </div>

        {/* 右侧操作区 */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* 连接按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/70 hover:text-primary hover:bg-primary/10"
            onClick={handleConnect}
            disabled={isConnecting}
            aria-label={isConnecting ? "Connecting" : "Connect"}
          >
            {isConnecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* 更多操作菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-28 text-xs">
              <DropdownMenuItem onClick={handleEdit} className="gap-2">
                <Pencil className="h-3 w-3" />
                <span>Edit</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-xs border-destructive/30 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive text-sm">
              <Trash2 className="h-4 w-4" />
              <span>Delete connection</span>
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded px-3 py-2 text-sm">
                  <Terminal className="h-4 w-4 text-destructive/70 shrink-0" />
                  <span className="text-foreground truncate">{profile.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  This action cannot be undone. Are you sure?
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={isDeleting} className="text-xs h-8">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs h-8"
            >
              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
