'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, CheckCircle, BookOpen, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Course {
  _id: string;
  title: string;
  description?: string;
}

interface TeamMember {
  userId: string;
  userName: string;
  email: string;
  activeCoursesCount?: number;
}

interface Props {
  onClose: () => void;
  onEnrollSuccess: () => void;
}

export function TeamEnrollmentModal({ onClose, onEnrollSuccess }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [coursesRes, teamRes] = await Promise.all([
          api.get<{ data: Course[] }>('/manager/available-courses'),
          api.get<{ data: TeamMember[] }>('/manager/team-list'),
        ]);
        setCourses(coursesRes.data || []);
        const members = teamRes.data || [];
        setTeamMembers(members);
        setSelectedUserIds(members.map((m) => m.userId));
      } catch {
        setError('Failed to load available courses');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleUser = (userId: string) =>
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );

  const toggleAll = () =>
    setSelectedUserIds((prev) => (prev.length === teamMembers.length ? [] : teamMembers.map((m) => m.userId)));

  const handleEnroll = async () => {
    if (!selectedCourse) return setError('Please select a course');
    if (selectedUserIds.length === 0) return setError('Please select at least one team member');

    setEnrolling(true);
    setError(null);
    try {
      await api.post('/manager/bulk-assign', {
        courseId: selectedCourse,
        userIds: selectedUserIds,
        dueDate: dueDate || undefined,
        isMandatory,
      });
      onEnrollSuccess();
      onClose();
    } catch (err) {
      setError((err as { message?: string })?.message || 'Failed to assign course to team');
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Assign Team to Course</h2>
            <p className="text-sm text-gray-500 mt-1">Select a course and assign it to your team members</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" /> Select Course *
                  </label>
                  <select
                    value={selectedCourse}
                    onChange={(e) => setSelectedCourse(e.target.value)}
                    disabled={enrolling}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Choose a course...</option>
                    {courses.map((c) => (
                      <option key={c._id} value={c._id}>{c.title}</option>
                    ))}
                  </select>
                  {courses.length === 0 && (
                    <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                      <p className="text-sm text-yellow-800">No courses available. Contact your Tenant Admin.</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Target Completion Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={enrolling}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Course Type</label>
                  <label className="inline-flex items-center cursor-pointer gap-3">
                    <input
                      type="checkbox"
                      checked={isMandatory}
                      onChange={(e) => setIsMandatory(e.target.checked)}
                      disabled={enrolling}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {isMandatory ? 'Mandatory Course' : 'Optional Course'}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Team Members</label>
                  <button onClick={toggleAll} disabled={enrolling} className="text-sm text-primary-600 hover:text-primary-700">
                    {selectedUserIds.length === teamMembers.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="border border-gray-200 rounded-lg p-3 max-h-80 overflow-y-auto">
                  {teamMembers.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">No team members found.</p>
                  ) : (
                    teamMembers.map((m) => (
                      <label key={m.userId} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(m.userId)}
                          onChange={() => toggleUser(m.userId)}
                          disabled={enrolling}
                          className="w-4 h-4 text-primary-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{m.userName}</p>
                          <p className="text-xs text-gray-500 truncate">{m.email}</p>
                        </div>
                        {!!m.activeCoursesCount && (
                          <span className="text-xs text-gray-500">{m.activeCoursesCount} active</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {selectedUserIds.length} of {teamMembers.length} team members selected
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-6">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
              <button
                onClick={onClose}
                disabled={enrolling}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEnroll}
                disabled={enrolling || !selectedCourse || selectedUserIds.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {enrolling ? 'Assigning...' : `Assign to ${selectedUserIds.length} Member(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TeamEnrollmentModal;
