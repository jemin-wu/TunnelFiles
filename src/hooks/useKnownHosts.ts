/**
 * Known Hosts management hook
 * Uses TanStack Query for caching and mutations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listKnownHosts, removeHostKey } from "@/lib/session";
import { showErrorToast, showSuccessToast } from "@/lib/error";

const KNOWN_HOSTS_QUERY_KEY = ["knownHosts"] as const;

export function useKnownHosts() {
  return useQuery({
    queryKey: KNOWN_HOSTS_QUERY_KEY,
    queryFn: listKnownHosts,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRemoveKnownHost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ host, port }: { host: string; port: number }) => removeHostKey(host, port),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KNOWN_HOSTS_QUERY_KEY });
      showSuccessToast("Host key removed");
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
}
