'use client';

import { useEffect, useState } from 'react';
import { GraduationCap, Search, CreditCard, BookOpen, Plus, X, ToggleLeft, ToggleRight, Upload, Edit3 } from 'lucide-react';
import { api } from '@/lib/api';
import BulkUploadModal from '@/components/BulkUploadModal';
import { useBranding } from '@/app/providers';

interface Student {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  grade?: string;
  section?: string;
  studentId?: string;
  isActive: boolean;
  parentIds?: string[];
  profilePicture?: string;
  profilePictureUrl?: string;
}

interface Parent {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface CreateStudentForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  grade: string;
  section: string;
  studentId: string;
  parentIds: string[];
  skipEmail: boolean;
}

const GRADE_OPTIONS = ['LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const SECTION_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];

const StudentsPage = () => {
  const { branding } = useBranding();
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [sections, setSections] = useState<string[]>(SECTION_OPTIONS);

  // Modal state
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit student modal state
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editFormData, setEditFormData] = useState<CreateStudentForm>({
    firstName: '', lastName: '', email: '', phone: '', grade: '',
    section: '', studentId: '', parentIds: [], skipEmail: false,
  });
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateStudentForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    grade: '',
    section: '',
    studentId: '',
    parentIds: [],
    skipEmail: false,
  });

  useEffect(() => {
    loadStudents();
    loadParents();
    loadSections();
  }, []);

  const loadStudents = async () => {
    try {
      const res = await api.get<any>('/users');
      const allUsers = (res as any)?.data?.data || (res as any)?.data || [];
      const studentUsers = allUsers.filter((u: any) => u.role === 'LEARNER');
      setStudents(studentUsers);
    } catch (err: any) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadParents = async () => {
    try {
      const res = await api.get<any>('/users');
      const allUsers = (res as any)?.data?.data || (res as any)?.data || [];
      const parentUsers = allUsers.filter((u: any) => u.role === 'PARENT');
      setParents(parentUsers);
    } catch (err: any) {
      console.error('Failed to load parents:', err);
    }
  };

  const loadSections = async () => {
    try {
      const res = await api.get<any>('/academic-config/sections');
      const data = (res as any)?.data;
      if (Array.isArray(data) && data.length > 0) {
        setSections(data);
      }
    } catch {
      // Keep defaults
    }
  };

  const toggleActive = async (studentId: string, isActive: boolean) => {
    try {
      await api.patch<any>(`/users/${studentId}/toggle-active`, { isActive: !isActive });
      setStudents((prev) =>
        prev.map((s) => (s._id === studentId ? { ...s, isActive: !isActive } : s))
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
      grade: '',
      section: '',
      studentId: '',
      parentIds: [],
      skipEmail: false,
    });
    setError(null);
    setShowCreateModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const userStr = sessionStorage.getItem('user');
      const currentUser = userStr ? JSON.parse(userStr) : null;
      const orgId = currentUser?.orgId;

      if (!orgId) {
        setError('Tenant ID not found. Please log out and log in again.');
        setCreating(false);
        return;
      }

      if (!formData.firstName || !formData.lastName) {
        setError('First Name and Last Name are required.');
        setCreating(false);
        return;
      }

      // If skipEmail and no email, generate a placeholder
      const email = formData.skipEmail && !formData.email
        ? `student_${Date.now()}@noemail.placeholder`
        : formData.email;

      if (!email) {
        setError('Email is required unless "No Email" is checked.');
        setCreating(false);
        return;
      }

      const secureRandomPass = crypto.randomUUID().slice(0, 16) + 'A1!';
      const payload: any = {
        email,
        password: secureRandomPass,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: 'LEARNER',
        orgId,
        grade: formData.grade || undefined,
        section: formData.section || undefined,
        studentId: formData.studentId || undefined,
        skipEmail: formData.skipEmail,
        guardianContact: formData.phone || undefined,
        phone: formData.phone || undefined,
      };

      if (formData.parentIds.length > 0) {
        payload.childrenIds = formData.parentIds;
      }

      await api.post<any>('/auth/register', payload);
      setShowCreateModal(false);
      loadStudents();
    } catch (err: any) {
      const msg = err?.message;
      setError(Array.isArray(msg) ? msg.join('\n') : msg || 'Failed to create student');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setEditFormData({
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email.includes('@noemail.placeholder') ? '' : student.email,
      phone: student.phone || '',
      grade: student.grade || '',
      section: student.section || '',
      studentId: student.studentId || '',
      parentIds: student.parentIds || [],
      skipEmail: student.email.includes('@noemail.placeholder'),
    });
    setEditError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setUpdating(true);
    setEditError(null);
    try {
      const res = await api.patch<any>(`/users/${editingStudent._id}`, {
        firstName: editFormData.firstName,
        lastName: editFormData.lastName,
        grade: editFormData.grade || undefined,
        section: editFormData.section || undefined,
        studentId: editFormData.studentId || undefined,
        parentIds: editFormData.parentIds.length > 0 ? editFormData.parentIds : undefined,
        phone: editFormData.phone || undefined,
        guardianContact: editFormData.phone || undefined,
      });
      // Use the server-returned record so displayed data always matches DB
      const updated = (res as any)?.data;
      setStudents(prev => prev.map(s => s._id === editingStudent._id
        ? updated
          ? { ...s, ...updated }
          : {
              ...s,
              firstName: editFormData.firstName,
              lastName: editFormData.lastName,
              grade: editFormData.grade,
              section: editFormData.section,
              studentId: editFormData.studentId,
              parentIds: editFormData.parentIds,
              phone: editFormData.phone || s.phone,
            }
        : s,
      ));
      setEditingStudent(null);
    } catch (err: any) {
      const msg = err?.message;
      setEditError(Array.isArray(msg) ? msg.join('\n') : msg || 'Failed to update student');
    } finally {
      setUpdating(false);
    }
  };

  const grades = [...new Set(students.map(s => s.grade).filter(Boolean))].sort() as string[];

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      !searchQuery ||
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.studentId && s.studentId.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesGrade = !gradeFilter || s.grade === gradeFilter;
    const matchesActive = showInactive || s.isActive;
    return matchesSearch && matchesGrade && matchesActive;
  });

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
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
              <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Student Management</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Manage enrolled students and their records</p>
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
              Add Student
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{students.filter(s => s.isActive).length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active Students</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{grades.length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Grades</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {students.filter(s => (s.parentIds?.length || 0) > 0).length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">With Parents Linked</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 min-w-0 sm:min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          {grades.length > 0 && (
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">All Grades</option>
              {grades.map((g) => (
                <option key={g} value={g}>Grade {g}</option>
              ))}
            </select>
          )}
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

      {/* Students Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-12">
            <GraduationCap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">No students found</p>
            <button onClick={openCreateModal} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" />
              Add First Student
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Student</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Grade</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Section</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Student ID</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredStudents.map((student) => (
                  <tr key={student._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                          {student.profilePicture ? (
                            <img src={student.profilePictureUrl || student.profilePicture} alt="" className="w-10 h-10 rounded-full object-contain bg-white" />
                          ) : (
                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                              {student.firstName.charAt(0)}{student.lastName.charAt(0)}
                            </span>
                          )}
                        </div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {student.firstName} {student.lastName}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {student.email.includes('@noemail.placeholder') ? (
                        <span className="text-gray-400 italic">No email</span>
                      ) : (
                        student.email
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{student.grade || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{student.section || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{student.studentId || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        student.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {student.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(student)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                          title="Edit Student"
                        >
                          <Edit3 className="w-4 h-4 text-indigo-600" />
                        </button>
                        <button
                          onClick={() => toggleActive(student._id, student.isActive)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title={student.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {student.isActive ? (
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

      {/* Create Student Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Add New Student</h2>
                  <p className="text-indigo-200 text-sm mt-0.5">Enrol a student into your school</p>
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
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Last name"
                  />
                </div>
              </div>

              {/* Email + skipEmail toggle */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email {!formData.skipEmail && '*'}
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.skipEmail}
                      onChange={(e) => setFormData({ ...formData, skipEmail: e.target.checked, email: '' })}
                      className="rounded w-3.5 h-3.5"
                    />
                    No email (young student)
                  </label>
                </div>
                {!formData.skipEmail ? (
                  <input
                    type="email"
                    required={!formData.skipEmail}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="student@example.com"
                    autoComplete="new-password"
                  />
                ) : (
                  <div className="px-3 py-2.5 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-400 text-sm">
                    Student will be created without email login
                  </div>
                )}
              </div>

              {!formData.skipEmail && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-sm text-blue-800">A &quot;Set Password&quot; link will be emailed to the student. No temporary password is generated.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number (optional)</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    let value = e.target.value;
                    // Allow only numbers and +
                    value = value.replace(/[^0-9+]/g, '');
                    // If starts with + → max 13 digits
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
                <p className="text-xs text-gray-400 mt-1">Used for class reminders via SMS</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grade</label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select Grade</option>
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>{g === 'LKG' || g === 'UKG' ? g : `Grade ${g}`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Section</label>
                  <select
                    value={formData.section}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select Section</option>
                    {sections.map((s) => (
                      <option key={s} value={s}>Section {s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">Student ID will be auto-generated (e.g., SCH-S-0001)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Link Parents <span className="text-gray-400 font-normal">(optional)</span>
                  {formData.parentIds.length > 0 && <span className="ml-1 text-indigo-600 dark:text-indigo-400">{formData.parentIds.length} selected</span>}
                </label>
                <div className="border border-gray-200 dark:border-gray-600 rounded-xl max-h-40 overflow-y-auto divide-y">
                  {parents.length === 0 ? (
                    <p className="text-center py-4 text-gray-500 text-sm">No parents available</p>
                  ) : parents.map((p) => (
                    <button
                      type="button"
                      key={p._id}
                      onClick={() => {
                        const ids = formData.parentIds.includes(p._id)
                          ? formData.parentIds.filter(id => id !== p._id)
                          : [...formData.parentIds, p._id];
                        setFormData({ ...formData, parentIds: ids });
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-2 text-sm ${
                        formData.parentIds.includes(p._id) ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        formData.parentIds.includes(p._id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                      }`}>
                        {formData.parentIds.includes(p._id) && <span className="text-white text-xs">&#10003;</span>}
                      </div>
                      <span className="text-gray-900 dark:text-gray-100">{p.firstName} {p.lastName}</span>
                      <span className="text-gray-500 text-xs">({p.email})</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">You can also link parents later from the Parents page</p>
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
                  {creating ? 'Creating...' : 'Create Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Edit Student</h2>
                  <p className="text-indigo-200 text-sm mt-0.5">{editingStudent.firstName} {editingStudent.lastName}</p>
                </div>
                <button onClick={() => setEditingStudent(null)} className="text-white/80 hover:text-white">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone (optional)</label>
                <input type="tel" value={editFormData.phone}
                  onChange={(e) => {
                    let value = e.target.value;
                    // Allow only numbers and +
                    value = value.replace(/[^0-9+]/g, '');
                    // If starts with + → max 13 digits
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grade</label>
                  <select value={editFormData.grade} onChange={(e) => setEditFormData({ ...editFormData, grade: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                    <option value="">Select Grade</option>
                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g === 'LKG' || g === 'UKG' ? g : `Grade ${g}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Section</label>
                  <select value={editFormData.section} onChange={(e) => setEditFormData({ ...editFormData, section: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                    <option value="">Select Section</option>
                    {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
                  </select>
                </div>
              </div>
              {/* Link Parents */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Linked Parents <span className="text-gray-400 font-normal">(optional)</span>
                  {editFormData.parentIds.length > 0 && <span className="ml-1 text-indigo-600 dark:text-indigo-400">{editFormData.parentIds.length} selected</span>}
                </label>
                <div className="border border-gray-200 dark:border-gray-600 rounded-xl max-h-40 overflow-y-auto divide-y">
                  {parents.length === 0 ? (
                    <p className="text-center py-4 text-gray-500 text-sm">No parents available</p>
                  ) : parents.map(p => (
                    <button type="button" key={p._id}
                      onClick={() => {
                        const ids = editFormData.parentIds.includes(p._id)
                          ? editFormData.parentIds.filter(id => id !== p._id)
                          : [...editFormData.parentIds, p._id];
                        setEditFormData({ ...editFormData, parentIds: ids });
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-2 text-sm ${editFormData.parentIds.includes(p._id) ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${editFormData.parentIds.includes(p._id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                        {editFormData.parentIds.includes(p._id) && <span className="text-white text-xs">&#10003;</span>}
                      </div>
                      <span className="text-gray-900 dark:text-gray-100">{p.firstName} {p.lastName}</span>
                      <span className="text-gray-500 text-xs">({p.email})</span>
                    </button>
                  ))}
                </div>
              </div>
              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-800 text-sm whitespace-pre-line">{editError}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingStudent(null)}
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

      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onSuccess={loadStudents}
        type="students"
        title="Students"
      />
    </div>
  );
};

export default StudentsPage;
