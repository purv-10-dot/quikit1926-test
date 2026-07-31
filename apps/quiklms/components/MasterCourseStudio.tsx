'use client';
/**
 * MasterCourseStudio — ported from the old QuikSkills frontend
 * (`src/components/MasterCourseStudio.tsx`), replacing a 29-line
 * "Full course builder coming soon" stub.
 *
 * This is the surface that drives the master-course approval workflow — the same
 * one whose SUB_ADMIN privilege-escalation bug was fixed in GAP_REPORT §2.5. Until
 * now that fix had no UI to exercise it: this component calls
 * `POST /master-courses/:id/save`, which is where the forced
 * `PendingTenantApproval` override lives.
 *
 * Porting deviations from the Vite original (all behavior-preserving):
 *  - axios → the app's fetch wrapper (`@/lib/api`), which returns the response
 *    BODY directly, so every `res.data.data` collapses to `res.data`.
 *  - The thumbnail upload POSTed multipart FormData to `/upload/course-resource`.
 *    It now goes through the shared `uploadFile` helper, which posts multipart
 *    to that route and falls back to a presigned PUT only for files too large to
 *    proxy. Approved 2026-07-17.
 *
 * `react-beautiful-dnd` is unmaintained and its drag silently no-ops under React
 * 18 StrictMode in dev (it works in production builds). Kept deliberately so the
 * drag logic ports unchanged — see the note in GAP_REPORT §4b.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import {
  BookOpen,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Save,
  Eye,
  Upload,
  Video,
  FileText,
  Music,
  Link as LinkIcon,
  Code,
  HelpCircle,
  ClipboardList,
  Settings,
  Sparkles,
  Check,
  X,
  Clock,
  AlertCircle,
  Loader2,
  Image,
  Globe,
  Play,
  Layers,
  CheckCircle,
  RefreshCw,
  Award,
  BarChart3,
  Calendar,
  Target,
  Zap,
  FolderOpen,
  GraduationCap,
  Building2,
  AlertTriangle,
  Lock,
  BarChart2,
  Trophy,
} from 'lucide-react';
import { api } from '@/lib/api';
import { uploadFileWithPreview, SERVER_UPLOAD_MAX_BYTES } from '@/lib/upload-client';
import { MAX_THUMBNAIL_BYTES, formatMaxSize } from '@/lib/constants/uploads';
import { v4 as uuidv4 } from 'uuid';
import QuizBuilderAdvanced from '@/components/QuizBuilderAdvanced';
import SubModuleResourceEngine from '@/components/SubModuleResourceEngine';

// Types
interface Resource {
  id: string;
  type: string;
  title?: string;
  url?: string;
  content?: string;
  fileSize?: number;
  duration?: number;
  ffmpegCompressed?: boolean;
  scormVersion?: string;
  scormEntryPoint?: string;
  metadata?: Record<string, any>;
  orderIndex: number;
}

interface QuizQuestion {
  id: string;
  text: string;
  type: 'mcq' | 'multi_select' | 'true_false' | 'drag_drop' | 'fill_blank';
  options: { id: string; text: string; imageUrl?: string }[];
  dragDropPairs?: { id: string; left: string; right: string }[];
  blanks?: string[];
  correctAnswer: number | number[] | boolean | string[];
  imageUrl?: string;
  audioUrl?: string;
  explanation?: string;
  points: number;
  negativeMarks: number;
  branchingSubModuleId?: string;
  tags: string[];
}

interface QuizSettings {
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  passingScore: number;
  timeLimit?: number;
  maxAttempts: number;
  showCorrectAnswers: boolean;
  showExplanations: boolean;
  negativeMarkingEnabled: boolean;
  questionsToShow?: number;
  useQuestionBank: boolean;
  additionalQuestionsToInclude?: number;
}

interface Quiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
  // Optional bonus pool — sampled per attempt to vary retakes. Older
  // quizzes saved before this feature shipped won't have the field.
  additionalQuestions?: QuizQuestion[];
  settings: QuizSettings;
}

interface Assignment {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  settings: {
    peerReviewEnabled: boolean;
    minPeerReviews: number;
    allowedFileTypes: string[];
    maxFileSizeMB: number;
    dueDate?: Date;
    rubric?: string;
  };
}

interface SubModule {
  id: string;
  title: string;
  description?: string;
  learningObjective?: string;
  resources: Resource[];
  quiz?: Quiz;
  assignment?: Assignment;
  orderIndex: number;
  estimatedDuration?: number;
  isPreviewable: boolean;
  completionThreshold: number;
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
  thumbnailUrl?: string;
}

interface CourseSettings {
  sequentialProgression: boolean;
  certificateEnabled: boolean;
  certificateTemplateId?: string;
  passingScore: number;
  allowRevisit: boolean;
  showProgressBar: boolean;
  validityDays?: number;
}

interface MasterCourse {
  _id?: string;
  title: string;
  description?: string;
  category?: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  thumbnailUrl?: string;
  thumbnailUrlPresigned?: string;
  aiGeneratedThumbnail: boolean;
  modules: CourseModule[];
  settings: CourseSettings;
  status: 'Draft' | 'Published' | 'Archived' | 'PendingApproval' | 'Rejected' | 'Resubmitted';
  selectedTenants: string[];
  tags: string[];
  estimatedDuration?: number;
  lastAutoSaveAt?: Date;
  draftData?: Record<string, any>;
}

interface Props {
  courseId?: string;
  onClose: () => void;
  onSuccess: () => void;
  isTenantAdmin?: boolean;
  approvalEnabled?: boolean;
}

const MasterCourseStudio = ({ courseId, onClose, onSuccess, isTenantAdmin = false, approvalEnabled = true }: Props) => {
  // Course state
  const [course, setCourse] = useState<MasterCourse>({
    title: '',
    description: '',
    category: '',
    level: 'Beginner',
    thumbnailUrl: '',
    aiGeneratedThumbnail: false,
    modules: [],
    settings: {
      sequentialProgression: false,
      certificateEnabled: false,
      passingScore: 70,
      allowRevisit: true,
      showProgressBar: true,
    },
    status: 'Draft',
    selectedTenants: [],
    tags: [],
  });

  // UI state
  const [activeTab, setActiveTab] = useState<'identity' | 'modules' | 'settings'>('identity');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedSubModules, setExpandedSubModules] = useState<Set<string>>(new Set());
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedSubModuleId, setSelectedSubModuleId] = useState<string | null>(null);
  const [showQuizBuilder, setShowQuizBuilder] = useState(false);
  const [quizTarget, setQuizTarget] = useState<{ type: 'module' | 'submodule'; id: string } | null>(null);
  const [showResourceEngine, setShowResourceEngine] = useState(false);
  const [resourceTargetSubModule, setResourceTargetSubModule] = useState<string | null>(null);

  // Loading/saving state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tenants for distribution
  const [tenants, setTenants] = useState<{ _id: string; orgName: string }[]>([]);

  // Auto-save timer
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

  // Thumbnail upload
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);

  const buildApiPayload = (src: MasterCourse, options?: { forCreate?: boolean }) => {
    const payload: any = {
      title: src.title,
      description: src.description,
      category: src.category,
      level: src.level,
      thumbnailUrl: src.thumbnailUrl,
      aiGeneratedThumbnail: src.aiGeneratedThumbnail,
      modules: src.modules,
      settings: src.settings,
      selectedTenants: src.selectedTenants,
      tags: src.tags,
      estimatedDuration: src.estimatedDuration,
    };

    // Keep status for super admin flows; tenant-admin backend overrides as needed.
    if (!options?.forCreate && src.status) {
      payload.status = src.status;
    }

    return payload;
  };

  // Categories with icons
  const categories = [
    { name: 'Technology', icon: '💻' },
    { name: 'Business', icon: '📊' },
    { name: 'Finance', icon: '💰' },
    { name: 'Marketing', icon: '📢' },
    { name: 'Design', icon: '🎨' },
    { name: 'Health & Safety', icon: '🏥' },
    { name: 'Compliance', icon: '📋' },
    { name: 'Leadership', icon: '👔' },
    { name: 'Soft Skills', icon: '🤝' },
    { name: 'Product Training', icon: '📦' },
    { name: 'Other', icon: '📚' },
  ];

  // Level colors
  const levelColors = {
    Beginner: 'from-emerald-400 to-emerald-600',
    Intermediate: 'from-blue-400 to-blue-600',
    Advanced: 'from-amber-400 to-amber-600',
    Expert: 'from-rose-400 to-rose-600',
  };

  // Load course if editing
  useEffect(() => {
    if (courseId) {
      loadCourse();
    }
    loadTenants();
  }, [courseId]);

  // Auto-save effect
  useEffect(() => {
    if (course._id && course.status === 'Draft') {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(() => {
        handleAutoSave();
      }, AUTO_SAVE_INTERVAL);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [course]);

  const loadCourse = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ success: boolean; data: MasterCourse }>(`/master-courses/${courseId}`);
      if (response.success) {
        setCourse(response.data);
        setExpandedModules(new Set(response.data.modules.map((m: CourseModule) => m.id)));
      }
    } catch (err: unknown) {
      setError('Failed to load course');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTenants = async () => {
    try {
      const response = await api.get<{ data: { _id: string; orgName: string }[] }>('/tenants');
      if (response.data) {
        setTenants(response.data);
      }
    } catch (err) {
      console.error('Failed to load tenants:', err);
    }
  };

  const handleAutoSave = async () => {
    if (!course._id || saving) return;

    try {
      setAutoSaving(true);
      const cleanCourseData = buildApiPayload(course);
      await api.post(`/master-courses/${course._id}/auto-save`, cleanCourseData);
      setLastAutoSave(new Date());
    } catch (err) {
      console.error('Auto-save failed:', err);
    } finally {
      setAutoSaving(false);
    }
  };

  const handleSave = async () => {
    if (!course.title.trim()) {
      setError('Course title is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const cleanCourseData = buildApiPayload(course);

      let response: { success: boolean; data: MasterCourse; message?: string };
      if (course._id) {
        // Update existing course. NOTE: the server FORCES PendingTenantApproval
        // for a SUB_ADMIN editing a published course (GAP_REPORT §2.5) — the
        // status this client sends is deliberately not honored there.
        response = await api.post<{ success: boolean; data: MasterCourse; message?: string }>(
          `/master-courses/${course._id}/save`,
          cleanCourseData,
        );
      } else {
        // Create new course
        const createData = buildApiPayload(course, { forCreate: true });
        response = await api.post<{ success: boolean; data: MasterCourse; message?: string }>(
          '/master-courses',
          createData,
        );
      }

      if (response.success) {
        setCourse(response.data);
        const msg = response.message
          || (isTenantAdmin
            ? (course.status === 'Published'
                ? 'Course updated successfully!'
                : (approvalEnabled
                    ? (course._id ? 'Course resubmitted for approval!' : 'Course submitted for approval!')
                    : 'Course published successfully!'))
            : 'Course saved successfully!');
        setSuccess(msg);
        if (isTenantAdmin) {
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 1500);
        } else {
          setTimeout(() => setSuccess(null), 3000);
        }
      }
    } catch (err: unknown) {
      // The fetch client throws the parsed error BODY, so `message` is on the
      // error itself — the axios `err.response.data.message` branch is gone.
      setError((err as { message?: string })?.message || 'Failed to save course');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!course._id) {
      setError('Please save the course first');
      return;
    }

    if (course.modules.length === 0) {
      setError('Add at least one module before publishing');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const cleanCourseData = buildApiPayload(course);

      // Save the course first to ensure all resources are persisted
      await api.post(`/master-courses/${course._id}/save`, cleanCourseData);

      // Then publish
      const response = await api.post<{ success: boolean }>(`/master-courses/${course._id}/publish`, {
        selectedTenants: course.selectedTenants || [],
      });

      if (response.success) {
        setSuccess('Course published successfully!');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to publish course');
    } finally {
      setSaving(false);
    }
  };

  // Thumbnail Upload Handler
  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type (only images)
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a valid image file (PNG, JPEG, GIF, or WebP)');
      return;
    }

    // The product limit for course art is MAX_THUMBNAIL_BYTES, but never accept
    // more than the proxy boundary: above it the browser PUTs straight to the
    // bucket, which needs a CORS policy that is not applied — so the file would
    // pass this check and then die at the network layer with "the storage bucket
    // is not accepting uploads from this site", an error no author can act on.
    // Whichever is smaller is the honest limit, and it tracks the env knob.
    const maxThumbnailBytes = Math.min(MAX_THUMBNAIL_BYTES, SERVER_UPLOAD_MAX_BYTES);
    if (file.size > maxThumbnailBytes) {
      setError(`Image size must be less than ${formatMaxSize(maxThumbnailBytes)}`);
      return;
    }

    setUploadingThumbnail(true);
    setError(null);

    try {
      // The source POSTed multipart FormData to `/upload/course-resource` with an
      // extra `type: 'course-thumbnail'` field. `uploadFile` handles the upload
      // whichever way the file's size demands and returns the permanent URL. The
      // `type` field is dropped; it was never read server-side (the legacy
      // handler derived the resource type from the filename/mimetype).
      // Endpoint kept as `/upload/course-resource` — the original's choice, even
      // though a `/upload/course-thumbnail` route also exists.
      // `previewUrl` is the signed one. `thumbnailUrl` alone renders as a broken
      // image until the course is reloaded, because the bucket is private and
      // the signed `thumbnailUrlPresigned` sibling is only attached on READ.
      const { url, previewUrl } = await uploadFileWithPreview(file, '/upload/course-resource');

      if (url) {
        setCourse((prev) => ({ ...prev, thumbnailUrl: url, thumbnailUrlPresigned: previewUrl }));
        setSuccess('Thumbnail uploaded successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error('Failed to get upload URL');
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to upload thumbnail');
    } finally {
      setUploadingThumbnail(false);
      // Reset the file input
      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = '';
      }
    }
  };

  // Module Management
  const addModule = () => {
    const newModule: CourseModule = {
      id: uuidv4(),
      title: `Module ${course.modules.length + 1}`,
      description: '',
      learningObjective: '',
      subModules: [],
      orderIndex: course.modules.length,
    };

    setCourse((prev) => ({
      ...prev,
      modules: [...prev.modules, newModule],
    }));

    setExpandedModules((prev) => new Set([...prev, newModule.id]));
  };

  const updateModule = (moduleId: string, updates: Partial<CourseModule>) => {
    setCourse((prev) => ({
      ...prev,
      modules: prev.modules.map((m) =>
        m.id === moduleId ? { ...m, ...updates } : m
      ),
    }));
  };

  const deleteModule = (moduleId: string) => {
    setCourse((prev) => ({
      ...prev,
      modules: prev.modules.filter((m) => m.id !== moduleId).map((m, index) => ({
        ...m,
        orderIndex: index,
      })),
    }));
  };

  // Sub-Module Management
  const addSubModule = (moduleId: string) => {
    const module = course.modules.find((m) => m.id === moduleId);
    if (!module) return;

    const newSubModule: SubModule = {
      id: uuidv4(),
      title: `Sub-Module ${module.subModules.length + 1}`,
      description: '',
      learningObjective: '',
      resources: [],
      orderIndex: module.subModules.length,
      isPreviewable: false,
      completionThreshold: 80,
    };

    updateModule(moduleId, {
      subModules: [...module.subModules, newSubModule],
    });

    setExpandedSubModules((prev) => new Set([...prev, newSubModule.id]));
  };

  const updateSubModule = (
    moduleId: string,
    subModuleId: string,
    updates: Partial<SubModule>
  ) => {
    setCourse((prev) => ({
      ...prev,
      modules: prev.modules.map((m) =>
        m.id === moduleId
          ? {
              ...m,
              subModules: m.subModules.map((sm) =>
                sm.id === subModuleId ? { ...sm, ...updates } : sm
              ),
            }
          : m
      ),
    }));
  };

  const deleteSubModule = (moduleId: string, subModuleId: string) => {
    const module = course.modules.find((m) => m.id === moduleId);
    if (!module) return;

    updateModule(moduleId, {
      subModules: module.subModules
        .filter((sm) => sm.id !== subModuleId)
        .map((sm, index) => ({ ...sm, orderIndex: index })),
    });
  };

  // Drag and Drop Handlers
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, type } = result;

    if (type === 'MODULE') {
      const reorderedModules = Array.from(course.modules);
      const [movedModule] = reorderedModules.splice(source.index, 1);
      reorderedModules.splice(destination.index, 0, movedModule);

      setCourse((prev) => ({
        ...prev,
        modules: reorderedModules.map((m, index) => ({
          ...m,
          orderIndex: index,
        })),
      }));
    } else if (type.startsWith('SUBMODULE-')) {
      const moduleId = type.replace('SUBMODULE-', '');
      const module = course.modules.find((m) => m.id === moduleId);
      if (!module) return;

      const reorderedSubModules = Array.from(module.subModules);
      const [movedSubModule] = reorderedSubModules.splice(source.index, 1);
      reorderedSubModules.splice(destination.index, 0, movedSubModule);

      updateModule(moduleId, {
        subModules: reorderedSubModules.map((sm, index) => ({
          ...sm,
          orderIndex: index,
        })),
      });
    }
  };

  // Quiz Management
  const openQuizBuilder = (type: 'module' | 'submodule', id: string) => {
    setQuizTarget({ type, id });
    setShowQuizBuilder(true);
  };

  const saveQuiz = (quiz: Quiz) => {
    if (!quizTarget) return;

    if (quizTarget.type === 'module') {
      updateModule(quizTarget.id, { moduleEndQuiz: quiz });
    } else {
      const module = course.modules.find((m) =>
        m.subModules.some((sm) => sm.id === quizTarget.id)
      );
      if (module) {
        updateSubModule(module.id, quizTarget.id, { quiz });
      }
    }

    setShowQuizBuilder(false);
    setQuizTarget(null);
  };

  const deleteQuiz = () => {
    if (!quizTarget) return;

    if (quizTarget.type === 'module') {
      updateModule(quizTarget.id, { moduleEndQuiz: undefined });
    } else {
      const module = course.modules.find((m) =>
        m.subModules.some((sm) => sm.id === quizTarget.id)
      );
      if (module) {
        updateSubModule(module.id, quizTarget.id, { quiz: undefined });
      }
    }

    setShowQuizBuilder(false);
    setQuizTarget(null);
  };

  // Resource Management
  const openResourceEngine = (subModuleId: string) => {
    setResourceTargetSubModule(subModuleId);
    setShowResourceEngine(true);
  };

  const saveResources = async (resources: Resource[]) => {
    if (!resourceTargetSubModule) return;

    const module = course.modules.find((m) =>
      m.subModules.some((sm) => sm.id === resourceTargetSubModule)
    );
    if (module) {
      // Update local state
      const updatedModules = course.modules.map((m) =>
        m.id === module.id
          ? {
              ...m,
              subModules: m.subModules.map((sm) =>
                sm.id === resourceTargetSubModule ? { ...sm, resources } : sm
              ),
            }
          : m
      );
      
      const updatedCourse = { ...course, modules: updatedModules };
      setCourse(updatedCourse);

      // Immediately save to backend if course exists
      if (course._id) {
        try {
          const cleanCourseData = buildApiPayload(updatedCourse);
          
          // Use the save endpoint (not auto-save) to ensure it's persisted
          const response = await api.post<{ success: boolean }>(
            `/master-courses/${course._id}/save`,
            cleanCourseData,
          );

          if (response.success) {
            // Reload the course to get the latest data from backend
            const reloadResponse = await api.get<{ success: boolean; data: MasterCourse }>(
              `/master-courses/${course._id}`,
            );
            if (reloadResponse.success) {
              setCourse(reloadResponse.data);
            }
            setLastAutoSave(new Date());
          }
        } catch (err) {
          console.error('Failed to save resources:', err);
          setError('Failed to save resources. Please try again.');
        }
      }
    }

    setShowResourceEngine(false);
    setResourceTargetSubModule(null);
  };

  // Toggle expansion
  const toggleModuleExpansion = (moduleId: string) => {
    setExpandedModules((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(moduleId)) {
        newSet.delete(moduleId);
      } else {
        newSet.add(moduleId);
      }
      return newSet;
    });
  };

  const toggleSubModuleExpansion = (subModuleId: string) => {
    setExpandedSubModules((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(subModuleId)) {
        newSet.delete(subModuleId);
      } else {
        newSet.add(subModuleId);
      }
      return newSet;
    });
  };

  // Get current quiz for editing
  const getCurrentQuiz = (): Quiz | undefined => {
    if (!quizTarget) return undefined;

    if (quizTarget.type === 'module') {
      return course.modules.find((m) => m.id === quizTarget.id)?.moduleEndQuiz;
    } else {
      for (const module of course.modules) {
        const subModule = module.subModules.find((sm) => sm.id === quizTarget.id);
        if (subModule) return subModule.quiz;
      }
    }
    return undefined;
  };

  // Get current resources for editing
  const getCurrentResources = (): Resource[] => {
    if (!resourceTargetSubModule) return [];

    for (const module of course.modules) {
      const subModule = module.subModules.find((sm) => sm.id === resourceTargetSubModule);
      if (subModule) return subModule.resources;
    }
    return [];
  };

  // Calculate stats
  const totalSubModules = course.modules.reduce((sum, m) => sum + m.subModules.length, 0);
  const totalResources = course.modules.reduce(
    (sum, m) => sum + m.subModules.reduce((subSum, sm) => subSum + sm.resources.length, 0),
    0
  );
  const totalQuizzes =
    course.modules.filter((m) => m.moduleEndQuiz).length +
    course.modules.reduce(
      (sum, m) => sum + m.subModules.filter((sm) => sm.quiz).length,
      0
    );

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900/95 via-purple-900/30 to-slate-900/95 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-12 flex flex-col items-center border border-white/20 shadow-2xl">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin" />
            <GraduationCap className="w-8 h-8 text-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="mt-6 text-lg font-medium text-white/80">Loading course...</p>
          <p className="mt-2 text-sm text-white/50">Please wait while we prepare your studio</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900/95 via-purple-900/30 to-slate-900/95 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-7xl h-[95vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200/50 dark:border-slate-700/50">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-8 py-6">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptMCAwdi02aC02djZoNnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Master Course Studio
                </h2>
                <p className="text-white/70 text-sm mt-0.5">
                  {courseId ? 'Edit your course' : 'Create a new course'} • 3-tier hierarchy
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Auto-save indicator */}
              {autoSaving && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-sm text-white/90">Saving...</span>
                </div>
              )}
              {lastAutoSave && !autoSaving && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-white/90">
                    Saved {lastAutoSave.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isTenantAdmin
                  ? (course.status === 'Published'
                      ? 'Save Changes'
                      : (approvalEnabled ? 'Submit for Approval' : 'Save & Publish'))
                  : 'Save Draft'}
              </button>

              {course._id && !isTenantAdmin && (
                <button
                  onClick={handlePublish}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-purple-600 font-semibold rounded-xl hover:bg-white/90 transition-all duration-200 shadow-lg shadow-purple-500/25 disabled:opacity-50"
                >
                  <Globe className="w-4 h-4" />
                  Publish
                </button>
              )}

              <button
                onClick={onClose}
                className="p-2.5 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="relative flex items-center gap-6 mt-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-xl">
              <Layers className="w-4 h-4 text-white/70" />
              <span className="text-sm font-medium text-white">{course.modules.length} Modules</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-xl">
              <FolderOpen className="w-4 h-4 text-white/70" />
              <span className="text-sm font-medium text-white">{totalSubModules} Sub-Modules</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-xl">
              <Video className="w-4 h-4 text-white/70" />
              <span className="text-sm font-medium text-white">{totalResources} Resources</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-xl">
              <HelpCircle className="w-4 h-4 text-white/70" />
              <span className="text-sm font-medium text-white">{totalQuizzes} Quizzes</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
          {[
            { id: 'identity', label: 'Course Identity', icon: BookOpen, description: 'Basic info & thumbnail' },
            { id: 'modules', label: 'Modules & Content', icon: Layers, description: 'Structure your course' },
            { id: 'settings', label: 'Settings', icon: Settings, description: 'Configure options' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 font-medium transition-all duration-200 relative group ${
                activeTab === tab.id
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <div className={`p-2 rounded-xl transition-colors ${
                activeTab === tab.id
                  ? 'bg-purple-100 dark:bg-purple-900/30'
                  : 'bg-gray-100 dark:bg-slate-700 group-hover:bg-gray-200 dark:group-hover:bg-slate-600'
              }`}>
                <tab.icon className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-semibold">{tab.label}</p>
                <p className={`text-xs ${activeTab === tab.id ? 'text-purple-500' : 'text-gray-400'}`}>
                  {tab.description}
                </p>
              </div>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
              )}
            </button>
          ))}
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top duration-300">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <p className="flex-1 text-red-800 dark:text-red-300 font-medium">{error}</p>
            <button onClick={() => setError(null)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl transition-colors">
              <X className="w-4 h-4 text-red-600 dark:text-red-400" />
            </button>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 p-4 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top duration-300">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
              <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="flex-1 text-emerald-800 dark:text-emerald-300 font-medium">{success}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Tab: Course Identity */}
          {activeTab === 'identity' && (
            <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900/50 p-6 lg:p-10">
              <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* Identity Card */}
                <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-xl border border-gray-100 dark:border-slate-700">
                  <div className="flex items-center gap-4 mb-8">
                     <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <BookOpen className="w-6 h-6" />
                     </div>
                     <div>
                        <h3 className="text-xl font-bold">Course Identity</h3>
                        <p className="text-sm text-gray-500">Define the core identity of your course</p>
                     </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 ml-1">Title</label>
                        <input
                          type="text"
                          value={course.title}
                          onChange={(e) => setCourse(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full px-5 py-3.5 bg-gray-50 dark:bg-slate-900/50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all font-medium"
                          placeholder="e.g. Modern Web Development"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 ml-1">Category</label>
                        <select
                          value={course.category}
                          onChange={(e) => setCourse(prev => ({ ...prev, category: e.target.value }))}
                          className="w-full px-5 py-3.5 bg-gray-50 dark:bg-slate-900/50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all font-medium appearance-none"
                        >
                          <option value="">Select Category</option>
                          {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 dark:text-gray-300 ml-1">Description</label>
                      <textarea
                        value={course.description}
                        onChange={(e) => setCourse(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full px-5 py-4 bg-gray-50 dark:bg-slate-900/50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all font-medium min-h-[120px] resize-none"
                        placeholder="What will learners achieve..."
                      />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
                      {/* Thumbnail section */}
                      <div className="space-y-3">
                         <label className="text-sm font-bold text-gray-700 dark:text-gray-300 ml-1">Course Art</label>
                         <div className="relative group rounded-3xl overflow-hidden aspect-video bg-gray-100 dark:bg-slate-900 flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-slate-700">
                            {course.thumbnailUrl ? (
                              <img src={course.thumbnailUrlPresigned || course.thumbnailUrl} className="w-full h-full object-cover" />
                            ) : (
                              <Image className="w-10 h-10 text-gray-300" />
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                               <button onClick={() => thumbnailInputRef.current?.click()} className="p-3 bg-white text-indigo-600 rounded-full hover:scale-110 transition-transform"><Plus className="w-5 h-5" /></button>
                               <button className="p-3 bg-white text-pink-600 rounded-full hover:scale-110 transition-transform"><Sparkles className="w-5 h-5" /></button>
                            </div>
                         </div>
                         <input ref={thumbnailInputRef} type="file" className="hidden" onChange={handleThumbnailUpload} />
                      </div>

                      {/* Level & Tags */}
                      <div className="space-y-5">
                         <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 ml-1">Difficulty Level</label>
                            <div className="flex flex-wrap gap-2">
                               {['Beginner', 'Intermediate', 'Advanced', 'Expert'].map(l => (
                                 <button
                                   key={l}
                                   onClick={() => setCourse(prev => ({ ...prev, level: l as any }))}
                                   className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${course.level === l ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-slate-700 text-gray-500'}`}
                                 >
                                   {l}
                                 </button>
                               ))}
                            </div>
                         </div>
                         <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 ml-1">Tags</label>
                            <input
                              type="text"
                              value={course.tags?.join(', ')}
                              onChange={(e) => setCourse(prev => ({ ...prev, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                              className="w-full px-5 py-3 bg-gray-50 dark:bg-slate-900/50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all font-medium text-sm"
                              placeholder="react, code, basics..."
                            />
                         </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Distribution Card */}
                {!isTenantAdmin && (
                  <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-xl border border-gray-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                           <Building2 className="w-6 h-6" />
                        </div>
                        <div>
                           <h3 className="text-xl font-bold">Distribution</h3>
                           <p className="text-sm text-gray-500">Assign this course to organizations</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          const all = tenants.map(t => t._id);
                          setCourse(prev => ({ ...prev, selectedTenants: prev.selectedTenants.length === tenants.length ? [] : all }));
                        }}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider"
                      >
                        {course.selectedTenants.length === tenants.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                       {tenants.map(t => (
                         <button
                           key={t._id}
                           onClick={() => setCourse(prev => ({
                             ...prev,
                             selectedTenants: prev.selectedTenants.includes(t._id) 
                               ? prev.selectedTenants.filter(id => id !== t._id) 
                               : [...prev.selectedTenants, t._id]
                           }))}
                           className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                             course.selectedTenants.includes(t._id)
                             ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                             : 'border-transparent bg-gray-50 dark:bg-slate-900/50 hover:bg-gray-100'
                           }`}
                         >
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${course.selectedTenants.includes(t._id) ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}`}>
                               {course.selectedTenants.includes(t._id) && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="text-sm font-semibold truncate">{t.orgName}</span>
                         </button>
                       ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Modules & Content */}
          {activeTab === 'modules' && (
            <div className="flex-1 flex overflow-hidden h-full">
               {/* Sidebar Tree */}
               <div className="w-80 border-r border-gray-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-900 shadow-sm z-10">
                  <div className="p-5 border-b border-gray-100 dark:border-slate-800">
                    <button
                      onClick={addModule}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
                    >
                      <Plus className="w-5 h-5" /> Add New Module
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    <DragDropContext onDragEnd={onDragEnd}>
                      <Droppable droppableId="modules" type="MODULE">
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
                            {course.modules.length === 0 ? (
                              <div className="text-center py-10 opacity-40">
                                <Layers className="w-10 h-10 mx-auto mb-2" />
                                <p className="text-xs font-semibold uppercase tracking-wider">Empty Syllabus</p>
                              </div>
                            ) : course.modules.map((m, idx) => (
                              <Draggable key={m.id} draggableId={m.id} index={idx}>
                                {(provided, snapshot) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} className="group flex flex-col gap-1">
                                    <div 
                                      className={`flex items-center gap-3 p-3 rounded-2xl transition-all border-2 cursor-pointer ${
                                        selectedModuleId === m.id && !selectedSubModuleId
                                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 shadow-md'
                                        : 'bg-white dark:bg-slate-800 border-transparent hover:bg-gray-50 dark:hover:bg-slate-700'
                                      }`}
                                      onClick={() => { setSelectedModuleId(m.id); setSelectedSubModuleId(null); }}
                                    >
                                      <div {...provided.dragHandleProps} className="opacity-0 group-hover:opacity-40 transition-opacity"><GripVertical className="w-4 h-4" /></div>
                                      <div className="w-8 h-8 shrink-0 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400 text-xs">{idx + 1}</div>
                                      <span className="flex-1 font-bold text-sm truncate">{m.title}</span>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); toggleModuleExpansion(m.id); }}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-md transition-colors"
                                      >
                                        <ChevronRight className={`w-4 h-4 transition-transform ${expandedModules.has(m.id) ? 'rotate-90' : ''}`} />
                                      </button>
                                    </div>
                                    
                                    {/* Nested Droppable for Submodules */}
                                    {expandedModules.has(m.id) && (
                                       <div className="ml-8 space-y-1 mt-1">
                                          <Droppable droppableId={`submodules-${m.id}`} type={`SUBMODULE-${m.id}`}>
                                            {(sprovided) => (
                                              <div ref={sprovided.innerRef} {...sprovided.droppableProps} className="space-y-1">
                                                {m.subModules.map((sm, sidx) => (
                                                  <Draggable key={sm.id} draggableId={sm.id} index={sidx}>
                                                    {(sprovided, ssnapshot) => (
                                                      <div 
                                                        ref={sprovided.innerRef} {...sprovided.draggableProps} {...sprovided.dragHandleProps}
                                                        className={`flex items-center gap-2 p-2.5 rounded-xl text-sm transition-all border-2 cursor-pointer ${
                                                          selectedSubModuleId === sm.id
                                                          ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-400 text-purple-700 dark:text-purple-300'
                                                          : 'bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-slate-800'
                                                        }`}
                                                        onClick={() => { setSelectedModuleId(m.id); setSelectedSubModuleId(sm.id); }}
                                                      >
                                                        <div className="w-2 h-2 rounded-full bg-purple-400" />
                                                        <span className="flex-1 font-medium truncate">{sm.title}</span>
                                                      </div>
                                                    )}
                                                  </Draggable>
                                                ))}
                                                {sprovided.placeholder}
                                                <button 
                                                  onClick={() => addSubModule(m.id)}
                                                  className="w-full flex items-center gap-2 p-2 px-3 text-xs font-bold text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 rounded-xl transition-all"
                                                >
                                                   <Plus className="w-3.5 h-3.5" /> New Submodule
                                                </button>
                                              </div>
                                            )}
                                          </Droppable>
                                       </div>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  </div>
               </div>

               {/* Main Editor */}
               <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-slate-900/30 custom-scrollbar relative p-6 lg:p-10">
                  {selectedModuleId ? (
                    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
                      {/* Breadcrumbs */}
                      <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                         <Layers className="w-4 h-4" />
                         <span>{course.title || 'Course'}</span>
                         <ChevronRight className="w-3.5 h-3.5" />
                         <span className={!selectedSubModuleId ? 'text-indigo-600' : ''}>{course.modules.find(m => m.id === selectedModuleId)?.title}</span>
                         {selectedSubModuleId && (
                           <>
                             <ChevronRight className="w-3.5 h-3.5" />
                             <span className="text-purple-600">{course.modules.find(m => m.id === selectedModuleId)?.subModules.find(sm => sm.id === selectedSubModuleId)?.title}</span>
                           </>
                         )}
                      </div>

                      {!selectedSubModuleId ? (
                        /* MODULE EDITOR */
                        <div className="space-y-6">
                           <div className="flex items-center justify-between">
                             <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-indigo-200">
                                   {course.modules.findIndex(m => m.id === selectedModuleId) + 1}
                                </div>
                                <h2 className="text-3xl font-extrabold tracking-tight">Module Settings</h2>
                             </div>
                             <div className="flex items-center gap-2">
                               <button 
                                onClick={() => deleteModule(selectedModuleId)}
                                className="p-3 bg-red-100 hover:bg-red-200 text-red-600 rounded-2xl transition-all active:scale-95"
                               >
                                  <Trash2 className="w-5 h-5" />
                               </button>
                             </div>
                           </div>

                           <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-xl border border-gray-100 dark:border-slate-700 space-y-8">
                             <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Module Title</label>
                                <input 
                                  value={course.modules.find(m => m.id === selectedModuleId)?.title || ''}
                                  onChange={(e) => updateModule(selectedModuleId, { title: e.target.value })}
                                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-900 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-xl transition-all"
                                />
                             </div>
                             <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                   <Target className="w-4 h-4 text-indigo-500" /> Learning Objective
                                </label>
                                <textarea 
                                  value={course.modules.find(m => m.id === selectedModuleId)?.learningObjective || ''}
                                  onChange={(e) => updateModule(selectedModuleId, { learningObjective: e.target.value })}
                                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-900 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all font-medium min-h-[100px] resize-none"
                                />
                             </div>

                             <div className="pt-6 border-t border-gray-100 dark:border-slate-700">
                                <div className="flex items-center justify-between p-6 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-3xl">
                                   <div className="flex items-center gap-4">
                                      <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl">
                                         <HelpCircle className="w-6 h-6 text-indigo-600" />
                                      </div>
                                      <div>
                                         <h4 className="font-bold">Module-End Quiz</h4>
                                         <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mt-0.5">Assessment Tier</p>
                                      </div>
                                   </div>
                                   <button 
                                    onClick={() => openQuizBuilder('module', selectedModuleId)}
                                    className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-lg ${
                                      course.modules.find(m => m.id === selectedModuleId)?.moduleEndQuiz 
                                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                      : 'bg-white text-indigo-600 hover:bg-gray-50'
                                    }`}
                                   >
                                      {course.modules.find(m => m.id === selectedModuleId)?.moduleEndQuiz ? 'Edit Assessment' : 'Setup Quiz'}
                                   </button>
                                </div>
                             </div>
                           </div>
                        </div>
                      ) : (
                        /* SUBMODULE EDITOR */
                        <div className="space-y-6">
                           <div className="flex items-center justify-between">
                             <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-purple-200">
                                   <FolderOpen className="w-6 h-6" />
                                </div>
                                <h2 className="text-3xl font-extrabold tracking-tight">Sub-module Editor</h2>
                             </div>
                             <button 
                              onClick={() => deleteSubModule(selectedModuleId, selectedSubModuleId)}
                              className="p-3 bg-red-100 hover:bg-red-200 text-red-600 rounded-2xl transition-all active:scale-95"
                             >
                                <Trash2 className="w-5 h-5" />
                             </button>
                           </div>

                           <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-xl border border-gray-100 dark:border-slate-700 space-y-8">
                             <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Title</label>
                                <input 
                                  value={course.modules.find(m => m.id === selectedModuleId)?.subModules.find(sm => sm.id === selectedSubModuleId)?.title || ''}
                                  onChange={(e) => updateSubModule(selectedModuleId, selectedSubModuleId, { title: e.target.value })}
                                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-900 border-2 border-transparent focus:border-purple-500 rounded-2xl outline-none font-bold text-xl transition-all"
                                />
                             </div>

                             {/* Action Grid for Resources & Quizzes */}
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-6 bg-blue-50/50 dark:bg-blue-900/10 border-2 border-blue-100 dark:border-blue-900/30 rounded-3xl group transition-all hover:border-blue-400">
                                   <div className="flex items-center justify-between mb-4">
                                      <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl text-blue-500 shadow-sm"><Video className="w-6 h-6" /></div>
                                      <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full">{course.modules.find(m => m.id === selectedModuleId)?.subModules.find(sm => sm.id === selectedSubModuleId)?.resources.length || 0} Assets</span>
                                   </div>
                                   <h4 className="font-bold text-lg mb-1">Learning Engine</h4>
                                   <p className="text-sm text-gray-500 mb-6">Manage videos, SCORM, and documents.</p>
                                   <button 
                                    onClick={() => openResourceEngine(selectedSubModuleId)}
                                    className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-200"
                                   >
                                      Resource Builder
                                   </button>
                                </div>

                                <div className="p-6 bg-emerald-50/50 dark:bg-emerald-900/10 border-2 border-emerald-100 dark:border-emerald-900/30 rounded-3xl group transition-all hover:border-emerald-400">
                                   <div className="flex items-center justify-between mb-4">
                                      <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl text-emerald-500 shadow-sm"><HelpCircle className="w-6 h-6" /></div>
                                      <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${course.modules.find(m => m.id === selectedModuleId)?.subModules.find(sm => sm.id === selectedSubModuleId)?.quiz ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                        {course.modules.find(m => m.id === selectedModuleId)?.subModules.find(sm => sm.id === selectedSubModuleId)?.quiz ? 'Active Quiz' : 'Optional Quiz'}
                                      </span>
                                   </div>
                                   <h4 className="font-bold text-lg mb-1">Checkpoint Quiz</h4>
                                   <p className="text-sm text-gray-500 mb-6">Test knowledge immediately after content.</p>
                                   <button 
                                    onClick={() => openQuizBuilder('submodule', selectedSubModuleId)}
                                    className={`w-full py-3 rounded-2xl font-bold transition-all shadow-lg ${
                                      course.modules.find(m => m.id === selectedModuleId)?.subModules.find(sm => sm.id === selectedSubModuleId)?.quiz 
                                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                      : 'bg-white dark:bg-slate-700 text-emerald-600 hover:bg-gray-100 transition-colors'
                                    }`}
                                   >
                                      Quiz Studio
                                   </button>
                                </div>
                             </div>

                             {/* Advance Options */}
                             <div className="space-y-4 pt-4">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-widest">Advanced Settings</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                   <div className="flex items-center gap-4 p-5 bg-gray-50 dark:bg-slate-900/50 rounded-2xl border border-gray-100 dark:border-slate-700">
                                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm text-gray-400"><Eye className="w-5 h-5" /></div>
                                      <div className="flex-1">
                                         <p className="text-sm font-bold">Preview Status</p>
                                         <p className="text-xs text-gray-500 font-medium">Allow without enrollment</p>
                                      </div>
                                      <button 
                                        onClick={() => updateSubModule(selectedModuleId, selectedSubModuleId, { isPreviewable: !course.modules.find(m => m.id === selectedModuleId)?.subModules.find(sm => sm.id === selectedSubModuleId)?.isPreviewable })}
                                        className={`w-12 h-6 rounded-full transition-all relative ${course.modules.find(m => m.id === selectedModuleId)?.subModules.find(sm => sm.id === selectedSubModuleId)?.isPreviewable ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                      >
                                         <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${course.modules.find(m => m.id === selectedModuleId)?.subModules.find(sm => sm.id === selectedSubModuleId)?.isPreviewable ? 'left-7' : 'left-1'}`} />
                                      </button>
                                   </div>

                                   <div className="flex items-center gap-4 p-5 bg-gray-50 dark:bg-slate-900/50 rounded-2xl border border-gray-100 dark:border-slate-700">
                                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm text-gray-400"><Target className="w-5 h-5" /></div>
                                      <div className="flex-1">
                                         <p className="text-sm font-bold">Pass Criteria</p>
                                         <p className="text-xs text-gray-500 font-medium">Completion threshold (%)</p>
                                      </div>
                                      <input 
                                        type="number"
                                        value={course.modules.find(m => m.id === selectedModuleId)?.subModules.find(sm => sm.id === selectedSubModuleId)?.completionThreshold || 80}
                                        onChange={(e) => updateSubModule(selectedModuleId, selectedSubModuleId, { completionThreshold: parseInt(e.target.value) || 80 })}
                                        className="w-16 px-2 py-1.5 font-bold text-center bg-white dark:bg-slate-800 rounded-lg outline-none focus:border-purple-500 border-2 border-transparent transition-all"
                                      />
                                   </div>
                                </div>
                             </div>
                           </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* WELCOME / OVERVIEW STATE */
                    <div className="h-full flex flex-col items-center justify-center text-center p-10">
                       <div className="relative mb-10 group">
                          <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 group-hover:opacity-40 transition-opacity" />
                          <div className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-2xl flex items-center justify-center animate-bounce duration-slow relative z-10">
                             <Zap className="w-16 h-16 text-white" />
                          </div>
                       </div>
                       <h2 className="text-4xl font-black tracking-tight mb-4">Design your Syllabus</h2>
                       <p className="text-gray-500 max-w-sm font-medium">Select a module from the left to start adding lessons, quizzes and learning materials.</p>
                       <div className="flex gap-4 mt-10">
                          <div className="px-6 py-4 rounded-3xl bg-white dark:bg-slate-800 shadow-lg border border-gray-100 flex flex-col items-center gap-1">
                             <span className="text-xs font-black text-indigo-500 uppercase">Tree Mode</span>
                             <p className="font-bold">Hierarchy</p>
                          </div>
                          <div className="px-6 py-4 rounded-3xl bg-white dark:bg-slate-800 shadow-lg border border-gray-100 flex flex-col items-center gap-1">
                             <span className="text-xs font-black text-purple-500 uppercase">Drag'n'Drop</span>
                             <p className="font-bold">Sorting</p>
                          </div>
                          <div className="px-6 py-4 rounded-3xl bg-white dark:bg-slate-800 shadow-lg border border-gray-100 flex flex-col items-center gap-1">
                             <span className="text-xs font-black text-pink-500 uppercase">Auto-Save</span>
                             <p className="font-bold">Protection</p>
                          </div>
                       </div>
                    </div>
                  )}
               </div>
            </div>
          )}

          {/* Tab: Settings */}
          {activeTab === 'settings' && (
            <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900/50 p-6 lg:p-10">
              <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-xl border border-gray-100 dark:border-slate-700">
                  <div className="flex items-center gap-4 mb-8">
                     <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                        <Settings className="w-6 h-6" />
                     </div>
                     <div>
                        <h3 className="text-xl font-bold">Course Control</h3>
                        <p className="text-sm text-gray-500">Global behavior and completion settings</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {[
                       { key: 'sequentialProgression', label: 'Sequential Progress', desc: 'Lock next lesson until current is done', icon: Lock },
                       { key: 'certificateEnabled', label: 'Offer Certificate', desc: 'Issue award on completion', icon: Trophy },
                       { key: 'allowRevisit', label: 'Free Revisit', desc: 'Learners can go back anytime', icon: RefreshCw },
                       { key: 'showProgressBar', label: 'Course Progress Bar', desc: 'Display completion meter', icon: BarChart2 },
                     ].map(opt => (
                       <button
                         key={opt.key}
                         onClick={() => setCourse(p => ({ ...p, settings: { ...p.settings, [opt.key]: !((p.settings as any)[opt.key]) } }))}
                         className={`flex items-start gap-4 p-5 rounded-3xl border-2 transition-all text-left ${
                           (course.settings as any)[opt.key]
                           ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10'
                           : 'border-transparent bg-gray-50 dark:bg-slate-900/50 hover:bg-gray-100 shadow-sm'
                         }`}
                       >
                          <div className={`p-3 rounded-2xl ${
                            (course.settings as any)[opt.key] ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-400'
                          }`}>
                             <opt.icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 pt-1">
                             <p className="font-bold text-sm">{(opt.label)}</p>
                             <p className="text-xs text-gray-500 leading-tight mt-0.5">{opt.desc}</p>
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mt-1 transition-all ${(course.settings as any)[opt.key] ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200'}`}>
                             {(course.settings as any)[opt.key] && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                       </button>
                     ))}
                  </div>

                  <div className="mt-10 p-6 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl text-white shadow-xl">
                      <div className="flex items-center gap-4 mb-6">
                         <div className="p-3 bg-white/20 rounded-2xl"><Target className="w-6 h-6" /></div>
                         <div>
                            <h4 className="font-bold text-lg">Passing Criteria</h4>
                            <p className="text-white/70 text-sm">Minimum score required to pass</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-10">
                         <div className="flex-1">
                            <input 
                              type="range"
                              min="0"
                              max="100"
                              value={course.settings.passingScore}
                              onChange={(e) => setCourse(p => ({ ...p, settings: { ...p.settings, passingScore: parseInt(e.target.value) } }))}
                              className="w-full accent-white"
                            />
                            <div className="flex justify-between mt-2 text-[10px] font-black uppercase tracking-widest opacity-60">
                               <span>Easy (0%)</span>
                               <span>Elite (100%)</span>
                            </div>
                         </div>
                         <div className="text-center w-20">
                            <span className="text-4xl font-black leading-none">{course.settings.passingScore}</span>
                            <span className="text-lg font-bold ml-1">%</span>
                         </div>
                      </div>
                  </div>

                  <div className="mt-8 p-5 bg-violet-50 dark:bg-violet-900/10 rounded-3xl border border-violet-100 dark:border-violet-800/30 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl text-violet-600 shadow-sm">
                        <Calendar className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold">Access Validity</p>
                        <p className="text-xs text-gray-500">Days learners can access (empty = unlimited)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <input 
                        type="number"
                        value={course.settings.validityDays || ''}
                        onChange={(e) => setCourse(p => ({ ...p, settings: { ...p.settings, validityDays: parseInt(e.target.value) || 0 } }))}
                        className="w-24 px-4 py-2 bg-white dark:bg-slate-800 border-2 border-transparent focus:border-violet-500 rounded-xl outline-none font-bold text-center transition-all"
                        placeholder="∞"
                       />
                       <span className="text-sm font-bold text-gray-400">Days</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quiz Builder Modal */}
      {showQuizBuilder && quizTarget && (
        <QuizBuilderAdvanced
          quiz={getCurrentQuiz()}
          onSave={saveQuiz}
          onDelete={deleteQuiz}
          onClose={() => {
            setShowQuizBuilder(false);
            setQuizTarget(null);
          }}
        />
      )}

      {/* Resource Engine Modal */}
      {showResourceEngine && resourceTargetSubModule && (
        <SubModuleResourceEngine
          resources={getCurrentResources()}
          onSave={saveResources}
          onClose={() => {
            setShowResourceEngine(false);
            setResourceTargetSubModule(null);
          }}
        />
      )}
    </div>
  );
};

export default MasterCourseStudio;
