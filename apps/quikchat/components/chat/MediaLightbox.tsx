"use client";

import { useEffect } from "react";

export interface LightboxItem {
  url: string;
  mediaType: string;
  originalName?: string;
}

export interface MediaLightboxProps {
  items: LightboxItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}

/**
 * Fullscreen media viewer (image/video) with prev/next + download. Rendered as
 * an overlay inside the `.qc-frame` (absolute, no `position:fixed`, per the
 * shell rule). Esc / backdrop close.
 */
export function MediaLightbox({ items, index, onIndex, onClose }: MediaLightboxProps) {
  const item = items[index];
  const many = items.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && many) onIndex((index + 1) % items.length);
      else if (e.key === "ArrowLeft" && many) onIndex((index - 1 + items.length) % items.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, items.length, many, onIndex, onClose]);

  if (!item) return null;

  return (
    <div
      className="qc-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={item.originalName ?? "Media viewer"}
      onMouseDown={onClose}
    >
      <div className="qc-lightbox__stage" onMouseDown={(e) => e.stopPropagation()}>
        {item.mediaType === "application/pdf" ? (
          <iframe
            className="qc-lightbox__pdf"
            src={item.url}
            title={item.originalName ?? "PDF preview"}
          />
        ) : item.mediaType.startsWith("video/") ? (
          <video className="qc-lightbox__media" src={item.url} controls autoPlay />
        ) : (
          <img className="qc-lightbox__media" src={item.url} alt={item.originalName ?? "image"} />
        )}

        {many ? (
          <>
            <button
              type="button"
              className="qc-lightbox__nav qc-lightbox__nav--prev"
              aria-label="Previous"
              onClick={() => onIndex((index - 1 + items.length) % items.length)}
            >
              ‹
            </button>
            <button
              type="button"
              className="qc-lightbox__nav qc-lightbox__nav--next"
              aria-label="Next"
              onClick={() => onIndex((index + 1) % items.length)}
            >
              ›
            </button>
          </>
        ) : null}
      </div>

      <div className="qc-lightbox__bar" onMouseDown={(e) => e.stopPropagation()}>
        <span className="qc-lightbox__name">{item.originalName ?? "Media"}</span>
        <span className="qc-lightbox__actions">
          <a
            className="qc-btn"
            href={item.url}
            download={item.originalName}
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>
          <button type="button" className="qc-btn" onClick={onClose} aria-label="Close">
            Close
          </button>
        </span>
      </div>
    </div>
  );
}
