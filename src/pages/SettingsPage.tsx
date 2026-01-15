/**
 * 设置页面 - Minimalist Terminal Style
 * 简洁的左侧导航 + 右侧内容布局
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/useSettings";
import type { LogLevel } from "@/types/settings";

const LOG_LEVELS: { value: LogLevel; label: string }[] = [
  { value: "error", label: "ERROR" },
  { value: "warn", label: "WARNING" },
  { value: "info", label: "INFO" },
  { value: "debug", label: "DEBUG" },
];

const settingsSchema = z.object({
  defaultDownloadDir: z.string().optional(),
  maxConcurrentTransfers: z.number().min(1).max(6),
  connectionTimeoutSecs: z.number().min(1, "TIMEOUT_MIN_ERROR"),
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
        "justify-start gap-2.5 w-full h-auto px-3 py-2.5 text-xs transition-all duration-200",
        "hover:bg-muted/80",
        active
          ? "bg-primary/10 text-primary hover:bg-primary/10"
          : "text-muted-foreground"
      )}
    >
      <span className={cn(
        "transition-colors",
        active ? "text-primary" : "text-muted-foreground/70"
      )}>
        {icon}
      </span>
      <span className="font-medium tracking-wide">{label}</span>
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
        <span className="text-xs font-medium text-foreground/90">{label}</span>
      </div>
      {description && (
        <div className="text-[10px] text-muted-foreground mb-3">{description}</div>
      )}
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
      title: "SELECT_DOWNLOAD_DIR",
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
        <span className="text-xs text-muted-foreground">
          <span className="text-primary">&gt;</span> LOADING_CONFIG...
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* LEFT_NAV */}
      <aside className="w-44 border-r border-border bg-sidebar/50 p-3 shrink-0 flex flex-col">
        <nav className="space-y-1 flex-1 pt-2">
          <NavItem
            icon={<Download className="h-3.5 w-3.5" />}
            label="TRANSFER"
            active={activeSection === "transfer"}
            onClick={() => setActiveSection("transfer")}
          />
          <NavItem
            icon={<Zap className="h-3.5 w-3.5" />}
            label="CONNECTION"
            active={activeSection === "connection"}
            onClick={() => setActiveSection("connection")}
          />
          <NavItem
            icon={<FileText className="h-3.5 w-3.5" />}
            label="LOGGING"
            active={activeSection === "logs"}
            onClick={() => setActiveSection("logs")}
          />
        </nav>
      </aside>

      {/* CONTENT */}
      <div className="flex-1 overflow-auto flex justify-center">
        <div className="w-full max-w-lg p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)}>
              {/* TRANSFER_CONFIG */}
              {activeSection === "transfer" && (
                <section className="animate-fade-in">
                  <h2 className="text-sm font-medium tracking-wide mb-1">TRANSFER_CONFIG</h2>
                  <p className="text-[10px] text-muted-foreground mb-6">
                    FILE_UPLOAD_DOWNLOAD_SETTINGS
                  </p>

                  <div>
                    <FormField
                      control={form.control}
                      name="defaultDownloadDir"
                      render={({ field }) => (
                        <SettingRow
                          label="DOWNLOAD_DIR"
                          description="DEFAULT_SAVE_LOCATION"
                        >
                          <FormItem className="space-y-0">
                            <FormControl>
                              <div className="flex gap-2">
                                <Input
                                  placeholder="SYSTEM_DEFAULT"
                                  {...field}
                                  disabled={isUpdating}
                                  className="flex-1 text-xs h-9"
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
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="maxConcurrentTransfers"
                      render={({ field }) => (
                        <SettingRow
                          label="MAX_CONCURRENT"
                          description="SIMULTANEOUS_TRANSFER_TASKS"
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
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        </SettingRow>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="transferRetryCount"
                      render={({ field }) => (
                        <SettingRow
                          label="RETRY_COUNT"
                          description="AUTO_RETRY_ON_FAILURE (0-10)"
                        >
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                max={10}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                disabled={isUpdating}
                                className="w-20 text-xs h-9"
                              />
                            </FormControl>
                            <FormMessage className="text-[10px]" />
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
                  <h2 className="text-sm font-medium tracking-wide mb-1">CONNECTION_CONFIG</h2>
                  <p className="text-[10px] text-muted-foreground mb-6">
                    SSH_CONNECTION_SETTINGS
                  </p>

                  <div>
                    <FormField
                      control={form.control}
                      name="connectionTimeoutSecs"
                      render={({ field }) => (
                        <SettingRow
                          label="TIMEOUT"
                          description="SSH_CONNECTION_TIMEOUT"
                        >
                          <FormItem className="space-y-0">
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                  disabled={isUpdating}
                                  className="w-20 text-xs h-9"
                                />
                              </FormControl>
                              <span className="text-xs text-muted-foreground">SECONDS</span>
                            </div>
                            <FormMessage className="text-[10px]" />
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
                  <h2 className="text-sm font-medium tracking-wide mb-1">LOGGING_CONFIG</h2>
                  <p className="text-[10px] text-muted-foreground mb-6">
                    APPLICATION_LOG_OUTPUT
                  </p>

                  <div>
                    <FormField
                      control={form.control}
                      name="logLevel"
                      render={({ field }) => (
                        <SettingRow
                          label="LOG_LEVEL"
                          description="LOG_VERBOSITY_CONTROL"
                        >
                          <FormItem className="space-y-0">
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={isUpdating}
                            >
                              <FormControl>
                                <SelectTrigger className="w-36 text-xs h-9">
                                  <SelectValue placeholder="SELECT_LEVEL" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="text-xs">
                                {LOG_LEVELS.map((level) => (
                                  <SelectItem key={level.value} value={level.value}>
                                    {level.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-[10px]" />
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
                  className="text-xs h-9 px-4"
                >
                  CANCEL
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isUpdating || !isDirty}
                  className="text-xs h-9 px-5 btn-cyber gap-2"
                >
                  {isUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>SAVE</span>
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
