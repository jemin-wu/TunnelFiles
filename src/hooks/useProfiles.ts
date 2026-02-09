/**
 * Profile management hooks
 * Uses TanStack Query for cache management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { showSuccessToast, showErrorToast } from "@/lib/error";
import { listProfiles, upsertProfile, deleteProfile } from "@/lib/profile";

const PROFILES_QUERY_KEY = ["profiles"] as const;

/** Fetch all connection profiles */
export function useProfiles() {
  return useQuery({
    queryKey: PROFILES_QUERY_KEY,
    queryFn: listProfiles,
  });
}

/** Fetch a single connection profile */
export function useProfile(id: string | undefined) {
  const { data: profiles, ...rest } = useProfiles();
  const profile = id ? profiles?.find((p) => p.id === id) : undefined;
  return { data: profile, ...rest };
}

/** Create or update a connection profile */
export function useUpsertProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: upsertProfile,
    onSuccess: (_profileId, variables) => {
      queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
      showSuccessToast(variables.id ? "Connection updated" : "Connection added");
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
}

/** Delete a connection profile */
export function useDeleteProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
      showSuccessToast("Connection deleted");
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
}
