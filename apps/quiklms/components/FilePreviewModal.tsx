'use client';
/**
 * FilePreviewModal — open a stored file IN the app instead of punting to a new tab.
 *
 * Every homework surface rendered its files as `<a target="_blank">`, so reviewing
 * a class's submissions meant leaving the grading screen for each one and coming
 * back. The teacher needs the file and the score box on the same screen; that is
 * the whole point of the review step.
 *
 * WHAT IT RECEIVES. A presigned GET URL — the read paths already attach one
 * (`enrichHomework` / `enrichSubmission` → `presignFromUrlOrKey`), because the
 * bucket is PRIVATE and the permanent URL 403s on its own. Nothing here signs
 * anything; hand it the URL the API returned and it renders. The signature is good
 * for an hour, which outlives any modal.
 *
 * WHAT IT RENDERS INLINE. PDF, image, video, audio — the four the browser can
 * display with no help. Office formats are deliberately NOT iframed through the
 * Office/Google viewers: those fetch the URL from their own servers, which is
 * unreliable against a signed, expiring URL (see the note in
 * `components/learner/SCORMDocumentViewer.tsx`), and a viewer that usually shows
 * an error is worse than an honest download button. Those get Open + Download.
 *
 * TODO(integration): upstream to @quikit/ui — nothing here is LMS-specific.
 */
import { useEffect } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';
import { fileNameOf, kindOf } from '@/lib/utils/file-kind';

interface FilePreviewModalProps {
  /** Presigned GET URL, as returned by the API. */
  url: string;
  /** Shown in the header; defaults to the name derived from the URL. */
  fileName?: string;
  onClose: () => void;
}

export default function FilePreviewModal({ url, fileName, onClose }: FilePreviewModalProps) {
  const name = fileName || fileNameOf(url);
  const kind = kindOf(url);

  // Escape closes, and the page behind must not scroll while the overlay is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${name}`}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-gray-700">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-5 w-5 shrink-0 text-accent-600" />
            <h3 className="truncate font-semibold text-gray-900 dark:text-gray-100">{name}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in a new tab"
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href={url}
              download={name}
              title="Download"
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              onClick={onClose}
              title="Close"
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          {kind === 'pdf' && (
            <iframe src={url} title={name} className="h-full w-full border-0" />
          )}
          {kind === 'image' && (
            <div className="flex h-full items-center justify-center p-4">
              {/* Storage URLs are signed and expiring — next/image would try to
                  optimise a URL that dies in an hour, and the loader is not
                  configured for the bucket host. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {kind === 'video' && (
            <div className="flex h-full items-center justify-center p-4">
              <video src={url} controls className="max-h-full max-w-full" />
            </div>
          )}
          {kind === 'audio' && (
            <div className="flex h-full items-center justify-center p-8">
              <audio src={url} controls className="w-full max-w-lg" />
            </div>
          )}
          {kind === 'other' && (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
              <FileText className="h-16 w-16 text-gray-300 dark:text-gray-600" />
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">{name}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  This file type can&apos;t be shown inline. Open or download it to review.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open
                </a>
                <a
                  href={url}
                  download={name}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
