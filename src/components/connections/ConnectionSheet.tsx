/**
 * ConnectionSheet - Side drawer form for add/edit connections
 * Uses shadcn/ui Sheet with form logic extracted from ConnectionFormPage
 */

import { useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, FolderOpen, Key, KeyRound } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/connections/PasswordInput";
import { useUpsertProfile } from "@/hooks/useProfiles";
import type { AuthType, Profile } from "@/types";

// --- Sub-components ---

type AuthTypeValue = "password" | "key";

interface AuthTypeSelectorProps {
  value: AuthTypeValue;
  onChange: (value: AuthTypeValue) => void;
  disabled?: boolean;
}

function AuthTypeSelector({ value, onChange, disabled }: AuthTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-md border border-border/50">
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={() => onChange("password")}
        className={cn(
          "h-auto py-2 px-3 text-sm font-medium transition-all duration-200",
          value === "password"
            ? [
                "bg-background text-foreground shadow-sm border border-border/80",
                "hover:bg-background hover:text-foreground",
                "dark:bg-primary/15 dark:text-primary dark:border-primary/50",
                "dark:hover:bg-primary/20 dark:hover:text-primary",
              ]
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
      >
        <Key className="h-3.5 w-3.5" />
        <span>Password</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={() => onChange("key")}
        className={cn(
          "h-auto py-2 px-3 text-sm font-medium transition-all duration-200",
          value === "key"
            ? [
                "bg-background text-foreground shadow-sm border border-border/80",
                "hover:bg-background hover:text-foreground",
                "dark:bg-primary/15 dark:text-primary dark:border-primary/50",
                "dark:hover:bg-primary/20 dark:hover:text-primary",
              ]
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
      >
        <KeyRound className="h-3.5 w-3.5" />
        <span>SSH key</span>
      </Button>
    </div>
  );
}

// --- Form schema ---

const formSchema = z
  .object({
    authType: z.enum(["password", "key"]),
    name: z.string().min(1, "Name is required"),
    host: z.string().min(1, "Host is required"),
    port: z
      .number()
      .int()
      .min(1, "Port must be at least 1")
      .max(65535, "Port must be at most 65535"),
    username: z.string().min(1, "Username is required"),
    password: z.string().optional(),
    rememberPassword: z.boolean().optional(),
    privateKeyPath: z.string().optional(),
    passphrase: z.string().optional(),
    rememberPassphrase: z.boolean().optional(),
    initialPath: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.authType === "key" && !data.privateKeyPath) {
        return false;
      }
      return true;
    },
    {
      message: "Private key path is required",
      path: ["privateKeyPath"],
    }
  );

type FormValues = z.infer<typeof formSchema>;

// --- Main component ---

interface ConnectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editProfile?: Profile | null;
}

export function ConnectionSheet({ open, onOpenChange, editProfile }: ConnectionSheetProps) {
  const isEditing = !!editProfile;
  const upsertProfile = useUpsertProfile();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      authType: "password",
      name: "",
      host: "",
      port: 22,
      username: "",
      password: "",
      rememberPassword: false,
      privateKeyPath: "",
      passphrase: "",
      rememberPassphrase: false,
      initialPath: "",
    },
  });

  const authType = form.watch("authType");

  // Reset or populate form when sheet opens
  useEffect(() => {
    if (open) {
      if (editProfile) {
        form.reset({
          authType: editProfile.authType,
          name: editProfile.name,
          host: editProfile.host,
          port: editProfile.port,
          username: editProfile.username,
          password: "",
          rememberPassword: !!editProfile.passwordRef,
          privateKeyPath: editProfile.privateKeyPath ?? "",
          passphrase: "",
          rememberPassphrase: !!editProfile.passphraseRef,
          initialPath: editProfile.initialPath ?? "",
        });
      } else {
        form.reset({
          authType: "password",
          name: "",
          host: "",
          port: 22,
          username: "",
          password: "",
          rememberPassword: false,
          privateKeyPath: "",
          passphrase: "",
          rememberPassphrase: false,
          initialPath: "",
        });
      }
    }
  }, [open, editProfile, form]);

  const handleSubmit = async (values: FormValues) => {
    await upsertProfile.mutateAsync({
      id: isEditing ? editProfile!.id : undefined,
      name: values.name,
      host: values.host,
      port: values.port,
      username: values.username,
      authType: values.authType as AuthType,
      password: values.authType === "password" ? values.password : undefined,
      rememberPassword: values.authType === "password" ? values.rememberPassword : undefined,
      privateKeyPath: values.authType === "key" ? values.privateKeyPath : undefined,
      passphrase: values.authType === "key" ? values.passphrase : undefined,
      rememberPassphrase: values.authType === "key" ? values.rememberPassphrase : undefined,
      initialPath: values.initialPath || undefined,
    });
    onOpenChange(false);
  };

  const handleSelectKeyFile = useCallback(async () => {
    const selected = await openDialog({
      multiple: false,
      title: "Select private key",
      filters: [{ name: "All files", extensions: ["*"] }],
    });
    if (selected) {
      form.setValue("privateKeyPath", selected as string, { shouldValidate: true });
    }
  }, [form]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <SheetTitle className="text-sm">
            {isEditing ? "Edit connection" : "New connection"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {isEditing
              ? "Update your server connection settings"
              : "Add a new remote server connection"}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-4">
            <Form {...form}>
              <form
                id="connection-form"
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-5"
              >
                {/* AUTH_TYPE */}
                <FormField
                  control={form.control}
                  name="authType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-muted-foreground">Auth method</FormLabel>
                      <FormControl>
                        <AuthTypeSelector
                          value={field.value}
                          onChange={field.onChange}
                          disabled={upsertProfile.isPending}
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                {/* NAME */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-muted-foreground">Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="production-server"
                          {...field}
                          disabled={upsertProfile.isPending}
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                {/* HOST & PORT */}
                <div className="grid grid-cols-4 gap-3">
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem className="col-span-3">
                        <FormLabel className="text-sm text-muted-foreground">Host</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="192.168.1.100"
                            {...field}
                            disabled={upsertProfile.isPending}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm text-muted-foreground">Port</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={65535}
                            {...field}
                            onChange={(e) => field.onChange(e.target.valueAsNumber)}
                            disabled={upsertProfile.isPending}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                {/* USER */}
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-muted-foreground">Username</FormLabel>
                      <FormControl>
                        <Input placeholder="root" {...field} disabled={upsertProfile.isPending} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                {/* PASSWORD AUTH FIELDS */}
                {authType === "password" && (
                  <>
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm text-muted-foreground">
                            Password
                            {isEditing && editProfile?.passwordRef && (
                              <span className="ml-1.5 text-success text-xs">
                                (saved in keychain)
                              </span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <PasswordInput
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              placeholder={
                                isEditing ? "Leave empty to keep current" : "Enter SSH password"
                              }
                              disabled={upsertProfile.isPending}
                            />
                          </FormControl>
                          {isEditing && (
                            <FormDescription className="text-xs text-muted-foreground/70">
                              Leave empty to keep current password
                            </FormDescription>
                          )}
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="rememberPassword"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2.5 space-y-0 py-1">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={upsertProfile.isPending}
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal cursor-pointer text-muted-foreground">
                            Save to keychain
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* SSH_KEY AUTH FIELDS */}
                {authType === "key" && (
                  <>
                    <FormField
                      control={form.control}
                      name="privateKeyPath"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm text-muted-foreground">
                            Private key
                          </FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                placeholder="~/.ssh/id_rsa"
                                {...field}
                                disabled={upsertProfile.isPending}
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 shrink-0"
                                onClick={handleSelectKeyFile}
                                disabled={upsertProfile.isPending}
                              >
                                <FolderOpen className="h-4 w-4" />
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="passphrase"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm text-muted-foreground">
                            Passphrase
                            {isEditing && editProfile?.passphraseRef ? (
                              <span className="ml-1.5 text-success text-xs">
                                (saved in keychain)
                              </span>
                            ) : (
                              <span className="ml-1.5 text-muted-foreground/60">(optional)</span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <PasswordInput
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              placeholder={
                                isEditing ? "Leave empty to keep current" : "Key passphrase"
                              }
                              disabled={upsertProfile.isPending}
                            />
                          </FormControl>
                          {isEditing && editProfile?.passphraseRef && (
                            <FormDescription className="text-xs text-muted-foreground/70">
                              Leave empty to keep current passphrase
                            </FormDescription>
                          )}
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="rememberPassphrase"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2.5 space-y-0 py-1">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={upsertProfile.isPending}
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal cursor-pointer text-muted-foreground">
                            Save to keychain
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* INIT_PATH */}
                <FormField
                  control={form.control}
                  name="initialPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-muted-foreground">
                        Initial path
                        <span className="ml-1.5 text-muted-foreground/60">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="/home/user"
                          {...field}
                          disabled={upsertProfile.isPending}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-muted-foreground/70">
                        Default directory after connecting
                      </FormDescription>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
        </ScrollArea>

        <SheetFooter className="px-4 py-3 border-t border-border shrink-0">
          <div className="flex justify-end gap-3 w-full">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={upsertProfile.isPending}
              className="h-8 px-4"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="connection-form"
              size="sm"
              disabled={upsertProfile.isPending}
              className="h-8 px-5 gap-2"
            >
              {upsertProfile.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{isEditing ? "Save" : "Create"}</span>
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
