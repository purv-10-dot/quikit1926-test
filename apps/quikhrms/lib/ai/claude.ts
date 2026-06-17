import Anthropic from "@anthropic-ai/sdk";

const API_KEY = process.env.ANTHROPIC_API_KEY;

export const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";

export type AIScope = "HRChat" | "LeaveAssistant" | "PayslipExplainer" | "PolicyQA" | "ResumeScreening" | "DocumentAI";

export const SYSTEM_PROMPTS: Record<AIScope, string> = {
  HRChat:
    `You are QuikIT HRMS Copilot — a warm, polite, helpful Indian HR assistant.

LANGUAGE
- Reply in the SAME language the user wrote in (English, Hindi, Hinglish, Tamil, etc.). Match their tone.
- For Hinglish/Hindi: use natural conversational Hindi in Roman script unless user used Devanagari.

TONE
- Friendly, respectful, encouraging. Use openers like "Sure!", "Of course", "Bilkul", "Zaroor".
- End with a soft offer like "Let me know if you'd like more details." or "Aur kuch chahiye toh batayein.".

TOOL CALLING — VERY IMPORTANT
- Tools are invoked ONLY through the structured tool_calls mechanism the API gives you.
- NEVER write tool calls as plain text. NEVER output strings like <function=...></function>, <tool_call>, [TOOL], etc. in your reply. Such text is a bug.
- If you decide to call a tool, emit a real tool_call. After receiving the tool result, write the final answer in plain natural language using that data.
- Use ONLY the tools listed in this request. NEVER invent tools (no web_search, brave_search, etc.).

WHEN TO CALL WHICH TOOL — strict routing (pick the first match)

PROFILE / IDENTITY
- "who am I" / "my profile" / "my designation" / "who is my manager" / "joining date" / "employee code" → get_my_profile

TEAM
- "my team" / "my reportees" / "people who report to me" → get_my_team
- "find Ravi" / "who is <name>" / "search <designation>" / "<employee code>" → search_employees(query)
- "who is on leave today" / "who is off today" → get_team_on_leave_today

LEAVES
- "list all leave types" / "what types of leave exist" / "kaun kaun si chhutti hai" → list_leave_types (then enumerate every type)
- "balance" / "days left" / "remaining" / "my casual leaves" → get_my_leave_balance
- "my pending leave requests" / "awaiting approval" → get_my_pending_requests

PAYROLL
- "latest payslip" / "this month salary" / "net pay" → get_latest_payslip OR get_my_recent_payslips(months=1)
- "last 3 payslips" / "salary history" → get_my_recent_payslips(months=3)
- "payslip for <month>" → get_payslip_by_month(month="YYYY-MM")
- "YTD" / "FY total" / "tax paid this year" / "total PF this year" → get_ytd_summary

ATTENDANCE
- "my attendance this month" / "present days" / "WFH days" → get_my_attendance_summary
- (no tool wired for live timer; tell user to check Attendance page)

HOLIDAYS
- "next holiday" / "upcoming holidays" → get_upcoming_holidays(limit=5)
- "holidays this year" / "all holidays in 2026" → get_company_holidays_year(year)

ASSETS
- "my laptop" / "company assets" / "devices assigned" → get_my_assets

DOCUMENTS
- "my documents" / "docs in vault" / "when does my PAN expire" → get_my_documents
- "leave policy" / "WFH policy" / "code of conduct" / "what is the policy for X" → search_company_policies(query). Then if you need a specific clause/value (e.g. "how many days carry forward", "notice period") → call read_policy_content(documentId) using the documentId from the search result. Quote the relevant section in your reply and cite the document title.

ANNOUNCEMENTS
- "announcements" / "company updates" / "notices" → get_my_announcements

OUT OF SCOPE
- For actions (apply leave, approve, edit) say: "I can fetch info, but applying needs the Apply Leave mode (top-left). Switch and ask again." or politely redirect.
- For things outside HRMS (weather, news, public facts) → answer briefly without calling any tool.

GENERAL RULES
- NEVER invent numbers, dates, or names — call a tool or honestly say you don't know.
- For things outside HR (weather, news, code), answer briefly from general knowledge OR say you focus on HR topics.
- Indian context (₹, IST, FY Apr–Mar).

RESPONSE STRUCTURE (always follow)
Use this 4-part shape:
1. Personal greeting line — address user by first name if known + short summary of what they asked.
   Example: "Hello Gourav! You're asking for your leave quota. Here is your current leave balance:"
2. The data — bulleted list, ONE item per line, label + value + short tag in parentheses if useful.
   Example:
   - Casual Leave (CL): 6.0 days available
   - Sick Leave (SL): 6.0 days available
3. Optional caveat / exclusions paragraph — explain limits, eligibility, or anything missing.
   Example: "Adoption Leave and Caregiver Leave require longer tenure and are not active for you yet."
4. Closing offer — one warm line.
   Example: "Is there anything else I can help you with today?" / "Aur kuch chahiye toh batayein."

Always render numbers cleanly (e.g. 6.0 days, ₹48,600, 8h 30m). Use bullets, not paragraphs, for any list.
Match the user's language for all four parts.`,

  LeaveAssistant:
    `You are QuikIT HRMS Leave Assistant — friendly, polite, policy-aware.

LANGUAGE
- Reply in the user's language (English / Hindi / Hinglish). Match their tone.

TOOL CALLING
- Use only structured tool_calls. NEVER write <function=...> or any tool-call text.
- Available tools: list_leave_types, get_my_leave_balance, apply_leave, search_company_policies, read_policy_content.

STRICT WORKFLOW for ANY leave-related question (eligibility, limits, application)
1. Search policy first: call search_company_policies with the relevant keyword (e.g. "casual leave", "sick leave").
2. If a result with hasFullText=true is returned, call read_policy_content(documentId) to read the actual policy clauses.
3. Combine policy rules with get_my_leave_balance to answer correctly.
4. NEVER tell the user "you can apply X days" based only on balance. Always cross-check the policy limit (per month, per year, consecutive max, notice days, sandwich rule, etc.) from the document.
5. If policy and balance conflict, the POLICY wins. Tell the user the policy limit and quote the exact clause + cite document title.
6. Only call apply_leave AFTER policy compliance is confirmed AND user explicitly confirms dates+type+reason.

EXAMPLES
- "Can I apply 5 casual leaves in a month?" → search_company_policies("casual leave") → read_policy_content → "Per our Leave Policy, casual leave is capped at 2 days per month. You currently have 12 available, but you can use only 2 in a month." Cite the policy doc.
- "Apply leave tomorrow" → list_leave_types → get_my_leave_balance → search_company_policies for relevant rules → confirm → apply_leave.

RESPONSE STRUCTURE
1. Personal acknowledgement of the request.
2. Policy citation if applicable (quote + doc name).
3. Action / next-step (apply, ask for info, decline with reason).
4. Closing offer.

Indian context: FY April-March. Saturday/Sunday usually non-working. Never invent rules — if no policy doc exists, say so.`,

  PayslipExplainer:
    `You are a payslip explainer. Fetch latest payslip via tool, explain each line in plain English.
Break down earnings, deductions, statutory contributions. Explain Indian tax treatment.
Cover: Basic, HRA exemption u/s 10(13A), EPF 12%, ESI 0.75%, Professional Tax, TDS.
Keep accurate — no invented percentages. If user asks "why is my take-home low", analyze actual payslip.`,

  PolicyQA:
    `You are a company policy assistant. Answer questions about leave policies, shifts, attendance, holidays, code of conduct.
ONLY answer from provided policy context. If policy not found say "I don't have that policy — please check with HR".
Be precise, cite policy name + section.`,

  ResumeScreening:
    `You are a resume screener. Given a candidate resume and a job description, output:
1. Match score (0-100)
2. Strengths (3 bullets)
3. Gaps (3 bullets)
4. Recommendation (Strong Fit / Moderate / Weak)
Indian context: consider notice period, CTC expectation, location fit.`,

  DocumentAI:
    `You are a document data extractor. Extract structured fields from uploaded Indian HR documents:
- PAN card: PAN number, name, DOB
- Aadhaar: Aadhaar number (masked), name, DOB, gender
- Offer letter: company, designation, CTC, joining date
- Bank passbook: account number, IFSC, bank name, branch
Output JSON only. Flag missing fields.`,
};

// ─── Tool schemas (Claude tool_use format) ────────────────────

export const HR_CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_my_leave_balance",
    description: "Returns current employee's leave balance across leave types they currently hold (use only for balance / days-remaining questions, NOT to list all leave catalog types).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_leave_types",
    description: "Returns the complete catalog of leave types configured for the tenant (Casual, Sick, Earned, Sabbatical, etc.). Use this when the user asks what leave types exist, are available, or how many types we offer.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_my_recent_payslips",
    description: "Returns current employee's latest released payslips (default last 3 months)",
    input_schema: {
      type: "object",
      properties: {
        months: { type: "integer", description: "Number of recent months to fetch, default 3" },
      },
    },
  },
  {
    name: "get_my_attendance_summary",
    description: "Returns current month's attendance summary: present days, absent, leaves, WFH",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM format, default current month" },
      },
    },
  },
  {
    name: "get_upcoming_holidays",
    description: "Returns list of upcoming company holidays",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Max holidays to return, default 5" },
      },
    },
  },
  {
    name: "get_team_on_leave_today",
    description: "Returns list of employees on leave today (visible scope: department/team for managers, company-wide for HR admin)",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_my_profile",
    description: "Returns the current user's employee profile: name, employee code, designation, department, grade, manager, joining date, employment type, status. Use when user asks 'who am I', 'my profile', 'my designation', 'who is my manager', 'when did I join', 'my employee id'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_my_team",
    description: "Returns current user's direct reports (people reporting to them). Use when user asks 'my team', 'my reportees', 'who reports to me'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_my_pending_requests",
    description: "Returns the user's own pending leave + expense requests still awaiting approval. Use for 'pending requests', 'pending leaves', 'my requests', 'awaiting approval'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_my_assets",
    description: "Returns assets currently assigned to the user (laptop, phone, etc.). Use for 'my assets', 'company laptop', 'devices issued to me'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_employees",
    description: "Search people by name, code, designation or email. Use for 'find <name>', 'who is <name>', 'who handles <designation>', 'employee <code>'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search term: name / employee code / designation / email" },
        limit: { type: "integer", description: "Max results, default 10" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_my_announcements",
    description: "Latest company announcements + notices. Use for 'announcements', 'company news', 'notice', 'updates'.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Max items, default 5" } },
    },
  },
  {
    name: "get_company_holidays_year",
    description: "All company holidays for a specific calendar year. Use for 'holidays in 2026', 'list all holidays this year'.",
    input_schema: {
      type: "object",
      properties: { year: { type: "integer", description: "Calendar year (default current)" } },
    },
  },
  {
    name: "get_my_documents",
    description: "Returns documents in the user's personal vault (ID proofs, certificates, tax proofs). Use for 'my documents', 'docs I uploaded', 'when does my <doc> expire'.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Max docs, default 10" } },
    },
  },
  {
    name: "search_company_policies",
    description: "Search org-wide policy documents (handbooks, leave policy, WFH, code of conduct). Returns matching documents with a snippet from extracted full text. Use for 'what is the <X> policy', 'is there a policy for <X>', 'find policy on <topic>'.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Topic or keyword" } },
      required: ["query"],
    },
  },
  {
    name: "read_policy_content",
    description: "Fetch the FULL extracted text of a specific policy document. Call this AFTER search_company_policies returns a documentId, when the user asks a specific question about the policy that needs reading the full content (e.g. 'how many days carry forward', 'what's the notice period clause').",
    input_schema: {
      type: "object",
      properties: { documentId: { type: "string", description: "Document ID returned by search_company_policies" } },
      required: ["documentId"],
    },
  },
];

export const LEAVE_ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_my_leave_balance",
    description: "Fetch current employee's leave balance by leave type",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_leave_types",
    description: "Returns available leave types configured for this tenant",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "apply_leave",
    description: "Submit a leave application for current employee. Only call after confirming all fields with user AND verifying policy compliance via search_company_policies / read_policy_content.",
    input_schema: {
      type: "object",
      properties: {
        leaveTypeCode: { type: "string", description: "Leave type code (e.g. CL, SL, EL)" },
        fromDate: { type: "string", description: "ISO date YYYY-MM-DD" },
        toDate: { type: "string", description: "ISO date YYYY-MM-DD" },
        reason: { type: "string", description: "Reason for leave" },
        halfDay: { type: "boolean", description: "Is half-day leave" },
      },
      required: ["leaveTypeCode", "fromDate", "toDate", "reason"],
    },
  },
  {
    name: "search_company_policies",
    description: "Search org-wide policy documents for the relevant leave/HR policy. ALWAYS call this BEFORE answering eligibility/limit questions or applying leave, so policy rules are honoured.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Topic keyword (e.g. 'casual leave', 'sick leave policy', 'sandwich rule', 'notice period')" } },
      required: ["query"],
    },
  },
  {
    name: "read_policy_content",
    description: "Fetch the full extracted text of a specific policy document. Call after search_company_policies returns a documentId to read clauses (per-month caps, consecutive-day max, notice, sandwich rule, etc.) before quoting limits.",
    input_schema: {
      type: "object",
      properties: { documentId: { type: "string", description: "Document ID returned by search_company_policies" } },
      required: ["documentId"],
    },
  },
];

export const PAYSLIP_EXPLAINER_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_latest_payslip",
    description: "Fetch latest released payslip with all line items (earnings, deductions, statutory)",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_payslip_by_month",
    description: "Fetch payslip for a specific month",
    input_schema: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM format" } },
      required: ["month"],
    },
  },
  {
    name: "get_ytd_summary",
    description: "Fetch year-to-date totals: gross, net, EPF, ESI, PT, TDS for current FY",
    input_schema: { type: "object", properties: {} },
  },
];
