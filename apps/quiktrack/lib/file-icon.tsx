import {
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  FileCode,
  FileType,
  File as FileIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Map a file's mime type / name to a lucide icon + tint. Shared by every file
 * card (description attachments, imported attachments) so the icon language is
 * consistent. Mirrors the allowed types in lib/storage.ts.
 */
export function isImageFile(name: string, mime?: string | null): boolean {
  if (mime && mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name);
}

export function fileIcon(name: string, mime?: string | null): { Icon: LucideIcon; color: string } {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();

  if (isImageFile(name, mime)) return { Icon: FileImage, color: "text-purple-500" };
  if (m === "application/pdf" || ext === "pdf") return { Icon: FileType, color: "text-red-500" };
  if (m.includes("spreadsheet") || m === "text/csv" || ["csv", "xls", "xlsx"].includes(ext))
    return { Icon: FileSpreadsheet, color: "text-green-600" };
  if (m.includes("zip") || m.includes("compressed") || ["zip", "rar", "7z", "gz", "tar"].includes(ext))
    return { Icon: FileArchive, color: "text-amber-500" };
  if (["html", "htm", "xml", "json", "js", "ts", "css"].includes(ext))
    return { Icon: FileCode, color: "text-blue-500" };
  if (m.startsWith("text/") || ["txt", "md"].includes(ext))
    return { Icon: FileText, color: "text-gray-500" };
  if (m.includes("word") || ["doc", "docx"].includes(ext))
    return { Icon: FileText, color: "text-blue-600" };
  if (m.includes("presentation") || ["ppt", "pptx"].includes(ext))
    return { Icon: FileType, color: "text-orange-500" };
  return { Icon: FileIcon, color: "text-gray-400" };
}
