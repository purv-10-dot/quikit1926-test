"use client";

import { useState } from "react";
import { Upload, Link2, Cloud } from "lucide-react";
import { clsx } from "clsx";
import { FileUploadInput } from "@/components/hrms/file-upload-input";

export interface SourceMeta {
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

interface DocumentSourcePickerProps {
  value: SourceMeta;
  onChange: (meta: SourceMeta) => void;
  accept?: string;
  maxMB?: number;
}

type SourceKind = "file" | "link" | "drive";

const TABS: { kind: SourceKind; label: string; icon: React.ReactNode }[] = [
  { kind: "file",  label: "Upload File",   icon: <Upload size={13} /> },
  { kind: "link",  label: "Paste Link",    icon: <Link2 size={13} /> },
  { kind: "drive", label: "Google Drive",  icon: <Cloud size={13} /> },
];

function inferType(url: string): string {
  if (/drive\.google\.com|docs\.google\.com/i.test(url)) return "google-drive";
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] ?? "link";
}

export function DocumentSourcePicker({
  value,
  onChange,
  accept = "application/pdf,image/png,image/jpeg,image/webp,.docx,.doc,.xlsx,.xls",
  maxMB = 10,
}: DocumentSourcePickerProps) {
  const [tab, setTab] = useState<SourceKind>(
    value.fileType === "google-drive" ? "drive"
      : value.fileType === "link" ? "link"
      : "file",
  );

  const setLink = (url: string, kind: "link" | "drive") => {
    onChange({
      fileUrl: url,
      fileType: url ? (kind === "drive" ? "google-drive" : inferType(url)) : "",
      fileSize: 0,
    });
  };

  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-gray-100 border border-[var(--border)]">
        {TABS.map((t) => {
          const active = tab === t.kind;
          return (
            <button
              key={t.kind}
              type="button"
              onClick={() => {
                setTab(t.kind);
                onChange({ fileUrl: "", fileType: "", fileSize: 0 });
              }}
              className={clsx(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition",
                active ? "bg-white text-[#16243A] shadow-sm" : "text-gray-600 hover:text-[#16243A]",
              )}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {tab === "file" && (
        <FileUploadInput
          value={value.fileType !== "link" && value.fileType !== "google-drive" ? value.fileUrl : ""}
          onChange={(url, meta) => onChange({
            fileUrl: url,
            fileType: meta?.fileType ?? "",
            fileSize: meta?.fileSize ?? 0,
          })}
          accept={accept}
          maxMB={maxMB}
          label=""
          placeholder={`Upload PDF / Image / DOCX (max ${maxMB}MB)`}
        />
      )}

      {tab === "link" && (
        <div>
          <input
            type="url"
            placeholder="https://example.com/document.pdf"
            value={value.fileType === "link" || (value.fileUrl && value.fileType !== "google-drive" && tab === "link") ? value.fileUrl : ""}
            onChange={(e) => setLink(e.target.value.trim(), "link")}
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#16243A]"
          />
          <p className="text-[11px] text-gray-500 mt-1">Paste any public document URL (PDF, DOCX, image, etc.)</p>
        </div>
      )}

      {tab === "drive" && (
        <div>
          <input
            type="url"
            placeholder="https://drive.google.com/file/d/..."
            value={value.fileType === "google-drive" ? value.fileUrl : ""}
            onChange={(e) => setLink(e.target.value.trim(), "drive")}
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#16243A]"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Paste shareable Google Drive / Docs link. Set sharing to <strong>Anyone with link</strong> for HR access.
          </p>
        </div>
      )}
    </div>
  );
}
