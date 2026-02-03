/**
 * 文件管理页面 - Cyberpunk Terminal Style
 * 支持 Files/Terminal Tab 切换
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  HardDrive,
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
import { cn } from "@/lib/utils";
import type { TerminalStatusPayload } from "@/types/terminal";

type TabMode = "files" | "terminal";

const SIDEBAR_COLLAPSED_KEY = "tunnelfiles-sidebar-collapsed";
const MIN_SIDEBAR_SIZE = 18;
const MAX_SIDEBAR_SIZE = 35;

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

export function FileManagerPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [currentPath, setCurrentPath] = useState("/");
  const [activeTab, setActiveTab] = useState<TabMode>("files");

  const { sessionInfo, isValid, isLoading } = useSessionStatus(sessionId);
  useTransferEvents();

  // Terminal hook - 仅在有 sessionId 时初始化
  const {
    terminalInfo,
    status: terminalStatus,
    isOpening: isTerminalOpening,
    open: openTerminal,
    writeInput,
    resize,
    setStatus: setTerminalStatus,
  } = useTerminal({ sessionId: sessionId ?? "" });

  // 切换到 Terminal tab 时自动打开终端
  useEffect(() => {
    if (activeTab === "terminal" && sessionId && !terminalInfo && !isTerminalOpening) {
      openTerminal();
    }
  }, [activeTab, sessionId, terminalInfo, isTerminalOpening, openTerminal]);

  // 键盘快捷键: ⌘T 切换, ⌘1 文件, ⌘2 终端
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modKey = e.metaKey || e.ctrlKey;

      if (modKey && e.key === "t") {
        e.preventDefault();
        setActiveTab((prev) => (prev === "files" ? "terminal" : "files"));
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
  }, []);

  // 处理终端状态变化
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
        <div className="relative">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="absolute inset-0 h-10 w-10 animate-ping opacity-20 rounded-full bg-primary" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground font-mono">
            <span className="text-primary">&gt;</span> INITIALIZING_SFTP...
          </span>
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
  const mainPanelSize = isTerminalMode ? 100 : sidebarCollapsed ? 96 : 75;
  const sidebarPanelSize = sidebarCollapsed ? 4 : 25;

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* 主内容区 - Files/Terminal Tab (75%) */}
      <ResizablePanel
        id="main-panel"
        defaultSize={mainPanelSize}
        minSize={55}
        maxSize={isTerminalMode ? 100 : sidebarCollapsed ? 97 : 82}
      >
        <div className="flex flex-col h-full">
          {/* Tab Content */}
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
                  onPathChange={handlePathChange}
                  onSwitchToTerminal={() => setActiveTab("terminal")}
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
              {/* Terminal 工具栏 */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/50">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                        onClick={() => setActiveTab("files")}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="font-mono text-xs">
                      切换到文件浏览 (⌘1)
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <span className="text-border">│</span>

                <div className="flex items-center gap-1.5">
                  <TerminalSquare className="h-3.5 w-3.5 text-accent" />
                  <span className="text-xs font-mono text-accent tracking-wider">TERMINAL</span>
                  {terminalStatus === "connected" && (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  )}
                </div>

                {/* Terminal 连接状态 */}
                <div className="ml-auto flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  {isTerminalOpening && (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-accent" />
                      <span>CONNECTING...</span>
                    </>
                  )}
                  {terminalInfo && terminalStatus === "connected" && (
                    <>
                      <span className="text-accent">&gt;</span>
                      <span>PTY_{terminalInfo.terminalId.slice(0, 8)}</span>
                    </>
                  )}
                  {terminalStatus === "error" && (
                    <span className="text-destructive">CONNECTION_ERROR</span>
                  )}
                </div>
              </div>

              {/* Terminal 内容 */}
              <div className="flex-1 min-h-0">
              {terminalInfo ? (
                <Terminal
                  terminalId={terminalInfo.terminalId}
                  onInput={writeInput}
                  onResize={resize}
                  onStatusChange={handleTerminalStatusChange}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 bg-background">
                  {isTerminalOpening ? (
                    <>
                      <div className="relative">
                        <TerminalSquare className="h-10 w-10 text-accent" />
                        <div className="absolute inset-0 h-10 w-10 animate-ping opacity-20 rounded-full bg-accent" />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-muted-foreground font-mono">
                          <span className="text-accent">&gt;</span> SPAWNING_PTY...
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">
                          Initializing terminal session
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <TerminalSquare className="h-10 w-10 text-muted-foreground/50" />
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-muted-foreground font-mono">
                          Terminal not connected
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={openTerminal}
                          className="mt-2 font-mono text-xs border-accent/50 text-accent hover:bg-accent/10"
                        >
                          <TerminalSquare className="h-3.5 w-3.5 mr-1.5" />
                          CONNECT
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
      </ResizablePanel>

      {/* 右侧边栏 - 传输队列 (仅文件模式显示) */}
      {!isTerminalMode && !sidebarCollapsed && (
        <>
          <ResizableHandle
            withHandle
            className="bg-border/50 hover:bg-primary/30 transition-colors"
          />
          <ResizablePanel
            id="sidebar-panel"
            defaultSize={sidebarPanelSize}
            minSize={MIN_SIDEBAR_SIZE}
            maxSize={MAX_SIDEBAR_SIZE}
          >
            <div className="flex flex-col h-full border-l border-border bg-sidebar">
              {/* 边栏头部 - Terminal Style */}
              <div className="flex items-center justify-between px-3 h-10 border-b border-sidebar-border bg-sidebar">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-accent animate-pulse" />
                  <span className="text-xs font-medium tracking-wide">TRANSFER_QUEUE</span>
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
                    <TooltipContent side="left" className="font-mono text-xs">
                      收起面板 / :hide
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* 传输队列内容 */}
              <div className="flex-1 min-h-0">
                <TransferQueue className="h-full" />
              </div>
            </div>
          </ResizablePanel>
        </>
      )}

      {/* 收起状态下的展开按钮 (仅文件模式显示) */}
      {!isTerminalMode && sidebarCollapsed && (
        <ResizablePanel id="collapsed-sidebar" defaultSize={4} minSize={3} maxSize={6}>
          <div
            className={cn(
              "flex flex-col items-center gap-2 py-3 px-1 h-full",
              "border-l border-border bg-sidebar"
            )}
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
                <TooltipContent side="left" className="font-mono text-xs">
                  展开传输队列 / :show
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* 收起状态下的图标指示 */}
            <div className="flex flex-col items-center gap-1 mt-2">
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground writing-mode-vertical">QUEUE</span>
            </div>
          </div>
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}
