"use client";

/**
 * Knowledge-Base figure slot.
 *
 * Renders `/kb/screens/<file>` when that PNG has been added to the app's
 * `public` folder, and an illustrated wireframe placeholder describing what the
 * screenshot should contain when it has not. That keeps the book readable and
 * self-documenting before any capture work has been done — and makes the
 * outstanding captures obvious to whoever is doing them.
 *
 * Capture the real screenshots with `npm run kb:screens` (see
 * `scripts/capture-kb-screens.ts`); the same slot list drives that script, the
 * PDF export and `public/kb/screens/README.md`.
 */

import { useState } from "react";
import { Camera } from "lucide-react";

export const KB_SCREEN_DIR = "/kb/screens";

/** A generic app-window wireframe — sidebar, toolbar, grid — drawn to scale. */
function Wireframe() {
  return (
    <svg viewBox="0 0 240 150" role="presentation" className="h-full w-full">
      <rect x="0" y="0" width="240" height="150" rx="4" fill="#FFFFFF" stroke="#E5E7EB" />
      {/* sidebar */}
      <rect x="0" y="0" width="52" height="150" rx="4" fill="#F9FAFB" />
      <line x1="52" y1="0" x2="52" y2="150" stroke="#E5E7EB" />
      <rect x="8" y="10" width="30" height="5" rx="2.5" fill="#D1D5DB" />
      {[26, 38, 50, 62, 74, 86].map((y) => (
        <rect key={y} x="8" y={y} width="34" height="4" rx="2" fill="#E5E7EB" />
      ))}
      {/* header */}
      <line x1="52" y1="20" x2="240" y2="20" stroke="#E5E7EB" />
      <rect x="60" y="8" width="46" height="5" rx="2.5" fill="#D1D5DB" />
      <circle cx="224" cy="10.5" r="5" fill="#E5E7EB" />
      {/* toolbar */}
      <rect x="60" y="29" width="40" height="5" rx="2.5" fill="#D1D5DB" />
      <rect x="196" y="27" width="36" height="9" rx="3" fill="#DBEAFE" />
      {/* grid */}
      <rect x="60" y="44" width="172" height="10" rx="2" fill="#EFF6FF" />
      {[58, 72, 86, 100, 114, 128].map((y) => (
        <g key={y}>
          <rect x="60" y={y} width="60" height="4" rx="2" fill="#E5E7EB" />
          <rect x="126" y={y} width="34" height="4" rx="2" fill="#F3F4F6" />
          <rect x="166" y={y} width="14" height="4" rx="2" fill="#F3F4F6" />
          <rect x="186" y={y} width="14" height="4" rx="2" fill="#F3F4F6" />
          <rect x="206" y={y} width="14" height="4" rx="2" fill="#F3F4F6" />
        </g>
      ))}
    </svg>
  );
}

export function KBFigure({
  file,
  caption,
  hint,
}: {
  file: string;
  caption: string;
  hint: string;
}) {
  const [missing, setMissing] = useState(false);

  return (
    <figure className="my-5">
      {missing ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <div className="h-[120px] w-full flex-shrink-0 rounded-md bg-gray-50 p-2 sm:w-[200px]">
              <Wireframe />
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                <Camera className="h-3 w-3" />
                Screenshot not captured yet
              </p>
              <p className="mt-1.5 text-sm font-medium text-gray-800">{caption}</p>
              <p className="mt-1 text-sm leading-6 text-gray-500">{hint}</p>
              <p className="mt-2 font-mono text-[11px] text-gray-400">
                {KB_SCREEN_DIR}/{file}
              </p>
            </div>
          </div>
          <p className="border-t border-gray-100 bg-gray-50/60 px-4 py-2 text-[11px] text-gray-500">
            Run <span className="font-mono text-gray-600">npm run kb:screens</span> to capture this
            from your own installation.
          </p>
        </div>
      ) : (
        <div className="flex justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-2">
          {/* Never upscale. Captures range from a 219px-wide sidebar strip to a
              4273px-wide week grid; `w-full` blew the narrow ones up ~5× into a
              blurry mess. `w-auto` + max constraints means small crops render at
              their true size and only oversized ones are scaled down. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${KB_SCREEN_DIR}/${file}`}
            alt={caption}
            onError={() => setMissing(true)}
            className="block h-auto max-h-[560px] w-auto max-w-full rounded"
          />
        </div>
      )}
      <figcaption className="mt-2 text-xs text-gray-500">{caption}</figcaption>
    </figure>
  );
}
