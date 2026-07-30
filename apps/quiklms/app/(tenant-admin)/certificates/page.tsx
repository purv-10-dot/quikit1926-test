'use client';

import { useState, useEffect } from 'react';
import { Award, Plus, AlertCircle, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import CertificateDesigner from '@/components/CertificateDesigner';
import { useFeatures, useBranding } from '@/app/providers';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { Badge } from '@/components/ui';
import { Card } from '@/components/ui';
import { Skeleton } from '@/components/ui';

interface CertificateTemplate {
  _id: string;
  name: string;
  designation?: string;
  signatoryName?: string;
  approvalStatus: string;
  rejectionReason?: string;
  createdAt: string;
}

const CertificateTemplatesPage = () => {
  const [showDesigner, setShowDesigner] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<string | undefined>(undefined);
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { config } = useFeatures();
  const { branding } = useBranding();
  const approvalEnabled = config.approvalWorkflowEnabled !== false;

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/certificates/${id}`);
      setTemplates(prev => prev.filter(t => t._id !== id));
      toast.success('Template deleted successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete template');
    } finally {
      setDeletingId(null);
      setDeleteConfirmId(null);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ data: CertificateTemplate[] }>('/certificates/my-submissions');
      setTemplates((response as any).data?.data || (response as any).data || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_approval':
        return <Badge tone="warning">Pending Approval</Badge>;
      case 'approved':
        return <Badge tone="success">Approved</Badge>;
      case 'rejected':
        return <Badge tone="danger">Rejected</Badge>;
      default:
        return null;
    }
  };

  if (showDesigner) {
    return (
      <div>
        <Toaster position="top-right" />
        {approvalEnabled ? (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">
                <strong>Approval Required:</strong> Certificate templates you create will be submitted for
                Super Admin approval before becoming active.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border-b border-green-200 px-6 py-3">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">
                <strong>Direct Publish:</strong> Approval workflow is disabled — your templates will be activated immediately.
              </p>
            </div>
          </div>
        )}
        <CertificateDesigner
          certificateId={editingCertificate}
          onClose={() => {
            setShowDesigner(false);
            setEditingCertificate(undefined);
            loadTemplates();
          }}
          isTenantAdmin={true}
          approvalEnabled={approvalEnabled}
        />
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Hero Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
        style={{ background: `linear-gradient(135deg, ${branding?.primaryColor || '#4f46e5'}, ${branding?.secondaryColor || '#ec4899'})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Award className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Certificate Templates</h1>
              <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                Create and manage certificate templates for your organization
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingCertificate(undefined);
              setShowDesigner(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 sm:py-2.5 bg-white text-gray-900 rounded-xl hover:bg-gray-50 font-medium text-sm transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            New Template
          </button>
        </div>
      </div>

      {/* Approval Info */}
      {approvalEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">
              Templates you create are submitted for Super Admin approval. They will become active
              and available to learners only after approval.
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          <span className="ml-3 text-fg-muted">Loading templates...</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-lg border border-line">
          <Award className="w-12 h-12 text-fg-subtle mx-auto mb-3" />
          <p className="text-fg-muted mb-4">No certificate templates yet</p>
          <Button
            variant="primary"
            onClick={() => setShowDesigner(true)}
          >
            Create Your First Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template._id}
              className="bg-surface rounded-lg border border-line p-5 hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold text-fg">{template.name}</h3>
                {getStatusBadge(template.approvalStatus)}
              </div>

              {template.designation && (
                <p className="text-sm text-fg-muted mb-1">
                  <span className="font-medium">Designation:</span> {template.designation}
                </p>
              )}
              {template.signatoryName && (
                <p className="text-sm text-fg-muted mb-1">
                  <span className="font-medium">Signatory:</span> {template.signatoryName}
                </p>
              )}

              <p className="text-sm text-fg-subtle mt-1 mb-3">
                Created: {new Date(template.createdAt).toLocaleDateString()}
              </p>

              {template.approvalStatus === 'rejected' && template.rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                  <p className="text-sm text-red-700">
                    <strong>Rejection Reason:</strong> {template.rejectionReason}
                  </p>
                </div>
              )}

              {template.approvalStatus === 'approved' && approvalEnabled && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 mb-3">
                  <p className="text-xs text-green-700">
                    Editing will re-submit this template for Super Admin approval.
                  </p>
                </div>
              )}

              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => {
                    setEditingCertificate(template._id);
                    setShowDesigner(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  {template.approvalStatus === 'rejected' ? 'Edit & Resubmit' : 'Edit'}
                </button>

                {deleteConfirmId === template._id ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleDelete(template._id)}
                      disabled={deletingId === template._id}
                      className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {deletingId === template._id ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Confirm'
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-3 py-2 bg-surface-muted text-fg-muted rounded-lg hover:bg-surface-sunken text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(template._id)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors"
                    title="Delete template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CertificateTemplatesPage;
