/**
 * File Manager Page
 * Supports Files/Terminal tab switching
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
} from "lucide-react";

import { FileListContainer } from "@/components/file-browser/FileListContainer";
import { DropZone } from "@/components/transfer/DropZone";
import { TransferQueue } from "@/components/transfer/TransferQueue";
import { Terminal } from "@/components/terminal";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSessionStatus } from "@/hooks/useSessionStatus";
import { useTransferEvents } from "@/hooks/useTransferEvents";
import { useTerminal } from "@/hooks/useTerminal";
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

/** Tab bar for switching between Files and Terminal */
function TabBar({
  activeTab,
  onTabChange,
  terminalStatus,
  isTerminalOpening,
  terminalInfo,
}: {
  activeTab: TabMode;
  onTabChange: (tab: TabMode) => void;
  terminalStatus: string;
  isTerminalOpening: boolean;
  terminalInfo: { terminalId: string } | null;
}) {
  return (
    <div className="flex items-center h-8 border-b border-border bg-card/30 shrink-0 px-1">
      {/* Tabs */}
      <Button
        variant="ghost"
        className={cn(
          "px-3 h-full rounded-none text-xs font-medium gap-1.5",
          activeTab === "files"
            ? "text-foreground border-b-2 border-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
        )}
        onClick={() => onTabChange("files")}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        Files
      </Button>
      <Button
        variant="ghost"
        className={cn(
          "px-3 h-full rounded-none text-xs font-medium gap-1.5",
          activeTab === "terminal"
            ? "text-foreground border-b-2 border-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
        )}
        onClick={() => onTabChange("terminal")}
      >
        <TerminalSquare className="h-3.5 w-3.5" />
        Terminal
        {terminalStatus === "connected" && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
      </Button>

      {/* Right side: terminal connection status */}
      <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground pr-2">
        {isTerminalOpening && (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-accent" />
            <span>Connecting...</span>
          </>
        )}
        {terminalInfo && terminalStatus === "connected" && (
          <span className="font-mono">{terminalInfo.terminalId.slice(0, 8)}</span>
        )}
        {terminalStatus === "error" && <span className="text-destructive">Connection error</span>}
      </div>
    </div>
  );
}

/** Main content area shared between Files and Terminal tabs */
function MainContent({
  sessionId,
  activeTab,
  sessionInfo,
  currentPath,
  onPathChange,
  onTabChange,
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
  sessionInfo: { homePath?: string } | null;
  currentPath: string;
  onPathChange: (path: string) => void;
  onTabChange: (tab: TabMode) => void;
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
      {/* Tab bar */}
      <TabBar
        activeTab={activeTab}
        onTabChange={onTabChange}
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
              initialPath={sessionInfo?.homePath ?? "/"}
              homePath={sessionInfo?.homePath}
              onPathChange={onPathChange}
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
                      <span className="text-xs text-muted-foreground">Opening terminal...</span>
                      <span className="text-[10px] text-muted-foreground/60">
                        Initializing terminal session
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <TerminalSquare className="h-10 w-10 text-muted-foreground/50" />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs text-muted-foreground">Terminal not connected</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openTerminal}
                        className="mt-2 text-xs"
                      >
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
  const [currentPath, setCurrentPath] = useState("/");

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

  // Active transfer count for collapsed sidebar badge
  const activeTransferCount = useTransferStore((s) => s.getActiveTasks().length);

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
    setCurrentPath(path);
  }, []);

  if (!sessionId || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">Initializing SFTP...</span>
          <span className="text-[10px] text-muted-foreground/60">
            Establishing secure connection
          </span>
        </div>
      </div>
    );
  }

  if (!isValid) {
    return null;
  }

  const isTerminalMode = activeTab === "terminal";

  const mainContentProps = {
    sessionId,
    activeTab,
    sessionInfo,
    currentPath,
    onPathChange: handlePathChange,
    onTabChange: setActiveTab,
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
            <div className="flex items-center justify-between px-3 h-10 border-b border-sidebar-border bg-sidebar">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-medium">Transfer queue</span>
              </div>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-primary/10 hover:text-primary"
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
        className="flex flex-col items-center gap-2 py-3 px-1 h-full border-l border-border/60 bg-sidebar shrink-0"
        style={{ width: COLLAPSED_SIDEBAR_WIDTH }}
      >
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

        {/* Collapsed state: Activity icon with active transfer badge */}
        <div className="flex flex-col items-center gap-1 mt-2">
          <div className="relative">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            {activeTransferCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-primary text-primary-foreground text-[9px] font-medium flex items-center justify-center px-0.5">
                {activeTransferCount}
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground [writing-mode:vertical-rl]">
            Queue
          </span>
        </div>
      </div>
    </div>
  );
}
