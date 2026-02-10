/**
 * 全局错误边界组件
 */

import { Component, type ReactNode, useState } from "react";
import { useRouteError, isRouteErrorResponse } from "react-router-dom";
import { AlertTriangle, RefreshCw, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 类组件错误边界（用于捕获渲染错误）
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ hasError: false, error: null })}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * 路由错误处理组件（用于 React Router errorElement）
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  let errorMessage = "An unknown error occurred";
  let errorDetail: string | undefined;

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}`;
    errorDetail = error.data?.message;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetail = error.stack;
  } else if (typeof error === "string") {
    errorMessage = error;
  }

  return (
    <ErrorFallback
      error={{ message: errorMessage, detail: errorDetail }}
      onReset={() => window.location.reload()}
    />
  );
}

interface ErrorFallbackProps {
  error: { message: string; detail?: string } | Error | null;
  onReset: () => void;
}

function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const [copied, setCopied] = useState(false);
  const message = error instanceof Error ? error.message : (error?.message ?? "Unknown error");
  const detail = error instanceof Error ? error.stack : (error as { detail?: string })?.detail;

  const getFullErrorText = () => {
    const lines = [
      "=== TunnelFiles Error Report ===",
      `Time: ${new Date().toISOString()}`,
      `Error: ${message}`,
    ];
    if (detail) {
      lines.push("", "Stack trace:", detail);
    }
    lines.push("", "=== End of Error Report ===");
    return lines.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getFullErrorText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级：创建临时文本框
      const textArea = document.createElement("textarea");
      textArea.value = getFullErrorText();
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <AlertTriangle className="text-destructive mb-4 h-12 w-12" />
      <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground mb-4 max-w-md text-center">{message}</p>
      {detail && (
        <pre className="text-muted-foreground bg-muted mb-4 max-h-48 max-w-2xl overflow-auto rounded-lg p-4 text-xs">
          {detail}
        </pre>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copy error info
            </>
          )}
        </Button>
        <Button onClick={onReset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = "/connections")}>
          Back to connections
        </Button>
      </div>
    </div>
  );
}
