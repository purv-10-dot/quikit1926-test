'use client';
/**
 * DOM-event proctoring engine for EXAM sessions.
 *
 * Ported from the old QuikLMSs frontend (src/hooks/useProctoringEngine.ts) and
 * re-pointed at the NEW Next.js backend:
 *   POST /api/proctoring/:sessionId/event   { eventType, metadata }
 *
 * Captures tab switches, fullscreen exits, copy/paste, right-click, print and
 * dev-tools shortcuts, window blur and beforeunload. Needs no external deps —
 * everything here is plain DOM events. Events are queued and flushed in order
 * through the shared `@/lib/api` client (which prefixes `/api` automatically).
 */
import { useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface ProctoringOptions {
  sessionId: string | null;
  enabled: boolean;
  onWarning?: (message: string) => void;
}

export function useProctoringEngine({ sessionId, enabled, onWarning }: ProctoringOptions) {
  const eventQueueRef = useRef<{ eventType: string; metadata?: unknown }[]>([]);
  const flushingRef = useRef(false);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current || !sessionId || eventQueueRef.current.length === 0) return;
    flushingRef.current = true;
    while (eventQueueRef.current.length > 0) {
      const event = eventQueueRef.current.shift()!;
      try {
        await api.post(`/proctoring/${sessionId}/event`, event);
      } catch (err) {
        console.error('Failed to send proctoring event:', err);
      }
    }
    flushingRef.current = false;
  }, [sessionId]);

  const sendEvent = useCallback(
    (eventType: string, metadata?: unknown) => {
      if (!sessionId || !enabled) return;
      eventQueueRef.current.push({ eventType, metadata });
      void flushQueue();
    },
    [sessionId, enabled, flushQueue],
  );

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const warn = (msg: string) => onWarning?.(msg);

    // Tab visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendEvent('tab_switch', { state: 'hidden' });
        warn('Tab switch detected. This has been logged.');
      }
    };

    // Fullscreen exit
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        sendEvent('fullscreen_exit');
        warn('You exited fullscreen mode. This has been logged. Please return to fullscreen.');
        try {
          void document.documentElement.requestFullscreen();
        } catch {
          /* ignore */
        }
      }
    };

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        sendEvent('copy_attempt', { key: `Ctrl+${e.key.toUpperCase()}` });
        warn('Copy/paste is disabled during the exam.');
        return;
      }
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        sendEvent('print_attempt', { key: 'PrintScreen' });
        warn('Screenshots are not allowed during the exam.');
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        sendEvent('print_attempt', { key: 'Ctrl+P' });
        warn('Printing is disabled during the exam.');
        return;
      }
      if (e.altKey && e.key === 'Tab') {
        sendEvent('shortcut_key', { key: 'Alt+Tab' });
        warn('Window switching detected.');
        return;
      }
      if (e.key === 'F12') {
        e.preventDefault();
        sendEvent('shortcut_key', { key: 'F12' });
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        sendEvent('shortcut_key', { key: 'Ctrl+Shift+I' });
        return;
      }
    };

    // Right-click
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
      sendEvent('right_click');
      warn('Right-click is disabled during the exam.');
    };

    // Window blur
    const handleBlur = () => {
      sendEvent('blur', { timestamp: new Date().toISOString() });
    };

    // Before unload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      sendEvent('beforeunload');
      e.preventDefault();
      e.returnValue = 'You are in an exam. Are you sure you want to leave?';
    };

    // Copy/paste via clipboard events
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      sendEvent('copy_attempt', { via: 'clipboard' });
      warn('Copy is disabled during the exam.');
    };
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      sendEvent('paste_attempt', { via: 'clipboard' });
      warn('Paste is disabled during the exam.');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('paste', handlePaste, true);

    document.body.style.userSelect = 'none';
    (document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'none';

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('paste', handlePaste, true);
      document.body.style.userSelect = '';
      (document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = '';
    };
  }, [enabled, sessionId, sendEvent, onWarning]);
}
