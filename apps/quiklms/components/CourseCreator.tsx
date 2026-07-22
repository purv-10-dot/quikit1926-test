'use client';
/**
 * CourseCreator — ported from the old QuikSkills frontend
 * (`src/components/CourseCreator.tsx`), replacing the "coming soon" stub.
 *
 * A 3-step wizard modal that authors a master course:
 *   1. Identity   — title, category, thumbnail (manual upload or AI generation
 *                   via POST /api/upload/generate-thumbnail).
 *   2. Hierarchy  — modules → sub-modules, each with an optional resource
 *                   (file upload / video link) and an optional quiz. Sub-modules
 *                   are reorderable with react-beautiful-dnd.
 *   3. Review & Distribution — course summary, learner-facing preview, and the
 *                   tenant picker; submits to POST/PUT /api/courses/master.
 *
 * Two deltas from the original, both forced by the target app's architecture:
 *   - axios → the `@/lib/api` fetch wrapper: response bodies are returned
 *     directly, so every `res.data.data` collapses to `res.data`.
 *   - the `course-thumbnail` / `course-resource` upload endpoints are now
 *     presigned-PUT minters, so those two FormData posts go through
 *     `uploadViaPresign`. `/upload/scorm` genuinely needs the bytes server-side
 *     (it reads imsmanifest.xml), so it keeps its multipart contract.
 */
import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Plus, Trash2, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Eye, BookOpen, HelpCircle, Link, Building2, Check, Sparkles, Loader2, Image as ImageIcon, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import VideoPlayer from '@/components/VideoPlayer';
import { api } from '@/lib/api';
import { uploadViaPresign } from '@/lib/upload-client';

interface CourseCreatorProps {
  onClose: () => void;
  onSuccess: () => void;
  courseId?: string; // Optional course ID for editing
}

interface Module {
  id: string;
  title: string;
  subModules: SubModule[];
}

interface SubModule {
  id: string;
  title: string;
  resourceType: 'upload' | 'youtube' | null;
  resourceData: {
    file?: File | null;
    youtubeUrl?: string;
    videoUrl?: string;
    fileUrl?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scormManifest?: any;
  };
  quiz?: Quiz | null;
}

interface Quiz {
  questions: Question[];
  passingScore: number;
}

interface Question {
  id: string;
  text: string;
  options: string[];
  questionType: 'single' | 'multiple'; // Single or multiple correct answers
  correctAnswer: number | number[]; // Single index for 'single', array of indices for 'multiple'
}

// The fetch wrapper in `@/lib/api` throws the parsed error BODY (an `ApiError`:
// `{ statusCode, message, error? }`) where axios threw `err.response.data`.
// This is the narrowing shim for the `catch (err: unknown)` blocks below.
interface ApiErrorLike {
  statusCode?: number;
  message?: string;
  error?: string;
}

const asApiError = (err: unknown): ApiErrorLike =>
  err && typeof err === 'object' ? (err as ApiErrorLike) : {};

const CourseCreator: React.FC<CourseCreatorProps> = ({ onClose, onSuccess, courseId }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loadingCourse, setLoadingCourse] = useState(!!courseId);
  const [isEditing, setIsEditing] = useState(!!courseId);

  // Step 1: Identity
  const [courseTitle, setCourseTitle] = useState('');
  const [courseCategory, setCourseCategory] = useState('');
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // AI Thumbnail Generation
  const [thumbnailMode, setThumbnailMode] = useState<'upload' | 'ai'>('upload');
  const [hasAiApiKey, setHasAiApiKey] = useState(false); // Check if user has configured API key
  const [aiProvider, setAiProvider] = useState<'openai' | 'stability' | 'leonardo'>('openai');
  const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
  const [generatingThumbnails, setGeneratingThumbnails] = useState(false);
  const [selectedAiThumbnail, setSelectedAiThumbnail] = useState<string | null>(null);

  // Step 2: Hierarchy
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedSubModuleId, setSelectedSubModuleId] = useState<string | null>(null);
  const [showResourcePicker, setShowResourcePicker] = useState(false);
  const [storageUsage, setStorageUsage] = useState({ current: 0, limit: 2 * 1024 * 1024 * 1024 }); // 2GB in bytes
  const [showStorageModal, setShowStorageModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Quiz
  const [showQuizEditor, setShowQuizEditor] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [passingScore, setPassingScore] = useState(80);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  // Tenant Selection (Step 3)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [availableTenants, setAvailableTenants] = useState<any[]>([]);
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Loading states
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Check for AI API key configuration
  useEffect(() => {
    checkAiApiKeyConfiguration();
  }, []);

  // Load course data if editing
  useEffect(() => {
    if (courseId) {
      loadCourseForEdit(courseId);
    }
  }, [courseId]);

  // Load tenants when step 3 is reached
  useEffect(() => {
    if (currentStep === 3 && availableTenants.length === 0) {
      loadTenants();
    }
  }, [currentStep]);

  const checkAiApiKeyConfiguration = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await api.get<{ success: boolean; data: any }>('/auth/profile');
      const profile = response.data;
      // aiApiKey will be true/false boolean indicating if key is configured
      setHasAiApiKey(!!profile.aiApiKey);
    } catch (err) {
      console.error('Failed to check API key configuration:', err);
      setHasAiApiKey(false);
    }
  };

  const loadCourseForEdit = async (id: string) => {
    try {
      setLoadingCourse(true);
      setError(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await api.get<{ success: boolean; data: any }>(`/courses/master/${id}`);
      const course = response.data;

      // Populate form with course data
      setCourseTitle(course.title || '');
      setCourseCategory(course.category || '');
      if (course.thumbnailUrl) {
        setThumbnailPreview(course.thumbnailUrl);
      }

      // Convert course modules to the format expected by the form
      if (course.modules && course.modules.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formattedModules: Module[] = course.modules.map((module: any, moduleIndex: number) => {
          // Lessons are embedded in the module, so they should be directly accessible
          const lessons = module.lessons || [];

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const subModules = lessons.map((lesson: any, lessonIndex: number) => {
            // Determine resource type based on lesson type
            let resourceType: 'upload' | 'youtube' | null = null;
            const resourceData: SubModule['resourceData'] = {};

            if (lesson.type === 'Video' && lesson.contentUrl) {
              resourceType = 'youtube'; // Video links are treated as YouTube/Vimeo links
              resourceData.videoUrl = lesson.contentUrl;
              resourceData.youtubeUrl = lesson.contentUrl;
            } else if (lesson.type === 'SCORM' && lesson.contentUrl) {
              resourceType = 'upload'; // SCORM is treated as upload
              resourceData.fileUrl = lesson.contentUrl;
            } else if (lesson.type && lesson.contentUrl) {
              // PDF, PPT, Text, etc.
              resourceType = 'upload';
              resourceData.fileUrl = lesson.contentUrl;
            }

            return {
              id: lesson._id?.toString() || `submodule-${Date.now()}-${moduleIndex}-${lessonIndex}`,
              title: lesson.title || '',
              resourceType,
              resourceData,
              quiz: lesson.quiz || null, // Load quiz if it exists
            };
          });

          return {
            id: module._id?.toString() || `module-${Date.now()}-${moduleIndex}`,
            title: module.title || '',
            subModules,
          };
        });

        setModules(formattedModules);
      } else {
        setModules([]);
      }

      // Load selected tenants
      if (course.selectedTenants && course.selectedTenants.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSelectedTenants(course.selectedTenants.map((id: any) => id.toString()));
      }

      setIsEditing(true);
    } catch (err: unknown) {
      console.error('Failed to load course:', err);
      setError(asApiError(err).message || 'Failed to load course for editing');
    } finally {
      setLoadingCourse(false);
    }
  };

  const loadTenants = async () => {
    try {
      setLoadingTenants(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await api.get<{ success: boolean; data: any[] }>('/tenants');
      setAvailableTenants(response.data || []);
    } catch (error) {
      console.error('Failed to load tenants:', error);
      setAvailableTenants([]);
    } finally {
      setLoadingTenants(false);
    }
  };

  const toggleTenantSelection = (tenantId: string) => {
    setSelectedTenants(prev =>
      prev.includes(tenantId)
        ? prev.filter(id => id !== tenantId)
        : [...prev, tenantId]
    );
  };

  const selectAllTenants = () => {
    if (selectedTenants.length === availableTenants.length) {
      setSelectedTenants([]);
    } else {
      setSelectedTenants(availableTenants.map(t => t._id));
    }
  };

  // Check storage before upload (skip for master courses - no tenant ID needed)
  const checkStorage = async (fileSize: number): Promise<boolean> => {
    try {
      // For master courses, skip storage check or use a generous default
      // Master courses are stored separately and don't count against tenant storage
      const response = await api.get<{
        success: boolean;
        data: { currentUsage?: number; storageLimit?: number };
      }>('/tenants/usage');
      const usage = response.data;
      const currentUsage = usage.currentUsage || 0;
      const limit = usage.storageLimit || 10 * 1024 * 1024 * 1024; // 10GB default for master courses

      setStorageUsage({ current: currentUsage, limit });

      if (currentUsage + fileSize > limit) {
        setShowStorageModal(true);
        return false;
      }
      return true;
    } catch (error: unknown) {
      console.error('Failed to check storage:', error);
      const apiError = asApiError(error);
      // For master courses, if tenant check fails, allow upload anyway
      if (apiError.statusCode === 400 && apiError.message?.includes('Tenant ID')) {
        // This is a master course - allow upload without tenant ID
        setStorageUsage({ current: 0, limit: 10 * 1024 * 1024 * 1024 }); // 10GB default
        return true;
      }
      // Allow upload if check fails (graceful degradation)
      return true;
    }
  };

  // Step 1 Handlers
  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB
        setError('Thumbnail size must be less than 5MB');
        return;
      }
      setThumbnail(file);
      setError(null);
      const url = URL.createObjectURL(file);
      setThumbnailPreview(url);
    }
  };

  const handleGenerateAiThumbnails = async () => {
    if (!courseTitle.trim()) {
      setError('Please enter a course title first');
      return;
    }

    setGeneratingThumbnails(true);
    setError(null);

    try {
      const response = await api.post<{
        success: boolean;
        data: { thumbnails?: string[] };
      }>('/upload/generate-thumbnail', {
        courseTitle,
        courseCategory: courseCategory || undefined,
        provider: aiProvider,
        count: 4,
        // API key will be retrieved from user profile on backend
      });

      if (response.success && response.data.thumbnails) {
        setGeneratedThumbnails(response.data.thumbnails);
      }
    } catch (err: unknown) {
      console.error('Failed to generate thumbnails:', err);
      setError(asApiError(err).message || 'Failed to generate thumbnails. Please configure your API key in Profile Settings.');
    } finally {
      setGeneratingThumbnails(false);
    }
  };

  const handleSelectAiThumbnail = (thumbnailUrl: string) => {
    setSelectedAiThumbnail(thumbnailUrl);
    setThumbnailPreview(thumbnailUrl);
    setThumbnail(null); // Clear any previously selected file
  };

  const handleStep1Next = () => {
    if (!courseTitle.trim()) {
      setError('Course title is required');
      return;
    }
    if (!courseCategory.trim()) {
      setError('Course category is required');
      return;
    }
    setError(null);
    setCurrentStep(2);
  };

  // Step 2 Handlers
  const handleAddModule = () => {
    const newModule: Module = {
      id: `module-${Date.now()}`,
      title: `Module ${modules.length + 1}`,
      subModules: [],
    };
    setModules([...modules, newModule]);
  };

  const handleDeleteModule = (moduleId: string) => {
    setModules(modules.filter(m => m.id !== moduleId));
  };

  const handleAddSubModule = (moduleId: string) => {
    const module = modules.find(m => m.id === moduleId);
    if (!module) return;

    const newSubModule: SubModule = {
      id: `submodule-${Date.now()}`,
      title: `Sub-module ${module.subModules.length + 1}`,
      resourceType: null,
      resourceData: {},
      quiz: null,
    };

    setModules(modules.map(m =>
      m.id === moduleId
        ? { ...m, subModules: [...m.subModules, newSubModule] }
        : m
    ));
  };

  const handleDeleteSubModule = (moduleId: string, subModuleId: string) => {
    setModules(modules.map(m =>
      m.id === moduleId
        ? { ...m, subModules: m.subModules.filter(sm => sm.id !== subModuleId) }
        : m
    ));
  };

  const handleOpenResourcePicker = (moduleId: string, subModuleId: string) => {
    setSelectedModuleId(moduleId);
    setSelectedSubModuleId(subModuleId);
    setShowResourcePicker(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedModuleId || !selectedSubModuleId) return;

    // Check storage
    const canUpload = await checkStorage(file.size);
    if (!canUpload) {
      return;
    }

    const module = modules.find(m => m.id === selectedModuleId);
    if (!module) return;

    setModules(modules.map(m =>
      m.id === selectedModuleId
        ? {
            ...m,
            subModules: m.subModules.map(sm =>
              sm.id === selectedSubModuleId
                ? { ...sm, resourceType: 'upload' as const, resourceData: { file } }
                : sm
            ),
          }
        : m
    ));

    setShowResourcePicker(false);
    setSelectedModuleId(null);
    setSelectedSubModuleId(null);
  };

  const handleVideoLink = () => {
    const url = prompt('Enter video URL (YouTube, Vimeo, or direct video link):');
    if (!url || !selectedModuleId || !selectedSubModuleId) return;

    // Validate URL
    try {
      new URL(url);
    } catch {
      setError('Invalid URL format');
      return;
    }

    const module = modules.find(m => m.id === selectedModuleId);
    if (!module) return;

    console.log('[CourseCreator] Adding YouTube URL:', url, 'to module:', selectedModuleId, 'subModule:', selectedSubModuleId);

    setModules(modules.map(m =>
      m.id === selectedModuleId
        ? {
            ...m,
            subModules: m.subModules.map(sm =>
              sm.id === selectedSubModuleId
                ? { ...sm, resourceType: 'youtube' as const, resourceData: { youtubeUrl: url, videoUrl: url } }
                : sm
            ),
          }
        : m
    ));

    setShowResourcePicker(false);
    setSelectedModuleId(null);
    setSelectedSubModuleId(null);
    setError(null);
  };

  const handleRemoveResource = (moduleId: string, subModuleId: string) => {
    setModules(modules.map(m =>
      m.id === moduleId
        ? {
            ...m,
            subModules: m.subModules.map(sm =>
              sm.id === subModuleId
                ? { ...sm, resourceType: null, resourceData: {} }
                : sm
            ),
          }
        : m
    ));
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || !selectedModuleId) return;

    const module = modules.find(m => m.id === selectedModuleId);
    if (!module) return;

    const items = Array.from(module.subModules);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setModules(modules.map(m =>
      m.id === selectedModuleId
        ? { ...m, subModules: items }
        : m
    ));
  };

  const handleStep2Next = () => {
    if (modules.length === 0) {
      setError('Please add at least one module');
      return;
    }
    setError(null);
    setCurrentStep(3);
  };

  // Step 3 Handlers
  const handleOpenQuizEditor = (moduleId: string, subModuleId: string) => {
    setSelectedModuleId(moduleId);
    setSelectedSubModuleId(subModuleId);
    const module = modules.find(m => m.id === moduleId);
    const subModule = module?.subModules.find(sm => sm.id === subModuleId);

    if (subModule?.quiz) {
      // Ensure backward compatibility: if questionType is missing, assume 'single'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const questions = (subModule.quiz.questions || []).map((q: any) => ({
        ...q,
        questionType: q.questionType || 'single',
        // If correctAnswer is an array but questionType is missing, infer it
        correctAnswer: Array.isArray(q.correctAnswer)
          ? (q.questionType === 'multiple' ? q.correctAnswer : q.correctAnswer[0] || 0)
          : q.correctAnswer,
      }));
      setQuizQuestions(questions);
      setPassingScore(subModule.quiz.passingScore || 80);
    } else {
      setQuizQuestions([]);
      setPassingScore(80);
    }
    setShowQuizEditor(true);
  };

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      id: `question-${Date.now()}`,
      text: '',
      options: ['', '', '', ''],
      questionType: 'single',
      correctAnswer: 0,
    };
    setQuizQuestions([...quizQuestions, newQuestion]);
    setExpandedQuestionId(newQuestion.id);
  };

  const handleDeleteQuestion = (questionId: string) => {
    setQuizQuestions(quizQuestions.filter(q => q.id !== questionId));
  };

  const handleSaveQuiz = () => {
    if (!selectedModuleId || !selectedSubModuleId) return;
    if (quizQuestions.length === 0) {
      setError('Please add at least one question');
      return;
    }

    // Validate that all questions have at least one correct answer
    for (const question of quizQuestions) {
      if (question.questionType === 'single') {
        if (typeof question.correctAnswer !== 'number' || question.correctAnswer < 0) {
          setError(`Question "${question.text || 'Untitled'}" must have a correct answer selected`);
          return;
        }
      } else if (question.questionType === 'multiple') {
        const answers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
        if (answers.length === 0) {
          setError(`Question "${question.text || 'Untitled'}" must have at least one correct answer selected`);
          return;
        }
      }
    }

    const quiz: Quiz = {
      questions: quizQuestions,
      passingScore,
    };

    setModules(modules.map(m =>
      m.id === selectedModuleId
        ? {
            ...m,
            subModules: m.subModules.map(sm =>
              sm.id === selectedSubModuleId
                ? { ...sm, quiz }
                : sm
            ),
          }
        : m
    ));

    setShowQuizEditor(false);
    setSelectedModuleId(null);
    setSelectedSubModuleId(null);
    setError(null);
  };

  const handleFinalSubmit = async () => {
    setSaving(true);
    setError(null);

    try {
      // Upload thumbnail or use AI-generated URL
      let thumbnailUrl = '';

      // If AI-generated thumbnail is selected, use its URL directly
      if (selectedAiThumbnail) {
        thumbnailUrl = selectedAiThumbnail;
      }
      // Otherwise, upload the file if one was selected
      else if (thumbnail) {
        try {
          // `/upload/course-thumbnail` is a presigned-PUT minter now: POST JSON
          // metadata, then PUT the bytes straight to S3. `uploadViaPresign` does
          // both and returns the permanent URL that used to arrive as
          // `thumbResponse.data.data.url`.
          thumbnailUrl = await uploadViaPresign(thumbnail, '/upload/course-thumbnail');
        } catch (thumbError: unknown) {
          console.error('Thumbnail upload error:', thumbError);
          setError(asApiError(thumbError).message || 'Failed to upload thumbnail. You can continue without it.');
          // Allow course creation to continue without thumbnail
          thumbnailUrl = '';
        }
      }

      // Upload all files for sub-modules
      const processedModules = await Promise.all(
        modules.map(async (module) => {
          const processedSubModules = await Promise.all(
            module.subModules.map(async (subModule) => {
              let resourceData = { ...subModule.resourceData };

              // Upload file if it's a file upload
              if (subModule.resourceType === 'upload' && subModule.resourceData.file) {
                const file = subModule.resourceData.file;

                // Check if it's SCORM (ZIP file)
                if (file.name.endsWith('.zip')) {
                  const formData = new FormData();
                  formData.append('file', file);
                  // `/upload/scorm` still takes multipart: the server has to read
                  // imsmanifest.xml and rewrite the entry-point HTML, so it cannot
                  // be a presigned PUT.
                  const scormResponse = await api.post<{
                    success: boolean;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    data: { indexHtmlUrl: string; manifest: any };
                  }>('/upload/scorm', formData);
                  resourceData = {
                    fileUrl: scormResponse.data.indexHtmlUrl,
                    scormManifest: scormResponse.data.manifest,
                  };
                } else {
                  // Regular file upload (PDF, PPT, etc.) — also presigned-PUT now.
                  // A failure here aborts the whole submit (Promise.all), which
                  // is correct — a course must not save with a dangling
                  // resource — but Promise.all loses all context about WHICH of
                  // the sub-modules failed. Name it, so a 12-module course does
                  // not report one anonymous error.
                  let fileUrl: string;
                  try {
                    fileUrl = await uploadViaPresign(file, '/upload/course-resource');
                  } catch (uploadErr: unknown) {
                    const detail = asApiError(uploadErr).message || 'upload failed';
                    throw new Error(`"${subModule.title || 'Untitled sub-module'}" — ${detail}`);
                  }
                  resourceData = {
                    fileUrl,
                  };
                }
              }

              const result = {
                title: subModule.title,
                resourceType: subModule.resourceType,
                resourceData,
                quiz: subModule.quiz,
              };
              console.log('[CourseCreator] SubModule being sent:', result);
              return result;
            })
          );

          return {
            title: module.title,
            subModules: processedSubModules,
          };
        })
      );

      // Prepare course data
      const courseData = {
        title: courseTitle,
        category: courseCategory,
        thumbnail: thumbnailUrl,
        modules: processedModules,
        selectedTenants: selectedTenants, // Include selected tenants
      };

      console.log('[CourseCreator] Full courseData being sent:', JSON.stringify(courseData, null, 2));

      // Create or update course
      let response: { success: boolean; message?: string };
      if (isEditing && courseId) {
        // Update existing course
        response = await api.put<{ success: boolean; message?: string }>(`/courses/master/${courseId}`, courseData);
      } else {
        // Create new course
        response = await api.post<{ success: boolean; message?: string }>('/courses/master', courseData);
      }

      if (response.success) {
        onSuccess();
        onClose();
      } else {
        setError(response.message || `Failed to ${isEditing ? 'update' : 'create'} course`);
      }
    } catch (err: unknown) {
      console.error('Course creation error:', err);
      const apiError = asApiError(err);
      const errorMessage = apiError.message ||
                          apiError.error ||
                          'Failed to create course';
      setError(errorMessage);

      // If unauthorized, suggest logging in again
      if (apiError.statusCode === 401) {
        setError(`${errorMessage}. Please try logging out and logging back in.`);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loadingCourse) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-12">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            <p className="text-gray-600">Loading course data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[95vw] sm:max-w-2xl md:max-w-4xl lg:max-w-6xl h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header - Responsive */}
        <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 truncate">
              {isEditing ? 'Edit Master Course' : 'Create Master Course'}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
              Step {currentStep} of 3: {currentStep === 1 ? 'Identity' : currentStep === 2 ? 'Hierarchy' : 'Review & Distribution'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors ml-2 p-1"
            disabled={saving}
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Progress Bar - Responsive */}
        <div className="px-3 sm:px-6 py-2 sm:py-4 border-b border-gray-200 flex-shrink-0">
          {/* Mobile: Simple step indicator */}
          <div className="flex sm:hidden items-center justify-center gap-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  currentStep >= step ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {currentStep > step ? <CheckCircle className="w-4 h-4" /> : step}
                </div>
                {step < 3 && (
                  <div className={`w-8 h-0.5 mx-1 ${
                    currentStep > step ? 'bg-primary-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
          {/* Desktop: Full progress bar */}
          <div className="hidden sm:flex items-center justify-between">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-8 md:w-10 h-8 md:h-10 rounded-full ${
                  currentStep >= step ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {currentStep > step ? <CheckCircle className="w-5 md:w-6 h-5 md:h-6" /> : step}
                </div>
                <div className="ml-2 md:ml-3 flex-1">
                  <p className={`text-xs md:text-sm font-medium ${
                    currentStep >= step ? 'text-primary-600' : 'text-gray-500'
                  }`}>
                    {step === 1 ? 'Identity' : step === 2 ? 'Content' : 'Distribute'}
                  </p>
                </div>
                {step < 3 && (
                  <div className={`flex-1 h-1 mx-2 md:mx-4 ${
                    currentStep > step ? 'bg-primary-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Content Area - Responsive padding */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {/* Step 1: Identity */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <label className="label-field">
                  Course Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  className="input-field"
                  placeholder="Enter course title"
                />
              </div>

              <div>
                <label className="label-field">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={courseCategory}
                  onChange={(e) => setCourseCategory(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select category</option>
                  <option value="technology">Technology</option>
                  <option value="business">Business</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="education">Education</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="label-field">Course Thumbnail</label>

                {/* Mode Toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setThumbnailMode('upload');
                      setError(null);
                    }}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                      thumbnailMode === 'upload'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Upload className="w-5 h-5" />
                    Upload Image
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setThumbnailMode('ai');
                      setError(null);
                    }}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                      thumbnailMode === 'ai'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Sparkles className="w-5 h-5" />
                    Generate with AI
                  </button>
                </div>

                {/* Upload Mode */}
                {thumbnailMode === 'upload' && (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-500 transition-colors">
                    <input
                      ref={thumbnailInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleThumbnailSelect}
                      className="hidden"
                      id="thumbnail-upload"
                    />
                    <label
                      htmlFor="thumbnail-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <Upload className="w-12 h-12 text-gray-400 mb-4" />
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        Click to upload thumbnail
                      </p>
                      <p className="text-xs text-gray-500">Image file (max 5MB)</p>
                    </label>
                  </div>
                )}

                {/* AI Generation Mode */}
                {thumbnailMode === 'ai' && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-6">
                      <div className="flex items-start gap-3 mb-4">
                        <Sparkles className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-1">AI-Powered Thumbnail Generation</h4>
                          <p className="text-sm text-gray-600">Generate professional thumbnails using OpenAI DALL-E 3.</p>
                        </div>
                      </div>

                      {/* API Key Configuration Status */}
                      {!hasAiApiKey ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-yellow-900 mb-1">API Key Required</p>
                              <p className="text-xs text-yellow-700 mb-2">
                                Please configure your OpenAI API key in Profile Settings to use AI thumbnail generation.
                              </p>
                              <a
                                href="/dashboard/profile-settings"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-purple-600 hover:text-purple-700 underline font-medium"
                              >
                                Go to Profile Settings →
                              </a>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                          <p className="text-sm text-green-800">
                            API key configured and ready to use
                          </p>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleGenerateAiThumbnails}
                        disabled={generatingThumbnails || !courseTitle.trim() || !hasAiApiKey}
                        className="w-full btn-primary flex items-center justify-center gap-2"
                      >
                        {generatingThumbnails ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Generating 4 thumbnails...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5" />
                            Generate Thumbnails
                          </>
                        )}
                      </button>

                      <p className="text-xs text-gray-500 mt-2 text-center">
                        ~$0.32 per generation (4 thumbnails) • Powered by OpenAI DALL-E 3
                      </p>
                    </div>

                    {/* Generated Thumbnails Grid */}
                    {generatedThumbnails.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-700">Select a thumbnail:</p>
                        <div className="grid grid-cols-2 gap-4">
                          {generatedThumbnails.map((url, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => handleSelectAiThumbnail(url)}
                              className={`relative group rounded-lg overflow-hidden border-4 transition-all ${
                                selectedAiThumbnail === url
                                  ? 'border-primary-500 shadow-lg'
                                  : 'border-gray-200 hover:border-primary-300'
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={`AI Generated Thumbnail ${index + 1}`}
                                className="w-full h-32 object-cover"
                              />
                              {selectedAiThumbnail === url && (
                                <div className="absolute inset-0 bg-primary-500/20 flex items-center justify-center">
                                  <div className="bg-primary-500 text-white rounded-full p-2">
                                    <CheckCircle className="w-6 h-6" />
                                  </div>
                                </div>
                              )}
                              <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded text-xs font-medium">
                                #{index + 1}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Thumbnail Preview */}
                {thumbnailPreview && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Selected Thumbnail:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbnailPreview}
                      alt="Thumbnail preview"
                      className="w-48 h-32 object-cover rounded-lg border-2 border-primary-500 shadow-md"
                    />
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

            </div>
          )}

          {/* Step 2: Hierarchy */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Course Structure</h3>
                <button
                  onClick={handleAddModule}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Module
                </button>
              </div>

              {modules.length === 0 ? (
                <div className="text-center py-8 sm:py-12 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-gray-500 text-sm sm:text-base">No modules yet. Click &quot;Add Module&quot; to get started.</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4 max-h-[40vh] sm:max-h-[50vh] overflow-y-auto pr-1 sm:pr-2">
                  {modules.map((module) => (
                    <div key={module.id} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
                        <input
                          type="text"
                          value={module.title}
                          onChange={(e) => {
                            setModules(modules.map(m =>
                              m.id === module.id ? { ...m, title: e.target.value } : m
                            ));
                          }}
                          className="text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-2"
                          placeholder="Module title"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedModuleId(module.id);
                              handleAddSubModule(module.id);
                            }}
                            className="btn-secondary text-sm inline-flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            Add Sub-module
                          </button>
                          <button
                            onClick={() => handleDeleteModule(module.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId={module.id}>
                          {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                              {module.subModules.map((subModule, index) => (
                                <Draggable key={subModule.id} draggableId={subModule.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={`bg-gray-50 rounded-lg p-3 flex items-center justify-between ${
                                        snapshot.isDragging ? 'shadow-lg' : ''
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 flex-1">
                                        <div {...provided.dragHandleProps} className="cursor-grab">
                                          <FileText className="w-5 h-5 text-gray-400" />
                                        </div>
                                        <input
                                          type="text"
                                          value={subModule.title}
                                          onChange={(e) => {
                                            setModules(modules.map(m =>
                                              m.id === module.id
                                                ? {
                                                    ...m,
                                                    subModules: m.subModules.map(sm =>
                                                      sm.id === subModule.id
                                                        ? { ...sm, title: e.target.value }
                                                        : sm
                                                    ),
                                                  }
                                                : m
                                            ));
                                          }}
                                          className="flex-1 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-2"
                                          placeholder="Sub-module title"
                                        />
                                        {subModule.resourceType === 'upload' && (
                                          <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                                            <FileText className="w-3 h-3" />
                                            {subModule.resourceData.file?.name ||
                                             (subModule.resourceData.fileUrl ?
                                               subModule.resourceData.fileUrl.split('/').pop() || 'File uploaded' :
                                               'File uploaded')}
                                          </span>
                                        )}
                                        {subModule.resourceType === 'youtube' && (
                                          <span className="text-xs text-blue-600 inline-flex items-center gap-1">
                                            <Link className="w-4 h-4" />
                                            {subModule.resourceData.videoUrl || subModule.resourceData.youtubeUrl || 'Video Link'}
                                          </span>
                                        )}
                                        {subModule.quiz && (
                                          <span className="text-xs text-green-600">Quiz added</span>
                                        )}
                                      </div>
                                      <div className="flex gap-2">
                                        {!subModule.resourceType && (
                                          <button
                                            onClick={() => handleOpenResourcePicker(module.id, subModule.id)}
                                            className="btn-secondary text-xs"
                                          >
                                            Add Resource
                                          </button>
                                        )}
                                        {subModule.resourceType && (
                                          <button
                                            onClick={() => handleOpenResourcePicker(module.id, subModule.id)}
                                            className="btn-secondary text-xs"
                                          >
                                            Change Resource
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleOpenQuizEditor(module.id, subModule.id)}
                                          className="btn-secondary text-xs"
                                        >
                                          {subModule.quiz ? 'Edit Quiz' : 'Add Quiz'}
                                        </button>
                                        <button
                                          onClick={() => handleRemoveResource(module.id, subModule.id)}
                                          className="text-red-600 hover:text-red-700"
                                          title="Remove resource"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteSubModule(module.id, subModule.id)}
                                          className="text-red-600 hover:text-red-700"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
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
                  ))}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review & Tenant Selection */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Review & Tenant Selection</h3>
                <button
                  onClick={() => setShowPreview(true)}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Preview Course
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">{courseTitle}</h4>
                <p className="text-sm text-gray-600">Category: {courseCategory}</p>
                <p className="text-sm text-gray-600">Modules: {modules.length}</p>
                <p className="text-sm text-gray-600">
                  Total Sub-modules: {modules.reduce((sum, m) => sum + m.subModules.length, 0)}
                </p>
                <p className="text-sm text-gray-600">
                  Quizzes: {modules.reduce((sum, m) =>
                    sum + m.subModules.filter(sm => sm.quiz).length, 0
                  )}
                </p>
              </div>

              {/* Tenant Selection */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Select Tenants for Course Distribution
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Choose which tenant organizations should have access to this master course
                    </p>
                  </div>
                  <button
                    onClick={selectAllTenants}
                    className="btn-secondary text-sm"
                  >
                    {selectedTenants.length === availableTenants.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {loadingTenants ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  </div>
                ) : availableTenants.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No tenants available. Create tenants first.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 max-h-48 sm:max-h-64 overflow-y-auto">
                    {availableTenants.map((tenant) => (
                      <div
                        key={tenant._id}
                        onClick={() => toggleTenantSelection(tenant._id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedTenants.includes(tenant._id)
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          selectedTenants.includes(tenant._id)
                            ? 'border-primary-500 bg-primary-500'
                            : 'border-gray-300'
                        }`}>
                          {selectedTenants.includes(tenant._id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{tenant.orgName}</p>
                          <p className="text-xs text-gray-500">{tenant.subdomain}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedTenants.length > 0 && (
                  <div className="mt-4 p-3 bg-primary-50 rounded-lg">
                    <p className="text-sm text-primary-800">
                      <strong>{selectedTenants.length}</strong> tenant{selectedTenants.length !== 1 ? 's' : ''} selected
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Navigation Buttons - Responsive */}
        <div className="bg-white border-t border-gray-200 px-3 sm:px-6 py-3 sm:py-4 flex justify-between items-center shadow-lg flex-shrink-0 gap-2">
          {currentStep > 1 ? (
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="btn-secondary inline-flex items-center gap-1 sm:gap-2 text-sm sm:text-base px-3 sm:px-4 py-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden xs:inline">Previous</span>
              <span className="xs:hidden">Back</span>
            </button>
          ) : (
            <div></div>
          )}

          <div className="flex items-center gap-2 sm:gap-3">
            {currentStep === 1 && (
              <button
                onClick={handleStep1Next}
                className="btn-primary inline-flex items-center gap-1 sm:gap-2 text-sm sm:text-base px-3 sm:px-4 py-2"
              >
                <span className="hidden sm:inline">Next: Add Content</span>
                <span className="sm:hidden">Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {currentStep === 2 && (
              <button
                onClick={handleStep2Next}
                className="btn-primary inline-flex items-center gap-1 sm:gap-2 text-sm sm:text-base px-3 sm:px-4 py-2"
              >
                <span className="hidden sm:inline">Next: Distribution</span>
                <span className="sm:hidden">Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {currentStep === 3 && (
              <button
                onClick={handleFinalSubmit}
                disabled={saving}
                className="btn-primary inline-flex items-center gap-1 sm:gap-2 text-sm sm:text-base px-3 sm:px-4 py-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span className="hidden sm:inline">{isEditing ? 'Updating...' : 'Creating...'}</span>
                    <span className="sm:hidden">Saving...</span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">{isEditing ? 'Update Course' : 'Create Course'}</span>
                    <span className="sm:hidden">{isEditing ? 'Update' : 'Create'}</span>
                    <CheckCircle className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Resource Picker Modal */}
      {showResourcePicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Resource</h3>
            <div className="space-y-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full btn-secondary inline-flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload File (PDF, PPT, Excel, Docs, Audio, Video, SCORM)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.mp3,.mp4,.zip"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={handleVideoLink}
                className="w-full btn-secondary inline-flex items-center justify-center gap-2"
              >
                <Link className="w-4 h-4" />
                Add Link (YouTube, Vimeo, etc.)
              </button>
            </div>
            <button
              onClick={() => {
                setShowResourcePicker(false);
                setSelectedModuleId(null);
                setSelectedSubModuleId(null);
              }}
              className="mt-4 w-full btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Storage Limit Modal */}
      {showStorageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">Storage Limit Exceeded</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Your current storage usage is {(storageUsage.current / 1024 / 1024 / 1024).toFixed(2)} GB out of {(storageUsage.limit / 1024 / 1024 / 1024).toFixed(2)} GB limit.
              Please free up some space or upgrade your plan.
            </p>
            <button
              onClick={() => setShowStorageModal(false)}
              className="w-full btn-primary"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Quiz Editor Modal */}
      {showQuizEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Quiz Editor</h3>
              <button
                onClick={() => {
                  setShowQuizEditor(false);
                  setSelectedModuleId(null);
                  setSelectedSubModuleId(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="label-field">Passing Score (%)</label>
                <input
                  type="number"
                  value={passingScore}
                  onChange={(e) => setPassingScore(Number(e.target.value))}
                  className="input-field"
                  min="0"
                  max="100"
                />
              </div>

              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900">Questions</h4>
                <button
                  onClick={handleAddQuestion}
                  className="btn-secondary text-sm inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Question
                </button>
              </div>

              {quizQuestions.map((question, qIndex) => {
                const isMultiple = question.questionType === 'multiple';
                const correctAnswers = isMultiple
                  ? (Array.isArray(question.correctAnswer) ? question.correctAnswer : [])
                  : [];
                const isOptionCorrect = (index: number) => {
                  if (isMultiple) {
                    return correctAnswers.includes(index);
                  } else {
                    return question.correctAnswer === index;
                  }
                };
                const isExpanded = expandedQuestionId === question.id;

                return (
                  <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-700 flex-shrink-0">Q{qIndex + 1}.</span>
                        <span className="text-sm text-gray-800 truncate" title={question.text || 'Untitled question'}>
                          {question.text || 'Untitled question'}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          ({question.questionType === 'multiple' ? 'Multi' : 'Single'})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => setExpandedQuestionId(isExpanded ? null : question.id)}
                          className="p-1.5 hover:bg-blue-50 text-blue-600 hover:text-blue-700 rounded-lg"
                          title="Edit question"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(question.id)}
                          className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-700 rounded-lg"
                          title="Delete question"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <input
                          type="text"
                          value={question.text}
                          onChange={(e) => {
                            setQuizQuestions(quizQuestions.map(q =>
                              q.id === question.id ? { ...q, text: e.target.value } : q
                            ));
                          }}
                          className="input-field mb-3"
                          placeholder="Enter question text"
                        />

                        <div className="mb-3">
                          <label className="text-sm font-medium text-gray-700 mb-2 block">
                            Answer Type
                          </label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`type-${question.id}`}
                                checked={question.questionType === 'single'}
                                onChange={() => {
                                  setQuizQuestions(quizQuestions.map(q =>
                                    q.id === question.id
                                      ? { ...q, questionType: 'single' as const, correctAnswer: Array.isArray(q.correctAnswer) ? (q.correctAnswer[0] ?? 0) : (q.correctAnswer ?? 0) }
                                      : q
                                  ));
                                }}
                                className="w-4 h-4"
                              />
                              <span className="text-sm text-gray-700">Single Correct Answer</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`type-${question.id}`}
                                checked={question.questionType === 'multiple'}
                                onChange={() => {
                                  setQuizQuestions(quizQuestions.map(q =>
                                    q.id === question.id
                                      ? { ...q, questionType: 'multiple' as const, correctAnswer: Array.isArray(q.correctAnswer) ? q.correctAnswer : (typeof q.correctAnswer === 'number' ? [q.correctAnswer] : []) }
                                      : q
                                  ));
                                }}
                                className="w-4 h-4"
                              />
                              <span className="text-sm text-gray-700">Multiple Correct Answers</span>
                            </label>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {question.options.map((option, oIndex) => (
                            <div key={oIndex} className="flex items-center gap-2">
                              {isMultiple ? (
                                <input
                                  type="checkbox"
                                  checked={isOptionCorrect(oIndex)}
                                  onChange={(e) => {
                                    const currentAnswers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
                                    const newAnswers = e.target.checked
                                      ? [...currentAnswers, oIndex]
                                      : currentAnswers.filter((ans: number) => ans !== oIndex);
                                    setQuizQuestions(quizQuestions.map(q =>
                                      q.id === question.id ? { ...q, correctAnswer: newAnswers } : q
                                    ));
                                  }}
                                  className="w-4 h-4"
                                />
                              ) : (
                                <input
                                  type="radio"
                                  name={`correct-${question.id}`}
                                  checked={isOptionCorrect(oIndex)}
                                  onChange={() => {
                                    setQuizQuestions(quizQuestions.map(q =>
                                      q.id === question.id ? { ...q, correctAnswer: oIndex } : q
                                    ));
                                  }}
                                  className="w-4 h-4"
                                />
                              )}
                              <input
                                type="text"
                                value={option}
                                onChange={(e) => {
                                  const newOptions = [...question.options];
                                  newOptions[oIndex] = e.target.value;
                                  setQuizQuestions(quizQuestions.map(q =>
                                    q.id === question.id ? { ...q, options: newOptions } : q
                                  ));
                                }}
                                className="input-field flex-1"
                                placeholder={`Option ${String.fromCharCode(65 + oIndex)}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowQuizEditor(false);
                  setSelectedModuleId(null);
                  setSelectedSubModuleId(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuiz}
                className="btn-primary"
              >
                Save Quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Course Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            {/* Preview Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Eye className="w-6 h-6 text-primary-600" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Course Preview</h3>
                  <p className="text-sm text-gray-600">How your course will appear to learners</p>
                </div>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {/* Course Header */}
              <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg p-8 text-white mb-6">
                <div className="flex items-start gap-6">
                  {thumbnailPreview && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnailPreview}
                        alt="Course thumbnail"
                        className="w-32 h-20 object-cover rounded-lg border-2 border-white shadow-lg"
                      />
                    </>
                  )}
                  <div className="flex-1">
                    <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-xs font-medium mb-3">
                      {courseCategory}
                    </div>
                    <h1 className="text-3xl font-bold mb-2">{courseTitle || 'Course Title'}</h1>
                    <div className="flex items-center gap-6 text-sm text-white/90">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        <span>{modules.length} Module{modules.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span>{modules.reduce((sum, m) => sum + m.subModules.length, 0)} Lessons</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4" />
                        <span>{modules.reduce((sum, m) => sum + m.subModules.filter(sm => sm.quiz).length, 0)} Quiz{modules.reduce((sum, m) => sum + m.subModules.filter(sm => sm.quiz).length, 0) !== 1 ? 'zes' : ''}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Course Content */}
              <div className="space-y-6">
                {modules.map((module, moduleIndex) => (
                  <div key={module.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Module Header */}
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-primary-600 font-semibold">{moduleIndex + 1}</span>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">{module.title}</h3>
                      </div>
                    </div>

                    {/* Sub-modules */}
                    <div className="divide-y divide-gray-200">
                      {module.subModules.length === 0 ? (
                        <div className="px-6 py-8 text-center text-gray-500">
                          <p>No sub-modules in this module</p>
                        </div>
                      ) : (
                        module.subModules.map((subModule, subIndex) => (
                          <div key={subModule.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start gap-4">
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
                                <span className="text-sm text-gray-600 font-medium">
                                  {moduleIndex + 1}.{subIndex + 1}
                                </span>
                              </div>
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900 mb-2">{subModule.title}</h4>

                                {/* Resource Preview */}
                                {subModule.resourceType === 'upload' && subModule.resourceData.file && (
                                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                                    <FileText className="w-4 h-4" />
                                    <span>{subModule.resourceData.file.name}</span>
                                    <span className="text-xs text-gray-400">
                                      ({(subModule.resourceData.file.size / 1024 / 1024).toFixed(2)} MB)
                                    </span>
                                  </div>
                                )}

                                {subModule.resourceType === 'youtube' && (subModule.resourceData.youtubeUrl || subModule.resourceData.videoUrl) && (
                                  <div className="mt-3">
                                    <div className="flex items-center gap-2 text-sm text-blue-600 mb-2">
                                      <Link className="w-4 h-4" />
                                      <span className="truncate">{subModule.resourceData.videoUrl || subModule.resourceData.youtubeUrl}</span>
                                    </div>
                                    <div className="rounded-lg overflow-hidden border border-gray-200">
                                      <VideoPlayer
                                        videoUrl={subModule.resourceData.videoUrl || subModule.resourceData.youtubeUrl || ''}
                                        title={subModule.title}
                                      />
                                    </div>
                                  </div>
                                )}

                                {!subModule.resourceType && (
                                  <div className="text-sm text-gray-400 italic">No resource added</div>
                                )}

                                {/* Quiz Badge */}
                                {subModule.quiz && (
                                  <div className="mt-2 inline-flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                                    <HelpCircle className="w-3 h-3" />
                                    Quiz ({subModule.quiz.questions.length} questions, {subModule.quiz.passingScore}% passing score)
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}

                {modules.length === 0 && (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No modules added yet</p>
                  </div>
                )}
              </div>

              {/* Preview Footer */}
              <div className="mt-6 pt-6 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setShowPreview(false)}
                  className="btn-primary"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { CourseCreator };
export default CourseCreator;
