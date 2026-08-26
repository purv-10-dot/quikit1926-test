'use client';
/**
 * UpgradeEmailTemplateEditor — ported 1:1 from the old QuikLMSs frontend
 * (src/components/UpgradeEmailTemplateEditor.tsx). Replaces the "coming soon" stub.
 *
 * Super-admin modal for the storage-upgrade notification email:
 * loads the `upgrade-invoice` template (GET /api/email-templates/upgrade-invoice),
 * lets it be edited as raw HTML, offers a toggleable preview rendered against
 * sample placeholder data, and saves it back (POST same path).
 *
 * A load failure is treated as "template does not exist yet" and silently falls
 * back to a hardcoded default — as in the legacy component.
 */
import React, { useState, useEffect } from 'react';
import { X, Save, Eye, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface UpgradeEmailTemplateEditorProps {
  onClose: () => void;
}

interface EmailTemplateResponse {
  success: boolean;
  data: {
    subject?: string;
    htmlContent?: string;
  };
}

export const UpgradeEmailTemplateEditor: React.FC<UpgradeEmailTemplateEditorProps> = ({ onClose }) => {
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      const response = await api.get<EmailTemplateResponse>('/email-templates/upgrade-invoice');
      if (response.success) {
        setSubject(response.data.subject || '');
        setHtmlContent(response.data.htmlContent || '');
      }
    } catch {
      // Template might not exist, use defaults
      setSubject('Storage Upgrade Required - {{tenantName}}');
      setHtmlContent(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1f2937;">Storage Upgrade Required</h2>
          <p>Dear {{contactName}},</p>

          <p>Your organization <strong>{{tenantName}}</strong> has reached <strong>{{storagePercentage}}%</strong> of your allocated storage limit (2GB).</p>

          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Current Usage:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Storage Used:</strong> {{storageUsedMB}} MB</li>
              <li><strong>Storage Limit:</strong> {{storageLimitMB}} MB ({{storageLimitGB}} GB)</li>
              <li><strong>Percentage Used:</strong> {{storagePercentage}}%</li>
            </ul>
          </div>

          <p>To continue uploading content without interruption, please consider upgrading your storage plan.</p>

          <div style="margin: 30px 0;">
            <a href="{{loginUrl}}"
               style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Upgrade Options
            </a>
          </div>

          <p>If you have any questions, please contact our support team.</p>

          <p>Best regards,<br>QuikLMS LMS Team</p>
        </div>
      `);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await api.post('/email-templates/upgrade-invoice', {
        subject,
        htmlContent,
      });

      setSuccess('Template saved successfully!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const previewHtml = htmlContent
    .replace(/\{\{tenantName\}\}/g, 'Acme Corporation')
    .replace(/\{\{contactName\}\}/g, 'John Doe')
    .replace(/\{\{storagePercentage\}\}/g, '85.5')
    .replace(/\{\{storageUsedMB\}\}/g, '1750.25')
    .replace(/\{\{storageLimitMB\}\}/g, '2048')
    .replace(/\{\{storageLimitGB\}\}/g, '2')
    .replace(/\{\{loginUrl\}\}/g, 'https://acme.quikskill.com/login');

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Upgrade Mail Template</h2>
            <p className="text-sm text-gray-600 mt-1">
              Edit the email template for storage upgrade notifications
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={saving}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6">
          <div className="mb-4">
            <label className="label-field">Email Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input-field"
              placeholder="Storage Upgrade Required - {{tenantName}}"
            />
            <p className="text-xs text-gray-500 mt-1">
              Available placeholders: {'{{tenantName}}'}
            </p>
          </div>

          <div className="mb-4">
            <label className="label-field">Email HTML Content</label>
            <textarea
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              className="input-field font-mono text-sm"
              rows={20}
              placeholder="Enter HTML content..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Available placeholders: {'{{tenantName}}'}, {'{{contactName}}'}, {'{{storagePercentage}}'}, {'{{storageUsedMB}}'}, {'{{storageLimitMB}}'}, {'{{storageLimitGB}}'}, {'{{loginUrl}}'}
            </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          {/* Preview */}
          {showPreview && (
            <div className="mb-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
              <h3 className="font-semibold text-gray-900 mb-2">Preview</h3>
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="btn-secondary inline-flex items-center gap-2"
            disabled={saving}
          >
            <Eye className="w-4 h-4" />
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !subject.trim() || !htmlContent.trim()}
            className="btn-primary inline-flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Template
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeEmailTemplateEditor;
