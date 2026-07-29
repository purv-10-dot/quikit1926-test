'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  DollarSign,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Send,
  CheckCircle2,
  XCircle,
  CreditCard,
  X,
  TrendingUp,
  Clock,
  BadgeCheck,
  Banknote,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CompletedClass {
  _id?: string;
  title?: string;
  startTime?: string;
  batchId?: { _id?: string; name?: string; grade?: string; subject?: string } | string;
}

interface Adjustment {
  _id?: string;
  reason?: string;
  description?: string;
  amount: number;
  type: 'bonus' | 'deduction' | 'reimbursement';
  createdAt?: string;
}

interface Payout {
  _id: string;
  teacherId: { _id: string; firstName?: string; lastName?: string; email?: string } | string;
  periodStart?: string;
  periodEnd?: string;
  totalClassesCompleted?: number;
  grossAmount?: number;
  netAmount?: number;
  ratePerClass?: number;
  rateType?: string;
  completedClassIds?: CompletedClass[];
  month: number;
  year: number;
  totalClasses: number;
  completedClasses: number;
  baseAmount: number;
  adjustments: Adjustment[];
  finalAmount: number;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'paid';
  rejectionReason?: string;
  paymentReference?: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const ADJUSTMENT_STYLES: Record<string, string> = {
  bonus: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  deduction: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  reimbursement: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

// Static, full class strings so Tailwind's JIT does not purge dynamically-built
// names like `bg-${color}-100`. Each stat card looks up its icon wrapper / icon
// colour classes here.
const STAT_COLOR_STYLES: Record<string, { iconWrap: string; icon: string }> = {
  indigo: { iconWrap: 'bg-indigo-100 dark:bg-indigo-900/30', icon: 'text-indigo-600 dark:text-indigo-400' },
  purple: { iconWrap: 'bg-purple-100 dark:bg-purple-900/30', icon: 'text-purple-600 dark:text-purple-400' },
  blue: { iconWrap: 'bg-blue-100 dark:bg-blue-900/30', icon: 'text-blue-600 dark:text-blue-400' },
  yellow: { iconWrap: 'bg-yellow-100 dark:bg-yellow-900/30', icon: 'text-yellow-600 dark:text-yellow-400' },
  emerald: { iconWrap: 'bg-emerald-100 dark:bg-emerald-900/30', icon: 'text-emerald-600 dark:text-emerald-400' },
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const currentDate = new Date();
const currentMonth = currentDate.getMonth() + 1;
const currentYear = currentDate.getFullYear();

// ── Component ──────────────────────────────────────────────────────────────────

const PayoutsPage = () => {
  const { branding } = useBranding();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Generate payouts
  const [generating, setGenerating] = useState(false);
  const [perClassRate, setPerClassRate] = useState(500);

  // Adjustment form
  const [adjDesc, setAdjDesc] = useState('');
  const [adjAmount, setAdjAmount] = useState<number>(0);
  const [adjType, setAdjType] = useState<'bonus' | 'deduction' | 'reimbursement'>('bonus');
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  // Reject modal
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Pay modal
  const [payModalId, setPayModalId] = useState<string | null>(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [paying, setPaying] = useState(false);

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const mapPayout = (p: any): Payout => {
    const periodStart = p.periodStart ? new Date(p.periodStart) : null;
    return {
      ...p,
      month: p.month ?? (periodStart ? periodStart.getMonth() + 1 : 0),
      year: p.year ?? (periodStart ? periodStart.getFullYear() : 0),
      totalClasses: p.totalClasses ?? p.totalClassesCompleted ?? 0,
      completedClasses: p.completedClasses ?? p.totalClassesCompleted ?? 0,
      baseAmount: p.baseAmount ?? p.grossAmount ?? 0,
      finalAmount: p.finalAmount ?? p.netAmount ?? 0,
      adjustments: (p.adjustments || []).map((a: any) => ({
        ...a,
        description: a.description || a.reason || '',
      })),
    };
  };

  const fetchPayouts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<any>(`/payouts?month=${selectedMonth}&year=${selectedYear}`);
      const raw = Array.isArray(res) ? res : res.payouts ?? res.data ?? [];
      setPayouts(raw.map(mapPayout));
    } catch (err: any) {
      setError(err?.message || 'Failed to load payouts');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getTeacherName = (teacher: Payout['teacherId']) => {
    if (typeof teacher === 'object' && teacher) {
      const t = teacher as any;
      const name = `${t.firstName || ''} ${t.lastName || ''}`.trim();
      return name || t.name || t.email || 'Unknown';
    }
    return typeof teacher === 'string' ? teacher : 'Unknown';
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const totalAdjustments = (adjustments: Adjustment[]) =>
    adjustments.reduce((sum, a) => sum + (a.type === 'deduction' ? -a.amount : a.amount), 0);

  // ── Summary Stats ──────────────────────────────────────────────────────────

  const stats = {
    total: payouts.length,
    totalAmount: payouts.reduce((s, p) => s + p.finalAmount, 0),
    approved: payouts.filter((p) => p.status === 'approved').length,
    pending: payouts.filter((p) => p.status === 'pending').length,
    paid: payouts.filter((p) => p.status === 'paid').length,
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      await api.post<any>('/payouts/generate', { month: selectedMonth, year: selectedYear, perClassRate });
      fetchPayouts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate payouts');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddAdjustment = async (payoutId: string) => {
    if (!adjDesc.trim() || adjAmount <= 0) return;
    try {
      setAdjSubmitting(true);
      await api.post<any>(`/payouts/${payoutId}/adjustment`, {
        reason: adjDesc,
        amount: adjAmount,
        type: adjType,
      });
      setAdjDesc('');
      setAdjAmount(0);
      setAdjType('bonus');
      fetchPayouts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add adjustment');
    } finally {
      setAdjSubmitting(false);
    }
  };

  const handleSubmitForApproval = async (id: string) => {
    try {
      setActionLoading(id);
      await api.patch<any>(`/payouts/${id}/submit`);
      fetchPayouts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      setActionLoading(id);
      await api.patch<any>(`/payouts/${id}/approve`);
      fetchPayouts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModalId || !rejectReason.trim()) return;
    try {
      setRejecting(true);
      await api.patch<any>(`/payouts/${rejectModalId}/reject`, { reason: rejectReason });
      setRejectModalId(null);
      setRejectReason('');
      fetchPayouts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject');
    } finally {
      setRejecting(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!payModalId) return;
    try {
      setPaying(true);
      await api.patch<any>(`/payouts/${payModalId}/pay`, { paymentMethod: 'bank_transfer', paymentReference: paymentRef || 'N/A' });
      setPayModalId(null);
      setPaymentRef('');
      fetchPayouts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark paid');
    } finally {
      setPaying(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Teacher Payouts</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Manage monthly teacher payments</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {!loading && !error && payouts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {[
            { label: 'Total Payouts', value: stats.total, icon: TrendingUp, color: 'indigo' },
            { label: 'Total Amount', value: formatCurrency(stats.totalAmount), icon: DollarSign, color: 'purple' },
            { label: 'Approved', value: stats.approved, icon: BadgeCheck, color: 'blue' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'yellow' },
            { label: 'Paid', value: stats.paid, icon: Banknote, color: 'emerald' },
          ].map((s) => {
            const colorStyle = STAT_COLOR_STYLES[s.color] ?? STAT_COLOR_STYLES.indigo;
            return (
            <div
              key={s.label}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${colorStyle.iconWrap} flex items-center justify-center`}>
                  <s.icon className={`w-5 h-5 ${colorStyle.icon}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Controls: Month/Year Selector + Generate */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex flex-wrap gap-2 sm:gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
            >
              {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          <div className="flex items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Per Class Rate</label>
              <input
                type="number"
                min={0}
                value={perClassRate}
                onChange={(e) => setPerClassRate(Number(e.target.value))}
                className="w-32 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
              Generate Payouts
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">Loading...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          <button onClick={fetchPayouts} className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl hover:bg-red-200 transition">
            Retry
          </button>
        </div>
      ) : payouts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-12 text-center">
          <DollarSign className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Payouts Found</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            No payouts exist for {MONTHS[selectedMonth - 1]} {selectedYear}. Use the &quot;Generate Payouts&quot; button to create them.
          </p>
        </div>
      ) : (
        /* Payout Table */
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">Teacher</th>
                  <th className="text-center px-4 py-4 font-semibold text-gray-600 dark:text-gray-300">Total Classes</th>
                  <th className="text-center px-4 py-4 font-semibold text-gray-600 dark:text-gray-300">Completed Classes</th>
                  <th className="text-right px-4 py-4 font-semibold text-gray-600 dark:text-gray-300">Base Amount</th>
                  <th className="text-right px-4 py-4 font-semibold text-gray-600 dark:text-gray-300">Adjustments</th>
                  <th className="text-right px-4 py-4 font-semibold text-gray-600 dark:text-gray-300">Final Amount</th>
                  <th className="text-center px-4 py-4 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => {
                  const isExpanded = expandedId === payout._id;
                  const adjTotal = totalAdjustments(payout.adjustments);

                  return (
                    <Fragment key={payout._id}>
                      <tr
                        className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition"
                        onClick={() => setExpandedId(isExpanded ? null : payout._id)}
                      >
                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                          {getTeacherName(payout.teacherId)}
                        </td>
                        <td className="px-4 py-4 text-center text-gray-600 dark:text-gray-300">{payout.totalClasses}</td>
                        <td className="px-4 py-4 text-center text-gray-600 dark:text-gray-300">{payout.completedClasses}</td>
                        <td className="px-4 py-4 text-right text-gray-600 dark:text-gray-300">{formatCurrency(payout.baseAmount)}</td>
                        <td className={`px-4 py-4 text-right font-medium ${adjTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {adjTotal >= 0 ? '+' : ''}{formatCurrency(adjTotal)}
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-gray-900 dark:text-gray-100">{formatCurrency(payout.finalAmount)}</td>
                        <td className="px-4 py-4 text-center">
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${STATUS_STYLES[payout.status]}`}>
                            {payout.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400 inline" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400 inline" />
                          )}
                        </td>
                      </tr>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="px-6 py-6 bg-gray-50/50 dark:bg-gray-900/30">
                            <div className="space-y-6">
                              {/* Completed Classes */}
                              {payout.completedClassIds && payout.completedClassIds.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Completed Classes</h4>
                                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Date</th>
                                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Title</th>
                                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Batch / Subject</th>
                                          <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {payout.completedClassIds.map((cls, i) => {
                                          const batch = typeof cls.batchId === 'object' ? cls.batchId : null;
                                          return (
                                            <tr key={cls._id || i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                                              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{cls.startTime ? formatDate(cls.startTime) : '—'}</td>
                                              <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100 font-medium">{cls.title || 'Class'}</td>
                                              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{batch?.name || ''}{batch?.subject ? ` · ${batch.subject}` : ''}</td>
                                              <td className="px-4 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100">
                                                {payout.rateType === 'monthly' ? '—' : formatCurrency(payout.ratePerClass || 0)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Adjustments */}
                              <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Adjustments</h4>
                                {payout.adjustments.length > 0 ? (
                                  <div className="space-y-2 mb-4">
                                    {payout.adjustments.map((adj, i) => (
                                      <div
                                        key={adj._id || i}
                                        className="flex items-center justify-between bg-white dark:bg-gray-800 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700"
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${ADJUSTMENT_STYLES[adj.type]}`}>
                                            {adj.type}
                                          </span>
                                          <span className="text-sm text-gray-700 dark:text-gray-300">{adj.description}</span>
                                        </div>
                                        <span className={`text-sm font-bold ${adj.type === 'deduction' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                          {adj.type === 'deduction' ? '-' : '+'}{formatCurrency(adj.amount)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">No adjustments yet.</p>
                                )}

                                {/* Add Adjustment Form */}
                                {(payout.status === 'draft' || payout.status === 'pending') && (
                                  <div className="flex flex-wrap gap-2 sm:gap-3 items-end bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                                    <div className="flex-1 min-w-0 sm:min-w-[160px]">
                                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
                                      <input
                                        type="text"
                                        value={adjDesc}
                                        onChange={(e) => setAdjDesc(e.target.value)}
                                        placeholder="e.g. Extra classes bonus"
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                      />
                                    </div>
                                    <div className="w-28">
                                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Amount</label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={adjAmount || ''}
                                        onChange={(e) => setAdjAmount(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                      />
                                    </div>
                                    <div className="w-36">
                                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
                                      <select
                                        value={adjType}
                                        onChange={(e) => setAdjType(e.target.value as 'bonus' | 'deduction' | 'reimbursement')}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                      >
                                        <option value="bonus">Bonus</option>
                                        <option value="deduction">Deduction</option>
                                        <option value="reimbursement">Reimbursement</option>
                                      </select>
                                    </div>
                                    <button
                                      onClick={() => handleAddAdjustment(payout._id)}
                                      disabled={adjSubmitting || !adjDesc.trim() || adjAmount <= 0}
                                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition"
                                    >
                                      {adjSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                      Add
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Rejection Reason */}
                              {payout.status === 'rejected' && payout.rejectionReason && (
                                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                                  <p className="text-sm font-medium text-red-700 dark:text-red-300">Rejection Reason:</p>
                                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{payout.rejectionReason}</p>
                                </div>
                              )}

                              {/* Payment Reference */}
                              {payout.status === 'paid' && payout.paymentReference && (
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
                                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Payment Reference:</p>
                                  <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">{payout.paymentReference}</p>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="flex flex-wrap gap-3 pt-2">
                                {payout.status === 'draft' && (
                                  <button
                                    onClick={() => handleSubmitForApproval(payout._id)}
                                    disabled={actionLoading === payout._id}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white rounded-xl font-medium transition"
                                  >
                                    {actionLoading === payout._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Submit for Approval
                                  </button>
                                )}
                                {payout.status === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => handleApprove(payout._id)}
                                      disabled={actionLoading === payout._id}
                                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition"
                                    >
                                      {actionLoading === payout._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => { setRejectModalId(payout._id); setRejectReason(''); }}
                                      className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition"
                                    >
                                      <XCircle className="w-4 h-4" />
                                      Reject
                                    </button>
                                  </>
                                )}
                                {payout.status === 'approved' && (
                                  <button
                                    onClick={() => { setPayModalId(payout._id); setPaymentRef(''); }}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition"
                                  >
                                    <CreditCard className="w-4 h-4" />
                                    Mark as Paid
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRejectModalId(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Reject Payout</h2>
              <button onClick={() => setRejectModalId(null)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Reason for Rejection <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Please provide a reason..."
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setRejectModalId(null)}
                  className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejecting || !rejectReason.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-semibold transition"
                >
                  {rejecting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Reject Payout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {payModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPayModalId(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Mark as Paid</h2>
              <button onClick={() => setPayModalId(null)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Payment Reference <span className="text-gray-400 text-xs">(optional)</span>
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. Transaction ID, cheque number..."
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPayModalId(null)}
                  className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkPaid}
                  disabled={paying}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold transition"
                >
                  {paying && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayoutsPage;
