import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AiHealthStatus } from "@/hooks/useAiHealthCheck";

interface AiHealthBadgeProps {
  status: AiHealthStatus;
  className?: string;
}

/**
 * AI runtime 四态 badge（`disabled` 不渲染，上游条件隐藏）。
 *
 * 视觉语义（color tokens only，参考 `.claude/rules/domain-styling.md`）：
 * - model-missing: 提示引导下载 → 次要 warning 风格
 * - loading: 载入中 → 次要 neutral + spinner
 * - ready: 可用 → primary 强调
 * - error: IPC 异常 → destructive
 */
export function AiHealthBadge({ status, className }: AiHealthBadgeProps) {
  if (status === "disabled") return null;

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
      data-status={status}
      aria-label={`AI 状态：${config.label}`}
      title={config.title}
    >
      <Icon className={cn("size-3", status === "loading" && "animate-spin")} aria-hidden />
      {config.label}
    </Badge>
  );
}

type StatusKey = Exclude<AiHealthStatus, "disabled">;

const STATUS_CONFIG: Record<
  StatusKey,
  {
    label: string;
    title: string;
    icon: typeof CheckCircle2;
    variant: "default" | "secondary" | "destructive" | "outline";
    className?: string;
  }
> = {
  "model-missing": {
    label: "未下载",
    title: "本地模型文件缺失 —— 需完成 GGUF 下载",
    icon: Download,
    variant: "outline",
  },
  loading: {
    label: "载入中",
    title: "AI runtime 正在准备中 —— 首次启动或模型重新加载",
    icon: Loader2,
    variant: "secondary",
  },
  ready: {
    label: "就绪",
    title: "AI runtime 已就绪",
    icon: CheckCircle2,
    variant: "default",
  },
  error: {
    label: "异常",
    title: "健康检查失败 —— 后台会自动重试",
    icon: AlertTriangle,
    variant: "destructive",
  },
};
