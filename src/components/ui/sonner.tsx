/**
 * Sonner Toast - Precision Engineering
 *
 * 双主题设计：简洁、克制的通知样式
 *
 * 类型区分：
 * - success: 绿色系
 * - error: 红色系
 * - warning: 琥珀/金色系
 * - info: 青色系
 * - loading: 主色调
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
            flex items-start gap-3 w-full p-4
            border text-[12px]
            rounded-md
            transition-all duration-200 ease-in-out

            /* === 深色模式 === */
            dark:backdrop-blur-sm

            dark:data-[type=success]:border-success/30
            dark:data-[type=success]:bg-success/8

            dark:data-[type=error]:border-destructive/30
            dark:data-[type=error]:bg-destructive/8

            dark:data-[type=warning]:border-warning/30
            dark:data-[type=warning]:bg-warning/8

            dark:data-[type=info]:border-info/30
            dark:data-[type=info]:bg-info/8

            dark:data-[type=loading]:border-border
            dark:data-[type=loading]:bg-card/90

            dark:data-[type=default]:border-border
            dark:data-[type=default]:bg-card/90

            /* === 浅色模式 === */
            shadow-sm

            data-[type=success]:border-l-[3px]
            data-[type=success]:border-l-success
            data-[type=success]:border-t-border
            data-[type=success]:border-r-border
            data-[type=success]:border-b-border
            data-[type=success]:bg-success/6

            data-[type=error]:border-l-[3px]
            data-[type=error]:border-l-destructive
            data-[type=error]:border-t-border
            data-[type=error]:border-r-border
            data-[type=error]:border-b-border
            data-[type=error]:bg-destructive/6

            data-[type=warning]:border-l-[3px]
            data-[type=warning]:border-l-warning
            data-[type=warning]:border-t-border
            data-[type=warning]:border-r-border
            data-[type=warning]:border-b-border
            data-[type=warning]:bg-warning/6

            data-[type=info]:border-l-[3px]
            data-[type=info]:border-l-info
            data-[type=info]:border-t-border
            data-[type=info]:border-r-border
            data-[type=info]:border-b-border
            data-[type=info]:bg-info/6

            data-[type=loading]:border-border
            data-[type=loading]:bg-card

            data-[type=default]:border-border
            data-[type=default]:bg-card

            /* 深色模式覆盖浅色的左边框样式 */
            dark:data-[type=success]:border-l-[1px]
            dark:data-[type=error]:border-l-[1px]
            dark:data-[type=warning]:border-l-[1px]
            dark:data-[type=info]:border-l-[1px]
          `,
          title: `
            font-semibold tracking-wide

            /* 深色模式 */
            dark:data-[type=success]:text-success
            dark:data-[type=error]:text-destructive
            dark:data-[type=warning]:text-warning
            dark:data-[type=info]:text-info
            dark:data-[type=loading]:text-primary
            dark:data-[type=default]:text-foreground

            /* 浅色模式 */
            data-[type=success]:text-success
            data-[type=error]:text-destructive
            data-[type=warning]:text-warning
            data-[type=info]:text-info
            data-[type=loading]:text-primary
            data-[type=default]:text-foreground
          `,
          description: `
            text-[11px] text-muted-foreground mt-1 opacity-80
          `,
          actionButton: `
            px-3 py-1.5 text-[11px] font-medium rounded-md
            transition-all duration-200

            /* 深色模式 */
            dark:bg-primary/20 dark:text-primary dark:border dark:border-primary/30
            dark:hover:bg-primary/30

            /* 浅色模式 */
            bg-primary text-primary-foreground
            hover:bg-primary/90
          `,
          cancelButton: `
            px-3 py-1.5 text-[11px] font-medium rounded-md
            bg-muted text-muted-foreground border border-border
            hover:bg-muted/80
            transition-all duration-200
          `,
          closeButton: `
            opacity-50 hover:opacity-100
            transition-opacity
          `,
        },
      }}
      icons={{
        success: (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-success/12 flex items-center justify-center">
            <CircleCheckIcon className="size-4 text-success" />
          </div>
        ),
        info: (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-info/12 flex items-center justify-center">
            <InfoIcon className="size-4 text-info" />
          </div>
        ),
        warning: (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-warning/12 flex items-center justify-center">
            <TriangleAlertIcon className="size-4 text-warning" />
          </div>
        ),
        error: (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-destructive/12 flex items-center justify-center">
            <OctagonXIcon className="size-4 text-destructive" />
          </div>
        ),
        loading: (
          <div className="flex-shrink-0">
            <Loader2Icon className="size-5 text-primary animate-spin" />
          </div>
        ),
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
