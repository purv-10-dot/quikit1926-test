# AI Recruitment Agent — Build Plan

> Senior AI Engineer perspective. Short, opinionated, build-ready.

---

## 1. Goal

Automate repetitive recruitment work. Keep humans in the loop for hiring decisions.

AI handles: posting jobs, resume screening, screening interviews, scheduling, document collection.
Humans handle: requisitions, JD approval, final interview, hire decision, offer letter.

---

## 2. Architecture

```
[Requisition created]
        ↓
   [Orchestrator Agent]   ← state machine, owns candidate journey
        ↓
   [Sub-agents / Tools]
   ├── Job-Poster
   ├── Resume Screener
   ├── Inviter
   ├── Voice/Chat Interviewer
   ├── Scheduler
   └── Document Collector
```

- **Orchestrator** runs the workflow per candidate.
- Each step calls a **sub-agent (tool)** that does one thing well.
- State stored in Postgres. Orchestrator holds no in-memory state.
- Idempotent steps: safe to retry.

---

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| LLM (default) | Claude Sonnet 4.6 | Fast, cheap, tool use |
| LLM (heavy) | Claude Opus 4.7 | Resume reasoning edge cases |
| Orchestration | LangGraph or TS state machine + BullMQ / Inngest | Durable, retryable |
| State store | Postgres (existing HRMS) | One row per journey |
| Vector | pgvector | JD ↔ resume embeddings |
| Embeddings | `text-embedding-3-large` | Strong semantic match |
| Voice screening | Vapi / Retell / Twilio + Deepgram | Real-time voice |
| Calendar | Google + Outlook OAuth | Free/busy + booking |
| Job boards | LinkedIn + Naukri APIs (RPA fallback) | Auto-post |
| Email | Existing notification service | Templated invites |
| Doc verification | DigiLocker, Aadhaar OCR, bank/payslip parser | Government-grade |

---

## 4. Step-by-step (mapped to 9-step flow)

| # | What happens | Owner | Agent / Tool |
|---|---|---|---|
| 1 | Employee raises requisition | Employee | — |
| 2 | HR approves → AI posts to portals | HR + AI | `JobPoster` → LinkedIn/Naukri APIs. Store post IDs. |
| 3 | Resume screening, ATS ≥ 70% | AI | `ResumeScreener` → embed + extract + score vs JD rubric |
| 4 | Email shortlisted candidates | AI | `Inviter` → templated email + magic-link portal |
| 5 | AI conducts screening round | AI | `Interviewer` → HR-provided questions, rubric (relevance, clarity, comms), pass cut-off |
| 6 | Schedule final interview | AI | `Scheduler` → calendar free/busy + Meet/Zoom link |
| 7 | Human takes interview, approves/rejects | Interviewer | UI button: Approve / Reject + notes |
| 8 | Doc collection (Aadhaar, PAN, bank, payslips) | AI | `DocCollector` → secure upload + OCR + verification |
| 9 | HR sends offer letter | HR | Templated letter, CC list from config |

---

## 5. Guardrails (non-negotiable)

- **Human-in-loop** gates at steps 2, 7, 9. Never auto-hire.
- **Bias audit**: log every score + reason. Periodic protected-class drift review.
- **Explainability**: every reject stores reason + matched JD criteria.
- **PII**: docs encrypted at rest, signed URLs, retention policy enforced.
- **Idempotency**: each step keyed by `(candidateId, step)`.
- **Audit log**: every AI decision → DB row.
- **Configurable cut-offs** per role. No hardcoded 70%.
- **Multi-tenant**: every model + query filters by `orgId`.

---

## 6. Data model (high level)

```
Requisition         → orgId, jobTitle, jdText, status, approvedBy
JobPosting          → requisitionId, portal, externalPostId, status
Candidate           → orgId, requisitionId, name, email, resumeUrl
ScreeningResult     → candidateId, atsScore, reasons[], passed
ScreeningInterview  → candidateId, transcript, rubricScores, passed
InterviewSchedule   → candidateId, slot, interviewerId, meetingLink
HireDecision        → candidateId, decision, notes, decidedBy
DocumentSubmission  → candidateId, type, url, verified, flags[]
AgentAuditLog       → orgId, candidateId, step, decision, reasoning, modelUsed, costCents
```

---

## 7. Build order (8 weeks)

| Week | Deliverable |
|---|---|
| 1–2 | Schema + state machine + requisition → post (steps 1, 2). Mock AI. |
| 3 | Resume screener + scoring (step 3). Real Claude. |
| 4 | Email invite + screening portal — chat-only first (steps 4, 5) |
| 5 | Scheduler + calendar OAuth (step 6) |
| 6 | Doc collection + verification (step 8) |
| 7 | Voice screening upgrade (step 5 voice) |
| 8 | Dashboards, audit, bias report, prod hardening |

---

## 8. Cost guard

- Cache JD embeddings (1 per requisition).
- Default model = Sonnet, escalate to Opus only on edge cases.
- Voice screening hard-capped at 8 minutes per candidate.
- Use **Anthropic Message Batches API** for low-priority resume bulk-screening (~50% off).
- Token budget per candidate logged + alerted.

---

## 9. Why this design works

- **Modular** — swap Naukri for Indeed without touching screener.
- **Auditable** — state lives in DB, not agent memory.
- **Safe** — human signs off on hire + offer.
- **Cheap** — small model + caching + batch API.
- **Tenant-isolated** — fits QuikIT HRMS multi-tenant rules.

---

## 10. Open questions for stakeholders

1. Which job boards must be live at launch? (LinkedIn + Naukri minimum?)
2. Voice or chat for screening interview at MVP?
3. Cut-off scores per role — who configures, HR or hiring manager?
4. Doc verification — DigiLocker only, or third-party KYC vendor?
5. Bias audit cadence — weekly or monthly?
6. Data retention for rejected candidates — 6 months / 1 year / GDPR?
