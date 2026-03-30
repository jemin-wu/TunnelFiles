/**
 * Profile IPC wrapper
 *
 * All profile-related Tauri IPC call wrappers with Zod validation
 */

import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { parseInvokeResult } from "./error";
import type { Profile, ProfileInput } from "@/types/profile";

// ============================================================================
// Schemas
// ============================================================================

const AuthTypeSchema = z.enum(["password", "key"]);

const ProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  username: z.string(),
  authType: AuthTypeSchema,
  passwordRef: z.string().optional(),
  privateKeyPath: z.string().optional(),
  passphraseRef: z.string().optional(),
  initialPath: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// ============================================================================
// Profile Operations
// ============================================================================

/** List all connection profiles */
export async function listProfiles(): Promise<Profile[]> {
  const result = await invoke("profile_list");
  return parseInvokeResult(z.array(ProfileSchema), result, "profile_list");
}

/** Get a single connection profile by ID */
export async function getProfile(profileId: string): Promise<Profile | null> {
  const result = await invoke("profile_get", { profileId });
  return parseInvokeResult(ProfileSchema.nullable(), result, "profile_get");
}

/** Create or update a connection profile */
export async function upsertProfile(input: ProfileInput): Promise<string> {
  const result = await invoke("profile_upsert", { input });
  return parseInvokeResult(z.string(), result, "profile_upsert");
}

/** Delete a connection profile */
export async function deleteProfile(profileId: string): Promise<void> {
  await invoke("profile_delete", { profileId });
}
