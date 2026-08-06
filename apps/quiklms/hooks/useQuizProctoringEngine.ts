'use client';
/**
 * DOM-event proctoring engine for QUIZ sessions. Mirrors `useProctoringEngine`
 * but posts to the NEW quiz-proctoring backend:
 *   POST /api/quiz-proctoring/:sessionId/event   { eventType, metadata }
 *
 * Monitors: tab switches, fullscreen exits, copy/paste, right-click, keyboard
 * shortcuts, print attempts, blur, beforeunload. Needs no external deps.
 */
import { useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface QuizProctoringOptions {
  sessionId: string | null;
  enabled: boolean;
  onWarning?: (message: string) => void;
}

export function useQuizProctoringEngine({ sessionId, enabled, onWarning }: QuizProctoringOptions) {
  const eventQueueRef = useRef<{ eventType: string; metadata?: unknown }[]>([]);
  const flushingRef = useRef(false);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current || !sessionId || eventQueueRef.current.length === 0) return;
    flushingRef.current = true;
    while (eventQueueRef.current.length > 0) {
      const event = eventQueueRef.current.shift()!;
      try {
        await api.post(`/quiz-proctoring/${sessionId}/event`, event);
      } catch (err) {
        console.error('Failed to send quiz proctoring event:', err);
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

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendEvent('tab_switch', { state: 'hidden' });
        warn('Tab switch detected — this has been logged.');
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        sendEvent('fullscreen_exit');
        warn('You exited fullscreen. This has been logged. Please return to fullscreen.');
        try {
          void document.documentElement.requestFullscreen();
        } catch {
          /* ignore */
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        sendEvent('copy_attempt', { key: `Ctrl+${e.key.toUpperCase()}` });
        warn('Copy/paste is disabled during this quiz.');
        return;
      }
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        sendEvent('print_attempt', { key: 'PrintScreen' });
        warn('Screenshots are not allowed during this quiz.');
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        sendEvent('print_attempt', { key: 'Ctrl+P' });
        warn('Printing is disabled during this quiz.');
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

    const handleContextMenu = (e: Event) => {
      e.preventDefault();
      sendEvent('right_click');
      warn('Right-click is disabled during this quiz.');
    };

    const handleBlur = () => {
      sendEvent('blur', { timestamp: new Date().toISOString() });
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      sendEvent('beforeunload');
      e.preventDefault();
      e.returnValue = 'You are in a proctored quiz. Are you sure you want to leave?';
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      sendEvent('copy_attempt', { via: 'clipboard' });
      warn('Copy is disabled during this quiz.');
    };
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      sendEvent('paste_attempt', { via: 'clipboard' });
      warn('Paste is disabled during this quiz.');
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
