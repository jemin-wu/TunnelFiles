/**
 * 加载动画组件
 */

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SpinnerSize = "sm" | "md" | "lg";

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
};

export function LoadingSpinner({ size = "md", className, label }: LoadingSpinnerProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-2", className)}
      role="status"
      aria-label={label || "Loading"}
    >
      <Loader2 className={cn("text-primary animate-spin", sizeClasses[size])} />
      {label && <span className="text-muted-foreground text-sm">{label}</span>}
    </div>
  );
}

/**
 * 全页加载状态
 */
export function FullPageLoader({ label }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center">
      <LoadingSpinner size="lg" label={label} />
    </div>
  );
}
