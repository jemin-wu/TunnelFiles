import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadingSpinner, FullPageLoader } from "@/components/ui/LoadingSpinner";
import { ErrorState, InlineError } from "@/components/ui/ErrorState";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { ErrorCode, type AppError } from "@/types/error";

describe("LoadingSpinner", () => {
  it("should render spinner with default size", () => {
    render(<LoadingSpinner />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
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

    expect(screen.getByText("认证失败，请检查用户名和密码")).toBeInTheDocument();
  });

  it("should render retry button when retryable", () => {
    const appError: AppError = {
      code: ErrorCode.NETWORK_LOST,
      message: "Network error",
      retryable: true,
    };

    render(<ErrorState error={appError} onRetry={mockOnRetry} />);

    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  });

  it("should not render retry button when not retryable", () => {
    const appError: AppError = {
      code: ErrorCode.NOT_FOUND,
      message: "Not found",
      retryable: false,
    };

    render(<ErrorState error={appError} onRetry={mockOnRetry} />);

    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
  });

  it("should call onRetry when retry button clicked", async () => {
    const user = userEvent.setup();
    const appError: AppError = {
      code: ErrorCode.TIMEOUT,
      message: "Timeout",
      retryable: true,
    };

    render(<ErrorState error={appError} onRetry={mockOnRetry} />);

    await user.click(screen.getByRole("button", { name: /Retry/ }));

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
    expect(screen.queryByText("Detailed error information here")).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText("Show details"));

    expect(screen.getByText("Detailed error information here")).toBeInTheDocument();

    // Click to collapse
    await user.click(screen.getByText("Hide details"));

    expect(screen.queryByText("Detailed error information here")).not.toBeInTheDocument();
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
      <ErrorState error={{ code: ErrorCode.NETWORK_LOST, message: "Network lost" }} />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorState error={{ code: ErrorCode.PERMISSION_DENIED, message: "Permission denied" }} />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<ErrorState error={{ code: ErrorCode.NOT_FOUND, message: "Not found" }} />);
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

describe("Empty (shadcn/ui)", () => {
  it("should render with title", () => {
    render(
      <Empty>
        <EmptyHeader>
          <EmptyTitle>没有数据</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );

    expect(screen.getByText("没有数据")).toBeInTheDocument();
  });

  it("should render with description", () => {
    render(
      <Empty>
        <EmptyHeader>
          <EmptyTitle>空目录</EmptyTitle>
          <EmptyDescription>拖拽文件到此上传</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

    expect(screen.getByText("空目录")).toBeInTheDocument();
    expect(screen.getByText("拖拽文件到此上传")).toBeInTheDocument();
  });

  it("should render with action button", () => {
    render(
      <Empty>
        <EmptyHeader>
          <EmptyTitle>空目录</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <button>上传文件</button>
        </EmptyContent>
      </Empty>
    );

    expect(screen.getByRole("button", { name: "上传文件" })).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <Empty className="custom-empty">
        <EmptyHeader>
          <EmptyTitle>Empty</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );

    expect(container.querySelector(".custom-empty")).toBeInTheDocument();
  });

  it("should render with media icon variant", () => {
    const { container } = render(
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <svg data-testid="test-icon" />
          </EmptyMedia>
          <EmptyTitle>Empty</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );

    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
    expect(container.querySelector("[data-variant='icon']")).toBeInTheDocument();
  });
});
