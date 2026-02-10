/**
 * Sonner Toast - Precision Engineering
 *
 * 简洁克制的通知设计：
 * - 2px 左边框标识类型（success/error/warning/info）
 * - 裸图标 + 语义色，无多余装饰
 * - 深浅主题统一结构，仅 token 色值切换
 */

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: `
            group toast
            flex items-start gap-3 w-full px-4 py-3
            rounded-md border border-border bg-card text-sm
            shadow-sm
            transition-all duration-200 ease-in-out

            data-[type=success]:border-l-2 data-[type=success]:border-l-success
            data-[type=error]:border-l-2 data-[type=error]:border-l-destructive
            data-[type=warning]:border-l-2 data-[type=warning]:border-l-warning
            data-[type=info]:border-l-2 data-[type=info]:border-l-info
          `,
          title: `
            font-medium text-foreground
          `,
          description: `
            text-xs text-muted-foreground mt-1
          `,
          actionButton: `
            px-3 py-1.5 text-xs font-medium rounded-md
            bg-primary text-primary-foreground
            hover:bg-primary/90
            transition-colors duration-150
          `,
          cancelButton: `
            px-3 py-1.5 text-xs font-medium rounded-md
            bg-muted text-muted-foreground border border-border
            hover:bg-accent/50
            transition-colors duration-150
          `,
          closeButton: `
            opacity-50 hover:opacity-100
            transition-opacity duration-150
          `,
        },
      }}
      icons={{
        success: <CircleCheckIcon className="size-5 shrink-0 text-success" />,
        info: <InfoIcon className="size-5 shrink-0 text-info" />,
        warning: <TriangleAlertIcon className="size-5 shrink-0 text-warning" />,
        error: <OctagonXIcon className="size-5 shrink-0 text-destructive" />,
        loading: <Loader2Icon className="size-5 shrink-0 text-muted-foreground animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "6px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
