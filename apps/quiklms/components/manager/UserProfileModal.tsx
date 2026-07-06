'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Clock, CheckCircle, AlertCircle, RotateCcw, Mail, BookOpen, FileText,
  Award, Lock, Calendar, Play, Zap, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import ReadMoreText from '@/components/ReadMoreText';

interface Course {
  courseId: string;
  courseTitle: string;
  courseDescription: string;
  completionPercentage: number;
  status: string;
  quizScore?: number | null;
  isPassed: boolean;
  dueDate?: string;
  isMandatory: boolean;
  startedAt?: string;
  completedAt?: string;
}

interface TimelineEvent {
  type: string;
  timestamp: string;
  title: string;
  description: string;
  courseTitle?: string;
  completionPercentage?: number;
}

interface ResourceBreakdown {
  courseId: string;
  courseTitle: string;
  moduleId: string;
  moduleTitle: string;
  timeSpent: number;
  videoWatchPercentage?: number | null;
  completionPercentage: number;
  status: string;
  hasAssessment: boolean;
}

interface QuizAnalytics {
  courseId: string;
  courseTitle: string;
  assessmentId: string;
  assessmentTitle: string;
  lastAttemptDate: string;
  lastScore: number;
  isPassed: boolean;
  incorrectQuestions: Array<{ questionId: string; questionText: string; userAnswer: string; correctAnswer: string }>;
}

interface UserDetails {
  userId: string;
  userName: string;
  email: string;
  lastLogin?: string;
  courses: Course[];
  timeline: TimelineEvent[];
  resourceBreakdown: ResourceBreakdown[];
  quizAnalytics: QuizAnalytics[];
}

interface Props {
  userId: string;
  onClose: () => void;
  onResetQuiz: (courseId: string) => void;
  onNudge: () => void;
  onViewResults?: (courseId: string) => void;
}

type Tab = 'timeline' | 'resources' | 'quizzes' | 'courses' | 'certificates';

function timelineIcon(type: string) {
  switch (type) {
    case 'course_assigned': return <BookOpen className="w-4 h-4 text-blue-500" />;
    case 'course_started': return <Play className="w-4 h-4 text-green-500" />;
    case 'progress_updated': return <Clock className="w-4 h-4 text-yellow-500" />;
    case 'course_completed': return <CheckCircle className="w-4 h-4 text-green-600" />;
    case 'quiz_passed': return <Award className="w-4 h-4 text-green-600" />;
    case 'quiz_failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
    default: return <Clock className="w-4 h-4 text-gray-500" />;
  }
}

export function UserProfileModal({ userId, onClose, onResetQuiz, onNudge, onViewResults }: Props) {
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [resettingQuiz, setResettingQuiz] = useState<string | null>(null);
  const [extendingDeadline, setExtendingDeadline] = useState<string | null>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [manualCompleting, setManualCompleting] = useState<string | null>(null);
  const [nudging, setNudging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailRes, basicRes] = await Promise.all([
        api.get<{ data: Partial<UserDetails> }>(`/manager/learner-detail/${userId}`),
        api.get<{ data: { userId: string; userName: string; email: string; lastLogin?: string; courses: Course[] } }>(`/manager/team/${userId}`),
      ]);
      const detail = detailRes.data || {};
      const basic = basicRes.data;
      setDetails({
        ...basic,
        timeline: detail.timeline || [],
        resourceBreakdown: detail.resourceBreakdown || [],
        quizAnalytics: detail.quizAnalytics || [],
      });
    } catch (err) {
      setError((err as { message?: string })?.message || 'Failed to load learner details.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const certificates = details?.courses.filter((c) => c.completionPercentage >= 100) || [];

  const handleNudge = async () => {
    setNudging(true);
    try {
      await api.post(`/manager/nudge/${userId}`, {});
      onNudge();
    } catch {
      setError('Failed to send nudge');
    } finally {
      setNudging(false);
    }
  };

  const handleReset = async (courseId: string, resetType: 'quiz' | 'progress') => {
    const msg = resetType === 'quiz'
      ? 'Reset quiz attempts for this course?'
      : 'Reset the entire course progress? This resets both quiz and progress.';
    if (!window.confirm(msg)) return;
    setResettingQuiz(courseId);
    try {
      await api.patch('/manager/learner-reset', { userId, courseId, resetType });
      onResetQuiz(courseId);
      await load();
    } catch {
      setError(`Failed to reset ${resetType}`);
    } finally {
      setResettingQuiz(null);
    }
  };

  const handleExtend = async (courseId: string) => {
    if (!newDueDate) return;
    setExtendingDeadline(courseId);
    try {
      await api.patch('/manager/manual-override', { userId, courseId, action: 'extend_deadline', newDueDate });
      setNewDueDate('');
      await load();
    } catch {
      setError('Failed to extend deadline');
    } finally {
      setExtendingDeadline(null);
    }
  };

  const handleManualCompletion = async (courseId: string) => {
    if (!window.confirm('Manually mark this course as complete? This is a super-override action.')) return;
    setManualCompleting(courseId);
    try {
      await api.patch('/manager/manual-override', { userId, courseId, action: 'manual_completion' });
      await load();
    } catch {
      setError('Failed to mark course as complete');
    } finally {
      setManualCompleting(null);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof Clock }[] = [
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'resources', label: 'Resource Breakdown', icon: BookOpen },
    { id: 'quizzes', label: 'Quiz Analytics', icon: FileText },
    { id: 'courses', label: `Courses (${details?.courses.length ?? 0})`, icon: BookOpen },
    { id: 'certificates', label: `Certificates (${certificates.length})`, icon: Award },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 max-w-6xl w-full shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
          </div>
        ) : !details ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">User Profile</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>
            <div className="text-center py-8">
              <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <p className="text-gray-700 font-medium mb-1">Failed to load learner details</p>
              <p className="text-sm text-gray-500 mb-4">{error || 'An unexpected error occurred.'}</p>
              <button
                onClick={() => void load()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Learner Command Center</h2>
                <p className="text-gray-500 mt-1">{details.userName} ({details.email})</p>
                <p className="text-sm text-gray-400 mt-1">
                  Last Login: {details.lastLogin ? new Date(details.lastLogin).toLocaleString() : 'Never'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleNudge}
                  disabled={nudging}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" /> {nudging ? 'Sending...' : 'Nudge'}
                </button>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <div className="border-b border-gray-200 mb-6">
              <nav className="flex space-x-6 overflow-x-auto">
                {tabs.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center gap-2 ${
                        activeTab === t.id
                          ? 'border-primary-500 text-primary-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" /> {t.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {activeTab === 'timeline' && (
              <div>
                {details.timeline.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                    <div className="space-y-6">
                      {details.timeline.map((e, i) => (
                        <div key={i} className="relative flex items-start gap-4">
                          <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-gray-200">
                            {timelineIcon(e.type)}
                          </div>
                          <div className="flex-1 bg-gray-50 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-1 gap-3">
                              <div>
                                <h4 className="font-medium text-gray-900">{e.title}</h4>
                                <p className="text-sm text-gray-600 mt-1">{e.description}</p>
                                {e.courseTitle && <p className="text-xs text-gray-500 mt-1">Course: {e.courseTitle}</p>}
                              </div>
                              <span className="text-xs text-gray-500 shrink-0">{new Date(e.timestamp).toLocaleString()}</span>
                            </div>
                            {e.completionPercentage !== undefined && (
                              <div className="mt-2">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${e.completionPercentage}%` }} />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{e.completionPercentage}% complete</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Clock className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p>No timeline events recorded</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'resources' && (
              <div>
                {details.resourceBreakdown.length > 0 ? (
                  <div className="space-y-4">
                    {details.resourceBreakdown.map((r, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3 gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-gray-900">{r.moduleTitle}</h4>
                              {r.hasAssessment && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                  <FileText className="w-3 h-3 mr-1" /> Quiz
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{r.courseTitle}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium text-gray-900">{r.timeSpent} min</p>
                            <p className="text-xs text-gray-500">Time Spent</p>
                          </div>
                        </div>
                        <div className="mb-3">
                          <p className="text-xs text-gray-500 mb-1">Completion</p>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                r.completionPercentage >= 100 ? 'bg-green-500' : r.completionPercentage >= 50 ? 'bg-blue-500' : 'bg-yellow-500'
                              }`}
                              style={{ width: `${r.completionPercentage}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{r.completionPercentage}%</p>
                        </div>
                        <div className="pt-3 border-t border-gray-200">
                          <button
                            onClick={() => handleManualCompletion(r.courseId)}
                            disabled={manualCompleting === r.courseId}
                            className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Zap className="w-4 h-4" /> {manualCompleting === r.courseId ? 'Completing...' : 'Manual Completion'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <BookOpen className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p>No resource data available</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'quizzes' && (
              <div>
                {details.quizAnalytics.length > 0 ? (
                  <div className="space-y-6">
                    {details.quizAnalytics.map((q, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-4 gap-3">
                          <div>
                            <h4 className="font-semibold text-gray-900">{q.assessmentTitle}</h4>
                            <p className="text-sm text-gray-600 mt-1">{q.courseTitle}</p>
                            <p className="text-xs text-gray-500 mt-1">Last Attempt: {new Date(q.lastAttemptDate).toLocaleString()}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${q.isPassed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {q.isPassed ? 'Passed' : 'Failed'}
                            </span>
                            <p className="text-sm font-semibold text-gray-900 mt-1">{q.lastScore}%</p>
                          </div>
                        </div>
                        {q.incorrectQuestions.length > 0 ? (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h5 className="font-medium text-gray-900 mb-3">Incorrect Questions ({q.incorrectQuestions.length})</h5>
                            <div className="space-y-4">
                              {q.incorrectQuestions.map((iq, qi) => (
                                <div key={qi} className="bg-red-50 border border-red-200 rounded-lg p-3">
                                  <p className="font-medium text-gray-900 mb-2">{iq.questionText}</p>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <p className="text-xs font-medium text-red-700 mb-1">User&apos;s Answer:</p>
                                      <p className="text-sm text-gray-700">{iq.userAnswer}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-green-700 mb-1">Correct Answer:</p>
                                      <p className="text-sm text-gray-700">{iq.correctAnswer}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <p className="text-sm text-green-600">All questions answered correctly!</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p>No quiz analytics available</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'courses' && (
              <div className="space-y-4">
                {details.courses.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <BookOpen className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p>No courses enrolled</p>
                  </div>
                ) : (
                  details.courses.map((c) => (
                    <div key={c.courseId} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3 gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-lg font-medium text-gray-900">{c.courseTitle}</h4>
                            {c.isMandatory && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Mandatory</span>
                            )}
                          </div>
                          {c.courseDescription && (
                            <ReadMoreText text={c.courseDescription} maxLines={2} className="text-sm text-gray-600 mb-2" />
                          )}
                        </div>
                        {c.status === 'Completed' ? (
                          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                        ) : c.status === 'In Progress' ? (
                          <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-gray-400 shrink-0" />
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <p className="text-xs text-gray-500">Completion</p>
                          <p className="text-sm font-medium text-gray-900">{c.completionPercentage}%</p>
                        </div>
                        {c.quizScore != null && (
                          <div>
                            <p className="text-xs text-gray-500">Quiz Score</p>
                            <p className={`text-sm font-medium ${c.isPassed ? 'text-green-600' : 'text-red-600'}`}>
                              {c.quizScore}% {c.isPassed ? '✓' : '✗'}
                            </p>
                          </div>
                        )}
                        {c.dueDate && (
                          <div>
                            <p className="text-xs text-gray-500">Due Date</p>
                            <p className={`text-sm font-medium ${new Date(c.dueDate) < new Date() && c.completionPercentage < 100 ? 'text-red-600' : 'text-gray-900'}`}>
                              {new Date(c.dueDate).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-gray-500">Status</p>
                          <p className="text-sm font-medium text-gray-900">{c.status}</p>
                        </div>
                      </div>

                      <div className="mb-3 w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${c.completionPercentage >= 100 ? 'bg-green-500' : c.completionPercentage >= 50 ? 'bg-blue-500' : 'bg-yellow-500'}`}
                          style={{ width: `${c.completionPercentage}%` }}
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-gray-200 flex-wrap">
                        {c.dueDate && (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={newDueDate}
                              onChange={(e) => setNewDueDate(e.target.value)}
                              min={new Date().toISOString().split('T')[0]}
                              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                            />
                            <button
                              onClick={() => handleExtend(c.courseId)}
                              disabled={extendingDeadline === c.courseId || !newDueDate}
                              className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                            >
                              <Calendar className="w-4 h-4" /> {extendingDeadline === c.courseId ? 'Extending...' : 'Extend Deadline'}
                            </button>
                          </div>
                        )}
                        {c.quizScore != null && !c.isPassed && (
                          <>
                            <button
                              onClick={() => handleReset(c.courseId, 'quiz')}
                              disabled={resettingQuiz === c.courseId}
                              className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                            >
                              <RotateCcw className="w-4 h-4" /> {resettingQuiz === c.courseId ? 'Resetting...' : 'Reset Quiz'}
                            </button>
                            <button
                              onClick={() => handleReset(c.courseId, 'progress')}
                              disabled={resettingQuiz === c.courseId}
                              className="inline-flex items-center gap-2 px-3 py-1.5 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
                            >
                              <Lock className="w-4 h-4" /> Reset Progress
                            </button>
                          </>
                        )}
                        {c.quizScore != null && (
                          <button
                            onClick={() => onViewResults?.(c.courseId)}
                            className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                          >
                            View Results
                          </button>
                        )}
                        <button
                          onClick={() => handleManualCompletion(c.courseId)}
                          disabled={manualCompleting === c.courseId}
                          className="inline-flex items-center gap-2 px-3 py-1.5 border border-purple-300 text-purple-700 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50"
                        >
                          <Zap className="w-4 h-4" /> {manualCompleting === c.courseId ? 'Completing...' : 'Manual Completion'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'certificates' && (
              <div>
                {certificates.length > 0 ? (
                  <div className="space-y-4">
                    {certificates.map((cert) => (
                      <div key={cert.courseId} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Award className="w-8 h-8 text-yellow-500 shrink-0" />
                            <div>
                              <h4 className="font-semibold text-gray-900">{cert.courseTitle}</h4>
                              <p className="text-sm text-gray-500 mt-1">
                                Completed: {cert.completedAt ? new Date(cert.completedAt).toLocaleDateString() : 'N/A'}
                              </p>
                              {cert.quizScore != null && (
                                <p className="text-sm text-gray-600 mt-1">Final Score: {cert.quizScore}%</p>
                              )}
                            </div>
                          </div>
                          <CheckCircle className="w-6 h-6 text-green-600 shrink-0" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Award className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p>No certificates earned yet</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default UserProfileModal;
