/* ═════════════════════════════════════════════════════════════════════
   MOCK DATA — mirrors the real StoredMeetingReport shape from
   apps/quikscale/lib/ai/meetingReport.ts (reportType, meta, sections,
   adherence, scorecard, meetingDetails, attendance, blockers,
   extractedItems.{kpis,priorities,wwws} with who/what/when/sourceQuote).
   ═════════════════════════════════════════════════════════════════════ */

const CLIENTS = [
  { id: 'quikit', name: 'Quikit' },
  { id: 'moreyeahs', name: 'MoreYeahs' },
  { id: 'acme', name: 'Acme Retail' },
];

const PEOPLE = [
  'Vijay Chaurasia', 'Dhruv Sharma', 'Tarun Kanti Bhattacharjee',
  'Priya Nair', 'Sarim Khan', 'Rohit Deshmukh', 'Anjali Verma',
];

const DAILY_LINES = [
  ['0:09', 'Vijay Chaurasia', 'Good morning everyone, let us start the huddle. Same order as always.'],
  ['0:27', 'Dhruv Sharma', 'Guys, I have joined online.'],
  ['0:38', 'Vijay Chaurasia', 'So we have separated to online only.'],
  ['0:43', 'Dhruv Sharma', 'Okay. Actually, I am driving, so there may be lag if I do not speak, but I will speak when her turn comes.'],
  ['3:48', 'Tarun Kanti Bhattacharjee', 'Hi, good morning, everybody.'],
  ['3:53', 'Vijay Chaurasia', 'Good morning.'],
  ['3:55', 'Dhruv Sharma', 'Good morning.'],
  ['4:12', 'Vijay Chaurasia', 'Tarun, you go first. Yesterday achievement, today focus, and anything you are stuck on.'],
  ['4:26', 'Tarun Kanti Bhattacharjee', 'Yesterday I closed the client reporting pack for July and shared it with the leadership group. Today I am focused on the August dashboard refresh. No blockers from my side.'],
  ['5:40', 'Vijay Chaurasia', 'Good. Priya?'],
  ['5:48', 'Priya Nair', 'Yesterday I finished onboarding calls for two new accounts. Today I will start the QBR deck. I am stuck on the finance side — the collections report for MoreYeahs has not come through, so I cannot confirm the revenue number.'],
  ['7:15', 'Vijay Chaurasia', 'Okay, that is on Dhruv. Dhruv, can you get the collections report to Priya by Wednesday?'],
  ['7:31', 'Dhruv Sharma', 'Yes, I will share the collections report with Priya by Wednesday, 27th August.'],
  ['8:02', 'Vijay Chaurasia', 'Dhruv, your update.'],
  ['8:10', 'Dhruv Sharma', 'Yesterday was mostly internal reviews. Today I am on the finance close. Nothing blocking me.'],
  ['9:30', 'Vijay Chaurasia', 'Right. One thing — our daily huddle attendance has slipped. We were at 60 percent last week, we need to be above 90 percent.'],
  ['10:05', 'Priya Nair', 'Also the platform was down for about forty minutes yesterday and my team could not log the KPI values. That is a technical blocker.'],
  ['11:20', 'Vijay Chaurasia', 'Tarun, please raise a ticket with the platform team today and track it to closure.'],
  ['11:34', 'Tarun Kanti Bhattacharjee', 'Sure, I will raise the platform downtime ticket today and follow up.'],
  ['13:02', 'Vijay Chaurasia', 'Last item — I want the client onboarding turnaround down to five days this quarter. Right now we are at about nine.'],
  ['14:18', 'Priya Nair', 'I will own that. I will publish the revised onboarding checklist by 29th August.'],
  ['15:40', 'Vijay Chaurasia', 'Good. That is the huddle. Thank you everyone.'],
];

const WEEKLY_LINES = [
  ['0:12', 'Vijay Chaurasia', 'Welcome to the weekly leadership meeting. We are starting two minutes late, let us note that.'],
  ['1:05', 'Sarim Khan', 'Dashboard is up. All KPI values for week 33 are entered except two on the delivery side.'],
  ['4:30', 'Priya Nair', 'WWW review — of the eleven items from last week, eight are complete, two are in progress and one has slipped.'],
  ['9:14', 'Dhruv Sharma', 'Revenue for the week landed at 42 lakh against a target of 45. Collections improved to 78 percent.'],
  ['15:22', 'Vijay Chaurasia', 'On OPSP, our Q3 priority on partner enablement is behind schedule. We need a recovery plan.'],
  ['21:40', 'Tarun Kanti Bhattacharjee', 'Feedback round — the reporting pack is landing well with clients, but turnaround is still slow.'],
  ['28:05', 'Priya Nair', 'I will publish the partner enablement recovery plan by 1st September.'],
  ['31:50', 'Vijay Chaurasia', 'We ended six minutes over. Let us protect the end time next week.'],
];

const UNASSIGNED_LINES = [
  ['0:04', 'Unknown speaker', 'Recording started. Waiting for the host.'],
  ['1:12', 'Anjali Verma', 'Is everyone here? I think we are missing two people.'],
  ['2:30', 'Unknown speaker', 'Let us begin with the vendor update.'],
];

const DAILY_REPORT = {
  reportType: 'DAILY',
  title: 'Daily Adherence Report — Leaders Daily Huddle',
  generatedAt: '25 Aug 2026, 2:14 PM',
  model: 'Gemini 3.6 Flash',
  overallConfidence: 0.88,
  status: 'draft',
  summary: 'A 35-minute leadership huddle with four participants. Three of four gave a complete achievement / focus / blocker update. Two blockers were raised — a delayed collections report and a 40-minute platform outage — and three follow-up actions were assigned with named owners and dates.',
  meetingDetails: {
    meetingType: 'Daily Huddle — Google Meet',
    dateLabel: 'Tuesday, 25 August 2026',
    startMark: '4:56 AM UTC',
    endMark: '5:31 AM UTC',
    durationLabel: '35m 18s',
    timeOfDay: 'Morning (inferred from greetings)',
  },
  attendance: {
    present: [
      { name: 'Vijay Chaurasia', role: 'Chair / Senior Coach' },
      { name: 'Dhruv Sharma', role: 'Finance' },
      { name: 'Tarun Kanti Bhattacharjee', role: 'Client Reporting' },
      { name: 'Priya Nair', role: 'Client Success' },
    ],
    notPresent: ['Anjali Verma', 'Rohit Deshmukh'],
    comparisonNote: 'compared against the client member list',
  },
  adherence: [
    {
      participant: 'Tarun Kanti Bhattacharjee', role: 'Client Reporting',
      achievement: 'YES', focus: 'YES', stuck: 'YES', score: '3/3', rating: 'Full',
      achievementNote: 'Named a concrete deliverable — the July client reporting pack — and confirmed it was shared.',
      focusNote: 'Clearly stated the August dashboard refresh as the focus for today.',
      stuckNote: 'Explicitly stated no blockers, which counts as a complete answer.',
    },
    {
      participant: 'Priya Nair', role: 'Client Success',
      achievement: 'YES', focus: 'YES', stuck: 'YES', score: '3/3', rating: 'Full',
      achievementNote: 'Completed onboarding calls for two new accounts.',
      focusNote: 'Starting the QBR deck today.',
      stuckNote: 'Raised a specific dependency — the MoreYeahs collections report — with the impact named.',
    },
    {
      participant: 'Dhruv Sharma', role: 'Finance',
      achievement: 'PARTIAL', focus: 'YES', stuck: 'YES', score: '2/3', rating: 'Good',
      achievementNote: 'Vague — "mostly internal reviews" references activity but no measurable achievement.',
      focusNote: 'Finance close named as the focus for today.',
      stuckNote: 'Explicitly confirmed nothing is blocking.',
    },
    {
      participant: 'Vijay Chaurasia', role: 'Chair / Senior Coach',
      achievement: 'NO', focus: 'PARTIAL', stuck: 'NO', score: '1/3', rating: 'Partial',
      achievementNote: 'Chaired the huddle but never gave his own achievement update.',
      focusNote: 'Set direction for the team but did not state a personal focus area.',
      stuckNote: 'No blocker statement given.',
    },
  ],
  blockers: [
    {
      raisedBy: 'Priya Nair', raisedFor: 'Dhruv Sharma', category: 'Finance / Collections',
      description: 'MoreYeahs collections report has not been received.',
      impact: 'Revenue number for the QBR deck cannot be confirmed.',
      requiredAction: 'Share the collections report by Wednesday, 27 August.', status: 'IN_PROGRESS',
    },
    {
      raisedBy: 'Priya Nair', raisedFor: 'Platform Team', category: 'Technical / Platform',
      description: 'Platform was unavailable for roughly 40 minutes yesterday.',
      impact: 'Team could not log KPI values for the day.',
      requiredAction: 'Raise a ticket with the platform team and track it to closure.', status: 'OPEN',
    },
    {
      raisedBy: 'Vijay Chaurasia', raisedFor: 'Leadership', category: 'Coordination',
      description: 'Daily huddle attendance has dropped to 60% against a 90% standard.',
      impact: 'Blockers surface late and decisions get delayed by a day.',
      requiredAction: 'Reinforce the attendance expectation in the weekly meeting.', status: null,
    },
  ],
  sections: [
    {
      heading: 'Meeting tone and discipline',
      body: 'The huddle held its structure — the chair moved participant to participant in a fixed order and each person was asked the same three questions. Discipline slipped only at the chair level, where no personal update was given.',
      assessment: 'Structure held; the chair did not model the format.',
    },
  ],
  scorecard: null,
  extractedItems: {
    kpis: [],
    priorities: [],
    wwws: [
      {
        who: 'Dhruv Sharma', what: 'Share the MoreYeahs collections report with Priya', when: '2026-08-27',
        confidence: 0.94, accepted: true, duplicate: null, createdRecordId: null,
        sourceQuote: 'I will share the collections report with Priya by Wednesday, 27th August',
      },
      {
        who: 'Tarun Kanti Bhattacharjee', what: 'Raise a ticket for the 40-minute platform outage and track it to closure', when: '2026-08-25',
        confidence: 0.89, accepted: true, duplicate: null, createdRecordId: null,
        sourceQuote: 'I will raise the platform downtime ticket today and follow up',
      },
      {
        who: 'Priya Nair', what: 'Publish the revised client onboarding checklist', when: '2026-08-29',
        confidence: 0.91, accepted: true, duplicate: null, createdRecordId: null,
        sourceQuote: 'I will publish the revised onboarding checklist by 29th August',
      },
      {
        who: 'Vijay Chaurasia', what: 'Reinforce the daily huddle attendance standard of 90%', when: '2026-08-28',
        confidence: 0.62, accepted: false, duplicate: null, createdRecordId: null,
        sourceQuote: 'our daily huddle attendance has slipped. We were at 60 percent last week',
      },
      {
        who: 'Priya Nair', what: 'Prepare the QBR deck for the new accounts', when: null,
        confidence: 0.55, accepted: false, createdRecordId: null,
        duplicate: { id: 'WWW-118', name: 'Prepare QBR deck — Q3 new accounts', ownerName: 'Priya Nair', when: '2026-08-30', status: 'On track', createdAt: '21 Aug 2026' },
        sourceQuote: 'Today I will start the QBR deck',
      },
    ],
  },
};

const WEEKLY_REPORT = {
  reportType: 'WEEKLY',
  title: 'Weekly Meeting Report — Week 34',
  generatedAt: '24 Aug 2026, 6:40 PM',
  model: 'Gemini 3.6 Flash',
  overallConfidence: 0.83,
  status: 'draft',
  summary: 'The weekly leadership meeting ran 6 minutes over. Dashboard completeness was strong, WWW closure sat at 73%, and the Q3 partner-enablement priority was flagged as behind schedule with a recovery plan owned by Priya Nair.',
  meetingDetails: null, attendance: null, adherence: null, blockers: null,
  sections: [
    {
      heading: 'Where the week landed',
      body: 'Revenue closed at ₹42 lakh against a ₹45 lakh target — a 93% attainment. Collections improved to 78%, up 6 points week on week. The gap is concentrated in the partner channel, which is also where the Q3 priority is behind.',
      assessment: 'Attainment is acceptable; the channel mix is the concern.',
    },
    {
      heading: 'Discipline and rhythm',
      body: 'The meeting started two minutes late and ended six minutes over. The dashboard was ready before the meeting with only two delivery KPIs missing. WWW review was thorough — eleven items walked, with owners named on each.',
      assessment: 'Preparation is strong, time boxing is not.',
    },
  ],
  scorecard: [
    { metric: 'Punctuality (start on time)', reading: 'Started 2 minutes late', rag: 'AMBER' },
    { metric: 'End-time adherence', reading: 'Ended 6 minutes over', rag: 'RED' },
    { metric: 'Dashboard quality', reading: '9 of 11 KPIs entered before the meeting', rag: 'GREEN' },
    { metric: 'WWW review', reading: '11 items reviewed, 8 complete (73%)', rag: 'AMBER' },
    { metric: 'Feedback', reading: 'Structured feedback round completed', rag: 'GREEN' },
    { metric: 'Collective intelligence', reading: 'All 5 attendees contributed to the recovery discussion', rag: 'GREEN' },
    { metric: 'OPSP review', reading: '1 of 4 Q3 priorities behind schedule', rag: 'AMBER' },
    { metric: 'Attendance', reading: '5 of 6 leaders present (83%)', rag: 'AMBER' },
  ],
  extractedItems: {
    kpis: [
      {
        name: 'Weekly revenue', description: 'Revenue booked per week', measurementUnit: 'Currency', target: 4500000,
        confidence: 0.92, accepted: true, duplicate: null, createdRecordId: null,
        sourceQuote: 'Revenue for the week landed at 42 lakh against a target of 45',
      },
      {
        name: 'Collections percentage', description: 'Share of invoiced value collected', measurementUnit: 'Percentage', target: 85,
        confidence: 0.87, accepted: true, duplicate: null, createdRecordId: null,
        sourceQuote: 'Collections improved to 78 percent',
      },
      {
        name: 'WWW closure rate', description: 'Share of WWW items closed in the week', measurementUnit: 'Percentage', target: 90,
        confidence: 0.58, accepted: false, createdRecordId: null,
        duplicate: { id: 'KPI-42', name: 'WWW completion %', ownerName: 'Sarim Khan', when: 'Target 90%', status: 'Active', createdAt: '02 Jul 2026' },
        sourceQuote: 'of the eleven items from last week, eight are complete',
      },
    ],
    priorities: [
      {
        name: 'Partner enablement recovery plan', description: 'Bring the Q3 partner-enablement priority back on schedule',
        owner: 'Priya Nair', confidence: 0.90, accepted: true, duplicate: null, createdRecordId: null,
        sourceQuote: 'our Q3 priority on partner enablement is behind schedule',
      },
      {
        name: 'Reduce client reporting turnaround', description: 'Cut the reporting pack turnaround time',
        owner: 'Tarun Kanti Bhattacharjee', confidence: 0.74, accepted: true, duplicate: null, createdRecordId: null,
        sourceQuote: 'the reporting pack is landing well with clients, but turnaround is still slow',
      },
      {
        name: 'Protect the weekly meeting end time', description: 'Hold the leadership meeting to its scheduled close',
        owner: 'Vijay Chaurasia', confidence: 0.51, accepted: false, duplicate: null, createdRecordId: null,
        sourceQuote: 'We ended six minutes over. Let us protect the end time next week',
      },
    ],
    wwws: [
      {
        who: 'Priya Nair', what: 'Publish the partner enablement recovery plan', when: '2026-09-01',
        confidence: 0.93, accepted: true, duplicate: null, createdRecordId: null,
        sourceQuote: 'I will publish the partner enablement recovery plan by 1st September',
      },
      {
        who: 'Sarim Khan', what: 'Complete the two missing delivery KPI entries for week 33', when: '2026-08-26',
        confidence: 0.81, accepted: true, duplicate: null, createdRecordId: null,
        sourceQuote: 'All KPI values for week 33 are entered except two on the delivery side',
      },
      {
        who: 'Dhruv Sharma', what: 'Break the revenue gap down by channel for next week', when: '2026-08-31',
        confidence: 0.66, accepted: false, duplicate: null, createdRecordId: null,
        sourceQuote: 'Revenue for the week landed at 42 lakh against a target of 45',
      },
    ],
  },
};

const MONTHLY_REPORT = {
  reportType: 'GENERAL',
  title: 'Monthly Report — August 2026',
  generatedAt: '25 Aug 2026, 9:02 AM',
  model: 'Gemini 3.6 Flash',
  overallConfidence: 0.79,
  status: 'published',
  summary: 'August was consolidated from 18 daily huddles and 4 weekly meetings. Meeting discipline improved through the month, while blocker resolution time remained the weakest signal at an average of 4.2 days.',
  meetingDetails: null, attendance: null, adherence: null, blockers: null,
  sections: [
    {
      heading: 'Rhythm health',
      body: 'Daily huddle attendance rose from 60% in week 31 to 88% in week 34. Weekly meetings ran on all four scheduled dates. Average huddle length settled at 31 minutes, within the 35-minute standard.',
      assessment: 'Trending in the right direction.',
    },
    {
      heading: 'Execution',
      body: 'Across the month 64 WWW items were raised and 47 closed, a 73% closure rate. Of the four Q3 priorities, three are on track and one — partner enablement — entered recovery in week 34.',
      assessment: 'Closure rate is the constraint, not volume.',
    },
    {
      heading: 'Risks carried into September',
      body: 'Collections remain below the 85% standard. Platform stability caused two logging outages in the month. Both were raised in huddles but neither has a dated owner action yet.',
      assessment: 'Two open risks need owners.',
    },
  ],
  scorecard: [
    { metric: 'Huddle attendance (month average)', reading: '76% against a 90% standard', rag: 'AMBER' },
    { metric: 'Weekly meeting cadence', reading: '4 of 4 held', rag: 'GREEN' },
    { metric: 'WWW closure rate', reading: '47 of 64 closed (73%)', rag: 'AMBER' },
    { metric: 'Blocker resolution time', reading: '4.2 days average', rag: 'RED' },
    { metric: 'OPSP priorities on track', reading: '3 of 4', rag: 'GREEN' },
  ],
  extractedItems: { kpis: [], priorities: [], wwws: [] },
};

/* The daily-huddle rollup that sits under the Weekly scope. */
const ROLLUP = {
  weekLabel: 'Week 34 · 24–30 Aug 2026',
  days: [
    { date: '2026-08-24', label: 'Mon 24', held: true, attendance: '4/6', avgScore: 6.8, blockers: 2 },
    { date: '2026-08-25', label: 'Tue 25', held: true, attendance: '4/6', avgScore: 7.3, blockers: 3 },
    { date: '2026-08-26', label: 'Wed 26', held: true, attendance: '5/6', avgScore: 8.1, blockers: 1 },
    { date: '2026-08-27', label: 'Thu 27', held: true, attendance: '5/6', avgScore: 7.9, blockers: 0 },
    { date: '2026-08-28', label: 'Fri 28', held: false, attendance: '—', avgScore: null, blockers: 0 },
  ],
  participants: [
    { name: 'Tarun Kanti Bhattacharjee', present: 4, of: 4, avg: 9.2 },
    { name: 'Priya Nair', present: 4, of: 4, avg: 8.8 },
    { name: 'Dhruv Sharma', present: 3, of: 4, avg: 7.1 },
    { name: 'Vijay Chaurasia', present: 4, of: 4, avg: 4.6 },
    { name: 'Sarim Khan', present: 2, of: 4, avg: 6.0 },
    { name: 'Anjali Verma', present: 0, of: 4, avg: null },
  ],
};

/* Transcript rows. `report` is null until the user generates one. */
const TRANSCRIPTS = [
  {
    id: 't1', scope: 'daily', clientId: 'quikit', type: 'DAILY', date: '2026-08-25',
    title: 'Leaders _ Daily Huddle (6)', duration: '35m 18s', platform: 'Google Meet',
    attendees: ['Vijay Chaurasia', 'Dhruv Sharma', 'Tarun Kanti Bhattacharjee', 'Priya Nair'],
    lines: DAILY_LINES, report: JSON.parse(JSON.stringify(DAILY_REPORT)),
  },
  {
    id: 't2', scope: 'daily', clientId: 'quikit', type: 'DAILY', date: '2026-08-25',
    title: 'Delivery Stand-up — Platform Pod', duration: '18m 04s', platform: 'Google Meet',
    attendees: ['Sarim Khan', 'Rohit Deshmukh', 'Anjali Verma'],
    lines: DAILY_LINES.slice(0, 10), report: null,
  },
  {
    id: 't3', scope: 'weekly', clientId: 'quikit', type: 'WEEKLY', date: '2026-08-24',
    title: 'Quikit _ Weekly Leadership Meeting', duration: '1h 06m', platform: 'Zoom',
    attendees: ['Vijay Chaurasia', 'Dhruv Sharma', 'Priya Nair', 'Sarim Khan', 'Tarun Kanti Bhattacharjee'],
    lines: WEEKLY_LINES, report: JSON.parse(JSON.stringify(WEEKLY_REPORT)),
  },
  {
    id: 't4', scope: 'month', clientId: 'quikit', type: 'WEEKLY', date: '2026-08-01',
    title: 'Quikit _ Monthly Business Review — August', duration: '1h 42m', platform: 'Zoom',
    attendees: ['Vijay Chaurasia', 'Dhruv Sharma', 'Priya Nair', 'Sarim Khan'],
    lines: WEEKLY_LINES, report: JSON.parse(JSON.stringify(MONTHLY_REPORT)),
  },
  {
    id: 't5', scope: 'unassigned', clientId: null, type: null, date: '2026-08-25',
    title: 'Untitled recording — 25 Aug, 11:04', duration: '24m 51s', platform: 'Google Meet',
    attendees: ['Anjali Verma', 'Unknown speaker'],
    lines: UNASSIGNED_LINES, report: null,
  },
  {
    id: 't6', scope: 'unassigned', clientId: null, type: null, date: '2026-08-23',
    title: 'Vendor sync (no client match)', duration: '31m 12s', platform: 'Teams',
    attendees: ['Rohit Deshmukh', 'Unknown speaker'],
    lines: UNASSIGNED_LINES, report: null,
  },
];
