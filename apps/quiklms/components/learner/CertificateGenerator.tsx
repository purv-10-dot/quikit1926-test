'use client';
/**
 * CertificateGenerator — ported from the old QuikSkills frontend
 * (QuikSkillsfrontend/src/components/learner/CertificateGenerator.tsx).
 *
 * Replaces the previous "coming soon" stub. Renders a printable certificate of
 * completion and offers four actions:
 *   1. Download PDF   — html2canvas snapshot → jsPDF landscape/mm/a4 page.
 *   2. Download Image — html2canvas snapshot → PNG blob → anchor download.
 *   3. Share on LinkedIn — opens the share-offsite popup for the verification URL.
 *   4. Copy Verification URL — writes the verify link to the clipboard.
 *
 * Both download paths best-effort report to POST /api/certificates/track-download
 * when a courseId is supplied; tracking failures are swallowed (console only).
 */
import React, { useRef, useState } from 'react';
// FORCED DEVIATION — the LinkedIn share button's icon. The source imported
// lucide-react's `Linkedin` brand icon, but this app is on lucide-react 1.x,
// which dropped the brand icons entirely (the reference app was on 0.294). There
// is no equivalent, so the button reuses the generic `Share2` glyph already
// imported here. Its "Share on LinkedIn" LABEL is unchanged, so the destination
// is still named to the user — only the pictogram differs. Same substitution as
// `VideoPlayer`'s YouTube badge.
import { Download, Share2, FileText, Image as ImageIcon, CheckCircle, Loader2, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { api } from '@/lib/api';

interface CertificateGeneratorProps {
  learnerName: string;
  courseName: string;
  completionDate: string;
  score?: number;
  certificateId: string;
  courseId?: string;
  onClose?: () => void;
}

const CertificateGenerator: React.FC<CertificateGeneratorProps> = ({
  learnerName,
  courseName,
  completionDate,
  score,
  certificateId,
  courseId,
  onClose,
}) => {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const generatePDF = async () => {
    if (!certificateRef.current) return;

    setDownloadingPDF(true);
    setError(null);
    setSuccess(null);

    try {
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('landscape', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 0;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`${courseName.replace(/[^a-z0-9]/gi, '_')}_Certificate_${certificateId}.pdf`);

      setSuccess('Certificate downloaded as PDF!');
      setTimeout(() => setSuccess(null), 3000);

      // Track download in backend if courseId provided
      if (courseId) {
        try {
          await api.post('/certificates/track-download', {
            certificateId,
            courseId,
            format: 'pdf',
          });
        } catch (err) {
          console.error('Failed to track download:', err);
        }
      }
    } catch (err: unknown) {
      console.error('Failed to generate PDF:', err);
      setError('Failed to generate PDF. Please try again.');
      setTimeout(() => setError(null), 5000);
    } finally {
      setDownloadingPDF(false);
    }
  };

  const generateImage = async () => {
    if (!certificateRef.current) return;

    setDownloadingImage(true);
    setError(null);
    setSuccess(null);

    try {
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      canvas.toBlob((blob) => {
        if (!blob) {
          setError('Failed to generate image. Please try again.');
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${courseName.replace(/[^a-z0-9]/gi, '_')}_Certificate_${certificateId}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setSuccess('Certificate downloaded as Image!');
        setTimeout(() => setSuccess(null), 3000);

        // Track download in backend if courseId provided
        if (courseId) {
          api.post('/certificates/track-download', {
            certificateId,
            courseId,
            format: 'image',
          }).catch((err) => console.error('Failed to track download:', err));
        }
      }, 'image/png');
    } catch (err: unknown) {
      console.error('Failed to generate image:', err);
      setError('Failed to generate image. Please try again.');
      setTimeout(() => setError(null), 5000);
    } finally {
      setDownloadingImage(false);
    }
  };

  const shareOnLinkedIn = () => {
    const verificationUrl = `${window.location.origin}/verify-certificate/${certificateId}`;
    const shareText = `I just completed the course "${courseName}"! ${score ? `Score: ${score}%` : ''}`;
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verificationUrl)}&summary=${encodeURIComponent(shareText)}`;
    window.open(linkedInUrl, '_blank', 'width=600,height=400');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Certificate of Completion</h1>
              <p className="text-gray-600 dark:text-gray-400">Your achievement certificate is ready to download or share</p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="mt-4 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              <span>{success}</span>
            </div>
          )}
          {error && (
            <div className="mt-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg flex items-center gap-2">
              <X className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 flex flex-wrap gap-4">
            <button
              onClick={generatePDF}
              disabled={downloadingPDF || downloadingImage}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloadingPDF ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  Download PDF
                </>
              )}
            </button>

            <button
              onClick={generateImage}
              disabled={downloadingPDF || downloadingImage}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloadingImage ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Image...
                </>
              ) : (
                <>
                  <ImageIcon className="w-5 h-5" />
                  Download Image
                </>
              )}
            </button>

            <button
              onClick={shareOnLinkedIn}
              className="flex items-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold transition-colors"
            >
              <Share2 className="w-5 h-5" />
              Share on LinkedIn
            </button>

            <button
              onClick={() => {
                const verificationUrl = `${window.location.origin}/verify-certificate/${certificateId}`;
                navigator.clipboard.writeText(verificationUrl);
                setSuccess('Verification URL copied to clipboard!');
                setTimeout(() => setSuccess(null), 3000);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
            >
              <Share2 className="w-5 h-5" />
              Copy Verification URL
            </button>
          </div>
        </div>

        {/* Certificate Preview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8 overflow-auto">
          <div
            ref={certificateRef}
            className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 border-4 border-blue-600 dark:border-blue-500 rounded-lg p-12 max-w-4xl mx-auto"
            style={{
              width: '210mm',
              minHeight: '297mm',
              aspectRatio: '210/297',
            }}
          >
            {/* Certificate Header */}
            <div className="text-center mb-8">
              <div className="text-6xl font-bold text-blue-600 dark:text-blue-400 mb-4">CERTIFICATE</div>
              <div className="text-2xl text-gray-700 dark:text-gray-300 font-semibold">OF COMPLETION</div>
            </div>

            {/* Decorative Line */}
            <div className="border-t-4 border-blue-600 dark:border-blue-500 my-8"></div>

            {/* Certificate Body */}
            <div className="text-center mb-8">
              <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
                This is to certify that
              </p>
              <p className="text-4xl font-bold text-gray-900 dark:text-white mb-6 py-4 border-b-2 border-gray-300 dark:border-gray-600">
                {learnerName}
              </p>
              <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
                has successfully completed the course
              </p>
              <p className="text-3xl font-semibold text-blue-600 dark:text-blue-400 mb-6">
                {courseName}
              </p>
              {score !== undefined && (
                <p className="text-xl text-gray-700 dark:text-gray-300 mb-6">
                  with a score of <span className="font-bold text-green-600 dark:text-green-400">{score}%</span>
                </p>
              )}
              <p className="text-lg text-gray-700 dark:text-gray-300">
                on {formatDate(completionDate)}
              </p>
            </div>

            {/* Decorative Line */}
            <div className="border-t-4 border-blue-600 dark:border-blue-500 my-8"></div>

            {/* Certificate Footer */}
            <div className="mt-12 flex justify-between items-end">
              {/* Signature Left */}
              <div className="text-center flex-1">
                <div className="border-t-2 border-gray-900 dark:border-gray-400 pt-2 w-48 mx-auto mb-2"></div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Instructor Signature</p>
              </div>

              {/* Certificate ID */}
              <div className="text-center flex-1">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Certificate ID</p>
                <p className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400">{certificateId}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                  Verify at: {typeof window !== 'undefined' ? window.location.origin : ''}/verify-certificate/{certificateId}
                </p>
              </div>

              {/* Signature Right */}
              <div className="text-center flex-1">
                <div className="border-t-2 border-gray-900 dark:border-gray-400 pt-2 w-48 mx-auto mb-2"></div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Date</p>
              </div>
            </div>

            {/* QR Code Area (for future implementation) */}
            <div className="mt-8 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-500">
                This certificate can be verified using the Certificate ID above
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export { CertificateGenerator };
export default CertificateGenerator;
