/**
 * 拖拽上传区域组件 - Cyberpunk Terminal Style
 * 使用 Tauri webview 拖拽事件
 */

import { type ReactNode } from "react";
import { Upload, Terminal } from "lucide-react";

import { useDropUpload } from "@/hooks/useDropUpload";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  sessionId: string;
  remotePath: string;
  enabled?: boolean;
  children: ReactNode;
  className?: string;
}

export function DropZone({
  sessionId,
  remotePath,
  enabled = true,
  children,
  className,
}: DropZoneProps) {
  const { isDragging } = useDropUpload({ sessionId, remotePath, enabled });

  return (
    <div className={cn("relative", className)}>
      {children}

      {/* 拖拽覆盖层 - Cyberpunk Style */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md">
          {/* Background with scanline effect */}
          <div className="absolute inset-0 bg-background/90" />
          <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,255,159,0.02)_50%)] bg-[length:100%_4px] pointer-events-none" />

          {/* Border with glow effect */}
          <div className="absolute inset-4 border-2 border-dashed border-primary rounded animate-pulse-glow" />

          {/* Corner decorations */}
          <div className="absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2 border-primary" />
          <div className="absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2 border-primary" />
          <div className="absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2 border-primary" />
          <div className="absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2 border-primary" />

          {/* Content */}
          <div className="relative flex flex-col items-center gap-4 animate-fade-in">
            {/* Icon with glow */}
            <div className="relative">
              <div className="w-20 h-20 flex items-center justify-center rounded bg-primary/10 border border-primary/30">
                <Upload className="h-10 w-10 text-primary animate-bounce" />
              </div>
              <div className="absolute inset-0 w-20 h-20 rounded bg-primary/20 blur-xl -z-10" />
            </div>

            {/* Terminal-style text */}
            <div className="text-center space-y-2 font-mono">
              <div className="flex items-center justify-center gap-2 text-primary text-sm">
                <Terminal className="h-4 w-4" />
                <span className="tracking-wider">DROP_TO_UPLOAD</span>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="text-primary">&gt;</span> 释放文件到当前目录
              </p>
              <div className="flex items-center justify-center gap-1 text-[10px] text-primary/60 bg-primary/5 px-3 py-1 rounded">
                <span>TARGET:</span>
                <span className="text-primary truncate max-w-[200px]">{remotePath}</span>
              </div>
            </div>

            {/* Decorative lines */}
            <div className="flex items-center gap-2 mt-2">
              <div className="w-12 h-px bg-gradient-to-r from-transparent to-primary/50" />
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              <div className="w-12 h-px bg-gradient-to-l from-transparent to-primary/50" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
