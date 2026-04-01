/**
 * Breadcrumb Navigation Component - Precision Engineering
 * Supports editable mode via Cmd+L or double-click on current segment
 */

import { ChevronRight, MoreHorizontal } from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

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
  onValidatePath?: (path: string) => Promise<boolean>;
  className?: string;
}

const MAX_VISIBLE_SEGMENTS = 4;

export function Breadcrumb({
  path,
  homePath,
  onNavigate,
  onValidatePath,
  className,
}: BreadcrumbProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState(false);
  const [validating, setValidating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const segments = useMemo(() => parsePath(path, homePath), [path, homePath]);

  const needCollapse = segments.length > MAX_VISIBLE_SEGMENTS;
  const visibleSegments = needCollapse ? [segments[0], null, ...segments.slice(-2)] : segments;
  const collapsedSegments = needCollapse ? segments.slice(1, -2) : [];

  const enterEditMode = useCallback(() => {
    setEditValue(path);
    setEditError(false);
    setEditing(true);
  }, [path]);

  const exitEditMode = useCallback(() => {
    setEditing(false);
    setEditError(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === path) {
      exitEditMode();
      return;
    }

    // Basic path validation: must start with /
    if (!trimmed.startsWith("/")) {
      setEditError(true);
      return;
    }

    // Normalize: remove trailing slash (unless root), collapse double slashes
    let normalized = trimmed.replace(/\/+/g, "/");
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }

    if (normalized === path) {
      exitEditMode();
      return;
    }

    // Validate path exists on remote before navigating
    if (onValidatePath) {
      setValidating(true);
      try {
        const valid = await onValidatePath(normalized);
        if (!valid) {
          setEditError(true);
          return;
        }
      } catch {
        setEditError(true);
        return;
      } finally {
        setValidating(false);
      }
    }

    onNavigate(normalized);
    exitEditMode();
  }, [editValue, path, onNavigate, onValidatePath, exitEditMode]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Cmd+L keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        if (editing) {
          exitEditMode();
        } else {
          enterEditMode();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editing, enterEditMode, exitEditMode]);

  // Edit mode: show input field
  if (editing) {
    return (
      <nav className={cn("flex items-center gap-0.5 text-sm", className)} aria-label="Path editor">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            setEditError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              if (!validating) exitEditMode();
            }
          }}
          onBlur={() => {
            if (!validating) exitEditMode();
          }}
          disabled={validating}
          className={cn(
            "bg-muted/50 border-border h-6 w-full rounded border px-2 font-mono text-xs outline-none",
            "focus:border-primary focus:ring-primary/20 focus:ring-1",
            editError && "border-destructive focus:border-destructive focus:ring-destructive/20",
            validating && "opacity-60"
          )}
          spellCheck={false}
          aria-label="Remote path"
        />
      </nav>
    );
  }

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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5"
                    aria-label="Show collapsed path segments"
                  >
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
                className="text-foreground max-w-40 cursor-text truncate rounded px-1.5 py-0.5 font-medium"
                aria-current="location"
                title={segment.name}
                onDoubleClick={enterEditMode}
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
