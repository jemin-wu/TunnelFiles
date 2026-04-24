import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";

import { ChatContainerContent, ChatContainerRoot } from "@/components/prompt-kit/chat-container";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAiChat } from "@/hooks/useAiChat";
import { useAiPlan } from "@/hooks/useAiPlan";
import { useAiSessionStore } from "@/stores/useAiSessionStore";
import { encodeTerminalData, getTerminalBySession, writeTerminalInput } from "@/lib/terminal";
import { ChatInput } from "./ChatInput";
import { ConfirmWriteDialog } from "./ConfirmWriteDialog";
import { MessageList } from "./MessageList";
import { PlanCard } from "./PlanCard";

interface ChatPanelProps {
  /** Tab / terminal session id —— per-tab 隔离的对话归属。 */
  sessionId: string;
  /**
   * 显式覆盖发送 handler。**默认走 `useAiChat`** —— 接 `ai_chat_send` IPC
   * 并订阅 `ai:token` / `ai:done` / `ai:error` 事件更新 store。
   *
   * 显式传入用于：
   * - 测试桩（fake handler）
   * - storybook 预览（auto-complete echo 模式）
   *
   * 注意：传 `onSend` 时**不会**自动订阅事件 —— 调用方需自己驱动 store 收尾。
   */
  onSend?: (sessionId: string, text: string) => Promise<void>;
  /**
   * 覆盖代码块"插入终端"行为。**默认**通过 `getTerminalBySession` 找到当前
   * tab 关联的 terminalId，再 `writeTerminalInput` 不带换行写入。
   */
  onInsertCommand?: (command: string) => void | Promise<void>;
  className?: string;
}

/**
 * 聊天面板组合体。
 *
 * 职责切割：
 * - **MessageList**：纯渲染消息历史（prompt-kit Message + Markdown）
 * - **ChatInput**：prompt-kit PromptInput 输入 + 提交事件
 * - **ChatPanel** (本文件)：粘合 store 状态 + handleSubmit 流水线 +
 *   滚动容器 ChatContainerRoot（use-stick-to-bottom 接管自动贴底 / 手动上滑暂停）
 */
export function ChatPanel({ sessionId, onSend, onInsertCommand, className }: ChatPanelProps) {
  // selector 订阅单条 session，避免其他 tab 改动触发本组件 rerender
  const session = useAiSessionStore((s) => s.sessions.get(sessionId));
  const appendUserMessage = useAiSessionStore((s) => s.appendUserMessage);
  const beginThinking = useAiSessionStore((s) => s.beginThinking);
  const failStream = useAiSessionStore((s) => s.failStream);
  const [mode, setMode] = useState<"chat" | "plan">("chat");
  const [planBusy, setPlanBusy] = useState(false);

  // 默认订阅 IPC 事件 + 提供 send 回调；外部 onSend 覆盖时仅作为发送入口，
  // listener 仍然订阅（事件契约固定，外部 handler 改不了响应通路）。
  const { send: defaultSend, cancel } = useAiChat(sessionId);
  const { plans, createPlan, executeNext, confirmWrite, revisePlan, cancelPlan, rollbackStep } =
    useAiPlan(sessionId);

  const messages = session?.messages ?? [];
  const streamState = session?.streamState ?? "idle";
  const isStreaming = streamState === "thinking" || streamState === "streaming";
  const isError = streamState === "error";
  const pendingAssistantId = session?.pendingAssistantId ?? null;
  const probeQueuePosition = session?.probeQueuePosition ?? null;
  const activeAwaitConfirm = useMemo(
    () => [...plans].reverse().find((item) => item.awaitingConfirm)?.awaitingConfirm ?? null,
    [plans]
  );

  const handleStop = useCallback(() => {
    if (!pendingAssistantId) return;
    void cancel(pendingAssistantId);
  }, [cancel, pendingAssistantId]);

  /**
   * 默认插入流程：sessionId → 当前 terminalId → base64 → 写入 PTY，**不带换行**。
   * 终端可能未打开（用户在 Files tab 时）—— 此时静默忽略；UI 不抛错。
   */
  const defaultInsertCommand = useCallback(
    async (command: string) => {
      const terminalId = await getTerminalBySession(sessionId);
      if (!terminalId) return;
      await writeTerminalInput({
        terminalId,
        data: encodeTerminalData(command),
      });
    },
    [sessionId]
  );

  const insertCommand = onInsertCommand ?? defaultInsertCommand;

  const runPlanAction = useCallback(async (action: () => Promise<void>) => {
    setPlanBusy(true);
    try {
      await action();
    } finally {
      setPlanBusy(false);
    }
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      appendUserMessage(sessionId, text);
      try {
        if (mode === "plan" && !onSend) {
          await runPlanAction(async () => {
            const created = await createPlan(text);
            await executeNext(created.planId);
          });
        } else {
          beginThinking(sessionId);
        }
        if (mode !== "plan") {
          if (onSend) {
            await onSend(sessionId, text);
          } else {
            await defaultSend(text);
          }
          // 流式收尾由 ai:done 事件驱动（useAiChat 内部）；外部 onSend 也
          // 应通过同样的事件流推动 store。这里不在 try 块内 complete。
        } else if (onSend) {
          await onSend(sessionId, text);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failStream(sessionId, msg);
      }
    },
    [
      sessionId,
      mode,
      onSend,
      createPlan,
      executeNext,
      defaultSend,
      appendUserMessage,
      beginThinking,
      failStream,
      runPlanAction,
    ]
  );

  return (
    <div
      className={cn("flex h-full flex-col", className)}
      data-slot="chat-panel"
      data-session-id={sessionId}
      data-stream-state={streamState}
    >
      <ChatContainerRoot className="relative min-h-0 flex-1">
        <ChatContainerContent className="px-4 py-3">
          <div className="flex flex-col gap-4">
            {(messages.length > 0 || plans.length === 0) && (
              <MessageList
                messages={messages}
                isStreaming={isStreaming}
                onInsertCommand={insertCommand}
              />
            )}
            {plans.map((plan) => (
              <PlanCard
                key={plan.planId}
                plan={plan}
                busy={planBusy}
                onExecuteNext={(planId) => runPlanAction(() => executeNext(planId).then(() => {}))}
                onRevise={(planId, observation) =>
                  runPlanAction(() => revisePlan(planId, observation).then(() => {}))
                }
                onRollback={(planId, stepId) =>
                  runPlanAction(() => rollbackStep(planId, stepId).then(() => {}))
                }
              />
            ))}
          </div>
        </ChatContainerContent>
        <div className="pointer-events-none absolute right-3 bottom-3 z-10">
          <div className="pointer-events-auto">
            <ScrollButton size="icon" className="size-8" />
          </div>
        </div>
      </ChatContainerRoot>

      {probeQueuePosition !== null && (
        <div
          className="border-border/50 bg-muted text-muted-foreground flex items-center gap-2 border-t px-4 py-2 text-xs"
          role="status"
          data-slot="chat-probe-queue"
        >
          <Clock className="size-3.5 shrink-0" aria-hidden />
          <span>AI 队列中（第 {probeQueuePosition} 位）</span>
        </div>
      )}

      {isError && (
        <div
          className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 border-t px-4 py-2 text-xs"
          role="alert"
          data-slot="chat-error"
        >
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate" title={session?.error ?? undefined}>
            {session?.error ?? "Unknown error"}
          </span>
        </div>
      )}

      <div className="border-border/50 bg-background border-t px-4 py-3">
        {!onSend && (
          <div className="mb-2 flex items-center justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant={mode === "chat" ? "default" : "outline"}
              className="h-7 px-3 text-[11px]"
              onClick={() => setMode("chat")}
            >
              Chat
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "plan" ? "default" : "outline"}
              className="h-7 px-3 text-[11px]"
              onClick={() => setMode("plan")}
            >
              Plan
            </Button>
          </div>
        )}
        <ChatInput
          onSubmit={handleSubmit}
          disabled={isStreaming || planBusy}
          onStop={pendingAssistantId ? handleStop : undefined}
          placeholder={
            mode === "plan"
              ? "Describe the change you want the local assistant to execute..."
              : isStreaming
                ? "Waiting for response..."
                : "Ask the local assistant..."
          }
        />
      </div>

      <ConfirmWriteDialog
        payload={activeAwaitConfirm}
        pending={planBusy}
        onConfirm={(planId) => runPlanAction(() => confirmWrite(planId).then(() => {}))}
        onCancel={(planId) => runPlanAction(() => cancelPlan(planId).then(() => {}))}
      />
    </div>
  );
}
