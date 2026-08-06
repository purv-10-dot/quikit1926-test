'use client';
/**
 * StorageWarning — ported from the old QuikSkills frontend
 * (src/components/learner/StorageWarning.tsx).
 *
 * Pre-upload storage guard modal. Given a pending file size and the tenant's
 * current/total storage (in GB), it projects the new total and renders nothing
 * unless the projection is over the limit or above 80% usage. Over-limit hides
 * the "Continue Upload" action and shows an admin-contact note instead.
 */
import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface StorageWarningProps {
  fileSize: number; // in bytes
  tenantStorageLimit: number; // in GB
  currentStorageUsed: number; // in GB
  onCancel: () => void;
  onContinue: () => void;
}

const StorageWarning: React.FC<StorageWarningProps> = ({
  fileSize,
  tenantStorageLimit,
  currentStorageUsed,
  onCancel,
  onContinue,
}) => {
  const fileSizeGB = fileSize / (1024 * 1024 * 1024);
  const newTotal = currentStorageUsed + fileSizeGB;
  const percentageUsed = (newTotal / tenantStorageLimit) * 100;
  const isOverLimit = newTotal > tenantStorageLimit;
  const isWarning = percentageUsed > 80;

  if (!isWarning && !isOverLimit) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${
              isOverLimit ? 'bg-red-100' : 'bg-yellow-100'
            }`}>
              <AlertTriangle className={`w-6 h-6 ${
                isOverLimit ? 'text-red-600' : 'text-yellow-600'
              }`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {isOverLimit ? 'Storage Limit Exceeded' : 'Storage Warning'}
              </h3>
              <p className="text-sm text-gray-600">
                {isOverLimit
                  ? 'This file would exceed your storage limit.'
                  : 'This file is large and will use significant storage.'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">File Size:</span>
              <span className="font-medium text-gray-900">
                {fileSizeGB.toFixed(2)} GB
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Current Storage:</span>
              <span className="font-medium text-gray-900">
                {currentStorageUsed.toFixed(2)} GB / {tenantStorageLimit} GB
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">After Upload:</span>
              <span className={`font-medium ${
                isOverLimit ? 'text-red-600' : 'text-gray-900'
              }`}>
                {newTotal.toFixed(2)} GB / {tenantStorageLimit} GB
                {isOverLimit && ' (Exceeds Limit)'}
              </span>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Storage Usage</span>
                <span>{percentageUsed.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    isOverLimit
                      ? 'bg-red-500'
                      : percentageUsed > 90
                      ? 'bg-yellow-500'
                      : 'bg-primary-500'
                  }`}
                  style={{ width: `${Math.min(100, percentageUsed)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 btn-secondary"
          >
            Cancel
          </button>
          {!isOverLimit && (
            <button
              onClick={onContinue}
              className="flex-1 btn-primary"
            >
              Continue Upload
            </button>
          )}
        </div>

        {isOverLimit && (
          <p className="mt-4 text-sm text-red-600 text-center">
            Please contact your administrator to increase storage limits or remove unused files.
          </p>
        )}
      </div>
    </div>
  );
};

export default StorageWarning;
