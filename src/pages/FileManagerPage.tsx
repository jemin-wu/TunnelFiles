/**
 * File Manager Page
 * Supports Files/Terminal tab switching with unified toolbar
 */

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Activity,
  FolderOpen,
  TerminalSquare,
  RefreshCw,
  Eye,
  EyeOff,
  FolderPlus,
  Upload,
} from "lucide-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FullPageLoader } from "@/components/ui/LoadingSpinner";

import { FileListContainer } from "@/components/file-browser/FileListContainer";
import { Breadcrumb } from "@/components/file-browser/Breadcrumb";
import { DropZone } from "@/components/transfer/DropZone";
import { TransferQueue } from "@/components/transfer/TransferQueue";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSessionStatus } from "@/hooks/useSessionStatus";
import { useTransferEvents } from "@/hooks/useTransferEvents";
import { useTerminal } from "@/hooks/useTerminal";
import { useTerminalDirectorySync } from "@/hooks/useTerminalDirectorySync";
import { useFileList } from "@/hooks/useFileList";
import { useSettings } from "@/hooks/useSettings";
import { useTransferStore } from "@/stores/useTransferStore";
import { cn } from "@/lib/utils";
import type { TerminalStatusPayload } from "@/types/terminal";

const Terminal = lazy(() => import("@/components/terminal").then((m) => ({ default: m.Terminal })));

type TabMode = "files" | "terminal";

const SIDEBAR_COLLAPSED_KEY = "tunnelfiles-sidebar-collapsed";
const COLLAPSED_SIDEBAR_WIDTH = 40;
const MIN_SIDEBAR_SIZE = 18;
const MAX_SIDEBAR_SIZE = 35;

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

/** Unified toolbar for Files and Terminal modes */
function PageToolbar({
  activeTab,
  onTabChange,
  // Files mode props
  currentPath,
  homePath,
  onNavigate,
  onValidatePath,
  fileCount,
  isFetching,
  onRefresh,
  showHidden,
  onToggleHidden,
  onCreateFolder,
  onUpload,
  // Terminal mode props
  terminalStatus,
  isTerminalOpening,
  isTerminalReconnecting,
  reconnectAttempt,
  maxReconnectAttempts,
  terminalInfo,
  onReconnect,
}: {
  activeTab: TabMode;
  onTabChange: (tab: TabMode) => void;
  currentPath: string;
  homePath?: string;
  onNavigate: (path: string) => void;
  onValidatePath?: (path: string) => Promise<boolean>;
  fileCount: number;
  isFetching: boolean;
  onRefresh: () => void;
  showHidden: boolean;
  onToggleHidden: () => void;
  onCreateFolder: () => void;
  onUpload: () => void;
  terminalStatus: string;
  isTerminalOpening: boolean;
  isTerminalReconnecting: boolean;
  reconnectAttempt: number | null;
  maxReconnectAttempts: number | null;
  terminalInfo: { terminalId: string } | null;
  onReconnect: () => void;
}) {
  return (
    <div className="border-border bg-card/30 flex h-9 shrink-0 items-center gap-1.5 border-b px-3">
      {activeTab === "files" ? (
        <>
          {/* Breadcrumb navigation */}
          <Breadcrumb
            path={currentPath}
            homePath={homePath}
            onNavigate={onNavigate}
            onValidatePath={onValidatePath}
            className="min-w-0 flex-1"
          />

          {/* File count */}
          <div className="text-muted-foreground hidden shrink-0 items-center text-xs tabular-nums sm:flex">
            <span>{fileCount} items</span>
          </div>

          <span className="bg-border hidden h-4 w-px sm:block" />

          {/* New folder */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="New folder"
                data-testid="new-folder-button"
                className="h-7 w-7"
                onClick={onCreateFolder}
              >
                <FolderPlus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">New folder</TooltipContent>
          </Tooltip>

          {/* Upload files */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Upload files"
                className="h-7 w-7"
                onClick={onUpload}
              >
                <Upload className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Upload files</TooltipContent>
          </Tooltip>

          {/* Refresh */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh"
                className="h-7 w-7"
                onClick={onRefresh}
                disabled={isFetching}
              >
                {isFetching ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Refresh</TooltipContent>
          </Tooltip>

          {/* Toggle hidden files */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={showHidden ? "Hide hidden files" : "Show hidden files"}
                className="h-7 w-7"
                onClick={onToggleHidden}
                aria-pressed={showHidden}
              >
                {showHidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {showHidden ? "Hide hidden files" : "Show hidden files"}
            </TooltipContent>
          </Tooltip>
        </>
      ) : (
        <>
          {/* Terminal mode: connection status info */}
          <div className="text-muted-foreground flex flex-1 items-center gap-2 text-xs">
            {isTerminalOpening && (
              <>
                <Loader2 className="text-primary size-3 animate-spin" />
                <span>Connecting...</span>
              </>
            )}
            {isTerminalReconnecting && (
              <>
                <Loader2 className="text-warning size-3 animate-spin" />
                <span>
                  Reconnecting...
                  {reconnectAttempt != null &&
                    maxReconnectAttempts != null &&
                    ` (${reconnectAttempt}/${maxReconnectAttempts})`}
                </span>
              </>
            )}
            {terminalInfo && terminalStatus === "connected" && (
              <span className="font-mono text-xs">{terminalInfo.terminalId.slice(0, 8)}</span>
            )}
            {terminalInfo && terminalStatus === "disconnected" && (
              <>
                <span className="text-muted-foreground">Disconnected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={onReconnect}
                >
                  <RefreshCw className="mr-1 size-3" />
                  Reconnect
                </Button>
              </>
            )}
            {terminalStatus === "error" && (
              <span className="text-destructive">Connection error</span>
            )}
          </div>
        </>
      )}

      {/* Separator before mode toggle */}
      <span className="bg-border h-4 w-px" />

      {/* Mode toggle icons */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Files"
            className={cn("h-7 w-7", activeTab === "files" && "bg-accent text-accent-foreground")}
            onClick={() => onTabChange("files")}
            aria-pressed={activeTab === "files"}
          >
            <FolderOpen className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Files</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Terminal"
            className={cn(
              "h-7 w-7",
              activeTab === "terminal" && "bg-accent text-accent-foreground"
            )}
            onClick={() => onTabChange("terminal")}
            aria-pressed={activeTab === "terminal"}
          >
            <TerminalSquare className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Terminal</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Main content area shared between Files and Terminal tabs */
function MainContent({
  sessionId,
  activeTab,
  currentPath,
  homePath,
  onPathChange,
  onValidatePath,
  onTabChange,
  showHidden,
  onToggleHidden,
  fileCount,
  isFetching,
  onRefresh,
  onCreateFolderRequest,
  onUploadRequest,
  createFolderOpen,
  onCreateFolderOpenChange,
  terminalInfo,
  terminalStatus,
  isTerminalOpening,
  isTerminalReconnecting,
  reconnectAttempt,
  maxReconnectAttempts,
  openTerminal,
  onReconnect,
  writeInput,
  resize,
  onTerminalStatusChange,
}: {
  sessionId: string;
  activeTab: TabMode;
  currentPath: string;
  homePath?: string;
  onPathChange: (path: string) => void;
  onValidatePath: (path: string) => Promise<boolean>;
  onTabChange: (tab: TabMode) => void;
  showHidden: boolean;
  onToggleHidden: () => void;
  fileCount: number;
  isFetching: boolean;
  onRefresh: () => void;
  onCreateFolderRequest: () => void;
  onUploadRequest: () => void;
  createFolderOpen: boolean;
  onCreateFolderOpenChange: (open: boolean) => void;
  terminalInfo: { terminalId: string } | null;
  terminalStatus: string;
  isTerminalOpening: boolean;
  isTerminalReconnecting: boolean;
  reconnectAttempt: number | null;
  maxReconnectAttempts: number | null;
  openTerminal: () => void;
  onReconnect: () => void;
  writeInput: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  onTerminalStatusChange: (payload: TerminalStatusPayload) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Unified toolbar */}
      <PageToolbar
        activeTab={activeTab}
        onTabChange={onTabChange}
        currentPath={currentPath}
        homePath={homePath}
        onNavigate={onPathChange}
        onValidatePath={onValidatePath}
        fileCount={fileCount}
        isFetching={isFetching}
        onRefresh={onRefresh}
        showHidden={showHidden}
        onToggleHidden={onToggleHidden}
        onCreateFolder={onCreateFolderRequest}
        onUpload={onUploadRequest}
        terminalStatus={terminalStatus}
        isTerminalOpening={isTerminalOpening}
        isTerminalReconnecting={isTerminalReconnecting}
        reconnectAttempt={reconnectAttempt}
        maxReconnectAttempts={maxReconnectAttempts}
        terminalInfo={terminalInfo}
        onReconnect={onReconnect}
      />

      {/* Tab content */}
      <div className="relative min-h-0 flex-1">
        {/* FILES Content - opacity toggle preserves scroll position and component state */}
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-200",
            activeTab === "files" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
          )}
        >
          <ErrorBoundary>
            <DropZone sessionId={sessionId} remotePath={currentPath} className="h-full">
              <FileListContainer
                sessionId={sessionId}
                currentPath={currentPath}
                onPathChange={onPathChange}
                showHidden={showHidden}
                createFolderOpen={createFolderOpen}
                onCreateFolderOpenChange={onCreateFolderOpenChange}
              />
            </DropZone>
          </ErrorBoundary>
        </div>

        {/* TERMINAL Content - opacity toggle preserves xterm instance state */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col transition-opacity duration-200",
            activeTab === "terminal" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
          )}
        >
          {/* Terminal content */}
          <div className="bg-background min-h-0 flex-1">
            {terminalInfo ? (
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="text-primary size-6 animate-spin" />
                    </div>
                  }
                >
                  <Terminal
                    terminalId={terminalInfo.terminalId}
                    onInput={writeInput}
                    onResize={resize}
                    onStatusChange={onTerminalStatusChange}
                  />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <div className="bg-background flex h-full flex-col items-center justify-center gap-4">
                {isTerminalOpening ? (
                  <>
                    <TerminalSquare className="text-primary size-10" />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-muted-foreground text-sm">Opening terminal...</span>
                      <span className="text-muted-foreground/60 text-xs">
                        Initializing terminal session
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <TerminalSquare className="text-muted-foreground/50 size-10" />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-muted-foreground text-sm">Terminal not connected</span>
                      <Button variant="outline" size="sm" onClick={openTerminal} className="mt-2">
                        <TerminalSquare className="size-3.5" />
                        Connect
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FileManagerPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [navigatedPath, setNavigatedPath] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  // Read mode from URL, default to files
  const activeTab = (searchParams.get("mode") as TabMode) || "files";
  const setActiveTab = useCallback(
    (mode: TabMode) => {
      setSearchParams((prev) => {
        if (mode === "files") {
          prev.delete("mode");
        } else {
          prev.set("mode", mode);
        }
        return prev;
      });
    },
    [setSearchParams]
  );

  const { sessionInfo, isValid, isLoading } = useSessionStatus(sessionId);
  useTransferEvents();

  // Derive currentPath: user-navigated path > session homePath > "/"
  const currentPath = navigatedPath ?? sessionInfo?.homePath ?? "/";

  // Active transfer count for collapsed sidebar badge
  const activeTransferCount = useTransferStore((s) => s.getActiveTasks().length);

  // File list for toolbar info (count, refresh, fetching state)
  // Only fetch when Files tab is active; TanStack Query cache serves stale data on re-mount
  const {
    files: rawFiles,
    isFetching,
    refetch,
  } = useFileList({
    sessionId: sessionId ?? "",
    path: currentPath,
    enabled: !!sessionId,
  });

  const fileCount = showHidden
    ? rawFiles.length
    : rawFiles.filter((f) => !f.name.startsWith(".")).length;

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const toggleHidden = useCallback(() => {
    setShowHidden((prev) => !prev);
  }, []);

  const handleCreateFolderRequest = useCallback(() => {
    setCreateFolderOpen(true);
  }, []);

  // Terminal hook - only initialize when sessionId exists
  const {
    terminalInfo,
    status: terminalStatus,
    isOpening: isTerminalOpening,
    isReconnecting: isTerminalReconnecting,
    reconnectAttempt,
    maxReconnectAttempts,
    open: openTerminal,
    reconnect: reconnectTerminal,
    writeInput,
    resize,
    setStatus: setTerminalStatus,
  } = useTerminal({ sessionId: sessionId ?? "" });

  // Terminal directory sync — auto-cd when file browser navigates
  const { settings } = useSettings();
  useTerminalDirectorySync({
    terminalId: terminalInfo?.terminalId ?? null,
    currentPath,
    terminalStatus,
    writeInput,
    enabled: settings.terminalFollowDirectory,
  });

  // Auto-open terminal when switching to Terminal tab
  useEffect(() => {
    if (activeTab === "terminal" && sessionId && !terminalInfo && !isTerminalOpening) {
      openTerminal();
    }
  }, [activeTab, sessionId, terminalInfo, isTerminalOpening, openTerminal]);

  // Keyboard shortcuts: Cmd+T toggle, Cmd+1 files, Cmd+2 terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modKey = e.metaKey || e.ctrlKey;

      if (modKey && e.key === "t") {
        e.preventDefault();
        // Toggle mode
        const currentMode = searchParams.get("mode") || "files";
        setActiveTab(currentMode === "files" ? "terminal" : "files");
      } else if (modKey && e.key === "1") {
        e.preventDefault();
        setActiveTab("files");
      } else if (modKey && e.key === "2") {
        e.preventDefault();
        setActiveTab("terminal");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchParams, setActiveTab]);

  // Handle terminal status changes (including reconnect attempt info)
  const handleTerminalStatusChange = useCallback(
    (payload: TerminalStatusPayload) => {
      setTerminalStatus(payload);
    },
    [setTerminalStatus]
  );

  useEffect(() => {
    if (!isLoading && !isValid) {
      navigate("/connections", { replace: true });
    }
  }, [isLoading, isValid, navigate]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const newValue = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue));
      return newValue;
    });
  }, []);

  const handlePathChange = useCallback((path: string) => {
    setNavigatedPath(path);
  }, []);

  const handleValidatePath = useCallback(
    async (path: string): Promise<boolean> => {
      if (!sessionId) return false;
      try {
        const { stat } = await import("@/lib/sftp");
        const entry = await stat(sessionId, path);
        return entry.isDir;
      } catch {
        return false;
      }
    },
    [sessionId]
  );

  const handleUploadRequest = useCallback(async () => {
    try {
      const { open: openFileDialog } = await import("@tauri-apps/plugin-dialog");
      const selected = await openFileDialog({
        multiple: true,
        title: "Select files to upload",
      });
      if (!selected || (Array.isArray(selected) && selected.length === 0)) return;

      const { uploadFile, getTransfer } = await import("@/lib/transfer");
      const addTask = useTransferStore.getState().addTask;
      const files = Array.isArray(selected) ? selected : [selected];

      const { showErrorToast } = await import("@/lib/error");
      let queued = 0;
      for (const localPath of files) {
        try {
          const taskId = await uploadFile(sessionId!, localPath, currentPath);
          const task = await getTransfer(taskId);
          if (task) addTask(task);
          queued++;
        } catch (err) {
          showErrorToast(err);
        }
      }
      if (queued > 0) {
        const { showSuccessToast } = await import("@/lib/error");
        showSuccessToast(`Uploading ${queued} file${queued > 1 ? "s" : ""}`);
      }
    } catch {
      // Dialog was cancelled by user — no action needed
    }
  }, [sessionId, currentPath]);

  if (!sessionId || isLoading) {
    return <FullPageLoader label="Initializing SFTP..." />;
  }

  if (!isValid) {
    return null;
  }

  const homePath = sessionInfo?.homePath;
  const isTerminalMode = activeTab === "terminal";

  const mainContentProps = {
    sessionId,
    activeTab,
    currentPath,
    homePath,
    onPathChange: handlePathChange,
    onValidatePath: handleValidatePath,
    onTabChange: setActiveTab,
    showHidden,
    onToggleHidden: toggleHidden,
    fileCount,
    isFetching,
    onRefresh: handleRefresh,
    onCreateFolderRequest: handleCreateFolderRequest,
    onUploadRequest: handleUploadRequest,
    createFolderOpen,
    onCreateFolderOpenChange: setCreateFolderOpen,
    terminalInfo,
    terminalStatus,
    isTerminalOpening,
    isTerminalReconnecting,
    reconnectAttempt,
    maxReconnectAttempts,
    openTerminal,
    onReconnect: reconnectTerminal,
    writeInput,
    resize,
    onTerminalStatusChange: handleTerminalStatusChange,
  };

  // Terminal mode: full width, no sidebar
  if (isTerminalMode) {
    return (
      <div className="h-full">
        <MainContent {...mainContentProps} />
      </div>
    );
  }

  // Files mode with expanded sidebar: resizable panels
  if (!sidebarCollapsed) {
    return (
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel id="main-panel" defaultSize={75} minSize={55} maxSize={82}>
          <MainContent {...mainContentProps} />
        </ResizablePanel>

        <ResizableHandle
          withHandle
          className="bg-border/50 hover:bg-primary/30 transition-colors duration-100"
        />

        <ResizablePanel
          id="sidebar-panel"
          defaultSize={25}
          minSize={MIN_SIDEBAR_SIZE}
          maxSize={MAX_SIDEBAR_SIZE}
        >
          <div className="border-border bg-sidebar flex h-full flex-col border-l">
            {/* Sidebar header */}
            <div className="border-sidebar-border bg-sidebar flex h-9 items-center justify-between border-b px-3">
              <div className="flex items-center gap-2">
                <Activity className="text-primary size-3.5" />
                <span className="text-sm font-semibold">Transfer queue</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Collapse panel"
                    className="h-7 w-7"
                    onClick={toggleSidebar}
                  >
                    <PanelRightClose className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  Collapse panel
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Transfer queue content */}
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <ErrorBoundary>
                <TransferQueue className="h-full" />
              </ErrorBoundary>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  // Files mode with collapsed sidebar: fixed width sidebar
  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">
        <MainContent {...mainContentProps} />
      </div>

      {/* Collapsed sidebar - fixed width */}
      <div
        className="border-border/60 bg-sidebar flex h-full shrink-0 flex-col items-center border-l"
        style={{ width: COLLAPSED_SIDEBAR_WIDTH }}
      >
        {/* Top bar aligned with toolbar h-9 */}
        <div className="border-border flex h-9 w-full shrink-0 items-center justify-center border-b">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Expand transfer queue"
                className="h-7 w-7"
                onClick={toggleSidebar}
              >
                <PanelRightOpen className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              Expand transfer queue
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Collapsed state: Activity icon with active transfer badge */}
        <div className="mt-3 flex flex-col items-center gap-1">
          <div className="relative">
            <Activity className="text-muted-foreground size-3.5" />
            {activeTransferCount > 0 && (
              <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-xs leading-none font-medium">
                {activeTransferCount}
              </span>
            )}
          </div>
          <span className="text-muted-foreground text-xs [writing-mode:vertical-rl]">Queue</span>
        </div>
      </div>
    </div>
  );
}
