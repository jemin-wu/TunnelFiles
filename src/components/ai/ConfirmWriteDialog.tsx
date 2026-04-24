import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AiAwaitConfirmPayload } from "@/types/bindings/AiAwaitConfirmPayload";
import { PlanDiffViewer } from "./PlanDiffViewer";

interface ConfirmWriteDialogProps {
  payload: AiAwaitConfirmPayload | null;
  pending?: boolean;
  onConfirm: (planId: string) => void | Promise<void>;
  onCancel: (planId: string) => void | Promise<void>;
}

export function ConfirmWriteDialog({
  payload,
  pending,
  onConfirm,
  onCancel,
}: ConfirmWriteDialogProps) {
  const isWrite = payload?.kind === "write";

  return (
    <Dialog open={Boolean(payload)}>
      <DialogContent
        className="border-border bg-card max-h-[85vh] overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton={false}
      >
        {payload && (
          <>
            <DialogHeader className="border-border/60 border-b px-6 py-5">
              <DialogTitle>{isWrite ? "确认写入" : "确认执行"}</DialogTitle>
              <DialogDescription>
                {isWrite
                  ? "后端已经完成 snapshot，下面展示的是将要执行的 `argv` 与 unified diff。"
                  : "下面展示的是将要执行的受限 `argv`。该步骤会改变服务状态，需显式确认。"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 overflow-auto px-6 py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <section className="space-y-3">
                <div>
                  <div className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
                    argv
                  </div>
                  <div className="border-border/60 bg-muted/40 rounded-md border p-3 font-mono text-[11px]">
                    {payload.argv.map((item, index) => (
                      <div key={`${item}-${index}`}>{item}</div>
                    ))}
                  </div>
                </div>

                {payload.targetFiles.length > 0 && (
                  <div>
                    <div className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
                      Target Files
                    </div>
                    <div className="border-border/60 bg-muted/40 rounded-md border p-3 font-mono text-[11px]">
                      {payload.targetFiles.map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                    </div>
                  </div>
                )}

                {payload.warnings.length > 0 && (
                  <div>
                    <div className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
                      Warnings
                    </div>
                    <div className="border-border/60 rounded-md border bg-amber-500/10 p-3 text-[11px]">
                      {payload.warnings.map((warning, index) => (
                        <div key={`${warning}-${index}`}>{warning}</div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="min-w-0">
                {payload.diff ? (
                  <>
                    <div className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
                      Diff Preview
                    </div>
                    <div className="min-h-[360px]">
                      <PlanDiffViewer diff={payload.diff} />
                    </div>
                  </>
                ) : (
                  <div className="border-border/60 bg-muted/20 text-muted-foreground rounded-md border p-4 text-[11px]">
                    该步骤不会修改文件，因此没有 diff 预览。
                  </div>
                )}
              </section>
            </div>

            <DialogFooter className="border-border/60 border-t px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => void onCancel(payload.planId)}
                disabled={pending}
              >
                取消计划
              </Button>
              <Button
                type="button"
                onClick={() => void onConfirm(payload.planId)}
                disabled={pending}
              >
                {isWrite ? "确认写入" : "确认执行"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
