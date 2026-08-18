'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  BookOpen,
  Award,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Eye,
  BadgeCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import { Badge } from '@/components/ui';
import { Skeleton } from '@/components/ui';
import toast, { Toaster } from 'react-hot-toast';
import { cn } from '@/lib/cn';
import CoursePreviewModal from '@/components/CoursePreviewModal';
import ReadMoreText from '@/components/ReadMoreText';
import { PageHero, HeroAction } from '@/components/super-admin/PageHero';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CourseItem {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  level?: string;
  status: string;
  parentCourseId?: string;
  modules?: any[];
  rejectionReason?: string;
  submittedBy?: { firstName: string; lastName: string; email: string };
  submittedByTenantId?: { orgName: string; contactEmail: string };
  selectedTenants?: string[];
  createdAt: string;
  updatedAt: string;
  approvalDate?: string;
}

interface CertificateItem {
  _id: string;
  name: string;
  backgroundImageUrl?: string;
  logoImageUrl?: string;
  signatureImageUrl?: string;
  designation?: string;
  signatoryName?: string;
  textPlacements?: {
    userName?: { x: number; y: number; fontSize: number; color: string };
    courseName?: { x: number; y: number; fontSize: number; color: string };
    date?: { x: number; y: number; fontSize: number; color: string };
    designation?: { x: number; y: number; fontSize: number; color: string };
  };
  logoPlacement?: { x: number; y: number; width: number; height: number };
  signaturePlacement?: { width: number; height: number };
  approvalStatus: string;
  rejectionReason?: string;
  submittedBy?: { firstName: string; lastName: string; email: string };
  submittedByTenantId?: { orgName: string; contactEmail: string };
  selectedTenants?: string[];
  createdAt: string;
  updatedAt: string;
  approvalDate?: string;
}

type TabKey = 'all_pending' | 'pending_courses' | 'pending_certs' | 'approved' | 'rejected';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('all_pending');
  const [allCourses, setAllCourses] = useState<CourseItem[]>([]);
  const [allCertificates, setAllCertificates] = useState<CertificateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [rejectingItem, setRejectingItem] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewCourse, setPreviewCourse] = useState<any>(null);
  const [previewCertificate, setPreviewCertificate] = useState<CertificateItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const [coursesRes, certsRes] = await Promise.all([
        api.get<{ data: CourseItem[] }>('/master-courses/all-approval-items'),
        api.get<{ data: CertificateItem[] }>('/certificates/all-approval-items'),
      ]);
      setAllCourses((coursesRes as any).data || []);
      setAllCertificates((certsRes as any).data || []);
    } catch (error) {
      console.error('Failed to load approval items:', error);
      toast.error('Failed to load approval items');
    } finally {
      setLoading(false);
    }
  };

  // Preview full course
  const handlePreviewCourse = async (courseId: string) => {
    setPreviewLoading(courseId);
    try {
      const response = await api.get<{ data: any }>(`/master-courses/${courseId}`);
      setPreviewCourse((response as any).data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load course details');
    } finally {
      setPreviewLoading(null);
    }
  };

  // Derived data
  const pendingCourses = useMemo(
    () => allCourses.filter((c) => c.status === 'PendingApproval' || c.status === 'Resubmitted'),
    [allCourses],
  );
  const approvedCourses = useMemo(() => allCourses.filter((c) => c.status === 'Published'), [allCourses]);
  const rejectedCourses = useMemo(() => allCourses.filter((c) => c.status === 'Rejected'), [allCourses]);

  const pendingCerts = useMemo(
    () => allCertificates.filter((c) => c.approvalStatus === 'pending_approval'),
    [allCertificates],
  );
  const approvedCerts = useMemo(
    () => allCertificates.filter((c) => c.approvalStatus === 'approved'),
    [allCertificates],
  );
  const rejectedCerts = useMemo(
    () => allCertificates.filter((c) => c.approvalStatus === 'rejected'),
    [allCertificates],
  );

  const totalPending = pendingCourses.length + pendingCerts.length;
  const totalApproved = approvedCourses.length + approvedCerts.length;
  const totalRejected = rejectedCourses.length + rejectedCerts.length;

  // Actions
  const handleApproveCourse = async (id: string) => {
    setActionLoading(id);
    try {
      await api.post(`/master-courses/${id}/approve`, {});
      setAllCourses((prev) =>
        prev.map((c) =>
          c._id === id ? { ...c, status: 'Published', approvalDate: new Date().toISOString() } : c,
        ),
      );
      toast.success('Course published successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to approve course');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectCourse = async (id: string) => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setActionLoading(id);
    try {
      await api.post(`/master-courses/${id}/reject`, { reason: rejectReason });
      setAllCourses((prev) =>
        prev.map((c) =>
          c._id === id
            ? { ...c, status: 'Rejected', rejectionReason: rejectReason, approvalDate: new Date().toISOString() }
            : c,
        ),
      );
      setRejectingItem(null);
      setRejectReason('');
      toast.success('Course rejected with feedback');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to reject course');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveCertificate = async (id: string) => {
    setActionLoading(id);
    try {
      await api.post(`/certificates/${id}/approve`, {});
      setAllCertificates((prev) =>
        prev.map((c) =>
          c._id === id ? { ...c, approvalStatus: 'approved', approvalDate: new Date().toISOString() } : c,
        ),
      );
      toast.success('Certificate approved successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to approve certificate');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectCertificate = async (id: string) => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setActionLoading(id);
    try {
      await api.post(`/certificates/${id}/reject`, { reason: rejectReason });
      setAllCertificates((prev) =>
        prev.map((c) =>
          c._id === id
            ? {
                ...c,
                approvalStatus: 'rejected',
                rejectionReason: rejectReason,
                approvalDate: new Date().toISOString(),
              }
            : c,
        ),
      );
      setRejectingItem(null);
      setRejectReason('');
      toast.success('Certificate rejected with feedback');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to reject certificate');
    } finally {
      setActionLoading(null);
    }
  };

  // Status badge helper
  const getStatusBadge = (status: string) => {
    if (status === 'Resubmitted') {
      return <Badge tone="info">Resubmitted</Badge>;
    }
    if (status === 'PendingApproval' || status === 'pending_approval') {
      return <Badge tone="warning">Pending</Badge>;
    }
    if (status === 'Published' || status === 'approved') {
      return <Badge tone="success">Approved</Badge>;
    }
    if (status === 'Rejected' || status === 'rejected') {
      return <Badge tone="danger">Rejected</Badge>;
    }
    return null;
  };

  // Render a course card
  const renderCourseCard = (course: CourseItem, showActions: boolean) => (
    <div
      key={course._id}
      className="group relative bg-white dark:bg-gray-800 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-[#f2f2f7] dark:border-gray-700 hover:shadow-2xl transition-all duration-500 overflow-hidden"
    >
      <div className="p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white truncate max-w-md">
                {course.title}
              </h3>
              {getStatusBadge(course.status)}
              {course.parentCourseId && (
                <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                  Update Request
                </span>
              )}
            </div>

            {course.description && (
              <div className="mb-6">
                <ReadMoreText
                  text={course.description}
                  maxLines={2}
                  className="text-gray-500 dark:text-gray-400 font-medium text-sm leading-relaxed"
                />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Organization
                </span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate">
                  {course.submittedByTenantId?.orgName || 'N/A'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Submitted By
                </span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate">
                  {course.submittedBy
                    ? `${course.submittedBy.firstName} ${course.submittedBy.lastName}`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Category
                </span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {course.category || 'Standard'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Submission Date
                </span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {new Date(course.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t lg:border-t-0 pt-4 lg:pt-0">
            <button
              onClick={() => handlePreviewCourse(course._id)}
              disabled={previewLoading === course._id}
              className="flex items-center gap-2 px-6 py-3 bg-[#fafafc] hover:bg-indigo-50 text-indigo-600 rounded-xl font-black text-sm transition-all border border-[#f2f2f7] hover:border-indigo-100 disabled:opacity-50"
            >
              {previewLoading === course._id ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              Preview
            </button>
            <button
              onClick={() => setExpandedItem(expandedItem === course._id ? null : course._id)}
              className={cn(
                'p-3 rounded-xl transition-all',
                expandedItem === course._id
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-400 hover:bg-gray-50',
              )}
            >
              {expandedItem === course._id ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </button>
            {showActions && (course.status === 'PendingApproval' || course.status === 'Resubmitted') && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleApproveCourse(course._id)}
                  disabled={actionLoading === course._id}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 shadow-lg shadow-green-100 font-black text-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" /> Publish
                </button>
                <button
                  onClick={() => {
                    setRejectingItem(course._id);
                    setRejectReason('');
                  }}
                  disabled={actionLoading === course._id}
                  className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 font-black text-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Rejection Details */}
        {course.status === 'Rejected' && course.rejectionReason && (
          <div className="mt-8 bg-red-50/50 border border-red-100 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-red-600 shadow-sm flex-shrink-0">
                <XCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">
                  Feedback Provided
                </p>
                <p className="text-sm font-bold text-red-700 leading-relaxed">{course.rejectionReason}</p>
              </div>
            </div>
          </div>
        )}

        {/* Expanded Curriculum View */}
        {expandedItem === course._id && (
          <div className="mt-8 pt-8 border-t border-[#f2f2f7] animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <RefreshCw className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                Curriculum Preview
              </h4>
            </div>
            <div className="space-y-4">
              {course.modules && course.modules.length > 0 ? (
                course.modules.map((mod: any, i: number) => (
                  <div
                    key={i}
                    className="bg-[#fafafc] dark:bg-gray-700/30 p-5 rounded-2xl border border-[#f2f2f7] dark:border-gray-700"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="w-6 h-6 rounded-full bg-white dark:bg-gray-600 flex items-center justify-center text-[10px] font-black text-indigo-600 border border-[#f2f2f7] dark:border-gray-500">
                        {i + 1}
                      </span>
                      <p className="text-sm font-black text-gray-800 dark:text-gray-200">
                        {mod.title || `Module ${i + 1}`}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-9">
                      {mod.subModules?.map((sm: any, j: number) => (
                        <div key={j} className="flex items-center gap-2 text-xs font-bold text-gray-400">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                          {sm.title || `Sub-Module ${j + 1}`}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm font-bold text-gray-400">
                    This course has no modules defined yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rejection Workspace */}
        {rejectingItem === course._id && (
          <div className="mt-8 pt-8 border-t border-red-100 animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                <XCircle className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-black text-red-900 uppercase tracking-wider">
                Rejection Workspace
              </h4>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Provide specific feedback or reasons for rejection to help the tenant admin improve the content..."
              className="w-full bg-red-50/30 border-2 border-red-100 rounded-2xl p-6 text-sm font-medium focus:ring-4 focus:ring-red-500/10 focus:border-red-500 transition-all text-red-900 placeholder-red-300"
              rows={4}
            />
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => handleRejectCourse(course._id)}
                disabled={actionLoading === course._id}
                className="px-8 py-4 bg-red-600 text-white rounded-2xl hover:bg-red-700 shadow-lg shadow-red-200 font-black text-sm transition-all active:scale-95 disabled:opacity-50"
              >
                Send Feedback & Reject
              </button>
              <button
                onClick={() => {
                  setRejectingItem(null);
                  setRejectReason('');
                }}
                className="px-8 py-4 bg-white text-gray-500 rounded-2xl hover:bg-gray-50 font-black text-sm transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Render a certificate card
  const renderCertificateCard = (cert: CertificateItem, showActions: boolean) => (
    <div
      key={cert._id}
      className="group relative bg-white dark:bg-gray-800 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-[#f2f2f7] dark:border-gray-700 hover:shadow-2xl transition-all duration-500 overflow-hidden"
    >
      <div className="p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white truncate max-w-md">
                {cert.name}
              </h3>
              {getStatusBadge(cert.approvalStatus)}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Organization
                </span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate">
                  {cert.submittedByTenantId?.orgName || 'N/A'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Signatory
                </span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate">
                  {cert.signatoryName || 'Not Set'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Designation
                </span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {cert.designation || 'Principal'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Submission Date
                </span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {new Date(cert.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t lg:border-t-0 pt-4 lg:pt-0">
            <div className="hidden sm:block w-24 h-16 rounded-xl border border-[#f2f2f7] overflow-hidden bg-gray-50 flex-shrink-0">
              {cert.backgroundImageUrl ? (
                <img
                  src={cert.backgroundImageUrl}
                  alt=""
                  className="w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-200">
                  <Award className="w-8 h-8" />
                </div>
              )}
            </div>
            <button
              onClick={() => setPreviewCertificate(cert)}
              className="flex items-center gap-2 px-6 py-3 bg-[#fafafc] hover:bg-violet-50 text-violet-600 rounded-xl font-black text-sm transition-all border border-[#f2f2f7] hover:border-violet-100"
            >
              <Eye className="w-4 h-4" />
              Preview Template
            </button>
            {showActions && cert.approvalStatus === 'pending_approval' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleApproveCertificate(cert._id)}
                  disabled={actionLoading === cert._id}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 shadow-lg shadow-green-100 font-black text-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
                <button
                  onClick={() => {
                    setRejectingItem(cert._id);
                    setRejectReason('');
                  }}
                  disabled={actionLoading === cert._id}
                  className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 font-black text-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Rejection Details */}
        {cert.approvalStatus === 'rejected' && cert.rejectionReason && (
          <div className="mt-8 bg-red-50/50 border border-red-100 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-red-600 shadow-sm flex-shrink-0">
                <XCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">
                  Feedback Provided
                </p>
                <p className="text-sm font-bold text-red-700 leading-relaxed">{cert.rejectionReason}</p>
              </div>
            </div>
          </div>
        )}

        {/* Rejection Workspace */}
        {rejectingItem === cert._id && (
          <div className="mt-8 pt-8 border-t border-red-100 animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                <XCircle className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-black text-red-900 uppercase tracking-wider">
                Rejection Workspace
              </h4>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Provide specific feedback or reasons for rejection... (e.g. logo resolution, signature alignment)"
              className="w-full bg-red-50/30 border-2 border-red-100 rounded-2xl p-6 text-sm font-medium focus:ring-4 focus:ring-red-500/10 focus:border-red-500 transition-all text-red-900 placeholder-red-300"
              rows={4}
            />
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => handleRejectCertificate(cert._id)}
                disabled={actionLoading === cert._id}
                className="px-8 py-4 bg-red-600 text-white rounded-2xl hover:bg-red-700 shadow-lg shadow-red-200 font-black text-sm transition-all active:scale-95 disabled:opacity-50"
              >
                Send Feedback & Reject
              </button>
              <button
                onClick={() => {
                  setRejectingItem(null);
                  setRejectReason('');
                }}
                className="px-8 py-4 bg-white text-gray-500 rounded-2xl hover:bg-gray-50 font-black text-sm transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Empty state
  const renderEmpty = (icon: React.ReactNode, message: string) => (
    <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
      <div className="mx-auto mb-3 text-gray-300">{icon}</div>
      <p className="text-gray-500">{message}</p>
    </div>
  );

  if (loading) {
    return (
      <DashboardScaffold title="Quality Assurance" subtitle="Content approval queue">
        <Toaster position="top-right" />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          <span className="ml-3 text-gray-600">Loading approval items...</span>
        </div>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold title="Quality Assurance" subtitle="Review and moderate content submissions from tenant organizations">
      <Toaster position="top-right" />

      <div className="space-y-6 sm:space-y-8 pb-12">
        {/* Premium Header */}
        <PageHero
          icon={BadgeCheck}
          title="Quality"
          highlight="Assurance"
          subtitle="Review and moderate content submissions from tenant organizations across the platform."
          actions={
            <HeroAction variant="solid" onClick={loadItems}>
              <RefreshCw className="size-4" />
              Refresh Queue
            </HeroAction>
          }
        />

        {/* Summary Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6">
          {(
            [
              { key: 'all_pending', label: 'Total Pending', count: totalPending, icon: Clock, color: 'amber' },
              { key: 'pending_courses', label: 'Courses', count: pendingCourses.length, icon: BookOpen, color: 'blue' },
              { key: 'pending_certs', label: 'Certificates', count: pendingCerts.length, icon: Award, color: 'purple' },
              { key: 'approved', label: 'Approved', count: totalApproved, icon: CheckCircle, color: 'green' },
              { key: 'rejected', label: 'Rejected', count: totalRejected, icon: XCircle, color: 'red' },
            ] as const
          ).map((stat) => {
            const Icon = stat.icon;
            const isActive = activeTab === stat.key;
            const colorMap: Record<string, string> = {
              amber: 'text-amber-600 bg-amber-50 border-amber-100',
              blue: 'text-blue-600 bg-blue-50 border-blue-100',
              purple: 'text-purple-600 bg-purple-50 border-purple-100',
              green: 'text-green-600 bg-green-50 border-green-100',
              red: 'text-red-600 bg-red-50 border-red-100',
            };
            const colorClasses = colorMap[stat.color] || colorMap.blue;

            return stat.key === 'all_pending' && totalPending === 0 && activeTab !== 'all_pending' ? null : (
              <button
                key={stat.key}
                onClick={() => setActiveTab(stat.key as TabKey)}
                className={cn(
                  'flex flex-col p-6 rounded-[2rem] border transition-all duration-300 text-left group',
                  isActive
                    ? 'bg-white border-indigo-600 shadow-[0_20px_50px_rgba(79,70,229,0.1)] scale-105 z-10'
                    : 'bg-white/50 border-[#f2f2f7] hover:border-indigo-200 hover:bg-white hover:shadow-xl',
                )}
              >
                <div
                  className={cn(
                    'w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110',
                    colorClasses,
                  )}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">
                  {stat.label}
                </p>
                <p className={cn('text-3xl font-black', isActive ? 'text-indigo-600' : 'text-gray-900')}>
                  {stat.count}
                </p>
              </button>
            );
          })}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 p-1 bg-[#f2f2f7] dark:bg-gray-800 rounded-[1.5rem] w-fit overflow-x-auto max-w-full">
          {[
            { key: 'all_pending', label: 'All Pending' },
            { key: 'pending_courses', label: 'Course Queue' },
            { key: 'pending_certs', label: 'Certificates' },
            { key: 'approved', label: 'Published' },
            { key: 'rejected', label: 'Rejected' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={cn(
                'px-8 py-3.5 rounded-2xl text-sm font-black transition-all duration-300 whitespace-nowrap',
                activeTab === tab.key
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content List */}
        <div className="grid grid-cols-1 gap-6">
          {activeTab === 'all_pending' && (
            <>
              {totalPending === 0 ? (
                renderEmpty(<Clock className="w-16 h-16 opacity-20" />, 'Verification queue is currently empty')
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {[...pendingCourses, ...pendingCerts]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((item) =>
                      'title' in item
                        ? renderCourseCard(item as CourseItem, true)
                        : renderCertificateCard(item as CertificateItem, true),
                    )}
                </div>
              )}
            </>
          )}

          {activeTab === 'pending_courses' && (
            <>
              {pendingCourses.length === 0 ? (
                renderEmpty(
                  <BookOpen className="w-16 h-16 opacity-20" />,
                  'No courses awaiting verification',
                )
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {pendingCourses.map((c) => renderCourseCard(c, true))}
                </div>
              )}
            </>
          )}

          {activeTab === 'pending_certs' && (
            <>
              {pendingCerts.length === 0 ? (
                renderEmpty(
                  <Award className="w-16 h-16 opacity-20" />,
                  'No certificate templates in queue',
                )
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {pendingCerts.map((c) => renderCertificateCard(c, true))}
                </div>
              )}
            </>
          )}

          {activeTab === 'approved' && (
            <>
              {totalApproved === 0 ? (
                renderEmpty(
                  <CheckCircle className="w-16 h-16 opacity-20" />,
                  'No approved content to display',
                )
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {[...approvedCourses, ...approvedCerts]
                    .sort(
                      (a, b) =>
                        new Date(b.approvalDate || '').getTime() -
                        new Date(a.approvalDate || '').getTime(),
                    )
                    .map((item) =>
                      'title' in item
                        ? renderCourseCard(item as CourseItem, false)
                        : renderCertificateCard(item as CertificateItem, false),
                    )}
                </div>
              )}
            </>
          )}

          {activeTab === 'rejected' && (
            <>
              {totalRejected === 0 ? (
                renderEmpty(
                  <XCircle className="w-16 h-16 opacity-20" />,
                  'Rejection history is clear',
                )
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {[...rejectedCourses, ...rejectedCerts]
                    .sort(
                      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
                    )
                    .map((item) =>
                      'title' in item
                        ? renderCourseCard(item as CourseItem, false)
                        : renderCertificateCard(item as CertificateItem, false),
                    )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Course Preview Modal */}
        {previewCourse && (
          <CoursePreviewModal course={previewCourse} onClose={() => setPreviewCourse(null)} />
        )}

        {/* Certificate Template Preview Modal */}
        {previewCertificate && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewCertificate(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Certificate Template Preview</h2>
                  <p className="text-sm text-gray-500 mt-1">{previewCertificate.name}</p>
                </div>
                <button
                  onClick={() => setPreviewCertificate(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <XCircle className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              {/* Certificate Preview */}
              <div className="p-6">
                <div className="bg-gray-100 rounded-xl overflow-hidden border border-gray-200 mb-6">
                  {previewCertificate.backgroundImageUrl ? (
                    <img
                      src={previewCertificate.backgroundImageUrl}
                      alt="Certificate Background"
                      className="w-full object-contain"
                    />
                  ) : (
                    <div className="flex items-center justify-center text-gray-400 py-24">
                      <div className="text-center">
                        <Award className="w-16 h-16 mx-auto mb-2" />
                        <p>No background image</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Template Name</p>
                    <p className="text-sm font-semibold text-gray-900">{previewCertificate.name}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Status</p>
                    {getStatusBadge(previewCertificate.approvalStatus)}
                  </div>
                  {previewCertificate.signatoryName && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">Signatory Name</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {previewCertificate.signatoryName}
                      </p>
                    </div>
                  )}
                  {previewCertificate.designation && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">Designation</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {previewCertificate.designation}
                      </p>
                    </div>
                  )}
                  {previewCertificate.submittedByTenantId && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                        Submitted By Org
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {previewCertificate.submittedByTenantId.orgName}
                      </p>
                    </div>
                  )}
                  {previewCertificate.submittedBy && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">Submitted By</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {previewCertificate.submittedBy.firstName}{' '}
                        {previewCertificate.submittedBy.lastName}
                      </p>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Submitted On</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(previewCertificate.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {previewCertificate.signatureImageUrl && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">Signature</p>
                      <img
                        src={previewCertificate.signatureImageUrl}
                        alt="Signature"
                        className="h-12 object-contain"
                      />
                    </div>
                  )}
                </div>

                {previewCertificate.rejectionReason && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700">
                      <strong>Rejection Reason:</strong> {previewCertificate.rejectionReason}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardScaffold>
  );
}
