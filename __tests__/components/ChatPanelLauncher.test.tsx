import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChatPanelLauncher } from "@/components/ai/ChatPanelLauncher";
import { useAiSessionStore } from "@/stores/useAiSessionStore";
import { mockSettings } from "../mocks/tauri";

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  useAiSessionStore.setState({ sessions: new Map() });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

function withAiEnabled(enabled: boolean) {
  vi.mocked(invoke).mockImplementation(async (cmd) => {
    if (cmd === "settings_get") {
      return { ...mockSettings, aiEnabled: enabled };
    }
    if (cmd === "ai_chat_send") {
      return { messageId: "stub" };
    }
    return null;
  });
}

async function renderLauncher(enabled: boolean) {
  withAiEnabled(enabled);
  const view = render(<ChatPanelLauncher sessionId="tab-1" />, { wrapper });
  // settings 异步加载完才会切换可见性
  await screen.findByText(/.*/, {}, { timeout: 0 }).catch(() => {});
  return view;
}

describe("ChatPanelLauncher", () => {
  it("renders nothing when AI is disabled", async () => {
    const { container } = await renderLauncher(false);
    // 等 useSettings 加载完后再断言；初始 isLoading 时 settings 为 DEFAULT (aiEnabled=false)
    // 任何渲染窗口内都应不出现 trigger
    expect(container.querySelector("[data-slot='chat-launcher-trigger']")).toBeNull();
  });

  it("renders trigger button when AI is enabled", async () => {
    await renderLauncher(true);
    const trigger = await screen.findByLabelText("Open AI chat");
    expect(trigger).toBeInTheDocument();
  });

  it("clicking trigger opens the sheet with ChatPanel", async () => {
    const user = userEvent.setup();
    await renderLauncher(true);
    const trigger = await screen.findByLabelText("Open AI chat");
    await user.click(trigger);
    // ChatPanel data attr appears in DOM
    const panel = await screen.findByText(/Ask the local assistant/i);
    expect(panel).toBeInTheDocument();
  });

  it("Cmd/Ctrl+Shift+A toggles the sheet open", async () => {
    const user = userEvent.setup();
    await renderLauncher(true);
    await screen.findByLabelText("Open AI chat");
    // jsdom default platform is non-mac → use Ctrl
    await user.keyboard("{Control>}{Shift>}A{/Shift}{/Control}");
    expect(await screen.findByText(/Ask the local assistant/i)).toBeInTheDocument();
  });

  it("Cmd/Ctrl+Shift+A toggles closed when already open", async () => {
    const user = userEvent.setup();
    await renderLauncher(true);
    const trigger = await screen.findByLabelText("Open AI chat");
    await user.click(trigger);
    expect(await screen.findByText(/Ask the local assistant/i)).toBeInTheDocument();

    // Toggle off
    await user.keyboard("{Control>}{Shift>}A{/Shift}{/Control}");
    // Sheet 关闭后 ChatPanel 内部内容应被卸载（Radix Portal 拆 DOM）
    // 给 animation 一点点时间
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Ask the local assistant/i)).not.toBeInTheDocument();
  });

  it("does not subscribe to keyboard shortcut when AI is disabled", async () => {
    const user = userEvent.setup();
    await renderLauncher(false);
    await user.keyboard("{Control>}{Shift>}A{/Shift}{/Control}");
    // 应该不出现 ChatPanel
    expect(screen.queryByText(/Ask the local assistant/i)).not.toBeInTheDocument();
  });
});
