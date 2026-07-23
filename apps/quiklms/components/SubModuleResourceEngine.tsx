'use client';
/**
 * SubModuleResourceEngine — ported from the old QuikSkills frontend
 * (`src/components/SubModuleResourceEngine.tsx`).
 *
 * The resource authoring panel for a single sub-module — the third tier of the
 * modules → subModules → resources tree the backend persists as JSON. Resources
 * are added four ways (file upload, external URL, rich text, SCORM package),
 * reordered by drag-and-drop (react-beautiful-dnd), edited in a detail pane, and
 * handed back to the parent through `onSave`.
 *
 * Upload paths differ by endpoint in this app:
 *   - `/upload/course-resource` goes through `uploadFile`, which POSTs the bytes
 *     to that route and only falls back to a direct-to-bucket PUT for files too
 *     large to proxy.
 *   - `/upload/scorm` deliberately kept its multipart contract — the server must
 *     read `imsmanifest.xml` and inject the SCORM API bridge — so it still POSTs
 *     FormData.
 * Neither can report byte-level progress under fetch; the progress bar is driven
 * from upload start/finish instead.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  GripVertical,
  Upload,
  Video,
  FileText,
  Music,
  Link as LinkIcon,
  Code,
  Image,
  File,
  Save,
  AlertCircle,
  CheckCircle,
  Loader2,
  ExternalLink,
  Eye,
  Clock,
  HardDrive,
  Sparkles,
  Zap,
  FolderOpen,
  Play,
  Type,
  Globe,
  Package,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { v4 as uuidv4 } from 'uuid';
import { api } from '@/lib/api';
import { uploadFile } from '@/lib/upload-client';

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

interface Props {
  resources: Resource[];
  onSave: (resources: Resource[]) => void;
  onClose: () => void;
}

/** Response BODY of POST /api/upload/scorm (still multipart in this app). */
interface ScormUploadResponse {
  success: boolean;
  data: {
    type?: string;
    title?: string;
    url?: string;
    fileUrl?: string;
    indexHtmlUrl?: string;
    scormVersion?: string;
    entryPoint?: string;
    launchPath?: string;
  };
  message?: string;
}

const SubModuleResourceEngine = ({ resources: initialResources, onSave, onClose }: Props) => {
  const [resources, setResources] = useState<Resource[]>(initialResources);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<'upload' | 'url' | 'text' | 'scorm' | null>(null);
  const [newResourceUrl, setNewResourceUrl] = useState('');
  const [newResourceTitle, setNewResourceTitle] = useState('');
  const [newTextContent, setNewTextContent] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scormInputRef = useRef<HTMLInputElement>(null);

  const resourceTypes = [
    { type: 'video', icon: Video, color: 'from-blue-500 to-cyan-500', label: 'Video', desc: 'MP4, WebM, MOV' },
    { type: 'audio', icon: Music, color: 'from-purple-500 to-pink-500', label: 'Audio', desc: 'MP3, WAV, OGG' },
    { type: 'document', icon: FileText, color: 'from-orange-500 to-amber-500', label: 'Document', desc: 'PDF, DOC, PPT' },
    { type: 'image', icon: Image, color: 'from-emerald-500 to-green-500', label: 'Image', desc: 'JPG, PNG, GIF' },
    { type: 'scorm', icon: Package, color: 'from-indigo-500 to-violet-500', label: 'SCORM', desc: 'SCORM 1.2/2004' },
    { type: 'rich_text', icon: Type, color: 'from-rose-500 to-red-500', label: 'Rich Text', desc: 'Formatted text' },
    { type: 'external_link', icon: Globe, color: 'from-teal-500 to-cyan-500', label: 'External URL', desc: 'Web links' },
  ];

  const getResourceIcon = (type: string) => {
    const resourceType = resourceTypes.find(rt => type.includes(rt.type));
    return resourceType?.icon || File;
  };

  const getResourceColor = (type: string) => {
    const resourceType = resourceTypes.find(rt => type.includes(rt.type));
    return resourceType?.color || 'from-gray-400 to-gray-500';
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Uploads the bytes and returns the permanent URL. Neither path can
        // report byte-level progress, so the bar is driven from start/finish per
        // file.
        setUploadProgress(0);
        const uploadedUrl = await uploadFile(file, '/upload/course-resource');
        setUploadProgress(100);

        // The presign helper returns only the URL, so the backend-provided type /
        // title / size are recomputed client-side from the file itself. This
        // collapses the source's `data.type || getFileType(file.name)` fallback
        // to its second branch.
        const resourceType = getFileType(file.name);

        const newResource: Resource = {
          id: uuidv4(),
          type: resourceType,
          title: file.name,
          url: uploadedUrl,
          fileSize: file.size,
          duration: undefined,
          ffmpegCompressed: undefined,
          orderIndex: resources.length,
        };

        setResources((prev) => [...prev, newResource]);
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setAddMode(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleScormUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.zip')) {
      setError('SCORM package must be a ZIP file');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // /upload/scorm keeps its multipart contract (the server unzips and rewrites
      // the entry point), so the FormData POST is preserved. fetch cannot report
      // byte-level progress, so the bar is driven from start/finish.
      const response = await api.post<ScormUploadResponse>('/upload/scorm', formData);
      setUploadProgress(100);

      if (response.success) {
        const data = response.data;

        const newResource: Resource = {
          id: uuidv4(),
          type: data.type || (data.scormVersion === '2004' ? 'scorm_2004' : 'scorm_12'),
          title: data.title || file.name.replace('.zip', ''),
          url: data.fileUrl || data.indexHtmlUrl || data.url,
          scormVersion: data.scormVersion || '1.2',
          scormEntryPoint: data.entryPoint || data.launchPath,
          fileSize: file.size,
          orderIndex: resources.length,
        };

        setResources((prev) => [...prev, newResource]);
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to upload SCORM package');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setAddMode(null);
      if (scormInputRef.current) scormInputRef.current.value = '';
    }
  };

  const getFileType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    // Map to backend enum values
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video_upload';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio_upload';
    if (ext === 'pdf') return 'document_pdf';
    if (['ppt', 'pptx'].includes(ext)) return 'document_ppt';
    if (['doc', 'docx'].includes(ext)) return 'document_word';
    if (['xls', 'xlsx'].includes(ext)) return 'document_excel';
    // Images and other files - default to external_link or document_pdf
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'external_link';
    return 'document_pdf'; // Default fallback
  };

  const addExternalLink = () => {
    if (!newResourceUrl.trim()) {
      setError('URL is required');
      return;
    }

    // Detect resource type based on URL
    let resourceType = 'external_link';
    const url = newResourceUrl.trim().toLowerCase();

    // YouTube detection
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      resourceType = 'video_youtube';
    }
    // Vimeo detection
    else if (url.includes('vimeo.com')) {
      resourceType = 'video_vimeo';
    }
    // Direct video file URLs
    else if (url.match(/\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i)) {
      resourceType = 'video_upload';
    }
    // Direct audio file URLs
    else if (url.match(/\.(mp3|wav|ogg|m4a)(\?.*)?$/i)) {
      resourceType = 'audio_upload';
    }

    const newResource: Resource = {
      id: uuidv4(),
      type: resourceType,
      title: newResourceTitle.trim() || newResourceUrl,
      url: newResourceUrl,
      orderIndex: resources.length,
    };

    console.log('[SubModuleResourceEngine] Adding resource:', newResource);
    setResources((prev) => [...prev, newResource]);
    setNewResourceUrl('');
    setNewResourceTitle('');
    setAddMode(null);
  };

  const addRichText = () => {
    if (!newTextContent.trim()) {
      setError('Content is required');
      return;
    }

    const newResource: Resource = {
      id: uuidv4(),
      type: 'rich_text',
      title: newResourceTitle.trim() || 'Text Content',
      content: newTextContent,
      orderIndex: resources.length,
    };

    setResources((prev) => [...prev, newResource]);
    setNewTextContent('');
    setNewResourceTitle('');
    setAddMode(null);
  };

  const updateResource = (resourceId: string, updates: Partial<Resource>) => {
    setResources((prev) =>
      prev.map((r) => (r.id === resourceId ? { ...r, ...updates } : r))
    );
  };

  const deleteResource = (resourceId: string) => {
    setResources((prev) =>
      prev.filter((r) => r.id !== resourceId).map((r, index) => ({
        ...r,
        orderIndex: index,
      }))
    );
    if (selectedResourceId === resourceId) {
      setSelectedResourceId(null);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const reordered = Array.from(resources);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    setResources(reordered.map((r, index) => ({ ...r, orderIndex: index })));
  };

  const handleSave = () => {
    onSave(resources);
  };

  const selectedResource = resources.find((r) => r.id === selectedResourceId);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900/95 via-blue-900/30 to-slate-900/95 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200/50 dark:border-slate-700/50">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-500 px-8 py-6">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptMCAwdi02aC02djZoNnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
                <FolderOpen className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Resource Manager
                </h2>
                <div className="flex items-center gap-4 mt-1">
                  <span className="flex items-center gap-1.5 text-white/80 text-sm">
                    <File className="w-4 h-4" />
                    {resources.length} resources
                  </span>
                  {resources.some(r => r.fileSize) && (
                    <span className="flex items-center gap-1.5 text-white/80 text-sm">
                      <HardDrive className="w-4 h-4" />
                      {formatFileSize(resources.reduce((sum, r) => sum + (r.fileSize || 0), 0))}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-600 font-semibold rounded-xl hover:bg-white/90 transition-all shadow-lg shadow-blue-500/25"
              >
                <Save className="w-4 h-4" />
                Save Resources
              </button>
              <button
                onClick={onClose}
                className="p-2.5 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <p className="flex-1 text-red-800 dark:text-red-300 font-medium">{error}</p>
            <button onClick={() => setError(null)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl">
              <X className="w-4 h-4 text-red-600 dark:text-red-400" />
            </button>
          </div>
        )}

        {/* Upload Progress */}
        {uploading && (
          <div className="mx-6 mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <span className="font-medium text-blue-800 dark:text-blue-300">Uploading...</span>
              <span className="ml-auto text-sm font-bold text-blue-600">{Math.round(uploadProgress)}%</span>
            </div>
            <div className="w-full h-2 bg-blue-100 dark:bg-blue-900/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Resource List */}
          <div className="w-80 border-r border-gray-200 dark:border-slate-700 flex flex-col bg-gray-50/50 dark:bg-slate-800/30">
            {/* Add Resource Options */}
            <div className="p-4 border-b border-gray-200 dark:border-slate-700">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Add Resource
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
                >
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl text-white shadow-lg">
                    <Upload className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 group-hover:text-blue-600">
                    Upload File
                  </span>
                </button>
                <button
                  onClick={() => setAddMode('url')}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all group"
                >
                  <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl text-white shadow-lg">
                    <Globe className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 group-hover:text-teal-600">
                    Add URL
                  </span>
                </button>
                <button
                  onClick={() => setAddMode('text')}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all group"
                >
                  <div className="p-2 bg-gradient-to-br from-rose-500 to-pink-500 rounded-xl text-white shadow-lg">
                    <Type className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 group-hover:text-rose-600">
                    Rich Text
                  </span>
                </button>
                <button
                  onClick={() => scormInputRef.current?.click()}
                  disabled={uploading}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all group"
                >
                  <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl text-white shadow-lg">
                    <Package className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 group-hover:text-violet-600">
                    SCORM
                  </span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                multiple
                accept="video/*,audio/*,image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
              />
              <input
                ref={scormInputRef}
                type="file"
                onChange={handleScormUpload}
                className="hidden"
                accept=".zip"
              />
            </div>

            {/* Resource List */}
            <div className="flex-1 overflow-y-auto p-4">
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="resources">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="space-y-2"
                    >
                      {resources.map((resource, index) => {
                        const Icon = getResourceIcon(resource.type);
                        const color = getResourceColor(resource.type);
                        return (
                          <Draggable
                            key={resource.id}
                            draggableId={resource.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                onClick={() => setSelectedResourceId(resource.id)}
                                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                                  selectedResourceId === resource.id
                                    ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500 shadow-lg'
                                    : 'bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                                } ${snapshot.isDragging ? 'shadow-xl' : ''}`}
                              >
                                <div {...provided.dragHandleProps} className="p-1">
                                  <GripVertical className="w-4 h-4 text-gray-400" />
                                </div>
                                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white shadow`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" title={resource.title || 'Untitled'}>
                                    {resource.title || 'Untitled'}
                                  </p>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    {resource.fileSize && (
                                      <span>{formatFileSize(resource.fileSize)}</span>
                                    )}
                                    {resource.duration && (
                                      <span>{formatDuration(resource.duration)}</span>
                                    )}
                                    {resource.scormVersion && (
                                      <span>{resource.scormVersion}</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteResource(resource.id);
                                  }}
                                  className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-lg"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

              {resources.length === 0 && !addMode && (
                <div className="text-center py-12">
                  <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-2xl flex items-center justify-center">
                    <FolderOpen className="w-10 h-10 text-blue-500" />
                  </div>
                  <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">No resources yet</p>
                  <p className="text-sm text-gray-500 mt-2">Upload files or add external links</p>
                </div>
              )}
            </div>
          </div>

          {/* Resource Editor / Add Forms */}
          <div className="flex-1 overflow-y-auto p-8 bg-white dark:bg-slate-900">
            {/* Add URL Form */}
            {addMode === 'url' && (
              <div className="max-w-lg mx-auto">
                <div className="mb-6">
                  <div className="p-4 bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-900/30 dark:to-cyan-900/30 rounded-2xl inline-flex">
                    <Globe className="w-8 h-8 text-teal-600" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Add External Link</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">Add a link to external content like YouTube videos, articles, or web tools.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      URL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={newResourceUrl}
                      onChange={(e) => setNewResourceUrl(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                      placeholder="https://example.com/resource"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Title (optional)
                    </label>
                    <input
                      type="text"
                      value={newResourceTitle}
                      onChange={(e) => setNewResourceTitle(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                      placeholder="Resource title"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => setAddMode(null)}
                    className="flex-1 px-5 py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addExternalLink}
                    className="flex-1 px-5 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg shadow-teal-500/25"
                  >
                    Add Link
                  </button>
                </div>
              </div>
            )}

            {/* Add Rich Text Form */}
            {addMode === 'text' && (
              <div className="max-w-2xl mx-auto">
                <div className="mb-6">
                  <div className="p-4 bg-gradient-to-br from-rose-100 to-pink-100 dark:from-rose-900/30 dark:to-pink-900/30 rounded-2xl inline-flex">
                    <Type className="w-8 h-8 text-rose-600" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Add Rich Text Content</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">Create formatted text content directly in the course.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={newResourceTitle}
                      onChange={(e) => setNewResourceTitle(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                      placeholder="Content title"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Content <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={newTextContent}
                      onChange={(e) => setNewTextContent(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500 transition-all min-h-[200px] resize-none"
                      placeholder="Enter your content here... (Markdown supported)"
                    />
                    <p className="text-xs text-gray-500 mt-2">Markdown formatting is supported</p>
                  </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => setAddMode(null)}
                    className="flex-1 px-5 py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addRichText}
                    className="flex-1 px-5 py-3 bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold rounded-xl hover:from-rose-600 hover:to-pink-600 transition-all shadow-lg shadow-rose-500/25"
                  >
                    Add Content
                  </button>
                </div>
              </div>
            )}

            {/* Resource Details */}
            {selectedResource && !addMode && (
              <div className="max-w-2xl mx-auto">
                <div className="mb-6">
                  <div className={`p-4 bg-gradient-to-br ${getResourceColor(selectedResource.type)} rounded-2xl inline-flex text-white shadow-lg`}>
                    {(() => {
                      const Icon = getResourceIcon(selectedResource.type);
                      return <Icon className="w-8 h-8" />;
                    })()}
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={selectedResource.title || ''}
                      onChange={(e) =>
                        updateResource(selectedResource.id, { title: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      placeholder="Resource title"
                    />
                  </div>

                  {/* URL/Content Preview */}
                  {selectedResource.url && (
                    <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                        Resource URL
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={selectedResource.url}
                          readOnly
                          className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-600 dark:text-gray-400"
                        />
                        <a
                          href={selectedResource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Rich Text Content */}
                  {selectedResource.type === 'rich_text' && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Content
                      </label>
                      <textarea
                        value={selectedResource.content || ''}
                        onChange={(e) =>
                          updateResource(selectedResource.id, { content: e.target.value })
                        }
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[200px] resize-none"
                        placeholder="Content..."
                      />
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-4">
                    {selectedResource.fileSize && (
                      <div className="p-4 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <HardDrive className="w-4 h-4 text-indigo-500" />
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">File Size</span>
                        </div>
                        <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                          {formatFileSize(selectedResource.fileSize)}
                        </p>
                      </div>
                    )}
                    {selectedResource.duration && (
                      <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl border border-blue-200 dark:border-blue-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Duration</span>
                        </div>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {formatDuration(selectedResource.duration)}
                        </p>
                      </div>
                    )}
                    {selectedResource.scormVersion && (
                      <div className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl border border-violet-200 dark:border-violet-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Package className="w-4 h-4 text-violet-500" />
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">SCORM Version</span>
                        </div>
                        <p className="text-lg font-bold text-violet-600 dark:text-violet-400">
                          {selectedResource.scormVersion}
                        </p>
                      </div>
                    )}
                    {selectedResource.ffmpegCompressed && (
                      <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className="w-4 h-4 text-emerald-500" />
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Optimization</span>
                        </div>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5" />
                          Compressed
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Video/Audio Preview */}
                  {(selectedResource.type.includes('video') || selectedResource.type.includes('audio')) && selectedResource.url && (
                    <div className="p-4 bg-gradient-to-br from-gray-900 to-slate-900 rounded-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <Play className="w-4 h-4 text-white" />
                        <span className="text-sm font-semibold text-white">Preview</span>
                      </div>
                      {selectedResource.type.includes('video') ? (
                        <video
                          controls
                          className="w-full rounded-lg"
                          src={selectedResource.url}
                        />
                      ) : (
                        <audio
                          controls
                          className="w-full"
                          src={selectedResource.url}
                        />
                      )}
                    </div>
                  )}

                  {/* Image Preview */}
                  {selectedResource.type.includes('image') && selectedResource.url && (
                    <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
                      <div className="flex items-center gap-2 mb-3">
                        <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview</span>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedResource.url}
                        alt={selectedResource.title || 'Preview'}
                        className="max-w-full max-h-96 rounded-lg mx-auto"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty State */}
            {!selectedResource && !addMode && resources.length > 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-2xl flex items-center justify-center">
                    <File className="w-10 h-10 text-blue-500" />
                  </div>
                  <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Select a resource to edit</p>
                  <p className="text-sm text-gray-500 mt-2">or add a new one from the left panel</p>
                </div>
              </div>
            )}

            {/* Initial Empty State */}
            {!selectedResource && !addMode && resources.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-blue-100 via-indigo-100 to-violet-100 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-violet-900/30 rounded-3xl flex items-center justify-center">
                    <FolderOpen className="w-12 h-12 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                    Start Adding Resources
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-8">
                    Add videos, documents, audio files, SCORM packages, or any other learning materials to this sub-module.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {resourceTypes.slice(0, 4).map((rt) => (
                      <div
                        key={rt.type}
                        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700"
                      >
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${rt.color} text-white`}>
                          <rt.icon className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{rt.label}</p>
                          <p className="text-xs text-gray-500">{rt.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubModuleResourceEngine;
