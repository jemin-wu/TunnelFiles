/**
 * 连接表单页面 - Minimalist Terminal Style
 * 简洁扁平的表单设计
 */

import { useEffect, useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, FolderOpen, Eye, EyeOff, Terminal, Key, KeyRound } from "lucide-react";
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
    name: z.string().min(1, "NAME_REQUIRED"),
    host: z.string().min(1, "HOST_REQUIRED"),
    port: z.number().int().min(1, "PORT_MIN_ERROR").max(65535, "PORT_MAX_ERROR"),
    username: z.string().min(1, "USER_REQUIRED"),
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
      message: "KEY_PATH_REQUIRED",
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
            ? "bg-background text-foreground shadow-sm border border-border/80 hover:bg-background"
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
      >
        <Key className="h-3.5 w-3.5" />
        <span>PASSWORD</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={() => onChange("key")}
        className={cn(
          "h-auto py-2 px-3 text-xs font-medium transition-all duration-200",
          value === "key"
            ? "bg-background text-foreground shadow-sm border border-border/80 hover:bg-background"
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
      >
        <KeyRound className="h-3.5 w-3.5" />
        <span>SSH_KEY</span>
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
      title: "SELECT_PRIVATE_KEY",
      filters: [{ name: "ALL_FILES", extensions: ["*"] }],
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
        <span className="text-xs text-muted-foreground">
          <span className="text-primary">&gt;</span> LOADING_PROFILE...
        </span>
      </div>
    );
  }

  if (isEditing && !profile && !isLoadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Terminal className="h-10 w-10 text-destructive" />
        <p className="text-xs text-muted-foreground">
          <span className="text-destructive">ERROR:</span> PROFILE_NOT_FOUND
        </p>
        <Button variant="outline" onClick={handleCancel} size="sm" className="text-xs">
          BACK_TO_LIST
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
                  <FormLabel className="text-xs text-muted-foreground">AUTH_METHOD</FormLabel>
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
                  <FormLabel className="text-xs text-muted-foreground">NAME</FormLabel>
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
                    <FormLabel className="text-xs text-muted-foreground">HOST</FormLabel>
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
                    <FormLabel className="text-xs text-muted-foreground">PORT</FormLabel>
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
                  <FormLabel className="text-xs text-muted-foreground">USER</FormLabel>
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
                      <FormLabel className="text-xs text-muted-foreground">PASSWORD</FormLabel>
                      <FormControl>
                        <PasswordInput
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder={isEditing ? "LEAVE_EMPTY_TO_KEEP" : "********"}
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
                        SAVE_TO_KEYCHAIN
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
                      <FormLabel className="text-xs text-muted-foreground">PRIVATE_KEY</FormLabel>
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
                        PASSPHRASE
                        <span className="ml-1.5 text-muted-foreground/60">(OPTIONAL)</span>
                      </FormLabel>
                      <FormControl>
                        <PasswordInput
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder="KEY_PASSPHRASE"
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
                        SAVE_TO_KEYCHAIN
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
                    INIT_PATH
                    <span className="ml-1.5 text-muted-foreground/60">(OPTIONAL)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="/home/user" {...field} disabled={upsertProfile.isPending} />
                  </FormControl>
                  <FormDescription className="text-[10px] text-muted-foreground/70">
                    DEFAULT_DIRECTORY_AFTER_CONNECT
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
                CANCEL
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={upsertProfile.isPending}
                className="text-xs h-9 px-5 btn-cyber gap-2"
              >
                {upsertProfile.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{isEditing ? "SAVE" : "CREATE"}</span>
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
