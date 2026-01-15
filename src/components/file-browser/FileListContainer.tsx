/**
 * 文件列表容器组件 - Cyberpunk Terminal Style
 */

import { useState, useCallback, useMemo } from "react";
import { RefreshCw, Eye, EyeOff, Loader2, FolderPlus, HardDrive } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { Breadcrumb } from "./Breadcrumb";
import { FileList } from "./FileList";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { RenameDialog } from "./RenameDialog";
import { useFileList } from "@/hooks/useFileList";
import { useFileSelection } from "@/hooks/useFileSelection";
import { useFileOperations } from "@/hooks/useFileOperations";
import { useSettings } from "@/hooks/useSettings";
import { useTransferStore } from "@/stores/useTransferStore";
import { downloadFile, downloadDirectory, getTransfer } from "@/lib/transfer";
import { showSuccessToast, showErrorToast } from "@/lib/error";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_SORT, type FileEntry, type SortField, type SortSpec } from "@/types";

interface FileListContainerProps {
  sessionId: string;
  initialPath?: string;
  homePath?: string;
  onPathChange?: (path: string) => void;
}

export function FileListContainer({
  sessionId,
  initialPath = "/",
  homePath,
  onPathChange,
}: FileListContainerProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [sort, setSort] = useState<SortSpec>(DEFAULT_SORT);
  const [showHidden, setShowHidden] = useState(false);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  const { createFolder, rename, deleteItem } = useFileOperations({
    sessionId,
    currentPath,
  });

  const { settings } = useSettings();
  const addTask = useTransferStore((s) => s.addTask);

  const files = useMemo(() => {
    if (showHidden) return rawFiles;
    return rawFiles.filter((f) => !f.name.startsWith("."));
  }, [rawFiles, showHidden]);

  const { selectedPath, selectFile, clearSelection } = useFileSelection(files);

  const navigateTo = useCallback(
    (path: string) => {
      setCurrentPath(path);
      clearSelection();
      onPathChange?.(path);
    },
    [clearSelection, onPathChange]
  );

  const handleFileClick = useCallback(
    (file: FileEntry) => {
      selectFile(file.path);
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

  const handleDownload = useCallback(
    async (file: FileEntry) => {
      try {
        // 优先使用默认下载目录，否则弹窗选择
        let localDir = settings.defaultDownloadDir;
        if (!localDir) {
          const selected = await openDialog({
            directory: true,
            multiple: false,
            title: "选择下载保存位置",
          });
          if (!selected) return; // 用户取消
          localDir = selected;
        }

        if (file.isDir) {
          // 下载目录
          const taskIds = await downloadDirectory(sessionId, file.path, localDir);
          if (taskIds.length === 0) {
            showSuccessToast("目录为空，无文件可下载");
            return;
          }
          for (const taskId of taskIds) {
            const task = await getTransfer(taskId);
            if (task) addTask(task);
          }
          showSuccessToast(`已创建 ${taskIds.length} 个下载任务`);
        } else {
          // 下载单个文件
          const taskId = await downloadFile(sessionId, file.path, localDir);
          const task = await getTransfer(taskId);
          if (task) addTask(task);
          showSuccessToast(`开始下载: ${file.name}`);
        }
      } catch (error) {
        showErrorToast(error);
      }
    },
    [sessionId, settings.defaultDownloadDir, addTask]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!targetFile) return;
    deleteItem.mutate(
      { path: targetFile.path, isDir: targetFile.isDir },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          setTargetFile(null);
        },
      }
    );
  }, [targetFile, deleteItem]);

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
      {/* 工具栏 - Terminal Style */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/50">
        {/* 路径图标 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <HardDrive className="h-3.5 w-3.5 text-primary" />
          <span className="text-border">│</span>
        </div>

        {/* 面包屑导航 */}
        <Breadcrumb
          path={currentPath}
          homePath={homePath}
          onNavigate={navigateTo}
          className="flex-1 min-w-0"
        />

        {/* 文件计数 */}
        <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono shrink-0">
          <span className="text-primary">{files.length}</span>
          <span>items</span>
        </div>

        <span className="text-border hidden sm:block">│</span>

        <TooltipProvider delayDuration={300}>
          {/* 新建文件夹 */}
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
            <TooltipContent className="font-mono text-xs">MKDIR</TooltipContent>
          </Tooltip>

          {/* 刷新 */}
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
            <TooltipContent className="font-mono text-xs">REFRESH</TooltipContent>
          </Tooltip>

          {/* 隐藏文件切换 */}
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
            <TooltipContent className="font-mono text-xs">
              {showHidden ? "HIDE_DOTFILES" : "SHOW_DOTFILES"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 min-h-0">
        <FileList
          files={files}
          selectedPath={selectedPath}
          sort={sort}
          onFileClick={handleFileClick}
          onFileDblClick={handleFileDblClick}
          onSortChange={handleSortChange}
          onDownload={handleDownload}
          onRename={handleRename}
          onDelete={handleDelete}
          isLoading={isLoading}
        />
      </div>

      {/* 新建文件夹弹窗 */}
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onSubmit={handleCreateFolderSubmit}
        isPending={createFolder.isPending}
      />

      {/* 重命名弹窗 */}
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

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setTargetFile(null);
        }}
        file={targetFile}
        onConfirm={handleDeleteConfirm}
        isPending={deleteItem.isPending}
      />
    </div>
  );
}
