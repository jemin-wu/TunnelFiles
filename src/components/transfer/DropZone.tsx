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
          <div className="bg-background/90 absolute inset-0" />

          {/* Border */}
          <div className="border-primary absolute inset-4 rounded border-2 border-dashed" />

          {/* Content */}
          <div className="animate-fade-in relative flex flex-col items-center gap-4">
            <div className="bg-primary/10 border-primary/30 flex h-16 w-16 items-center justify-center rounded-lg border">
              <Upload className="text-primary h-8 w-8" />
            </div>

            <div className="space-y-2 text-center">
              <p className="text-primary text-sm font-medium">Drop to upload</p>
              <p className="text-muted-foreground text-xs">
                Release files into the current directory
              </p>
              <div className="text-muted-foreground bg-muted/50 flex items-center justify-center gap-1 rounded px-3 py-1 text-xs">
                <span>Target:</span>
                <span className="text-foreground max-w-[200px] truncate font-mono">
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
