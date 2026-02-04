/**
 * 文件浏览器状态栏组件 - Cyberpunk Terminal Style
 * 显示文件总数、选中数量等信息
 */

import { memo } from "react";
import { Files, CheckSquare, Terminal } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatusBarProps {
  /** 总文件数 */
  totalCount: number;
  /** 选中数量 */
  selectionCount: number;
  /** 是否显示隐藏文件 */
  showHidden?: boolean;
  /** 额外的类名 */
  className?: string;
}

export const StatusBar = memo(function StatusBar({
  totalCount,
  selectionCount,
  showHidden,
  className,
}: StatusBarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between h-7 px-3 border-t border-border bg-card/30 text-[10px] font-mono text-muted-foreground",
        className
      )}
    >
      {/* 左侧：文件统计 */}
      <div className="flex items-center gap-4">
        {/* 总数 */}
        <div className="flex items-center gap-1.5">
          <Files className="h-3 w-3 text-primary/70" />
          <span>
            <span className="text-primary">{totalCount}</span>
            <span className="ml-1">items</span>
          </span>
        </div>

        {/* 选中数 */}
        {selectionCount > 0 && (
          <div className="flex items-center gap-1.5 animate-fade-in">
            <CheckSquare className="h-3 w-3 text-primary/70" />
            <span>
              <span className="text-primary">{selectionCount}</span>
              <span className="ml-1">selected</span>
            </span>
          </div>
        )}
      </div>

      {/* 右侧：状态指示 */}
      <div className="flex items-center gap-2">
        {showHidden && (
          <span className="text-primary/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
            DOTFILES
          </span>
        )}
        <div className="flex items-center gap-1 text-muted-foreground/50">
          <Terminal className="h-3 w-3" />
          <span>SFTP</span>
        </div>
      </div>
    </div>
  );
});
