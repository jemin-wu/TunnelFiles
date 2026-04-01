/**
 * File List Container Component - Precision Engineering
 */

import { useState, useCallback, useMemo } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { FileList } from "./FileList";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { RenameDialog } from "./RenameDialog";
import { ChmodDialog } from "./ChmodDialog";
import { PreviewDialog } from "./PreviewDialog";
import { useFileList } from "@/hooks/useFileList";
import { useFileSelection } from "@/hooks/useFileSelection";
import { useFileOperations } from "@/hooks/useFileOperations";
import { useSettings } from "@/hooks/useSettings";
import { useTransferStore } from "@/stores/useTransferStore";
import { downloadFile, downloadDirectory, getTransfer } from "@/lib/transfer";
import { showSuccessToast, showErrorToast } from "@/lib/error";
import { type FileEntry, type SortField, type SortSpec } from "@/types";

interface FileListContainerProps {
  sessionId: string;
  currentPath: string;
  onPathChange: (path: string) => void;
  showHidden: boolean;
  createFolderOpen?: boolean;
  onCreateFolderOpenChange?: (open: boolean) => void;
}

export function FileListContainer({
  sessionId,
  currentPath,
  onPathChange,
  showHidden,
  createFolderOpen: createFolderOpenProp,
  onCreateFolderOpenChange,
}: FileListContainerProps) {
  const [sort, setSort] = useState<SortSpec | null>(null);

  // Create folder dialog state - controlled by parent when props provided
  const [createFolderOpenInternal, setCreateFolderOpenInternal] = useState(false);
  const createFolderOpen = createFolderOpenProp ?? createFolderOpenInternal;
  const setCreateFolderOpen = useCallback(
    (open: boolean) => {
      if (onCreateFolderOpenChange) {
        onCreateFolderOpenChange(open);
      } else {
        setCreateFolderOpenInternal(open);
      }
    },
    [onCreateFolderOpenChange]
  );

  const [renameOpen, setRenameOpen] = useState(false);
  const [chmodOpen, setChmodOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [targetFile, setTargetFile] = useState<FileEntry | null>(null);
  const [filterQuery, setFilterQuery] = useState("");

  const { files: rawFiles, isLoading } = useFileList({
    sessionId,
    path: currentPath,
    enabled: !!sessionId,
  });

  const { createFolder, rename, deleteItem, deleteRecursive, batchDelete, chmod } =
    useFileOperations({
      sessionId,
      currentPath,
    });

  const { settings } = useSettings();
  const addTask = useTransferStore((s) => s.addTask);

  const files = useMemo(() => {
    let filtered = showHidden ? rawFiles : rawFiles.filter((f) => !f.name.startsWith("."));

    // Apply filter query
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      filtered = filtered.filter((f) => f.name.toLowerCase().includes(q));
    }

    if (!sort) return filtered;

    return [...filtered].sort((a, b) => {
      // Directories first
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;

      let cmp: number;
      switch (sort.field) {
        case "name":
          cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          break;
        case "size":
          cmp = (a.size ?? 0) - (b.size ?? 0);
          break;
        case "mtime":
          cmp = (a.mtime ?? 0) - (b.mtime ?? 0);
          break;
        default:
          cmp = 0;
          break;
      }

      return sort.order === "desc" ? -cmp : cmp;
    });
  }, [rawFiles, showHidden, sort, filterQuery]);

  const { selectedFiles, selectFile, selectAll, clearSelection, isSelected, selectionCount } =
    useFileSelection(files);

  const navigateTo = useCallback(
    (path: string) => {
      clearSelection();
      setFilterQuery("");
      onPathChange(path);
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
    setSort((prev) => {
      if (prev?.field !== field) {
        return { field, order: "asc" as const };
      }
      if (prev.order === "asc") {
        return { field, order: "desc" as const };
      }
      return null;
    });
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

  const handleDelete = useCallback(
    (files: FileEntry | FileEntry[]) => {
      const items = Array.isArray(files) ? files : [files];
      if (items.length === 0) return;

      if (items.length === 1) {
        const file = items[0];
        if (file.isDir) {
          deleteRecursive.mutate({ path: file.path });
        } else {
          deleteItem.mutate({ path: file.path, isDir: false });
        }
      } else {
        batchDelete.mutate(items.map((f) => ({ path: f.path, isDir: f.isDir })));
      }
    },
    [deleteItem, deleteRecursive, batchDelete]
  );

  const handleChmod = useCallback((file: FileEntry) => {
    setTargetFile(file);
    setChmodOpen(true);
  }, []);

  const handleChmodSubmit = useCallback(
    (mode: number) => {
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
        let localDir = settings.defaultDownloadDir;
        if (!localDir) {
          const selected = await openDialog({
            directory: true,
            multiple: false,
            title: "Choose download location",
          });
          if (!selected) return;
          localDir = selected;
        }

        if (file.isDir) {
          const taskIds = await downloadDirectory(sessionId, file.path, localDir);
          if (taskIds.length === 0) {
            showSuccessToast("Directory is empty, no files to download");
            return;
          }
          const tasks = await Promise.all(taskIds.map((id) => getTransfer(id)));
          for (const task of tasks) {
            if (task) addTask(task);
          }
          showSuccessToast(`Created ${taskIds.length} download tasks`);
        } else {
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

  const handleCreateFolderSubmit = useCallback(
    (name: string) => {
      createFolder.mutate(name, {
        onSuccess: () => {
          setCreateFolderOpen(false);
        },
      });
    },
    [createFolder, setCreateFolderOpen]
  );

  return (
    <div className="flex h-full flex-col">
      {/* File list */}
      <div className="min-h-0 flex-1">
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
          onDelete={(file) => {
            // When multi-select is active, delete all selected files
            if (selectedFiles.length > 1 && isSelected(file.path)) {
              handleDelete(selectedFiles);
            } else {
              handleDelete(file);
            }
          }}
          onChmod={handleChmod}
          onKeyAction={(action) => {
            if (action === "selectAll") {
              selectAll();
            } else if (action === "clearSelection") {
              clearSelection();
            } else if (action === "delete" && selectedFiles.length > 0) {
              handleDelete(selectedFiles);
            } else if (action === "newFolder") {
              setCreateFolderOpen(true);
            } else if (action === "preview" && selectedFiles.length === 1) {
              const file = selectedFiles[0];
              if (file.isDir) {
                navigateTo(file.path);
              } else {
                setPreviewFile(file);
                setPreviewOpen(true);
              }
            } else if (action === "parentDir") {
              if (currentPath !== "/") {
                const parentPath = currentPath.substring(0, currentPath.lastIndexOf("/")) || "/";
                navigateTo(parentPath);
              }
            } else if (action === "rename" && selectedFiles.length === 1) {
              handleRename(selectedFiles[0]);
            }
          }}
          isLoading={isLoading}
          filterQuery={filterQuery}
          onFilterChange={setFilterQuery}
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

      {/* File preview dialog */}
      <PreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewFile(null);
        }}
        file={previewFile}
        sessionId={sessionId}
        onDownload={handleDownload}
      />
    </div>
  );
}
