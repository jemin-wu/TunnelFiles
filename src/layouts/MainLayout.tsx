/**
 * 主布局组件 - Cyberpunk Terminal Style
 * 提供顶部终端风格导航栏和内容区域
 */

import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback } from "react";
import { Settings, Moon, Sun, ChevronLeft, Cpu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme, setTheme } = useTheme();

  const isFilesPage = location.pathname.startsWith("/files/");
  const isSettingsPage = location.pathname === "/settings";
  const isFormPage =
    location.pathname === "/connections/new" ||
    !!location.pathname.match(/^\/connections\/[^/]+\/edit$/);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const handleBack = useCallback(() => {
    if (isSettingsPage) {
      navigate(-1);
    } else {
      navigate("/connections");
    }
  }, [navigate, isSettingsPage]);

  const handleSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  // 页面标题映射
  const getPageInfo = () => {
    if (isFilesPage) {
      // 从 URL 读取当前模式
      const mode = searchParams.get("mode");
      if (mode === "terminal") {
        return { title: "TERMINAL", code: "SSH" };
      }
      return { title: "FILE_BROWSER", code: "SFTP" };
    }
    if (isSettingsPage) return { title: "SYS_CONFIG", code: "CFG" };
    if (isFormPage) return { title: "CONN_EDIT", code: "NEW" };
    return { title: "CONNECTIONS", code: "SSH" };
  };
  const pageInfo = getPageInfo();

  const showBackButton = isFilesPage || isSettingsPage || isFormPage;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* 顶部导航栏 - Terminal Style Header */}
      <header
        className={cn(
          "flex items-center h-11 px-3 border-b border-border",
          "bg-card/80 backdrop-blur-sm shrink-0 select-none"
        )}
        data-tauri-drag-region
      >
        {/* 左侧区域 - Terminal Prompt */}
        <div className="flex items-center gap-2 min-w-[140px]">
          {showBackButton ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs hover:bg-primary/10 hover:text-primary"
                    onClick={handleBack}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span className="text-muted-foreground">[ESC]</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="font-mono text-xs">
                  返回上级 / cd ..
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className="w-7" />
          )}
        </div>

        {/* 中间标题 - ASCII Style */}
        <div className="flex-1 flex items-center justify-center gap-3" data-tauri-drag-region>
          {/* 状态指示器 */}
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-primary animate-pulse" />
            <span className="text-[10px] text-primary font-medium tracking-wider">
              [{pageInfo.code}]
            </span>
          </div>

          {/* 分隔符 */}
          <span className="text-border text-xs">│</span>

          {/* 页面标题 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium tracking-wide">{pageInfo.title}</span>
            <span className="text-primary text-xs cursor-blink" />
          </div>

          {/* 分隔符 */}
          <span className="text-border text-xs">│</span>

          {/* 版本/状态 */}
          <span className="text-[10px] text-muted-foreground tracking-wide">v2.0.0</span>
        </div>

        {/* 右侧工具栏 */}
        <div className="flex items-center gap-1 min-w-[140px] justify-end">
          <TooltipProvider delayDuration={300}>
            {/* 主题切换 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                  onClick={toggleTheme}
                >
                  {theme === "dark" ? (
                    <Sun className="h-3.5 w-3.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-xs">
                {theme === "dark" ? "切换亮色 / :light" : "切换暗色 / :dark"}
              </TooltipContent>
            </Tooltip>

            {/* 设置 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                  onClick={handleSettings}
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-xs">
                系统设置 / :config
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* 状态点 */}
          <div className="ml-2 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          </div>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>

      {/* 底部状态栏 */}
      <footer
        className={cn(
          "flex items-center justify-between h-6 px-3 border-t border-border",
          "bg-card/50 text-[10px] text-muted-foreground shrink-0"
        )}
      >
        <div className="flex items-center gap-3">
          <span>
            <span className="text-primary">●</span> ONLINE
          </span>
          <span className="text-border">│</span>
          <span>SFTP/SSH2</span>
        </div>
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span className="text-border">│</span>
          <span>
            <span className="text-primary">&gt;</span> READY
          </span>
        </div>
      </footer>
    </div>
  );
}
