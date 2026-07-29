'use client';

import { useState, useEffect } from 'react';
import {
  Users, BookOpen, FileText, Mail, CheckCircle, AlertTriangle,
  Clock, TrendingUp, Award, Plus, ChevronRight, RefreshCw,
  UserX, Search,
} from 'lucide-react';
import { api } from '@/lib/api';
import UserProfileModal from '@/components/manager/UserProfileModal';
import TeamEnrollmentModal from '@/components/manager/TeamEnrollmentModal';
import AssessmentAuditModal from '@/components/manager/AssessmentAuditModal';
import NudgeBulkModal from '@/components/manager/NudgeBulkModal';
import CongratulateModal from '@/components/manager/CongratulateModal';
import toast, { Toaster } from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────
interface TeamMember {
  userId: string;
  userName: string;
  email: string;
  completionPercentage: number;
  coursesCompleted: number;
  activeCoursesCount: number;
  lastLogin?: string;
  status: 'on-track' | 'at-risk' | 'stuck' | 'completed';
}

// ─── Helpers ─────────────────────────────────────────────────────────
const deriveStatus = (member: any): TeamMember['status'] => {
  if (member.completionPercentage >= 100) return 'completed';
  if (member.completionPercentage < 30) return 'stuck';
  if (member.completionPercentage < 70) return 'at-risk';
  return 'on-track';
};

const statusConfig: Record<TeamMember['status'], { label: string; bg: string; text: string; icon: React.ElementType }> = {
  completed:  { label: 'Completed',  bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle },
  'on-track': { label: 'On Track',   bg: 'bg-blue-100',    text: 'text-blue-700',    icon: TrendingUp },
  'at-risk':  { label: 'At Risk',    bg: 'bg-amber-100',   text: 'text-amber-700',   icon: AlertTriangle },
  stuck:      { label: 'Stuck',      bg: 'bg-red-100',     text: 'text-red-700',     icon: AlertTriangle },
};

// ─── Sub-components ──────────────────────────────────────────────────
const LocalStatCard = ({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType;
  color: 'blue' | 'emerald' | 'amber' | 'red';
}) => {
  const palette = {
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-200', iconBg: 'bg-blue-100', iconText: 'text-blue-600',    valueText: 'text-blue-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', valueText: 'text-emerald-700' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200', iconBg: 'bg-amber-100', iconText: 'text-amber-600',   valueText: 'text-amber-700' },
    red:     { bg: 'bg-red-50',     border: 'border-red-200', iconBg: 'bg-red-100', iconText: 'text-red-600',     valueText: 'text-red-700' },
  }[color];

  return (
    <div className={`${palette.bg} border ${palette.border} rounded-2xl p-5`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${palette.valueText}`}>{value}</p>
        </div>
        <div className={`p-3 ${palette.iconBg} rounded-xl`}>
          <Icon className={`w-6 h-6 ${palette.iconText}`} />
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: TeamMember['status'] }) => {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
};

// ─── Main Component ──────────────────────────────────────────────────
const MyTeamPage = () => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [showNudgeModal, setShowNudgeModal] = useState(false);
  const [showCongratulateModal, setShowCongratulateModal] = useState(false);
  const [activeView, setActiveView] = useState<'overview' | 'communication'>('overview');

  const loadTeamData = async () => {
    setError(null);
    try {
      const response = await api.get<any>('/manager/team-stats');
      const data = response.data;

      const members: TeamMember[] = (data.teamMembers || []).map((member: any) => ({
        ...member,
        status: deriveStatus(member),
      }));

      setTeamMembers(members);
    } catch (err: any) {
      console.error('Failed to load team data:', err);
      setError(err?.message || 'Failed to load team data');
      setTeamMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTeamData(); }, []);

  const filteredMembers = teamMembers.filter(m => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return m.userName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  const counts = {
    total: teamMembers.length,
    onTrack: teamMembers.filter(m => m.status === 'on-track' || m.status === 'completed').length,
    atRisk: teamMembers.filter(m => m.status === 'at-risk').length,
    stuck: teamMembers.filter(m => m.status === 'stuck').length,
  };

  // ─── Loading ──────
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
        </div>
        <div className="h-96 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  // ─── Error ──────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Failed to load team data</h3>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <button
          onClick={() => { setLoading(true); loadTeamData(); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Team</h1>
          <p className="text-gray-500 mt-1">Manage and monitor your team&apos;s learning progress</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); loadTeamData(); }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowEnrollmentModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Assign Course
          </button>
        </div>
      </div>

      {/* Empty state */}
      {teamMembers.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
            <UserX className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Team Members</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            No learners have been assigned to you yet. Ask your Tenant Admin to assign learners to your team.
          </p>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <LocalStatCard label="Team Members" value={counts.total} icon={Users} color="blue" />
            <LocalStatCard label="On Track" value={counts.onTrack} icon={CheckCircle} color="emerald" />
            <LocalStatCard label="At Risk" value={counts.atRisk} icon={AlertTriangle} color="amber" />
            <LocalStatCard label="Stuck" value={counts.stuck} icon={AlertTriangle} color="red" />
          </div>

          {/* View Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-6">
              {[
                { id: 'overview', label: 'Team Overview', icon: Users },
                { id: 'communication', label: 'Communication', icon: Mail },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveView(tab.id as 'overview' | 'communication')}
                    className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-all ${
                      activeView === tab.id
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Team Overview */}
          {activeView === 'overview' && (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                />
              </div>

              {/* Team Table */}
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Member</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Status</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Progress</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Courses</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Last Active</th>
                        <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredMembers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-gray-500 text-sm">
                            {searchQuery ? 'No members match your search' : 'No team members found'}
                          </td>
                        </tr>
                      ) : (
                        filteredMembers.map(member => (
                          <tr key={member.userId} className="hover:bg-gray-50 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                                  <span className="text-primary-700 font-semibold text-sm">
                                    {member.userName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{member.userName}</p>
                                  <p className="text-xs text-gray-500 truncate">{member.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <StatusBadge status={member.status} />
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      member.completionPercentage >= 80 ? 'bg-emerald-500' :
                                      member.completionPercentage >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.min(member.completionPercentage, 100)}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-gray-700 w-10">{member.completionPercentage}%</span>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <span className="text-sm text-gray-700">{member.coursesCompleted}/{member.activeCoursesCount}</span>
                            </td>
                            <td className="py-4 px-6 text-sm text-gray-500">
                              {member.lastLogin ? new Date(member.lastLogin).toLocaleDateString() : 'Never'}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <button
                                onClick={() => setSelectedUserId(member.userId)}
                                className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm font-medium transition-colors"
                              >
                                View
                                <ChevronRight className="w-4 h-4" />
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
          )}

          {/* Communication Tab */}
          {activeView === 'communication' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setShowNudgeModal(true)}
                  className="flex items-center gap-4 p-5 bg-white border border-gray-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left"
                >
                  <div className="p-3 bg-blue-100 rounded-xl shrink-0">
                    <Mail className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Send Nudge</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Remind team members to complete their courses</p>
                  </div>
                </button>
                <button
                  onClick={() => setShowCongratulateModal(true)}
                  className="flex items-center gap-4 p-5 bg-white border border-gray-200 rounded-2xl hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-left"
                >
                  <div className="p-3 bg-emerald-100 rounded-xl shrink-0">
                    <Award className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Congratulate</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Recognize members who completed courses</p>
                  </div>
                </button>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-base font-semibold text-gray-900">Team Members</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {teamMembers.map(member => (
                    <div key={member.userId} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-primary-700 font-semibold text-sm">
                            {member.userName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{member.userName}</p>
                          <p className="text-xs text-gray-500 truncate">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <a
                          href={`mailto:${member.email}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Email
                        </a>
                        <button
                          onClick={() => setSelectedUserId(member.userId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
                        >
                          Profile
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Modals ─── */}
      {selectedUserId && !selectedCourseId && (
        <UserProfileModal
          userId={selectedUserId}
          onClose={() => { setSelectedUserId(null); setSelectedCourseId(null); }}
          onResetQuiz={() => loadTeamData()}
          onNudge={() => loadTeamData()}
          onViewResults={(courseId: string) => setSelectedCourseId(courseId)}
        />
      )}

      {showEnrollmentModal && (
        <TeamEnrollmentModal
          onClose={() => setShowEnrollmentModal(false)}
          onEnrollSuccess={() => loadTeamData()}
        />
      )}

      {selectedUserId && selectedCourseId && (
        <AssessmentAuditModal
          userId={selectedUserId}
          courseId={selectedCourseId}
          onClose={() => setSelectedCourseId(null)}
        />
      )}

      {showNudgeModal && (
        <NudgeBulkModal
          idleLearners={teamMembers.map(m => ({
            userId: m.userId,
            userName: m.userName,
            email: m.email,
            daysSinceLastLogin: m.lastLogin
              ? Math.floor((Date.now() - new Date(m.lastLogin).getTime()) / (1000 * 60 * 60 * 24))
              : 0,
          }))}
          onClose={() => setShowNudgeModal(false)}
          onSuccess={() => { loadTeamData(); setShowNudgeModal(false); }}
        />
      )}

      {showCongratulateModal && (
        <CongratulateModal
          teamMembers={teamMembers.map(m => ({
            userId: m.userId,
            userName: m.userName,
            email: m.email,
            completionPercentage: m.completionPercentage,
            coursesCompleted: m.coursesCompleted,
          }))}
          onClose={() => setShowCongratulateModal(false)}
          onSuccess={() => { loadTeamData(); setShowCongratulateModal(false); }}
        />
      )}
    </div>
  );
};

export default MyTeamPage;
