/**
 * File Preview Panel Component
 * Displays file information and action buttons for selected files
 */

import { memo } from "react";
import { Download, Pencil, Trash2, FolderOpen, X, File } from "lucide-react";

import { FileIcon } from "./FileIcon";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatFileSize } from "@/types/file";
import { formatFileTime, getFileType } from "@/lib/file";
import { cn } from "@/lib/utils";
import type { FileEntry } from "@/types";

interface FilePreviewProps {
  /** The selected file to preview */
  file: FileEntry | null;
  /** Callback when the close button is clicked */
  onClose?: () => void;
  /** Callback when download button is clicked */
  onDownload?: (file: FileEntry) => void;
  /** Callback when rename button is clicked */
  onRename?: (file: FileEntry) => void;
  /** Callback when delete button is clicked */
  onDelete?: (file: FileEntry) => void;
  /** Callback when open/enter directory is clicked (for folders) */
  onOpen?: (file: FileEntry) => void;
  /** Additional CSS class names */
  className?: string;
}

interface InfoRowProps {
  label: string;
  value: string;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm font-mono text-foreground truncate ml-4 max-w-[60%] text-right tabular-nums">
        {value}
      </span>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
}

function ActionButton({ icon, label, onClick, variant = "outline" }: ActionButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size="icon-sm"
            onClick={onClick}
            className="flex-shrink-0"
            aria-label={label}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="font-mono text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const FilePreview = memo(function FilePreview({
  file,
  onClose,
  onDownload,
  onRename,
  onDelete,
  onOpen,
  className,
}: FilePreviewProps) {
  // Empty state when no file is selected
  if (!file) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full p-6 text-muted-foreground",
          className
        )}
      >
        <div className="relative">
          <div className="w-12 h-12 flex items-center justify-center rounded bg-primary/10 border border-primary/20">
            <File className="h-6 w-6 text-primary/60" />
          </div>
          {/* Corner decorations */}
          <div className="absolute -top-0.5 -left-0.5 w-1.5 h-1.5 border-l border-t border-primary/40" />
          <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 border-r border-t border-primary/40" />
          <div className="absolute -bottom-0.5 -left-0.5 w-1.5 h-1.5 border-l border-b border-primary/40" />
          <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 border-r border-b border-primary/40" />
        </div>
        <p className="text-xs font-mono mt-3">NO_SELECTION</p>
        <p className="text-xs font-mono text-muted-foreground/60 mt-1">
          <span className="text-primary">&gt;</span> Select a file to preview
        </p>
      </div>
    );
  }

  const fileType = getFileType(file);

  return (
    <div
      className={cn(
        "flex flex-col h-full border-l border-border bg-card/50",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon file={file} className="h-5 w-5 flex-shrink-0" />
          <TooltipProvider delayDuration={500}>
            <Tooltip>
              <TooltipTrigger asChild>
                <h3 className="text-sm font-mono font-medium truncate">
                  {file.name}
                </h3>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="font-mono text-xs max-w-[300px]">
                {file.name}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-1">
          <InfoRow label="Type" value={file.isDir ? "Directory" : fileType.toUpperCase()} />
          {!file.isDir && (
            <InfoRow label="Size" value={formatFileSize(file.size)} />
          )}
          <InfoRow label="Modified" value={formatFileTime(file.mtime)} />
          <InfoRow label="Path" value={file.path} />
        </div>

        {/* Full path display for long paths */}
        {file.path.length > 30 && (
          <>
            <Separator className="my-4" />
            <div className="space-y-1">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Full Path
              </span>
              <p className="text-xs font-mono text-foreground/80 break-all bg-muted/30 p-2 rounded border border-border/50">
                {file.path}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-card/30">
        {file.isDir && onOpen && (
          <ActionButton
            icon={<FolderOpen className="h-4 w-4" />}
            label="Open Directory"
            onClick={() => onOpen(file)}
          />
        )}
        {!file.isDir && onDownload && (
          <ActionButton
            icon={<Download className="h-4 w-4" />}
            label="Download"
            onClick={() => onDownload(file)}
          />
        )}
        {onRename && (
          <ActionButton
            icon={<Pencil className="h-4 w-4" />}
            label="Rename"
            onClick={() => onRename(file)}
          />
        )}
        {onDelete && (
          <ActionButton
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete"
            onClick={() => onDelete(file)}
            variant="ghost"
          />
        )}
      </div>
    </div>
  );
});
