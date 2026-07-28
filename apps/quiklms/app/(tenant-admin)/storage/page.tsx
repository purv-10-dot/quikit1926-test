'use client';

import { useState, useEffect } from 'react';
import { HardDrive, AlertTriangle, CheckCircle } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui';
import { Skeleton } from '@/components/ui';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

const StoragePage = () => {
  const { branding } = useBranding();
  const [storageUsage, setStorageUsage] = useState({ currentUsage: 0, storageLimit: 2 * 1024 * 1024 * 1024 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStorageUsage();
  }, []);

  const loadStorageUsage = async () => {
    try {
      const response = await api.get<{ data: { currentUsage: number; storageLimit: number } }>('/tenants/usage');
      setStorageUsage(response.data);
    } catch (error) {
      console.error('Failed to load storage usage:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const usagePercentage = (storageUsage.currentUsage / storageUsage.storageLimit) * 100;
  const isNearLimit = usagePercentage > 80;
  const isAtLimit = usagePercentage >= 100;

  if (loading) {
    return (
      <DashboardScaffold title="Storage Monitor" subtitle="Monitor your organization's storage usage">
        <Toaster position="top-right" />
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold title="Storage Monitor" subtitle="Monitor your organization's storage usage">
      <Toaster position="top-right" />

      <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
        {/* Hero Banner */}
        <div
          className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500"
          style={{ background: `linear-gradient(135deg, ${branding.primaryColor || '#4f46e5'}, ${branding.secondaryColor || '#ec4899'})` }}
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
                <HardDrive className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Storage Monitor</h1>
                <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                  Monitor your organization's storage usage
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Storage Overview Card */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
              <div className="flex items-center gap-3">
                <HardDrive className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--brand-primary)]" />
                <div>
                  <h2 className="text-xl font-semibold text-fg">Storage Overview</h2>
                  <p className="text-sm text-fg-muted">Your 2GB storage allocation</p>
                </div>
              </div>
              {isNearLimit && !isAtLimit && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-medium">Approaching Limit</span>
                </div>
              )}
              {isAtLimit && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-lg">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-medium">Storage Full</span>
                </div>
              )}
            </div>

            {/* Storage Bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-fg">Used Storage</span>
                <span className="text-sm font-medium text-fg">
                  {formatBytes(storageUsage.currentUsage)} / {formatBytes(storageUsage.storageLimit)}
                </span>
              </div>
              <div className="w-full bg-surface-muted rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isAtLimit
                      ? 'bg-danger'
                      : isNearLimit
                      ? 'bg-warning'
                      : 'bg-[var(--brand-primary)]'
                  }`}
                  style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-fg-subtle">{usagePercentage.toFixed(1)}% Used</span>
                <span className="text-xs text-fg-subtle">
                  {formatBytes(storageUsage.storageLimit - storageUsage.currentUsage)} Remaining
                </span>
              </div>
            </div>

            {/* Storage Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-line">
              <div className="text-center p-4 bg-surface-muted rounded-lg">
                <div className="text-2xl font-bold text-fg">
                  {formatBytes(storageUsage.currentUsage)}
                </div>
                <div className="text-sm text-fg-muted mt-1">Currently Used</div>
              </div>
              <div className="text-center p-4 bg-surface-muted rounded-lg">
                <div className="text-2xl font-bold text-fg">
                  {formatBytes(storageUsage.storageLimit)}
                </div>
                <div className="text-sm text-fg-muted mt-1">Storage Limit</div>
              </div>
              <div className="text-center p-4 bg-surface-muted rounded-lg">
                <div className="text-2xl font-bold text-fg">
                  {formatBytes(storageUsage.storageLimit - storageUsage.currentUsage)}
                </div>
                <div className="text-sm text-fg-muted mt-1">Available</div>
              </div>
            </div>

            {/* Status Message */}
            {!isNearLimit && (
              <div className="mt-6 flex items-center gap-2 text-green-600 bg-green-50 px-4 py-3 rounded-lg">
                <CheckCircle className="w-5 h-5" />
                <span>Your storage usage is within normal limits</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardScaffold>
  );
};

export default StoragePage;
