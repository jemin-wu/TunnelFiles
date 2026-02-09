/**
 * File Manager Page
 * Supports Files/Terminal tab switching with unified toolbar
 */

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";

import { FileListContainer } from "@/components/file-browser/FileListContainer";
import { Breadcrumb } from "@/components/file-browser/Breadcrumb";
import { DropZone } from "@/components/transfer/DropZone";
import { TransferQueue } from "@/components/transfer/TransferQueue";
import { Terminal } from "@/components/terminal";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSessionStatus } from "@/hooks/useSessionStatus";
import { useTransferEvents } from "@/hooks/useTransferEvents";
import { useTerminal } from "@/hooks/useTerminal";
import { useFileList } from "@/hooks/useFileList";
import { useTransferStore } from "@/stores/useTransferStore";
import { cn } from "@/lib/utils";
import type { TerminalStatusPayload } from "@/types/terminal";

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
  fileCount,
  isFetching,
  onRefresh,
  showHidden,
  onToggleHidden,
  onCreateFolder,
  // Terminal mode props
  terminalStatus,
  isTerminalOpening,
  terminalInfo,
}: {
  activeTab: TabMode;
  onTabChange: (tab: TabMode) => void;
  currentPath: string;
  homePath?: string;
  onNavigate: (path: string) => void;
  fileCount: number;
  isFetching: boolean;
  onRefresh: () => void;
  showHidden: boolean;
  onToggleHidden: () => void;
  onCreateFolder: () => void;
  terminalStatus: string;
  isTerminalOpening: boolean;
  terminalInfo: { terminalId: string } | null;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 h-9 border-b border-border bg-card/30 shrink-0">
      {activeTab === "files" ? (
        <>
          {/* Breadcrumb navigation */}
          <Breadcrumb
            path={currentPath}
            homePath={homePath}
            onNavigate={onNavigate}
            className="flex-1 min-w-0"
          />

          {/* File count */}
          <div className="hidden sm:flex items-center text-xs text-muted-foreground tabular-nums shrink-0">
            <span>{fileCount} items</span>
          </div>

          <span className="hidden sm:block w-px h-4 bg-border" />

          <TooltipProvider delayDuration={300}>
            {/* New folder */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                  onClick={onCreateFolder}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">New folder</TooltipContent>
            </Tooltip>

            {/* Refresh */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                  onClick={onRefresh}
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
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
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                  onClick={onToggleHidden}
                  aria-pressed={showHidden}
                >
                  {showHidden ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {showHidden ? "Hide hidden files" : "Show hidden files"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      ) : (
        <>
          {/* Terminal mode: connection status info */}
          <div className="flex-1 flex items-center gap-2 text-xs text-muted-foreground">
            {isTerminalOpening && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-accent" />
                <span>Connecting...</span>
              </>
            )}
            {terminalInfo && terminalStatus === "connected" && (
              <span className="font-mono text-xs">{terminalInfo.terminalId.slice(0, 8)}</span>
            )}
            {terminalStatus === "error" && (
              <span className="text-destructive">Connection error</span>
            )}
          </div>
        </>
      )}

      {/* Separator before mode toggle */}
      <span className="w-px h-4 bg-border" />

      {/* Mode toggle icons */}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 hover:bg-primary/10 hover:text-primary",
                activeTab === "files" && "bg-primary/10 text-primary"
              )}
              onClick={() => onTabChange("files")}
              aria-pressed={activeTab === "files"}
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Files</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 hover:bg-primary/10 hover:text-primary",
                activeTab === "terminal" && "bg-primary/10 text-primary"
              )}
              onClick={() => onTabChange("terminal")}
              aria-pressed={activeTab === "terminal"}
            >
              <TerminalSquare className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Terminal</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
  onTabChange,
  showHidden,
  onToggleHidden,
  fileCount,
  isFetching,
  onRefresh,
  onCreateFolderRequest,
  createFolderOpen,
  onCreateFolderOpenChange,
  terminalInfo,
  terminalStatus,
  isTerminalOpening,
  openTerminal,
  writeInput,
  resize,
  onTerminalStatusChange,
}: {
  sessionId: string;
  activeTab: TabMode;
  currentPath: string;
  homePath?: string;
  onPathChange: (path: string) => void;
  onTabChange: (tab: TabMode) => void;
  showHidden: boolean;
  onToggleHidden: () => void;
  fileCount: number;
  isFetching: boolean;
  onRefresh: () => void;
  onCreateFolderRequest: () => void;
  createFolderOpen: boolean;
  onCreateFolderOpenChange: (open: boolean) => void;
  terminalInfo: { terminalId: string } | null;
  terminalStatus: string;
  isTerminalOpening: boolean;
  openTerminal: () => void;
  writeInput: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  onTerminalStatusChange: (payload: TerminalStatusPayload) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Unified toolbar */}
      <PageToolbar
        activeTab={activeTab}
        onTabChange={onTabChange}
        currentPath={currentPath}
        homePath={homePath}
        onNavigate={onPathChange}
        fileCount={fileCount}
        isFetching={isFetching}
        onRefresh={onRefresh}
        showHidden={showHidden}
        onToggleHidden={onToggleHidden}
        onCreateFolder={onCreateFolderRequest}
        terminalStatus={terminalStatus}
        isTerminalOpening={isTerminalOpening}
        terminalInfo={terminalInfo}
      />

      {/* Tab content */}
      <div className="flex-1 min-h-0 relative">
        {/* FILES Content */}
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-200",
            activeTab === "files" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          )}
        >
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
        </div>

        {/* TERMINAL Content */}
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-200 flex flex-col",
            activeTab === "terminal" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          )}
        >
          {/* Terminal content */}
          <div className="flex-1 min-h-0">
            {terminalInfo ? (
              <Terminal
                terminalId={terminalInfo.terminalId}
                onInput={writeInput}
                onResize={resize}
                onStatusChange={onTerminalStatusChange}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 bg-background">
                {isTerminalOpening ? (
                  <>
                    <TerminalSquare className="h-10 w-10 text-accent" />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-sm text-muted-foreground">Opening terminal...</span>
                      <span className="text-xs text-muted-foreground/60">
                        Initializing terminal session
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <TerminalSquare className="h-10 w-10 text-muted-foreground/50" />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-sm text-muted-foreground">Terminal not connected</span>
                      <Button variant="outline" size="sm" onClick={openTerminal} className="mt-2">
                        <TerminalSquare className="h-3.5 w-3.5 mr-1.5" />
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
    open: openTerminal,
    writeInput,
    resize,
    setStatus: setTerminalStatus,
  } = useTerminal({ sessionId: sessionId ?? "" });

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

  // Handle terminal status changes
  const handleTerminalStatusChange = useCallback(
    (payload: TerminalStatusPayload) => {
      setTerminalStatus(payload.status);
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

  if (!sessionId || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm text-muted-foreground">Initializing SFTP...</span>
          <span className="text-xs text-muted-foreground/60">Establishing secure connection</span>
        </div>
      </div>
    );
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
    onTabChange: setActiveTab,
    showHidden,
    onToggleHidden: toggleHidden,
    fileCount,
    isFetching,
    onRefresh: handleRefresh,
    onCreateFolderRequest: handleCreateFolderRequest,
    createFolderOpen,
    onCreateFolderOpenChange: setCreateFolderOpen,
    terminalInfo,
    terminalStatus,
    isTerminalOpening,
    openTerminal,
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
          className="bg-border/50 hover:bg-primary/30 transition-colors"
        />

        <ResizablePanel
          id="sidebar-panel"
          defaultSize={25}
          minSize={MIN_SIDEBAR_SIZE}
          maxSize={MAX_SIDEBAR_SIZE}
        >
          <div className="flex flex-col h-full border-l border-border bg-sidebar">
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-3 h-9 border-b border-sidebar-border bg-sidebar">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-accent" />
                <span className="text-sm font-medium">Transfer queue</span>
              </div>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                      onClick={toggleSidebar}
                    >
                      <PanelRightClose className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    Collapse panel
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Transfer queue content */}
            <div className="flex-1 min-h-0">
              <TransferQueue className="h-full" />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  // Files mode with collapsed sidebar: fixed width sidebar
  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0">
        <MainContent {...mainContentProps} />
      </div>

      {/* Collapsed sidebar - fixed width */}
      <div
        className="flex flex-col items-center h-full border-l border-border/60 bg-sidebar shrink-0"
        style={{ width: COLLAPSED_SIDEBAR_WIDTH }}
      >
        {/* Top bar aligned with toolbar h-9 */}
        <div className="flex items-center justify-center h-9 w-full shrink-0 border-b border-border">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                  onClick={toggleSidebar}
                >
                  <PanelRightOpen className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                Expand transfer queue
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Collapsed state: Activity icon with active transfer badge */}
        <div className="flex flex-col items-center gap-1 mt-3">
          <div className="relative">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            {activeTransferCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center px-0.5 leading-none">
                {activeTransferCount}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground [writing-mode:vertical-rl]">Queue</span>
        </div>
      </div>
    </div>
  );
}
