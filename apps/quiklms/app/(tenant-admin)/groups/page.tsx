'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  CheckCircle,
  AlertCircle,
  UserPlus,
  Calendar,
} from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import { Card } from '@/components/ui';
import { Badge } from '@/components/ui';
import { Input } from '@/components/ui';
import { useBranding } from '@/app/providers';
import { api } from '@/lib/api';

interface GroupMember {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface Group {
  _id: string;
  name: string;
  description?: string;
  memberIds: GroupMember[];
  memberCount: number;
  createdAt: string;
}

interface TenantUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

/* ══════════════════════════════════════════════
   Create / Edit Group Modal
══════════════════════════════════════════════ */
interface GroupFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  group?: Group | null;
}

const GroupFormModal = ({ isOpen, onClose, onSaved, group }: GroupFormModalProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(group?.name || '');
      setDescription(group?.description || '');
      setError(null);
    }
  }, [isOpen, group]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Group name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      if (group) {
        await api.patch(`/groups/${group._id}`, { name: name.trim(), description: description.trim() || undefined });
        toast.success('Group updated successfully');
      } else {
        await api.post('/groups', { name: name.trim(), description: description.trim() || undefined });
        toast.success('Group created successfully');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h2 className="text-lg font-semibold text-fg">
            {group ? 'Edit Group' : 'Create New Group'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-muted transition-colors">
            <X className="w-5 h-5 text-fg-muted" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />
              <span className="text-sm text-danger">{error}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-fg mb-1">Group Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Sales Team, Onboarding Batch 1"
              className="w-full px-4 py-2 border border-line rounded-lg text-sm bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg mb-1">Description (Optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Briefly describe this group..."
              rows={3}
              className="w-full px-4 py-2 border border-line rounded-lg text-sm bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
          >
            {group ? 'Save Changes' : 'Create Group'}
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════
   Manage Members Modal
══════════════════════════════════════════════ */
interface ManageMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  group: Group;
}

const ManageMembersModal = ({ isOpen, onClose, onSaved, group }: ManageMembersModalProps) => {
  const [allUsers, setAllUsers] = useState<TenantUser[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMemberIds(
        (group.memberIds || [])
          .map((m: any) => (typeof m === 'object' && m !== null ? String(m._id ?? m) : String(m)))
          .filter(Boolean)
      );
      setSearch('');
      setError(null);
      loadUsers();
    }
  }, [isOpen, group]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      const users = ((res as any).data || []) as TenantUser[];
      setAllUsers(users.filter(u => u.role === 'LEARNER' || u.role === 'MANAGER'));
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() =>
    allUsers.filter(u =>
      `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
    ), [allUsers, search]);

  const toggle = (id: string) =>
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectAll = () => setMemberIds(filtered.map(u => u._id));
  const deselectAll = () => setMemberIds([]);
  const allSelected = filtered.length > 0 && filtered.every(u => memberIds.includes(u._id));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/groups/${group._id}`, { memberIds });
      toast.success(`Members updated for "${group.name}"`);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update members');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-line flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-fg">Manage Members</h2>
            <p className="text-sm text-fg-muted">{group.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-muted transition-colors">
            <X className="w-5 h-5 text-fg-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />
              <span className="text-sm text-danger">{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-fg">
              Users
              <span className="ml-1 text-[var(--brand-primary)] font-semibold">({memberIds.length} selected)</span>
            </span>
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={allSelected ? deselectAll : selectAll}
                className="text-xs font-medium text-[var(--brand-primary)] hover:opacity-75"
              >
                {allSelected ? 'Deselect All' : `Select All (${filtered.length})`}
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-primary)]" />
            </div>
          ) : (
            <div className="border border-line rounded-lg max-h-80 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-center py-6 text-sm text-fg-muted">
                  {search ? 'No users match your search' : 'No users available'}
                </p>
              ) : (
                <div className="divide-y divide-line">
                  {filtered.map(user => {
                    const selected = memberIds.includes(user._id);
                    return (
                      <button
                        key={user._id}
                        type="button"
                        onClick={() => toggle(user._id)}
                        className={`w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors flex items-center gap-3 ${selected ? 'bg-surface-sunken' : ''}`}
                      >
                        {selected ? (
                          <CheckCircle className="w-5 h-5 text-[var(--brand-primary)] flex-shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-line-strong flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-fg truncate">
                            {user.firstName} {user.lastName}
                          </div>
                          <div className="text-xs text-fg-muted truncate">{user.email}</div>
                        </div>
                        <Badge tone={user.role === 'MANAGER' ? 'info' : 'success'}>
                          {user.role}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-line flex-shrink-0 bg-surface-muted rounded-b-xl">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Save Members
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════
   Assign Courses to Group Modal
══════════════════════════════════════════════ */
interface Course {
  _id: string;
  title: string;
  description?: string;
  category?: string;
}

interface AssignCoursesToGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: Group;
}

const AssignCoursesToGroupModal = ({ isOpen, onClose, group }: AssignCoursesToGroupModalProps) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [courseSearch, setCourseSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedCourseIds([]);
      setDueDate('');
      setIsMandatory(true);
      setCourseSearch('');
      setError(null);
      loadCourses();
    }
  }, [isOpen]);

  const loadCourses = async () => {
    setLoading(true);
    try {
      const res = await api.get('/course-assignments/courses');
      setCourses((res as any).data || []);
    } catch {
      setError('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() =>
    courses.filter(c =>
      c.title.toLowerCase().includes(courseSearch.toLowerCase())
    ), [courses, courseSearch]);

  const toggle = (id: string) =>
    setSelectedCourseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const allSelected = filtered.length > 0 && filtered.every(c => selectedCourseIds.includes(c._id));
  const selectAll = () => setSelectedCourseIds(filtered.map(c => c._id));
  const deselectAll = () => setSelectedCourseIds([]);

  const handleAssign = async () => {
    if (selectedCourseIds.length === 0) { setError('Please select at least one course'); return; }
    setAssigning(true);
    setError(null);
    try {
      const res = await api.post('/course-assignments/bulk-assign', {
        courseIds: selectedCourseIds,
        targetType: 'GROUP',
        targetIds: [group._id],
        dueDate: dueDate || undefined,
        isMandatory,
      });
      toast.success((res as any).message || `${selectedCourseIds.length} course(s) assigned to "${group.name}"`);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to assign courses');
    } finally {
      setAssigning(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-line flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-fg">Assign Courses</h2>
            <p className="text-sm text-fg-muted">To group: <strong>{group.name}</strong> ({group.memberCount} members)</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-muted transition-colors">
            <X className="w-5 h-5 text-fg-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />
              <span className="text-sm text-danger">{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-fg">
              Select Courses
              <span className="ml-1 text-[var(--brand-primary)] font-semibold">({selectedCourseIds.length} selected)</span>
            </span>
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={allSelected ? deselectAll : selectAll}
                className="text-xs font-medium text-[var(--brand-primary)] hover:opacity-75"
              >
                {allSelected ? 'Deselect All' : `Select All (${filtered.length})`}
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
            <input
              type="text"
              placeholder="Search courses..."
              value={courseSearch}
              onChange={e => setCourseSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-primary)]" />
            </div>
          ) : (
            <div className="border border-line rounded-lg max-h-72 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-center py-6 text-sm text-fg-muted">
                  {courseSearch ? 'No courses match your search' : 'No courses available'}
                </p>
              ) : (
                <div className="divide-y divide-line">
                  {filtered.map(course => {
                    const selected = selectedCourseIds.includes(course._id);
                    return (
                      <button
                        key={course._id}
                        type="button"
                        onClick={() => toggle(course._id)}
                        className={`w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors flex items-center gap-3 ${selected ? 'bg-surface-sunken' : ''}`}
                      >
                        {selected ? (
                          <CheckCircle className="w-5 h-5 text-[var(--brand-primary)] flex-shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-line-strong flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-fg truncate">{course.title}</div>
                          {course.category && (
                            <div className="text-xs text-fg-muted">{course.category}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-fg mb-1">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Due Date (Optional)
              </span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-2 text-sm border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
          </div>

          {/* Mandatory */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isMandatory}
              onChange={e => setIsMandatory(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <div>
              <div className="text-sm font-medium text-fg">Mark as Mandatory</div>
              <div className="text-xs text-fg-muted">Appears in learners' Required section</div>
            </div>
          </label>
        </div>

        <div className="flex justify-between items-center gap-3 p-5 border-t border-line flex-shrink-0 bg-surface-muted rounded-b-xl">
          <span className="text-xs text-fg-muted">
            {selectedCourseIds.length} course{selectedCourseIds.length !== 1 ? 's' : ''} selected · {group.memberCount} member{group.memberCount !== 1 ? 's' : ''} in group
          </span>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleAssign}
              loading={assigning}
            >
              Assign to Group
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════
   Main GroupsPage
══════════════════════════════════════════════ */
const GroupsPage = () => {
  const { branding } = useBranding();
  const primaryColor = branding?.primaryColor;
  const secondaryColor = branding?.secondaryColor;
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Modals
  const [formModal, setFormModal] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null });
  const [membersModal, setMembersModal] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null });
  const [deleteConfirm, setDeleteConfirm] = useState<Group | null>(null);
  const [assignCoursesGroup, setAssignCoursesGroup] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadGroups();
  }, [refreshKey]);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await api.get('/groups');
      setGroups((res as any).data || []);
    } catch {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await api.delete(`/groups/${deleteConfirm._id}`);
      toast.success(`Group "${deleteConfirm.name}" deleted`);
      setDeleteConfirm(null);
      setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete group');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() =>
    groups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [groups, searchQuery]
  );

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Premium Hero Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8"
        style={{ background: `linear-gradient(135deg, ${primaryColor || '#4f46e5'}, ${secondaryColor || '#ec4899'})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <Users className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">Groups</h1>
              <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                Organize learners into groups for easy course assignment
              </p>
            </div>
          </div>

          <button
            onClick={() => setFormModal({ open: true, group: null })}
            className="px-6 py-3 bg-white text-gray-900 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 shadow-lg hover:bg-gray-100 hover:translate-y-[-2px]"
          >
            <Plus className="w-5 h-5" />
            Create Group
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-surface rounded-lg shadow p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-fg-subtle" />
          <input
            type="text"
            placeholder="Search groups..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
      </div>

      {/* Groups Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface rounded-lg shadow p-12 text-center">
          <Users className="w-16 h-16 text-fg-subtle mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-fg mb-2">
            {searchQuery ? 'No groups match your search' : 'No groups yet'}
          </h3>
          <p className="text-fg-muted mb-6">
            {searchQuery
              ? 'Try a different search term'
              : 'Create a group to organize learners and assign courses in bulk'}
          </p>
          {!searchQuery && (
            <Button
              variant="primary"
              onClick={() => setFormModal({ open: true, group: null })}
            >
              <Plus className="w-4 h-4 mr-1" />
              Create First Group
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {filtered.map(group => (
            <div
              key={group._id}
              className="bg-surface rounded-xl shadow hover:shadow-md transition-shadow border border-line flex flex-col"
            >
              <div className="p-5 flex-1">
                {/* Group header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-[var(--brand-primary)]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-fg truncate" title={group.name}>
                        {group.name}
                      </h3>
                      {group.description && (
                        <p className="text-xs text-fg-muted truncate mt-0.5">{group.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => setFormModal({ open: true, group })}
                      className="p-1.5 rounded-lg hover:bg-surface-muted transition-colors text-fg-muted"
                      title="Edit group"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(group)}
                      className="p-1.5 rounded-lg hover:bg-danger-soft transition-colors text-fg-muted hover:text-danger"
                      title="Delete group"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Member count */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-muted rounded-full text-xs font-medium text-fg-muted">
                    <Users className="w-3 h-3" />
                    {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Member avatars */}
                {group.memberIds.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {group.memberIds.slice(0, 5).map((m) => (
                      <div
                        key={m._id}
                        className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] flex items-center justify-center text-white text-xs font-medium"
                        title={`${m.firstName} ${m.lastName}`}
                      >
                        {m.firstName?.[0]}{m.lastName?.[0]}
                      </div>
                    ))}
                    {group.memberIds.length > 5 && (
                      <span className="text-xs text-fg-muted ml-1">+{group.memberIds.length - 5} more</span>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="border-t border-line p-4 flex gap-2">
                <button
                  onClick={() => setMembersModal({ open: true, group })}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-fg-muted bg-surface-muted rounded-lg hover:bg-surface-sunken transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Manage Members
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <GroupFormModal
        isOpen={formModal.open}
        group={formModal.group}
        onClose={() => setFormModal({ open: false, group: null })}
        onSaved={() => setRefreshKey(prev => prev + 1)}
      />

      {/* Manage Members Modal */}
      {membersModal.open && membersModal.group && (
        <ManageMembersModal
          isOpen={membersModal.open}
          group={membersModal.group}
          onClose={() => setMembersModal({ open: false, group: null })}
          onSaved={() => setRefreshKey(prev => prev + 1)}
        />
      )}

      {/* Assign Courses to Group Modal */}
      {assignCoursesGroup && (
        <AssignCoursesToGroupModal
          isOpen={!!assignCoursesGroup}
          group={assignCoursesGroup}
          onClose={() => setAssignCoursesGroup(null)}
        />
      )}

      {/* Delete Confirm Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-soft flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-fg">Delete Group</h3>
                <p className="text-sm text-fg-muted mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-fg mb-5">
              Are you sure you want to delete <strong>"{deleteConfirm.name}"</strong>?
              This will not remove existing course assignments.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
