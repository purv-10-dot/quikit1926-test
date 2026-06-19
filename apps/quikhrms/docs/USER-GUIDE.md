# QuikIT HRMS — User Guide

**Version 1.0 · April 2026**

---

## 1. What is QuikIT HRMS?

QuikIT HRMS = digital HR office. Manage people, hiring, leaves, payroll, performance, documents, assets — all in one browser app. No paperwork.

### Roles

| Role | Uses it for |
|---|---|
| HR Manager | Add employees, run payroll, approve leaves, compliance |
| Employee | Check-in, apply leave, view payslip, update profile |
| Manager | Approve team leaves, reviews, delegation |
| CEO | Headcount, attrition, analytics |
| IT / Admin | Settings, roles, audit logs |

### How to log in

1. Open QuikIT URL in browser
2. Click **My Space** in top blue bar
3. Use left sidebar to open any module

---

## 2. Layout

- **Top Blue Bar** → My Space / Team / Organization scope
- **Left Sidebar** → all modules
- **Content Area** → tabs, forms, tables
- Sidebar stays fixed on scroll

---

## 3. Modules

### 3.1 Dashboard (Home)
Profile card, live check-in timer, reportees, work schedule, analytics snapshot.

### 3.2 People
- Employee Directory
- Org Chart
- Bulk Import (CSV)
- Employment History

**Add employee**: People → Employee Directory → Add New → fill form → Save.

### 3.3 Onboarding
- Candidate Table
- Add Candidate (big form)
- Templates (reusable checklists)
- Task Tracker per candidate
- **Complete Onboarding** button → activates employee

### 3.4 Offboarding
- Initiate Offboarding (resignation/termination)
- Clearance per department (IT/HR/Finance/Admin)
- Exit Interview
- FnF Settlement (auto-calculated)

### 3.5 Leave Tracker
- My Data: Summary / Balance / Requests / Shift
- Team: team leaves + approvals
- Holidays: company-wide

**Apply leave**: Apply Leave button → pick type + dates + reason → Submit.

### 3.6 Time Tracker
- Time Logs (list + calendar views)
- Timesheets (weekly/monthly)
- Jobs + Projects
- Job Schedule

**Live timer**: Green Play → starts. Red Pause → creates log.

### 3.7 Attendance
- Attendance Summary (weekly grid + hours)
- Shift (weekly/monthly + assign)
- Live check-in/out

### 3.8 Payroll
- Run Payroll (auto PF/ESI/PT/TDS)
- Payslips (PDF download)
- Salary Structure
- Loans & Advances
- Reimbursements

### 3.9 Performance
- Goals (OKR/KPI)
- Reviews (appraisal cycles)
- Feedback (peer kudos)
- 1-on-1s
- PIP

### 3.10 Recruit (ATS)
- Requisitions
- Candidates
- Pipeline (Kanban)
- Interviews
- Offers

### 3.11 Documents
- Library (offer letters, policies, IDs)
- Templates (with `{{placeholder}}` auto-fill)
- My Vault (self-service)
- E-Sign requests

### 3.12 Assets
- Inventory
- Assign / Return
- My Assets
- Overdue alerts

### 3.13 Expenses
- Claims with receipt
- Policies (per-txn / monthly / yearly caps)
- Multi-level approval
- Reports

### 3.14 Compliance
- Statutory configs (PF/ESI/PT/TDS/LWF/Gratuity)
- Employee statutory info
- Tax declarations (Old/New regime)
- PF/ESI monthly reports

### 3.15 Engage
- Social Wall
- Announcements
- Surveys
- Recognition

### 3.16 Analytics
- Overview (headcount, pending items)
- Headcount (by dept, type, location)
- Attrition (rate, trend, tenure)

### 3.17 Notifications
In-app inbox. Read/unread, email + push.

### 3.18 Reports
- Query Builder
- Generated Reports (CSV/XLSX/PDF)
- Scheduled (cron)

### 3.19 Dashboards
Custom widgets. Metric, bar, line, pie, table, list, calendar.

### 3.20 Audit Log
Every create/update/delete tracked. Filter + CSV export.

### 3.21 Settings
- Company (name, logo, timezone)
- Holiday Calendar
- Approval Chains
- Notification Preferences
- Custom Fields
- Workflows

### 3.22 AI Copilot
- HR Chat (ask in English)
- Resume Screening
- Performance Insight
- Anomaly Detection
- Smart Suggestions

### 3.23 Delegations
Delegate approval authority while on vacation. Per-module, date range.

### 3.24 E-Sign + Candidate Portal
- E-Sign: send docs to multiple signers
- Candidate Portal: public link for candidates to track application

---

## 4. Common Workflows

### 🎯 New hire end-to-end
1. Recruit → Create Requisition
2. Candidate applies → Pipeline → Interview
3. Scorecard → Offer → Accept
4. Onboarding → Add Candidate
5. Tasks complete → **Complete Onboarding** → employee active

### 🏖️ Apply & approve leave
1. Employee: Apply Leave → fill form → Submit
2. Manager: Team Leaves → Pending → Approve/Reject
3. Balance auto-deducts

### 💰 Run monthly payroll
1. Payroll → Run Payroll → select month → Process
2. System computes Basic/HRA/deductions
3. Review → Approve → Lock → Generate Payslips → Pay

### 📄 Generate offer letter
1. Documents → Templates → New Template with `{{firstName}}`, `{{ctc}}`
2. Generate → fill placeholders → doc created
3. Send via E-Sign

### 💻 Asset assignment
1. Assets → Add Asset
2. Open → Assign → pick employee + return date
3. Return → condition → auto-flips status

### 💸 Expense reimbursement
1. Expenses → New Claim → policy + amount + receipt
2. Submit → approval chain → Paid
3. Reflects in payslip

---

## 5. Quick Tips

- **Filters** — funnel icon on most tables
- **3-dot menu** — Export / Import / PDF / Print
- **Save as Draft** — for unsure submissions
- **Approvals are final** — review before clicking

---

## 6. FAQ

**Forgot to check in?** Attendance → past day → Regularization request

**Wrong payslip amount?** Contact HR. Locked after processing. Supplementary run fixes it.

**Delegate during vacation?** Delegations → New → pick delegatee + date range + module.

**Where's my expense refund?** Expenses → My Claims → check status. Paid = in next payslip.

**Can employees edit profile?** Yes. Salary/department locked to HR.

**Bulk-add employees?** People → Bulk Import → CSV with firstName, lastName, workEmail, etc. Dry-run first.

---

## 7. Support

| Issue | Contact |
|---|---|
| Login / password | IT Admin |
| Leaves / attendance | HR Manager |
| Payroll / salary | Finance / Payroll Admin |
| Bug / technical | IT support ticket |

---

**That's it.** You know QuikIT HRMS now. Jump in.

*© QuikIT Technologies · Confidential*
