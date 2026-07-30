"use client";

import { useMemo } from "react";
import { Paperclip } from "lucide-react";
import { AttachmentCard } from "@/components/attachment-card";

interface ParsedFile {
  href: string;
  fileName: string;
  mime: string | null;
  size: number | null;
  /** Pre-formatted size from an older chip's label, when no numeric size. */
  sizeLabel: string | null;
  isImage: boolean;
  uploadedAt: string | null;
}

/** Best-effort filename from an /api/docs/asset key or URL path. */
function fileNameFromHref(href: string): string {
  try {
    const u = new URL(href, "http://x");
    const key = u.searchParams.get("key");
    const base = key
      ? decodeURIComponent(key).split("/").pop()
      : decodeURIComponent(u.pathname).split("/").pop();
    // Keys are prefixed with a uuid ("<uuid>-<name>"); strip it if present.
    if (base) return base.replace(/^[0-9a-f-]{20,}-/i, "");
  } catch {
    /* ignore */
  }
  return "";
}

function humanSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Add `download=1&name=<file>` to an /api/docs/asset URL so the server signs the
 * GCS URL with `Content-Disposition: attachment` — a real download rather than
 * opening in a new tab. Non-asset URLs pass through unchanged.
 */
function toDownloadHref(href: string, fileName: string): string {
  try {
    const u = new URL(href, "http://x");
    if (!u.pathname.includes("/api/docs/asset")) return href;
    u.searchParams.set("download", "1");
    u.searchParams.set("name", fileName);
    return u.pathname + "?" + u.searchParams.toString();
  } catch {
    return href;
  }
}

/** Derive a display name for an embedded image (no filename is stored on <img>). */
function imageName(src: string, index: number): string {
  try {
    const u = new URL(src, "http://x");
    const key = u.searchParams.get("key");
    if (key) {
      const base = decodeURIComponent(key).split("/").pop();
      if (base) return base;
    }
  } catch {
    /* ignore */
  }
  return `Image ${index + 1}`;
}

/**
 * Extract file attachments AND embedded images from a description's HTML. The
 * editor stores non-image files as `<a data-file-name>` chips and images as
 * plain `<img src>` (see components/editor/file-attachment.tsx +
 * rich-text-editor.tsx), so we collect both so every attached file shows here.
 */
function parseFiles(html: string): ParsedFile[] {
  if (typeof window === "undefined" || !html) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const seen = new Set<string>();
  const out: ParsedFile[] = [];

  // File chips. Match BOTH the newer `data-file-name` form AND the older
  // `class="qt-file-chip"` form (no data attrs) — older chips store only the
  // href + a "filename · size" text label, so we derive name/size from those.
  for (const a of Array.from(doc.querySelectorAll("a[data-file-name], a.qt-file-chip"))) {
    const href = a.getAttribute("href") ?? "";
    const label = (a.textContent ?? "").trim();
    // Newer form: explicit attribute. Older form: parse the "name · size" label.
    const attrName = a.getAttribute("data-file-name");
    const labelName = label.includes(" · ") ? label.slice(0, label.lastIndexOf(" · ")).trim() : label;
    const fileName = attrName || labelName || fileNameFromHref(href) || "file";
    const sizeRaw = a.getAttribute("data-file-size");
    const size = sizeRaw && Number.isFinite(Number(sizeRaw)) ? Number(sizeRaw) : null;
    const key = href || fileName;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      href,
      fileName,
      mime: a.getAttribute("data-file-mime"),
      size,
      // The label's trailing "· <size>" is kept for display when there's no
      // numeric data-file-size (older chips).
      sizeLabel: !size && label.includes(" · ") ? label.slice(label.lastIndexOf(" · ") + 3).trim() : null,
      isImage: false,
      uploadedAt: a.getAttribute("data-file-uploaded"),
    });
  }

  // Embedded images.
  const imgs = Array.from(doc.querySelectorAll("img"));
  imgs.forEach((img, i) => {
    const href = img.getAttribute("src") ?? "";
    if (!href || href.startsWith("data:") || seen.has(href)) return;
    seen.add(href);
    out.push({
      href,
      fileName: imageName(href, i),
      mime: "image/*",
      size: null,
      sizeLabel: null,
      isImage: true,
      uploadedAt: img.getAttribute("data-file-uploaded"),
    });
  });

  return out;
}

/**
 * File/image cards derived from a description's embedded files. Uses the shared
 * AttachmentCard so the Description's files look identical to the imported-
 * Attachments section. Renders nothing when the description has no files.
 *
 * `heading` controls whether the "Attachments (N)" title is shown:
 *   - false (default) → just the card grid, so it can sit directly under the
 *     Description text as part of that section (what the UI wants).
 *   - true → a standalone "Attachments (N)" section.
 */
export function DescriptionAttachments({
  html,
  heading = false,
}: {
  html: string | null | undefined;
  heading?: boolean;
}) {
  const files = useMemo(() => parseFiles(html ?? ""), [html]);
  if (files.length === 0) return null;

  return (
    <div className={heading ? "mt-6" : "mt-2"}>
      {heading && (
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-gray-500" />
          Attachments
          <span className="text-gray-500 font-normal">({files.length})</span>
        </h3>
      )}
      <ul className="flex flex-wrap gap-3">
        {files.map((f, i) => (
          <li key={`${f.href}-${i}`}>
            <AttachmentCard
              fileName={f.fileName}
              size={humanSize(f.size) || f.sizeLabel || ""}
              mime={f.mime}
              previewHref={f.href}
              imageSrc={f.isImage ? f.href : null}
              downloadHref={toDownloadHref(f.href, f.fileName)}
              uploadedAt={f.uploadedAt}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
