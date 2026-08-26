'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import MasterCourseStudio from '@/components/MasterCourseStudio';
import { useFeatures } from '@/app/providers';

/* ──────────────────────────────────────────────────────────────────────────
 * Tenant course authoring — mounts the SAME Master Course Studio the super
 * admin uses, which is what the reference frontend does
 * (`TenantCourseCreatorPage` renders `<MasterCourseStudio isTenantAdmin />`).
 *
 * WHY THIS REPLACED A 1,126-LINE WIZARD:
 *
 * The wizard this file used to hold was a reduced 4-step form whose lesson
 * model was `{title, videoUrl, duration, description}` — no quiz step, no
 * SCORM/PDF/audio/rich-text, no sub-modules. Two consequences, both bad:
 *
 *  1. A tenant admin could not author a quiz AT ALL. `buildMasterCoursePayload`
 *     never emitted `quiz` or `moduleEndQuiz`, and this page was the only
 *     course-authoring entry point linked from the tenant course list.
 *
 *  2. It DESTROYED DATA on edit. Loading an existing course kept only
 *     `resources.find(r => r.type === 'video' || r.url)` per sub-module, and
 *     saving writes `modules` wholesale (`master-course-service.update`). So
 *     opening any Studio-built course in the wizard and pressing Save silently
 *     deleted its quizzes, every non-video resource, and the entire sub-module
 *     structure — with no warning and no undo.
 *
 * The Studio already supported everything needed here (`isTenantAdmin` hides
 * tenant Distribution and the Publish button, and switches the save label to
 * Submit for Approval / Save & Publish); it was simply never wired to this
 * route. Deleting the wizard removes the data-loss path entirely rather than
 * trying to teach it the full content model.
 * ────────────────────────────────────────────────────────────────────────── */

const CreateCoursePage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId') || undefined;

  const { config } = useFeatures();
  // Tenant admins respect the approval-workflow toggle; default ON — only an
  // explicit `false` disables it, matching the reference.
  const approvalEnabled = config?.approvalWorkflowEnabled !== false;

  const goToSubmissions = () => router.push('/my-submissions');

  // The Studio opens immediately, for new courses as well as edits.
  //
  // This route used to show a launch screen first: a hero panel, a feature
  // list, and an "Open Course Studio" button. It told the author nothing they
  // had not already decided by navigating to /create-course, and cost a click
  // on every single course. Editing already skipped it for exactly that reason
  // ("the author already clicked Edit, so making them press Open Course Studio
  // first is pure friction") — that reasoning was never specific to editing.
  //
  // The one piece of information the screen carried, which workflow the course
  // will follow, now lives in the Studio header where it stays visible while
  // authoring rather than disappearing after the first click.
  return (
    <>
      <Toaster position="top-right" />
      <MasterCourseStudio
        courseId={courseId}
        isTenantAdmin
        approvalEnabled={approvalEnabled}
        onClose={goToSubmissions}
        onSuccess={goToSubmissions}
      />
    </>
  );
};

export default function TenantCourseCreatorPage() {
  return (
    <Suspense>
      <CreateCoursePage />
    </Suspense>
  );
}
