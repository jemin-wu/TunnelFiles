/**
 * Transfer Queue Component - Precision Engineering
 */

import { useCallback, useMemo } from "react";
import {
  Upload,
  Download,
  X,
  Check,
  RotateCcw,
  CheckCircle,
  XCircle,
  Trash2,
  History,
  Clock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTransferStore } from "@/stores/useTransferStore";
import { useTransferHistory, useClearTransferHistory } from "@/hooks/useTransferHistory";
import { cancelTransfer, retryTransfer, cleanupTransfers } from "@/lib/transfer";
import {
  formatSpeed,
  estimateRemainingTime,
  type TransferTask,
  type TransferStatus,
  type TransferHistoryEntry,
} from "@/types/transfer";
import { formatFileSize } from "@/types/file";
import { formatRelativeTime } from "@/lib/file";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = new Set<TransferStatus>(["running", "waiting"]);
const TERMINAL_STATUSES = new Set<TransferStatus>(["success", "failed", "canceled"]);

interface TransferQueueProps {
  className?: string;
}

export function TransferQueue({ className }: TransferQueueProps) {
  const tasksMap = useTransferStore((s) => s.tasks);
  const clearCompleted = useTransferStore((s) => s.clearCompleted);
  const { data: history } = useTransferHistory(50);
  const clearHistory = useClearTransferHistory();

  const tasks = useMemo(() => {
    return Array.from(tasksMap.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [tasksMap]);

  const activeTasks = useMemo(() => {
    return tasks.filter((t) => ACTIVE_STATUSES.has(t.status));
  }, [tasks]);

  const completedTasks = useMemo(() => {
    return tasks.filter((t) => TERMINAL_STATUSES.has(t.status));
  }, [tasks]);

  const handleClearCompleted = useCallback(async () => {
    clearCompleted();
    await cleanupTransfers();
  }, [clearCompleted]);

  const hasActiveTasks = tasks.length > 0;
  const hasHistory = history && history.length > 0;

  if (!hasActiveTasks && !hasHistory) {
    return (
      <Empty className={cn("w-full", className)}>
        <EmptyDescription>No transfer history</EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {/* Toolbar */}
      {(activeTasks.length > 0 || completedTasks.length > 0) && (
        <div className="border-border/50 bg-muted/30 flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            {activeTasks.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="bg-primary h-1.5 w-1.5 rounded-full" />
                <span className="text-primary">{activeTasks.length}</span>
                <span className="text-muted-foreground">active</span>
              </span>
            )}
            {completedTasks.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-success">{completedTasks.length}</span>
                <span className="text-muted-foreground">done</span>
              </span>
            )}
          </div>
          {completedTasks.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Clear completed"
                  className="hover:bg-destructive/10 hover:text-destructive h-6 w-6"
                  onClick={handleClearCompleted}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Clear completed</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* Task list + History */}
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
        {/* Active tasks */}
        {activeTasks.length > 0 && (
          <div className="divide-border/30 divide-y">
            {activeTasks.map((task, index) => (
              <div
                key={task.taskId}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <TransferItem task={task} />
              </div>
            ))}
          </div>
        )}

        {/* Completed tasks - tighter spacing, reduced emphasis */}
        {completedTasks.length > 0 && (
          <div className={cn(activeTasks.length > 0 && "border-border/50 mt-1 border-t pt-1")}>
            <div className="divide-border/20 divide-y">
              {completedTasks.map((task, index) => (
                <div
                  key={task.taskId}
                  className="animate-fade-in opacity-70"
                  style={{ animationDelay: `${(activeTasks.length + index) * 30}ms` }}
                >
                  <TransferItem task={task} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History section */}
        {hasHistory && (
          <div className={cn(hasActiveTasks && "border-border/50 mt-2 border-t pt-2")}>
            <div className="flex items-center justify-between px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <History className="text-muted-foreground size-3.5" />
                <span className="text-muted-foreground text-xs font-medium">History</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Clear history"
                    className="hover:bg-destructive/10 hover:text-destructive h-6 w-6"
                    onClick={() => clearHistory.mutate()}
                    disabled={clearHistory.isPending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Clear history</TooltipContent>
              </Tooltip>
            </div>
            <div className="divide-border/20 divide-y">
              {history.map((entry) => (
                <HistoryItem key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface TransferItemProps {
  task: TransferTask;
}

function TransferItem({ task }: TransferItemProps) {
  const removeTask = useTransferStore((s) => s.removeTask);
  const updateStatus = useTransferStore((s) => s.updateStatus);
  const { status } = task;
  const isActive = ACTIVE_STATUSES.has(status);

  const handleCancel = useCallback(async () => {
    const previousStatus = task.status;
    updateStatus({ taskId: task.taskId, status: "canceled" });
    try {
      await cancelTransfer(task.taskId);
    } catch {
      // Cancel failed (task may have already completed) - revert optimistic update
      updateStatus({ taskId: task.taskId, status: previousStatus });
    }
  }, [task.taskId, task.status, updateStatus]);

  const handleRetry = useCallback(async () => {
    // Optimistic update: set "waiting" before backend call (matches handleCancel pattern)
    updateStatus({ taskId: task.taskId, status: "waiting" });
    try {
      await retryTransfer(task.taskId);
    } catch {
      // Retry failed - revert to failed status
      updateStatus({ taskId: task.taskId, status: "failed" });
    }
  }, [task.taskId, updateStatus]);

  const handleRemove = useCallback(() => {
    removeTask(task.taskId);
  }, [task.taskId, removeTask]);

  return (
    <div
      className={cn(
        "space-y-2 px-3 py-2.5 transition-colors duration-100",
        "hover:bg-accent/50",
        status === "running" && "bg-primary/5"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <TaskIcon direction={task.direction} status={status} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={task.fileName}>
          {task.fileName}
        </span>
        <TaskActions
          status={status}
          retryable={task.retryable}
          onCancel={handleCancel}
          onRetry={handleRetry}
          onRemove={handleRemove}
        />
      </div>

      {isActive && (
        <div className="space-y-1">
          <Progress
            value={task.percent ?? 0}
            className={cn("h-1", status === "waiting" && "opacity-40")}
          />
        </div>
      )}

      <TaskStatusInfo task={task} />
    </div>
  );
}

function TaskStatusInfo({ task }: { task: TransferTask }) {
  switch (task.status) {
    case "running":
      return (
        <div className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
          <span className="text-primary">{formatSpeed(task.speed)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>
            <span className="text-primary">{task.percent ?? 0}%</span>
            {" · "}
            <span className="text-muted-foreground">
              ETA {estimateRemainingTime(task.transferred, task.total ?? 0, task.speed ?? 0)}
            </span>
          </span>
        </div>
      );
    case "waiting":
      return (
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <span className="bg-warning h-1 w-1 rounded-full" />
          <span>Queued</span>
        </div>
      );
    case "success":
      return (
        <div className="text-success flex items-center gap-1 text-xs">
          <Check className="size-3" />
          <span>Transfer complete</span>
        </div>
      );
    case "failed":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-destructive flex min-w-0 items-center gap-1 text-xs">
              <X className="size-3 shrink-0" />
              <span className="truncate">{task.errorMessage || "Transfer failed"}</span>
            </div>
          </TooltipTrigger>
          {task.errorMessage && (
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {task.errorMessage}
            </TooltipContent>
          )}
        </Tooltip>
      );
    case "canceled":
      return <div className="text-muted-foreground text-xs">Canceled</div>;
  }
}

function TaskIcon({
  direction,
  status,
}: {
  direction: "upload" | "download";
  status: TransferStatus;
}) {
  const baseClasses = "size-4 shrink-0";

  switch (status) {
    case "success":
      return <CheckCircle className={cn(baseClasses, "text-success")} />;
    case "failed":
      return <XCircle className={cn(baseClasses, "text-destructive")} />;
    default: {
      const Icon = direction === "upload" ? Upload : Download;
      const colorClass =
        status === "running"
          ? direction === "upload"
            ? "text-transfer-upload"
            : "text-transfer-download"
          : "text-muted-foreground";
      return <Icon className={cn(baseClasses, colorClass)} />;
    }
  }
}

interface TaskActionsProps {
  status: TransferStatus;
  retryable?: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}

function TaskActions({ status, retryable, onCancel, onRetry, onRemove }: TaskActionsProps) {
  const isActive = ACTIVE_STATUSES.has(status);

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {isActive && (
        <ActionButton
          icon={X}
          tooltip="Cancel"
          onClick={onCancel}
          className="hover:text-destructive"
        />
      )}
      {status === "failed" && retryable && (
        <ActionButton
          icon={RotateCcw}
          tooltip="Retry"
          onClick={onRetry}
          className="hover:text-warning"
        />
      )}
      {!isActive && (
        <ActionButton
          icon={X}
          tooltip="Remove"
          onClick={onRemove}
          className="hover:bg-destructive/10 hover:text-destructive"
        />
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  tooltip,
  onClick,
  className,
}: {
  icon: typeof X;
  tooltip: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={tooltip}
          className={cn("h-6 w-6", className)}
          onClick={onClick}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// History
// ============================================================================

function HistoryItem({ entry }: { entry: TransferHistoryEntry }) {
  const fileName = entry.remotePath.split("/").pop() || entry.remotePath;
  const DirectionIcon = entry.direction === "upload" ? Upload : Download;

  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-2 opacity-60">
      <DirectionIcon
        className={cn(
          "size-3.5 shrink-0",
          entry.direction === "upload" ? "text-transfer-upload" : "text-transfer-download"
        )}
      />
      <span className="min-w-0 flex-1 truncate text-sm" title={fileName}>
        {fileName}
      </span>
      <HistoryStatusBadge status={entry.status} />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
            <Clock className="size-3" />
            {formatRelativeTime(entry.startedAt)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          <div className="space-y-0.5">
            <div>{formatFileSize(entry.fileSize)}</div>
            <div className="text-muted-foreground truncate" title={entry.remotePath}>
              {entry.remotePath}
            </div>
            {entry.errorMessage && <div className="text-destructive">{entry.errorMessage}</div>}
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function HistoryStatusBadge({ status }: { status: TransferHistoryEntry["status"] }) {
  switch (status) {
    case "success":
      return (
        <Badge
          variant="outline"
          className="border-success/30 text-success shrink-0 gap-0.5 px-1.5 py-0 text-[10px]"
        >
          <Check className="size-2.5" />
          Done
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="outline"
          className="border-destructive/30 text-destructive shrink-0 gap-0.5 px-1.5 py-0 text-[10px]"
        >
          <X className="size-2.5" />
          Failed
        </Badge>
      );
    case "canceled":
      return (
        <Badge
          variant="outline"
          className="border-muted-foreground/30 text-muted-foreground shrink-0 gap-0.5 px-1.5 py-0 text-[10px]"
        >
          Canceled
        </Badge>
      );
    case "running":
      return (
        <Badge
          variant="outline"
          className="border-primary/30 text-primary shrink-0 gap-0.5 px-1.5 py-0 text-[10px]"
        >
          Running
        </Badge>
      );
  }
}
