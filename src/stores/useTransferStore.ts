import { create } from "zustand";
import type { TransferTask, TransferStatus } from "@/types/transfer";
import type { TransferProgressPayload, TransferStatusPayload } from "@/types/events";

const TERMINAL_STATUSES = new Set<TransferStatus>(["success", "failed", "canceled"]);

interface TransferState {
  tasks: Map<string, TransferTask>;
  /** Pre-computed sorted list, updated on every task mutation */
  _sortedTasks: TransferTask[];
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

/** Recompute sorted tasks from map (called after every mutation) */
function computeSorted(tasks: Map<string, TransferTask>): TransferTask[] {
  return Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export const useTransferStore = create<TransferState>((set, get) => ({
  tasks: new Map(),
  _sortedTasks: [],

  getTask: (taskId) => get().tasks.get(taskId),

  getAllTasks: () => get()._sortedTasks,

  getActiveTasks: () => {
    return get()._sortedTasks.filter((t) => t.status === "waiting" || t.status === "running");
  },

  getCompletedTasks: () => {
    return get()._sortedTasks.filter((t) => TERMINAL_STATUSES.has(t.status));
  },

  addTask: (task) =>
    set((state) => {
      const newTasks = new Map(state.tasks);
      newTasks.set(task.taskId, task);
      return { tasks: newTasks, _sortedTasks: computeSorted(newTasks) };
    }),

  updateProgress: (payload) =>
    set((state) => {
      const task = state.tasks.get(payload.taskId);
      if (!task) return state;

      const updatedTask = {
        ...task,
        transferred: payload.transferred,
        total: payload.total,
        speed: payload.speed,
        percent: payload.percent,
      };

      const newTasks = new Map(state.tasks);
      newTasks.set(payload.taskId, updatedTask);

      // Progress doesn't change createdAt — preserve sort order, just swap the ref
      const _sortedTasks = state._sortedTasks.map((t) =>
        t.taskId === payload.taskId ? updatedTask : t
      );
      return { tasks: newTasks, _sortedTasks };
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
      return { tasks: newTasks, _sortedTasks: computeSorted(newTasks) };
    }),

  removeTask: (taskId) =>
    set((state) => {
      const newTasks = new Map(state.tasks);
      newTasks.delete(taskId);
      return { tasks: newTasks, _sortedTasks: computeSorted(newTasks) };
    }),

  clearCompleted: () =>
    set((state) => {
      const newTasks = new Map(state.tasks);
      for (const [taskId, task] of newTasks) {
        if (TERMINAL_STATUSES.has(task.status)) {
          newTasks.delete(taskId);
        }
      }
      return { tasks: newTasks, _sortedTasks: computeSorted(newTasks) };
    }),

  syncTasks: (tasks) =>
    set(() => {
      const newTasks = new Map<string, TransferTask>();
      for (const task of tasks) {
        newTasks.set(task.taskId, task);
      }
      return { tasks: newTasks, _sortedTasks: computeSorted(newTasks) };
    }),
}));
