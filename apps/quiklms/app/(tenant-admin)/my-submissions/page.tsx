'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Award,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  RefreshCw,
  Eye,
  Filter,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { Button, Card, Badge, Skeleton } from '@/components/ui';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import { useBranding } from '@/app/providers';
import { cn } from '@/lib/cn';

interface CourseSubmission {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  level?: string;
  status: string;
  parentCourseId?: string;
  rejectionReason?: string;
  tenantRejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface CertificateSubmission {
  _id: string;
  name: string;
  backgroundImageUrl?: string;
  logoImageUrl?: string;
  signatureImageUrl?: string;
  designation?: string;
  signatoryName?: string;
  textPlacements?: any;
  logoPlacement?: any;
  signaturePlacement?: any;
  approvalStatus: string;
  rejectionReason?: string;
  submittedByTenantId?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

// Inline ReadMoreText component
function ReadMoreText({
  text,
  maxLines,
  className,
}: {
  text: string;
  maxLines: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={className}>
      <p
        className={cn(!expanded && maxLines === 2 ? 'line-clamp-2' : '')}
      >
        {text}
      </p>
      {text.length > 120 && (
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="text-xs text-indigo-600 hover:underline mt-0.5"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

// Inline DeleteConfirmationModal
function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  itemName?: string;
  isLoading?: boolean;
}) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => { if (!isLoading) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        </div>
        <p className="text-sm text-gray-600 mb-2">{message}</p>
        {itemName && (
          <p className="text-sm font-semibold text-gray-900 bg-gray-50 rounded-lg px-3 py-2 mb-4">
            &quot;{itemName}&quot;
          </p>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TenantMySubmissionsPage() {
  const router = useRouter();
  const { branding } = useBranding();

  const [activeTab, setActiveTab] = useState<'courses' | 'certificates'>('courses');
  const [courseStatusFilter, setCourseStatusFilter] = useState<StatusFilter>('all');
  const [certStatusFilter, setCertStatusFilter] = useState<StatusFilter>('all');
  const [courses, setCourses] = useState<CourseSubmission[]>([]);
  const [previewCertificate, setPreviewCertificate] = useState<CertificateSubmission | null>(null);
  const [certificates, setCertificates] = useState<CertificateSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseToDelete, setCourseToDelete] = useState<CourseSubmission | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    loadSubmissions();
  }, []);

  const loadSubmissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [coursesRes, certsRes] = await Promise.all([
        api.get('/master-courses/my-submissions'),
        api.get('/certificates/my-submissions'),
      ]);
      setCourses((coursesRes as any).data || []);
      setCertificates((certsRes as any).data || []);
    } catch (err: any) {
      console.error('Failed to load submissions:', err);
      setError(err?.message || 'Failed to load submissions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCourse = async () => {
    if (!courseToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/master-courses/${courseToDelete._id}`);
      setCourses(prev => prev.filter(c => c._id !== courseToDelete._id));
      setCourseToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete course:', err);
      setDeleteError(err?.message || 'Failed to delete course. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Course status helpers
  const isCourseStatus = (course: CourseSubmission, filter: StatusFilter): boolean => {
    switch (filter) {
      case 'pending': return ['PendingApproval', 'PendingTenantApproval', 'Resubmitted'].includes(course.status);
      case 'approved': return course.status === 'Published';
      case 'rejected': return ['Rejected', 'RejectedByTenantAdmin'].includes(course.status);
      default: return true;
    }
  };

  // Certificate status helpers
  const normalizeCertStatus = (cert: CertificateSubmission): string => {
    if (!cert.approvalStatus || cert.approvalStatus === '') return 'approved';
    return cert.approvalStatus;
  };

  const isCertStatus = (cert: CertificateSubmission, filter: StatusFilter): boolean => {
    const status = normalizeCertStatus(cert);
    switch (filter) {
      case 'pending': return status === 'pending_approval';
      case 'approved': return status === 'approved';
      case 'rejected': return status === 'rejected';
      default: return true;
    }
  };

  // Filtered data
  const filteredCourses = useMemo(
    () => courses.filter(c => isCourseStatus(c, courseStatusFilter)),
    [courses, courseStatusFilter]
  );

  const pendingUpdateParentIds = useMemo(() => {
    const pendingStatuses = new Set(['PendingApproval', 'PendingTenantApproval', 'Resubmitted']);
    return new Set(
      courses
        .filter(c => pendingStatuses.has(c.status) && !!c.parentCourseId)
        .map(c => String(c.parentCourseId))
    );
  }, [courses]);

  const filteredCertificates = useMemo(
    () => certificates.filter(c => isCertStatus(c, certStatusFilter)),
    [certificates, certStatusFilter]
  );

  // Counts
  const courseCounts = useMemo(() => ({
    all: courses.length,
    pending: courses.filter(c => ['PendingApproval', 'PendingTenantApproval', 'Resubmitted'].includes(c.status)).length,
    approved: courses.filter(c => c.status === 'Published').length,
    rejected: courses.filter(c => ['Rejected', 'RejectedByTenantAdmin'].includes(c.status)).length,
  }), [courses]);

  const certCounts = useMemo(() => ({
    all: certificates.length,
    pending: certificates.filter(c => normalizeCertStatus(c) === 'pending_approval').length,
    approved: certificates.filter(c => normalizeCertStatus(c) === 'approved').length,
    rejected: certificates.filter(c => normalizeCertStatus(c) === 'rejected').length,
  }), [certificates]);

  const getCourseStatusBadge = (status: string) => {
    switch (status) {
      case 'PendingTenantApproval':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
            <Clock className="w-3 h-3" /> Pending Tenant Admin Approval
          </span>
        );
      case 'PendingApproval':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
            <Clock className="w-3 h-3" /> Pending Super Admin Approval
          </span>
        );
      case 'Resubmitted':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
            <RefreshCw className="w-3 h-3" /> Resubmitted
          </span>
        );
      case 'Published':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3" /> Approved
          </span>
        );
      case 'RejectedByTenantAdmin':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
            <XCircle className="w-3 h-3" /> Rejected by Tenant Admin
          </span>
        );
      case 'Rejected':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
            <XCircle className="w-3 h-3" /> Rejected by Super Admin
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
            {status}
          </span>
        );
    }
  };

  const getCertStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_approval':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
            <Clock className="w-3 h-3" /> Pending Approval
          </span>
        );
      case 'approved':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3" /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
            <XCircle className="w-3 h-3" /> Rejected
          </span>
        );
      default:
        return null;
    }
  };

  // Status Filter Bar
  const StatusFilterBar = ({
    current,
    onChange,
    counts,
  }: {
    current: StatusFilter;
    onChange: (f: StatusFilter) => void;
    counts: { all: number; pending: number; approved: number; rejected: number };
  }) => {
    const filters: {
      key: StatusFilter;
      label: string;
      color: string;
      activeColor: string;
      count: number;
    }[] = [
      {
        key: 'all',
        label: 'All',
        color: 'text-gray-600 bg-gray-50 border-gray-200 hover:bg-gray-100',
        activeColor: 'text-indigo-700 bg-indigo-50 border-indigo-300',
        count: counts.all,
      },
      {
        key: 'pending',
        label: 'Pending',
        color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100',
        activeColor: 'text-amber-700 bg-amber-100 border-amber-400',
        count: counts.pending,
      },
      {
        key: 'approved',
        label: 'Approved',
        color: 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100',
        activeColor: 'text-green-700 bg-green-100 border-green-400',
        count: counts.approved,
      },
      {
        key: 'rejected',
        label: 'Rejected',
        color: 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100',
        activeColor: 'text-red-700 bg-red-100 border-red-400',
        count: counts.rejected,
      },
    ];

    return (
      <div className="flex items-center flex-wrap gap-2 mb-4">
        <Filter className="w-4 h-4 text-gray-400" />
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
              current === f.key ? f.activeColor + ' ring-1 ring-offset-1' : f.color
            )}
          >
            {f.label}
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1',
                current === f.key ? 'bg-white/60' : 'bg-white/80'
              )}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-3 text-fg-muted">Loading submissions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
        style={{
          background: `linear-gradient(135deg, ${branding?.primaryColor || '#4f46e5'}, ${branding?.secondaryColor || '#ec4899'})`,
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Award className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">
                My Submissions
              </h1>
              <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                Track the status of your submitted courses and certificate templates
              </p>
            </div>
          </div>
          <button
            onClick={loadSubmissions}
            className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/20 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline font-medium">Refresh</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button
            onClick={loadSubmissions}
            className="text-sm font-medium text-red-700 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{courses.length + certificates.length}</p>
          <p className="text-sm text-gray-500">Total Submissions</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm">
          <p className="text-2xl font-bold text-amber-600">
            {courseCounts.pending + certCounts.pending}
          </p>
          <p className="text-sm text-gray-500">Pending / Resubmitted</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
          <p className="text-2xl font-bold text-green-600">
            {courseCounts.approved + certCounts.approved}
          </p>
          <p className="text-sm text-gray-500">Approved</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
          <p className="text-2xl font-bold text-red-600">
            {courseCounts.rejected + certCounts.rejected}
          </p>
          <p className="text-sm text-gray-500">Rejected</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('courses')}
          className={cn(
            'flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'courses'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <BookOpen className="w-4 h-4" />
          Courses ({courses.length})
        </button>
        <button
          onClick={() => setActiveTab('certificates')}
          className={cn(
            'flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'certificates'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <Award className="w-4 h-4" />
          Certificates ({certificates.length})
        </button>
      </div>

      {/* Courses Tab */}
      {activeTab === 'courses' && (
        <div>
          <StatusFilterBar
            current={courseStatusFilter}
            onChange={setCourseStatusFilter}
            counts={courseCounts}
          />

          {filteredCourses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              {courseStatusFilter === 'all' && courses.length === 0 ? (
                <>
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">You haven&apos;t submitted any courses yet</p>
                  <button
                    onClick={() => router.push('/create-course')}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                  >
                    Create Your First Course
                  </button>
                </>
              ) : (
                <>
                  <Filter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No {courseStatusFilter} courses found</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCourses.map(course => (
                <div
                  key={course._id}
                  className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <h3
                          className="text-lg font-semibold text-gray-900 truncate"
                          title={course.title}
                        >
                          {course.title}
                        </h3>
                        {getCourseStatusBadge(course.status)}
                        {course.parentCourseId && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
                            Update Request
                          </span>
                        )}
                        {course.status === 'Published' && pendingUpdateParentIds.has(course._id) && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                            Pending Update Approval
                          </span>
                        )}
                      </div>
                      {course.description && (
                        <ReadMoreText
                          text={course.description}
                          maxLines={2}
                          className="text-sm text-gray-600 mb-2"
                        />
                      )}
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                        {course.category && <span>Category: {course.category}</span>}
                        {course.level && <span>Level: {course.level}</span>}
                        <span>Submitted: {new Date(course.createdAt).toLocaleDateString()}</span>
                        {course.updatedAt !== course.createdAt && (
                          <span>Updated: {new Date(course.updatedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      {!course.parentCourseId && course.status !== 'Published' && (
                        <button
                          onClick={() => router.push(`/create-course?courseId=${course._id}`)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setDeleteError(null);
                          setCourseToDelete(course);
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 text-sm font-medium transition-colors"
                        title="Delete course"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {course.status === 'RejectedByTenantAdmin' && course.tenantRejectionReason && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-700">
                        <strong>Tenant Admin Rejection:</strong> {course.tenantRejectionReason}
                      </p>
                    </div>
                  )}
                  {course.status === 'Rejected' && course.rejectionReason && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-700">
                        <strong>Super Admin Rejection:</strong> {course.rejectionReason}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Certificates Tab */}
      {activeTab === 'certificates' && (
        <div>
          <StatusFilterBar
            current={certStatusFilter}
            onChange={setCertStatusFilter}
            counts={certCounts}
          />

          {filteredCertificates.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              {certStatusFilter === 'all' && certificates.length === 0 ? (
                <>
                  <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">
                    You haven&apos;t submitted any certificate templates yet
                  </p>
                  <button
                    onClick={() => router.push('/certificate-templates')}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                  >
                    Create Your First Template
                  </button>
                </>
              ) : (
                <>
                  <Filter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No {certStatusFilter} certificate templates found</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCertificates.map(cert => (
                <div
                  key={cert._id}
                  className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                          <Award className="w-4 h-4 text-amber-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">{cert.name}</h3>
                        {getCertStatusBadge(normalizeCertStatus(cert))}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-1 ml-11">
                        {cert.submittedByTenantId ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                            Submitted by you
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            Assigned by Admin
                          </span>
                        )}
                        {cert.signatoryName && (
                          <span>
                            Signatory: <strong className="text-gray-700">{cert.signatoryName}</strong>
                          </span>
                        )}
                        {cert.designation && (
                          <span>
                            Designation: <strong className="text-gray-700">{cert.designation}</strong>
                          </span>
                        )}
                        <span>Created: {new Date(cert.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      {cert.backgroundImageUrl && (
                        <div className="w-24 h-16 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                          <img
                            src={cert.backgroundImageUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <button
                        onClick={() => setPreviewCertificate(cert)}
                        className="flex items-center gap-1 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 text-sm font-medium transition-colors"
                      >
                        <Eye className="w-4 h-4" /> Preview
                      </button>
                      {cert.approvalStatus === 'rejected' && cert.submittedByTenantId && (
                        <button
                          onClick={() => router.push('/certificate-templates')}
                          className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                        >
                          <Edit className="w-4 h-4" />
                          Edit &amp; Resubmit
                        </button>
                      )}
                    </div>
                  </div>

                  {cert.approvalStatus === 'rejected' && cert.rejectionReason && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 ml-11">
                      <p className="text-sm text-red-700">
                        <strong>Rejection Reason:</strong> {cert.rejectionReason}
                      </p>
                    </div>
                  )}

                  {cert.approvalStatus === 'pending_approval' && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 ml-11">
                      <p className="text-sm text-amber-700">
                        This template is awaiting approval from Super Admin. You will be notified once reviewed.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Course Confirmation */}
      <DeleteConfirmationModal
        isOpen={!!courseToDelete}
        onClose={() => {
          if (isDeleting) return;
          setCourseToDelete(null);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteCourse}
        title="Delete Course"
        message="Are you sure you want to delete this course? This will permanently remove the course and all its modules, sub-modules, and resources."
        itemName={courseToDelete?.title}
        isLoading={isDeleting}
      />
      {deleteError && courseToDelete && (
        <div className="fixed bottom-6 right-6 z-[60] bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg flex items-center gap-2 max-w-sm">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{deleteError}</p>
        </div>
      )}

      {/* Certificate Preview Modal */}
      {previewCertificate && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewCertificate(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Template Name</p>
                  <p className="text-sm font-semibold text-gray-900">{previewCertificate.name}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Status</p>
                  {getCertStatusBadge(normalizeCertStatus(previewCertificate))}
                </div>
                {previewCertificate.signatoryName && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Signatory Name</p>
                    <p className="text-sm font-semibold text-gray-900">{previewCertificate.signatoryName}</p>
                  </div>
                )}
                {previewCertificate.designation && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Designation</p>
                    <p className="text-sm font-semibold text-gray-900">{previewCertificate.designation}</p>
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
                {previewCertificate.logoImageUrl && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">Logo</p>
                    <img
                      src={previewCertificate.logoImageUrl}
                      alt="Logo"
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
  );
}
