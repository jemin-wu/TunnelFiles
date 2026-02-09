/**
 * Main Layout - Precision Engineering
 * Top navigation bar and content area
 */

import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback } from "react";
import { Settings, Moon, Sun, ChevronLeft } from "lucide-react";

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

  const getPageInfo = () => {
    if (isFilesPage) {
      const mode = searchParams.get("mode");
      if (mode === "terminal") {
        return { title: "Terminal" };
      }
      return { title: "File browser" };
    }
    if (isSettingsPage) return { title: "Settings" };
    return { title: "Connections" };
  };
  const pageInfo = getPageInfo();

  const showBackButton = isFilesPage || isSettingsPage;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top navigation bar */}
      <header
        className={cn(
          "flex items-center h-11 px-3 border-b border-border",
          "bg-card/80 backdrop-blur-sm shrink-0 select-none"
        )}
        data-tauri-drag-region
      >
        {/* Left area */}
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
                    <span className="text-muted-foreground">Back</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Go back
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className="w-7" />
          )}
        </div>

        {/* Center title */}
        <div className="flex-1 flex items-center justify-center" data-tauri-drag-region>
          <span className="text-xs font-medium">{pageInfo.title}</span>
        </div>

        {/* Right toolbar */}
        <div className="flex items-center gap-1 min-w-[140px] justify-end">
          <TooltipProvider delayDuration={300}>
            {/* Theme toggle */}
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
              <TooltipContent side="bottom" className="text-xs">
                {theme === "dark" ? "Switch to light" : "Switch to dark"}
              </TooltipContent>
            </Tooltip>

            {/* Settings */}
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
              <TooltipContent side="bottom" className="text-xs">
                Settings
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="ml-2 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-success" role="status" aria-label="Connected" />
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>

      {/* Footer status bar */}
      <footer
        className={cn(
          "flex items-center justify-between h-6 px-3 border-t border-border",
          "bg-card/50 text-[10px] text-muted-foreground shrink-0"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" /> Ready
          </span>
        </div>
        <span>SFTP / SSH2</span>
      </footer>
    </div>
  );
}
