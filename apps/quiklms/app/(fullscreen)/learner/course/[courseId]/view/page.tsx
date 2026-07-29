import { redirect } from 'next/navigation';

/**
 * `/learner/course/:courseId/view` — RETIRED. Redirects to the canonical
 * learner player at `/learner/course/:courseId`.
 *
 * This route held a third course player (after `UniversalLMSPlayer` and the
 * now-retired `/course-player`), built on `VideoPlayerWithProgress`. It was the
 * destination of the learner dashboard's "Continue Learning" button and of every
 * course card on that page.
 *
 * It handled quizzes correctly — `QuizTakingComponent` posts to
 * `/api/learner/submit-quiz`, which grades and re-syncs — but it had two gaps
 * against the canonical player:
 *
 *  1. NO SEEK RESTRICTION. `VideoPlayerWithProgress` renders a free-scrub range
 *     input plus explicit ±10s skip buttons, so a learner could drag to the end
 *     and be credited with 100% watched. Compliance courses are exactly the ones
 *     that must not allow this.
 *
 *  2. VIDEO ONLY. PDF, PPT/slides, SCORM, audio and rich-text lessons had no
 *     viewer, so a course mixing those with video was partly unplayable.
 *
 * Both are covered by `UniversalLMSPlayer`, which also carries the sequential
 * lesson/quiz unlocking. Rather than port two more viewers and a seek clamp into
 * a second player and keep them in step forever, the learner entry points now
 * converge on one.
 *
 * Kept as a redirect rather than deleted — the path is in browser history and
 * bookmarks, and 404ing it would read as a missing course.
 */
export default function RetiredCourseViewPage({ params }: { params: { courseId: string } }) {
  redirect(`/learner/course/${params.courseId}`);
}
