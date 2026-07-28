'use client';
/**
 * useAutoSave — ported from the old QuikSkills frontend (`src/hooks/useAutoSave.ts`).
 *
 * Persists exam answers to `PATCH /exam-sessions/:id/save` every 30s, plus once
 * on `beforeunload`. Skips the write when the answers are byte-identical to the
 * last saved snapshot, and never runs two saves concurrently.
 *
 * The disclosure screen promises the learner "your answers are auto-saved every
 * 30 seconds" — this is what makes that true.
 */
import { useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface UseAutoSaveOptions {
  sessionId: string | null;
  answers: Record<string, unknown>;
  intervalMs?: number;
  enabled?: boolean;
}

export function useAutoSave({ sessionId, answers, intervalMs = 30000, enabled = true }: UseAutoSaveOptions) {
  const lastSavedRef = useRef<string>('');
  const savingRef = useRef(false);

  const save = useCallback(async () => {
    if (!sessionId || !enabled || savingRef.current) return;

    const snapshot = JSON.stringify(answers);
    if (snapshot === lastSavedRef.current) return;

    savingRef.current = true;
    try {
      await api.patch(`/exam-sessions/${sessionId}/save`, { answers });
      lastSavedRef.current = snapshot;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Auto-save failed:', err);
    } finally {
      savingRef.current = false;
    }
  }, [sessionId, answers, enabled]);

  useEffect(() => {
    if (!sessionId || !enabled) return;
    const interval = setInterval(save, intervalMs);
    return () => clearInterval(interval);
  }, [save, intervalMs, sessionId, enabled]);

  // Save on beforeunload — fire-and-forget, as in the original.
  useEffect(() => {
    if (!sessionId || !enabled) return;
    const handler = () => {
      void save();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [save, sessionId, enabled]);

  return { save };
}

export default useAutoSave;
