/**
 * Settings 相关 API 函数
 */

import { invoke } from "@tauri-apps/api/core";
import type { Settings, SettingsPatch } from "@/types/settings";

/**
 * 获取当前设置
 */
export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("settings_get");
}

/**
 * 更新设置
 * 支持部分更新，只更新提供的字段
 */
export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  return invoke<Settings>("settings_set", { patch });
}

/**
 * 导出诊断包
 * 返回生成的 zip 文件路径
 */
export async function exportDiagnostics(): Promise<string> {
  return invoke<string>("export_diagnostics");
}
