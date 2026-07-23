"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, X, FileText, Loader2, ExternalLink } from "lucide-react";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/use-api";

interface FileUploadInputProps {
  value: string;
  onChange: (url: string, meta?: { fileName: string; fileType: string; fileSize: number }) => void;
  accept?: string;
  label?: string;
  placeholder?: string;
  maxMB?: number;
  variant?: "default" | "avatar";
  className?: string;
  disabled?: boolean;
}

export function FileUploadInput({
  value, onChange, accept = "application/pdf,image/png,image/jpeg,image/webp,.docx",
  label = "File", placeholder = "No file uploaded",
  maxMB = 10, variant = "default", className, disabled,
}: FileUploadInputProps) {
  const api = useApiClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > maxMB * 1024 * 1024) throw new Error(`File exceeds ${maxMB}MB`);
      const fd = new FormData();
      fd.append("file", file);
      return api.upload<{ url: string; fileName: string; fileType: string; fileSize: number }>(
        "/api/v1/hrms/uploads", fd,
      );
    },
    onSuccess: (res) => {
      onChange(res.data.url, { fileName: res.data.fileName, fileType: res.data.fileType, fileSize: res.data.fileSize });
      setFileName(res.data.fileName);
      setError(null);
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setError(e.message),
  });

  const pick = (file: File | null) => {
    if (!file) return;
    setError(null);
    uploadMut.mutate(file);
  };

  const clear = () => {
    onChange("");
    setFileName(null);
    setError(null);
  };

  if (variant === "avatar") {
    return (
      <div className={clsx("flex items-center gap-3", className)}>
        <input ref={inputRef} type="file" className="hidden" accept={accept}
          onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        <div className="relative w-16 h-16 rounded-full bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <Upload size={18} />
            </div>
          )}
          {uploadMut.isPending && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-green-600" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || uploadMut.isPending}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium shadow-sm disabled:opacity-60">
            <Upload size={11} /> {value ? "Replace" : "Upload"}
          </button>
          {value && (
            <button type="button" onClick={clear} className="text-xs text-red-600 hover:underline text-left">Remove</button>
          )}
          {error && <p className="text-[10px] text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("space-y-1", className)}>
      {label && <label className="text-xs font-medium text-gray-600">{label}</label>}
      <input ref={inputRef} type="file" className="hidden" accept={accept}
        onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />

      {value ? (
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
          <FileText size={16} className="text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{fileName ?? value.split("/").pop()?.split("?")[0] ?? "Uploaded file"}</div>
            <a href={value} target="_blank" rel="noreferrer"
              className="text-[11px] text-green-600 hover:underline inline-flex items-center gap-0.5">
              View <ExternalLink size={10} />
            </a>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || uploadMut.isPending}
            title="Replace"
            className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded transition">
            <Upload size={14} />
          </button>
          <button type="button" onClick={clear} disabled={disabled}
            title="Remove"
            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || uploadMut.isPending}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:bg-green-50/40 hover:text-green-600 transition disabled:opacity-60">
          {uploadMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploadMut.isPending ? "Uploading..." : placeholder}
        </button>
      )}

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">{error}</p>
      )}
    </div>
  );
}
