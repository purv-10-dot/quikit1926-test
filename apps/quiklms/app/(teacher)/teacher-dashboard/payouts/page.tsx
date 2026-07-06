'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  TrendingUp,
  Clock,
  Banknote,
} from 'lucide-react';
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
}

interface Payout {
  _id: string;
  // Backend fields
  periodStart?: string;
  periodEnd?: string;
  totalClassesCompleted?: number;
  grossAmount?: number;
  netAmount?: number;
  ratePerClass?: number;
  rateType?: string;
  nonTeachingWorkAmount?: number;
  completedClassIds?: CompletedClass[];
  // Mapped fields
  month: number;
  year: number;
  totalClasses: number;
  completedClasses: number;
  baseAmount: number;
  adjustments: Adjustment[];
  finalAmount: number;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'paid';
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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

// ── Component ──────────────────────────────────────────────────────────────────

const PayoutSummaryPage = () => {
  const { branding } = useBranding();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      const res = await api.get<any>('/payouts/teacher', { params: { year: selectedYear } });
      const raw = Array.isArray(res) ? res : res?.payouts ?? res?.data ?? [];
      setPayouts(raw.map(mapPayout));
    } catch (err: unknown) {
      const e = err as any;
      setError(e?.message || 'Failed to load payouts');
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const totalAdjustments = (adjustments: Adjustment[]) =>
    adjustments.reduce((sum, a) => sum + (a.type === 'deduction' ? -a.amount : a.amount), 0);

  // ── Summary ────────────────────────────────────────────────────────────────

  const totalEarned = payouts.reduce((s, p) => s + p.finalAmount, 0);

  const thisMonthPayout = payouts.find((p) => p.month === currentMonth && p.year === currentYear);
  const pendingCount = payouts.filter((p) => p.status === 'pending' || p.status === 'approved').length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
            <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">My Payouts</h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">View your earnings and payout history</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Earned ({selectedYear})</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalEarned)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <Banknote className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">This Month</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {thisMonthPayout ? formatCurrency(thisMonthPayout.finalAmount) : '—'}
                </p>
                {thisMonthPayout && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[thisMonthPayout.status]}`}>
                    {thisMonthPayout.status}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Pending Payouts</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pendingCount}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Year Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex items-center gap-4">
          <Calendar className="w-5 h-5 text-gray-400" />
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
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
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">Loading payouts...</span>
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
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Payouts Yet</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            You don't have any payout records for {selectedYear}. Payouts are generated by your school admin.
          </p>
        </div>
      ) : (
        /* Monthly Payout Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {payouts.map((payout) => {
            const isExpanded = expandedId === payout._id;
            const adjTotal = totalAdjustments(payout.adjustments);

            return (
              <div
                key={payout._id}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-all duration-300"
              >
                {/* Card accent */}
                <div className={`h-2 ${
                  payout.status === 'paid'
                    ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                    : payout.status === 'approved'
                    ? 'bg-gradient-to-r from-blue-400 to-blue-600'
                    : payout.status === 'rejected'
                    ? 'bg-gradient-to-r from-red-400 to-red-600'
                    : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'
                }`} />

                <div className="p-6 space-y-4">
                  {/* Month & Status */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {MONTHS[payout.month - 1]}
                    </h3>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${STATUS_STYLES[payout.status]}`}>
                      {payout.status}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Classes Completed</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {payout.completedClasses} / {payout.totalClasses}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Base Amount</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(payout.baseAmount)}</span>
                    </div>
                    {payout.nonTeachingWorkAmount ? (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Non-Teaching Work</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">+{formatCurrency(payout.nonTeachingWorkAmount)}</span>
                      </div>
                    ) : null}
                    {payout.adjustments.length > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Adjustments</span>
                        <span className={`font-medium ${adjTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {adjTotal >= 0 ? '+' : ''}{formatCurrency(adjTotal)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-gray-700 dark:text-gray-300 font-semibold">Final Amount</span>
                      <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(payout.finalAmount)}</span>
                    </div>
                  </div>

                  {/* Expand Toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : payout._id)}
                    className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition w-full justify-center pt-2 border-t border-gray-100 dark:border-gray-700"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        View Details
                      </>
                    )}
                  </button>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-6 pb-6 space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                    {/* Completed Classes */}
                    {payout.completedClassIds && payout.completedClassIds.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Completed Classes</h4>
                        <div className="space-y-2">
                          {payout.completedClassIds.map((cls, i) => {
                            const batch = typeof cls.batchId === 'object' ? cls.batchId : null;
                            return (
                              <div
                                key={cls._id || i}
                                className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded-lg text-xs"
                              >
                                <div>
                                  <span className="font-medium text-gray-900 dark:text-gray-100">{cls.title || batch?.name || 'Class'}</span>
                                  {batch?.subject && (
                                    <>
                                      <span className="text-gray-400 mx-1.5">·</span>
                                      <span className="text-gray-500 dark:text-gray-400">{batch.subject}</span>
                                    </>
                                  )}
                                  {cls.startTime && (
                                    <>
                                      <span className="text-gray-400 mx-1.5">·</span>
                                      <span className="text-gray-500 dark:text-gray-400">{formatDate(cls.startTime)}</span>
                                    </>
                                  )}
                                </div>
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                  {payout.rateType === 'monthly' ? '' : formatCurrency(payout.ratePerClass || 0)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Rate Info */}
                    {(payout.rateType === 'monthly' || payout.rateType === 'hybrid') ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {payout.rateType === 'hybrid'
                          ? `Monthly Base: ${formatCurrency(payout.baseAmount - (payout.ratePerClass || 0) * payout.completedClasses)} + ${payout.completedClasses} class(es) = ${formatCurrency(payout.baseAmount)}`
                          : `Monthly Fixed Salary: ${formatCurrency(payout.baseAmount)}`}
                      </div>
                    ) : payout.ratePerClass ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Rate: {formatCurrency(payout.ratePerClass)} per {payout.rateType === 'per_hour' ? 'hr' : 'class'} x {payout.completedClasses} = {formatCurrency(payout.baseAmount)}
                      </div>
                    ) : null}

                    {/* Adjustments */}
                    {payout.adjustments.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Adjustments</h4>
                        <div className="space-y-2">
                          {payout.adjustments.map((adj, i) => (
                            <div
                              key={adj._id || i}
                              className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded-lg text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${ADJUSTMENT_STYLES[adj.type]}`}>
                                  {adj.type}
                                </span>
                                <span className="text-gray-700 dark:text-gray-300">{adj.description}</span>
                              </div>
                              <span className={`font-semibold ${adj.type === 'deduction' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {adj.type === 'deduction' ? '-' : '+'}{formatCurrency(adj.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!payout.completedClassIds?.length && !payout.adjustments.length && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">No detailed breakdown available.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PayoutSummaryPage;
