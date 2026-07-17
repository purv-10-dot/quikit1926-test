'use client';
/**
 * WelcomeKitEditor — ported 1:1 from the old QuikSkills frontend
 * (src/components/WelcomeKitEditor.tsx). Replaces the "coming soon" stub.
 *
 * Super-admin modal that does two things:
 *   1. Startup Guide PDF — uploads the fixed welcome-kit PDF and offers a
 *      download of the currently stored one.
 *   2. Email Template — loads/saves the `welcome-kit` email template
 *      (GET/POST /api/email-templates/welcome-kit) with a live iframe preview
 *      rendered against sample placeholder data.
 *
 * Upload/download deviate from the legacy axios calls because the Next routes
 * changed contract (see handleUpload / handleDownloadCurrent).
 */
import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Eye, Download, Save, Mail, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

interface WelcomeKitEditorProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface EmailTemplateResponse {
  success: boolean;
  data?: {
    subject?: string;
    htmlContent?: string;
  } | null;
}

interface WelcomeKitPresignResponse {
  success: boolean;
  message?: string;
  uploadUrl: string;
  fileUrl?: string;
}

export const WelcomeKitEditor: React.FC<WelcomeKitEditorProps> = ({
  onClose,
  onSuccess,
}) => {
  // Default template values
  const getDefaultTemplate = () => {
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
      .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
      .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      .info-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Welcome to QuikSkill LMS!</h1>
      </div>
      <div class="content">
        <p>Dear {{contactName}},</p>
        <p>Congratulations! Your organization <strong>{{tenantName}}</strong> has been successfully onboarded to QuikSkill LMS.</p>

        <div class="info-box">
          <h3>Your Login Credentials</h3>
          <p><strong>Login URL:</strong> <a href="{{loginUrl}}">{{loginUrl}}</a></p>
          <p><strong>Invitation Link:</strong> <a href="{{invitationUrl}}">Click here to accept invitation</a></p>
        </div>

        <p>Please find attached the Startup Guide PDF that contains:</p>
        <ul>
          <li>Getting started instructions</li>
          <li>Platform overview and features</li>
          <li>Best practices for course creation</li>
          <li>Support and resources</li>
        </ul>

        <p>If you have any questions, please don't hesitate to contact our support team.</p>

        <p>Best regards,<br>The QuikSkill Team</p>
      </div>
    </div>
  </body>
  </html>`;
  };

  const defaultSubject = 'Welcome to QuikSkill LMS - {{tenantName}}';
  const defaultHtmlContent = getDefaultTemplate();

  // PDF Upload State
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Email Template State
  const [subject, setSubject] = useState(defaultSubject);
  const [htmlContent, setHtmlContent] = useState(defaultHtmlContent);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateSuccess, setTemplateSuccess] = useState(false);

  // Preview data
  const [previewData] = useState({
    contactName: 'John Doe',
    tenantName: 'Acme Corporation',
    loginUrl: 'https://skillopia.com/login/acme',
    invitationUrl: 'https://auth0.com/invitation/abc123',
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (selectedFile.type !== 'application/pdf') {
        setError('Please select a PDF file');
        return;
      }

      // Validate file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }

      setFile(selectedFile);
      setError(null);

      // Create preview URL
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a PDF file');
      return;
    }

    setUploading(true);
    setError(null);
    setTemplateError(null);

    try {
      // Upload PDF.
      //
      // Legacy POSTed multipart FormData. This app's POST /api/upload/welcome-kit
      // is a presigned-PUT minter: JSON { fileType, fileSize } in, an `uploadUrl`
      // back that the browser PUTs the bytes to. It cannot go through
      // `uploadViaPresign` because that helper reads `res.data.uploadUrl`, while
      // this route returns `uploadUrl` at the TOP LEVEL of the body.
      const presign = await api.post<WelcomeKitPresignResponse>('/upload/welcome-kit', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      if (!presign?.uploadUrl) throw new Error('No upload URL returned');

      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      // Save email template if subject and content are provided
      if (subject.trim() && htmlContent.trim()) {
        try {
          await api.post('/email-templates/welcome-kit', {
            subject,
            htmlContent,
          });
          setTemplateSuccess(true);
        } catch (templateErr: unknown) {
          // Don't fail the whole operation if template save fails
          setTemplateError(
            (templateErr as { message?: string })?.message || 'PDF saved but email template failed to save',
          );
        }
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message || 'Failed to upload startup guide PDF',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadCurrent = async () => {
    try {
      // GET /api/upload/welcome-kit streams raw PDF bytes with
      // `Content-Disposition: attachment` — NOT JSON. `api.get` would try to
      // JSON.parse the body, so this goes through raw fetch and reads a blob.
      const response = await fetch('/api/upload/welcome-kit', {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to download current startup guide');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'QuikSkill_Startup_Guide.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError('Failed to download current startup guide');
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Email Template Functions
  const loadTemplate = async () => {
    try {
      setLoadingTemplate(true);
      const response = await api.get<EmailTemplateResponse>('/email-templates/welcome-kit');
      if (response?.data) {
        setSubject(response.data.subject || defaultSubject);
        setHtmlContent(response.data.htmlContent || defaultHtmlContent);
      } else {
        setSubject(defaultSubject);
        setHtmlContent(defaultHtmlContent);
      }
    } catch (error) {
      // Silently fail and use defaults
      console.error('Failed to load email template:', error);
      setSubject(defaultSubject);
      setHtmlContent(defaultHtmlContent);
    } finally {
      setLoadingTemplate(false);
    }
  };

  useEffect(() => {
    // Initialize with defaults immediately
    setSubject(defaultSubject);
    setHtmlContent(defaultHtmlContent);
    // Then try to load from API
    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replacePlaceholders = (template: string, data: typeof previewData) => {
    return template
      .replace(/\{\{contactName\}\}/g, data.contactName)
      .replace(/\{\{tenantName\}\}/g, data.tenantName)
      .replace(/\{\{loginUrl\}\}/g, data.loginUrl)
      .replace(/\{\{invitationUrl\}\}/g, data.invitationUrl);
  };

  const handleSaveTemplate = async () => {
    if (!subject.trim() || !htmlContent.trim()) {
      setTemplateError('Subject and content are required');
      return;
    }

    setSavingTemplate(true);
    setTemplateError(null);

    try {
      await api.post('/email-templates/welcome-kit', {
        subject,
        htmlContent,
      });

      setTemplateSuccess(true);
      setTimeout(() => {
        setTemplateSuccess(false);
      }, 2000);
    } catch (err: unknown) {
      setTemplateError(
        (err as { message?: string })?.message || 'Failed to save email template',
      );
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleResetTemplate = () => {
    setSubject(defaultSubject);
    setHtmlContent(defaultHtmlContent);
    setTemplateError(null);
  };

  // Debug: Log when component renders
  useEffect(() => {
    console.log('WelcomeKitEditor component mounted');
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Welcome Kit Editor</h2>
            <p className="text-sm text-gray-600 mt-1">
              Upload Startup Guide PDF and customize the welcome email template
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={uploading || savingTemplate}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: PDF Upload & Email Template */}
            <div className="lg:col-span-2 space-y-6">
              {/* Startup Guide PDF Upload Section */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Startup Guide PDF
                  </h3>
                </div>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-500 transition-colors bg-white">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="pdf-upload"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="pdf-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <Upload className="w-12 h-12 text-gray-400 mb-4" />
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">
                      PDF file (max 10MB)
                    </p>
                  </label>
                </div>

                {file && (
                  <div className="mt-4 p-4 bg-white rounded-lg flex items-center justify-between border border-gray-200">
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-red-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleRemoveFile}
                      className="text-red-600 hover:text-red-700"
                      disabled={uploading}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}

                <div className="mt-4">
                  <button
                    onClick={handleDownloadCurrent}
                    className="btn-secondary text-sm inline-flex items-center gap-2"
                    disabled={uploading}
                  >
                    <Download className="w-4 h-4" />
                    Download Current PDF
                  </button>
                </div>
              </div>

              {/* Email Template Section */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Mail className="w-5 h-5 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Email Template
                  </h3>
                </div>

                {loadingTemplate ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Email Subject <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="input-field"
                        placeholder="Welcome to QuikSkill LMS - {{tenantName}}"
                        disabled={uploading || savingTemplate}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use <code className="bg-gray-100 px-1 rounded">{'{{tenantName}}'}</code> for dynamic content
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700">
                          HTML Content <span className="text-red-500">*</span>
                        </label>
                        <button
                          onClick={handleResetTemplate}
                          className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
                          disabled={uploading || savingTemplate}
                        >
                          <RefreshCw className="w-3 h-3" />
                          Reset to Default
                        </button>
                      </div>
                      <textarea
                        value={htmlContent}
                        onChange={(e) => setHtmlContent(e.target.value)}
                        className="input-field font-mono text-xs"
                        rows={15}
                        placeholder="Enter HTML email template..."
                        disabled={uploading || savingTemplate}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Placeholders: <code className="bg-gray-100 px-1 rounded">{'{{contactName}}'}</code>,{' '}
                        <code className="bg-gray-100 px-1 rounded">{'{{tenantName}}'}</code>,{' '}
                        <code className="bg-gray-100 px-1 rounded">{'{{loginUrl}}'}</code>,{' '}
                        <code className="bg-gray-100 px-1 rounded">{'{{invitationUrl}}'}</code>
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveTemplate}
                        disabled={!subject.trim() || !htmlContent.trim() || savingTemplate}
                        className="btn-secondary text-sm inline-flex items-center gap-2"
                      >
                        {savingTemplate ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
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
                )}

                {templateError && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800 text-sm">{templateError}</p>
                  </div>
                )}

                {templateSuccess && (
                  <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-green-800 text-sm">
                      Email template saved successfully!
                    </p>
                  </div>
                )}
              </div>

              {/* Error Messages */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-green-800 text-sm">
                    Startup Guide uploaded successfully!
                    {templateSuccess && ' Email template saved.'}
                  </p>
                </div>
              )}

              {/* Save Button */}
              <div className="flex gap-4 pt-4">
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Welcome Kit
                    </>
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="btn-secondary"
                  disabled={uploading}
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Right Column: Email Preview */}
            <div className="lg:col-span-1">
              <div className="sticky top-4">
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-5 h-5 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      Email Preview
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500">
                    Live preview of how the email will look
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                  {/* Email Subject Preview */}
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">Subject:</p>
                    <p className="text-sm font-medium text-gray-900">
                      {replacePlaceholders(subject, previewData)}
                    </p>
                  </div>

                  {/* Email Body Preview */}
                  <div className="bg-white" style={{ height: '600px', overflow: 'auto' }}>
                    <iframe
                      srcDoc={replacePlaceholders(htmlContent, previewData)}
                      className="w-full h-full border-0"
                      title="Email Preview"
                    />
                  </div>
                </div>

                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> This preview uses sample data. The actual email will use real tenant information.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeKitEditor;
