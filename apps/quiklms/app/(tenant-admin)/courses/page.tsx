'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  UserCheck,
  Search,
  Grid3x3,
  List,
  CheckSquare,
  Square,
  Users,
  Edit,
  FolderOpen,
  Library,
  X,
  Calendar,
  CheckCircle,
  AlertCircle,
  UserPlus,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useBranding, useCurrentUser } from '@/app/providers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Course {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
  thumbnailUrlPresigned?: string;
  createdAt: string;
  status?: string;
  authorId?: {
    firstName: string;
    lastName: string;
  };
  submittedBy?: string;
  submittedByTenantId?: string;
  enrolledCount?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  Published: { label: 'Published', className: 'bg-green-100 text-green-700' },
  PendingApproval: { label: 'Pending Approval', className: 'bg-amber-100 text-amber-700' },
  PendingTenantApproval: { label: 'Pending Tenant', className: 'bg-blue-100 text-blue-700' },
  Resubmitted: { label: 'Resubmitted', className: 'bg-purple-100 text-purple-700' },
  Rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  RejectedByTenantAdmin: { label: 'Rejected by Tenant', className: 'bg-red-100 text-red-700' },
  Draft: { label: 'Draft', className: 'bg-gray-100 text-gray-600' },
};

type TabKey = 'all' | 'mine';

// ---------------------------------------------------------------------------
// ReadMoreText — inlined (replaces ReadMoreText component import)
// ---------------------------------------------------------------------------
function ReadMoreText({
  text,
  maxLines,
  className,
}: {
  text: string;
  maxLines: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Tailwind line-clamp classes must be present as full strings for purging
  const clampClass =
    !expanded
      ? maxLines === 2
        ? 'line-clamp-2'
        : maxLines === 3
        ? 'line-clamp-3'
        : 'line-clamp-4'
      : '';

  return (
    <div className={className}>
      <span className={clampClass}>{text}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        className="text-xs text-primary-600 hover:underline ml-1 font-medium"
      >
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssignCourseModal — fully functional (ported from legacy component)
// Wires to: GET /users, GET /groups,
//           POST /course-assignments/assign  | POST /course-assignments/bulk-assign,
//           GET /course-assignments/courses/:courseId/assignments (assigned list),
//           DELETE /course-assignments/:assignmentId
// ---------------------------------------------------------------------------
interface AssignUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AssignedUser {
  assignmentId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  assignedAt: string;
}

interface AssignGroup {
  _id: string;
  name: string;
  description?: string;
  memberCount: number;
}

interface AssignCourseModalProps {
  courseId?: string;
  courseIds?: string[];
  courseTitle?: string;
  courseTitles?: string[];
  initialTab?: 'assign' | 'assigned';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function AssignCourseModal({
  courseId,
  courseTitle,
  courseIds,
  initialTab = 'assign',
  isOpen,
  onClose,
  onSuccess,
}: AssignCourseModalProps) {
  const isBulk = !!(courseIds && courseIds.length > 0);
  const effectiveCourseIds = isBulk ? courseIds! : courseId ? [courseId] : [];
  const effectiveTitle = isBulk
    ? `${courseIds!.length} courses selected`
    : courseTitle || '';

  const [activeTab, setActiveTab] = useState<'assign' | 'assigned'>('assign');
  const [users, setUsers] = useState<AssignUser[]>([]);
  const [groups, setGroups] = useState<AssignGroup[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [targetType, setTargetType] = useState<'USER' | 'GROUP'>('USER');
  const [dueDate, setDueDate] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  // Assigned users tab state
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      loadGroups();
      setSelectedUsers([]);
      setSelectedGroups([]);
      setDueDate('');
      setIsMandatory(true);
      setError(null);
      setUserSearch('');
      setGroupSearch('');
      setTargetType('USER');
      setActiveTab(initialTab);
      setAssignedUsers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab]);

  // If a due date is set, the assignment is mandatory by definition.
  useEffect(() => {
    if (dueDate) setIsMandatory(true);
  }, [dueDate]);

  useEffect(() => {
    if (activeTab === 'assigned' && courseId) loadAssignedUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, courseId]);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api.get<{ data: AssignUser[] }>('/users');
      const allUsers = res?.data || [];
      setUsers(
        allUsers.filter((u) => u.role === 'LEARNER' || u.role === 'MANAGER')
      );
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    try {
      const res = await api.get<{ data: AssignGroup[] }>('/groups');
      setGroups(res?.data || []);
    } catch {
      // Groups may not exist yet — fail silently
    }
  }

  async function loadAssignedUsers() {
    if (!courseId) return;
    setAssignedLoading(true);
    try {
      const res = await api.get<{ data: any[] }>(
        `/course-assignments/courses/${courseId}/assignments`
      );
      const data = (res?.data || []).filter(
        (item: any) => (item.targetType ?? 'USER') === 'USER'
      );
      const mapped: AssignedUser[] = data.map((item: any) => ({
        assignmentId: item._id || item.id,
        userId: item.targetId?._id || item.targetId,
        firstName: item.targetId?.firstName || '',
        lastName: item.targetId?.lastName || '',
        email: item.targetId?.email || '',
        role: item.targetId?.role || '',
        assignedAt: item.assignedAt,
      }));
      setAssignedUsers(mapped);
    } catch {
      toast.error('Failed to load assigned users');
    } finally {
      setAssignedLoading(false);
    }
  }

  async function handleRemoveUser(assignmentId: string) {
    setRemovingIds((prev) => new Set(prev).add(assignmentId));
    try {
      await api.delete(`/course-assignments/${assignmentId}`);
      setAssignedUsers((prev) =>
        prev.filter((u) => u.assignmentId !== assignmentId)
      );
      toast.success('User removed from course');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove user');
    } finally {
      setRemovingIds((prev) => {
        const s = new Set(prev);
        s.delete(assignmentId);
        return s;
      });
    }
  }

  const filteredUsers = useMemo(
    () =>
      users.filter((u) =>
        `${u.firstName} ${u.lastName} ${u.email}`
          .toLowerCase()
          .includes(userSearch.toLowerCase())
      ),
    [users, userSearch]
  );

  const filteredGroups = useMemo(
    () =>
      groups.filter((g) =>
        g.name.toLowerCase().includes(groupSearch.toLowerCase())
      ),
    [groups, groupSearch]
  );

  const toggleUser = (id: string) =>
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleGroup = (id: string) =>
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const allFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedUsers.includes(u._id));

  async function handleAssign() {
    const hasSelection =
      targetType === 'USER' ? selectedUsers.length > 0 : selectedGroups.length > 0;
    if (!hasSelection) {
      toast.error(
        `Please select at least one ${targetType === 'USER' ? 'user' : 'group'}`
      );
      return;
    }
    if (effectiveCourseIds.length === 0) {
      toast.error('No course selected');
      return;
    }

    setAssigning(true);
    setError(null);

    const targetIds = targetType === 'USER' ? selectedUsers : selectedGroups;

    try {
      if (isBulk || effectiveCourseIds.length > 1) {
        const res = await api.post<{ message?: string }>(
          '/course-assignments/bulk-assign',
          {
            courseIds: effectiveCourseIds,
            targetType,
            targetIds,
            dueDate: dueDate || undefined,
            isMandatory: dueDate ? true : isMandatory,
          }
        );
        toast.success(
          res?.message ||
            `${effectiveCourseIds.length} courses assigned successfully`
        );
        onSuccess();
        onClose();
      } else {
        const res = await api.post<{
          message?: string;
          newCount?: number;
          alreadyAssignedCount?: number;
        }>('/course-assignments/assign', {
          courseId: effectiveCourseIds[0],
          targetType,
          targetIds,
          dueDate: dueDate || undefined,
          isMandatory: dueDate ? true : isMandatory,
        });
        const newCount = res?.newCount ?? 0;
        const alreadyAssignedCount = res?.alreadyAssignedCount ?? 0;

        if (alreadyAssignedCount > 0 && newCount === 0) {
          toast.error('Course already assigned to all selected users');
        } else if (alreadyAssignedCount > 0 && newCount > 0) {
          toast.success(
            `Assigned to ${newCount} user(s). ${alreadyAssignedCount} already assigned (skipped).`
          );
          onSuccess();
          onClose();
        } else {
          toast.success(res?.message || 'Course assigned successfully');
          onSuccess();
          onClose();
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign course(s)');
      setError(err?.message || 'Failed to assign course(s)');
    } finally {
      setAssigning(false);
    }
  }

  const selectedCount =
    targetType === 'USER' ? selectedUsers.length : selectedGroups.length;
  const targetLabel = targetType === 'USER' ? 'User' : 'Group';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200">
          <div className="flex items-center justify-between px-6 pt-5 pb-0">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Manage Course Assignment
              </h2>
              <p
                className="text-sm text-gray-500 mt-0.5 max-w-md truncate"
                title={effectiveTitle}
              >
                {effectiveTitle}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          {/* Tabs (only in single-course mode) */}
          {!isBulk && courseId && (
            <div className="flex px-6 mt-3 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('assign')}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                  activeTab === 'assign'
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <UserPlus className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
                Assign Users
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('assigned')}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                  activeTab === 'assigned'
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <Users className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
                Assigned Users
                {assignedUsers.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                    {assignedUsers.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Assigned Users Tab */}
        {activeTab === 'assigned' && (
          <div className="flex-1 overflow-y-auto p-6">
            {assignedLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : assignedUsers.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No users assigned to this course yet</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {assignedUsers.map((u) => (
                  <div
                    key={u.assignmentId}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-indigo-700">
                        {u.firstName?.[0]}
                        {u.lastName?.[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {u.firstName} {u.lastName}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {u.email}
                      </div>
                    </div>
                    {u.role && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">
                        {u.role}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveUser(u.assignmentId)}
                      disabled={removingIds.has(u.assignmentId)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Remove from course"
                    >
                      {removingIds.has(u.assignmentId) ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Assign Tab Content */}
        {activeTab === 'assign' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span className="text-sm text-red-800">{error}</span>
              </div>
            )}

            {/* Target Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Type
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTargetType('USER');
                    setSelectedGroups([]);
                  }}
                  className={cn(
                    'flex-1 flex flex-col items-center py-3 px-4 rounded-lg border-2 transition-all',
                    targetType === 'USER'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  )}
                >
                  <Users className="w-5 h-5 mb-1" />
                  <span className="text-sm font-medium">Specific Users</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetType('GROUP');
                    setSelectedUsers([]);
                  }}
                  className={cn(
                    'flex-1 flex flex-col items-center py-3 px-4 rounded-lg border-2 transition-all',
                    targetType === 'GROUP'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  )}
                >
                  <UserPlus className="w-5 h-5 mb-1" />
                  <span className="text-sm font-medium">Groups</span>
                </button>
              </div>
            </div>

            {/* User Selection */}
            {targetType === 'USER' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Select Users
                    <span className="ml-1 text-primary-600 font-semibold">
                      ({selectedUsers.length} selected)
                    </span>
                  </label>
                  {filteredUsers.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        allFilteredSelected
                          ? setSelectedUsers([])
                          : setSelectedUsers(filteredUsers.map((u) => u._id))
                      }
                      className="text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors"
                    >
                      {allFilteredSelected
                        ? 'Deselect All'
                        : `Select All (${filteredUsers.length})`}
                    </button>
                  )}
                </div>

                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                      <p className="text-center py-6 text-sm text-gray-500">
                        {userSearch
                          ? 'No users match your search'
                          : 'No users available'}
                      </p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {filteredUsers.map((user) => {
                          const selected = selectedUsers.includes(user._id);
                          return (
                            <button
                              key={user._id}
                              type="button"
                              onClick={() => toggleUser(user._id)}
                              className={cn(
                                'w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3',
                                selected ? 'bg-primary-50' : ''
                              )}
                            >
                              {selected ? (
                                <CheckCircle className="w-5 h-5 text-primary-600 flex-shrink-0" />
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {user.firstName} {user.lastName}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {user.email}
                                </div>
                              </div>
                              <span
                                className={cn(
                                  'text-xs px-2 py-0.5 rounded-full flex-shrink-0',
                                  user.role === 'MANAGER'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-green-100 text-green-700'
                                )}
                              >
                                {user.role}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Group Selection */}
            {targetType === 'GROUP' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Select Groups
                    <span className="ml-1 text-primary-600 font-semibold">
                      ({selectedGroups.length} selected)
                    </span>
                  </label>
                </div>

                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search groups..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto">
                  {filteredGroups.length === 0 ? (
                    <div className="text-center py-8">
                      <UserPlus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">
                        {groupSearch
                          ? 'No groups match your search'
                          : 'No groups created yet'}
                      </p>
                      {!groupSearch && (
                        <p className="text-xs text-gray-400 mt-1">
                          Create groups in the Groups section first
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {filteredGroups.map((group) => {
                        const selected = selectedGroups.includes(group._id);
                        return (
                          <button
                            key={group._id}
                            type="button"
                            onClick={() => toggleGroup(group._id)}
                            className={cn(
                              'w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3',
                              selected ? 'bg-primary-50' : ''
                            )}
                          >
                            {selected ? (
                              <CheckCircle className="w-5 h-5 text-primary-600 flex-shrink-0" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900">
                                {group.name}
                              </div>
                              {group.description && (
                                <div className="text-xs text-gray-500 truncate">
                                  {group.description}
                                </div>
                              )}
                            </div>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">
                              {group.memberCount} member
                              {group.memberCount !== 1 ? 's' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Due Date */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Due Date (Optional)
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                The date by which the course must be completed
              </p>
            </div>

            {/* Mandatory Toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isMandatory}
                onChange={(e) => setIsMandatory(e.target.checked)}
                disabled={!!dueDate}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <div className="text-sm font-medium text-gray-700">
                  Mark as Mandatory
                </div>
                <div className="text-xs text-gray-500">
                  {dueDate
                    ? 'Due date is set — this assignment is mandatory.'
                    : "If enabled, this course appears in the learner's 'Required' section"}
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          {activeTab === 'assign' ? (
            <>
              <p className="text-xs text-gray-500">
                {selectedCount} {targetLabel.toLowerCase()}
                {selectedCount !== 1 ? 's' : ''} selected
                {isBulk && ` · ${effectiveCourseIds.length} courses`}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={assigning || selectedCount === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {assigning ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Assigning...
                    </>
                  ) : (
                    `Assign to ${selectedCount} ${targetLabel}${
                      selectedCount !== 1 ? 's' : ''
                    }`
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                {assignedUsers.length} user
                {assignedUsers.length !== 1 ? 's' : ''} assigned
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function CourseAssignmentPage() {
  const { branding } = useBranding();
  const { user } = useCurrentUser();
  const router = useRouter();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const [selectedCourse, setSelectedCourse] = useState<{
    id: string;
    title: string;
    initialTab?: 'assign' | 'assigned';
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const currentUserId = user?._id || user?.id;
  const currentUserTenantId = user?.orgId;

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function loadCourses() {
    try {
      const response = await api.get<{ data: Course[] }>('/course-assignments/courses');
      setCourses(response?.data || []);
    } catch (error) {
      console.error('Failed to load courses:', error);
    } finally {
      setLoading(false);
    }
  }

  const myCourses = useMemo(
    () =>
      courses.filter(
        (c) => c.submittedBy && String(c.submittedBy) === String(currentUserId)
      ),
    [courses, currentUserId]
  );

  const displayCourses = activeTab === 'mine' ? myCourses : courses;

  const filteredCourses = displayCourses.filter(
    (course) =>
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canEdit = (course: Course) =>
    (course.submittedByTenantId != null &&
      currentUserTenantId != null &&
      String(course.submittedByTenantId) === String(currentUserTenantId)) ||
    (course.submittedBy != null &&
      String(course.submittedBy) === String(currentUserId));

  const toggleCourseSelection = (courseId: string) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
  };

  const allFilteredSelected =
    filteredCourses.length > 0 &&
    filteredCourses.every((c) => selectedCourseIds.includes(c._id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredCourses.map((c) => c._id));
      setSelectedCourseIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const existing = new Set(selectedCourseIds);
      filteredCourses.forEach((c) => existing.add(c._id));
      setSelectedCourseIds(Array.from(existing));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedCourseIds([]);
  };

  const selectedCourseTitles = selectedCourseIds
    .map((id) => courses.find((c) => c._id === id)?.title || '')
    .filter(Boolean);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  return (
    <>
      <Toaster position="top-right" />

      <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
        {/* Premium Hero Header */}
        <div
          className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8"
          style={{
            background: `linear-gradient(135deg, ${branding.primaryColor || '#4f46e5'}, ${
              branding.secondaryColor || '#ec4899'
            })`,
          }}
        >
          {/* Decorative pattern */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E")`,
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
                <Library className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
                  Content Library
                </h1>
                <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                  {activeTab === 'mine'
                    ? 'Courses you created — you can edit these'
                    : 'All courses assigned to your organization'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!selectionMode ? (
                <button
                  onClick={() => setSelectionMode(true)}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white text-sm font-semibold transition-all duration-300 flex items-center gap-2 shadow-lg hover:translate-y-[-2px]"
                >
                  <CheckSquare className="w-4 h-4" />
                  Select Multiple
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSelectAll}
                    className="px-4 py-2.5 bg-white text-gray-900 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 shadow-lg hover:bg-gray-100 hover:translate-y-[-2px]"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="w-4 h-4 text-primary-600" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                    {allFilteredSelected
                      ? 'Deselect All'
                      : `Select All (${filteredCourses.length})`}
                  </button>
                  <button
                    onClick={exitSelectionMode}
                    className="px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white text-sm font-semibold transition-all duration-300"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* View mode toggle */}
              <div className="flex items-center gap-1 bg-black/20 rounded-xl border border-white/20 p-1 backdrop-blur-md">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-2 rounded-lg transition-all',
                    viewMode === 'grid'
                      ? 'bg-white text-indigo-600 shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  )}
                >
                  <Grid3x3 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'p-2 rounded-lg transition-all',
                    viewMode === 'list'
                      ? 'bg-white text-indigo-600 shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  )}
                >
                  <List className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => {
              setActiveTab('all');
              exitSelectionMode();
            }}
            className={cn(
              'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'all'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <Library className="w-4 h-4" />
            All Courses ({courses.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('mine');
              exitSelectionMode();
            }}
            className={cn(
              'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'mine'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <FolderOpen className="w-4 h-4" />
            My Courses ({myCourses.length})
          </button>
        </div>

        {/* Selection summary banner */}
        {selectionMode && selectedCourseIds.length > 0 && (
          <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-primary-800 font-medium">
              {selectedCourseIds.length} course
              {selectedCourseIds.length !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setBulkModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              <UserCheck className="w-4 h-4" />
              Assign to Users / Groups
            </button>
          </div>
        )}

        {/* Search bar */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Empty state */}
        {filteredCourses.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery
                ? 'No courses found'
                : activeTab === 'mine'
                ? 'No courses created by you yet'
                : 'No courses available'}
            </h3>
            <p className="text-gray-600">
              {searchQuery
                ? 'Try adjusting your search terms'
                : activeTab === 'mine'
                ? 'Courses you create and get approved will appear here'
                : 'Courses assigned by the Super Admin will appear here'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* ---------------------------------------------------------------- */
          /* GRID VIEW                                                         */
          /* ---------------------------------------------------------------- */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {filteredCourses.map((course) => {
              const isSelected = selectedCourseIds.includes(course._id);
              const editable = canEdit(course);
              return (
                <div
                  key={course._id}
                  className={cn(
                    'relative bg-white rounded-lg shadow hover:shadow-lg transition-all border-2 flex flex-col',
                    isSelected
                      ? 'border-primary-500 ring-2 ring-primary-200'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  {/* Selected checkmark badge */}
                  {selectionMode && isSelected && (
                    <div className="absolute top-2 right-2 z-10 bg-primary-600 rounded-full p-0.5 shadow">
                      <CheckSquare className="w-4 h-4 text-white" />
                    </div>
                  )}

                  {/* Thumbnail */}
                  <div className="relative">
                    {course.thumbnailUrl ? (
                      <img
                        src={course.thumbnailUrlPresigned || course.thumbnailUrl}
                        alt={course.title}
                        className="w-full h-48 object-cover rounded-t-lg"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gradient-to-br from-primary-100 to-primary-200 rounded-t-lg flex items-center justify-center">
                        <BookOpen className="w-16 h-16 text-primary-600" />
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        {course.category && (
                          <span className="inline-block px-2 py-1 text-xs font-medium text-primary-700 bg-primary-50 rounded">
                            {course.category}
                          </span>
                        )}
                        {editable &&
                          course.status &&
                          STATUS_BADGE[course.status] && (
                            <span
                              className={cn(
                                'inline-block px-2 py-1 text-xs font-medium rounded',
                                STATUS_BADGE[course.status].className
                              )}
                            >
                              {STATUS_BADGE[course.status].label}
                            </span>
                          )}
                      </div>
                      <h3
                        className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2"
                        title={course.title}
                      >
                        {course.title}
                      </h3>
                      {course.description && (
                        <ReadMoreText
                          text={course.description}
                          maxLines={3}
                          className="text-sm text-gray-600 mb-4"
                        />
                      )}
                      {course.authorId &&
                        (course.authorId.firstName ||
                          course.authorId.lastName) && (
                          <p className="text-xs text-gray-500">
                            by {course.authorId.firstName}{' '}
                            {course.authorId.lastName}
                          </p>
                        )}
                      <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                        <Users className="w-4 h-4" />
                        <span>
                          {course.enrolledCount ?? 0} enrolled learner
                          {course.enrolledCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    {/* Normal mode actions */}
                    {!selectionMode && (
                      <div className="mt-4 flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              setSelectedCourse({
                                id: course._id,
                                title: course.title,
                                initialTab: 'assign',
                              })
                            }
                            className="flex-1 btn-primary flex items-center justify-center gap-2"
                          >
                            <UserCheck className="w-4 h-4" />
                            Assign
                          </button>
                          {editable && (
                            <button
                              onClick={() =>
                                router.push(
                                  `/create-course?courseId=${course._id}`
                                )
                              }
                              className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                            >
                              <Edit className="w-4 h-4" />
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Selection mode action */}
                    {selectionMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCourseSelection(course._id);
                        }}
                        className={cn(
                          'mt-4 w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors border',
                          isSelected
                            ? 'bg-primary-600 text-white hover:bg-primary-700 border-primary-600'
                            : 'bg-white text-gray-700 hover:bg-primary-50 hover:border-primary-400 border-gray-300'
                        )}
                      >
                        {isSelected ? (
                          <>
                            <CheckSquare className="w-4 h-4" /> Selected
                          </>
                        ) : (
                          <>
                            <Square className="w-4 h-4" /> Select
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ---------------------------------------------------------------- */
          /* LIST VIEW                                                         */
          /* ---------------------------------------------------------------- */
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="divide-y divide-gray-200">
              {filteredCourses.map((course) => {
                const isSelected = selectedCourseIds.includes(course._id);
                const editable = canEdit(course);
                return (
                  <div
                    key={course._id}
                    className={cn(
                      'p-5 hover:bg-gray-50 transition-colors flex items-center gap-4',
                      isSelected ? 'bg-primary-50' : ''
                    )}
                  >
                    {selectionMode && (
                      <button
                        type="button"
                        onClick={() => toggleCourseSelection(course._id)}
                        className="flex-shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-primary-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                    )}

                    {/* Thumbnail */}
                    {course.thumbnailUrl ? (
                      <img
                        src={course.thumbnailUrlPresigned || course.thumbnailUrl}
                        alt={course.title}
                        className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-10 h-10 text-primary-600" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3
                          className="text-base font-semibold text-gray-900 truncate"
                          title={course.title}
                        >
                          {course.title}
                        </h3>
                        {course.category && (
                          <span className="px-2 py-0.5 text-xs font-medium text-primary-700 bg-primary-50 rounded flex-shrink-0">
                            {course.category}
                          </span>
                        )}
                        {editable &&
                          course.status &&
                          STATUS_BADGE[course.status] && (
                            <span
                              className={cn(
                                'px-2 py-0.5 text-xs font-medium rounded flex-shrink-0',
                                STATUS_BADGE[course.status].className
                              )}
                            >
                              {STATUS_BADGE[course.status].label}
                            </span>
                          )}
                      </div>
                      {course.description && (
                        <ReadMoreText
                          text={course.description}
                          maxLines={2}
                          className="text-sm text-gray-600 mb-1"
                        />
                      )}
                      {course.authorId &&
                        (course.authorId.firstName ||
                          course.authorId.lastName) && (
                          <p className="text-xs text-gray-500">
                            by {course.authorId.firstName}{' '}
                            {course.authorId.lastName}
                          </p>
                        )}
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {course.enrolledCount ?? 0} enrolled learner
                        {course.enrolledCount === 1 ? '' : 's'}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex flex-wrap gap-2">
                      {!selectionMode ? (
                        <>
                          <button
                            onClick={() =>
                              setSelectedCourse({
                                id: course._id,
                                title: course.title,
                                initialTab: 'assign',
                              })
                            }
                            className="btn-primary flex items-center gap-2"
                          >
                            <UserCheck className="w-4 h-4" />
                            Assign
                          </button>
                          {editable && (
                            <button
                              onClick={() =>
                                router.push(
                                  `/create-course?courseId=${course._id}`
                                )
                              }
                              className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                            >
                              <Edit className="w-4 h-4" />
                              Edit
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => toggleCourseSelection(course._id)}
                          className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                            isSelected
                              ? 'bg-primary-600 text-white hover:bg-primary-700'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          )}
                        >
                          {isSelected ? 'Selected' : 'Select'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Single-course assign modal */}
        {selectedCourse && (
          <AssignCourseModal
            courseId={selectedCourse.id}
            courseTitle={selectedCourse.title}
            initialTab={selectedCourse.initialTab}
            isOpen={!!selectedCourse}
            onClose={() => setSelectedCourse(null)}
            onSuccess={() => setRefreshKey((prev) => prev + 1)}
          />
        )}

        {/* Bulk assign modal */}
        {bulkModalOpen && (
          <AssignCourseModal
            courseIds={selectedCourseIds}
            courseTitles={selectedCourseTitles}
            isOpen={bulkModalOpen}
            onClose={() => setBulkModalOpen(false)}
            onSuccess={() => {
              setRefreshKey((prev) => prev + 1);
              exitSelectionMode();
            }}
          />
        )}
      </div>
    </>
  );
}
