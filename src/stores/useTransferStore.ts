import { create } from "zustand";
import type { TransferTask, TransferStatus } from "@/types/transfer";
import type { TransferProgressPayload, TransferStatusPayload } from "@/types/events";

const TERMINAL_STATUSES = new Set<TransferStatus>(["success", "failed", "canceled"]);

interface TransferState {
  tasks: Map<string, TransferTask>;
  // Computed getters
  getTask: (taskId: string) => TransferTask | undefined;
  getAllTasks: () => TransferTask[];
  getActiveTasks: () => TransferTask[];
  getCompletedTasks: () => TransferTask[];
  // Actions
  addTask: (task: TransferTask) => void;
  updateProgress: (payload: TransferProgressPayload) => void;
  updateStatus: (payload: TransferStatusPayload) => void;
  removeTask: (taskId: string) => void;
  clearCompleted: () => void;
  syncTasks: (tasks: TransferTask[]) => void;
}

export const useTransferStore = create<TransferState>((set, get) => ({
  tasks: new Map(),

  getTask: (taskId) => get().tasks.get(taskId),

  getAllTasks: () => {
    const tasks = Array.from(get().tasks.values());
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  },

  getActiveTasks: () => {
    return get()
      .getAllTasks()
      .filter((t) => t.status === "waiting" || t.status === "running");
  },

  getCompletedTasks: () => {
    return get()
      .getAllTasks()
      .filter((t) => TERMINAL_STATUSES.has(t.status));
  },

  addTask: (task) =>
    set((state) => {
      const newTasks = new Map(state.tasks);
      newTasks.set(task.taskId, task);
      return { tasks: newTasks };
    }),

  updateProgress: (payload) =>
    set((state) => {
      const task = state.tasks.get(payload.taskId);
      if (!task) return state;

      const newTasks = new Map(state.tasks);
      newTasks.set(payload.taskId, {
        ...task,
        transferred: payload.transferred,
        total: payload.total,
        speed: payload.speed,
        percent: payload.percent,
      });
      return { tasks: newTasks };
    }),

  updateStatus: (payload) =>
    set((state) => {
      const task = state.tasks.get(payload.taskId);
      if (!task) return state;

      const newTasks = new Map(state.tasks);
      const updatedTask: TransferTask = {
        ...task,
        status: payload.status,
      };

      if (payload.errorCode) updatedTask.errorCode = payload.errorCode;
      if (payload.errorMessage) updatedTask.errorMessage = payload.errorMessage;

      // Set completedAt for terminal states
      if (TERMINAL_STATUSES.has(payload.status) && !task.completedAt) {
        updatedTask.completedAt = Date.now();
      }

      newTasks.set(payload.taskId, updatedTask);
      return { tasks: newTasks };
    }),

  removeTask: (taskId) =>
    set((state) => {
      const newTasks = new Map(state.tasks);
      newTasks.delete(taskId);
      return { tasks: newTasks };
    }),

  clearCompleted: () =>
    set((state) => {
      const newTasks = new Map(state.tasks);
      for (const [taskId, task] of newTasks) {
        if (TERMINAL_STATUSES.has(task.status)) {
          newTasks.delete(taskId);
        }
      }
      return { tasks: newTasks };
    }),

  syncTasks: (tasks) =>
    set(() => {
      const newTasks = new Map<string, TransferTask>();
      for (const task of tasks) {
        newTasks.set(task.taskId, task);
      }
      return { tasks: newTasks };
    }),
}));
