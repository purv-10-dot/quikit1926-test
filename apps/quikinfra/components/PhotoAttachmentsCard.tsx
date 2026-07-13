"use client";

/**
 * PhotoAttachmentsCard — renders a small uppercase label + a row of
 * compact 80px clickable thumbnails for the comma-separated photo-URL
 * columns used by Material Issue / Good Return / Gate Pass.
 *
 * Designed to be **embedded** inside an existing detail-page overview
 * card (next to Purpose / Remarks etc.) — it deliberately doesn't
 * carry its own card chrome (border, shadow) so it sits cohesively
 * with the surrounding fields.
 *
 * Each thumbnail tries to render the URL as an `<img>` first; if the
 * load fails (broken URL, non-image content, etc.) it gracefully
 * falls back to a file-icon chip showing the filename. URLs that
 * aren't absolute paths or `http(s)` links render as static chips so
 * the user doesn't get a 404 from clicking a stale legacy filename.
 *
 * Returns `null` when there are no usable URLs so callers can drop it
 * inline without guarding for the empty case.
 */

import { useState } from "react";
import { FileText, Paperclip } from "lucide-react";

interface Props {
  title: string;
  /** Raw column value — comma-separated URLs (or filenames on legacy
   *  rows that predate the upload pipeline). */
  raw: string | null | undefined;
  /** "thumbnails" (default) renders 80px image tiles; "compact" renders
   *  a list of paperclip-icon + filename links — same style as the
   *  GRN Challan Attachment field. */
  variant?: "thumbnails" | "compact";
}

export function PhotoAttachmentsCard({ title, raw, variant = "thumbnails" }: Props) {
  const urls = String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((u) => u && u !== "—");
  if (urls.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
        {title} ({urls.length})
      </div>
      {variant === "compact" ? (
        <div className="flex flex-col gap-1.5">
          {urls.map((url, idx) => (
            <PhotoLink key={`${url}-${idx}`} url={url} index={idx} />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {urls.map((url, idx) => (
            <PhotoThumb key={`${url}-${idx}`} url={url} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoLink({ url, index }: { url: string; index: number }) {
  const name =
    url.split("/").pop()?.split("?")[0] || `File ${index + 1}`;
  const isOpenable = /^(\/|https?:\/\/)/.test(url);
  if (!isOpenable) {
    return (
      <span
        title={`${name} — original file is not available`}
        className="inline-flex items-center gap-1 text-xs text-gray-500 max-w-full"
      >
        <Paperclip className="w-3 h-3 shrink-0" />
        <span className="truncate">{name}</span>
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline font-medium text-xs max-w-full"
    >
      <Paperclip className="w-3 h-3 shrink-0" />
      <span className="truncate">{name}</span>
    </a>
  );
}

function PhotoThumb({ url, index }: { url: string; index: number }) {
  // `imgFailed` flips when the <img> errors out — common on PDFs and
  // on legacy rows where the column held a bare filename rather than
  // a real upload URL. We swap to the file-icon chip on error so the
  // user still sees a useful tile.
  const [imgFailed, setImgFailed] = useState(false);
  const name =
    url.split("/").pop()?.split("?")[0] || `File ${index + 1}`;
  const isPdf = /\.pdf(\?|$)/i.test(url);
  const isOpenable = /^(\/|https?:\/\/)/.test(url);
  const showImage = !isPdf && !imgFailed && isOpenable;

  const inner = showImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      onError={() => setImgFailed(true)}
      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
    />
  ) : (
    <>
      <FileText className="w-6 h-6 text-gray-400" />
      <span className="text-[9px] text-gray-600 text-center break-all line-clamp-2">
        {name}
      </span>
    </>
  );

  const imageCls =
    "group relative block w-20 h-20 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 hover:border-orange-300 transition-colors shrink-0";
  const chipCls =
    "w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 hover:border-orange-300 hover:bg-white transition-colors flex flex-col items-center justify-center gap-1 p-1.5 shrink-0";

  if (isOpenable) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={name}
        className={showImage ? imageCls : chipCls}
      >
        {inner}
      </a>
    );
  }
  // Stale filename-only legacy row — keep the chip, but don't pretend
  // it's clickable since there's nothing on the server to open.
  return (
    <div
      title={`${name} — original file is not available`}
      className={`${chipCls} cursor-not-allowed opacity-70`}
    >
      {inner}
    </div>
  );
}
