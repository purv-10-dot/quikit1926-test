'use client';

import { useState, useEffect } from 'react';
import {
  CreditCard,
  Loader2,
  AlertCircle,
  Coins,
  TrendingUp,
  TrendingDown,
  Clock,
  Package,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  Phone,
  Info,
} from 'lucide-react';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChildBalance {
  studentId: string;
  studentName: string;
  grade?: string;
  available: number;
  totalPurchased: number;
  totalUsed: number;
  expiringSoon?: { credits: number; expiresAt: string } | null;
  packages?: any[];
}

interface Transaction {
  _id: string;
  transactionType: string;
  amount: number;
  balanceAfter?: number;
  notes?: string;
  createdAt: string;
}

interface CreditPackageDef {
  id?: string;
  _id?: string;
  name: string;
  credits: number;
  price: number;
  validityMonths?: number;
  isActive?: boolean;
}

const TRANSACTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  purchase: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', label: 'Allocated' },
  deduct: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', label: 'Class Deduction' },
  refund: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', label: 'Refund' },
  expire: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300', label: 'Expired' },
  adjustment: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300', label: 'Adjustment' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatDate = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const LOW_CREDIT_THRESHOLD = 3;
const ITEMS_PER_PAGE = 10;

// ── Component ──────────────────────────────────────────────────────────────────

const CreditsPage = () => {
  const [children, setChildren] = useState<ChildBalance[]>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [packages, setPackages] = useState<CreditPackageDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        const [balRes, pkgRes] = await Promise.allSettled([
          api.get<any>('/credits/my-balance'),
          api.get<any>('/credits/packages'),
        ]);

        if (balRes.status === 'fulfilled') {
          const data = (balRes.value as any);
          if (Array.isArray(data) && data.length > 0) {
            setChildren(data);
            setSelectedChild(data[0].studentId?.toString() || data[0].studentId);
          } else if (data && !Array.isArray(data)) {
            setChildren([{
              studentId: 'self',
              studentName: 'My Balance',
              available: data.available ?? 0,
              totalPurchased: data.totalPurchased ?? 0,
              totalUsed: data.totalUsed ?? 0,
              expiringSoon: data.expiringSoon,
            }]);
            setSelectedChild('self');
          }
        }
        if (pkgRes.status === 'fulfilled') {
          const raw = (pkgRes.value as any);
          const p = Array.isArray(raw) ? raw : raw.packages ?? raw.data ?? [];
          setPackages(p.filter((pkg: any) => pkg.isActive !== false));
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load credits data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!selectedChild) return;
    const loadTransactions = async () => {
      try {
        const params: any = {};
        if (selectedChild !== 'self') params.studentId = selectedChild;
        const txRes = await api.get<any>('/credits/my-transactions', { params });
        const data = txRes;
        const txList = Array.isArray(data)
          ? data
          : data?.transactions ?? data?.data ?? [];
        setTransactions(txList);
        setPage(1);
      } catch {
        setTransactions([]);
      }
    };
    loadTransactions();
  }, [selectedChild]);

  // ── Pagination ─────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(transactions.length / ITEMS_PER_PAGE));
  const paginatedTx = transactions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // ── Derived ────────────────────────────────────────────────────────────────

  const currentChild = children.find((c) => c.studentId?.toString() === selectedChild) || children[0];
  const isLowCredit = currentChild && currentChild.available <= LOW_CREDIT_THRESHOLD;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-8 pb-12">
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white">
          <div className="relative flex items-center gap-4 flex-wrap">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Class Credits</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">View your child's credit balance and usage history</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
            <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Class Credits</h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">View your child's credit balance and usage history</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>
        </div>
      )}

      {/* Child Selector */}
      {children.length > 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Select Child</label>
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {children.map((child) => (
              <option key={child.studentId} value={child.studentId}>
                {child.studentName} {child.grade ? `(Grade ${child.grade})` : ''} - {child.available} credits
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Low Credit Warning */}
      {isLowCredit && currentChild && (
        <div className="flex items-start gap-4 p-5 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-amber-800 dark:text-amber-200">Low Credit Balance</h3>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              {currentChild.studentName || 'Your child'} has only <strong>{currentChild.available}</strong> credit{currentChild.available !== 1 ? 's' : ''} remaining.
              Please contact the school administration to purchase more credits before the next class.
            </p>
          </div>
        </div>
      )}

      {/* Balance Card */}
      {currentChild && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
                <Coins className="w-5 h-5 text-indigo-500" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Available Credits</span>
              </div>
              <p className={`text-4xl font-extrabold ${isLowCredit ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                {currentChild.available ?? 0}
              </p>
            </div>
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Purchased</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{currentChild.totalPurchased ?? 0}</p>
            </div>
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Used</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{currentChild.totalUsed ?? 0}</p>
            </div>
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Expiring Soon</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{currentChild.expiringSoon?.credits ?? 0}</p>
              {currentChild.expiringSoon?.expiresAt && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">by {formatDate(currentChild.expiringSoon.expiresAt)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* How to Get Credits Info Card */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
            <Phone className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Need More Credits?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              To purchase class credits, please contact the school administration directly.
              Credits will be added to your child's account after payment is confirmed.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400">
              <Info className="w-4 h-4" />
              <span>1 credit = 1 class session. Credits are auto-deducted when your child attends a class.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Transaction History</h2>
        {transactions.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-12 text-center">
            <Clock className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">No Transactions Yet</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Your transaction history will appear here once credits are allocated.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Date</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Type</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Credits</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hidden sm:table-cell">Balance After</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTx.map((tx, idx) => {
                    const txType = tx.transactionType || 'adjustment';
                    const style = TRANSACTION_STYLES[txType] || TRANSACTION_STYLES.adjustment;
                    const isPositive = txType === 'purchase' || txType === 'refund';
                    return (
                      <tr
                        key={tx._id}
                        className={`border-b border-gray-50 dark:border-gray-700/50 ${
                          idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-750/50'
                        }`}
                      >
                        <td className="px-6 py-3.5 text-sm text-gray-600 dark:text-gray-400">{formatDate(tx.createdAt)}</td>
                        <td className="px-6 py-3.5">
                          <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                        </td>
                        <td className={`px-6 py-3.5 text-sm font-bold text-right ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </td>
                        <td className="px-6 py-3.5 text-sm text-gray-600 dark:text-gray-400 text-right hidden sm:table-cell">
                          {tx.balanceAfter !== undefined ? tx.balanceAfter : '—'}
                        </td>
                        <td className="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell max-w-[200px] truncate">
                          {tx.notes || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Page {page} of {totalPages} ({transactions.length} total)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Available Packages (Informational) */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Credit Packages</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          These are the credit packages offered by your school. Contact the school admin to purchase.
        </p>
        {packages.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-12 text-center">
            <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">No Packages Available</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Credit packages will be listed here when available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {packages.map((pkg) => (
              <div
                key={pkg._id || pkg.id}
                className="group bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                <div className="p-6 space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{pkg.name}</h3>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <Sparkles className="w-5 h-5 text-indigo-500" />
                    <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">{pkg.credits}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">credits</span>
                  </div>

                  <div className="space-y-2 text-sm">
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
                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                      <span>Per Class Cost</span>
                      <span className="font-semibold">₹{(pkg.price / pkg.credits).toFixed(0)}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center flex items-center justify-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      Contact school admin to purchase
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CreditsPage;
