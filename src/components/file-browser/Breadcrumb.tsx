/**
 * 路径面包屑导航组件 - Cyberpunk Terminal Style
 */

import { MoreHorizontal } from "lucide-react";
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
    <nav className={cn("flex items-center text-xs font-mono", className)} aria-label="面包屑导航">
      {visibleSegments.map((segment, index) => {
        if (segment === null) {
          return (
            <div key="collapsed" className="flex items-center">
              <span className="mx-1 text-primary">/</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 hover:bg-primary/10 hover:text-primary"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="font-mono text-xs">
                  {collapsedSegments.map((seg) => (
                    <DropdownMenuItem
                      key={seg.path}
                      onClick={() => onNavigate(seg.path)}
                      className="gap-2"
                    >
                      <span className="text-primary">/</span>
                      <span>{seg.name}</span>
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
          <div key={segment.path} className="flex items-center">
            {!isFirst && <span className="mx-0.5 text-primary">/</span>}
            {isLast ? (
              <span className="font-medium text-foreground px-1 py-0.5 bg-primary/10 rounded">
                {segment.name}
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={() => onNavigate(segment.path)}
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
