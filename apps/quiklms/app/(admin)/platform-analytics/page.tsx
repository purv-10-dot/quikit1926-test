'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3, Users, Building2, Globe, CheckCircle, Activity, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { Button, Card, CardHeader, CardTitle, CardContent, Skeleton } from '@/components/ui';
import { DashboardScaffold, StatCard } from '@/components/DashboardScaffold';

interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  pausedTenants: number;
  trialTenants: number;
  totalUsers: number;
  corporateTenants: number;
  schoolTenants: number;
}

interface TenantRow {
  id: string;
  name: string;
  tenantType: string;
  status: string;
  createdAt: string;
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PlatformStats>({
    totalTenants: 0, activeTenants: 0, pausedTenants: 0, trialTenants: 0,
    totalUsers: 0, corporateTenants: 0, schoolTenants: 0,
  });
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [tenantsRes, usersRes] = await Promise.all([
        api.get<any>('/tenants').catch(() => ({ data: { data: [] } })),
        api.get<any>('/users').catch(() => ({ data: { data: [] } })),
      ]);

      const ts: TenantRow[] = tenantsRes.data?.data ?? tenantsRes.data ?? [];
      const us: unknown[]   = usersRes.data?.data ?? usersRes.data ?? [];

      setStats({
        totalTenants: ts.length,
        activeTenants:    ts.filter((t) => t.status === 'Active').length,
        pausedTenants:    ts.filter((t) => t.status === 'Paused').length,
        trialTenants:     ts.filter((t) => t.status === 'Trial').length,
        totalUsers:       us.length,
        corporateTenants: ts.filter((t) => t.tenantType === 'corporate').length,
        schoolTenants:    ts.filter((t) => t.tenantType === 'school').length,
      });
      setTenants(ts.slice(0, 20));
    } catch (err: any) {
      toast.error('Failed to load platform analytics');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast.success('Analytics refreshed');
  }

  const tenantTypeData = [
    { name: 'Corporate', value: stats.corporateTenants },
    { name: 'School',    value: stats.schoolTenants },
  ];

  const tenantStatusData = [
    { name: 'Active', value: stats.activeTenants },
    { name: 'Paused', value: stats.pausedTenants },
    { name: 'Trial',  value: stats.trialTenants },
  ].filter((d) => d.value > 0);

  return (
    <DashboardScaffold title="Platform Analytics" subtitle="Cross-tenant usage overview">
      <Toaster position="top-right" />

      <div className="flex justify-end mb-6">
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Building2}   label="Total Tenants"   value={stats.totalTenants} />
          <StatCard icon={CheckCircle} label="Active Tenants"  value={stats.activeTenants} />
          <StatCard icon={Users}       label="Total Users"     value={stats.totalUsers} />
          <StatCard icon={Globe}       label="School Tenants"  value={stats.schoolTenants} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Tenants by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 rounded" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={tenantTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                    label={({ name, value }) => `${name}: ${value}`}>
                    {tenantTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Tenant Status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 rounded" /> : tenantStatusData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-fg-muted text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tenantStatusData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Tenants" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-fg-muted" />
            All Tenants
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
            </div>
          ) : tenants.length === 0 ? (
            <div className="py-12 text-center text-fg-muted">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No tenants found. Run the database seed to add demo data.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="pb-3 font-semibold text-fg-muted">Tenant</th>
                    <th className="pb-3 font-semibold text-fg-muted">Type</th>
                    <th className="pb-3 font-semibold text-fg-muted">Status</th>
                    <th className="pb-3 font-semibold text-fg-muted">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id} className="border-b border-line/50 hover:bg-surface-raised/50 transition-colors">
                      <td className="py-3 font-medium text-fg">{t.name}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.tenantType === 'corporate'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {t.tenantType === 'corporate' ? 'Corporate' : 'School'}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.status === 'Active' ? 'bg-green-100 text-green-700' :
                          t.status === 'Paused' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 text-fg-muted">
                        {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardScaffold>
  );
}
