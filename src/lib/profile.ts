/** Profile API functions */

import { invoke } from "@tauri-apps/api/core";
import type { Profile, ProfileInput } from "@/types/profile";

/** List all connection profiles */
export async function listProfiles(): Promise<Profile[]> {
  return invoke<Profile[]>("profile_list");
}

/** Get a single connection profile by ID */
export async function getProfile(profileId: string): Promise<Profile | null> {
  return invoke<Profile | null>("profile_get", { profileId });
}

/** Create or update a connection profile */
export async function upsertProfile(input: ProfileInput): Promise<string> {
  return invoke<string>("profile_upsert", { input });
}

/** Delete a connection profile */
export async function deleteProfile(profileId: string): Promise<void> {
  return invoke("profile_delete", { profileId });
}
