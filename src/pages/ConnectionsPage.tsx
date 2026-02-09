/**
 * Connections Page - Precision Engineering
 * Displays connection list with add, edit, delete, test, and connect actions
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, Zap, Pencil, Trash2, Plug, Key } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
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
import { PasswordDialog } from "@/components/connections/PasswordDialog";
import { HostKeyDialog } from "@/components/connections/HostKeyDialog";
import { RecentConnections } from "@/components/RecentConnections";
import { EmptyState } from "@/components/EmptyState";
import { formatRelativeTime } from "@/lib/file";
import { cn } from "@/lib/utils";
import { useProfiles, useDeleteProfile } from "@/hooks/useProfiles";
import { useConnect } from "@/hooks/useConnect";
import type { Profile } from "@/types";

export function ConnectionsPage() {
  const navigate = useNavigate();
  const { data: profiles = [], isLoading } = useProfiles();
  const deleteProfile = useDeleteProfile();
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const {
    isConnecting,
    connectingProfileId,
    needPassword,
    needPassphrase,
    hostKeyPayload,
    currentProfile,
    startConnect,
    submitCredentials,
    confirmHostKey,
    rejectHostKey,
    cancelConnect,
  } = useConnect();

  const handleAdd = useCallback(() => {
    navigate("/connections/new");
  }, [navigate]);

  const handleEdit = useCallback(
    (profileId: string) => {
      navigate(`/connections/${profileId}/edit`);
    },
    [navigate]
  );

  const handleDelete = useCallback(
    async (profileId: string) => {
      await deleteProfile.mutateAsync(profileId);
    },
    [deleteProfile]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!profileToDelete) return;
    setIsDeleting(true);
    try {
      await handleDelete(profileToDelete.id);
    } finally {
      setIsDeleting(false);
      setProfileToDelete(null);
    }
  }, [handleDelete, profileToDelete]);

  const handleConnect = useCallback(
    async (profileId: string) => {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        await startConnect(profile);
      }
    },
    [profiles, startConnect]
  );

  const handlePasswordSubmit = useCallback(
    (value: string) => {
      if (needPassword) {
        submitCredentials(value, undefined);
      } else if (needPassphrase) {
        submitCredentials(undefined, value);
      }
    },
    [needPassword, needPassphrase, submitCredentials]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Loading profiles...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/30">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">SSH hosts</span>
          <span className="text-xs text-muted-foreground">
            {profiles.length === 0 ? "No connections" : <>{profiles.length} connections</>}
          </span>
        </div>
        <Button
          onClick={handleAdd}
          size="icon"
          variant="ghost"
          className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Recent connections sidebar */}
        {profiles.length > 0 && (
          <aside className="w-56 border-r border-border bg-sidebar p-3 hidden lg:flex flex-col">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-sidebar-border">
              <Zap className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs font-medium">Quick access</span>
            </div>
            <div className="flex-1 overflow-auto">
              <RecentConnections
                onConnect={handleConnect}
                connectingId={isConnecting ? connectingProfileId : null}
              />
            </div>
          </aside>
        )}

        {/* Connection list */}
        <div className="flex-1 overflow-auto p-4">
          {profiles.length === 0 ? (
            <EmptyState
              icon="server"
              title="No connections found"
              description="Create your first remote server connection"
              action={
                <Button
                  onClick={handleAdd}
                  variant="outline"
                  className="gap-2 border-primary/50 hover:border-primary"
                >
                  <Plus className="h-4 w-4" />
                  <span>New connection</span>
                </Button>
              }
            />
          ) : (
            <div className="max-w-5xl rounded-md bg-card/30 overflow-hidden">
              <Table>
                <TableHeader className="bg-card/50 [&_tr]:border-0">
                  <TableRow className="border-0">
                    <TableHead className="pl-4">Name</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead className="hidden md:table-cell">Last active</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:border-0">
                  {profiles.map((profile, index) => {
                    const rowConnecting = connectingProfileId === profile.id && isConnecting;

                    return (
                      <TableRow
                        key={profile.id}
                        className={cn("animate-fade-in border-0", rowConnecting && "opacity-60")}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium truncate" title={profile.name}>
                              {profile.name}
                            </span>
                            {profile.authType === "key" && (
                              <Badge
                                variant="secondary"
                                className="h-5 gap-1 px-1.5 shrink-0 text-[10px] bg-primary/10 text-primary border-primary/30"
                              >
                                <Key className="h-3 w-3" />
                                SSH key
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell
                          className="font-mono text-xs text-muted-foreground max-w-[260px] truncate"
                          title={`${profile.username}@${profile.host}:${profile.port}`}
                        >
                          {profile.username}@{profile.host}:{profile.port}
                        </TableCell>

                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {formatRelativeTime(profile.updatedAt)}
                        </TableCell>

                        <TableCell className="pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                              onClick={() => handleEdit(profile.id)}
                              disabled={rowConnecting}
                              aria-label={`Edit ${profile.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setProfileToDelete(profile)}
                              disabled={rowConnecting}
                              aria-label={`Delete ${profile.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() => handleConnect(profile.id)}
                              disabled={rowConnecting}
                              size="sm"
                              className="gap-1.5 ml-1 text-xs"
                            >
                              {rowConnecting ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  <span className="hidden sm:inline">Connecting</span>
                                </>
                              ) : (
                                <>
                                  <Plug className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Connect</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={!!profileToDelete}
        onOpenChange={(open) => {
          if (!open) setProfileToDelete(null);
        }}
      >
        <AlertDialogContent className="border-destructive/30 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Confirm delete</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {profileToDelete ? `Delete "${profileToDelete.name}"?` : "Delete this connection?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="text-xs h-8">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs h-8"
            >
              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password dialog */}
      <PasswordDialog
        open={needPassword || needPassphrase}
        onOpenChange={(open) => {
          if (!open) cancelConnect();
        }}
        type={needPassphrase ? "passphrase" : "password"}
        hostInfo={currentProfile ? `${currentProfile.username}@${currentProfile.host}` : undefined}
        isConnecting={isConnecting}
        onSubmit={handlePasswordSubmit}
        onCancel={cancelConnect}
      />

      {/* HostKey confirmation dialog */}
      <HostKeyDialog
        open={!!hostKeyPayload}
        onOpenChange={() => {}}
        payload={hostKeyPayload}
        isProcessing={isConnecting}
        onTrust={confirmHostKey}
        onReject={rejectHostKey}
      />
    </div>
  );
}
