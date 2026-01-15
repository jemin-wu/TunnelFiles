/**
 * 文件管理页面 - Cyberpunk Terminal Style
 * 使用可调整宽度的右侧边栏显示传输队列
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, PanelRightClose, PanelRightOpen, HardDrive, Activity } from "lucide-react";

import { FileListContainer } from "@/components/file-browser/FileListContainer";
import { DropZone } from "@/components/transfer/DropZone";
import { TransferQueue } from "@/components/transfer/TransferQueue";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSessionStatus } from "@/hooks/useSessionStatus";
import { useTransferEvents } from "@/hooks/useTransferEvents";
import { cn } from "@/lib/utils";

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

  const { sessionInfo, isValid, isLoading } = useSessionStatus(sessionId);
  useTransferEvents();

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

  // 3:1 比例布局 (75%:25%)
  const mainPanelSize = sidebarCollapsed ? 96 : 75;
  const sidebarPanelSize = sidebarCollapsed ? 4 : 25;

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* 主内容区 - 文件浏览器 (75%) */}
      <ResizablePanel
        id="main-panel"
        defaultSize={mainPanelSize}
        minSize={55}
        maxSize={sidebarCollapsed ? 97 : 82}
      >
        <div className="flex flex-col h-full">
          <DropZone sessionId={sessionId} remotePath={currentPath} className="flex-1 min-h-0">
            <FileListContainer
              sessionId={sessionId}
              initialPath={sessionInfo?.homePath ?? "/"}
              homePath={sessionInfo?.homePath}
              onPathChange={handlePathChange}
            />
          </DropZone>
        </div>
      </ResizablePanel>

      {/* 右侧边栏 - 传输队列 (25%) */}
      {!sidebarCollapsed && (
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

      {/* 收起状态下的展开按钮 */}
      {sidebarCollapsed && (
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
