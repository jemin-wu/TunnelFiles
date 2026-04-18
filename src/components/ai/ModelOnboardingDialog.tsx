/**
 * Gemma 4 E4B license acceptance dialog (SPEC §5 T1.5).
 *
 * Modal scope narrowed to the single gate that genuinely needs a blocking
 * prompt: Google's Gemma ToU acceptance. Download progress / verify / cancel /
 * errors render inline in Settings via `InlineModelRow`, matching the
 * inventory-card UX pattern (ghost-pepper ModelInventoryViews).
 *
 * States this dialog handles:
 * - `licensePrompt`: show ToU link + checkbox + Accept & Download button
 * - `accepting`: transitional spinner (<1 s normally — accept IPC round-trip)
 *
 * All other states (starting / fetching / verifying / completed / canceled /
 * error) do NOT render this dialog; they flow through the inline row.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import type { UseModelOnboardingReturn } from "@/hooks/useModelOnboarding";

const GEMMA_TOU_URL = "https://ai.google.dev/gemma/terms";
const MODEL_SIZE_LABEL = "≈ 5 GB";

export interface ModelOnboardingDialogProps {
  onboarding: UseModelOnboardingReturn;
}

/**
 * Dialog 只在 license 相关态展示。其他所有态交给 `InlineModelRow` 在
 * Settings 内嵌渲染。关闭逻辑：`licensePrompt` 允许用户关；`accepting` 是
 * 短暂过渡态，不给关。
 */
export function ModelOnboardingDialog({ onboarding }: ModelOnboardingDialogProps) {
  const { state } = onboarding;
  const open = state.kind === "licensePrompt" || state.kind === "accepting";
  const blocking = state.kind === "accepting";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !blocking && onboarding.dismiss()}>
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => blocking && e.preventDefault()}
        onPointerDownOutside={(e) => blocking && e.preventDefault()}
        data-state-kind={state.kind}
      >
        {state.kind === "licensePrompt" && <LicensePromptView onboarding={onboarding} />}
        {state.kind === "accepting" && <AcceptingView />}
      </DialogContent>
    </Dialog>
  );
}

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
          className="size-5 border-2"
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

function AcceptingView() {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Recording acceptance…</DialogTitle>
        <DialogDescription>Starting download shortly.</DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-center py-6">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    </>
  );
}
