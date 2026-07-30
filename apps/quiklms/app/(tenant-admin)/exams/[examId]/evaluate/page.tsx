'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { ArrowLeft, CheckCircle, XCircle, Clock, User, Save, AlertTriangle, Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

interface Submission {
  _id: string;
  studentId?: { _id: string; firstName: string; lastName: string; email: string; studentId?: string; grade?: string };
  status: string;
  score?: number;
  totalPoints?: number;
  percentage?: number;
  passed?: boolean;
  startedAt?: string;
  endedAt?: string;
  answers: Record<string, unknown>;
  assignedQuestions: { questionId: string; order: number }[];
  teacherRemarks?: string;
  proctoringFlags?: { totalFlags: number; severityLevel: string };
}

interface ExamInfo {
  _id: string;
  title: string;
  subject?: string;
  totalMarks: number;
  duration: number;
  questions: { questionId: unknown; points: number; order: number }[];
  status: string;
}

const STATUS_BADGE: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  auto_submitted: 'bg-amber-100 text-amber-700',
  voided: 'bg-red-100 text-red-700',
};

export default function ExamEvaluationPage() {
  const params = useParams();
  const examId = params.examId as string;
  const router = useRouter();
  const { branding } = useBranding();
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [gradeForm, setGradeForm] = useState({ score: 0, teacherRemarks: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [examRes, subsRes] = await Promise.all([
          api.get<any>(`/exams/${examId}`),
          api.get<any>(`/exam-sessions/exam/${examId}/submissions`),
        ]);
        setExam(examRes.data);
        setSubmissions(subsRes.data || []);
      } catch (e: any) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [examId]);

  const openGrade = (sub: Submission) => {
    setSelected(sub);
    setGradeForm({ score: sub.score || 0, teacherRemarks: sub.teacherRemarks || '' });
  };

  const handleGrade = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.patch<any>(`/exam-sessions/${selected._id}/evaluate`, gradeForm);
      const subsRes = await api.get<any>(`/exam-sessions/exam/${examId}/submissions`);
      setSubmissions(subsRes.data || []);
      setSelected(null);
      toast.success('Grade saved successfully');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save grade');
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async (sessionId: string) => {
    if (!confirm('Void this session? The student will receive no score.')) return;
    try {
      await api.post<any>(`/exam-sessions/${sessionId}/void`);
      const subsRes = await api.get<any>(`/exam-sessions/exam/${examId}/submissions`);
      setSubmissions(subsRes.data || []);
      toast.success('Session voided');
    } catch {
      toast.error('Failed to void session');
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading...</div>;
  if (!exam) return <div className="p-6 text-center text-red-500">Exam not found</div>;

  const avgScore =
    submissions.length > 0
      ? Math.round(
          submissions
            .filter(s => s.percentage != null)
            .reduce((a, s) => a + (s.percentage || 0), 0) /
            submissions.filter(s => s.percentage != null).length
        )
      : 0;
  const passCount = submissions.filter(s => s.passed).length;

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <Toaster />
      <button
        onClick={() => router.push('/exams')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 pt-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Exams
      </button>

      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mb-6"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">
                {exam.title} — Evaluation
              </h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">
                {submissions.length} submissions | Avg: {avgScore}% | Passed: {passCount}/{submissions.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-indigo-600">{submissions.length}</p>
          <p className="text-xs text-gray-500">Total Submissions</p>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{passCount}</p>
          <p className="text-xs text-gray-500">Passed</p>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{submissions.length - passCount}</p>
          <p className="text-xs text-gray-500">Failed</p>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{avgScore}%</p>
          <p className="text-xs text-gray-500">Average Score</p>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Student</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Score</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Percentage</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Result</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Flags</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {submissions.map(sub => (
                <tr key={sub._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {sub.studentId?.firstName} {sub.studentId?.lastName}
                        </p>
                        <p className="text-xs text-gray-400">{sub.studentId?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${STATUS_BADGE[sub.status] || 'bg-gray-100 text-gray-600'}`}
                    >
                      {sub.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-medium">
                    {sub.score ?? '—'} / {sub.totalPoints ?? exam.totalMarks}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {sub.percentage != null ? `${sub.percentage}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {sub.passed === true && <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />}
                    {sub.passed === false && <XCircle className="w-5 h-5 text-red-500 mx-auto" />}
                    {sub.passed == null && <Clock className="w-5 h-5 text-gray-400 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(sub.proctoringFlags?.totalFlags || 0) > 0 ? (
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          sub.proctoringFlags?.severityLevel === 'high'
                            ? 'bg-red-100 text-red-700'
                            : sub.proctoringFlags?.severityLevel === 'medium'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {sub.proctoringFlags?.totalFlags} flags
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Clean</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openGrade(sub)}
                        className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200"
                      >
                        Grade
                      </button>
                      {sub.status !== 'voided' && (
                        <button
                          onClick={() => handleVoid(sub._id)}
                          className="px-3 py-1.5 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200"
                        >
                          Void
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {submissions.length === 0 && (
          <div className="text-center py-12 text-gray-500">No submissions yet</div>
        )}
      </div>

      {/* Grading Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-4 sm:p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              Grade: {selected.studentId?.firstName} {selected.studentId?.lastName}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Auto-graded score: {selected.score ?? 0} / {selected.totalPoints ?? exam.totalMarks}
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Final Score</label>
                <input
                  type="number"
                  min={0}
                  max={selected.totalPoints || exam.totalMarks}
                  value={gradeForm.score}
                  onChange={e => setGradeForm({ ...gradeForm, score: parseInt(e.target.value) || 0 })}
                  className="w-full border rounded-lg px-3 py-2"
                />
                <p className="text-xs text-gray-400 mt-1">Max: {selected.totalPoints || exam.totalMarks}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Teacher Remarks</label>
                <textarea
                  value={gradeForm.teacherRemarks}
                  onChange={e => setGradeForm({ ...gradeForm, teacherRemarks: e.target.value })}
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Add remarks for the student..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setSelected(null)} className="px-4 py-2 border rounded-lg text-sm">
                Cancel
              </button>
              <button
                onClick={handleGrade}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Grade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
