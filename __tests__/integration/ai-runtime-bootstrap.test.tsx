import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

import { setupInvokeRouter } from "../helpers/invoke-router";
import { renderWithProviders } from "../helpers/test-wrapper";
import { DEFAULT_SETTINGS } from "@/types/settings";

describe("AI runtime bootstrap integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads runtime on app startup when AI is enabled and the model is already present", async () => {
    setupInvokeRouter({
      settings_get: () => ({ ...DEFAULT_SETTINGS, aiEnabled: true }),
      ai_health_check: () => ({
        runtimeReady: false,
        modelPresent: true,
        modelName: "gemma-4-E4B-it-Q4_K_M",
        acceleratorKind: "metal",
      }),
      ai_runtime_load: () => null,
      profile_list: () => [],
    });

    renderWithProviders(["/connections"]);

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("ai_runtime_load");
    });
  });
});
