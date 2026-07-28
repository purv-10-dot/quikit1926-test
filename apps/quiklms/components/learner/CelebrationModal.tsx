'use client';
/**
 * CelebrationModal — ported from the old QuikSkills frontend
 * (QuikSkillsfrontend/src/components/learner/CelebrationModal.tsx).
 *
 * Course-completion celebration overlay:
 *   1. On mount, fires canvas-confetti from two origins every 250ms for 5s,
 *      with the particle count tapering off as the window closes.
 *   2. "Download Certificate" resolves the certificate's MongoDB _id (from the
 *      issuedCertificateId prop, else by matching certificateId against
 *      GET /api/certificates/my-certificates) and streams the PDF from
 *      GET /api/certificates/:id/download.
 *   3. "Back to Dashboard" closes the modal and routes to /learner/dashboard.
 *
 * The PDF download uses a raw fetch rather than the shared api client: the
 * client JSON-parses every response body and would throw on binary content.
 */
import React, { useEffect, useState } from 'react';
import { Trophy, Download, X, Award, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface CelebrationModalProps {
  certificateId: string;
  courseName: string;
  downloadUrl?: string;
  issuedCertificateId?: string; // MongoDB _id for presigned URL fetch
  scorePercentage?: number; // Weighted score reflecting actual quiz performance
  onClose: () => void;
}

const CelebrationModal: React.FC<CelebrationModalProps> = ({
  certificateId,
  courseName,
  downloadUrl,
  issuedCertificateId,
  scorePercentage,
  onClose,
}) => {
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Launch confetti!
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };

    const interval: ReturnType<typeof setInterval> = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      // since particles fall down, start them a bit higher than average
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Resolve the certificate MongoDB _id — try the prop first, otherwise fetch fresh
      let certId = issuedCertificateId;

      if (!certId) {
        // Fetch fresh from API to get the actual _id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const certsResponse = await api.get<{ data?: any[] }>('/certificates/my-certificates');
        const certs = certsResponse?.data || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const match = certs.find((c: any) => c.certificateId === certificateId);
        certId = match?._id || match?.id;
      }

      if (!certId) {
        alert('Certificate is still being generated. Please try from the Achievement Gallery.');
        return;
      }

      // Exact same approach as Achievement Gallery download button
      // Raw fetch (not the api client) so the PDF comes back as a blob instead
      // of being run through JSON.parse; cookies still travel via credentials.
      const response = await fetch(`/api/certificates/${certId}/download`, {
        credentials: 'include',
      });

      const blob = new Blob([await response.blob()], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${courseName.replace(/[^a-zA-Z0-9\s-]/g, '')}_Certificate.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error('[CelebrationModal] Download failed:', err);
      alert('Failed to download certificate. Please try from the Achievement Gallery.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      <div className="relative bg-gray-900/90 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl p-8 max-w-lg w-full text-center animate-slide-up overflow-hidden">
        {/* Shine Effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 -translate-x-full animate-[shimmer_3s_infinite] pointer-events-none"></div>

        {/* Glow Effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-indigo-500/10 rounded-3xl blur-xl -z-10"></div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500/30 rounded-full blur-xl animate-pulse"></div>
            <div className="relative bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full p-6 shadow-2xl scale-110">
              <Trophy className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-1.5 border-4 border-gray-900">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
          Congratulations!
        </h2>
        <p className="text-indigo-200 text-lg mb-6">
          You&apos;ve successfully completed the course
        </p>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 backdrop-blur-sm relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-violet-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">
            {courseName}
          </h3>
          {certificateId && certificateId !== 'pending' && (
            <p className="text-gray-400 text-sm font-mono">
              Certificate ID: {certificateId}
            </p>
          )}
          {scorePercentage !== undefined && scorePercentage !== null && (
            <p className="text-indigo-300 text-base font-semibold mt-3">
              You have completed this course with a score of {Math.round(scorePercentage)}%.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-200 shadow-lg hover:shadow-indigo-500/25 transform hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Download Certificate
              </>
            )}
          </button>
          <button
            onClick={() => {
              onClose();
              router.push('/learner/dashboard');
            }}
            className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-4 px-6 rounded-2xl border border-white/10 transition-all duration-200 backdrop-blur-sm transform hover:scale-[1.02]"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>
        </div>

        <p className="mt-8 text-gray-500 text-sm">
          A copy of your certificate has been added to your profile.
        </p>

        {/* Decorative Elements */}
        <div className="absolute top-10 left-10 w-2 h-2 bg-indigo-400 rounded-full animate-ping"></div>
        <div className="absolute bottom-10 right-10 w-2 h-2 bg-violet-400 rounded-full animate-ping" style={{animationDelay: '0.5s'}}></div>
        <Award className="absolute -bottom-4 -left-4 w-24 h-24 text-white/5 -rotate-12 pointer-events-none" />
      </div>
    </div>
  );
};

export default CelebrationModal;
