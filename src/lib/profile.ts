/**
 * Profile IPC wrapper
 *
 * All profile-related Tauri IPC call wrappers with Zod validation
 */

import { z } from "zod";
import { parseInvokeResult, timedInvoke } from "./error";
import type { Profile, ProfileInput, RecentConnection } from "@/types/profile";

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

const RecentConnectionSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  profileName: z.string(),
  host: z.string(),
  username: z.string(),
  connectedAt: z.number(),
});

// ============================================================================
// Profile Operations
// ============================================================================

/** List all connection profiles */
export async function listProfiles(): Promise<Profile[]> {
  const result = await timedInvoke("profile_list");
  return parseInvokeResult(z.array(ProfileSchema), result, "profile_list");
}

/** Get a single connection profile by ID */
export async function getProfile(profileId: string): Promise<Profile | null> {
  const result = await timedInvoke("profile_get", { profileId });
  return parseInvokeResult(ProfileSchema.nullable(), result, "profile_get");
}

/** Create or update a connection profile */
export async function upsertProfile(input: ProfileInput): Promise<string> {
  const result = await timedInvoke("profile_upsert", { input });
  return parseInvokeResult(z.string(), result, "profile_upsert");
}

/** Delete a connection profile */
export async function deleteProfile(profileId: string): Promise<void> {
  await timedInvoke("profile_delete", { profileId });
}

// ============================================================================
// Recent Connections
// ============================================================================

/** List recent connections (excludes orphaned records) */
export async function listRecentConnections(limit?: number): Promise<RecentConnection[]> {
  const result = await timedInvoke("profile_recent_connections", { limit: limit ?? null });
  return parseInvokeResult(z.array(RecentConnectionSchema), result, "profile_recent_connections");
}
