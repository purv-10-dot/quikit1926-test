import { redirect } from 'next/navigation';

/**
 * `/course-player/:courseId` — RETIRED. Redirects to the canonical learner
 * player at `/learner/course/:courseId`.
 *
 * WHY IT WAS RETIRED. This route used to hold a self-contained player that
 * rendered a `<video>` element (or a YouTube iframe) and nothing else, while
 * being the destination of the learner sidebar's "My Courses" → Continue button
 * — i.e. the way most learners actually opened a course. Three defects, all
 * structural rather than fixable in place:
 *
 *  1. NO COMPLIANCE RESTRICTION. It exposed a free-scrub seek bar and a ±10s
 *     skip. The forward-seek clamp, the keyboard-skip blocking and the
 *     "Video cannot be skipped" banner exist only in `UniversalLMSPlayer`, so
 *     every learner who came through here could jump to the end of a video and
 *     have it counted as watched.
 *
 *  2. IT COULD NOT RENDER HALF THE CONTENT MODEL. A Quiz lesson displayed
 *     "No video for this lesson"; a PDF lesson had its URL handed to
 *     `<video src>`. SCORM, slides, audio and rich text were equally unplayable.
 *     Courses are authored in the Master Course Studio with all of those types,
 *     so any course beyond plain video was partly invisible here.
 *
 *  3. IT LET A LEARNER COMPLETE A QUIZ WITHOUT ANSWERING IT. Because a quiz
 *     could not be rendered, the page offered a generic "Mark Complete" button
 *     that PATCHed `/api/player/sync` with `completionPercentage: 100` for the
 *     quiz's lesson id. Those ids are counted by
 *     `calculateOverallCourseProgress`, so clicking through every item reached
 *     100%, which fired `generateCertificateForCompletion` — a certificate with
 *     zero questions answered.
 *
 * `UniversalLMSPlayer` (mounted at `/learner/course/:courseId`) has all three
 * covered and is tenant-type agnostic — it reads `tenantType` but gates nothing
 * on it — so school and corporate learners both belong there.
 *
 * Kept as a redirect rather than deleted: the path is in browser history,
 * bookmarks and any emailed deep link, and silently 404ing those would look
 * like the course had disappeared.
 *
 * NOTE: (3) is also closed server-side in `progress-service.quizCompletionAllowed`,
 * because these endpoints are public API and no client-side change can be the
 * whole fix.
 */


export default function RetiredCoursePlayerPage({ params }: { params: { courseId: string } }) {
  redirect(`/learner/course/${params.courseId}`);
}
