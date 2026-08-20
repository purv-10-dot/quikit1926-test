"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";

export function IntroductionWidget() {
  return (
    <div>
      <div className="px-5 py-5 flex items-start gap-6">
        {/* Inline SVG illustration — Jira-style "people charting" hero. */}
        <svg
          viewBox="0 0 140 110"
          className="shrink-0 h-28 w-32"
          aria-hidden
        >
          <rect x="4" y="6" width="132" height="80" rx="6" fill="#eff6ff" stroke="#bfdbfe" />
          <polyline
            points="20,68 44,52 68,58 96,32 122,40"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="96" cy="32" r="3" fill="#22c55e" stroke="#fff" strokeWidth="1.5" />
          <rect x="44" y="86" width="20" height="20" rx="2" fill="#fde68a" />
          <rect x="74" y="86" width="20" height="20" rx="2" fill="#bfdbfe" />
        </svg>
        <div className="min-w-0">
          <h4 className="text-lg font-semibold text-gray-900 mb-1">
            Welcome to QuikTrack
          </h4>
          <p className="text-sm text-gray-700 leading-snug">
            Plan, track, and ship your team&apos;s work — all in one place.
          </p>
       
        </div>
      </div>
      <div className="px-5 py-2 border-t border-gray-100 text-[11px] text-gray-500 inline-flex items-center gap-1">
        <RotateCcw className="h-3 w-3" />
        Last refreshed just now
      </div>
    </div>
  );
}
