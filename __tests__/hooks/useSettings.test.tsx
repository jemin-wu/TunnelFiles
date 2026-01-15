import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/hooks/useSettings";
import { mockSettings } from "../mocks/tauri";
import { DEFAULT_SETTINGS } from "@/types/settings";

// Mock toast functions
vi.mock("@/lib/error", () => ({
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

import { showSuccessToast, showErrorToast } from "@/lib/error";

describe("useSettings", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  describe("initial load", () => {
    it("should return default settings while loading", () => {
      vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useSettings(), { wrapper });

      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
      expect(result.current.isLoading).toBe(true);
    });

    it("should load settings from backend", async () => {
      vi.mocked(invoke).mockResolvedValue(mockSettings);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.settings).toEqual(mockSettings);
      expect(invoke).toHaveBeenCalledWith("settings_get");
    });

    it("should return default settings on error", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Failed to load"));

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
      expect(result.current.error).toBeDefined();
    });
  });

  describe("updateSettings", () => {
    it("should update settings successfully", async () => {
      const updatedSettings = {
        ...mockSettings,
        maxConcurrentTransfers: 5,
      };
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockSettings)
        .mockResolvedValueOnce(updatedSettings);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateSettings({ maxConcurrentTransfers: 5 });
      });

      expect(invoke).toHaveBeenCalledWith("settings_set", {
        patch: { maxConcurrentTransfers: 5 },
      });
      expect(showSuccessToast).toHaveBeenCalledWith("设置已保存");

      await waitFor(() => {
        expect(result.current.settings.maxConcurrentTransfers).toBe(5);
      });
    });

    it("should show error toast on update failure", async () => {
      const error = new Error("Update failed");
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockSettings)
        .mockRejectedValueOnce(error);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.updateSettings({ maxConcurrentTransfers: 5 });
        } catch {
          // Expected to throw
        }
      });

      expect(showErrorToast).toHaveBeenCalledWith(error);
    });

    it("should set isUpdating during mutation", async () => {
      let resolveUpdate: (value: unknown) => void;
      const updatePromise = new Promise((resolve) => {
        resolveUpdate = resolve;
      });

      vi.mocked(invoke)
        .mockResolvedValueOnce(mockSettings)
        .mockImplementationOnce(() => updatePromise);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let updatePromiseResult: Promise<void>;
      act(() => {
        updatePromiseResult = result.current.updateSettings({
          maxConcurrentTransfers: 5,
        });
      });

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(true);
      });

      await act(async () => {
        resolveUpdate!({ ...mockSettings, maxConcurrentTransfers: 5 });
        await updatePromiseResult;
      });

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false);
      });
    });

    it("should update cache after successful mutation", async () => {
      const updatedSettings = {
        ...mockSettings,
        logLevel: "debug" as const,
      };
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockSettings)
        .mockResolvedValueOnce(updatedSettings);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.settings).toEqual(mockSettings);
      });

      await act(async () => {
        await result.current.updateSettings({ logLevel: "debug" });
      });

      await waitFor(() => {
        expect(result.current.settings.logLevel).toBe("debug");
      });
    });
  });

  describe("refetch", () => {
    it("should refetch settings", async () => {
      const newSettings = {
        ...mockSettings,
        connectionTimeoutSecs: 60,
      };
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockSettings)
        .mockResolvedValueOnce(newSettings);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.settings).toEqual(mockSettings);
      });

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.settings.connectionTimeoutSecs).toBe(60);
      });
    });
  });

  describe("partial updates", () => {
    it("should support updating single field", async () => {
      const updatedSettings = {
        ...mockSettings,
        defaultDownloadDir: "/new/path",
      };
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockSettings)
        .mockResolvedValueOnce(updatedSettings);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateSettings({
          defaultDownloadDir: "/new/path",
        });
      });

      expect(invoke).toHaveBeenCalledWith("settings_set", {
        patch: { defaultDownloadDir: "/new/path" },
      });
    });

    it("should support updating multiple fields", async () => {
      const updatedSettings = {
        ...mockSettings,
        maxConcurrentTransfers: 6,
        transferRetryCount: 5,
      };
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockSettings)
        .mockResolvedValueOnce(updatedSettings);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateSettings({
          maxConcurrentTransfers: 6,
          transferRetryCount: 5,
        });
      });

      expect(invoke).toHaveBeenCalledWith("settings_set", {
        patch: { maxConcurrentTransfers: 6, transferRetryCount: 5 },
      });

      await waitFor(() => {
        expect(result.current.settings.maxConcurrentTransfers).toBe(6);
        expect(result.current.settings.transferRetryCount).toBe(5);
      });
    });
  });
});
