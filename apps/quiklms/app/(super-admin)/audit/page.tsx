'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3,
  HardDrive,
  TrendingUp,
  Clock,
  Mail,
  Loader2,
  AlertCircle,
  Eye,
  X,
  CheckCircle,
  XCircle,
  Edit,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import {
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import UpgradeEmailTemplateEditor from '@/components/UpgradeEmailTemplateEditor';
import { PageHero, HeroAction } from '@/components/super-admin/PageHero';

interface GlobalStorage {
  totalUsed: number;
  totalUsedMB: number;
  totalUsedGB: number;
  totalTenants: number;
}

interface EmailPreview {
  to: string;
  subject: string;
  html: string;
  tenantName: string;
  orgId?: string;
  storagePercentage: number;
  storageUsedMB: number;
}

interface TenantStorage {
  orgId: string;
  orgName: string;
  storageUsed: number;
  storageUsedMB: number;
  percentage: number;
  lastActivity?: string;
}

interface ActivityLog {
  _id: string;
  type: string;
  message: string;
  timestamp: string;
  metadata?: {
    email?: string;
    emailStatus?: 'sent' | 'failed';
    messageId?: string;
    error?: string;
    sentAt?: string;
    failedAt?: string;
  };
  orgId?: {
    orgName: string;
  };
  userId?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AuditDashboardPage() {
  const [globalStorage, setGlobalStorage] = useState<GlobalStorage | null>(null);
  const [tenantStorage, setTenantStorage] = useState<TenantStorage[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [emailStatuses, setEmailStatuses] = useState<Record<string, any>>({});
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [globalRes, tenantsRes, logsRes] = await Promise.all([
        api.get<{ data: GlobalStorage }>('/audit/storage/global'),
        api.get<{ data: TenantStorage[] }>('/audit/storage/tenants'),
        api.get<{ data: { logs: ActivityLog[] } }>('/audit/activity-logs?limit=50'),
      ]);

      setGlobalStorage((globalRes as any).data);
      setTenantStorage((tenantsRes as any).data ?? []);
      setActivityLogs((logsRes as any).data.logs || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load audit data');
      console.error('Failed to load audit data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgradeClick = async (orgId: string) => {
    try {
      setPreviewLoading(orgId);
      const response = await api.get<{ data: EmailPreview }>(`/audit/upgrade-invoice/preview/${orgId}`);
      setEmailPreview({ ...(response as any).data, orgId });
      setShowPreview(true);
    } catch (err: any) {
      toast.error(
        err?.message ||
          'Failed to load email preview. Ensure the tenant has a valid billing email address.'
      );
    } finally {
      setPreviewLoading(null);
    }
  };

  const handleSendUpgradeInvoice = async (orgId: string) => {
    try {
      setSendingInvoice(orgId);
      const response = await api.post<{ success: boolean; data?: { email?: string; error?: string }; message?: string }>(
        `/audit/upgrade-invoice/${orgId}`
      );

      if ((response as any).success) {
        setShowPreview(false);
        setEmailPreview(null);
        toast.success(
          `Upgrade invoice email sent successfully to ${(response as any).data?.email || 'tenant billing contact'}!`
        );
        loadData();
      } else {
        const errorMsg = (response as any).data?.error || (response as any).message || 'Unknown error';
        toast.error(
          `Failed to send email: ${errorMsg}. Please check SMTP credentials and tenant billing email.`
        );
      }
    } catch (err: any) {
      const errorMsg =
        err?.message || 'Failed to send upgrade invoice';
      toast.error(
        `Error: ${errorMsg}. Please check SMTP credentials, email service, and tenant billing email.`
      );
    } finally {
      setSendingInvoice(null);
    }
  };

  const handleCheckEmailStatus = async (orgId: string) => {
    try {
      setCheckingStatus(orgId);
      const response = await api.get<{ success: boolean; data: any }>(`/audit/email-status/${orgId}`);
      if ((response as any).success) {
        setEmailStatuses((prev) => ({
          ...prev,
          [orgId]: (response as any).data,
        }));
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to check email status');
    } finally {
      setCheckingStatus(null);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPercentageColor = (percentage: number): string => {
    if (percentage >= 90) return '#ef4444';
    if (percentage >= 70) return '#f59e0b';
    if (percentage >= 50) return '#eab308';
    return '#10b981';
  };

  const gaugeData = globalStorage
    ? [{ name: 'Total Storage Used', value: 100 }]
    : [];

  const topTenantsData = (tenantStorage ?? []).slice(0, 10).map((tenant) => ({
    name: tenant.orgName.length > 15 ? tenant.orgName.substring(0, 15) + '...' : tenant.orgName,
    storage: tenant.storageUsedMB,
    percentage: tenant.percentage,
  }));

  if (loading) {
    return (
      <DashboardScaffold title="Audit & Analytics">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          <span className="ml-3 text-fg-muted">Loading audit data...</span>
        </div>
      </DashboardScaffold>
    );
  }

  if (error) {
    return (
      <DashboardScaffold title="Audit & Analytics">
        <div className="bg-danger-soft border border-danger rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-danger" />
          <p className="text-danger">{error}</p>
        </div>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold title="Audit & Analytics">
      <Toaster position="top-right" />
      <div className="space-y-6 sm:space-y-8 pb-12">

        {/* Premium Header with Audit Theme */}
        <PageHero
          icon={ShieldCheck}
          title="Audit"
          highlight="& Analytics"
          subtitle="Platform-wide storage intelligence, security audit trails, and tenant resource optimization."
          actions={
            <>
              <HeroAction onClick={() => setShowTemplateEditor(true)}>
                <Edit className="size-4" />
                Templates
              </HeroAction>
              <HeroAction variant="solid" onClick={loadData}>
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </HeroAction>
            </>
          }
        />

        {/* Template Editor Modal */}
        {showTemplateEditor && (
          <UpgradeEmailTemplateEditor onClose={() => setShowTemplateEditor(false)} />
        )}

        {/* Global Storage & Analysis Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="group bg-surface rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-line p-8 lg:p-10 transition-all duration-500 hover:shadow-2xl">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <HardDrive className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-fg leading-tight">Global Storage Utilization</h2>
                  <p className="text-xs text-fg-subtle font-bold uppercase tracking-widest mt-1">Platform Capacity</p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                  {globalStorage?.totalTenants || 0}
                </span>
                <span className="text-[10px] font-black text-fg-subtle uppercase tracking-widest leading-none">
                  Total Nodes
                </span>
              </div>
            </div>
            {globalStorage && (
              <div className="flex flex-col items-center">
                <div className="relative w-full aspect-square max-w-[280px] mb-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={gaugeData}
                        cx="50%"
                        cy="50%"
                        innerRadius="75%"
                        outerRadius="95%"
                        startAngle={225}
                        endAngle={-45}
                        paddingAngle={0}
                        dataKey="value"
                      >
                        <Cell fill="url(#indigoGradient)" />
                      </Pie>
                      <defs>
                        <linearGradient id="indigoGradient" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#4f46e5" />
                          <stop offset="100%" stopColor="#7c3aed" />
                        </linearGradient>
                      </defs>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-black text-fg">{globalStorage.totalUsedGB.toFixed(1)}</span>
                    <span className="text-sm font-black text-indigo-600 uppercase tracking-widest">GB Used</span>
                  </div>
                </div>
                <div className="w-full grid grid-cols-2 gap-4">
                  <div className="bg-surface-muted p-6 rounded-3xl border border-line">
                    <p className="text-[10px] font-black text-fg-subtle uppercase tracking-widest mb-1">
                      Average / Tenant
                    </p>
                    <p className="text-xl font-black text-fg">
                      {((globalStorage.totalUsedMB / globalStorage.totalTenants) || 0).toFixed(1)}{' '}
                      <span className="text-sm text-fg-muted">MB</span>
                    </p>
                  </div>
                  <div className="bg-surface-muted p-6 rounded-3xl border border-line">
                    <p className="text-[10px] font-black text-fg-subtle uppercase tracking-widest mb-1">
                      Raw Bitstream
                    </p>
                    <p className="text-xl font-black text-fg">
                      {globalStorage.totalUsedMB.toFixed(0)}{' '}
                      <span className="text-sm text-fg-muted">MB</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Top Tenants Analysis */}
          <div className="bg-surface rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-line p-8 lg:p-10 transition-all duration-500 hover:shadow-2xl">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                  <TrendingUp className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-fg leading-tight">High Consumption Nodes</h2>
                  <p className="text-xs text-fg-subtle font-bold uppercase tracking-widest mt-1">
                    Resource Distribution
                  </p>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-surface-muted flex items-center justify-center text-fg-muted">
                <Eye className="w-5 h-5" />
              </div>
            </div>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTenantsData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f2f2f7" />
                  <XAxis
                    dataKey="name"
                    fontSize={10}
                    fontWeight={900}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8' }}
                    dy={10}
                  />
                  <YAxis
                    fontSize={10}
                    fontWeight={900}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8' }}
                  />
                  <Tooltip
                    cursor={{ fill: '#fafafc' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-surface p-4 rounded-2xl shadow-2xl border border-line">
                            <p className="text-[10px] font-black text-fg-subtle uppercase tracking-widest mb-1">
                              {payload[0].payload.name}
                            </p>
                            <p className="text-lg font-black text-indigo-600">
                              {(payload[0].value as number).toFixed(1)} MB
                            </p>
                            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                              {payload[0].payload.percentage.toFixed(1)}% Capacity
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="storage" radius={[12, 12, 0, 0]} barSize={32}>
                    {topTenantsData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.percentage > 80
                            ? '#ef4444'
                            : entry.percentage > 50
                            ? '#f59e0b'
                            : '#6366f1'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Tenant Storage Breakdown Table */}
        <div className="bg-surface rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-line overflow-hidden">
          <div className="px-8 py-8 border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-fg leading-tight">Node Capacity Analysis</h2>
                <p className="text-xs text-fg-subtle font-bold uppercase tracking-widest mt-0.5">
                  Storage Footprint by Tenant
                </p>
              </div>
            </div>
            <span className="px-4 py-2 bg-surface-muted text-fg-muted rounded-xl text-[10px] font-black uppercase tracking-widest border border-line">
              Total Nodes: {tenantStorage.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-surface-muted border-b border-line">
                  <th className="px-8 py-5 text-left text-[10px] font-black text-fg-subtle uppercase tracking-widest">
                    Client Ecosystem
                  </th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-fg-subtle uppercase tracking-widest">
                    Active Footprint
                  </th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-fg-subtle uppercase tracking-widest">
                    Limit Utilization (2GB)
                  </th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-fg-subtle uppercase tracking-widest">
                    Audit Sync
                  </th>
                  <th className="px-8 py-5 text-right text-[10px] font-black text-fg-subtle uppercase tracking-widest">
                    Node Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm font-bold">
                {tenantStorage.map((tenant) => (
                  <tr
                    key={tenant.orgId}
                    className="group hover:bg-surface-muted transition-all duration-300"
                  >
                    <td className="px-8 py-6 whitespace-nowrap">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-surface-muted flex items-center justify-center text-fg-muted font-black group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all border border-transparent group-hover:border-indigo-100">
                          {tenant.orgName.charAt(0)}
                        </div>
                        <span className="text-fg group-hover:text-indigo-600 transition-colors uppercase tracking-tight">
                          {tenant.orgName}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 whitespace-nowrap text-fg-muted font-mono">
                      {formatBytes(tenant.storageUsed)}
                    </td>
                    <td className="px-8 py-6 whitespace-nowrap min-w-[240px]">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 bg-surface-muted rounded-full h-2.5 overflow-hidden border border-line">
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{
                              width: `${Math.min(100, tenant.percentage)}%`,
                              backgroundColor: getPercentageColor(tenant.percentage),
                            }}
                          ></div>
                        </div>
                        <span
                          className="text-[11px] font-black w-12 text-right uppercase tracking-widest"
                          style={{ color: getPercentageColor(tenant.percentage) }}
                        >
                          {tenant.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 whitespace-nowrap text-fg-muted">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-xs uppercase tracking-widest leading-none mt-0.5">
                          {formatDate(tenant.lastActivity)}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleUpgradeClick(tenant.orgId)}
                          disabled={
                            previewLoading === tenant.orgId || sendingInvoice === tenant.orgId
                          }
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50"
                        >
                          {previewLoading === tenant.orgId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            'Optimize Storage'
                          )}
                        </button>
                        <button
                          onClick={() => handleCheckEmailStatus(tenant.orgId)}
                          disabled={checkingStatus === tenant.orgId}
                          className="p-2.5 bg-surface-muted hover:bg-surface-muted text-fg-muted hover:text-fg rounded-xl transition-all border border-line"
                          title="Check Link Connectivity"
                        >
                          {checkingStatus === tenant.orgId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                        {emailStatuses[tenant.orgId] && (
                          <div className="animate-in fade-in slide-in-from-right-2">
                            {emailStatuses[tenant.orgId].deliveryStatus === 'pending' && (
                              <div
                                className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"
                                title="Pending Transmission"
                              ></div>
                            )}
                            {emailStatuses[tenant.orgId].deliveryStatus === 'delivered' && (
                              <div
                                className="w-2.5 h-2.5 rounded-full bg-emerald-500"
                                title="Packet Delivered"
                              ></div>
                            )}
                            {emailStatuses[tenant.orgId].deliveryStatus === 'failed' && (
                              <div
                                className="w-2.5 h-2.5 rounded-full bg-red-500"
                                title="Transmission Failed"
                              ></div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Logs Table */}
        <div className="bg-surface rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-line overflow-hidden">
          <div className="px-8 py-8 border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-fg leading-tight">System Audit Trail</h2>
                <p className="text-xs text-fg-subtle font-bold uppercase tracking-widest mt-0.5">
                  Global Event Log
                </p>
              </div>
            </div>
            <button onClick={loadData} className="p-3 hover:bg-surface-muted rounded-xl transition-colors">
              <RefreshCw className={`w-5 h-5 text-fg-muted ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-surface-muted border-b border-line">
                  <th className="px-8 py-5 text-left text-[10px] font-black text-fg-subtle uppercase tracking-widest">
                    Temporal Signature
                  </th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-fg-subtle uppercase tracking-widest">
                    Event Classifier
                  </th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-fg-subtle uppercase tracking-widest">
                    Transaction Payload
                  </th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-fg-subtle uppercase tracking-widest">
                    Node Path
                  </th>
                  <th className="px-8 py-5 text-right text-[10px] font-black text-fg-subtle uppercase tracking-widest">
                    Entity Signature
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm font-bold">
                {activityLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center">
                        <BarChart3 className="w-12 h-12 text-fg-subtle mb-4" />
                        <p className="text-fg-muted font-black uppercase tracking-widest text-xs">
                          No active transactions recorded
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  activityLogs.map((log) => (
                    <tr
                      key={log._id}
                      className="group hover:bg-surface-muted transition-all duration-300"
                    >
                      <td className="px-8 py-6 whitespace-nowrap">
                        <div className="flex items-center gap-3 text-fg-muted font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="text-xs uppercase tracking-widest">
                            {formatDate(log.timestamp)}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                          {log.type}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="text-fg leading-relaxed max-w-md">{log.message}</div>
                        {log.metadata?.emailStatus && (
                          <div className="mt-2 flex items-center gap-3">
                            {log.metadata.emailStatus === 'sent' ? (
                              <div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                                <CheckCircle className="w-3 h-3" /> Packet Sent
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-100">
                                <XCircle className="w-3 h-3" /> Transmission Blocked
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <div className="text-xs font-black text-fg-muted uppercase tracking-widest group-hover:text-indigo-600 transition-colors">
                          {log.orgId?.orgName || 'ROOT'}
                        </div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-black text-fg uppercase tracking-tighter">
                            {log.userId
                              ? `${log.userId.firstName} ${log.userId.lastName}`
                              : 'System Agent'}
                          </span>
                          <span className="text-[10px] font-bold text-fg-muted truncate max-w-[120px]">
                            {log.userId?.email || 'automated_pulse'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Email Preview & Confirmation Modal */}
        {showPreview && emailPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-line">
              <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-2xl font-bold text-fg">Review Upgrade Invoice</h2>
                  <p className="text-sm text-fg-muted mt-1">
                    Review the email below before sending to{' '}
                    <strong>{emailPreview.tenantName}</strong>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowPreview(false);
                    setEmailPreview(null);
                  }}
                  className="text-fg-muted hover:text-fg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6">
                {/* Email metadata card */}
                <div className="mb-5 bg-surface-muted rounded-lg border border-line p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-indigo-600" />
                    <span className="text-sm font-semibold text-fg">Email Details</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <label className="font-medium text-fg-muted text-xs uppercase tracking-wide">
                        Recipient
                      </label>
                      <p className="text-fg mt-0.5">{emailPreview.to}</p>
                    </div>
                    <div>
                      <label className="font-medium text-fg-muted text-xs uppercase tracking-wide">
                        Organization
                      </label>
                      <p className="text-fg mt-0.5">{emailPreview.tenantName}</p>
                    </div>
                    <div>
                      <label className="font-medium text-fg-muted text-xs uppercase tracking-wide">
                        Subject
                      </label>
                      <p className="text-fg mt-0.5">{emailPreview.subject}</p>
                    </div>
                    <div>
                      <label className="font-medium text-fg-muted text-xs uppercase tracking-wide">
                        Storage Usage
                      </label>
                      <p className="text-fg mt-0.5">
                        {emailPreview.storageUsedMB.toFixed(2)} MB
                        <span
                          className="ml-1.5 px-2 py-0.5 text-xs font-medium rounded-full"
                          style={{
                            backgroundColor:
                              emailPreview.storagePercentage >= 90
                                ? '#fef2f2'
                                : emailPreview.storagePercentage >= 70
                                ? '#fffbeb'
                                : '#f0fdf4',
                            color:
                              emailPreview.storagePercentage >= 90
                                ? '#991b1b'
                                : emailPreview.storagePercentage >= 70
                                ? '#92400e'
                                : '#166534',
                          }}
                        >
                          {emailPreview.storagePercentage.toFixed(1)}% of 2GB
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Email body preview */}
                <div className="mb-5">
                  <label className="text-xs font-medium text-fg-muted uppercase tracking-wide mb-2 block">
                    Email Body Preview
                  </label>
                  <div className="border border-line rounded-lg p-5 bg-surface">
                    <div
                      className="prose dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: emailPreview.html }}
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-line">
                  <p className="text-xs text-fg-muted">
                    This will send an upgrade invoice email to the tenant's billing contact.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowPreview(false);
                        setEmailPreview(null);
                      }}
                      className="px-4 py-2 rounded-lg border border-line text-fg-muted hover:text-fg hover:bg-surface-muted transition-all text-sm font-medium disabled:opacity-50"
                      disabled={!!sendingInvoice}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (emailPreview.orgId) {
                          await handleSendUpgradeInvoice(emailPreview.orgId);
                        }
                      }}
                      disabled={!!sendingInvoice}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingInvoice ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Confirm & Send Email
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardScaffold>
  );
}
