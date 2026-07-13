'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ShieldCheck, Plus, Search, Edit, ToggleLeft, ToggleRight, X, Mail, User, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';
import { useBranding } from '@/app/providers';
import { Button, Card, Badge, Input, Skeleton } from '@/components/ui';
import { DashboardScaffold, StatCard } from '@/components/DashboardScaffold';

interface SubAdmin {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  secondaryRole?: string;
  isActive: boolean;
  profilePicture?: string;
  profilePictureUrl?: string;
  createdAt: string;
}

interface CreateFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface EditFormData {
  firstName: string;
  lastName: string;
}

const SubAdminsPage = () => {
  const { branding } = useBranding();
  const [subAdmins, setSubAdmins] = useState<SubAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SubAdmin | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateFormData>();
  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit, formState: { errors: editErrors } } = useForm<EditFormData>();

  useEffect(() => { loadSubAdmins(); }, []);

  const loadSubAdmins = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users?role=SUB_ADMIN');
      setSubAdmins((res as any).data || []);
    } catch (err: any) {
      console.error('Failed to load sub admins', err);
      toast.error('Failed to load Sub Admins');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: CreateFormData) => {
    setCreating(true);
    try {
      const userStr = sessionStorage.getItem('user');
      const currentUser = userStr ? JSON.parse(userStr) : null;
      const orgId = currentUser?.orgId;
      if (!orgId) {
        toast.error('Tenant ID not found. Please log out and log in again.');
        setCreating(false);
        return;
      }
      const payload = {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'SUB_ADMIN',
        orgId,
      };
      await api.post('/auth/register', payload);
      setShowCreateModal(false);
      setShowPassword(false);
      reset();
      toast.success('Sub Admin created successfully');
      loadSubAdmins();
    } catch (err: any) {
      const msg = err?.message;
      const errorText = Array.isArray(msg) ? msg.join(', ') : (msg || err.message || 'Failed to create Sub Admin');
      toast.error(errorText);
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async (data: EditFormData) => {
    if (!editingUser) return;
    setUpdating(true);
    try {
      await api.patch(`/users/${editingUser._id}`, data);
      setEditingUser(null);
      resetEdit();
      toast.success('Sub Admin updated successfully');
      loadSubAdmins();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update Sub Admin');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleActive = async (userId: string) => {
    try {
      await api.patch(`/users/${userId}/toggle-active`);
      loadSubAdmins();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to toggle status');
    }
  };

  const openEdit = (user: SubAdmin) => {
    setEditingUser(user);
    resetEdit({ firstName: user.firstName, lastName: user.lastName });
  };

  const filtered = subAdmins.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <Toaster position="top-right" />
      <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
        {/* Hero Header */}
        <div
          className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
          style={{ background: `linear-gradient(135deg, ${branding.primaryColor || '#4f46e5'}, ${branding.secondaryColor || '#ec4899'})` }}
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E")`
            }}
          />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Sub Admins</h1>
                <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                  Manage delegated admins who can create courses pending your approval
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={loadSubAdmins}
                disabled={loading}
                className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/20"
              >
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => { setShowCreateModal(true); reset(); }}
                className="inline-flex items-center gap-2 px-4 py-2 sm:py-2.5 bg-white text-gray-900 rounded-xl hover:bg-gray-50 font-medium text-sm transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                Add Sub Admin
              </button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search sub admins..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{subAdmins.length}</p>
            <p className="text-sm text-gray-500">Total Sub Admins</p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-green-600">{subAdmins.filter(u => u.isActive).length}</p>
            <p className="text-sm text-gray-500">Active</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-red-600">{subAdmins.filter(u => !u.isActive).length}</p>
            <p className="text-sm text-gray-500">Inactive</p>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <ShieldCheck className="w-14 h-14 text-gray-300 mx-auto mb-3" />
            <p className="text-lg font-medium text-gray-500">
              {subAdmins.length === 0 ? 'No Sub Admins yet' : 'No results found'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {subAdmins.length === 0 ? 'Add a Sub Admin to delegate course creation' : 'Try a different search term'}
            </p>
            {subAdmins.length === 0 && (
              <button
                onClick={() => { setShowCreateModal(true); reset(); }}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
              >
                Add Your First Sub Admin
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(user => (
              <div key={user._id} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      {user.profilePictureUrl || user.profilePicture ? (
                        <img src={user.profilePictureUrl || user.profilePicture} alt="" className="w-11 h-11 rounded-full object-contain bg-white" />
                      ) : (
                        <User className="w-5 h-5 text-purple-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 truncate">{user.firstName} {user.lastName}</h3>
                        {user.role === 'LEARNER' && user.secondaryRole === 'SUB_ADMIN' && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 shrink-0">Learner + Sub Admin</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="truncate">{user.email}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => handleToggleActive(user._id)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                      title={user.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {user.isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                    </button>
                    <button
                      onClick={() => openEdit(user)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-400 ml-15">
                  Created: {new Date(user.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Add Sub Admin</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Create a delegated admin for your organization</p>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleSubmit(handleCreate)} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input
                      {...register('firstName', { required: 'Required' })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="First name"
                    />
                    {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input
                      {...register('lastName', { required: 'Required' })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Last name"
                    />
                    {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName.message}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    {...register('email', { required: 'Required', pattern: { value: /^\S+@\S+$/i, message: 'Invalid email' } })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="email@example.com"
                  />
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      {...register('password', { required: 'Required', minLength: { value: 6, message: 'Min 6 characters' } })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-10"
                      placeholder="Min 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-xs text-purple-700">
                    <strong>Role: Sub Admin</strong> — This user can create and edit courses. All their actions will require your approval before being sent to Super Admin.
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create Sub Admin'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingUser && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setEditingUser(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Edit Sub Admin</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{editingUser.email}</p>
                </div>
                <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleSubmitEdit(handleEdit)} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input
                      {...registerEdit('firstName', { required: 'Required' })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {editErrors.firstName && <p className="text-xs text-red-500 mt-1">{editErrors.firstName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input
                      {...registerEdit('lastName', { required: 'Required' })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {editErrors.lastName && <p className="text-xs text-red-500 mt-1">{editErrors.lastName.message}</p>}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updating}
                    className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                  >
                    {updating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default SubAdminsPage;
