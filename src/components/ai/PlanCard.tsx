import { useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FilePenLine,
  RotateCw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PlanRuntimeState } from "@/stores/useAiSessionStore";
import { PlanDiffViewer } from "./PlanDiffViewer";
import { RollbackButton } from "./RollbackButton";

interface PlanCardProps {
  plan: PlanRuntimeState;
  busy?: boolean;
  onExecuteNext: (planId: string) => void | Promise<void>;
  onRevise: (planId: string, observation: string) => void | Promise<void>;
  onRollback: (planId: string, stepId: string) => void | Promise<void>;
}

function kindLabel(kind: string) {
  if (kind === "probe") return "Probe";
  if (kind === "write") return "Write";
  if (kind === "action") return "Action";
  return "Verify";
}

function kindIcon(kind: string) {
  if (kind === "probe") return Search;
  if (kind === "write") return FilePenLine;
  if (kind === "action") return RotateCw;
  return ShieldCheck;
}

function stepTone(kind: string, status: string) {
  if (status === "awaiting_confirm") {
    return "border-red-500/40 bg-red-500/10";
  }
  if (kind === "probe") return "border-emerald-500/30 bg-emerald-500/8";
  if (kind === "write") return "border-rose-500/30 bg-rose-500/8";
  if (kind === "action") return "border-amber-500/30 bg-amber-500/8";
  return "border-zinc-500/30 bg-zinc-500/8";
}

function statusLabel(status: string) {
  switch (status) {
    case "running":
      return "运行中";
    case "awaiting_confirm":
      return "等待确认";
    case "executing":
      return "执行中";
    case "verifying":
      return "校验中";
    case "done":
      return "已完成";
    case "failed":
      return "失败";
    case "rolled_back":
      return "已回滚";
    case "canceled":
      return "已取消";
    default:
      return "待执行";
  }
}

export function PlanCard({ plan, busy, onExecuteNext, onRevise, onRollback }: PlanCardProps) {
  const [observation, setObservation] = useState("");
  const canExecuteNext =
    !busy &&
    plan.plan.status !== "awaiting_confirm" &&
    plan.plan.status !== "done" &&
    plan.plan.status !== "failed" &&
    plan.plan.status !== "canceled";
  const canRevise =
    !busy &&
    plan.plan.status !== "done" &&
    plan.plan.status !== "canceled" &&
    plan.plan.steps.some((step) => step.status !== "done");

  return (
    <section
      className="border-border/60 bg-card flex flex-col gap-4 rounded-xl border p-4"
      data-slot="plan-card"
      data-plan-id={plan.planId}
      data-plan-status={plan.plan.status}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
            Plan
          </div>
          <div className="text-foreground text-sm font-medium">
            {plan.plan.summary || "AI execution plan"}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="border-border/70 text-muted-foreground rounded-full border px-2 py-1">
            {statusLabel(plan.plan.status)}
          </span>
          {canExecuteNext && (
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => void onExecuteNext(plan.planId)}
            >
              执行下一步
            </Button>
          )}
        </div>
      </header>

      {(plan.plan.assumptions.length > 0 || plan.plan.risks.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {plan.plan.assumptions.length > 0 && (
            <div className="border-border/60 bg-muted/20 rounded-lg border p-3">
              <div className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                Assumptions
              </div>
              <div className="text-foreground/80 space-y-1 text-xs">
                {plan.plan.assumptions.map((item, index) => (
                  <div key={`${item}-${index}`}>{item}</div>
                ))}
              </div>
            </div>
          )}
          {plan.plan.risks.length > 0 && (
            <div className="border-border/60 bg-muted/20 rounded-lg border p-3">
              <div className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                Risks
              </div>
              <div className="text-foreground/80 space-y-1 text-xs">
                {plan.plan.risks.map((item, index) => (
                  <div key={`${item}-${index}`}>{item}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border-border/60 bg-muted/20 rounded-lg border p-3">
        <div className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
          Revise
        </div>
        <div className="space-y-2">
          <Textarea
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
            placeholder="补充新的观察结果，修订未执行的后续步骤..."
            className="min-h-20 text-sm"
            disabled={!canRevise}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canRevise || observation.trim().length === 0}
              onClick={() => {
                const nextObservation = observation.trim();
                if (!nextObservation) return;
                void Promise.resolve(onRevise(plan.planId, nextObservation)).then(() => {
                  setObservation("");
                });
              }}
            >
              修订计划
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {plan.plan.steps.map((step, index) => {
          const Icon = kindIcon(step.kind);
          const runtime = plan.stepEvents[step.id];
          const isCollapsed =
            step.status === "done" &&
            plan.currentStepId !== step.id &&
            !runtime?.stdout &&
            !runtime?.stderr;
          return (
            <article
              key={step.id || `${step.kind}-${index}`}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                stepTone(step.kind, step.status),
                isCollapsed && "opacity-80"
              )}
              data-slot="plan-step"
              data-step-id={step.id}
              data-step-status={step.status}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="bg-background/80 mt-0.5 rounded-md p-1.5">
                    <Icon className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground text-xs font-medium">
                        {index + 1}. {kindLabel(step.kind)}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        {statusLabel(step.status)}
                      </span>
                    </div>
                    {step.intent && <div className="text-foreground/85 text-xs">{step.intent}</div>}
                    {step.expectedObservation && (
                      <div className="text-muted-foreground text-[11px]">
                        预期：{step.expectedObservation}
                      </div>
                    )}
                  </div>
                </div>

                {step.kind === "write" && step.status === "done" && (
                  <RollbackButton
                    onClick={() => onRollback(plan.planId, step.id)}
                    disabled={busy}
                  />
                )}
              </div>

              {!isCollapsed && runtime && (runtime.stdout || runtime.stderr || runtime.message) && (
                <div className="mt-3 space-y-2">
                  {runtime.message && (
                    <div className="border-border/60 bg-background/70 flex items-start gap-2 rounded-md border px-3 py-2 text-[11px]">
                      <Clock3 className="mt-0.5 size-3 shrink-0" aria-hidden />
                      <span>{runtime.message}</span>
                    </div>
                  )}
                  {runtime.stdout && (
                    <pre className="border-border/60 bg-background/70 rounded-md border p-3 text-[11px] whitespace-pre-wrap">
                      {runtime.stdout}
                    </pre>
                  )}
                  {runtime.stderr && (
                    <pre className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-[11px] whitespace-pre-wrap">
                      {runtime.stderr}
                    </pre>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {plan.rollbackProgress && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[11px]">
          <Clock3 className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>
            正在回滚 {plan.rollbackProgress.restoredFiles}/{plan.rollbackProgress.totalFiles}：
            {plan.rollbackProgress.currentPath}
          </span>
        </div>
      )}

      {plan.awaitingConfirm && (
        <div className="space-y-2">
          <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            {plan.awaitingConfirm.diff ? "Pending Diff" : "Pending Action"}
          </div>
          {plan.awaitingConfirm.diff ? (
            <PlanDiffViewer diff={plan.awaitingConfirm.diff} />
          ) : (
            <div className="border-border/60 bg-background/70 text-muted-foreground rounded-lg border px-3 py-2 text-[11px]">
              该步骤不会修改文件，等待确认执行。
            </div>
          )}
        </div>
      )}

      {plan.serviceWarnings.map((warning, index) => (
        <div
          key={`${warning.warning}-${index}`}
          className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px]"
        >
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>
            {warning.warning}
            {warning.snapshotPath ? `（snapshot: ${warning.snapshotPath}）` : ""}
          </span>
        </div>
      ))}

      {plan.lastDone && !plan.lastDone.canceled && plan.plan.status === "done" && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px]">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          <span>Plan 已完成</span>
        </div>
      )}
    </section>
  );
}
