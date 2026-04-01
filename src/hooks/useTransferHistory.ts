/**
 * Transfer History hook
 * Uses TanStack Query for caching and mutations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listTransferHistory, clearTransferHistory } from "@/lib/transfer";
import { showErrorToast, showSuccessToast } from "@/lib/error";

const TRANSFER_HISTORY_QUERY_KEY = ["transferHistory"] as const;

export function useTransferHistory(limit?: number) {
  return useQuery({
    queryKey: [...TRANSFER_HISTORY_QUERY_KEY, limit],
    queryFn: () => listTransferHistory(limit),
    staleTime: 5 * 60 * 1000,
  });
}

export function useClearTransferHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearTransferHistory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSFER_HISTORY_QUERY_KEY });
      showSuccessToast("Transfer history cleared");
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
}

export { TRANSFER_HISTORY_QUERY_KEY };
