/** Application router configuration */

import { createBrowserRouter, Navigate } from "react-router-dom";

import { MainLayout } from "@/layouts/MainLayout";
import { ConnectionsPage } from "@/pages/ConnectionsPage";
import { FileManagerPage } from "@/pages/FileManagerPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RouteErrorBoundary } from "@/components/ErrorBoundary";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <Navigate to="/connections" replace />,
      },
      {
        path: "connections",
        element: <ConnectionsPage />,
      },
      {
        path: "files/:sessionId",
        element: <FileManagerPage />,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
