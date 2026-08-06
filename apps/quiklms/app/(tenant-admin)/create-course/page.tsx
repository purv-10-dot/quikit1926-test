'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GraduationCap, Layers, FileText, ClipboardList, ShieldCheck, Zap } from 'lucide-react';
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

  // Editing jumps straight into the Studio — the author already clicked Edit,
  // so making them press "Open Course Studio" first is pure friction.
  const [studioOpen, setStudioOpen] = useState(Boolean(courseId));

  const goToSubmissions = () => router.push('/my-submissions');

  if (studioOpen) {
    return (
      <>
        <Toaster position="top-right" />
        <MasterCourseStudio
          courseId={courseId}
          isTenantAdmin
          approvalEnabled={approvalEnabled}
          onClose={() => {
            // Closing an edit returns to the list; closing a fresh draft just
            // steps back to the launch screen so nothing is lost by a stray Esc.
            if (courseId) goToSubmissions();
            else setStudioOpen(false);
          }}
          onSuccess={goToSubmissions}
        />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6 sm:p-8">
      <Toaster position="top-right" />

      {/* Which workflow this author's courses will follow. */}
      {approvalEnabled ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            <span className="font-bold">Approval Required:</span> Courses you create will be submitted for Super
            Admin approval before becoming active and visible to learners.
          </p>
        </div>
      ) : (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">
            <span className="font-bold">Direct Publish:</span> Approval workflow is disabled — your courses will be
            published immediately.
          </p>
        </div>
      )}

      <div className="rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 p-8 text-white shadow-2xl sm:p-12">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-white/20 p-3 backdrop-blur-sm">
            <GraduationCap className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Create Course</h1>
            <p className="mt-1 text-indigo-100">Build structured, assessable learning for your organization.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setStudioOpen(true)}
          className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-3.5 font-black text-indigo-600 shadow-lg transition hover:bg-indigo-50 active:scale-[0.98]"
        >
          <Zap className="h-5 w-5" />
          Open Course Studio
        </button>
      </div>

      <div className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-8">
        <h2 className="text-lg font-black tracking-tight text-slate-900">Course Studio</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Create courses with a 3-tier hierarchy: Course, Modules, and Sub-Modules. Add resources, quizzes, and
          assignments for your learners.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            { icon: Layers, label: 'Drag & Drop Reordering' },
            { icon: FileText, label: 'Multi-Resource Engine' },
            { icon: ClipboardList, label: 'Quiz Builder' },
            { icon: ShieldCheck, label: approvalEnabled ? 'Requires Approval' : 'Direct Publish' },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.label}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <Icon className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-bold text-slate-700">{c.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default function TenantCourseCreatorPage() {
  return (
    <Suspense>
      <CreateCoursePage />
    </Suspense>
  );
}
