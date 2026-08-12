/**
 * Single source for the landing-page FAQ.
 *
 * Consumed twice: rendered by `Faq.tsx`, and serialised into FAQPage JSON-LD
 * by the marketing layout. Keeping one array means the structured data can
 * never drift from what the page actually shows — which is what search
 * engines penalise.
 */
export interface FaqItem {
  q: string;
  a: string;
}

export const FAQS: FaqItem[] = [
  {
    q: "What is QuikCRMExpress?",
    a: "QuikCRMExpress is a sales-execution CRM: lead capture and scoring, accounts and contacts, an opportunity pipeline, quotes and orders, built-in telephony with call disposition, and a workflow engine that automates follow-up. It is part of the Quikit suite, so it shares one login and one org directory with the rest of your tools.",
  },
  {
    q: "How does the built-in telephony work?",
    a: "Reps click to call from the lead record. The call is placed through your telephony provider, and the outcome — connected, busy, callback requested — is written back against the lead automatically. Disposition rules then move the lead's stage or raise the next task, so nothing depends on a rep remembering to log it.",
  },
  {
    q: "Can I automate follow-up?",
    a: "Yes. The workflow engine triggers on lead events — created, stage changed, call disposed — and can assign owners, create tasks, apply SLAs and send email. Rules are defined per organisation, so each team runs its own process.",
  },
  {
    q: "How do quotes and orders work?",
    a: "Quotes are built from a price list, versioned, and sent to the customer through a secure portal link where they can accept, reject or e-sign. An accepted quote converts to an order without re-keying anything.",
  },
  {
    q: "How do users get access?",
    a: "Access is granted centrally. A QuikIT super admin enables QuikCRMExpress for your organisation and assigns it to users; roles and permissions then control what each person can see and do inside the app. Users sign in once with their QuikIT account.",
  },
  {
    q: "Does it connect to the rest of the Quikit suite?",
    a: "It does. QuikCRMExpress shares the same identity, organisation and app-access model as QuikScale, QuikTrack and the other Quikit apps, so switching between them is one click and there are no separate user directories to maintain.",
  },
];
