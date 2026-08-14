'use client';

import { useState, useEffect } from 'react';
import { Award, Download, CheckCircle, Calendar, X, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadCertificatePdf, certificateFilename } from '@/lib/certificate-download';
import ReadMoreText from '@/components/ReadMoreText';
import toast, { Toaster } from 'react-hot-toast';

interface Certificate {
  _id: string;
  certificateId: string;
  courseId: {
    _id: string;
    title: string;
    description?: string;
  } | null;
  courseTitle: string;
  courseDescription: string;
  issuedAt: string;
  pdfUrl?: string;
  verificationUrl?: string;
  templateName?: string;
}

const CertificatesPage = () => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

  const loadCertificates = async () => {
    setError(null);
    try {
      const response = await api.get<any>('/certificates/my-certificates');
      const data = response.data.data || response.data || [];

      const mapped: Certificate[] = data.map((cert: any) => {
        const courseId = cert.courseId && typeof cert.courseId === 'object' && cert.courseId._id
          ? {
              ...cert.courseId,
              title: cert.courseId.title || cert.courseName || 'Course',
            }
          : cert.courseId
            ? { _id: String(cert.courseId), title: cert.courseName || 'Course' }
            : cert.courseName
              ? { _id: '', title: cert.courseName }
              : null;

        return {
          _id: cert._id?.toString() || '',
          certificateId: cert.certificateId || '',
          courseId,
          courseTitle: courseId?.title || cert.courseName || 'Course',
          courseDescription: courseId?.description || '',
          issuedAt: cert.issuedAt || cert.createdAt || '',
          pdfUrl: cert.pdfUrl || '',
          verificationUrl: cert.verificationUrl || '',
          templateName: cert.certificateTemplateId?.name || '',
        };
      });

      setCertificates(mapped);
    } catch (err: any) {
      console.error('Failed to load certificates:', err);
      setError(err?.message || 'Failed to load certificates. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCertificates();
  }, []);

  const handleDownload = async (certificate: Certificate) => {
    if (!certificate?._id) {
      console.error('[CertificatesPage] Download failed — certificate has no _id');
      toast.error('Certificate data is incomplete. Please try again later.');
      return;
    }

    setDownloading(prev => ({ ...prev, [certificate._id]: true }));

    try {
      const courseName = certificate.courseTitle || 'Certificate';

      // Throws (with the server's own message) rather than saving an error body
      // as a .pdf — see lib/certificate-download.ts.
      await downloadCertificatePdf(certificate._id, certificateFilename(courseName));

      toast.success(`Downloading certificate for ${courseName}...`);

      api.post<any>('/certificates/track-download', {
        certificateId: certificate.certificateId,
        courseId: certificate.courseId?._id,
        format: 'pdf',
      }).catch(() => { /* silent */ });

    } catch (err: unknown) {
      console.error('[CertificatesPage] Download failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to download certificate. Please try again.');
    } finally {
      setDownloading(prev => ({ ...prev, [certificate._id]: false }));
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-56" />
        <div className="h-4 bg-gray-100 rounded w-72" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Toaster />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Certificates</h1>
          <p className="text-gray-500 mt-1">Your earned certificates and achievements</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Something went wrong</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => { setLoading(true); loadCertificates(); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Certificates</h1>
          <p className="text-gray-500 mt-1">Your earned certificates and achievements</p>
        </div>
        <button
          onClick={() => { setLoading(true); loadCertificates(); }}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {certificates.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-amber-50 rounded-2xl flex items-center justify-center">
            <Award className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Certificates Yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Complete courses to earn certificates. Your certificates will appear here once issued.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {certificates.map((certificate) => (
            <div
              key={certificate._id || certificate.certificateId}
              className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="w-6 h-6 text-amber-500 flex-shrink-0" />
                    <h3 className="text-lg font-semibold text-gray-900 truncate" title={certificate.courseTitle}>{certificate.courseTitle}</h3>
                  </div>
                  {certificate.courseDescription && (
                    <ReadMoreText text={certificate.courseDescription} maxLines={2} className="text-sm text-gray-600 mb-3" />
                  )}
                </div>
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 ml-2" />
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span>Issued: {certificate.issuedAt ? new Date(certificate.issuedAt).toLocaleDateString() : 'N/A'}</span>
                </div>
                {certificate.templateName && (
                  <div className="text-xs text-gray-400">
                    Template: {certificate.templateName}
                  </div>
                )}
                {certificate.certificateId && (
                  <div className="text-xs text-gray-400 font-mono">
                    ID: {certificate.certificateId}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload(certificate)}
                  disabled={downloading[certificate._id]}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading[certificate._id] ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download
                    </>
                  )}
                </button>
                {certificate.verificationUrl && (
                  <a
                    href={certificate.verificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-3 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                    title="Verify Certificate"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CertificatesPage;
