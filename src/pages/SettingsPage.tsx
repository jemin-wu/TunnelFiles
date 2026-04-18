/**
 * Settings Page
 * Clean left navigation + right content layout
 */

import { useCallback, useState } from "react";
import { useNavigate, useBlocker } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  FolderOpen,
  Download,
  Zap,
  FileText,
  TerminalSquare,
  Shield,
  Sparkles,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { FullPageLoader } from "@/components/ui/LoadingSpinner";
import { useSettings } from "@/hooks/useSettings";
import { useAiHealthCheck } from "@/hooks/useAiHealthCheck";
import { AiHealthBadge } from "@/components/ai/AiHealthBadge";
import { ModelOnboardingDialog } from "@/components/ai/ModelOnboardingDialog";
import { useModelOnboarding } from "@/hooks/useModelOnboarding";
import { KnownHostsList } from "@/components/settings/KnownHostsList";
import type { LogLevel } from "@/types/settings";
import {
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_SCROLLBACK_MIN,
  TERMINAL_SCROLLBACK_MAX,
  AI_MAX_CONCURRENT_PROBES_MIN,
  AI_MAX_CONCURRENT_PROBES_MAX,
  AI_OUTPUT_TOKEN_CAP_MAX,
} from "@/types/settings";

const LOG_LEVELS: { value: LogLevel; label: string }[] = [
  { value: "error", label: "Error" },
  { value: "warn", label: "Warning" },
  { value: "info", label: "Info" },
  { value: "debug", label: "Debug" },
];

const settingsSchema = z.object({
  defaultDownloadDir: z.string().optional(),
  maxConcurrentTransfers: z.number().min(1).max(6),
  connectionTimeoutSecs: z.number().min(1, "Minimum timeout is 1 second"),
  transferRetryCount: z.number().min(0).max(10),
  logLevel: z.enum(["error", "warn", "info", "debug"]),
  terminalFontSize: z.number().min(TERMINAL_FONT_SIZE_MIN).max(TERMINAL_FONT_SIZE_MAX),
  terminalScrollbackLines: z.number().min(TERMINAL_SCROLLBACK_MIN).max(TERMINAL_SCROLLBACK_MAX),
  terminalFollowDirectory: z.boolean(),
  aiEnabled: z.boolean(),
  maxConcurrentAiProbes: z
    .number()
    .int()
    .min(AI_MAX_CONCURRENT_PROBES_MIN)
    .max(AI_MAX_CONCURRENT_PROBES_MAX),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;
type SettingsSection = "transfer" | "connection" | "terminal" | "security" | "logs" | "ai";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "group h-auto w-full justify-start gap-2.5 px-3 py-2.5 text-sm transition-colors duration-100",
        "hover:bg-accent/50",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "transition-colors duration-100",
          active
            ? "text-accent-foreground"
            : "text-muted-foreground/70 group-hover:text-accent-foreground"
        )}
      >
        {icon}
      </span>
      <span className={active ? "font-semibold" : "font-medium"}>{label}</span>
    </Button>
  );
}

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="border-border/30 border-b py-3 first:pt-0 last:border-0 last:pb-0">
      <div className="mb-0.5">
        <span className="text-foreground/90 text-sm font-medium">{label}</span>
      </div>
      {description && <div className="text-muted-foreground mb-2.5 text-xs">{description}</div>}
      <div>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSettings, isLoading, isUpdating } = useSettings();
  const { status: aiHealthStatus } = useAiHealthCheck(settings.aiEnabled);
  const onboarding = useModelOnboarding();
  const [activeSection, setActiveSection] = useState<SettingsSection>("transfer");

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    values: {
      defaultDownloadDir: settings.defaultDownloadDir ?? "",
      maxConcurrentTransfers: settings.maxConcurrentTransfers,
      connectionTimeoutSecs: settings.connectionTimeoutSecs,
      transferRetryCount: settings.transferRetryCount,
      logLevel: settings.logLevel,
      terminalFontSize: settings.terminalFontSize,
      terminalScrollbackLines: settings.terminalScrollbackLines,
      terminalFollowDirectory: settings.terminalFollowDirectory,
      aiEnabled: settings.aiEnabled,
      maxConcurrentAiProbes: settings.maxConcurrentAiProbes,
    },
  });

  const handleSubmit = async (values: SettingsFormValues) => {
    await updateSettings({
      defaultDownloadDir: values.defaultDownloadDir || undefined,
      maxConcurrentTransfers: values.maxConcurrentTransfers,
      connectionTimeoutSecs: values.connectionTimeoutSecs,
      transferRetryCount: values.transferRetryCount,
      logLevel: values.logLevel,
      terminalFontSize: values.terminalFontSize,
      terminalScrollbackLines: values.terminalScrollbackLines,
      terminalFollowDirectory: values.terminalFollowDirectory,
      aiEnabled: values.aiEnabled,
      // aiModelName 在 v0.1 中是 pin 值（见 approved-model-sources.md），
      // UI 只读展示；不走 form patch
      maxConcurrentAiProbes: values.maxConcurrentAiProbes,
    });
    navigate(-1);
  };

  const isDirty = form.formState.isDirty;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  const handleSelectDirectory = useCallback(async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Select download directory",
    });
    if (selected) {
      form.setValue("defaultDownloadDir", selected as string, { shouldDirty: true });
    }
  }, [form]);

  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const handleCancel = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      navigate(-1);
    }
  }, [isDirty, navigate]);

  const handleDiscardConfirm = useCallback(() => {
    setShowDiscardDialog(false);
    form.reset();
    navigate(-1);
  }, [form, navigate]);

  if (isLoading) {
    return <FullPageLoader label="Loading settings..." />;
  }

  return (
    <div className="flex h-full">
      {/* Left navigation */}
      <aside className="border-border bg-sidebar/50 flex w-44 shrink-0 flex-col border-r p-3">
        <nav aria-label="Settings navigation" className="flex-1 space-y-1 pt-2">
          <NavItem
            icon={<Download className="size-3.5" />}
            label="Transfer"
            active={activeSection === "transfer"}
            onClick={() => setActiveSection("transfer")}
          />
          <NavItem
            icon={<Zap className="size-3.5" />}
            label="Connection"
            active={activeSection === "connection"}
            onClick={() => setActiveSection("connection")}
          />
          <NavItem
            icon={<TerminalSquare className="size-3.5" />}
            label="Terminal"
            active={activeSection === "terminal"}
            onClick={() => setActiveSection("terminal")}
          />
          <NavItem
            icon={<Sparkles className="size-3.5" />}
            label="AI"
            active={activeSection === "ai"}
            onClick={() => setActiveSection("ai")}
          />
          <NavItem
            icon={<Shield className="size-3.5" />}
            label="Security"
            active={activeSection === "security"}
            onClick={() => setActiveSection("security")}
          />
          <NavItem
            icon={<FileText className="size-3.5" />}
            label="Logging"
            active={activeSection === "logs"}
            onClick={() => setActiveSection("logs")}
          />
        </nav>
      </aside>

      {/* Content */}
      <div className="flex min-h-0 flex-1 justify-center overflow-auto">
        <div className="w-full max-w-lg p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)}>
              {/* TRANSFER_CONFIG */}
              {activeSection === "transfer" && (
                <section className="animate-fade-in">
                  <h2 className="mb-1 text-base font-semibold">Transfer settings</h2>
                  <p className="text-muted-foreground mb-6 text-xs">
                    File upload and download settings
                  </p>

                  <div>
                    <FormField
                      control={form.control}
                      name="defaultDownloadDir"
                      render={({ field }) => (
                        <SettingRow label="Download directory" description="Default save location">
                          <FormItem className="space-y-0">
                            <FormControl>
                              <div className="flex gap-2">
                                <Input
                                  placeholder="System default"
                                  {...field}
                                  disabled={isUpdating}
                                  className="h-9 flex-1"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  disabled={isUpdating}
                                  onClick={handleSelectDirectory}
                                  className="h-9 w-9 shrink-0"
                                  aria-label="Browse directory"
                                >
                                  <FolderOpen className="size-4" />
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="maxConcurrentTransfers"
                      render={({ field }) => (
                        <SettingRow
                          label="Max concurrent"
                          description="Simultaneous transfer tasks"
                        >
                          <FormItem className="space-y-0">
                            <div className="flex items-center gap-4">
                              <FormControl>
                                <Slider
                                  min={1}
                                  max={6}
                                  step={1}
                                  value={[field.value]}
                                  onValueChange={(vals) => field.onChange(vals[0])}
                                  disabled={isUpdating}
                                  className="flex-1"
                                />
                              </FormControl>
                              <div className="bg-muted/50 border-border/50 flex h-9 w-9 items-center justify-center rounded border">
                                <span className="text-foreground text-sm font-medium">
                                  {field.value}
                                </span>
                              </div>
                            </div>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="transferRetryCount"
                      render={({ field }) => (
                        <SettingRow label="Retry count" description="Auto retry on failure (0-10)">
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                max={10}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                disabled={isUpdating}
                                className="h-9 w-20"
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />
                  </div>
                </section>
              )}

              {/* CONNECTION_CONFIG */}
              {activeSection === "connection" && (
                <section className="animate-fade-in">
                  <h2 className="mb-1 text-base font-semibold">Connection settings</h2>
                  <p className="text-muted-foreground mb-6 text-xs">SSH connection settings</p>

                  <div>
                    <FormField
                      control={form.control}
                      name="connectionTimeoutSecs"
                      render={({ field }) => (
                        <SettingRow label="Timeout" description="SSH connection timeout">
                          <FormItem className="space-y-0">
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                  disabled={isUpdating}
                                  className="h-9 w-20"
                                />
                              </FormControl>
                              <span className="text-muted-foreground text-xs">seconds</span>
                            </div>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />
                  </div>
                </section>
              )}

              {/* TERMINAL_CONFIG */}
              {activeSection === "terminal" && (
                <section className="animate-fade-in">
                  <h2 className="mb-1 text-base font-semibold">Terminal settings</h2>
                  <p className="text-muted-foreground mb-6 text-xs">
                    Terminal appearance and behavior
                  </p>

                  <div>
                    <FormField
                      control={form.control}
                      name="terminalFontSize"
                      render={({ field }) => (
                        <SettingRow label="Font size" description="Terminal font size (10-24px)">
                          <FormItem className="space-y-0">
                            <div className="flex items-center gap-4">
                              <FormControl>
                                <Slider
                                  min={TERMINAL_FONT_SIZE_MIN}
                                  max={TERMINAL_FONT_SIZE_MAX}
                                  step={1}
                                  value={[field.value]}
                                  onValueChange={(vals) => field.onChange(vals[0])}
                                  disabled={isUpdating}
                                  className="flex-1"
                                />
                              </FormControl>
                              <div className="bg-muted/50 border-border/50 flex h-9 w-12 items-center justify-center rounded border">
                                <span className="text-foreground text-sm font-medium">
                                  {field.value}px
                                </span>
                              </div>
                            </div>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="terminalScrollbackLines"
                      render={({ field }) => (
                        <SettingRow
                          label="Scrollback buffer"
                          description="Maximum lines kept in terminal history"
                        >
                          <FormItem className="space-y-0">
                            <div className="flex items-center gap-4">
                              <FormControl>
                                <Slider
                                  min={TERMINAL_SCROLLBACK_MIN}
                                  max={TERMINAL_SCROLLBACK_MAX}
                                  step={1000}
                                  value={[field.value]}
                                  onValueChange={(vals) => field.onChange(vals[0])}
                                  disabled={isUpdating}
                                  className="flex-1"
                                />
                              </FormControl>
                              <div className="bg-muted/50 border-border/50 flex h-9 w-16 items-center justify-center rounded border">
                                <span className="text-foreground text-sm font-medium">
                                  {(field.value / 1000).toFixed(0)}k
                                </span>
                              </div>
                            </div>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="terminalFollowDirectory"
                      render={({ field }) => (
                        <SettingRow
                          label="Follow directory"
                          description="Auto-cd to the browsed directory when terminal is idle"
                        >
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isUpdating}
                              />
                            </FormControl>
                          </FormItem>
                        </SettingRow>
                      )}
                    />
                  </div>
                </section>
              )}

              {/* AI_CONFIG */}
              {activeSection === "ai" && (
                <section className="animate-fade-in">
                  <div className="mb-1 flex items-center gap-2">
                    <h2 className="text-base font-semibold">AI Shell Copilot</h2>
                    <AiHealthBadge status={aiHealthStatus} />
                    {aiHealthStatus === "model-missing" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="ml-auto h-7"
                        onClick={onboarding.openDialog}
                        data-testid="download-model-button"
                      >
                        <Download className="size-3.5" />
                        Download model
                      </Button>
                    )}
                  </div>
                  <p className="text-muted-foreground mb-6 text-xs">
                    Local-only terminal assistant. Default off.
                  </p>
                  <ModelOnboardingDialog onboarding={onboarding} />

                  <div>
                    <FormField
                      control={form.control}
                      name="aiEnabled"
                      render={({ field }) => (
                        <SettingRow
                          label="Enable AI assistant"
                          description="No data leaves your machine. Requires local model download."
                        >
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isUpdating}
                                aria-label="Enable AI assistant"
                                className="size-5 border-2"
                              />
                            </FormControl>
                          </FormItem>
                        </SettingRow>
                      )}
                    />

                    <SettingRow
                      label="Model"
                      description="Pinned in v0.1 — see approved-model-sources.md"
                    >
                      <div className="flex flex-col items-end gap-1">
                        <code className="font-mono text-xs">{settings.aiModelName}</code>
                        <button
                          type="button"
                          onClick={() =>
                            void openUrl("https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF")
                          }
                          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                        >
                          ≈ 5 GB · unsloth/gemma-4-E4B-it-GGUF ↗
                        </button>
                      </div>
                    </SettingRow>

                    <FormField
                      control={form.control}
                      name="maxConcurrentAiProbes"
                      render={({ field }) => (
                        <SettingRow
                          label="Max concurrent probes"
                          description="Independent read-only SSH probe sessions"
                        >
                          <FormItem className="space-y-0">
                            <div className="flex items-center gap-4">
                              <FormControl>
                                <Slider
                                  min={AI_MAX_CONCURRENT_PROBES_MIN}
                                  max={AI_MAX_CONCURRENT_PROBES_MAX}
                                  step={1}
                                  value={[field.value]}
                                  onValueChange={(vals) => field.onChange(vals[0])}
                                  disabled={isUpdating}
                                  className="flex-1"
                                />
                              </FormControl>
                              <div className="bg-muted/50 border-border/50 flex h-9 w-9 items-center justify-center rounded border">
                                <span className="text-foreground text-sm font-medium">
                                  {field.value}
                                </span>
                              </div>
                            </div>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />

                    <SettingRow
                      label="Output token cap"
                      description="Hard upper bound on model output per response"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-mono text-sm font-medium">
                          {AI_OUTPUT_TOKEN_CAP_MAX}
                        </span>
                        <span className="text-muted-foreground text-xs">tokens (fixed)</span>
                      </div>
                    </SettingRow>
                  </div>
                </section>
              )}

              {/* LOGGING_CONFIG */}
              {activeSection === "logs" && (
                <section className="animate-fade-in">
                  <h2 className="mb-1 text-base font-semibold">Logging settings</h2>
                  <p className="text-muted-foreground mb-6 text-xs">Application log output</p>

                  <div>
                    <FormField
                      control={form.control}
                      name="logLevel"
                      render={({ field }) => (
                        <SettingRow label="Log level" description="Log verbosity control">
                          <FormItem className="space-y-0">
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={isUpdating}
                            >
                              <FormControl>
                                <SelectTrigger className="h-9 w-36">
                                  <SelectValue placeholder="Select level" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {LOG_LEVELS.map((level) => (
                                  <SelectItem key={level.value} value={level.value}>
                                    {level.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />
                  </div>
                </section>
              )}

              {/* ACTIONS */}
              {activeSection !== "security" && (
                <div className="border-border/50 mt-8 flex justify-end gap-3 border-t pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isUpdating}
                    className="h-9 px-4"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isUpdating || !isDirty}
                    className="h-9 gap-2 px-5"
                  >
                    {isUpdating && <Loader2 className="size-3.5 animate-spin" />}
                    <span>Save</span>
                  </Button>
                </div>
              )}
            </form>
          </Form>

          {/* SECURITY - outside form, has its own data lifecycle */}
          {activeSection === "security" && (
            <section className="animate-fade-in">
              <h2 className="mb-1 text-base font-semibold">Security</h2>
              <p className="text-muted-foreground mb-6 text-xs">Trusted SSH host keys (TOFU)</p>
              <KnownHostsList />
            </section>
          )}
        </div>
      </div>

      {/* Unsaved changes dialog — shared by navigation blocker and cancel button */}
      <AlertDialog
        open={blocker.state === "blocked" || showDiscardDialog}
        onOpenChange={(open) => {
          if (!open) {
            blocker.reset?.();
            setShowDiscardDialog(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              You have unsaved changes. Are you sure you want to leave?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (blocker.state === "blocked") {
                  blocker.proceed?.();
                } else {
                  handleDiscardConfirm();
                }
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
