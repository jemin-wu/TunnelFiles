/**
 * Connections Page - Precision Engineering
 * Compact list with side sheet for add/edit, keyboard navigation
 */

import { useCallback, useRef, useState } from "react";
import { Plus, Loader2, Server } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ConnectionItem } from "@/components/connections/ConnectionItem";
import { ConnectionSheet } from "@/components/connections/ConnectionSheet";
import { PasswordDialog } from "@/components/connections/PasswordDialog";
import { HostKeyDialog } from "@/components/connections/HostKeyDialog";
import { cn } from "@/lib/utils";
import { useProfiles, useDeleteProfile } from "@/hooks/useProfiles";
import { useConnect } from "@/hooks/useConnect";
import type { Profile } from "@/types";

export function ConnectionsPage() {
  const { data: profiles = [], isLoading } = useProfiles();
  const deleteProfile = useDeleteProfile();

  // UI state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Connection flow
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

  // --- Handlers ---

  const handleAdd = useCallback(() => {
    setEditingProfile(null);
    setSheetOpen(true);
  }, []);

  const handleEdit = useCallback((profile: Profile) => {
    setEditingProfile(profile);
    setSheetOpen(true);
  }, []);

  const handleConnect = useCallback(
    async (profileId: string) => {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        await startConnect(profile);
      }
    },
    [profiles, startConnect]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!profileToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProfile.mutateAsync(profileToDelete.id);
    } finally {
      setIsDeleting(false);
      setProfileToDelete(null);
    }
  }, [deleteProfile, profileToDelete]);

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

  // --- Render ---

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading profiles...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div
        className={cn(
          "flex items-center justify-between px-4 h-9 shrink-0",
          "border-b border-border bg-card/30"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">SSH hosts</span>
          <span className="text-xs text-muted-foreground">
            {profiles.length === 0 ? "No connections" : `${profiles.length} connections`}
          </span>
        </div>
        <Button
          onClick={handleAdd}
          size="icon"
          variant="ghost"
          className="h-6 w-6 hover:bg-primary/10 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Connection list */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {profiles.length === 0 ? (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Server />
              </EmptyMedia>
              <EmptyTitle className="text-sm">No connections found</EmptyTitle>
              <EmptyDescription className="text-xs">
                Create your first remote server connection
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={handleAdd}
                variant="outline"
                className="gap-2 border-primary/50 hover:border-primary"
              >
                <Plus className="h-4 w-4" />
                <span>New connection</span>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ScrollArea className="h-full">
            <div ref={listRef} role="list" className="py-1">
              {profiles.map((profile, index) => (
                <ConnectionItem
                  key={profile.id}
                  profile={profile}
                  isConnecting={connectingProfileId === profile.id && isConnecting}
                  animationDelay={Math.min(index, 7) * 40}
                  onConnect={handleConnect}
                  onEdit={handleEdit}
                  onDelete={setProfileToDelete}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Connection Sheet (add/edit) */}
      <ConnectionSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditingProfile(null);
        }}
        editProfile={editingProfile}
      />

      {/* Delete confirmation */}
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
            <AlertDialogCancel disabled={isDeleting} className="h-8">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8"
            >
              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password dialog */}
      <PasswordDialog
        open={needPassword || needPassphrase}
        onOpenChange={() => {}}
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
