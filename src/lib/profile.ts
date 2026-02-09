/** Profile API functions */

import { invoke } from "@tauri-apps/api/core";
import type { Profile, ProfileInput } from "@/types/profile";

/** List all connection profiles */
export async function listProfiles(): Promise<Profile[]> {
  return invoke<Profile[]>("profile_list");
}

/** Create or update a connection profile */
export async function upsertProfile(input: ProfileInput): Promise<string> {
  return invoke<string>("profile_upsert", { input });
}

/** Delete a connection profile */
export async function deleteProfile(profileId: string): Promise<void> {
  return invoke("profile_delete", { profileId });
}

/** Test connection */
export async function testConnection(profileId: string): Promise<void> {
  return invoke("profile_test", { profileId });
}
