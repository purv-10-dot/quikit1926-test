'use client';

import { useState, useEffect } from 'react';
import { Award, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import { api } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';
import CertificateDesigner from '@/components/CertificateDesigner';
import DeleteConfirmationModal from '@/components/DeleteConfirmationModal';

interface Certificate {
  _id: string;
  name: string;
  backgroundImageUrl: string;
  backgroundPreviewUrl?: string;
  logoImageUrl?: string;
  logoPreviewUrl?: string;
  signatureImageUrl?: string;
  signaturePreviewUrl?: string;
  designation?: string;
  selectedTenants?: { _id: string; companyName: string }[];
  isActive: boolean;
  createdAt: string;
}

export default function CertificateTemplatesPage() {
  const [showDesigner, setShowDesigner] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<string | undefined>(undefined);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [certificateToDelete, setCertificateToDelete] = useState<Certificate | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => {
    loadCertificates();
  }, []);

  const loadCertificates = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ data: Certificate[] }>('/certificates');
      setCertificates(response.data || []);
    } catch (error) {
      console.error('Failed to load certificates:', error);
      toast.error('Failed to load certificate templates.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCertificate(undefined);
    setShowDesigner(true);
  };

  const handleEdit = (id: string) => {
    setEditingCertificate(id);
    setShowDesigner(true);
  };

  const handleDeleteClick = (certificate: Certificate) => {
    setCertificateToDelete(certificate);
  };

  const handleDeleteConfirm = async () => {
    if (!certificateToDelete) return;

    try {
      setDeleting(certificateToDelete._id);
      await api.delete(`/certificates/${certificateToDelete._id}`);
      setCertificateToDelete(null);
      toast.success('Certificate template deleted.');
      loadCertificates();
    } catch (error) {
      console.error('Failed to delete certificate:', error);
      toast.error('Failed to delete certificate template.');
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteCancel = () => {
    setCertificateToDelete(null);
  };

  const handleDeleteAll = async () => {
    try {
      setDeletingAll(true);
      const response = await api.delete<{ count: number }>('/certificates/bulk/delete-all');
      console.log(`Deleted ${response.count} certificate templates`);
      setShowDeleteAllModal(false);
      loadCertificates();
      toast.success(`Successfully deleted ${response.count} certificate template(s)`);
    } catch (error) {
      console.error('Failed to delete all certificates:', error);
      toast.error('Failed to delete certificate templates. Please try again.');
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <DashboardScaffold title="Certificate Templates">
      <Toaster position="top-right" />
      <div className="space-y-6 sm:space-y-8 pb-12">
        {/* Premium Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 rounded-[2rem] shadow-2xl p-6 sm:p-10 lg:p-12 text-white">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z' fill='%23ffffff' fill-opacity='1'/%3E%3C/g%3E%3C/svg%3E")`
            }}
          />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 text-center lg:text-left">
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
                Certificate <span className="text-indigo-200">Architect</span>
              </h1>
              <p className="text-indigo-100/80 text-base sm:text-lg font-medium max-w-2xl">
                Design premium credentials that celebrate learner achievements and reinforce brand authority.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
              {certificates.length > 0 && (
                <button
                  onClick={() => setShowDeleteAllModal(true)}
                  className="bg-white/10 hover:bg-red-500/20 backdrop-blur-xl text-white px-8 py-4 rounded-2xl font-bold inline-flex items-center gap-3 transition-all duration-300 border border-white/20 hover:border-red-500/40 shadow-lg active:scale-95"
                >
                  <Trash2 className="w-5 h-5 text-red-200" />
                  Purge All
                </button>
              )}
              <button
                onClick={handleCreate}
                className="group bg-white text-indigo-600 hover:bg-indigo-50 px-8 py-4 rounded-2xl font-black inline-flex items-center gap-3 transition-all duration-300 shadow-xl active:scale-95"
              >
                <Plus className="w-6 h-6 transition-transform group-hover:scale-110" />
                Design Template
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Fetching Artifacts...</p>
            </div>
          </div>
        ) : certificates.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border-2 border-dashed border-[#f2f2f7] dark:border-gray-700 p-20">
            <div className="text-center max-w-lg mx-auto">
              <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/30 rounded-3xl flex items-center justify-center mb-8 mx-auto">
                <Award className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-4">
                Uncertified Ecosystem
              </h3>
              <p className="text-gray-400 font-bold mb-10 leading-relaxed">
                You haven&apos;t designed any certificate templates yet. These blueprints define how completions are recognized across your platform nodes.
              </p>
              <button
                onClick={handleCreate}
                className="px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black inline-flex items-center gap-3 transition-all transform hover:scale-105 shadow-xl shadow-indigo-100"
              >
                <Plus className="w-6 h-6" />
                Start First Design
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {certificates.map((cert) => (
              <div
                key={cert._id}
                className="group bg-white dark:bg-gray-800 rounded-[2rem] border border-[#f2f2f7] dark:border-gray-700 overflow-hidden hover:shadow-2xl hover:-translate-y-2 transition-all duration-500"
              >
                <div className="relative h-52 overflow-hidden bg-gray-100 dark:bg-gray-900">
                  {cert.backgroundImageUrl ? (
                    <img
                      src={cert.backgroundPreviewUrl || cert.backgroundImageUrl}
                      alt={cert.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-700 flex items-center justify-center">
                      <Award className="w-16 h-16 text-white/30" />
                    </div>
                  )}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <span
                      className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full backdrop-blur-md border ${
                        cert.isActive
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                      }`}
                    >
                      {cert.isActive ? 'Active' : 'Archived'}
                    </span>
                  </div>
                </div>

                <div className="p-8">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {cert.selectedTenants && cert.selectedTenants.length > 0 ? (
                      <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-500 rounded-lg border border-indigo-100">
                        {cert.selectedTenants.length} Restricted Nodes
                      </span>
                    ) : (
                      <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
                        Global Availability
                      </span>
                    )}
                    {cert.logoImageUrl && (
                      <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-violet-50 text-violet-500 rounded-lg border border-violet-100">
                        Branded
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 line-clamp-1 leading-tight group-hover:text-indigo-600 transition-colors">
                    {cert.name}
                  </h3>
                  {cert.designation && (
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">{cert.designation}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(cert._id)}
                      className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-100 active:scale-95"
                    >
                      Modify Schema
                    </button>
                    <button
                      onClick={() => handleDeleteClick(cert)}
                      disabled={deleting === cert._id}
                      className="p-3 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all border border-red-100 group/del"
                    >
                      {deleting === cert._id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
                      ) : (
                        <Trash2 className="w-5 h-5 group-hover/del:scale-110 transition-transform" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Certificate Designer Modal */}
        {showDesigner && (
          <CertificateDesigner
            certificateId={editingCertificate}
            onClose={() => {
              setShowDesigner(false);
              setEditingCertificate(undefined);
            }}
            onSuccess={() => {
              setShowDesigner(false);
              setEditingCertificate(undefined);
              loadCertificates();
            }}
          />
        )}

        {/* Delete Confirmation Modal */}
        {certificateToDelete && (
          <DeleteConfirmationModal
            isOpen={!!certificateToDelete}
            onClose={handleDeleteCancel}
            onConfirm={handleDeleteConfirm}
            title="Delete Certificate Template"
            message="Are you sure you want to delete this certificate template?"
            itemName={certificateToDelete?.name || ''}
            isLoading={deleting === certificateToDelete?._id}
          />
        )}

        {/* Delete All Templates Modal */}
        {showDeleteAllModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Delete All Certificate Templates?
                  </h3>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  This will permanently delete{' '}
                  <strong>ALL {certificates.length} certificate template(s)</strong> from the system.
                  This action cannot be undone. Are you absolutely sure?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteAllModal(false)}
                    disabled={deletingAll}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAll}
                    disabled={deletingAll}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {deletingAll ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Delete All
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardScaffold>
  );
}
