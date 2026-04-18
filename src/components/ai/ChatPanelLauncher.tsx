import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSettings } from "@/hooks/useSettings";
import { isMac, formatShortcut } from "@/lib/platform";
import { ChatPanel } from "./ChatPanel";

interface ChatPanelLauncherProps {
  /** Per-tab session id；ChatPanel 用它隔离对话历史。 */
  sessionId: string;
}

const SHORTCUT = "Mod+Shift+A";

/**
 * AI Chat 启动器：toolbar 触发按钮 + Sheet 浮层 + Cmd/Ctrl+Shift+A 快捷键。
 *
 * 渲染条件：`settings.aiEnabled === true`。关闭 AI 后整个组件返回 null —
 * 不挂 Sheet、不订阅快捷键、不创建 chat hook（per SPEC §7 Always: AI 默认
 * 关闭，关闭即彻底休眠）。
 */
export function ChatPanelLauncher({ sessionId }: ChatPanelLauncherProps) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!settings.aiEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      // Mac 用 Cmd（metaKey），其他平台用 Ctrl（ctrlKey）
      const modKey = isMac() ? e.metaKey : e.ctrlKey;
      if (!modKey || !e.shiftKey) return;
      if (e.key !== "A" && e.key !== "a") return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.aiEnabled, toggle]);

  if (!settings.aiEnabled) return null;

  const shortcutLabel = formatShortcut(SHORTCUT);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open AI chat"
            data-slot="chat-launcher-trigger"
            className="h-7 w-7"
            onClick={toggle}
          >
            <Sparkles className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          AI Chat ({shortcutLabel})
        </TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full max-w-md p-0 sm:max-w-md">
          <SheetHeader className="border-border border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="text-primary size-3.5" />
              AI Chat
            </SheetTitle>
            <SheetDescription className="sr-only">
              Local-only AI assistant scoped to this terminal session.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <ChatPanel sessionId={sessionId} className="h-full" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
