import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadingSpinner, FullPageLoader } from "@/components/ui/LoadingSpinner";
import { ErrorState, InlineError } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { ErrorCode, type AppError } from "@/types/error";

describe("LoadingSpinner", () => {
  it("should render spinner with default size", () => {
    render(<LoadingSpinner />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "加载中");
  });

  it("should render spinner with custom label", () => {
    render(<LoadingSpinner label="正在加载文件..." />);

    expect(screen.getByText("正在加载文件...")).toBeInTheDocument();
  });

  it("should apply different sizes", () => {
    const { rerender } = render(<LoadingSpinner size="sm" />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(<LoadingSpinner size="lg" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    render(<LoadingSpinner className="custom-class" />);

    expect(screen.getByRole("status")).toHaveClass("custom-class");
  });
});

describe("FullPageLoader", () => {
  it("should render full page loader", () => {
    render(<FullPageLoader />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("should render with label", () => {
    render(<FullPageLoader label="加载中..." />);

    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  const mockOnRetry = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render error state with string error", () => {
    render(<ErrorState error="Something went wrong" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("should render error with AppError and friendly message", () => {
    const appError: AppError = {
      code: ErrorCode.AUTH_FAILED,
      message: "Auth failed",
      retryable: true,
    };

    render(<ErrorState error={appError} onRetry={mockOnRetry} />);

    expect(
      screen.getByText("认证失败，请检查用户名和密码")
    ).toBeInTheDocument();
  });

  it("should render retry button when retryable", () => {
    const appError: AppError = {
      code: ErrorCode.NETWORK_LOST,
      message: "Network error",
      retryable: true,
    };

    render(<ErrorState error={appError} onRetry={mockOnRetry} />);

    expect(screen.getByRole("button", { name: /重试/ })).toBeInTheDocument();
  });

  it("should not render retry button when not retryable", () => {
    const appError: AppError = {
      code: ErrorCode.NOT_FOUND,
      message: "Not found",
      retryable: false,
    };

    render(<ErrorState error={appError} onRetry={mockOnRetry} />);

    expect(screen.queryByRole("button", { name: /重试/ })).not.toBeInTheDocument();
  });

  it("should call onRetry when retry button clicked", async () => {
    const user = userEvent.setup();
    const appError: AppError = {
      code: ErrorCode.TIMEOUT,
      message: "Timeout",
      retryable: true,
    };

    render(<ErrorState error={appError} onRetry={mockOnRetry} />);

    await user.click(screen.getByRole("button", { name: /重试/ }));

    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  it("should show/hide detail when button clicked", async () => {
    const user = userEvent.setup();
    const appError: AppError = {
      code: ErrorCode.UNKNOWN,
      message: "Error",
      detail: "Detailed error information here",
      retryable: false,
    };

    render(<ErrorState error={appError} />);

    // Initially detail is hidden
    expect(
      screen.queryByText("Detailed error information here")
    ).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText("查看详情"));

    expect(
      screen.getByText("Detailed error information here")
    ).toBeInTheDocument();

    // Click to collapse
    await user.click(screen.getByText("收起详情"));

    expect(
      screen.queryByText("Detailed error information here")
    ).not.toBeInTheDocument();
  });

  it("should truncate long error messages", () => {
    const longMessage = "A".repeat(150);
    const appError: AppError = {
      code: ErrorCode.UNKNOWN,
      message: longMessage,
      retryable: false,
    };

    render(<ErrorState error={appError} />);

    // Should be truncated to 100 chars + "..."
    expect(screen.getByText(/A{100}\.\.\./)).toBeInTheDocument();
  });

  it("should display different icons for different error codes", () => {
    const { rerender } = render(
      <ErrorState
        error={{ code: ErrorCode.NETWORK_LOST, message: "Network lost" }}
      />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorState
        error={{ code: ErrorCode.PERMISSION_DENIED, message: "Permission denied" }}
      />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorState error={{ code: ErrorCode.NOT_FOUND, message: "Not found" }} />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("InlineError", () => {
  it("should render inline error message", () => {
    render(<InlineError message="Field is required" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Field is required")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    render(<InlineError message="Error" className="custom-error" />);

    expect(screen.getByRole("alert")).toHaveClass("custom-error");
  });
});

describe("EmptyState", () => {
  it("should render with title", () => {
    render(<EmptyState title="没有数据" />);

    expect(screen.getByText("没有数据")).toBeInTheDocument();
  });

  it("should render with description", () => {
    render(<EmptyState title="空目录" description="拖拽文件到此上传" />);

    expect(screen.getByText("空目录")).toBeInTheDocument();
    expect(screen.getByText("拖拽文件到此上传")).toBeInTheDocument();
  });

  it("should render with action button", () => {
    const mockAction = <button>上传文件</button>;

    render(
      <EmptyState
        title="空目录"
        description="没有文件"
        action={mockAction}
      />
    );

    expect(screen.getByRole("button", { name: "上传文件" })).toBeInTheDocument();
  });

  it("should apply different sizes", () => {
    const { rerender } = render(<EmptyState title="Empty" size="sm" />);
    expect(screen.getByText("Empty")).toBeInTheDocument();

    rerender(<EmptyState title="Empty" size="lg" />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(<EmptyState title="Empty" className="custom-empty" />);

    // The className is applied to the outermost container div
    expect(container.querySelector(".custom-empty")).toBeInTheDocument();
  });

  it("should render with different icon types", () => {
    const { rerender } = render(<EmptyState title="Empty" icon="folder" />);
    expect(screen.getByText("Empty")).toBeInTheDocument();

    rerender(<EmptyState title="Empty" icon="server" />);
    expect(screen.getByText("Empty")).toBeInTheDocument();

    rerender(<EmptyState title="Empty" icon="upload" />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });
});
