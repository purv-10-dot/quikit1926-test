'use client';
/**
 * Course player host. The legacy browser-only players (UniversalLMSPlayer,
 * LockedCoursePlayer, CompliancePlayer, VideoPlayer, SCORM iframe, react-pdf,
 * MediaPipe face-proctoring hooks) mount here and MUST be loaded with
 * `dynamic(..., { ssr:false })` since they touch window/canvas/camera. This is
 * the fullscreen host shell those components render into.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function CoursePlayer({ courseId, mode }: { courseId: string; mode: 'standard' | 'view' | 'legacy' }) {
  const [title, setTitle] = useState('Loading…');
  useEffect(() => {
    api.get<{ data: { title?: string } }>(`/player/course/${courseId}`)
      .then((r) => setTitle(r.data?.title || 'Course'))
      .catch(() => setTitle('Course'));
  }, [courseId]);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="h-12 flex items-center px-4 border-b border-white/10 text-sm">
        <a href="/learner/course-status" className="opacity-70 hover:opacity-100">← Exit</a>
        <span className="mx-auto font-medium">{title}</span>
        <span className="opacity-50 text-xs">{mode}</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-white/60">
        Player surface (mode: {mode}) — UniversalLMSPlayer / SCORM / VideoPlayer mounts here via dynamic(ssr:false).
      </div>
    </div>
  );
}
