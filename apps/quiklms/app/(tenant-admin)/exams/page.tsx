'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { ClipboardList, Plus, Eye, BarChart3, CheckCircle, AlertTriangle, Send, Clock, ArrowLeft } from 'lucide-react';

interface ExamItem {
  _id: string;
  title: string;
  subject?: string;
  duration: number;
  totalMarks: number;
  status: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  proctoringLevel: string;
  batchId?: { _id: string; name: string; grade?: string };
  createdBy?: { firstName: string; lastName: string };
  questions: any[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  published: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  results_published: 'bg-emerald-100 text-emerald-700',
};

export default function ExamListPage() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const { branding } = useBranding();
  const router = useRouter();

  useEffect(() => { fetchExams(); }, [filterStatus]);

  const fetchExams = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterStatus) params.status = filterStatus;
      const res = await api.get<any>('/exams', { params });
      setExams(res.data || []);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const handlePublish = async (id: string) => {
    if (!confirm('Publish this exam? Students will be able to see it.')) return;
    try { await api.post<any>(`/exams/${id}/publish`); fetchExams(); } catch (e: any) { alert(e?.message || 'Failed'); }
  };

  const handlePublishResults = async (id: string) => {
    if (!confirm('Publish results? Students and parents will be notified.')) return;
    try { await api.post<any>(`/exams/${id}/publish-results`); fetchExams(); } catch (e: any) { alert(e?.message || 'Failed'); }
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 pt-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
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
              <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Exams</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Create and manage proctored exams</p>
            </div>
          </div>
          <button onClick={() => router.push('/exams/create')} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all duration-200 border border-white/30 text-sm sm:text-base">
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" /> Create Exam
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {['', 'draft', 'published', 'active', 'completed', 'results_published'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s ? s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : exams.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No exams yet</p>
          <button onClick={() => router.push('/exams/create')} className="mt-3 text-indigo-600 font-medium">Create your first exam</button>
        </div>
      ) : (
        <div className="grid gap-4">
          {exams.map(exam => (
            <div key={exam._id} className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{exam.title}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[exam.status] || 'bg-gray-100 text-gray-600'}`}>
                      {exam.status.replace('_', ' ')}
                    </span>
                    {exam.proctoringLevel === 'soft' && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Proctored
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                    {exam.subject && <span>Subject: {exam.subject}</span>}
                    {exam.batchId && <span>Batch: {exam.batchId.name}</span>}
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {exam.duration} min</span>
                    <span>Marks: {exam.totalMarks}</span>
                    <span>Questions: {exam.questions?.length || 0}</span>
                    {exam.scheduledStartTime && <span>Scheduled: {new Date(exam.scheduledStartTime).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-0 sm:ml-4">
                  <button onClick={() => router.push(`/exams/create?id=${exam._id}`)} className="p-2 hover:bg-gray-100 rounded-lg" title="View/Edit"><Eye className="w-4 h-4 text-gray-500" /></button>
                  {exam.status === 'draft' && (
                    <button onClick={() => handlePublish(exam._id)} className="p-2 hover:bg-blue-100 rounded-lg" title="Publish"><Send className="w-4 h-4 text-blue-600" /></button>
                  )}
                  {(exam.status === 'completed' || exam.status === 'active') && (
                    <button onClick={() => handlePublishResults(exam._id)} className="p-2 hover:bg-green-100 rounded-lg" title="Publish Results"><CheckCircle className="w-4 h-4 text-green-600" /></button>
                  )}
                  {exam.status !== 'draft' && (
                    <>
                      <button onClick={() => router.push(`/exams/${exam._id}/evaluate`)} className="p-2 hover:bg-purple-100 rounded-lg" title="Evaluate"><ClipboardList className="w-4 h-4 text-purple-600" /></button>
                      <button onClick={() => router.push(`/exams/${exam._id}/incidents`)} className="p-2 hover:bg-amber-100 rounded-lg" title="Incidents"><AlertTriangle className="w-4 h-4 text-amber-600" /></button>
                      <button onClick={() => router.push(`/exams/${exam._id}/analytics`)} className="p-2 hover:bg-indigo-100 rounded-lg" title="Analytics"><BarChart3 className="w-4 h-4 text-indigo-600" /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
