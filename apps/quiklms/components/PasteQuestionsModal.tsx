'use client';
/**
 * PasteQuestionsModal — ported from the old QuikLMSs frontend
 * (src/components/PasteQuestionsModal.tsx).
 *
 * A modal that lets an author paste a free-form block of questions and see a
 * live preview of what the parser detected before applying them to the quiz:
 *   - left  — the textarea plus a "Supported formats" disclosure.
 *   - right — a PreviewCard per parsed question, with the correct option(s)
 *             highlighted, followed by any top-level parser warnings.
 *
 * Parsing itself is delegated to parseQuizPaste; "Apply" hands the parsed
 * questions to the caller and closes the modal.
 */
import React, { useMemo, useState } from 'react';
import { parseQuizPaste, type ParsedQuestion } from '@/lib/utils/parseQuizPaste';

interface PasteQuestionsModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (questions: ParsedQuestion[]) => void;
}

const EXAMPLE = `1. What is the capital of France?
A) London
B) Paris*
C) Berlin
D) Madrid

2. Which of these are prime numbers?
A) 4
B) 7 [correct]
C) 9
D) 11 [correct]

Q3. The sky is blue.
- True
- False
Answer: True`;

const PasteQuestionsModal: React.FC<PasteQuestionsModalProps> = ({ open, onClose, onApply }) => {
  const [text, setText] = useState('');

  const result = useMemo(() => parseQuizPaste(text), [text]);

  const handleApply = () => {
    if (result.questions.length === 0) return;
    onApply(result.questions);
    setText('');
    onClose();
  };

  const handleClose = () => {
    setText('');
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-violet-50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Paste Questions</h3>
            <p className="text-xs text-gray-600 mt-0.5">
              Paste a question on the first line, then each option on its own line as <code className="px-1 py-0.5 bg-white rounded border border-gray-200 font-mono">A) ...</code> — mark the correct one with a trailing <code className="px-1 py-0.5 bg-white rounded border border-gray-200 font-mono">*</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-6 overflow-hidden">
          {/* Left: textarea */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 gap-2">
              <label htmlFor="paste-questions-input" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Paste here
              </label>
              {/* Two small affordances that remove the "what do I type?" stall:
                  load a working example, and clear it again. */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setText(EXAMPLE)}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Load example
                </button>
                {text.trim() !== '' && (
                  <>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setText('')}
                      className="text-gray-500 hover:text-gray-700 font-medium"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
            <textarea
              id="paste-questions-input"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={EXAMPLE}
              spellCheck={false}
              className="flex-1 min-h-[320px] w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono leading-relaxed text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
            />
            <details className="mt-2 text-xs text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700 font-medium">Supported formats</summary>
              <div className="mt-2 space-y-2 leading-relaxed">
                <div>
                  <p className="font-semibold text-gray-600">Option labels — any of these</p>
                  <p className="mt-0.5">Letters: <code>A)</code> <code>A.</code> <code>A:</code> <code>(A)</code> <code>[A]</code> <code>A —</code> <code>A –</code> <code>A →</code> — upper or lower case.</p>
                  <p>Numbers: <code>1)</code> <code>1.</code> <code>1:</code> <code>(1)</code> <code>[1]</code> <code>1 —</code> <code>1 →</code></p>
                  <p>Roman: <code>I)</code> <code>II.</code> <code>(iii)</code> <code>[iv]</code> — upper or lower case.</p>
                  <p>Worded: <code>Option A:</code> <code>Option A —</code> <code>Choice A:</code> <code>Choice 1:</code></p>
                  <p>Bullets: <code>-</code> <code>*</code> <code>•</code> when every option uses the same one.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-600">Marking the answer</p>
                  <p className="mt-0.5">Trailing <code>*</code>, <code>[correct]</code>, <code>(correct)</code>, <code>[x]</code>, <code>✓</code> — or a separate <code>Answer: B</code> / <code>Answer: Paris</code> line.</p>
                  <p>Multi-select: mark several options, or <code>Answer: B, D</code>.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-600">Separating questions</p>
                  <p className="mt-0.5">A blank line, <code>---</code>, or a <code>Q1.</code> / <code>1.</code> prefix on the next question. Paste as many as you like in one go.</p>
                  <p>Two options reading “True / False” switch the question type automatically.</p>
                </div>
              </div>
            </details>
          </div>

          {/* Right: preview */}
          <div className="flex flex-col min-h-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Preview</span>
              {/* Colour carries the state: green once something parsed, amber
                  when there is text but nothing was recognised — that second
                  case is the one an author needs to notice before hitting
                  Apply and wondering where their questions went. */}
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  result.questions.length > 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : text.trim()
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-gray-100 text-gray-500 border border-gray-200'
                }`}
              >
                {result.questions.length} question{result.questions.length === 1 ? '' : 's'} detected
              </span>
            </div>
            <div className="flex-1 min-h-[280px] overflow-y-auto bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
              {result.questions.length === 0 && (
                <div className="h-full flex items-center justify-center text-center text-gray-400 text-sm px-6">
                  {text.trim()
                    ? 'Nothing recognised yet — check the option labels against Supported formats below.'
                    : 'Paste your questions on the left. They appear here as they are recognised.'}
                </div>
              )}
              {result.questions.map((q, qi) => (
                <PreviewCard key={qi} index={qi} question={q} />
              ))}
              {result.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                  {result.warnings.map((w, i) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs text-gray-500">
            Parsed questions will be appended to the quiz — you can still edit them after applying.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={result.questions.length === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {result.questions.length > 0
                ? `Add ${result.questions.length} question${result.questions.length === 1 ? '' : 's'}`
                : 'Add questions'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PreviewCard: React.FC<{ index: number; question: ParsedQuestion }> = ({ index, question }) => {
  const correctSet = useMemo(() => {
    const arr = Array.isArray(question.correctAnswerIndex)
      ? question.correctAnswerIndex
      : [question.correctAnswerIndex];
    return new Set(arr);
  }, [question.correctAnswerIndex]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-bold">
          Q{index + 1}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
          {question.type}
          {question.isMultiSelect ? ' · multi-select' : ''}
        </span>
      </div>
      <p className="text-sm font-medium text-gray-900 mb-2 leading-snug">{question.text}</p>
      <ul className="space-y-1">
        {question.options.map((o, i) => {
          const isCorrect = correctSet.has(i);
          return (
            <li
              key={i}
              className={`flex items-start gap-2 text-xs px-2 py-1 rounded ${isCorrect ? 'bg-emerald-50 text-emerald-800' : 'text-gray-700'}`}
            >
              <span className={`flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1 break-words">{o}</span>
              {isCorrect && <span className="text-emerald-600 text-[11px] font-bold">✓ correct</span>}
            </li>
          );
        })}
      </ul>
      {question.warnings.length > 0 && (
        <div className="mt-2 text-[11px] text-amber-700 space-y-0.5">
          {question.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PasteQuestionsModal;
