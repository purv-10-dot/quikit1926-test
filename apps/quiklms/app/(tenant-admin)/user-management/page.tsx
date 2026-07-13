'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Download,
  Users as UsersIcon,
  Plus,
  X,
  Table2,
  LayoutGrid,
  Search,
  ArrowUpDown,
  Eye,
  EyeOff,
  Pencil,
  KeyRound,
  Mail,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast, { Toaster } from 'react-hot-toast';
import { useBranding } from '@/app/providers';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { Badge } from '@/components/ui';

interface Manager {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  secondaryRole?: string;
  isActive: boolean;
  managerId?: Manager | string | null;
}

interface CreateUserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'LEARNER' | 'MANAGER';
  managerId?: string;
}

interface EditUserFormData {
  email: string;
  firstName: string;
  lastName: string;
  role: 'LEARNER' | 'MANAGER';
  managerId?: string;
}

type ViewMode = 'table' | 'card';

const UserManagementPage = () => {
  const { branding } = useBranding();
  const { primaryColor, secondaryColor } = branding ?? {};
  const [users, setUsers] = useState<User[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<CreateUserFormData>({
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      role: 'LEARNER',
      managerId: '',
    },
  });

  const watchedRole = watch('role');

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: editErrors },
    reset: resetEdit,
    setValue: setEditValue,
    watch: watchEdit,
  } = useForm<EditUserFormData>();

  const watchedEditRole = watchEdit('role');
  const watchedEditEmail = watchEdit('email');

  useEffect(() => {
    loadUsers();
    loadManagers();
  }, []);

  useEffect(() => {
    if (showCreateModal) {
      reset({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        role: 'LEARNER',
        managerId: '',
      });
    }
  }, [showCreateModal, reset]);

  const loadUsers = async () => {
    try {
      const response = await api.get<{ data: User[] }>('/users');
      setUsers((response as any).data?.data || (response as any).data || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadManagers = async () => {
    try {
      const response = await api.get<{ data: Manager[] }>('/users?role=MANAGER');
      setManagers((response as any).data?.data || (response as any).data || []);
    } catch (error) {
      console.error('Failed to load managers:', error);
      setManagers([]);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setUploading(true);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter((line) => line.trim());
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

      const emailIndex = headers.indexOf('email');
      const firstNameIndex =
        headers.indexOf('firstname') !== -1
          ? headers.indexOf('firstname')
          : headers.indexOf('first name');
      const lastNameIndex =
        headers.indexOf('lastname') !== -1
          ? headers.indexOf('lastname')
          : headers.indexOf('last name');
      const roleIndex = headers.indexOf('role');
      const managerEmailIndex =
        headers.indexOf('manager_email') !== -1
          ? headers.indexOf('manager_email')
          : headers.indexOf('manager email');

      if (emailIndex === -1 || firstNameIndex === -1 || lastNameIndex === -1) {
        throw new Error(
          'CSV must contain: email, firstname (or first name), lastname (or last name)'
        );
      }

      const userStr = sessionStorage.getItem('user');
      const currentUser = userStr ? JSON.parse(userStr) : null;
      const orgId = currentUser?.orgId;

      if (!orgId) {
        toast.error('Tenant ID not found. Please log out and log in again.');
        setUploading(false);
        return;
      }

      const managerEmailMap: Record<string, string> = {};
      managers.forEach((m) => {
        managerEmailMap[m.email.toLowerCase()] = m._id;
      });

      let successCount = 0;
      let errorCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        try {
          const role =
            values[roleIndex]?.toUpperCase() === 'MANAGER' ? 'MANAGER' : 'LEARNER';
          const managerEmail =
            managerEmailIndex !== -1
              ? values[managerEmailIndex]?.toLowerCase()
              : '';
          const managerId =
            role === 'LEARNER' && managerEmail && managerEmailMap[managerEmail]
              ? managerEmailMap[managerEmail]
              : undefined;

          const tempPassword = `Temp${Math.random().toString(36).slice(-6)}${Math.random()
            .toString(36)
            .slice(-2)
            .toUpperCase()}!`;

          const payload: any = {
            email: values[emailIndex],
            password: tempPassword,
            firstName: values[firstNameIndex],
            lastName: values[lastNameIndex],
            role,
            orgId,
          };
          if (managerId) payload.managerId = managerId;

          await api.post('/auth/register', payload);
          successCount++;
        } catch (err) {
          errorCount++;
          console.error(`Failed to create user ${values[emailIndex]}:`, err);
        }
      }

      toast.success(`Bulk upload: ${successCount} successful, ${errorCount} failed`);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload CSV');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const onSubmit = async (data: CreateUserFormData) => {
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

      const payload: any = {
        ...data,
        orgId,
      };
      if (data.role !== 'LEARNER' || !data.managerId) {
        delete payload.managerId;
      }
      await api.post('/auth/register', payload);
      setShowCreateModal(false);
      setShowPassword(false);
      reset();
      toast.success('User created successfully');
      loadUsers();
      loadManagers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      await api.patch(`/users/${userId}/toggle-active`, {
        isActive: !currentStatus,
      });
      loadUsers();
    } catch (error) {
      console.error('Failed to toggle user status:', error);
    }
  };

  const handlePromoteSubAdmin = async (userId: string) => {
    try {
      await api.patch(`/users/${userId}/promote-subadmin`, {});
      toast.success('Sub Admin role granted');
      loadUsers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to grant Sub Admin role');
    }
  };

  const handleRevokeSubAdmin = async (userId: string) => {
    try {
      await api.patch(`/users/${userId}/revoke-subadmin`, {});
      toast.success('Sub Admin role revoked');
      loadUsers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to revoke Sub Admin role');
    }
  };

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setEditValue('email', user.email);
    setEditValue('firstName', user.firstName);
    setEditValue('lastName', user.lastName);
    setEditValue('role', user.role as EditUserFormData['role']);
    const managerId = user.managerId
      ? typeof user.managerId === 'object'
        ? user.managerId._id
        : user.managerId
      : '';
    setEditValue('managerId', managerId);
    setShowResetPassword(false);
    setResetNewPassword('');
    setShowEditModal(true);
  };

  const onEditSubmit = async (data: EditUserFormData) => {
    if (!selectedUser) return;

    setUpdating(true);

    try {
      const payload: any = {
        email: data.email.trim(),
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
      };
      if (data.role === 'LEARNER') {
        payload.managerId = data.managerId || null;
      } else {
        payload.managerId = null;
      }
      const res = await api.patch(`/users/${selectedUser._id}`, payload);
      setShowEditModal(false);
      setSelectedUser(null);
      resetEdit();
      toast.success((res as any).message || 'User updated successfully');
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update user');
    } finally {
      setUpdating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !resetNewPassword.trim()) return;
    if (resetNewPassword.trim().length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setResettingPassword(true);
    try {
      const res = await api.post('/auth/admin-reset-password', {
        userId: selectedUser._id,
        newPassword: resetNewPassword.trim(),
      });
      toast.success(
        (res as any).data?.message || 'Password reset successfully. Email sent to user.'
      );
      setResetNewPassword('');
      setShowResetPassword(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent =
      'email,firstname,lastname,role,manager_email\njohn.doe@example.com,John,Doe,LEARNER,manager@example.com\njane.smith@example.com,Jane,Smith,MANAGER,';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'learners_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const filteredUsers = users.filter((u) => {
    if (u.role !== 'LEARNER' && u.role !== 'MANAGER') return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      u.firstName.toLowerCase().includes(query) ||
      u.lastName.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query)
    );
  });

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map((u) => u._id));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Premium Hero Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8"
        style={{
          background: `linear-gradient(135deg, ${primaryColor || '#4f46e5'}, ${secondaryColor || '#ec4899'})`,
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <UsersIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
                Learner Management
              </h1>
              <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                Manage and bulk upload learners
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={downloadTemplate}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white text-sm font-semibold transition-all duration-300 flex items-center gap-2 shadow-lg hover:-translate-y-0.5"
            >
              <Download className="w-4 h-4" />
              Download Template
            </button>
            <label className="px-4 py-2.5 bg-white text-gray-900 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 cursor-pointer shadow-lg hover:bg-gray-100 hover:-translate-y-0.5">
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Bulk Upload'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2.5 bg-gray-900/40 hover:bg-gray-900/60 backdrop-blur-md border border-white/10 rounded-xl text-white text-sm font-bold transition-all duration-300 flex items-center gap-2 shadow-lg hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4" />
              Add Learner
            </button>
          </div>
        </div>
      </div>

      {/* Search and View Toggle */}
      <div className="bg-surface rounded-lg shadow p-4 flex items-center justify-between flex-wrap gap-3 sm:gap-4 border border-line">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-fg-subtle" />
          <input
            type="text"
            placeholder="Search learners..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 border border-line rounded-lg p-1 bg-canvas">
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded transition-all ${
              viewMode === 'table'
                ? 'bg-[var(--brand-primary)] text-white'
                : 'text-fg-muted hover:bg-surface-muted'
            }`}
            title="Table View"
          >
            <Table2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`p-2 rounded transition-all ${
              viewMode === 'card'
                ? 'bg-[var(--brand-primary)] text-white'
                : 'text-fg-muted hover:bg-surface-muted'
            }`}
            title="Card View"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Card View */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredUsers.map((user) => {
            const managerInfo =
              user.managerId && typeof user.managerId === 'object'
                ? user.managerId
                : null;
            return (
              <div
                key={user._id}
                className="bg-surface rounded-lg shadow p-5 border border-line hover:shadow-md transition-all"
              >
                {/* Avatar and Name Section */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center flex-shrink-0">
                    <UsersIcon className="w-6 h-6 text-[var(--brand-primary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-fg text-base mb-1">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="text-sm text-fg-muted truncate">{user.email}</div>
                  </div>
                </div>

                {/* Role, Manager, and Status */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-fg-muted">Role</span>
                    <Badge tone={user.role === 'MANAGER' ? 'brand' : 'info'}>
                      {user.role}
                    </Badge>
                  </div>
                  {user.role === 'LEARNER' && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-fg-muted">Manager</span>
                      {managerInfo ? (
                        <span
                          className="text-sm text-fg font-medium truncate max-w-[150px]"
                          title={`${managerInfo.firstName} ${managerInfo.lastName} (${managerInfo.email})`}
                        >
                          {managerInfo.firstName} {managerInfo.lastName}
                        </span>
                      ) : (
                        <span className="text-sm text-fg-subtle">Unassigned</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-fg-muted">Status</span>
                    <Badge tone={user.isActive ? 'success' : 'neutral'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>

                {/* Sub Admin Badge */}
                {user.secondaryRole === 'SUB_ADMIN' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full mb-2">
                    + Sub Admin
                  </span>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-3 border-t border-line">
                  <button
                    onClick={() => handleEditClick(user)}
                    className="flex-1 flex items-center justify-center gap-1 text-[var(--brand-primary)] hover:text-[var(--brand-primary)]/80 text-sm font-medium transition-colors py-1"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit
                  </button>
                  <div className="w-px h-4 bg-line"></div>
                  <button
                    onClick={() => handleToggleActive(user._id, user.isActive)}
                    className={`flex-1 text-sm font-medium transition-colors py-1 ${
                      user.isActive
                        ? 'text-red-600 hover:text-red-700'
                        : 'text-green-600 hover:text-green-700'
                    }`}
                  >
                    {user.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <div className="w-px h-4 bg-line"></div>
                  <button
                    onClick={() =>
                      user.secondaryRole === 'SUB_ADMIN'
                        ? handleRevokeSubAdmin(user._id)
                        : handlePromoteSubAdmin(user._id)
                    }
                    className="flex-1 text-xs font-medium text-purple-600 hover:text-purple-800 transition-colors py-1"
                  >
                    {user.secondaryRole === 'SUB_ADMIN' ? 'Revoke SubAdmin' : '+ Sub Admin'}
                  </button>
                </div>
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <div className="col-span-full text-center py-12 text-fg-muted">
              No learners found
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-surface rounded-lg shadow overflow-hidden border border-line">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={
                        selectedUsers.length === filteredUsers.length &&
                        filteredUsers.length > 0
                      }
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fg-muted uppercase tracking-wider cursor-pointer hover:bg-surface-sunken">
                    <div className="flex items-center gap-2">
                      Name
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fg-muted uppercase tracking-wider cursor-pointer hover:bg-surface-sunken">
                    <div className="flex items-center gap-2">
                      Email
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                    Manager
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-fg-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-line">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-fg-muted">
                      No learners found
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const managerInfo =
                      user.managerId && typeof user.managerId === 'object'
                        ? user.managerId
                        : null;
                    return (
                      <tr key={user._id} className="hover:bg-surface-muted transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user._id)}
                            onChange={() => toggleUserSelection(user._id)}
                            className="w-4 h-4 rounded"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center mr-3">
                              <UsersIcon className="w-5 h-5 text-[var(--brand-primary)]" />
                            </div>
                            <div className="text-sm font-medium text-fg">
                              {user.firstName} {user.lastName}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-fg-muted">{user.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge tone="info">{user.role}</Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {managerInfo ? (
                            <span
                              className="text-sm text-fg"
                              title={managerInfo.email}
                            >
                              {managerInfo.firstName} {managerInfo.lastName}
                            </span>
                          ) : (
                            <span className="text-sm text-fg-subtle">
                              {user.role === 'LEARNER' ? 'Unassigned' : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge tone={user.isActive ? 'success' : 'neutral'}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-3">
                            {user.secondaryRole === 'SUB_ADMIN' && (
                              <span className="px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                                SubAdmin
                              </span>
                            )}
                            <button
                              onClick={() => handleEditClick(user)}
                              className="inline-flex items-center gap-1 text-[var(--brand-primary)] hover:opacity-75 transition-opacity"
                            >
                              <Pencil className="w-4 h-4" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleActive(user._id, user.isActive)}
                              className={`transition-colors ${
                                user.isActive
                                  ? 'text-red-600 hover:text-red-900'
                                  : 'text-green-600 hover:text-green-900'
                              }`}
                            >
                              {user.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() =>
                                user.secondaryRole === 'SUB_ADMIN'
                                  ? handleRevokeSubAdmin(user._id)
                                  : handlePromoteSubAdmin(user._id)
                              }
                              className="text-purple-600 hover:text-purple-800 transition-colors text-xs font-medium"
                            >
                              {user.secondaryRole === 'SUB_ADMIN' ? 'Revoke' : '+SubAdmin'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {selectedUsers.length > 0 && (
            <div className="bg-[var(--brand-primary)]/5 border-t border-[var(--brand-primary)]/20 px-6 py-3 flex items-center justify-between">
              <span className="text-sm text-[var(--brand-primary)]">
                {selectedUsers.length} learner(s) selected
              </span>
              <div className="flex gap-2">
                <button className="text-sm font-medium text-[var(--brand-primary)] hover:opacity-75 transition-opacity">
                  Bulk Actions
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg p-4 sm:p-6 max-w-md w-full shadow-xl border border-line mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-fg">Add New Learner</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowPassword(false);
                  reset();
                }}
                className="text-fg-muted hover:text-fg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  {...register('email', { required: 'Email is required' })}
                  className="w-full px-3 py-2 border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-colors"
                  autoComplete="new-password"
                  placeholder="Enter email address"
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    {...register('password', {
                      required: 'Password is required',
                      minLength: { value: 6, message: 'Password must be at least 6 characters' },
                    })}
                    className="w-full px-3 py-2 pr-10 border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-colors"
                    autoComplete="new-password"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-fg mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('firstName', { required: 'First name is required' })}
                    className="w-full px-3 py-2 border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-colors"
                    placeholder="John"
                  />
                  {errors.firstName && (
                    <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('lastName', { required: 'Last name is required' })}
                    className="w-full px-3 py-2 border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-colors"
                    placeholder="Doe"
                  />
                  {errors.lastName && (
                    <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    {...register('role')}
                    className="w-full px-4 py-3 bg-canvas border-2 border-line rounded-xl appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] transition-all duration-300 hover:border-line-strong text-fg font-medium"
                  >
                    <option value="LEARNER">Learner</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <svg
                      className="w-5 h-5 text-fg-subtle"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {watchedRole === 'LEARNER' && managers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-fg mb-1">
                    Assign Manager
                  </label>
                  <div className="relative">
                    <select
                      {...register('managerId')}
                      className="w-full px-4 py-3 bg-canvas border-2 border-line rounded-xl appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] transition-all duration-300 hover:border-line-strong text-fg font-medium"
                    >
                      <option value="">-- No Manager --</option>
                      {managers.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.firstName} {m.lastName} ({m.email})
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <svg
                        className="w-5 h-5 text-fg-subtle"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-fg-subtle mt-1">
                    Optional. Assign this learner to a manager's team.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowPassword(false);
                    reset();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1"
                  loading={creating}
                >
                  {creating ? 'Creating...' : 'Create Learner'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-line">
            {/* Modal Header */}
            <div
              className="px-6 py-4"
              style={{
                background: `linear-gradient(to right, ${primaryColor || '#4f46e5'}, ${primaryColor ? primaryColor + 'cc' : '#6366f1'})`,
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Edit User</h2>
                  <p
                    className="text-white/80 text-sm mt-1 truncate"
                    title={watchedEditEmail || selectedUser.email}
                  >
                    {watchedEditEmail || selectedUser.email}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                    resetEdit();
                    setShowResetPassword(false);
                    setResetNewPassword('');
                  }}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitEdit(onEditSubmit)} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  {...registerEdit('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address',
                    },
                  })}
                  className="w-full px-3 py-2 border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-colors disabled:bg-surface-muted disabled:cursor-not-allowed"
                  placeholder="user@example.com"
                  disabled={updating}
                  autoComplete="email"
                />
                {editErrors.email && (
                  <p className="text-red-500 text-xs mt-1">{editErrors.email.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-fg mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...registerEdit('firstName', { required: 'First name is required' })}
                    className="w-full px-3 py-2 border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-colors disabled:bg-surface-muted disabled:cursor-not-allowed"
                    placeholder="John"
                    disabled={updating}
                  />
                  {editErrors.firstName && (
                    <p className="text-red-500 text-xs mt-1">{editErrors.firstName.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-fg mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...registerEdit('lastName', { required: 'Last name is required' })}
                    className="w-full px-3 py-2 border border-line rounded-lg bg-canvas text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-colors disabled:bg-surface-muted disabled:cursor-not-allowed"
                    placeholder="Doe"
                    disabled={updating}
                  />
                  {editErrors.lastName && (
                    <p className="text-red-500 text-xs mt-1">{editErrors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    {...registerEdit('role', { required: 'Role is required' })}
                    className="w-full px-4 py-3 bg-canvas border-2 border-line rounded-xl appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] transition-all duration-300 hover:border-line-strong text-fg font-medium disabled:bg-surface-muted disabled:cursor-not-allowed"
                    disabled={updating}
                  >
                    <option value="LEARNER">Learner</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <svg
                      className="w-5 h-5 text-fg-subtle"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
                {editErrors.role && (
                  <p className="text-red-500 text-xs mt-1">{editErrors.role.message}</p>
                )}
              </div>

              {watchedEditRole === 'LEARNER' && managers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-fg mb-1">
                    Assign Manager
                  </label>
                  <div className="relative">
                    <select
                      {...registerEdit('managerId')}
                      className="w-full px-4 py-3 bg-canvas border-2 border-line rounded-xl appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] transition-all duration-300 hover:border-line-strong text-fg font-medium disabled:bg-surface-muted disabled:cursor-not-allowed"
                      disabled={updating}
                    >
                      <option value="">-- No Manager --</option>
                      {managers.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.firstName} {m.lastName} ({m.email})
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <svg
                        className="w-5 h-5 text-fg-subtle"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-fg-subtle mt-1">
                    Optional. Assign this learner to a manager's team.
                  </p>
                </div>
              )}

              {/* Account status */}
              <div className="bg-surface-muted rounded-xl p-4 border border-line">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[var(--brand-primary)]/10 rounded-full flex items-center justify-center">
                    <UsersIcon className="w-5 h-5 text-[var(--brand-primary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-fg-muted">Account status</p>
                    <p className="text-xs text-fg-subtle mt-0.5">
                      Changing email updates the address they use to sign in.
                    </p>
                  </div>
                  <Badge tone={selectedUser.isActive ? 'success' : 'danger'}>
                    {selectedUser.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>

              {/* Reset Password Section */}
              <div className="border border-line rounded-xl overflow-hidden">
                {!showResetPassword ? (
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted transition-colors"
                  >
                    <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                      <KeyRound className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-fg">Reset Password</p>
                      <p className="text-xs text-fg-muted">Set a new password for this user</p>
                    </div>
                    <svg
                      className="w-4 h-4 text-fg-subtle"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                ) : (
                  <div className="p-4 space-y-3 bg-surface-muted">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-amber-600" />
                        <p className="text-sm font-semibold text-fg">Reset Password</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowResetPassword(false);
                          setResetNewPassword('');
                        }}
                        className="text-fg-muted hover:text-fg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showResetNewPassword ? 'text' : 'password'}
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="Enter new password (min 6 chars)"
                        className="w-full px-4 py-2.5 pr-10 bg-canvas border-2 border-line rounded-lg text-sm text-fg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all disabled:cursor-not-allowed"
                        disabled={resettingPassword}
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetNewPassword(!showResetNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition-colors"
                      >
                        {showResetNewPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-fg-muted bg-blue-50 rounded-lg p-2.5">
                      <Mail className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <span>
                        An email will be sent to the user with the new password and a link to log
                        in.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={resettingPassword || !resetNewPassword.trim()}
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-surface-muted disabled:text-fg-subtle disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {resettingPassword ? 'Resetting...' : 'Reset Password & Send Email'}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                    resetEdit();
                    setShowResetPassword(false);
                    setResetNewPassword('');
                  }}
                  loading={updating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1"
                  loading={updating}
                >
                  {updating ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementPage;
