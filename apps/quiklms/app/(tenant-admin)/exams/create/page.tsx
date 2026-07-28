'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Shuffle, BookOpen, X, Pencil, Check } from 'lucide-react';

interface BatchOption { _id: string; name: string; grade?: string; subject?: string; }
interface QOption { text: string; isCorrect: boolean; }
interface QuestionOption { _id: string; text: string; subject: string; difficulty: string; type: string; points: number; options?: QOption[]; correctAnswer?: any; }

interface EditQuestionState {
  _id: string;
  text: string;
  type: string;
  options: QOption[];
  correctAnswer: any;
  points: number;
  subject: string;
  difficulty: string;
}

function ExamCreationPageInner() {
  const router = useRouter();
  const { branding } = useBranding();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [questionPool, setQuestionPool] = useState<QuestionOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [subjectFilterActive, setSubjectFilterActive] = useState(true);
  const [academicSubjects, setAcademicSubjects] = useState<string[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<EditQuestionState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);

  const [form, setForm] = useState({
    title: '', description: '', instructions: '', subject: '',
    batchId: '', duration: 60, totalMarks: 0,
    questionSelectionMode: 'manual' as 'manual' | 'auto_random',
    autoSelectRules: { count: 10, difficulty: '', subject: '', tags: [] as string[] },
    questions: [] as { questionId: string; points: number; order: number; _question?: QuestionOption }[],
    settings: {
      randomizeQuestions: true, randomizeOptions: true, showCorrectAnswersAfter: false,
      negativeMarkingEnabled: false, passingScore: 40, allowLateSubmission: false,
      graceWindowMinutes: 5, maxAttempts: 1,
    },
    proctoringLevel: 'soft' as 'none' | 'soft',
    scheduledStartTime: '', scheduledEndTime: '',
  });

  useEffect(() => {
    api.get<any>('/batches').then((r: any) => {
      const data = r.data;
      setBatches(Array.isArray(data) ? data : data?.data || []);
    }).catch(() => {});
    api.get<any>('/academic-config/subjects').then((r: any) => {
      const data = r.data;
      setAcademicSubjects(Array.isArray(data) ? data : data?.data || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (editId) {
      api.get<any>(`/exams/${editId}`).then((r: any) => {
        const exam = r.data;
        setForm(prev => ({
          title: exam.title || '',
          description: exam.description || '',
          instructions: exam.instructions || '',
          subject: exam.subject || '',
          batchId: exam.batchId?._id || '',
          duration: exam.duration || 60,
          totalMarks: exam.totalMarks || 0,
          questionSelectionMode: exam.questionSelectionMode || 'manual',
          autoSelectRules: exam.autoSelectRules || { count: 10, difficulty: '', subject: '', tags: [] },
          questions: (exam.questions || []).map((q: any) => ({
            questionId: q.questionId?._id || q.questionId,
            points: q.points,
            order: q.order,
            _question: q.questionId,
          })),
          settings: { ...prev.settings, ...exam.settings },
          proctoringLevel: exam.proctoringLevel || 'soft',
          scheduledStartTime: exam.scheduledStartTime ? new Date(exam.scheduledStartTime).toISOString().slice(0, 16) : '',
          scheduledEndTime: exam.scheduledEndTime ? new Date(exam.scheduledEndTime).toISOString().slice(0, 16) : '',
        }));
      });
    }
  }, [editId]);

  const fetchQuestions = async (filterBySubject = subjectFilterActive) => {
    try {
      const params: any = { limit: 200 };
      if (filterBySubject && form.subject.trim()) {
        params.subject = form.subject.trim();
      }
      const res = await api.get<any>('/question-bank', { params });
      const payload = res;
      const list =
        payload?.questions ??
        payload?.data?.questions ??
        payload?.data?.items ??
        payload?.data ??
        [];
      setQuestionPool(Array.isArray(list) ? list : []);
    } catch {
      setQuestionPool([]);
    }
  };

  useEffect(() => {
    setSubjectFilterActive(true);
    fetchQuestions(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.subject]);

  const addQuestion = (q: QuestionOption) => {
    if (form.questions.some(fq => fq.questionId === q._id)) return;
    const updated = [...form.questions, { questionId: q._id, points: q.points, order: form.questions.length + 1, _question: q }];
    setForm({ ...form, questions: updated, totalMarks: updated.reduce((s, x) => s + x.points, 0) });
  };

  const removeQuestion = (idx: number) => {
    const updated = form.questions.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order: i + 1 }));
    setForm({ ...form, questions: updated, totalMarks: updated.reduce((s, x) => s + x.points, 0) });
  };

  const handleDragStart = (idx: number) => { dragIndexRef.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverIndexRef.current = idx;
  };
  const handleDrop = () => {
    const from = dragIndexRef.current;
    const to = dragOverIndexRef.current;
    if (from === null || to === null || from === to) return;
    const reordered = [...form.questions];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((q, i) => ({ ...q, order: i + 1 }));
    setForm({ ...form, questions: updated, totalMarks: updated.reduce((s, x) => s + x.points, 0) });
    dragIndexRef.current = null;
    dragOverIndexRef.current = null;
  };

  const openEditQuestion = async (q: { questionId: string; points: number; _question?: QuestionOption }) => {
    try {
      const res = await api.get<any>(`/question-bank/${q.questionId}`);
      const full = (res.data as any)?.data || res.data;
      setEditingQuestion({
        _id: full._id,
        text: full.text || '',
        type: full.type || 'mcq',
        options: full.options?.length ? full.options : [
          { text: '', isCorrect: false }, { text: '', isCorrect: false },
          { text: '', isCorrect: false }, { text: '', isCorrect: false },
        ],
        correctAnswer: full.correctAnswer,
        points: full.points || 1,
        subject: full.subject || '',
        difficulty: full.difficulty || 'medium',
      });
    } catch {
      alert('Failed to load question details.');
    }
  };

  const handleEditSave = async () => {
    if (!editingQuestion) return;
    setEditSaving(true);
    try {
      const res = await api.put<any>(`/question-bank/${editingQuestion._id}`, {
        text: editingQuestion.text,
        type: editingQuestion.type,
        options: editingQuestion.options,
        correctAnswer: editingQuestion.correctAnswer,
        points: editingQuestion.points,
        subject: editingQuestion.subject,
        difficulty: editingQuestion.difficulty,
      });
      const updated = (res.data as any)?.data || res.data;
      setQuestionPool(prev => prev.map(q => q._id === editingQuestion._id ? { ...q, ...updated } : q));
      setForm(prev => ({
        ...prev,
        questions: prev.questions.map(q =>
          q.questionId === editingQuestion._id
            ? { ...q, points: updated.points || editingQuestion.points, _question: { ...q._question!, ...updated } }
            : q
        ),
        totalMarks: prev.questions.reduce((s, q) =>
          s + (q.questionId === editingQuestion._id ? (updated.points || editingQuestion.points) : q.points), 0
        ),
      }));
      setEditingQuestion(null);
    } catch (e: any) {
      alert(e?.message || 'Failed to save question.');
    } finally {
      setEditSaving(false);
    }
  };

  const setCorrectOption = (idx: number) => {
    if (!editingQuestion) return;
    const options = editingQuestion.options.map((o, i) => ({ ...o, isCorrect: i === idx }));
    setEditingQuestion({ ...editingQuestion, options });
  };

  const handleSave = async () => {
    if (!form.title.trim()) { alert('Exam title is required'); return; }
    if (form.questionSelectionMode === 'manual' && form.questions.length === 0) {
      alert('Please add at least one question'); return;
    }
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        questions: form.questions.map(({ _question, ...rest }) => rest),
        scheduledStartTime: form.scheduledStartTime ? new Date(form.scheduledStartTime) : undefined,
        scheduledEndTime: form.scheduledEndTime ? new Date(form.scheduledEndTime) : undefined,
      };
      if (!payload.batchId) delete payload.batchId;
      if (!payload.subject) payload.subject = form.title;

      if (editId) {
        await api.put<any>(`/exams/${editId}`, payload);
      } else {
        await api.post<any>('/exams', payload);
      }
      router.push('/exams');
    } catch (e: any) {
      alert(e?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const availableQuestions = questionPool.filter(q => !form.questions.some(fq => fq.questionId === q._id));

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 p-6">
      <button onClick={() => router.push('/exams')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 px-4 sm:px-6 lg:px-8">
        <ArrowLeft className="w-4 h-4" /> Back to Exams
      </button>

      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mb-6 mx-4 sm:mx-6 lg:mx-8"
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
              <Pencil className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">{editId ? 'Edit Exam' : 'Create New Exam'}</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Design and configure exams for your students</p>
            </div>
          </div>
        </div>
      </div>

      {/* Step Indicators */}
      <div className="flex items-center flex-wrap gap-2 mb-4 sm:mb-8">
        {['Basic Info', 'Questions', 'Settings & Schedule'].map((label, i) => (
          <button key={i} onClick={() => setStep(i + 1)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${step === i + 1 ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">{i + 1}</span> {label}
          </button>
        ))}
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="bg-white border rounded-xl p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Exam Title *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="Mid-Term Mathematics Exam" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Subject</label>
              <input
                list="exam-subject-list"
                value={form.subject}
                onChange={e => setForm({ ...form, subject: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Select or type a subject..."
              />
              <datalist id="exam-subject-list">
                {academicSubjects.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Batch</label>
              <select value={form.batchId} onChange={e => setForm({ ...form, batchId: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                <option value="">Select Batch</option>
                {batches.map(b => <option key={b._id} value={b._id}>{b.name} {b.grade ? `(${b.grade})` : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Duration (minutes) *</label>
              <input type="number" min={5} value={form.duration} onChange={e => setForm({ ...form, duration: parseInt(e.target.value) || 60 })} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Proctoring</label>
              <select value={form.proctoringLevel} onChange={e => setForm({ ...form, proctoringLevel: e.target.value as 'none' | 'soft' })} className="w-full border rounded-lg px-3 py-2">
                <option value="soft">Soft Proctoring (Recommended)</option>
                <option value="none">No Proctoring</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Instructions</label>
            <textarea value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} rows={4} className="w-full border rounded-lg px-3 py-2" placeholder="Instructions for students..." />
          </div>
          <div className="flex justify-end">
            <button onClick={() => setStep(2)} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Next: Questions</button>
          </div>
        </div>
      )}

      {/* Step 2: Questions */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Question Selection</h3>
                <p className="text-sm text-gray-500">Selected: {form.questions.length} questions | Total marks: {form.totalMarks}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setForm({ ...form, questionSelectionMode: 'manual' })} className={`px-3 py-1.5 rounded-lg text-sm ${form.questionSelectionMode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>Manual</button>
                <button onClick={() => setForm({ ...form, questionSelectionMode: 'auto_random' })} className={`px-3 py-1.5 rounded-lg text-sm ${form.questionSelectionMode === 'auto_random' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>
                  <Shuffle className="w-3.5 h-3.5 inline mr-1" />Auto Random
                </button>
              </div>
            </div>

            {form.questionSelectionMode === 'auto_random' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-amber-700 mb-2">Questions will be randomly selected from the pool when the exam is published.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Count</label>
                    <input type="number" min={1} value={form.autoSelectRules.count} onChange={e => setForm({ ...form, autoSelectRules: { ...form.autoSelectRules, count: parseInt(e.target.value) || 10 } })} className="w-full border rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Difficulty</label>
                    <select value={form.autoSelectRules.difficulty} onChange={e => setForm({ ...form, autoSelectRules: { ...form.autoSelectRules, difficulty: e.target.value } })} className="w-full border rounded px-2 py-1 text-sm">
                      <option value="">Any</option>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Subject</label>
                    <input value={form.autoSelectRules.subject} onChange={e => setForm({ ...form, autoSelectRules: { ...form.autoSelectRules, subject: e.target.value } })} className="w-full border rounded px-2 py-1 text-sm" />
                  </div>
                </div>
              </div>
            )}

            {form.questionSelectionMode === 'manual' && (
              <>
                {/* Subject filter banner */}
                {form.subject.trim() && (
                  <div className={`flex items-center gap-3 rounded-lg px-4 py-2.5 mb-4 text-sm ${subjectFilterActive ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-gray-200'}`}>
                    <BookOpen className={`w-4 h-4 flex-shrink-0 ${subjectFilterActive ? 'text-indigo-500' : 'text-gray-400'}`} />
                    {subjectFilterActive ? (
                      <>
                        <span className="text-indigo-700 font-medium">Showing questions for: <span className="font-semibold">{form.subject}</span></span>
                        <button
                          onClick={() => { setSubjectFilterActive(false); fetchQuestions(false); }}
                          className="ml-auto text-indigo-500 hover:text-indigo-700 underline text-xs"
                        >Show all subjects</button>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-500">Showing all subjects</span>
                        <button
                          onClick={() => { setSubjectFilterActive(true); fetchQuestions(true); }}
                          className="ml-auto text-indigo-500 hover:text-indigo-700 underline text-xs flex items-center gap-1"
                        ><X className="w-3 h-3" />Filter by: {form.subject}</button>
                      </>
                    )}
                  </div>
                )}

                {/* Selected questions */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Questions <span className="text-xs text-gray-400 font-normal ml-1">(drag to reorder)</span></h4>
                  {form.questions.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center bg-gray-50 rounded-lg">No questions selected yet</p>
                  ) : (
                    <div className="space-y-2">
                      {form.questions.map((q, i) => (
                        <div
                          key={q.questionId}
                          draggable
                          onDragStart={() => handleDragStart(i)}
                          onDragOver={(e) => handleDragOver(e, i)}
                          onDrop={handleDrop}
                          className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:bg-indigo-50 transition-colors"
                        >
                          <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-xs text-gray-400 w-6 flex-shrink-0">{i + 1}.</span>
                          <span className="flex-1 text-sm text-gray-700 truncate">{q._question?.text || q.questionId}</span>
                          <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded flex-shrink-0">{(q._question as any)?.subject || ''}</span>
                          <span className="text-xs text-gray-500 flex-shrink-0">{q.points} pts</span>
                          <button onClick={() => openEditQuestion(q)} title="Edit question" className="text-indigo-400 hover:text-indigo-600 flex-shrink-0"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => removeQuestion(i)} title="Remove question" className="text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Available questions */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Available Questions ({availableQuestions.length})</h4>
                  <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2">
                    {availableQuestions.length === 0 ? (
                      subjectFilterActive && form.subject.trim() ? (
                        <div className="py-6 text-center space-y-1">
                          <p className="text-sm text-amber-700 font-medium">No questions found for subject: <span className="font-semibold">{form.subject}</span></p>
                          <p className="text-xs text-gray-400">Add questions to the Question Bank under this subject first, or</p>
                          <button onClick={() => { setSubjectFilterActive(false); fetchQuestions(false); }} className="text-xs text-indigo-500 underline">show all subjects</button>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 py-4 text-center">No questions available. Create some in the Question Bank first.</p>
                      )
                    ) : availableQuestions.map(q => (
                      <div key={q._id} className="flex items-center gap-3 hover:bg-indigo-50 rounded p-2 cursor-pointer" onClick={() => addQuestion(q)}>
                        <Plus className="w-4 h-4 text-indigo-500" />
                        <span className="flex-1 text-sm truncate">{q.text}</span>
                        <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded border border-indigo-100">{q.subject}</span>
                        <span className="text-xs text-gray-400">{q.difficulty}</span>
                        <span className="text-xs text-gray-400">{q.type}</span>
                        <span className="text-xs font-medium">{q.points} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-6 py-2 border rounded-lg">Back</button>
            <button onClick={() => setStep(3)} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Next: Settings</button>
          </div>
        </div>
      )}

      {/* Step 3: Settings & Schedule */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold mb-2">Exam Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.settings.randomizeQuestions} onChange={e => setForm({ ...form, settings: { ...form.settings, randomizeQuestions: e.target.checked } })} className="w-4 h-4" />
                <span className="text-sm">Randomize question order per student</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.settings.randomizeOptions} onChange={e => setForm({ ...form, settings: { ...form.settings, randomizeOptions: e.target.checked } })} className="w-4 h-4" />
                <span className="text-sm">Randomize option order</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.settings.negativeMarkingEnabled} onChange={e => setForm({ ...form, settings: { ...form.settings, negativeMarkingEnabled: e.target.checked } })} className="w-4 h-4" />
                <span className="text-sm">Enable negative marking</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.settings.showCorrectAnswersAfter} onChange={e => setForm({ ...form, settings: { ...form.settings, showCorrectAnswersAfter: e.target.checked } })} className="w-4 h-4" />
                <span className="text-sm">Show correct answers after results</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.settings.allowLateSubmission} onChange={e => setForm({ ...form, settings: { ...form.settings, allowLateSubmission: e.target.checked } })} className="w-4 h-4" />
                <span className="text-sm">Allow late submission (with grace window)</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Passing Score (%)</label>
                <input type="number" min={0} max={100} value={form.settings.passingScore} onChange={e => setForm({ ...form, settings: { ...form.settings, passingScore: parseInt(e.target.value) || 40 } })} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Grace Window (min)</label>
                <input type="number" min={0} value={form.settings.graceWindowMinutes} onChange={e => setForm({ ...form, settings: { ...form.settings, graceWindowMinutes: parseInt(e.target.value) || 5 } })} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Max Attempts</label>
                <input type="number" min={1} value={form.settings.maxAttempts} onChange={e => setForm({ ...form, settings: { ...form.settings, maxAttempts: parseInt(e.target.value) || 1 } })} className="w-full border rounded-lg px-3 py-2" />
              </div>
            </div>
          </div>

          <div className="bg-white border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold">Schedule</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Start Date & Time</label>
                <input type="datetime-local" value={form.scheduledStartTime} onChange={e => setForm({ ...form, scheduledStartTime: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">End Date & Time</label>
                <input type="datetime-local" value={form.scheduledEndTime} onChange={e => setForm({ ...form, scheduledEndTime: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-6 py-2 border rounded-lg">Back</button>
            <button onClick={handleSave} disabled={saving || !form.title} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : editId ? 'Update Exam' : 'Create Exam'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Edit Question</h2>
              <button onClick={() => setEditingQuestion(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {/* Question text */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Question Text *</label>
                <textarea
                  value={editingQuestion.text}
                  onChange={e => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-300 outline-none"
                />
              </div>
              {/* Points */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Points</label>
                  <input
                    type="number" min={1}
                    value={editingQuestion.points}
                    onChange={e => setEditingQuestion({ ...editingQuestion, points: parseInt(e.target.value) || 1 })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Difficulty</label>
                  <select
                    value={editingQuestion.difficulty}
                    onChange={e => setEditingQuestion({ ...editingQuestion, difficulty: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              {/* Options (MCQ / multi_select / true_false) */}
              {(editingQuestion.type === 'mcq' || editingQuestion.type === 'multi_select' || editingQuestion.type === 'true_false') && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    Answer Options <span className="text-xs text-gray-400 font-normal">(click check to mark correct)</span>
                  </label>
                  <div className="space-y-2">
                    {editingQuestion.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          onClick={() => setCorrectOption(oi)}
                          className={`w-7 h-7 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${opt.isCorrect ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-gray-300 hover:border-green-400'}`}
                          title="Mark as correct answer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <input
                          value={opt.text}
                          onChange={e => {
                            const options = editingQuestion.options.map((o, i) => i === oi ? { ...o, text: e.target.value } : o);
                            setEditingQuestion({ ...editingQuestion, options });
                          }}
                          className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                          placeholder={`Option ${oi + 1}`}
                        />
                      </div>
                    ))}
                    {editingQuestion.type !== 'true_false' && (
                      <button
                        onClick={() => setEditingQuestion({ ...editingQuestion, options: [...editingQuestion.options, { text: '', isCorrect: false }] })}
                        className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1 mt-1"
                      >
                        <Plus className="w-3 h-3" /> Add Option
                      </button>
                    )}
                  </div>
                </div>
              )}
              {/* Short / one-word answer */}
              {(editingQuestion.type === 'short_answer' || editingQuestion.type === 'one_word' || editingQuestion.type === 'fill_blank') && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Correct Answer</label>
                  <input
                    value={typeof editingQuestion.correctAnswer === 'string' ? editingQuestion.correctAnswer : ''}
                    onChange={e => setEditingQuestion({ ...editingQuestion, correctAnswer: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                    placeholder="Expected answer text"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <button onClick={() => setEditingQuestion(null)} className="px-5 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleEditSave}
                disabled={editSaving || !editingQuestion.text.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExamCreationPage() {
  return <Suspense><ExamCreationPageInner /></Suspense>;
}
