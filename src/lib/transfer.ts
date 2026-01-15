/**
 * 传输相关 API 函数
 */

import { invoke } from "@tauri-apps/api/core";
import type { TransferTask } from "@/types/transfer";

/**
 * 上传文件
 */
export async function uploadFile(
  sessionId: string,
  localPath: string,
  remoteDir: string
): Promise<string> {
  return invoke<string>("transfer_upload", { sessionId, localPath, remoteDir });
}

/**
 * 下载文件
 */
export async function downloadFile(
  sessionId: string,
  remotePath: string,
  localDir: string
): Promise<string> {
  return invoke<string>("transfer_download", { sessionId, remotePath, localDir });
}

/**
 * 上传目录（递归）
 */
export async function uploadDirectory(
  sessionId: string,
  localPath: string,
  remoteDir: string
): Promise<string[]> {
  return invoke<string[]>("transfer_upload_dir", { sessionId, localPath, remoteDir });
}

/**
 * 下载目录（递归）
 */
export async function downloadDirectory(
  sessionId: string,
  remotePath: string,
  localDir: string
): Promise<string[]> {
  return invoke<string[]>("transfer_download_dir", { sessionId, remotePath, localDir });
}

/**
 * 取消传输
 */
export async function cancelTransfer(taskId: string): Promise<void> {
  return invoke("transfer_cancel", { taskId });
}

/**
 * 重试传输
 */
export async function retryTransfer(taskId: string): Promise<string> {
  return invoke<string>("transfer_retry", { taskId });
}

/**
 * 获取任务列表
 */
export async function listTransfers(): Promise<TransferTask[]> {
  return invoke<TransferTask[]>("transfer_list");
}

/**
 * 获取单个任务
 */
export async function getTransfer(taskId: string): Promise<TransferTask | null> {
  return invoke<TransferTask | null>("transfer_get", { taskId });
}

/**
 * 清理已完成的任务
 */
export async function cleanupTransfers(): Promise<void> {
  return invoke("transfer_cleanup");
}
