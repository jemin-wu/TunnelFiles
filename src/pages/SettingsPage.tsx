/**
 * Settings Page
 * Clean left navigation + right content layout
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, FolderOpen, Download, Zap, FileText } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/useSettings";
import type { LogLevel } from "@/types/settings";

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
});

type SettingsFormValues = z.infer<typeof settingsSchema>;
type SettingsSection = "transfer" | "connection" | "logs";

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
        "justify-start gap-2.5 w-full h-auto px-3 py-2.5 text-sm transition-all duration-200",
        "hover:bg-muted/80",
        active ? "bg-primary/10 text-primary hover:bg-primary/10" : "text-muted-foreground"
      )}
    >
      <span
        className={cn("transition-colors", active ? "text-primary" : "text-muted-foreground/70")}
      >
        {icon}
      </span>
      <span className="font-medium">{label}</span>
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
    <div className="py-4 border-b border-border/30 last:border-0">
      <div className="mb-1">
        <span className="text-sm font-medium text-foreground/90">{label}</span>
      </div>
      {description && <div className="text-xs text-muted-foreground mb-3">{description}</div>}
      <div>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSettings, isLoading, isUpdating } = useSettings();
  const [activeSection, setActiveSection] = useState<SettingsSection>("transfer");

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    values: {
      defaultDownloadDir: settings.defaultDownloadDir ?? "",
      maxConcurrentTransfers: settings.maxConcurrentTransfers,
      connectionTimeoutSecs: settings.connectionTimeoutSecs,
      transferRetryCount: settings.transferRetryCount,
      logLevel: settings.logLevel,
    },
  });

  const handleSubmit = async (values: SettingsFormValues) => {
    await updateSettings({
      defaultDownloadDir: values.defaultDownloadDir || undefined,
      maxConcurrentTransfers: values.maxConcurrentTransfers,
      connectionTimeoutSecs: values.connectionTimeoutSecs,
      transferRetryCount: values.transferRetryCount,
      logLevel: values.logLevel,
    });
    navigate(-1);
  };

  const isDirty = form.formState.isDirty;

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

  const handleCancel = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Left navigation */}
      <aside className="w-44 border-r border-border bg-sidebar/50 p-3 shrink-0 flex flex-col">
        <nav className="space-y-1 flex-1 pt-2">
          <NavItem
            icon={<Download className="h-3.5 w-3.5" />}
            label="Transfer"
            active={activeSection === "transfer"}
            onClick={() => setActiveSection("transfer")}
          />
          <NavItem
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Connection"
            active={activeSection === "connection"}
            onClick={() => setActiveSection("connection")}
          />
          <NavItem
            icon={<FileText className="h-3.5 w-3.5" />}
            label="Logging"
            active={activeSection === "logs"}
            onClick={() => setActiveSection("logs")}
          />
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-auto flex justify-center min-h-0">
        <div className="w-full max-w-lg p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)}>
              {/* TRANSFER_CONFIG */}
              {activeSection === "transfer" && (
                <section className="animate-fade-in">
                  <h2 className="text-sm font-medium mb-1">Transfer settings</h2>
                  <p className="text-xs text-muted-foreground mb-6">
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
                                  className="flex-1 h-9"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  disabled={isUpdating}
                                  onClick={handleSelectDirectory}
                                  className="h-9 w-9 shrink-0"
                                >
                                  <FolderOpen className="h-4 w-4" />
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
                              <div className="w-9 h-9 rounded bg-muted/50 border border-border/50 flex items-center justify-center">
                                <span className="text-sm font-medium text-foreground">
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
                                className="w-20 h-9"
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
                  <h2 className="text-sm font-medium mb-1">Connection settings</h2>
                  <p className="text-xs text-muted-foreground mb-6">SSH connection settings</p>

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
                                  className="w-20 h-9"
                                />
                              </FormControl>
                              <span className="text-xs text-muted-foreground">seconds</span>
                            </div>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />
                  </div>
                </section>
              )}

              {/* LOGGING_CONFIG */}
              {activeSection === "logs" && (
                <section className="animate-fade-in">
                  <h2 className="text-sm font-medium mb-1">Logging settings</h2>
                  <p className="text-xs text-muted-foreground mb-6">Application log output</p>

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
                                <SelectTrigger className="w-36 h-9">
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
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-border/50">
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
                  className="h-9 px-5 gap-2"
                >
                  {isUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save</span>
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
