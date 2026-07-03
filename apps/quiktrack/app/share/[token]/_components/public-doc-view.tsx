import { Eye } from "lucide-react";
import { sanitizeRichText } from "@/lib/sanitize";
import type { PublicSharedDoc } from "@/lib/docs/public-share";

/**
 * SERVER-rendered view of a shared doc. Unlike the client editor, this needs no
 * client JS to show the document — the HTML is sanitized and streamed from the
 * server. That's what makes shared links open reliably in mobile in-app
 * browsers (Gmail/WhatsApp WebViews) where nonce + strict-dynamic CSP can stop
 * the React app from hydrating. Edit mode still hands off to the client editor.
 */

function Chrome({
  status,
  children,
}: {
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="h-5 w-5 rounded bg-blue-600 text-white text-[11px] grid place-items-center">
            Q
          </span>
          QuikTrack
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
          {status}
        </span>
      </header>
      <main className="mx-auto w-full max-w-[860px] px-5 py-8">{children}</main>
    </div>
  );
}

export function PublicDocView({ doc }: { doc: PublicSharedDoc }) {
  return (
    <Chrome
      status={
        <>
          <Eye className="w-3.5 h-3.5" />
          View only
        </>
      }
    >
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-8 sm:px-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 break-words">
            {doc.title || "Untitled doc"}
          </h1>
          <div
            className="qt-rich-content"
            dangerouslySetInnerHTML={{ __html: sanitizeRichText(doc.content) }}
          />
        </div>
      </div>
    </Chrome>
  );
}

export function PublicDocUnavailable() {
  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 px-6">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          This link is no longer available
        </h1>
        <p className="text-sm text-gray-500">
          The shared document may have been unshared or removed.
        </p>
      </div>
    </div>
  );
}
