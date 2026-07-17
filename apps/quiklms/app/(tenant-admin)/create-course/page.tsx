'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
  CheckCircle2,
  Loader2,
  Settings,
  FileText,
  Layers,
  Eye,
  Clock,
  Tag,
  BarChart2,
  Link2,
  AlignLeft,
  AlertCircle,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useFeatures } from '@/app/providers';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  title: string;
  videoUrl: string;
  duration: string;
  description: string;
}

interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

interface CourseSettings {
  isPublic: boolean;
  enableCertificate: boolean;
  enrollmentType: 'open' | 'assigned';
}

interface BasicInfo {
  title: string;
  description: string;
  category: string;
  level: string;
  thumbnailUrl: string;
  estimatedDuration: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function makeLesson(): Lesson {
  return { id: uid(), title: '', videoUrl: '', duration: '', description: '' };
}

function makeModule(): Module {
  return { id: uid(), title: '', lessons: [makeLesson()] };
}

const CATEGORIES = [
  'Technology',
  'Business',
  'Design',
  'Marketing',
  'HR',
  'Compliance',
  'Other',
];

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

const STEPS = [
  { label: 'Basic Info', icon: FileText },
  { label: 'Content', icon: Layers },
  { label: 'Settings', icon: Settings },
  { label: 'Review', icon: Eye },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-10 flex items-start">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const done = idx < current;
        const active = idx === current;
        return (
          <div
            key={step.label}
            className={idx < STEPS.length - 1 ? 'flex flex-1 items-start' : 'flex items-start'}
          >
            <div className="flex flex-col items-center gap-2">
              <div
                className={[
                  'relative flex h-10 w-10 items-center justify-center rounded-full border-2',
                  'transition-all duration-300 ease-out',
                  done
                    ? 'border-transparent bg-[var(--brand-primary)] text-white shadow-sm'
                    : active
                    ? 'border-[var(--brand-primary)] bg-surface text-[var(--brand-primary)] shadow-[0_0_0_4px_rgb(var(--shadow-color)/0.04)]'
                    : 'border-line-strong bg-surface text-fg-subtle',
                ].join(' ')}
              >
                {active && (
                  <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-[var(--brand-primary)]/10" />
                )}
                {done ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Icon className="h-[18px] w-[18px]" />
                )}
              </div>
              <span
                className={[
                  'whitespace-nowrap text-xs font-semibold tracking-tight transition-colors duration-300',
                  active
                    ? 'text-[var(--brand-primary)]'
                    : done
                    ? 'text-fg'
                    : 'text-fg-subtle',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className="mx-2 mt-5 h-0.5 flex-1 overflow-hidden rounded-full bg-line-strong">
                <div
                  className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-500 ease-out"
                  style={{ width: done ? '100%' : '0%' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InputField({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-fg">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

const inputCls =
  'w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle transition-all duration-150 focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/30 hover:border-[var(--brand-primary)]/50';

const selectCls =
  'w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm text-fg transition-all duration-150 focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/30 hover:border-[var(--brand-primary)]/50 appearance-none cursor-pointer';

// ─── Step 1: Basic Info ───────────────────────────────────────────────────────

function Step1BasicInfo({
  data,
  onChange,
}: {
  data: BasicInfo;
  onChange: (patch: Partial<BasicInfo>) => void;
}) {
  return (
    <div className="space-y-5">
      <InputField label="Course Title" required>
        <div className="relative">
          <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="e.g. Advanced React Patterns"
            value={data.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>
      </InputField>

      <InputField label="Description">
        <div className="relative">
          <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-fg-subtle" />
          <textarea
            className={`${inputCls} pl-9 min-h-[100px] resize-y`}
            placeholder="Briefly describe what learners will achieve…"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
      </InputField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <InputField label="Category" required>
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
            <select
              className={`${selectCls} pl-9`}
              value={data.category}
              onChange={(e) => onChange({ category: e.target.value })}
            >
              <option value="">Select category…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </InputField>

        <InputField label="Level" required>
          <div className="relative">
            <BarChart2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
            <select
              className={`${selectCls} pl-9`}
              value={data.level}
              onChange={(e) => onChange({ level: e.target.value })}
            >
              <option value="">Select level…</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </InputField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <InputField
          label="Thumbnail URL"
          hint="Paste a public image URL (optional)"
        >
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="https://example.com/cover.jpg"
              value={data.thumbnailUrl}
              onChange={(e) => onChange({ thumbnailUrl: e.target.value })}
            />
          </div>
        </InputField>

        <InputField label="Estimated Duration" hint="Total hours (optional)">
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
            <input
              type="number"
              min="0"
              className={`${inputCls} pl-9`}
              placeholder="e.g. 4"
              value={data.estimatedDuration}
              onChange={(e) => onChange({ estimatedDuration: e.target.value })}
            />
          </div>
        </InputField>
      </div>
    </div>
  );
}

// ─── Step 2: Content ──────────────────────────────────────────────────────────

function LessonRow({
  lesson,
  onUpdate,
  onRemove,
  canRemove,
}: {
  lesson: Lesson;
  onUpdate: (patch: Partial<Lesson>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-muted p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]/60" />
          Lesson
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
            title="Remove lesson"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InputField label="Lesson Title" required>
          <input
            className={inputCls}
            placeholder="e.g. Introduction to Hooks"
            value={lesson.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
          />
        </InputField>

        <InputField label="Video URL" hint="YouTube or direct video link">
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="https://youtube.com/watch?v=…"
              value={lesson.videoUrl}
              onChange={(e) => onUpdate({ videoUrl: e.target.value })}
            />
          </div>
        </InputField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InputField label="Duration (minutes)">
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
            <input
              type="number"
              min="0"
              className={`${inputCls} pl-9`}
              placeholder="e.g. 15"
              value={lesson.duration}
              onChange={(e) => onUpdate({ duration: e.target.value })}
            />
          </div>
        </InputField>

        <InputField label="Lesson Description">
          <input
            className={inputCls}
            placeholder="Short description (optional)"
            value={lesson.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
          />
        </InputField>
      </div>
    </div>
  );
}

function ModuleCard({
  module,
  index,
  onUpdate,
  onRemove,
  canRemove,
}: {
  module: Module;
  index: number;
  onUpdate: (patch: Partial<Module>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const lessons = module.lessons ?? [];

  function updateLesson(lessonId: string, patch: Partial<Lesson>) {
    onUpdate({
      lessons: lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l)),
    });
  }

  function removeLesson(lessonId: string) {
    onUpdate({ lessons: lessons.filter((l) => l.id !== lessonId) });
  }

  function addLesson() {
    onUpdate({ lessons: [...lessons, makeLesson()] });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition-shadow duration-200 hover:shadow-md">
      {/* Module header */}
      <div className="flex items-center gap-3 border-b border-line bg-surface-muted px-5 py-4">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-bold text-white shadow-sm">
          {index + 1}
        </span>
        <input
          className="flex-1 border-b border-transparent bg-transparent pb-0.5 text-sm font-semibold text-fg placeholder:text-fg-subtle transition-colors focus:border-[var(--brand-primary)] focus:outline-none"
          placeholder="Module title…"
          value={module.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
        />
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
            title="Remove module"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Lessons */}
      <div className="p-5 space-y-3">
        {lessons.map((lesson) => (
          <LessonRow
            key={lesson.id}
            lesson={lesson}
            onUpdate={(patch) => updateLesson(lesson.id, patch)}
            onRemove={() => removeLesson(lesson.id)}
            canRemove={lessons.length > 1}
          />
        ))}

        <button
          type="button"
          onClick={addLesson}
          className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-primary)] transition-opacity hover:opacity-80"
        >
          <Plus className="w-4 h-4" />
          Add Lesson
        </button>
      </div>
    </div>
  );
}

function Step2Content({
  modules,
  onChange,
}: {
  modules: Module[];
  onChange: (modules: Module[]) => void;
}) {
  const safeModules = modules ?? [];

  function updateModule(moduleId: string, patch: Partial<Module>) {
    onChange(safeModules.map((m) => (m.id === moduleId ? { ...m, ...patch } : m)));
  }

  function removeModule(moduleId: string) {
    onChange(safeModules.filter((m) => m.id !== moduleId));
  }

  function addModule() {
    onChange([...safeModules, makeModule()]);
  }

  return (
    <div className="space-y-4">
      {safeModules.map((mod, idx) => (
        <ModuleCard
          key={mod.id}
          module={mod}
          index={idx}
          onUpdate={(patch) => updateModule(mod.id, patch)}
          onRemove={() => removeModule(mod.id)}
          canRemove={safeModules.length > 1}
        />
      ))}

      <button
        type="button"
        onClick={addModule}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong py-3.5 text-sm font-medium text-fg-muted transition-all duration-150 hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/5 hover:text-[var(--brand-primary)] active:scale-[0.99]"
      >
        <Plus className="w-4 h-4" />
        Add Module
      </button>
    </div>
  );
}

// ─── Step 3: Settings ─────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-4 last:border-0">
      <div>
        <p className="text-sm font-medium text-fg">{label}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ${
          value ? 'bg-[var(--brand-primary)]' : 'bg-surface-sunken border border-line-strong'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function Step3Settings({
  settings,
  onChange,
}: {
  settings: CourseSettings;
  onChange: (patch: Partial<CourseSettings>) => void;
}) {
  return (
    <div className="space-y-1 rounded-xl border border-line bg-surface p-6 shadow-sm">
      <ToggleRow
        label="Public Course"
        description="Visible in the course catalogue to all learners"
        value={settings.isPublic}
        onChange={(v) => onChange({ isPublic: v })}
      />
      <ToggleRow
        label="Enable Certificate"
        description="Learners receive a certificate on completion"
        value={settings.enableCertificate}
        onChange={(v) => onChange({ enableCertificate: v })}
      />

      <div className="pt-4">
        <p className="mb-2 text-sm font-medium text-fg">Enrollment Type</p>
        <div className="flex gap-3">
          {(['open', 'assigned'] as const).map((type) => (
            <label
              key={type}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
                settings.enrollmentType === type
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/8 text-[var(--brand-primary)] shadow-[0_0_0_3px_rgb(var(--shadow-color)/0.03)]'
                  : 'border-line-strong text-fg-muted hover:border-[var(--brand-primary)]/50 hover:text-fg'
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                checked={settings.enrollmentType === type}
                onChange={() => onChange({ enrollmentType: type })}
              />
              {type === 'open' ? 'Open Enrollment' : 'Assigned Only'}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-fg-muted">
          {settings.enrollmentType === 'open'
            ? 'Any learner in your organisation can self-enroll.'
            : 'Learners must be explicitly assigned by an admin.'}
        </p>
      </div>
    </div>
  );
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm last:border-0">
      <span className="w-40 flex-shrink-0 font-medium text-fg-muted">{label}</span>
      <span className="text-right text-fg">{value || '—'}</span>
    </div>
  );
}

function Step4Review({
  basicInfo,
  modules,
  settings,
}: {
  basicInfo: BasicInfo;
  modules: Module[];
  settings: CourseSettings;
}) {
  const safeModules = modules ?? [];
  const totalLessons = safeModules.reduce(
    (sum, m) => sum + (m.lessons ?? []).length,
    0
  );

  return (
    <div className="space-y-5">
      {/* Course info */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          <FileText className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
          Course Info
        </h3>
        <ReviewRow label="Title" value={basicInfo.title} />
        <ReviewRow label="Category" value={basicInfo.category} />
        <ReviewRow label="Level" value={basicInfo.level} />
        <ReviewRow
          label="Est. Duration"
          value={
            basicInfo.estimatedDuration
              ? `${basicInfo.estimatedDuration} hr${Number(basicInfo.estimatedDuration) !== 1 ? 's' : ''}`
              : ''
          }
        />
        {basicInfo.description && (
          <div className="border-b border-line py-2.5 text-sm last:border-0">
            <span className="mb-1 block font-medium text-fg-muted">Description</span>
            <span className="text-fg">{basicInfo.description}</span>
          </div>
        )}
      </div>

      {/* Content summary */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          <Layers className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
          Content
        </h3>
        <ReviewRow label="Modules" value={String(safeModules.length)} />
        <ReviewRow label="Total Lessons" value={String(totalLessons)} />
        <div className="mt-3 space-y-2">
          {safeModules.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 text-sm text-fg-muted">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/10 text-xs font-bold text-[var(--brand-primary)]">
                {i + 1}
              </span>
              <span className="font-medium text-fg">{m.title || 'Untitled Module'}</span>
              <span className="text-xs text-fg-subtle">
                ({(m.lessons ?? []).length} lesson
                {(m.lessons ?? []).length !== 1 ? 's' : ''})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Settings summary */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          <Settings className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
          Settings
        </h3>
        <ReviewRow label="Visibility" value={settings.isPublic ? 'Public' : 'Private'} />
        <ReviewRow
          label="Certificate"
          value={settings.enableCertificate ? 'Enabled' : 'Disabled'}
        />
        <ReviewRow
          label="Enrollment"
          value={settings.enrollmentType === 'open' ? 'Open Enrollment' : 'Assigned Only'}
        />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const CreateCoursePage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const isEditMode = !!courseId;

  const { config } = useFeatures();
  // Tenant admins respect the approval-workflow toggle; default ON.
  const approvalEnabled = config?.approvalWorkflowEnabled !== false;

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [loadingCourse, setLoadingCourse] = useState(isEditMode);
  const [submittedStatus, setSubmittedStatus] = useState<string>('PendingApproval');

  const [basicInfo, setBasicInfo] = useState<BasicInfo>({
    title: '',
    description: '',
    category: '',
    level: '',
    thumbnailUrl: '',
    estimatedDuration: '',
  });

  const [modules, setModules] = useState<Module[]>([makeModule()]);

  const [settings, setSettings] = useState<CourseSettings>({
    isPublic: true,
    enableCertificate: false,
    enrollmentType: 'open',
  });

  // ── Edit mode: prefill from existing master-course submission ────────────────
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ data: any }>(`/master-courses/${courseId}`);
        const c = res?.data;
        if (!c || cancelled) return;

        setBasicInfo({
          title: c.title || '',
          description: c.description || '',
          category: c.category || '',
          level: c.level
            ? String(c.level).charAt(0).toUpperCase() + String(c.level).slice(1)
            : '',
          thumbnailUrl: c.thumbnailUrl || '',
          estimatedDuration:
            c.estimatedDuration != null ? String(c.estimatedDuration) : '',
        });

        // Map master-course modules[].subModules[] back into the wizard's
        // simpler modules[].lessons[] shape (one lesson per sub-module).
        const mappedModules: Module[] = Array.isArray(c.modules)
          ? c.modules.map((m: any) => ({
              id: m.id || uid(),
              title: m.title || '',
              lessons:
                Array.isArray(m.subModules) && m.subModules.length > 0
                  ? m.subModules.map((sm: any) => {
                      const videoRes = (sm.resources || []).find(
                        (r: any) => r.type === 'video' || r.url
                      );
                      return {
                        id: sm.id || uid(),
                        title: sm.title || '',
                        videoUrl: videoRes?.url || sm.videoUrl || '',
                        duration:
                          sm.duration != null ? String(sm.duration) : '',
                        description: sm.description || '',
                      };
                    })
                  : [makeLesson()],
            }))
          : [makeModule()];
        setModules(mappedModules.length ? mappedModules : [makeModule()]);

        const s = c.settings || {};
        setSettings({
          isPublic: s.isPublic !== false,
          enableCertificate: s.certificateEnabled === true,
          enrollmentType: s.enrollmentType === 'assigned' ? 'assigned' : 'open',
        });
      } catch (err: any) {
        toast.error(err?.message || 'Failed to load course');
      } finally {
        if (!cancelled) setLoadingCourse(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // ── Validation ──────────────────────────────────────────────────────────────

  function validateStep0(): string | null {
    if (!basicInfo.title.trim()) return 'Course title is required.';
    if (!basicInfo.category) return 'Please select a category.';
    if (!basicInfo.level) return 'Please select a level.';
    return null;
  }

  function validateStep1(): string | null {
    const safeModules = modules ?? [];
    if (safeModules.length === 0) return 'Add at least one module.';
    for (const mod of safeModules) {
      if (!mod.title.trim()) return 'All modules must have a title.';
      const lessons = mod.lessons ?? [];
      if (lessons.length === 0) return `Module "${mod.title}" needs at least one lesson.`;
      for (const lesson of lessons) {
        if (!lesson.title.trim())
          return `All lessons in "${mod.title}" must have a title.`;
      }
    }
    return null;
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  function handleNext() {
    if (step === 0) {
      const err = validateStep0();
      if (err) { toast.error(err); return; }
    }
    if (step === 1) {
      const err = validateStep1();
      if (err) { toast.error(err); return; }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  // ── Submit for approval ──────────────────────────────────────────────────────
  // Instead of directly publishing a live course, we create/update a master-course
  // submission. The server (POST/PUT /api/master-courses) decides the status based
  // on the actor's role + the tenant's approval-workflow toggle:
  //   TENANT_ADMIN + approval ON  → PendingApproval (Super Admin review)
  //   TENANT_ADMIN + approval OFF → Published
  //   SUB_ADMIN                   → PendingTenantApproval (Tenant Admin review)

  function buildMasterCoursePayload() {
    const safeModules = modules ?? [];
    return {
      title: basicInfo.title.trim(),
      description: basicInfo.description.trim() || undefined,
      category: basicInfo.category || undefined,
      // Send the value exactly as the LEVELS options provide it ('Beginner' | …).
      // The Prisma `CourseLevel` enum members are capitalized, so lower-casing
      // here made every create fail with:
      //   Invalid value for argument `level`. Expected LmsCourseLevel.
      level: basicInfo.level || undefined,
      thumbnailUrl: basicInfo.thumbnailUrl.trim() || undefined,
      estimatedDuration: basicInfo.estimatedDuration
        ? Number(basicInfo.estimatedDuration)
        : undefined,
      // Map the wizard's modules[].lessons[] into the 3-tier master-course
      // structure: module → sub-module → video resource.
      modules: safeModules.map((mod, mIdx) => ({
        title: mod.title.trim(),
        orderIndex: mIdx,
        subModules: (mod.lessons ?? []).map((lesson, lIdx) => ({
          title: lesson.title.trim(),
          description: lesson.description.trim() || undefined,
          orderIndex: lIdx,
          duration: lesson.duration ? Number(lesson.duration) : undefined,
          resources: lesson.videoUrl.trim()
            ? [
                {
                  type: 'video',
                  title: lesson.title.trim(),
                  url: lesson.videoUrl.trim(),
                  orderIndex: 0,
                },
              ]
            : [],
        })),
      })),
      settings: {
        isPublic: settings.isPublic,
        certificateEnabled: settings.enableCertificate,
        enrollmentType: settings.enrollmentType,
      },
    };
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);

    try {
      const payload = buildMasterCoursePayload();
      let res: { data?: any; message?: string };

      if (isEditMode && courseId) {
        res = await api.put<{ data?: any; message?: string }>(
          `/master-courses/${courseId}`,
          payload
        );
      } else {
        res = await api.post<{ data?: any; message?: string }>(
          '/master-courses',
          payload
        );
      }

      const status = res?.data?.status || 'PendingApproval';
      setSubmittedStatus(status);
      setPublishedId(res?.data?.id || res?.data?._id || courseId || 'submitted');
      toast.success(
        res?.message ||
          (status === 'Published'
            ? 'Course published successfully!'
            : 'Course submitted for approval')
      );
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ??
        'Failed to submit course for approval.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading (edit mode) ──────────────────────────────────────────────────────

  if (loadingCourse) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (publishedId) {
    const isPublished = submittedStatus === 'Published';
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <Toaster position="top-right" />
        <div className="w-full max-w-md animate-slide-up rounded-2xl border border-line bg-surface p-10 text-center shadow-lg">
          <div
            className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${
              isPublished ? 'bg-success-soft' : 'bg-warning-soft'
            }`}
          >
            <CheckCircle2
              className={`h-8 w-8 ${
                isPublished ? 'text-success' : 'text-warning'
              }`}
            />
          </div>
          <h2 className="mb-2 font-display text-2xl font-bold text-fg">
            {isPublished
              ? 'Course Published!'
              : isEditMode
              ? 'Course Resubmitted!'
              : 'Submitted for Approval!'}
          </h2>
          <p className="mb-6 text-sm text-fg-muted">
            {isPublished
              ? 'Your course is now live and available to learners.'
              : submittedStatus === 'PendingTenantApproval'
              ? 'Your course has been sent to your Tenant Admin for review. It will go live once approved.'
              : 'Your course has been sent for Super Admin review. It will go live once approved.'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push('/my-submissions')}
              className="rounded-lg bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
            >
              View My Submissions
            </button>
            {!isEditMode && (
              <button
                onClick={() => {
                  setPublishedId(null);
                  setStep(0);
                  setBasicInfo({
                    title: '',
                    description: '',
                    category: '',
                    level: '',
                    thumbnailUrl: '',
                    estimatedDuration: '',
                  });
                  setModules([makeModule()]);
                  setSettings({ isPublic: true, enableCertificate: false, enrollmentType: 'open' });
                }}
                className="rounded-lg border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-fg transition-all duration-150 hover:bg-surface-muted active:scale-[0.98]"
              >
                Create Another
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main wizard ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-canvas">
      <Toaster position="top-right" />

      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-line bg-surface/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand-primary)] shadow-sm">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-fg">
              {isEditMode ? 'Edit Course' : 'Create New Course'}
            </h1>
            <p className="text-xs text-fg-muted">
              Step {step + 1} of {STEPS.length} — {STEPS[step]?.label}
            </p>
          </div>
        </div>
      </div>

      {/* Approval workflow banner */}
      <div className="px-4 pt-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {approvalEnabled ? (
            <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-warning">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm leading-relaxed">
                <strong className="font-semibold">Approval Required:</strong> This
                course will be submitted for review before it becomes active and
                visible to learners.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-success">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm leading-relaxed">
                <strong className="font-semibold">Direct Publish:</strong> Approval
                workflow is disabled — this course will be published immediately.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <StepIndicator current={step} />

        {/* Step content */}
        <div key={step} className="mb-8 animate-fade-in">
          {step === 0 && (
            <Step1BasicInfo data={basicInfo} onChange={(p) => setBasicInfo((d) => ({ ...d, ...p }))} />
          )}
          {step === 1 && (
            <Step2Content modules={modules} onChange={setModules} />
          )}
          {step === 2 && (
            <Step3Settings
              settings={settings}
              onChange={(p) => setSettings((s) => ({ ...s, ...p }))}
            />
          )}
          {step === 3 && (
            <Step4Review basicInfo={basicInfo} modules={modules} settings={settings} />
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between border-t border-line pt-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-fg transition-all duration-150 hover:bg-surface-muted active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:brightness-110 hover:shadow-md active:scale-[0.98] active:brightness-95"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:brightness-110 hover:shadow-md active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {approvalEnabled
                    ? isEditMode
                      ? 'Resubmit for Approval'
                      : 'Submit for Approval'
                    : isEditMode
                    ? 'Update Course'
                    : 'Publish Course'}
                </>
              )}
            </button>
          )}
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
