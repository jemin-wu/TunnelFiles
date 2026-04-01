/**
 * Transfer IPC wrapper
 *
 * All transfer-related Tauri IPC call wrappers with Zod validation
 */

import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { parseInvokeResult } from "./error";
import type { TransferTask, TransferHistoryEntry } from "@/types/transfer";

// ============================================================================
// Schemas
// ============================================================================

const TransferDirectionSchema = z.enum(["upload", "download"]);

const TransferStatusSchema = z.enum(["waiting", "running", "success", "failed", "canceled"]);

const TransferTaskSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  direction: TransferDirectionSchema,
  localPath: z.string(),
  remotePath: z.string(),
  fileName: z.string(),
  status: TransferStatusSchema,
  transferred: z.number(),
  total: z.number().optional(),
  speed: z.number().optional(),
  percent: z.number().optional(),
  errorMessage: z.string().optional(),
  errorCode: z.string().optional(),
  retryable: z.boolean().optional(),
  createdAt: z.number(),
  completedAt: z.number().optional(),
});

// ============================================================================
// Transfer Operations
// ============================================================================

/**
 * 上传文件
 */
export async function uploadFile(
  sessionId: string,
  localPath: string,
  remoteDir: string
): Promise<string> {
  const result = await invoke("transfer_upload", { sessionId, localPath, remoteDir });
  return parseInvokeResult(z.string(), result, "transfer_upload");
}

/**
 * 下载文件
 */
export async function downloadFile(
  sessionId: string,
  remotePath: string,
  localDir: string
): Promise<string> {
  const result = await invoke("transfer_download", { sessionId, remotePath, localDir });
  return parseInvokeResult(z.string(), result, "transfer_download");
}

/**
 * 上传目录（递归）
 */
export async function uploadDirectory(
  sessionId: string,
  localPath: string,
  remoteDir: string
): Promise<string[]> {
  const result = await invoke("transfer_upload_dir", { sessionId, localPath, remoteDir });
  return parseInvokeResult(z.array(z.string()), result, "transfer_upload_dir");
}

/**
 * 下载目录（递归）
 */
export async function downloadDirectory(
  sessionId: string,
  remotePath: string,
  localDir: string
): Promise<string[]> {
  const result = await invoke("transfer_download_dir", { sessionId, remotePath, localDir });
  return parseInvokeResult(z.array(z.string()), result, "transfer_download_dir");
}

/**
 * 取消传输
 */
export async function cancelTransfer(taskId: string): Promise<void> {
  await invoke("transfer_cancel", { taskId });
}

/**
 * 重试传输
 */
export async function retryTransfer(taskId: string): Promise<string> {
  const result = await invoke("transfer_retry", { taskId });
  return parseInvokeResult(z.string(), result, "transfer_retry");
}

/**
 * 获取任务列表
 */
export async function listTransfers(): Promise<TransferTask[]> {
  const result = await invoke("transfer_list");
  return parseInvokeResult(z.array(TransferTaskSchema), result, "transfer_list");
}

/**
 * 获取单个任务
 */
export async function getTransfer(taskId: string): Promise<TransferTask | null> {
  const result = await invoke("transfer_get", { taskId });
  return parseInvokeResult(TransferTaskSchema.nullable(), result, "transfer_get");
}

/**
 * 清理已完成的任务
 */
export async function cleanupTransfers(): Promise<void> {
  await invoke("transfer_cleanup");
}

// ============================================================================
// Transfer History
// ============================================================================

const TransferHistoryEntrySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  direction: z.enum(["upload", "download"]),
  localPath: z.string(),
  remotePath: z.string(),
  fileSize: z.number(),
  status: z.enum(["running", "success", "failed", "canceled"]),
  errorMessage: z.string().nullable(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
});

/**
 * 获取传输历史
 */
export async function listTransferHistory(limit?: number): Promise<TransferHistoryEntry[]> {
  const result = await invoke("transfer_history_list", { limit: limit ?? null });
  return parseInvokeResult(z.array(TransferHistoryEntrySchema), result, "transfer_history_list");
}

/**
 * 清空传输历史
 */
export async function clearTransferHistory(): Promise<void> {
  await invoke("transfer_history_clear");
}
