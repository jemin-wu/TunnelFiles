/**
 * 404 页面 - Cyberpunk Terminal Style
 */

import { useNavigate } from "react-router-dom";
import { AlertTriangle, Terminal, Home } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      {/* ASCII Art Style Error */}
      <div className="text-center space-y-4">
        {/* Glitch Effect Container */}
        <div className="relative">
          <div className="text-6xl font-bold text-primary tracking-widest animate-pulse">
            404
          </div>
          <div className="absolute inset-0 text-6xl font-bold text-accent/30 tracking-widest blur-sm animate-pulse">
            404
          </div>
        </div>

        {/* Terminal Style Message */}
        <div className="space-y-2 font-mono text-xs">
          <div className="flex items-center justify-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>ERROR: PATH_NOT_FOUND</span>
          </div>
          <div className="text-muted-foreground">
            <span className="text-primary">&gt;</span> 请求的路径不存在于系统中
          </div>
        </div>
      </div>

      {/* ASCII Box Decoration */}
      <div className="font-mono text-[10px] text-border leading-none whitespace-pre">
{`╔════════════════════════════════════╗
║  STATUS: RESOURCE_UNAVAILABLE      ║
║  CODE:   ERR_NOT_FOUND             ║
║  ACTION: REDIRECT_TO_HOME          ║
╚════════════════════════════════════╝`}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
          className="gap-2 text-xs h-8 btn-cyber"
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>GO_BACK</span>
        </Button>
        <Button
          onClick={() => navigate("/connections")}
          className="gap-2 text-xs h-8 btn-cyber"
        >
          <Home className="h-3.5 w-3.5" />
          <span>HOME</span>
        </Button>
      </div>

      {/* Footer hint */}
      <div className="text-[10px] text-muted-foreground/50 font-mono">
        <span className="text-primary">TIP:</span> 检查 URL 是否正确或联系系统管理员
      </div>
    </div>
  );
}
