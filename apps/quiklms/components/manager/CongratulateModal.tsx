'use client';

import { useState } from 'react';
import { X, Award, Send } from 'lucide-react';
import { api } from '@/lib/api';

interface TeamMember {
  userId: string;
  userName: string;
  email: string;
  completionPercentage: number;
  coursesCompleted: number;
}

interface Props {
  teamMembers: TeamMember[];
  onClose: () => void;
  onSuccess: () => void;
}

const MESSAGE_TEMPLATES = [
  'Congratulations on completing your courses! Your dedication to learning is inspiring.',
  'Well done! Your commitment to professional development is truly commendable.',
  'Fantastic work! Your course completion shows great initiative and dedication.',
  'Congratulations! Your learning achievements are impressive. Keep up the excellent work!',
];

export function CongratulateModal({ teamMembers, onClose, onSuccess }: Props) {
  const eligibleMembers = teamMembers.filter((m) => m.coursesCompleted > 0);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleUser = (userId: string) =>
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );

  const toggleAll = () =>
    setSelectedUserIds((prev) => (prev.length === eligibleMembers.length ? [] : eligibleMembers.map((m) => m.userId)));

  const handleSend = async () => {
    if (selectedUserIds.length === 0) return setError('Please select at least one team member to congratulate');
    setSending(true);
    setError(null);
    try {
      // Delivered as a real in-app message via the bulk nudge channel.
      await api.post('/manager/nudge', {
        userIds: selectedUserIds,
        message: message.trim() || MESSAGE_TEMPLATES[0],
      });
      onSuccess();
    } catch (err) {
      setError((err as { message?: string })?.message || 'Failed to send congratulations');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Award className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Congratulate Team Members</h2>
              <p className="text-sm text-gray-500 mt-1">Recognize members who completed courses</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {eligibleMembers.length === 0 ? (
          <div className="text-center py-8">
            <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">No team members have completed courses yet.</p>
            <p className="text-sm text-gray-500">Congratulate members once they complete their courses.</p>
            <button
              onClick={onClose}
              className="mt-6 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">Select Team Members</label>
                <button onClick={toggleAll} className="text-sm text-primary-600 hover:text-primary-700">
                  {selectedUserIds.length === eligibleMembers.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                {eligibleMembers.map((m) => (
                  <label key={m.userId} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(m.userId)}
                      onChange={() => toggleUser(m.userId)}
                      className="w-4 h-4 text-primary-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.userName}</p>
                      <p className="text-xs text-gray-500 truncate">{m.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-medium text-green-600">
                        {m.coursesCompleted} course{m.coursesCompleted !== 1 ? 's' : ''} completed
                      </span>
                      <p className="text-xs text-gray-500">{m.completionPercentage}% overall</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Message Template</label>
              <div className="space-y-2">
                {MESSAGE_TEMPLATES.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setMessage(t)}
                    className={`w-full text-left p-3 border-2 rounded-lg transition-all ${
                      message === t ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm text-gray-700">{t}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Custom Message (Optional)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Or write your own congratulation message..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                disabled={sending}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || selectedUserIds.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Sending...' : `Send to ${selectedUserIds.length} Member(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default CongratulateModal;
