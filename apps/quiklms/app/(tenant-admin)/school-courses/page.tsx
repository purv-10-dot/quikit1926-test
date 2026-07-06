'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Users, Search, CheckCircle, AlertCircle, X, Layers, Edit, PlusCircle, FolderOpen, Library } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import toast, { Toaster } from 'react-hot-toast';

interface Course {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
  thumbnailUrlPresigned?: string;
  status?: string;
  submittedBy?: string;
  submittedByTenantId?: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  Published:              { label: 'Published',          className: 'bg-green-100 text-green-700' },
  PendingApproval:        { label: 'Pending Approval',   className: 'bg-amber-100 text-amber-700' },
  PendingTenantApproval:  { label: 'Pending Tenant',     className: 'bg-blue-100 text-blue-700' },
  Resubmitted:            { label: 'Resubmitted',        className: 'bg-purple-100 text-purple-700' },
  Rejected:               { label: 'Rejected',           className: 'bg-red-100 text-red-700' },
  RejectedByTenantAdmin:  { label: 'Rejected by Tenant', className: 'bg-red-100 text-red-700' },
  Draft:                  { label: 'Draft',              className: 'bg-gray-100 text-gray-600' },
};

interface Batch {
  _id: string;
  name: string;
  studentIds?: string[];
}

interface Learner {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

type AssignMode = 'all' | 'batch' | 'select';

type TabKey = 'all' | 'mine';

const SchoolCourseAssignmentPage = () => {
  const router = useRouter();
  const currentUser = typeof window !== 'undefined' ? JSON.parse(sessionStorage.getItem('user') || '{}') : {};
  const currentUserId = currentUser?._id || currentUser?.id;
  const currentUserTenantId = currentUser?.tenantId;
  const { branding } = useBranding();

  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [assignMode, setAssignMode] = useState<AssignMode>('all');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [learnerSearch, setLearnerSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [coursesRes, batchesRes, usersRes] = await Promise.all([
        api.get<any>('/course-assignments/courses'),
        api.get<any>('/batches'),
        api.get<any>('/users'),
      ]);
      setCourses(coursesRes.data || []);
      setBatches(batchesRes.data.data || batchesRes.data || []);
      const allUsers = usersRes.data.data || usersRes.data || [];
      setLearners(allUsers.filter((u: any) => u.role === 'LEARNER'));
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const canEdit = (course: Course) =>
    (course.submittedByTenantId != null && currentUserTenantId != null &&
      String(course.submittedByTenantId) === String(currentUserTenantId)) ||
    (course.submittedBy != null && String(course.submittedBy) === String(currentUserId));

  const myCourses = useMemo(() =>
    courses.filter(c => canEdit(c)),
    [courses, currentUserId, currentUserTenantId],
  );

  const displayCourses = activeTab === 'mine' ? myCourses : courses;

  const filteredCourses = displayCourses.filter(c =>
    c.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLearners = learners.filter(l =>
    `${l.firstName} ${l.lastName}`.toLowerCase().includes(learnerSearch.toLowerCase()) ||
    l.email.toLowerCase().includes(learnerSearch.toLowerCase())
  );

  const openAssignModal = (course: Course) => {
    setSelectedCourse(course);
    setAssignMode('all');
    setSelectedBatchIds([]);
    setSelectedLearnerIds([]);
    setDueDate('');
    setIsMandatory(true);
    setAssignError(null);
    setAssignSuccess(null);
    setAssignModalOpen(true);
  };

  const handleAssign = async () => {
    if (!selectedCourse) return;
    setAssigning(true);
    setAssignError(null);
    setAssignSuccess(null);

    try {
      let res: any;
      if (assignMode === 'all') {
        res = await api.post('/course-assignments/assign-all-learners', {
          courseId: selectedCourse._id,
          dueDate: dueDate || undefined,
          isMandatory,
        });
      } else if (assignMode === 'batch') {
        if (selectedBatchIds.length === 0) {
          setAssignError('Select at least one batch');
          setAssigning(false);
          return;
        }
        res = await api.post('/course-assignments/assign-by-batch', {
          courseId: selectedCourse._id,
          batchIds: selectedBatchIds,
          dueDate: dueDate || undefined,
          isMandatory,
        });
      } else {
        if (selectedLearnerIds.length === 0) {
          setAssignError('Select at least one learner');
          setAssigning(false);
          return;
        }
        res = await api.post('/course-assignments/assign', {
          courseId: selectedCourse._id,
          targetType: 'USER',
          targetIds: selectedLearnerIds,
          dueDate: dueDate || undefined,
          isMandatory,
          skipPrerequisiteCheck: true,
        });
      }
      setAssignSuccess(res.message || 'Course assigned successfully!');
      setTimeout(() => {
        setAssignModalOpen(false);
        loadData();
      }, 1500);
    } catch (err: any) {
      setAssignError(err?.message || 'Failed to assign course');
    } finally {
      setAssigning(false);
    }
  };

  const toggleBatch = (id: string) => {
    setSelectedBatchIds(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  };

  const toggleLearner = (id: string) => {
    setSelectedLearnerIds(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <Toaster />
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
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
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Course Assignment</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">
                {activeTab === 'mine'
                  ? 'Courses you created — you can edit these'
                  : 'Assign approved courses to learners, batches, or all students'}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/create-course')}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all duration-200 border border-white/30 text-sm sm:text-base"
          >
            <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            Create Course
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'all' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Library className="w-4 h-4" />
          All Courses ({courses.length})
        </button>
        <button
          onClick={() => setActiveTab('mine')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'mine' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          My Courses ({myCourses.length})
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search courses..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {filteredCourses.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">
            {activeTab === 'mine' ? 'No courses created by you yet' : 'No Courses Available'}
          </h3>
          <p className="text-gray-500 mt-1">
            {activeTab === 'mine'
              ? 'Courses you create will appear here. Use the Create Course button above.'
              : 'Approved courses will appear here for assignment.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {filteredCourses.map(course => {
            const editable = canEdit(course);
            return (
              <div key={course._id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                {course.thumbnailUrlPresigned ? (
                  <img src={course.thumbnailUrlPresigned} alt={course.title} className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
                    <BookOpen className="w-14 h-14 text-primary-600" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {course.category && (
                      <span className="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                        {course.category}
                      </span>
                    )}
                    {editable && course.status && STATUS_BADGE[course.status] && (
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${STATUS_BADGE[course.status].className}`}>
                        {STATUS_BADGE[course.status].label}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900 text-lg mb-1 line-clamp-2">{course.title}</h3>
                  {course.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">{course.description}</p>
                  )}
                  <div className="flex gap-2 mt-3">
                    {course.status === 'Published' && (
                      <button
                        onClick={() => openAssignModal(course)}
                        className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <Users className="w-4 h-4" />
                        Assign
                      </button>
                    )}
                    {editable && (
                      <button
                        onClick={() => router.push(`/create-course?courseId=${course._id}`)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assignment Modal */}
      {assignModalOpen && selectedCourse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Assign Course</h2>
                <p className="text-sm text-gray-600 mt-1">{selectedCourse.title}</p>
              </div>
              <button onClick={() => setAssignModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {assignError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span className="text-sm text-red-800">{assignError}</span>
                </div>
              )}
              {assignSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <span className="text-sm text-green-800">{assignSuccess}</span>
                </div>
              )}

              {/* Assignment Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assignment Method</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { key: 'all' as AssignMode, label: 'All Learners', icon: Users, desc: `${learners.length} learners` },
                    { key: 'batch' as AssignMode, label: 'By Batch', icon: Layers, desc: `${batches.length} batches` },
                    { key: 'select' as AssignMode, label: 'Select Learners', icon: CheckCircle, desc: 'Pick individual' },
                  ]).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setAssignMode(opt.key);
                        setSelectedBatchIds([]);
                        setSelectedLearnerIds([]);
                      }}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${
                        assignMode === opt.key
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <opt.icon className="w-5 h-5 mx-auto mb-1" />
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-gray-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Batch Selection */}
              {assignMode === 'batch' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Batches ({selectedBatchIds.length} selected)
                  </label>
                  <div className="border border-gray-200 rounded-lg max-h-52 overflow-y-auto divide-y">
                    {batches.length === 0 ? (
                      <p className="text-center py-6 text-gray-500 text-sm">No batches available</p>
                    ) : batches.map(batch => (
                      <button
                        key={batch._id}
                        onClick={() => toggleBatch(batch._id)}
                        className={`w-full text-left p-3 hover:bg-gray-50 flex items-center gap-3 ${
                          selectedBatchIds.includes(batch._id) ? 'bg-primary-50' : ''
                        }`}
                      >
                        {selectedBatchIds.includes(batch._id)
                          ? <CheckCircle className="w-5 h-5 text-primary-600 shrink-0" />
                          : <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{batch.name}</div>
                          <div className="text-xs text-gray-500">{batch.studentIds?.length || 0} students</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Learner Selection */}
              {assignMode === 'select' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Learners ({selectedLearnerIds.length} selected)
                  </label>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search learners..."
                      value={learnerSearch}
                      onChange={e => setLearnerSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="border border-gray-200 rounded-lg max-h-52 overflow-y-auto divide-y">
                    {filteredLearners.length === 0 ? (
                      <p className="text-center py-6 text-gray-500 text-sm">No learners found</p>
                    ) : filteredLearners.map(l => (
                      <button
                        key={l._id}
                        onClick={() => toggleLearner(l._id)}
                        className={`w-full text-left p-3 hover:bg-gray-50 flex items-center gap-3 ${
                          selectedLearnerIds.includes(l._id) ? 'bg-primary-50' : ''
                        }`}
                      >
                        {selectedLearnerIds.includes(l._id)
                          ? <CheckCircle className="w-5 h-5 text-primary-600 shrink-0" />
                          : <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{l.firstName} {l.lastName}</div>
                          <div className="text-xs text-gray-500">{l.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Mandatory */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isMandatory}
                  onChange={e => setIsMandatory(e.target.checked)}
                  className="w-5 h-5 text-primary-600 rounded"
                />
                <div>
                  <div className="text-sm font-medium text-gray-700">Mark as Mandatory</div>
                  <div className="text-xs text-gray-500">Course will appear in learner's required section</div>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t">
              <button
                onClick={() => setAssignModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || !!assignSuccess}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                {assigning ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Assigning...
                  </>
                ) : (
                  'Assign Course'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolCourseAssignmentPage;
