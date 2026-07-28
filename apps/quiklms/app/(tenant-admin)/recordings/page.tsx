'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { Video, Play, Calendar, User, Clock, ExternalLink, Search } from 'lucide-react';

interface Recording {
  _id: string;
  title?: string;
  scheduledStartTime: string;
  actualStartTime?: string;
  actualEndTime?: string;
  recordingUrls: string[];
  recordingStatus: string;
  hostId?: { firstName: string; lastName: string };
  scheduledClassId?: { title: string; startTime: string; batchId?: unknown };
  provider: string;
}

const RecordingsPage = () => {
  const { branding } = useBranding();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);

  useEffect(() => {
    fetchRecordings();
  }, [statusFilter]);

  const fetchRecordings = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      const res = await api.get<any>(`/meetings/recordings?${params.toString()}`);
      const data = Array.isArray(res) ? res : res?.data || [];
      setRecordings(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  };

  const filteredRecordings = recordings.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.title || '').toLowerCase().includes(q) ||
      (r.hostId?.firstName || '').toLowerCase().includes(q) ||
      (r.hostId?.lastName || '').toLowerCase().includes(q)
    );
  });

  const formatDuration = (start?: string, end?: string) => {
    if (!start || !end) return '-';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.round(ms / 60000);
    return `${mins} min`;
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mb-6 mt-4 sm:mt-6 lg:mt-8"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Video className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">{'Class Recordings'}</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">{'View and manage recorded classes'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={'Search recordings...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        >
          <option value="">{'All Status'}</option>
          <option value="available">{'Available'}</option>
          <option value="processing">{'Processing'}</option>
          <option value="pending">{'Pending'}</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : filteredRecordings.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Video className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg">{'No recordings found'}</p>
          <p className="text-sm mt-1">{'Recordings will appear here after classes with recording enabled are completed.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredRecordings.map((rec) => (
            <div
              key={rec._id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedRecording(rec)}
            >
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 text-white">
                <div className="flex items-center justify-between">
                  <Play className="w-8 h-8" />
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    rec.recordingStatus === 'available' ? 'bg-green-400/20 text-green-100' :
                    rec.recordingStatus === 'processing' ? 'bg-yellow-400/20 text-yellow-100' :
                    'bg-gray-400/20 text-gray-100'
                  }`}>
                    {rec.recordingStatus || 'pending'}
                  </span>
                </div>
                <h3 className="font-semibold mt-2 truncate">{rec.title || rec.scheduledClassId?.title || 'Untitled Recording'}</h3>
              </div>
              <div className="p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(rec.scheduledStartTime).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <User className="w-4 h-4" />
                  <span>{rec.hostId ? `${rec.hostId.firstName} ${rec.hostId.lastName}` : 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>{'Duration'}: {formatDuration(rec.actualStartTime, rec.actualEndTime)}</span>
                </div>
                <div className="text-xs text-gray-400 capitalize">{rec.provider} | {rec.recordingUrls.length} file(s)</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recording Viewer Modal */}
      {selectedRecording && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="p-4 sm:p-6 border-b dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedRecording.title || selectedRecording.scheduledClassId?.title || 'Recording'}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedRecording.hostId ? `Teacher: ${selectedRecording.hostId.firstName} ${selectedRecording.hostId.lastName}` : ''} |
                    Duration: {formatDuration(selectedRecording.actualStartTime, selectedRecording.actualEndTime)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedRecording(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {selectedRecording.recordingStatus === 'available' && selectedRecording.recordingUrls.length > 0 ? (
                <div className="space-y-4">
                  {selectedRecording.recordingUrls.map((url, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Recording {selectedRecording.recordingUrls.length > 1 ? `Part ${i + 1}` : ''}
                        </span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                        >
                          <ExternalLink className="w-4 h-4" />
                          {'Open in new tab'}
                        </a>
                      </div>
                      <video
                        controls
                        className="w-full rounded-lg bg-black"
                        style={{ maxHeight: '500px' }}
                      >
                        <source src={url} />
                        Your browser does not support video playback.
                      </video>
                    </div>
                  ))}

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-sm text-gray-500">
                    <div className="flex items-center gap-4">
                      <span>{'Playback Speed'}:</span>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                        <button
                          key={speed}
                          onClick={() => {
                            const videos = document.querySelectorAll('video');
                            videos.forEach((v) => { v.playbackRate = speed; });
                          }}
                          className="px-2 py-1 rounded bg-white dark:bg-gray-600 border text-xs hover:bg-indigo-50 dark:hover:bg-gray-500"
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : selectedRecording.recordingStatus === 'processing' ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">Recording is being processed. It will be available soon.</p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Video className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">{'Recording not yet available'}</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {selectedRecording.recordingStatus === 'expired'
                      ? 'This recording has expired based on retention policy.'
                      : 'Recording will be available after the class ends with recording enabled.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordingsPage;
