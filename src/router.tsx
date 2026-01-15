/**
 * 应用路由配置
 */

import { createBrowserRouter, Navigate } from "react-router-dom";

import { MainLayout } from "@/layouts/MainLayout";
import { ConnectionsPage } from "@/pages/ConnectionsPage";
import { ConnectionFormPage } from "@/pages/ConnectionFormPage";
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
        path: "connections/new",
        element: <ConnectionFormPage />,
      },
      {
        path: "connections/:id/edit",
        element: <ConnectionFormPage />,
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
