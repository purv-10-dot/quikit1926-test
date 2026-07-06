'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { uploadViaPresign } from '@/lib/upload-client';
import { ClipboardList, CheckCircle, Clock, DollarSign, FileText, X, Loader2, Send } from 'lucide-react';
import { useBranding } from '@/app/providers';

interface Task {
  _id: string;
  assignedBy: { firstName: string; lastName: string } | null;
  title: string;
  description?: string;
  category: string;
  paymentAmount: number;
  status: string;
  dueDate?: string;
  completedAt?: string;
  rejectionReason?: string;
  hoursSpent?: number;
  attachmentUrls?: string[];
  createdAt: string;
}

const statusColors: Record<string, string> = {
  assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed_pending: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export default function TeacherNonTeachingPage() {
  const { branding } = useBranding();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [hoursSpent, setHoursSpent] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setFetchError(null);
    try {
      const res = await api.get<any>('/non-teaching-work/teacher');
      setTasks(res.data || []);
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error('Failed to fetch tasks:', err);
      setFetchError(error?.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  };

  const openCompleteModal = (taskId: string) => {
    setCompletingTaskId(taskId);
    setCompletionNotes('');
    setHoursSpent('');
    setUploadedFiles([]);
    setAttachmentUrl('');
    setSubmitError('');
    setShowCompleteModal(true);
  };

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    setSubmitError('');
    try {
      const fileUrl = await uploadViaPresign(file, '/upload/non-teaching-work-resource');
      if (!fileUrl) throw new Error('No URL returned');
      setUploadedFiles((prev) => [...prev, fileUrl]);
    } catch {
      setSubmitError('File upload failed. Please try again.');
    } finally {
      setUploadingFile(false);
    }
  };

  const submitComplete = async () => {
    if (!completingTaskId) return;
    const allAttachments = [...uploadedFiles, ...(attachmentUrl.trim() ? [attachmentUrl.trim()] : [])];
    try {
      setCompleting(completingTaskId);
      setSubmitError('');
      await api.patch<any>(`/non-teaching-work/${completingTaskId}/complete`, {
        completionNotes: completionNotes || undefined,
        hoursSpent: hoursSpent ? Number(hoursSpent) : undefined,
        attachmentUrls: allAttachments.length > 0 ? allAttachments : undefined,
      });
      setShowCompleteModal(false);
      setCompletingTaskId(null);
      setCompletionNotes('');
      setHoursSpent('');
      setUploadedFiles([]);
      setAttachmentUrl('');
      fetchTasks();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setSubmitError('Error: ' + (error?.message || 'Something went wrong'));
    } finally {
      setCompleting(null);
    }
  };

  const getFileName = (url: string, fallback: string) => {
    try {
      return decodeURIComponent(url.split('/').pop()?.split('?')[0] || fallback);
    } catch {
      return fallback;
    }
  };

  const totalEarned = tasks.filter(t => t.status === 'approved').reduce((s, t) => s + t.paymentAmount, 0);
  const pendingCount = tasks.filter(t => ['assigned', 'in_progress'].includes(t.status)).length;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
            <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">My Non-Teaching Tasks</h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Tasks assigned to you outside of class work</p>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between">
          <span>{fetchError}</span>
          <button onClick={() => { setFetchError(null); fetchTasks(); }} className="text-red-600 hover:text-red-800 font-medium text-xs ml-3">Retry</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-xl">
          <p className="text-sm text-blue-600">Total Tasks</p>
          <p className="text-2xl font-bold text-blue-800">{tasks.length}</p>
        </div>
        <div className="p-4 bg-amber-50 rounded-xl">
          <p className="text-sm text-amber-600">Pending</p>
          <p className="text-2xl font-bold text-amber-800">{pendingCount}</p>
        </div>
        <div className="p-4 bg-green-50 rounded-xl flex items-center gap-2">
          <div>
            <p className="text-sm text-green-600">Total Earned</p>
            <p className="text-2xl font-bold text-green-800">Rs. {totalEarned.toLocaleString()}</p>
          </div>
          <DollarSign className="w-8 h-8 text-green-300 ml-auto" />
        </div>
      </div>

      {/* Tasks */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No tasks assigned yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {tasks.map(task => (
            <div key={task._id} className="bg-white border rounded-2xl shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col h-full">
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-bold text-gray-900 leading-snug">{task.title}</h3>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${statusColors[task.status]}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                </div>
                {task.description && <p className="text-sm text-gray-600 mb-4 line-clamp-3">{task.description}</p>}

                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-xs text-gray-500">
                    <span className="w-20 font-medium">Category:</span>
                    <span className="text-gray-900">{task.category}</span>
                  </div>
                  {task.dueDate && (
                    <div className="flex items-center text-xs text-gray-500">
                      <span className="w-20 font-medium">Due:</span>
                      <span className="text-gray-900">{new Date(task.dueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex items-center text-xs text-gray-500">
                    <span className="w-20 font-medium">Assigned by:</span>
                    <span className="text-gray-900">{task.assignedBy ? `${task.assignedBy.firstName} ${task.assignedBy.lastName}` : 'Admin'}</span>
                  </div>
                  {task.hoursSpent != null && ['completed_pending', 'approved'].includes(task.status) && (
                    <div className="flex items-center text-xs text-indigo-600 font-medium mt-2">
                      <Clock className="w-3.5 h-3.5 mr-1.5" />
                      {task.hoursSpent} hours spent
                    </div>
                  )}
                </div>

                {task.rejectionReason && (
                  <div className="p-3 bg-red-50 rounded-xl mb-4 border border-red-100">
                    <p className="text-xs font-semibold text-red-800 mb-1">Rejection Reason:</p>
                    <p className="text-sm text-red-600">{task.rejectionReason}</p>
                  </div>
                )}

                {task.attachmentUrls && task.attachmentUrls.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Attachments:</p>
                    <div className="space-y-1.5">
                      {task.attachmentUrls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-100 text-xs text-gray-700 hover:text-indigo-700 transition-colors">
                          <FileText className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                          <span className="truncate">{getFileName(url, `Attachment ${i + 1}`)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 mt-auto border-t border-gray-100 flex items-center justify-between">
                <span className="text-green-700 text-lg font-extrabold tracking-tight">Rs. {task.paymentAmount}</span>
                {(task.status === 'assigned' || task.status === 'in_progress') && (
                  <button
                    onClick={() => openCompleteModal(task._id)}
                    disabled={completing === task._id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm font-semibold hover:bg-green-100 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" /> Mark Complete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completion Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Mark Task Complete</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Completion Notes (optional)</label>
                <textarea
                  value={completionNotes}
                  onChange={e => setCompletionNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                  placeholder="Add any notes..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload File (optional)</label>
                <label className={`flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-dashed border-gray-300 text-sm cursor-pointer hover:border-indigo-500/50 hover:bg-gray-50 transition ${uploadingFile ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <FileText className="w-4 h-4 text-indigo-300" />}
                  <span className="text-gray-700">{uploadingFile ? 'Uploading...' : 'Click to upload a file'}</span>
                  <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} disabled={uploadingFile} />
                </label>
                {uploadedFiles.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {uploadedFiles.map((url, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-indigo-400 bg-indigo-50 rounded-lg px-3 py-2">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate flex-1">{getFileName(url, `File ${i + 1}`)}</span>
                        <button onClick={() => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-gray-500 hover:text-red-400 transition">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Add Link (optional)</label>
                <input
                  type="text"
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hours Spent (optional)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={hoursSpent}
                  onChange={e => setHoursSpent(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g. 2.5"
                />
              </div>

              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                  {submitError}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setCompletingTaskId(null);
                  setCompletionNotes('');
                  setHoursSpent('');
                  setUploadedFiles([]);
                  setAttachmentUrl('');
                  setSubmitError('');
                }}
                className="flex-1 px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitComplete}
                disabled={!!completing}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {completing ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
