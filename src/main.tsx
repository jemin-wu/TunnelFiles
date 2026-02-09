import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { router } from "./router";
import { ThemeProvider } from "./lib/theme";
import { queryClient } from "./lib/query";
import { Toaster } from "./components/ui/sonner";
import "./index.css";

/** Global keyboard handler - Escape dismisses all toasts */
function useGlobalKeyboardHandler() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        toast.dismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

function App() {
  useGlobalKeyboardHandler();

  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" expand={false} visibleToasts={3} gap={8} offset={16} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
