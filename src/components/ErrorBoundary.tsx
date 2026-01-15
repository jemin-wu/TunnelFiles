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

  let errorMessage = "发生未知错误";
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
  const message = error instanceof Error ? error.message : (error?.message ?? "未知错误");
  const detail = error instanceof Error ? error.stack : (error as { detail?: string })?.detail;

  const getFullErrorText = () => {
    const lines = [
      "=== TunnelFiles 错误报告 ===",
      `时间: ${new Date().toISOString()}`,
      `错误: ${message}`,
    ];
    if (detail) {
      lines.push("", "堆栈跟踪:", detail);
    }
    lines.push("", "=== 错误报告结束 ===");
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
    <div className="flex flex-col items-center justify-center h-full p-8">
      <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-xl font-semibold mb-2">出错了</h2>
      <p className="text-muted-foreground text-center mb-4 max-w-md">{message}</p>
      {detail && (
        <pre className="text-xs text-muted-foreground bg-muted p-4 rounded-lg max-w-2xl overflow-auto max-h-48 mb-4">
          {detail}
        </pre>
      )}
      <div className="flex gap-2 flex-wrap justify-center">
        <Button variant="secondary" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              复制错误信息
            </>
          )}
        </Button>
        <Button onClick={onReset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          重试
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = "/connections")}>
          返回连接页
        </Button>
      </div>
    </div>
  );
}
