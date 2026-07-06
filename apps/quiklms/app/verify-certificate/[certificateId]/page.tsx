'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader, Download, Share2 } from 'lucide-react';

const VerifyCertificatePage = () => {
  const params = useParams();
  const certificateId = params.certificateId as string;
  const [loading, setLoading] = useState(true);
  const [certificate, setCertificate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (certificateId) {
      verifyCertificate();
    }
  }, [certificateId]);

  const verifyCertificate = async () => {
    try {
      setLoading(true);
      setError(null);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const response = await fetch(`${apiUrl}/verify-certificate/${certificateId}`);
      const data = await response.json();
      if (data.success) {
        setCertificate(data.data);
      } else {
        setError(data.message || 'Certificate not found');
      }
    } catch (err: any) {
      setError(err.message || 'Certificate not found or invalid');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    if (certificate?.pdfUrlPresigned) {
      window.open(certificate.pdfUrlPresigned, '_blank');
    } else if (certificate?.certificateId) {
      window.open(`${apiUrl}/verify-certificate/${certificate.certificateId}/download`, '_blank');
    }
  };

  const handleShare = () => {
    if (certificateId) {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      alert('Certificate verification link copied to clipboard!');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verifying certificate...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Certificate Not Found</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">
            The certificate you're looking for doesn't exist or has been invalidated.
          </p>
        </div>
      </div>
    );
  }

  if (!certificate) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-8 lg:py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 lg:p-8">
          {/* Verification Status */}
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200">
            <CheckCircle className="w-12 h-12 text-green-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Certificate Verified</h1>
              <p className="text-gray-600">This certificate is authentic and valid</p>
            </div>
          </div>

          {/* Certificate Details */}
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Certificate ID</label>
                <p className="text-lg font-semibold text-gray-900">{certificate.certificateId}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Issued Date</label>
                <p className="text-lg font-semibold text-gray-900">
                  {new Date(certificate.issuedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {certificate.learnerId && (
              <div>
                <label className="text-sm font-medium text-gray-500">Learner</label>
                <p className="text-lg font-semibold text-gray-900">
                  {certificate.learnerId.name || certificate.learnerId.email || 'N/A'}
                </p>
              </div>
            )}

            {certificate.courseId && (
              <div>
                <label className="text-sm font-medium text-gray-500">Course</label>
                <p className="text-lg font-semibold text-gray-900">
                  {certificate.courseId.title || 'N/A'}
                </p>
              </div>
            )}

            {certificate.certificateTemplateId && (
              <div>
                <label className="text-sm font-medium text-gray-500">Certificate Template</label>
                <p className="text-lg font-semibold text-gray-900">
                  {certificate.certificateTemplateId.name || 'N/A'}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 sm:gap-4 pt-6 border-t border-gray-200">
            <button
              onClick={handleDownload}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Download Certificate
            </button>
            <button
              onClick={handleShare}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <Share2 className="w-5 h-5" />
              Share Verification Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyCertificatePage;
