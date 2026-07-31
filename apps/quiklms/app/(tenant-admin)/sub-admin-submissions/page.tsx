'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle, XCircle, Clock, BookOpen, ChevronDown, ChevronUp,
  Eye, RefreshCw, User, FileText, Video, File, X, HelpCircle,
  Award, Settings, Music, Globe, ExternalLink, Code, FileSpreadsheet,
} from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { Button, Badge, Card, Skeleton } from '@/components/ui';
import { DashboardScaffold } from '@/components/DashboardScaffold';

interface CourseItem {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  level?: string;
  status: string;
  modules?: any[];
  tenantRejectionReason?: string;
  rejectionReason?: string;
  submittedBy?: { firstName: string; lastName: string; email: string };
  createdAt: string;
  updatedAt: string;
}

type TabKey = 'pending' | 'forwarded' | 'rejected' | 'all';

const SubAdminSubmissionsPage = () => {
  const { branding } = useBranding();
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [rejectingItem, setRejectingItem] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewCourse, setPreviewCourse] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openFullPreview = async (courseId: string) => {
    setPreviewLoading(true);
    try {
      const res = await api.get(`/master-courses/${courseId}`);
      setPreviewCourse((res as any).data || null);
    } catch (err) {
      console.error('Failed to load course preview', err);
      toast.error('Failed to load full course details');
    } finally {
      setPreviewLoading(false);
    }
  };

  const getResourceIcon = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('video')) return <Video className="w-4 h-4 text-blue-500" />;
    if (t.includes('audio')) return <Music className="w-4 h-4 text-violet-500" />;
    if (t.includes('pdf')) return <FileText className="w-4 h-4 text-red-500" />;
    if (t.includes('excel') || t.includes('spreadsheet')) return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
    if (t.includes('ppt') || t.includes('slide') || t.includes('presentation')) return <FileText className="w-4 h-4 text-orange-500" />;
    if (t.includes('rich_text') || t.includes('text')) return <FileText className="w-4 h-4 text-gray-500" />;
    if (t.includes('scorm')) return <Code className="w-4 h-4 text-teal-500" />;
    if (t.includes('external') || t.includes('link')) return <Globe className="w-4 h-4 text-blue-400" />;
    if (t.includes('iframe') || t.includes('embed')) return <ExternalLink className="w-4 h-4 text-indigo-400" />;
    if (t.includes('quiz') || t.includes('assessment')) return <HelpCircle className="w-4 h-4 text-purple-500" />;
    return <File className="w-4 h-4 text-gray-500" />;
  };

  const getResourceLabel = (type: string) => {
    const map: Record<string, string> = {
      video_upload: 'Video', video_youtube: 'YouTube', video_vimeo: 'Vimeo',
      audio_upload: 'Audio', audio_soundcloud: 'SoundCloud',
      document_pdf: 'PDF', document_ppt: 'Presentation', document_word: 'Word', document_excel: 'Excel',
      rich_text: 'Rich Text', scorm_12: 'SCORM 1.2', scorm_2004: 'SCORM 2004',
      external_link: 'Link', iframe_embed: 'Embed',
    };
    return map[type?.toLowerCase()] || type || 'File';
  };

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/master-courses/sub-admin-submissions');
      setCourses((res as any).data || []);
    } catch (err) {
      console.error('Failed to fetch sub-admin submissions', err);
      toast.error('Failed to fetch submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubmissions(); }, []);

  const filtered = useMemo(() => {
    switch (activeTab) {
      case 'pending': return courses.filter(c => c.status === 'PendingTenantApproval');
      case 'forwarded': return courses.filter(c => ['PendingApproval', 'Published', 'Resubmitted'].includes(c.status));
      case 'rejected': return courses.filter(c => ['RejectedByTenantAdmin', 'Rejected'].includes(c.status));
      case 'all': return courses;
    }
  }, [courses, activeTab]);

  const pendingCount = courses.filter(c => c.status === 'PendingTenantApproval').length;

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await api.post(`/master-courses/${id}/tenant-approve`, {});
      toast.success('Course approved successfully');
      await fetchSubmissions();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) { toast.error('Please provide a rejection reason'); return; }
    setActionLoading(id);
    try {
      await api.post(`/master-courses/${id}/tenant-reject`, { reason: rejectReason });
      toast.success('Course rejected');
      setRejectingItem(null);
      setRejectReason('');
      await fetchSubmissions();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      PendingTenantApproval: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending Your Review' },
      PendingApproval: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Forwarded to Super Admin' },
      Published: { bg: 'bg-green-100', text: 'text-green-800', label: 'Published' },
      RejectedByTenantAdmin: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected by You' },
      Rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected by Super Admin' },
      Resubmitted: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Resubmitted' },
    };
    const cfg = map[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
        {cfg.label}
      </span>
    );
  };

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'pending', label: `Pending (${pendingCount})`, icon: Clock },
    { key: 'forwarded', label: 'Forwarded', icon: CheckCircle },
    { key: 'rejected', label: 'Rejected', icon: XCircle },
    { key: 'all', label: 'All', icon: BookOpen },
  ];

  return (
    <>
      <Toaster position="top-right" />
      <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
        {/* Hero Header */}
        <div
          className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
          style={{ background: `linear-gradient(135deg, ${branding?.primaryColor || '#4f46e5'}, ${branding?.secondaryColor || '#ec4899'})` }}
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}
          />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Sub Admin Submissions</h1>
                <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                  Review and manage courses submitted by Sub Admins
                </p>
              </div>
            </div>
            <button
              onClick={fetchSubmissions}
              disabled={loading}
              className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/20"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-line overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === t.key
                  ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                  : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--brand-primary)]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-fg-muted">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-fg-subtle" />
            <p className="text-lg font-medium">No submissions found</p>
            <p className="text-sm mt-1">Sub Admin course submissions will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(course => {
              const isExpanded = expandedItem === course._id;
              const isRejecting = rejectingItem === course._id;
              const isPending = course.status === 'PendingTenantApproval';

              return (
                <div key={course._id} className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-lg font-semibold text-fg truncate">{course.title}</h3>
                          {statusBadge(course.status)}
                        </div>
                        {course.description && (
                          <p className="text-sm text-fg-muted line-clamp-2 mt-1">{course.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-fg-subtle">
                          {course.submittedBy && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {course.submittedBy.firstName} {course.submittedBy.lastName}
                            </span>
                          )}
                          {course.category && <span>{course.category}</span>}
                          {course.level && <span>{course.level}</span>}
                          <span>{new Date(course.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => openFullPreview(course._id)}
                          disabled={previewLoading}
                          className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"
                          title="View Full Course"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setExpandedItem(isExpanded ? null : course._id)}
                          className="p-2 rounded-lg hover:bg-surface-muted text-fg-muted"
                          title="Quick Details"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {isPending && (
                          <>
                            <button
                              onClick={() => handleApprove(course._id)}
                              disabled={actionLoading === course._id}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              {actionLoading === course._id ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => { setRejectingItem(isRejecting ? null : course._id); setRejectReason(''); }}
                              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isRejecting && (
                      <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                        <label className="block text-sm font-medium text-red-700 mb-1">Rejection Reason</label>
                        <textarea
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          placeholder="Explain why this course needs changes..."
                          className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                          rows={3}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleReject(course._id)}
                            disabled={actionLoading === course._id}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            {actionLoading === course._id ? 'Rejecting...' : 'Confirm Reject'}
                          </button>
                          <button
                            onClick={() => { setRejectingItem(null); setRejectReason(''); }}
                            className="px-3 py-1.5 bg-white border border-line text-sm rounded-lg hover:bg-surface-muted"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-line bg-surface-muted p-4 sm:p-5 space-y-3 text-sm">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><span className="font-medium text-fg-muted">Modules:</span> {course.modules?.length || 0}</div>
                        <div><span className="font-medium text-fg-muted">Category:</span> {course.category || '—'}</div>
                        <div><span className="font-medium text-fg-muted">Level:</span> {course.level || '—'}</div>
                        <div><span className="font-medium text-fg-muted">Created:</span> {new Date(course.createdAt).toLocaleString()}</div>
                      </div>
                      {course.tenantRejectionReason && (
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <p className="text-sm font-medium text-red-700">Your Rejection Reason:</p>
                          <p className="text-sm text-red-600 mt-1">{course.tenantRejectionReason}</p>
                        </div>
                      )}
                      {course.rejectionReason && (
                        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <p className="text-sm font-medium text-orange-700">Super Admin Rejection:</p>
                          <p className="text-sm text-orange-600 mt-1">{course.rejectionReason}</p>
                        </div>
                      )}
                      {course.modules && course.modules.length > 0 && (
                        <div>
                          <p className="font-medium text-fg-muted mb-2">Module Overview:</p>
                          <ul className="space-y-1">
                            {course.modules.map((m: any, i: number) => (
                              <li key={m.id || i} className="flex items-center gap-2 text-fg">
                                <BookOpen className="w-3.5 h-3.5 text-fg-subtle" />
                                {m.title || `Module ${i + 1}`}
                                <span className="text-fg-subtle">({m.subModules?.length || 0} lessons)</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Full Course Preview Modal */}
        {previewCourse && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewCourse(null)}
          >
            <div
              className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-t-2xl px-6 py-5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h2 className="text-xl font-bold text-white truncate">{previewCourse.title}</h2>
                      {statusBadge(previewCourse.status)}
                    </div>
                    {previewCourse.description && (
                      <p className="text-indigo-100 text-sm line-clamp-2">{previewCourse.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setPreviewCourse(null)}
                    className="p-1.5 hover:bg-white/20 rounded-lg transition flex-shrink-0"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
                {/* Course meta strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/20">
                  {[
                    { label: 'Category', value: previewCourse.category || '—' },
                    { label: 'Level', value: previewCourse.level || '—' },
                    { label: 'Modules', value: previewCourse.modules?.length || 0 },
                    { label: 'Created', value: new Date(previewCourse.createdAt).toLocaleDateString() },
                  ].map(item => (
                    <div key={item.label} className="bg-white/10 rounded-lg px-3 py-2">
                      <p className="text-indigo-200 text-xs">{item.label}</p>
                      <p className="text-white font-semibold text-sm">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Body */}
              <div className="overflow-y-auto flex-1 p-5 space-y-5">
                {/* Modules & Content */}
                {previewCourse.modules && previewCourse.modules.length > 0 ? (
                  <section>
                    <h3 className="text-base font-semibold text-fg mb-3 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-indigo-500" />
                      Modules &amp; Content
                    </h3>
                    <div className="space-y-3">
                      {previewCourse.modules.map((mod: any, mi: number) => (
                        <div key={mod.id || mi} className="border border-line rounded-xl overflow-hidden">
                          {/* Module Header */}
                          <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-3">
                            <div className="flex items-start gap-2">
                              <BookOpen className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-indigo-900 text-sm">{mod.title || `Module ${mi + 1}`}</h4>
                                {mod.description && (
                                  <p className="text-xs text-indigo-600/80 mt-0.5 leading-relaxed">{mod.description}</p>
                                )}
                                {mod.learningObjective && (
                                  <p className="text-xs text-gray-500 mt-1 italic">
                                    <span className="font-medium not-italic text-gray-600">Objective:</span> {mod.learningObjective}
                                  </p>
                                )}
                              </div>
                              <span className="text-xs text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full shrink-0">
                                {mod.subModules?.length || 0} lesson{(mod.subModules?.length || 0) !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>

                          {/* Sub-Modules */}
                          {mod.subModules && mod.subModules.length > 0 && (
                            <div className="divide-y divide-line">
                              {mod.subModules.map((sub: any, si: number) => (
                                <div key={sub.id || si} className="px-4 py-3 bg-surface">
                                  <p className="font-medium text-fg text-sm mb-1">{sub.title || `Lesson ${si + 1}`}</p>
                                  {sub.description && (
                                    <p className="text-xs text-fg-muted mb-2 leading-relaxed">{sub.description}</p>
                                  )}
                                  {sub.learningObjective && (
                                    <p className="text-xs text-fg-subtle mb-2 italic">Objective: {sub.learningObjective}</p>
                                  )}

                                  {/* Resources */}
                                  {sub.resources && sub.resources.length > 0 && (
                                    <div className="mt-2 space-y-1.5 ml-3">
                                      {sub.resources.map((res: any, ri: number) => (
                                        <div key={res.id || ri} className="flex items-start gap-2 text-sm bg-surface-muted rounded-lg px-3 py-2">
                                          <span className="flex-shrink-0 mt-0.5">{getResourceIcon(res.type)}</span>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-fg font-medium text-xs">{res.title || `Resource ${ri + 1}`}</span>
                                              <span className="text-xs text-fg-muted bg-surface-sunken px-1.5 py-0.5 rounded">{getResourceLabel(res.type)}</span>
                                              {res.duration && <span className="text-xs text-fg-subtle">{Math.round(res.duration / 60)}m</span>}
                                            </div>
                                            {res.description && <p className="text-xs text-fg-muted mt-0.5 italic">{res.description}</p>}
                                            {res.content && res.type === 'rich_text' && (
                                              <div
                                                className="mt-1 text-xs text-fg bg-surface rounded border border-line px-2 py-1.5 max-h-24 overflow-y-auto"
                                                dangerouslySetInnerHTML={{ __html: res.content }}
                                              />
                                            )}
                                            {res.url && (res.type === 'external_link' || res.type === 'video_youtube' || res.type === 'video_vimeo') && (
                                              <a
                                                href={res.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-indigo-500 hover:underline mt-0.5 flex items-center gap-1 truncate"
                                              >
                                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                                <span className="truncate">{res.url}</span>
                                              </a>
                                            )}
                                            {res.url && !['external_link', 'video_youtube', 'video_vimeo'].includes(res.type) && res.url.startsWith('http') && (
                                              <a
                                                href={res.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-indigo-500 hover:underline mt-0.5 inline-flex items-center gap-1"
                                              >
                                                <ExternalLink className="w-3 h-3" /> View file
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Sub-module Quiz */}
                                  {sub.quiz && sub.quiz.questions && sub.quiz.questions.length > 0 && (
                                    <div className="mt-2 ml-3 bg-purple-50 border border-purple-100 rounded-lg p-3">
                                      <div className="flex items-center gap-2 mb-2">
                                        <HelpCircle className="w-4 h-4 text-purple-600" />
                                        <p className="text-xs font-semibold text-purple-800">
                                          Quiz: {sub.quiz.title || 'Untitled Quiz'} — {sub.quiz.questions.length} question{sub.quiz.questions.length !== 1 ? 's' : ''}
                                        </p>
                                        {sub.quiz.settings?.passingScore !== undefined && (
                                          <span className="text-xs text-purple-500 bg-purple-100 px-2 py-0.5 rounded-full ml-auto">
                                            Pass: {sub.quiz.settings.passingScore}%
                                          </span>
                                        )}
                                      </div>
                                      <div className="space-y-2">
                                        {sub.quiz.questions.map((q: any, qi: number) => (
                                          <div key={q.id || qi} className="text-xs">
                                            <p className="font-medium text-fg mb-1">
                                              {qi + 1}. {q.text || q.questionText || 'Question'}
                                              <span className="ml-1 text-fg-subtle font-normal">({q.points || 1} pt{(q.points || 1) !== 1 ? 's' : ''})</span>
                                            </p>
                                            {q.options && q.options.length > 0 && (
                                              <div className="ml-3 space-y-0.5">
                                                {q.options.map((opt: any, oi: number) => {
                                                  const optText = typeof opt === 'string' ? opt : (opt.text || '');
                                                  const isCorrect = Array.isArray(q.correctAnswer)
                                                    ? q.correctAnswer.includes(oi)
                                                    : q.correctAnswer === oi;
                                                  return (
                                                    <div
                                                      key={opt.id || oi}
                                                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${isCorrect ? 'bg-green-50 text-green-700 font-medium' : 'text-fg-muted'}`}
                                                    >
                                                      {isCorrect
                                                        ? <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                                                        : <span className="w-3 h-3 flex-shrink-0" />
                                                      }
                                                      {String.fromCharCode(65 + oi)}. {optText}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                            {q.explanation && (
                                              <p className="ml-3 mt-0.5 text-fg-subtle italic">Explanation: {q.explanation}</p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Module-level quiz */}
                          {mod.moduleEndQuiz && mod.moduleEndQuiz.questions?.length > 0 && (
                            <div className="bg-amber-50 border-t border-amber-100 px-4 py-3">
                              <div className="flex items-center gap-2 mb-1">
                                <Award className="w-4 h-4 text-amber-600" />
                                <p className="text-xs font-semibold text-amber-800">
                                  Module Quiz: {mod.moduleEndQuiz.title || 'End-of-Module Quiz'} — {mod.moduleEndQuiz.questions.length} question{mod.moduleEndQuiz.questions.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <p className="text-xs text-amber-600">Passing score: {mod.moduleEndQuiz.settings?.passingScore ?? 70}%</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <div className="text-center py-10 text-fg-subtle bg-surface-muted rounded-xl">
                    <BookOpen className="w-10 h-10 mx-auto mb-2 text-fg-subtle" />
                    <p className="text-sm">No modules added yet</p>
                  </div>
                )}

                {/* Course Settings */}
                {previewCourse.settings && (
                  <section>
                    <h3 className="text-base font-semibold text-fg mb-3 flex items-center gap-2">
                      <Settings className="w-4 h-4 text-fg-muted" />
                      Course Settings
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Certificate', value: previewCourse.settings.certificateEnabled ? '✓ Enabled' : '✗ Disabled', highlight: previewCourse.settings.certificateEnabled },
                        { label: 'Passing Score', value: `${previewCourse.settings.passingScore ?? 70}%` },
                        { label: 'Sequential', value: previewCourse.settings.sequentialProgression ? 'Required' : 'Free navigation' },
                        { label: 'Allow Revisit', value: previewCourse.settings.allowRevisit !== false ? 'Yes' : 'No' },
                        ...(previewCourse.settings.validityDays ? [{ label: 'Access Validity', value: `${previewCourse.settings.validityDays} days` }] : []),
                        ...(previewCourse.estimatedDuration ? [{ label: 'Est. Duration', value: `${previewCourse.estimatedDuration} min` }] : []),
                      ].map((item: any) => (
                        <div key={item.label} className="bg-surface-muted rounded-lg px-3 py-2.5">
                          <p className="text-xs text-fg-subtle mb-0.5">{item.label}</p>
                          <p className={`text-sm font-semibold ${item.highlight ? 'text-green-700' : 'text-fg'}`}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                    {previewCourse.settings.certificateEnabled && previewCourse.settings.certificateTemplateId && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
                        <Award className="w-4 h-4" />
                        Certificate template assigned (ID: {previewCourse.settings.certificateTemplateId})
                      </div>
                    )}
                  </section>
                )}

                {/* Tags */}
                {previewCourse.tags?.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-fg-muted">Tags:</span>
                    {previewCourse.tags.map((tag: string, i: number) => (
                      <span key={i} className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-line shrink-0 bg-surface-muted rounded-b-2xl">
                <button
                  onClick={() => setPreviewCourse(null)}
                  className="px-4 py-2 border border-line text-fg rounded-lg text-sm hover:bg-surface-sunken transition"
                >
                  Close
                </button>
                {previewCourse.status === 'PendingTenantApproval' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setRejectingItem(previewCourse._id); setPreviewCourse(null); }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"
                    >
                      Reject Course
                    </button>
                    <button
                      onClick={() => { handleApprove(previewCourse._id); setPreviewCourse(null); }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
                    >
                      Approve Course
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default SubAdminSubmissionsPage;
