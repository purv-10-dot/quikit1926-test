"use client";

import { useState, useEffect } from "react";

/**
 * <img> wrapper that renders an "Image unavailable" glass placeholder
 * if the source URL fails to load (404 / 403 / DNS / CORS).
 *
 * Used everywhere a product or service image might surface a stale
 * scraper-CDN URL instead of a Cloudinary URL — until the
 * /api/admin/fix-product-images backfill runs and rehosts them.
 *
 * The fallback dimensions are taken from the parent container, so
 * callers should give the wrapper an explicit width/height (or wrap
 * it in a sized div) — same contract as a normal <img>.
 */
export function ImageWithFallback({
  src,
  alt,
  className,
  style,
  fallbackText = "Image unavailable",
  fallbackStyle,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackText?: string;
  fallbackStyle?: React.CSSProperties;
}) {
  const [errored, setErrored] = useState(false);

  // Reset the error state if the caller swaps to a different URL
  // (e.g. the user picks a new image in the modal).
  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (!src || errored) {
    return (
      <div
        aria-label={alt || "Image unavailable"}
        style={{
          width: "100%",
          height: "100%",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.30)",
          fontSize: 12,
          fontWeight: 400,
          textAlign: "center",
          padding: 4,
          boxSizing: "border-box",
          ...fallbackStyle,
        }}
      >
        {fallbackText}
      </div>
    );
  }

  return (
    // Plain <img> on purpose — next/image rejects non-Cloudinary hosts
    // per next.config.js remotePatterns, and these are the URLs we're
    // specifically trying to display before the backfill rehosts them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setErrored(true)}
    />
  );
}

export default ImageWithFallback;
