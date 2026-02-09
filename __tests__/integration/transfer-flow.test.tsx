import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";

import { useTransferStore } from "@/stores/useTransferStore";
import type { TransferTask } from "@/types/transfer";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    dismiss: vi.fn(),
  },
  Toaster: () => null,
}));

function createTransferTask(overrides: Partial<TransferTask> = {}): TransferTask {
  return {
    taskId: "task-1",
    sessionId: "session-1",
    direction: "upload",
    localPath: "/local/file.txt",
    remotePath: "/remote/file.txt",
    fileName: "file.txt",
    status: "waiting",
    transferred: 0,
    total: 10000,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("Transfer flow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    act(() => {
      useTransferStore.setState({ tasks: new Map() });
    });
  });

  it("adds a transfer task and tracks it in store", () => {
    const task = createTransferTask();

    act(() => {
      useTransferStore.getState().addTask(task);
    });

    const state = useTransferStore.getState();
    expect(state.getTask("task-1")).toEqual(task);
    expect(state.getAllTasks()).toHaveLength(1);
    expect(state.getActiveTasks()).toHaveLength(1);
  });

  it("updates transfer progress", () => {
    const task = createTransferTask({ status: "running" });

    act(() => {
      useTransferStore.getState().addTask(task);
    });

    act(() => {
      useTransferStore.getState().updateProgress({
        taskId: "task-1",
        transferred: 5000,
        total: 10000,
        speed: 1000,
        percent: 50,
      });
    });

    const updated = useTransferStore.getState().getTask("task-1");
    expect(updated?.transferred).toBe(5000);
    expect(updated?.percent).toBe(50);
    expect(updated?.speed).toBe(1000);
  });

  it("marks transfer as completed and moves to completed list", () => {
    const task = createTransferTask({ status: "running" });

    act(() => {
      useTransferStore.getState().addTask(task);
    });

    act(() => {
      useTransferStore.getState().updateStatus({
        taskId: "task-1",
        status: "success",
      });
    });

    const state = useTransferStore.getState();
    const completed = state.getTask("task-1");
    expect(completed?.status).toBe("success");
    expect(completed?.completedAt).toBeDefined();
    expect(state.getActiveTasks()).toHaveLength(0);
    expect(state.getCompletedTasks()).toHaveLength(1);
  });

  it("handles transfer cancellation", () => {
    const task = createTransferTask({ status: "running" });

    act(() => {
      useTransferStore.getState().addTask(task);
    });

    act(() => {
      useTransferStore.getState().updateStatus({
        taskId: "task-1",
        status: "canceled",
      });
    });

    const canceled = useTransferStore.getState().getTask("task-1");
    expect(canceled?.status).toBe("canceled");
    expect(canceled?.completedAt).toBeDefined();
    expect(useTransferStore.getState().getActiveTasks()).toHaveLength(0);
  });

  it("handles transfer failure with error info", () => {
    const task = createTransferTask({ status: "running" });

    act(() => {
      useTransferStore.getState().addTask(task);
    });

    act(() => {
      useTransferStore.getState().updateStatus({
        taskId: "task-1",
        status: "failed",
        errorCode: "SFTP_ERROR",
        errorMessage: "Permission denied",
      });
    });

    const failed = useTransferStore.getState().getTask("task-1");
    expect(failed?.status).toBe("failed");
    expect(failed?.errorCode).toBe("SFTP_ERROR");
    expect(failed?.errorMessage).toBe("Permission denied");
  });

  it("clears completed tasks", () => {
    act(() => {
      const store = useTransferStore.getState();
      store.addTask(createTransferTask({ taskId: "t1", status: "running" }));
      store.addTask(
        createTransferTask({ taskId: "t2", status: "success", completedAt: Date.now() })
      );
      store.addTask(
        createTransferTask({ taskId: "t3", status: "failed", completedAt: Date.now() })
      );
    });

    expect(useTransferStore.getState().getAllTasks()).toHaveLength(3);

    act(() => {
      useTransferStore.getState().clearCompleted();
    });

    const state = useTransferStore.getState();
    expect(state.getAllTasks()).toHaveLength(1);
    expect(state.getTask("t1")).toBeDefined();
    expect(state.getTask("t2")).toBeUndefined();
    expect(state.getTask("t3")).toBeUndefined();
  });

  it("syncs tasks from backend", () => {
    const tasks: TransferTask[] = [
      createTransferTask({ taskId: "t1", status: "running" }),
      createTransferTask({ taskId: "t2", status: "waiting" }),
    ];

    act(() => {
      useTransferStore.getState().syncTasks(tasks);
    });

    const state = useTransferStore.getState();
    expect(state.getAllTasks()).toHaveLength(2);
    expect(state.getActiveTasks()).toHaveLength(2);
  });
});
