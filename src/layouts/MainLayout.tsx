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
    <div className="bg-background flex h-screen flex-col overflow-hidden">
      {/* Top navigation bar */}
      <header
        className={cn(
          "border-border flex h-11 items-center border-b px-3",
          "bg-card/80 shrink-0 backdrop-blur-sm select-none"
        )}
        data-tauri-drag-region
      >
        {/* Left area */}
        <div className="flex min-w-[140px] items-center gap-2">
          {showBackButton ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground h-7 gap-1 px-2 text-sm"
                    onClick={handleBack}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
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
        <div className="flex flex-1 items-center justify-center" data-tauri-drag-region>
          <span className="text-base font-semibold">{pageInfo.title}</span>
        </div>

        {/* Right toolbar */}
        <div className="flex min-w-[140px] items-center justify-end gap-1">
          <TooltipProvider delayDuration={300}>
            {/* Theme toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleTheme}>
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
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSettings}>
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Settings
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>

      {/* Footer status bar */}
      <footer
        className={cn(
          "border-border flex h-6 items-center justify-between border-t px-3",
          "bg-card/50 text-muted-foreground shrink-0 text-xs"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="bg-success h-1.5 w-1.5 rounded-full" /> Ready
          </span>
        </div>
        <span>SFTP / SSH2</span>
      </footer>
    </div>
  );
}
