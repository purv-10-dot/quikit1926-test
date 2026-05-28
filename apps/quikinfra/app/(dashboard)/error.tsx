"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Structured error log; wire to Sentry by swapping this line
    console.error("[dashboard.error]", { message: error.message, digest: error.digest, stack: error.stack });
  }, [error]);

  return (
    <div className="p-8 max-w-2xl">
      <div className="rounded-lg border border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-red-900">Something broke on this page</h2>
            <p className="text-xs text-red-800 mt-1 break-words">{error.message}</p>
            {error.digest && <p className="text-[10px] text-red-600 font-mono mt-1">ref: {error.digest}</p>}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={reset} className="text-xs inline-flex items-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700">
            <RotateCw className="h-3 w-3" /> Try again
          </button>
          <button onClick={() => (window.location.href = "/dashboard")} className="text-xs border border-red-200 bg-white text-red-700 px-3 py-1.5 rounded hover:bg-red-100">
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
