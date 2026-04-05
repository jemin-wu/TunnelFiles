/**
 * Connections Page — Polanyi Tacit Knowledge Design
 *
 * Frequency-driven visual hierarchy:
 *   Hot (large tiles)  → daily drivers, spatial muscle memory
 *   Warm (standard rows) → used this week
 *   Cool (compact rows) → rarely used, peripheral awareness
 *
 * Global type-ahead: start typing anywhere to filter
 * Dimming filter: non-matches fade but stay in place (spatial stability)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Loader2, Server, Search, X } from "lucide-react";

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
import { HotConnectionTile } from "@/components/connections/HotConnectionTile";
import { ConnectionItem } from "@/components/connections/ConnectionItem";
import { CoolConnectionRow } from "@/components/connections/CoolConnectionRow";
import { ConnectionSheet } from "@/components/connections/ConnectionSheet";
import { PasswordDialog } from "@/components/connections/PasswordDialog";
import { HostKeyDialog } from "@/components/connections/HostKeyDialog";
import { useProfiles, useDeleteProfile } from "@/hooks/useProfiles";
import { useRecentConnections } from "@/hooks/useRecentConnections";
import { useConnect } from "@/hooks/useConnect";
import { formatRelativeTime } from "@/lib/file";
import type { Profile, RecentConnection } from "@/types";

type SortOption = "recent" | "alpha";

const SORT_FNS: Record<SortOption, (a: Profile, b: Profile) => number> = {
  alpha: (a, b) => a.name.localeCompare(b.name),
  recent: (a, b) => b.updatedAt - a.updatedAt,
};

/** Classify profiles into hot/warm/cool based on recent connection data */
function classifyProfiles(
  profiles: Profile[],
  recentConnections: RecentConnection[],
  sortFn: (a: Profile, b: Profile) => number
) {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const WEEK = 7 * DAY;

  // Build recency map: profileId → connectedAt
  const recencyMap = new Map<string, number>();
  for (const rc of recentConnections) {
    recencyMap.set(rc.profileId, rc.connectedAt);
  }

  const hot: Profile[] = [];
  const warm: Profile[] = [];
  const cool: Profile[] = [];

  for (const p of profiles) {
    const connectedAt = recencyMap.get(p.id);
    if (connectedAt && now - connectedAt < DAY) {
      hot.push(p);
    } else if (connectedAt && now - connectedAt < WEEK) {
      warm.push(p);
    } else {
      cool.push(p);
    }
  }

  // Sort each zone: hot by most recent connection, warm/cool by user's sort choice
  hot.sort((a, b) => (recencyMap.get(b.id) ?? 0) - (recencyMap.get(a.id) ?? 0));
  warm.sort(sortFn);
  cool.sort(sortFn);

  // Cap hot at 2 tiles for the grid layout
  if (hot.length > 2) {
    warm.push(...hot.splice(2));
    warm.sort(sortFn);
  }

  return { hot, warm, cool, recencyMap };
}

/** Check if a profile matches the search query */
function matchesQuery(profile: Profile, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    profile.name.toLowerCase().includes(q) ||
    profile.host.toLowerCase().includes(q) ||
    profile.username.toLowerCase().includes(q)
  );
}

export function ConnectionsPage() {
  const { data: profiles = [], isLoading } = useProfiles();
  const { data: recentConnections = [] } = useRecentConnections(10);
  const deleteProfile = useDeleteProfile();

  // UI state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("recent");
  const [query, setQuery] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Classify profiles into frequency zones
  const sortFn = useMemo(() => SORT_FNS[sortOption], [sortOption]);
  // hourBucket forces reclassification when connections cross the day/week boundary
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  const { hot, warm, cool, recencyMap } = useMemo(
    () => classifyProfiles(profiles, recentConnections, sortFn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, recentConnections, sortFn, hourBucket]
  );

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

  // --- Global type-ahead: start typing anywhere to auto-focus search ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target === searchInputRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        setQuery("");
        searchInputRef.current?.blur();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        e.key.length === 1 &&
        !target?.closest?.("[role='dialog'],[role='alertdialog']") &&
        !target?.isContentEditable
      ) {
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  // --- Render helpers ---

  /** Wrapper that applies dimming for non-matching items during search */
  const dimClass = (profile: Profile) =>
    query && !matchesQuery(profile, query)
      ? "pointer-events-none opacity-[0.08] transition-opacity duration-150"
      : "transition-opacity duration-150";

  // --- Render ---

  if (isLoading) {
    return <FullPageLoader label="Loading profiles..." />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search + sort toolbar */}
      {profiles.length > 0 && (
        <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  searchInputRef.current?.blur();
                }
                if (e.key === "Enter" && query) {
                  // Connect to first visible match
                  const allProfiles = [...hot, ...warm, ...cool];
                  const firstMatch = allProfiles.find((p) => matchesQuery(p, query));
                  if (firstMatch) handleConnect(firstMatch.id);
                }
              }}
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

      {/* Connection list with frequency zones */}
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
        ) : (
          <ScrollArea className="h-full">
            {/* HOT ZONE — daily drivers, 2-column grid */}
            {hot.length > 0 && (
              <div className="p-3">
                <div
                  className="grid grid-cols-2 gap-1.5"
                  role="list"
                  aria-label="Frequently used connections"
                >
                  {hot.map((profile) => (
                    <div key={profile.id} className={dimClass(profile)}>
                      <HotConnectionTile
                        profile={profile}
                        isConnecting={connectingProfileId === profile.id && isConnecting}
                        recencyLabel={
                          recencyMap.get(profile.id)
                            ? formatRelativeTime(recencyMap.get(profile.id)!)
                            : undefined
                        }
                        onConnect={handleConnect}
                        onEdit={handleEdit}
                        onDelete={setProfileToDelete}
                      />
                    </div>
                  ))}
                </div>
                {(warm.length > 0 || cool.length > 0) && (
                  <div className="border-border/60 mt-2 border-t" />
                )}
              </div>
            )}

            {/* WARM ZONE — standard ConnectionItem rows */}
            {warm.length > 0 && (
              <div className="space-y-0.5 px-3 pb-1" role="list" aria-label="Recent connections">
                {warm.map((profile, index) => (
                  <div key={profile.id} className={dimClass(profile)}>
                    <ConnectionItem
                      profile={profile}
                      isConnecting={connectingProfileId === profile.id && isConnecting}
                      animationDelay={Math.min(index, 7) * 40}
                      onConnect={handleConnect}
                      onEdit={handleEdit}
                      onDelete={setProfileToDelete}
                    />
                  </div>
                ))}
                {cool.length > 0 && <div className="border-border/60 mt-1.5 border-t" />}
              </div>
            )}

            {/* COOL ZONE — compact rows for rarely used */}
            {cool.length > 0 && (
              <div className="space-y-0.5 px-3 pb-1" role="list" aria-label="Other connections">
                {cool.map((profile) => (
                  <div key={profile.id} className={dimClass(profile)}>
                    <CoolConnectionRow
                      profile={profile}
                      isConnecting={connectingProfileId === profile.id && isConnecting}
                      onConnect={handleConnect}
                      onEdit={handleEdit}
                      onDelete={setProfileToDelete}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Add connection button at end of list */}
            <div className="px-3 pb-3">
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
