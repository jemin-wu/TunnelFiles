/**
 * Settings IPC wrapper
 *
 * All settings-related Tauri IPC call wrappers with Zod validation
 */

import { z } from "zod";
import { parseInvokeResult, timedInvoke } from "./error";
import type { Settings, SettingsPatch } from "@/types/settings";

// ============================================================================
// Schemas
// ============================================================================

const LogLevelSchema = z.enum(["error", "warn", "info", "debug"]);

const SettingsSchema = z.object({
  defaultDownloadDir: z.string().optional(),
  maxConcurrentTransfers: z.number(),
  connectionTimeoutSecs: z.number(),
  transferRetryCount: z.number(),
  logLevel: LogLevelSchema,
  terminalFontSize: z.number(),
  terminalScrollbackLines: z.number(),
  terminalFollowDirectory: z.boolean(),
  aiEnabled: z.boolean(),
  aiModelName: z.string(),
  maxConcurrentAiProbes: z.number(),
  aiOutputTokenCap: z.number(),
  aiLicenseAcceptedAt: z.number().optional(),
});

// ============================================================================
// Settings Operations
// ============================================================================

/**
 * 获取当前设置
 */
export async function getSettings(): Promise<Settings> {
  const result = await timedInvoke("settings_get");
  return parseInvokeResult(SettingsSchema, result, "settings_get");
}

/**
 * 更新设置
 * 支持部分更新，只更新提供的字段
 */
export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const result = await timedInvoke("settings_set", { patch });
  return parseInvokeResult(SettingsSchema, result, "settings_set");
}

/**
 * 导出诊断包
 * 返回生成的 zip 文件路径
 */
export async function exportDiagnostics(): Promise<string> {
  const result = await timedInvoke("export_diagnostics");
  return parseInvokeResult(z.string(), result, "export_diagnostics");
}
