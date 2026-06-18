# `app_quikhrms` Schema Documentation

Structure of the **`app_quikhrms`** schema in the `quikit_dev` Neon database (QuikHRMS).
Generated from the live database catalog — structure only (no table data).

- **Tables:** 137
- **Enumerated types:** 147

## Tables

- [`Announcement`](#announcement)
- [`AppRole`](#approle)
- [`AppraisalCycle`](#appraisalcycle)
- [`ApprovalChain`](#approvalchain)
- [`Asset`](#asset)
- [`AssetAssignment`](#assetassignment)
- [`AssetScrap`](#assetscrap)
- [`AttendancePolicy`](#attendancepolicy)
- [`AttendanceRecord`](#attendancerecord)
- [`AuditLog`](#auditlog)
- [`BankReconciliation`](#bankreconciliation)
- [`BankReconciliationLine`](#bankreconciliationline)
- [`Candidate`](#candidate)
- [`CandidateDocumentRequest`](#candidatedocumentrequest)
- [`CandidateDocumentType`](#candidatedocumenttype)
- [`CandidateDocumentUpload`](#candidatedocumentupload)
- [`CandidatePortalAccess`](#candidateportalaccess)
- [`ClaimsDeclarationSettings`](#claimsdeclarationsettings)
- [`CompanyHoliday`](#companyholiday)
- [`CompanySettings`](#companysettings)
- [`ContinuousFeedback`](#continuousfeedback)
- [`Dashboard`](#dashboard)
- [`DataImport`](#dataimport)
- [`Delegation`](#delegation)
- [`Department`](#department)
- [`Designation`](#designation)
- [`Document`](#document)
- [`DocumentAcknowledgment`](#documentacknowledgment)
- [`DocumentShare`](#documentshare)
- [`Donation`](#donation)
- [`EPFConfig`](#epfconfig)
- [`ESIConfig`](#esiconfig)
- [`ESignRequest`](#esignrequest)
- [`EmailTemplate`](#emailtemplate)
- [`Employee`](#employee)
- [`EmployeeAppraisal`](#employeeappraisal)
- [`EmployeeKraAssignment`](#employeekraassignment)
- [`EmployeeLoan`](#employeeloan)
- [`EmployeeProvision`](#employeeprovision)
- [`EmployeeSalary`](#employeesalary)
- [`EmploymentHistory`](#employmenthistory)
- [`ExpenseApproval`](#expenseapproval)
- [`ExpenseClaim`](#expenseclaim)
- [`ExpensePolicy`](#expensepolicy)
- [`Form12BBDeclaration`](#form12bbdeclaration)
- [`FullAndFinalSettlement`](#fullandfinalsettlement)
- [`Goal`](#goal)
- [`GoalCheckIn`](#goalcheckin)
- [`Grade`](#grade)
- [`GratuityRecord`](#gratuityrecord)
- [`HiringPipeline`](#hiringpipeline)
- [`Interview`](#interview)
- [`InvestmentProof`](#investmentproof)
- [`Invitation`](#invitation)
- [`JobApplication`](#jobapplication)
- [`JobRequisition`](#jobrequisition)
- [`JobScheduleEntry`](#jobscheduleentry)
- [`KeyResult`](#keyresult)
- [`KraScorecard`](#krascorecard)
- [`KraTemplateEntry`](#kratemplateentry)
- [`LWFConfig`](#lwfconfig)
- [`LeaveApproval`](#leaveapproval)
- [`LeaveBalance`](#leavebalance)
- [`LeaveGroup`](#leavegroup)
- [`LeaveGroupAssignment`](#leavegroupassignment)
- [`LeaveGroupItem`](#leavegroupitem)
- [`LeavePolicy`](#leavepolicy)
- [`LeaveRequest`](#leaverequest)
- [`LeaveType`](#leavetype)
- [`LegalEntity`](#legalentity)
- [`LoanRepayment`](#loanrepayment)
- [`Notification`](#notification)
- [`OffboardingInstance`](#offboardinginstance)
- [`OffboardingTask`](#offboardingtask)
- [`OfficeLocation`](#officelocation)
- [`OnboardingInstance`](#onboardinginstance)
- [`OnboardingTask`](#onboardingtask)
- [`OnboardingTemplate`](#onboardingtemplate)
- [`OneTimeEarning`](#onetimeearning)
- [`OneTimeStatutoryDefault`](#onetimestatutorydefault)
- [`PIP`](#pip)
- [`PayRun`](#payrun)
- [`PayRunAdjustment`](#payrunadjustment)
- [`PayRunApproval`](#payrunapproval)
- [`PaySchedule`](#payschedule)
- [`PayrollSettings`](#payrollsettings)
- [`PayrollTaxDetails`](#payrolltaxdetails)
- [`Payslip`](#payslip)
- [`PayslipLine`](#payslipline)
- [`PostComment`](#postcomment)
- [`PriorPayroll`](#priorpayroll)
- [`PriorPayrollRecord`](#priorpayrollrecord)
- [`ProfessionalTaxConfig`](#professionaltaxconfig)
- [`ProvisionItem`](#provisionitem)
- [`Recognition`](#recognition)
- [`ReimbursementClaim`](#reimbursementclaim)
- [`Report`](#report)
- [`RequisitionApproval`](#requisitionapproval)
- [`ReviewForm`](#reviewform)
- [`RoleNavigation`](#rolenavigation)
- [`RolePermission`](#rolepermission)
- [`Roster`](#roster)
- [`RosterEntry`](#rosterentry)
- [`SalaryComponent`](#salarycomponent)
- [`SalaryRevision`](#salaryrevision)
- [`SalaryStructure`](#salarystructure)
- [`SalaryStructureComponent`](#salarystructurecomponent)
- [`ShiftAssignment`](#shiftassignment)
- [`ShiftPolicy`](#shiftpolicy)
- [`SocialPost`](#socialpost)
- [`StateMinimumWage`](#stateminimumwage)
- [`StatutoryBonusConfig`](#statutorybonusconfig)
- [`Survey`](#survey)
- [`SurveyResponse`](#surveyresponse)
- [`Task`](#task)
- [`TaskActivity`](#taskactivity)
- [`TaskList`](#tasklist)
- [`TdsChallan`](#tdschallan)
- [`TdsChallanAllocation`](#tdschallanallocation)
- [`TdsLiabilityPeriod`](#tdsliabilityperiod)
- [`TdsOverride`](#tdsoverride)
- [`Team`](#team)
- [`Ticket`](#ticket)
- [`TicketActivity`](#ticketactivity)
- [`TicketAttachment`](#ticketattachment)
- [`TicketCategory`](#ticketcategory)
- [`TicketComment`](#ticketcomment)
- [`TimeJob`](#timejob)
- [`TimeLog`](#timelog)
- [`TimeProject`](#timeproject)
- [`Timesheet`](#timesheet)
- [`UserAppRole`](#userapprole)
- [`UserPermissionExtra`](#userpermissionextra)
- [`WfhApproval`](#wfhapproval)
- [`WfhQuotaGroup`](#wfhquotagroup)
- [`WfhRequest`](#wfhrequest)
- [`_prisma_migrations`](#_prisma_migrations)

---

### Announcement

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `title` | `text` | NOT NULL |  |
| 4 | `content` | `text` | NOT NULL |  |
| 5 | `authorId` | `text` | NOT NULL |  |
| 6 | `attachments` | `jsonb` | NULL |  |
| 7 | `visibility` | `app_quikhrms."PostVisibility"` | NOT NULL | `'Organization'::app_quikhrms."PostVisibility"` |
| 8 | `targetDepartments` | `jsonb` | NULL |  |
| 9 | `targetLocations` | `jsonb` | NULL |  |
| 10 | `isPinned` | `boolean` | NOT NULL | `false` |
| 11 | `publishedAt` | `timestamp(3) without time zone` | NULL |  |
| 12 | `expiresAt` | `timestamp(3) without time zone` | NULL |  |
| 13 | `approvalStatus` | `app_quikhrms."ContentApprovalStatus"` | NOT NULL | `'Approved'::app_quikhrms."ContentApprovalStatus"` |
| 14 | `approvedById` | `text` | NULL |  |
| 15 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 16 | `rejectionReason` | `text` | NULL |  |
| 17 | `createdBy` | `text` | NULL |  |
| 18 | `updatedBy` | `text` | NULL |  |
| 19 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 20 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 21 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Announcement_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Announcement_authorId_fkey`: FOREIGN KEY ("authorId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `Announcement_orgId_approvalStatus_idx`: `CREATE INDEX "Announcement_orgId_approvalStatus_idx" ON app_quikhrms."Announcement" USING btree ("orgId", "approvalStatus")`
- `Announcement_orgId_deletedAt_idx`: `CREATE INDEX "Announcement_orgId_deletedAt_idx" ON app_quikhrms."Announcement" USING btree ("orgId", "deletedAt")`
- `Announcement_orgId_idx`: `CREATE INDEX "Announcement_orgId_idx" ON app_quikhrms."Announcement" USING btree ("orgId")`
- `Announcement_pkey`: `CREATE UNIQUE INDEX "Announcement_pkey" ON app_quikhrms."Announcement" USING btree (id)`

---

### AppRole

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `appId` | `text` | NOT NULL |  |
| 4 | `name` | `text` | NOT NULL |  |
| 5 | `description` | `text` | NULL |  |
| 6 | `isSystem` | `boolean` | NOT NULL | `false` |
| 7 | `isDefault` | `boolean` | NOT NULL | `false` |
| 8 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 9 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 10 | `createdBy` | `text` | NULL |  |

**Primary Key**

- `AppRole_pkey`: PRIMARY KEY (id)

**Indexes**

- `AppRole_orgId_appId_idx`: `CREATE INDEX "AppRole_orgId_appId_idx" ON app_quikhrms."AppRole" USING btree ("orgId", "appId")`
- `AppRole_orgId_appId_name_key`: `CREATE UNIQUE INDEX "AppRole_orgId_appId_name_key" ON app_quikhrms."AppRole" USING btree ("orgId", "appId", name)`
- `AppRole_pkey`: `CREATE UNIQUE INDEX "AppRole_pkey" ON app_quikhrms."AppRole" USING btree (id)`

---

### AppraisalCycle

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `type` | `app_quikhrms."AppraisalCycleType"` | NOT NULL | `'Annual'::app_quikhrms."AppraisalCycleType"` |
| 5 | `startDate` | `date` | NOT NULL |  |
| 6 | `endDate` | `date` | NOT NULL |  |
| 7 | `status` | `app_quikhrms."AppraisalCycleStatus"` | NOT NULL | `'Setup'::app_quikhrms."AppraisalCycleStatus"` |
| 8 | `reviewFormId` | `text` | NULL |  |
| 9 | `applicableTo` | `jsonb` | NULL |  |
| 10 | `stages` | `jsonb` | NULL |  |
| 11 | `createdBy` | `text` | NULL |  |
| 12 | `updatedBy` | `text` | NULL |  |
| 13 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 14 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 15 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `AppraisalCycle_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `AppraisalCycle_reviewFormId_fkey`: FOREIGN KEY ("reviewFormId") REFERENCES app_quikhrms."AppraisalCycle"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `AppraisalCycle_orgId_deletedAt_idx`: `CREATE INDEX "AppraisalCycle_orgId_deletedAt_idx" ON app_quikhrms."AppraisalCycle" USING btree ("orgId", "deletedAt")`
- `AppraisalCycle_orgId_idx`: `CREATE INDEX "AppraisalCycle_orgId_idx" ON app_quikhrms."AppraisalCycle" USING btree ("orgId")`
- `AppraisalCycle_pkey`: `CREATE UNIQUE INDEX "AppraisalCycle_pkey" ON app_quikhrms."AppraisalCycle" USING btree (id)`

---

### ApprovalChain

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `module` | `app_quikhrms."ApprovalModule"` | NOT NULL |  |
| 5 | `levels` | `jsonb` | NOT NULL |  |
| 6 | `autoApproveAfterDays` | `integer` | NULL |  |
| 7 | `isActive` | `boolean` | NOT NULL | `true` |
| 8 | `createdBy` | `text` | NULL |  |
| 9 | `updatedBy` | `text` | NULL |  |
| 10 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 11 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 12 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `ApprovalChain_pkey`: PRIMARY KEY (id)

**Indexes**

- `ApprovalChain_orgId_deletedAt_idx`: `CREATE INDEX "ApprovalChain_orgId_deletedAt_idx" ON app_quikhrms."ApprovalChain" USING btree ("orgId", "deletedAt")`
- `ApprovalChain_orgId_idx`: `CREATE INDEX "ApprovalChain_orgId_idx" ON app_quikhrms."ApprovalChain" USING btree ("orgId")`
- `ApprovalChain_orgId_module_idx`: `CREATE INDEX "ApprovalChain_orgId_module_idx" ON app_quikhrms."ApprovalChain" USING btree ("orgId", module)`
- `ApprovalChain_pkey`: `CREATE UNIQUE INDEX "ApprovalChain_pkey" ON app_quikhrms."ApprovalChain" USING btree (id)`

---

### Asset

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `assetCode` | `text` | NOT NULL |  |
| 4 | `name` | `text` | NOT NULL |  |
| 5 | `category` | `text` | NOT NULL | `'AssetOther'::text` |
| 6 | `quantity` | `integer` | NOT NULL | `1` |
| 7 | `serialNumber` | `text` | NULL |  |
| 8 | `brand` | `text` | NULL |  |
| 9 | `model` | `text` | NULL |  |
| 10 | `purchaseDate` | `date` | NULL |  |
| 11 | `purchasePrice` | `numeric(15,2)` | NULL |  |
| 12 | `warrantyExpiry` | `date` | NULL |  |
| 13 | `status` | `app_quikhrms."AssetStatus"` | NOT NULL | `'Available'::app_quikhrms."AssetStatus"` |
| 14 | `condition` | `app_quikhrms."AssetCondition"` | NOT NULL | `'New'::app_quikhrms."AssetCondition"` |
| 15 | `location` | `text` | NULL |  |
| 16 | `specs` | `jsonb` | NULL |  |
| 17 | `notes` | `text` | NULL |  |
| 18 | `disposalDate` | `date` | NULL |  |
| 19 | `disposalReason` | `text` | NULL |  |
| 20 | `scrapValue` | `numeric(15,2)` | NULL |  |
| 21 | `scrappedBy` | `text` | NULL |  |
| 22 | `createdBy` | `text` | NULL |  |
| 23 | `updatedBy` | `text` | NULL |  |
| 24 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 25 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 26 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Asset_pkey`: PRIMARY KEY (id)

**Indexes**

- `Asset_orgId_assetCode_key`: `CREATE UNIQUE INDEX "Asset_orgId_assetCode_key" ON app_quikhrms."Asset" USING btree ("orgId", "assetCode")`
- `Asset_orgId_category_idx`: `CREATE INDEX "Asset_orgId_category_idx" ON app_quikhrms."Asset" USING btree ("orgId", category)`
- `Asset_orgId_deletedAt_idx`: `CREATE INDEX "Asset_orgId_deletedAt_idx" ON app_quikhrms."Asset" USING btree ("orgId", "deletedAt")`
- `Asset_orgId_idx`: `CREATE INDEX "Asset_orgId_idx" ON app_quikhrms."Asset" USING btree ("orgId")`
- `Asset_orgId_serialNumber_idx`: `CREATE INDEX "Asset_orgId_serialNumber_idx" ON app_quikhrms."Asset" USING btree ("orgId", "serialNumber")`
- `Asset_orgId_status_idx`: `CREATE INDEX "Asset_orgId_status_idx" ON app_quikhrms."Asset" USING btree ("orgId", status)`
- `Asset_pkey`: `CREATE UNIQUE INDEX "Asset_pkey" ON app_quikhrms."Asset" USING btree (id)`

---

### AssetAssignment

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `assetId` | `text` | NOT NULL |  |
| 4 | `employeeId` | `text` | NOT NULL |  |
| 5 | `assignedBy` | `text` | NOT NULL |  |
| 6 | `assignedAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 7 | `expectedReturnDate` | `date` | NULL |  |
| 8 | `returnedAt` | `timestamp(3) without time zone` | NULL |  |
| 9 | `returnedTo` | `text` | NULL |  |
| 10 | `returnCondition` | `app_quikhrms."AssetCondition"` | NULL |  |
| 11 | `status` | `app_quikhrms."AssetAssignmentStatus"` | NOT NULL | `'AssignmentActive'::app_quikhrms."AssetAssignmentStatus"` |
| 12 | `notes` | `text` | NULL |  |
| 13 | `createdBy` | `text` | NULL |  |
| 14 | `updatedBy` | `text` | NULL |  |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 17 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `AssetAssignment_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `AssetAssignment_assetId_fkey`: FOREIGN KEY ("assetId") REFERENCES app_quikhrms."Asset"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `AssetAssignment_orgId_assetId_idx`: `CREATE INDEX "AssetAssignment_orgId_assetId_idx" ON app_quikhrms."AssetAssignment" USING btree ("orgId", "assetId")`
- `AssetAssignment_orgId_deletedAt_idx`: `CREATE INDEX "AssetAssignment_orgId_deletedAt_idx" ON app_quikhrms."AssetAssignment" USING btree ("orgId", "deletedAt")`
- `AssetAssignment_orgId_employeeId_idx`: `CREATE INDEX "AssetAssignment_orgId_employeeId_idx" ON app_quikhrms."AssetAssignment" USING btree ("orgId", "employeeId")`
- `AssetAssignment_orgId_idx`: `CREATE INDEX "AssetAssignment_orgId_idx" ON app_quikhrms."AssetAssignment" USING btree ("orgId")`
- `AssetAssignment_orgId_status_idx`: `CREATE INDEX "AssetAssignment_orgId_status_idx" ON app_quikhrms."AssetAssignment" USING btree ("orgId", status)`
- `AssetAssignment_pkey`: `CREATE UNIQUE INDEX "AssetAssignment_pkey" ON app_quikhrms."AssetAssignment" USING btree (id)`

---

### AssetScrap

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `assetId` | `text` | NOT NULL |  |
| 4 | `quantity` | `integer` | NOT NULL |  |
| 5 | `reason` | `text` | NOT NULL |  |
| 6 | `scrapDate` | `date` | NOT NULL |  |
| 7 | `scrapValue` | `numeric(15,2)` | NULL |  |
| 8 | `markedLost` | `boolean` | NOT NULL | `false` |
| 9 | `scrappedBy` | `text` | NOT NULL |  |
| 10 | `notes` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `AssetScrap_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `AssetScrap_assetId_fkey`: FOREIGN KEY ("assetId") REFERENCES app_quikhrms."Asset"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `AssetScrap_orgId_assetId_idx`: `CREATE INDEX "AssetScrap_orgId_assetId_idx" ON app_quikhrms."AssetScrap" USING btree ("orgId", "assetId")`
- `AssetScrap_orgId_idx`: `CREATE INDEX "AssetScrap_orgId_idx" ON app_quikhrms."AssetScrap" USING btree ("orgId")`
- `AssetScrap_orgId_scrapDate_idx`: `CREATE INDEX "AssetScrap_orgId_scrapDate_idx" ON app_quikhrms."AssetScrap" USING btree ("orgId", "scrapDate")`
- `AssetScrap_pkey`: `CREATE UNIQUE INDEX "AssetScrap_pkey" ON app_quikhrms."AssetScrap" USING btree (id)`

---

### AttendancePolicy

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `applicableTo` | `jsonb` | NULL |  |
| 5 | `graceMinutes` | `integer` | NOT NULL | `15` |
| 6 | `halfDayThresholdHours` | `numeric(4,2)` | NOT NULL | `4` |
| 7 | `fullDayThresholdHours` | `numeric(4,2)` | NOT NULL | `8` |
| 8 | `minHoursForOvertime` | `numeric(4,2)` | NOT NULL | `9` |
| 9 | `ipWhitelist` | `jsonb` | NULL |  |
| 10 | `geoFenceRadius` | `integer` | NULL |  |
| 11 | `geoFenceCoordinates` | `jsonb` | NULL |  |
| 12 | `allowWebCheckin` | `boolean` | NOT NULL | `true` |
| 13 | `allowMobileCheckin` | `boolean` | NOT NULL | `true` |
| 14 | `requireLocationForMobile` | `boolean` | NOT NULL | `false` |
| 15 | `latePenalization` | `jsonb` | NULL |  |
| 16 | `absentPenalization` | `jsonb` | NULL |  |
| 17 | `allowRegularization` | `boolean` | NOT NULL | `true` |
| 18 | `regularizationApprovalLevels` | `integer` | NOT NULL | `1` |
| 19 | `maxRegularizationsPerMonth` | `integer` | NOT NULL | `3` |
| 20 | `isDefault` | `boolean` | NOT NULL | `false` |
| 21 | `createdBy` | `text` | NULL |  |
| 22 | `updatedBy` | `text` | NULL |  |
| 23 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 24 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 25 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `AttendancePolicy_pkey`: PRIMARY KEY (id)

**Indexes**

- `AttendancePolicy_orgId_deletedAt_idx`: `CREATE INDEX "AttendancePolicy_orgId_deletedAt_idx" ON app_quikhrms."AttendancePolicy" USING btree ("orgId", "deletedAt")`
- `AttendancePolicy_orgId_idx`: `CREATE INDEX "AttendancePolicy_orgId_idx" ON app_quikhrms."AttendancePolicy" USING btree ("orgId")`
- `AttendancePolicy_pkey`: `CREATE UNIQUE INDEX "AttendancePolicy_pkey" ON app_quikhrms."AttendancePolicy" USING btree (id)`

---

### AttendanceRecord

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `date` | `date` | NOT NULL |  |
| 5 | `checkIn` | `timestamp(3) without time zone` | NULL |  |
| 6 | `checkOut` | `timestamp(3) without time zone` | NULL |  |
| 7 | `punches` | `jsonb` | NULL |  |
| 8 | `effectiveHours` | `numeric(5,2)` | NULL |  |
| 9 | `grossHours` | `numeric(5,2)` | NULL |  |
| 10 | `breakDuration` | `numeric(5,2)` | NULL |  |
| 11 | `overtime` | `numeric(5,2)` | NULL |  |
| 12 | `status` | `app_quikhrms."AttendanceStatus"` | NOT NULL | `'NotMarked'::app_quikhrms."AttendanceStatus"` |
| 13 | `source` | `app_quikhrms."AttendanceSource"` | NULL |  |
| 14 | `checkInLocation` | `jsonb` | NULL |  |
| 15 | `checkOutLocation` | `jsonb` | NULL |  |
| 16 | `ipAddress` | `text` | NULL |  |
| 17 | `regularizationStatus` | `app_quikhrms."RegularizationStatus"` | NOT NULL | `'None'::app_quikhrms."RegularizationStatus"` |
| 18 | `regularizationReason` | `text` | NULL |  |
| 19 | `remarks` | `text` | NULL |  |
| 20 | `isLateCheckIn` | `boolean` | NOT NULL | `false` |
| 21 | `isEarlyCheckOut` | `boolean` | NOT NULL | `false` |
| 22 | `lateByMinutes` | `integer` | NOT NULL | `0` |
| 23 | `earlyByMinutes` | `integer` | NOT NULL | `0` |
| 24 | `createdBy` | `text` | NULL |  |
| 25 | `updatedBy` | `text` | NULL |  |
| 26 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 27 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 28 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `AttendanceRecord_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `AttendanceRecord_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `AttendanceRecord_orgId_date_idx`: `CREATE INDEX "AttendanceRecord_orgId_date_idx" ON app_quikhrms."AttendanceRecord" USING btree ("orgId", date)`
- `AttendanceRecord_orgId_deletedAt_idx`: `CREATE INDEX "AttendanceRecord_orgId_deletedAt_idx" ON app_quikhrms."AttendanceRecord" USING btree ("orgId", "deletedAt")`
- `AttendanceRecord_orgId_employeeId_date_idx`: `CREATE INDEX "AttendanceRecord_orgId_employeeId_date_idx" ON app_quikhrms."AttendanceRecord" USING btree ("orgId", "employeeId", date)`
- `AttendanceRecord_orgId_employeeId_date_key`: `CREATE UNIQUE INDEX "AttendanceRecord_orgId_employeeId_date_key" ON app_quikhrms."AttendanceRecord" USING btree ("orgId", "employeeId", date)`
- `AttendanceRecord_orgId_employeeId_idx`: `CREATE INDEX "AttendanceRecord_orgId_employeeId_idx" ON app_quikhrms."AttendanceRecord" USING btree ("orgId", "employeeId")`
- `AttendanceRecord_orgId_idx`: `CREATE INDEX "AttendanceRecord_orgId_idx" ON app_quikhrms."AttendanceRecord" USING btree ("orgId")`
- `AttendanceRecord_pkey`: `CREATE UNIQUE INDEX "AttendanceRecord_pkey" ON app_quikhrms."AttendanceRecord" USING btree (id)`

---

### AuditLog

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `userId` | `text` | NOT NULL |  |
| 4 | `action` | `app_quikhrms."AuditAction"` | NOT NULL |  |
| 5 | `entityType` | `text` | NOT NULL |  |
| 6 | `entityId` | `text` | NULL |  |
| 7 | `changes` | `jsonb` | NULL |  |
| 8 | `metadata` | `jsonb` | NULL |  |
| 9 | `ipAddress` | `text` | NULL |  |
| 10 | `userAgent` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `AuditLog_pkey`: PRIMARY KEY (id)

**Indexes**

- `AuditLog_orgId_createdAt_idx`: `CREATE INDEX "AuditLog_orgId_createdAt_idx" ON app_quikhrms."AuditLog" USING btree ("orgId", "createdAt")`
- `AuditLog_orgId_entityType_entityId_idx`: `CREATE INDEX "AuditLog_orgId_entityType_entityId_idx" ON app_quikhrms."AuditLog" USING btree ("orgId", "entityType", "entityId")`
- `AuditLog_orgId_entityType_idx`: `CREATE INDEX "AuditLog_orgId_entityType_idx" ON app_quikhrms."AuditLog" USING btree ("orgId", "entityType")`
- `AuditLog_orgId_idx`: `CREATE INDEX "AuditLog_orgId_idx" ON app_quikhrms."AuditLog" USING btree ("orgId")`
- `AuditLog_orgId_userId_idx`: `CREATE INDEX "AuditLog_orgId_userId_idx" ON app_quikhrms."AuditLog" USING btree ("orgId", "userId")`
- `AuditLog_pkey`: `CREATE UNIQUE INDEX "AuditLog_pkey" ON app_quikhrms."AuditLog" USING btree (id)`

---

### BankReconciliation

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `payRunId` | `text` | NOT NULL |  |
| 4 | `uploadedBy` | `text` | NOT NULL |  |
| 5 | `uploadedAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 6 | `fileName` | `text` | NULL |  |
| 7 | `totalDebited` | `numeric(15,2)` | NOT NULL | `0` |
| 8 | `totalMatched` | `numeric(15,2)` | NOT NULL | `0` |
| 9 | `matchedCount` | `integer` | NOT NULL | `0` |
| 10 | `unmatchedCount` | `integer` | NOT NULL | `0` |
| 11 | `status` | `app_quikhrms."BankReconciliationStatus"` | NOT NULL | `'Pending'::app_quikhrms."BankReconciliationStatus"` |
| 12 | `notes` | `text` | NULL |  |
| 13 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 14 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 15 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `BankReconciliation_pkey`: PRIMARY KEY (id)

**Indexes**

- `BankReconciliation_orgId_idx`: `CREATE INDEX "BankReconciliation_orgId_idx" ON app_quikhrms."BankReconciliation" USING btree ("orgId")`
- `BankReconciliation_orgId_payRunId_idx`: `CREATE INDEX "BankReconciliation_orgId_payRunId_idx" ON app_quikhrms."BankReconciliation" USING btree ("orgId", "payRunId")`
- `BankReconciliation_pkey`: `CREATE UNIQUE INDEX "BankReconciliation_pkey" ON app_quikhrms."BankReconciliation" USING btree (id)`

---

### BankReconciliationLine

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `reconciliationId` | `text` | NOT NULL |  |
| 4 | `payslipId` | `text` | NULL |  |
| 5 | `employeeName` | `text` | NOT NULL |  |
| 6 | `bankAccount` | `text` | NULL |  |
| 7 | `ifsc` | `text` | NULL |  |
| 8 | `amount` | `numeric(15,2)` | NOT NULL |  |
| 9 | `txnDate` | `date` | NULL |  |
| 10 | `txnRef` | `text` | NULL |  |
| 11 | `matched` | `boolean` | NOT NULL | `false` |
| 12 | `matchReason` | `text` | NULL |  |
| 13 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `BankReconciliationLine_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `BankReconciliationLine_reconciliationId_fkey`: FOREIGN KEY ("reconciliationId") REFERENCES app_quikhrms."BankReconciliation"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `BankReconciliationLine_orgId_idx`: `CREATE INDEX "BankReconciliationLine_orgId_idx" ON app_quikhrms."BankReconciliationLine" USING btree ("orgId")`
- `BankReconciliationLine_pkey`: `CREATE UNIQUE INDEX "BankReconciliationLine_pkey" ON app_quikhrms."BankReconciliationLine" USING btree (id)`
- `BankReconciliationLine_reconciliationId_idx`: `CREATE INDEX "BankReconciliationLine_reconciliationId_idx" ON app_quikhrms."BankReconciliationLine" USING btree ("reconciliationId")`

---

### Candidate

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `firstName` | `text` | NOT NULL |  |
| 4 | `lastName` | `text` | NOT NULL |  |
| 5 | `email` | `text` | NOT NULL |  |
| 6 | `phone` | `text` | NULL |  |
| 7 | `resumeUrl` | `text` | NULL |  |
| 8 | `parsedResume` | `jsonb` | NULL |  |
| 9 | `currentCompany` | `text` | NULL |  |
| 10 | `currentDesignation` | `text` | NULL |  |
| 11 | `currentCTC` | `numeric(15,2)` | NULL |  |
| 12 | `expectedCTC` | `numeric(15,2)` | NULL |  |
| 13 | `noticePeriod` | `integer` | NULL |  |
| 14 | `totalExperience` | `integer` | NULL |  |
| 15 | `skills` | `jsonb` | NULL |  |
| 16 | `education` | `jsonb` | NULL |  |
| 17 | `linkedinUrl` | `text` | NULL |  |
| 18 | `portfolioUrl` | `text` | NULL |  |
| 19 | `source` | `app_quikhrms."CandidateSource"` | NOT NULL | `'CandDirect'::app_quikhrms."CandidateSource"` |
| 20 | `referredById` | `text` | NULL |  |
| 21 | `location` | `text` | NULL |  |
| 22 | `willingToRelocate` | `boolean` | NOT NULL | `false` |
| 23 | `tags` | `jsonb` | NULL |  |
| 24 | `rating` | `numeric(3,1)` | NULL |  |
| 25 | `status` | `app_quikhrms."CandidateStatus"` | NOT NULL | `'New'::app_quikhrms."CandidateStatus"` |
| 26 | `doNotContact` | `boolean` | NOT NULL | `false` |
| 27 | `gdprConsent` | `boolean` | NOT NULL | `false` |
| 28 | `isBlacklisted` | `boolean` | NOT NULL | `false` |
| 29 | `blacklistReason` | `text` | NULL |  |
| 30 | `blacklistedAt` | `timestamp(3) without time zone` | NULL |  |
| 31 | `blacklistedBy` | `text` | NULL |  |
| 32 | `blacklistedUntil` | `timestamp(3) without time zone` | NULL |  |
| 33 | `isArchived` | `boolean` | NOT NULL | `false` |
| 34 | `archiveReason` | `text` | NULL |  |
| 35 | `archivedAt` | `timestamp(3) without time zone` | NULL |  |
| 36 | `archivedBy` | `text` | NULL |  |
| 37 | `createdBy` | `text` | NULL |  |
| 38 | `updatedBy` | `text` | NULL |  |
| 39 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 40 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 41 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Candidate_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Candidate_referredById_fkey`: FOREIGN KEY ("referredById") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `Candidate_orgId_createdAt_idx`: `CREATE INDEX "Candidate_orgId_createdAt_idx" ON app_quikhrms."Candidate" USING btree ("orgId", "createdAt" DESC)`
- `Candidate_orgId_deletedAt_idx`: `CREATE INDEX "Candidate_orgId_deletedAt_idx" ON app_quikhrms."Candidate" USING btree ("orgId", "deletedAt")`
- `Candidate_orgId_deletedAt_isBlacklisted_isArchived_status_idx`: `CREATE INDEX "Candidate_orgId_deletedAt_isBlacklisted_isArchived_status_idx" ON app_quikhrms."Candidate" USING btree ("orgId", "deletedAt", "isBlacklisted", "isArchived", status)`
- `Candidate_orgId_email_key`: `CREATE UNIQUE INDEX "Candidate_orgId_email_key" ON app_quikhrms."Candidate" USING btree ("orgId", email)`
- `Candidate_orgId_idx`: `CREATE INDEX "Candidate_orgId_idx" ON app_quikhrms."Candidate" USING btree ("orgId")`
- `Candidate_orgId_isArchived_idx`: `CREATE INDEX "Candidate_orgId_isArchived_idx" ON app_quikhrms."Candidate" USING btree ("orgId", "isArchived")`
- `Candidate_orgId_isBlacklisted_idx`: `CREATE INDEX "Candidate_orgId_isBlacklisted_idx" ON app_quikhrms."Candidate" USING btree ("orgId", "isBlacklisted")`
- `Candidate_orgId_status_idx`: `CREATE INDEX "Candidate_orgId_status_idx" ON app_quikhrms."Candidate" USING btree ("orgId", status)`
- `Candidate_pkey`: `CREATE UNIQUE INDEX "Candidate_pkey" ON app_quikhrms."Candidate" USING btree (id)`

---

### CandidateDocumentRequest

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `applicationId` | `text` | NOT NULL |  |
| 4 | `bundle` | `app_quikhrms."DocumentBundle"` | NOT NULL |  |
| 5 | `status` | `app_quikhrms."CandidateDocRequestStatus"` | NOT NULL | `'Pending'::app_quikhrms."CandidateDocRequestStatus"` |
| 6 | `token` | `text` | NOT NULL |  |
| 7 | `tokenExpiresAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 8 | `requestSentAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 9 | `submittedAt` | `timestamp(3) without time zone` | NULL |  |
| 10 | `completedAt` | `timestamp(3) without time zone` | NULL |  |
| 11 | `lastReminderAt` | `timestamp(3) without time zone` | NULL |  |
| 12 | `reminderCount` | `integer` | NOT NULL | `0` |
| 13 | `selectedDocTypeIds` | `jsonb` | NULL |  |
| 14 | `createdBy` | `text` | NULL |  |
| 15 | `updatedBy` | `text` | NULL |  |
| 16 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 17 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 18 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `CandidateDocumentRequest_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `CandidateDocumentRequest_applicationId_fkey`: FOREIGN KEY ("applicationId") REFERENCES app_quikhrms."JobApplication"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `CandidateDocumentRequest_orgId_applicationId_bundle_key`: `CREATE UNIQUE INDEX "CandidateDocumentRequest_orgId_applicationId_bundle_key" ON app_quikhrms."CandidateDocumentRequest" USING btree ("orgId", "applicationId", bundle)`
- `CandidateDocumentRequest_orgId_applicationId_idx`: `CREATE INDEX "CandidateDocumentRequest_orgId_applicationId_idx" ON app_quikhrms."CandidateDocumentRequest" USING btree ("orgId", "applicationId")`
- `CandidateDocumentRequest_orgId_idx`: `CREATE INDEX "CandidateDocumentRequest_orgId_idx" ON app_quikhrms."CandidateDocumentRequest" USING btree ("orgId")`
- `CandidateDocumentRequest_orgId_status_idx`: `CREATE INDEX "CandidateDocumentRequest_orgId_status_idx" ON app_quikhrms."CandidateDocumentRequest" USING btree ("orgId", status)`
- `CandidateDocumentRequest_pkey`: `CREATE UNIQUE INDEX "CandidateDocumentRequest_pkey" ON app_quikhrms."CandidateDocumentRequest" USING btree (id)`
- `CandidateDocumentRequest_token_key`: `CREATE UNIQUE INDEX "CandidateDocumentRequest_token_key" ON app_quikhrms."CandidateDocumentRequest" USING btree (token)`

---

### CandidateDocumentType

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `code` | `text` | NOT NULL |  |
| 5 | `bundle` | `app_quikhrms."DocumentBundle"` | NOT NULL |  |
| 6 | `isRequired` | `boolean` | NOT NULL | `true` |
| 7 | `isActive` | `boolean` | NOT NULL | `true` |
| 8 | `isDefault` | `boolean` | NOT NULL | `false` |
| 9 | `sortOrder` | `integer` | NOT NULL | `0` |
| 10 | `helpText` | `text` | NULL |  |
| 11 | `createdBy` | `text` | NULL |  |
| 12 | `updatedBy` | `text` | NULL |  |
| 13 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 14 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 15 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `CandidateDocumentType_pkey`: PRIMARY KEY (id)

**Indexes**

- `CandidateDocumentType_orgId_bundle_isActive_idx`: `CREATE INDEX "CandidateDocumentType_orgId_bundle_isActive_idx" ON app_quikhrms."CandidateDocumentType" USING btree ("orgId", bundle, "isActive")`
- `CandidateDocumentType_orgId_code_bundle_key`: `CREATE UNIQUE INDEX "CandidateDocumentType_orgId_code_bundle_key" ON app_quikhrms."CandidateDocumentType" USING btree ("orgId", code, bundle)`
- `CandidateDocumentType_orgId_idx`: `CREATE INDEX "CandidateDocumentType_orgId_idx" ON app_quikhrms."CandidateDocumentType" USING btree ("orgId")`
- `CandidateDocumentType_pkey`: `CREATE UNIQUE INDEX "CandidateDocumentType_pkey" ON app_quikhrms."CandidateDocumentType" USING btree (id)`

---

### CandidateDocumentUpload

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `requestId` | `text` | NOT NULL |  |
| 4 | `documentTypeId` | `text` | NULL |  |
| 5 | `customLabel` | `text` | NULL |  |
| 6 | `fileUrl` | `text` | NOT NULL |  |
| 7 | `fileName` | `text` | NOT NULL |  |
| 8 | `fileSize` | `integer` | NULL |  |
| 9 | `mimeType` | `text` | NULL |  |
| 10 | `status` | `app_quikhrms."CandidateDocUploadStatus"` | NOT NULL | `'Pending'::app_quikhrms."CandidateDocUploadStatus"` |
| 11 | `rejectionReason` | `text` | NULL |  |
| 12 | `reviewedBy` | `text` | NULL |  |
| 13 | `reviewedAt` | `timestamp(3) without time zone` | NULL |  |
| 14 | `uploadedAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 17 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `CandidateDocumentUpload_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `CandidateDocumentUpload_documentTypeId_fkey`: FOREIGN KEY ("documentTypeId") REFERENCES app_quikhrms."CandidateDocumentType"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `CandidateDocumentUpload_requestId_fkey`: FOREIGN KEY ("requestId") REFERENCES app_quikhrms."CandidateDocumentRequest"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `CandidateDocumentUpload_orgId_idx`: `CREATE INDEX "CandidateDocumentUpload_orgId_idx" ON app_quikhrms."CandidateDocumentUpload" USING btree ("orgId")`
- `CandidateDocumentUpload_orgId_requestId_idx`: `CREATE INDEX "CandidateDocumentUpload_orgId_requestId_idx" ON app_quikhrms."CandidateDocumentUpload" USING btree ("orgId", "requestId")`
- `CandidateDocumentUpload_orgId_status_idx`: `CREATE INDEX "CandidateDocumentUpload_orgId_status_idx" ON app_quikhrms."CandidateDocumentUpload" USING btree ("orgId", status)`
- `CandidateDocumentUpload_pkey`: `CREATE UNIQUE INDEX "CandidateDocumentUpload_pkey" ON app_quikhrms."CandidateDocumentUpload" USING btree (id)`

---

### CandidatePortalAccess

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `candidateId` | `text` | NOT NULL |  |
| 4 | `accessToken` | `text` | NOT NULL |  |
| 5 | `email` | `text` | NOT NULL |  |
| 6 | `lastLoginAt` | `timestamp(3) without time zone` | NULL |  |
| 7 | `loginCount` | `integer` | NOT NULL | `0` |
| 8 | `expiresAt` | `timestamp(3) without time zone` | NULL |  |
| 9 | `isActive` | `boolean` | NOT NULL | `true` |
| 10 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 11 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 12 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `CandidatePortalAccess_pkey`: PRIMARY KEY (id)

**Indexes**

- `CandidatePortalAccess_accessToken_key`: `CREATE UNIQUE INDEX "CandidatePortalAccess_accessToken_key" ON app_quikhrms."CandidatePortalAccess" USING btree ("accessToken")`
- `CandidatePortalAccess_orgId_candidateId_idx`: `CREATE INDEX "CandidatePortalAccess_orgId_candidateId_idx" ON app_quikhrms."CandidatePortalAccess" USING btree ("orgId", "candidateId")`
- `CandidatePortalAccess_orgId_candidateId_key`: `CREATE UNIQUE INDEX "CandidatePortalAccess_orgId_candidateId_key" ON app_quikhrms."CandidatePortalAccess" USING btree ("orgId", "candidateId")`
- `CandidatePortalAccess_orgId_deletedAt_idx`: `CREATE INDEX "CandidatePortalAccess_orgId_deletedAt_idx" ON app_quikhrms."CandidatePortalAccess" USING btree ("orgId", "deletedAt")`
- `CandidatePortalAccess_orgId_idx`: `CREATE INDEX "CandidatePortalAccess_orgId_idx" ON app_quikhrms."CandidatePortalAccess" USING btree ("orgId")`
- `CandidatePortalAccess_pkey`: `CREATE UNIQUE INDEX "CandidatePortalAccess_pkey" ON app_quikhrms."CandidatePortalAccess" USING btree (id)`

---

### ClaimsDeclarationSettings

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `itDeclarationReleased` | `boolean` | NOT NULL | `false` |
| 4 | `itDeclarationReleasedAt` | `timestamp(3) without time zone` | NULL |  |
| 5 | `poiReleased` | `boolean` | NOT NULL | `false` |
| 6 | `poiReleasedAt` | `timestamp(3) without time zone` | NULL |  |
| 7 | `poiStartMonth` | `integer` | NOT NULL | `3` |
| 8 | `allowRegimeSwitch` | `boolean` | NOT NULL | `true` |
| 9 | `allowTDSModification` | `boolean` | NOT NULL | `false` |
| 10 | `allowTDSModificationPayroll` | `boolean` | NOT NULL | `false` |
| 11 | `defaultRegime` | `app_quikhrms."TaxRegime"` | NOT NULL | `'NewRegime'::app_quikhrms."TaxRegime"` |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `updatedBy` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `ClaimsDeclarationSettings_pkey`: PRIMARY KEY (id)

**Indexes**

- `ClaimsDeclarationSettings_orgId_idx`: `CREATE INDEX "ClaimsDeclarationSettings_orgId_idx" ON app_quikhrms."ClaimsDeclarationSettings" USING btree ("orgId")`
- `ClaimsDeclarationSettings_orgId_key`: `CREATE UNIQUE INDEX "ClaimsDeclarationSettings_orgId_key" ON app_quikhrms."ClaimsDeclarationSettings" USING btree ("orgId")`
- `ClaimsDeclarationSettings_pkey`: `CREATE UNIQUE INDEX "ClaimsDeclarationSettings_pkey" ON app_quikhrms."ClaimsDeclarationSettings" USING btree (id)`

---

### CompanyHoliday

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `date` | `date` | NOT NULL |  |
| 5 | `year` | `integer` | NOT NULL |  |
| 6 | `type` | `app_quikhrms."CompanyHolidayType"` | NOT NULL | `'National'::app_quikhrms."CompanyHolidayType"` |
| 7 | `isOptional` | `boolean` | NOT NULL | `false` |
| 8 | `maxOptionalAllowed` | `integer` | NULL |  |
| 9 | `applicableDepartments` | `jsonb` | NULL |  |
| 10 | `applicableLocations` | `jsonb` | NULL |  |
| 11 | `description` | `text` | NULL |  |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `updatedBy` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 16 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `CompanyHoliday_pkey`: PRIMARY KEY (id)

**Indexes**

- `CompanyHoliday_orgId_date_idx`: `CREATE INDEX "CompanyHoliday_orgId_date_idx" ON app_quikhrms."CompanyHoliday" USING btree ("orgId", date)`
- `CompanyHoliday_orgId_deletedAt_idx`: `CREATE INDEX "CompanyHoliday_orgId_deletedAt_idx" ON app_quikhrms."CompanyHoliday" USING btree ("orgId", "deletedAt")`
- `CompanyHoliday_orgId_idx`: `CREATE INDEX "CompanyHoliday_orgId_idx" ON app_quikhrms."CompanyHoliday" USING btree ("orgId")`
- `CompanyHoliday_orgId_year_idx`: `CREATE INDEX "CompanyHoliday_orgId_year_idx" ON app_quikhrms."CompanyHoliday" USING btree ("orgId", year)`
- `CompanyHoliday_pkey`: `CREATE UNIQUE INDEX "CompanyHoliday_pkey" ON app_quikhrms."CompanyHoliday" USING btree (id)`

---

### CompanySettings

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `companyName` | `text` | NOT NULL |  |
| 4 | `legalName` | `text` | NULL |  |
| 5 | `logo` | `text` | NULL |  |
| 6 | `website` | `text` | NULL |  |
| 7 | `email` | `text` | NULL |  |
| 8 | `phone` | `text` | NULL |  |
| 9 | `addressLine1` | `text` | NULL |  |
| 10 | `addressLine2` | `text` | NULL |  |
| 11 | `city` | `text` | NULL |  |
| 12 | `state` | `text` | NULL |  |
| 13 | `country` | `text` | NULL | `'India'::text` |
| 14 | `postalCode` | `text` | NULL |  |
| 15 | `gstin` | `text` | NULL |  |
| 16 | `pan` | `text` | NULL |  |
| 17 | `cin` | `text` | NULL |  |
| 18 | `tan` | `text` | NULL |  |
| 19 | `tdsCircleCodeArea` | `text` | NULL |  |
| 20 | `tdsCircleCodeType` | `text` | NULL |  |
| 21 | `tdsCircleNumber` | `text` | NULL |  |
| 22 | `tdsCircleSubNumber` | `text` | NULL |  |
| 23 | `timezone` | `text` | NOT NULL | `'Asia/Kolkata'::text` |
| 24 | `dateFormat` | `text` | NOT NULL | `'dd/MM/yyyy'::text` |
| 25 | `currency` | `text` | NOT NULL | `'INR'::text` |
| 26 | `fiscalYearStart` | `integer` | NOT NULL | `4` |
| 27 | `probationPeriodDays` | `integer` | NOT NULL | `90` |
| 28 | `noticePeriodDays` | `integer` | NOT NULL | `60` |
| 29 | `workWeek` | `jsonb` | NULL |  |
| 30 | `workHoursPerDay` | `numeric(4,2)` | NOT NULL | `8` |
| 31 | `letterheadKey` | `text` | NULL |  |
| 32 | `sealKey` | `text` | NULL |  |
| 33 | `signatureKey` | `text` | NULL |  |
| 34 | `signatoryName` | `text` | NULL |  |
| 35 | `signatoryDesignation` | `text` | NULL |  |
| 36 | `offerLetterFooter` | `text` | NULL |  |
| 37 | `createdBy` | `text` | NULL |  |
| 38 | `updatedBy` | `text` | NULL |  |
| 39 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 40 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `CompanySettings_pkey`: PRIMARY KEY (id)

**Indexes**

- `CompanySettings_orgId_idx`: `CREATE INDEX "CompanySettings_orgId_idx" ON app_quikhrms."CompanySettings" USING btree ("orgId")`
- `CompanySettings_orgId_key`: `CREATE UNIQUE INDEX "CompanySettings_orgId_key" ON app_quikhrms."CompanySettings" USING btree ("orgId")`
- `CompanySettings_pkey`: `CREATE UNIQUE INDEX "CompanySettings_pkey" ON app_quikhrms."CompanySettings" USING btree (id)`

---

### ContinuousFeedback

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `fromEmployeeId` | `text` | NOT NULL |  |
| 4 | `toEmployeeId` | `text` | NOT NULL |  |
| 5 | `type` | `app_quikhrms."FeedbackType"` | NOT NULL | `'Praise'::app_quikhrms."FeedbackType"` |
| 6 | `category` | `app_quikhrms."FeedbackCategory"` | NOT NULL | `'Teamwork'::app_quikhrms."FeedbackCategory"` |
| 7 | `message` | `text` | NOT NULL |  |
| 8 | `isPublic` | `boolean` | NOT NULL | `false` |
| 9 | `badges` | `jsonb` | NULL |  |
| 10 | `relatedGoalId` | `text` | NULL |  |
| 11 | `approvalStatus` | `app_quikhrms."ContentApprovalStatus"` | NOT NULL | `'Approved'::app_quikhrms."ContentApprovalStatus"` |
| 12 | `approvedById` | `text` | NULL |  |
| 13 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 14 | `rejectionReason` | `text` | NULL |  |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `ContinuousFeedback_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `ContinuousFeedback_fromEmployeeId_fkey`: FOREIGN KEY ("fromEmployeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `ContinuousFeedback_toEmployeeId_fkey`: FOREIGN KEY ("toEmployeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `ContinuousFeedback_orgId_approvalStatus_idx`: `CREATE INDEX "ContinuousFeedback_orgId_approvalStatus_idx" ON app_quikhrms."ContinuousFeedback" USING btree ("orgId", "approvalStatus")`
- `ContinuousFeedback_orgId_fromEmployeeId_idx`: `CREATE INDEX "ContinuousFeedback_orgId_fromEmployeeId_idx" ON app_quikhrms."ContinuousFeedback" USING btree ("orgId", "fromEmployeeId")`
- `ContinuousFeedback_orgId_idx`: `CREATE INDEX "ContinuousFeedback_orgId_idx" ON app_quikhrms."ContinuousFeedback" USING btree ("orgId")`
- `ContinuousFeedback_orgId_toEmployeeId_idx`: `CREATE INDEX "ContinuousFeedback_orgId_toEmployeeId_idx" ON app_quikhrms."ContinuousFeedback" USING btree ("orgId", "toEmployeeId")`
- `ContinuousFeedback_pkey`: `CREATE UNIQUE INDEX "ContinuousFeedback_pkey" ON app_quikhrms."ContinuousFeedback" USING btree (id)`

---

### Dashboard

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `description` | `text` | NULL |  |
| 5 | `category` | `text` | NULL |  |
| 6 | `iconName` | `text` | NULL |  |
| 7 | `color` | `text` | NULL |  |
| 8 | `isPrebuilt` | `boolean` | NOT NULL | `false` |
| 9 | `widgets` | `jsonb` | NOT NULL |  |
| 10 | `roleAccess` | `jsonb` | NULL |  |
| 11 | `isDefault` | `boolean` | NOT NULL | `false` |
| 12 | `isPublic` | `boolean` | NOT NULL | `false` |
| 13 | `createdBy` | `text` | NULL |  |
| 14 | `updatedBy` | `text` | NULL |  |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 17 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Dashboard_pkey`: PRIMARY KEY (id)

**Indexes**

- `Dashboard_orgId_createdBy_idx`: `CREATE INDEX "Dashboard_orgId_createdBy_idx" ON app_quikhrms."Dashboard" USING btree ("orgId", "createdBy")`
- `Dashboard_orgId_deletedAt_idx`: `CREATE INDEX "Dashboard_orgId_deletedAt_idx" ON app_quikhrms."Dashboard" USING btree ("orgId", "deletedAt")`
- `Dashboard_orgId_idx`: `CREATE INDEX "Dashboard_orgId_idx" ON app_quikhrms."Dashboard" USING btree ("orgId")`
- `Dashboard_pkey`: `CREATE UNIQUE INDEX "Dashboard_pkey" ON app_quikhrms."Dashboard" USING btree (id)`

---

### DataImport

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `entityType` | `text` | NOT NULL |  |
| 4 | `fileName` | `text` | NOT NULL |  |
| 5 | `fileUrl` | `text` | NULL |  |
| 6 | `totalRows` | `integer` | NOT NULL | `0` |
| 7 | `processedRows` | `integer` | NOT NULL | `0` |
| 8 | `successRows` | `integer` | NOT NULL | `0` |
| 9 | `failedRows` | `integer` | NOT NULL | `0` |
| 10 | `errors` | `jsonb` | NULL |  |
| 11 | `status` | `app_quikhrms."ImportStatus"` | NOT NULL | `'ImportPending'::app_quikhrms."ImportStatus"` |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 14 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `DataImport_pkey`: PRIMARY KEY (id)

**Indexes**

- `DataImport_orgId_idx`: `CREATE INDEX "DataImport_orgId_idx" ON app_quikhrms."DataImport" USING btree ("orgId")`
- `DataImport_orgId_status_idx`: `CREATE INDEX "DataImport_orgId_status_idx" ON app_quikhrms."DataImport" USING btree ("orgId", status)`
- `DataImport_pkey`: `CREATE UNIQUE INDEX "DataImport_pkey" ON app_quikhrms."DataImport" USING btree (id)`

---

### Delegation

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `delegatorId` | `text` | NOT NULL |  |
| 4 | `delegateeId` | `text` | NOT NULL |  |
| 5 | `type` | `app_quikhrms."DelegationType"` | NOT NULL | `'DelegationTemporary'::app_quikhrms."DelegationType"` |
| 6 | `modules` | `jsonb` | NOT NULL |  |
| 7 | `fromDate` | `date` | NOT NULL |  |
| 8 | `toDate` | `date` | NULL |  |
| 9 | `notifyMode` | `app_quikhrms."DelegationNotifyMode"` | NOT NULL | `'NotifyBoth'::app_quikhrms."DelegationNotifyMode"` |
| 10 | `description` | `text` | NULL |  |
| 11 | `isActive` | `boolean` | NOT NULL | `true` |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `updatedBy` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 16 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Delegation_pkey`: PRIMARY KEY (id)

**Indexes**

- `Delegation_orgId_delegateeId_idx`: `CREATE INDEX "Delegation_orgId_delegateeId_idx" ON app_quikhrms."Delegation" USING btree ("orgId", "delegateeId")`
- `Delegation_orgId_delegatorId_idx`: `CREATE INDEX "Delegation_orgId_delegatorId_idx" ON app_quikhrms."Delegation" USING btree ("orgId", "delegatorId")`
- `Delegation_orgId_deletedAt_idx`: `CREATE INDEX "Delegation_orgId_deletedAt_idx" ON app_quikhrms."Delegation" USING btree ("orgId", "deletedAt")`
- `Delegation_orgId_idx`: `CREATE INDEX "Delegation_orgId_idx" ON app_quikhrms."Delegation" USING btree ("orgId")`
- `Delegation_orgId_isActive_idx`: `CREATE INDEX "Delegation_orgId_isActive_idx" ON app_quikhrms."Delegation" USING btree ("orgId", "isActive")`
- `Delegation_pkey`: `CREATE UNIQUE INDEX "Delegation_pkey" ON app_quikhrms."Delegation" USING btree (id)`

---

### Department

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `code` | `text` | NOT NULL |  |
| 5 | `parentDepartmentId` | `text` | NULL |  |
| 6 | `headId` | `text` | NULL |  |
| 7 | `description` | `text` | NULL |  |
| 8 | `status` | `app_quikhrms."DepartmentStatus"` | NOT NULL | `'Active'::app_quikhrms."DepartmentStatus"` |
| 9 | `createdBy` | `text` | NULL |  |
| 10 | `updatedBy` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 12 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 13 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Department_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Department_headId_fkey`: FOREIGN KEY ("headId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Department_parentDepartmentId_fkey`: FOREIGN KEY ("parentDepartmentId") REFERENCES app_quikhrms."Department"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `Department_orgId_code_key`: `CREATE UNIQUE INDEX "Department_orgId_code_key" ON app_quikhrms."Department" USING btree ("orgId", code)`
- `Department_orgId_deletedAt_idx`: `CREATE INDEX "Department_orgId_deletedAt_idx" ON app_quikhrms."Department" USING btree ("orgId", "deletedAt")`
- `Department_orgId_idx`: `CREATE INDEX "Department_orgId_idx" ON app_quikhrms."Department" USING btree ("orgId")`
- `Department_pkey`: `CREATE UNIQUE INDEX "Department_pkey" ON app_quikhrms."Department" USING btree (id)`

---

### Designation

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `title` | `text` | NOT NULL |  |
| 4 | `level` | `integer` | NOT NULL | `0` |
| 5 | `departmentId` | `text` | NULL |  |
| 6 | `createdBy` | `text` | NULL |  |
| 7 | `updatedBy` | `text` | NULL |  |
| 8 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 9 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 10 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Designation_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Designation_departmentId_fkey`: FOREIGN KEY ("departmentId") REFERENCES app_quikhrms."Department"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `Designation_orgId_deletedAt_idx`: `CREATE INDEX "Designation_orgId_deletedAt_idx" ON app_quikhrms."Designation" USING btree ("orgId", "deletedAt")`
- `Designation_orgId_idx`: `CREATE INDEX "Designation_orgId_idx" ON app_quikhrms."Designation" USING btree ("orgId")`
- `Designation_pkey`: `CREATE UNIQUE INDEX "Designation_pkey" ON app_quikhrms."Designation" USING btree (id)`

---

### Document

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NULL |  |
| 4 | `title` | `text` | NOT NULL |  |
| 5 | `description` | `text` | NULL |  |
| 6 | `category` | `app_quikhrms."DocumentCategory"` | NOT NULL | `'Other'::app_quikhrms."DocumentCategory"` |
| 7 | `fileUrl` | `text` | NOT NULL |  |
| 8 | `fileType` | `text` | NOT NULL |  |
| 9 | `fileSize` | `integer` | NOT NULL | `0` |
| 10 | `version` | `integer` | NOT NULL | `1` |
| 11 | `parentDocumentId` | `text` | NULL |  |
| 12 | `isTemplate` | `boolean` | NOT NULL | `false` |
| 13 | `status` | `app_quikhrms."DocumentStatus"` | NOT NULL | `'Active'::app_quikhrms."DocumentStatus"` |
| 14 | `expiryDate` | `date` | NULL |  |
| 15 | `uploadedBy` | `text` | NOT NULL |  |
| 16 | `tags` | `jsonb` | NULL |  |
| 17 | `metadata` | `jsonb` | NULL |  |
| 18 | `createdBy` | `text` | NULL |  |
| 19 | `updatedBy` | `text` | NULL |  |
| 20 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 21 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 22 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Document_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Document_parentDocumentId_fkey`: FOREIGN KEY ("parentDocumentId") REFERENCES app_quikhrms."Document"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `Document_orgId_category_idx`: `CREATE INDEX "Document_orgId_category_idx" ON app_quikhrms."Document" USING btree ("orgId", category)`
- `Document_orgId_deletedAt_idx`: `CREATE INDEX "Document_orgId_deletedAt_idx" ON app_quikhrms."Document" USING btree ("orgId", "deletedAt")`
- `Document_orgId_employeeId_idx`: `CREATE INDEX "Document_orgId_employeeId_idx" ON app_quikhrms."Document" USING btree ("orgId", "employeeId")`
- `Document_orgId_expiryDate_idx`: `CREATE INDEX "Document_orgId_expiryDate_idx" ON app_quikhrms."Document" USING btree ("orgId", "expiryDate")`
- `Document_orgId_idx`: `CREATE INDEX "Document_orgId_idx" ON app_quikhrms."Document" USING btree ("orgId")`
- `Document_orgId_status_idx`: `CREATE INDEX "Document_orgId_status_idx" ON app_quikhrms."Document" USING btree ("orgId", status)`
- `Document_pkey`: `CREATE UNIQUE INDEX "Document_pkey" ON app_quikhrms."Document" USING btree (id)`

---

### DocumentAcknowledgment

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `documentId` | `text` | NOT NULL |  |
| 4 | `employeeId` | `text` | NOT NULL |  |
| 5 | `acknowledgedAt` | `timestamp(3) without time zone` | NULL |  |
| 6 | `ipAddress` | `text` | NULL |  |
| 7 | `signature` | `text` | NULL |  |
| 8 | `declineReason` | `text` | NULL |  |
| 9 | `status` | `app_quikhrms."DocumentAckStatus"` | NOT NULL | `'Pending'::app_quikhrms."DocumentAckStatus"` |
| 10 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 11 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `DocumentAcknowledgment_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `DocumentAcknowledgment_documentId_fkey`: FOREIGN KEY ("documentId") REFERENCES app_quikhrms."Document"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `DocumentAcknowledgment_orgId_documentId_employeeId_key`: `CREATE UNIQUE INDEX "DocumentAcknowledgment_orgId_documentId_employeeId_key" ON app_quikhrms."DocumentAcknowledgment" USING btree ("orgId", "documentId", "employeeId")`
- `DocumentAcknowledgment_orgId_documentId_idx`: `CREATE INDEX "DocumentAcknowledgment_orgId_documentId_idx" ON app_quikhrms."DocumentAcknowledgment" USING btree ("orgId", "documentId")`
- `DocumentAcknowledgment_orgId_employeeId_idx`: `CREATE INDEX "DocumentAcknowledgment_orgId_employeeId_idx" ON app_quikhrms."DocumentAcknowledgment" USING btree ("orgId", "employeeId")`
- `DocumentAcknowledgment_orgId_status_idx`: `CREATE INDEX "DocumentAcknowledgment_orgId_status_idx" ON app_quikhrms."DocumentAcknowledgment" USING btree ("orgId", status)`
- `DocumentAcknowledgment_pkey`: `CREATE UNIQUE INDEX "DocumentAcknowledgment_pkey" ON app_quikhrms."DocumentAcknowledgment" USING btree (id)`

---

### DocumentShare

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `documentId` | `text` | NOT NULL |  |
| 4 | `sharedWith` | `text` | NOT NULL |  |
| 5 | `sharedBy` | `text` | NOT NULL |  |
| 6 | `accessLevel` | `app_quikhrms."DocumentAccessLevel"` | NOT NULL | `'View'::app_quikhrms."DocumentAccessLevel"` |
| 7 | `expiresAt` | `timestamp(3) without time zone` | NULL |  |
| 8 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `DocumentShare_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `DocumentShare_documentId_fkey`: FOREIGN KEY ("documentId") REFERENCES app_quikhrms."Document"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `DocumentShare_orgId_documentId_idx`: `CREATE INDEX "DocumentShare_orgId_documentId_idx" ON app_quikhrms."DocumentShare" USING btree ("orgId", "documentId")`
- `DocumentShare_orgId_documentId_sharedWith_key`: `CREATE UNIQUE INDEX "DocumentShare_orgId_documentId_sharedWith_key" ON app_quikhrms."DocumentShare" USING btree ("orgId", "documentId", "sharedWith")`
- `DocumentShare_orgId_sharedWith_idx`: `CREATE INDEX "DocumentShare_orgId_sharedWith_idx" ON app_quikhrms."DocumentShare" USING btree ("orgId", "sharedWith")`
- `DocumentShare_pkey`: `CREATE UNIQUE INDEX "DocumentShare_pkey" ON app_quikhrms."DocumentShare" USING btree (id)`

---

### Donation

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `financialYear` | `text` | NOT NULL |  |
| 5 | `donorPAN` | `text` | NULL |  |
| 6 | `doneeName` | `text` | NOT NULL |  |
| 7 | `doneePAN` | `text` | NULL |  |
| 8 | `section` | `text` | NOT NULL | `'80G'::text` |
| 9 | `donationDate` | `date` | NOT NULL |  |
| 10 | `amount` | `numeric(15,2)` | NOT NULL |  |
| 11 | `exemptionPercent` | `numeric(5,2)` | NOT NULL | `100` |
| 12 | `qualifyingLimit` | `numeric(15,2)` | NULL |  |
| 13 | `exemptAmount` | `numeric(15,2)` | NULL |  |
| 14 | `receiptNumber` | `text` | NULL |  |
| 15 | `fileUrl` | `text` | NULL |  |
| 16 | `notes` | `text` | NULL |  |
| 17 | `status` | `app_quikhrms."DonationStatus"` | NOT NULL | `'Submitted'::app_quikhrms."DonationStatus"` |
| 18 | `verifiedBy` | `text` | NULL |  |
| 19 | `verifiedAt` | `timestamp(3) without time zone` | NULL |  |
| 20 | `rejectionReason` | `text` | NULL |  |
| 21 | `createdBy` | `text` | NULL |  |
| 22 | `updatedBy` | `text` | NULL |  |
| 23 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 24 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 25 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Donation_pkey`: PRIMARY KEY (id)

**Indexes**

- `Donation_orgId_employeeId_idx`: `CREATE INDEX "Donation_orgId_employeeId_idx" ON app_quikhrms."Donation" USING btree ("orgId", "employeeId")`
- `Donation_orgId_financialYear_idx`: `CREATE INDEX "Donation_orgId_financialYear_idx" ON app_quikhrms."Donation" USING btree ("orgId", "financialYear")`
- `Donation_orgId_idx`: `CREATE INDEX "Donation_orgId_idx" ON app_quikhrms."Donation" USING btree ("orgId")`
- `Donation_pkey`: `CREATE UNIQUE INDEX "Donation_pkey" ON app_quikhrms."Donation" USING btree (id)`

---

### EPFConfig

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `enabled` | `boolean` | NOT NULL | `false` |
| 4 | `epfNumber` | `text` | NULL |  |
| 5 | `deductionCycle` | `app_quikhrms."PFDeductionCycle"` | NOT NULL | `'Monthly'::app_quikhrms."PFDeductionCycle"` |
| 6 | `employeeContributionRate` | `app_quikhrms."EPFContributionRate"` | NOT NULL | `'TwelvePercentActual'::app_quikhrms."EPFContributionRate"` |
| 7 | `employerContributionRate` | `app_quikhrms."EPFContributionRate"` | NOT NULL | `'TwelvePercentActual'::app_quikhrms."EPFContributionRate"` |
| 8 | `includeEmployerInCTC` | `boolean` | NOT NULL | `true` |
| 9 | `includeEDLIInCTC` | `boolean` | NOT NULL | `false` |
| 10 | `includeAdminChargesInCTC` | `boolean` | NOT NULL | `false` |
| 11 | `allowOverrideAtEmployee` | `boolean` | NOT NULL | `false` |
| 12 | `proRateRestrictedWage` | `boolean` | NOT NULL | `false` |
| 13 | `considerAllComponentsOnLOP` | `boolean` | NOT NULL | `true` |
| 14 | `effectiveFrom` | `date` | NULL |  |
| 15 | `effectiveTo` | `date` | NULL |  |
| 16 | `createdBy` | `text` | NULL |  |
| 17 | `updatedBy` | `text` | NULL |  |
| 18 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 19 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `EPFConfig_pkey`: PRIMARY KEY (id)

**Indexes**

- `EPFConfig_orgId_idx`: `CREATE INDEX "EPFConfig_orgId_idx" ON app_quikhrms."EPFConfig" USING btree ("orgId")`
- `EPFConfig_orgId_key`: `CREATE UNIQUE INDEX "EPFConfig_orgId_key" ON app_quikhrms."EPFConfig" USING btree ("orgId")`
- `EPFConfig_pkey`: `CREATE UNIQUE INDEX "EPFConfig_pkey" ON app_quikhrms."EPFConfig" USING btree (id)`

---

### ESIConfig

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `enabled` | `boolean` | NOT NULL | `false` |
| 4 | `esiNumber` | `text` | NULL |  |
| 5 | `deductionCycle` | `app_quikhrms."PFDeductionCycle"` | NOT NULL | `'Monthly'::app_quikhrms."PFDeductionCycle"` |
| 6 | `employeeContributionPercent` | `numeric(5,2)` | NOT NULL | `0.75` |
| 7 | `employerContributionPercent` | `numeric(5,2)` | NOT NULL | `3.25` |
| 8 | `includeEmployerInCTC` | `boolean` | NOT NULL | `false` |
| 9 | `grossCeiling` | `numeric(12,2)` | NOT NULL | `21000` |
| 10 | `effectiveFrom` | `date` | NULL |  |
| 11 | `effectiveTo` | `date` | NULL |  |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `updatedBy` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `ESIConfig_pkey`: PRIMARY KEY (id)

**Indexes**

- `ESIConfig_orgId_idx`: `CREATE INDEX "ESIConfig_orgId_idx" ON app_quikhrms."ESIConfig" USING btree ("orgId")`
- `ESIConfig_orgId_key`: `CREATE UNIQUE INDEX "ESIConfig_orgId_key" ON app_quikhrms."ESIConfig" USING btree ("orgId")`
- `ESIConfig_pkey`: `CREATE UNIQUE INDEX "ESIConfig_pkey" ON app_quikhrms."ESIConfig" USING btree (id)`

---

### ESignRequest

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `documentId` | `text` | NULL |  |
| 4 | `title` | `text` | NOT NULL |  |
| 5 | `provider` | `app_quikhrms."ESignProvider"` | NOT NULL | `'Internal'::app_quikhrms."ESignProvider"` |
| 6 | `signers` | `jsonb` | NOT NULL |  |
| 7 | `message` | `text` | NULL |  |
| 8 | `status` | `app_quikhrms."ESignStatus"` | NOT NULL | `'ESignDraft'::app_quikhrms."ESignStatus"` |
| 9 | `sentAt` | `timestamp(3) without time zone` | NULL |  |
| 10 | `completedAt` | `timestamp(3) without time zone` | NULL |  |
| 11 | `expiresAt` | `timestamp(3) without time zone` | NULL |  |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `updatedBy` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 16 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `ESignRequest_pkey`: PRIMARY KEY (id)

**Indexes**

- `ESignRequest_orgId_deletedAt_idx`: `CREATE INDEX "ESignRequest_orgId_deletedAt_idx" ON app_quikhrms."ESignRequest" USING btree ("orgId", "deletedAt")`
- `ESignRequest_orgId_documentId_idx`: `CREATE INDEX "ESignRequest_orgId_documentId_idx" ON app_quikhrms."ESignRequest" USING btree ("orgId", "documentId")`
- `ESignRequest_orgId_idx`: `CREATE INDEX "ESignRequest_orgId_idx" ON app_quikhrms."ESignRequest" USING btree ("orgId")`
- `ESignRequest_orgId_status_idx`: `CREATE INDEX "ESignRequest_orgId_status_idx" ON app_quikhrms."ESignRequest" USING btree ("orgId", status)`
- `ESignRequest_pkey`: `CREATE UNIQUE INDEX "ESignRequest_pkey" ON app_quikhrms."ESignRequest" USING btree (id)`

---

### EmailTemplate

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `key` | `text` | NOT NULL |  |
| 4 | `channel` | `text` | NOT NULL | `'Email'::text` |
| 5 | `subject` | `text` | NOT NULL |  |
| 6 | `body` | `text` | NOT NULL |  |
| 7 | `enabled` | `boolean` | NOT NULL | `true` |
| 8 | `description` | `text` | NULL |  |
| 9 | `createdBy` | `text` | NULL |  |
| 10 | `updatedBy` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 12 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 13 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `EmailTemplate_pkey`: PRIMARY KEY (id)

**Indexes**

- `EmailTemplate_orgId_idx`: `CREATE INDEX "EmailTemplate_orgId_idx" ON app_quikhrms."EmailTemplate" USING btree ("orgId")`
- `EmailTemplate_orgId_key_channel_key`: `CREATE UNIQUE INDEX "EmailTemplate_orgId_key_channel_key" ON app_quikhrms."EmailTemplate" USING btree ("orgId", key, channel)`
- `EmailTemplate_orgId_key_idx`: `CREATE INDEX "EmailTemplate_orgId_key_idx" ON app_quikhrms."EmailTemplate" USING btree ("orgId", key)`
- `EmailTemplate_pkey`: `CREATE UNIQUE INDEX "EmailTemplate_pkey" ON app_quikhrms."EmailTemplate" USING btree (id)`

---

### Employee

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `authUserId` | `text` | NULL |  |
| 4 | `employeeCode` | `text` | NOT NULL |  |
| 5 | `firstName` | `text` | NOT NULL |  |
| 6 | `middleName` | `text` | NULL |  |
| 7 | `lastName` | `text` | NOT NULL |  |
| 8 | `displayName` | `text` | NULL |  |
| 9 | `gender` | `app_quikhrms."Gender"` | NULL |  |
| 10 | `dateOfBirth` | `timestamp(3) without time zone` | NULL |  |
| 11 | `bloodGroup` | `app_quikhrms."BloodGroup"` | NULL |  |
| 12 | `maritalStatus` | `app_quikhrms."MaritalStatus"` | NULL |  |
| 13 | `nationality` | `text` | NULL |  |
| 14 | `isHandicapped` | `boolean` | NOT NULL | `false` |
| 15 | `isSeniorCitizen` | `boolean` | NOT NULL | `false` |
| 16 | `epfApplicable` | `boolean` | NOT NULL | `true` |
| 17 | `esiApplicable` | `boolean` | NOT NULL | `true` |
| 18 | `ptApplicable` | `boolean` | NOT NULL | `true` |
| 19 | `epfContributionRate` | `text` | NULL |  |
| 20 | `profilePhoto` | `text` | NULL |  |
| 21 | `coverImage` | `text` | NULL |  |
| 22 | `bio` | `text` | NULL |  |
| 23 | `passwordHash` | `text` | NULL |  |
| 24 | `mustChangePassword` | `boolean` | NOT NULL | `false` |
| 25 | `tempPasswordExpiresAt` | `timestamp(3) without time zone` | NULL |  |
| 26 | `failedLoginAttempts` | `integer` | NOT NULL | `0` |
| 27 | `lockedUntil` | `timestamp(3) without time zone` | NULL |  |
| 28 | `personalEmail` | `text` | NULL |  |
| 29 | `workEmail` | `text` | NOT NULL |  |
| 30 | `personalPhone` | `text` | NULL |  |
| 31 | `workPhone` | `text` | NULL |  |
| 32 | `linkedinUrl` | `text` | NULL |  |
| 33 | `githubUrl` | `text` | NULL |  |
| 34 | `portfolioUrl` | `text` | NULL |  |
| 35 | `currentAddress` | `jsonb` | NULL |  |
| 36 | `permanentAddress` | `jsonb` | NULL |  |
| 37 | `emergencyContacts` | `jsonb` | NULL |  |
| 38 | `jobTitle` | `text` | NULL |  |
| 39 | `departmentId` | `text` | NULL |  |
| 40 | `teamId` | `text` | NULL |  |
| 41 | `designationId` | `text` | NULL |  |
| 42 | `gradeId` | `text` | NULL |  |
| 43 | `reportingManagerId` | `text` | NULL |  |
| 44 | `dottedLineManagerId` | `text` | NULL |  |
| 45 | `employmentType` | `app_quikhrms."EmploymentType"` | NOT NULL | `'FullTime'::app_quikhrms."EmploymentType"` |
| 46 | `workerType` | `app_quikhrms."WorkerType"` | NOT NULL | `'Permanent'::app_quikhrms."WorkerType"` |
| 47 | `workLocation` | `app_quikhrms."WorkLocation"` | NOT NULL | `'Office'::app_quikhrms."WorkLocation"` |
| 48 | `officeLocationId` | `text` | NULL |  |
| 49 | `dateOfJoining` | `timestamp(3) without time zone` | NOT NULL |  |
| 50 | `tentativeJoiningDate` | `date` | NULL |  |
| 51 | `confirmationDate` | `timestamp(3) without time zone` | NULL |  |
| 52 | `probationEndDate` | `timestamp(3) without time zone` | NULL |  |
| 53 | `noticePeriodDays` | `integer` | NOT NULL | `0` |
| 54 | `lastWorkingDate` | `timestamp(3) without time zone` | NULL |  |
| 55 | `previousExperience` | `integer` | NOT NULL | `0` |
| 56 | `sourceOfHire` | `app_quikhrms."SourceOfHire"` | NULL |  |
| 57 | `referredById` | `text` | NULL |  |
| 58 | `currentSalary` | `numeric(15,2)` | NULL |  |
| 59 | `expectedSalary` | `numeric(15,2)` | NULL |  |
| 60 | `offerLetterUrl` | `text` | NULL |  |
| 61 | `highestQualification` | `text` | NULL |  |
| 62 | `skillSet` | `text` | NULL |  |
| 63 | `additionalInfo` | `text` | NULL |  |
| 64 | `identityDocuments` | `jsonb` | NULL |  |
| 65 | `bankAccounts` | `jsonb` | NULL |  |
| 66 | `panNumber` | `text` | NULL |  |
| 67 | `aadhaarNumber` | `text` | NULL |  |
| 68 | `taxIdentificationNumber` | `text` | NULL |  |
| 69 | `uanNumber` | `text` | NULL |  |
| 70 | `pfAccountNumber` | `text` | NULL |  |
| 71 | `esiNumber` | `text` | NULL |  |
| 72 | `legalEntityId` | `text` | NULL |  |
| 73 | `taxResidencyStatus` | `app_quikhrms."TaxResidencyStatus"` | NOT NULL | `'Resident'::app_quikhrms."TaxResidencyStatus"` |
| 74 | `payFrequencyOverride` | `app_quikhrms."PayFrequency"` | NULL |  |
| 75 | `skills` | `jsonb` | NULL |  |
| 76 | `certifications` | `jsonb` | NULL |  |
| 77 | `languages` | `jsonb` | NULL |  |
| 78 | `educations` | `jsonb` | NULL |  |
| 79 | `pastExperiences` | `jsonb` | NULL |  |
| 80 | `customFields` | `jsonb` | NULL |  |
| 81 | `status` | `app_quikhrms."EmployeeStatus"` | NOT NULL | `'Active'::app_quikhrms."EmployeeStatus"` |
| 82 | `inviteStatus` | `app_quikhrms."InviteStatus"` | NOT NULL | `'NotInvited'::app_quikhrms."InviteStatus"` |
| 83 | `centralRole` | `text` | NULL |  |
| 84 | `centralDeactivatedAt` | `timestamp(3) without time zone` | NULL |  |
| 85 | `lastLoginAt` | `timestamp(3) without time zone` | NULL |  |
| 86 | `activeSessionId` | `text` | NULL |  |
| 87 | `createdBy` | `text` | NULL |  |
| 88 | `updatedBy` | `text` | NULL |  |
| 89 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 90 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 91 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |
| 92 | `weeklyOffDays` | `jsonb` | NULL |  |
| 93 | `wfhQuotaGroupId` | `text` | NULL |  |

**Primary Key**

- `Employee_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Employee_departmentId_fkey`: FOREIGN KEY ("departmentId") REFERENCES app_quikhrms."Department"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Employee_designationId_fkey`: FOREIGN KEY ("designationId") REFERENCES app_quikhrms."Designation"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Employee_dottedLineManagerId_fkey`: FOREIGN KEY ("dottedLineManagerId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Employee_gradeId_fkey`: FOREIGN KEY ("gradeId") REFERENCES app_quikhrms."Grade"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Employee_officeLocationId_fkey`: FOREIGN KEY ("officeLocationId") REFERENCES app_quikhrms."OfficeLocation"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Employee_referredById_fkey`: FOREIGN KEY ("referredById") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Employee_reportingManagerId_fkey`: FOREIGN KEY ("reportingManagerId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Employee_teamId_fkey`: FOREIGN KEY ("teamId") REFERENCES app_quikhrms."Team"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Employee_wfhQuotaGroupId_fkey`: FOREIGN KEY ("wfhQuotaGroupId") REFERENCES app_quikhrms."WfhQuotaGroup"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `Employee_orgId_authUserId_key`: `CREATE UNIQUE INDEX "Employee_orgId_authUserId_key" ON app_quikhrms."Employee" USING btree ("orgId", "authUserId")`
- `Employee_orgId_dateOfJoining_idx`: `CREATE INDEX "Employee_orgId_dateOfJoining_idx" ON app_quikhrms."Employee" USING btree ("orgId", "dateOfJoining")`
- `Employee_orgId_deletedAt_departmentId_status_idx`: `CREATE INDEX "Employee_orgId_deletedAt_departmentId_status_idx" ON app_quikhrms."Employee" USING btree ("orgId", "deletedAt", "departmentId", status)`
- `Employee_orgId_deletedAt_employmentType_idx`: `CREATE INDEX "Employee_orgId_deletedAt_employmentType_idx" ON app_quikhrms."Employee" USING btree ("orgId", "deletedAt", "employmentType")`
- `Employee_orgId_deletedAt_idx`: `CREATE INDEX "Employee_orgId_deletedAt_idx" ON app_quikhrms."Employee" USING btree ("orgId", "deletedAt")`
- `Employee_orgId_deletedAt_status_idx`: `CREATE INDEX "Employee_orgId_deletedAt_status_idx" ON app_quikhrms."Employee" USING btree ("orgId", "deletedAt", status)`
- `Employee_orgId_departmentId_idx`: `CREATE INDEX "Employee_orgId_departmentId_idx" ON app_quikhrms."Employee" USING btree ("orgId", "departmentId")`
- `Employee_orgId_employeeCode_key`: `CREATE UNIQUE INDEX "Employee_orgId_employeeCode_key" ON app_quikhrms."Employee" USING btree ("orgId", "employeeCode")`
- `Employee_orgId_idx`: `CREATE INDEX "Employee_orgId_idx" ON app_quikhrms."Employee" USING btree ("orgId")`
- `Employee_orgId_lastWorkingDate_idx`: `CREATE INDEX "Employee_orgId_lastWorkingDate_idx" ON app_quikhrms."Employee" USING btree ("orgId", "lastWorkingDate")`
- `Employee_orgId_reportingManagerId_idx`: `CREATE INDEX "Employee_orgId_reportingManagerId_idx" ON app_quikhrms."Employee" USING btree ("orgId", "reportingManagerId")`
- `Employee_orgId_status_idx`: `CREATE INDEX "Employee_orgId_status_idx" ON app_quikhrms."Employee" USING btree ("orgId", status)`
- `Employee_orgId_workEmail_idx`: `CREATE INDEX "Employee_orgId_workEmail_idx" ON app_quikhrms."Employee" USING btree ("orgId", "workEmail")`
- `Employee_pkey`: `CREATE UNIQUE INDEX "Employee_pkey" ON app_quikhrms."Employee" USING btree (id)`

---

### EmployeeAppraisal

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `cycleId` | `text` | NOT NULL |  |
| 5 | `status` | `app_quikhrms."EmployeeAppraisalStatus"` | NOT NULL | `'Pending'::app_quikhrms."EmployeeAppraisalStatus"` |
| 6 | `selfRating` | `numeric(3,1)` | NULL |  |
| 7 | `selfComments` | `text` | NULL |  |
| 8 | `selfResponses` | `jsonb` | NULL |  |
| 9 | `managerRating` | `numeric(3,1)` | NULL |  |
| 10 | `managerComments` | `text` | NULL |  |
| 11 | `managerResponses` | `jsonb` | NULL |  |
| 12 | `calibratedRating` | `numeric(3,1)` | NULL |  |
| 13 | `finalRating` | `numeric(3,1)` | NULL |  |
| 14 | `finalBand` | `text` | NULL |  |
| 15 | `promotionRecommendation` | `boolean` | NULL |  |
| 16 | `salaryRevisionRecommended` | `numeric(5,2)` | NULL |  |
| 17 | `employeeAcknowledged` | `boolean` | NOT NULL | `false` |
| 18 | `employeeAcknowledgedAt` | `timestamp(3) without time zone` | NULL |  |
| 19 | `employeeFeedback` | `text` | NULL |  |
| 20 | `createdBy` | `text` | NULL |  |
| 21 | `updatedBy` | `text` | NULL |  |
| 22 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 23 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 24 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `EmployeeAppraisal_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `EmployeeAppraisal_cycleId_fkey`: FOREIGN KEY ("cycleId") REFERENCES app_quikhrms."AppraisalCycle"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `EmployeeAppraisal_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `EmployeeAppraisal_orgId_cycleId_idx`: `CREATE INDEX "EmployeeAppraisal_orgId_cycleId_idx" ON app_quikhrms."EmployeeAppraisal" USING btree ("orgId", "cycleId")`
- `EmployeeAppraisal_orgId_deletedAt_idx`: `CREATE INDEX "EmployeeAppraisal_orgId_deletedAt_idx" ON app_quikhrms."EmployeeAppraisal" USING btree ("orgId", "deletedAt")`
- `EmployeeAppraisal_orgId_employeeId_cycleId_key`: `CREATE UNIQUE INDEX "EmployeeAppraisal_orgId_employeeId_cycleId_key" ON app_quikhrms."EmployeeAppraisal" USING btree ("orgId", "employeeId", "cycleId")`
- `EmployeeAppraisal_orgId_idx`: `CREATE INDEX "EmployeeAppraisal_orgId_idx" ON app_quikhrms."EmployeeAppraisal" USING btree ("orgId")`
- `EmployeeAppraisal_pkey`: `CREATE UNIQUE INDEX "EmployeeAppraisal_pkey" ON app_quikhrms."EmployeeAppraisal" USING btree (id)`

---

### EmployeeKraAssignment

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `scorecardId` | `text` | NOT NULL |  |
| 5 | `cycleId` | `text` | NULL |  |
| 6 | `effectiveFrom` | `date` | NOT NULL |  |
| 7 | `effectiveTo` | `date` | NULL |  |
| 8 | `snapshot` | `jsonb` | NOT NULL |  |
| 9 | `progress` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| 10 | `compositeScore` | `numeric(5,2)` | NULL |  |
| 11 | `status` | `app_quikhrms."KraAssignmentStatus"` | NOT NULL | `'Active'::app_quikhrms."KraAssignmentStatus"` |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 14 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 15 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `EmployeeKraAssignment_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `EmployeeKraAssignment_scorecardId_fkey`: FOREIGN KEY ("scorecardId") REFERENCES app_quikhrms."KraScorecard"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `EmployeeKraAssignment_employeeId_scorecardId_effectiveFrom_key`: `CREATE UNIQUE INDEX "EmployeeKraAssignment_employeeId_scorecardId_effectiveFrom_key" ON app_quikhrms."EmployeeKraAssignment" USING btree ("employeeId", "scorecardId", "effectiveFrom")`
- `EmployeeKraAssignment_orgId_employeeId_idx`: `CREATE INDEX "EmployeeKraAssignment_orgId_employeeId_idx" ON app_quikhrms."EmployeeKraAssignment" USING btree ("orgId", "employeeId")`
- `EmployeeKraAssignment_orgId_idx`: `CREATE INDEX "EmployeeKraAssignment_orgId_idx" ON app_quikhrms."EmployeeKraAssignment" USING btree ("orgId")`
- `EmployeeKraAssignment_orgId_scorecardId_idx`: `CREATE INDEX "EmployeeKraAssignment_orgId_scorecardId_idx" ON app_quikhrms."EmployeeKraAssignment" USING btree ("orgId", "scorecardId")`
- `EmployeeKraAssignment_orgId_status_idx`: `CREATE INDEX "EmployeeKraAssignment_orgId_status_idx" ON app_quikhrms."EmployeeKraAssignment" USING btree ("orgId", status)`
- `EmployeeKraAssignment_pkey`: `CREATE UNIQUE INDEX "EmployeeKraAssignment_pkey" ON app_quikhrms."EmployeeKraAssignment" USING btree (id)`

---

### EmployeeLoan

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `loanType` | `app_quikhrms."LoanType"` | NOT NULL | `'Personal'::app_quikhrms."LoanType"` |
| 5 | `principalAmount` | `numeric(15,2)` | NOT NULL |  |
| 6 | `interestRate` | `numeric(5,2)` | NOT NULL | `0` |
| 7 | `tenureMonths` | `integer` | NOT NULL |  |
| 8 | `emiAmount` | `numeric(15,2)` | NOT NULL |  |
| 9 | `disbursementDate` | `date` | NULL |  |
| 10 | `startDate` | `date` | NULL |  |
| 11 | `endDate` | `date` | NULL |  |
| 12 | `holdUntil` | `date` | NULL |  |
| 13 | `outstandingAmount` | `numeric(15,2)` | NOT NULL |  |
| 14 | `emisPaid` | `integer` | NOT NULL | `0` |
| 15 | `reason` | `text` | NULL |  |
| 16 | `status` | `app_quikhrms."LoanStatus"` | NOT NULL | `'Pending'::app_quikhrms."LoanStatus"` |
| 17 | `approvedBy` | `text` | NULL |  |
| 18 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 19 | `rejectionReason` | `text` | NULL |  |
| 20 | `closedAt` | `timestamp(3) without time zone` | NULL |  |
| 21 | `createdBy` | `text` | NULL |  |
| 22 | `updatedBy` | `text` | NULL |  |
| 23 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 24 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 25 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `EmployeeLoan_pkey`: PRIMARY KEY (id)

**Indexes**

- `EmployeeLoan_orgId_employeeId_idx`: `CREATE INDEX "EmployeeLoan_orgId_employeeId_idx" ON app_quikhrms."EmployeeLoan" USING btree ("orgId", "employeeId")`
- `EmployeeLoan_orgId_idx`: `CREATE INDEX "EmployeeLoan_orgId_idx" ON app_quikhrms."EmployeeLoan" USING btree ("orgId")`
- `EmployeeLoan_orgId_status_idx`: `CREATE INDEX "EmployeeLoan_orgId_status_idx" ON app_quikhrms."EmployeeLoan" USING btree ("orgId", status)`
- `EmployeeLoan_pkey`: `CREATE UNIQUE INDEX "EmployeeLoan_pkey" ON app_quikhrms."EmployeeLoan" USING btree (id)`

---

### EmployeeProvision

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `provisionItemId` | `text` | NULL |  |
| 5 | `name` | `text` | NOT NULL |  |
| 6 | `category` | `app_quikhrms."ProvisionCategory"` | NOT NULL | `'ProvOther'::app_quikhrms."ProvisionCategory"` |
| 7 | `status` | `app_quikhrms."ProvisionStatus"` | NOT NULL | `'ProvPending'::app_quikhrms."ProvisionStatus"` |
| 8 | `assignedTo` | `text` | NULL |  |
| 9 | `notes` | `text` | NULL |  |
| 10 | `dueDate` | `date` | NULL |  |
| 11 | `provisionedAt` | `timestamp(3) without time zone` | NULL |  |
| 12 | `provisionedBy` | `text` | NULL |  |
| 13 | `meta` | `jsonb` | NULL |  |
| 14 | `createdBy` | `text` | NULL |  |
| 15 | `updatedBy` | `text` | NULL |  |
| 16 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 17 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 18 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `EmployeeProvision_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `EmployeeProvision_provisionItemId_fkey`: FOREIGN KEY ("provisionItemId") REFERENCES app_quikhrms."ProvisionItem"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `EmployeeProvision_orgId_assignedTo_idx`: `CREATE INDEX "EmployeeProvision_orgId_assignedTo_idx" ON app_quikhrms."EmployeeProvision" USING btree ("orgId", "assignedTo")`
- `EmployeeProvision_orgId_employeeId_idx`: `CREATE INDEX "EmployeeProvision_orgId_employeeId_idx" ON app_quikhrms."EmployeeProvision" USING btree ("orgId", "employeeId")`
- `EmployeeProvision_orgId_idx`: `CREATE INDEX "EmployeeProvision_orgId_idx" ON app_quikhrms."EmployeeProvision" USING btree ("orgId")`
- `EmployeeProvision_orgId_status_idx`: `CREATE INDEX "EmployeeProvision_orgId_status_idx" ON app_quikhrms."EmployeeProvision" USING btree ("orgId", status)`
- `EmployeeProvision_pkey`: `CREATE UNIQUE INDEX "EmployeeProvision_pkey" ON app_quikhrms."EmployeeProvision" USING btree (id)`

---

### EmployeeSalary

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `structureId` | `text` | NULL |  |
| 5 | `ctc` | `numeric(15,2)` | NOT NULL |  |
| 6 | `currency` | `text` | NOT NULL | `'INR'::text` |
| 7 | `effectiveFrom` | `date` | NOT NULL |  |
| 8 | `effectiveTo` | `date` | NULL |  |
| 9 | `revisionReason` | `text` | NULL |  |
| 10 | `overrides` | `jsonb` | NULL |  |
| 11 | `isActive` | `boolean` | NOT NULL | `true` |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `updatedBy` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 16 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `EmployeeSalary_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `EmployeeSalary_structureId_fkey`: FOREIGN KEY ("structureId") REFERENCES app_quikhrms."SalaryStructure"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `EmployeeSalary_orgId_effectiveFrom_idx`: `CREATE INDEX "EmployeeSalary_orgId_effectiveFrom_idx" ON app_quikhrms."EmployeeSalary" USING btree ("orgId", "effectiveFrom")`
- `EmployeeSalary_orgId_employeeId_idx`: `CREATE INDEX "EmployeeSalary_orgId_employeeId_idx" ON app_quikhrms."EmployeeSalary" USING btree ("orgId", "employeeId")`
- `EmployeeSalary_orgId_employeeId_isActive_deletedAt_idx`: `CREATE INDEX "EmployeeSalary_orgId_employeeId_isActive_deletedAt_idx" ON app_quikhrms."EmployeeSalary" USING btree ("orgId", "employeeId", "isActive", "deletedAt")`
- `EmployeeSalary_orgId_idx`: `CREATE INDEX "EmployeeSalary_orgId_idx" ON app_quikhrms."EmployeeSalary" USING btree ("orgId")`
- `EmployeeSalary_orgId_isActive_effectiveFrom_idx`: `CREATE INDEX "EmployeeSalary_orgId_isActive_effectiveFrom_idx" ON app_quikhrms."EmployeeSalary" USING btree ("orgId", "isActive", "effectiveFrom")`
- `EmployeeSalary_pkey`: `CREATE UNIQUE INDEX "EmployeeSalary_pkey" ON app_quikhrms."EmployeeSalary" USING btree (id)`

---

### EmploymentHistory

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `changeType` | `app_quikhrms."EmploymentChangeType"` | NOT NULL |  |
| 5 | `fromValue` | `jsonb` | NULL |  |
| 6 | `toValue` | `jsonb` | NOT NULL |  |
| 7 | `effectiveDate` | `date` | NOT NULL |  |
| 8 | `reason` | `text` | NULL |  |
| 9 | `approvedBy` | `text` | NULL |  |
| 10 | `letterUrl` | `text` | NULL |  |
| 11 | `notes` | `text` | NULL |  |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `EmploymentHistory_pkey`: PRIMARY KEY (id)

**Indexes**

- `EmploymentHistory_orgId_changeType_idx`: `CREATE INDEX "EmploymentHistory_orgId_changeType_idx" ON app_quikhrms."EmploymentHistory" USING btree ("orgId", "changeType")`
- `EmploymentHistory_orgId_effectiveDate_idx`: `CREATE INDEX "EmploymentHistory_orgId_effectiveDate_idx" ON app_quikhrms."EmploymentHistory" USING btree ("orgId", "effectiveDate")`
- `EmploymentHistory_orgId_employeeId_idx`: `CREATE INDEX "EmploymentHistory_orgId_employeeId_idx" ON app_quikhrms."EmploymentHistory" USING btree ("orgId", "employeeId")`
- `EmploymentHistory_orgId_idx`: `CREATE INDEX "EmploymentHistory_orgId_idx" ON app_quikhrms."EmploymentHistory" USING btree ("orgId")`
- `EmploymentHistory_pkey`: `CREATE UNIQUE INDEX "EmploymentHistory_pkey" ON app_quikhrms."EmploymentHistory" USING btree (id)`

---

### ExpenseApproval

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `claimId` | `text` | NOT NULL |  |
| 4 | `approverId` | `text` | NOT NULL |  |
| 5 | `level` | `integer` | NOT NULL | `1` |
| 6 | `action` | `app_quikhrms."ExpenseApprovalAction"` | NOT NULL |  |
| 7 | `comments` | `text` | NULL |  |
| 8 | `actionAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 9 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `ExpenseApproval_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `ExpenseApproval_claimId_fkey`: FOREIGN KEY ("claimId") REFERENCES app_quikhrms."ExpenseClaim"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `ExpenseApproval_orgId_approverId_idx`: `CREATE INDEX "ExpenseApproval_orgId_approverId_idx" ON app_quikhrms."ExpenseApproval" USING btree ("orgId", "approverId")`
- `ExpenseApproval_orgId_claimId_idx`: `CREATE INDEX "ExpenseApproval_orgId_claimId_idx" ON app_quikhrms."ExpenseApproval" USING btree ("orgId", "claimId")`
- `ExpenseApproval_orgId_idx`: `CREATE INDEX "ExpenseApproval_orgId_idx" ON app_quikhrms."ExpenseApproval" USING btree ("orgId")`
- `ExpenseApproval_pkey`: `CREATE UNIQUE INDEX "ExpenseApproval_pkey" ON app_quikhrms."ExpenseApproval" USING btree (id)`

---

### ExpenseClaim

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `policyId` | `text` | NULL |  |
| 5 | `category` | `app_quikhrms."ExpenseCategory"` | NOT NULL |  |
| 6 | `title` | `text` | NOT NULL |  |
| 7 | `description` | `text` | NULL |  |
| 8 | `totalAmount` | `numeric(15,2)` | NOT NULL |  |
| 9 | `currency` | `text` | NOT NULL | `'INR'::text` |
| 10 | `expenseDate` | `date` | NULL |  |
| 11 | `receiptUrl` | `text` | NULL |  |
| 12 | `receiptFileType` | `text` | NULL |  |
| 13 | `policySnapshot` | `jsonb` | NULL |  |
| 14 | `status` | `app_quikhrms."ExpenseClaimStatus"` | NOT NULL | `'Draft'::app_quikhrms."ExpenseClaimStatus"` |
| 15 | `rejectionReason` | `text` | NULL |  |
| 16 | `submittedAt` | `timestamp(3) without time zone` | NULL |  |
| 17 | `approvedBy` | `text` | NULL |  |
| 18 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 19 | `paidAt` | `timestamp(3) without time zone` | NULL |  |
| 20 | `createdBy` | `text` | NULL |  |
| 21 | `updatedBy` | `text` | NULL |  |
| 22 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 23 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 24 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `ExpenseClaim_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `ExpenseClaim_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `ExpenseClaim_policyId_fkey`: FOREIGN KEY ("policyId") REFERENCES app_quikhrms."ExpensePolicy"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `ExpenseClaim_orgId_deletedAt_idx`: `CREATE INDEX "ExpenseClaim_orgId_deletedAt_idx" ON app_quikhrms."ExpenseClaim" USING btree ("orgId", "deletedAt")`
- `ExpenseClaim_orgId_employeeId_idx`: `CREATE INDEX "ExpenseClaim_orgId_employeeId_idx" ON app_quikhrms."ExpenseClaim" USING btree ("orgId", "employeeId")`
- `ExpenseClaim_orgId_idx`: `CREATE INDEX "ExpenseClaim_orgId_idx" ON app_quikhrms."ExpenseClaim" USING btree ("orgId")`
- `ExpenseClaim_orgId_status_idx`: `CREATE INDEX "ExpenseClaim_orgId_status_idx" ON app_quikhrms."ExpenseClaim" USING btree ("orgId", status)`
- `ExpenseClaim_pkey`: `CREATE UNIQUE INDEX "ExpenseClaim_pkey" ON app_quikhrms."ExpenseClaim" USING btree (id)`

---

### ExpensePolicy

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `category` | `text` | NOT NULL |  |
| 5 | `maxPerTransaction` | `numeric(15,2)` | NULL |  |
| 6 | `maxPerMonth` | `numeric(15,2)` | NULL |  |
| 7 | `maxPerYear` | `numeric(15,2)` | NULL |  |
| 8 | `requiresReceipt` | `boolean` | NOT NULL | `true` |
| 9 | `receiptThreshold` | `numeric(15,2)` | NOT NULL | `500` |
| 10 | `requiresPreApproval` | `boolean` | NOT NULL | `false` |
| 11 | `approvalLevels` | `integer` | NOT NULL | `1` |
| 12 | `approvalChain` | `jsonb` | NULL |  |
| 13 | `applicableTo` | `jsonb` | NULL |  |
| 14 | `isActive` | `boolean` | NOT NULL | `true` |
| 15 | `createdBy` | `text` | NULL |  |
| 16 | `updatedBy` | `text` | NULL |  |
| 17 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 18 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 19 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `ExpensePolicy_pkey`: PRIMARY KEY (id)

**Indexes**

- `ExpensePolicy_orgId_deletedAt_idx`: `CREATE INDEX "ExpensePolicy_orgId_deletedAt_idx" ON app_quikhrms."ExpensePolicy" USING btree ("orgId", "deletedAt")`
- `ExpensePolicy_orgId_idx`: `CREATE INDEX "ExpensePolicy_orgId_idx" ON app_quikhrms."ExpensePolicy" USING btree ("orgId")`
- `ExpensePolicy_orgId_isActive_idx`: `CREATE INDEX "ExpensePolicy_orgId_isActive_idx" ON app_quikhrms."ExpensePolicy" USING btree ("orgId", "isActive")`
- `ExpensePolicy_pkey`: `CREATE UNIQUE INDEX "ExpensePolicy_pkey" ON app_quikhrms."ExpensePolicy" USING btree (id)`

---

### Form12BBDeclaration

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `financialYear` | `text` | NOT NULL |  |
| 5 | `hraClaimed` | `boolean` | NOT NULL | `false` |
| 6 | `rentPaid` | `numeric(15,2)` | NOT NULL | `0` |
| 7 | `landlordName` | `text` | NULL |  |
| 8 | `landlordPan` | `text` | NULL |  |
| 9 | `landlordAddress` | `text` | NULL |  |
| 10 | `ltaClaimed` | `boolean` | NOT NULL | `false` |
| 11 | `ltaAmount` | `numeric(15,2)` | NOT NULL | `0` |
| 12 | `ltaDetails` | `text` | NULL |  |
| 13 | `homeLoanInterest` | `numeric(15,2)` | NOT NULL | `0` |
| 14 | `lenderName` | `text` | NULL |  |
| 15 | `lenderPan` | `text` | NULL |  |
| 16 | `lenderAddress` | `text` | NULL |  |
| 17 | `lenderType` | `text` | NULL |  |
| 18 | `section80C` | `numeric(15,2)` | NOT NULL | `0` |
| 19 | `section80CCC` | `numeric(15,2)` | NOT NULL | `0` |
| 20 | `section80CCD1` | `numeric(15,2)` | NOT NULL | `0` |
| 21 | `section80D` | `numeric(15,2)` | NOT NULL | `0` |
| 22 | `section80E` | `numeric(15,2)` | NOT NULL | `0` |
| 23 | `section80G` | `numeric(15,2)` | NOT NULL | `0` |
| 24 | `section80TTA` | `numeric(15,2)` | NOT NULL | `0` |
| 25 | `nps80CCD1B` | `numeric(15,2)` | NOT NULL | `0` |
| 26 | `otherDeductions` | `jsonb` | NULL |  |
| 27 | `verificationPlace` | `text` | NULL |  |
| 28 | `verificationDate` | `date` | NULL |  |
| 29 | `verificationName` | `text` | NULL |  |
| 30 | `verificationDesignation` | `text` | NULL |  |
| 31 | `declaredAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 32 | `signedFileUrl` | `text` | NULL |  |
| 33 | `documents` | `jsonb` | NULL |  |
| 34 | `status` | `text` | NOT NULL | `'Submitted'::text` |
| 35 | `createdBy` | `text` | NULL |  |
| 36 | `updatedBy` | `text` | NULL |  |
| 37 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 38 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 39 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Form12BBDeclaration_pkey`: PRIMARY KEY (id)

**Indexes**

- `Form12BBDeclaration_orgId_employeeId_financialYear_key`: `CREATE UNIQUE INDEX "Form12BBDeclaration_orgId_employeeId_financialYear_key" ON app_quikhrms."Form12BBDeclaration" USING btree ("orgId", "employeeId", "financialYear")`
- `Form12BBDeclaration_orgId_financialYear_idx`: `CREATE INDEX "Form12BBDeclaration_orgId_financialYear_idx" ON app_quikhrms."Form12BBDeclaration" USING btree ("orgId", "financialYear")`
- `Form12BBDeclaration_orgId_idx`: `CREATE INDEX "Form12BBDeclaration_orgId_idx" ON app_quikhrms."Form12BBDeclaration" USING btree ("orgId")`
- `Form12BBDeclaration_pkey`: `CREATE UNIQUE INDEX "Form12BBDeclaration_pkey" ON app_quikhrms."Form12BBDeclaration" USING btree (id)`

---

### FullAndFinalSettlement

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `resignationDate` | `date` | NOT NULL |  |
| 5 | `lastWorkingDate` | `date` | NOT NULL |  |
| 6 | `reason` | `text` | NULL |  |
| 7 | `status` | `app_quikhrms."SettlementStatus"` | NOT NULL | `'Draft'::app_quikhrms."SettlementStatus"` |
| 8 | `pendingSalary` | `numeric(15,2)` | NOT NULL | `0` |
| 9 | `leaveEncashment` | `numeric(15,2)` | NOT NULL | `0` |
| 10 | `gratuityAmount` | `numeric(15,2)` | NOT NULL | `0` |
| 11 | `bonusAmount` | `numeric(15,2)` | NOT NULL | `0` |
| 12 | `noticePayRecovery` | `numeric(15,2)` | NOT NULL | `0` |
| 13 | `loanRecovery` | `numeric(15,2)` | NOT NULL | `0` |
| 14 | `otherEarnings` | `numeric(15,2)` | NOT NULL | `0` |
| 15 | `otherDeductions` | `numeric(15,2)` | NOT NULL | `0` |
| 16 | `tdsDeducted` | `numeric(15,2)` | NOT NULL | `0` |
| 17 | `netSettlement` | `numeric(15,2)` | NOT NULL | `0` |
| 18 | `details` | `jsonb` | NULL |  |
| 19 | `payslipId` | `text` | NULL |  |
| 20 | `payRunId` | `text` | NULL |  |
| 21 | `approvedBy` | `text` | NULL |  |
| 22 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 23 | `paidAt` | `timestamp(3) without time zone` | NULL |  |
| 24 | `notes` | `text` | NULL |  |
| 25 | `createdBy` | `text` | NULL |  |
| 26 | `updatedBy` | `text` | NULL |  |
| 27 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 28 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 29 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `FullAndFinalSettlement_pkey`: PRIMARY KEY (id)

**Indexes**

- `FullAndFinalSettlement_orgId_employeeId_key`: `CREATE UNIQUE INDEX "FullAndFinalSettlement_orgId_employeeId_key" ON app_quikhrms."FullAndFinalSettlement" USING btree ("orgId", "employeeId")`
- `FullAndFinalSettlement_orgId_idx`: `CREATE INDEX "FullAndFinalSettlement_orgId_idx" ON app_quikhrms."FullAndFinalSettlement" USING btree ("orgId")`
- `FullAndFinalSettlement_orgId_status_idx`: `CREATE INDEX "FullAndFinalSettlement_orgId_status_idx" ON app_quikhrms."FullAndFinalSettlement" USING btree ("orgId", status)`
- `FullAndFinalSettlement_pkey`: `CREATE UNIQUE INDEX "FullAndFinalSettlement_pkey" ON app_quikhrms."FullAndFinalSettlement" USING btree (id)`

---

### Goal

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `parentGoalId` | `text` | NULL |  |
| 5 | `title` | `text` | NOT NULL |  |
| 6 | `description` | `text` | NULL |  |
| 7 | `type` | `app_quikhrms."GoalType"` | NOT NULL | `'Individual'::app_quikhrms."GoalType"` |
| 8 | `category` | `app_quikhrms."GoalCategory"` | NOT NULL | `'Business'::app_quikhrms."GoalCategory"` |
| 9 | `metric` | `text` | NULL |  |
| 10 | `targetValue` | `numeric(15,2)` | NOT NULL | `0` |
| 11 | `currentValue` | `numeric(15,2)` | NOT NULL | `0` |
| 12 | `unit` | `text` | NULL |  |
| 13 | `weight` | `numeric(5,2)` | NOT NULL | `0` |
| 14 | `startDate` | `date` | NOT NULL |  |
| 15 | `dueDate` | `date` | NOT NULL |  |
| 16 | `status` | `app_quikhrms."GoalStatus"` | NOT NULL | `'NotStarted'::app_quikhrms."GoalStatus"` |
| 17 | `progress` | `numeric(5,2)` | NOT NULL | `0` |
| 18 | `alignedTo` | `text` | NULL |  |
| 19 | `visibility` | `app_quikhrms."GoalVisibility"` | NOT NULL | `'TeamVisible'::app_quikhrms."GoalVisibility"` |
| 20 | `createdBy` | `text` | NULL |  |
| 21 | `updatedBy` | `text` | NULL |  |
| 22 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 23 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 24 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Goal_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Goal_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `Goal_parentGoalId_fkey`: FOREIGN KEY ("parentGoalId") REFERENCES app_quikhrms."Goal"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `Goal_orgId_deletedAt_idx`: `CREATE INDEX "Goal_orgId_deletedAt_idx" ON app_quikhrms."Goal" USING btree ("orgId", "deletedAt")`
- `Goal_orgId_employeeId_idx`: `CREATE INDEX "Goal_orgId_employeeId_idx" ON app_quikhrms."Goal" USING btree ("orgId", "employeeId")`
- `Goal_orgId_idx`: `CREATE INDEX "Goal_orgId_idx" ON app_quikhrms."Goal" USING btree ("orgId")`
- `Goal_orgId_status_idx`: `CREATE INDEX "Goal_orgId_status_idx" ON app_quikhrms."Goal" USING btree ("orgId", status)`
- `Goal_pkey`: `CREATE UNIQUE INDEX "Goal_pkey" ON app_quikhrms."Goal" USING btree (id)`

---

### GoalCheckIn

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `goalId` | `text` | NOT NULL |  |
| 3 | `date` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 4 | `previousValue` | `numeric(15,2)` | NOT NULL |  |
| 5 | `currentValue` | `numeric(15,2)` | NOT NULL |  |
| 6 | `note` | `text` | NULL |  |
| 7 | `updatedById` | `text` | NOT NULL |  |
| 8 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `GoalCheckIn_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `GoalCheckIn_goalId_fkey`: FOREIGN KEY ("goalId") REFERENCES app_quikhrms."Goal"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `GoalCheckIn_updatedById_fkey`: FOREIGN KEY ("updatedById") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `GoalCheckIn_pkey`: `CREATE UNIQUE INDEX "GoalCheckIn_pkey" ON app_quikhrms."GoalCheckIn" USING btree (id)`

---

### Grade

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `level` | `integer` | NOT NULL | `0` |
| 5 | `minSalary` | `numeric(15,2)` | NULL |  |
| 6 | `maxSalary` | `numeric(15,2)` | NULL |  |
| 7 | `createdBy` | `text` | NULL |  |
| 8 | `updatedBy` | `text` | NULL |  |
| 9 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 10 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 11 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Grade_pkey`: PRIMARY KEY (id)

**Indexes**

- `Grade_orgId_deletedAt_idx`: `CREATE INDEX "Grade_orgId_deletedAt_idx" ON app_quikhrms."Grade" USING btree ("orgId", "deletedAt")`
- `Grade_orgId_idx`: `CREATE INDEX "Grade_orgId_idx" ON app_quikhrms."Grade" USING btree ("orgId")`
- `Grade_pkey`: `CREATE UNIQUE INDEX "Grade_pkey" ON app_quikhrms."Grade" USING btree (id)`

---

### GratuityRecord

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `computeDate` | `date` | NOT NULL |  |
| 5 | `yearsOfService` | `numeric(5,2)` | NOT NULL |  |
| 6 | `lastBasicDA` | `numeric(15,2)` | NOT NULL |  |
| 7 | `formula` | `text` | NOT NULL | `'PaymentOfGratuityAct'::text` |
| 8 | `computedAmount` | `numeric(15,2)` | NOT NULL |  |
| 9 | `taxExemptAmount` | `numeric(15,2)` | NOT NULL | `0` |
| 10 | `taxableAmount` | `numeric(15,2)` | NOT NULL | `0` |
| 11 | `paid` | `boolean` | NOT NULL | `false` |
| 12 | `paidOn` | `date` | NULL |  |
| 13 | `notes` | `text` | NULL |  |
| 14 | `createdBy` | `text` | NULL |  |
| 15 | `updatedBy` | `text` | NULL |  |
| 16 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 17 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 18 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `GratuityRecord_pkey`: PRIMARY KEY (id)

**Indexes**

- `GratuityRecord_orgId_employeeId_idx`: `CREATE INDEX "GratuityRecord_orgId_employeeId_idx" ON app_quikhrms."GratuityRecord" USING btree ("orgId", "employeeId")`
- `GratuityRecord_orgId_idx`: `CREATE INDEX "GratuityRecord_orgId_idx" ON app_quikhrms."GratuityRecord" USING btree ("orgId")`
- `GratuityRecord_pkey`: `CREATE UNIQUE INDEX "GratuityRecord_pkey" ON app_quikhrms."GratuityRecord" USING btree (id)`

---

### HiringPipeline

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `stages` | `jsonb` | NOT NULL |  |
| 5 | `isDefault` | `boolean` | NOT NULL | `false` |
| 6 | `createdBy` | `text` | NULL |  |
| 7 | `updatedBy` | `text` | NULL |  |
| 8 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 9 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 10 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `HiringPipeline_pkey`: PRIMARY KEY (id)

**Indexes**

- `HiringPipeline_orgId_deletedAt_idx`: `CREATE INDEX "HiringPipeline_orgId_deletedAt_idx" ON app_quikhrms."HiringPipeline" USING btree ("orgId", "deletedAt")`
- `HiringPipeline_orgId_idx`: `CREATE INDEX "HiringPipeline_orgId_idx" ON app_quikhrms."HiringPipeline" USING btree ("orgId")`
- `HiringPipeline_pkey`: `CREATE UNIQUE INDEX "HiringPipeline_pkey" ON app_quikhrms."HiringPipeline" USING btree (id)`

---

### Interview

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `applicationId` | `text` | NOT NULL |  |
| 4 | `round` | `integer` | NOT NULL | `1` |
| 5 | `type` | `app_quikhrms."InterviewType"` | NOT NULL | `'Video'::app_quikhrms."InterviewType"` |
| 6 | `interviewerId` | `text` | NOT NULL |  |
| 7 | `scheduledAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 8 | `duration` | `integer` | NOT NULL | `60` |
| 9 | `location` | `text` | NULL |  |
| 10 | `meetingLink` | `text` | NULL |  |
| 11 | `status` | `app_quikhrms."InterviewStatus"` | NOT NULL | `'IntScheduled'::app_quikhrms."InterviewStatus"` |
| 12 | `candidateFeedback` | `text` | NULL |  |
| 13 | `feedbackToken` | `text` | NULL |  |
| 14 | `feedbackTokenExpiresAt` | `timestamp(3) without time zone` | NULL |  |
| 15 | `feedbackRequestSentAt` | `timestamp(3) without time zone` | NULL |  |
| 16 | `lastReminderAt` | `timestamp(3) without time zone` | NULL |  |
| 17 | `reminderCount` | `integer` | NOT NULL | `0` |
| 18 | `overallRating` | `integer` | NULL |  |
| 19 | `recommendation` | `app_quikhrms."InterviewRecommendation"` | NULL |  |
| 20 | `criteria` | `jsonb` | NULL |  |
| 21 | `strengths` | `text` | NULL |  |
| 22 | `concerns` | `text` | NULL |  |
| 23 | `overallComments` | `text` | NULL |  |
| 24 | `scorecardSubmittedAt` | `timestamp(3) without time zone` | NULL |  |
| 25 | `createdBy` | `text` | NULL |  |
| 26 | `updatedBy` | `text` | NULL |  |
| 27 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 28 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 29 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Interview_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Interview_applicationId_fkey`: FOREIGN KEY ("applicationId") REFERENCES app_quikhrms."JobApplication"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `Interview_interviewerId_fkey`: FOREIGN KEY ("interviewerId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `Interview_feedbackToken_key`: `CREATE UNIQUE INDEX "Interview_feedbackToken_key" ON app_quikhrms."Interview" USING btree ("feedbackToken")`
- `Interview_orgId_applicationId_idx`: `CREATE INDEX "Interview_orgId_applicationId_idx" ON app_quikhrms."Interview" USING btree ("orgId", "applicationId")`
- `Interview_orgId_deletedAt_idx`: `CREATE INDEX "Interview_orgId_deletedAt_idx" ON app_quikhrms."Interview" USING btree ("orgId", "deletedAt")`
- `Interview_orgId_idx`: `CREATE INDEX "Interview_orgId_idx" ON app_quikhrms."Interview" USING btree ("orgId")`
- `Interview_pkey`: `CREATE UNIQUE INDEX "Interview_pkey" ON app_quikhrms."Interview" USING btree (id)`

---

### InvestmentProof

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `financialYear` | `text` | NOT NULL |  |
| 5 | `section` | `text` | NOT NULL |  |
| 6 | `investmentType` | `text` | NOT NULL |  |
| 7 | `declaredAmount` | `numeric(15,2)` | NOT NULL |  |
| 8 | `proofAmount` | `numeric(15,2)` | NOT NULL |  |
| 9 | `approvedAmount` | `numeric(15,2)` | NULL |  |
| 10 | `fileUrl` | `text` | NULL |  |
| 11 | `remarks` | `text` | NULL |  |
| 12 | `status` | `app_quikhrms."InvestmentProofStatus"` | NOT NULL | `'Submitted'::app_quikhrms."InvestmentProofStatus"` |
| 13 | `reviewedBy` | `text` | NULL |  |
| 14 | `reviewedAt` | `timestamp(3) without time zone` | NULL |  |
| 15 | `rejectionReason` | `text` | NULL |  |
| 16 | `createdBy` | `text` | NULL |  |
| 17 | `updatedBy` | `text` | NULL |  |
| 18 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 19 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 20 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `InvestmentProof_pkey`: PRIMARY KEY (id)

**Indexes**

- `InvestmentProof_orgId_employeeId_financialYear_status_idx`: `CREATE INDEX "InvestmentProof_orgId_employeeId_financialYear_status_idx" ON app_quikhrms."InvestmentProof" USING btree ("orgId", "employeeId", "financialYear", status)`
- `InvestmentProof_orgId_employeeId_idx`: `CREATE INDEX "InvestmentProof_orgId_employeeId_idx" ON app_quikhrms."InvestmentProof" USING btree ("orgId", "employeeId")`
- `InvestmentProof_orgId_financialYear_idx`: `CREATE INDEX "InvestmentProof_orgId_financialYear_idx" ON app_quikhrms."InvestmentProof" USING btree ("orgId", "financialYear")`
- `InvestmentProof_orgId_idx`: `CREATE INDEX "InvestmentProof_orgId_idx" ON app_quikhrms."InvestmentProof" USING btree ("orgId")`
- `InvestmentProof_orgId_status_idx`: `CREATE INDEX "InvestmentProof_orgId_status_idx" ON app_quikhrms."InvestmentProof" USING btree ("orgId", status)`
- `InvestmentProof_pkey`: `CREATE UNIQUE INDEX "InvestmentProof_pkey" ON app_quikhrms."InvestmentProof" USING btree (id)`

---

### Invitation

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `email` | `text` | NOT NULL |  |
| 4 | `firstName` | `text` | NULL |  |
| 5 | `lastName` | `text` | NULL |  |
| 6 | `roleIds` | `text[]` | NULL |  |
| 7 | `departmentId` | `text` | NULL |  |
| 8 | `designationId` | `text` | NULL |  |
| 9 | `managerId` | `text` | NULL |  |
| 10 | `token` | `text` | NOT NULL |  |
| 11 | `centralInviteToken` | `text` | NULL |  |
| 12 | `expiresAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 13 | `status` | `app_quikhrms."InvitationStatus"` | NOT NULL | `'Pending'::app_quikhrms."InvitationStatus"` |
| 14 | `invitedBy` | `text` | NOT NULL |  |
| 15 | `acceptedAt` | `timestamp(3) without time zone` | NULL |  |
| 16 | `employeeId` | `text` | NULL |  |
| 17 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 18 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 19 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Invitation_pkey`: PRIMARY KEY (id)

**Indexes**

- `Invitation_orgId_email_idx`: `CREATE INDEX "Invitation_orgId_email_idx" ON app_quikhrms."Invitation" USING btree ("orgId", email)`
- `Invitation_orgId_status_idx`: `CREATE INDEX "Invitation_orgId_status_idx" ON app_quikhrms."Invitation" USING btree ("orgId", status)`
- `Invitation_pkey`: `CREATE UNIQUE INDEX "Invitation_pkey" ON app_quikhrms."Invitation" USING btree (id)`
- `Invitation_token_key`: `CREATE UNIQUE INDEX "Invitation_token_key" ON app_quikhrms."Invitation" USING btree (token)`

---

### JobApplication

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `candidateId` | `text` | NOT NULL |  |
| 4 | `requisitionId` | `text` | NOT NULL |  |
| 5 | `appliedDate` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 6 | `currentStage` | `text` | NULL |  |
| 7 | `stageHistory` | `jsonb` | NULL |  |
| 8 | `status` | `app_quikhrms."ApplicationStatus"` | NOT NULL | `'AppActive'::app_quikhrms."ApplicationStatus"` |
| 9 | `aiMatchScore` | `numeric(5,2)` | NULL |  |
| 10 | `aiMatchAnalysis` | `jsonb` | NULL |  |
| 11 | `rejectionReason` | `text` | NULL |  |
| 12 | `rejectionStage` | `text` | NULL |  |
| 13 | `offerStatus` | `app_quikhrms."OfferStatus"` | NULL |  |
| 14 | `offerDesignation` | `text` | NULL |  |
| 15 | `offerDepartmentId` | `text` | NULL |  |
| 16 | `offerReportingToId` | `text` | NULL |  |
| 17 | `offeredCTC` | `numeric(15,2)` | NULL |  |
| 18 | `offeredComponents` | `jsonb` | NULL |  |
| 19 | `offerJoiningDate` | `date` | NULL |  |
| 20 | `offerJoiningBonus` | `numeric(15,2)` | NULL |  |
| 21 | `offerRelocationBonus` | `numeric(15,2)` | NULL |  |
| 22 | `offerEquityGrant` | `text` | NULL |  |
| 23 | `offerSentAt` | `timestamp(3) without time zone` | NULL |  |
| 24 | `offerRespondedAt` | `timestamp(3) without time zone` | NULL |  |
| 25 | `offerExpiresAt` | `timestamp(3) without time zone` | NULL |  |
| 26 | `offerDeclineReason` | `text` | NULL |  |
| 27 | `offerCounterOfferCTC` | `numeric(15,2)` | NULL |  |
| 28 | `offerNegotiationNotes` | `text` | NULL |  |
| 29 | `offerLetterUrl` | `text` | NULL |  |
| 30 | `offerCreatedAt` | `timestamp(3) without time zone` | NULL |  |
| 31 | `offerCreatedBy` | `text` | NULL |  |
| 32 | `createdBy` | `text` | NULL |  |
| 33 | `updatedBy` | `text` | NULL |  |
| 34 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 35 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 36 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `JobApplication_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `JobApplication_candidateId_fkey`: FOREIGN KEY ("candidateId") REFERENCES app_quikhrms."Candidate"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `JobApplication_requisitionId_fkey`: FOREIGN KEY ("requisitionId") REFERENCES app_quikhrms."JobRequisition"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `JobApplication_orgId_candidateId_requisitionId_key`: `CREATE UNIQUE INDEX "JobApplication_orgId_candidateId_requisitionId_key" ON app_quikhrms."JobApplication" USING btree ("orgId", "candidateId", "requisitionId")`
- `JobApplication_orgId_candidateId_status_idx`: `CREATE INDEX "JobApplication_orgId_candidateId_status_idx" ON app_quikhrms."JobApplication" USING btree ("orgId", "candidateId", status)`
- `JobApplication_orgId_deletedAt_idx`: `CREATE INDEX "JobApplication_orgId_deletedAt_idx" ON app_quikhrms."JobApplication" USING btree ("orgId", "deletedAt")`
- `JobApplication_orgId_idx`: `CREATE INDEX "JobApplication_orgId_idx" ON app_quikhrms."JobApplication" USING btree ("orgId")`
- `JobApplication_orgId_offerStatus_idx`: `CREATE INDEX "JobApplication_orgId_offerStatus_idx" ON app_quikhrms."JobApplication" USING btree ("orgId", "offerStatus")`
- `JobApplication_orgId_requisitionId_currentStage_idx`: `CREATE INDEX "JobApplication_orgId_requisitionId_currentStage_idx" ON app_quikhrms."JobApplication" USING btree ("orgId", "requisitionId", "currentStage")`
- `JobApplication_orgId_requisitionId_idx`: `CREATE INDEX "JobApplication_orgId_requisitionId_idx" ON app_quikhrms."JobApplication" USING btree ("orgId", "requisitionId")`
- `JobApplication_orgId_requisitionId_status_createdAt_idx`: `CREATE INDEX "JobApplication_orgId_requisitionId_status_createdAt_idx" ON app_quikhrms."JobApplication" USING btree ("orgId", "requisitionId", status, "createdAt" DESC)`
- `JobApplication_orgId_status_idx`: `CREATE INDEX "JobApplication_orgId_status_idx" ON app_quikhrms."JobApplication" USING btree ("orgId", status)`
- `JobApplication_pkey`: `CREATE UNIQUE INDEX "JobApplication_pkey" ON app_quikhrms."JobApplication" USING btree (id)`

---

### JobRequisition

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `requisitionNumber` | `text` | NOT NULL |  |
| 4 | `title` | `text` | NOT NULL |  |
| 5 | `departmentId` | `text` | NULL |  |
| 6 | `reportingToId` | `text` | NULL |  |
| 7 | `positions` | `integer` | NOT NULL | `1` |
| 8 | `filledPositions` | `integer` | NOT NULL | `0` |
| 9 | `type` | `app_quikhrms."RequisitionType"` | NOT NULL | `'NewPosition'::app_quikhrms."RequisitionType"` |
| 10 | `employmentType` | `app_quikhrms."EmploymentType"` | NOT NULL | `'FullTime'::app_quikhrms."EmploymentType"` |
| 11 | `workLocation` | `app_quikhrms."WorkLocation"` | NOT NULL | `'Office'::app_quikhrms."WorkLocation"` |
| 12 | `experienceMin` | `integer` | NULL |  |
| 13 | `experienceMax` | `integer` | NULL |  |
| 14 | `salaryMin` | `numeric(15,2)` | NULL |  |
| 15 | `salaryMax` | `numeric(15,2)` | NULL |  |
| 16 | `salaryCurrency` | `text` | NOT NULL | `'INR'::text` |
| 17 | `jobDescription` | `text` | NULL |  |
| 18 | `responsibilities` | `jsonb` | NULL |  |
| 19 | `requirements` | `jsonb` | NULL |  |
| 20 | `niceToHave` | `jsonb` | NULL |  |
| 21 | `skills` | `jsonb` | NULL |  |
| 22 | `skillWeights` | `jsonb` | NULL |  |
| 23 | `education` | `text` | NULL |  |
| 24 | `benefits` | `jsonb` | NULL |  |
| 25 | `rolePurpose` | `text` | NULL |  |
| 26 | `status` | `app_quikhrms."RequisitionStatus"` | NOT NULL | `'ReqDraft'::app_quikhrms."RequisitionStatus"` |
| 27 | `priority` | `app_quikhrms."RequisitionPriority"` | NOT NULL | `'Medium'::app_quikhrms."RequisitionPriority"` |
| 28 | `careerPageVisible` | `boolean` | NOT NULL | `true` |
| 29 | `internalPostingOnly` | `boolean` | NOT NULL | `false` |
| 30 | `referralBonusAmount` | `numeric(15,2)` | NULL |  |
| 31 | `createdById` | `text` | NULL |  |
| 32 | `hiringManagerId` | `text` | NULL |  |
| 33 | `recruiterId` | `text` | NULL |  |
| 34 | `pipelineId` | `text` | NULL |  |
| 35 | `raisedById` | `text` | NULL |  |
| 36 | `raisedAt` | `timestamp(3) without time zone` | NULL |  |
| 37 | `justification` | `text` | NULL |  |
| 38 | `closedDate` | `date` | NULL |  |
| 39 | `closureReason` | `text` | NULL |  |
| 40 | `createdBy` | `text` | NULL |  |
| 41 | `updatedBy` | `text` | NULL |  |
| 42 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 43 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 44 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `JobRequisition_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `JobRequisition_createdById_fkey`: FOREIGN KEY ("createdById") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `JobRequisition_departmentId_fkey`: FOREIGN KEY ("departmentId") REFERENCES app_quikhrms."Department"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `JobRequisition_hiringManagerId_fkey`: FOREIGN KEY ("hiringManagerId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `JobRequisition_pipelineId_fkey`: FOREIGN KEY ("pipelineId") REFERENCES app_quikhrms."HiringPipeline"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `JobRequisition_raisedById_fkey`: FOREIGN KEY ("raisedById") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `JobRequisition_recruiterId_fkey`: FOREIGN KEY ("recruiterId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `JobRequisition_orgId_deletedAt_idx`: `CREATE INDEX "JobRequisition_orgId_deletedAt_idx" ON app_quikhrms."JobRequisition" USING btree ("orgId", "deletedAt")`
- `JobRequisition_orgId_idx`: `CREATE INDEX "JobRequisition_orgId_idx" ON app_quikhrms."JobRequisition" USING btree ("orgId")`
- `JobRequisition_orgId_pipelineId_idx`: `CREATE INDEX "JobRequisition_orgId_pipelineId_idx" ON app_quikhrms."JobRequisition" USING btree ("orgId", "pipelineId")`
- `JobRequisition_orgId_requisitionNumber_key`: `CREATE UNIQUE INDEX "JobRequisition_orgId_requisitionNumber_key" ON app_quikhrms."JobRequisition" USING btree ("orgId", "requisitionNumber")`
- `JobRequisition_orgId_status_idx`: `CREATE INDEX "JobRequisition_orgId_status_idx" ON app_quikhrms."JobRequisition" USING btree ("orgId", status)`
- `JobRequisition_pkey`: `CREATE UNIQUE INDEX "JobRequisition_pkey" ON app_quikhrms."JobRequisition" USING btree (id)`

---

### JobScheduleEntry

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `date` | `date` | NOT NULL |  |
| 5 | `startTime` | `text` | NOT NULL |  |
| 6 | `endTime` | `text` | NOT NULL |  |
| 7 | `hours` | `numeric(5,2)` | NOT NULL |  |
| 8 | `jobId` | `text` | NULL |  |
| 9 | `projectId` | `text` | NULL |  |
| 10 | `note` | `text` | NULL |  |
| 11 | `status` | `app_quikhrms."ScheduleStatus"` | NOT NULL | `'ScheduleDraft'::app_quikhrms."ScheduleStatus"` |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `updatedBy` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 16 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `JobScheduleEntry_pkey`: PRIMARY KEY (id)

**Indexes**

- `JobScheduleEntry_orgId_deletedAt_idx`: `CREATE INDEX "JobScheduleEntry_orgId_deletedAt_idx" ON app_quikhrms."JobScheduleEntry" USING btree ("orgId", "deletedAt")`
- `JobScheduleEntry_orgId_employeeId_date_idx`: `CREATE INDEX "JobScheduleEntry_orgId_employeeId_date_idx" ON app_quikhrms."JobScheduleEntry" USING btree ("orgId", "employeeId", date)`
- `JobScheduleEntry_orgId_idx`: `CREATE INDEX "JobScheduleEntry_orgId_idx" ON app_quikhrms."JobScheduleEntry" USING btree ("orgId")`
- `JobScheduleEntry_orgId_status_idx`: `CREATE INDEX "JobScheduleEntry_orgId_status_idx" ON app_quikhrms."JobScheduleEntry" USING btree ("orgId", status)`
- `JobScheduleEntry_pkey`: `CREATE UNIQUE INDEX "JobScheduleEntry_pkey" ON app_quikhrms."JobScheduleEntry" USING btree (id)`

---

### KeyResult

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `goalId` | `text` | NOT NULL |  |
| 3 | `title` | `text` | NOT NULL |  |
| 4 | `targetValue` | `numeric(15,2)` | NOT NULL | `0` |
| 5 | `currentValue` | `numeric(15,2)` | NOT NULL | `0` |
| 6 | `unit` | `text` | NULL |  |
| 7 | `weight` | `numeric(5,2)` | NOT NULL | `0` |
| 8 | `status` | `app_quikhrms."KeyResultStatus"` | NOT NULL | `'NotStarted'::app_quikhrms."KeyResultStatus"` |
| 9 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 10 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `KeyResult_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `KeyResult_goalId_fkey`: FOREIGN KEY ("goalId") REFERENCES app_quikhrms."Goal"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `KeyResult_pkey`: `CREATE UNIQUE INDEX "KeyResult_pkey" ON app_quikhrms."KeyResult" USING btree (id)`

---

### KraScorecard

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `description` | `text` | NULL |  |
| 5 | `designationId` | `text` | NULL |  |
| 6 | `departmentId` | `text` | NULL |  |
| 7 | `tags` | `jsonb` | NULL |  |
| 8 | `effectiveFrom` | `date` | NOT NULL |  |
| 9 | `isActive` | `boolean` | NOT NULL | `true` |
| 10 | `createdBy` | `text` | NULL |  |
| 11 | `updatedBy` | `text` | NULL |  |
| 12 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 13 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 14 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `KraScorecard_pkey`: PRIMARY KEY (id)

**Indexes**

- `KraScorecard_orgId_deletedAt_idx`: `CREATE INDEX "KraScorecard_orgId_deletedAt_idx" ON app_quikhrms."KraScorecard" USING btree ("orgId", "deletedAt")`
- `KraScorecard_orgId_departmentId_idx`: `CREATE INDEX "KraScorecard_orgId_departmentId_idx" ON app_quikhrms."KraScorecard" USING btree ("orgId", "departmentId")`
- `KraScorecard_orgId_designationId_idx`: `CREATE INDEX "KraScorecard_orgId_designationId_idx" ON app_quikhrms."KraScorecard" USING btree ("orgId", "designationId")`
- `KraScorecard_orgId_idx`: `CREATE INDEX "KraScorecard_orgId_idx" ON app_quikhrms."KraScorecard" USING btree ("orgId")`
- `KraScorecard_pkey`: `CREATE UNIQUE INDEX "KraScorecard_pkey" ON app_quikhrms."KraScorecard" USING btree (id)`

---

### KraTemplateEntry

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `scorecardId` | `text` | NOT NULL |  |
| 3 | `title` | `text` | NOT NULL |  |
| 4 | `description` | `text` | NULL |  |
| 5 | `weight` | `numeric(5,2)` | NOT NULL |  |
| 6 | `sortOrder` | `integer` | NOT NULL | `0` |
| 7 | `kpis` | `jsonb` | NOT NULL | `'[]'::jsonb` |

**Primary Key**

- `KraTemplateEntry_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `KraTemplateEntry_scorecardId_fkey`: FOREIGN KEY ("scorecardId") REFERENCES app_quikhrms."KraScorecard"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `KraTemplateEntry_pkey`: `CREATE UNIQUE INDEX "KraTemplateEntry_pkey" ON app_quikhrms."KraTemplateEntry" USING btree (id)`
- `KraTemplateEntry_scorecardId_idx`: `CREATE INDEX "KraTemplateEntry_scorecardId_idx" ON app_quikhrms."KraTemplateEntry" USING btree ("scorecardId")`

---

### LWFConfig

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `enabled` | `boolean` | NOT NULL | `false` |
| 4 | `state` | `text` | NOT NULL |  |
| 5 | `calcType` | `text` | NOT NULL | `'Flat'::text` |
| 6 | `employeeContribution` | `numeric(10,2)` | NOT NULL |  |
| 7 | `employerContribution` | `numeric(10,2)` | NOT NULL |  |
| 8 | `employeeRate` | `numeric(6,4)` | NULL |  |
| 9 | `employerRate` | `numeric(6,4)` | NULL |  |
| 10 | `employeeCap` | `numeric(10,2)` | NULL |  |
| 11 | `employerCap` | `numeric(10,2)` | NULL |  |
| 12 | `deductionCycle` | `app_quikhrms."LWFCycle"` | NOT NULL | `'HalfYearly'::app_quikhrms."LWFCycle"` |
| 13 | `createdBy` | `text` | NULL |  |
| 14 | `updatedBy` | `text` | NULL |  |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `LWFConfig_pkey`: PRIMARY KEY (id)

**Indexes**

- `LWFConfig_orgId_idx`: `CREATE INDEX "LWFConfig_orgId_idx" ON app_quikhrms."LWFConfig" USING btree ("orgId")`
- `LWFConfig_orgId_state_key`: `CREATE UNIQUE INDEX "LWFConfig_orgId_state_key" ON app_quikhrms."LWFConfig" USING btree ("orgId", state)`
- `LWFConfig_pkey`: `CREATE UNIQUE INDEX "LWFConfig_pkey" ON app_quikhrms."LWFConfig" USING btree (id)`

---

### LeaveApproval

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `leaveRequestId` | `text` | NOT NULL |  |
| 4 | `approverId` | `text` | NOT NULL |  |
| 5 | `level` | `integer` | NOT NULL | `1` |
| 6 | `status` | `app_quikhrms."LeaveApprovalStatus"` | NOT NULL | `'Pending'::app_quikhrms."LeaveApprovalStatus"` |
| 7 | `comment` | `text` | NULL |  |
| 8 | `actionAt` | `timestamp(3) without time zone` | NULL |  |
| 9 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 10 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `LeaveApproval_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `LeaveApproval_approverId_fkey`: FOREIGN KEY ("approverId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `LeaveApproval_leaveRequestId_fkey`: FOREIGN KEY ("leaveRequestId") REFERENCES app_quikhrms."LeaveRequest"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `LeaveApproval_orgId_approverId_idx`: `CREATE INDEX "LeaveApproval_orgId_approverId_idx" ON app_quikhrms."LeaveApproval" USING btree ("orgId", "approverId")`
- `LeaveApproval_orgId_leaveRequestId_idx`: `CREATE INDEX "LeaveApproval_orgId_leaveRequestId_idx" ON app_quikhrms."LeaveApproval" USING btree ("orgId", "leaveRequestId")`
- `LeaveApproval_pkey`: `CREATE UNIQUE INDEX "LeaveApproval_pkey" ON app_quikhrms."LeaveApproval" USING btree (id)`

---

### LeaveBalance

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `leaveTypeId` | `text` | NOT NULL |  |
| 5 | `year` | `integer` | NOT NULL |  |
| 6 | `opening` | `numeric(5,2)` | NOT NULL | `0` |
| 7 | `accrued` | `numeric(5,2)` | NOT NULL | `0` |
| 8 | `taken` | `numeric(5,2)` | NOT NULL | `0` |
| 9 | `adjusted` | `numeric(5,2)` | NOT NULL | `0` |
| 10 | `carriedForward` | `numeric(5,2)` | NOT NULL | `0` |
| 11 | `encashed` | `numeric(5,2)` | NOT NULL | `0` |
| 12 | `lapsed` | `numeric(5,2)` | NOT NULL | `0` |
| 13 | `createdBy` | `text` | NULL |  |
| 14 | `updatedBy` | `text` | NULL |  |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 17 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `LeaveBalance_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `LeaveBalance_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `LeaveBalance_leaveTypeId_fkey`: FOREIGN KEY ("leaveTypeId") REFERENCES app_quikhrms."LeaveType"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `LeaveBalance_orgId_employeeId_idx`: `CREATE INDEX "LeaveBalance_orgId_employeeId_idx" ON app_quikhrms."LeaveBalance" USING btree ("orgId", "employeeId")`
- `LeaveBalance_orgId_employeeId_leaveTypeId_year_key`: `CREATE UNIQUE INDEX "LeaveBalance_orgId_employeeId_leaveTypeId_year_key" ON app_quikhrms."LeaveBalance" USING btree ("orgId", "employeeId", "leaveTypeId", year)`
- `LeaveBalance_orgId_employeeId_year_idx`: `CREATE INDEX "LeaveBalance_orgId_employeeId_year_idx" ON app_quikhrms."LeaveBalance" USING btree ("orgId", "employeeId", year)`
- `LeaveBalance_orgId_idx`: `CREATE INDEX "LeaveBalance_orgId_idx" ON app_quikhrms."LeaveBalance" USING btree ("orgId")`
- `LeaveBalance_pkey`: `CREATE UNIQUE INDEX "LeaveBalance_pkey" ON app_quikhrms."LeaveBalance" USING btree (id)`

---

### LeaveGroup

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `description` | `text` | NULL |  |
| 5 | `isActive` | `boolean` | NOT NULL | `true` |
| 6 | `createdBy` | `text` | NULL |  |
| 7 | `updatedBy` | `text` | NULL |  |
| 8 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 9 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 10 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `LeaveGroup_pkey`: PRIMARY KEY (id)

**Indexes**

- `LeaveGroup_orgId_deletedAt_idx`: `CREATE INDEX "LeaveGroup_orgId_deletedAt_idx" ON app_quikhrms."LeaveGroup" USING btree ("orgId", "deletedAt")`
- `LeaveGroup_orgId_idx`: `CREATE INDEX "LeaveGroup_orgId_idx" ON app_quikhrms."LeaveGroup" USING btree ("orgId")`
- `LeaveGroup_orgId_name_key`: `CREATE UNIQUE INDEX "LeaveGroup_orgId_name_key" ON app_quikhrms."LeaveGroup" USING btree ("orgId", name)`
- `LeaveGroup_pkey`: `CREATE UNIQUE INDEX "LeaveGroup_pkey" ON app_quikhrms."LeaveGroup" USING btree (id)`

---

### LeaveGroupAssignment

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `leaveGroupId` | `text` | NOT NULL |  |
| 4 | `assigneeType` | `text` | NOT NULL |  |
| 5 | `employeeId` | `text` | NULL |  |
| 6 | `roleId` | `text` | NULL |  |
| 7 | `createdBy` | `text` | NULL |  |
| 8 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `LeaveGroupAssignment_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `LeaveGroupAssignment_leaveGroupId_fkey`: FOREIGN KEY ("leaveGroupId") REFERENCES app_quikhrms."LeaveGroup"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `LeaveGroupAssignment_leaveGroupId_assigneeType_employeeId_r_key`: `CREATE UNIQUE INDEX "LeaveGroupAssignment_leaveGroupId_assigneeType_employeeId_r_key" ON app_quikhrms."LeaveGroupAssignment" USING btree ("leaveGroupId", "assigneeType", "employeeId", "roleId")`
- `LeaveGroupAssignment_orgId_employeeId_idx`: `CREATE INDEX "LeaveGroupAssignment_orgId_employeeId_idx" ON app_quikhrms."LeaveGroupAssignment" USING btree ("orgId", "employeeId")`
- `LeaveGroupAssignment_orgId_leaveGroupId_idx`: `CREATE INDEX "LeaveGroupAssignment_orgId_leaveGroupId_idx" ON app_quikhrms."LeaveGroupAssignment" USING btree ("orgId", "leaveGroupId")`
- `LeaveGroupAssignment_orgId_roleId_idx`: `CREATE INDEX "LeaveGroupAssignment_orgId_roleId_idx" ON app_quikhrms."LeaveGroupAssignment" USING btree ("orgId", "roleId")`
- `LeaveGroupAssignment_pkey`: `CREATE UNIQUE INDEX "LeaveGroupAssignment_pkey" ON app_quikhrms."LeaveGroupAssignment" USING btree (id)`

---

### LeaveGroupItem

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `leaveGroupId` | `text` | NOT NULL |  |
| 4 | `leaveTypeId` | `text` | NOT NULL |  |
| 5 | `overrideQuota` | `numeric(5,2)` | NULL |  |
| 6 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `LeaveGroupItem_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `LeaveGroupItem_leaveGroupId_fkey`: FOREIGN KEY ("leaveGroupId") REFERENCES app_quikhrms."LeaveGroup"(id) ON UPDATE CASCADE ON DELETE CASCADE
- `LeaveGroupItem_leaveTypeId_fkey`: FOREIGN KEY ("leaveTypeId") REFERENCES app_quikhrms."LeaveType"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `LeaveGroupItem_leaveGroupId_leaveTypeId_key`: `CREATE UNIQUE INDEX "LeaveGroupItem_leaveGroupId_leaveTypeId_key" ON app_quikhrms."LeaveGroupItem" USING btree ("leaveGroupId", "leaveTypeId")`
- `LeaveGroupItem_orgId_leaveGroupId_idx`: `CREATE INDEX "LeaveGroupItem_orgId_leaveGroupId_idx" ON app_quikhrms."LeaveGroupItem" USING btree ("orgId", "leaveGroupId")`
- `LeaveGroupItem_pkey`: `CREATE UNIQUE INDEX "LeaveGroupItem_pkey" ON app_quikhrms."LeaveGroupItem" USING btree (id)`

---

### LeavePolicy

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `version` | `integer` | NOT NULL | `1` |
| 5 | `status` | `app_quikhrms."LeavePolicyStatus"` | NOT NULL | `'Draft'::app_quikhrms."LeavePolicyStatus"` |
| 6 | `description` | `text` | NULL |  |
| 7 | `sourceFileUrl` | `text` | NULL |  |
| 8 | `sourceFileName` | `text` | NULL |  |
| 9 | `sourceFileType` | `text` | NULL |  |
| 10 | `extractedRules` | `jsonb` | NULL |  |
| 11 | `approvedRules` | `jsonb` | NULL |  |
| 12 | `extractedAt` | `timestamp(3) without time zone` | NULL |  |
| 13 | `extractedBy` | `text` | NULL |  |
| 14 | `extractionLog` | `jsonb` | NULL |  |
| 15 | `effectiveFrom` | `timestamp(3) without time zone` | NULL |  |
| 16 | `effectiveTo` | `timestamp(3) without time zone` | NULL |  |
| 17 | `appliesToDeptIds` | `jsonb` | NULL |  |
| 18 | `appliesToRoleIds` | `jsonb` | NULL |  |
| 19 | `appliesToEmploymentTypes` | `jsonb` | NULL |  |
| 20 | `approvedBy` | `text` | NULL |  |
| 21 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 22 | `createdBy` | `text` | NULL |  |
| 23 | `updatedBy` | `text` | NULL |  |
| 24 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 25 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 26 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `LeavePolicy_pkey`: PRIMARY KEY (id)

**Indexes**

- `LeavePolicy_orgId_deletedAt_idx`: `CREATE INDEX "LeavePolicy_orgId_deletedAt_idx" ON app_quikhrms."LeavePolicy" USING btree ("orgId", "deletedAt")`
- `LeavePolicy_orgId_idx`: `CREATE INDEX "LeavePolicy_orgId_idx" ON app_quikhrms."LeavePolicy" USING btree ("orgId")`
- `LeavePolicy_orgId_status_effectiveFrom_idx`: `CREATE INDEX "LeavePolicy_orgId_status_effectiveFrom_idx" ON app_quikhrms."LeavePolicy" USING btree ("orgId", status, "effectiveFrom")`
- `LeavePolicy_orgId_status_idx`: `CREATE INDEX "LeavePolicy_orgId_status_idx" ON app_quikhrms."LeavePolicy" USING btree ("orgId", status)`
- `LeavePolicy_pkey`: `CREATE UNIQUE INDEX "LeavePolicy_pkey" ON app_quikhrms."LeavePolicy" USING btree (id)`

---

### LeaveRequest

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `leaveTypeId` | `text` | NOT NULL |  |
| 5 | `startDate` | `date` | NOT NULL |  |
| 6 | `endDate` | `date` | NOT NULL |  |
| 7 | `duration` | `numeric(5,2)` | NOT NULL |  |
| 8 | `dayBreakdown` | `jsonb` | NULL |  |
| 9 | `reason` | `text` | NOT NULL |  |
| 10 | `attachments` | `jsonb` | NULL |  |
| 11 | `status` | `app_quikhrms."LeaveRequestStatus"` | NOT NULL | `'Pending'::app_quikhrms."LeaveRequestStatus"` |
| 12 | `appliedOn` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 13 | `cancelReason` | `text` | NULL |  |
| 14 | `isPlanned` | `boolean` | NOT NULL | `true` |
| 15 | `createdBy` | `text` | NULL |  |
| 16 | `updatedBy` | `text` | NULL |  |
| 17 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 18 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 19 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `LeaveRequest_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `LeaveRequest_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `LeaveRequest_leaveTypeId_fkey`: FOREIGN KEY ("leaveTypeId") REFERENCES app_quikhrms."LeaveType"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `LeaveRequest_orgId_deletedAt_idx`: `CREATE INDEX "LeaveRequest_orgId_deletedAt_idx" ON app_quikhrms."LeaveRequest" USING btree ("orgId", "deletedAt")`
- `LeaveRequest_orgId_employeeId_idx`: `CREATE INDEX "LeaveRequest_orgId_employeeId_idx" ON app_quikhrms."LeaveRequest" USING btree ("orgId", "employeeId")`
- `LeaveRequest_orgId_employeeId_status_createdAt_idx`: `CREATE INDEX "LeaveRequest_orgId_employeeId_status_createdAt_idx" ON app_quikhrms."LeaveRequest" USING btree ("orgId", "employeeId", status, "createdAt" DESC)`
- `LeaveRequest_orgId_idx`: `CREATE INDEX "LeaveRequest_orgId_idx" ON app_quikhrms."LeaveRequest" USING btree ("orgId")`
- `LeaveRequest_orgId_startDate_endDate_idx`: `CREATE INDEX "LeaveRequest_orgId_startDate_endDate_idx" ON app_quikhrms."LeaveRequest" USING btree ("orgId", "startDate", "endDate")`
- `LeaveRequest_orgId_status_deletedAt_idx`: `CREATE INDEX "LeaveRequest_orgId_status_deletedAt_idx" ON app_quikhrms."LeaveRequest" USING btree ("orgId", status, "deletedAt")`
- `LeaveRequest_orgId_status_idx`: `CREATE INDEX "LeaveRequest_orgId_status_idx" ON app_quikhrms."LeaveRequest" USING btree ("orgId", status)`
- `LeaveRequest_pkey`: `CREATE UNIQUE INDEX "LeaveRequest_pkey" ON app_quikhrms."LeaveRequest" USING btree (id)`

---

### LeaveType

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `code` | `text` | NOT NULL |  |
| 5 | `color` | `text` | NULL |  |
| 6 | `isPaid` | `boolean` | NOT NULL | `true` |
| 7 | `isCarryForward` | `boolean` | NOT NULL | `false` |
| 8 | `maxCarryForward` | `integer` | NULL |  |
| 9 | `isEncashable` | `boolean` | NOT NULL | `false` |
| 10 | `maxEncashment` | `integer` | NULL |  |
| 11 | `accrualType` | `app_quikhrms."LeaveAccrualType"` | NOT NULL | `'Yearly'::app_quikhrms."LeaveAccrualType"` |
| 12 | `accrualCount` | `numeric(5,2)` | NOT NULL | `0` |
| 13 | `maxBalance` | `integer` | NOT NULL | `0` |
| 14 | `minConsecutiveDays` | `integer` | NULL |  |
| 15 | `maxConsecutiveDays` | `integer` | NULL |  |
| 16 | `maxPerMonth` | `integer` | NULL |  |
| 17 | `maxPerYear` | `integer` | NULL |  |
| 18 | `isOnceInLifetime` | `boolean` | NOT NULL | `false` |
| 19 | `applicableGender` | `text` | NULL |  |
| 20 | `applicableEmploymentType` | `jsonb` | NULL |  |
| 21 | `applicableAfterDays` | `integer` | NOT NULL | `0` |
| 22 | `requiresDocumentation` | `boolean` | NOT NULL | `false` |
| 23 | `documentationAfterDays` | `integer` | NULL |  |
| 24 | `isNegativeBalanceAllowed` | `boolean` | NOT NULL | `false` |
| 25 | `maxNegativeBalance` | `integer` | NULL |  |
| 26 | `includesHolidays` | `boolean` | NOT NULL | `false` |
| 27 | `includesWeekoffs` | `boolean` | NOT NULL | `false` |
| 28 | `isHalfDayAllowed` | `boolean` | NOT NULL | `true` |
| 29 | `isHourlyAllowed` | `boolean` | NOT NULL | `false` |
| 30 | `clubbingRestrictions` | `jsonb` | NULL |  |
| 31 | `isCompOff` | `boolean` | NOT NULL | `false` |
| 32 | `compOffExpiryDays` | `integer` | NULL |  |
| 33 | `isDefault` | `boolean` | NOT NULL | `false` |
| 34 | `createdBy` | `text` | NULL |  |
| 35 | `updatedBy` | `text` | NULL |  |
| 36 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 37 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 38 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `LeaveType_pkey`: PRIMARY KEY (id)

**Indexes**

- `LeaveType_orgId_code_key`: `CREATE UNIQUE INDEX "LeaveType_orgId_code_key" ON app_quikhrms."LeaveType" USING btree ("orgId", code)`
- `LeaveType_orgId_deletedAt_idx`: `CREATE INDEX "LeaveType_orgId_deletedAt_idx" ON app_quikhrms."LeaveType" USING btree ("orgId", "deletedAt")`
- `LeaveType_orgId_idx`: `CREATE INDEX "LeaveType_orgId_idx" ON app_quikhrms."LeaveType" USING btree ("orgId")`
- `LeaveType_pkey`: `CREATE UNIQUE INDEX "LeaveType_pkey" ON app_quikhrms."LeaveType" USING btree (id)`

---

### LegalEntity

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `code` | `text` | NOT NULL |  |
| 4 | `name` | `text` | NOT NULL |  |
| 5 | `registeredName` | `text` | NULL |  |
| 6 | `pan` | `text` | NULL |  |
| 7 | `tan` | `text` | NULL |  |
| 8 | `gstin` | `text` | NULL |  |
| 9 | `cin` | `text` | NULL |  |
| 10 | `country` | `text` | NOT NULL | `'IN'::text` |
| 11 | `currency` | `text` | NOT NULL | `'INR'::text` |
| 12 | `state` | `text` | NULL |  |
| 13 | `addressLine1` | `text` | NULL |  |
| 14 | `addressLine2` | `text` | NULL |  |
| 15 | `city` | `text` | NULL |  |
| 16 | `pincode` | `text` | NULL |  |
| 17 | `pfEstablishmentCode` | `text` | NULL |  |
| 18 | `esiEstablishmentCode` | `text` | NULL |  |
| 19 | `ptRegistrationNumber` | `text` | NULL |  |
| 20 | `lwfRegistrationNumber` | `text` | NULL |  |
| 21 | `status` | `app_quikhrms."LegalEntityStatus"` | NOT NULL | `'Active'::app_quikhrms."LegalEntityStatus"` |
| 22 | `isPrimary` | `boolean` | NOT NULL | `false` |
| 23 | `notes` | `text` | NULL |  |
| 24 | `createdBy` | `text` | NULL |  |
| 25 | `updatedBy` | `text` | NULL |  |
| 26 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 27 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 28 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `LegalEntity_pkey`: PRIMARY KEY (id)

**Indexes**

- `LegalEntity_orgId_code_key`: `CREATE UNIQUE INDEX "LegalEntity_orgId_code_key" ON app_quikhrms."LegalEntity" USING btree ("orgId", code)`
- `LegalEntity_orgId_idx`: `CREATE INDEX "LegalEntity_orgId_idx" ON app_quikhrms."LegalEntity" USING btree ("orgId")`
- `LegalEntity_orgId_status_idx`: `CREATE INDEX "LegalEntity_orgId_status_idx" ON app_quikhrms."LegalEntity" USING btree ("orgId", status)`
- `LegalEntity_pkey`: `CREATE UNIQUE INDEX "LegalEntity_pkey" ON app_quikhrms."LegalEntity" USING btree (id)`

---

### LoanRepayment

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `loanId` | `text` | NOT NULL |  |
| 4 | `payRunId` | `text` | NULL |  |
| 5 | `payslipId` | `text` | NULL |  |
| 6 | `amount` | `numeric(15,2)` | NOT NULL |  |
| 7 | `repaidOn` | `date` | NOT NULL |  |
| 8 | `emiNumber` | `integer` | NOT NULL |  |
| 9 | `isManual` | `boolean` | NOT NULL | `false` |
| 10 | `notes` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `LoanRepayment_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `LoanRepayment_loanId_fkey`: FOREIGN KEY ("loanId") REFERENCES app_quikhrms."EmployeeLoan"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `LoanRepayment_loanId_idx`: `CREATE INDEX "LoanRepayment_loanId_idx" ON app_quikhrms."LoanRepayment" USING btree ("loanId")`
- `LoanRepayment_orgId_idx`: `CREATE INDEX "LoanRepayment_orgId_idx" ON app_quikhrms."LoanRepayment" USING btree ("orgId")`
- `LoanRepayment_orgId_payRunId_idx`: `CREATE INDEX "LoanRepayment_orgId_payRunId_idx" ON app_quikhrms."LoanRepayment" USING btree ("orgId", "payRunId")`
- `LoanRepayment_pkey`: `CREATE UNIQUE INDEX "LoanRepayment_pkey" ON app_quikhrms."LoanRepayment" USING btree (id)`

---

### Notification

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `type` | `app_quikhrms."NotificationType"` | NOT NULL | `'Info'::app_quikhrms."NotificationType"` |
| 5 | `channel` | `app_quikhrms."NotificationChannel"` | NOT NULL | `'InApp'::app_quikhrms."NotificationChannel"` |
| 6 | `title` | `text` | NOT NULL |  |
| 7 | `message` | `text` | NOT NULL |  |
| 8 | `link` | `text` | NULL |  |
| 9 | `isRead` | `boolean` | NOT NULL | `false` |
| 10 | `readAt` | `timestamp(3) without time zone` | NULL |  |
| 11 | `entityType` | `text` | NULL |  |
| 12 | `entityId` | `text` | NULL |  |
| 13 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `Notification_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Notification_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `Notification_orgId_employeeId_createdAt_idx`: `CREATE INDEX "Notification_orgId_employeeId_createdAt_idx" ON app_quikhrms."Notification" USING btree ("orgId", "employeeId", "createdAt" DESC)`
- `Notification_orgId_employeeId_idx`: `CREATE INDEX "Notification_orgId_employeeId_idx" ON app_quikhrms."Notification" USING btree ("orgId", "employeeId")`
- `Notification_orgId_employeeId_isRead_createdAt_idx`: `CREATE INDEX "Notification_orgId_employeeId_isRead_createdAt_idx" ON app_quikhrms."Notification" USING btree ("orgId", "employeeId", "isRead", "createdAt" DESC)`
- `Notification_orgId_employeeId_isRead_idx`: `CREATE INDEX "Notification_orgId_employeeId_isRead_idx" ON app_quikhrms."Notification" USING btree ("orgId", "employeeId", "isRead")`
- `Notification_orgId_entityType_entityId_idx`: `CREATE INDEX "Notification_orgId_entityType_entityId_idx" ON app_quikhrms."Notification" USING btree ("orgId", "entityType", "entityId")`
- `Notification_pkey`: `CREATE UNIQUE INDEX "Notification_pkey" ON app_quikhrms."Notification" USING btree (id)`

---

### OffboardingInstance

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `templateId` | `text` | NULL |  |
| 5 | `resignationDate` | `date` | NOT NULL |  |
| 6 | `lastWorkingDate` | `date` | NOT NULL |  |
| 7 | `reason` | `app_quikhrms."OffboardingReason"` | NOT NULL | `'Resignation'::app_quikhrms."OffboardingReason"` |
| 8 | `status` | `app_quikhrms."OffboardingStatus"` | NOT NULL | `'Initiated'::app_quikhrms."OffboardingStatus"` |
| 9 | `exitInterviewDone` | `boolean` | NOT NULL | `false` |
| 10 | `exitInterviewNotes` | `text` | NULL |  |
| 11 | `exitInterviewAt` | `timestamp(3) without time zone` | NULL |  |
| 12 | `notes` | `text` | NULL |  |
| 13 | `createdBy` | `text` | NULL |  |
| 14 | `updatedBy` | `text` | NULL |  |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 17 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `OffboardingInstance_pkey`: PRIMARY KEY (id)

**Indexes**

- `OffboardingInstance_orgId_deletedAt_idx`: `CREATE INDEX "OffboardingInstance_orgId_deletedAt_idx" ON app_quikhrms."OffboardingInstance" USING btree ("orgId", "deletedAt")`
- `OffboardingInstance_orgId_employeeId_idx`: `CREATE INDEX "OffboardingInstance_orgId_employeeId_idx" ON app_quikhrms."OffboardingInstance" USING btree ("orgId", "employeeId")`
- `OffboardingInstance_orgId_employeeId_key`: `CREATE UNIQUE INDEX "OffboardingInstance_orgId_employeeId_key" ON app_quikhrms."OffboardingInstance" USING btree ("orgId", "employeeId")`
- `OffboardingInstance_orgId_idx`: `CREATE INDEX "OffboardingInstance_orgId_idx" ON app_quikhrms."OffboardingInstance" USING btree ("orgId")`
- `OffboardingInstance_orgId_status_idx`: `CREATE INDEX "OffboardingInstance_orgId_status_idx" ON app_quikhrms."OffboardingInstance" USING btree ("orgId", status)`
- `OffboardingInstance_pkey`: `CREATE UNIQUE INDEX "OffboardingInstance_pkey" ON app_quikhrms."OffboardingInstance" USING btree (id)`

---

### OffboardingTask

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `instanceId` | `text` | NOT NULL |  |
| 4 | `title` | `text` | NOT NULL |  |
| 5 | `description` | `text` | NULL |  |
| 6 | `assigneeId` | `text` | NULL |  |
| 7 | `department` | `text` | NULL |  |
| 8 | `category` | `app_quikhrms."OffboardingTaskCategory"` | NOT NULL | `'Clearance'::app_quikhrms."OffboardingTaskCategory"` |
| 9 | `status` | `app_quikhrms."OnboardingTaskStatus"` | NOT NULL | `'TaskPending'::app_quikhrms."OnboardingTaskStatus"` |
| 10 | `completedAt` | `timestamp(3) without time zone` | NULL |  |
| 11 | `completedBy` | `text` | NULL |  |
| 12 | `notes` | `text` | NULL |  |
| 13 | `sortOrder` | `integer` | NOT NULL | `0` |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `OffboardingTask_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `OffboardingTask_instanceId_fkey`: FOREIGN KEY ("instanceId") REFERENCES app_quikhrms."OffboardingInstance"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `OffboardingTask_orgId_assigneeId_idx`: `CREATE INDEX "OffboardingTask_orgId_assigneeId_idx" ON app_quikhrms."OffboardingTask" USING btree ("orgId", "assigneeId")`
- `OffboardingTask_orgId_department_idx`: `CREATE INDEX "OffboardingTask_orgId_department_idx" ON app_quikhrms."OffboardingTask" USING btree ("orgId", department)`
- `OffboardingTask_orgId_idx`: `CREATE INDEX "OffboardingTask_orgId_idx" ON app_quikhrms."OffboardingTask" USING btree ("orgId")`
- `OffboardingTask_orgId_instanceId_idx`: `CREATE INDEX "OffboardingTask_orgId_instanceId_idx" ON app_quikhrms."OffboardingTask" USING btree ("orgId", "instanceId")`
- `OffboardingTask_orgId_status_idx`: `CREATE INDEX "OffboardingTask_orgId_status_idx" ON app_quikhrms."OffboardingTask" USING btree ("orgId", status)`
- `OffboardingTask_pkey`: `CREATE UNIQUE INDEX "OffboardingTask_pkey" ON app_quikhrms."OffboardingTask" USING btree (id)`

---

### OfficeLocation

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `address` | `text` | NULL |  |
| 5 | `city` | `text` | NULL |  |
| 6 | `state` | `text` | NULL |  |
| 7 | `country` | `text` | NULL |  |
| 8 | `zipCode` | `text` | NULL |  |
| 9 | `timezone` | `text` | NULL |  |
| 10 | `latitude` | `numeric(10,7)` | NULL |  |
| 11 | `longitude` | `numeric(10,7)` | NULL |  |
| 12 | `isHeadquarter` | `boolean` | NOT NULL | `false` |
| 13 | `createdBy` | `text` | NULL |  |
| 14 | `updatedBy` | `text` | NULL |  |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 17 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `OfficeLocation_pkey`: PRIMARY KEY (id)

**Indexes**

- `OfficeLocation_orgId_deletedAt_idx`: `CREATE INDEX "OfficeLocation_orgId_deletedAt_idx" ON app_quikhrms."OfficeLocation" USING btree ("orgId", "deletedAt")`
- `OfficeLocation_orgId_idx`: `CREATE INDEX "OfficeLocation_orgId_idx" ON app_quikhrms."OfficeLocation" USING btree ("orgId")`
- `OfficeLocation_pkey`: `CREATE UNIQUE INDEX "OfficeLocation_pkey" ON app_quikhrms."OfficeLocation" USING btree (id)`

---

### OnboardingInstance

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `templateId` | `text` | NULL |  |
| 5 | `startDate` | `date` | NOT NULL |  |
| 6 | `status` | `app_quikhrms."OnboardingStatus"` | NOT NULL | `'NotStarted'::app_quikhrms."OnboardingStatus"` |
| 7 | `completedAt` | `timestamp(3) without time zone` | NULL |  |
| 8 | `notes` | `text` | NULL |  |
| 9 | `createdBy` | `text` | NULL |  |
| 10 | `updatedBy` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 12 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 13 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `OnboardingInstance_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `OnboardingInstance_templateId_fkey`: FOREIGN KEY ("templateId") REFERENCES app_quikhrms."OnboardingTemplate"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `OnboardingInstance_orgId_deletedAt_idx`: `CREATE INDEX "OnboardingInstance_orgId_deletedAt_idx" ON app_quikhrms."OnboardingInstance" USING btree ("orgId", "deletedAt")`
- `OnboardingInstance_orgId_employeeId_idx`: `CREATE INDEX "OnboardingInstance_orgId_employeeId_idx" ON app_quikhrms."OnboardingInstance" USING btree ("orgId", "employeeId")`
- `OnboardingInstance_orgId_employeeId_key`: `CREATE UNIQUE INDEX "OnboardingInstance_orgId_employeeId_key" ON app_quikhrms."OnboardingInstance" USING btree ("orgId", "employeeId")`
- `OnboardingInstance_orgId_idx`: `CREATE INDEX "OnboardingInstance_orgId_idx" ON app_quikhrms."OnboardingInstance" USING btree ("orgId")`
- `OnboardingInstance_orgId_status_idx`: `CREATE INDEX "OnboardingInstance_orgId_status_idx" ON app_quikhrms."OnboardingInstance" USING btree ("orgId", status)`
- `OnboardingInstance_pkey`: `CREATE UNIQUE INDEX "OnboardingInstance_pkey" ON app_quikhrms."OnboardingInstance" USING btree (id)`

---

### OnboardingTask

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `instanceId` | `text` | NOT NULL |  |
| 4 | `title` | `text` | NOT NULL |  |
| 5 | `description` | `text` | NULL |  |
| 6 | `assigneeId` | `text` | NULL |  |
| 7 | `assigneeRole` | `app_quikhrms."AssigneeRole"` | NOT NULL | `'HRRole'::app_quikhrms."AssigneeRole"` |
| 8 | `category` | `app_quikhrms."OnboardingTaskCategory"` | NOT NULL | `'TaskOther'::app_quikhrms."OnboardingTaskCategory"` |
| 9 | `dueDate` | `date` | NULL |  |
| 10 | `status` | `app_quikhrms."OnboardingTaskStatus"` | NOT NULL | `'TaskPending'::app_quikhrms."OnboardingTaskStatus"` |
| 11 | `completedAt` | `timestamp(3) without time zone` | NULL |  |
| 12 | `completedBy` | `text` | NULL |  |
| 13 | `notes` | `text` | NULL |  |
| 14 | `sortOrder` | `integer` | NOT NULL | `0` |
| 15 | `isMandatory` | `boolean` | NOT NULL | `true` |
| 16 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 17 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `OnboardingTask_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `OnboardingTask_instanceId_fkey`: FOREIGN KEY ("instanceId") REFERENCES app_quikhrms."OnboardingInstance"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `OnboardingTask_orgId_assigneeId_idx`: `CREATE INDEX "OnboardingTask_orgId_assigneeId_idx" ON app_quikhrms."OnboardingTask" USING btree ("orgId", "assigneeId")`
- `OnboardingTask_orgId_idx`: `CREATE INDEX "OnboardingTask_orgId_idx" ON app_quikhrms."OnboardingTask" USING btree ("orgId")`
- `OnboardingTask_orgId_instanceId_idx`: `CREATE INDEX "OnboardingTask_orgId_instanceId_idx" ON app_quikhrms."OnboardingTask" USING btree ("orgId", "instanceId")`
- `OnboardingTask_orgId_status_idx`: `CREATE INDEX "OnboardingTask_orgId_status_idx" ON app_quikhrms."OnboardingTask" USING btree ("orgId", status)`
- `OnboardingTask_pkey`: `CREATE UNIQUE INDEX "OnboardingTask_pkey" ON app_quikhrms."OnboardingTask" USING btree (id)`

---

### OnboardingTemplate

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `description` | `text` | NULL |  |
| 5 | `departmentId` | `text` | NULL |  |
| 6 | `designationId` | `text` | NULL |  |
| 7 | `tasks` | `jsonb` | NOT NULL |  |
| 8 | `isActive` | `boolean` | NOT NULL | `true` |
| 9 | `createdBy` | `text` | NULL |  |
| 10 | `updatedBy` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 12 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 13 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `OnboardingTemplate_pkey`: PRIMARY KEY (id)

**Indexes**

- `OnboardingTemplate_orgId_deletedAt_idx`: `CREATE INDEX "OnboardingTemplate_orgId_deletedAt_idx" ON app_quikhrms."OnboardingTemplate" USING btree ("orgId", "deletedAt")`
- `OnboardingTemplate_orgId_departmentId_idx`: `CREATE INDEX "OnboardingTemplate_orgId_departmentId_idx" ON app_quikhrms."OnboardingTemplate" USING btree ("orgId", "departmentId")`
- `OnboardingTemplate_orgId_idx`: `CREATE INDEX "OnboardingTemplate_orgId_idx" ON app_quikhrms."OnboardingTemplate" USING btree ("orgId")`
- `OnboardingTemplate_pkey`: `CREATE UNIQUE INDEX "OnboardingTemplate_pkey" ON app_quikhrms."OnboardingTemplate" USING btree (id)`

---

### OneTimeEarning

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `kind` | `app_quikhrms."OneTimeEarningKind"` | NOT NULL |  |
| 5 | `category` | `app_quikhrms."SalaryComponentCategory"` | NOT NULL | `'OtherEarning'::app_quikhrms."SalaryComponentCategory"` |
| 6 | `componentCode` | `text` | NOT NULL |  |
| 7 | `componentName` | `text` | NOT NULL |  |
| 8 | `amount` | `numeric(15,2)` | NOT NULL |  |
| 9 | `payPeriod` | `date` | NOT NULL |  |
| 10 | `taxable` | `boolean` | NOT NULL | `true` |
| 11 | `considerForEPF` | `boolean` | NOT NULL | `false` |
| 12 | `considerForESI` | `boolean` | NOT NULL | `true` |
| 13 | `considerForPT` | `boolean` | NOT NULL | `true` |
| 14 | `reason` | `text` | NULL |  |
| 15 | `status` | `app_quikhrms."OneTimeEarningStatus"` | NOT NULL | `'Pending'::app_quikhrms."OneTimeEarningStatus"` |
| 16 | `appliedAt` | `timestamp(3) without time zone` | NULL |  |
| 17 | `approvedBy` | `text` | NULL |  |
| 18 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 19 | `rejectionReason` | `text` | NULL |  |
| 20 | `sourceReimbursementClaimId` | `text` | NULL |  |
| 21 | `createdBy` | `text` | NULL |  |
| 22 | `updatedBy` | `text` | NULL |  |
| 23 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 24 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 25 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `OneTimeEarning_pkey`: PRIMARY KEY (id)

**Indexes**

- `OneTimeEarning_orgId_employeeId_idx`: `CREATE INDEX "OneTimeEarning_orgId_employeeId_idx" ON app_quikhrms."OneTimeEarning" USING btree ("orgId", "employeeId")`
- `OneTimeEarning_orgId_idx`: `CREATE INDEX "OneTimeEarning_orgId_idx" ON app_quikhrms."OneTimeEarning" USING btree ("orgId")`
- `OneTimeEarning_orgId_payPeriod_idx`: `CREATE INDEX "OneTimeEarning_orgId_payPeriod_idx" ON app_quikhrms."OneTimeEarning" USING btree ("orgId", "payPeriod")`
- `OneTimeEarning_orgId_status_idx`: `CREATE INDEX "OneTimeEarning_orgId_status_idx" ON app_quikhrms."OneTimeEarning" USING btree ("orgId", status)`
- `OneTimeEarning_orgId_status_payPeriod_idx`: `CREATE INDEX "OneTimeEarning_orgId_status_payPeriod_idx" ON app_quikhrms."OneTimeEarning" USING btree ("orgId", status, "payPeriod")`
- `OneTimeEarning_pkey`: `CREATE UNIQUE INDEX "OneTimeEarning_pkey" ON app_quikhrms."OneTimeEarning" USING btree (id)`

---

### OneTimeStatutoryDefault

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `kind` | `app_quikhrms."OneTimeEarningKind"` | NOT NULL |  |
| 4 | `taxable` | `boolean` | NOT NULL | `true` |
| 5 | `considerForEPF` | `boolean` | NOT NULL | `false` |
| 6 | `considerForESI` | `boolean` | NOT NULL | `true` |
| 7 | `considerForPT` | `boolean` | NOT NULL | `true` |
| 8 | `createdBy` | `text` | NULL |  |
| 9 | `updatedBy` | `text` | NULL |  |
| 10 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 11 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `OneTimeStatutoryDefault_pkey`: PRIMARY KEY (id)

**Indexes**

- `OneTimeStatutoryDefault_orgId_idx`: `CREATE INDEX "OneTimeStatutoryDefault_orgId_idx" ON app_quikhrms."OneTimeStatutoryDefault" USING btree ("orgId")`
- `OneTimeStatutoryDefault_orgId_kind_key`: `CREATE UNIQUE INDEX "OneTimeStatutoryDefault_orgId_kind_key" ON app_quikhrms."OneTimeStatutoryDefault" USING btree ("orgId", kind)`
- `OneTimeStatutoryDefault_pkey`: `CREATE UNIQUE INDEX "OneTimeStatutoryDefault_pkey" ON app_quikhrms."OneTimeStatutoryDefault" USING btree (id)`

---

### PIP

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `initiatedById` | `text` | NOT NULL |  |
| 5 | `reason` | `text` | NOT NULL |  |
| 6 | `startDate` | `date` | NOT NULL |  |
| 7 | `endDate` | `date` | NOT NULL |  |
| 8 | `objectives` | `jsonb` | NULL |  |
| 9 | `status` | `app_quikhrms."PIPStatus"` | NOT NULL | `'PIPActive'::app_quikhrms."PIPStatus"` |
| 10 | `outcome` | `app_quikhrms."PIPOutcome"` | NULL |  |
| 11 | `supportProvided` | `jsonb` | NULL |  |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `updatedBy` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 16 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `PIP_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `PIP_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `PIP_initiatedById_fkey`: FOREIGN KEY ("initiatedById") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `PIP_orgId_deletedAt_idx`: `CREATE INDEX "PIP_orgId_deletedAt_idx" ON app_quikhrms."PIP" USING btree ("orgId", "deletedAt")`
- `PIP_orgId_employeeId_idx`: `CREATE INDEX "PIP_orgId_employeeId_idx" ON app_quikhrms."PIP" USING btree ("orgId", "employeeId")`
- `PIP_orgId_idx`: `CREATE INDEX "PIP_orgId_idx" ON app_quikhrms."PIP" USING btree ("orgId")`
- `PIP_pkey`: `CREATE UNIQUE INDEX "PIP_pkey" ON app_quikhrms."PIP" USING btree (id)`

---

### PayRun

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `legalEntityId` | `text` | NULL |  |
| 4 | `periodStart` | `date` | NOT NULL |  |
| 5 | `periodEnd` | `date` | NOT NULL |  |
| 6 | `payDate` | `date` | NOT NULL |  |
| 7 | `payFrequency` | `app_quikhrms."PayFrequency"` | NOT NULL | `'Monthly'::app_quikhrms."PayFrequency"` |
| 8 | `status` | `app_quikhrms."PayRunStatus"` | NOT NULL | `'Draft'::app_quikhrms."PayRunStatus"` |
| 9 | `employeeCount` | `integer` | NOT NULL | `0` |
| 10 | `totalGross` | `numeric(15,2)` | NOT NULL | `0` |
| 11 | `totalNet` | `numeric(15,2)` | NOT NULL | `0` |
| 12 | `totalDeductions` | `numeric(15,2)` | NOT NULL | `0` |
| 13 | `currency` | `text` | NOT NULL | `'INR'::text` |
| 14 | `notes` | `text` | NULL |  |
| 15 | `processedAt` | `timestamp(3) without time zone` | NULL |  |
| 16 | `approvedBy` | `text` | NULL |  |
| 17 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 18 | `computeStatus` | `text` | NULL |  |
| 19 | `computeStartedAt` | `timestamp(3) without time zone` | NULL |  |
| 20 | `computeFinishedAt` | `timestamp(3) without time zone` | NULL |  |
| 21 | `computeEmployeeCount` | `integer` | NULL |  |
| 22 | `computeTotalGross` | `double precision` | NULL |  |
| 23 | `computeTotalNet` | `double precision` | NULL |  |
| 24 | `computeTotalDeductions` | `double precision` | NULL |  |
| 25 | `computeError` | `text` | NULL |  |
| 26 | `createdBy` | `text` | NULL |  |
| 27 | `updatedBy` | `text` | NULL |  |
| 28 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 29 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 30 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `PayRun_pkey`: PRIMARY KEY (id)

**Indexes**

- `PayRun_orgId_idx`: `CREATE INDEX "PayRun_orgId_idx" ON app_quikhrms."PayRun" USING btree ("orgId")`
- `PayRun_orgId_payDate_idx`: `CREATE INDEX "PayRun_orgId_payDate_idx" ON app_quikhrms."PayRun" USING btree ("orgId", "payDate")`
- `PayRun_orgId_periodStart_periodEnd_key`: `CREATE UNIQUE INDEX "PayRun_orgId_periodStart_periodEnd_key" ON app_quikhrms."PayRun" USING btree ("orgId", "periodStart", "periodEnd")`
- `PayRun_orgId_status_idx`: `CREATE INDEX "PayRun_orgId_status_idx" ON app_quikhrms."PayRun" USING btree ("orgId", status)`
- `PayRun_pkey`: `CREATE UNIQUE INDEX "PayRun_pkey" ON app_quikhrms."PayRun" USING btree (id)`

---

### PayRunAdjustment

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `payRunId` | `text` | NOT NULL |  |
| 4 | `employeeId` | `text` | NOT NULL |  |
| 5 | `paidDaysOverride` | `numeric(6,2)` | NULL |  |
| 6 | `reason` | `text` | NULL |  |
| 7 | `createdBy` | `text` | NULL |  |
| 8 | `updatedBy` | `text` | NULL |  |
| 9 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 10 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 11 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `PayRunAdjustment_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `PayRunAdjustment_payRunId_fkey`: FOREIGN KEY ("payRunId") REFERENCES app_quikhrms."PayRun"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `PayRunAdjustment_orgId_payRunId_idx`: `CREATE INDEX "PayRunAdjustment_orgId_payRunId_idx" ON app_quikhrms."PayRunAdjustment" USING btree ("orgId", "payRunId")`
- `PayRunAdjustment_payRunId_employeeId_key`: `CREATE UNIQUE INDEX "PayRunAdjustment_payRunId_employeeId_key" ON app_quikhrms."PayRunAdjustment" USING btree ("payRunId", "employeeId")`
- `PayRunAdjustment_pkey`: `CREATE UNIQUE INDEX "PayRunAdjustment_pkey" ON app_quikhrms."PayRunAdjustment" USING btree (id)`

---

### PayRunApproval

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `payRunId` | `text` | NOT NULL |  |
| 4 | `level` | `integer` | NOT NULL |  |
| 5 | `approverId` | `text` | NOT NULL |  |
| 6 | `approverRole` | `text` | NULL |  |
| 7 | `status` | `app_quikhrms."PayRunApprovalStatus"` | NOT NULL | `'Pending'::app_quikhrms."PayRunApprovalStatus"` |
| 8 | `comments` | `text` | NULL |  |
| 9 | `actedAt` | `timestamp(3) without time zone` | NULL |  |
| 10 | `createdBy` | `text` | NULL |  |
| 11 | `updatedBy` | `text` | NULL |  |
| 12 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 13 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `PayRunApproval_pkey`: PRIMARY KEY (id)

**Indexes**

- `PayRunApproval_orgId_approverId_status_idx`: `CREATE INDEX "PayRunApproval_orgId_approverId_status_idx" ON app_quikhrms."PayRunApproval" USING btree ("orgId", "approverId", status)`
- `PayRunApproval_orgId_idx`: `CREATE INDEX "PayRunApproval_orgId_idx" ON app_quikhrms."PayRunApproval" USING btree ("orgId")`
- `PayRunApproval_orgId_payRunId_idx`: `CREATE INDEX "PayRunApproval_orgId_payRunId_idx" ON app_quikhrms."PayRunApproval" USING btree ("orgId", "payRunId")`
- `PayRunApproval_pkey`: `CREATE UNIQUE INDEX "PayRunApproval_pkey" ON app_quikhrms."PayRunApproval" USING btree (id)`

---

### PaySchedule

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `workWeek` | `jsonb` | NOT NULL |  |
| 4 | `salaryCalcBasis` | `app_quikhrms."SalaryCalcBasis"` | NOT NULL | `'ActualDaysInMonth'::app_quikhrms."SalaryCalcBasis"` |
| 5 | `orgWorkingDays` | `integer` | NULL |  |
| 6 | `payDayType` | `app_quikhrms."PayDayType"` | NOT NULL | `'LastWorkingDay'::app_quikhrms."PayDayType"` |
| 7 | `payDayOfMonth` | `integer` | NULL |  |
| 8 | `payFrequency` | `app_quikhrms."PayFrequency"` | NOT NULL | `'Monthly'::app_quikhrms."PayFrequency"` |
| 9 | `firstPayrollMonth` | `date` | NULL |  |
| 10 | `autoCreate` | `boolean` | NOT NULL | `false` |
| 11 | `autoCreateDaysBefore` | `integer` | NOT NULL | `7` |
| 12 | `autoCreateLastRunAt` | `timestamp(3) without time zone` | NULL |  |
| 13 | `currency` | `text` | NOT NULL | `'INR'::text` |
| 14 | `createdBy` | `text` | NULL |  |
| 15 | `updatedBy` | `text` | NULL |  |
| 16 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 17 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `PaySchedule_pkey`: PRIMARY KEY (id)

**Indexes**

- `PaySchedule_orgId_idx`: `CREATE INDEX "PaySchedule_orgId_idx" ON app_quikhrms."PaySchedule" USING btree ("orgId")`
- `PaySchedule_orgId_key`: `CREATE UNIQUE INDEX "PaySchedule_orgId_key" ON app_quikhrms."PaySchedule" USING btree ("orgId")`
- `PaySchedule_pkey`: `CREATE UNIQUE INDEX "PaySchedule_pkey" ON app_quikhrms."PaySchedule" USING btree (id)`

---

### PayrollSettings

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `orgDetailsCompleted` | `boolean` | NOT NULL | `false` |
| 4 | `taxDetailsCompleted` | `boolean` | NOT NULL | `false` |
| 5 | `payScheduleCompleted` | `boolean` | NOT NULL | `false` |
| 6 | `statutoryComponentsCompleted` | `boolean` | NOT NULL | `false` |
| 7 | `salaryComponentsCompleted` | `boolean` | NOT NULL | `false` |
| 8 | `employeesCompleted` | `boolean` | NOT NULL | `false` |
| 9 | `priorPayrollCompleted` | `boolean` | NOT NULL | `false` |
| 10 | `setupCompleted` | `boolean` | NOT NULL | `false` |
| 11 | `setupCompletedAt` | `timestamp(3) without time zone` | NULL |  |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `updatedBy` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `PayrollSettings_pkey`: PRIMARY KEY (id)

**Indexes**

- `PayrollSettings_orgId_idx`: `CREATE INDEX "PayrollSettings_orgId_idx" ON app_quikhrms."PayrollSettings" USING btree ("orgId")`
- `PayrollSettings_orgId_key`: `CREATE UNIQUE INDEX "PayrollSettings_orgId_key" ON app_quikhrms."PayrollSettings" USING btree ("orgId")`
- `PayrollSettings_pkey`: `CREATE UNIQUE INDEX "PayrollSettings_pkey" ON app_quikhrms."PayrollSettings" USING btree (id)`

---

### PayrollTaxDetails

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `pan` | `text` | NULL |  |
| 4 | `tan` | `text` | NULL |  |
| 5 | `tdsCircleCodeArea` | `text` | NULL |  |
| 6 | `tdsCircleCodeType` | `text` | NULL |  |
| 7 | `tdsCircleNumber` | `text` | NULL |  |
| 8 | `tdsCircleSubNumber` | `text` | NULL |  |
| 9 | `taxPaymentFrequency` | `app_quikhrms."TaxPaymentFrequency"` | NOT NULL | `'Monthly'::app_quikhrms."TaxPaymentFrequency"` |
| 10 | `deductorType` | `app_quikhrms."DeductorType"` | NOT NULL | `'Employee'::app_quikhrms."DeductorType"` |
| 11 | `deductorEmployeeId` | `text` | NULL |  |
| 12 | `deductorName` | `text` | NULL |  |
| 13 | `deductorFatherName` | `text` | NULL |  |
| 14 | `deductorAddress` | `text` | NULL |  |
| 15 | `deductorDesignation` | `text` | NULL |  |
| 16 | `createdBy` | `text` | NULL |  |
| 17 | `updatedBy` | `text` | NULL |  |
| 18 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 19 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `PayrollTaxDetails_pkey`: PRIMARY KEY (id)

**Indexes**

- `PayrollTaxDetails_orgId_idx`: `CREATE INDEX "PayrollTaxDetails_orgId_idx" ON app_quikhrms."PayrollTaxDetails" USING btree ("orgId")`
- `PayrollTaxDetails_orgId_key`: `CREATE UNIQUE INDEX "PayrollTaxDetails_orgId_key" ON app_quikhrms."PayrollTaxDetails" USING btree ("orgId")`
- `PayrollTaxDetails_pkey`: `CREATE UNIQUE INDEX "PayrollTaxDetails_pkey" ON app_quikhrms."PayrollTaxDetails" USING btree (id)`

---

### Payslip

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `payRunId` | `text` | NOT NULL |  |
| 4 | `employeeId` | `text` | NOT NULL |  |
| 5 | `periodStart` | `date` | NOT NULL |  |
| 6 | `periodEnd` | `date` | NOT NULL |  |
| 7 | `workingDays` | `numeric(6,2)` | NOT NULL | `0` |
| 8 | `paidDays` | `numeric(6,2)` | NOT NULL | `0` |
| 9 | `lopDays` | `numeric(6,2)` | NOT NULL | `0` |
| 10 | `grossEarnings` | `numeric(15,2)` | NOT NULL | `0` |
| 11 | `totalDeductions` | `numeric(15,2)` | NOT NULL | `0` |
| 12 | `netPay` | `numeric(15,2)` | NOT NULL | `0` |
| 13 | `currency` | `text` | NOT NULL | `'INR'::text` |
| 14 | `status` | `app_quikhrms."PayslipStatus"` | NOT NULL | `'Draft'::app_quikhrms."PayslipStatus"` |
| 15 | `releasedAt` | `timestamp(3) without time zone` | NULL |  |
| 16 | `createdBy` | `text` | NULL |  |
| 17 | `updatedBy` | `text` | NULL |  |
| 18 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 19 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 20 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Payslip_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Payslip_payRunId_fkey`: FOREIGN KEY ("payRunId") REFERENCES app_quikhrms."PayRun"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `Payslip_orgId_deletedAt_idx`: `CREATE INDEX "Payslip_orgId_deletedAt_idx" ON app_quikhrms."Payslip" USING btree ("orgId", "deletedAt")`
- `Payslip_orgId_employeeId_idx`: `CREATE INDEX "Payslip_orgId_employeeId_idx" ON app_quikhrms."Payslip" USING btree ("orgId", "employeeId")`
- `Payslip_orgId_employeeId_periodStart_idx`: `CREATE INDEX "Payslip_orgId_employeeId_periodStart_idx" ON app_quikhrms."Payslip" USING btree ("orgId", "employeeId", "periodStart")`
- `Payslip_orgId_idx`: `CREATE INDEX "Payslip_orgId_idx" ON app_quikhrms."Payslip" USING btree ("orgId")`
- `Payslip_orgId_payRunId_status_idx`: `CREATE INDEX "Payslip_orgId_payRunId_status_idx" ON app_quikhrms."Payslip" USING btree ("orgId", "payRunId", status)`
- `Payslip_orgId_status_periodStart_idx`: `CREATE INDEX "Payslip_orgId_status_periodStart_idx" ON app_quikhrms."Payslip" USING btree ("orgId", status, "periodStart")`
- `Payslip_payRunId_employeeId_key`: `CREATE UNIQUE INDEX "Payslip_payRunId_employeeId_key" ON app_quikhrms."Payslip" USING btree ("payRunId", "employeeId")`
- `Payslip_pkey`: `CREATE UNIQUE INDEX "Payslip_pkey" ON app_quikhrms."Payslip" USING btree (id)`

---

### PayslipLine

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `payslipId` | `text` | NOT NULL |  |
| 4 | `componentId` | `text` | NULL |  |
| 5 | `componentCode` | `text` | NOT NULL |  |
| 6 | `componentName` | `text` | NOT NULL |  |
| 7 | `type` | `app_quikhrms."SalaryComponentType"` | NOT NULL |  |
| 8 | `category` | `app_quikhrms."SalaryComponentCategory"` | NOT NULL |  |
| 9 | `amount` | `numeric(15,2)` | NOT NULL |  |
| 10 | `sortOrder` | `integer` | NOT NULL | `0` |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `PayslipLine_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `PayslipLine_payslipId_fkey`: FOREIGN KEY ("payslipId") REFERENCES app_quikhrms."Payslip"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `PayslipLine_orgId_idx`: `CREATE INDEX "PayslipLine_orgId_idx" ON app_quikhrms."PayslipLine" USING btree ("orgId")`
- `PayslipLine_payslipId_idx`: `CREATE INDEX "PayslipLine_payslipId_idx" ON app_quikhrms."PayslipLine" USING btree ("payslipId")`
- `PayslipLine_pkey`: `CREATE UNIQUE INDEX "PayslipLine_pkey" ON app_quikhrms."PayslipLine" USING btree (id)`

---

### PostComment

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `postId` | `text` | NOT NULL |  |
| 4 | `employeeId` | `text` | NOT NULL |  |
| 5 | `content` | `text` | NOT NULL |  |
| 6 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 7 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `PostComment_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `PostComment_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `PostComment_postId_fkey`: FOREIGN KEY ("postId") REFERENCES app_quikhrms."SocialPost"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `PostComment_orgId_postId_idx`: `CREATE INDEX "PostComment_orgId_postId_idx" ON app_quikhrms."PostComment" USING btree ("orgId", "postId")`
- `PostComment_pkey`: `CREATE UNIQUE INDEX "PostComment_pkey" ON app_quikhrms."PostComment" USING btree (id)`

---

### PriorPayroll

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `enabled` | `boolean` | NOT NULL | `false` |
| 4 | `financialYear` | `text` | NULL |  |
| 5 | `fromMonth` | `date` | NULL |  |
| 6 | `toMonth` | `date` | NULL |  |
| 7 | `dataUploaded` | `boolean` | NOT NULL | `false` |
| 8 | `notes` | `text` | NULL |  |
| 9 | `createdBy` | `text` | NULL |  |
| 10 | `updatedBy` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 12 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `PriorPayroll_pkey`: PRIMARY KEY (id)

**Indexes**

- `PriorPayroll_orgId_idx`: `CREATE INDEX "PriorPayroll_orgId_idx" ON app_quikhrms."PriorPayroll" USING btree ("orgId")`
- `PriorPayroll_orgId_key`: `CREATE UNIQUE INDEX "PriorPayroll_orgId_key" ON app_quikhrms."PriorPayroll" USING btree ("orgId")`
- `PriorPayroll_pkey`: `CREATE UNIQUE INDEX "PriorPayroll_pkey" ON app_quikhrms."PriorPayroll" USING btree (id)`

---

### PriorPayrollRecord

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `financialYear` | `text` | NOT NULL |  |
| 5 | `periodStart` | `date` | NOT NULL |  |
| 6 | `periodEnd` | `date` | NOT NULL |  |
| 7 | `grossEarnings` | `numeric(15,2)` | NOT NULL | `0` |
| 8 | `totalDeductions` | `numeric(15,2)` | NOT NULL | `0` |
| 9 | `netPay` | `numeric(15,2)` | NOT NULL | `0` |
| 10 | `epfEmployee` | `numeric(15,2)` | NOT NULL | `0` |
| 11 | `epfEmployer` | `numeric(15,2)` | NOT NULL | `0` |
| 12 | `esiEmployee` | `numeric(15,2)` | NOT NULL | `0` |
| 13 | `esiEmployer` | `numeric(15,2)` | NOT NULL | `0` |
| 14 | `professionalTax` | `numeric(15,2)` | NOT NULL | `0` |
| 15 | `tds` | `numeric(15,2)` | NOT NULL | `0` |
| 16 | `notes` | `text` | NULL |  |
| 17 | `createdBy` | `text` | NULL |  |
| 18 | `updatedBy` | `text` | NULL |  |
| 19 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 20 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 21 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `PriorPayrollRecord_pkey`: PRIMARY KEY (id)

**Indexes**

- `PriorPayrollRecord_orgId_employeeId_financialYear_idx`: `CREATE INDEX "PriorPayrollRecord_orgId_employeeId_financialYear_idx" ON app_quikhrms."PriorPayrollRecord" USING btree ("orgId", "employeeId", "financialYear")`
- `PriorPayrollRecord_orgId_employeeId_financialYear_periodEnd_idx`: `CREATE INDEX "PriorPayrollRecord_orgId_employeeId_financialYear_periodEnd_idx" ON app_quikhrms."PriorPayrollRecord" USING btree ("orgId", "employeeId", "financialYear", "periodEnd")`
- `PriorPayrollRecord_orgId_employeeId_periodStart_key`: `CREATE UNIQUE INDEX "PriorPayrollRecord_orgId_employeeId_periodStart_key" ON app_quikhrms."PriorPayrollRecord" USING btree ("orgId", "employeeId", "periodStart")`
- `PriorPayrollRecord_orgId_idx`: `CREATE INDEX "PriorPayrollRecord_orgId_idx" ON app_quikhrms."PriorPayrollRecord" USING btree ("orgId")`
- `PriorPayrollRecord_pkey`: `CREATE UNIQUE INDEX "PriorPayrollRecord_pkey" ON app_quikhrms."PriorPayrollRecord" USING btree (id)`

---

### ProfessionalTaxConfig

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `enabled` | `boolean` | NOT NULL | `false` |
| 4 | `locationId` | `text` | NULL |  |
| 5 | `state` | `text` | NOT NULL |  |
| 6 | `ptNumber` | `text` | NULL |  |
| 7 | `deductionCycle` | `app_quikhrms."ProfessionalTaxCycle"` | NOT NULL | `'Monthly'::app_quikhrms."ProfessionalTaxCycle"` |
| 8 | `slabs` | `jsonb` | NOT NULL |  |
| 9 | `effectiveFrom` | `date` | NULL |  |
| 10 | `effectiveTo` | `date` | NULL |  |
| 11 | `createdBy` | `text` | NULL |  |
| 12 | `updatedBy` | `text` | NULL |  |
| 13 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 14 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `ProfessionalTaxConfig_pkey`: PRIMARY KEY (id)

**Indexes**

- `ProfessionalTaxConfig_orgId_idx`: `CREATE INDEX "ProfessionalTaxConfig_orgId_idx" ON app_quikhrms."ProfessionalTaxConfig" USING btree ("orgId")`
- `ProfessionalTaxConfig_orgId_state_locationId_key`: `CREATE UNIQUE INDEX "ProfessionalTaxConfig_orgId_state_locationId_key" ON app_quikhrms."ProfessionalTaxConfig" USING btree ("orgId", state, "locationId")`
- `ProfessionalTaxConfig_pkey`: `CREATE UNIQUE INDEX "ProfessionalTaxConfig_pkey" ON app_quikhrms."ProfessionalTaxConfig" USING btree (id)`

---

### ProvisionItem

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `category` | `app_quikhrms."ProvisionCategory"` | NOT NULL | `'ProvOther'::app_quikhrms."ProvisionCategory"` |
| 5 | `description` | `text` | NULL |  |
| 6 | `isDefault` | `boolean` | NOT NULL | `false` |
| 7 | `isActive` | `boolean` | NOT NULL | `true` |
| 8 | `departmentIds` | `jsonb` | NULL |  |
| 9 | `roleIds` | `jsonb` | NULL |  |
| 10 | `designationIds` | `jsonb` | NULL |  |
| 11 | `ownerAssigneeRole` | `app_quikhrms."AssigneeRole"` | NULL |  |
| 12 | `createdBy` | `text` | NULL |  |
| 13 | `updatedBy` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 15 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 16 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `ProvisionItem_pkey`: PRIMARY KEY (id)

**Indexes**

- `ProvisionItem_orgId_category_idx`: `CREATE INDEX "ProvisionItem_orgId_category_idx" ON app_quikhrms."ProvisionItem" USING btree ("orgId", category)`
- `ProvisionItem_orgId_deletedAt_idx`: `CREATE INDEX "ProvisionItem_orgId_deletedAt_idx" ON app_quikhrms."ProvisionItem" USING btree ("orgId", "deletedAt")`
- `ProvisionItem_orgId_idx`: `CREATE INDEX "ProvisionItem_orgId_idx" ON app_quikhrms."ProvisionItem" USING btree ("orgId")`
- `ProvisionItem_orgId_name_key`: `CREATE UNIQUE INDEX "ProvisionItem_orgId_name_key" ON app_quikhrms."ProvisionItem" USING btree ("orgId", name)`
- `ProvisionItem_pkey`: `CREATE UNIQUE INDEX "ProvisionItem_pkey" ON app_quikhrms."ProvisionItem" USING btree (id)`

---

### Recognition

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `fromEmployeeId` | `text` | NOT NULL |  |
| 4 | `toEmployeeId` | `text` | NOT NULL |  |
| 5 | `type` | `app_quikhrms."RecognitionType"` | NOT NULL | `'Kudos'::app_quikhrms."RecognitionType"` |
| 6 | `message` | `text` | NOT NULL |  |
| 7 | `badge` | `text` | NULL |  |
| 8 | `points` | `integer` | NOT NULL | `0` |
| 9 | `isPublic` | `boolean` | NOT NULL | `true` |
| 10 | `approvalStatus` | `app_quikhrms."ContentApprovalStatus"` | NOT NULL | `'Approved'::app_quikhrms."ContentApprovalStatus"` |
| 11 | `approvedById` | `text` | NULL |  |
| 12 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 13 | `rejectionReason` | `text` | NULL |  |
| 14 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `Recognition_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Recognition_fromEmployeeId_fkey`: FOREIGN KEY ("fromEmployeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `Recognition_toEmployeeId_fkey`: FOREIGN KEY ("toEmployeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `Recognition_orgId_approvalStatus_idx`: `CREATE INDEX "Recognition_orgId_approvalStatus_idx" ON app_quikhrms."Recognition" USING btree ("orgId", "approvalStatus")`
- `Recognition_orgId_idx`: `CREATE INDEX "Recognition_orgId_idx" ON app_quikhrms."Recognition" USING btree ("orgId")`
- `Recognition_orgId_toEmployeeId_idx`: `CREATE INDEX "Recognition_orgId_toEmployeeId_idx" ON app_quikhrms."Recognition" USING btree ("orgId", "toEmployeeId")`
- `Recognition_pkey`: `CREATE UNIQUE INDEX "Recognition_pkey" ON app_quikhrms."Recognition" USING btree (id)`

---

### ReimbursementClaim

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `componentId` | `text` | NULL |  |
| 5 | `componentName` | `text` | NOT NULL |  |
| 6 | `title` | `text` | NULL |  |
| 7 | `billDate` | `date` | NOT NULL |  |
| 8 | `billDateTo` | `date` | NULL |  |
| 9 | `billNumber` | `text` | NULL |  |
| 10 | `merchantName` | `text` | NULL |  |
| 11 | `currency` | `text` | NOT NULL | `'INR'::text` |
| 12 | `isProject` | `boolean` | NOT NULL | `false` |
| 13 | `amountClaimed` | `numeric(15,2)` | NOT NULL |  |
| 14 | `amountApproved` | `numeric(15,2)` | NULL |  |
| 15 | `fileUrl` | `text` | NULL |  |
| 16 | `attachments` | `jsonb` | NULL |  |
| 17 | `description` | `text` | NULL |  |
| 18 | `status` | `app_quikhrms."ReimbursementClaimStatus"` | NOT NULL | `'Submitted'::app_quikhrms."ReimbursementClaimStatus"` |
| 19 | `approvedBy` | `text` | NULL |  |
| 20 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 21 | `rejectionReason` | `text` | NULL |  |
| 22 | `payRunId` | `text` | NULL |  |
| 23 | `paidAt` | `timestamp(3) without time zone` | NULL |  |
| 24 | `createdBy` | `text` | NULL |  |
| 25 | `updatedBy` | `text` | NULL |  |
| 26 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 27 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 28 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `ReimbursementClaim_pkey`: PRIMARY KEY (id)

**Indexes**

- `ReimbursementClaim_orgId_employeeId_idx`: `CREATE INDEX "ReimbursementClaim_orgId_employeeId_idx" ON app_quikhrms."ReimbursementClaim" USING btree ("orgId", "employeeId")`
- `ReimbursementClaim_orgId_idx`: `CREATE INDEX "ReimbursementClaim_orgId_idx" ON app_quikhrms."ReimbursementClaim" USING btree ("orgId")`
- `ReimbursementClaim_orgId_status_idx`: `CREATE INDEX "ReimbursementClaim_orgId_status_idx" ON app_quikhrms."ReimbursementClaim" USING btree ("orgId", status)`
- `ReimbursementClaim_pkey`: `CREATE UNIQUE INDEX "ReimbursementClaim_pkey" ON app_quikhrms."ReimbursementClaim" USING btree (id)`

---

### Report

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `type` | `text` | NOT NULL |  |
| 5 | `parameters` | `jsonb` | NULL |  |
| 6 | `generatedBy` | `text` | NOT NULL |  |
| 7 | `format` | `app_quikhrms."ReportFormat"` | NOT NULL | `'PDF'::app_quikhrms."ReportFormat"` |
| 8 | `fileUrl` | `text` | NULL |  |
| 9 | `status` | `app_quikhrms."ReportStatus"` | NOT NULL | `'ReportQueued'::app_quikhrms."ReportStatus"` |
| 10 | `scheduleCron` | `text` | NULL |  |
| 11 | `lastRunAt` | `timestamp(3) without time zone` | NULL |  |
| 12 | `rowCount` | `integer` | NOT NULL | `0` |
| 13 | `createdBy` | `text` | NULL |  |
| 14 | `updatedBy` | `text` | NULL |  |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 17 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Report_pkey`: PRIMARY KEY (id)

**Indexes**

- `Report_orgId_deletedAt_idx`: `CREATE INDEX "Report_orgId_deletedAt_idx" ON app_quikhrms."Report" USING btree ("orgId", "deletedAt")`
- `Report_orgId_idx`: `CREATE INDEX "Report_orgId_idx" ON app_quikhrms."Report" USING btree ("orgId")`
- `Report_orgId_status_idx`: `CREATE INDEX "Report_orgId_status_idx" ON app_quikhrms."Report" USING btree ("orgId", status)`
- `Report_orgId_type_idx`: `CREATE INDEX "Report_orgId_type_idx" ON app_quikhrms."Report" USING btree ("orgId", type)`
- `Report_pkey`: `CREATE UNIQUE INDEX "Report_pkey" ON app_quikhrms."Report" USING btree (id)`

---

### RequisitionApproval

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `requisitionId` | `text` | NOT NULL |  |
| 4 | `approverId` | `text` | NOT NULL |  |
| 5 | `level` | `integer` | NOT NULL | `1` |
| 6 | `role` | `app_quikhrms."RequisitionApproverRole"` | NOT NULL |  |
| 7 | `status` | `app_quikhrms."RequisitionApprovalStatus"` | NOT NULL | `'Pending'::app_quikhrms."RequisitionApprovalStatus"` |
| 8 | `comment` | `text` | NULL |  |
| 9 | `decidedAt` | `timestamp(3) without time zone` | NULL |  |
| 10 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 11 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `RequisitionApproval_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `RequisitionApproval_approverId_fkey`: FOREIGN KEY ("approverId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `RequisitionApproval_requisitionId_fkey`: FOREIGN KEY ("requisitionId") REFERENCES app_quikhrms."JobRequisition"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `RequisitionApproval_orgId_approverId_status_idx`: `CREATE INDEX "RequisitionApproval_orgId_approverId_status_idx" ON app_quikhrms."RequisitionApproval" USING btree ("orgId", "approverId", status)`
- `RequisitionApproval_orgId_idx`: `CREATE INDEX "RequisitionApproval_orgId_idx" ON app_quikhrms."RequisitionApproval" USING btree ("orgId")`
- `RequisitionApproval_orgId_requisitionId_idx`: `CREATE INDEX "RequisitionApproval_orgId_requisitionId_idx" ON app_quikhrms."RequisitionApproval" USING btree ("orgId", "requisitionId")`
- `RequisitionApproval_pkey`: `CREATE UNIQUE INDEX "RequisitionApproval_pkey" ON app_quikhrms."RequisitionApproval" USING btree (id)`

---

### ReviewForm

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `sections` | `jsonb` | NOT NULL |  |
| 5 | `createdBy` | `text` | NULL |  |
| 6 | `updatedBy` | `text` | NULL |  |
| 7 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 8 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 9 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `ReviewForm_pkey`: PRIMARY KEY (id)

**Indexes**

- `ReviewForm_orgId_deletedAt_idx`: `CREATE INDEX "ReviewForm_orgId_deletedAt_idx" ON app_quikhrms."ReviewForm" USING btree ("orgId", "deletedAt")`
- `ReviewForm_orgId_idx`: `CREATE INDEX "ReviewForm_orgId_idx" ON app_quikhrms."ReviewForm" USING btree ("orgId")`
- `ReviewForm_pkey`: `CREATE UNIQUE INDEX "ReviewForm_pkey" ON app_quikhrms."ReviewForm" USING btree (id)`

---

### RoleNavigation

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `roleId` | `text` | NOT NULL |  |
| 3 | `navKey` | `text` | NOT NULL |  |

**Primary Key**

- `RoleNavigation_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `RoleNavigation_roleId_fkey`: FOREIGN KEY ("roleId") REFERENCES app_quikhrms."AppRole"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `RoleNavigation_pkey`: `CREATE UNIQUE INDEX "RoleNavigation_pkey" ON app_quikhrms."RoleNavigation" USING btree (id)`
- `RoleNavigation_roleId_idx`: `CREATE INDEX "RoleNavigation_roleId_idx" ON app_quikhrms."RoleNavigation" USING btree ("roleId")`
- `RoleNavigation_roleId_navKey_key`: `CREATE UNIQUE INDEX "RoleNavigation_roleId_navKey_key" ON app_quikhrms."RoleNavigation" USING btree ("roleId", "navKey")`

---

### RolePermission

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `roleId` | `text` | NOT NULL |  |
| 3 | `resource` | `text` | NOT NULL |  |
| 4 | `action` | `text` | NOT NULL |  |

**Primary Key**

- `RolePermission_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `RolePermission_roleId_fkey`: FOREIGN KEY ("roleId") REFERENCES app_quikhrms."AppRole"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `RolePermission_pkey`: `CREATE UNIQUE INDEX "RolePermission_pkey" ON app_quikhrms."RolePermission" USING btree (id)`
- `RolePermission_roleId_idx`: `CREATE INDEX "RolePermission_roleId_idx" ON app_quikhrms."RolePermission" USING btree ("roleId")`
- `RolePermission_roleId_resource_action_key`: `CREATE UNIQUE INDEX "RolePermission_roleId_resource_action_key" ON app_quikhrms."RolePermission" USING btree ("roleId", resource, action)`

---

### Roster

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `departmentId` | `text` | NULL |  |
| 5 | `periodStart` | `date` | NOT NULL |  |
| 6 | `periodEnd` | `date` | NOT NULL |  |
| 7 | `status` | `app_quikhrms."RosterStatus"` | NOT NULL | `'Draft'::app_quikhrms."RosterStatus"` |
| 8 | `publishedAt` | `timestamp(3) without time zone` | NULL |  |
| 9 | `publishedBy` | `text` | NULL |  |
| 10 | `createdBy` | `text` | NULL |  |
| 11 | `updatedBy` | `text` | NULL |  |
| 12 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 13 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 14 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Roster_pkey`: PRIMARY KEY (id)

**Indexes**

- `Roster_orgId_deletedAt_idx`: `CREATE INDEX "Roster_orgId_deletedAt_idx" ON app_quikhrms."Roster" USING btree ("orgId", "deletedAt")`
- `Roster_orgId_departmentId_idx`: `CREATE INDEX "Roster_orgId_departmentId_idx" ON app_quikhrms."Roster" USING btree ("orgId", "departmentId")`
- `Roster_orgId_idx`: `CREATE INDEX "Roster_orgId_idx" ON app_quikhrms."Roster" USING btree ("orgId")`
- `Roster_pkey`: `CREATE UNIQUE INDEX "Roster_pkey" ON app_quikhrms."Roster" USING btree (id)`

---

### RosterEntry

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `rosterId` | `text` | NOT NULL |  |
| 4 | `employeeId` | `text` | NOT NULL |  |
| 5 | `date` | `date` | NOT NULL |  |
| 6 | `shiftId` | `text` | NULL |  |
| 7 | `type` | `app_quikhrms."RosterEntryType"` | NOT NULL | `'Duty'::app_quikhrms."RosterEntryType"` |
| 8 | `note` | `text` | NULL |  |
| 9 | `createdBy` | `text` | NULL |  |
| 10 | `updatedBy` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 12 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 13 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `RosterEntry_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `RosterEntry_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `RosterEntry_rosterId_fkey`: FOREIGN KEY ("rosterId") REFERENCES app_quikhrms."Roster"(id) ON UPDATE CASCADE ON DELETE CASCADE
- `RosterEntry_shiftId_fkey`: FOREIGN KEY ("shiftId") REFERENCES app_quikhrms."ShiftPolicy"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `RosterEntry_orgId_deletedAt_idx`: `CREATE INDEX "RosterEntry_orgId_deletedAt_idx" ON app_quikhrms."RosterEntry" USING btree ("orgId", "deletedAt")`
- `RosterEntry_orgId_employeeId_idx`: `CREATE INDEX "RosterEntry_orgId_employeeId_idx" ON app_quikhrms."RosterEntry" USING btree ("orgId", "employeeId")`
- `RosterEntry_orgId_rosterId_idx`: `CREATE INDEX "RosterEntry_orgId_rosterId_idx" ON app_quikhrms."RosterEntry" USING btree ("orgId", "rosterId")`
- `RosterEntry_pkey`: `CREATE UNIQUE INDEX "RosterEntry_pkey" ON app_quikhrms."RosterEntry" USING btree (id)`
- `RosterEntry_rosterId_employeeId_date_key`: `CREATE UNIQUE INDEX "RosterEntry_rosterId_employeeId_date_key" ON app_quikhrms."RosterEntry" USING btree ("rosterId", "employeeId", date)`

---

### SalaryComponent

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `code` | `text` | NOT NULL |  |
| 5 | `type` | `app_quikhrms."SalaryComponentType"` | NOT NULL |  |
| 6 | `category` | `app_quikhrms."SalaryComponentCategory"` | NOT NULL |  |
| 7 | `amountType` | `app_quikhrms."SalaryAmountType"` | NOT NULL | `'Fixed'::app_quikhrms."SalaryAmountType"` |
| 8 | `amountValue` | `numeric(15,4)` | NULL |  |
| 9 | `formula` | `text` | NULL |  |
| 10 | `frequency` | `app_quikhrms."SalaryFrequency"` | NOT NULL | `'Monthly'::app_quikhrms."SalaryFrequency"` |
| 11 | `taxable` | `boolean` | NOT NULL | `true` |
| 12 | `includeInCTC` | `boolean` | NOT NULL | `true` |
| 13 | `includeInGross` | `boolean` | NOT NULL | `true` |
| 14 | `considerForEPF` | `boolean` | NOT NULL | `false` |
| 15 | `considerForESI` | `boolean` | NOT NULL | `false` |
| 16 | `considerForPT` | `boolean` | NOT NULL | `false` |
| 17 | `considerForLWF` | `boolean` | NOT NULL | `false` |
| 18 | `proRateOnLOP` | `boolean` | NOT NULL | `true` |
| 19 | `considerEPFIfPFWageLT15k` | `boolean` | NOT NULL | `false` |
| 20 | `maxAmount` | `numeric(15,2)` | NULL |  |
| 21 | `description` | `text` | NULL |  |
| 22 | `nameInPayslip` | `text` | NULL |  |
| 23 | `showInPayslip` | `boolean` | NOT NULL | `true` |
| 24 | `partOfSalaryStructure` | `boolean` | NOT NULL | `true` |
| 25 | `isRecurring` | `boolean` | NOT NULL | `true` |
| 26 | `isFBP` | `boolean` | NOT NULL | `false` |
| 27 | `carryForwardUnclaimed` | `boolean` | NOT NULL | `true` |
| 28 | `requireBillNumber` | `boolean` | NOT NULL | `false` |
| 29 | `requireMerchantName` | `boolean` | NOT NULL | `false` |
| 30 | `requireUploadDoc` | `boolean` | NOT NULL | `false` |
| 31 | `claimInstructions` | `text` | NULL |  |
| 32 | `investmentSection` | `text` | NULL |  |
| 33 | `investmentType` | `text` | NULL |  |
| 34 | `correctionForId` | `text` | NULL |  |
| 35 | `isSystem` | `boolean` | NOT NULL | `false` |
| 36 | `isActive` | `boolean` | NOT NULL | `true` |
| 37 | `createdBy` | `text` | NULL |  |
| 38 | `updatedBy` | `text` | NULL |  |
| 39 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 40 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 41 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `SalaryComponent_pkey`: PRIMARY KEY (id)

**Indexes**

- `SalaryComponent_orgId_code_key`: `CREATE UNIQUE INDEX "SalaryComponent_orgId_code_key" ON app_quikhrms."SalaryComponent" USING btree ("orgId", code)`
- `SalaryComponent_orgId_deletedAt_idx`: `CREATE INDEX "SalaryComponent_orgId_deletedAt_idx" ON app_quikhrms."SalaryComponent" USING btree ("orgId", "deletedAt")`
- `SalaryComponent_orgId_idx`: `CREATE INDEX "SalaryComponent_orgId_idx" ON app_quikhrms."SalaryComponent" USING btree ("orgId")`
- `SalaryComponent_pkey`: `CREATE UNIQUE INDEX "SalaryComponent_pkey" ON app_quikhrms."SalaryComponent" USING btree (id)`

---

### SalaryRevision

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `currentCTC` | `numeric(15,2)` | NOT NULL |  |
| 5 | `proposedCTC` | `numeric(15,2)` | NOT NULL |  |
| 6 | `structureId` | `text` | NULL |  |
| 7 | `effectiveFrom` | `date` | NOT NULL |  |
| 8 | `reason` | `text` | NULL |  |
| 9 | `status` | `app_quikhrms."SalaryRevisionStatus"` | NOT NULL | `'Pending'::app_quikhrms."SalaryRevisionStatus"` |
| 10 | `requestedBy` | `text` | NOT NULL |  |
| 11 | `approvedBy` | `text` | NULL |  |
| 12 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 13 | `rejectionReason` | `text` | NULL |  |
| 14 | `appliedSalaryId` | `text` | NULL |  |
| 15 | `createdBy` | `text` | NULL |  |
| 16 | `updatedBy` | `text` | NULL |  |
| 17 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 18 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 19 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `SalaryRevision_pkey`: PRIMARY KEY (id)

**Indexes**

- `SalaryRevision_orgId_employeeId_idx`: `CREATE INDEX "SalaryRevision_orgId_employeeId_idx" ON app_quikhrms."SalaryRevision" USING btree ("orgId", "employeeId")`
- `SalaryRevision_orgId_idx`: `CREATE INDEX "SalaryRevision_orgId_idx" ON app_quikhrms."SalaryRevision" USING btree ("orgId")`
- `SalaryRevision_orgId_status_effectiveFrom_idx`: `CREATE INDEX "SalaryRevision_orgId_status_effectiveFrom_idx" ON app_quikhrms."SalaryRevision" USING btree ("orgId", status, "effectiveFrom")`
- `SalaryRevision_orgId_status_idx`: `CREATE INDEX "SalaryRevision_orgId_status_idx" ON app_quikhrms."SalaryRevision" USING btree ("orgId", status)`
- `SalaryRevision_pkey`: `CREATE UNIQUE INDEX "SalaryRevision_pkey" ON app_quikhrms."SalaryRevision" USING btree (id)`

---

### SalaryStructure

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `code` | `text` | NOT NULL |  |
| 5 | `description` | `text` | NULL |  |
| 6 | `ctcMin` | `numeric(15,2)` | NULL |  |
| 7 | `ctcMax` | `numeric(15,2)` | NULL |  |
| 8 | `isDefault` | `boolean` | NOT NULL | `false` |
| 9 | `isActive` | `boolean` | NOT NULL | `true` |
| 10 | `createdBy` | `text` | NULL |  |
| 11 | `updatedBy` | `text` | NULL |  |
| 12 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 13 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 14 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `SalaryStructure_pkey`: PRIMARY KEY (id)

**Indexes**

- `SalaryStructure_orgId_code_key`: `CREATE UNIQUE INDEX "SalaryStructure_orgId_code_key" ON app_quikhrms."SalaryStructure" USING btree ("orgId", code)`
- `SalaryStructure_orgId_deletedAt_idx`: `CREATE INDEX "SalaryStructure_orgId_deletedAt_idx" ON app_quikhrms."SalaryStructure" USING btree ("orgId", "deletedAt")`
- `SalaryStructure_orgId_idx`: `CREATE INDEX "SalaryStructure_orgId_idx" ON app_quikhrms."SalaryStructure" USING btree ("orgId")`
- `SalaryStructure_pkey`: `CREATE UNIQUE INDEX "SalaryStructure_pkey" ON app_quikhrms."SalaryStructure" USING btree (id)`

---

### SalaryStructureComponent

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `structureId` | `text` | NOT NULL |  |
| 4 | `componentId` | `text` | NOT NULL |  |
| 5 | `amountType` | `app_quikhrms."SalaryAmountType"` | NOT NULL | `'Fixed'::app_quikhrms."SalaryAmountType"` |
| 6 | `amountValue` | `numeric(15,4)` | NULL |  |
| 7 | `formula` | `text` | NULL |  |
| 8 | `sortOrder` | `integer` | NOT NULL | `0` |
| 9 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 10 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `SalaryStructureComponent_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `SalaryStructureComponent_componentId_fkey`: FOREIGN KEY ("componentId") REFERENCES app_quikhrms."SalaryComponent"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `SalaryStructureComponent_structureId_fkey`: FOREIGN KEY ("structureId") REFERENCES app_quikhrms."SalaryStructure"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `SalaryStructureComponent_orgId_idx`: `CREATE INDEX "SalaryStructureComponent_orgId_idx" ON app_quikhrms."SalaryStructureComponent" USING btree ("orgId")`
- `SalaryStructureComponent_pkey`: `CREATE UNIQUE INDEX "SalaryStructureComponent_pkey" ON app_quikhrms."SalaryStructureComponent" USING btree (id)`
- `SalaryStructureComponent_structureId_componentId_key`: `CREATE UNIQUE INDEX "SalaryStructureComponent_structureId_componentId_key" ON app_quikhrms."SalaryStructureComponent" USING btree ("structureId", "componentId")`
- `SalaryStructureComponent_structureId_idx`: `CREATE INDEX "SalaryStructureComponent_structureId_idx" ON app_quikhrms."SalaryStructureComponent" USING btree ("structureId")`

---

### ShiftAssignment

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `shiftId` | `text` | NOT NULL |  |
| 5 | `effectiveFrom` | `date` | NOT NULL |  |
| 6 | `effectiveTo` | `date` | NULL |  |
| 7 | `isRotating` | `boolean` | NOT NULL | `false` |
| 8 | `rotationPattern` | `jsonb` | NULL |  |
| 9 | `createdBy` | `text` | NULL |  |
| 10 | `updatedBy` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 12 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 13 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `ShiftAssignment_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `ShiftAssignment_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `ShiftAssignment_shiftId_fkey`: FOREIGN KEY ("shiftId") REFERENCES app_quikhrms."ShiftPolicy"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `ShiftAssignment_orgId_deletedAt_idx`: `CREATE INDEX "ShiftAssignment_orgId_deletedAt_idx" ON app_quikhrms."ShiftAssignment" USING btree ("orgId", "deletedAt")`
- `ShiftAssignment_orgId_employeeId_idx`: `CREATE INDEX "ShiftAssignment_orgId_employeeId_idx" ON app_quikhrms."ShiftAssignment" USING btree ("orgId", "employeeId")`
- `ShiftAssignment_orgId_idx`: `CREATE INDEX "ShiftAssignment_orgId_idx" ON app_quikhrms."ShiftAssignment" USING btree ("orgId")`
- `ShiftAssignment_pkey`: `CREATE UNIQUE INDEX "ShiftAssignment_pkey" ON app_quikhrms."ShiftAssignment" USING btree (id)`

---

### ShiftPolicy

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `code` | `text` | NOT NULL |  |
| 5 | `color` | `text` | NULL |  |
| 6 | `startTime` | `text` | NOT NULL |  |
| 7 | `endTime` | `text` | NOT NULL |  |
| 8 | `breakDuration` | `integer` | NOT NULL | `60` |
| 9 | `breakStartTime` | `text` | NULL |  |
| 10 | `breakEndTime` | `text` | NULL |  |
| 11 | `graceMinutes` | `integer` | NOT NULL | `15` |
| 12 | `minHoursRequired` | `numeric(4,2)` | NOT NULL | `8` |
| 13 | `isFlexible` | `boolean` | NOT NULL | `false` |
| 14 | `flexibleWindowStart` | `text` | NULL |  |
| 15 | `flexibleWindowEnd` | `text` | NULL |  |
| 16 | `isNightShift` | `boolean` | NOT NULL | `false` |
| 17 | `weekOffs` | `jsonb` | NULL |  |
| 18 | `effectiveFrom` | `date` | NOT NULL |  |
| 19 | `effectiveTo` | `date` | NULL |  |
| 20 | `isDefault` | `boolean` | NOT NULL | `false` |
| 21 | `createdBy` | `text` | NULL |  |
| 22 | `updatedBy` | `text` | NULL |  |
| 23 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 24 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 25 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `ShiftPolicy_pkey`: PRIMARY KEY (id)

**Indexes**

- `ShiftPolicy_orgId_code_key`: `CREATE UNIQUE INDEX "ShiftPolicy_orgId_code_key" ON app_quikhrms."ShiftPolicy" USING btree ("orgId", code)`
- `ShiftPolicy_orgId_deletedAt_idx`: `CREATE INDEX "ShiftPolicy_orgId_deletedAt_idx" ON app_quikhrms."ShiftPolicy" USING btree ("orgId", "deletedAt")`
- `ShiftPolicy_orgId_idx`: `CREATE INDEX "ShiftPolicy_orgId_idx" ON app_quikhrms."ShiftPolicy" USING btree ("orgId")`
- `ShiftPolicy_pkey`: `CREATE UNIQUE INDEX "ShiftPolicy_pkey" ON app_quikhrms."ShiftPolicy" USING btree (id)`

---

### SocialPost

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `type` | `app_quikhrms."SocialPostType"` | NOT NULL | `'Update'::app_quikhrms."SocialPostType"` |
| 5 | `content` | `text` | NOT NULL |  |
| 6 | `attachments` | `jsonb` | NULL |  |
| 7 | `pollData` | `jsonb` | NULL |  |
| 8 | `visibility` | `app_quikhrms."PostVisibility"` | NOT NULL | `'Organization'::app_quikhrms."PostVisibility"` |
| 9 | `isPinned` | `boolean` | NOT NULL | `false` |
| 10 | `likes` | `jsonb` | NULL |  |
| 11 | `scheduledAt` | `timestamp(3) without time zone` | NULL |  |
| 12 | `approvalStatus` | `app_quikhrms."ContentApprovalStatus"` | NOT NULL | `'Approved'::app_quikhrms."ContentApprovalStatus"` |
| 13 | `approvedById` | `text` | NULL |  |
| 14 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 15 | `rejectionReason` | `text` | NULL |  |
| 16 | `createdBy` | `text` | NULL |  |
| 17 | `updatedBy` | `text` | NULL |  |
| 18 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 19 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 20 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `SocialPost_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `SocialPost_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `SocialPost_orgId_approvalStatus_idx`: `CREATE INDEX "SocialPost_orgId_approvalStatus_idx" ON app_quikhrms."SocialPost" USING btree ("orgId", "approvalStatus")`
- `SocialPost_orgId_deletedAt_idx`: `CREATE INDEX "SocialPost_orgId_deletedAt_idx" ON app_quikhrms."SocialPost" USING btree ("orgId", "deletedAt")`
- `SocialPost_orgId_idx`: `CREATE INDEX "SocialPost_orgId_idx" ON app_quikhrms."SocialPost" USING btree ("orgId")`
- `SocialPost_orgId_type_idx`: `CREATE INDEX "SocialPost_orgId_type_idx" ON app_quikhrms."SocialPost" USING btree ("orgId", type)`
- `SocialPost_pkey`: `CREATE UNIQUE INDEX "SocialPost_pkey" ON app_quikhrms."SocialPost" USING btree (id)`

---

### StateMinimumWage

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `state` | `text` | NOT NULL |  |
| 4 | `scheduledEmployment` | `text` | NOT NULL | `''::text` |
| 5 | `skillLevel` | `text` | NOT NULL | `''::text` |
| 6 | `zone` | `text` | NOT NULL | `''::text` |
| 7 | `monthlyWage` | `numeric(12,2)` | NOT NULL |  |
| 8 | `effectiveFrom` | `timestamp(3) without time zone` | NOT NULL |  |
| 9 | `notes` | `text` | NULL |  |
| 10 | `createdBy` | `text` | NULL |  |
| 11 | `updatedBy` | `text` | NULL |  |
| 12 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 13 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `StateMinimumWage_pkey`: PRIMARY KEY (id)

**Indexes**

- `StateMinimumWage_orgId_idx`: `CREATE INDEX "StateMinimumWage_orgId_idx" ON app_quikhrms."StateMinimumWage" USING btree ("orgId")`
- `StateMinimumWage_orgId_state_effectiveFrom_idx`: `CREATE INDEX "StateMinimumWage_orgId_state_effectiveFrom_idx" ON app_quikhrms."StateMinimumWage" USING btree ("orgId", state, "effectiveFrom")`
- `StateMinimumWage_orgId_state_scheduledEmployment_skillLevel_key`: `CREATE UNIQUE INDEX "StateMinimumWage_orgId_state_scheduledEmployment_skillLevel_key" ON app_quikhrms."StateMinimumWage" USING btree ("orgId", state, "scheduledEmployment", "skillLevel", zone, "effectiveFrom")`
- `StateMinimumWage_pkey`: `CREATE UNIQUE INDEX "StateMinimumWage_pkey" ON app_quikhrms."StateMinimumWage" USING btree (id)`

---

### StatutoryBonusConfig

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `enabled` | `boolean` | NOT NULL | `false` |
| 4 | `minPercent` | `numeric(5,2)` | NOT NULL | `8.33` |
| 5 | `maxPercent` | `numeric(5,2)` | NOT NULL | `20.00` |
| 6 | `eligibilityWageCap` | `numeric(12,2)` | NOT NULL | `21000` |
| 7 | `calculationWageCap` | `numeric(12,2)` | NOT NULL | `7000` |
| 8 | `payoutFrequency` | `app_quikhrms."SalaryFrequency"` | NOT NULL | `'Yearly'::app_quikhrms."SalaryFrequency"` |
| 9 | `createdBy` | `text` | NULL |  |
| 10 | `updatedBy` | `text` | NULL |  |
| 11 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 12 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `StatutoryBonusConfig_pkey`: PRIMARY KEY (id)

**Indexes**

- `StatutoryBonusConfig_orgId_idx`: `CREATE INDEX "StatutoryBonusConfig_orgId_idx" ON app_quikhrms."StatutoryBonusConfig" USING btree ("orgId")`
- `StatutoryBonusConfig_orgId_key`: `CREATE UNIQUE INDEX "StatutoryBonusConfig_orgId_key" ON app_quikhrms."StatutoryBonusConfig" USING btree ("orgId")`
- `StatutoryBonusConfig_pkey`: `CREATE UNIQUE INDEX "StatutoryBonusConfig_pkey" ON app_quikhrms."StatutoryBonusConfig" USING btree (id)`

---

### Survey

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `title` | `text` | NOT NULL |  |
| 4 | `type` | `app_quikhrms."SurveyType"` | NOT NULL | `'Engagement'::app_quikhrms."SurveyType"` |
| 5 | `status` | `app_quikhrms."SurveyStatus"` | NOT NULL | `'SurveyDraft'::app_quikhrms."SurveyStatus"` |
| 6 | `questions` | `jsonb` | NOT NULL |  |
| 7 | `audience` | `jsonb` | NULL |  |
| 8 | `isAnonymous` | `boolean` | NOT NULL | `true` |
| 9 | `startDate` | `timestamp(3) without time zone` | NOT NULL |  |
| 10 | `endDate` | `timestamp(3) without time zone` | NOT NULL |  |
| 11 | `recurrence` | `text` | NULL |  |
| 12 | `responseRate` | `numeric(5,2)` | NOT NULL | `0` |
| 13 | `createdBy` | `text` | NULL |  |
| 14 | `updatedBy` | `text` | NULL |  |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 17 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Survey_pkey`: PRIMARY KEY (id)

**Indexes**

- `Survey_orgId_deletedAt_idx`: `CREATE INDEX "Survey_orgId_deletedAt_idx" ON app_quikhrms."Survey" USING btree ("orgId", "deletedAt")`
- `Survey_orgId_idx`: `CREATE INDEX "Survey_orgId_idx" ON app_quikhrms."Survey" USING btree ("orgId")`
- `Survey_orgId_status_idx`: `CREATE INDEX "Survey_orgId_status_idx" ON app_quikhrms."Survey" USING btree ("orgId", status)`
- `Survey_pkey`: `CREATE UNIQUE INDEX "Survey_pkey" ON app_quikhrms."Survey" USING btree (id)`

---

### SurveyResponse

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `surveyId` | `text` | NOT NULL |  |
| 4 | `employeeId` | `text` | NULL |  |
| 5 | `answers` | `jsonb` | NOT NULL |  |
| 6 | `submittedAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `SurveyResponse_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `SurveyResponse_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `SurveyResponse_surveyId_fkey`: FOREIGN KEY ("surveyId") REFERENCES app_quikhrms."Survey"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `SurveyResponse_orgId_surveyId_idx`: `CREATE INDEX "SurveyResponse_orgId_surveyId_idx" ON app_quikhrms."SurveyResponse" USING btree ("orgId", "surveyId")`
- `SurveyResponse_pkey`: `CREATE UNIQUE INDEX "SurveyResponse_pkey" ON app_quikhrms."SurveyResponse" USING btree (id)`

---

### Task

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `title` | `text` | NOT NULL |  |
| 4 | `description` | `text` | NULL |  |
| 5 | `taskListId` | `text` | NULL |  |
| 6 | `assigneeId` | `text` | NOT NULL |  |
| 7 | `requesterId` | `text` | NULL |  |
| 8 | `requestedFor` | `text` | NULL |  |
| 9 | `dueDate` | `timestamp(3) without time zone` | NULL |  |
| 10 | `status` | `app_quikhrms."TaskStatus"` | NOT NULL | `'Open'::app_quikhrms."TaskStatus"` |
| 11 | `priority` | `app_quikhrms."TaskPriority"` | NOT NULL | `'Normal'::app_quikhrms."TaskPriority"` |
| 12 | `groupKey` | `text` | NULL |  |
| 13 | `meta` | `jsonb` | NULL |  |
| 14 | `completedAt` | `timestamp(3) without time zone` | NULL |  |
| 15 | `completedBy` | `text` | NULL |  |
| 16 | `createdBy` | `text` | NULL |  |
| 17 | `updatedBy` | `text` | NULL |  |
| 18 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 19 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 20 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Task_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Task_taskListId_fkey`: FOREIGN KEY ("taskListId") REFERENCES app_quikhrms."TaskList"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `Task_orgId_assigneeId_status_idx`: `CREATE INDEX "Task_orgId_assigneeId_status_idx" ON app_quikhrms."Task" USING btree ("orgId", "assigneeId", status)`
- `Task_orgId_dueDate_idx`: `CREATE INDEX "Task_orgId_dueDate_idx" ON app_quikhrms."Task" USING btree ("orgId", "dueDate")`
- `Task_orgId_idx`: `CREATE INDEX "Task_orgId_idx" ON app_quikhrms."Task" USING btree ("orgId")`
- `Task_orgId_requesterId_idx`: `CREATE INDEX "Task_orgId_requesterId_idx" ON app_quikhrms."Task" USING btree ("orgId", "requesterId")`
- `Task_orgId_status_idx`: `CREATE INDEX "Task_orgId_status_idx" ON app_quikhrms."Task" USING btree ("orgId", status)`
- `Task_orgId_taskListId_idx`: `CREATE INDEX "Task_orgId_taskListId_idx" ON app_quikhrms."Task" USING btree ("orgId", "taskListId")`
- `Task_pkey`: `CREATE UNIQUE INDEX "Task_pkey" ON app_quikhrms."Task" USING btree (id)`

---

### TaskActivity

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `taskId` | `text` | NOT NULL |  |
| 4 | `authorId` | `text` | NOT NULL |  |
| 5 | `type` | `text` | NOT NULL |  |
| 6 | `content` | `text` | NULL |  |
| 7 | `meta` | `jsonb` | NULL |  |
| 8 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `TaskActivity_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `TaskActivity_taskId_fkey`: FOREIGN KEY ("taskId") REFERENCES app_quikhrms."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `TaskActivity_orgId_idx`: `CREATE INDEX "TaskActivity_orgId_idx" ON app_quikhrms."TaskActivity" USING btree ("orgId")`
- `TaskActivity_pkey`: `CREATE UNIQUE INDEX "TaskActivity_pkey" ON app_quikhrms."TaskActivity" USING btree (id)`
- `TaskActivity_taskId_idx`: `CREATE INDEX "TaskActivity_taskId_idx" ON app_quikhrms."TaskActivity" USING btree ("taskId")`

---

### TaskList

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `description` | `text` | NULL |  |
| 5 | `color` | `text` | NULL |  |
| 6 | `icon` | `text` | NULL |  |
| 7 | `isSystem` | `boolean` | NOT NULL | `false` |
| 8 | `isArchived` | `boolean` | NOT NULL | `false` |
| 9 | `sortOrder` | `integer` | NOT NULL | `0` |
| 10 | `createdBy` | `text` | NULL |  |
| 11 | `updatedBy` | `text` | NULL |  |
| 12 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 13 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 14 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `TaskList_pkey`: PRIMARY KEY (id)

**Indexes**

- `TaskList_orgId_idx`: `CREATE INDEX "TaskList_orgId_idx" ON app_quikhrms."TaskList" USING btree ("orgId")`
- `TaskList_orgId_isArchived_idx`: `CREATE INDEX "TaskList_orgId_isArchived_idx" ON app_quikhrms."TaskList" USING btree ("orgId", "isArchived")`
- `TaskList_orgId_name_key`: `CREATE UNIQUE INDEX "TaskList_orgId_name_key" ON app_quikhrms."TaskList" USING btree ("orgId", name)`
- `TaskList_pkey`: `CREATE UNIQUE INDEX "TaskList_pkey" ON app_quikhrms."TaskList" USING btree (id)`

---

### TdsChallan

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `cin` | `text` | NOT NULL |  |
| 4 | `bsrCode` | `text` | NOT NULL |  |
| 5 | `challanSerial` | `text` | NOT NULL |  |
| 6 | `depositDate` | `date` | NOT NULL |  |
| 7 | `assessmentYear` | `text` | NOT NULL |  |
| 8 | `natureOfPayment` | `text` | NOT NULL | `'92B'::text` |
| 9 | `tanNumber` | `text` | NOT NULL |  |
| 10 | `basicTax` | `numeric(15,2)` | NOT NULL |  |
| 11 | `surcharge` | `numeric(15,2)` | NOT NULL | `0` |
| 12 | `educationCess` | `numeric(15,2)` | NOT NULL | `0` |
| 13 | `interest` | `numeric(15,2)` | NOT NULL | `0` |
| 14 | `lateFee` | `numeric(15,2)` | NOT NULL | `0` |
| 15 | `others` | `numeric(15,2)` | NOT NULL | `0` |
| 16 | `totalAmount` | `numeric(15,2)` | NOT NULL |  |
| 17 | `paymentMode` | `app_quikhrms."TdsPaymentMode"` | NOT NULL |  |
| 18 | `bankName` | `text` | NULL |  |
| 19 | `acknowledgmentNumber` | `text` | NULL |  |
| 20 | `remainingAmount` | `numeric(15,2)` | NOT NULL |  |
| 21 | `status` | `app_quikhrms."TdsChallanStatus"` | NOT NULL | `'Recorded'::app_quikhrms."TdsChallanStatus"` |
| 22 | `createdBy` | `text` | NULL |  |
| 23 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 24 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 25 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `TdsChallan_pkey`: PRIMARY KEY (id)

**Indexes**

- `TdsChallan_orgId_assessmentYear_idx`: `CREATE INDEX "TdsChallan_orgId_assessmentYear_idx" ON app_quikhrms."TdsChallan" USING btree ("orgId", "assessmentYear")`
- `TdsChallan_orgId_cin_key`: `CREATE UNIQUE INDEX "TdsChallan_orgId_cin_key" ON app_quikhrms."TdsChallan" USING btree ("orgId", cin)`
- `TdsChallan_orgId_depositDate_idx`: `CREATE INDEX "TdsChallan_orgId_depositDate_idx" ON app_quikhrms."TdsChallan" USING btree ("orgId", "depositDate")`
- `TdsChallan_orgId_status_idx`: `CREATE INDEX "TdsChallan_orgId_status_idx" ON app_quikhrms."TdsChallan" USING btree ("orgId", status)`
- `TdsChallan_pkey`: `CREATE UNIQUE INDEX "TdsChallan_pkey" ON app_quikhrms."TdsChallan" USING btree (id)`

---

### TdsChallanAllocation

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `challanId` | `text` | NOT NULL |  |
| 4 | `liabilityPeriodId` | `text` | NOT NULL |  |
| 5 | `allocatedAmount` | `numeric(15,2)` | NOT NULL |  |
| 6 | `isAutoAllocated` | `boolean` | NOT NULL | `true` |
| 7 | `allocatedBy` | `text` | NULL |  |
| 8 | `allocatedAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `TdsChallanAllocation_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `TdsChallanAllocation_challanId_fkey`: FOREIGN KEY ("challanId") REFERENCES app_quikhrms."TdsChallan"(id) ON UPDATE CASCADE ON DELETE CASCADE
- `TdsChallanAllocation_liabilityPeriodId_fkey`: FOREIGN KEY ("liabilityPeriodId") REFERENCES app_quikhrms."TdsLiabilityPeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `TdsChallanAllocation_challanId_liabilityPeriodId_key`: `CREATE UNIQUE INDEX "TdsChallanAllocation_challanId_liabilityPeriodId_key" ON app_quikhrms."TdsChallanAllocation" USING btree ("challanId", "liabilityPeriodId")`
- `TdsChallanAllocation_orgId_challanId_idx`: `CREATE INDEX "TdsChallanAllocation_orgId_challanId_idx" ON app_quikhrms."TdsChallanAllocation" USING btree ("orgId", "challanId")`
- `TdsChallanAllocation_orgId_liabilityPeriodId_idx`: `CREATE INDEX "TdsChallanAllocation_orgId_liabilityPeriodId_idx" ON app_quikhrms."TdsChallanAllocation" USING btree ("orgId", "liabilityPeriodId")`
- `TdsChallanAllocation_pkey`: `CREATE UNIQUE INDEX "TdsChallanAllocation_pkey" ON app_quikhrms."TdsChallanAllocation" USING btree (id)`

---

### TdsLiabilityPeriod

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `periodYear` | `integer` | NOT NULL |  |
| 4 | `periodMonth` | `integer` | NOT NULL |  |
| 5 | `natureOfPayment` | `text` | NOT NULL | `'92B'::text` |
| 6 | `totalDeducted` | `numeric(15,2)` | NOT NULL | `0` |
| 7 | `totalAllocated` | `numeric(15,2)` | NOT NULL | `0` |
| 8 | `employeeCount` | `integer` | NOT NULL | `0` |
| 9 | `payslipIds` | `jsonb` | NOT NULL | `'[]'::jsonb` |
| 10 | `dueDate` | `date` | NOT NULL |  |
| 11 | `status` | `app_quikhrms."TdsPeriodStatus"` | NOT NULL | `'Pending'::app_quikhrms."TdsPeriodStatus"` |
| 12 | `lastComputedAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 13 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 14 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `TdsLiabilityPeriod_pkey`: PRIMARY KEY (id)

**Indexes**

- `TdsLiabilityPeriod_orgId_periodYear_periodMonth_idx`: `CREATE INDEX "TdsLiabilityPeriod_orgId_periodYear_periodMonth_idx" ON app_quikhrms."TdsLiabilityPeriod" USING btree ("orgId", "periodYear", "periodMonth")`
- `TdsLiabilityPeriod_orgId_periodYear_periodMonth_natureOfPay_key`: `CREATE UNIQUE INDEX "TdsLiabilityPeriod_orgId_periodYear_periodMonth_natureOfPay_key" ON app_quikhrms."TdsLiabilityPeriod" USING btree ("orgId", "periodYear", "periodMonth", "natureOfPayment")`
- `TdsLiabilityPeriod_orgId_status_idx`: `CREATE INDEX "TdsLiabilityPeriod_orgId_status_idx" ON app_quikhrms."TdsLiabilityPeriod" USING btree ("orgId", status)`
- `TdsLiabilityPeriod_pkey`: `CREATE UNIQUE INDEX "TdsLiabilityPeriod_pkey" ON app_quikhrms."TdsLiabilityPeriod" USING btree (id)`

---

### TdsOverride

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `setOnPayRunId` | `text` | NOT NULL |  |
| 5 | `setOnPeriod` | `date` | NOT NULL |  |
| 6 | `fy` | `text` | NOT NULL |  |
| 7 | `originalTds` | `numeric(15,2)` | NOT NULL |  |
| 8 | `overrideTds` | `numeric(15,2)` | NOT NULL |  |
| 9 | `shortfall` | `numeric(15,2)` | NOT NULL |  |
| 10 | `recoveryStrategy` | `app_quikhrms."TdsRecoveryStrategy"` | NOT NULL |  |
| 11 | `recoveryMonths` | `integer` | NOT NULL |  |
| 12 | `perMonthAmount` | `numeric(15,2)` | NOT NULL |  |
| 13 | `recoveryStart` | `date` | NOT NULL |  |
| 14 | `recoveryEnd` | `date` | NOT NULL |  |
| 15 | `reason` | `text` | NULL |  |
| 16 | `status` | `app_quikhrms."TdsOverrideStatus"` | NOT NULL | `'Active'::app_quikhrms."TdsOverrideStatus"` |
| 17 | `createdBy` | `text` | NULL |  |
| 18 | `updatedBy` | `text` | NULL |  |
| 19 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 20 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 21 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `TdsOverride_pkey`: PRIMARY KEY (id)

**Indexes**

- `TdsOverride_orgId_employeeId_status_idx`: `CREATE INDEX "TdsOverride_orgId_employeeId_status_idx" ON app_quikhrms."TdsOverride" USING btree ("orgId", "employeeId", status)`
- `TdsOverride_orgId_fy_status_idx`: `CREATE INDEX "TdsOverride_orgId_fy_status_idx" ON app_quikhrms."TdsOverride" USING btree ("orgId", fy, status)`
- `TdsOverride_orgId_setOnPayRunId_idx`: `CREATE INDEX "TdsOverride_orgId_setOnPayRunId_idx" ON app_quikhrms."TdsOverride" USING btree ("orgId", "setOnPayRunId")`
- `TdsOverride_pkey`: `CREATE UNIQUE INDEX "TdsOverride_pkey" ON app_quikhrms."TdsOverride" USING btree (id)`

---

### Team

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `departmentId` | `text` | NOT NULL |  |
| 4 | `name` | `text` | NOT NULL |  |
| 5 | `leadId` | `text` | NULL |  |
| 6 | `description` | `text` | NULL |  |
| 7 | `createdBy` | `text` | NULL |  |
| 8 | `updatedBy` | `text` | NULL |  |
| 9 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 10 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 11 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Team_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Team_departmentId_fkey`: FOREIGN KEY ("departmentId") REFERENCES app_quikhrms."Department"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `Team_leadId_fkey`: FOREIGN KEY ("leadId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `Team_orgId_deletedAt_idx`: `CREATE INDEX "Team_orgId_deletedAt_idx" ON app_quikhrms."Team" USING btree ("orgId", "deletedAt")`
- `Team_orgId_departmentId_idx`: `CREATE INDEX "Team_orgId_departmentId_idx" ON app_quikhrms."Team" USING btree ("orgId", "departmentId")`
- `Team_orgId_idx`: `CREATE INDEX "Team_orgId_idx" ON app_quikhrms."Team" USING btree ("orgId")`
- `Team_pkey`: `CREATE UNIQUE INDEX "Team_pkey" ON app_quikhrms."Team" USING btree (id)`

---

### Ticket

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `ticketNo` | `text` | NOT NULL |  |
| 4 | `title` | `text` | NOT NULL |  |
| 5 | `description` | `text` | NOT NULL |  |
| 6 | `categoryId` | `text` | NULL |  |
| 7 | `departmentId` | `text` | NULL |  |
| 8 | `priority` | `app_quikhrms."TicketPriority"` | NOT NULL | `'Medium'::app_quikhrms."TicketPriority"` |
| 9 | `status` | `app_quikhrms."TicketStatus"` | NOT NULL | `'Open'::app_quikhrms."TicketStatus"` |
| 10 | `source` | `app_quikhrms."TicketSource"` | NOT NULL | `'Web'::app_quikhrms."TicketSource"` |
| 11 | `raisedById` | `text` | NOT NULL |  |
| 12 | `assignedToId` | `text` | NULL |  |
| 13 | `slaResponseDueAt` | `timestamp(3) without time zone` | NULL |  |
| 14 | `slaResolveDueAt` | `timestamp(3) without time zone` | NULL |  |
| 15 | `firstResponseAt` | `timestamp(3) without time zone` | NULL |  |
| 16 | `resolvedAt` | `timestamp(3) without time zone` | NULL |  |
| 17 | `closedAt` | `timestamp(3) without time zone` | NULL |  |
| 18 | `reopenedAt` | `timestamp(3) without time zone` | NULL |  |
| 19 | `reopenCount` | `integer` | NOT NULL | `0` |
| 20 | `responseBreachedAt` | `timestamp(3) without time zone` | NULL |  |
| 21 | `resolveBreachedAt` | `timestamp(3) without time zone` | NULL |  |
| 22 | `escalationLevel` | `integer` | NOT NULL | `0` |
| 23 | `resolutionNote` | `text` | NULL |  |
| 24 | `rejectionReason` | `text` | NULL |  |
| 25 | `createdBy` | `text` | NULL |  |
| 26 | `updatedBy` | `text` | NULL |  |
| 27 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 28 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 29 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Ticket_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `Ticket_assignedToId_fkey`: FOREIGN KEY ("assignedToId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Ticket_categoryId_fkey`: FOREIGN KEY ("categoryId") REFERENCES app_quikhrms."TicketCategory"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Ticket_departmentId_fkey`: FOREIGN KEY ("departmentId") REFERENCES app_quikhrms."Department"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `Ticket_raisedById_fkey`: FOREIGN KEY ("raisedById") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `Ticket_orgId_assignedToId_idx`: `CREATE INDEX "Ticket_orgId_assignedToId_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "assignedToId")`
- `Ticket_orgId_assignedToId_status_idx`: `CREATE INDEX "Ticket_orgId_assignedToId_status_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "assignedToId", status)`
- `Ticket_orgId_categoryId_idx`: `CREATE INDEX "Ticket_orgId_categoryId_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "categoryId")`
- `Ticket_orgId_deletedAt_idx`: `CREATE INDEX "Ticket_orgId_deletedAt_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "deletedAt")`
- `Ticket_orgId_deletedAt_status_createdAt_idx`: `CREATE INDEX "Ticket_orgId_deletedAt_status_createdAt_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "deletedAt", status, "createdAt" DESC)`
- `Ticket_orgId_departmentId_idx`: `CREATE INDEX "Ticket_orgId_departmentId_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "departmentId")`
- `Ticket_orgId_idx`: `CREATE INDEX "Ticket_orgId_idx" ON app_quikhrms."Ticket" USING btree ("orgId")`
- `Ticket_orgId_priority_idx`: `CREATE INDEX "Ticket_orgId_priority_idx" ON app_quikhrms."Ticket" USING btree ("orgId", priority)`
- `Ticket_orgId_raisedById_idx`: `CREATE INDEX "Ticket_orgId_raisedById_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "raisedById")`
- `Ticket_orgId_raisedById_status_idx`: `CREATE INDEX "Ticket_orgId_raisedById_status_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "raisedById", status)`
- `Ticket_orgId_resolveBreachedAt_idx`: `CREATE INDEX "Ticket_orgId_resolveBreachedAt_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "resolveBreachedAt")`
- `Ticket_orgId_slaResolveDueAt_idx`: `CREATE INDEX "Ticket_orgId_slaResolveDueAt_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "slaResolveDueAt")`
- `Ticket_orgId_slaResponseDueAt_firstResponseAt_idx`: `CREATE INDEX "Ticket_orgId_slaResponseDueAt_firstResponseAt_idx" ON app_quikhrms."Ticket" USING btree ("orgId", "slaResponseDueAt", "firstResponseAt")`
- `Ticket_orgId_status_idx`: `CREATE INDEX "Ticket_orgId_status_idx" ON app_quikhrms."Ticket" USING btree ("orgId", status)`
- `Ticket_orgId_status_priority_createdAt_idx`: `CREATE INDEX "Ticket_orgId_status_priority_createdAt_idx" ON app_quikhrms."Ticket" USING btree ("orgId", status, priority, "createdAt" DESC)`
- `Ticket_orgId_ticketNo_key`: `CREATE UNIQUE INDEX "Ticket_orgId_ticketNo_key" ON app_quikhrms."Ticket" USING btree ("orgId", "ticketNo")`
- `Ticket_pkey`: `CREATE UNIQUE INDEX "Ticket_pkey" ON app_quikhrms."Ticket" USING btree (id)`

---

### TicketActivity

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `ticketId` | `text` | NOT NULL |  |
| 4 | `actorId` | `text` | NULL |  |
| 5 | `isSystem` | `boolean` | NOT NULL | `false` |
| 6 | `action` | `text` | NOT NULL |  |
| 7 | `fromVal` | `text` | NULL |  |
| 8 | `toVal` | `text` | NULL |  |
| 9 | `meta` | `jsonb` | NULL |  |
| 10 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `TicketActivity_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `TicketActivity_actorId_fkey`: FOREIGN KEY ("actorId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL
- `TicketActivity_ticketId_fkey`: FOREIGN KEY ("ticketId") REFERENCES app_quikhrms."Ticket"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `TicketActivity_orgId_actorId_idx`: `CREATE INDEX "TicketActivity_orgId_actorId_idx" ON app_quikhrms."TicketActivity" USING btree ("orgId", "actorId")`
- `TicketActivity_orgId_idx`: `CREATE INDEX "TicketActivity_orgId_idx" ON app_quikhrms."TicketActivity" USING btree ("orgId")`
- `TicketActivity_orgId_ticketId_idx`: `CREATE INDEX "TicketActivity_orgId_ticketId_idx" ON app_quikhrms."TicketActivity" USING btree ("orgId", "ticketId")`
- `TicketActivity_pkey`: `CREATE UNIQUE INDEX "TicketActivity_pkey" ON app_quikhrms."TicketActivity" USING btree (id)`

---

### TicketAttachment

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `ticketId` | `text` | NOT NULL |  |
| 4 | `fileUrl` | `text` | NOT NULL |  |
| 5 | `fileName` | `text` | NOT NULL |  |
| 6 | `fileType` | `text` | NULL |  |
| 7 | `fileSize` | `integer` | NULL |  |
| 8 | `uploadedById` | `text` | NULL |  |
| 9 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 10 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `TicketAttachment_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `TicketAttachment_ticketId_fkey`: FOREIGN KEY ("ticketId") REFERENCES app_quikhrms."Ticket"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `TicketAttachment_orgId_idx`: `CREATE INDEX "TicketAttachment_orgId_idx" ON app_quikhrms."TicketAttachment" USING btree ("orgId")`
- `TicketAttachment_orgId_ticketId_idx`: `CREATE INDEX "TicketAttachment_orgId_ticketId_idx" ON app_quikhrms."TicketAttachment" USING btree ("orgId", "ticketId")`
- `TicketAttachment_pkey`: `CREATE UNIQUE INDEX "TicketAttachment_pkey" ON app_quikhrms."TicketAttachment" USING btree (id)`

---

### TicketCategory

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `slug` | `text` | NOT NULL |  |
| 5 | `description` | `text` | NULL |  |
| 6 | `defaultAssigneeId` | `text` | NULL |  |
| 7 | `departmentId` | `text` | NULL |  |
| 8 | `slaResponseHours` | `integer` | NOT NULL | `24` |
| 9 | `slaResolveHours` | `integer` | NOT NULL | `72` |
| 10 | `slaMatrix` | `jsonb` | NULL |  |
| 11 | `autoCloseAfterDays` | `integer` | NOT NULL | `7` |
| 12 | `isActive` | `boolean` | NOT NULL | `true` |
| 13 | `createdBy` | `text` | NULL |  |
| 14 | `updatedBy` | `text` | NULL |  |
| 15 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 16 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 17 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `TicketCategory_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `TicketCategory_departmentId_fkey`: FOREIGN KEY ("departmentId") REFERENCES app_quikhrms."Department"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `TicketCategory_orgId_deletedAt_idx`: `CREATE INDEX "TicketCategory_orgId_deletedAt_idx" ON app_quikhrms."TicketCategory" USING btree ("orgId", "deletedAt")`
- `TicketCategory_orgId_departmentId_idx`: `CREATE INDEX "TicketCategory_orgId_departmentId_idx" ON app_quikhrms."TicketCategory" USING btree ("orgId", "departmentId")`
- `TicketCategory_orgId_idx`: `CREATE INDEX "TicketCategory_orgId_idx" ON app_quikhrms."TicketCategory" USING btree ("orgId")`
- `TicketCategory_orgId_isActive_idx`: `CREATE INDEX "TicketCategory_orgId_isActive_idx" ON app_quikhrms."TicketCategory" USING btree ("orgId", "isActive")`
- `TicketCategory_orgId_slug_key`: `CREATE UNIQUE INDEX "TicketCategory_orgId_slug_key" ON app_quikhrms."TicketCategory" USING btree ("orgId", slug)`
- `TicketCategory_pkey`: `CREATE UNIQUE INDEX "TicketCategory_pkey" ON app_quikhrms."TicketCategory" USING btree (id)`

---

### TicketComment

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `ticketId` | `text` | NOT NULL |  |
| 4 | `userId` | `text` | NOT NULL |  |
| 5 | `message` | `text` | NOT NULL |  |
| 6 | `isInternal` | `boolean` | NOT NULL | `false` |
| 7 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 8 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 9 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `TicketComment_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `TicketComment_ticketId_fkey`: FOREIGN KEY ("ticketId") REFERENCES app_quikhrms."Ticket"(id) ON UPDATE CASCADE ON DELETE CASCADE
- `TicketComment_userId_fkey`: FOREIGN KEY ("userId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `TicketComment_orgId_deletedAt_idx`: `CREATE INDEX "TicketComment_orgId_deletedAt_idx" ON app_quikhrms."TicketComment" USING btree ("orgId", "deletedAt")`
- `TicketComment_orgId_idx`: `CREATE INDEX "TicketComment_orgId_idx" ON app_quikhrms."TicketComment" USING btree ("orgId")`
- `TicketComment_orgId_ticketId_idx`: `CREATE INDEX "TicketComment_orgId_ticketId_idx" ON app_quikhrms."TicketComment" USING btree ("orgId", "ticketId")`
- `TicketComment_pkey`: `CREATE UNIQUE INDEX "TicketComment_pkey" ON app_quikhrms."TicketComment" USING btree (id)`

---

### TimeJob

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `projectId` | `text` | NOT NULL |  |
| 4 | `name` | `text` | NOT NULL |  |
| 5 | `code` | `text` | NULL |  |
| 6 | `description` | `text` | NULL |  |
| 7 | `assigneeId` | `text` | NULL |  |
| 8 | `departmentId` | `text` | NULL |  |
| 9 | `estimatedHours` | `numeric(10,2)` | NULL |  |
| 10 | `startDate` | `date` | NULL |  |
| 11 | `dueDate` | `date` | NULL |  |
| 12 | `isBillable` | `boolean` | NOT NULL | `false` |
| 13 | `status` | `app_quikhrms."JobStatus"` | NOT NULL | `'JobActive'::app_quikhrms."JobStatus"` |
| 14 | `createdBy` | `text` | NULL |  |
| 15 | `updatedBy` | `text` | NULL |  |
| 16 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 17 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 18 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `TimeJob_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `TimeJob_projectId_fkey`: FOREIGN KEY ("projectId") REFERENCES app_quikhrms."TimeProject"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `TimeJob_orgId_assigneeId_idx`: `CREATE INDEX "TimeJob_orgId_assigneeId_idx" ON app_quikhrms."TimeJob" USING btree ("orgId", "assigneeId")`
- `TimeJob_orgId_deletedAt_idx`: `CREATE INDEX "TimeJob_orgId_deletedAt_idx" ON app_quikhrms."TimeJob" USING btree ("orgId", "deletedAt")`
- `TimeJob_orgId_idx`: `CREATE INDEX "TimeJob_orgId_idx" ON app_quikhrms."TimeJob" USING btree ("orgId")`
- `TimeJob_orgId_projectId_idx`: `CREATE INDEX "TimeJob_orgId_projectId_idx" ON app_quikhrms."TimeJob" USING btree ("orgId", "projectId")`
- `TimeJob_pkey`: `CREATE UNIQUE INDEX "TimeJob_pkey" ON app_quikhrms."TimeJob" USING btree (id)`

---

### TimeLog

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `date` | `date` | NOT NULL |  |
| 5 | `startTime` | `timestamp(3) without time zone` | NOT NULL |  |
| 6 | `endTime` | `timestamp(3) without time zone` | NULL |  |
| 7 | `duration` | `numeric(6,2)` | NOT NULL | `0` |
| 8 | `projectId` | `text` | NULL |  |
| 9 | `taskId` | `text` | NULL |  |
| 10 | `description` | `text` | NULL |  |
| 11 | `isBillable` | `boolean` | NOT NULL | `false` |
| 12 | `status` | `app_quikhrms."TimeLogStatus"` | NOT NULL | `'LogDraft'::app_quikhrms."TimeLogStatus"` |
| 13 | `timesheetId` | `text` | NULL |  |
| 14 | `createdBy` | `text` | NULL |  |
| 15 | `updatedBy` | `text` | NULL |  |
| 16 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 17 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 18 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `TimeLog_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `TimeLog_timesheetId_fkey`: FOREIGN KEY ("timesheetId") REFERENCES app_quikhrms."Timesheet"(id) ON UPDATE CASCADE ON DELETE SET NULL

**Indexes**

- `TimeLog_orgId_deletedAt_idx`: `CREATE INDEX "TimeLog_orgId_deletedAt_idx" ON app_quikhrms."TimeLog" USING btree ("orgId", "deletedAt")`
- `TimeLog_orgId_employeeId_date_idx`: `CREATE INDEX "TimeLog_orgId_employeeId_date_idx" ON app_quikhrms."TimeLog" USING btree ("orgId", "employeeId", date)`
- `TimeLog_orgId_idx`: `CREATE INDEX "TimeLog_orgId_idx" ON app_quikhrms."TimeLog" USING btree ("orgId")`
- `TimeLog_orgId_status_idx`: `CREATE INDEX "TimeLog_orgId_status_idx" ON app_quikhrms."TimeLog" USING btree ("orgId", status)`
- `TimeLog_orgId_timesheetId_idx`: `CREATE INDEX "TimeLog_orgId_timesheetId_idx" ON app_quikhrms."TimeLog" USING btree ("orgId", "timesheetId")`
- `TimeLog_pkey`: `CREATE UNIQUE INDEX "TimeLog_pkey" ON app_quikhrms."TimeLog" USING btree (id)`

---

### TimeProject

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `code` | `text` | NULL |  |
| 5 | `description` | `text` | NULL |  |
| 6 | `clientName` | `text` | NULL |  |
| 7 | `departmentId` | `text` | NULL |  |
| 8 | `ownerId` | `text` | NULL |  |
| 9 | `budgetHours` | `numeric(10,2)` | NULL |  |
| 10 | `startDate` | `date` | NULL |  |
| 11 | `endDate` | `date` | NULL |  |
| 12 | `isBillable` | `boolean` | NOT NULL | `false` |
| 13 | `status` | `app_quikhrms."ProjectStatus"` | NOT NULL | `'ProjectActive'::app_quikhrms."ProjectStatus"` |
| 14 | `memberIds` | `jsonb` | NULL |  |
| 15 | `createdBy` | `text` | NULL |  |
| 16 | `updatedBy` | `text` | NULL |  |
| 17 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 18 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 19 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `TimeProject_pkey`: PRIMARY KEY (id)

**Indexes**

- `TimeProject_orgId_code_key`: `CREATE UNIQUE INDEX "TimeProject_orgId_code_key" ON app_quikhrms."TimeProject" USING btree ("orgId", code)`
- `TimeProject_orgId_deletedAt_idx`: `CREATE INDEX "TimeProject_orgId_deletedAt_idx" ON app_quikhrms."TimeProject" USING btree ("orgId", "deletedAt")`
- `TimeProject_orgId_departmentId_idx`: `CREATE INDEX "TimeProject_orgId_departmentId_idx" ON app_quikhrms."TimeProject" USING btree ("orgId", "departmentId")`
- `TimeProject_orgId_idx`: `CREATE INDEX "TimeProject_orgId_idx" ON app_quikhrms."TimeProject" USING btree ("orgId")`
- `TimeProject_orgId_status_idx`: `CREATE INDEX "TimeProject_orgId_status_idx" ON app_quikhrms."TimeProject" USING btree ("orgId", status)`
- `TimeProject_pkey`: `CREATE UNIQUE INDEX "TimeProject_pkey" ON app_quikhrms."TimeProject" USING btree (id)`

---

### Timesheet

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `periodType` | `app_quikhrms."TimesheetPeriodType"` | NOT NULL | `'Weekly'::app_quikhrms."TimesheetPeriodType"` |
| 5 | `periodStart` | `date` | NOT NULL |  |
| 6 | `periodEnd` | `date` | NOT NULL |  |
| 7 | `totalHours` | `numeric(7,2)` | NOT NULL | `0` |
| 8 | `billableHours` | `numeric(7,2)` | NOT NULL | `0` |
| 9 | `status` | `app_quikhrms."TimesheetStatus"` | NOT NULL | `'TsDraft'::app_quikhrms."TimesheetStatus"` |
| 10 | `submittedAt` | `timestamp(3) without time zone` | NULL |  |
| 11 | `approvedBy` | `text` | NULL |  |
| 12 | `approvedAt` | `timestamp(3) without time zone` | NULL |  |
| 13 | `rejectionReason` | `text` | NULL |  |
| 14 | `notes` | `text` | NULL |  |
| 15 | `createdBy` | `text` | NULL |  |
| 16 | `updatedBy` | `text` | NULL |  |
| 17 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 18 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 19 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `Timesheet_pkey`: PRIMARY KEY (id)

**Indexes**

- `Timesheet_orgId_deletedAt_idx`: `CREATE INDEX "Timesheet_orgId_deletedAt_idx" ON app_quikhrms."Timesheet" USING btree ("orgId", "deletedAt")`
- `Timesheet_orgId_employeeId_idx`: `CREATE INDEX "Timesheet_orgId_employeeId_idx" ON app_quikhrms."Timesheet" USING btree ("orgId", "employeeId")`
- `Timesheet_orgId_employeeId_periodStart_periodEnd_key`: `CREATE UNIQUE INDEX "Timesheet_orgId_employeeId_periodStart_periodEnd_key" ON app_quikhrms."Timesheet" USING btree ("orgId", "employeeId", "periodStart", "periodEnd")`
- `Timesheet_orgId_idx`: `CREATE INDEX "Timesheet_orgId_idx" ON app_quikhrms."Timesheet" USING btree ("orgId")`
- `Timesheet_orgId_status_idx`: `CREATE INDEX "Timesheet_orgId_status_idx" ON app_quikhrms."Timesheet" USING btree ("orgId", status)`
- `Timesheet_pkey`: `CREATE UNIQUE INDEX "Timesheet_pkey" ON app_quikhrms."Timesheet" USING btree (id)`

---

### UserAppRole

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `userId` | `text` | NOT NULL |  |
| 3 | `orgId` | `text` | NOT NULL |  |
| 4 | `roleId` | `text` | NOT NULL |  |
| 5 | `assignedAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 6 | `assignedBy` | `text` | NULL |  |
| 7 | `expiresAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `UserAppRole_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `UserAppRole_roleId_fkey`: FOREIGN KEY ("roleId") REFERENCES app_quikhrms."AppRole"(id) ON UPDATE CASCADE ON DELETE CASCADE
- `UserAppRole_userId_fkey`: FOREIGN KEY ("userId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `UserAppRole_expiresAt_idx`: `CREATE INDEX "UserAppRole_expiresAt_idx" ON app_quikhrms."UserAppRole" USING btree ("expiresAt")`
- `UserAppRole_pkey`: `CREATE UNIQUE INDEX "UserAppRole_pkey" ON app_quikhrms."UserAppRole" USING btree (id)`
- `UserAppRole_roleId_idx`: `CREATE INDEX "UserAppRole_roleId_idx" ON app_quikhrms."UserAppRole" USING btree ("roleId")`
- `UserAppRole_userId_orgId_idx`: `CREATE INDEX "UserAppRole_userId_orgId_idx" ON app_quikhrms."UserAppRole" USING btree ("userId", "orgId")`
- `UserAppRole_userId_orgId_roleId_key`: `CREATE UNIQUE INDEX "UserAppRole_userId_orgId_roleId_key" ON app_quikhrms."UserAppRole" USING btree ("userId", "orgId", "roleId")`

---

### UserPermissionExtra

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `userId` | `text` | NOT NULL |  |
| 4 | `resource` | `text` | NOT NULL |  |
| 5 | `action` | `text` | NOT NULL |  |
| 6 | `kind` | `app_quikhrms."PermissionGrantKind"` | NOT NULL | `'GRANT'::app_quikhrms."PermissionGrantKind"` |
| 7 | `grantedBy` | `text` | NULL |  |
| 8 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

**Primary Key**

- `UserPermissionExtra_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `UserPermissionExtra_userId_fkey`: FOREIGN KEY ("userId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `UserPermissionExtra_orgId_userId_resource_action_key`: `CREATE UNIQUE INDEX "UserPermissionExtra_orgId_userId_resource_action_key" ON app_quikhrms."UserPermissionExtra" USING btree ("orgId", "userId", resource, action)`
- `UserPermissionExtra_pkey`: `CREATE UNIQUE INDEX "UserPermissionExtra_pkey" ON app_quikhrms."UserPermissionExtra" USING btree (id)`
- `UserPermissionExtra_userId_orgId_idx`: `CREATE INDEX "UserPermissionExtra_userId_orgId_idx" ON app_quikhrms."UserPermissionExtra" USING btree ("userId", "orgId")`

---

### WfhApproval

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `wfhRequestId` | `text` | NOT NULL |  |
| 4 | `approverId` | `text` | NOT NULL |  |
| 5 | `level` | `integer` | NOT NULL | `1` |
| 6 | `role` | `app_quikhrms."WfhApproverRole"` | NOT NULL |  |
| 7 | `status` | `app_quikhrms."WfhApprovalStatus"` | NOT NULL | `'Pending'::app_quikhrms."WfhApprovalStatus"` |
| 8 | `comment` | `text` | NULL |  |
| 9 | `decidedAt` | `timestamp(3) without time zone` | NULL |  |
| 10 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 11 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |

**Primary Key**

- `WfhApproval_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `WfhApproval_approverId_fkey`: FOREIGN KEY ("approverId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT
- `WfhApproval_wfhRequestId_fkey`: FOREIGN KEY ("wfhRequestId") REFERENCES app_quikhrms."WfhRequest"(id) ON UPDATE CASCADE ON DELETE CASCADE

**Indexes**

- `WfhApproval_orgId_approverId_status_idx`: `CREATE INDEX "WfhApproval_orgId_approverId_status_idx" ON app_quikhrms."WfhApproval" USING btree ("orgId", "approverId", status)`
- `WfhApproval_orgId_idx`: `CREATE INDEX "WfhApproval_orgId_idx" ON app_quikhrms."WfhApproval" USING btree ("orgId")`
- `WfhApproval_orgId_wfhRequestId_idx`: `CREATE INDEX "WfhApproval_orgId_wfhRequestId_idx" ON app_quikhrms."WfhApproval" USING btree ("orgId", "wfhRequestId")`
- `WfhApproval_pkey`: `CREATE UNIQUE INDEX "WfhApproval_pkey" ON app_quikhrms."WfhApproval" USING btree (id)`

---

### WfhQuotaGroup

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `name` | `text` | NOT NULL |  |
| 4 | `description` | `text` | NULL |  |
| 5 | `yearlyQuota` | `integer` | NOT NULL |  |
| 6 | `mode` | `app_quikhrms."WfhGroupMode"` | NOT NULL | `'Department'::app_quikhrms."WfhGroupMode"` |
| 7 | `isActive` | `boolean` | NOT NULL | `true` |
| 8 | `createdBy` | `text` | NULL |  |
| 9 | `updatedBy` | `text` | NULL |  |
| 10 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 11 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 12 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |
| 13 | `departmentIds` | `text[]` | NULL | `ARRAY[]::text[]` |

**Primary Key**

- `WfhQuotaGroup_pkey`: PRIMARY KEY (id)

**Indexes**

- `WfhQuotaGroup_orgId_deletedAt_idx`: `CREATE INDEX "WfhQuotaGroup_orgId_deletedAt_idx" ON app_quikhrms."WfhQuotaGroup" USING btree ("orgId", "deletedAt")`
- `WfhQuotaGroup_orgId_idx`: `CREATE INDEX "WfhQuotaGroup_orgId_idx" ON app_quikhrms."WfhQuotaGroup" USING btree ("orgId")`
- `WfhQuotaGroup_orgId_name_key`: `CREATE UNIQUE INDEX "WfhQuotaGroup_orgId_name_key" ON app_quikhrms."WfhQuotaGroup" USING btree ("orgId", name)`
- `WfhQuotaGroup_pkey`: `CREATE UNIQUE INDEX "WfhQuotaGroup_pkey" ON app_quikhrms."WfhQuotaGroup" USING btree (id)`

---

### WfhRequest

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NOT NULL |  |
| 2 | `orgId` | `text` | NOT NULL |  |
| 3 | `employeeId` | `text` | NOT NULL |  |
| 4 | `startDate` | `date` | NOT NULL |  |
| 5 | `endDate` | `date` | NOT NULL |  |
| 6 | `days` | `numeric(5,2)` | NOT NULL |  |
| 7 | `isHalfDay` | `boolean` | NOT NULL | `false` |
| 8 | `session` | `app_quikhrms."WfhSession"` | NOT NULL | `'FullDay'::app_quikhrms."WfhSession"` |
| 9 | `reason` | `text` | NOT NULL |  |
| 10 | `attachments` | `jsonb` | NULL |  |
| 11 | `status` | `app_quikhrms."WfhStatus"` | NOT NULL | `'Pending'::app_quikhrms."WfhStatus"` |
| 12 | `appliedOn` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 13 | `cancelReason` | `text` | NULL |  |
| 14 | `createdBy` | `text` | NULL |  |
| 15 | `updatedBy` | `text` | NULL |  |
| 16 | `createdAt` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |
| 17 | `updatedAt` | `timestamp(3) without time zone` | NOT NULL |  |
| 18 | `deletedAt` | `timestamp(3) without time zone` | NULL |  |

**Primary Key**

- `WfhRequest_pkey`: PRIMARY KEY (id)

**Foreign Keys**

- `WfhRequest_employeeId_fkey`: FOREIGN KEY ("employeeId") REFERENCES app_quikhrms."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT

**Indexes**

- `WfhRequest_orgId_deletedAt_idx`: `CREATE INDEX "WfhRequest_orgId_deletedAt_idx" ON app_quikhrms."WfhRequest" USING btree ("orgId", "deletedAt")`
- `WfhRequest_orgId_employeeId_idx`: `CREATE INDEX "WfhRequest_orgId_employeeId_idx" ON app_quikhrms."WfhRequest" USING btree ("orgId", "employeeId")`
- `WfhRequest_orgId_idx`: `CREATE INDEX "WfhRequest_orgId_idx" ON app_quikhrms."WfhRequest" USING btree ("orgId")`
- `WfhRequest_orgId_startDate_endDate_idx`: `CREATE INDEX "WfhRequest_orgId_startDate_endDate_idx" ON app_quikhrms."WfhRequest" USING btree ("orgId", "startDate", "endDate")`
- `WfhRequest_orgId_status_idx`: `CREATE INDEX "WfhRequest_orgId_status_idx" ON app_quikhrms."WfhRequest" USING btree ("orgId", status)`
- `WfhRequest_pkey`: `CREATE UNIQUE INDEX "WfhRequest_pkey" ON app_quikhrms."WfhRequest" USING btree (id)`

---

### _prisma_migrations

**Columns**

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `character varying(36)` | NOT NULL |  |
| 2 | `checksum` | `character varying(64)` | NOT NULL |  |
| 3 | `finished_at` | `timestamp with time zone` | NULL |  |
| 4 | `migration_name` | `character varying(255)` | NOT NULL |  |
| 5 | `logs` | `text` | NULL |  |
| 6 | `rolled_back_at` | `timestamp with time zone` | NULL |  |
| 7 | `started_at` | `timestamp with time zone` | NOT NULL | `now()` |
| 8 | `applied_steps_count` | `integer` | NOT NULL | `0` |

**Primary Key**

- `_prisma_migrations_pkey`: PRIMARY KEY (id)

**Indexes**

- `_prisma_migrations_pkey`: `CREATE UNIQUE INDEX _prisma_migrations_pkey ON app_quikhrms._prisma_migrations USING btree (id)`

---

## Enumerated Types

Postgres `enum` types in this schema, referenced as column data types above.

| Type | Values |
|------|--------|
| `ApplicationStatus` | `AppActive`, `AppHired`, `AppRejected`, `AppOnHold`, `AppWithdrawn`, `AppOffered`, `AppDeclined` |
| `AppraisalCycleStatus` | `Setup`, `GoalSetting`, `SelfReview`, `ManagerReview`, `PeerReview`, `Calibration`, `Complete` |
| `AppraisalCycleType` | `Annual`, `BiAnnual`, `Quarterly`, `Probation`, `Confirmation`, `PIPReview` |
| `ApprovalModule` | `Leave`, `Expense`, `Asset`, `Onboarding`, `Offboarding`, `Attendance`, `Document`, `Engagement`, `Feedback`, `Reimbursement`, `ProofOfInvestment`, `SalaryRevision`, `OneTimeEarning` |
| `ApproverType` | `ReportingManager`, `DepartmentHead`, `HR`, `Custom` |
| `AssetAssignmentStatus` | `AssignmentActive`, `AssignmentReturned`, `AssignmentOverdue`, `AssignmentLost` |
| `AssetCategory` | `Laptop`, `Desktop`, `Mobile`, `Tablet`, `IdCard`, `AccessCard`, `Furniture`, `Vehicle`, `SoftwareLicense`, `Peripheral`, `AssetOther` |
| `AssetCondition` | `New`, `Good`, `Fair`, `Poor` |
| `AssetStatus` | `Available`, `Assigned`, `InRepair`, `Retired`, `AssetLost` |
| `AssigneeRole` | `ReportingManagerRole`, `HRRole`, `ITRole`, `FinanceRole`, `AdminRole`, `EmployeeRole`, `CustomRole` |
| `AttendanceSource` | `Web`, `Mobile`, `Biometric`, `Manual`, `AutoCheckout` |
| `AttendanceStatus` | `Present`, `Absent`, `HalfDay`, `OnLeave`, `Holiday`, `WeekOff`, `CompOff`, `WFH`, `OnDuty`, `NotMarked` |
| `AuditAction` | `Create`, `Update`, `Delete`, `Login`, `Logout`, `Export`, `Import`, `Approve`, `Reject`, `StatusChange` |
| `BankReconciliationStatus` | `Pending`, `Matched`, `Unmatched`, `PartiallyMatched`, `Failed` |
| `BloodGroup` | `APositive`, `ANegative`, `BPositive`, `BNegative`, `ABPositive`, `ABNegative`, `OPositive`, `ONegative` |
| `CandidateDocRequestStatus` | `Pending`, `Completed`, `Expired`, `Cancelled` |
| `CandidateDocUploadStatus` | `Pending`, `Approved`, `Rejected` |
| `CandidateSource` | `CandJobPortal`, `CandLinkedIn`, `CandReferral`, `CandAgency`, `CandCareerPage`, `CandCampus`, `CandDirect`, `CandInbound` |
| `CandidateStatus` | `New`, `InPipeline`, `Hired`, `CandRejected`, `CandOnHold`, `Withdrawn`, `Blacklisted` |
| `CompanyHolidayType` | `National`, `Regional`, `Company`, `Optional` |
| `ContentApprovalStatus` | `Pending`, `Approved`, `Rejected` |
| `DayOfWeek` | `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`, `Sunday` |
| `DeductorType` | `Employee`, `NonEmployee` |
| `DelegationNotifyMode` | `NotifyBoth`, `NotifyDelegatee` |
| `DelegationType` | `DelegationTemporary`, `DelegationPermanent` |
| `DepartmentStatus` | `Active`, `Inactive` |
| `DocumentAccessLevel` | `View`, `Download` |
| `DocumentAckStatus` | `Pending`, `Acknowledged`, `Declined` |
| `DocumentBundle` | `PreOffer`, `PostOffer` |
| `DocumentCategory` | `OfferLetter`, `Policy`, `IdProof`, `Certificate`, `Contract`, `AppointmentLetter`, `ExperienceLetter`, `RelievingLetter`, `NDA`, `Other` |
| `DocumentStatus` | `Draft`, `Active`, `Archived`, `Expired` |
| `DocumentType` | `PAN`, `Aadhaar`, `Passport`, `DrivingLicense`, `VoterID`, `SSN`, `WorkPermit`, `Visa`, `Custom` |
| `DonationStatus` | `Draft`, `Submitted`, `Verified`, `Rejected` |
| `EPFContributionRate` | `TwelvePercentActual`, `TwelvePercentRestricted` |
| `ESignProvider` | `Internal`, `DocuSign`, `AdobeSign`, `LeegalityProvider` |
| `ESignStatus` | `ESignDraft`, `ESignSent`, `ESignPartiallySigned`, `ESignCompleted`, `ESignDeclined`, `ESignCancelled`, `ESignExpired` |
| `EmployeeAppraisalStatus` | `Pending`, `InProgress`, `Submitted`, `Completed` |
| `EmployeeStatus` | `PreBoarding`, `Active`, `OnLeave`, `OnNotice`, `Suspended`, `Relieved`, `Absconding` |
| `EmploymentChangeType` | `Promotion`, `Transfer`, `RoleChange`, `SalaryChange`, `ConfirmationChange`, `EmpStatusChange`, `DepartmentChange`, `ManagerChange` |
| `EmploymentType` | `FullTime`, `PartTime`, `Contract`, `Intern`, `Freelancer`, `Consultant` |
| `ExpenseApprovalAction` | `ExpApproved`, `ExpRejected`, `Escalated` |
| `ExpenseCategory` | `Travel`, `Medical`, `Food`, `Internet`, `Phone`, `Office`, `Training`, `Relocation`, `Other` |
| `ExpenseClaimStatus` | `Draft`, `Submitted`, `ManagerApproved`, `FinanceApproved`, `Approved`, `PartiallyApproved`, `Rejected`, `Paid`, `Cancelled` |
| `FeedbackCategory` | `Teamwork`, `Leadership`, `Technical`, `Communication`, `Innovation`, `CustomerFocus` |
| `FeedbackType` | `Praise`, `Constructive`, `Suggestion`, `Recognition` |
| `Gender` | `Male`, `Female`, `NonBinary`, `PreferNotToSay` |
| `GoalCategory` | `Business`, `Development`, `Behavioral`, `Project` |
| `GoalStatus` | `NotStarted`, `InProgress`, `AtRisk`, `Completed`, `Exceeded`, `Deferred`, `Cancelled` |
| `GoalType` | `Individual`, `Team`, `Department`, `Organization` |
| `GoalVisibility` | `Private`, `TeamVisible`, `DepartmentVisible`, `OrganizationVisible` |
| `ImportStatus` | `ImportPending`, `ImportProcessing`, `ImportCompleted`, `ImportFailed`, `ImportPartial` |
| `InterviewRecommendation` | `StrongHire`, `Hire`, `MaybeHire`, `NoHire`, `StrongNoHire` |
| `InterviewStatus` | `IntScheduled`, `IntCompleted`, `IntCancelled`, `IntNoShow`, `IntRescheduled` |
| `InterviewType` | `Phone`, `Video`, `InPerson`, `Panel`, `TakeHome`, `GroupDiscussion` |
| `InvestmentProofStatus` | `Submitted`, `UnderReview`, `Approved`, `PartiallyApproved`, `Rejected` |
| `InvitationStatus` | `Pending`, `Accepted`, `Expired`, `Revoked` |
| `InviteStatus` | `NotInvited`, `Invited`, `Registered`, `Active` |
| `JobStatus` | `JobActive`, `JobCompleted`, `JobCancelled` |
| `KeyResultStatus` | `NotStarted`, `InProgress`, `Completed` |
| `KraAssignmentStatus` | `Active`, `Completed`, `Cancelled` |
| `LWFCycle` | `Monthly`, `Quarterly`, `HalfYearly`, `Yearly` |
| `LanguageProficiency` | `Basic`, `Conversational`, `Fluent`, `Native` |
| `LeaveAccrualType` | `Monthly`, `Quarterly`, `Yearly`, `Upfront` |
| `LeaveApprovalStatus` | `Pending`, `Approved`, `Rejected`, `Skipped` |
| `LeaveDaySession` | `FullDay`, `FirstHalf`, `SecondHalf` |
| `LeavePolicyStatus` | `Draft`, `PendingReview`, `Active`, `Archived` |
| `LeaveRequestStatus` | `Draft`, `Pending`, `Approved`, `Rejected`, `Cancelled`, `Recalled` |
| `LegalEntityStatus` | `Active`, `Inactive` |
| `LoanStatus` | `Pending`, `Approved`, `Disbursed`, `OnHold`, `Closed`, `Rejected`, `WrittenOff` |
| `LoanType` | `Personal`, `Education`, `Medical`, `Housing`, `Vehicle`, `Advance`, `Other` |
| `MaritalStatus` | `Single`, `Married`, `Divorced`, `Widowed` |
| `NotificationChannel` | `InApp`, `Email`, `Push` |
| `NotificationPrefChannel` | `Email`, `InApp`, `Push`, `Slack` |
| `NotificationType` | `Info`, `Warning`, `Success`, `Error`, `Action` |
| `OffboardingReason` | `Resignation`, `Termination`, `Retirement`, `ContractEnd` |
| `OffboardingStatus` | `Initiated`, `OffboardInProgress`, `ClearancePending`, `OffboardCompleted` |
| `OffboardingTaskCategory` | `AssetReturn`, `AccessRevoke`, `KnowledgeTransfer`, `Clearance` |
| `OfferStatus` | `OfferDraft`, `OfferPendingApproval`, `OfferApproved`, `OfferSent`, `OfferAccepted`, `OfferDeclined`, `OfferNegotiating`, `OfferRevoked`, `OfferExpired` |
| `OnboardingStatus` | `NotStarted`, `InProgress`, `OnboardCompleted`, `OnboardCancelled` |
| `OnboardingTaskCategory` | `Documentation`, `ItSetup`, `Training`, `Compliance`, `Introduction`, `TaskOther` |
| `OnboardingTaskStatus` | `TaskPending`, `TaskInProgress`, `TaskCompleted`, `TaskSkipped`, `TaskBlocked` |
| `OneTimeEarningKind` | `Bonus`, `Arrears`, `Incentive`, `Commission`, `PerformanceBonus`, `ReferralBonus`, `Other`, `Deduction` |
| `OneTimeEarningStatus` | `Pending`, `Approved`, `Rejected`, `Applied` |
| `PFDeductionCycle` | `Monthly` |
| `PIPOutcome` | `Improved`, `Terminated`, `Extended`, `Probation` |
| `PIPStatus` | `PIPActive`, `PIPExtended`, `PIPCompletedSuccess`, `PIPFailed`, `PIPWithdrawn` |
| `PayDayType` | `LastWorkingDay`, `FixedDay` |
| `PayFrequency` | `Monthly`, `SemiMonthly`, `BiWeekly`, `Weekly` |
| `PayRunApprovalStatus` | `Pending`, `Approved`, `Rejected`, `Skipped` |
| `PayRunStatus` | `Draft`, `Processing`, `Approved`, `Paid`, `Cancelled` |
| `PayrollSetupStep` | `OrgDetails`, `TaxDetails`, `PaySchedule`, `StatutoryComponents`, `SalaryComponents`, `Employees`, `PriorPayroll` |
| `PayslipStatus` | `Draft`, `Generated`, `Released`, `Failed` |
| `PermissionGrantKind` | `GRANT`, `DENY` |
| `PostVisibility` | `Organization`, `Department`, `Team`, `Custom` |
| `ProfessionalTaxCycle` | `Monthly`, `HalfYearly` |
| `ProjectStatus` | `ProjectActive`, `ProjectOnHold`, `ProjectCompleted`, `ProjectArchived` |
| `ProvisionCategory` | `ITAccount`, `Hardware`, `Access`, `Compliance`, `Facility`, `ProvOther` |
| `ProvisionStatus` | `ProvPending`, `ProvInProgress`, `ProvDone`, `ProvBlocked`, `ProvNotRequired` |
| `RecognitionType` | `Kudos`, `Badge`, `Award`, `Shoutout` |
| `RegularizationStatus` | `None`, `Pending`, `Approved`, `Rejected`, `Cancelled` |
| `ReimbursementClaimStatus` | `Draft`, `Submitted`, `Approved`, `Rejected`, `Paid`, `Cancelled` |
| `ReportFormat` | `PDF`, `XLSX`, `CSV`, `JSON` |
| `ReportStatus` | `ReportQueued`, `ReportProcessing`, `ReportCompleted`, `ReportFailed` |
| `RequisitionApprovalStatus` | `Pending`, `Approved`, `Rejected`, `Skipped` |
| `RequisitionApproverRole` | `DeptHead`, `HR` |
| `RequisitionPriority` | `Low`, `Medium`, `High`, `Urgent` |
| `RequisitionStatus` | `ReqDraft`, `PendingApproval`, `ReqApproved`, `ReqOpen`, `ReqOnHold`, `ReqClosed`, `ReqCancelled` |
| `RequisitionType` | `NewPosition`, `Replacement`, `Expansion` |
| `RosterEntryType` | `Duty`, `WeekOff`, `Leave`, `Holiday` |
| `RosterStatus` | `Draft`, `Published`, `Archived` |
| `SalaryAmountType` | `Fixed`, `PercentOfBasic`, `PercentOfCTC`, `PercentOfGross`, `Formula` |
| `SalaryCalcBasis` | `ActualDaysInMonth`, `OrganisationWorkingDays` |
| `SalaryComponentCategory` | `Basic`, `HRA`, `DA`, `ConveyanceAllowance`, `MedicalAllowance`, `SpecialAllowance`, `ChildrenEducationAllowance`, `TransportAllowance`, `TravellingAllowance`, `FixedAllowance`, `Bonus`, `Overtime`, `Incentive`, `Commission`, `LeaveEncashment`, `NoticePay`, `HoldSalary`, `Gratuity`, `VoluntaryProvidentFund`, `EPFEmployee`, `EPFEmployer`, `ESIEmployee`, `ESIEmployer`, `ProfessionalTax`, `LabourWelfareFund`, `IncomeTax`, `LoanDeduction`, `LOPDeduction`, `WithheldSalary`, `NoticePayDeduction`, `FuelReimbursement`, `DriverReimbursement`, `VehicleMaintenanceReimbursement`, `TelephoneReimbursement`, `LeaveTravelAllowance`, `OtherEarning`, `OtherDeduction`, `OtherReimbursement`, `OtherBenefit` |
| `SalaryComponentType` | `Earning`, `Deduction`, `Reimbursement`, `Benefit`, `StatutoryContribution` |
| `SalaryFrequency` | `Monthly`, `Quarterly`, `HalfYearly`, `Yearly`, `OneTime` |
| `SalaryRevisionStatus` | `Pending`, `Approved`, `Rejected`, `Cancelled` |
| `ScheduleStatus` | `ScheduleDraft`, `SchedulePublished` |
| `SettlementStatus` | `Draft`, `Computed`, `Approved`, `Paid`, `Cancelled` |
| `SkillProficiency` | `Beginner`, `Intermediate`, `Advanced`, `Expert` |
| `SocialPostType` | `Update`, `Announcement`, `RecognitionPost`, `Birthday`, `WorkAnniversary`, `NewJoiner`, `Poll`, `Event` |
| `SourceOfHire` | `Referral`, `JobPortal`, `LinkedIn`, `Agency`, `Campus`, `Direct`, `Other` |
| `SurveyQuestionType` | `SurveyRating`, `SurveyScale`, `MultiChoice`, `SingleChoice`, `FreeText`, `NPS`, `Matrix` |
| `SurveyStatus` | `SurveyDraft`, `SurveyActive`, `SurveyClosed`, `SurveyAnalysed` |
| `SurveyType` | `Engagement`, `PulseCheck`, `Exit`, `Onboarding`, `Custom`, `ENPS` |
| `TaskPriority` | `Low`, `Normal`, `High`, `Urgent` |
| `TaskStatus` | `Open`, `InProgress`, `Completed`, `Cancelled` |
| `TaxPaymentFrequency` | `Monthly`, `Quarterly` |
| `TaxRegime` | `OldRegime`, `NewRegime` |
| `TaxResidencyStatus` | `Resident`, `NonResident`, `ResidentButNotOrdinarilyResident`, `Expatriate` |
| `TdsChallanStatus` | `Recorded`, `PartiallyAllocated`, `FullyAllocated` |
| `TdsOverrideStatus` | `Active`, `Recovered`, `Cancelled`, `Superseded` |
| `TdsPaymentMode` | `OnlineITNS`, `NEFT`, `RTGS`, `Cheque` |
| `TdsPeriodStatus` | `Pending`, `Overdue`, `Partial`, `Paid`, `Excess` |
| `TdsRecoveryStrategy` | `NextMonth`, `SpreadOverMonths` |
| `TicketPriority` | `Low`, `Medium`, `High`, `Urgent` |
| `TicketSource` | `Web`, `Mobile`, `Email`, `API` |
| `TicketStatus` | `Open`, `InProgress`, `OnHold`, `Resolved`, `Closed`, `Reopened`, `Cancelled` |
| `TimeLogStatus` | `LogDraft`, `LogSubmitted`, `LogApproved`, `LogRejected` |
| `TimesheetPeriodType` | `Weekly`, `BiWeekly`, `Monthly` |
| `TimesheetStatus` | `TsDraft`, `TsSubmitted`, `TsApproved`, `TsRejected` |
| `WfhApprovalStatus` | `Pending`, `Approved`, `Rejected`, `Skipped` |
| `WfhApproverRole` | `Manager`, `HR`, `SuperAdmin` |
| `WfhGroupMode` | `Department`, `Employee` |
| `WfhSession` | `FullDay`, `FirstHalf`, `SecondHalf` |
| `WfhStatus` | `Pending`, `Approved`, `Rejected`, `Cancelled` |
| `WorkLocation` | `Office`, `Remote`, `Hybrid` |
| `WorkerType` | `Permanent`, `Temporary`, `Probation`, `Notice` |
