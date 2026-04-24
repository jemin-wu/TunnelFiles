import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface RollbackButtonProps {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}

export function RollbackButton({ onClick, disabled }: RollbackButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 px-2 text-[11px]"
      onClick={() => void onClick()}
      disabled={disabled}
      data-slot="plan-rollback"
    >
      <RotateCcw className="size-3" aria-hidden />
      回滚
    </Button>
  );
}
