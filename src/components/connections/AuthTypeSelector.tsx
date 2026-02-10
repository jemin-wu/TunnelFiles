import { Key, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AuthTypeValue = "password" | "key";

interface AuthTypeSelectorProps {
  value: AuthTypeValue;
  onChange: (value: AuthTypeValue) => void;
  disabled?: boolean;
}

export function AuthTypeSelector({ value, onChange, disabled }: AuthTypeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Authentication method"
      className="bg-muted/50 border-border/50 grid grid-cols-2 gap-2 rounded-md border p-1"
    >
      <Button
        type="button"
        variant="ghost"
        role="radio"
        aria-checked={value === "password"}
        disabled={disabled}
        onClick={() => onChange("password")}
        className={cn(
          "h-auto px-3 py-2 text-sm font-medium transition-colors duration-100",
          value === "password"
            ? "bg-accent dark:bg-accent/50 text-accent-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
      >
        <Key className="size-3.5" />
        <span>Password</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        role="radio"
        aria-checked={value === "key"}
        disabled={disabled}
        onClick={() => onChange("key")}
        className={cn(
          "h-auto px-3 py-2 text-sm font-medium transition-colors duration-100",
          value === "key"
            ? "bg-accent dark:bg-accent/50 text-accent-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
      >
        <KeyRound className="size-3.5" />
        <span>SSH key</span>
      </Button>
    </div>
  );
}
