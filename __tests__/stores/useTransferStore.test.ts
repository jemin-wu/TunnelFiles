import { describe, it, expect, beforeEach } from "vitest";
import { useTransferStore } from "@/stores/useTransferStore";
import type { TransferTask } from "@/types/transfer";

const createMockTask = (overrides: Partial<TransferTask> = {}): TransferTask => ({
  taskId: "task-1",
  sessionId: "session-1",
  direction: "upload",
  localPath: "/local/file.txt",
  remotePath: "/remote/file.txt",
  fileName: "file.txt",
  status: "waiting",
  transferred: 0,
  total: 1024,
  createdAt: Date.now(),
  ...overrides,
});

describe("useTransferStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useTransferStore.setState({ tasks: new Map() });
  });

  describe("addTask", () => {
    it("should add a new task to the store", () => {
      const task = createMockTask();

      useTransferStore.getState().addTask(task);

      const storedTask = useTransferStore.getState().getTask("task-1");
      expect(storedTask).toEqual(task);
    });

    it("should handle multiple tasks", () => {
      const task1 = createMockTask({ taskId: "task-1" });
      const task2 = createMockTask({ taskId: "task-2" });

      useTransferStore.getState().addTask(task1);
      useTransferStore.getState().addTask(task2);

      expect(useTransferStore.getState().getAllTasks()).toHaveLength(2);
    });
  });

  describe("updateProgress", () => {
    it("should update task progress", () => {
      const task = createMockTask();
      useTransferStore.getState().addTask(task);

      useTransferStore.getState().updateProgress({
        taskId: "task-1",
        transferred: 512,
        total: 1024,
        speed: 1024,
        percent: 50,
      });

      const updatedTask = useTransferStore.getState().getTask("task-1");
      expect(updatedTask?.transferred).toBe(512);
      expect(updatedTask?.percent).toBe(50);
      expect(updatedTask?.speed).toBe(1024);
    });

    it("should not update non-existent task", () => {
      useTransferStore.getState().updateProgress({
        taskId: "non-existent",
        transferred: 512,
        total: 1024,
        speed: 1024,
        percent: 50,
      });

      expect(useTransferStore.getState().getAllTasks()).toHaveLength(0);
    });
  });

  describe("updateStatus", () => {
    it("should update task status to success", () => {
      const task = createMockTask({ status: "running" });
      useTransferStore.getState().addTask(task);

      useTransferStore.getState().updateStatus({
        taskId: "task-1",
        status: "success",
      });

      const updatedTask = useTransferStore.getState().getTask("task-1");
      expect(updatedTask?.status).toBe("success");
      expect(updatedTask?.completedAt).toBeDefined();
    });

    it("should set error info on failure", () => {
      const task = createMockTask({ status: "running" });
      useTransferStore.getState().addTask(task);

      useTransferStore.getState().updateStatus({
        taskId: "task-1",
        status: "failed",
        errorCode: "NETWORK_ERROR",
        errorMessage: "Connection lost",
      });

      const updatedTask = useTransferStore.getState().getTask("task-1");
      expect(updatedTask?.status).toBe("failed");
      expect(updatedTask?.errorCode).toBe("NETWORK_ERROR");
      expect(updatedTask?.errorMessage).toBe("Connection lost");
    });
  });

  describe("removeTask", () => {
    it("should remove a task from the store", () => {
      const task = createMockTask();
      useTransferStore.getState().addTask(task);

      useTransferStore.getState().removeTask("task-1");

      expect(useTransferStore.getState().getTask("task-1")).toBeUndefined();
    });
  });

  describe("clearCompleted", () => {
    it("should remove completed tasks only", () => {
      const runningTask = createMockTask({ taskId: "running", status: "running" });
      const successTask = createMockTask({ taskId: "success", status: "success" });
      const failedTask = createMockTask({ taskId: "failed", status: "failed" });

      useTransferStore.getState().addTask(runningTask);
      useTransferStore.getState().addTask(successTask);
      useTransferStore.getState().addTask(failedTask);

      useTransferStore.getState().clearCompleted();

      const remainingTasks = useTransferStore.getState().getAllTasks();
      expect(remainingTasks).toHaveLength(1);
      expect(remainingTasks[0].taskId).toBe("running");
    });
  });

  describe("getActiveTasks", () => {
    it("should return only waiting and running tasks", () => {
      useTransferStore.getState().addTask(createMockTask({ taskId: "1", status: "waiting" }));
      useTransferStore.getState().addTask(createMockTask({ taskId: "2", status: "running" }));
      useTransferStore.getState().addTask(createMockTask({ taskId: "3", status: "success" }));

      const activeTasks = useTransferStore.getState().getActiveTasks();

      expect(activeTasks).toHaveLength(2);
      expect(activeTasks.map((t) => t.taskId).sort()).toEqual(["1", "2"]);
    });
  });

  describe("getCompletedTasks", () => {
    it("should return only terminal state tasks", () => {
      useTransferStore.getState().addTask(createMockTask({ taskId: "1", status: "running" }));
      useTransferStore.getState().addTask(createMockTask({ taskId: "2", status: "success" }));
      useTransferStore.getState().addTask(createMockTask({ taskId: "3", status: "failed" }));
      useTransferStore.getState().addTask(createMockTask({ taskId: "4", status: "canceled" }));

      const completedTasks = useTransferStore.getState().getCompletedTasks();

      expect(completedTasks).toHaveLength(3);
    });
  });

  describe("syncTasks", () => {
    it("should replace all tasks with new list", () => {
      useTransferStore.getState().addTask(createMockTask({ taskId: "old-1" }));
      useTransferStore.getState().addTask(createMockTask({ taskId: "old-2" }));

      const newTasks = [
        createMockTask({ taskId: "new-1" }),
        createMockTask({ taskId: "new-2" }),
        createMockTask({ taskId: "new-3" }),
      ];

      useTransferStore.getState().syncTasks(newTasks);

      const allTasks = useTransferStore.getState().getAllTasks();
      expect(allTasks).toHaveLength(3);
      expect(allTasks.map((t) => t.taskId).sort()).toEqual(["new-1", "new-2", "new-3"]);
    });
  });
});
