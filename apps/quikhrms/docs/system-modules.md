# HRMS System Modules & Boundaries — QuikIT Platform

## Platform Context

- **Runtime**: Next.js App Router (monorepo)
- **Auth**: Platform JWT via `withAuth()` — provides `{ orgId, userId, roles }`
- **DB**: PostgreSQL via Prisma, single schema, `orgId` on every table
- **API Base**: `/api/hrms/`
- **Isolation**: Every query MUST include `WHERE orgId = ?` — no exceptions

---

## Module Map

```
hrms/
├── core/           → Employee, Org, Job
├── attendance/     → Shift, Clock, Leave
├── payroll/        → Salary, Payslip, Tax
├── recruitment/    → Jobs, Candidates, Pipeline
├── performance/    → Goals, Reviews, Feedback
├── workflows/      → Approvals, Notifications
├── ai/             → Resume Screen, Insights
└── reports/        → Analytics, Exports
```

---

## Module 1 — Core HR

**Boundary**: Source of truth for people and org structure. All other modules reference this module's IDs.

### Entities
| Table | Key Fields | Notes |
|---|---|---|
| `Employee` | `id, orgId, userId, code, status` | Links to platform user |
| `Department` | `id, orgId, name, parentId, headId` | Recursive (tree) |
| `JobPosition` | `id, orgId, title, level, departmentId` | Compensation band ref |
| `EmployeeJob` | `id, orgId, employeeId, positionId, startDate, endDate` | History log |
| `EmployeeDocument` | `id, orgId, employeeId, type, url` | Contracts, IDs |

### API Routes
```
POST   /api/hrms/employees
GET    /api/hrms/employees
GET    /api/hrms/employees/:id
PATCH  /api/hrms/employees/:id
DELETE /api/hrms/employees/:id      ← soft delete (deletedAt)

POST   /api/hrms/departments
GET    /api/hrms/departments/tree
PATCH  /api/hrms/departments/:id

POST   /api/hrms/positions
GET    /api/hrms/positions
```

### RBAC
| Role | Permissions |
|---|---|
| `hr_admin` | Full CRUD |
| `hr_manager` | Read all, update own dept |
| `employee` | Read own profile |

### Events Emitted
- `employee.created` → triggers onboarding workflow
- `employee.terminated` → triggers offboarding workflow

---

## Module 2 — Attendance & Time

**Boundary**: Tracks presence, shifts, and leave. Feeds into Payroll for attendance-linked pay. Does NOT calculate salary.

### Entities
| Table | Key Fields | Notes |
|---|---|---|
| `Shift` | `id, orgId, name, startTime, endTime, days[]` | Reusable templates |
| `EmployeeShift` | `id, orgId, employeeId, shiftId, effectiveDate` | Assignment log |
| `AttendanceLog` | `id, orgId, employeeId, date, checkIn, checkOut, source` | Biometric/manual |
| `LeaveType` | `id, orgId, name, maxDays, carryForward, paidType` | Configurable |
| `LeaveBalance` | `id, orgId, employeeId, leaveTypeId, year, total, used` | Per-year |
| `LeaveRequest` | `id, orgId, employeeId, leaveTypeId, from, to, status, workflowId` | Approval-linked |
| `HolidayCalendar` | `id, orgId, name, date, type` | National / custom |

### API Routes
```
POST   /api/hrms/attendance/clock-in
POST   /api/hrms/attendance/clock-out
GET    /api/hrms/attendance/:employeeId?from=&to=

POST   /api/hrms/leaves/request
GET    /api/hrms/leaves/balance/:employeeId
PATCH  /api/hrms/leaves/:id/approve       ← hr_manager only
PATCH  /api/hrms/leaves/:id/reject

POST   /api/hrms/shifts
GET    /api/hrms/shifts
POST   /api/hrms/shifts/assign

GET    /api/hrms/holidays
POST   /api/hrms/holidays
```

### RBAC
| Role | Permissions |
|---|---|
| `hr_admin` | Full CRUD, approve all leaves |
| `hr_manager` | Approve leaves for own dept |
| `employee` | Self clock, own leave requests |

### Integrations
- → **Workflow**: Leave request triggers approval chain
- → **Payroll**: `AttendanceLog` queried during payroll run for LOP calc
- → **Reports**: Attendance summary, absenteeism

---

## Module 3 — Payroll

**Boundary**: Salary computation and payslip generation. Never stores raw attendance — only receives aggregated attendance data from Attendance module.

### Entities
| Table | Key Fields | Notes |
|---|---|---|
| `SalaryStructure` | `id, orgId, name, components[]` | Template (Basic, HRA, etc.) |
| `SalaryComponent` | `id, orgId, name, type, calcType, value` | EARNING / DEDUCTION |
| `EmployeeSalary` | `id, orgId, employeeId, structureId, ctc, effectiveDate` | Assignment |
| `PayrollCycle` | `id, orgId, month, year, status, runAt` | DRAFT→PROCESSED→PAID |
| `Payslip` | `id, orgId, employeeId, cycleId, gross, deductions, net, json` | Immutable after lock |
| `TaxDeclaration` | `id, orgId, employeeId, year, regime, declarations{}` | IT declaration |

### API Routes
```
POST   /api/hrms/payroll/structures
GET    /api/hrms/payroll/structures

POST   /api/hrms/payroll/assign-salary
GET    /api/hrms/payroll/salary/:employeeId

POST   /api/hrms/payroll/cycles             ← create cycle
POST   /api/hrms/payroll/cycles/:id/run     ← compute payslips
POST   /api/hrms/payroll/cycles/:id/lock    ← freeze (no edits)
GET    /api/hrms/payroll/cycles/:id/payslips

GET    /api/hrms/payroll/payslip/:id
GET    /api/hrms/payroll/payslip/:id/pdf    ← generated PDF
```

### RBAC
| Role | Permissions |
|---|---|
| `hr_admin` | Full access, can run/lock cycles |
| `finance` | Read payslips, export |
| `employee` | Own payslip only |

### Integrations
- ← **Attendance**: Reads `AttendanceLog` aggregates for LOP
- ← **Core HR**: Employee salary structure assignment
- → **Reports**: Cost analytics, department payroll summary

---

## Module 4 — Recruitment (ATS)

**Boundary**: End-to-end hiring pipeline. Converted candidate becomes an Employee in Core HR — this is the only cross-module write.

### Entities
| Table | Key Fields | Notes |
|---|---|---|
| `JobPosting` | `id, orgId, title, departmentId, type, status, closingDate` | OPEN/CLOSED/DRAFT |
| `Candidate` | `id, orgId, name, email, phone, resumeUrl, source` | External entity |
| `Application` | `id, orgId, candidateId, jobId, stage, status` | Pipeline stage |
| `Interview` | `id, orgId, applicationId, scheduledAt, type, interviewerIds[], result` | |
| `OfferLetter` | `id, orgId, applicationId, ctc, joiningDate, status` | DRAFT/SENT/ACCEPTED |
| `ResumeScreenResult` | `id, orgId, applicationId, score, tags[], aiSummary` | AI output |

### Pipeline Stages (configurable per tenant)
```
APPLIED → SCREENED → INTERVIEW → OFFER → HIRED / REJECTED
```

### API Routes
```
POST   /api/hrms/recruitment/jobs
GET    /api/hrms/recruitment/jobs
PATCH  /api/hrms/recruitment/jobs/:id/status

POST   /api/hrms/recruitment/candidates
GET    /api/hrms/recruitment/candidates

POST   /api/hrms/recruitment/applications
PATCH  /api/hrms/recruitment/applications/:id/stage
GET    /api/hrms/recruitment/pipeline/:jobId

POST   /api/hrms/recruitment/interviews
PATCH  /api/hrms/recruitment/interviews/:id/result

POST   /api/hrms/recruitment/offers
PATCH  /api/hrms/recruitment/offers/:id/accept  ← triggers employee.created
```

### RBAC
| Role | Permissions |
|---|---|
| `hr_admin` | Full CRUD |
| `hr_recruiter` | Manage pipeline, not offers |
| `interviewer` | View own interviews, submit result |

### Integrations
- → **AI**: Resume screening on application create
- → **Core HR**: Offer accept → create Employee record
- → **Workflow**: Interview scheduling notifications

---

## Module 5 — Performance Management

**Boundary**: Periodic review cycles with goal tracking and 360 feedback. Read-only access to Core HR for org context.

### Entities
| Table | Key Fields | Notes |
|---|---|---|
| `ReviewCycle` | `id, orgId, name, type, startDate, endDate, status` | QUARTERLY/ANNUAL |
| `Goal` | `id, orgId, employeeId, cycleId, title, target, actual, status` | OKR-style |
| `PerformanceReview` | `id, orgId, revieweeId, reviewerId, cycleId, rating, comments` | Self + Manager |
| `FeedbackRequest` | `id, orgId, subjectId, requesterId, respondentId, status, response` | 360 feedback |

### API Routes
```
POST   /api/hrms/performance/cycles
PATCH  /api/hrms/performance/cycles/:id/launch

POST   /api/hrms/performance/goals
PATCH  /api/hrms/performance/goals/:id
GET    /api/hrms/performance/goals/:employeeId

POST   /api/hrms/performance/reviews
GET    /api/hrms/performance/reviews/:cycleId

POST   /api/hrms/performance/feedback/request
POST   /api/hrms/performance/feedback/respond
```

### RBAC
| Role | Permissions |
|---|---|
| `hr_admin` | Manage cycles, view all reviews |
| `hr_manager` | Review own team, view team goals |
| `employee` | Own goals, own reviews, give/receive feedback |

---

## Module 6 — Workflow Engine

**Boundary**: Generic approval and notification system. Does NOT contain domain logic — it is a router. All HRMS modules emit events consumed here.

### Entities
| Table | Key Fields | Notes |
|---|---|---|
| `WorkflowTemplate` | `id, orgId, name, trigger, steps[]` | Per-tenant configurable |
| `WorkflowInstance` | `id, orgId, templateId, entityType, entityId, status, currentStep` | Running instance |
| `WorkflowAction` | `id, orgId, instanceId, step, actorId, action, note, timestamp` | Audit log |
| `Notification` | `id, orgId, userId, type, title, body, read, channel` | IN_APP/EMAIL/SMS |

### Trigger Types
```
leave.requested         → approval chain (manager → hr)
expense.submitted       → approval chain
employee.created        → onboarding checklist
employee.terminated     → offboarding checklist
offer.accepted          → new hire onboarding
interview.scheduled     → calendar + email notification
payroll.cycle.locked    → notify finance
```

### API Routes
```
POST   /api/hrms/workflows/templates
GET    /api/hrms/workflows/templates
POST   /api/hrms/workflows/instances/:id/action   ← approve/reject/complete

GET    /api/hrms/notifications
PATCH  /api/hrms/notifications/:id/read
POST   /api/hrms/notifications/mark-all-read
```

---

## Module 7 — AI

**Boundary**: Stateless inference layer. Reads data from other modules, never writes business entities. Writes only to its own result tables (`ResumeScreenResult`, `AIInsight`).

### Capabilities
| Feature | Input | Output |
|---|---|---|
| Resume Screening | `resumeUrl + jobId` | Score, tags, summary → `ResumeScreenResult` |
| HR Analytics | Tenant aggregates | Attrition risk, headcount forecast → `AIInsight` |
| Sentiment Analysis | Review text | Sentiment score (read-only) |

### API Routes
```
POST   /api/hrms/ai/screen-resume         ← async, queued
GET    /api/hrms/ai/screen-result/:appId

POST   /api/hrms/ai/insights/generate     ← hr_admin only
GET    /api/hrms/ai/insights              ← cached results
```

### RBAC
| Role | Permissions |
|---|---|
| `hr_admin` | All AI features |
| `hr_recruiter` | Resume screening |

---

## Module 8 — Reports & Analytics

**Boundary**: Read-only aggregation layer. No writes. All queries must scope by `orgId`.

### Report Categories
| Category | Key Metrics |
|---|---|
| Workforce | Headcount, turnover rate, dept distribution |
| Attendance | Absenteeism %, LOP days, late arrivals |
| Payroll | Total cost, dept cost breakdown, YoY comparison |
| Recruitment | Time-to-hire, offer acceptance rate, source breakdown |
| Performance | Rating distribution, goal completion rate |

### API Routes
```
GET    /api/hrms/reports/workforce?from=&to=
GET    /api/hrms/reports/attendance?from=&to=&deptId=
GET    /api/hrms/reports/payroll?cycleId=
GET    /api/hrms/reports/recruitment?jobId=
GET    /api/hrms/reports/performance?cycleId=

POST   /api/hrms/reports/export           ← CSV/PDF async job
GET    /api/hrms/reports/export/:jobId    ← download
```

---

## Cross-Module Dependency Graph

```
                   ┌─────────────┐
                   │   CORE HR   │ ← Source of truth (Employee, Dept, Position)
                   └──────┬──────┘
          ┌───────────────┼───────────────┬──────────────┐
          ▼               ▼               ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ATTENDANCE│   │ PAYROLL  │   │RECRUITMENT│  │PERFORMANCE│
    └────┬─────┘   └────┬─────┘   └─────┬────┘   └─────┬────┘
         │              ▲               │               │
         └──────────────┘               │               │
         (attendance → payroll)         │               │
                   │                    │               │
                   └────────┬───────────┘               │
                            ▼                           │
                    ┌──────────────┐                    │
                    │  WORKFLOWS   │◄───────────────────┘
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │ NOTIFICATIONS│
                    └──────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
          ┌───────┐               ┌──────────┐
          │  AI   │               │ REPORTS  │
          └───────┘               └──────────┘
```

---

## Shared Rules (All Modules)

### API Handler Pattern
```typescript
// Every route handler
export const GET = withAuth(async (req, { orgId, userId, roles }) => {
  // 1. Validate input (Zod)
  // 2. Check RBAC
  // 3. Query with orgId filter
  // 4. Return { success: true, data }
});
```

### Soft Delete Convention
```typescript
// Never hard delete — always:
await prisma.employee.update({
  where: { id, orgId },
  data: { deletedAt: new Date() }
});
// All queries:
where: { orgId, deletedAt: null }
```

### Prisma Index Convention
```prisma
// Every model must have:
@@index([orgId])
@@index([orgId, deletedAt])
```

### Response Contract
```typescript
// Success
{ success: true, data: T, meta?: { total, page, limit } }

// Error
{ success: false, error: string, code?: string }
```

---

## File Structure

```
src/
├── app/
│   └── api/
│       └── hrms/
│           ├── employees/route.ts
│           ├── departments/route.ts
│           ├── attendance/
│           ├── leaves/
│           ├── payroll/
│           ├── recruitment/
│           ├── performance/
│           ├── workflows/
│           ├── ai/
│           └── reports/
├── modules/
│   └── hrms/
│       ├── core/
│       │   ├── service.ts       ← business logic
│       │   ├── schema.ts        ← Zod schemas
│       │   └── types.ts
│       ├── attendance/
│       ├── payroll/
│       ├── recruitment/
│       ├── performance/
│       ├── workflows/
│       ├── ai/
│       └── reports/
├── lib/
│   ├── auth.ts                  ← withAuth()
│   ├── prisma.ts
│   └── response.ts              ← { ok, fail } helpers
└── prisma/
    └── schema.prisma
```

---

## Build Order (Implementation Sequence)

1. **Prisma schema** — all models with orgId + indexes
2. **lib/** — `withAuth`, `response`, `prisma` client
3. **Core HR** — Employee, Department, Position CRUD
4. **Attendance** — Shift, Clock, Leave (+ Workflow trigger)
5. **Workflow Engine** — Templates + Instances
6. **Payroll** — Structures, Cycles, Payslips
7. **Recruitment** — ATS pipeline + AI screening
8. **Performance** — Cycles, Goals, Reviews
9. **AI** — Insights + Resume screening
10. **Reports** — Aggregations + Export
