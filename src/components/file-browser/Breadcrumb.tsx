/**
 * Breadcrumb Navigation Component - Precision Engineering
 */

import { ChevronRight, MoreHorizontal } from "lucide-react";
import { useMemo } from "react";

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

  return (
    <nav
      className={cn("group flex items-center gap-0.5 text-sm", className)}
      aria-label="Breadcrumb navigation"
    >
      {visibleSegments.map((segment, index) => {
        if (segment === null) {
          return (
            <div key="collapsed" className="flex items-center gap-0.5">
              <ChevronRight className="text-muted-foreground/40 size-3 shrink-0" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-5 px-1.5">
                    <MoreHorizontal className="size-3.5" />
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

        return (
          <div key={segment.path} className="flex items-center gap-0.5">
            {!isFirst && <ChevronRight className="text-muted-foreground/40 size-3 shrink-0" />}
            {isLast ? (
              <span
                className="text-foreground max-w-40 truncate rounded px-1.5 py-0.5 font-medium"
                aria-current="location"
                title={segment.name}
              >
                {segment.name}
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-auto max-w-40 truncate rounded px-1.5 py-0.5 text-sm"
                onClick={() => onNavigate(segment.path)}
                title={segment.name}
              >
                {segment.name}
              </Button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
