'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Video, Users, Clock, ExternalLink, RefreshCw } from 'lucide-react';

interface LiveClass {
  classId: string;
  batch: { name: string; subject: string; grade: string };
  teacher: { firstName: string; lastName: string };
  startTime: string;
  endTime: string;
  classStatus: string;
  meetingStatus: string;
  isLive: boolean;
  joinUrl: string | null;
  participantCount: number;
  actualStartTime: string | null;
}

const LiveClassStatusPage = () => {
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinLoading, setJoinLoading] = useState<string | null>(null);

  useEffect(() => {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.childIds && user.childIds.length > 0) {
      fetchChildren(user.childIds);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChild) fetchLiveStatus();
    const interval = setInterval(() => {
      if (selectedChild) fetchLiveStatus();
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedChild]);

  const fetchChildren = async (ids: string[]) => {
    try {
      const res = await api.get<any>('/users/batch-users', { params: { ids: ids.join(',') } });
      const childList = (res.data || []).map((u: any) => ({ ...u, _id: u._id ?? u.id }));
      setChildren(childList);
      if (childList.length > 0) setSelectedChild(childList[0]._id);
      else setLoading(false);
    } catch {
      setChildren(ids.map((id) => ({ _id: id, firstName: `Student`, lastName: `(${id.slice(-4)})` })));
      if (ids.length > 0) setSelectedChild(ids[0]);
      else setLoading(false);
    }
  };

  const fetchLiveStatus = async () => {
    if (!selectedChild) return;
    try {
      setLoading(true);
      const res = await api.get<any>(`/meetings/live-status/${selectedChild}`);
      setLiveClasses(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load live class status');
    } finally {
      setLoading(false);
    }
  };

  const joinAndOpen = async (meetingId: string, joinUrl: string) => {
    try {
      setJoinLoading(meetingId);
      await api.post<any>(`/meetings/${meetingId}/join`, {});
    } catch {
      // still open link even if tracking fails
    } finally {
      setJoinLoading(null);
    }
    window.open(joinUrl, '_blank', 'noopener,noreferrer');
  };

  const liveNow = liveClasses.filter((c) => c.isLive);
  const upcoming = liveClasses.filter((c) => !c.isLive && c.classStatus !== 'completed');
  const ended = liveClasses.filter((c) => c.classStatus === 'completed');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Video className="w-6 h-6 text-indigo-600" />
            Live Class Status
          </h1>
          <p className="text-gray-500 mt-1">Monitor your child's live classes in real-time</p>
        </div>
        <button
          onClick={fetchLiveStatus}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {children.length > 1 && (
        <div className="mb-4">
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            {children.map((child) => (
              <option key={child._id} value={child._id}>
                {child.firstName} {child.lastName}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg">{error}</div>}

      {loading && liveClasses.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : liveClasses.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Video className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>No classes scheduled for today</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* LIVE NOW */}
          {liveNow.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-red-600 mb-3 flex items-center gap-2">
                <span className="inline-block w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                LIVE NOW
              </h2>
              <div className="space-y-3">
                {liveNow.map((cls) => (
                  <div key={cls.classId} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                          {cls.batch?.name} - {cls.batch?.subject}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Teacher: {cls.teacher?.firstName} {cls.teacher?.lastName}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Started: {cls.actualStartTime ? new Date(cls.actualStartTime).toLocaleTimeString() : '-'}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                          <Users className="w-4 h-4" />
                          <span>{cls.participantCount} participants in class</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-xs text-red-600 font-medium">IN PROGRESS</span>
                        {cls.joinUrl && (
                          <button
                            onClick={() => joinAndOpen(cls.classId, cls.joinUrl!)}
                            disabled={joinLoading === cls.classId}
                            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Join Now
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UPCOMING */}
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Upcoming Today</h2>
              <div className="space-y-3">
                {upcoming.map((cls) => (
                  <div key={cls.classId} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {cls.batch?.name} - {cls.batch?.subject}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Teacher: {cls.teacher?.firstName} {cls.teacher?.lastName}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                          <Clock className="w-4 h-4" />
                          <span>
                            {new Date(cls.startTime).toLocaleTimeString()} - {new Date(cls.endTime).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                          {cls.meetingStatus === 'no_meeting' ? 'Waiting for Teacher' : 'Scheduled'}
                        </span>
                        {cls.joinUrl && (
                          <button
                            onClick={() => joinAndOpen(cls.classId, cls.joinUrl!)}
                            disabled={joinLoading === cls.classId}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Join Class
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ENDED */}
          {ended.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-400 mb-3">Completed</h2>
              <div className="space-y-3">
                {ended.map((cls) => (
                  <div key={cls.classId} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 opacity-75">
                    <h3 className="font-semibold text-gray-700 dark:text-gray-400">
                      {cls.batch?.name} - {cls.batch?.subject}
                    </h3>
                    <p className="text-sm text-gray-500">Completed</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6 text-center">Auto-refreshes every 15 seconds</p>
    </div>
  );
};

export default LiveClassStatusPage;
