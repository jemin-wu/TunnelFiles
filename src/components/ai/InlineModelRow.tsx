/**
 * Inline model management row (SPEC §5 T1.5 redesign, 2026-04-18).
 *
 * Lives in Settings → AI tab; renders the pinned Gemma 4 E4B Q4_K_M model's
 * state as an inventory-card-style row with a single action button that
 * flips between Download / Cancel / Delete / Retry / Resume based on the
 * combined (aiHealthStatus, onboarding.state) tuple.
 *
 * Replaces the full-screen modal download progress dialog — the license
 * prompt is the only thing that still blocks the user (see ModelOnboardingDialog).
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Trash2, XCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { aiModelDelete } from "@/lib/ai";
import { showErrorToast, showSuccessToast } from "@/lib/error";
import { cn } from "@/lib/utils";
import type { AiHealthStatus } from "@/hooks/useAiHealthCheck";
import type { OnboardingState, UseModelOnboardingReturn } from "@/hooks/useModelOnboarding";

const MODEL_NAME = "gemma-4-E4B-it-Q4_K_M";
const MODEL_SIZE_LABEL = "≈ 5 GB";
const MODEL_SOURCE_URL = "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF";

export interface InlineModelRowProps {
  /** 外部反馈的 AI health（模型文件存在 / runtime 就绪）—— 决定 "present" 态 */
  aiHealthStatus: AiHealthStatus;
  /** 下载 / license 状态机 */
  onboarding: UseModelOnboardingReturn;
  /** 用户 license accept 时间戳（决定按 Download 是走 Modal 还是直接 start） */
  licenseAcceptedAt: number | undefined;
  /** 下载 / 删除后刷新 health query 的钩子 */
  onModelStateChanged?: () => void;
}

type RowKind =
  | "missing"
  | "starting"
  | "downloading"
  | "verifying"
  | "ready"
  | "canceled"
  | "error";

interface RowView {
  kind: RowKind;
  /** progress percent (0-100) — only meaningful for 'downloading' */
  percent?: number;
  /** downloaded / total bytes — only 'downloading' */
  downloaded?: number;
  total?: number;
  /** error detail — only 'error' */
  message?: string;
  detail?: string;
  retryable?: boolean;
}

/**
 * Derive the row view from the (health, onboarding.state) tuple. Pure; tested
 * independently so we don't have to mount React + mock listeners.
 */
export function deriveRowView(aiHealthStatus: AiHealthStatus, state: OnboardingState): RowView {
  // 进行中的态优先：onboarding state 比 health 新
  switch (state.kind) {
    case "starting":
      return { kind: "starting" };
    case "fetching":
      return {
        kind: "downloading",
        percent: state.percent,
        downloaded: state.downloaded,
        total: state.total,
      };
    case "verifying":
      return { kind: "verifying" };
    case "canceled":
      return { kind: "canceled" };
    case "error":
      return {
        kind: "error",
        message: state.message,
        detail: state.detail,
        retryable: state.retryable,
      };
    case "licensePrompt":
    case "accepting":
    case "completed":
    case "idle":
      break;
  }

  // Fall back to health status
  if (aiHealthStatus === "ready" || aiHealthStatus === "loading") {
    return { kind: "ready" };
  }
  // "disabled" / "model-missing" / "error" 都当成 missing（disabled 时上游不渲染）
  return { kind: "missing" };
}

export function InlineModelRow(props: InlineModelRowProps) {
  const { aiHealthStatus, onboarding, licenseAcceptedAt, onModelStateChanged } = props;
  const view = deriveRowView(aiHealthStatus, onboarding.state);
  const [deleting, setDeleting] = useState(false);

  const handleDownload = () => {
    // license 已接受 → 跳过 Modal 直接 start；否则开 Modal 到 licensePrompt 态
    if (licenseAcceptedAt !== undefined) {
      void onboarding.startDownload();
    } else {
      onboarding.openDialog();
    }
  };

  const handleCancel = () => void onboarding.cancel();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await aiModelDelete();
      if (result.deleted) {
        showSuccessToast("模型已删除");
      }
      onModelStateChanged?.();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setDeleting(false);
    }
  };

  const handleRetry = () => void onboarding.startDownload();

  return (
    <div
      className="border-border bg-card flex flex-col gap-2 rounded-md border p-3"
      data-row-kind={view.kind}
    >
      <div className="flex items-center gap-3">
        <RowIcon view={view} deleting={deleting} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <code className="truncate font-mono text-sm">{MODEL_NAME}</code>
            {view.kind === "ready" && (
              <span className="text-primary text-[10px] font-semibold tracking-wide uppercase">
                Loaded
              </span>
            )}
          </div>
          <RowStatusLine view={view} deleting={deleting} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RowActions
            view={view}
            deleting={deleting}
            onDownload={handleDownload}
            onCancel={handleCancel}
            onDelete={() => void handleDelete()}
            onRetry={handleRetry}
          />
        </div>
      </div>

      {view.kind === "downloading" && (
        <div className="px-1">
          <Progress value={view.percent ?? 0} aria-label={`Download ${view.percent ?? 0}%`} />
        </div>
      )}

      {view.kind === "error" && view.detail && (
        <p
          className={cn(
            "border-border bg-muted/40 text-muted-foreground",
            "max-h-32 overflow-auto rounded border p-2 font-mono text-xs"
          )}
        >
          {view.detail}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => void openUrl(MODEL_SOURCE_URL)}
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
        >
          {MODEL_SIZE_LABEL} · unsloth/gemma-4-E4B-it-GGUF ↗
        </button>
      </div>
    </div>
  );
}

// ---- Presentational sub-pieces -------------------------------------------

function RowIcon({ view, deleting }: { view: RowView; deleting: boolean }) {
  const cls = "size-4 shrink-0";
  if (deleting) return <Loader2 className={cn(cls, "text-muted-foreground animate-spin")} />;
  switch (view.kind) {
    case "missing":
      return <Download className={cn(cls, "text-muted-foreground")} aria-label="Not downloaded" />;
    case "starting":
    case "verifying":
      return <Loader2 className={cn(cls, "text-muted-foreground animate-spin")} />;
    case "downloading":
      return <Loader2 className={cn(cls, "text-primary animate-spin")} />;
    case "ready":
      return <CheckCircle2 className={cn(cls, "text-primary")} aria-label="Ready" />;
    case "canceled":
      return <XCircle className={cn(cls, "text-muted-foreground")} aria-label="Canceled" />;
    case "error":
      return <AlertTriangle className={cn(cls, "text-destructive")} aria-label="Error" />;
  }
}

function RowStatusLine({ view, deleting }: { view: RowView; deleting: boolean }) {
  if (deleting) {
    return <span className="text-muted-foreground text-xs">Removing…</span>;
  }
  switch (view.kind) {
    case "missing":
      return <span className="text-muted-foreground text-xs">Not downloaded</span>;
    case "starting":
      return <span className="text-muted-foreground text-xs">Preparing download…</span>;
    case "downloading": {
      const mb = (n: number) => (n / (1024 * 1024)).toFixed(0);
      const pct = view.percent ?? 0;
      if (view.total && view.total > 0) {
        return (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {mb(view.downloaded ?? 0)} / {mb(view.total)} MB · {pct}%
          </span>
        );
      }
      return <span className="text-muted-foreground text-xs">Downloading {pct}%</span>;
    }
    case "verifying":
      return <span className="text-muted-foreground text-xs">Verifying SHA-256…</span>;
    case "ready":
      return <span className="text-muted-foreground text-xs">Ready on disk</span>;
    case "canceled":
      return (
        <span className="text-muted-foreground text-xs">
          Canceled — partial bytes kept for resume
        </span>
      );
    case "error":
      return <span className="text-destructive text-xs">{view.message ?? "Download failed"}</span>;
  }
}

function RowActions({
  view,
  deleting,
  onDownload,
  onCancel,
  onDelete,
  onRetry,
}: {
  view: RowView;
  deleting: boolean;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onRetry: () => void;
}) {
  if (deleting) return null;
  switch (view.kind) {
    case "missing":
      return (
        <Button size="sm" variant="outline" onClick={onDownload} className="h-7">
          <Download className="size-3.5" /> Download
        </Button>
      );
    case "starting":
    case "downloading":
    case "verifying":
      return (
        <Button size="sm" variant="outline" onClick={onCancel} className="h-7">
          Cancel
        </Button>
      );
    case "ready":
      return (
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive h-7"
          title="Delete downloaded model (frees ~5 GB)"
          aria-label="Delete downloaded model"
        >
          <Trash2 className="size-3.5" />
        </Button>
      );
    case "canceled":
      return (
        <Button size="sm" variant="outline" onClick={onRetry} className="h-7">
          Resume
        </Button>
      );
    case "error":
      return view.retryable ? (
        <Button size="sm" variant="outline" onClick={onRetry} className="h-7">
          Retry
        </Button>
      ) : null;
  }
}
