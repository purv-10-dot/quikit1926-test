import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Presentation,
} from "lucide-react";

export function FileTypeIcon({
  contentType,
  className = "h-5 w-5",
}: {
  contentType: string;
  className?: string;
}) {
  if (contentType.startsWith("image/")) {
    return <FileImage className={className} aria-hidden />;
  }
  if (contentType === "application/pdf") {
    return <FileText className={className} aria-hidden />;
  }
  if (
    contentType.includes("spreadsheet") ||
    contentType.includes("excel") ||
    contentType === "text/csv"
  ) {
    return <FileSpreadsheet className={className} aria-hidden />;
  }
  if (contentType.includes("presentation") || contentType.includes("powerpoint")) {
    return <Presentation className={className} aria-hidden />;
  }
  if (contentType.includes("word") || contentType === "text/plain") {
    return <FileText className={className} aria-hidden />;
  }
  return <File className={className} aria-hidden />;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function canPreviewContentType(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType === "application/pdf";
}
