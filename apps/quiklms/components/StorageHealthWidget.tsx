'use client';
/**
 * StorageHealthWidget — ported from the old QuikLMSs frontend
 * (src/components/StorageHealthWidget.tsx).
 *
 * Compact tenant storage gauge: polls GET /api/tenants/usage on mount and every
 * 30 seconds, renders a progress bar whose colour steps through green → yellow
 * (>60%) → amber (>80%) → red (>=100%), plus a "Near Limit" / "Full" badge.
 */
import { useState, useEffect } from 'react';
import { HardDrive, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

interface StorageUsageResponse {
  success: boolean;
  data: {
    currentUsage: number;
    storageLimit: number;
  };
}

const StorageHealthWidget = () => {
  const [storageUsage, setStorageUsage] = useState({ currentUsage: 0, storageLimit: 2 * 1024 * 1024 * 1024 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStorageUsage();
    // Refresh every 30 seconds
    const interval = setInterval(loadStorageUsage, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStorageUsage = async () => {
    try {
      const response = await api.get<StorageUsageResponse>('/tenants/usage');
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
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const usagePercentage = (storageUsage.currentUsage / storageUsage.storageLimit) * 100;
  const isNearLimit = usagePercentage > 80;
  const isAtLimit = usagePercentage >= 100;
  const isWarning = usagePercentage > 60;

  // Determine color based on usage
  let barColor = '#10b981'; // Green (default)
  if (isAtLimit) {
    barColor = '#ef4444'; // Red
  } else if (isNearLimit) {
    barColor = '#f59e0b'; // Yellow/Amber
  } else if (isWarning) {
    barColor = '#eab308'; // Yellow
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-2 bg-gray-200 rounded mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <HardDrive className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-900">Storage Health</h3>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-700">
            {formatBytes(storageUsage.currentUsage)}
          </span>
          <span className="text-xs font-medium text-gray-700">
            {formatBytes(storageUsage.storageLimit)}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(usagePercentage, 100)}%`,
              backgroundColor: barColor,
            }}
          ></div>
        </div>
      </div>

      {/* Status Message */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">
          {usagePercentage.toFixed(1)}% Used
        </span>
        {isNearLimit && (
          <div className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-xs font-medium">Near Limit</span>
          </div>
        )}
        {isAtLimit && (
          <div className="flex items-center gap-1 text-red-600">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-xs font-medium">Full</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StorageHealthWidget;
