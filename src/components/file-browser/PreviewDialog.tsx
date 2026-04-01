/**
 * File Preview Dialog
 * Centered modal showing file content (text with syntax highlighting) or binary metadata.
 * Max 256KB, rejects symlinks/directories server-side.
 */

import { useEffect, useState } from "react";
import { Download, FileText, FileWarning, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { readFile, type ReadPreviewResult } from "@/lib/sftp";
import type { FileEntry } from "@/types";

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileEntry | null;
  sessionId: string;
  onDownload?: (file: FileEntry) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    rs: "rust",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    html: "html",
    css: "css",
    md: "markdown",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    dockerfile: "dockerfile",
  };
  return map[ext] ?? "plaintext";
}

export function PreviewDialog({
  open,
  onOpenChange,
  file,
  sessionId,
  onDownload,
}: PreviewDialogProps) {
  const [result, setResult] = useState<ReadPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!open || !file || file.isDir) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);

    const fetchPreview = async () => {
      try {
        const r = await readFile(sessionId, file.path);
        if (!cancelled) {
          setResult(r);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchPreview();

    return () => {
      cancelled = true;
    };
  }, [open, file, sessionId, retryCount]);

  const language = file ? getLanguageFromPath(file.path) : "plaintext";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-[720px] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-border border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <FileText className="text-muted-foreground size-4" />
            <span className="truncate">{file?.name ?? "Preview"}</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            {result
              ? `${formatBytes(result.size)}${result.truncated ? " (truncated to 256KB)" : ""}${result.mimeGuess ? ` · ${result.mimeGuess}` : ""}`
              : loading
                ? "Loading..."
                : "File preview"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[200px]">
          {/* Loading state */}
          {loading && (
            <div className="flex h-[300px] items-center justify-center">
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex h-[300px] flex-col items-center justify-center gap-3">
              <FileWarning className="text-destructive size-8" />
              <p className="text-muted-foreground max-w-sm text-center text-sm">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setRetryCount((c) => c + 1)}>
                Retry
              </Button>
            </div>
          )}

          {/* Text content */}
          {result && result.contentType === "text" && result.content !== null && (
            <ScrollArea className="h-[60vh]">
              <pre className="bg-muted/30 p-4 text-xs leading-relaxed">
                <code className={`language-${language}`}>{result.content}</code>
              </pre>
            </ScrollArea>
          )}

          {/* Binary fallback */}
          {result && result.contentType === "binary" && (
            <div className="flex h-[300px] flex-col items-center justify-center gap-3">
              <FileWarning className="text-muted-foreground size-8" />
              <div className="text-center">
                <p className="text-sm font-medium">Binary file</p>
                <p className="text-muted-foreground text-xs">
                  {formatBytes(result.size)}
                  {result.mimeGuess ? ` · ${result.mimeGuess}` : ""}
                </p>
              </div>
              {file && onDownload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onDownload(file);
                    onOpenChange(false);
                  }}
                >
                  <Download className="mr-1.5 size-3.5" />
                  Download
                </Button>
              )}
            </div>
          )}

          {/* Empty file */}
          {result &&
            result.contentType === "text" &&
            result.content === null &&
            result.size === 0 && (
              <div className="flex h-[300px] flex-col items-center justify-center gap-2">
                <FileText className="text-muted-foreground size-8" />
                <p className="text-muted-foreground text-sm">Empty file</p>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
