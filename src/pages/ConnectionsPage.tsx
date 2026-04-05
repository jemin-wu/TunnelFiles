/**
 * Connections Page - Precision Engineering
 * Card-based connection list with single-click connect
 */

import { useCallback, useMemo, useState } from "react";
import { Plus, Loader2, Server, Search, X, Clock, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FullPageLoader } from "@/components/ui/LoadingSpinner";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useProfiles, useDeleteProfile } from "@/hooks/useProfiles";
import { useRecentConnections } from "@/hooks/useRecentConnections";
import { useConnect } from "@/hooks/useConnect";
import { useSearchFilter } from "@/hooks/useSearchFilter";
import type { Profile } from "@/types";

type SortOption = "alpha" | "recent";

const SORT_FNS: Record<SortOption, (a: Profile, b: Profile) => number> = {
  alpha: (a, b) => a.name.localeCompare(b.name),
  recent: (a, b) => b.updatedAt - a.updatedAt,
};

const SEARCH_FIELDS = (p: Profile) => [p.name, p.host, p.username];

export function ConnectionsPage() {
  const { data: profiles = [], isLoading } = useProfiles();
  const { data: recentConnections = [] } = useRecentConnections(5);
  const deleteProfile = useDeleteProfile();

  // UI state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("recent");

  // Search + sort
  const sortFn = useMemo(() => SORT_FNS[sortOption], [sortOption]);
  const { query, setQuery, filtered } = useSearchFilter({
    items: profiles,
    searchFields: SEARCH_FIELDS,
    sortFn,
  });

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
    return <FullPageLoader label="Loading profiles..." />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search + sort toolbar — only when profiles exist */}
      {profiles.length > 0 && (
        <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search connections..."
              className="bg-muted/50 border-border h-8 pr-8 pl-8 text-sm"
              aria-label="Search connections"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
            <SelectTrigger
              className="bg-muted/50 border-border h-8 w-[130px] text-xs"
              aria-label="Sort connections"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="alpha">A — Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Connection list */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {profiles.length === 0 ? (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Server />
              </EmptyMedia>
              <EmptyTitle>No connections yet</EmptyTitle>
              <EmptyDescription>Add a remote server to get started</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={handleAdd}
                size="sm"
                className="gap-2"
                data-testid="add-connection-button"
              >
                <Plus className="size-3.5" />
                <span>New connection</span>
              </Button>
            </EmptyContent>
          </Empty>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-muted-foreground text-sm">No matching connections</p>
            <Button variant="ghost" size="sm" onClick={() => setQuery("")} className="text-xs">
              Clear search
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            {/* Recent connections — hidden when searching */}
            {recentConnections.length > 0 && !query && (
              <div className="px-3 pt-3 pb-1">
                <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                  <Clock className="size-3" />
                  Recent
                </div>
                <div className="space-y-0.5" role="list" aria-label="Recent connections">
                  {recentConnections.map((rc) => (
                    <div
                      key={rc.id}
                      role="listitem"
                      tabIndex={0}
                      onClick={() => handleConnect(rc.profileId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleConnect(rc.profileId);
                        }
                      }}
                      className="group hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-ring/50 flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors duration-100 focus-visible:ring-1 focus-visible:outline-none"
                    >
                      <div className="min-w-0 flex-1">
                        <span
                          className="text-foreground block truncate text-sm"
                          title={rc.profileName}
                        >
                          {rc.profileName}
                        </span>
                        <span
                          className="text-muted-foreground block truncate font-mono text-xs"
                          title={`${rc.username}@${rc.host}`}
                        >
                          {rc.username}@{rc.host}
                        </span>
                      </div>
                      <ArrowRight className="text-muted-foreground size-3 shrink-0 opacity-0 transition-opacity duration-100 group-hover:opacity-100" />
                    </div>
                  ))}
                </div>
                <div className="border-border/60 mt-2 border-t" />
              </div>
            )}

            <div className="space-y-1.5 p-3" role="list" aria-label="Saved connections">
              {filtered.map((profile, index) => (
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

              {/* Add connection button at end of list */}
              <Button
                variant="ghost"
                onClick={handleAdd}
                data-testid="add-connection-button"
                className="border-border/60 text-muted-foreground hover:border-primary/40 mt-1 h-10 w-full gap-2 border border-dashed text-xs"
              >
                <Plus className="size-3.5" />
                New connection
              </Button>
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
            <AlertDialogTitle>Confirm delete</AlertDialogTitle>
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
              {isDeleting ? <Loader2 className="size-3 animate-spin" /> : "Delete"}
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
