/**
 * File Browser Status Bar Component - Precision Engineering
 * Displays total file count, selection count, and other info
 */

import { memo } from "react";
import { Files, CheckSquare, Terminal } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatusBarProps {
  /** Total file count */
  totalCount: number;
  /** Selection count */
  selectionCount: number;
  /** Whether hidden files are shown */
  showHidden?: boolean;
  /** Additional class name */
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
        "flex items-center justify-between h-7 px-3 border-t border-border bg-card/30 text-[10px] text-muted-foreground",
        className
      )}
    >
      {/* Left: file stats */}
      <div className="flex items-center gap-4">
        {/* Total */}
        <div className="flex items-center gap-1.5">
          <Files className="h-3 w-3 text-primary/70" />
          <span>
            <span className="text-primary font-mono">{totalCount}</span>
            <span className="ml-1">items</span>
          </span>
        </div>

        {/* Selected count */}
        {selectionCount > 0 && (
          <div className="flex items-center gap-1.5 animate-fade-in">
            <CheckSquare className="h-3 w-3 text-primary/70" />
            <span>
              <span className="text-primary font-mono">{selectionCount}</span>
              <span className="ml-1">selected</span>
            </span>
          </div>
        )}
      </div>

      {/* Right: status indicators */}
      <div className="flex items-center gap-2">
        {showHidden && (
          <span className="text-primary/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
            Hidden files
          </span>
        )}
        <div className="flex items-center gap-1 text-muted-foreground/50">
          <Terminal className="h-3 w-3" />
          <span className="font-mono">SFTP</span>
        </div>
      </div>
    </div>
  );
});
