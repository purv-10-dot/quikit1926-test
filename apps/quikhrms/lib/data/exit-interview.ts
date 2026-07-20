// Exit-interview questionnaire — single source of truth for the public form
// (employee self-fill) and the HR view. Mirrors the standard exit-interview form.

export interface ExitInterviewQuestion {
  key: string;
  label: string;
  type: "textarea" | "yesno";
  /** For yes/no questions: the free-text follow-up key ("If not, please explain"). */
  explainKey?: string;
}

export const EXIT_INTERVIEW_QUESTIONS: ExitInterviewQuestion[] = [
  { key: "reasonForLeaving", label: "Please describe why you are leaving your position.", type: "textarea" },
  { key: "jobAsExpected", label: "Was your job what you expected it to be?", type: "yesno", explainKey: "jobAsExpectedExplain" },
  { key: "skillsCompatible", label: "Do you feel you were placed in a position compatible with your skills?", type: "yesno", explainKey: "skillsCompatibleExplain" },
  { key: "advancementPossible", label: "Do you feel that there was a possibility for advancement?", type: "yesno", explainKey: "advancementExplain" },
  { key: "challenges", label: "What were some challenges you faced in your position?", type: "textarea" },
  { key: "liked", label: "What did you like about your position?", type: "textarea" },
  { key: "disliked", label: "What did you dislike about your position?", type: "textarea" },
  { key: "companyDifferently", label: "Is there anything the company could have done differently to change your decision?", type: "textarea" },
  { key: "additionalComments", label: "Additional comments", type: "textarea" },
];

export type ExitInterviewResponse = Record<string, string> & { signatureName?: string; submittedAt?: string };
