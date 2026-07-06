'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Calendar, Filter, User as UserIcon, RefreshCw } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { Button, Card, Badge, Skeleton } from '@/components/ui';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

interface TenantLog {
  _id: string;
  actionType: string;
  description: string;
  performedBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  metadata?: any;
  createdAt: string;
}

const ACTION_TYPES = [
  'New Learner Invited',
  'Course Assigned to User',
  'Course Assigned to Group',
  'Course Completed',
  'Quiz Passing Score Updated',
  'User Activated',
  'User Deactivated',
  'Branding Updated',
  'Storage Requested',
  'Quiz Reset by Manager',
  'User Nudged by Manager',
  'Attendance Marked by Manager',
  'Certificate Approved by Manager',
  'Team Report Exported by Manager',
];

const TenantAuditPage = () => {
  const { branding } = useBranding();
  const primaryColor = branding?.primaryColor;
  const secondaryColor = branding?.secondaryColor;
  const [logs, setLogs] = useState<TenantLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [actionType, setActionType] = useState<string>('');
  const [page, setPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [exportingPDF, setExportingPDF] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });

      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (actionType) params.append('actionType', actionType);

      const response = await api.get(`/tenant-audit/logs?${params.toString()}`);
      const resData = (response as any).data;

      if (resData.success) {
        setLogs(resData.data.logs);
        setPaginationInfo(resData.data.pagination);
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, startDate, endDate, actionType]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, actionType]);

  const handleExportPDF = async () => {
    try {
      setExportingPDF(true);
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (actionType) params.append('actionType', actionType);

      const res = await fetch(`/api/tenant-audit/export-pdf?${params.toString()}`, { credentials: 'include' });

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-trail-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      toast.error('Failed to export PDF. Please try again.');
    } finally {
      setExportingPDF(false);
    }
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setActionType('');
    setPage(1);
  };

  const hasActiveFilters = !!(startDate || endDate || actionType);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
        style={{ background: `linear-gradient(135deg, ${primaryColor || '#4f46e5'}, ${secondaryColor || '#ec4899'})` }}
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
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Tenant Audit Trail</h1>
              <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">Track all internal changes and activities</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={loadLogs}
              disabled={loading}
              className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/20 flex items-center justify-center"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Button
              variant="secondary"
              onClick={handleExportPDF}
              disabled={exportingPDF || (logs.length === 0 && !loading)}
              loading={exportingPDF}
              className="inline-flex items-center gap-2 bg-white text-gray-900 hover:bg-gray-50 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
              {exportingPDF ? 'Exporting...' : 'Export to PDF'}
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 sm:p-6">
          <div className="flex items-center flex-wrap gap-2 mb-4">
            <Filter className="w-5 h-5 text-fg-muted" />
            <h2 className="text-lg font-semibold text-fg">Filters</h2>
            {hasActiveFilters && (
              <Badge tone="brand" className="ml-2">Active</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-fg-muted mb-1">
                <Calendar className="w-4 h-4" />
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-fg-muted mb-1">
                <Calendar className="w-4 h-4" />
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-muted mb-1">Action Type</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              >
                <option value="">All Actions</option>
                {ACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={handleResetFilters}
                disabled={!hasActiveFilters}
                className="w-full"
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Audit Logs Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--brand-primary)]"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-line">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-fg-subtle uppercase tracking-wider">
                      Date/Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-fg-subtle uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-fg-subtle uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-fg-subtle uppercase tracking-wider">
                      Performed By
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-line">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center">
                        <FileText className="w-12 h-12 mx-auto text-fg-subtle mb-3" />
                        <p className="text-fg-muted font-medium">
                          {hasActiveFilters
                            ? 'No audit logs found for the selected criteria'
                            : 'No audit logs recorded yet'}
                        </p>
                        <p className="text-fg-subtle text-sm mt-1">
                          {hasActiveFilters
                            ? 'Try adjusting your filters or date range'
                            : 'Actions like course assignments, user changes, and more will appear here'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log._id} className="hover:bg-surface-muted transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-fg">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge tone="info">{log.actionType}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-fg max-w-md">
                          {log.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center">
                              <UserIcon className="w-4 h-4 text-[var(--brand-primary)]" />
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-fg">
                                {log.performedBy?.firstName} {log.performedBy?.lastName}
                              </div>
                              <div className="text-sm text-fg-muted">{log.performedBy?.email}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {paginationInfo.totalPages > 1 && (
              <div className="bg-surface-muted px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-4 border-t border-line">
                <div className="text-sm text-fg-muted">
                  Showing {((paginationInfo.page - 1) * paginationInfo.limit) + 1} to{' '}
                  {Math.min(paginationInfo.page * paginationInfo.limit, paginationInfo.total)} of {paginationInfo.total} results
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-3 text-sm text-fg-muted">
                    Page {paginationInfo.page} of {paginationInfo.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= paginationInfo.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* Summary footer */}
            {logs.length > 0 && paginationInfo.totalPages <= 1 && (
              <div className="bg-surface-muted px-6 py-3 border-t border-line">
                <div className="text-sm text-fg-subtle">
                  Showing {paginationInfo.total} result{paginationInfo.total !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default TenantAuditPage;
