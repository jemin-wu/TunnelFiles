/**
 * 传输任务队列组件 - Cyberpunk Terminal Style
 */

import { useCallback, useMemo } from "react";
import {
  Upload,
  Download,
  X,
  RotateCcw,
  CheckCircle,
  XCircle,
  Trash2,
  ArrowUpFromLine,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTransferStore } from "@/stores/useTransferStore";
import { cancelTransfer, retryTransfer, cleanupTransfers } from "@/lib/transfer";
import { formatSpeed, estimateRemainingTime, type TransferTask, type TransferStatus } from "@/types/transfer";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = new Set<TransferStatus>(["running", "waiting"]);
const TERMINAL_STATUSES = new Set<TransferStatus>(["success", "failed", "canceled"]);

interface TransferQueueProps {
  className?: string;
}

export function TransferQueue({ className }: TransferQueueProps) {
  const tasksMap = useTransferStore((s) => s.tasks);
  const clearCompleted = useTransferStore((s) => s.clearCompleted);

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

  if (tasks.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-6 text-muted-foreground", className)}>
        <div className="relative mb-4">
          <ArrowUpFromLine className="h-10 w-10 opacity-30" />
          <div className="absolute inset-0 animate-ping opacity-10">
            <ArrowUpFromLine className="h-10 w-10" />
          </div>
        </div>
        <p className="text-xs font-medium tracking-wide mb-1">NO_ACTIVE_TRANSFERS</p>
        <p className="text-[10px] text-muted-foreground/60">拖拽文件到左侧区域开始上传</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* 工具栏 */}
      {(activeTasks.length > 0 || completedTasks.length > 0) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-2 text-[10px] font-mono">
            {activeTasks.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-accent">{activeTasks.length}</span>
                <span className="text-muted-foreground">ACTIVE</span>
              </span>
            )}
            {activeTasks.length > 0 && completedTasks.length > 0 && (
              <span className="text-border">│</span>
            )}
            {completedTasks.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-success">{completedTasks.length}</span>
                <span className="text-muted-foreground">DONE</span>
              </span>
            )}
          </div>
          {completedTasks.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 hover:bg-destructive/10 hover:text-destructive"
                    onClick={handleClearCompleted}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="font-mono text-xs">CLEAR_COMPLETED</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}

      {/* 任务列表 */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/30">
          {tasks.map((task, index) => (
            <div
              key={task.taskId}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <TransferItem task={task} />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface TransferItemProps {
  task: TransferTask;
}

function TransferItem({ task }: TransferItemProps) {
  const removeTask = useTransferStore((s) => s.removeTask);
  const { status } = task;
  const isActive = ACTIVE_STATUSES.has(status);

  const handleCancel = useCallback(async () => {
    await cancelTransfer(task.taskId);
  }, [task.taskId]);

  const handleRetry = useCallback(async () => {
    removeTask(task.taskId);
    await retryTransfer(task.taskId);
  }, [task.taskId, removeTask]);

  const handleRemove = useCallback(() => {
    removeTask(task.taskId);
  }, [task.taskId, removeTask]);

  return (
    <div
      className={cn(
        "px-3 py-2.5 space-y-2 transition-colors",
        "hover:bg-muted/30",
        status === "running" && "bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2">
        <TaskIcon direction={task.direction} status={status} />
        <span
          className="flex-1 text-xs font-medium truncate"
          title={task.fileName}
        >
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
            className={cn(
              "h-1 progress-cyber",
              status === "waiting" && "opacity-40"
            )}
          />
          {status === "running" && (
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 animate-data-stream" />
            </div>
          )}
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
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <span className="text-accent">{formatSpeed(task.speed)}</span>
          <span className="text-border">│</span>
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
        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-warning animate-pulse" />
          <span>QUEUED...</span>
        </div>
      );
    case "success":
      return (
        <div className="text-[10px] text-success font-mono flex items-center gap-1">
          <span>✓</span>
          <span>TRANSFER_COMPLETE</span>
        </div>
      );
    case "failed":
      return (
        <div
          className="text-[10px] text-destructive font-mono truncate"
          title={task.errorMessage}
        >
          <span className="mr-1">✗</span>
          {task.errorMessage || "TRANSFER_FAILED"}
        </div>
      );
    case "canceled":
      return (
        <div className="text-[10px] text-muted-foreground font-mono">
          CANCELED
        </div>
      );
  }
}

function TaskIcon({
  direction,
  status,
}: {
  direction: "upload" | "download";
  status: TransferStatus;
}) {
  const baseClasses = "h-4 w-4 flex-shrink-0";

  switch (status) {
    case "success":
      return <CheckCircle className={cn(baseClasses, "text-success")} />;
    case "failed":
      return <XCircle className={cn(baseClasses, "text-destructive")} />;
    default: {
      const Icon = direction === "upload" ? Upload : Download;
      const colorClass = status === "running"
        ? direction === "upload"
          ? "text-transfer-upload"
          : "text-transfer-download"
        : "text-muted-foreground";
      return (
        <div className="relative">
          <Icon className={cn(baseClasses, colorClass)} />
          {status === "running" && (
            <div className="absolute inset-0 animate-ping opacity-30">
              <Icon className={cn(baseClasses, colorClass)} />
            </div>
          )}
        </div>
      );
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
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-0.5">
        {isActive && (
          <ActionButton
            icon={X}
            tooltip="CANCEL"
            onClick={onCancel}
            className="hover:text-destructive"
          />
        )}
        {status === "failed" && retryable && (
          <ActionButton
            icon={RotateCcw}
            tooltip="RETRY"
            onClick={onRetry}
            className="hover:text-warning"
          />
        )}
        {!isActive && (
          <ActionButton
            icon={X}
            tooltip="REMOVE"
            onClick={onRemove}
            className="hover:text-muted-foreground"
          />
        )}
      </div>
    </TooltipProvider>
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
          className={cn("h-5 w-5", className)}
          onClick={onClick}
        >
          <Icon className="h-3 w-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="font-mono text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
