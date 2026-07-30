'use client';

import { useState, useEffect } from 'react';
import {
  BookOpen, Plus, Search, Trash2, Users, User, Calendar,
  CheckCircle, AlertCircle, X, RefreshCw,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, Input, Skeleton } from '@/components/ui';
import { DashboardScaffold, StatCard } from '@/components/DashboardScaffold';

interface CourseAssignment {
  id: string;
  courseId: string;
  courseTitle?: string;
  targetType: 'USER' | 'GROUP';
  targetId: string;
  targetName?: string;
  isMandatory: boolean;
  dueDate?: string;
  assignedBy: string;
  assignedAt: string;
}

interface Course {
  id: string;
  title: string;
}

interface UserOrGroup {
  id: string;
  name: string;
  type: 'USER' | 'GROUP';
}

export default function CourseAssignmentsPage() {
  const { branding } = useBranding();
  const primaryColor = branding.primaryColor;

  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMandatory, setFilterMandatory] = useState<'all' | 'mandatory' | 'optional'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New assignment form state
  const [form, setForm] = useState({
    courseId: '',
    targetType: 'USER' as 'USER' | 'GROUP',
    targetId: '',
    isMandatory: true,
    dueDate: '',
  });
  const [usersAndGroups, setUsersAndGroups] = useState<UserOrGroup[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [assignRes, courseRes] = await Promise.all([
        api.get<any>('/course-assignments').catch(() => ({ data: { data: [] } })),
        api.get<any>('/courses').catch(() => ({ data: { data: [] } })),
      ]);
      setAssignments(assignRes.data?.data ?? assignRes.data ?? []);
      setCourses(courseRes.data?.data ?? courseRes.data ?? []);
    } catch (err: any) {
      toast.error('Failed to load course assignments');
    } finally {
      setLoading(false);
    }
  }

  async function loadTargets(type: 'USER' | 'GROUP') {
    try {
      if (type === 'USER') {
        const res = await api.get<any>('/users?role=LEARNER');
        const users = res.data?.data ?? res.data ?? [];
        setUsersAndGroups(users.map((u: any) => ({
          id: u.id ?? u._id,
          name: `${u.firstName} ${u.lastName}`.trim(),
          type: 'USER' as const,
        })));
      } else {
        const res = await api.get<any>('/groups');
        const groups = res.data?.data ?? res.data ?? [];
        setUsersAndGroups(groups.map((g: any) => ({
          id: g.id ?? g._id,
          name: g.name,
          type: 'GROUP' as const,
        })));
      }
    } catch {
      setUsersAndGroups([]);
    }
  }

  useEffect(() => {
    if (showCreateModal) loadTargets(form.targetType);
  }, [showCreateModal, form.targetType]);

  async function handleCreate() {
    if (!form.courseId || !form.targetId) {
      toast.error('Please select a course and target');
      return;
    }
    setCreating(true);
    try {
      await api.post<any>('/course-assignments/assign', {
        courseId: form.courseId,
        targetType: form.targetType,
        targetIds: [form.targetId],
        isMandatory: form.isMandatory,
        dueDate: form.dueDate || undefined,
      });
      toast.success('Course assigned successfully');
      setShowCreateModal(false);
      setForm({ courseId: '', targetType: 'USER', targetId: '', isMandatory: true, dueDate: '' });
      loadData();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to assign course');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.delete<any>(`/course-assignments/${id}`);
      toast.success('Assignment removed');
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      toast.error('Failed to remove assignment');
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = assignments.filter((a) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q
      || (a.courseTitle ?? a.courseId).toLowerCase().includes(q)
      || (a.targetName ?? a.targetId).toLowerCase().includes(q);
    const matchesMandatory =
      filterMandatory === 'all' ? true :
      filterMandatory === 'mandatory' ? a.isMandatory : !a.isMandatory;
    return matchesSearch && matchesMandatory;
  });

  const totalMandatory = assignments.filter((a) => a.isMandatory).length;
  const totalOptional  = assignments.length - totalMandatory;
  const overdue = assignments.filter((a) => a.dueDate && new Date(a.dueDate) < new Date() ).length;

  return (
    <DashboardScaffold
      title="Course Assignments"
      subtitle="Assign courses to users or groups"
      actions={
        <Button onClick={() => setShowCreateModal(true)} style={{ backgroundColor: primaryColor }}>
          <Plus className="h-4 w-4 mr-2" />
          Assign Course
        </Button>
      }
    >
      <Toaster position="top-right" />

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[0,1,2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard icon={BookOpen}    label="Total Assignments" value={assignments.length} />
          <StatCard icon={CheckCircle} label="Mandatory"         value={totalMandatory} />
          <StatCard icon={AlertCircle} label="Overdue"           value={overdue} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted" />
          <Input
            placeholder="Search by course or target…"
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'mandatory', 'optional'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterMandatory(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterMandatory === f
                  ? 'text-white'
                  : 'bg-surface border border-line text-fg-muted hover:text-fg'
              }`}
              style={filterMandatory === f ? { backgroundColor: primaryColor } : {}}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-12 rounded" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-fg-muted">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium mb-1">No assignments found</p>
              <p className="text-sm">
                {assignments.length === 0
                  ? 'Click "Assign Course" to get started.'
                  : 'Try adjusting your filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-raised/50">
                    <th className="px-4 py-3 text-left font-semibold text-fg-muted">Course</th>
                    <th className="px-4 py-3 text-left font-semibold text-fg-muted">Assigned To</th>
                    <th className="px-4 py-3 text-left font-semibold text-fg-muted">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-fg-muted">Due Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-fg-muted">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold text-fg-muted">Assigned</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const isOverdue = a.dueDate && new Date(a.dueDate) < new Date();
                    return (
                      <tr key={a.id} className="border-b border-line/50 hover:bg-surface-raised/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-fg">
                          {a.courseTitle ?? a.courseId}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {a.targetType === 'USER'
                              ? <User className="h-3.5 w-3.5 text-fg-muted" />
                              : <Users className="h-3.5 w-3.5 text-fg-muted" />}
                            <span className="text-fg">{a.targetName ?? a.targetId}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            a.targetType === 'USER'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-purple-50 text-purple-700'
                          }`}>
                            {a.targetType === 'USER' ? 'Individual' : 'Group'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {a.dueDate ? (
                            <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-fg-muted'}`}>
                              <Calendar className="h-3 w-3" />
                              {new Date(a.dueDate).toLocaleDateString()}
                              {isOverdue && <span className="ml-1 bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px]">Overdue</span>}
                            </span>
                          ) : (
                            <span className="text-fg-subtle text-xs">No deadline</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            a.isMandatory
                              ? 'bg-red-50 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {a.isMandatory ? 'Mandatory' : 'Optional'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-fg-muted text-xs">
                          {new Date(a.assignedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={deletingId === a.id}
                            className="p-1.5 rounded hover:bg-red-50 text-fg-muted hover:text-red-600 transition-colors disabled:opacity-40"
                            title="Remove assignment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-canvas rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-line">
              <h2 className="text-lg font-semibold text-fg">Assign Course</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-lg hover:bg-surface-raised text-fg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg mb-1.5">Course</label>
                <select
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                  value={form.courseId}
                  onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
                >
                  <option value="">Select a course…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg mb-1.5">Assign To</label>
                <div className="flex gap-2 mb-2">
                  {(['USER', 'GROUP'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, targetType: t, targetId: '' }))}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        form.targetType === t
                          ? 'text-white border-transparent'
                          : 'bg-surface border-line text-fg-muted'
                      }`}
                      style={form.targetType === t ? { backgroundColor: primaryColor } : {}}
                    >
                      {t === 'USER' ? 'Individual' : 'Group'}
                    </button>
                  ))}
                </div>
                <select
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                  value={form.targetId}
                  onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
                >
                  <option value="">Select {form.targetType === 'USER' ? 'a learner' : 'a group'}…</option>
                  {usersAndGroups.map((ug) => (
                    <option key={ug.id} value={ug.id}>{ug.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg mb-1.5">Due Date (optional)</label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="mandatory-check"
                  type="checkbox"
                  checked={form.isMandatory}
                  onChange={(e) => setForm((f) => ({ ...f, isMandatory: e.target.checked }))}
                  className="h-4 w-4 rounded border-line"
                />
                <label htmlFor="mandatory-check" className="text-sm text-fg">
                  Mark as mandatory
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-line">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating} style={{ backgroundColor: primaryColor }}>
                {creating ? 'Assigning…' : 'Assign Course'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardScaffold>
  );
}
