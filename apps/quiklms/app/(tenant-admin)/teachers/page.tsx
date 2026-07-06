'use client';

import { useEffect, useState } from 'react';
import { Users, Search, BookOpen, DollarSign, Plus, X, ToggleLeft, ToggleRight, Upload, Clock, Edit3 } from 'lucide-react';
import { api } from '@/lib/api';
import BulkUploadModal from '@/components/BulkUploadModal';
import { useBranding } from '@/app/providers';

interface AvailableSlotData {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface Teacher {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  subjects?: string[];
  ratePerClass?: number;
  rateType?: string;
  qualification?: string;
  monthlyPayout?: number;
  employeeId?: string;
  isActive: boolean;
  profilePicture?: string;
  profilePictureUrl?: string;
  availableSlots?: AvailableSlotData[];
  tutoringEnabled?: boolean;
  tutoringCreditCost?: number;
}

interface AvailableSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface CreateTeacherForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subjects: string[];
  ratePerClass: number;
  rateType: string;
  qualification: string;
  monthlyPayout: number;
  employeeId: string;
  availableSlots: AvailableSlot[];
  tutoringEnabled: boolean;
  tutoringCreditCost: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TeachersPage = () => {
  const { branding } = useBranding();
  const primaryColor = branding.primaryColor;
  const secondaryColor = branding.secondaryColor;
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [showBulkUpload, setShowBulkUpload] = useState(false);
  // Edit availability modal state
  const [editAvailTeacher, setEditAvailTeacher] = useState<Teacher | null>(null);
  const [editSlots, setEditSlots] = useState<AvailableSlot[]>([]);
  const [savingAvail, setSavingAvail] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);

  // Edit teacher modal state
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [editFormData, setEditFormData] = useState<CreateTeacherForm>({
    firstName: '', lastName: '', email: '', phone: '', subjects: [],
    ratePerClass: 500, rateType: 'per_class', qualification: '', monthlyPayout: 0,
    employeeId: '', availableSlots: [],
    tutoringEnabled: false,
    tutoringCreditCost: 5,
  });
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubjectInput, setEditSubjectInput] = useState('');
  const [showEditCustomSubject, setShowEditCustomSubject] = useState(false);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subjectInput, setSubjectInput] = useState('');
  const [subjectsList, setSubjectsList] = useState<string[]>([]);
  const [showCustomSubjectInput, setShowCustomSubjectInput] = useState(false);
  const [formData, setFormData] = useState<CreateTeacherForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    subjects: [],
    ratePerClass: 500,
    rateType: 'per_class',
    qualification: '',
    monthlyPayout: 0,
    employeeId: '',
    availableSlots: [],
    tutoringEnabled: false,
    tutoringCreditCost: 5,
  });

  useEffect(() => {
    loadTeachers();
    loadSubjects();
  }, []);

  const loadTeachers = async () => {
    try {
      const res = await api.get<any>('/users');
      const allUsers = (res.data as any)?.data || res.data || [];
      const teacherUsers = (allUsers as any[]).filter((u: any) => u.role === 'TEACHER');
      setTeachers(teacherUsers);
    } catch (err: unknown) {
      console.error('Failed to load teachers:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSubjects = async () => {
    try {
      const res = await api.get<any>('/academic-config/subjects');
      if (Array.isArray(res.data) && (res.data as any[]).length > 0) {
        setSubjectsList(res.data as string[]);
      }
    } catch { /* keep empty */ }
  };

  const toggleActive = async (teacherId: string, isActive: boolean) => {
    try {
      await api.patch<any>(`/users/${teacherId}/toggle-active`, { isActive: !isActive });
      setTeachers((prev) =>
        prev.map((t) => (t._id === teacherId ? { ...t, isActive: !isActive } : t))
      );
    } catch (err: unknown) {
      console.error('Failed to toggle active status:', err);
    }
  };

  const openCreateModal = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      subjects: [],
      ratePerClass: 500,
      rateType: 'per_class',
      qualification: '',
      monthlyPayout: 0,
      employeeId: '',
      availableSlots: [],
      tutoringEnabled: false,
      tutoringCreditCost: 5,
    });
    setSubjectInput('');
    setShowCustomSubjectInput(false);
    setError(null);
    setShowCreateModal(true);
  };

  const addSubject = async () => {
    const trimmed = subjectInput.trim();
    if (trimmed && !formData.subjects.includes(trimmed)) {
      setFormData({ ...formData, subjects: [...formData.subjects, trimmed] });
      if (!subjectsList.includes(trimmed)) {
        try {
          await api.post<any>('/academic-config/subjects', { name: trimmed });
          setSubjectsList((prev) => [...prev, trimmed].sort());
        } catch { /* ignore */ }
      }
    }
    setSubjectInput('');
    setShowCustomSubjectInput(false);
  };

  const addSubjectFromDropdown = (subj: string) => {
    if (subj && !formData.subjects.includes(subj)) {
      setFormData({ ...formData, subjects: [...formData.subjects, subj] });
    }
  };

  const removeSubject = (subj: string) => {
    setFormData({ ...formData, subjects: formData.subjects.filter(s => s !== subj) });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const userStr = sessionStorage.getItem('user');
      const currentUser = userStr ? JSON.parse(userStr) : null;
      const tenantId = currentUser?.tenantId;

      if (!tenantId) {
        setError('Tenant ID not found. Please log out and log in again.');
        setCreating(false);
        return;
      }

      if (!formData.email || !formData.firstName || !formData.lastName) {
        setError('First Name, Last Name and Email are required.');
        setCreating(false);
        return;
      }

      if (formData.phone) {
        const isValid =
          /^[0-9]{10}$/.test(formData.phone) || // 10 digit
          /^\+91[0-9]{10}$/.test(formData.phone); // +91 + 10 digit

        if (!isValid) {
          setError('Phone must be 10 digits or +91 followed by 10 digits');
          setCreating(false);
          return;
        }
      }

      const secureRandomPass = crypto.randomUUID().slice(0, 16) + 'A1!';
      await api.post<any>('/auth/register', {
        email: formData.email,
        password: secureRandomPass,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: 'TEACHER',
        tenantId,
        subjects: formData.subjects,
        ratePerClass: formData.ratePerClass,
        rateType: formData.rateType,
        qualification: formData.qualification || undefined,
        monthlyPayout: formData.monthlyPayout || undefined,
        employeeId: formData.employeeId || undefined,
        availableSlots: formData.availableSlots.length > 0 ? formData.availableSlots : undefined,
        guardianContact: formData.phone || undefined,
        phone: formData.phone || undefined,
        tutoringEnabled: formData.tutoringEnabled,
        tutoringCreditCost: formData.tutoringCreditCost,
      });

      setShowCreateModal(false);
      loadTeachers();
    } catch (err: any) {
      const msg = err?.message;
      setError(Array.isArray(msg) ? msg.join('\n') : msg || 'Failed to create teacher');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setEditFormData({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: teacher.email,
      phone: teacher.phone || '',
      subjects: teacher.subjects || [],
      ratePerClass: teacher.ratePerClass ?? 500,
      rateType: teacher.rateType || 'per_class',
      qualification: teacher.qualification || '',
      monthlyPayout: teacher.monthlyPayout ?? 0,
      employeeId: teacher.employeeId || '',
      availableSlots: teacher.availableSlots || [],
      tutoringEnabled: teacher.tutoringEnabled ?? false,
      tutoringCreditCost: teacher.tutoringCreditCost ?? 5,
    });
    setEditError(null);
    setEditSubjectInput('');
    setShowEditCustomSubject(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    setUpdating(true);
    setEditError(null);
    try {
      const res = await api.patch<any>(`/users/${editingTeacher._id}`, {
        firstName: editFormData.firstName,
        lastName: editFormData.lastName,
        subjects: editFormData.subjects,
        ratePerClass: (editFormData.rateType !== 'monthly')
          ? (editFormData.ratePerClass !== undefined ? Number(editFormData.ratePerClass) : undefined)
          : undefined,
        rateType: editFormData.rateType,
        qualification: editFormData.qualification || undefined,
        monthlyPayout: editFormData.monthlyPayout !== undefined ? Number(editFormData.monthlyPayout) : undefined,
        availableSlots: editFormData.availableSlots.length > 0 ? editFormData.availableSlots : undefined,
        phone: editFormData.phone || undefined,
        employeeId: (editFormData as any).employeeId || undefined,
        tutoringEnabled: editFormData.tutoringEnabled,
        tutoringCreditCost: editFormData.tutoringCreditCost,
      });
      const updated = (res as any)?.data;
      setTeachers(prev => prev.map(t => t._id === editingTeacher._id
        ? updated
          ? { ...t, ...updated }
          : {
            ...t,
            firstName: editFormData.firstName,
            lastName: editFormData.lastName,
            subjects: editFormData.subjects,
            ratePerClass: editFormData.ratePerClass,
            rateType: editFormData.rateType,
            qualification: editFormData.qualification,
            monthlyPayout: editFormData.monthlyPayout,
            availableSlots: editFormData.availableSlots,
            phone: editFormData.phone || t.phone,
            employeeId: (editFormData as any).employeeId || t.employeeId,
            tutoringEnabled: editFormData.tutoringEnabled,
            tutoringCreditCost: editFormData.tutoringCreditCost,
          }
        : t,
      ));
      setEditingTeacher(null);
    } catch (err: any) {
      const msg = err?.message;
      setEditError(Array.isArray(msg) ? msg.join('\n') : msg || 'Failed to update teacher');
    } finally {
      setUpdating(false);
    }
  };

  const openEditAvailability = (teacher: Teacher) => {
    setEditAvailTeacher(teacher);
    setEditSlots(teacher.availableSlots?.length
      ? teacher.availableSlots.map(s => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime }))
      : [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }]);
    setAvailError(null);
  };

  const handleSaveAvailability = async () => {
    if (!editAvailTeacher) return;
    setSavingAvail(true);
    setAvailError(null);
    try {
      await api.patch<any>(`/users/${editAvailTeacher._id}`, { availableSlots: editSlots });
      setTeachers(prev => prev.map(t =>
        t._id === editAvailTeacher._id ? { ...t, availableSlots: editSlots } : t,
      ));
      setEditAvailTeacher(null);
    } catch (err: any) {
      const msg = err?.message;
      setAvailError(Array.isArray(msg) ? msg.join('\n') : msg || 'Failed to update availability');
    } finally {
      setSavingAvail(false);
    }
  };

  const filteredTeachers = teachers.filter((t) => {
    const matchesSearch =
      !searchQuery ||
      `${t.firstName} ${t.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesActive = showInactive || t.isActive;
    return matchesSearch && matchesActive;
  });

  const monthlyTeachers = teachers.filter(t => t.monthlyPayout);

  const avgMonthly =
    monthlyTeachers.length > 0
      ? Math.round(
          monthlyTeachers.reduce((sum, t) => sum + (t.monthlyPayout || 0), 0) /
          monthlyTeachers.length
        )
      : 0;

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
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
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Teacher Management</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Manage your school&apos;s teaching staff</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all duration-200 border border-white/30 text-sm sm:text-base"
            >
              <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
              Bulk Upload
            </button>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all duration-200 border border-white/30 text-sm sm:text-base"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              Add Teacher
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{teachers.filter(t => t.isActive).length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active Teachers</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {new Set(teachers.flatMap(t => t.subjects || [])).size}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Subjects Covered</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                &#8377;{avgMonthly}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Avg Monthly Salary
              </p>
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
            placeholder="Search teachers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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

      {/* Teachers List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : filteredTeachers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">No teachers found</p>
            <button onClick={openCreateModal} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" />
              Add First Teacher
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Teacher</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Subjects</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rate</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Availability</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredTeachers.map((teacher) => (
                  <tr key={teacher._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                          {teacher.profilePicture ? (
                            <img src={teacher.profilePictureUrl || teacher.profilePicture} alt="" className="w-10 h-10 rounded-full object-contain bg-white" />
                          ) : (
                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                              {teacher.firstName.charAt(0)}{teacher.lastName.charAt(0)}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {teacher.firstName} {teacher.lastName}
                          </p>
                          {teacher.employeeId && (
                            <p className="text-xs text-gray-500">ID: {teacher.employeeId}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{teacher.email}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(teacher.subjects || []).map((subj, i) => (
                          <span key={i} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs">
                            {subj}
                          </span>
                        ))}
                        {(!teacher.subjects || teacher.subjects.length === 0) && (
                          <span className="text-xs text-gray-400">Not specified</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {teacher.rateType === 'monthly'
                        ? (teacher.monthlyPayout ? `₹${teacher.monthlyPayout}/month` : '-')
                        : teacher.rateType === 'hybrid'
                          ? `₹${teacher.monthlyPayout || 0}/mo + ₹${teacher.ratePerClass || 0}/class`
                          : teacher.ratePerClass
                            ? `₹${teacher.ratePerClass}/${teacher.rateType === 'per_hour' ? 'hr' : 'class'}`
                            : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {teacher.availableSlots && teacher.availableSlots.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          <span className="text-xs text-green-700 font-medium">{teacher.availableSlots.length} slot(s)</span>
                          <button
                            onClick={() => openEditAvailability(teacher)}
                            className="ml-1 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="Edit Availability"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => openEditAvailability(teacher)}
                          className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg hover:bg-amber-100 font-medium"
                        >
                          + Set Availability
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${teacher.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {teacher.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(teacher)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                          title="Edit Teacher"
                        >
                          <Edit3 className="w-4 h-4 text-indigo-600" />
                        </button>
                        <button
                          onClick={() => toggleActive(teacher._id, teacher.isActive)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title={teacher.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {teacher.isActive ? (
                            <ToggleRight className="w-5 h-5 text-green-600" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Teacher Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Add New Teacher</h2>
                  <p className="text-indigo-200 text-sm mt-0.5">A welcome email will be sent with a password setup link</p>
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
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Doe"
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
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="teacher@school.com"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    let value = e.target.value;
                    value = value.replace(/[^0-9+]/g, '');
                    if (value.startsWith('+')) {
                      value = value.slice(0, 13);
                    } else {
                      value = value.slice(0, 10);
                    }
                    setFormData({ ...formData, phone: value });
                  }}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="+91 9876543210"
                />
                <p className="text-xs text-gray-400 mt-1">Used for class reminders and escalation calls via SMS/voice</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-sm text-blue-800">A &quot;Set Password&quot; link will be emailed to the teacher. No temporary password is generated.</p>
              </div>

              {/* Subjects */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subjects</label>
                <div className="flex gap-2 mb-2">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setShowCustomSubjectInput(true);
                      } else {
                        addSubjectFromDropdown(e.target.value);
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  >
                    <option value="">Select subject to add...</option>
                    {subjectsList
                      .filter((s) => !formData.subjects.includes(s))
                      .map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    <option value="__custom__">+ Add Custom Subject</option>
                  </select>
                </div>
                {showCustomSubjectInput && (
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={subjectInput}
                      onChange={(e) => setSubjectInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubject(); } }}
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      placeholder="Type custom subject name"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={addSubject}
                      className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-xl hover:bg-indigo-200 text-sm font-medium"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCustomSubjectInput(false); setSubjectInput(''); }}
                      className="px-2 py-2 text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-100 text-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {formData.subjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formData.subjects.map((subj) => (
                      <span key={subj} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                        {subj}
                        <button type="button" onClick={() => removeSubject(subj)} className="hover:text-indigo-900">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Qualification</label>
                  <select
                    value={formData.qualification}
                    onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select</option>
                    <option value="PGT">PGT</option>
                    <option value="TGT">TGT</option>
                    <option value="PRT">PRT</option>
                    <option value="NTT">NTT</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payout Type</label>
                  <select
                    value={formData.rateType}
                    onChange={(e) => setFormData({ ...formData, rateType: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="per_class">Per Class</option>
                    <option value="per_hour">Per Hour</option>
                    <option value="monthly">Monthly Fixed</option>
                    <option value="hybrid">Hybrid (Monthly + Per Class)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(formData.rateType === 'per_class' || formData.rateType === 'per_hour' || formData.rateType === 'hybrid') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {formData.rateType === 'per_hour' ? 'Rate Per Hour (₹)' : 'Rate Per Class (₹)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formData.ratePerClass}
                      onChange={(e) => setFormData({ ...formData, ratePerClass: Number(e.target.value) })}
                      className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                )}
                {(formData.rateType === 'monthly' || formData.rateType === 'hybrid') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Salary (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.monthlyPayout}
                      onChange={(e) => setFormData({ ...formData, monthlyPayout: Number(e.target.value) })}
                      className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Availability Slots */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Weekly Availability</label>
                {formData.availableSlots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <select
                      value={slot.dayOfWeek}
                      onChange={(e) => {
                        const updated = [...formData.availableSlots];
                        updated[idx] = { ...updated[idx], dayOfWeek: Number(e.target.value) };
                        setFormData({ ...formData, availableSlots: updated });
                      }}
                      className="px-2 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    >
                      {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={(e) => {
                        const updated = [...formData.availableSlots];
                        updated[idx] = { ...updated[idx], startTime: e.target.value };
                        setFormData({ ...formData, availableSlots: updated });
                      }}
                      className="px-2 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    />
                    <span className="text-gray-400 text-sm">to</span>
                    <input
                      type="time"
                      value={slot.endTime}
                      onChange={(e) => {
                        const updated = [...formData.availableSlots];
                        updated[idx] = { ...updated[idx], endTime: e.target.value };
                        setFormData({ ...formData, availableSlots: updated });
                      }}
                      className="px-2 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, availableSlots: formData.availableSlots.filter((_, i) => i !== idx) })}
                      className="text-red-500 hover:text-red-700 text-sm px-2"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFormData({
                    ...formData,
                    availableSlots: [...formData.availableSlots, { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
                  })}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Add Availability Slot
                </button>
              </div>

              {/* Tutoring Settings */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-4 space-y-4 border border-indigo-100 dark:border-indigo-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">1-on-1 Tutoring</h3>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400">Allow students to request individual sessions</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, tutoringEnabled: !formData.tutoringEnabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        formData.tutoringEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.tutoringEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {formData.tutoringEnabled && (
                  <div className="pt-2 border-t border-indigo-100 dark:border-indigo-800">
                    <label className="block text-sm font-medium text-indigo-900 dark:text-indigo-100 mb-1">
                      Tutoring Credit Cost
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        value={formData.tutoringCreditCost}
                        onChange={(e) => setFormData({ ...formData, tutoringCreditCost: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-indigo-200 dark:border-indigo-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-500 font-medium">Credits</span>
                    </div>
                    <p className="text-[10px] text-indigo-500 mt-1">Cost per 1-on-1 session requested by students</p>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">Employee ID will be auto-generated (e.g., SCH-T-0001)</p>
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
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
                >
                  {creating ? 'Creating...' : 'Create Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Teacher Modal */}
      {editingTeacher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Edit Teacher</h2>
                  <p className="text-indigo-200 text-sm mt-0.5">{editingTeacher.firstName} {editingTeacher.lastName}</p>
                </div>
                <button onClick={() => setEditingTeacher(null)} className="text-white/80 hover:text-white">
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
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
                  <input type="text" required value={editFormData.lastName}
                    onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input type="tel" value={editFormData.phone}
                  onChange={(e) => {
                    let value = e.target.value;
                    value = value.replace(/[^0-9+]/g, '');
                    if (value.startsWith('+')) {
                      value = value.slice(0, 13);
                    } else {
                      value = value.slice(0, 10);
                    }
                    setEditFormData({ ...editFormData, phone: value });
                  }}
                  placeholder="+91 9876543210"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
              </div>
              {/* Subjects */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subjects</label>
                <div className="flex gap-2 mb-2">
                  <select value="" onChange={(e) => {
                    if (e.target.value === '__custom__') { setShowEditCustomSubject(true); }
                    else if (e.target.value && !editFormData.subjects.includes(e.target.value)) {
                      setEditFormData({ ...editFormData, subjects: [...editFormData.subjects, e.target.value] });
                    }
                  }} className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">Select subject to add...</option>
                    {subjectsList.filter(s => !editFormData.subjects.includes(s)).map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="__custom__">+ Add Custom Subject</option>
                  </select>
                </div>
                {showEditCustomSubject && (
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={editSubjectInput} onChange={(e) => setEditSubjectInput(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const trimmed = editSubjectInput.trim();
                          if (trimmed && !editFormData.subjects.includes(trimmed)) {
                            setEditFormData({ ...editFormData, subjects: [...editFormData.subjects, trimmed] });
                            if (!subjectsList.includes(trimmed)) {
                              try { await api.post<any>('/academic-config/subjects', { name: trimmed }); setSubjectsList(prev => [...prev, trimmed].sort()); } catch { }
                            }
                          }
                          setEditSubjectInput(''); setShowEditCustomSubject(false);
                        }
                      }}
                      placeholder="Custom subject name" autoFocus
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                    <button type="button" onClick={async () => {
                      const trimmed = editSubjectInput.trim();
                      if (trimmed && !editFormData.subjects.includes(trimmed)) {
                        setEditFormData({ ...editFormData, subjects: [...editFormData.subjects, trimmed] });
                        if (!subjectsList.includes(trimmed)) {
                          try { await api.post<any>('/academic-config/subjects', { name: trimmed }); setSubjectsList(prev => [...prev, trimmed].sort()); } catch { }
                        }
                      }
                      setEditSubjectInput(''); setShowEditCustomSubject(false);
                    }} className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-xl text-sm font-medium">Add</button>
                    <button type="button" onClick={() => { setShowEditCustomSubject(false); setEditSubjectInput(''); }} className="px-2 py-2 text-gray-500 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4" /></button>
                  </div>
                )}
                {editFormData.subjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {editFormData.subjects.map(s => (
                      <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                        {s}<button type="button" onClick={() => setEditFormData({ ...editFormData, subjects: editFormData.subjects.filter(x => x !== s) })}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Qualification</label>
                  <select value={editFormData.qualification} onChange={(e) => setEditFormData({ ...editFormData, qualification: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                    <option value="">Select</option>
                    <option value="PGT">PGT</option><option value="TGT">TGT</option>
                    <option value="PRT">PRT</option><option value="NTT">NTT</option><option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payout Type</label>
                  <select value={editFormData.rateType} onChange={(e) => setEditFormData({ ...editFormData, rateType: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                    <option value="per_class">Per Class</option><option value="per_hour">Per Hour</option>
                    <option value="monthly">Monthly Fixed</option><option value="hybrid">Hybrid</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(editFormData.rateType === 'per_class' || editFormData.rateType === 'per_hour' || editFormData.rateType === 'hybrid') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {editFormData.rateType === 'per_hour' ? 'Rate Per Hour (₹)' : 'Rate Per Class (₹)'}
                    </label>
                    <input type="number" min={0} value={editFormData.ratePerClass}
                      onChange={(e) => setEditFormData({ ...editFormData, ratePerClass: Number(e.target.value) })}
                      className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                  </div>
                )}
                {(editFormData.rateType === 'monthly' || editFormData.rateType === 'hybrid') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Salary (₹)</label>
                    <input type="number" min={0} value={editFormData.monthlyPayout}
                      onChange={(e) => setEditFormData({ ...editFormData, monthlyPayout: Number(e.target.value) })}
                      className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                  </div>
                )}
              </div>

              {/* Tutoring Settings */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-4 space-y-4 border border-indigo-100 dark:border-indigo-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">1-on-1 Tutoring</h3>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400">Allow students to request individual sessions</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, tutoringEnabled: !editFormData.tutoringEnabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        editFormData.tutoringEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        editFormData.tutoringEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {editFormData.tutoringEnabled && (
                  <div className="pt-2 border-t border-indigo-100 dark:border-indigo-800">
                    <label className="block text-sm font-medium text-indigo-900 dark:text-indigo-100 mb-1">
                      Tutoring Credit Cost
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        value={editFormData.tutoringCreditCost}
                        onChange={(e) => setEditFormData({ ...editFormData, tutoringCreditCost: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-indigo-200 dark:border-indigo-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-500 font-medium">Credits</span>
                    </div>
                    <p className="text-[10px] text-indigo-500 mt-1">Cost per 1-on-1 session requested by students</p>
                  </div>
                )}
              </div>
              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-800 text-sm whitespace-pre-line">{editError}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingTeacher(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={updating}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium">
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Availability Modal */}
      {editAvailTeacher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Edit Availability</h2>
                  <p className="text-amber-100 text-sm mt-0.5">
                    {editAvailTeacher.firstName} {editAvailTeacher.lastName}
                  </p>
                </div>
                <button onClick={() => setEditAvailTeacher(null)} className="text-white/80 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Define the weekly time slots when this teacher is available. Batch schedules must fit entirely within these windows.
              </p>

              {editSlots.map((slot, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={slot.dayOfWeek}
                    onChange={(e) => {
                      const updated = [...editSlots];
                      updated[idx] = { ...updated[idx], dayOfWeek: Number(e.target.value) };
                      setEditSlots(updated);
                    }}
                    className="px-2 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  >
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => {
                      const updated = [...editSlots];
                      updated[idx] = { ...updated[idx], startTime: e.target.value };
                      setEditSlots(updated);
                    }}
                    className="px-2 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  />
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => {
                      const updated = [...editSlots];
                      updated[idx] = { ...updated[idx], endTime: e.target.value };
                      setEditSlots(updated);
                    }}
                    className="px-2 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setEditSlots(editSlots.filter((_, i) => i !== idx))}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setEditSlots([...editSlots, { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }])}
                className="text-sm text-amber-600 hover:text-amber-800 font-medium"
              >
                + Add Slot
              </button>

              {availError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-800 text-sm whitespace-pre-line">{availError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditAvailTeacher(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAvailability}
                  disabled={savingAvail || editSlots.length === 0}
                  className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors font-medium"
                >
                  {savingAvail ? 'Saving...' : 'Save Availability'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onSuccess={loadTeachers}
        type="teachers"
        title="Teachers"
      />
    </div>
  );
};

export default TeachersPage;
