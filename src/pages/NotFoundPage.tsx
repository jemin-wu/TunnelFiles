/**
 * 404 Page
 */

import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div className="text-center space-y-3">
        <h1 className="text-5xl font-bold text-foreground">404</h1>
        <p className="text-sm text-muted-foreground">Page not found</p>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="text-xs">
          Go back
        </Button>
        <Button size="sm" onClick={() => navigate("/connections")} className="gap-2 text-xs">
          <Home className="h-3.5 w-3.5" />
          Home
        </Button>
      </div>
    </div>
  );
}
