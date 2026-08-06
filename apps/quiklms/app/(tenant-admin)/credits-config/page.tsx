'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useBranding } from '@/app/providers';
import {
  CreditCard,
  Plus,
  Edit3,
  X,
  Loader2,
  AlertCircle,
  Package,
  ToggleLeft,
  ToggleRight,
  Send,
  Search,
  CheckCircle2,
  Coins,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CreditPackage {
  _id?: string;
  id?: string;
  name: string;
  credits: number;
  price: number;
  validityMonths?: number;
  isActive: boolean;
}

interface PackageFormData {
  name: string;
  credits: number;
  price: number;
  validityMonths: number;
  isActive: boolean;
}

interface StudentOption {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  grade?: string;
  section?: string;
  studentId?: string;
}

interface StudentBalance {
  available: number;
  totalPurchased: number;
  totalUsed: number;
  expiringSoon?: { credits: number; expiresAt: string } | null;
  packages?: {
    id: string;
    packageName: string;
    remainingCredits: number;
    purchasedCredits: number;
    expiresAt?: string;
    purchaseDate?: string;
  }[];
}

interface Transaction {
  _id: string;
  transactionType: string;
  amount: number;
  balanceAfter?: number;
  notes?: string;
  createdAt: string;
  relatedClassId?: { title?: string; startTime?: string };
}

const emptyForm: PackageFormData = {
  name: '',
  credits: 10,
  price: 5000,
  validityMonths: 6,
  isActive: true,
};

const TRANSACTION_STYLES: Record<string, { bg: string; text: string }> = {
  purchase: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  deduct: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
  refund: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  expire: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  adjustment: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
};

const formatDate = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ── Component ──────────────────────────────────────────────────────────────────

const CreditsConfigPage = () => {
  const { branding } = useBranding();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Students list
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [formData, setFormData] = useState<PackageFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Credit allocation
  const [allocStudentId, setAllocStudentId] = useState('');
  const [allocPackageId, setAllocPackageId] = useState('');
  const [allocNotes, setAllocNotes] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [allocMsg, setAllocMsg] = useState('');
  const [allocError, setAllocError] = useState('');

  // Balance lookup
  const [lookupStudentId, setLookupStudentId] = useState('');
  const [lookupBalance, setLookupBalance] = useState<StudentBalance | null>(null);
  const [lookupTransactions, setLookupTransactions] = useState<Transaction[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchPackages = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<any>('/credits/packages');
      const raw = Array.isArray(res) ? res : (res as any).packages ?? (res as any).data ?? [];
      const data = raw.map((p: any) => ({ ...p, _id: p.id || p._id }));
      setPackages(data);
    } catch (err: unknown) {
      setError((err as any)?.message || 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    try {
      setStudentsLoading(true);
      const res = await api.get<any>('/users', { params: { role: 'LEARNER' } });
      const data = (res.data as any)?.data ?? res.data ?? [];
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
    fetchStudents();
  }, [fetchPackages, fetchStudents]);

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingPackage(null);
    setFormData(emptyForm);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (pkg: CreditPackage) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      credits: pkg.credits,
      price: pkg.price,
      validityMonths: pkg.validityMonths || 6,
      isActive: pkg.isActive,
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSubmitForm = async () => {
    if (!formData.name.trim()) {
      setFormError('Package name is required');
      return;
    }
    if (formData.credits <= 0) {
      setFormError('Credits must be greater than 0');
      return;
    }
    if (formData.price < 0) {
      setFormError('Price must be 0 or greater');
      return;
    }
    const payload = {
      name: formData.name.trim(),
      credits: formData.credits,
      price: formData.price,
      validityMonths: formData.validityMonths,
      isActive: formData.isActive,
    };
    try {
      setSubmitting(true);
      setFormError('');
      if (editingPackage) {
        await api.patch<any>(`/credits/packages/${editingPackage._id}`, payload);
      } else {
        await api.post<any>('/credits/packages', payload);
      }
      setShowModal(false);
      fetchPackages();
    } catch (err: unknown) {
      setFormError((err as any)?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (pkg: CreditPackage) => {
    try {
      await api.patch<any>(`/credits/packages/${pkg._id}`, { isActive: !pkg.isActive });
      fetchPackages();
    } catch (err: unknown) {
      toast.error((err as any)?.message || 'Failed to update package');
    }
  };

  // ── Credit Allocation ──────────────────────────────────────────────────────

  const handleAllocate = async () => {
    if (!allocStudentId) {
      setAllocError('Please select a student');
      return;
    }
    if (!allocPackageId) {
      setAllocError('Please select a package');
      return;
    }
    const selectedPkg = packages.find((p) => p._id === allocPackageId);
    if (!selectedPkg) {
      setAllocError('Selected package not found');
      return;
    }
    try {
      setAllocating(true);
      setAllocError('');
      setAllocMsg('');
      await api.post<any>('/credits/allocate', {
        studentId: allocStudentId,
        packageName: selectedPkg.name,
        credits: selectedPkg.credits,
        price: selectedPkg.price,
        validityMonths: selectedPkg.validityMonths || 6,
        notes: allocNotes.trim() || undefined,
      });
      const studentInfo = students.find((s) => s._id === allocStudentId);
      const studentName = studentInfo ? `${studentInfo.firstName} ${studentInfo.lastName}` : 'student';
      setAllocMsg(`Successfully allocated ${selectedPkg.credits} credits (${selectedPkg.name}) to ${studentName}!`);
      setAllocStudentId('');
      setAllocPackageId('');
      setAllocNotes('');
    } catch (err: unknown) {
      setAllocError((err as any)?.message || 'Failed to allocate credits');
    } finally {
      setAllocating(false);
    }
  };

  // ── Balance Lookup ─────────────────────────────────────────────────────────

  const handleLookup = async () => {
    if (!lookupStudentId) {
      setLookupError('Please select a student');
      return;
    }
    try {
      setLookupLoading(true);
      setLookupError('');
      setLookupBalance(null);
      setLookupTransactions([]);

      const [balRes, txRes] = await Promise.allSettled([
        api.get<any>(`/credits/student/${lookupStudentId}/balance`),
        api.get<any>(`/credits/student/${lookupStudentId}/transactions`),
      ]);

      if (balRes.status === 'fulfilled') {
        const b = (balRes.value as any);
        setLookupBalance({
          available: b.available ?? 0,
          totalPurchased: b.totalPurchased ?? 0,
          totalUsed: b.totalUsed ?? 0,
          expiringSoon: b.expiringSoon ?? null,
          packages: b.packages ?? [],
        });
      } else {
        setLookupError('Failed to fetch balance');
      }

      if (txRes.status === 'fulfilled') {
        const data = (txRes.value as any);
        const txList = Array.isArray(data) ? data : data.transactions ?? data.data ?? [];
        setLookupTransactions(txList);
      }
    } catch (err: unknown) {
      setLookupError((err as any)?.message || 'Failed to look up balance');
    } finally {
      setLookupLoading(false);
    }
  };

  // ── Student name helper ───────────────────────────────────────────────────

  const getStudentLabel = (s: StudentOption) => {
    const name = `${s.firstName} ${s.lastName}`.trim();
    const extras: string[] = [];
    if (s.grade) extras.push(`Grade ${s.grade}${s.section ? `-${s.section}` : ''}`);
    if (s.email) extras.push(s.email);
    return extras.length > 0 ? `${name} (${extras.join(' | ')})` : name;
  };

  const selectedLookupStudent = students.find((s) => s._id === lookupStudentId);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mb-6"
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
              <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Class Credits</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Manage your class credits and packages</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 border border-white/30"
          >
            <Plus className="w-5 h-5" />
            Create Package
          </button>
        </div>
      </div>

      {/* ═══════════════ CREDIT PACKAGES SECTION ═══════════════ */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-indigo-500" />
          Credit Packages
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="ml-3 text-gray-500 dark:text-gray-400">Loading...</span>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-8 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
            <button
              onClick={fetchPackages}
              className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl hover:bg-red-200 transition"
            >
              Retry
            </button>
          </div>
        ) : packages.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Packages Yet</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Create credit packages that you can allocate to students after receiving offline payment.
            </p>
            <button
              onClick={openCreate}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition"
            >
              <Plus className="w-5 h-5" />
              Create First Package
            </button>
          </div>
        ) : (
          <>
            {/* Active Packages */}
            {packages.filter((p) => p.isActive !== false).length > 0 && (
              <div className="mb-8">
                <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4">Active Packages</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                  {packages.filter((p) => p.isActive !== false).map((pkg) => (
                    <div
                      key={pkg._id}
                      className="group bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                    >
                      <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                      <div className="p-6 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{pkg.name}</h3>
                          </div>
                          <span className="shrink-0 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Active
                          </span>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                            <span className="flex items-center gap-1.5">
                              <Coins className="w-4 h-4 text-indigo-500" />
                              Credits
                            </span>
                            <span className="font-bold text-lg text-indigo-600 dark:text-indigo-400">{pkg.credits}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                            <span>Price</span>
                            <span className="font-semibold">₹{pkg.price}</span>
                          </div>
                          {pkg.validityMonths && (
                            <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                              <span>Validity</span>
                              <span className="font-semibold">{pkg.validityMonths} months</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                          <button
                            onClick={() => openEdit(pkg)}
                            className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(pkg)}
                            className="flex items-center gap-1.5 text-sm font-medium transition px-3 py-1.5 rounded-lg ml-auto text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <ToggleRight className="w-4 h-4" />
                            Deactivate
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deactivated Packages */}
            {packages.filter((p) => p.isActive === false).length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4">Deactivated Packages</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                  {packages.filter((p) => p.isActive === false).map((pkg) => (
                    <div
                      key={pkg._id}
                      className="group bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden opacity-60"
                    >
                      <div className="h-2 bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700" />
                      <div className="p-6 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{pkg.name}</h3>
                          </div>
                          <span className="shrink-0 text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                            Inactive
                          </span>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                            <span className="flex items-center gap-1.5">
                              <Coins className="w-4 h-4 text-indigo-500" />
                              Credits
                            </span>
                            <span className="font-bold text-lg text-indigo-600 dark:text-indigo-400">{pkg.credits}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                            <span>Price</span>
                            <span className="font-semibold">₹{pkg.price}</span>
                          </div>
                          {pkg.validityMonths && (
                            <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                              <span>Validity</span>
                              <span className="font-semibold">{pkg.validityMonths} months</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                          <button
                            onClick={() => openEdit(pkg)}
                            className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(pkg)}
                            className="flex items-center gap-1.5 text-sm font-medium transition px-3 py-1.5 rounded-lg ml-auto text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          >
                            <ToggleLeft className="w-4 h-4" />
                            Activate
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════ ALLOCATE CREDITS SECTION ═══════════════ */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
          <Send className="w-5 h-5 text-indigo-500" />
          Allocate Credits to Student
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          After receiving offline payment from a parent, allocate credits to their child below.
        </p>

        {allocMsg && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {allocMsg}
          </div>
        )}
        {allocError && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {allocError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Student Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Student <span className="text-red-500">*</span>
            </label>
            {studentsLoading ? (
              <div className="flex items-center gap-2 h-[46px] text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : (
              <select
                value={allocStudentId}
                onChange={(e) => setAllocStudentId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
              >
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s._id} value={s._id}>
                    {getStudentLabel(s)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Package Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Package <span className="text-red-500">*</span>
            </label>
            <select
              value={allocPackageId}
              onChange={(e) => setAllocPackageId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
            >
              <option value="">Select package</option>
              {packages.filter((p) => p.isActive).map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.credits} credits — ₹{p.price})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Payment Notes
            </label>
            <input
              type="text"
              value={allocNotes}
              onChange={(e) => setAllocNotes(e.target.value)}
              placeholder="e.g. Cash received, Receipt #123"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* Submit Button */}
          <div className="flex items-end">
            <button
              onClick={handleAllocate}
              disabled={allocating}
              className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition"
            >
              {allocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Allocate Credits
            </button>
          </div>
        </div>

        {/* Allocation Flow Info */}
        <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800">
          <h4 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-2">How Credit Allocation Works</h4>
          <ol className="text-xs text-indigo-600 dark:text-indigo-400 space-y-1 list-decimal list-inside">
            <li>Parent pays the school admin offline (cash, bank transfer, etc.)</li>
            <li>Admin selects the student and a credit package, then clicks &quot;Allocate Credits&quot;</li>
            <li>Credits are added to the student&apos;s account with an expiry date</li>
            <li>When the teacher marks attendance (Present / Late), 1 credit is auto-deducted (soonest-expiring first)</li>
            <li>Parents can view their child&apos;s credit balance and transaction history in their dashboard</li>
          </ol>
        </div>
      </div>

      {/* ═══════════════ STUDENT BALANCE LOOKUP SECTION ═══════════════ */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-indigo-500" />
          Student Balance &amp; History
        </h2>

        {lookupError && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {lookupError}
          </div>
        )}

        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Student</label>
            {studentsLoading ? (
              <div className="flex items-center gap-2 h-[46px] text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : (
              <select
                value={lookupStudentId}
                onChange={(e) => {
                  setLookupStudentId(e.target.value);
                  setLookupBalance(null);
                  setLookupTransactions([]);
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
              >
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s._id} value={s._id}>
                    {getStudentLabel(s)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button
            onClick={handleLookup}
            disabled={lookupLoading || !lookupStudentId}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition"
          >
            {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Check Balance
          </button>
        </div>

        {/* Balance Results */}
        {lookupBalance && (
          <div className="mt-6 space-y-6">
            {/* Balance Summary Cards */}
            <div>
              {selectedLookupStudent && (
                <h3 className="text-md font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  {selectedLookupStudent.firstName} {selectedLookupStudent.lastName}
                  {selectedLookupStudent.grade && (
                    <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">Grade {selectedLookupStudent.grade}</span>
                  )}
                </h3>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 text-center">
                  <Coins className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{lookupBalance.available}</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Available Credits</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 text-center">
                  <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{lookupBalance.totalPurchased}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Total Purchased</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center">
                  <TrendingDown className="w-5 h-5 text-red-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-red-700 dark:text-red-300">{lookupBalance.totalUsed}</p>
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">Used</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 text-center">
                  <AlertTriangle className="w-5 h-5 text-orange-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{lookupBalance.expiringSoon?.credits ?? 0}</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Expiring Soon</p>
                  {lookupBalance.expiringSoon?.expiresAt && (
                    <p className="text-[10px] text-orange-500 mt-0.5">by {formatDate(lookupBalance.expiringSoon.expiresAt)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Low Credit Warning */}
            {lookupBalance.available <= 3 && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-amber-700 dark:text-amber-300 text-sm font-medium">
                  Low credit balance! This student has only {lookupBalance.available} credit{lookupBalance.available !== 1 ? 's' : ''} remaining. Notify the parent to make a payment.
                </p>
              </div>
            )}

            {/* Active Package Breakdown */}
            {lookupBalance.packages && lookupBalance.packages.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Active Packages</h4>
                <div className="space-y-2">
                  {lookupBalance.packages.map((pkg) => (
                    <div key={pkg.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm">
                      <div>
                        <span className="font-medium text-gray-800 dark:text-gray-200">{pkg.packageName}</span>
                        <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">
                          Purchased {formatDate(pkg.purchaseDate || '')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{pkg.remainingCredits}/{pkg.purchasedCredits}</span>
                        {pkg.expiresAt && (
                          <span className="text-xs text-gray-400">Expires {formatDate(pkg.expiresAt)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transaction History */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Transaction History</h4>
              {lookupTransactions.length === 0 ? (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 text-center">
                  <Clock className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No transactions yet</p>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-600">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Type</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Credits</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Balance</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 hidden md:table-cell">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lookupTransactions.slice(0, 20).map((tx) => {
                          const txType = tx.transactionType || 'adjustment';
                          const style = TRANSACTION_STYLES[txType] || TRANSACTION_STYLES.adjustment;
                          const isPositive = txType === 'purchase' || txType === 'refund';
                          return (
                            <tr key={tx._id} className="border-b border-gray-100 dark:border-gray-600/50">
                              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 text-xs">{formatDate(tx.createdAt)}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${style.bg} ${style.text}`}>
                                  {txType}
                                </span>
                              </td>
                              <td className={`px-4 py-2.5 text-right font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                {tx.amount > 0 ? '+' : ''}{tx.amount}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">
                                {tx.balanceAfter !== undefined ? tx.balanceAfter : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell max-w-[200px] truncate text-xs">
                                {tx.notes || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {lookupTransactions.length > 20 && (
                    <p className="text-center text-xs text-gray-400 py-2">Showing first 20 of {lookupTransactions.length} transactions</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════ CREATE / EDIT MODAL ═══════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 flex items-center justify-between p-6 pb-4 border-b border-gray-100 dark:border-gray-700 rounded-t-3xl">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingPackage ? 'Edit Package' : 'Create Package'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Package Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. 10 Class Pack"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Credits <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.credits}
                    onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Validity (months) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.validityMonths}
                    onChange={(e) => setFormData({ ...formData, validityMonths: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  />
                </div>
                <div className="flex items-center justify-between pt-7">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                    className={formData.isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}
                  >
                    {formData.isActive ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitForm}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingPackage ? 'Save' : 'Create Package'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditsConfigPage;
