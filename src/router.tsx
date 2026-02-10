/** Application router configuration */

import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { MainLayout } from "@/layouts/MainLayout";
import { RouteErrorBoundary } from "@/components/ErrorBoundary";
import { FullPageLoader } from "@/components/ui/LoadingSpinner";

const ConnectionsPage = lazy(() =>
  import("@/pages/ConnectionsPage").then((m) => ({ default: m.ConnectionsPage }))
);
const FileManagerPage = lazy(() =>
  import("@/pages/FileManagerPage").then((m) => ({ default: m.FileManagerPage }))
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
);

function SuspensePage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<FullPageLoader />}>{children}</Suspense>;
}

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
        element: (
          <SuspensePage>
            <ConnectionsPage />
          </SuspensePage>
        ),
      },
      {
        path: "files/:sessionId",
        element: (
          <SuspensePage>
            <FileManagerPage />
          </SuspensePage>
        ),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "settings",
        element: (
          <SuspensePage>
            <SettingsPage />
          </SuspensePage>
        ),
      },
      {
        path: "*",
        element: (
          <SuspensePage>
            <NotFoundPage />
          </SuspensePage>
        ),
      },
    ],
  },
]);
