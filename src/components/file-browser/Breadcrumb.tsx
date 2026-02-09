/**
 * Breadcrumb Navigation Component - Precision Engineering
 */

import { ChevronRight, Copy, Home, MoreHorizontal } from "lucide-react";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { parsePath } from "@/lib/file";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BreadcrumbProps {
  path: string;
  homePath?: string;
  onNavigate: (path: string) => void;
  className?: string;
}

const MAX_VISIBLE_SEGMENTS = 4;

export function Breadcrumb({ path, homePath, onNavigate, className }: BreadcrumbProps) {
  const segments = useMemo(() => parsePath(path, homePath), [path, homePath]);

  const needCollapse = segments.length > MAX_VISIBLE_SEGMENTS;

  const visibleSegments = needCollapse ? [segments[0], null, ...segments.slice(-2)] : segments;

  const collapsedSegments = needCollapse ? segments.slice(1, -2) : [];

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(path).then(
      () => toast.success("Path copied to clipboard"),
      () => toast.error("Failed to copy path")
    );
  }, [path]);

  return (
    <nav
      className={cn("group flex items-center gap-0.5 text-xs", className)}
      aria-label="Breadcrumb navigation"
    >
      {visibleSegments.map((segment, index) => {
        if (segment === null) {
          return (
            <div key="collapsed" className="flex items-center gap-0.5">
              <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-5 px-1.5 hover:bg-primary/5">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="text-xs">
                  {collapsedSegments.map((seg) => (
                    <DropdownMenuItem key={seg.path} onClick={() => onNavigate(seg.path)}>
                      {seg.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }

        const isLast = index === visibleSegments.length - 1;
        const isFirst = index === 0;
        const isHome = segment.name === "/" || segment.name === "~";

        return (
          <div key={segment.path} className="flex items-center gap-0.5">
            {!isFirst && <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
            {isLast ? (
              <span
                className="text-foreground font-medium px-1.5 py-0.5 rounded truncate max-w-[160px]"
                aria-current="location"
              >
                {isHome ? <Home className="h-3.5 w-3.5 inline-block" /> : segment.name}
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-primary/5 rounded"
                onClick={() => onNavigate(segment.path)}
              >
                {isHome ? <Home className="h-3.5 w-3.5" /> : segment.name}
              </Button>
            )}
          </div>
        );
      })}

      {/* Copy path button */}
      <Button
        variant="ghost"
        size="icon"
        className="ml-1 h-auto w-auto p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopyPath}
        aria-label="Copy path"
      >
        <Copy className="h-3 w-3" />
      </Button>
    </nav>
  );
}
