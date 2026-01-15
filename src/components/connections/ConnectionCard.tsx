/**
 * 连接卡片组件 - Terminal Style
 * 双行小卡片：名称 + host + 认证类型
 */

import { useCallback, useState } from "react";
import { MoreVertical, Pencil, Trash2, Loader2, Play } from "lucide-react";

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
          "bg-card/50 dark:bg-card/30 border border-border/50 dark:border-border/30 rounded",
          "hover:border-primary/60 hover:bg-card/70 dark:hover:bg-card/50",
          "transition-all duration-150",
          isConnecting && "opacity-50 pointer-events-none"
        )}
      >
        {/* 左侧内容区 */}
        <div className="flex-1 min-w-0">
          {/* 第一行：名称 + 认证标签 */}
          <div className="flex items-center gap-2">
            <span className="text-primary text-[10px]">▸</span>
            <span
              className="text-xs font-medium truncate"
              title={profile.name}
            >
              {profile.name}
            </span>
            <span
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded shrink-0 font-medium",
                isKeyAuth
                  ? "bg-primary/20 dark:bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground dark:bg-muted/60"
              )}
            >
              {isKeyAuth ? "KEY" : "PWD"}
            </span>
          </div>

          {/* 第二行：host */}
          <div className="mt-1 pl-4">
            <span className="text-[10px] text-muted-foreground/80 dark:text-muted-foreground/70 truncate block">
              {profile.host}
            </span>
          </div>
        </div>

        {/* 右侧操作区 - 垂直居中 */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* 连接按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/70 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
            onClick={handleConnect}
            disabled={isConnecting}
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
                className="h-7 w-7 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted/30"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-28 text-xs">
              <DropdownMenuItem onClick={handleEdit} className="gap-2">
                <Pencil className="h-3 w-3" />
                <span>EDIT</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                <span>DELETE</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">CONFIRM_DELETE</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              DELETE &quot;{profile.name}&quot; ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="text-xs h-8">
              CANCEL
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs h-8"
            >
              {isDeleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
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
