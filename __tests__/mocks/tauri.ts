import { vi } from "vitest";
import type { Profile } from "@/types/profile";
import type { FileEntry } from "@/types/file";
import type { TransferTask } from "@/types/transfer";
import type { Settings } from "@/types/settings";

// Mock profile data
export const mockProfile: Profile = {
  id: "test-profile-1",
  name: "Test Server",
  host: "192.168.1.100",
  port: 22,
  username: "testuser",
  authType: "password",
  passwordRef: undefined,
  privateKeyPath: undefined,
  passphraseRef: undefined,
  initialPath: "/home/testuser",
  createdAt: 1704067200000,
  updatedAt: 1704067200000,
};

// Mock file entries
export const mockFileEntries: FileEntry[] = [
  {
    name: "Documents",
    path: "/home/testuser/Documents",
    isDir: true,
    size: 4096,
    mtime: 1704067200,
    mode: 0o755,
  },
  {
    name: "file.txt",
    path: "/home/testuser/file.txt",
    isDir: false,
    size: 1024,
    mtime: 1704067200,
    mode: 0o644,
  },
];

// Mock transfer task
export const mockTransferTask: TransferTask = {
  taskId: "task-1",
  sessionId: "session-1",
  direction: "upload",
  localPath: "/local/file.txt",
  remotePath: "/remote/file.txt",
  fileName: "file.txt",
  status: "running",
  transferred: 512,
  total: 1024,
  speed: 1024,
  percent: 50,
  errorMessage: undefined,
  createdAt: Date.now(),
};

// Mock settings
export const mockSettings: Settings = {
  defaultDownloadDir: "/Users/test/Downloads",
  maxConcurrentTransfers: 3,
  connectionTimeoutSecs: 30,
  transferRetryCount: 2,
  logLevel: "info",
};

// IPC command mock handlers
type InvokeHandler = (cmd: string, args?: Record<string, unknown>) => unknown;

const defaultHandlers: Record<string, InvokeHandler> = {
  profile_list: () => [mockProfile],
  profile_upsert: (_cmd, args) => args?.id ?? "new-profile-id",
  profile_delete: () => undefined,
  session_connect: () => "session-123",
  session_disconnect: () => undefined,
  sftp_list_dir: () => mockFileEntries,
  sftp_mkdir: () => undefined,
  sftp_rename: () => undefined,
  sftp_delete: () => undefined,
  transfer_upload: () => "task-upload-1",
  transfer_download: () => "task-download-1",
  transfer_cancel: () => undefined,
  settings_get: () => mockSettings,
  settings_set: () => undefined,
};

// Create invoke mock with custom handlers
export function createInvokeMock(
  customHandlers: Partial<Record<string, InvokeHandler>> = {}
) {
  const handlers = { ...defaultHandlers, ...customHandlers };

  return vi.fn((cmd: string, args?: Record<string, unknown>) => {
    const handler = handlers[cmd];
    if (handler) {
      return Promise.resolve(handler(cmd, args));
    }
    return Promise.reject(new Error(`Unknown command: ${cmd}`));
  });
}

// Create event listener mock
export function createListenMock() {
  const listeners = new Map<string, ((payload: unknown) => void)[]>();

  const listen = vi.fn(
    (event: string, handler: (payload: unknown) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(handler);

      // Return unlisten function
      return Promise.resolve(() => {
        const eventListeners = listeners.get(event);
        if (eventListeners) {
          const index = eventListeners.indexOf(handler);
          if (index > -1) {
            eventListeners.splice(index, 1);
          }
        }
      });
    }
  );

  const emit = (event: string, payload: unknown) => {
    const eventListeners = listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((handler) => handler({ payload }));
    }
  };

  return { listen, emit, listeners };
}
