/**
 * 错误状态组件
 * 根据错误码显示差异化提示
 */

import { useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  WifiOff,
  Lock,
  KeyRound,
  FileX,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorCode, ERROR_MESSAGES, type AppError } from "@/types/error";

interface ErrorStateProps {
  error: AppError | Error | string;
  onRetry?: () => void;
  className?: string;
}

const errorIcons: Partial<Record<ErrorCode, React.ReactNode>> = {
  [ErrorCode.NETWORK_LOST]: <WifiOff className="h-8 w-8" />,
  [ErrorCode.AUTH_FAILED]: <KeyRound className="h-8 w-8" />,
  [ErrorCode.PERMISSION_DENIED]: <Lock className="h-8 w-8" />,
  [ErrorCode.NOT_FOUND]: <FileX className="h-8 w-8" />,
  [ErrorCode.DIR_NOT_EMPTY]: <FolderOpen className="h-8 w-8" />,
};

function parseError(error: AppError | Error | string): AppError {
  if (typeof error === "string") {
    return {
      code: ErrorCode.UNKNOWN,
      message: error,
      retryable: true,
    };
  }

  if ("code" in error && Object.values(ErrorCode).includes(error.code)) {
    return error;
  }

  return {
    code: ErrorCode.UNKNOWN,
    message: error.message || "An unknown error occurred",
    retryable: true,
  };
}

export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  const [detailExpanded, setDetailExpanded] = useState(false);
  const appError = parseError(error);

  const friendlyMessage = ERROR_MESSAGES[appError.code] || appError.message;

  const icon = errorIcons[appError.code] || <AlertCircle className="h-8 w-8" />;

  const showRetry = appError.retryable && onRetry;
  const hasDetail = appError.detail && appError.detail.length > 0;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-8 px-4 text-center",
        className
      )}
      role="alert"
    >
      <div className="text-destructive">{icon}</div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{friendlyMessage}</p>
        {appError.message !== friendlyMessage && (
          <p className="text-xs text-muted-foreground truncate max-w-[300px]">
            {appError.message.length > 100
              ? `${appError.message.slice(0, 100)}...`
              : appError.message}
          </p>
        )}
      </div>

      {hasDetail && (
        <div className="w-full max-w-[400px]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetailExpanded(!detailExpanded)}
            className="gap-1 text-xs text-muted-foreground hover:text-foreground mx-auto h-auto py-1"
          >
            {detailExpanded ? (
              <>
                Hide details <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Show details <ChevronDown className="h-3 w-3" />
              </>
            )}
          </Button>
          {detailExpanded && (
            <pre className="mt-2 p-3 bg-muted rounded-md text-xs text-left overflow-auto max-h-[150px]">
              {appError.detail}
            </pre>
          )}
        </div>
      )}

      {showRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * 行内错误提示
 */
interface InlineErrorProps {
  message: string;
  className?: string;
}

export function InlineError({ message, className }: InlineErrorProps) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-destructive", className)} role="alert">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
