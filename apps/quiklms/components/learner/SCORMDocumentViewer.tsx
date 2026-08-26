'use client';
/**
 * Document Viewer for DOC/DOCX/XLS/XLSX and other Office files
 *
 * Ported from the old QuikLMSs frontend `src/components/learner/SCORMDocumentViewer.tsx`.
 *
 * Uses Microsoft Office Online or Google Docs Viewer in an iframe.
 * When iframe fails (common with presigned S3 URLs), shows a download
 * prompt with a manual "Mark as Complete" button.
 *
 * Progress is scroll-based: the iframe is rendered taller than the
 * visible area, forcing the user to scroll the outer container. Scroll
 * depth drives the progress percentage. Completion at 90% scroll depth.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  CheckCircle, AlertCircle, Clock, Download,
  FileText, ExternalLink, Eye
} from 'lucide-react';
import { api } from '@/lib/api';

interface SCORMDocumentViewerProps {
  fileUrl: string;
  courseId: string;
  lessonId: string;
  title?: string;
  onComplete?: () => void;
  onXAPIStatement?: (verb: string, result?: any) => void;
}

const SCORMDocumentViewer: React.FC<SCORMDocumentViewerProps> = ({
  fileUrl,
  courseId,
  lessonId,
  title = 'Document',
  onComplete,
  onXAPIStatement,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionTime, setSessionTime] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [viewerMode, setViewerMode] = useState<'office' | 'google' | 'direct'>('office');

  const isCompletedRef = useRef(false);
  const progressRef = useRef(0);
  const sessionTimeRef = useRef(0);
  const sessionStartRef = useRef<number>(Date.now());
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasLaunched = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const maxScrollDepthRef = useRef(0);

  useEffect(() => { isCompletedRef.current = isCompleted; }, [isCompleted]);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { sessionTimeRef.current = sessionTime; }, [sessionTime]);

  const getFileExtension = (url: string): string => {
    const cleanUrl = url.split('?')[0].split('#')[0];
    return cleanUrl.split('.').pop()?.toLowerCase() || '';
  };
  const fileExt = getFileExtension(fileUrl);
  const isOfficeFile = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt);
  const isPdf = fileExt === 'pdf';

  const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
  const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;

  const getViewerUrl = (): string => {
    if (isPdf) return fileUrl;
    if (viewerMode === 'office' && isOfficeFile) return officeViewerUrl;
    if (viewerMode === 'google') return googleViewerUrl;
    return fileUrl;
  };
  const viewerUrl = getViewerUrl();

  const sendXAPI = useCallback((verb: string, result?: any) => {
    if (onXAPIStatement) onXAPIStatement(verb, result);
  }, [onXAPIStatement]);

  // Session time tracking (for analytics only, NOT for progress)
  useEffect(() => {
    sessionStartRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      setSessionTime(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Scroll-based progress tracking on the outer container
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || loading) return;

    const handleScroll = () => {
      if (isCompletedRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const maxScrollable = scrollHeight - clientHeight;
      if (maxScrollable <= 0) return;

      const depth = Math.min(1, (scrollTop + clientHeight) / scrollHeight);
      if (depth > maxScrollDepthRef.current) {
        maxScrollDepthRef.current = depth;
      }

      const newProgress = Math.min(100, Math.round(maxScrollDepthRef.current * 100));
      setProgress((prev) => Math.max(prev, newProgress));

      const reachedBottom = scrollTop + clientHeight >= scrollHeight - 8;
      if ((newProgress >= 90 || reachedBottom) && !isCompletedRef.current) {
        handleComplete();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (!hasLaunched.current) {
      hasLaunched.current = true;
      sendXAPI('launched');
    }
  }, [sendXAPI]);

  const syncProgressToBackend = useCallback(async () => {
    if (isCompletedRef.current) return;
    const pct = progressRef.current;
    const time = sessionTimeRef.current;
    try {
      await api.patch('/player/sync', {
        courseId,
        lessonId,
        completionPercentage: pct,
        currentPosition: `scroll:${pct}`,
        status: 'in_progress',
      });
    } catch { /* non-critical */ }
  }, [courseId, lessonId]);

  useEffect(() => {
    syncIntervalRef.current = setInterval(syncProgressToBackend, 15000);
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [syncProgressToBackend]);

  const handleComplete = async () => {
    if (isCompletedRef.current) return;
    isCompletedRef.current = true;
    setIsCompleted(true);
    setProgress(100);

    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    if (onComplete) onComplete();

    try {
      await api.post('/learner/complete-resource', {
        courseId,
        subModuleId: lessonId,
        type: 'document',
        percentRead: 100,
        sessionTime: sessionTimeRef.current,
      });
    } catch { /* non-critical */ }

    sendXAPI('completed', { completion: true, success: true, duration: `PT${sessionTimeRef.current}S` });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleIframeLoad = () => {
    if (iframeLoadTimeoutRef.current) clearTimeout(iframeLoadTimeoutRef.current);
    setIframeLoaded(true);
    setLoading(false);
  };

  const handleIframeError = () => {
    if (iframeLoadTimeoutRef.current) clearTimeout(iframeLoadTimeoutRef.current);
    if (viewerMode === 'office') { setViewerMode('google'); setLoading(true); return; }
    if (viewerMode === 'google') { setViewerMode('direct'); setLoading(true); return; }
    setError('Failed to load document viewer. Please try downloading the file.');
    setLoading(false);
  };

  useEffect(() => {
    if (loading && !iframeLoaded) {
      iframeLoadTimeoutRef.current = setTimeout(() => {
        if (!iframeLoaded && viewerMode === 'office') setViewerMode('google');
        else if (!iframeLoaded && viewerMode === 'google') setViewerMode('direct');
        else if (!iframeLoaded) setLoading(false);
      }, 8000);
    }
    return () => { if (iframeLoadTimeoutRef.current) clearTimeout(iframeLoadTimeoutRef.current); };
  }, [loading, iframeLoaded, viewerMode]);

  const completionControls = (
    <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-48 bg-slate-200 rounded-full h-2.5">
            <div
              className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm font-bold text-gray-700 min-w-[3rem]">{progress}%</span>
        </div>
        <div className="text-sm text-gray-600">
          {isCompleted ? (
            <span className="text-green-600 font-medium flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              Document completed! You may proceed to the next lesson.
            </span>
          ) : (
            <span className="text-blue-600">
              Scroll through the document to track progress
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!error && (
            <a
              href={viewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open in new tab
            </a>
          )}
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="flex flex-col h-full bg-slate-100">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-6 max-w-md">
            <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <p className="text-gray-700 font-semibold mb-2">This file cannot be previewed in the browser.</p>
            <p className="text-gray-500 text-sm mb-6">Please download and review it, then mark as complete below.</p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mb-4"
            >
              <Download className="w-5 h-5" />
              Download &amp; Review
            </a>
            <button
              onClick={handleComplete}
              disabled={isCompleted}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors mx-auto mt-4 ${
                isCompleted
                  ? 'bg-green-100 text-green-700 cursor-default'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <CheckCircle className="w-5 h-5" />
              {isCompleted ? 'Completed' : 'Mark as Complete'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100">
      <div className="sticky top-0 z-10 bg-white p-4 shadow-sm border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <FileText className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {isCompleted && (
              <span className="flex items-center gap-1 text-sm text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
                <CheckCircle className="w-4 h-4" />
                Completed
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4" />
              <span>{formatTime(sessionTime)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-32 bg-slate-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-sm font-bold text-gray-700 min-w-[3rem]">{progress}%</span>
            </div>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </a>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-blue-700">
          <Eye className="w-3 h-3 inline mr-1" />
          Scroll through the document below to track your reading progress.
        </p>
        {!isPdf && (
          <div className="flex items-center gap-1">
            {(['office', 'google', 'direct'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setViewerMode(mode); setLoading(true); setIframeLoaded(false); }}
                className={`text-xs px-2 py-0.5 rounded ${viewerMode === mode ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
              >
                {mode === 'office' ? 'Office' : mode === 'google' ? 'Google' : 'Direct'}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading document...</p>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto ${loading ? 'hidden' : ''}`}
      >
        <iframe
          ref={iframeRef}
          src={viewerUrl}
          className="w-full border-0 rounded-lg border border-gray-200 bg-white"
          style={{ height: '250vh', minHeight: '2000px' }}
          title={title}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          allow="fullscreen"
        />
      </div>

      {completionControls}

      {!loading && (
        <div className="text-center text-xs text-gray-500 pb-2">
          If the document doesn't display correctly, use the Download button to view it directly.
        </div>
      )}
    </div>
  );
};

export default SCORMDocumentViewer;
