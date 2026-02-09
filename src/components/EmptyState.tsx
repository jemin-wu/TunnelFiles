/**
 * 空状态组件
 */

import { type ReactNode } from "react";
import {
  FolderOpen,
  Server,
  Upload,
  FileQuestion,
  Inbox,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  folder: FolderOpen,
  server: Server,
  upload: Upload,
  file: FileQuestion,
  inbox: Inbox,
  terminal: Terminal,
};

interface EmptyStateProps {
  icon?: keyof typeof ICON_MAP | LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  className,
  size = "md",
}: EmptyStateProps) {
  const Icon = typeof icon === "string" ? ICON_MAP[icon] || Inbox : icon;

  const sizeClasses = {
    sm: {
      container: "py-6 gap-3",
      iconWrapper: "w-12 h-12",
      icon: "h-5 w-5",
      title: "text-xs",
      description: "text-[10px]",
    },
    md: {
      container: "py-10 gap-4",
      iconWrapper: "w-14 h-14",
      icon: "h-6 w-6",
      title: "text-sm",
      description: "text-xs",
    },
    lg: {
      container: "py-14 gap-5",
      iconWrapper: "w-16 h-16",
      icon: "h-7 w-7",
      title: "text-base",
      description: "text-sm",
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center animate-fade-in",
        sizes.container,
        className
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "flex items-center justify-center rounded bg-primary/10 border border-primary/20",
          sizes.iconWrapper
        )}
      >
        <Icon className={cn("text-primary/60", sizes.icon)} />
      </div>

      {/* Text content */}
      <div className="space-y-1.5 max-w-xs">
        <h3 className={cn("font-medium tracking-wide text-foreground", sizes.title)}>{title}</h3>
        {description && (
          <p className={cn("text-muted-foreground", sizes.description)}>{description}</p>
        )}
      </div>

      {/* Action button */}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
