'use client';

import { useEffect, useState } from 'react';
import { Users, Search, Plus, X, ToggleLeft, ToggleRight, UserPlus, Link2, Upload, Edit3 } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding, useCurrentUser } from '@/app/providers';
import BulkUploadModal from '@/components/BulkUploadModal';
import toast, { Toaster } from 'react-hot-toast';

interface Parent {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  guardianContact?: string;
  guardianRelation?: string;
  childrenIds?: string[];
  isActive: boolean;
  profilePicture?: string;
  profilePictureUrl?: string;
}

interface Student {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  grade?: string;
  section?: string;
}

interface CreateParentForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  guardianRelation: string;
  selectedChildren: string[];
}

const ParentsPage = () => {
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const { branding } = useBranding();
  // Source of truth for the signed-in actor (GET /api/me), replacing a
  // sessionStorage read that was only populated after async hydration.
  const { user: currentUser } = useCurrentUser();

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkModal, setLinkModal] = useState<{ parentId: string; parentName: string } | null>(null);

  // Edit parent modal state
  const [editingParent, setEditingParent] = useState<Parent | null>(null);
  const [editFormData, setEditFormData] = useState<CreateParentForm>({
    firstName: '', lastName: '', email: '', phone: '', guardianRelation: 'father', selectedChildren: [],
  });
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linking, setLinking] = useState(false);
  const [formData, setFormData] = useState<CreateParentForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    guardianRelation: 'father',
    selectedChildren: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await api.get<any>('/users');
      const allUsers = (res as any)?.data?.data || (res as any)?.data || [];
      setParents(allUsers.filter((u: any) => u.role === 'PARENT'));
      setStudents(allUsers.filter((u: any) => u.role === 'LEARNER'));
    } catch (err: any) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (parentId: string, isActive: boolean) => {
    try {
      await api.patch<any>(`/users/${parentId}/toggle-active`, { isActive: !isActive });
      setParents((prev) =>
        prev.map((p) => (p._id === parentId ? { ...p, isActive: !isActive } : p))
      );
    } catch (err: any) {
      console.error('Failed to toggle active status:', err);
    }
  };

  const openCreateModal = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      guardianRelation: 'father',
      selectedChildren: [],
    });
    setError(null);
    setShowCreateModal(true);
  };

  const toggleChild = (studentId: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedChildren: prev.selectedChildren.includes(studentId)
        ? prev.selectedChildren.filter((id) => id !== studentId)
        : [...prev.selectedChildren, studentId],
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      // orgId is resolved SERVER-side from the session for every non-super-admin
      // (`app/api/auth/register/route.ts` uses `actor.orgId` and ignores
      // `body.orgId` unless the caller is a SUPER_ADMIN). This used to read it
      // from `sessionStorage('user')` and HARD-BAIL when absent — but that key is
      // only populated asynchronously by `refreshUser()` in providers, so opening
      // a roster page and submitting before hydration finished blocked the
      // invitation with "Tenant ID not found" for a request the server would have
      // scoped correctly on its own. Kept as a hint for the super-admin case only.
      const orgId = currentUser?.orgId;

      if (!formData.email || !formData.firstName || !formData.lastName) {
        setError('First Name, Last Name and Email are required.');
        setCreating(false);
        return;
      }

      const secureRandomPass = crypto.randomUUID().slice(0, 16) + 'A1!';
      await api.post<any>('/auth/register', {
        email: formData.email,
        password: secureRandomPass,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: 'PARENT',
        orgId,
        guardianContact: formData.phone || undefined,
        guardianRelation: formData.guardianRelation || undefined,
        phone: formData.phone || undefined,
        childrenIds: formData.selectedChildren.length > 0 ? formData.selectedChildren : undefined,
      });

      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      const msg = err?.message;
      setError(Array.isArray(msg) ? msg.join('\n') : msg || 'Failed to create parent');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (parent: Parent) => {
    setEditingParent(parent);
    setEditFormData({
      firstName: parent.firstName,
      lastName: parent.lastName,
      email: parent.email,
      phone: parent.guardianContact || '',
      guardianRelation: parent.guardianRelation || 'father',
      selectedChildren: parent.childrenIds || [],
    });
    setEditError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParent) return;
    setUpdating(true);
    setEditError(null);
    try {
      const res = await api.patch<any>(`/users/${editingParent._id}`, {
        firstName: editFormData.firstName,
        lastName: editFormData.lastName,
        phone: editFormData.phone || undefined,
        guardianContact: editFormData.phone || undefined,
        guardianRelation: editFormData.guardianRelation || undefined,
        childrenIds: editFormData.selectedChildren,
      });
      const updated = (res as any)?.data;
      setParents(prev => prev.map(p => p._id === editingParent._id
        ? updated
          ? { ...p, ...updated }
          : {
              ...p,
              firstName: editFormData.firstName,
              lastName: editFormData.lastName,
              guardianContact: editFormData.phone,
              guardianRelation: editFormData.guardianRelation,
              childrenIds: editFormData.selectedChildren,
            }
        : p,
      ));
      setEditingParent(null);
    } catch (err: any) {
      const msg = err?.message;
      setEditError(Array.isArray(msg) ? msg.join('\n') : msg || 'Failed to update parent');
    } finally {
      setUpdating(false);
    }
  };

  const getChildNames = (childrenIds?: string[]) => {
    if (!childrenIds || childrenIds.length === 0) return [];
    return childrenIds
      .map((id) => students.find((s) => s._id === id))
      .filter(Boolean)
      .map((s) => `${s!.firstName} ${s!.lastName}`);
  };

  const handleLinkStudent = async () => {
    if (!linkModal || !linkStudentId) return;
    setLinking(true);
    try {
      await api.post<any>(`/auth/users/${linkModal.parentId}/link-student`, { studentId: linkStudentId });
      setLinkModal(null);
      setLinkStudentId('');
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to link student');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkStudent = async (parentId: string, studentId: string) => {
    try {
      await api.delete<any>(`/auth/users/${parentId}/unlink-student/${studentId}`);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to unlink student');
    }
  };

  const filteredParents = parents.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.guardianContact && p.guardianContact.includes(searchQuery));
    const matchesActive = showInactive || p.isActive;
    return matchesSearch && matchesActive;
  });

  const totalLinkedChildren = parents.reduce((sum, p) => sum + (p.childrenIds?.length || 0), 0);

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <Toaster position="top-right" />
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8"
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
              <Users className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Parent Management</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Manage parents and their child links</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl font-medium transition-colors"
            >
              <Upload className="w-5 h-5" />
              Bulk Upload
            </button>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-5 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl font-semibold transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Parent
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center">
              <Users className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{parents.filter(p => p.isActive).length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active Parents</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <Link2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalLinkedChildren}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Children Linked</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {parents.filter(p => !p.childrenIds || p.childrenIds.length === 0).length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Without Children Linked</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search parents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>
      </div>

      {/* Parents Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading parents...</div>
        ) : filteredParents.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">No parents found</p>
            <button onClick={openCreateModal} className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
              <Plus className="w-4 h-4" />
              Add First Parent
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Parent</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Relation</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Children</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredParents.map((parent) => {
                  const childNames = getChildNames(parent.childrenIds);
                  return (
                    <tr key={parent._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                            {parent.profilePicture ? (
                              <img src={parent.profilePictureUrl || parent.profilePicture} alt="" className="w-10 h-10 rounded-full object-contain bg-white" />
                            ) : (
                              <span className="text-teal-600 dark:text-teal-400 font-semibold">
                                {parent.firstName.charAt(0)}{parent.lastName.charAt(0)}
                              </span>
                            )}
                          </div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {parent.firstName} {parent.lastName}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{parent.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{parent.guardianContact || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 capitalize">{parent.guardianRelation || '-'}</td>
                      <td className="px-6 py-4">
                        {childNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {childNames.map((name, i) => (
                              <span key={i} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None linked</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          parent.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {parent.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(parent)}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                            title="Edit Parent"
                          >
                            <Edit3 className="w-4 h-4 text-indigo-600" />
                          </button>
                          <button
                            onClick={() => setLinkModal({ parentId: parent._id, parentName: `${parent.firstName} ${parent.lastName}` })}
                            className="p-1.5 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
                            title="Link Student"
                          >
                            <Link2 className="w-5 h-5 text-teal-600" />
                          </button>
                          <button
                            onClick={() => toggleActive(parent._id, parent.isActive)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title={parent.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {parent.isActive ? (
                              <ToggleRight className="w-5 h-5 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Parent Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Add New Parent</h2>
                  <p className="text-teal-200 text-sm mt-0.5">A welcome email will be sent with a password setup link</p>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="text-white/80 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleCreate} className="p-4 sm:p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="parent@example.com"
                  autoComplete="new-password"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-sm text-blue-800">A "Set Password" link will be emailed to the parent. No temporary password is generated.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="+91 9876543210"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Relation</label>
                  <select
                    value={formData.guardianRelation}
                    onChange={(e) => setFormData({ ...formData, guardianRelation: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                    <option value="guardian">Guardian</option>
                  </select>
                </div>
              </div>

              {/* Link Children */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Link Children (optional)</label>
                {students.length === 0 ? (
                  <p className="text-sm text-gray-400">No students available. Create students first.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-xl divide-y divide-gray-100 dark:divide-gray-600">
                    {students.map((student) => (
                      <label
                        key={student._id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.selectedChildren.includes(student._id)}
                          onChange={() => toggleChild(student._id)}
                          className="rounded w-4 h-4 text-teal-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {student.grade ? `Grade ${student.grade}` : ''}{student.section ? ` - ${student.section}` : ''} {student.email}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {formData.selectedChildren.length > 0 && (
                  <p className="text-xs text-teal-600 mt-1 font-medium">
                    {formData.selectedChildren.length} child(ren) selected
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-800 text-sm whitespace-pre-line">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors font-medium"
                >
                  {creating ? 'Creating...' : 'Create Parent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Parent Modal */}
      {editingParent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Edit Parent</h2>
                  <p className="text-teal-200 text-sm mt-0.5">{editingParent.firstName} {editingParent.lastName}</p>
                </div>
                <button onClick={() => setEditingParent(null)} className="text-white/80 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <form onSubmit={handleUpdate} className="p-4 sm:p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
                  <input type="text" required value={editFormData.firstName}
                    onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
                  <input type="text" required value={editFormData.lastName}
                    onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input type="tel" value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Relation</label>
                  <select value={editFormData.guardianRelation} onChange={(e) => setEditFormData({ ...editFormData, guardianRelation: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                    <option value="guardian">Guardian</option>
                  </select>
                </div>
              </div>
              {/* Link / Unlink Children */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Linked Children</label>
                {students.length === 0 ? (
                  <p className="text-sm text-gray-400">No students available.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-xl divide-y divide-gray-100 dark:divide-gray-600">
                    {students.map(student => (
                      <label key={student._id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer">
                        <input type="checkbox"
                          checked={editFormData.selectedChildren.includes(student._id)}
                          onChange={() => {
                            const ids = editFormData.selectedChildren.includes(student._id)
                              ? editFormData.selectedChildren.filter(id => id !== student._id)
                              : [...editFormData.selectedChildren, student._id];
                            setEditFormData({ ...editFormData, selectedChildren: ids });
                          }}
                          className="rounded w-4 h-4 text-teal-600" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {student.grade ? `Grade ${student.grade}` : ''}{student.section ? ` - ${student.section}` : ''}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {editFormData.selectedChildren.length > 0 && (
                  <p className="text-xs text-teal-600 mt-1 font-medium">{editFormData.selectedChildren.length} child(ren) selected</p>
                )}
              </div>
              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-800 text-sm whitespace-pre-line">{editError}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingParent(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={updating}
                  className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors font-medium">
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Link Student Modal */}
      {linkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Link Student to {linkModal.parentName}</h3>
              <button onClick={() => { setLinkModal(null); setLinkStudentId(''); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Select Student</label>
              <div className="border border-gray-200 dark:border-gray-600 rounded-xl max-h-52 overflow-y-auto divide-y">
                {students.map(s => (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => setLinkStudentId(s._id)}
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-sm ${
                      linkStudentId === s._id ? 'bg-teal-50 dark:bg-teal-900/30' : ''
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 ${linkStudentId === s._id ? 'bg-teal-600 border-teal-600' : 'border-gray-300'}`} />
                    <span>{s.firstName} {s.lastName}</span>
                    <span className="text-xs text-gray-500">({s.email})</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setLinkModal(null); setLinkStudentId(''); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLinkStudent}
                  disabled={!linkStudentId || linking}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50"
                >
                  {linking ? 'Linking...' : 'Link Student'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onSuccess={loadData}
        type="parents"
        title="Parents"
      />
    </div>
  );
};

export default ParentsPage;
