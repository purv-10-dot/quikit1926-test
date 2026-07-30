'use client';

import { useState } from 'react';
import { X, CheckCircle, Calendar } from 'lucide-react';
import { api } from '@/lib/api';

interface TeamMember {
  userId: string;
  userName: string;
  email: string;
}

interface Props {
  teamMembers: TeamMember[];
  onClose: () => void;
  onSuccess: () => void;
}

export function AttendanceModal({ teamMembers, onClose, onSuccess }: Props) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(teamMembers.map((m) => m.userId));
  const [sessionId, setSessionId] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleUser = (userId: string) =>
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );

  const toggleAll = () =>
    setSelectedUserIds((prev) => (prev.length === teamMembers.length ? [] : teamMembers.map((m) => m.userId)));

  const handleMark = async () => {
    if (selectedUserIds.length === 0) return setError('Please select at least one team member');
    if (!sessionId.trim()) return setError('Please enter a session ID or name');

    setMarking(true);
    setError(null);
    try {
      await api.post('/manager/attendance', {
        userIds: selectedUserIds,
        sessionId: sessionId.trim(),
        sessionDate,
        notes: notes.trim() || undefined,
      });
      onSuccess();
    } catch (err) {
      setError((err as { message?: string })?.message || 'Failed to mark attendance');
    } finally {
      setMarking(false);
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
            <h2 className="text-xl font-bold text-gray-900">Mark Attendance</h2>
            <p className="text-sm text-gray-500 mt-1">Record attendance for offline/virtual sessions</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Session ID / Name *</label>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              disabled={marking}
              placeholder="e.g., Security Training Session 2026"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Session Date *
            </label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              disabled={marking}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={marking}
              rows={2}
              placeholder="Additional notes about the session..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700">Select Present Team Members</label>
            <button onClick={toggleAll} disabled={marking} className="text-sm text-primary-600 hover:text-primary-700">
              {selectedUserIds.length === teamMembers.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg p-3 max-h-64 overflow-y-auto">
            {teamMembers.map((m) => (
              <label key={m.userId} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(m.userId)}
                  onChange={() => toggleUser(m.userId)}
                  disabled={marking}
                  className="w-4 h-4 text-primary-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.userName}</p>
                  <p className="text-xs text-gray-500 truncate">{m.email}</p>
                </div>
                {selectedUserIds.includes(m.userId) && <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {selectedUserIds.length} of {teamMembers.length} team members selected
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={marking}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleMark}
            disabled={marking || selectedUserIds.length === 0 || !sessionId.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            {marking ? 'Marking...' : `Mark ${selectedUserIds.length} as Present`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AttendanceModal;
