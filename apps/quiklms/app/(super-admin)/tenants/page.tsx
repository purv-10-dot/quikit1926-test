'use client';

import { useState, useEffect } from 'react';
import {
  Building2, Plus, Search, ExternalLink, Pause, Play, FileText,
  Mail, HardDrive, Pencil, X, Save, User, CreditCard,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import TenantOnboardingWizard from '@/components/TenantOnboardingWizard';
import WelcomeKitEditor from '@/components/WelcomeKitEditor';

/**
 * The tenant portal entry point. Previously read from `tenant.loginUrl`, a
 * per-row copy of this same string that every tenant stored identically and
 * that went stale whenever the deployment URL changed. Derived from the app's
 * canonical origin instead.
 */
const TENANT_LOGIN_URL = `${(process.env.NEXT_PUBLIC_QUIKLMS_URL ?? '').replace(/\/+$/, '')}/login`;

interface Tenant {
  _id: string;
  orgName: string;
  subdomain: string;
  status: string;
  country: string;
  officialEmail: string;
  officialPhone: string;
  fullAddress: string;
  website?: string;
  contactEmail: string;
  contactFirstName: string;
  contactMiddleName?: string;
  contactLastName: string;
  contactPhone: string;
  contactRoleInOrganization: string;
  billingFirstName: string;
  billingMiddleName?: string;
  billingLastName: string;
  billingAddress: string;
  storageLimit: number;
  createdAt: string;
  logoUrl?: string;
  featureConfig?: {
    approvalWorkflowEnabled?: boolean;
    [key: string]: any;
  };
}

const countries = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'India', 'Germany', 'France', 'Other',
];

const organizationRoles = [
  'HR Head', 'CEO', 'CTO', 'Learning & Development Manager', 'Training Manager', 'Operations Manager', 'Other',
];

const editSteps = [
  { id: 1, title: 'Organization Profile', icon: Building2 },
  { id: 2, title: 'Primary Contact', icon: User },
  { id: 3, title: 'Billing & Storage', icon: CreditCard },
];

export default function TenantsPage() {
  const [showWizard, setShowWizard] = useState(false);
  const [showWelcomeKitEditor, setShowWelcomeKitEditor] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState<Partial<Tenant>>({});
  const [editStep, setEditStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ data: Tenant[] }>('/tenants');
      setTenants(response.data || []);
    } catch (error) {
      console.error('Failed to load tenants:', error);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredTenants = tenants.filter((tenant) =>
    tenant.orgName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tenant.subdomain.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tenant.contactEmail.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleToggleApprovalWorkflow = async (orgId: string, currentValue: boolean) => {
    try {
      await api.patch(`/tenants/${orgId}`, {
        featureConfig: { approvalWorkflowEnabled: !currentValue },
      });
      setTenants((prev) =>
        prev.map((t) =>
          t._id === orgId
            ? { ...t, featureConfig: { ...(t.featureConfig || {}), approvalWorkflowEnabled: !currentValue } }
            : t,
        ),
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update approval workflow setting');
    }
  };

  const handleToggleStatus = async (orgId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
      await api.patch(`/tenants/${orgId}`, { status: newStatus });
      loadTenants();
    } catch (error) {
      console.error('Failed to update tenant status:', error);
      toast.error('Failed to update tenant status');
    }
  };

  const openEditModal = async (tenant: Tenant) => {
    try {
      const response = await api.get<{ data: Tenant }>(`/tenants/${tenant._id}`);
      const fullTenant = response.data;
      setEditingTenant(fullTenant);
      setEditForm({
        orgName: fullTenant.orgName || '',
        officialEmail: fullTenant.officialEmail || '',
        officialPhone: fullTenant.officialPhone || '',
        country: fullTenant.country || '',
        fullAddress: fullTenant.fullAddress || '',
        website: fullTenant.website || '',
        storageLimit: fullTenant.storageLimit || 2,
        contactFirstName: fullTenant.contactFirstName || '',
        contactMiddleName: fullTenant.contactMiddleName || '',
        contactLastName: fullTenant.contactLastName || '',
        contactPhone: fullTenant.contactPhone || '',
        contactEmail: fullTenant.contactEmail || '',
        contactRoleInOrganization: fullTenant.contactRoleInOrganization || '',
        billingFirstName: fullTenant.billingFirstName || '',
        billingMiddleName: fullTenant.billingMiddleName || '',
        billingLastName: fullTenant.billingLastName || '',
        billingAddress: fullTenant.billingAddress || '',
      });
      setEditStep(1);
      setEditError(null);
      setEditSuccess(false);
    } catch (error) {
      console.error('Failed to load tenant details:', error);
      toast.error('Failed to load tenant details');
    }
  };

  const closeEditModal = () => {
    setEditingTenant(null);
    setEditForm({});
    setEditStep(1);
    setEditError(null);
    setEditSuccess(false);
  };

  const handleEditFormChange = (field: string, value: string | number) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async () => {
    if (!editingTenant) return;

    setIsSaving(true);
    setEditError(null);
    setEditSuccess(false);

    try {
      const updatePayload: Record<string, any> = {};
      const editableFields = [
        'orgName', 'officialEmail', 'officialPhone', 'country', 'fullAddress', 'website',
        'storageLimit', 'contactFirstName', 'contactMiddleName', 'contactLastName',
        'contactPhone', 'contactEmail', 'contactRoleInOrganization',
        'billingFirstName', 'billingMiddleName', 'billingLastName', 'billingAddress',
      ];

      for (const field of editableFields) {
        const newVal = (editForm as any)[field];
        const oldVal = (editingTenant as any)[field];
        if (newVal !== undefined && newVal !== oldVal) {
          updatePayload[field] = field === 'storageLimit' ? Number(newVal) : newVal;
        }
      }

      if (Object.keys(updatePayload).length === 0) {
        setEditError('No changes detected.');
        setIsSaving(false);
        return;
      }

      await api.patch(`/tenants/${editingTenant._id}`, updatePayload);
      setEditSuccess(true);
      toast.success('Organization updated successfully!');
      loadTenants();

      setTimeout(() => {
        closeEditModal();
      }, 1200);
    } catch (err: any) {
      setEditError(
        err?.message || 'Failed to update organization. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Premium Header with Glassmorphism */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 rounded-[2rem] shadow-2xl p-6 sm:p-10 lg:p-12 text-white">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z' fill='%23ffffff' fill-opacity='1'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-black tracking-tight leading-tight">
              Platform <span className="text-indigo-200">Partners</span>
            </h1>
            <p className="text-indigo-100/80 text-base sm:text-lg lg:text-xl font-medium max-w-2xl">
              Monitor and manage tenant ecosystems, organizational compliance, and portal configurations.
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setShowWelcomeKitEditor(true)}
              className="group relative bg-white/10 hover:bg-white/20 backdrop-blur-xl text-white px-7 py-4 rounded-2xl font-bold inline-flex items-center gap-3 transition-all duration-300 border border-white/20 hover:border-white/40 shadow-lg active:scale-95"
            >
              <FileText className="w-5 h-5 transition-transform group-hover:scale-110" />
              Portal Kit
            </button>
            <button
              onClick={() => setShowWizard(true)}
              className="group bg-white text-indigo-600 hover:bg-indigo-50 px-8 py-4 rounded-2xl font-black inline-flex items-center gap-3 transition-all duration-300 shadow-xl hover:shadow-indigo-500/20 active:scale-95"
            >
              <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
              Onboard Organization
            </button>
          </div>
        </div>
      </div>

      {/* Premium Search Bar */}
      {tenants.length > 0 && (
        <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-3xl shadow-sm border border-[#f2f2f7] dark:border-gray-700 p-6">
          <div className="relative max-w-2xl">
            <Search className="absolute left-6 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Filter by organization name, subdomain, or primary email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-16 pr-8 py-5 bg-[#fafafc] dark:bg-gray-700 border border-[#f2f2f7] dark:border-gray-600 rounded-[1.5rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-gray-900 dark:text-gray-100 font-medium placeholder-gray-400"
            />
          </div>
        </div>
      )}

      {/* Premium Organizations Grid */}
      {filteredTenants.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {filteredTenants.map((tenant) => (
            <div
              key={tenant._id}
              className="group relative bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#f2f2f7] dark:border-gray-700 hover:shadow-2xl transition-all duration-500 overflow-hidden"
            >
              {/* Premium Card Header */}
              <div className="relative bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-white/20 transition-colors" />
                <div className="relative flex items-start justify-between">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-xl p-2 group-hover:scale-110 transition-transform duration-500 flex-shrink-0">
                      {tenant.logoUrl ? (
                        <img
                          src={tenant.logoUrl}
                          alt={tenant.orgName}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                            (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute('style');
                          }}
                        />
                      ) : null}
                      <Building2
                        className="w-7 h-7 text-indigo-600"
                        style={tenant.logoUrl ? { display: 'none' } : {}}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl font-black mb-1 truncate leading-tight">{tenant.orgName}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-100/70 text-xs font-bold uppercase tracking-widest">{tenant.subdomain}</span>
                        <div className="w-1 h-1 rounded-full bg-indigo-300/40" />
                        <span className="text-indigo-100/70 text-xs font-bold uppercase tracking-widest">{tenant.country}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Premium Card Body */}
              <div className="p-8 pb-4">
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-[#fafafc] dark:bg-gray-700/50 p-4 rounded-2xl border border-[#f2f2f7] dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="w-4 h-4 text-indigo-500" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Storage</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{tenant.storageLimit} GB</span>
                  </div>
                  <div className="bg-[#fafafc] dark:bg-gray-700/50 p-4 rounded-2xl border border-[#f2f2f7] dark:border-gray-700 text-right">
                    <div className="flex items-center gap-2 mb-2 justify-end">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</span>
                      <div className={`w-2 h-2 rounded-full ${tenant.status === 'Active' ? 'bg-green-500' : 'bg-orange-500'} animate-pulse`} />
                    </div>
                    <span className={`text-sm font-bold ${tenant.status === 'Active' ? 'text-green-600' : 'text-orange-600'}`}>{tenant.status}</span>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-100/50">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contact Email</span>
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{tenant.contactEmail}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 border border-violet-100/50">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Administrator</span>
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{tenant.contactFirstName} {tenant.contactLastName}</span>
                    </div>
                  </div>
                </div>

                {/* Workflow Toggle */}
                <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-[1.5rem] p-5 flex items-center justify-between mb-2">
                  <div className="min-w-0 mr-4">
                    <p className="text-xs font-black text-amber-800 dark:text-amber-200 uppercase tracking-wider mb-0.5">Approval Flow</p>
                    <p className="text-[11px] text-amber-700/70 font-bold dark:text-amber-400/70 leading-tight">
                      {(tenant.featureConfig?.approvalWorkflowEnabled ?? true) ? 'Super Admin Verified' : 'Direct Publication'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleApprovalWorkflow(tenant._id, tenant.featureConfig?.approvalWorkflowEnabled ?? true)}
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                      (tenant.featureConfig?.approvalWorkflowEnabled ?? true) ? 'bg-amber-500 shadow-sm shadow-amber-200' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${
                      (tenant.featureConfig?.approvalWorkflowEnabled ?? true) ? 'translate-x-6' : ''
                    }`} />
                  </button>
                </div>
              </div>

              {/* Premium Footer Actions */}
              <div className="p-8 pt-2 grid grid-cols-2 gap-3">
                <button
                  onClick={() => openEditModal(tenant)}
                  className="flex items-center justify-center gap-2 px-4 py-4 rounded-[1.25rem] text-sm font-black transition-all duration-300 bg-[#fafafc] hover:bg-indigo-50 text-indigo-600 border border-[#f2f2f7] hover:border-indigo-100 active:scale-95"
                >
                  <Pencil className="w-4 h-4" />
                  Configure
                </button>
                <button
                  onClick={() => handleToggleStatus(tenant._id, tenant.status)}
                  className={`flex items-center justify-center gap-2 px-4 py-4 rounded-[1.25rem] text-sm font-black transition-all duration-300 active:scale-95 ${
                    tenant.status === 'Active'
                      ? 'bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-100'
                      : 'bg-green-50 text-green-600 border border-green-100 hover:bg-green-100'
                  }`}
                >
                  {tenant.status === 'Active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {tenant.status === 'Active' ? 'Suspend' : 'Activate'}
                </button>
                {TENANT_LOGIN_URL && (
                  <a
                    href={TENANT_LOGIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="col-span-2 flex items-center justify-center gap-2 px-4 py-4 rounded-[1.25rem] text-sm font-black transition-all duration-300 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 active:scale-95"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Enter Organization Portal
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : tenants.length === 0 ? (
        /* Premium Empty State */
        <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-[3rem] shadow-xl border border-[#f2f2f7] dark:border-gray-700 p-16 lg:p-24">
          <div className="text-center max-w-xl mx-auto">
            <div className="mx-auto w-24 h-24 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/30 rounded-[2rem] flex items-center justify-center mb-10 shadow-lg border border-white dark:border-gray-700">
              <Building2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-3xl lg:text-4xl font-black text-gray-900 dark:text-gray-100 mb-6 tracking-tight">
              Start Your <span className="text-indigo-600 font-black">Ecosystem</span>
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-10 text-lg lg:text-xl font-medium leading-relaxed">
              You haven't onboarded any organizations yet. Create isolated tenant spaces for your partners, schools, or corporate clients.
            </p>
            <button
              onClick={() => setShowWizard(true)}
              className="group bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black text-lg inline-flex items-center gap-3 transition-all duration-300 shadow-2xl shadow-indigo-200 hover:bg-indigo-700 hover:scale-105 active:scale-95"
            >
              <Plus className="w-6 h-6 transition-transform group-hover:rotate-90" />
              Onboard Organization
            </button>
          </div>
        </div>
      ) : (
        /* Premium No Search Results */
        <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-[3rem] shadow-xl border border-[#f2f2f7] dark:border-gray-700 p-20">
          <div className="text-center max-w-md mx-auto">
            <div className="mx-auto w-20 h-20 bg-[#fafafc] dark:bg-gray-700 rounded-[1.5rem] flex items-center justify-center mb-6 border border-[#f2f2f7] dark:border-gray-600 shadow-sm">
              <Search className="w-8 h-8 text-indigo-300/60" />
            </div>
            <p className="text-gray-400 font-bold text-lg mb-2">No results for</p>
            <p className="text-2xl font-black text-gray-900 dark:text-gray-100 truncate mb-8">"{searchQuery}"</p>
            <button
              onClick={() => setSearchQuery('')}
              className="px-8 py-3 bg-white border border-[#f2f2f7] text-gray-600 font-bold rounded-xl hover:bg-[#fafafc] transition-all"
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}

      {/* Tenant Onboarding Wizard */}
      {showWizard && (
        <TenantOnboardingWizard
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            setShowWizard(false);
            loadTenants();
          }}
        />
      )}

      {/* Welcome Kit Editor */}
      {showWelcomeKitEditor && (
        <WelcomeKitEditor
          onClose={() => setShowWelcomeKitEditor(false)}
          onSuccess={() => {
            setShowWelcomeKitEditor(false);
          }}
        />
      )}

      {/* Edit Organization Modal */}
      {editingTenant && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Edit Organization</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {editingTenant.orgName} &middot; {editingTenant.subdomain}
                </p>
              </div>
              <button
                onClick={closeEditModal}
                disabled={isSaving}
                className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Navigation */}
            <div className="px-8 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
              <div className="flex items-center justify-between">
                {editSteps.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = editStep === step.id;
                  const isCompleted = editStep > step.id;

                  return (
                    <div key={step.id} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <button
                          type="button"
                          onClick={() => setEditStep(step.id)}
                          className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all duration-300 cursor-pointer hover:scale-110 ${
                            isActive
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200'
                              : isCompleted
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400 hover:border-indigo-300'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </button>
                        <span
                          className={`text-xs mt-2 font-medium ${
                            isActive ? 'text-indigo-600' : 'text-gray-500'
                          }`}
                        >
                          {step.title}
                        </span>
                      </div>
                      {index < editSteps.length - 1 && (
                        <div
                          className={`h-0.5 flex-1 mx-3 rounded-full ${
                            isCompleted ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {/* Step 1: Organization Profile */}
              {editStep === 1 && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Organization Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.orgName || ''}
                      onChange={(e) => handleEditFormChange('orgName', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Organization name"
                      disabled={isSaving}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Official Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={editForm.officialEmail || ''}
                      onChange={(e) => handleEditFormChange('officialEmail', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="contact@example.com"
                      disabled={isSaving}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Country <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={editForm.country || ''}
                        onChange={(e) => handleEditFormChange('country', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        disabled={isSaving}
                      >
                        <option value="">Select Country</option>
                        {countries.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Official Phone <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={editForm.officialPhone || ''}
                        onChange={(e) => handleEditFormChange('officialPhone', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="+1 (555) 123-4567"
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Full Address <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={editForm.fullAddress || ''}
                      onChange={(e) => handleEditFormChange('fullAddress', e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                      placeholder="123 Business Street, Suite 100, City, State, ZIP"
                      disabled={isSaving}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Website
                    </label>
                    <input
                      type="url"
                      value={editForm.website || ''}
                      onChange={(e) => handleEditFormChange('website', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="https://example.com"
                      disabled={isSaving}
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Primary Contact */}
              {editStep === 2 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.contactFirstName || ''}
                        onChange={(e) => handleEditFormChange('contactFirstName', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="John"
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Middle Name
                      </label>
                      <input
                        type="text"
                        value={editForm.contactMiddleName || ''}
                        onChange={(e) => handleEditFormChange('contactMiddleName', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="Michael"
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.contactLastName || ''}
                        onChange={(e) => handleEditFormChange('contactLastName', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="Doe"
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Contact Phone <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={editForm.contactPhone || ''}
                        onChange={(e) => handleEditFormChange('contactPhone', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="+1 (555) 123-4567"
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Contact Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={editForm.contactEmail || ''}
                        onChange={(e) => handleEditFormChange('contactEmail', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="john.doe@example.com"
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Role in Organization <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editForm.contactRoleInOrganization || ''}
                      onChange={(e) => handleEditFormChange('contactRoleInOrganization', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      disabled={isSaving}
                    >
                      <option value="">Select Role</option>
                      {organizationRoles.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Step 3: Billing & Storage */}
              {editStep === 3 && (
                <div className="space-y-5">
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 mb-2">
                    <p className="text-sm text-indigo-800 dark:text-indigo-300">
                      <strong>Note:</strong> Changes to billing info and storage limit take effect immediately.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Billing First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.billingFirstName || ''}
                        onChange={(e) => handleEditFormChange('billingFirstName', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="John"
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Billing Middle Name
                      </label>
                      <input
                        type="text"
                        value={editForm.billingMiddleName || ''}
                        onChange={(e) => handleEditFormChange('billingMiddleName', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="Michael"
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Billing Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.billingLastName || ''}
                        onChange={(e) => handleEditFormChange('billingLastName', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="Doe"
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Billing Address <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={editForm.billingAddress || ''}
                      onChange={(e) => handleEditFormChange('billingAddress', e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                      placeholder="123 Billing Street, Suite 200, City, State, ZIP"
                      disabled={isSaving}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Storage Limit (GB)
                    </label>
                    <input
                      type="number"
                      value={editForm.storageLimit || 2}
                      onChange={(e) => handleEditFormChange('storageLimit', Number(e.target.value))}
                      min={1}
                      max={1000}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="2"
                      disabled={isSaving}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">Min: 1 GB, Max: 1000 GB</p>
                  </div>
                </div>
              )}

              {/* Error / Success Messages */}
              {editError && (
                <div className="mt-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <p className="text-sm text-red-700 dark:text-red-400 font-medium">{editError}</p>
                </div>
              )}
              {editSuccess && (
                <div className="mt-5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                  <p className="text-sm text-green-700 dark:text-green-400 font-medium">Organization updated successfully!</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-5 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {editStep > 1 && (
                  <button
                    type="button"
                    onClick={() => setEditStep((s) => s - 1)}
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                  >
                    Back
                  </button>
                )}
                {editStep < 3 && (
                  <button
                    type="button"
                    onClick={() => setEditStep((s) => s + 1)}
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-all disabled:opacity-50"
                  >
                    Next
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving || editSuccess}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
