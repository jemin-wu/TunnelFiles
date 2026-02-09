/**
 * Connection Form Page - Precision Engineering
 * Add/edit connection configuration
 */

import { useEffect, useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, FolderOpen, Eye, EyeOff, Key, KeyRound } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useProfile, useUpsertProfile } from "@/hooks/useProfiles";
import type { AuthType } from "@/types";

interface PasswordInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function PasswordInput({ value, onChange, placeholder, disabled, className }: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("pr-10", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent hover:text-primary"
        onClick={() => setShow(!show)}
        tabIndex={-1}
      >
        {show ? (
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}

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
          "h-auto py-2 px-3 text-xs font-medium transition-all duration-200",
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
          "h-auto py-2 px-3 text-xs font-medium transition-all duration-200",
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

export function ConnectionFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const { data: profile, isLoading: isLoadingProfile } = useProfile(id);
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

  useEffect(() => {
    if (isEditing && profile) {
      form.reset({
        authType: profile.authType,
        name: profile.name,
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password: "",
        rememberPassword: !!profile.passwordRef,
        privateKeyPath: profile.privateKeyPath ?? "",
        passphrase: "",
        rememberPassphrase: !!profile.passphraseRef,
        initialPath: profile.initialPath ?? "",
      });
    }
  }, [isEditing, profile, form]);

  const handleSubmit = async (values: FormValues) => {
    await upsertProfile.mutateAsync({
      id: isEditing ? id : undefined,
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
    navigate("/connections");
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

  const handleCancel = useCallback(() => {
    navigate("/connections");
  }, [navigate]);

  if (isEditing && isLoadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Loading profile...</span>
      </div>
    );
  }

  if (isEditing && !profile && !isLoadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-muted-foreground">Profile not found</p>
        <Button variant="outline" onClick={handleCancel} size="sm" className="text-xs">
          Back to list
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-md mx-auto py-8 px-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            {/* AUTH_TYPE */}
            <FormField
              control={form.control}
              name="authType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">Auth method</FormLabel>
                  <FormControl>
                    <AuthTypeSelector
                      value={field.value}
                      onChange={field.onChange}
                      disabled={upsertProfile.isPending}
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            {/* NAME */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="production-server"
                      {...field}
                      disabled={upsertProfile.isPending}
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
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
                    <FormLabel className="text-xs text-muted-foreground">Host</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="192.168.1.100"
                        {...field}
                        disabled={upsertProfile.isPending}
                      />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Port</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        {...field}
                        disabled={upsertProfile.isPending}
                      />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
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
                  <FormLabel className="text-xs text-muted-foreground">Username</FormLabel>
                  <FormControl>
                    <Input placeholder="root" {...field} disabled={upsertProfile.isPending} />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
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
                      <FormLabel className="text-xs text-muted-foreground">Password</FormLabel>
                      <FormControl>
                        <PasswordInput
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder={isEditing ? "Leave empty to keep current" : "********"}
                          disabled={upsertProfile.isPending}
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
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
                      <FormLabel className="text-xs font-normal cursor-pointer text-muted-foreground">
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
                      <FormLabel className="text-xs text-muted-foreground">Private key</FormLabel>
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
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="passphrase"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        Passphrase
                        <span className="ml-1.5 text-muted-foreground/60">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <PasswordInput
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder="Key passphrase"
                          disabled={upsertProfile.isPending}
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
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
                      <FormLabel className="text-xs font-normal cursor-pointer text-muted-foreground">
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
                  <FormLabel className="text-xs text-muted-foreground">
                    Initial path
                    <span className="ml-1.5 text-muted-foreground/60">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="/home/user" {...field} disabled={upsertProfile.isPending} />
                  </FormControl>
                  <FormDescription className="text-[10px] text-muted-foreground/70">
                    Default directory after connecting
                  </FormDescription>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            {/* ACTIONS */}
            <div className="flex justify-end gap-3 pt-5 mt-6 border-t border-border/50">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={upsertProfile.isPending}
                className="text-xs h-9 px-4"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={upsertProfile.isPending}
                className="text-xs h-9 px-5 gap-2"
              >
                {upsertProfile.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{isEditing ? "Save" : "Create"}</span>
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
