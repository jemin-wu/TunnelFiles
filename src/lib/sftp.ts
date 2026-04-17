/**
 * SFTP IPC wrapper
 *
 * All SFTP-related Tauri IPC call wrappers with Zod validation
 */

import { z } from "zod";

import { ChmodResultSchema } from "./file";
import { parseInvokeResult, timedInvoke } from "./error";
import type { FileEntry } from "@/types";
import type { ChmodResult, DirectoryStats, RecursiveDeleteResult, SortSpec } from "@/types/file";

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
export async function listDir(
  sessionId: string,
  path: string,
  sort?: SortSpec
): Promise<FileEntry[]> {
  const result = await timedInvoke("sftp_list_dir", {
    sessionId,
    path,
    sort: sort ?? null,
  });
  return parseInvokeResult(FileListSchema, result, "sftp_list_dir");
}

/**
 * Get file/directory info
 */
export async function stat(sessionId: string, path: string): Promise<FileEntry> {
  const result = await timedInvoke("sftp_stat", { sessionId, path });
  return parseInvokeResult(FileEntrySchema, result, "sftp_stat");
}

/**
 * Create remote directory
 */
export async function mkdir(sessionId: string, path: string): Promise<void> {
  await timedInvoke("sftp_mkdir", { sessionId, path });
}

/**
 * Rename/move file or directory
 */
export async function rename(sessionId: string, fromPath: string, toPath: string): Promise<void> {
  await timedInvoke("sftp_rename", { sessionId, fromPath, toPath });
}

/**
 * Delete file or directory
 */
export async function deleteItem(sessionId: string, path: string, isDir: boolean): Promise<void> {
  await timedInvoke("sftp_delete", { sessionId, path, isDir });
}

// ============================================================================
// File Preview
// ============================================================================

export const ReadPreviewResultSchema = z.object({
  contentType: z.string(),
  content: z.string().nullable(),
  size: z.number(),
  truncated: z.boolean(),
  mimeGuess: z.string().nullable(),
});

export type ReadPreviewResult = z.infer<typeof ReadPreviewResultSchema>;

/**
 * Read remote file preview (max 256KB)
 *
 * Rejects symlinks and directories. Returns text content or binary metadata.
 */
export async function readFile(
  sessionId: string,
  path: string,
  maxBytes?: number
): Promise<ReadPreviewResult> {
  const result = await timedInvoke("sftp_read_file", {
    input: { sessionId, path, maxBytes: maxBytes ?? null },
  });
  return parseInvokeResult(ReadPreviewResultSchema, result, "sftp_read_file");
}

/**
 * Change file/directory permissions
 */
export async function chmod(
  sessionId: string,
  paths: string[],
  mode: number
): Promise<ChmodResult> {
  const result = await timedInvoke("sftp_chmod", {
    input: { sessionId, paths, mode },
  });
  return parseInvokeResult(ChmodResultSchema, result, "sftp_chmod");
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
  const result = await timedInvoke("sftp_get_dir_stats", { sessionId, path });
  return parseInvokeResult(DirectoryStatsSchema, result, "sftp_get_dir_stats");
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
  const result = await timedInvoke(
    "sftp_delete_recursive",
    { input: { sessionId, path } },
    300_000
  );
  return parseInvokeResult(RecursiveDeleteResultSchema, result, "sftp_delete_recursive");
}

// ============================================================================
// Batch Delete
// ============================================================================

export const BatchDeleteResultSchema = z.object({
  deletedCount: z.number(),
  failures: z.array(DeleteFailureSchema),
});

export type BatchDeleteResult = z.infer<typeof BatchDeleteResultSchema>;

/**
 * Batch delete files and directories
 *
 * Server-side canonicalization: parent dirs skip children.
 * Directories use recursive delete.
 */
export async function batchDelete(
  sessionId: string,
  items: Array<{ path: string; isDir: boolean }>
): Promise<BatchDeleteResult> {
  const result = await timedInvoke("sftp_batch_delete", { input: { sessionId, items } }, 300_000);
  return parseInvokeResult(BatchDeleteResultSchema, result, "sftp_batch_delete");
}
