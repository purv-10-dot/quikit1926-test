'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle,
  Calendar,
  Users,
  Loader2,
  AlertCircle,
  Send,
  Clock,
  Edit3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClassSession {
  _id: string;
  title: string;
  batchId: string | { _id: string; name: string; students?: Student[] };
  date?: string;
  startTime: string;
  endTime: string;
  status: string;
}

interface Student {
  _id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  rollNumber?: string;
  studentId?: string;
  grade?: string;
}

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface AttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
}

interface ExistingAttendance {
  _id?: string;
  classId: string;
  records: AttendanceRecord[];
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: React.ElementType; color: string; bg: string }[] = [
  { value: 'present', label: 'Present', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700' },
  { value: 'absent', label: 'Absent', icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700' },
  { value: 'late', label: 'Late', icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700' },
  { value: 'excused', label: 'Excused', icon: ShieldCheck, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatDateISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ── Component ──────────────────────────────────────────────────────────────────

const AttendancePage = () => {
  const { branding } = useBranding();
  const [selectedDate, setSelectedDate] = useState(formatDateISO(new Date()));
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [readOnly, setReadOnly] = useState(false);
  const [existingAttendanceId, setExistingAttendanceId] = useState<string | null>(null);

  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  // ── Fetch classes for date ─────────────────────────────────────────────────

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        setLoadingClasses(true);
        setError('');
        setSelectedClassId('');
        setStudents([]);
        setAttendance({});
        setReadOnly(false);
        setExistingAttendanceId(null);
        setSuccessMsg('');

        const res = await api.get<any>('/scheduling/teacher/classes', {
          params: { startDate: selectedDate, endDate: selectedDate },
        });
        const data = Array.isArray(res) ? res : res?.classes ?? res?.data ?? [];
        setClasses(data);
      } catch (err: unknown) {
        const e = err as { message?: string };
        setError(e?.message || 'Failed to load classes');
      } finally {
        setLoadingClasses(false);
      }
    };

    fetchClasses();
  }, [selectedDate]);

  // ── When class is selected, fetch students + existing attendance ────────────

  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      setAttendance({});
      setReadOnly(false);
      setExistingAttendanceId(null);
      return;
    }

    const selectedClass = classes.find((c) => c._id === selectedClassId);
    if (!selectedClass) return;

    const batchId = selectedClass.batchId && typeof selectedClass.batchId === 'object' ? selectedClass.batchId._id : selectedClass.batchId;

    const load = async () => {
      try {
        setLoadingStudents(true);
        setError('');
        setSuccessMsg('');

        // Fetch batch details for student list
        const batchRes = await api.get<any>(`/batches/${batchId}`);
        const batchData = batchRes?.batch ?? batchRes;
        const rawStudents = batchData?.studentIds ?? batchData?.students ?? batchData?.enrolledStudents ?? [];

        // Extract student IDs (whether populated objects or plain strings)
        const studentIds: string[] = (Array.isArray(rawStudents) ? rawStudents : []).map((s: any) =>
          typeof s === 'string' ? s : s?._id,
        ).filter(Boolean);

        // Check if the first entry is a populated object with a name
        const isPopulated = rawStudents.length > 0 && typeof rawStudents[0] === 'object' && rawStudents[0]?.firstName;

        let studentList: Student[] = [];

        if (isPopulated) {
          studentList = rawStudents.map((s: any) => ({
            _id: s._id,
            firstName: s.firstName,
            lastName: s.lastName,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email || 'Student',
            email: s.email,
            rollNumber: s.rollNumber || s.studentId,
            studentId: s.studentId,
            grade: s.grade,
          }));
        } else if (studentIds.length > 0) {
          // Students not populated — fetch via POST /users/by-ids
          try {
            const usersRes = await api.post<any>('/users/by-ids', { ids: studentIds });
            const allUsers = Array.isArray(usersRes?.data) ? usersRes.data : [];
            studentList = studentIds
              .map((id: string) => {
                const u = allUsers.find((u: any) => (u._id || u.id) === id);
                return u
                  ? {
                    _id: u._id || id,
                    firstName: u.firstName,
                    lastName: u.lastName,
                    name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Student',
                    email: u.email,
                    rollNumber: u.rollNumber || u.studentId,
                    studentId: u.studentId,
                    grade: u.grade,
                  }
                  : { _id: id, name: `Student (${id.slice(-6)})` };
              })
              .filter(Boolean) as Student[];
          } catch {
            studentList = studentIds.map((id: string) => ({
              _id: id,
              name: `Student (${id.slice(-6)})`,
            })) as Student[];
          }
        }

        setStudents(studentList);

        // Initialize all as present
        const initial: Record<string, AttendanceStatus> = {};
        studentList.forEach((s) => {
          initial[s._id] = 'present';
        });

        // Check if attendance already exists
        try {
          const attRes = await api.get<any>(`/attendance/class/${selectedClassId}`);
          const attData = attRes?.attendance ?? attRes;
          const attRecords = Array.isArray(attData) ? attData : attData?.records ? attData.records : [];
          if (attRecords.length > 0) {
            setExistingAttendanceId('existing');
            attRecords.forEach((r: any) => {
              const sid = typeof r.studentId === 'object' ? r.studentId._id : r.studentId;
              if (sid && r.status) {
                initial[sid] = r.status;
              }
            });
            setReadOnly(true);
          } else {
            setReadOnly(false);
            setExistingAttendanceId(null);
          }
        } catch {
          setReadOnly(false);
          setExistingAttendanceId(null);
        }

        setAttendance(initial);
      } catch (err: unknown) {
        const e = err as { message?: string };
        setError(e?.message || 'Failed to load students');
      } finally {
        setLoadingStudents(false);
      }
    };

    load();
  }, [selectedClassId, classes]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    if (readOnly) return;
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSubmit = async () => {
    if (!selectedClassId) return;

    try {
      setSubmitting(true);
      setError('');
      setSuccessMsg('');

      if (existingAttendanceId) {
        // Edit existing attendance - need to update each record individually
        const editPromises = students.map(async (student) => {
          const studentId = student._id;
          const status = attendance[studentId] || 'present';

          try {
            const attRes = await api.get<any>(`/attendance/class/${selectedClassId}`);
            const attData = attRes?.attendance ?? attRes;
            const attRecords = Array.isArray(attData) ? attData : attData?.records ? attData.records : [];
            const existingRecord = attRecords.find((r: any) => {
              const sid = typeof r.studentId === 'object' ? r.studentId._id : r.studentId;
              return sid === studentId;
            });

            if (existingRecord && existingRecord._id) {
              await api.patch<any>(`/attendance/${existingRecord._id}`, {
                status,
                reason: 'Updated by teacher',
              });
            }
          } catch (err: unknown) {
            console.warn(`Could not update attendance for student ${studentId}:`, err);
          }
        });

        await Promise.all(editPromises);
        setSuccessMsg('Attendance updated successfully!');
      } else {
        // Mark new attendance
        const studentRecords = students.map((s) => ({
          studentId: s._id,
          status: attendance[s._id] || 'present',
        }));

        await api.post<any>('/attendance/mark', {
          scheduledClassId: selectedClassId,
          students: studentRecords,
        });
        setSuccessMsg('Attendance submitted successfully!');
      }

      setReadOnly(true);
    } catch (err: unknown) {
      const e = err as { message?: string | string[] };
      if (Array.isArray(e?.message)) {
        setError(e.message.join('\n'));
      } else {
        setError(e?.message || 'Failed to submit attendance');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const enableEdit = () => {
    setReadOnly(false);
    setSuccessMsg('');
  };

  // ── Summary ────────────────────────────────────────────────────────────────

  const summary = {
    present: Object.values(attendance).filter((s) => s === 'present').length,
    absent: Object.values(attendance).filter((s) => s === 'absent').length,
    late: Object.values(attendance).filter((s) => s === 'late').length,
    excused: Object.values(attendance).filter((s) => s === 'excused').length,
  };

  const selectedClass = classes.find((c) => c._id === selectedClassId);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
            <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Mark Attendance</h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Record student attendance for your classes</p>
          </div>
        </div>
      </div>

      {/* Selectors */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Date Picker */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* Class Selector */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Clock className="w-4 h-4 text-purple-500" />
              Class
            </label>
            {loadingClasses ? (
              <div className="flex items-center gap-2 h-[50px] text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading classes...
              </div>
            ) : classes.length === 0 ? (
              <div className="flex items-center h-[50px] text-gray-400 text-sm">
                No classes found for this date
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
              >
                <option value="">Select a class</option>
                {classes.map((c) => {
                  const batch = c.batchId && typeof c.batchId === 'object' ? c.batchId.name : '';
                  const fmtStart = new Date(c.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const fmtEnd = new Date(c.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <option key={c._id} value={c._id}>
                      {c.title} {batch ? `(${batch})` : ''} — {fmtStart}–{fmtEnd}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <p className="text-emerald-700 dark:text-emerald-400 font-medium">{successMsg}</p>
        </div>
      )}

      {/* Student Attendance Table */}
      {selectedClassId && (
        <>
          {loadingStudents ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <span className="ml-3 text-gray-500 dark:text-gray-400">Loading students...</span>
            </div>
          ) : students.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-12 text-center">
              <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Students</h3>
              <p className="text-gray-500 dark:text-gray-400">No students are enrolled in this batch yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Bar */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-500" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {students.length} Students
                    </span>
                    {selectedClass && (
                      <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                        {selectedClass.title} · {new Date(selectedClass.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{new Date(selectedClass.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-4 h-4" /> {summary.present}
                    </span>
                    <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                      <XCircle className="w-4 h-4" /> {summary.absent}
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                      <AlertTriangle className="w-4 h-4" /> {summary.late}
                    </span>
                    <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
                      <ShieldCheck className="w-4 h-4" /> {summary.excused}
                    </span>
                  </div>
                </div>
              </div>

              {/* Read-only banner */}
              {readOnly && !successMsg && (
                <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-200 dark:border-indigo-800">
                  <p className="text-indigo-700 dark:text-indigo-300 font-medium text-sm">
                    Attendance already marked
                  </p>
                  <button
                    onClick={enableEdit}
                    className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 px-4 py-2 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              )}

              {/* Attendance Table */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 w-12">#</th>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Student</th>
                        <th className="text-center px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student, idx) => {
                        const currentStatus = attendance[student._id] || 'present';
                        return (
                          <tr
                            key={student._id}
                            className={`border-b border-gray-50 dark:border-gray-700/50 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-750/50'
                              }`}
                          >
                            <td className="px-6 py-4 text-sm text-gray-400 dark:text-gray-500 font-mono">
                              {idx + 1}
                            </td>
                            <td className="px-6 py-4">
                              <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown'}
                                </p>
                                {(student.email || student.rollNumber || student.studentId || student.grade) && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {(student.rollNumber || student.studentId) && <span>ID: {student.rollNumber || student.studentId}</span>}
                                    {(student.rollNumber || student.studentId) && student.email && <span> · </span>}
                                    {student.email && <span>{student.email}</span>}
                                    {student.grade && <span> · Grade {student.grade}</span>}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-2 flex-wrap">
                                {STATUS_OPTIONS.map((opt) => {
                                  const Icon = opt.icon;
                                  const isActive = currentStatus === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      onClick={() => setStudentStatus(student._id, opt.value)}
                                      disabled={readOnly}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 ${isActive
                                          ? `${opt.bg} ${opt.color} shadow-sm`
                                          : readOnly
                                            ? 'bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-gray-600 cursor-not-allowed'
                                            : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer'
                                        }`}
                                    >
                                      <Icon className="w-3.5 h-3.5" />
                                      <span className="hidden sm:inline">{opt.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Submit */}
              {!readOnly && (
                <div className="flex justify-end">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || students.length === 0}
                    className="flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 dark:shadow-none transition-all duration-200"
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                    Submit Attendance
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AttendancePage;
