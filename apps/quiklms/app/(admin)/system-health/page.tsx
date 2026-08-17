'use client';

import { useState, useEffect } from 'react';
import { Activity, Pause, Play, Users, Clock, TrendingUp, CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';
import { PageHero, HeroAction } from '@/components/super-admin/PageHero';

interface Tenant {
  id: string;
  orgName: string;
  subdomain: string;
  status: string;
  createdAt: string;
}

const SystemHealthPage = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalTenants: 0,
    activeTenants: 0,
    pausedTenants: 0,
    totalUsers: 0,
  });

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);

      // Fetch tenants and users in parallel
      const [tenantsResponse, usersResponse] = await Promise.all([
        api.get<{ data: Tenant[] }>('/tenants').catch(() => ({ data: [] as Tenant[] })),
        api.get<{ data: unknown[] }>('/users').catch(() => ({ data: [] as unknown[] })),
      ]);

      const tenantsData: Tenant[] = tenantsResponse.data || [];
      const usersData: unknown[] = usersResponse.data || [];

      setTenants(tenantsData);

      // Calculate stats
      setStats({
        totalTenants: tenantsData.length,
        activeTenants: tenantsData.filter((t: Tenant) => t.status === 'Active').length,
        pausedTenants: tenantsData.filter((t: Tenant) => t.status === 'Paused').length,
        totalUsers: usersData.length,
      });
    } catch (error) {
      console.error('Failed to load tenants:', error);
      toast.error('Failed to load system health data');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePause = async (orgId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
      await api.patch(`/tenants/${orgId}`, { status: newStatus });
      toast.success(`Tenant ${newStatus === 'Active' ? 'reactivated' : 'deactivated'} successfully`);
      loadTenants();
    } catch (error) {
      console.error('Failed to update tenant status:', error);
      toast.error('Failed to update tenant status');
    }
  };

  const formatLastActive = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="space-y-6 sm:space-y-8 pb-12">
        {/* Premium Header with System Status Theme */}
        <PageHero
          icon={Activity}
          title="System"
          highlight="Health"
          subtitle="Monitor operational status, tenant performance, and platform-wide ecosystem stability."
          actions={
            <HeroAction variant="solid" onClick={loadTenants}>
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              Live Refresh
            </HeroAction>
          }
        />

        {/* Premium Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {(
            [
              { label: 'Total Ecosystems', value: stats.totalTenants, icon: Activity, color: 'indigo', detail: 'Across all regions' },
              { label: 'Active Channels', value: stats.activeTenants, icon: CheckCircle2, color: 'emerald', detail: `${stats.totalTenants > 0 ? Math.round((stats.activeTenants / stats.totalTenants) * 100) : 0}% Uptime` },
              { label: 'Suspended Gateways', value: stats.pausedTenants, icon: Pause, color: 'amber', detail: 'Impacted services' },
              { label: 'Active Node Users', value: stats.totalUsers, icon: Users, color: 'violet', detail: 'Concurrent learners' },
            ] as const
          ).map((stat, i) => {
            const Icon = stat.icon;
            const colorMap: Record<string, string> = {
              indigo: 'from-indigo-600 to-indigo-700 shadow-indigo-200',
              emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-200',
              amber: 'from-amber-500 to-amber-600 shadow-amber-200',
              violet: 'from-violet-600 to-violet-700 shadow-violet-200',
            };
            const colorClasses = colorMap[stat.color] || colorMap.indigo;

            return (
              <div key={i} className={`group relative bg-gradient-to-br ${colorClasses} rounded-[2rem] shadow-xl p-8 text-white overflow-hidden hover:-translate-y-2 transition-all duration-500`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-white/20 transition-colors"></div>
                <div className="relative flex items-center justify-between mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Icon className="w-7 h-7" />
                  </div>
                  <div className="flex flex-col items-end">
                    <TrendingUp className="w-4 h-4 opacity-50 mb-1" />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Monitor</span>
                  </div>
                </div>
                <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-1">{stat.label}</p>
                <p className="text-4xl font-black mb-1">{stat.value}</p>
                <p className="text-white/50 text-[11px] font-bold">{stat.detail}</p>
              </div>
            );
          })}
        </div>

        {/* Premium Status Table */}
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#f2f2f7] dark:border-gray-700 overflow-hidden">
          <div className="px-8 py-8 border-b border-[#f2f2f7] dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white leading-tight">Infrastructure Pulse</h2>
                <p className="text-sm text-gray-400 font-bold mt-0.5 uppercase tracking-widest">Real-time Tenant Monitoring</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-black uppercase tracking-widest border border-emerald-100 dark:border-emerald-800">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                System Normal
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-[#fafafc] dark:bg-gray-900/30 border-b border-[#f2f2f7] dark:border-gray-700">
                  <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Organization Details</th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">System Key</th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Live Status</th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Connectivity</th>
                  <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f2f7] dark:divide-gray-700">
                {tenants.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="max-w-xs mx-auto flex flex-col items-center">
                        <Activity className="w-12 h-12 text-gray-200 mb-4" />
                        <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Scanning Ecosystem...</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => (
                    <tr key={tenant.id} className="group hover:bg-[#fafafc] dark:hover:bg-gray-700/30 transition-all duration-300">
                      <td className="px-8 py-6 whitespace-nowrap">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black transition-all ${
                            tenant.status === 'Active' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {tenant.orgName.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-base font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                              {tenant.orgName}
                            </span>
                            <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                              UID: {(tenant.id ?? '').substring(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <span className="text-sm font-mono font-black text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 rounded-lg border border-[#f2f2f7] dark:border-gray-700">
                          {tenant.subdomain}
                        </span>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${tenant.status === 'Active' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                          <span className={`text-sm font-black uppercase tracking-widest ${tenant.status === 'Active' ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {tenant.status === 'Active' ? 'Operational' : 'Paused'}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-sm font-bold text-gray-600 dark:text-gray-300">
                              {formatLastActive(tenant.createdAt)}
                            </span>
                          </div>
                          <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest ml-5">Network Check</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-right">
                        <button
                          onClick={() => handleTogglePause(tenant.id, tenant.status)}
                          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${
                            tenant.status === 'Active'
                              ? 'bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100'
                          }`}
                        >
                          {tenant.status === 'Active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          {tenant.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default SystemHealthPage;
