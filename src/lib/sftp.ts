/**
 * SFTP IPC wrapper
 *
 * All SFTP-related Tauri IPC call wrappers with Zod validation
 */

import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import { ChmodResultSchema } from "./file";
import type { FileEntry } from "@/types";
import type { ChmodResult, DirectoryStats, RecursiveDeleteResult } from "@/types/file";

// ============================================================================
// Schemas
// ============================================================================

const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDir: z.boolean(),
  size: z.number().optional(),
  mtime: z.number().optional(),
  mode: z.number().optional(),
});

const FileListSchema = z.array(FileEntrySchema);

// ============================================================================
// SFTP Operations
// ============================================================================

/**
 * List remote directory contents
 */
export async function listDir(sessionId: string, path: string): Promise<FileEntry[]> {
  const result = await invoke("sftp_list_dir", { sessionId, path });
  return FileListSchema.parse(result);
}

/**
 * Get file/directory info
 */
export async function stat(sessionId: string, path: string): Promise<FileEntry> {
  const result = await invoke("sftp_stat", {
    sessionId,
    path,
  });
  return FileEntrySchema.parse(result);
}

/**
 * Create remote directory
 */
export async function mkdir(sessionId: string, path: string): Promise<void> {
  await invoke("sftp_mkdir", {
    sessionId,
    path,
  });
}

/**
 * Rename/move file or directory
 */
export async function rename(sessionId: string, fromPath: string, toPath: string): Promise<void> {
  await invoke("sftp_rename", {
    sessionId,
    fromPath,
    toPath,
  });
}

/**
 * Delete file or directory
 */
export async function deleteItem(sessionId: string, path: string, isDir: boolean): Promise<void> {
  await invoke("sftp_delete", {
    sessionId,
    path,
    isDir,
  });
}

/**
 * Change file/directory permissions
 */
export async function chmod(
  sessionId: string,
  paths: string[],
  mode: number
): Promise<ChmodResult> {
  const result = await invoke("sftp_chmod", {
    input: { sessionId, paths, mode },
  });
  return ChmodResultSchema.parse(result);
}

// ============================================================================
// Recursive Delete Schemas
// ============================================================================

export const DirectoryStatsSchema = z.object({
  fileCount: z.number(),
  dirCount: z.number(),
  totalSize: z.number(),
});

export const DeleteFailureSchema = z.object({
  path: z.string(),
  error: z.string(),
});

export const RecursiveDeleteResultSchema = z.object({
  deletedFiles: z.number(),
  deletedDirs: z.number(),
  failures: z.array(DeleteFailureSchema),
});

export const DeleteProgressSchema = z.object({
  path: z.string(),
  deletedCount: z.number(),
  totalCount: z.number(),
  currentPath: z.string(),
});

// ============================================================================
// Recursive Delete Operations
// ============================================================================

/**
 * Get directory statistics
 *
 * Used for delete confirmation dialog to show file count and total size
 */
export async function getDirStats(sessionId: string, path: string): Promise<DirectoryStats> {
  const result = await invoke("sftp_get_dir_stats", {
    sessionId,
    path,
  });
  return DirectoryStatsSchema.parse(result);
}

/**
 * Recursively delete directory
 *
 * Deletes directory and all contents, sends progress via delete:progress event
 */
export async function deleteRecursive(
  sessionId: string,
  path: string
): Promise<RecursiveDeleteResult> {
  const result = await invoke("sftp_delete_recursive", {
    input: { sessionId, path },
  });
  return RecursiveDeleteResultSchema.parse(result);
}
