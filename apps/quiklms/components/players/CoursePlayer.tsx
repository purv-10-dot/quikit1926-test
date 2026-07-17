'use client';
/**
 * Course player host — the fullscreen shell that `/learner/course/[courseId]`
 * and `/learner/course/[courseId]/legacy` mount, always via
 * `dynamic(..., { ssr:false })` since the players touch window/canvas/camera.
 *
 * Route → player mapping, matching the legacy frontend's App.tsx routes:
 *   standard  `/learner/course/:courseId`         → UniversalLMSPlayer  (ported)
 *   legacy    `/learner/course/:courseId/legacy`  → LockedCoursePlayer  (ported)
 *   view      `/learner/course/:courseId/view`    → handled by its own page.tsx,
 *                                                   which never routes through here.
 *
 * Both players render their own fullscreen chrome (back button, sidebar, progress
 * header) and read `courseId` from the route via `useParams`, so this host hands
 * off directly rather than wrapping them in a second shell.
 */
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-900">
    <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
  </div>
);

const UniversalLMSPlayer = dynamic(() => import('@/components/learner/UniversalLMSPlayer'), {
  ssr: false,
  loading: spinner,
});

const LockedCoursePlayer = dynamic(() => import('@/components/learner/LockedCoursePlayer'), {
  ssr: false,
  loading: spinner,
});

export default function CoursePlayer({ courseId, mode }: { courseId: string; mode: 'standard' | 'view' | 'legacy' }) {
  void courseId; // Both players read it from the route themselves, as the originals did.
  if (mode === 'legacy') {
    return <LockedCoursePlayer />;
  }
  return <UniversalLMSPlayer />;
}
