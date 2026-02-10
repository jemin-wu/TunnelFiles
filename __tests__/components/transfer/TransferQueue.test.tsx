import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransferTask } from "@/types/transfer";

// Polyfill ResizeObserver for Radix UI ScrollArea
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof globalThis.ResizeObserver;
  }
});

// Mock transfer store
const mockClearCompleted = vi.fn();
const mockRemoveTask = vi.fn();
const mockUpdateStatus = vi.fn();

let mockTasks = new Map<string, TransferTask>();

vi.mock("@/stores/useTransferStore", () => ({
  useTransferStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      tasks: mockTasks,
      clearCompleted: mockClearCompleted,
      removeTask: mockRemoveTask,
      updateStatus: mockUpdateStatus,
    }),
}));

// Mock transfer lib
const mockCancelTransfer = vi.fn();
const mockRetryTransfer = vi.fn();
const mockCleanupTransfers = vi.fn();

vi.mock("@/lib/transfer", () => ({
  cancelTransfer: (...args: unknown[]) => mockCancelTransfer(...args),
  retryTransfer: (...args: unknown[]) => mockRetryTransfer(...args),
  cleanupTransfers: (...args: unknown[]) => mockCleanupTransfers(...args),
}));

import { TransferQueue } from "@/components/transfer/TransferQueue";

function makeTask(overrides: Partial<TransferTask> = {}): TransferTask {
  return {
    taskId: "task-1",
    sessionId: "session-1",
    direction: "download",
    localPath: "/local/file.txt",
    remotePath: "/remote/file.txt",
    fileName: "file.txt",
    status: "running",
    transferred: 512000,
    total: 1024000,
    speed: 102400,
    percent: 50,
    createdAt: Date.now(),
    ...overrides,
  };
}

function setTasks(tasks: TransferTask[]) {
  mockTasks = new Map(tasks.map((t) => [t.taskId, t]));
}

describe("TransferQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTasks = new Map();
  });

  it("should render empty state when no tasks", () => {
    setTasks([]);
    render(<TransferQueue />);

    expect(screen.getByText("No active transfers")).toBeInTheDocument();
  });

  it("should render active transfer with file name and progress", () => {
    setTasks([
      makeTask({
        taskId: "dl-1",
        fileName: "report.pdf",
        status: "running",
        percent: 50,
        speed: 102400,
      }),
    ]);

    render(<TransferQueue />);

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    // Progress bar should be rendered (role=progressbar)
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    // Speed should be formatted and displayed
    expect(screen.getByText("100 KB/s")).toBeInTheDocument();
    // Percent displayed
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("should render completed task with success status", () => {
    setTasks([
      makeTask({
        taskId: "dl-2",
        fileName: "image.png",
        status: "success",
        percent: 100,
      }),
    ]);

    render(<TransferQueue />);

    expect(screen.getByText("image.png")).toBeInTheDocument();
    expect(screen.getByText("Transfer complete")).toBeInTheDocument();
  });

  it("should call clearCompleted and cleanupTransfers when clear button is clicked", async () => {
    const user = userEvent.setup();

    setTasks([
      makeTask({
        taskId: "dl-3",
        fileName: "done.zip",
        status: "success",
      }),
    ]);

    const { container } = render(<TransferQueue />);

    // The clear completed button contains a Trash2 icon (lucide-trash-2 class)
    const trashIcon = container.querySelector(".lucide-trash-2");
    expect(trashIcon).toBeInTheDocument();
    const clearButton = trashIcon!.closest("button")!;
    await user.click(clearButton);

    await waitFor(() => {
      expect(mockClearCompleted).toHaveBeenCalledTimes(1);
      expect(mockCleanupTransfers).toHaveBeenCalledTimes(1);
    });
  });

  it("should show active count when there are running tasks", () => {
    setTasks([
      makeTask({ taskId: "t-1", status: "running" }),
      makeTask({ taskId: "t-2", status: "waiting", createdAt: Date.now() - 1000 }),
    ]);

    render(<TransferQueue />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("should show done count when there are completed tasks", () => {
    setTasks([makeTask({ taskId: "t-done", status: "success" })]);

    render(<TransferQueue />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  it("should render failed task with error message", () => {
    setTasks([
      makeTask({
        taskId: "fail-1",
        fileName: "broken.txt",
        status: "failed",
        errorMessage: "Connection reset",
        retryable: true,
      }),
    ]);

    render(<TransferQueue />);

    expect(screen.getByText("broken.txt")).toBeInTheDocument();
    expect(screen.getByText("Connection reset")).toBeInTheDocument();
  });

  it("should render canceled task", () => {
    setTasks([
      makeTask({
        taskId: "cancel-1",
        fileName: "canceled.dat",
        status: "canceled",
      }),
    ]);

    render(<TransferQueue />);

    expect(screen.getByText("canceled.dat")).toBeInTheDocument();
    expect(screen.getByText("Canceled")).toBeInTheDocument();
  });

  it("should render waiting task with queued status", () => {
    setTasks([
      makeTask({
        taskId: "wait-1",
        fileName: "queued.log",
        status: "waiting",
      }),
    ]);

    render(<TransferQueue />);

    expect(screen.getByText("queued.log")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });
});
