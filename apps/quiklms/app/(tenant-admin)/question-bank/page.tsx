'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { BookOpen, Plus, Search, Trash2, Edit, X, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';

interface QuestionOption { text: string; isCorrect: boolean; }
interface QuestionItem {
  _id: string;
  subject: string;
  topic?: string;
  difficulty: string;
  type: string;
  text: string;
  options: QuestionOption[];
  correctAnswer?: any;
  points: number;
  negativeMarks: number;
  explanation?: string;
  tags: string[];
  createdAt: string;
}

const TYPES = ['mcq', 'multi_select', 'true_false', 'short_answer', 'long_answer', 'fill_blank', 'one_word', 'match_column'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const TYPE_LABELS: Record<string, string> = {
  mcq: 'MCQ', multi_select: 'Multi-Select', true_false: 'True/False',
  short_answer: 'Short Answer', long_answer: 'Long Answer', fill_blank: 'Fill in Blank',
  one_word: 'One Word', match_column: 'Match the Column',
};
const DIFF_COLORS: Record<string, string> = {
  easy: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', hard: 'bg-red-100 text-red-700',
};

const emptyQuestion = (): Partial<QuestionItem> => ({
  subject: '', topic: '', difficulty: 'medium', type: 'mcq', text: '',
  options: [{ text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }],
  correctAnswer: undefined, points: 1, negativeMarks: 0, explanation: '', tags: [],
});

export default function QuestionBankPage() {
  const router = useRouter();
  const { branding } = useBranding();
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Subjects for the filter bar (from question bank — shows only subjects with questions)
  const [subjects, setSubjects] = useState<string[]>([]);
  // Authoritative subject list from academic config (includes default + custom subjects)
  const [academicSubjects, setAcademicSubjects] = useState<string[]>([]);
  // Topic suggestions for the active session subject
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);

  const [filterSubject, setFilterSubject] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<QuestionItem>>(emptyQuestion());
  const [pendingQuestions, setPendingQuestions] = useState<Partial<QuestionItem>[]>([]);
  const [saving, setSaving] = useState(false);

  // Bank-level subject for create sessions (applies to every question in the batch)
  const [sessionSubject, setSessionSubject] = useState('');
  const [showCustomSubject, setShowCustomSubject] = useState(false);
  const [customSubjectInput, setCustomSubjectInput] = useState('');

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, limit: 20 };
      if (filterSubject) params.subject = filterSubject;
      if (filterDifficulty) params.difficulty = filterDifficulty;
      if (filterType) params.type = filterType;
      if (search) params.search = search;
      const res = await api.get<any>('/question-bank', { params });
      const d = res;
      setQuestions(d.questions || []);
      setTotal(d.total || 0);
      setTotalPages(d.totalPages || 1);
    } catch {}
    finally { setLoading(false); }
  }, [page, filterSubject, filterDifficulty, filterType, search]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  // Filter-bar subjects (distinct from existing questions)
  useEffect(() => {
    api.get<any>('/question-bank/subjects').then((r: any) => setSubjects(r.data || [])).catch(() => {});
  }, []);

  // Authoritative subject list from academic config (string[] returned directly)
  useEffect(() => {
    api.get<any>('/academic-config/subjects')
      .then((r: any) => {
        setAcademicSubjects(Array.isArray(r) ? r : r?.data || []);
      })
      .catch(() => {});
  }, []);

  // Fetch topic suggestions whenever the session subject changes
  useEffect(() => {
    if (sessionSubject) {
      api.get<any>('/question-bank/topics', { params: { subject: sessionSubject } })
        .then((r: any) => setTopicSuggestions(r.data || []))
        .catch(() => setTopicSuggestions([]));
    } else {
      setTopicSuggestions([]);
    }
  }, [sessionSubject]);

  // Also fetch topic suggestions when editing a question
  useEffect(() => {
    if (editId && form.subject) {
      api.get<any>('/question-bank/topics', { params: { subject: form.subject } })
        .then((r: any) => setTopicSuggestions(r.data || []))
        .catch(() => setTopicSuggestions([]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const applySessionSubject = (subject: string) => {
    setSessionSubject(subject);
    setForm(prev => ({ ...prev, subject }));
  };

  const openCreate = () => {
    setEditId(null);
    setPendingQuestions([]);
    setSessionSubject('');
    setShowCustomSubject(false);
    setCustomSubjectInput('');
    setTopicSuggestions([]);
    setForm(emptyQuestion());
    setShowModal(true);
  };

  const openEdit = (q: QuestionItem) => {
    setEditId(q._id);
    setForm({ ...q });
    setShowModal(true);
  };

  const validateQuestion = (q: Partial<QuestionItem>) => !!q.subject && !!q.text && !!q.type;

  const pushCurrentToQueue = () => {
    if (!sessionSubject) {
      alert('Please select a Bank Subject before adding questions.');
      return;
    }
    const questionToAdd = { ...form, subject: sessionSubject };
    if (!questionToAdd.text || !questionToAdd.type) {
      alert('Please fill Type and Question Text before adding to list.');
      return;
    }
    setPendingQuestions(prev => [...prev, questionToAdd]);
    // Keep session subject for the next question; clear other fields
    setForm({ ...emptyQuestion(), subject: sessionSubject });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) {
        await api.put<any>(`/question-bank/${editId}`, form);
      } else {
        const currentQuestion = { ...form, subject: sessionSubject || form.subject };
        const queue = [...pendingQuestions];
        if (validateQuestion(currentQuestion)) queue.push(currentQuestion);
        if (queue.length === 0) {
          alert('Please add at least one valid question');
          setSaving(false);
          return;
        }
        if (queue.length === 1) {
          await api.post<any>('/question-bank', queue[0]);
        } else {
          await api.post<any>('/question-bank/bulk', { questions: queue });
        }
      }
      setShowModal(false);
      setPendingQuestions([]);
      fetchQuestions();
    } catch (e: any) {
      alert('Error: ' + (e?.message || 'Failed to save'));
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return;
    try { await api.delete<any>(`/question-bank/${id}`); fetchQuestions(); } catch {}
  };

  const updateOption = (idx: number, field: string, value: any) => {
    const opts = [...(form.options || [])];
    (opts[idx] as any)[field] = value;
    if (field === 'isCorrect' && form.type === 'mcq') {
      opts.forEach((o, i) => { if (i !== idx) o.isCorrect = false; });
    }
    setForm({ ...form, options: opts });
  };

  const addOption = () => setForm({ ...form, options: [...(form.options || []), { text: '', isCorrect: false }] });
  const removeOption = (idx: number) => setForm({ ...form, options: (form.options || []).filter((_, i) => i !== idx) });

  const confirmCustomSubject = () => {
    const s = customSubjectInput.trim();
    if (s) {
      applySessionSubject(s);
      if (!academicSubjects.includes(s)) {
        setAcademicSubjects(prev => [...prev, s]);
        api.post<any>('/academic-config/subjects', { name: s }).catch(() => {});
      }
    }
    setShowCustomSubject(false);
    setCustomSubjectInput('');
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <button onClick={() => router.push('/tenant-dashboard')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 pt-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mb-6"
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
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Question Bank</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">{total} questions available</p>
            </div>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all duration-200 border border-white/30 text-sm sm:text-base">
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" /> Add Question
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search questions..." className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm" />
        </div>
        <select value={filterSubject} onChange={e => { setFilterSubject(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterDifficulty} onChange={e => { setFilterDifficulty(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Difficulties</option>
          {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
        </select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : questions.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No questions found</p>
          <button onClick={openCreate} className="mt-3 text-violet-600 font-medium">Create your first question</button>
        </div>
      ) : (
        <>
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Question</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Subject</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Difficulty</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Points</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {questions.map(q => (
                    <tr key={q._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-sm text-gray-900 truncate">{q.text}</p>
                        {q.tags.length > 0 && <p className="text-xs text-gray-400 mt-1">{q.tags.join(', ')}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{q.subject}</td>
                      <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">{TYPE_LABELS[q.type] || q.type}</span></td>
                      <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded text-xs font-medium ${DIFF_COLORS[q.difficulty] || ''}`}>{q.difficulty}</span></td>
                      <td className="px-4 py-3 text-center text-sm font-medium">{q.points}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(q)} className="p-1 hover:bg-gray-100 rounded mr-1"><Edit className="w-4 h-4 text-gray-500" /></button>
                        <button onClick={() => handleDelete(q._id)} className="p-1 hover:bg-red-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">Showing {questions.length} of {total}</p>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 border rounded-lg disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 border rounded-lg disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold">{editId ? 'Edit Question' : 'New Question'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">

              {/* Bank-level Subject Selector (create mode only) */}
              {!editId && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    <span className="text-sm font-semibold text-violet-800">
                      Bank Subject <span className="text-red-500">*</span>
                    </span>
                    {sessionSubject && (
                      <span className="ml-auto text-xs bg-violet-600 text-white px-2.5 py-0.5 rounded-full font-medium">
                        {sessionSubject}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-violet-600">
                    This subject will be applied to every question added in this session — no need to re-enter it per question.
                  </p>
                  {!showCustomSubject ? (
                    <select
                      value={sessionSubject}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setShowCustomSubject(true);
                        } else {
                          applySessionSubject(e.target.value);
                        }
                      }}
                      className="w-full border border-violet-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-violet-400 outline-none"
                    >
                      <option value="">— Select a subject —</option>
                      {academicSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                      <option value="__custom__">+ Add Custom Subject</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={customSubjectInput}
                        onChange={e => setCustomSubjectInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmCustomSubject(); }}
                        className="flex-1 border border-violet-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                        placeholder="Type new subject name..."
                      />
                      <button
                        type="button"
                        onClick={confirmCustomSubject}
                        className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 font-medium"
                      >
                        Set
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCustomSubject(false); setCustomSubjectInput(''); }}
                        className="px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Multi-question queue banner */}
              {!editId && (
                <div className="bg-gray-50 border rounded-lg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-600">
                      Multi-question mode: queue multiple questions and save them all at once.
                    </p>
                    <button
                      type="button"
                      onClick={pushCurrentToQueue}
                      className="px-3 py-1.5 bg-violet-600 text-white rounded text-sm hover:bg-violet-700"
                    >
                      Add Current Question to List
                    </button>
                  </div>
                  {pendingQuestions.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-gray-500 font-medium">Queued Questions: {pendingQuestions.length}</p>
                      {pendingQuestions.map((q, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-white border rounded px-2 py-1">
                          <span className="truncate mr-2">
                            {i + 1}. {TYPE_LABELS[q.type || ''] || q.type} — {(q.text || '').slice(0, 80)}
                          </span>
                          <button
                            type="button"
                            className="text-red-500 hover:text-red-700 flex-shrink-0"
                            onClick={() => setPendingQuestions(prev => prev.filter((_, idx) => idx !== i))}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Subject (edit mode) + Topic */}
              <div className="grid grid-cols-2 gap-4">
                {editId ? (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Subject *</label>
                    <input
                      value={form.subject || ''}
                      onChange={e => setForm({ ...form, subject: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="Mathematics"
                    />
                  </div>
                ) : sessionSubject ? (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Subject</label>
                    <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                      {sessionSubject}
                    </div>
                  </div>
                ) : null}

                <div className={!editId && !sessionSubject ? 'col-span-2' : ''}>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Topic</label>
                  <input
                    list="qb-topic-suggestions"
                    value={form.topic || ''}
                    onChange={e => setForm({ ...form, topic: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder={topicSuggestions.length > 0 ? 'Select or type a topic...' : 'e.g. Algebra'}
                  />
                  <datalist id="qb-topic-suggestions">
                    {topicSuggestions.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
              </div>

              {/* Type / Difficulty / Points */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Type *</label>
                  <select value={form.type || 'mcq'} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Difficulty</label>
                  <select value={form.difficulty || 'medium'} onChange={e => setForm({ ...form, difficulty: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Points</label>
                  <input type="number" min={1} value={form.points || 1} onChange={e => setForm({ ...form, points: parseInt(e.target.value) || 1 })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              {/* Question Text */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Question Text *</label>
                <textarea value={form.text || ''} onChange={e => setForm({ ...form, text: e.target.value })} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Enter question text..." />
              </div>

              {/* MCQ / Multi-select Options */}
              {(form.type === 'mcq' || form.type === 'multi_select') && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">Options</label>
                  <div className="space-y-2">
                    {(form.options || []).map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type={form.type === 'mcq' ? 'radio' : 'checkbox'} checked={opt.isCorrect} onChange={e => updateOption(i, 'isCorrect', e.target.checked)} name="correctOption" className="w-4 h-4" />
                        <input value={opt.text} onChange={e => updateOption(i, 'text', e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm" placeholder={`Option ${i + 1}`} />
                        {(form.options || []).length > 2 && <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>}
                      </div>
                    ))}
                  </div>
                  <button onClick={addOption} className="mt-2 text-sm text-violet-600 font-medium">+ Add Option</button>
                </div>
              )}

              {/* True/False */}
              {form.type === 'true_false' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Correct Answer</label>
                  <select value={form.correctAnswer === true ? 'true' : 'false'} onChange={e => setForm({ ...form, correctAnswer: e.target.value === 'true' })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </div>
              )}

              {/* Short Answer / Fill Blank / One Word / Match Column */}
              {(form.type === 'short_answer' || form.type === 'fill_blank' || form.type === 'one_word' || form.type === 'match_column') && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Correct Answer</label>
                  <input
                    value={typeof form.correctAnswer === 'string' ? form.correctAnswer : Array.isArray(form.correctAnswer) ? form.correctAnswer.join(', ') : ''}
                    onChange={e =>
                      setForm({
                        ...form,
                        correctAnswer: form.type === 'fill_blank'
                          ? e.target.value.split(',').map((s: string) => s.trim())
                          : e.target.value,
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder={form.type === 'fill_blank' ? 'answer1, answer2' : form.type === 'match_column' ? 'A-1, B-2, C-3' : 'Expected answer'}
                  />
                </div>
              )}

              {/* Explanation */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Explanation (optional)</label>
                <textarea value={form.explanation || ''} onChange={e => setForm({ ...form, explanation: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>

              {/* Tags */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Tags (comma separated)</label>
                <input value={(form.tags || []).join(', ')} onChange={e => setForm({ ...form, tags: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="algebra, equations" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t sticky bottom-0 bg-white">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleSave}
                disabled={
                  saving ||
                  (!editId && !sessionSubject) ||
                  (!editId && pendingQuestions.length === 0 && !form.text) ||
                  (!!editId && (!form.text || !form.subject))
                }
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : editId
                    ? 'Update'
                    : pendingQuestions.length > 0
                      ? `Create ${pendingQuestions.length + (form.text ? 1 : 0)} Questions`
                      : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
