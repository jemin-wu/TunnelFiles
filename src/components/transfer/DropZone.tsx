/**
 * 拖拽上传区域组件 - Precision Engineering
 * 使用 Tauri webview 拖拽事件
 */

import { type ReactNode } from "react";
import { Upload } from "lucide-react";

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

      {/* 拖拽覆盖层 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md">
          <div className="absolute inset-0 bg-background/90" />

          {/* Border */}
          <div className="absolute inset-4 border-2 border-dashed border-primary rounded" />

          {/* Content */}
          <div className="relative flex flex-col items-center gap-4 animate-fade-in">
            <div className="w-16 h-16 flex items-center justify-center rounded-lg bg-primary/10 border border-primary/30">
              <Upload className="h-8 w-8 text-primary" />
            </div>

            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-primary">Drop to upload</p>
              <p className="text-xs text-muted-foreground">
                Release files into the current directory
              </p>
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded">
                <span>Target:</span>
                <span className="font-mono text-foreground truncate max-w-[200px]">
                  {remotePath}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
