'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { ClipboardList, Plus, Clock, DollarSign, User, FileText, Check, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

interface Task {
  _id: string;
  teacherId: { _id: string; firstName: string; lastName: string; email: string } | null;
  assignedBy: { firstName: string; lastName: string } | null;
  title: string;
  description?: string;
  category: string;
  paymentAmount: number;
  status: string;
  dueDate?: string;
  completedAt?: string;
  approvedAt?: string;
  completionNotes?: string;
  hoursSpent?: number;
  rejectionReason?: string;
  createdAt: string;
}

interface FormData {
  teacherId: string;
  title: string;
  description: string;
  category: string;
  paymentAmount: number;
  dueDate: string;
}

const statusColors: Record<string, string> = {
  assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed_pending: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const categories = [
  { value: 'curriculum', label: 'Curriculum Development' },
  { value: 'content', label: 'Content Creation' },
  { value: 'training', label: 'Training Session' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
];

export default function NonTeachingTasksPage() {
  const { branding } = useBranding();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState<FormData>({
    teacherId: '',
    title: '',
    description: '',
    category: 'other',
    paymentAmount: 0,
    dueDate: '',
  });

  useEffect(() => {
    fetchTasks();
    fetchTeachers();
  }, [filter]);

  const fetchTasks = async () => {
    try {
      const params: any = {};
      if (filter) params.status = filter;
      const res = await api.get<any>('/non-teaching-work/admin', { params });
      setTasks((res as any).data || []);
    } catch (err: any) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await api.get<any>('/users', { params: { role: 'TEACHER' } });
      const data = (res as any).data?.data || (res as any).data?.users || (res as any).data || [];
      setTeachers(Array.isArray(data) ? data : []);
    } catch {}
  };

  const handleCreate = async () => {
    try {
      await api.post<any>('/non-teaching-work', form);
      setShowCreate(false);
      setForm({ teacherId: '', title: '', description: '', category: 'other', paymentAmount: 0, dueDate: '' });
      fetchTasks();
      toast.success('Task assigned successfully');
    } catch (err: any) {
      toast.error('Error: ' + (err?.message));
    }
  };

  const handleApprove = async (taskId: string) => {
    try {
      await api.patch<any>(`/non-teaching-work/${taskId}/approve`);
      fetchTasks();
      toast.success('Task approved');
    } catch (err: any) {
      toast.error('Error: ' + (err?.message));
    }
  };

  const handleReject = async (taskId: string) => {
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;
    try {
      await api.patch<any>(`/non-teaching-work/${taskId}/reject`, { rejectionReason: reason });
      fetchTasks();
      toast.success('Task rejected');
    } catch (err: any) {
      toast.error('Error: ' + (err?.message));
    }
  };

  const totalPayment = tasks.filter(t => t.status === 'approved').reduce((s, t) => s + t.paymentAmount, 0);
  const pendingCount = tasks.filter(t => t.status === 'completed_pending').length;

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <Toaster />
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mb-6 mt-4 sm:mt-6 lg:mt-8"
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
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Non-Teaching Tasks</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Assign and manage non-teaching work for teachers</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all duration-200 border border-white/30 text-sm sm:text-base"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" /> Assign Task
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-xl">
          <p className="text-sm text-blue-600">Total Tasks</p>
          <p className="text-2xl font-bold text-blue-800">{tasks.length}</p>
        </div>
        <div className="p-4 bg-purple-50 rounded-xl">
          <p className="text-sm text-purple-600">Pending Approval</p>
          <p className="text-2xl font-bold text-purple-800">{pendingCount}</p>
        </div>
        <div className="p-4 bg-green-50 rounded-xl">
          <p className="text-sm text-green-600">Total Paid</p>
          <p className="text-2xl font-bold text-green-800">Rs. {totalPayment.toLocaleString()}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="completed_pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No tasks found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tasks.map(task => (
            <div key={task._id} className="bg-white border rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col group">
              <div className="p-4 sm:p-5 flex-grow flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${statusColors[task.status] || 'bg-gray-100 text-gray-800'}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{task.category}</span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight mb-1 group-hover:text-indigo-600 transition-colors">{task.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">{task.description}</p>
                </div>

                <div className="mt-auto pt-3 border-t border-gray-100 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium truncate">{task.teacherId ? `${task.teacherId.firstName} ${task.teacherId.lastName}` : 'Unassigned'}</span>
                  </div>
                  {task.dueDate && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  {task.hoursSpent != null && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span>{task.hoursSpent}h logged</span>
                    </div>
                  )}
                </div>

                {task.completionNotes && (
                  <div className="bg-gray-50 p-2 rounded-lg text-xs text-gray-600 italic">
                    Notes: <span className="line-clamp-2">{task.completionNotes}</span>
                  </div>
                )}

                {task.rejectionReason && (
                  <div className="bg-red-50 p-2 rounded-lg text-xs text-red-600 border border-red-100">
                    <strong className="font-semibold block mb-0.5">Rejected:</strong>
                    {task.rejectionReason}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 p-4 border-t flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-green-600 font-bold bg-green-100 px-3 py-1.5 rounded-lg">
                  <DollarSign className="w-4 h-4" />
                  <span>{task.paymentAmount.toLocaleString()}</span>
                </div>

                {task.status === 'completed_pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => handleReject(task._id)} className="w-8 h-8 flex items-center justify-center bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors shadow-sm" title="Reject">
                      <X className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleApprove(task._id)} className="w-8 h-8 flex items-center justify-center bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm" title="Approve">
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-lg">
            <h2 className="text-lg font-bold mb-4">Assign Non-Teaching Task</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Teacher</label>
                <select value={form.teacherId} onChange={e => setForm({ ...form, teacherId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Teacher</option>
                  {teachers.map((t: any) => (
                    <option key={t._id} value={t._id}>{t.firstName} {t.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Payment (Rs.)</label>
                  <input type="number" value={form.paymentAmount} onChange={e => setForm({ ...form, paymentAmount: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!form.teacherId || !form.title} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
