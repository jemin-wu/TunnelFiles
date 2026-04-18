/**
 * Gemma 4 E4B model download dialog (SPEC §5 T1.5).
 *
 * Two flows in one dialog:
 * 1. License prompt — Gemma ToU link + checkbox + "Accept & Download"
 * 2. Progress — phase label + percent bar + cancel button
 *
 * Terminal states (completed / canceled / error) keep the dialog open until
 * the user explicitly dismisses so they can't miss the outcome.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { OnboardingState, UseModelOnboardingReturn } from "@/hooks/useModelOnboarding";
import { isTerminal } from "@/hooks/useModelOnboarding";

const GEMMA_TOU_URL = "https://ai.google.dev/gemma/terms";
const MODEL_SIZE_LABEL = "≈ 5 GB";

export interface ModelOnboardingDialogProps {
  onboarding: UseModelOnboardingReturn;
}

/**
 * 整合 dialog open/close 与 onboarding state 的可见性：
 * - `idle` → 不渲染任何 DOM（Radix Dialog open=false）
 * - 其他状态 → 展示
 */
export function ModelOnboardingDialog({ onboarding }: ModelOnboardingDialogProps) {
  const { state } = onboarding;
  const open = state.kind !== "idle";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose(onboarding)}>
      <DialogContent
        className="sm:max-w-md"
        // 非终态时阻止 Escape / overlay 关闭，防止误触中断下载
        onEscapeKeyDown={(e) => !isTerminal(state) && e.preventDefault()}
        onPointerDownOutside={(e) => !isTerminal(state) && e.preventDefault()}
        data-state-kind={state.kind}
      >
        {renderContents(onboarding)}
      </DialogContent>
    </Dialog>
  );
}

function handleClose(onboarding: UseModelOnboardingReturn) {
  // 只在终态让 dialog 关闭；非终态 user 要走 Cancel 按钮
  if (isTerminal(onboarding.state)) {
    onboarding.dismiss();
  }
}

function renderContents(onboarding: UseModelOnboardingReturn) {
  const { state } = onboarding;
  switch (state.kind) {
    case "idle":
      return null;
    case "licensePrompt":
      return <LicensePromptView onboarding={onboarding} />;
    case "accepting":
    case "starting":
      return <StartingView />;
    case "fetching":
      return <FetchingView state={state} onCancel={onboarding.cancel} />;
    case "verifying":
      return <VerifyingView onCancel={onboarding.cancel} />;
    case "completed":
      return <CompletedView onDismiss={onboarding.dismiss} />;
    case "canceled":
      return <CanceledView onRetry={onboarding.startDownload} onDismiss={onboarding.dismiss} />;
    case "error":
      return (
        <ErrorView
          state={state}
          onRetry={onboarding.startDownload}
          onDismiss={onboarding.dismiss}
        />
      );
  }
}

// ---- License prompt -------------------------------------------------------

function LicensePromptView({ onboarding }: { onboarding: UseModelOnboardingReturn }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Download Gemma 4 E4B</DialogTitle>
        <DialogDescription>
          Local-only weights, {MODEL_SIZE_LABEL}. Sourced from{" "}
          <button
            type="button"
            onClick={() => void openUrl("https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF")}
            className="hover:text-foreground underline underline-offset-2"
          >
            unsloth/gemma-4-E4B-it-GGUF
          </button>
          , Q4_K_M quantization.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-start gap-3 py-2">
        <Checkbox
          id="gemma-tou-accept"
          checked={accepted}
          onCheckedChange={(v) => setAccepted(v === true)}
          aria-label="Accept Gemma Terms of Use"
        />
        <label htmlFor="gemma-tou-accept" className="text-muted-foreground text-sm leading-snug">
          I have read and accept the{" "}
          <button
            type="button"
            onClick={() => void openUrl(GEMMA_TOU_URL)}
            className="hover:text-foreground underline underline-offset-2"
          >
            Gemma Terms of Use
          </button>
          .
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onboarding.dismiss}>
          Cancel
        </Button>
        <Button disabled={!accepted} onClick={() => void onboarding.acceptAndDownload()}>
          Accept &amp; Download
        </Button>
      </DialogFooter>
    </>
  );
}

// ---- Progress views -------------------------------------------------------

function StartingView() {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Preparing download…</DialogTitle>
        <DialogDescription>Contacting Hugging Face.</DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-center py-6">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    </>
  );
}

function FetchingView({
  state,
  onCancel,
}: {
  state: Extract<OnboardingState, { kind: "fetching" }>;
  onCancel: () => Promise<void>;
}) {
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(0);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Downloading…</DialogTitle>
        <DialogDescription>
          {state.total > 0
            ? `${mb(state.downloaded)} / ${mb(state.total)} MB`
            : `${mb(state.downloaded)} MB received`}
        </DialogDescription>
      </DialogHeader>
      <div className="py-2">
        <Progress value={state.percent} aria-label={`Download ${state.percent}%`} />
        <p className="text-muted-foreground mt-2 text-right font-mono text-xs tabular-nums">
          {state.percent}%
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => void onCancel()}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  );
}

function VerifyingView({ onCancel }: { onCancel: () => Promise<void> }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Verifying…</DialogTitle>
        <DialogDescription>
          Computing SHA-256 to ensure the download matches the pinned hash.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-center py-6">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => void onCancel()}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  );
}

// ---- Terminal views -------------------------------------------------------

function CompletedView({ onDismiss }: { onDismiss: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="text-primary size-5" />
          Model ready
        </DialogTitle>
        <DialogDescription>
          Download and integrity check complete. The runtime will load the GGUF on the next health
          check.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={onDismiss}>Close</Button>
      </DialogFooter>
    </>
  );
}

function CanceledView({
  onRetry,
  onDismiss,
}: {
  onRetry: () => Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <XCircle className="text-muted-foreground size-5" />
          Download cancelled
        </DialogTitle>
        <DialogDescription>
          Partial bytes are kept on disk so you can resume without starting over.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onDismiss}>
          Close
        </Button>
        <Button onClick={() => void onRetry()}>Resume</Button>
      </DialogFooter>
    </>
  );
}

function ErrorView({
  state,
  onRetry,
  onDismiss,
}: {
  state: Extract<OnboardingState, { kind: "error" }>;
  onRetry: () => Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="text-destructive size-5" />
          Download failed
        </DialogTitle>
        <DialogDescription>{state.message}</DialogDescription>
      </DialogHeader>
      {state.detail && (
        <p
          className={cn(
            "border-border bg-muted/40 rounded border p-2 font-mono text-xs",
            "text-muted-foreground max-h-40 overflow-auto"
          )}
        >
          {state.detail}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDismiss}>
          Close
        </Button>
        {state.retryable && <Button onClick={() => void onRetry()}>Retry</Button>}
      </DialogFooter>
    </>
  );
}

// ---- Auto-close convenience ----------------------------------------------

/**
 * Optional helper: auto-dismiss on `completed` after a delay. Not wired into
 * `ModelOnboardingDialog` by default — callers can opt in by wrapping.
 */
export function useAutoDismissOnComplete(onboarding: UseModelOnboardingReturn, delayMs: number) {
  useEffect(() => {
    if (onboarding.state.kind !== "completed") return;
    const id = window.setTimeout(() => onboarding.dismiss(), delayMs);
    return () => window.clearTimeout(id);
  }, [onboarding, delayMs]);
}
