/**
 * 文件类型图标组件
 */

import {
  File,
  FileCode,
  FileText,
  FileImage,
  FileArchive,
  FileAudio,
  FileVideo,
  Folder,
} from "lucide-react";

import { getFileType, type FileType } from "@/lib/file";
import type { FileEntry } from "@/types";
import { cn } from "@/lib/utils";

interface FileIconProps {
  file: FileEntry;
  className?: string;
}

const iconMap: Record<FileType, typeof File> = {
  folder: Folder,
  code: FileCode,
  document: FileText,
  image: FileImage,
  archive: FileArchive,
  audio: FileAudio,
  video: FileVideo,
  other: File,
};

const colorMap: Record<FileType, string> = {
  folder: "text-file-folder",
  code: "text-file-code",
  document: "text-file-document",
  image: "text-file-image",
  archive: "text-file-archive",
  audio: "text-file-audio",
  video: "text-file-video",
  other: "text-muted-foreground",
};

export function FileIcon({ file, className }: FileIconProps) {
  const fileType = getFileType(file);
  const Icon = iconMap[fileType];
  const colorClass = colorMap[fileType];

  return <Icon className={cn("h-4 w-4", colorClass, className)} />;
}
