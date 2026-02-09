/**
 * File List Container Component - Precision Engineering
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { RefreshCw, Eye, EyeOff, Loader2, FolderPlus, TerminalSquare } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { Breadcrumb } from "./Breadcrumb";
import { FileList } from "./FileList";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { RenameDialog } from "./RenameDialog";
import { ChmodDialog } from "./ChmodDialog";
import { useFileList } from "@/hooks/useFileList";
import { useFileSelection } from "@/hooks/useFileSelection";
import { useFileOperations } from "@/hooks/useFileOperations";
import { useDeleteProgress } from "@/hooks/useDeleteProgress";
import { useSettings } from "@/hooks/useSettings";
import { useTransferStore } from "@/stores/useTransferStore";
import { downloadFile, downloadDirectory, getTransfer } from "@/lib/transfer";
import { showSuccessToast, showErrorToast } from "@/lib/error";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_SORT, type FileEntry, type SortField, type SortSpec } from "@/types";
import type { DirectoryStats } from "@/types/file";

interface FileListContainerProps {
  sessionId: string;
  initialPath?: string;
  homePath?: string;
  onPathChange?: (path: string) => void;
  /** Switch to Terminal mode */
  onSwitchToTerminal?: () => void;
}

export function FileListContainer({
  sessionId,
  initialPath = "/",
  homePath,
  onPathChange,
  onSwitchToTerminal,
}: FileListContainerProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [sort, setSort] = useState<SortSpec>(DEFAULT_SORT);
  const [showHidden, setShowHidden] = useState(false);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chmodOpen, setChmodOpen] = useState(false);
  const [targetFile, setTargetFile] = useState<FileEntry | null>(null);

  const {
    files: rawFiles,
    isLoading,
    isFetching,
    refetch,
  } = useFileList({
    sessionId,
    path: currentPath,
    sort,
    enabled: !!sessionId,
  });

  const { createFolder, rename, deleteItem, deleteRecursive, chmod, getDirStats } =
    useFileOperations({
      sessionId,
      currentPath,
    });

  // Directory stats state (for delete confirm dialog)
  const [dirStats, setDirStats] = useState<DirectoryStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Listen for recursive delete progress
  const { progress: deleteProgress, reset: resetDeleteProgress } = useDeleteProgress({
    path: deleteRecursive.isPending ? (targetFile?.path ?? null) : null,
  });

  // When delete dialog opens, fetch stats if it's a directory
  useEffect(() => {
    if (!deleteOpen || !targetFile?.isDir) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset state when dialog closes or file changes
      setDirStats(null);
      return;
    }

    setIsLoadingStats(true);
    getDirStats(targetFile.path)
      .then((stats) => {
        setDirStats(stats);
      })
      .catch((error) => {
        console.warn("Failed to get directory stats:", error);
        setDirStats(null);
      })
      .finally(() => {
        setIsLoadingStats(false);
      });
  }, [deleteOpen, targetFile?.isDir, targetFile?.path, getDirStats]);

  const { settings } = useSettings();
  const addTask = useTransferStore((s) => s.addTask);

  const files = useMemo(() => {
    if (showHidden) return rawFiles;
    return rawFiles.filter((f) => !f.name.startsWith("."));
  }, [rawFiles, showHidden]);

  const { selectedFiles, selectFile, selectAll, clearSelection, isSelected, selectionCount } =
    useFileSelection(files);

  const navigateTo = useCallback(
    (path: string) => {
      setCurrentPath(path);
      clearSelection();
      onPathChange?.(path);
    },
    [clearSelection, onPathChange]
  );

  const handleFileClick = useCallback(
    (file: FileEntry, modifiers: { metaKey: boolean; shiftKey: boolean }) => {
      selectFile(file.path, modifiers);
    },
    [selectFile]
  );

  const handleFileDblClick = useCallback(
    (file: FileEntry) => {
      if (file.isDir) {
        navigateTo(file.path);
      }
    },
    [navigateTo]
  );

  const handleSortChange = useCallback((field: SortField) => {
    setSort((prev) => ({
      field,
      order: prev.field === field && prev.order === "asc" ? "desc" : "asc",
    }));
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const toggleHidden = useCallback(() => {
    setShowHidden((prev) => !prev);
  }, []);

  const handleRename = useCallback((file: FileEntry) => {
    setTargetFile(file);
    setRenameOpen(true);
  }, []);

  const handleRenameSubmit = useCallback(
    (newName: string) => {
      if (!targetFile) return;
      rename.mutate(
        { fromPath: targetFile.path, newName },
        {
          onSuccess: () => {
            setRenameOpen(false);
            setTargetFile(null);
          },
        }
      );
    },
    [targetFile, rename]
  );

  const handleDelete = useCallback((file: FileEntry) => {
    setTargetFile(file);
    setDeleteOpen(true);
  }, []);

  const handleChmod = useCallback((file: FileEntry) => {
    setTargetFile(file);
    setChmodOpen(true);
  }, []);

  const handleChmodSubmit = useCallback(
    (mode: number) => {
      // Get list of files to change permissions for
      // If multi-selected, use selected files; otherwise use target file
      const filesToChmod =
        selectedFiles.length > 0 ? selectedFiles : targetFile ? [targetFile] : [];
      if (filesToChmod.length === 0) return;

      const paths = filesToChmod.map((f) => f.path);
      chmod.mutate(
        { paths, mode },
        {
          onSuccess: () => {
            setChmodOpen(false);
            setTargetFile(null);
          },
        }
      );
    },
    [selectedFiles, targetFile, chmod]
  );

  const handleDownload = useCallback(
    async (file: FileEntry) => {
      try {
        // Prefer default download directory, otherwise prompt selection
        let localDir = settings.defaultDownloadDir;
        if (!localDir) {
          const selected = await openDialog({
            directory: true,
            multiple: false,
            title: "Choose download location",
          });
          if (!selected) return; // User cancelled
          localDir = selected;
        }

        if (file.isDir) {
          // Download directory
          const taskIds = await downloadDirectory(sessionId, file.path, localDir);
          if (taskIds.length === 0) {
            showSuccessToast("Directory is empty, no files to download");
            return;
          }
          for (const taskId of taskIds) {
            const task = await getTransfer(taskId);
            if (task) addTask(task);
          }
          showSuccessToast(`Created ${taskIds.length} download tasks`);
        } else {
          // Download single file
          const taskId = await downloadFile(sessionId, file.path, localDir);
          const task = await getTransfer(taskId);
          if (task) addTask(task);
          showSuccessToast(`Downloading: ${file.name}`);
        }
      } catch (error) {
        showErrorToast(error);
      }
    },
    [sessionId, settings.defaultDownloadDir, addTask]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!targetFile) return;

    // Check if recursive delete is needed: non-empty directory
    const isNonEmptyDir =
      targetFile.isDir && dirStats && (dirStats.fileCount > 0 || dirStats.dirCount > 0);

    if (isNonEmptyDir) {
      // Recursively delete non-empty directory
      deleteRecursive.mutate(
        { path: targetFile.path },
        {
          onSuccess: () => {
            setDeleteOpen(false);
            setTargetFile(null);
            setDirStats(null);
            resetDeleteProgress();
          },
        }
      );
    } else {
      // Normal delete (file or empty directory)
      deleteItem.mutate(
        { path: targetFile.path, isDir: targetFile.isDir },
        {
          onSuccess: () => {
            setDeleteOpen(false);
            setTargetFile(null);
            setDirStats(null);
          },
        }
      );
    }
  }, [targetFile, dirStats, deleteItem, deleteRecursive, resetDeleteProgress]);

  const handleCreateFolderSubmit = useCallback(
    (name: string) => {
      createFolder.mutate(name, {
        onSuccess: () => {
          setCreateFolderOpen(false);
        },
      });
    },
    [createFolder]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/50">
        {/* Switch to Terminal */}
        {onSwitchToTerminal && (
          <>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-accent/10 hover:text-accent"
                    onClick={onSwitchToTerminal}
                  >
                    <TerminalSquare className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Switch to terminal (⌘2)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}

        {/* Breadcrumb navigation */}
        <Breadcrumb
          path={currentPath}
          homePath={homePath}
          onNavigate={navigateTo}
          className="flex-1 min-w-0"
        />

        {/* File count & selection count */}
        <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
          <span>
            <span className="text-primary font-mono">{files.length}</span>
            <span className="ml-1">items</span>
          </span>
          {selectionCount > 0 && (
            <span className="animate-in fade-in duration-150">
              <span className="text-primary font-mono">{selectionCount}</span>
              <span className="ml-1">selected</span>
            </span>
          )}
        </div>

        <span className="hidden sm:block w-px h-4 bg-border" />

        <TooltipProvider delayDuration={300}>
          {/* New folder */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                onClick={() => setCreateFolderOpen(true)}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">New folder</TooltipContent>
          </Tooltip>

          {/* Refresh */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                onClick={handleRefresh}
                disabled={isFetching}
              >
                {isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Refresh</TooltipContent>
          </Tooltip>

          {/* Toggle hidden files */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                onClick={toggleHidden}
                aria-pressed={showHidden}
              >
                {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {showHidden ? "Hide hidden files" : "Show hidden files"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* File list */}
      <div className="flex-1 min-h-0">
        <FileList
          files={files}
          isSelected={isSelected}
          selectionCount={selectionCount}
          sort={sort}
          onFileClick={handleFileClick}
          onFileDblClick={handleFileDblClick}
          onSortChange={handleSortChange}
          onDownload={handleDownload}
          onRename={handleRename}
          onDelete={handleDelete}
          onChmod={handleChmod}
          onKeyAction={(action) => {
            if (action === "selectAll") {
              selectAll();
            } else if (action === "clearSelection") {
              clearSelection();
            } else if (action === "delete" && selectedFiles.length === 1) {
              setTargetFile(selectedFiles[0]);
              setDeleteOpen(true);
            } else if (action === "newFolder") {
              setCreateFolderOpen(true);
            } else if (action === "preview" && selectedFiles.length === 1) {
              // Space key preview - enter directory or download file
              const file = selectedFiles[0];
              if (file.isDir) {
                navigateTo(file.path);
              } else {
                handleDownload(file);
              }
            } else if (action === "parentDir") {
              // Cmd+Up: go to parent directory
              if (currentPath !== "/") {
                const parentPath = currentPath.substring(0, currentPath.lastIndexOf("/")) || "/";
                navigateTo(parentPath);
              }
            } else if (action === "rename" && selectedFiles.length === 1) {
              // Cmd+R / F2: rename
              handleRename(selectedFiles[0]);
            }
          }}
          isLoading={isLoading}
        />
      </div>

      {/* Create folder dialog */}
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onSubmit={handleCreateFolderSubmit}
        isPending={createFolder.isPending}
      />

      {/* Rename dialog */}
      <RenameDialog
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) setTargetFile(null);
        }}
        currentName={targetFile?.name ?? ""}
        onSubmit={handleRenameSubmit}
        isPending={rename.isPending}
      />

      {/* Delete confirm dialog */}
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setTargetFile(null);
            setDirStats(null);
            resetDeleteProgress();
          }
        }}
        file={targetFile}
        onConfirm={handleDeleteConfirm}
        isPending={deleteItem.isPending || deleteRecursive.isPending}
        stats={dirStats}
        isLoadingStats={isLoadingStats}
        progress={deleteProgress}
      />

      {/* Chmod dialog */}
      <ChmodDialog
        open={chmodOpen}
        onOpenChange={(open) => {
          setChmodOpen(open);
          if (!open) setTargetFile(null);
        }}
        files={selectedFiles.length > 0 ? selectedFiles : targetFile ? [targetFile] : []}
        onSubmit={handleChmodSubmit}
        isPending={chmod.isPending}
      />
    </div>
  );
}
