/**
 * SFTP IPC 封装层
 *
 * 所有 SFTP 相关的 Tauri IPC 调用封装，包含 Zod 验证
 */

import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import { ChmodResultSchema } from "./file";
import type { FileEntry, SortSpec } from "@/types";
import type { ChmodResult, DirectoryStats, RecursiveDeleteResult } from "@/types/file";

// ============================================================================
// Schemas
// ============================================================================

/** 文件条目 Schema */
const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDir: z.boolean(),
  size: z.number().optional(),
  mtime: z.number().optional(),
  mode: z.number().optional(),
});

/** 文件列表响应 Schema */
const FileListSchema = z.array(FileEntrySchema);

// ============================================================================
// SFTP Operations
// ============================================================================

/**
 * 列出远程目录内容
 *
 * @param sessionId - 会话 ID
 * @param path - 远程路径
 * @param sort - 排序选项
 * @returns 文件列表
 */
export async function listDir(
  sessionId: string,
  path: string,
  sort?: SortSpec
): Promise<FileEntry[]> {
  const result = await invoke("sftp_list_dir", {
    sessionId,
    path,
    sort,
  });
  return FileListSchema.parse(result);
}

/**
 * 获取文件/目录信息
 *
 * @param sessionId - 会话 ID
 * @param path - 远程路径
 * @returns 文件信息
 */
export async function stat(sessionId: string, path: string): Promise<FileEntry> {
  const result = await invoke("sftp_stat", {
    sessionId,
    path,
  });
  return FileEntrySchema.parse(result);
}

/**
 * 创建远程目录
 *
 * @param sessionId - 会话 ID
 * @param path - 目录路径
 */
export async function mkdir(sessionId: string, path: string): Promise<void> {
  await invoke("sftp_mkdir", {
    sessionId,
    path,
  });
}

/**
 * 重命名/移动文件或目录
 *
 * @param sessionId - 会话 ID
 * @param fromPath - 源路径
 * @param toPath - 目标路径
 */
export async function rename(
  sessionId: string,
  fromPath: string,
  toPath: string
): Promise<void> {
  await invoke("sftp_rename", {
    sessionId,
    fromPath,
    toPath,
  });
}

/**
 * 删除文件或目录
 *
 * @param sessionId - 会话 ID
 * @param path - 路径
 * @param isDir - 是否为目录
 */
export async function deleteItem(
  sessionId: string,
  path: string,
  isDir: boolean
): Promise<void> {
  await invoke("sftp_delete", {
    sessionId,
    path,
    isDir,
  });
}

/**
 * 修改文件/目录权限
 *
 * @param sessionId - 会话 ID
 * @param paths - 路径列表
 * @param mode - Unix 权限值 (e.g., 0o755)
 * @returns 操作结果
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

/** 目录统计信息 Schema */
export const DirectoryStatsSchema = z.object({
  fileCount: z.number(),
  dirCount: z.number(),
  totalSize: z.number(),
});

/** 删除失败项 Schema */
export const DeleteFailureSchema = z.object({
  path: z.string(),
  error: z.string(),
});

/** 递归删除结果 Schema */
export const RecursiveDeleteResultSchema = z.object({
  deletedFiles: z.number(),
  deletedDirs: z.number(),
  failures: z.array(DeleteFailureSchema),
});

/** 删除进度 Schema */
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
 * 获取目录统计信息
 *
 * 用于删除确认对话框显示文件数量和总大小
 *
 * @param sessionId - 会话 ID
 * @param path - 目录路径
 * @returns 目录统计信息
 */
export async function getDirStats(
  sessionId: string,
  path: string
): Promise<DirectoryStats> {
  const result = await invoke("sftp_get_dir_stats", {
    sessionId,
    path,
  });
  return DirectoryStatsSchema.parse(result);
}

/**
 * 递归删除目录
 *
 * 删除目录及其所有内容，通过 delete:progress 事件发送进度
 *
 * @param sessionId - 会话 ID
 * @param path - 要删除的路径
 * @returns 删除结果
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
