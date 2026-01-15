/**
 * Profile 相关 API 函数
 */

import { invoke } from "@tauri-apps/api/core";
import type { Profile, ProfileInput } from "@/types/profile";

/**
 * 获取所有连接配置
 */
export async function listProfiles(): Promise<Profile[]> {
  return invoke<Profile[]>("profile_list");
}

/**
 * 创建或更新连接配置
 */
export async function upsertProfile(input: ProfileInput): Promise<string> {
  return invoke<string>("profile_upsert", { input });
}

/**
 * 删除连接配置
 */
export async function deleteProfile(profileId: string): Promise<void> {
  return invoke("profile_delete", { profileId });
}

/**
 * 测试连接
 */
export async function testConnection(profileId: string): Promise<void> {
  return invoke("profile_test", { profileId });
}

/**
 * 获取最近连接记录
 */
export async function listRecentConnections(limit: number = 10): Promise<Profile[]> {
  // 获取所有 profiles 并按 updatedAt 降序排列
  const profiles = await listProfiles();
  return profiles.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}
