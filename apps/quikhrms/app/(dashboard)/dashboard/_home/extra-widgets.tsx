"use client";

import { Smartphone, Sparkles, Clock } from "lucide-react";

export function MobileAppWidget() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-green-50 dark:from-slate-800 dark:to-green-950/40 ring-1 ring-gray-200 dark:ring-white/10 p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Mobile App</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[11px] font-medium uppercase tracking-wide">
              <Sparkles size={10} />
              Coming Soon
            </span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Access HRMS on the go — launching shortly</p>
          <button
            disabled
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400 text-xs font-medium cursor-not-allowed"
          >
            <Clock size={13} />
            Notify Me
          </button>
        </div>
        <div className="relative shrink-0">
          <div className="w-14 h-20 rounded-xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-md">
            <Smartphone size={26} className="text-white/90" />
          </div>
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400 ring-2 ring-white flex items-center justify-center shadow-sm">
            <Sparkles size={11} className="text-white" />
          </span>
        </div>
      </div>
    </div>
  );
}
