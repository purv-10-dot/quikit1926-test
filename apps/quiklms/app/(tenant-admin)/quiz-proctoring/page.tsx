'use client';

import React, { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  Activity,
  Filter,
  X,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import { Card, CardContent } from '@/components/ui';
import { Badge } from '@/components/ui';
import { Skeleton } from '@/components/ui';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import FeatureRoute from '@/components/FeatureRoute';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface ProctoringIncident {
  _id: string;
  sessionId: string;
  assessmentId: string;
  courseId: string;
  learner: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    employeeId?: string;
  };
  flagSummary: Record<string, number>;
  disposition: string;
  action: string;
  remarks?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  proctoringFlags: {
    tabSwitches: number;
    fullscreenExits: number;
    copyAttempts: number;
    rightClicks: number;
    shortcutAttempts: number;
    faceEyesClosed: number;
    faceLookingDown: number;
    faceLookingAway: number;
    faceMultiple: number;
    faceNoFace: number;
    totalFlags: number;
    severityLevel: string;
  };
  sessionStatus: string;
  startedAt?: string;
  endedAt?: string;
}

interface ProctoringLogEntry {
  _id: string;
  eventType: string;
  timestamp: string;
  metadata?: any;
  severity: string;
}

const severityColors: Record<string, string> = {
  low: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  medium: 'bg-orange-100 text-orange-800 border-orange-300',
  high: 'bg-red-100 text-red-800 border-red-300',
  none: 'bg-gray-100 text-gray-600 border-gray-300',
};

const dispositionLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending Review', color: 'bg-amber-100 text-amber-800' },
  dismissed: { label: 'Dismissed', color: 'bg-gray-100 text-gray-600' },
  confirmed_violation: { label: 'Confirmed Violation', color: 'bg-red-100 text-red-800' },
};

const eventTypeLabels: Record<string, { label: string; icon: string; color: string }> = {
  tab_switch: { label: 'Tab Switch', icon: '🔄', color: 'text-amber-600' },
  fullscreen_exit: { label: 'Fullscreen Exit', icon: '🖥️', color: 'text-orange-600' },
  copy_attempt: { label: 'Copy Attempt', icon: '📋', color: 'text-red-600' },
  paste_attempt: { label: 'Paste Attempt', icon: '📄', color: 'text-red-600' },
  right_click: { label: 'Right Click', icon: '🖱️', color: 'text-amber-600' },
  shortcut_key: { label: 'Shortcut Key', icon: '⌨️', color: 'text-orange-600' },
  print_attempt: { label: 'Print Attempt', icon: '🖨️', color: 'text-red-700' },
  blur: { label: 'Window Blur', icon: '👁️', color: 'text-amber-500' },
  beforeunload: { label: 'Leave Attempt', icon: '🚪', color: 'text-red-500' },
  face_no_face: { label: 'No Face Detected', icon: '👤❌', color: 'text-red-600' },
  face_multiple: { label: 'Multiple Faces', icon: '👥', color: 'text-red-700' },
  face_looking_away: { label: 'Looking Away', icon: '👀', color: 'text-amber-600' },
  face_looking_down: { label: 'Looking Down', icon: '⬇️', color: 'text-amber-600' },
  face_eyes_closed: { label: 'Eyes Closed', icon: '😴', color: 'text-orange-600' },
  face_too_far: { label: 'Too Far from Camera', icon: '📏', color: 'text-gray-600' },
};

/**
 * Corporate tenants have quiz proctoring off, so this review surface has nothing
 * to show and its `/api/quiz-proctoring/*` calls now 403. The nav entry is
 * feature-gated too; this guards the deep link.
 */
export default function QuizProctoringReviewPage() {
  return (
    <FeatureRoute feature="showQuizProctoring">
      <QuizProctoringReviewContent />
    </FeatureRoute>
  );
}

function QuizProctoringReviewContent() {
  const [incidents, setIncidents] = useState<ProctoringIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<ProctoringIncident | null>(null);
  const [sessionLogs, setSessionLogs] = useState<ProctoringLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    disposition: 'dismissed',
    action: 'none',
    remarks: '',
  });
  const [filterDisposition, setFilterDisposition] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadIncidents();
  }, []);

  const loadIncidents = async () => {
    try {
      const res = await api.get('/quiz-proctoring/incidents/all');
      setIncidents((res as any).data?.data || []);
    } catch (err) {
      console.error('Failed to load quiz proctoring incidents:', err);
      toast.error('Failed to load proctoring incidents');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionLogs = async (sessionId: string) => {
    setLogsLoading(true);
    try {
      const res = await api.get(`/quiz-proctoring/${sessionId}/log`);
      setSessionLogs((res as any).data?.data || []);
    } catch (err) {
      console.error('Failed to load session logs:', err);
      toast.error('Failed to load session logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleViewIncident = (incident: ProctoringIncident) => {
    setSelectedIncident(incident);
    loadSessionLogs(incident.sessionId);
  };

  const handleReview = (incident: ProctoringIncident) => {
    setSelectedIncident(incident);
    setReviewForm({
      disposition: 'dismissed',
      action: 'none',
      remarks: '',
    });
    setShowReviewModal(true);
  };

  const submitReview = async () => {
    if (!selectedIncident) return;
    setSubmitting(true);
    try {
      await api.patch(`/quiz-proctoring/${selectedIncident.sessionId}/incident`, reviewForm);
      toast.success('Review submitted successfully');
      setShowReviewModal(false);
      setSelectedIncident(null);
      loadIncidents();
    } catch (err) {
      console.error('Failed to submit review:', err);
      toast.error('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAllowRetake = async (incident: ProctoringIncident) => {
    if (!confirm(`Allow ${incident.learner?.firstName} ${incident.learner?.lastName} to retake this quiz? This will clear the voided session.`)) return;
    try {
      await api.post(`/quiz-proctoring/${incident.sessionId}/allow-retake`, {});
      toast.success('Retake allowed successfully');
      loadIncidents();
    } catch (err) {
      console.error('Failed to allow retake:', err);
      toast.error('Failed to allow retake');
    }
  };

  const filteredIncidents = incidents.filter((i) =>
    filterDisposition === 'all' ? true : i.disposition === filterDisposition,
  );

  const stats = {
    total: incidents.length,
    pending: incidents.filter((i) => i.disposition === 'pending').length,
    confirmed: incidents.filter((i) => i.disposition === 'confirmed_violation').length,
    dismissed: incidents.filter((i) => i.disposition === 'dismissed').length,
  };

  if (loading) {
    return (
      <DashboardScaffold title="Quiz Proctoring Review">
        <Toaster position="top-right" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold
      title="Quiz Proctoring Review"
      subtitle="Review proctoring violations detected during employee quizzes"
    >
      <Toaster position="top-right" />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-line shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Activity className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-fg">{stats.total}</p>
                <p className="text-xs text-fg-muted">Total Incidents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                <p className="text-xs text-fg-muted">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.confirmed}</p>
                <p className="text-xs text-fg-muted">Confirmed Violations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.dismissed}</p>
                <p className="text-xs text-fg-muted">Dismissed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Filter className="w-4 h-4 text-fg-subtle" />
            <span className="text-sm font-medium text-fg">Filter:</span>
            {['all', 'pending', 'dismissed', 'confirmed_violation'].map((key) => (
              <button
                key={key}
                onClick={() => setFilterDisposition(key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  filterDisposition === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-surface-muted text-fg-muted hover:bg-surface-sunken',
                )}
              >
                {key === 'all'
                  ? 'All'
                  : key === 'pending'
                    ? 'Pending'
                    : key === 'dismissed'
                      ? 'Dismissed'
                      : 'Confirmed'}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Incidents List */}
      {filteredIncidents.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 text-fg-subtle mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-fg mb-2">No Proctoring Incidents</h3>
            <p className="text-fg-muted text-sm">
              {filterDisposition === 'all'
                ? 'No quiz proctoring violations have been detected yet.'
                : `No ${filterDisposition.replace('_', ' ')} incidents found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredIncidents.map((incident) => (
            <Card
              key={incident._id}
              className="shadow-sm hover:shadow-md transition-shadow"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* User avatar */}
                    <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {incident.learner?.firstName?.[0] || '?'}
                        {incident.learner?.lastName?.[0] || ''}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-fg">
                          {incident.learner?.firstName}{' '}
                          {incident.learner?.lastName}
                        </h3>
                        {incident.learner?.employeeId && (
                          <span className="text-xs text-fg-muted bg-surface-muted px-2 py-0.5 rounded">
                            {incident.learner.employeeId}
                          </span>
                        )}
                        <span
                          className={cn(
                            'text-xs font-medium px-2 py-0.5 rounded-full',
                            dispositionLabels[incident.disposition]?.color || 'bg-surface-muted text-fg-muted',
                          )}
                        >
                          {dispositionLabels[incident.disposition]?.label || incident.disposition}
                        </span>
                      </div>

                      <p className="text-sm text-fg-muted mb-2">
                        {incident.learner?.email}
                      </p>

                      {/* Violation summary chips */}
                      <div className="flex flex-wrap gap-2">
                        {incident.proctoringFlags.tabSwitches > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                            🔄 {incident.proctoringFlags.tabSwitches} tab switches
                          </span>
                        )}
                        {incident.proctoringFlags.fullscreenExits > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded-lg border border-orange-200">
                            🖥️ {incident.proctoringFlags.fullscreenExits} fullscreen exits
                          </span>
                        )}
                        {incident.proctoringFlags.copyAttempts > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-1 rounded-lg border border-red-200">
                            📋 {incident.proctoringFlags.copyAttempts} copy attempts
                          </span>
                        )}
                        {incident.proctoringFlags.rightClicks > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                            🖱️ {incident.proctoringFlags.rightClicks} right clicks
                          </span>
                        )}
                        {incident.proctoringFlags.shortcutAttempts > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded-lg border border-orange-200">
                            ⌨️ {incident.proctoringFlags.shortcutAttempts} shortcuts
                          </span>
                        )}
                        {incident.proctoringFlags.faceNoFace > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-1 rounded-lg border border-red-200">
                            👤❌ {incident.proctoringFlags.faceNoFace} no face
                          </span>
                        )}
                        {incident.proctoringFlags.faceMultiple > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-900 px-2 py-1 rounded-lg border border-red-300">
                            👥 {incident.proctoringFlags.faceMultiple} multiple faces
                          </span>
                        )}
                        {incident.proctoringFlags.faceLookingAway > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                            👀 {incident.proctoringFlags.faceLookingAway} looking away
                          </span>
                        )}
                        {incident.proctoringFlags.faceLookingDown > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                            ⬇️ {incident.proctoringFlags.faceLookingDown} looking down
                          </span>
                        )}
                        {incident.proctoringFlags.faceEyesClosed > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded-lg border border-orange-200">
                            😴 {incident.proctoringFlags.faceEyesClosed} eyes closed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side — severity + actions */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span
                      className={cn(
                        'text-xs font-semibold px-3 py-1 rounded-full border',
                        severityColors[incident.proctoringFlags.severityLevel] || severityColors.none,
                      )}
                    >
                      {(incident.proctoringFlags.severityLevel || 'none').toUpperCase()} •{' '}
                      {incident.proctoringFlags.totalFlags} flags
                    </span>

                    {incident.startedAt && (
                      <span className="text-xs text-fg-subtle">
                        {new Date(incident.startedAt).toLocaleDateString()}{' '}
                        {new Date(incident.startedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}

                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => handleViewIncident(incident)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Log
                      </button>
                      {incident.disposition === 'pending' && (
                        <button
                          onClick={() => handleReview(incident)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" /> Review
                        </button>
                      )}
                      {incident.sessionStatus === 'voided' && (
                        <button
                          onClick={() => handleAllowRetake(incident)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Allow Retake
                        </button>
                      )}
                    </div>

                    {incident.disposition === 'confirmed_violation' &&
                      incident.action &&
                      incident.action !== 'none' && (
                        <div
                          className={cn(
                            'mt-1 text-xs font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1',
                            incident.action === 'session_voided'
                              ? 'bg-red-100 text-red-700'
                              : incident.action === 'penalty_applied'
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-amber-100 text-amber-700',
                          )}
                        >
                          {incident.action === 'session_voided'
                            ? '🚫 Quiz Voided — Score deleted, must retake'
                            : incident.action === 'penalty_applied'
                              ? '⚠️ Penalty — Score set to 0%'
                              : incident.action === 'warning'
                                ? '⚠️ Warning Issued'
                                : incident.action}
                        </div>
                      )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Session Log Detail Modal */}
      {selectedIncident && !showReviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-fg">Proctoring Event Log</h2>
                <p className="text-sm text-fg-muted">
                  {selectedIncident.learner?.firstName}{' '}
                  {selectedIncident.learner?.lastName} —{' '}
                  {selectedIncident.proctoringFlags.totalFlags} total flags
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedIncident(null);
                  setSessionLogs([]);
                }}
                className="text-fg-subtle hover:text-fg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Summary */}
              <div className="bg-surface-muted rounded-xl p-4 mb-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-fg-muted">Session Status</p>
                  <p className="font-semibold text-fg capitalize">
                    {selectedIncident.sessionStatus?.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg-muted">Severity</p>
                  <p className="font-semibold capitalize">
                    {selectedIncident.proctoringFlags.severityLevel || 'None'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg-muted">Total Flags</p>
                  <p className="font-semibold text-red-600">
                    {selectedIncident.proctoringFlags.totalFlags}
                  </p>
                </div>
              </div>

              {/* Timeline */}
              {logsLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : sessionLogs.length === 0 ? (
                <div className="text-center py-12 text-fg-muted">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-fg-subtle" />
                  <p>No detailed logs available for this session</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-fg mb-3">
                    Event Timeline ({sessionLogs.length} events)
                  </h3>
                  {sessionLogs.map((log, idx) => {
                    const evt = eventTypeLabels[log.eventType] || {
                      label: log.eventType,
                      icon: '❓',
                      color: 'text-fg-muted',
                    };
                    return (
                      <div
                        key={log._id || idx}
                        className="flex items-start gap-3 p-3 bg-surface-muted rounded-lg border border-line hover:bg-surface-sunken transition-colors"
                      >
                        <span className="text-lg flex-shrink-0">{evt.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('font-medium text-sm', evt.color)}>
                              {evt.label}
                            </span>
                            <span
                              className={cn(
                                'text-xs px-1.5 py-0.5 rounded',
                                severityColors[log.severity] || severityColors.low,
                              )}
                            >
                              {log.severity}
                            </span>
                          </div>
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <p className="text-xs text-fg-muted mt-0.5">
                              {JSON.stringify(log.metadata)}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-fg-subtle flex-shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && selectedIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-fg">Review Incident</h2>
                <p className="text-sm text-fg-muted">
                  {selectedIncident.learner?.firstName}{' '}
                  {selectedIncident.learner?.lastName} —{' '}
                  {selectedIncident.proctoringFlags.totalFlags} flags
                </p>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-fg-subtle hover:text-fg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Disposition */}
              <div>
                <label className="block text-sm font-medium text-fg mb-2">
                  Disposition
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setReviewForm((f) => ({ ...f, disposition: 'dismissed' }))}
                    className={cn(
                      'p-3 rounded-xl border-2 text-left transition-all',
                      reviewForm.disposition === 'dismissed'
                        ? 'border-green-500 bg-green-50'
                        : 'border-line hover:border-line-strong',
                    )}
                  >
                    <CheckCircle className="w-5 h-5 text-green-600 mb-1" />
                    <p className="font-medium text-sm">Dismiss</p>
                    <p className="text-xs text-fg-muted">Not a real violation</p>
                  </button>
                  <button
                    onClick={() =>
                      setReviewForm((f) => ({ ...f, disposition: 'confirmed_violation' }))
                    }
                    className={cn(
                      'p-3 rounded-xl border-2 text-left transition-all',
                      reviewForm.disposition === 'confirmed_violation'
                        ? 'border-red-500 bg-red-50'
                        : 'border-line hover:border-line-strong',
                    )}
                  >
                    <XCircle className="w-5 h-5 text-red-600 mb-1" />
                    <p className="font-medium text-sm">Confirm Violation</p>
                    <p className="text-xs text-fg-muted">Confirmed cheating</p>
                  </button>
                </div>
              </div>

              {/* Action */}
              {reviewForm.disposition === 'confirmed_violation' && (
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">
                    Action to Take
                  </label>
                  <select
                    value={reviewForm.action}
                    onChange={(e) => setReviewForm((f) => ({ ...f, action: e.target.value }))}
                    className="w-full border border-line rounded-xl px-4 py-2.5 focus:border-indigo-500 focus:outline-none bg-surface text-fg"
                  >
                    <option value="none">No Action (just flag it)</option>
                    <option value="warning">⚠️ Issue Warning (flag only, score unchanged)</option>
                    <option value="penalty_applied">🔻 Apply Penalty (set score to 0%, mark failed)</option>
                    <option value="session_voided">🚫 Void Quiz (delete score, block retake until allowed)</option>
                  </select>
                  <div className="mt-2 p-3 bg-surface-muted rounded-lg border border-line">
                    <p className="text-xs text-fg-muted">
                      {reviewForm.action === 'none' &&
                        'The violation will be recorded but no automatic action will be taken.'}
                      {reviewForm.action === 'warning' &&
                        "A warning flag will be added. The learner's score will remain unchanged."}
                      {reviewForm.action === 'penalty_applied' &&
                        "⚠️ The learner's quiz score will be set to 0% and marked as failed. They will need to retake the quiz to pass."}
                      {reviewForm.action === 'session_voided' &&
                        '🚫 The quiz attempt will be completely deleted and the learner will be blocked from retaking until you click "Allow Retake".'}
                    </p>
                  </div>
                </div>
              )}

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-fg mb-2">
                  Remarks (Optional)
                </label>
                <textarea
                  value={reviewForm.remarks}
                  onChange={(e) => setReviewForm((f) => ({ ...f, remarks: e.target.value }))}
                  rows={3}
                  className="w-full border border-line rounded-xl px-4 py-2.5 focus:border-indigo-500 focus:outline-none resize-none bg-surface text-fg"
                  placeholder="Add notes about this incident..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowReviewModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={submitReview}
                  loading={submitting}
                  className="flex-1"
                >
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardScaffold>
  );
}
