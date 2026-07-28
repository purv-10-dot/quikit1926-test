'use client';

import { useMemo, useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Award, Download, Copy, CheckCircle, Calendar,
  ExternalLink, Share2, Trophy, FileText, AlertCircle, X, RefreshCw
} from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { useFeatures } from '@/app/providers';
import { useCurrentUser } from '@/app/providers';
import toast, { Toaster } from 'react-hot-toast';


// ─── Error Boundary ───────────────────────────────────────────────────────────
class CertificatesErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CertificatesPage] Render error caught by boundary:', error, errorInfo);
    try {
      api.post<any>('/logs/client-error', {
        page: 'learner-certificates',
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      }).catch(() => { /* silent */ });
    } catch {
      // ignore logging failure
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] flex items-center justify-center relative overflow-hidden">
          <div className="text-center p-8 bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 max-w-md">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Something went wrong</h2>
            <p className="text-gray-400 mb-4">
              {this.state.error?.message || 'An error occurred while loading certificates'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2 rounded-xl transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <button
                onClick={() => { window.location.href = '/learner/dashboard'; }}
                className="bg-gray-700 hover:bg-gray-600 text-white font-medium px-6 py-2 rounded-xl transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Certificate {
  _id: string;
  courseId: {
    _id: string;
    title: string;
    description?: string;
  } | null;
  certificateId: string;
  issuedAt: string;
  pdfUrl?: string;
  verificationUrl?: string;
  thumbnail?: string;
  score?: number;
  passingScore?: number;
  passed?: boolean;
}

type MonthFilter = 'all' | `${number}-${string}`;

const toMonthKey = (d: Date): `${number}-${string}` => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}` as const;
};

const parseDateInput = (value: string | null | undefined, endOfDay: boolean): Date | null => {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
};

const isCertificateLocked = (certificate: Certificate): boolean => {
  if (certificate.passed === false) return true;
  if (
    typeof certificate.score === 'number' &&
    typeof certificate.passingScore === 'number' &&
    certificate.score < certificate.passingScore
  ) {
    return true;
  }
  return false;
};

// ─── Main Component ───────────────────────────────────────────────────────────
const CertificatesPage = () => {
  const { branding } = useBranding();
  const { features, loaded } = useFeatures();
  void features;
  void loaded;
  const isCorporate = true;
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useCurrentUser();

  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<MonthFilter>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  useEffect(() => {
    loadCertificates();
  }, []);

  // Initialize filter from querystring, e.g. /learner/certificates?month=2026-04
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = new URLSearchParams(window.location.search);
    const m = qs.get('month');
    const start = qs.get('start');
    const end = qs.get('end');
    if (!m) return;
    if (/^\d{4}-\d{2}$/.test(m)) setMonthFilter(m as MonthFilter);
    if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) setFromDate(start);
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) setToDate(end);
  }, [pathname]);

  const loadCertificates = async () => {
    setLoading(true);
    setError(null);

    if (user && !user.orgId) {
      console.warn('[CertificatesPage] User missing orgId — may not be assigned to an organization');
    }

    try {
      // Trigger generation of any missing certificates before fetching
      try {
        await api.post<any>('/progress/generate-missing-certificates', {});
      } catch {
        console.warn('[CertificatesPage] generate-missing-certificates call failed (non-fatal)');
      }

      console.log('[CertificatesPage] Fetching certificates...');
      const response = await api.get<any>('/certificates/my-certificates');
      console.log('[CertificatesPage] API response:', {
        status: response.status,
        dataType: typeof response.data,
        hasData: !!response.data?.data,
        count: Array.isArray(response.data?.data) ? response.data.data.length : 'not-array',
      });

      let certsData = response.data?.data ?? response.data ?? [];
      if (!Array.isArray(certsData)) {
        console.warn('[CertificatesPage] API returned non-array data:', certsData);
        certsData = [];
      }

      const validCerts = certsData.map((cert: any) => ({
        ...cert,
        courseId: cert.courseId && typeof cert.courseId === 'object' && cert.courseId._id
          ? {
            ...cert.courseId,
            title: cert.courseId.title || cert.courseName || 'Course',
          }
          : cert.courseId
            ? { _id: String(cert.courseId), title: cert.courseName || 'Course' }
            : cert.courseName
              ? { _id: '', title: cert.courseName }
              : null,
      }));

      console.log('[CertificatesPage] Valid certificates loaded:', validCerts.length);
      setCertificates(validCerts);
    } catch (err: any) {
      console.error('[CertificatesPage] Failed to load certificates:', {
        message: err.message,
        status: err?.statusCode,
        data: err,
      });

      if (err?.statusCode === 401) {
        setError('Session expired. Please login again.');
        sessionStorage.removeItem('user');
        setTimeout(() => router.push('/login'), 2000);
        return;
      }

      if (err?.statusCode === 403) {
        setError('You do not have permission to view certificates. Please contact your administrator.');
      } else if (err?.code === 'ERR_NETWORK' || err?.message?.includes('Network Error')) {
        setError('Unable to connect to server. Please check your internet connection.');
      } else {
        setError(err?.message || 'Failed to load certificates. Please try again.');
      }

      setCertificates([]);
    } finally {
      setLoading(false);
    }
  };

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    certificates.forEach(c => {
      if (!c?.issuedAt) return;
      const d = new Date(c.issuedAt);
      if (Number.isNaN(d.getTime())) return;
      keys.add(toMonthKey(d));
    });
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [certificates]);

  const filteredCertificates = useMemo(() => {
    const from = parseDateInput(fromDate, false);
    const to = parseDateInput(toDate, true);
    if (from || to) {
      return certificates.filter(c => {
        if (!c?.issuedAt) return false;
        const issued = new Date(c.issuedAt);
        if (Number.isNaN(issued.getTime())) return false;
        if (from && issued < from) return false;
        if (to && issued > to) return false;
        return true;
      });
    }

    if (monthFilter === 'all') return certificates;
    return certificates.filter(c => {
      if (!c?.issuedAt) return false;
      const d = new Date(c.issuedAt);
      if (Number.isNaN(d.getTime())) return false;
      return toMonthKey(d) === monthFilter;
    });
  }, [certificates, fromDate, toDate, monthFilter]);

  const handleDownload = async (certificate: Certificate) => {
    if (!certificate?._id) {
      console.error('[CertificatesPage] Download failed — certificate has no _id');
      toast.error('Certificate data is incomplete. Please try again later.');
      return;
    }

    setDownloading(prev => ({ ...prev, [certificate._id]: true }));

    try {
      const courseName = certificate.courseId?.title || 'Certificate';
      const filename = `${courseName.replace(/[^a-zA-Z0-9\s-]/g, '')}_Certificate.pdf`;

      console.log('[CertificatesPage] Downloading certificate via direct endpoint:', certificate._id);

      // Use raw fetch for blob download (not api.get)
      const r = await fetch(`/api/certificates/${certificate._id}/download`, { credentials: 'include' });
      const blob = await r.blob();

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      toast.success(`Downloading certificate for ${courseName}...`);

      // Track download (fire-and-forget)
      api.post<any>('/certificates/track-download', {
        certificateId: certificate.certificateId,
        courseId: certificate.courseId?._id,
        format: 'pdf',
      }).catch(() => { /* silent */ });

    } catch (err: any) {
      console.error('[CertificatesPage] Download failed:', err);
      toast.error('Failed to download certificate. Please try again.');
    } finally {
      setDownloading(prev => ({ ...prev, [certificate._id]: false }));
    }
  };

  const handleCopyVerificationLink = async (certificate: Certificate) => {
    const verificationUrl = certificate.verificationUrl ||
      `${window.location.origin}/verify-certificate/${certificate.certificateId}`;

    try {
      await navigator.clipboard.writeText(verificationUrl);
      setCopiedId(certificate._id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = verificationUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedId(certificate._id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleShareLinkedIn = (certificate: Certificate) => {
    const verificationUrl = certificate.verificationUrl ||
      `${window.location.origin}/verify-certificate/${certificate.certificateId}`;

    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verificationUrl)}`;
    window.open(linkedInUrl, '_blank');
  };

  // ── Loading State ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>
        <div className="text-center relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading certificates...</p>
        </div>
      </div>
    );
  }

  // ── Error State (full-page error card instead of blank screen) ──────────────
  if (error && certificates.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl"></div>
        </div>
        <div className="text-center p-8 bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 max-w-md">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Certificates</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setError(null);
                loadCertificates();
              }}
              className="px-6 py-2 rounded-xl text-white font-medium flex items-center gap-2 transition-transform hover:scale-105"
              style={{ backgroundColor: branding.primaryColor }}
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <button
              onClick={() => router.push('/learner/dashboard')}
              className="bg-gray-700 hover:bg-gray-600 text-white font-medium px-6 py-2 rounded-xl transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-white text-gray-900 relative rounded-xl overflow-hidden">
      <Toaster position="top-right" />

      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
        {/* Premium Branded Header */}
        <div
          className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500"
          style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}
          ></div>
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 backdrop-blur-md p-3 rounded-2xl border border-white/30">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
                  Certificates &amp; Achievements
                </h1>
                <p className="opacity-90 text-sm sm:text-base lg:text-lg font-light">
                  Your learning accomplishments
                </p>
              </div>
            </div>
            <button
              onClick={() => loadCertificates()}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 rounded-xl transition-all duration-300 text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2 text-gray-500">
              <Calendar className="w-5 h-5" />
              <span className="text-sm font-medium">Filter by date</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-opacity-40"
                style={{ '--tw-ring-color': branding.primaryColor } as any}
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-opacity-40"
                style={{ '--tw-ring-color': branding.primaryColor } as any}
              />
            </div>
          </div>

          {(fromDate || toDate || monthFilter !== 'all') && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); setMonthFilter('all'); }}
              className="text-sm font-semibold text-gray-500 hover:text-gray-700 underline underline-offset-4"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Non-blocking error banner (when we have data but also an error) */}
        {error && certificates.length > 0 && (
          <div className="mb-6 bg-amber-600/20 border border-amber-500/30 rounded-xl p-4 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-amber-300">
              <AlertCircle className="w-5 h-5" />
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {certificates.length === 0 ? (
          <div className="bg-white/50 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-2xl p-12 text-center">
            <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Certificates Yet</h3>
            <p className="text-gray-600 mb-6">
              Complete courses and pass assessments to earn certificates.
            </p>
            <button
              onClick={() => router.push('/learner/dashboard')}
              className="text-white font-medium px-8 py-3 rounded-xl shadow-lg transition-all duration-300 hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
            >
              Browse Courses
            </button>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="mb-8">
              <div
                className="rounded-2xl shadow-xl p-6 text-white overflow-hidden relative"
                style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
              >
                <div className="absolute top-0 right-0 p-8 transform translate-x-4 -translate-y-4 opacity-20">
                  <Award className="w-32 h-32" />
                </div>
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="opacity-80 text-sm mb-1 uppercase tracking-wider font-semibold">
                      {monthFilter === 'all' ? 'Total Certificates' : 'Certificates (filtered)'}
                    </p>
                    <p className="text-4xl sm:text-5xl font-black">
                      {monthFilter === 'all' ? certificates.length : filteredCertificates.length}
                      {monthFilter === 'all' ? null : (
                        <span className="text-xl font-medium opacity-60 ml-3">
                          / {certificates.length}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Certificate Gallery */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Certificates</h2>
              {filteredCertificates.length === 0 && monthFilter !== 'all' && (
                <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5 text-gray-700">
                  No certificates found for this month.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                {filteredCertificates?.map((certificate) => {
                  if (!certificate?._id) return null;

                  const courseTitle = certificate.courseId?.title || (certificate as any).courseName || 'Course';

                  return (
                    <div
                      key={certificate._id}
                      className="bg-white backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-300 hover:shadow-[0_0_40px_rgba(251,191,36,0.3)] hover:-translate-y-1 transition-all duration-300 overflow-hidden group"
                    >
                      {/* Certificate Thumbnail/Preview */}
                      <div className="relative h-48 bg-gray-200 flex items-center justify-center">
                        {certificate.thumbnail ? (
                          <img
                            src={certificate.thumbnail}
                            alt={courseTitle}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="text-center">
                            <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-2" />
                            <p className="text-xs text-yellow-500 font-medium opacity-100 z-10">Certificate</p>
                          </div>
                        )}
                        <div className="absolute top-4 right-4 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                          <CheckCircle className="text-gray-900 w-3 h-3" />
                          <span className="text-xs text-gray-900 font-medium opacity-100 z-10">Verified</span>
                        </div>
                      </div>

                      {/* Certificate Info */}
                      <div className="p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2" title={courseTitle}>
                          {courseTitle}
                        </h3>

                        <div className="space-y-2 mb-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span>
                              Earned: {certificate.issuedAt
                                ? new Date(certificate.issuedAt).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })
                                : 'Date unavailable'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FileText className="w-4 h-4" />
                            <span className="font-mono text-xs">ID: {certificate.certificateId || 'N/A'}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2 pt-4 border-t border-gray-200">
                          {(() => {
                            const locked = isCorporate && isCertificateLocked(certificate);
                            const downloadDisabled = downloading[certificate._id] || locked;
                            return (
                              <>
                                <button
                                  onClick={() => !locked && handleDownload(certificate)}
                                  disabled={downloadDisabled}
                                  className={`w-full text-white font-medium px-4 py-3 rounded-xl shadow-lg transition-all duration-300 flex items-center justify-center gap-2 ${locked ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'}`}
                                  style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
                                >
                                  {downloading[certificate._id] ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                      Downloading...
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-4 h-4" />
                                      Download PDF
                                    </>
                                  )}
                                </button>
                                {locked && (
                                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>You need to meet the passing criteria to download the certificate.</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleCopyVerificationLink(certificate)}
                              className={`bg-white border border-gray-200 shadow-md hover:bg-white/20 text-gray-900 font-medium px-3 py-2 rounded-xl transition-all duration-300 text-sm flex items-center justify-center gap-2 ${copiedId === certificate._id ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-white/20'
                                }`}
                            >
                              {copiedId === certificate._id ? (
                                <>
                                  <CheckCircle className="w-4 h-4" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4" />
                                  Copy Link
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handleShareLinkedIn(certificate)}
                              className="bg-white border border-gray-200 shadow-md hover:bg-white/20 text-gray-900 font-medium px-3 py-2 rounded-xl transition-all duration-300 text-sm flex items-center justify-center gap-2"
                            >
                              <Share2 className="w-4 h-4" />
                              Share
                            </button>
                          </div>

                          {certificate.verificationUrl && (
                            <a
                              href={certificate.verificationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full bg-white border border-gray-200 shadow-md hover:bg-white/20 text-gray-900 font-medium px-4 py-2 rounded-xl transition-all duration-300 text-sm flex items-center justify-center gap-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Verify Certificate
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Wrap with Error Boundary ──────────────────────────────────────────────────
const CertificatesPageWithErrorBoundary = () => (
  <CertificatesErrorBoundary>
    <CertificatesPage />
  </CertificatesErrorBoundary>
);

export default CertificatesPageWithErrorBoundary;
