/**
 * Recent connections hook
 * Uses TanStack Query for cache management
 */

import { useQuery } from "@tanstack/react-query";
import { listRecentConnections } from "@/lib/profile";

export const RECENT_CONNECTIONS_QUERY_KEY = ["recentConnections"] as const;

/** Fetch recent connections */
export function useRecentConnections(limit?: number) {
  return useQuery({
    queryKey: [...RECENT_CONNECTIONS_QUERY_KEY, limit],
    queryFn: () => listRecentConnections(limit),
    staleTime: 30_000,
  });
}
