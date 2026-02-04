/**
 * Sonner Toast - 双主题设计
 *
 * 深色模式：Cyberpunk Neon - 霓虹发光效果
 * 浅色模式：Retro Terminal - 复古打字机风格，柔和配色
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
  const isDark = resolvedTheme === "dark";

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
            border font-mono text-[12px]
            transition-all duration-300 ease-in-out

            /* === 深色模式 - Cyberpunk Neon === */
            dark:rounded-sm dark:backdrop-blur-sm

            dark:data-[type=success]:border-[oklch(0.78_0.22_155)]
            dark:data-[type=success]:bg-[oklch(0.78_0.22_155_/_0.08)]
            dark:data-[type=success]:shadow-[0_0_20px_oklch(0.78_0.22_155_/_0.25),inset_0_0_30px_oklch(0.78_0.22_155_/_0.05)]

            dark:data-[type=error]:border-[oklch(0.65_0.25_15)]
            dark:data-[type=error]:bg-[oklch(0.65_0.25_15_/_0.08)]
            dark:data-[type=error]:shadow-[0_0_20px_oklch(0.65_0.25_15_/_0.25),inset_0_0_30px_oklch(0.65_0.25_15_/_0.05)]

            dark:data-[type=warning]:border-[oklch(0.82_0.18_85)]
            dark:data-[type=warning]:bg-[oklch(0.82_0.18_85_/_0.08)]
            dark:data-[type=warning]:shadow-[0_0_20px_oklch(0.82_0.18_85_/_0.25),inset_0_0_30px_oklch(0.82_0.18_85_/_0.05)]

            dark:data-[type=info]:border-[oklch(0.72_0.18_195)]
            dark:data-[type=info]:bg-[oklch(0.72_0.18_195_/_0.08)]
            dark:data-[type=info]:shadow-[0_0_20px_oklch(0.72_0.18_195_/_0.25),inset_0_0_30px_oklch(0.72_0.18_195_/_0.05)]

            dark:data-[type=loading]:border-border
            dark:data-[type=loading]:bg-card/90
            dark:data-[type=loading]:shadow-[0_0_15px_oklch(0.78_0.22_155_/_0.15)]

            dark:data-[type=default]:border-border
            dark:data-[type=default]:bg-card/90

            /* === 浅色模式 - Retro Terminal === */
            rounded-md shadow-md

            data-[type=success]:border-l-[3px]
            data-[type=success]:border-l-[oklch(0.45_0.18_155)]
            data-[type=success]:border-t-[oklch(0.88_0.02_85)]
            data-[type=success]:border-r-[oklch(0.88_0.02_85)]
            data-[type=success]:border-b-[oklch(0.88_0.02_85)]
            data-[type=success]:bg-[oklch(0.45_0.18_155_/_0.06)]

            data-[type=error]:border-l-[3px]
            data-[type=error]:border-l-[oklch(0.55_0.22_25)]
            data-[type=error]:border-t-[oklch(0.88_0.02_85)]
            data-[type=error]:border-r-[oklch(0.88_0.02_85)]
            data-[type=error]:border-b-[oklch(0.88_0.02_85)]
            data-[type=error]:bg-[oklch(0.55_0.22_25_/_0.06)]

            data-[type=warning]:border-l-[3px]
            data-[type=warning]:border-l-[oklch(0.6_0.18_70)]
            data-[type=warning]:border-t-[oklch(0.88_0.02_85)]
            data-[type=warning]:border-r-[oklch(0.88_0.02_85)]
            data-[type=warning]:border-b-[oklch(0.88_0.02_85)]
            data-[type=warning]:bg-[oklch(0.6_0.18_70_/_0.06)]

            data-[type=info]:border-l-[3px]
            data-[type=info]:border-l-[oklch(0.5_0.15_195)]
            data-[type=info]:border-t-[oklch(0.88_0.02_85)]
            data-[type=info]:border-r-[oklch(0.88_0.02_85)]
            data-[type=info]:border-b-[oklch(0.88_0.02_85)]
            data-[type=info]:bg-[oklch(0.5_0.15_195_/_0.06)]

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

            /* 深色模式 - 霓虹色 */
            dark:data-[type=success]:text-[oklch(0.78_0.22_155)]
            dark:data-[type=error]:text-[oklch(0.65_0.25_15)]
            dark:data-[type=warning]:text-[oklch(0.82_0.18_85)]
            dark:data-[type=info]:text-[oklch(0.72_0.18_195)]
            dark:data-[type=loading]:text-primary
            dark:data-[type=default]:text-foreground

            /* 浅色模式 - 深沉色 */
            data-[type=success]:text-[oklch(0.35_0.15_155)]
            data-[type=error]:text-[oklch(0.45_0.2_25)]
            data-[type=warning]:text-[oklch(0.5_0.16_70)]
            data-[type=info]:text-[oklch(0.4_0.12_195)]
            data-[type=loading]:text-primary
            data-[type=default]:text-foreground
          `,
          description: `
            text-[11px] text-muted-foreground mt-1 opacity-80
          `,
          actionButton: `
            px-3 py-1.5 text-[11px] font-medium rounded-sm
            transition-all duration-200

            /* 深色模式 */
            dark:bg-primary/20 dark:text-primary dark:border dark:border-primary/50
            dark:hover:bg-primary/30 dark:hover:shadow-[0_0_10px_var(--glow-primary)]

            /* 浅色模式 */
            bg-primary text-primary-foreground
            hover:bg-primary/90
          `,
          cancelButton: `
            px-3 py-1.5 text-[11px] font-medium rounded-sm
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
        success: isDark ? (
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-[oklch(0.78_0.22_155)] blur-md opacity-50 rounded-full" />
            <CircleCheckIcon className="relative size-5 text-[oklch(0.78_0.22_155)] drop-shadow-[0_0_6px_oklch(0.78_0.22_155)]" />
          </div>
        ) : (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[oklch(0.45_0.18_155_/_0.12)] flex items-center justify-center">
            <CircleCheckIcon className="size-4 text-[oklch(0.45_0.18_155)]" />
          </div>
        ),
        info: isDark ? (
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-[oklch(0.72_0.18_195)] blur-md opacity-50 rounded-full" />
            <InfoIcon className="relative size-5 text-[oklch(0.72_0.18_195)] drop-shadow-[0_0_6px_oklch(0.72_0.18_195)]" />
          </div>
        ) : (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[oklch(0.5_0.15_195_/_0.12)] flex items-center justify-center">
            <InfoIcon className="size-4 text-[oklch(0.5_0.15_195)]" />
          </div>
        ),
        warning: isDark ? (
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-[oklch(0.82_0.18_85)] blur-md opacity-50 rounded-full" />
            <TriangleAlertIcon className="relative size-5 text-[oklch(0.82_0.18_85)] drop-shadow-[0_0_6px_oklch(0.82_0.18_85)]" />
          </div>
        ) : (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[oklch(0.6_0.18_70_/_0.12)] flex items-center justify-center">
            <TriangleAlertIcon className="size-4 text-[oklch(0.6_0.18_70)]" />
          </div>
        ),
        error: isDark ? (
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-[oklch(0.65_0.25_15)] blur-md opacity-50 rounded-full" />
            <OctagonXIcon className="relative size-5 text-[oklch(0.65_0.25_15)] drop-shadow-[0_0_6px_oklch(0.65_0.25_15)]" />
          </div>
        ) : (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[oklch(0.55_0.22_25_/_0.12)] flex items-center justify-center">
            <OctagonXIcon className="size-4 text-[oklch(0.55_0.22_25)]" />
          </div>
        ),
        loading: isDark ? (
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-primary blur-md opacity-30 rounded-full animate-pulse" />
            <Loader2Icon className="relative size-5 text-primary animate-spin drop-shadow-[0_0_6px_var(--primary)]" />
          </div>
        ) : (
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
          "--border-radius": "2px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
