import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";

import { renderWithProviders } from "../helpers/test-wrapper";
import { mockSettings } from "../mocks/tauri";
import type { SettingsPatch } from "@/types/settings";

// 静音 toast — 不是这个测试关心的副作用
vi.mock("@/lib/error", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/error")>();
  return {
    ...actual,
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
  };
});

describe("SettingsPage — AI tab (T1.1 AI-off plumbing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "settings_get") return mockSettings;
      if (cmd === "settings_set") return mockSettings;
      return undefined;
    });
  });

  it("renders AI section with off-by-default controls", async () => {
    renderWithProviders(["/settings"]);

    // AI 导航项（Radix/shadcn Button role=button）
    const user = userEvent.setup();
    const aiNav = await screen.findByRole("button", { name: /ai/i });
    await user.click(aiNav);

    // Section heading
    expect(
      await screen.findByRole("heading", { name: /ai.*(shell copilot|assistant|助手|copilot)/i })
    ).toBeInTheDocument();

    // Enable checkbox — SPEC §11 default false
    const enableCheckbox = screen.getByRole("checkbox", { name: /enable|启用/i });
    expect(enableCheckbox).not.toBeChecked();

    // Model name input — defaults to gemma-4-E4B-it-Q4_K_M
    const modelInput = screen.getByRole("textbox", { name: /model|模型/i });
    expect(modelInput).toHaveValue("gemma-4-E4B-it-Q4_K_M");

    // Output token cap shown as readonly copy
    expect(screen.getByText(/4096/)).toBeInTheDocument();
  });

  it("submits aiEnabled patch when toggling the checkbox and saving", async () => {
    renderWithProviders(["/settings"]);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /ai/i }));

    const enableCheckbox = await screen.findByRole("checkbox", { name: /enable|启用/i });
    await user.click(enableCheckbox);

    const saveButton = screen.getByRole("button", { name: /save|保存/i });
    await user.click(saveButton);

    await waitFor(() => {
      const call = vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "settings_set");
      expect(call).toBeDefined();
      const args = call![1] as { patch: SettingsPatch };
      expect(args.patch.aiEnabled).toBe(true);
    });
  });
});
