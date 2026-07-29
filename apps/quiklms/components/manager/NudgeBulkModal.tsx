'use client';

import { useState } from 'react';
import { X, Send } from 'lucide-react';
import { api } from '@/lib/api';

interface IdleLearner {
  userId: string;
  userName: string;
  email: string;
  daysSinceLastLogin: number;
}

interface Props {
  idleLearners: IdleLearner[];
  onClose: () => void;
  onSuccess: () => void;
}

const MESSAGE_TEMPLATES = [
  'Hi team, just a reminder to finish your training by Friday!',
  'Friendly reminder: Please complete your assigned courses this week.',
  "Your training deadline is approaching. Let's finish strong!",
  'Quick check-in: How are you progressing with your courses?',
];

export function NudgeBulkModal({ idleLearners, onClose, onSuccess }: Props) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(idleLearners.map((l) => l.userId));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleUser = (userId: string) =>
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );

  const toggleAll = () =>
    setSelectedUserIds((prev) => (prev.length === idleLearners.length ? [] : idleLearners.map((l) => l.userId)));

  const handleSend = async () => {
    if (selectedUserIds.length === 0) return setError('Please select at least one team member');
    setSending(true);
    setError(null);
    try {
      await api.post('/manager/nudge', {
        userIds: selectedUserIds,
        message: message.trim() || MESSAGE_TEMPLATES[0],
      });
      onSuccess();
    } catch (err) {
      setError((err as { message?: string })?.message || 'Failed to send nudge');
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
          <div>
            <h2 className="text-xl font-bold text-gray-900">Send Nudge</h2>
            <p className="text-sm text-gray-500 mt-1">Send reminders to team members</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700">Select Team Members</label>
            <button onClick={toggleAll} className="text-sm text-primary-600 hover:text-primary-700">
              {selectedUserIds.length === idleLearners.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
            {idleLearners.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">No team members to nudge.</p>
            ) : (
              idleLearners.map((l) => (
                <label key={l.userId} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(l.userId)}
                    onChange={() => toggleUser(l.userId)}
                    className="w-4 h-4 text-primary-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{l.userName}</p>
                    <p className="text-xs text-gray-500 truncate">{l.email}</p>
                  </div>
                  {l.daysSinceLastLogin > 0 && (
                    <span className="text-xs text-red-600 font-medium shrink-0">{l.daysSinceLastLogin}d idle</span>
                  )}
                </label>
              ))
            )}
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
                  message === t ? 'border-primary-600 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
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
            placeholder="Or write your own message..."
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending...' : `Send to ${selectedUserIds.length} Member(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NudgeBulkModal;
