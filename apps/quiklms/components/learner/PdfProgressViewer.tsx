'use client';
/**
 * PDF Progress Viewer with scroll-based completion tracking.
 *
 * PDFs are fetched through a backend proxy (authenticated) so pdf.js
 * can load them as blobs without CORS restrictions. Pages render as
 * canvases inside a scrollable container; scroll depth drives the
 * completion percentage. 90 % scroll is mandatory.
 *
 * Ported from the old QuikLMSs frontend `src/components/learner/PdfProgressViewer.tsx`.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { AlertCircle, CheckCircle, Clock, Maximize, Minimize } from 'lucide-react';
import { api } from '@/lib/api';

if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

/* ─── Props ──────────────────────────────────────────────────────────── */

interface PdfProgressViewerProps {
  fileUrl: string;
  courseId: string;
  lessonId: string;
  title?: string;
  initialPage?: number;
  initialProgress?: number;
  initialScrollPosition?: number;
  onProgress?: (percentage: number) => void;
  onComplete?: () => void;
  onXAPIStatement?: (verb: string, result?: any) => void;
}

/* ─── Component ──────────────────────────────────────────────────────── */

const PdfProgressViewer: React.FC<PdfProgressViewerProps> = ({
  fileUrl,
  courseId,
  lessonId,
  title = 'PDF Document',
  initialPage = 1,
  initialProgress = 0,
  initialScrollPosition = 0,
  onProgress,
  onComplete,
  onXAPIStatement,
}) => {
  const alreadyCompleted = initialProgress >= 90;

  /* ── core state ────────────────────────────────────────────────────── */
  const [numPages, setNumPages] = useState<number | null>(null);
  const [progress, setProgress] = useState(alreadyCompleted ? 100 : initialProgress);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isCompleted, setIsCompleted] = useState(alreadyCompleted);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfSource, setPdfSource] = useState<string | null>(null);

  /* ── refs (avoid stale closures in timers / scroll handlers) ─────── */
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRootRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLaunched = useRef(false);
  const maxScrollDepthRef = useRef(alreadyCompleted ? 1 : initialProgress / 100);
  const completedRef = useRef(alreadyCompleted);
  const sessionStartRef = useRef(Date.now());

  const progressRef = useRef(progress);
  const currentPageRef = useRef(currentPage);
  const scrollPositionRef = useRef(initialScrollPosition);
  const viewedPagesRef = useRef<Set<number>>(new Set([initialPage]));
  const numPagesRef = useRef(numPages);

  // Keep refs in sync — runs after every render but is very cheap
  progressRef.current = progress;
  currentPageRef.current = currentPage;
  numPagesRef.current = numPages;

  /* ── memoised values that MUST be stable across renders ────────────
     (prevents react-pdf from re-parsing the PDF on every tick)        */
  const documentOptions = useMemo(
    () => ({
      cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
    }),
    [],
  );

  const pageWidth = useMemo(
    () => Math.min(isFullscreen ? 1000 : 800, window.innerWidth - 48),
    [isFullscreen],
  );

  /* ── helpers ────────────────────────────────────────────────────── */
  const getSessionTime = () => Math.floor((Date.now() - sessionStartRef.current) / 1000);
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const sendXAPI = useCallback(
    (verb: string, result?: any) => { if (onXAPIStatement) onXAPIStatement(verb, result); },
    [onXAPIStatement],
  );

  /* ── 1. fetch PDF blob via authenticated proxy ─────────────────── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // The shared api client always JSON-parses its response body, so the
        // binary proxy response is fetched directly (same `/api` prefix and
        // cookie credentials the api client uses).
        const res = await fetch(
          `/api/learner/file-proxy?url=${encodeURIComponent(fileUrl)}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error(`Proxy responded ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setPdfSource(url);
      } catch {
        if (!cancelled) setPdfSource(fileUrl);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    };
  }, [fileUrl]);

  /* ── 2. periodic backend sync (every 15 s) ─────────────────────── */
  useEffect(() => {
    const sync = async () => {
      if (!numPagesRef.current) return;
      const pos = scrollPositionRef.current;
      try {
        await api.patch('/player/sync', {
          courseId, lessonId,
          completionPercentage: progressRef.current,
          currentPosition: `scroll:${pos}`,
          suspendData: JSON.stringify({
            lesson_location: `scroll:${pos}`,
            currentPage: currentPageRef.current,
            scrollPosition: pos,
            viewedPages: Array.from(viewedPagesRef.current),
            sessionTime: getSessionTime(),
            lastAccessed: new Date().toISOString(),
          }),
          status: completedRef.current ? 'completed' : 'in_progress',
        });
      } catch { /* silent */ }
    };

    syncIntervalRef.current = setInterval(sync, 15000);
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); sync(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonId]);

  /* ── 3. completion handler ─────────────────────────────────────── */
  const handleComplete = useCallback(async () => {
    try {
      await api.post('/learner/complete-resource', {
        courseId,
        subModuleId: lessonId,
        type: 'pdf',
        percentRead: 100,
        lastPageSeen: currentPageRef.current,
        sessionTime: getSessionTime(),
      });
      sendXAPI('completed', { completion: true, success: true, duration: `PT${getSessionTime()}S` });
      if (onComplete) onComplete();
    } catch (err: unknown) {
      console.error('[PDFViewer] complete error', err);
    }
  }, [courseId, lessonId, onComplete, sendXAPI]);

  /* ── 4. page observer + scroll restore ─────────────────────────── */
  useEffect(() => {
    if (!numPages || !containerRef.current) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          const pg = parseInt(e.target.getAttribute('data-page-number') || '1');
          viewedPagesRef.current.add(pg);
        }
      }),
      { threshold: 0.15 },
    );
    containerRef.current.querySelectorAll('.pdf-page-wrapper')
      .forEach((el) => observerRef.current?.observe(el));

    // restore previous position
    if (initialScrollPosition > 0) {
      requestAnimationFrame(() => containerRef.current?.scrollTo({ top: initialScrollPosition, behavior: 'smooth' }));
    } else if (initialPage > 1) {
      containerRef.current.querySelector(`[data-page-number="${initialPage}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return () => { observerRef.current?.disconnect(); };
  }, [numPages, initialPage, initialScrollPosition]);

  /* ── 5. scroll handler — drives progress % ─────────────────────── */
  useEffect(() => {
    const c = containerRef.current;
    if (!c || !numPages) return;

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = c;
      const maxScrollable = scrollHeight - clientHeight;
      if (maxScrollable <= 0) return;

      scrollPositionRef.current = Math.round(scrollTop);

      const depth = Math.min(1, (scrollTop + clientHeight) / scrollHeight);
      if (depth > maxScrollDepthRef.current) maxScrollDepthRef.current = depth;

      const pct = Math.min(100, Math.round(maxScrollDepthRef.current * 100));
      setProgress((prev) => {
        const next = Math.max(prev, pct);
        if (next !== prev && onProgress) onProgress(next);
        return next;
      });

      // detect current page
      const pages = c.querySelectorAll('.pdf-page-wrapper');
      const off = scrollTop + 200;
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i] as HTMLElement;
        if (off >= p.offsetTop && off < p.offsetTop + p.offsetHeight) {
          setCurrentPage(parseInt(p.getAttribute('data-page-number') || '1'));
          break;
        }
      }

      // strict 90 % threshold → mark complete (progress stays at real scroll depth)
      if (pct >= 90 && !completedRef.current) {
        completedRef.current = true;
        setIsCompleted(true);
        handleComplete();
      }
    };

    c.addEventListener('scroll', onScroll, { passive: true });
    return () => c.removeEventListener('scroll', onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, handleComplete]);

  /* ── 6. react-pdf callbacks ────────────────────────────────────── */
  const onDocLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setLoading(false);
    setError(null);
  }, []);

  const onDocLoadError = useCallback((err: Error) => {
    console.error('[PDFViewer] load error:', err.message);
    setError(`Failed to load PDF: ${err.message || 'Unknown error'}`);
    setLoading(false);
  }, []);

  /* ── 7. xAPI launched ──────────────────────────────────────────── */
  useEffect(() => {
    if (!hasLaunched.current && numPages) { hasLaunched.current = true; sendXAPI('launched'); }
  }, [numPages, sendXAPI]);

  /* ── 8. fullscreen ─────────────────────────────────────────────── */
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await viewerRootRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* not supported */ }
  };

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  /* ── 9. session clock display (updates DOM directly, no state) ── */
  const clockRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      if (clockRef.current) clockRef.current.textContent = formatTime(getSessionTime());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div ref={viewerRootRef} className={`flex flex-col bg-slate-100 ${isFullscreen ? 'h-screen' : 'h-full min-h-0 overflow-hidden'}`}>

      {/* header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm border-b border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          {isCompleted && (
            <span className="flex items-center gap-1 text-sm text-green-600 font-medium shrink-0">
              <CheckCircle className="w-4 h-4" /> Completed
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500">
            <Clock className="w-4 h-4" /> <span ref={clockRef}>0:00</span>
          </span>
          <span className="text-sm text-gray-500">Page {currentPage} / {numPages || '…'}</span>
          <div className="flex items-center gap-2">
            <div className="w-40 sm:w-56 bg-slate-200 rounded-full h-2.5">
              <div className="bg-gradient-to-r from-emerald-500 to-green-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-sm font-bold text-gray-700 min-w-[2.5rem] text-right">{progress}%</span>
          </div>
          <button onClick={toggleFullscreen} className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-600" title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* error */}
      {error && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center p-6">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 font-semibold mb-2">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">Reload PDF</button>
          </div>
        </div>
      )}

      {/* loading */}
      {loading && !error && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading PDF…</p>
          </div>
        </div>
      )}

      {/* pages */}
      {!error && pdfSource && (
        <div ref={containerRef} className={`flex-1 min-h-0 overflow-y-auto px-4 py-6 sm:px-8 space-y-6 flex flex-col items-center ${numPages ? '' : 'hidden'}`}>
          <Document file={pdfSource} onLoadSuccess={onDocLoadSuccess} onLoadError={onDocLoadError} options={documentOptions} loading={null} error={null}>
            {numPages
              ? Array.from({ length: numPages }, (_, i) => (
                  <div key={`page_${i + 1}`} data-page-number={i + 1} className="pdf-page-wrapper shadow-lg bg-white rounded-sm">
                    <Page pageNumber={i + 1} width={pageWidth} renderTextLayer={true} renderAnnotationLayer={true} />
                  </div>
                ))
              : null}
          </Document>
        </div>
      )}

      {/* scroll reminder */}
      {progress < 90 && !isCompleted && numPages && (
        <div className="sticky bottom-0 bg-amber-50 border-t border-amber-200 px-4 py-2.5 text-center">
          <p className="text-sm text-amber-800">Scroll through at least <strong>90%</strong> of the document to mark this lesson complete.</p>
        </div>
      )}
    </div>
  );
};

export default PdfProgressViewer;
