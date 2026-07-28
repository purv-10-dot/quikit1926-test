'use client';
/**
 * CoursePreviewModal — ported from the old QuikSkills frontend
 * (`src/components/CoursePreviewModal.tsx`), replacing the previous
 * "coming soon" stub.
 *
 * Renders a read-only preview of an authored course exactly as a learner
 * would see it, supporting both course shapes:
 *   1. MasterCourse — 3-tier `modules[] → subModules[] → resources[]`, with
 *      optional per-sub-module quiz/assignment and a module-end quiz.
 *   2. Legacy       — 2-tier `modules[] → lessons[]` keyed off `lesson.type`
 *      ('Video' | 'PDF' | 'PPT' | 'SCORM' | 'Text') + `contentUrl`.
 *
 * Videos are delegated to VideoPlayer; the course description uses ReadMoreText.
 */
import React, { useState } from 'react';
import ReadMoreText from '@/components/ReadMoreText';
import {
  X,
  BookOpen,
  FileText,
  HelpCircle,
  Calendar,
  Users,
  Video,
  Music,
  Globe,
  Code,
  FileSpreadsheet,
  Type,
  ChevronDown,
  ChevronRight,
  Clock,
  Tag,
  BarChart3,
  Award,
  Layers,
  ClipboardList,
  GraduationCap,
  Settings,
  CheckCircle,
  Play,
} from 'lucide-react';
import VideoPlayer from '@/components/VideoPlayer';

// ============================================
// TYPE DEFINITIONS (mirrors backend schema)
// ============================================

interface Resource {
  id: string;
  type: string;
  title?: string;
  url?: string;
  content?: string;
  fileSize?: number;
  duration?: number;
  orderIndex: number;
}

interface QuizQuestion {
  id: string;
  text: string;
  type: string;
  points?: number;
}

interface QuizSettings {
  passingScore?: number;
  timeLimit?: number;
  maxAttempts?: number;
  randomizeQuestions?: boolean;
  showCorrectAnswers?: boolean;
  negativeMarkingEnabled?: boolean;
  questionsToShow?: number;
  useQuestionBank?: boolean;
}

interface Quiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
  settings: QuizSettings;
}

interface AssignmentSettings {
  allowedFileTypes?: string[];
  maxFileSizeMB?: number;
  dueDate?: string;
  peerReviewEnabled?: boolean;
}

interface Assignment {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  settings: AssignmentSettings;
}

interface SubModule {
  id: string;
  title: string;
  description?: string;
  learningObjective?: string;
  resources: Resource[];
  resourceType?: string;
  resourceData?: Record<string, any>;
  quiz?: Quiz;
  assignment?: Assignment;
  orderIndex: number;
  estimatedDuration?: number;
  isPreviewable?: boolean;
}

interface CourseModule {
  id: string;
  title: string;
  description?: string;
  learningObjective?: string;
  subModules: SubModule[];
  moduleEndQuiz?: Quiz;
  orderIndex: number;
  estimatedDuration?: number;
}

interface CourseSettings {
  sequentialProgression?: boolean;
  certificateEnabled?: boolean;
  passingScore?: number;
  allowRevisit?: boolean;
  showProgressBar?: boolean;
  validityDays?: number;
}

// Also support legacy structure (modules.lessons)
interface LegacyLesson {
  title: string;
  type?: string;
  contentUrl?: string;
}

interface LegacyModule {
  _id?: string;
  title: string;
  lessons?: LegacyLesson[];
}

interface CoursePreviewModalProps {
  course: any;
  onClose: () => void;
}

// ============================================
// HELPER COMPONENTS
// ============================================

const ResourceIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'video_upload':
    case 'video_youtube':
    case 'video_vimeo':
      return <Video className="w-4 h-4 text-blue-500" />;
    case 'audio_upload':
    case 'audio_soundcloud':
      return <Music className="w-4 h-4 text-purple-500" />;
    case 'document_pdf':
      return <FileText className="w-4 h-4 text-red-500" />;
    case 'document_ppt':
      return <FileText className="w-4 h-4 text-orange-500" />;
    case 'document_word':
      return <FileText className="w-4 h-4 text-blue-600" />;
    case 'document_excel':
      return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
    case 'rich_text':
      return <Type className="w-4 h-4 text-gray-600" />;
    case 'scorm_12':
    case 'scorm_2004':
      return <Code className="w-4 h-4 text-green-500" />;
    case 'external_link':
    case 'iframe_embed':
      return <Globe className="w-4 h-4 text-indigo-500" />;
    default:
      return <FileText className="w-4 h-4 text-gray-400" />;
  }
};

const getResourceTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    video_upload: 'Video',
    video_youtube: 'YouTube Video',
    video_vimeo: 'Vimeo Video',
    audio_upload: 'Audio',
    audio_soundcloud: 'SoundCloud Audio',
    document_pdf: 'PDF Document',
    document_ppt: 'PowerPoint',
    document_word: 'Word Document',
    document_excel: 'Excel Spreadsheet',
    rich_text: 'Rich Text Content',
    scorm_12: 'SCORM 1.2 Package',
    scorm_2004: 'SCORM 2004 Package',
    external_link: 'External Link',
    iframe_embed: 'Embedded Content',
  };
  return labels[type] || type || 'Resource';
};

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ============================================
// QUIZ PREVIEW COMPONENT
// ============================================

const QuizPreview = ({ quiz, label }: { quiz: Quiz; label: string }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
            <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {label}: {quiz.title}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {quiz.questions?.length || 0} question{(quiz.questions?.length || 0) !== 1 ? 's' : ''}
              {quiz.settings?.passingScore ? ` · Pass: ${quiz.settings.passingScore}%` : ''}
              {quiz.settings?.timeLimit ? ` · ${quiz.settings.timeLimit} min` : ''}
              {quiz.settings?.maxAttempts ? ` · ${quiz.settings.maxAttempts} attempt${quiz.settings.maxAttempts !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-amber-600" />
        ) : (
          <ChevronRight className="w-4 h-4 text-amber-600" />
        )}
      </button>

      {expanded && quiz.questions && quiz.questions.length > 0 && (
        <div className="mt-3 pl-11 space-y-2">
          {quiz.questions.map((q, idx) => (
            <div key={q.id || idx} className="flex items-start gap-2 text-sm">
              <span className="text-amber-500 font-medium min-w-[20px]">Q{idx + 1}.</span>
              <div>
                <span className="text-gray-700 dark:text-gray-300">{q.text}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                    {q.type?.replace('_', ' ') || 'MCQ'}
                  </span>
                  {q.points && q.points > 1 && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">{q.points} pts</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// ASSIGNMENT PREVIEW COMPONENT
// ============================================

const AssignmentPreview = ({ assignment }: { assignment: Assignment }) => (
  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
        <ClipboardList className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
          Assignment: {assignment.title}
        </p>
        {assignment.description && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{assignment.description}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-1">
          {assignment.settings?.allowedFileTypes && assignment.settings.allowedFileTypes.length > 0 && (
            <span className="text-xs text-blue-500 dark:text-blue-400">
              Files: {assignment.settings.allowedFileTypes.join(', ')}
            </span>
          )}
          {assignment.settings?.maxFileSizeMB && (
            <span className="text-xs text-blue-500 dark:text-blue-400">
              Max: {assignment.settings.maxFileSizeMB}MB
            </span>
          )}
          {assignment.settings?.peerReviewEnabled && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
              Peer Review
            </span>
          )}
        </div>
      </div>
    </div>
  </div>
);

// ============================================
// RESOURCE ITEM COMPONENT
// ============================================

const ResourceItem = ({ resource }: { resource: Resource }) => {
  const isVideo = ['video_upload', 'video_youtube', 'video_vimeo'].includes(resource.type);

  return (
    <div className="group">
      <div className="flex items-start gap-3 py-2">
        <ResourceIcon type={resource.type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-800 dark:text-gray-200 font-medium truncate" title={resource.title || getResourceTypeLabel(resource.type)}>
              {resource.title || getResourceTypeLabel(resource.type)}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {getResourceTypeLabel(resource.type)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {resource.duration && (
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(Math.ceil(resource.duration / 60))}
              </span>
            )}
            {resource.fileSize && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatFileSize(resource.fileSize)}
              </span>
            )}
          </div>
        </div>
        {resource.url && (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 hover:underline whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Open
          </a>
        )}
      </div>

      {/* Inline video preview for video resources */}
      {isVideo && resource.url && (
        <div className="mt-1 mb-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <VideoPlayer videoUrl={resource.url} title={resource.title || 'Video'} />
        </div>
      )}
    </div>
  );
};

// ============================================
// LEGACY LESSON COMPONENT (for old course format)
// ============================================

const LegacyLessonItem = ({ lesson, moduleIndex, lessonIndex }: { lesson: LegacyLesson; moduleIndex: number; lessonIndex: number }) => (
  <div className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
    <div className="flex items-start gap-4">
      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1">
        <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
          {moduleIndex + 1}.{lessonIndex + 1}
        </span>
      </div>
      <div className="flex-1">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{lesson.title}</h4>
        {lesson.type === 'Video' && lesson.contentUrl && (
          <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <VideoPlayer videoUrl={lesson.contentUrl} title={lesson.title} />
          </div>
        )}
        {lesson.type === 'PDF' && lesson.contentUrl && (
          <div className="flex items-center gap-2 text-sm text-blue-600 mt-2">
            <FileText className="w-4 h-4" />
            <a href={lesson.contentUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">View PDF Document</a>
          </div>
        )}
        {lesson.type === 'PPT' && lesson.contentUrl && (
          <div className="flex items-center gap-2 text-sm text-purple-600 mt-2">
            <FileText className="w-4 h-4" />
            <a href={lesson.contentUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">View PowerPoint</a>
          </div>
        )}
        {lesson.type === 'SCORM' && lesson.contentUrl && (
          <div className="flex items-center gap-2 text-sm text-green-600 mt-2">
            <BookOpen className="w-4 h-4" />
            <span>SCORM Package Available</span>
          </div>
        )}
        {lesson.type === 'Text' && lesson.contentUrl && (
          <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
            <FileText className="w-4 h-4" />
            <span>Text Content</span>
          </div>
        )}
      </div>
    </div>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================

const CoursePreviewModal: React.FC<CoursePreviewModalProps> = ({ course, onClose }) => {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  if (!course) return null;

  // Detect whether this is a MasterCourse (3-tier: modules[].subModules[]) or legacy (modules[].lessons[])
  const isMasterCourse =
    course.isMaster === true ||
    (course.modules && course.modules.length > 0 && course.modules[0]?.subModules !== undefined);

  const modules: (CourseModule | LegacyModule)[] = course.modules || [];

  // Count totals for master courses
  const totalSubModules = isMasterCourse
    ? modules.reduce((acc: number, m: any) => acc + (m.subModules?.length || 0), 0)
    : modules.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0);

  const totalResources = isMasterCourse
    ? modules.reduce(
        (acc: number, m: any) =>
          acc +
          (m.subModules || []).reduce(
            (subAcc: number, sm: any) => subAcc + (sm.resources?.length || 0),
            0,
          ),
        0,
      )
    : 0;

  const totalQuizzes = isMasterCourse
    ? modules.reduce(
        (acc: number, m: any) =>
          acc +
          (m.moduleEndQuiz ? 1 : 0) +
          (m.subModules || []).filter((sm: any) => sm.quiz).length,
        0,
      )
    : 0;

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  // Expand all modules by default on first render — use a state trick
  const expandAll = () => {
    setExpandedModules(new Set(modules.map((m: any) => m.id || m._id || '')));
  };

  const collapseAll = () => {
    setExpandedModules(new Set());
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-primary-600" />
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Course Preview</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">How this course appears to learners</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {/* ================================================= */}
          {/* COURSE HEADER HERO */}
          {/* ================================================= */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg p-8 text-white mb-6">
            <div className="flex items-start gap-6">
              {course.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={course.thumbnailUrlPresigned || course.thumbnailUrl}
                  alt="Course thumbnail"
                  className="w-32 h-24 object-cover rounded-lg border-2 border-white shadow-lg flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                {/* Category & Level badges */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="inline-block bg-white/20 px-3 py-1 rounded-full text-xs font-medium">
                    {course.category || 'Uncategorized'}
                  </span>
                  {course.level && (
                    <span className="inline-block bg-white/15 px-3 py-1 rounded-full text-xs font-medium">
                      {course.level}
                    </span>
                  )}
                  {course.status && (
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        course.status === 'Published'
                          ? 'bg-green-400/30 text-green-100'
                          : course.status === 'Archived'
                          ? 'bg-gray-400/30 text-gray-200'
                          : 'bg-yellow-400/30 text-yellow-100'
                      }`}
                    >
                      {course.status}
                    </span>
                  )}
                </div>

                <h1 className="text-3xl font-bold mb-2" title={course.title}>{course.title}</h1>

                {/* Description */}
                {course.description && (
                  <ReadMoreText text={course.description} maxLines={3} className="text-sm text-white/80 mb-3" />
                )}

                {/* Stats row */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-white/90">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    <span>
                      {modules.length} Module{modules.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {isMasterCourse && totalSubModules > 0 && (
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      <span>
                        {totalSubModules} Sub-module{totalSubModules !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  {!isMasterCourse && totalSubModules > 0 && (
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      <span>
                        {totalSubModules} Lesson{totalSubModules !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  {totalResources > 0 && (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span>
                        {totalResources} Resource{totalResources !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  {totalQuizzes > 0 && (
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-4 h-4" />
                      <span>
                        {totalQuizzes} Quiz{totalQuizzes !== 1 ? 'zes' : ''}
                      </span>
                    </div>
                  )}
                  {course.selectedTenants && course.selectedTenants.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>
                        {course.selectedTenants.length} Tenant{course.selectedTenants.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  {course.estimatedDuration && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{formatDuration(course.estimatedDuration)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Created: {new Date(course.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Tags */}
                {course.tags && course.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Tag className="w-3 h-3 text-white/60" />
                    {course.tags.map((tag: string, idx: number) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 text-xs bg-white/15 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ================================================= */}
          {/* COURSE SETTINGS (if meaningful) */}
          {/* ================================================= */}
          {isMasterCourse && course.settings && (
            <div className="mb-6 flex flex-wrap gap-3">
              {course.settings.sequentialProgression && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-full border border-indigo-200 dark:border-indigo-800">
                  <Settings className="w-3 h-3" /> Sequential Progression
                </span>
              )}
              {course.settings.certificateEnabled && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full border border-green-200 dark:border-green-800">
                  <Award className="w-3 h-3" /> Certificate Enabled
                </span>
              )}
              {course.settings.passingScore && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-full border border-amber-200 dark:border-amber-800">
                  <BarChart3 className="w-3 h-3" /> Pass: {course.settings.passingScore}%
                </span>
              )}
              {course.settings.validityDays && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full border border-gray-200 dark:border-gray-600">
                  <Clock className="w-3 h-3" /> Valid for {course.settings.validityDays} days
                </span>
              )}
            </div>
          )}

          {/* ================================================= */}
          {/* EXPAND / COLLAPSE ALL CONTROLS */}
          {/* ================================================= */}
          {modules.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Course Content
              </h2>
              {isMasterCourse && modules.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={expandAll}
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    Expand All
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <button
                    onClick={collapseAll}
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    Collapse All
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ================================================= */}
          {/* MODULES LIST */}
          {/* ================================================= */}
          {modules.length > 0 ? (
            <div className="space-y-4">
              {modules.map((module: any, moduleIndex: number) => {
                const moduleId = module.id || module._id || `module-${moduleIndex}`;
                const isExpanded = expandedModules.has(moduleId);

                // MasterCourse: subModules; Legacy: lessons
                const subModules: SubModule[] = module.subModules || [];
                const legacyLessons: LegacyLesson[] = module.lessons || [];
                const hasContent = isMasterCourse ? subModules.length > 0 : legacyLessons.length > 0;

                return (
                  <div
                    key={moduleId}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                  >
                    {/* Module Header */}
                    <button
                      onClick={() => toggleModule(moduleId)}
                      className="w-full bg-gray-50 dark:bg-gray-750 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary-600 dark:text-primary-400 font-semibold">
                          {moduleIndex + 1}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {module.title}
                        </h3>
                        {module.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                            {module.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {isMasterCourse && (
                            <span>
                              {subModules.length} sub-module{subModules.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {!isMasterCourse && (
                            <span>
                              {legacyLessons.length} lesson{legacyLessons.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {module.estimatedDuration && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDuration(module.estimatedDuration)}
                            </span>
                          )}
                          {module.moduleEndQuiz && (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <HelpCircle className="w-3 h-3" /> Module Quiz
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}
                    </button>

                    {/* Module Content (expanded) */}
                    {isExpanded && (
                      <div>
                        {/* Learning Objective */}
                        {module.learningObjective && (
                          <div className="px-6 py-3 bg-primary-50/50 dark:bg-primary-900/10 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-start gap-2">
                              <GraduationCap className="w-4 h-4 text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-semibold text-primary-700 dark:text-primary-400 uppercase tracking-wide">
                                  Learning Objective
                                </p>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                                  {module.learningObjective}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ================================ */}
                        {/* MASTER COURSE: Sub-Modules */}
                        {/* ================================ */}
                        {isMasterCourse && hasContent && (
                          <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {subModules
                              .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
                              .map((subModule, subIndex) => (
                                <div
                                  key={subModule.id || subIndex}
                                  className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                                >
                                  <div className="flex items-start gap-4">
                                    {/* Sub-module number */}
                                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                                      <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                        {moduleIndex + 1}.{subIndex + 1}
                                      </span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      {/* Title & meta */}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                          {subModule.title}
                                        </h4>
                                        {subModule.isPreviewable && (
                                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                            Preview
                                          </span>
                                        )}
                                        {subModule.estimatedDuration && (
                                          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatDuration(subModule.estimatedDuration)}
                                          </span>
                                        )}
                                      </div>

                                      {subModule.description && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                          {subModule.description}
                                        </p>
                                      )}

                                      {subModule.learningObjective && (
                                        <p className="text-xs text-primary-600 dark:text-primary-400 mt-1 italic">
                                          Objective: {subModule.learningObjective}
                                        </p>
                                      )}

                                      {/* Resources */}
                                      {subModule.resources && subModule.resources.length > 0 && (
                                        <div className="mt-3 space-y-1 pl-1 border-l-2 border-gray-200 dark:border-gray-700 ml-1">
                                          {subModule.resources
                                            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
                                            .map((resource, resIdx) => (
                                              <div key={resource.id || resIdx} className="pl-3">
                                                <ResourceItem resource={resource} />
                                              </div>
                                            ))}
                                        </div>
                                      )}

                                      {/* CourseCreator legacy resource (resourceType + resourceData) */}
                                      {!subModule.resources?.length && subModule.resourceType && subModule.resourceData && (
                                        <div className="mt-3 pl-1 border-l-2 border-gray-200 dark:border-gray-700 ml-1">
                                          <div className="pl-3 flex items-center gap-2 py-2">
                                            {subModule.resourceType === 'upload' && subModule.resourceData?.type === 'video' && (
                                              <>
                                                <Video className="w-4 h-4 text-blue-500" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                  {subModule.resourceData.name || 'Uploaded Video'}
                                                </span>
                                              </>
                                            )}
                                            {subModule.resourceType === 'upload' && subModule.resourceData?.type === 'pdf' && (
                                              <>
                                                <FileText className="w-4 h-4 text-red-500" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                  {subModule.resourceData.name || 'Uploaded PDF'}
                                                </span>
                                              </>
                                            )}
                                            {subModule.resourceType === 'upload' && subModule.resourceData?.type === 'ppt' && (
                                              <>
                                                <FileText className="w-4 h-4 text-orange-500" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                  {subModule.resourceData.name || 'Uploaded PPT'}
                                                </span>
                                              </>
                                            )}
                                            {subModule.resourceType === 'youtube' && (
                                              <>
                                                <Play className="w-4 h-4 text-red-600" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                  YouTube Video
                                                </span>
                                                {subModule.resourceData?.url && (
                                                  <a
                                                    href={subModule.resourceData.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-primary-600 hover:underline"
                                                  >
                                                    Open
                                                  </a>
                                                )}
                                              </>
                                            )}
                                            {subModule.resourceType === 'upload' && !['video', 'pdf', 'ppt'].includes(subModule.resourceData?.type || '') && (
                                              <>
                                                <FileText className="w-4 h-4 text-gray-500" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                  {subModule.resourceData.name || 'Uploaded File'}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                          {/* Inline video preview for uploaded or youtube videos */}
                                          {subModule.resourceData?.url && (
                                            (subModule.resourceType === 'youtube' || subModule.resourceData?.type === 'video') && (
                                              <div className="pl-3 mt-1 mb-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                                <VideoPlayer
                                                  videoUrl={subModule.resourceData.url}
                                                  title={subModule.title}
                                                />
                                              </div>
                                            )
                                          )}
                                        </div>
                                      )}

                                      {/* No resources at all */}
                                      {(!subModule.resources || subModule.resources.length === 0) &&
                                        !subModule.resourceType &&
                                        !subModule.quiz &&
                                        !subModule.assignment && (
                                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic">
                                            No content added yet
                                          </p>
                                        )}

                                      {/* Sub-module Quiz */}
                                      {subModule.quiz && (
                                        <div className="mt-3">
                                          <QuizPreview quiz={subModule.quiz} label="Quiz" />
                                        </div>
                                      )}

                                      {/* Sub-module Assignment */}
                                      {subModule.assignment && (
                                        <div className="mt-3">
                                          <AssignmentPreview assignment={subModule.assignment} />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* ================================ */}
                        {/* LEGACY COURSE: Lessons */}
                        {/* ================================ */}
                        {!isMasterCourse && legacyLessons.length > 0 && (
                          <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {legacyLessons.map((lesson, lessonIndex) => (
                              <LegacyLessonItem
                                key={lessonIndex}
                                lesson={lesson}
                                moduleIndex={moduleIndex}
                                lessonIndex={lessonIndex}
                              />
                            ))}
                          </div>
                        )}

                        {/* Module End Quiz (Master Course only) */}
                        {isMasterCourse && module.moduleEndQuiz && (
                          <div className="px-6 py-4 bg-amber-50/50 dark:bg-amber-900/10 border-t border-gray-200 dark:border-gray-700">
                            <QuizPreview quiz={module.moduleEndQuiz} label="Module End Quiz" />
                          </div>
                        )}

                        {/* Empty state */}
                        {!hasContent && !module.moduleEndQuiz && (
                          <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                            <BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                            <p>No content in this module yet</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Collapsed quick-stats */}
                    {!isExpanded && hasContent && (
                      <div className="px-6 py-3 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        <span>
                          {isMasterCourse
                            ? `${subModules.length} sub-module${subModules.length !== 1 ? 's' : ''}`
                            : `${legacyLessons.length} lesson${legacyLessons.length !== 1 ? 's' : ''}`}
                          {isMasterCourse &&
                            subModules.reduce((a: number, sm: any) => a + (sm.resources?.length || 0), 0) > 0 &&
                            ` · ${subModules.reduce((a: number, sm: any) => a + (sm.resources?.length || 0), 0)} resources`}
                        </span>
                        <span className="text-primary-500 ml-auto">Click to expand</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p className="text-lg font-medium">No modules in this course yet</p>
              <p className="text-sm mt-1">Add modules in the Course Studio to build this course.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { CoursePreviewModal };
export default CoursePreviewModal;
