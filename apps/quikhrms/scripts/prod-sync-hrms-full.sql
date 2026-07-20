-- ============================================================================
-- QuikHRMS — COMPLETE app_quikhrms schema (idempotent / safe to run on prod)
-- Generated from packages/database/prisma/schema.prisma.
-- Tables: CREATE TABLE IF NOT EXISTS | Enums & FKs: guarded (duplicate_object)
-- Indexes: CREATE INDEX IF NOT EXISTS. Re-running is a no-op; nothing is dropped.
-- NOTE: CREATE TABLE IF NOT EXISTS creates MISSING tables but does NOT add
--       missing COLUMNS to tables that already exist. The additive ALTERs at
--       the end cover the known new columns on existing tables.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS "app_quikhrms";

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."Gender" AS ENUM ('Male', 'Female', 'Transgender', 'NonBinary', 'PreferNotToSay');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."MaritalStatus" AS ENUM ('Single', 'Married', 'Divorced', 'Widowed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."EmploymentType" AS ENUM ('FullTime', 'PartTime', 'Contract', 'Intern', 'Freelancer', 'Consultant');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."WorkerType" AS ENUM ('Permanent', 'Temporary', 'Probation', 'Notice');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."WorkLocation" AS ENUM ('Office', 'Remote', 'Hybrid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."EmployeeStatus" AS ENUM ('PreBoarding', 'Active', 'OnLeave', 'OnNotice', 'Suspended', 'Relieved', 'Absconding');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."InviteStatus" AS ENUM ('NotInvited', 'Invited', 'Registered', 'Active');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."InvitationStatus" AS ENUM ('Pending', 'Accepted', 'Expired', 'Revoked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SourceOfHire" AS ENUM ('Referral', 'JobPortal', 'LinkedIn', 'Agency', 'Campus', 'Direct', 'Other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."BloodGroup" AS ENUM ('APositive', 'ANegative', 'BPositive', 'BNegative', 'ABPositive', 'ABNegative', 'OPositive', 'ONegative');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."LanguageProficiency" AS ENUM ('Basic', 'Conversational', 'Fluent', 'Native');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SkillProficiency" AS ENUM ('Beginner', 'Intermediate', 'Advanced', 'Expert');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DocumentType" AS ENUM ('PAN', 'Aadhaar', 'Passport', 'DrivingLicense', 'VoterID', 'SSN', 'WorkPermit', 'Visa', 'Custom');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DepartmentStatus" AS ENUM ('Active', 'Inactive');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PayFrequency" AS ENUM ('Monthly', 'SemiMonthly', 'BiWeekly', 'Weekly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PayDayType" AS ENUM ('LastWorkingDay', 'FixedDay');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SalaryCalcBasis" AS ENUM ('ActualDaysInMonth', 'OrganisationWorkingDays');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TaxPaymentFrequency" AS ENUM ('Monthly', 'Quarterly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DeductorType" AS ENUM ('Employee', 'NonEmployee');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."EPFContributionRate" AS ENUM ('TwelvePercentActual', 'TwelvePercentRestricted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PFDeductionCycle" AS ENUM ('Monthly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ProfessionalTaxCycle" AS ENUM ('Monthly', 'HalfYearly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."LWFCycle" AS ENUM ('Monthly', 'Quarterly', 'HalfYearly', 'Yearly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SalaryComponentType" AS ENUM ('Earning', 'Deduction', 'Reimbursement', 'Benefit', 'StatutoryContribution');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SalaryComponentCategory" AS ENUM ('Basic', 'HRA', 'DA', 'ConveyanceAllowance', 'MedicalAllowance', 'SpecialAllowance', 'ChildrenEducationAllowance', 'TransportAllowance', 'TravellingAllowance', 'FixedAllowance', 'Bonus', 'Overtime', 'Incentive', 'Commission', 'LeaveEncashment', 'NoticePay', 'HoldSalary', 'Gratuity', 'VoluntaryProvidentFund', 'EPFEmployee', 'EPFEmployer', 'ESIEmployee', 'ESIEmployer', 'ProfessionalTax', 'LabourWelfareFund', 'IncomeTax', 'LoanDeduction', 'LOPDeduction', 'WithheldSalary', 'NoticePayDeduction', 'FuelReimbursement', 'DriverReimbursement', 'VehicleMaintenanceReimbursement', 'TelephoneReimbursement', 'LeaveTravelAllowance', 'OtherEarning', 'OtherDeduction', 'OtherReimbursement', 'OtherBenefit');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SalaryAmountType" AS ENUM ('Fixed', 'PercentOfBasic', 'PercentOfCTC', 'PercentOfGross', 'Formula');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SalaryFrequency" AS ENUM ('Monthly', 'Quarterly', 'HalfYearly', 'Yearly', 'OneTime');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PayRunStatus" AS ENUM ('Draft', 'Processing', 'Approved', 'Paid', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PayslipStatus" AS ENUM ('Draft', 'Generated', 'Released', 'Failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TaxRegime" AS ENUM ('OldRegime', 'NewRegime');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ReimbursementClaimStatus" AS ENUM ('Draft', 'Submitted', 'Approved', 'Rejected', 'Paid', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."InvestmentProofStatus" AS ENUM ('Submitted', 'UnderReview', 'Approved', 'PartiallyApproved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SalaryRevisionStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."LoanStatus" AS ENUM ('Pending', 'Approved', 'Disbursed', 'OnHold', 'Closed', 'Rejected', 'WrittenOff');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."LoanType" AS ENUM ('Personal', 'Education', 'Medical', 'Housing', 'Vehicle', 'Advance', 'Other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DonationStatus" AS ENUM ('Draft', 'Submitted', 'Verified', 'Rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PayrollSetupStep" AS ENUM ('OrgDetails', 'TaxDetails', 'PaySchedule', 'StatutoryComponents', 'SalaryComponents', 'Employees', 'PriorPayroll');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."AttendanceStatus" AS ENUM ('Present', 'Absent', 'HalfDay', 'OnLeave', 'Holiday', 'WeekOff', 'CompOff', 'WFH', 'OnDuty', 'NotMarked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."AttendanceSource" AS ENUM ('Web', 'Mobile', 'Biometric', 'Manual', 'AutoCheckout');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."RegularizationStatus" AS ENUM ('None', 'Pending', 'Approved', 'Rejected', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DayOfWeek" AS ENUM ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."LeaveAccrualType" AS ENUM ('Monthly', 'Quarterly', 'Yearly', 'Upfront');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."LeaveRequestStatus" AS ENUM ('Draft', 'Pending', 'Approved', 'Rejected', 'Cancelled', 'Recalled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."LeaveApprovalStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."WfhStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."WfhApprovalStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."WfhApproverRole" AS ENUM ('Manager', 'HR', 'SuperAdmin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."WfhSession" AS ENUM ('FullDay', 'FirstHalf', 'SecondHalf');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."LeaveDaySession" AS ENUM ('FullDay', 'FirstHalf', 'SecondHalf');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."RosterStatus" AS ENUM ('Draft', 'Published', 'Archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."RosterEntryType" AS ENUM ('Duty', 'WeekOff', 'Leave', 'Holiday');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."LeavePolicyStatus" AS ENUM ('Draft', 'PendingReview', 'Active', 'Archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ExpenseCategory" AS ENUM ('Travel', 'Medical', 'Food', 'Internet', 'Phone', 'Office', 'Training', 'Relocation', 'Other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ExpenseClaimStatus" AS ENUM ('Draft', 'Submitted', 'ManagerApproved', 'FinanceApproved', 'Approved', 'PartiallyApproved', 'Rejected', 'Paid', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ExpenseApprovalAction" AS ENUM ('ExpApproved', 'ExpRejected', 'Escalated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."GoalType" AS ENUM ('Individual', 'HrmsTeam', 'Department', 'Organization');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."GoalCategory" AS ENUM ('Business', 'Development', 'Behavioral', 'Project');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."GoalStatus" AS ENUM ('NotStarted', 'InProgress', 'AtRisk', 'Completed', 'Exceeded', 'Deferred', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."GoalVisibility" AS ENUM ('Private', 'TeamVisible', 'DepartmentVisible', 'OrganizationVisible');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."KeyResultStatus" AS ENUM ('NotStarted', 'InProgress', 'Completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."AppraisalCycleType" AS ENUM ('Annual', 'BiAnnual', 'Quarterly', 'Probation', 'Confirmation', 'PIPReview');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."AppraisalCycleStatus" AS ENUM ('Setup', 'GoalSetting', 'SelfReview', 'ManagerReview', 'PeerReview', 'Calibration', 'Complete');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."EmployeeAppraisalStatus" AS ENUM ('Pending', 'InProgress', 'Submitted', 'Completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."FeedbackType" AS ENUM ('Praise', 'Constructive', 'Suggestion', 'Recognition');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."FeedbackCategory" AS ENUM ('Teamwork', 'Leadership', 'Technical', 'Communication', 'Innovation', 'CustomerFocus');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PIPStatus" AS ENUM ('PIPActive', 'PIPExtended', 'PIPCompletedSuccess', 'PIPFailed', 'PIPWithdrawn');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PIPOutcome" AS ENUM ('Improved', 'Terminated', 'Extended', 'Probation');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."RequisitionStatus" AS ENUM ('ReqDraft', 'PendingApproval', 'ReqApproved', 'ReqOpen', 'ReqOnHold', 'ReqClosed', 'ReqCancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."RequisitionType" AS ENUM ('NewPosition', 'Replacement', 'Expansion');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."RequisitionPriority" AS ENUM ('Low', 'Medium', 'High', 'Urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."CandidateSource" AS ENUM ('CandJobPortal', 'CandLinkedIn', 'CandReferral', 'CandAgency', 'CandCareerPage', 'CandCampus', 'CandDirect', 'CandInbound');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."CandidateStatus" AS ENUM ('New', 'InPipeline', 'Hired', 'CandRejected', 'CandOnHold', 'Withdrawn', 'Blacklisted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ApplicationStatus" AS ENUM ('AppActive', 'AppHired', 'AppRejected', 'AppOnHold', 'AppWithdrawn', 'AppOffered', 'AppDeclined');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."InterviewType" AS ENUM ('Phone', 'Video', 'InPerson', 'Panel', 'TakeHome', 'GroupDiscussion');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."InterviewStatus" AS ENUM ('IntScheduled', 'IntCompleted', 'IntCancelled', 'IntNoShow', 'IntRescheduled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."InterviewRecommendation" AS ENUM ('StrongHire', 'Hire', 'MaybeHire', 'NoHire', 'StrongNoHire');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."OfferStatus" AS ENUM ('OfferDraft', 'OfferPendingApproval', 'OfferApproved', 'OfferSent', 'OfferAccepted', 'OfferDeclined', 'OfferNegotiating', 'OfferRevoked', 'OfferExpired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SocialPostType" AS ENUM ('Update', 'Announcement', 'RecognitionPost', 'Birthday', 'WorkAnniversary', 'NewJoiner', 'Poll', 'Event');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PostVisibility" AS ENUM ('Organization', 'Department', 'HrmsTeam', 'Custom');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SurveyType" AS ENUM ('Engagement', 'PulseCheck', 'Exit', 'Onboarding', 'Custom', 'ENPS');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SurveyStatus" AS ENUM ('SurveyDraft', 'SurveyActive', 'SurveyClosed', 'SurveyAnalysed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SurveyQuestionType" AS ENUM ('SurveyRating', 'SurveyScale', 'MultiChoice', 'SingleChoice', 'FreeText', 'NPS', 'Matrix');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."RecognitionType" AS ENUM ('Kudos', 'Badge', 'Award', 'Shoutout');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."AuditAction" AS ENUM ('Create', 'Update', 'Delete', 'Login', 'Logout', 'Export', 'Import', 'Approve', 'Reject', 'StatusChange');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."NotificationType" AS ENUM ('Info', 'Warning', 'Success', 'Error', 'Action');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."NotificationChannel" AS ENUM ('InApp', 'Email', 'Push');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ImportStatus" AS ENUM ('ImportPending', 'ImportProcessing', 'ImportCompleted', 'ImportFailed', 'ImportPartial');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."CompanyHolidayType" AS ENUM ('National', 'Regional', 'Company', 'Optional');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ApprovalModule" AS ENUM ('Leave', 'Expense', 'Asset', 'Onboarding', 'Offboarding', 'Attendance', 'Document', 'Engagement', 'Feedback', 'Reimbursement', 'ProofOfInvestment', 'SalaryRevision', 'OneTimeEarning', 'Requisition');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ContentApprovalStatus" AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ApproverType" AS ENUM ('ReportingManager', 'DepartmentHead', 'HR', 'Custom');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."NotificationPrefChannel" AS ENUM ('Email', 'InApp', 'Push', 'Slack');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DocumentCategory" AS ENUM ('OfferLetter', 'Policy', 'IdProof', 'Certificate', 'Contract', 'AppointmentLetter', 'ExperienceLetter', 'RelievingLetter', 'NDA', 'Other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DocumentStatus" AS ENUM ('Draft', 'Active', 'Archived', 'Expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DocumentAckStatus" AS ENUM ('Pending', 'Acknowledged', 'Declined');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DocumentAccessLevel" AS ENUM ('View', 'Download');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."OnboardingStatus" AS ENUM ('NotStarted', 'InProgress', 'OnboardCompleted', 'OnboardCancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."OnboardingTaskStatus" AS ENUM ('TaskPending', 'TaskInProgress', 'TaskCompleted', 'TaskSkipped', 'TaskBlocked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."OnboardingTaskCategory" AS ENUM ('Documentation', 'ItSetup', 'Training', 'Compliance', 'Introduction', 'TaskOther');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."OffboardingStatus" AS ENUM ('Initiated', 'OffboardInProgress', 'ClearancePending', 'OffboardCompleted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."OffboardingReason" AS ENUM ('Resignation', 'Termination', 'Retirement', 'ContractEnd');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."OffboardingTaskCategory" AS ENUM ('AssetReturn', 'AccessRevoke', 'KnowledgeTransfer', 'Clearance');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."AssigneeRole" AS ENUM ('ReportingManagerRole', 'HRRole', 'ITRole', 'FinanceRole', 'AdminRole', 'EmployeeRole', 'CustomRole');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ProvisionCategory" AS ENUM ('ITAccount', 'Hardware', 'Access', 'Compliance', 'Facility', 'ProvOther');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ProvisionStatus" AS ENUM ('ProvPending', 'ProvInProgress', 'ProvDone', 'ProvBlocked', 'ProvNotRequired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ResignationApprovalStatus" AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."AssetCategory" AS ENUM ('Laptop', 'Desktop', 'Mobile', 'Tablet', 'IdCard', 'AccessCard', 'Furniture', 'Vehicle', 'SoftwareLicense', 'Peripheral', 'AssetOther');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."AssetStatus" AS ENUM ('Available', 'Assigned', 'InRepair', 'Retired', 'AssetLost');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."AssetCondition" AS ENUM ('New', 'Good', 'Fair', 'Poor');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."AssetAssignmentStatus" AS ENUM ('AssignmentActive', 'AssignmentReturned', 'AssignmentOverdue', 'AssignmentLost');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ReportStatus" AS ENUM ('ReportQueued', 'ReportProcessing', 'ReportCompleted', 'ReportFailed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ReportFormat" AS ENUM ('PDF', 'XLSX', 'CSV', 'JSON');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TimeLogStatus" AS ENUM ('LogDraft', 'LogSubmitted', 'LogApproved', 'LogRejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TimesheetStatus" AS ENUM ('TsDraft', 'TsSubmitted', 'TsApproved', 'TsRejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TimesheetPeriodType" AS ENUM ('Weekly', 'BiWeekly', 'Monthly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ProjectStatus" AS ENUM ('ProjectActive', 'ProjectOnHold', 'ProjectCompleted', 'ProjectArchived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."JobStatus" AS ENUM ('JobActive', 'JobCompleted', 'JobCancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ScheduleStatus" AS ENUM ('ScheduleDraft', 'SchedulePublished');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DelegationType" AS ENUM ('DelegationTemporary', 'DelegationPermanent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DelegationNotifyMode" AS ENUM ('NotifyBoth', 'NotifyDelegatee');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."EmploymentChangeType" AS ENUM ('Promotion', 'Transfer', 'RoleChange', 'SalaryChange', 'ConfirmationChange', 'EmpStatusChange', 'DepartmentChange', 'ManagerChange');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ESignStatus" AS ENUM ('ESignDraft', 'ESignSent', 'ESignPartiallySigned', 'ESignCompleted', 'ESignDeclined', 'ESignCancelled', 'ESignExpired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."ESignProvider" AS ENUM ('Internal', 'DocuSign', 'AdobeSign', 'LeegalityProvider');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PermissionGrantKind" AS ENUM ('GRANT', 'DENY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TdsRecoveryStrategy" AS ENUM ('NextMonth', 'SpreadOverMonths');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TdsOverrideStatus" AS ENUM ('Active', 'Recovered', 'Cancelled', 'Superseded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."PayRunApprovalStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TaskStatus" AS ENUM ('Open', 'InProgress', 'Completed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TaskPriority" AS ENUM ('Low', 'Normal', 'High', 'Urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."LegalEntityStatus" AS ENUM ('Active', 'Inactive');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TaxResidencyStatus" AS ENUM ('Resident', 'NonResident', 'ResidentButNotOrdinarilyResident', 'Expatriate');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."SettlementStatus" AS ENUM ('Draft', 'Computed', 'Approved', 'Paid', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."BankReconciliationStatus" AS ENUM ('Pending', 'Matched', 'Unmatched', 'PartiallyMatched', 'Failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."OneTimeEarningKind" AS ENUM ('Bonus', 'Arrears', 'Incentive', 'Commission', 'PerformanceBonus', 'ReferralBonus', 'Other', 'Deduction');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."OneTimeEarningStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Applied');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."WfhGroupMode" AS ENUM ('Department', 'Employee');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."DocumentBundle" AS ENUM ('PreOffer', 'PostOffer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."CandidateDocRequestStatus" AS ENUM ('Pending', 'Completed', 'Expired', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."CandidateDocUploadStatus" AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."RequisitionApprovalStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."RequisitionApproverRole" AS ENUM ('DeptHead', 'HR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TicketPriority" AS ENUM ('Low', 'Medium', 'High', 'Urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TicketStatus" AS ENUM ('Open', 'InProgress', 'OnHold', 'Resolved', 'Closed', 'Reopened', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TicketSource" AS ENUM ('Web', 'Mobile', 'Email', 'API');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."KraAssignmentStatus" AS ENUM ('Active', 'Completed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TdsPeriodStatus" AS ENUM ('Pending', 'Overdue', 'Partial', 'Paid', 'Excess');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TdsChallanStatus" AS ENUM ('Recorded', 'PartiallyAllocated', 'FullyAllocated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikhrms"."TdsPaymentMode" AS ENUM ('OnlineITNS', 'NEFT', 'RTGS', 'Cheque');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Department" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parentDepartmentId" TEXT,
    "headId" TEXT,
    "description" TEXT,
    "status" "app_quikhrms"."DepartmentStatus" NOT NULL DEFAULT 'Active',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Team" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadId" TEXT,
    "description" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Designation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "departmentId" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Grade" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "minSalary" DECIMAL(15,2),
    "maxSalary" DECIMAL(15,2),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."OfficeLocation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "zipCode" TEXT,
    "timezone" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "isHeadquarter" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OfficeLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Employee" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "authUserId" TEXT,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "gender" "app_quikhrms"."Gender",
    "dateOfBirth" TIMESTAMP(3),
    "bloodGroup" "app_quikhrms"."BloodGroup",
    "maritalStatus" "app_quikhrms"."MaritalStatus",
    "nationality" TEXT,
    "isHandicapped" BOOLEAN NOT NULL DEFAULT false,
    "isSeniorCitizen" BOOLEAN NOT NULL DEFAULT false,
    "epfApplicable" BOOLEAN NOT NULL DEFAULT true,
    "esiApplicable" BOOLEAN NOT NULL DEFAULT true,
    "ptApplicable" BOOLEAN NOT NULL DEFAULT true,
    "epfContributionRate" TEXT,
    "profilePhoto" TEXT,
    "coverImage" TEXT,
    "bio" TEXT,
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "tempPasswordExpiresAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "personalEmail" TEXT,
    "workEmail" TEXT NOT NULL,
    "personalPhone" TEXT,
    "workPhone" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "currentAddress" JSONB,
    "permanentAddress" JSONB,
    "emergencyContacts" JSONB,
    "jobTitle" TEXT,
    "departmentId" TEXT,
    "teamId" TEXT,
    "designationId" TEXT,
    "gradeId" TEXT,
    "reportingManagerId" TEXT,
    "dottedLineManagerId" TEXT,
    "employmentType" "app_quikhrms"."EmploymentType" NOT NULL DEFAULT 'FullTime',
    "workerType" "app_quikhrms"."WorkerType" NOT NULL DEFAULT 'Permanent',
    "workLocation" "app_quikhrms"."WorkLocation" NOT NULL DEFAULT 'Office',
    "officeLocationId" TEXT,
    "dateOfJoining" TIMESTAMP(3) NOT NULL,
    "tentativeJoiningDate" DATE,
    "confirmationDate" TIMESTAMP(3),
    "probationEndDate" TIMESTAMP(3),
    "noticePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "lastWorkingDate" TIMESTAMP(3),
    "previousExperience" INTEGER NOT NULL DEFAULT 0,
    "sourceOfHire" "app_quikhrms"."SourceOfHire",
    "referredById" TEXT,
    "currentSalary" DECIMAL(15,2),
    "expectedSalary" DECIMAL(15,2),
    "offerLetterUrl" TEXT,
    "highestQualification" TEXT,
    "skillSet" TEXT,
    "additionalInfo" TEXT,
    "identityDocuments" JSONB,
    "bankAccounts" JSONB,
    "panNumber" TEXT,
    "aadhaarNumber" TEXT,
    "taxIdentificationNumber" TEXT,
    "uanNumber" TEXT,
    "pfAccountNumber" TEXT,
    "esiNumber" TEXT,
    "legalEntityId" TEXT,
    "taxResidencyStatus" "app_quikhrms"."TaxResidencyStatus" NOT NULL DEFAULT 'Resident',
    "payFrequencyOverride" "app_quikhrms"."PayFrequency",
    "skills" JSONB,
    "certifications" JSONB,
    "languages" JSONB,
    "educations" JSONB,
    "pastExperiences" JSONB,
    "customFields" JSONB,
    "status" "app_quikhrms"."EmployeeStatus" NOT NULL DEFAULT 'Active',
    "inviteStatus" "app_quikhrms"."InviteStatus" NOT NULL DEFAULT 'NotInvited',
    "centralRole" TEXT,
    "centralDeactivatedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "activeSessionId" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "weeklyOffDays" JSONB,
    "wfhQuotaGroupId" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."AttendanceRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "punches" JSONB,
    "effectiveHours" DECIMAL(5,2),
    "grossHours" DECIMAL(5,2),
    "breakDuration" DECIMAL(5,2),
    "overtime" DECIMAL(5,2),
    "status" "app_quikhrms"."AttendanceStatus" NOT NULL DEFAULT 'NotMarked',
    "source" "app_quikhrms"."AttendanceSource",
    "checkInLocation" JSONB,
    "checkOutLocation" JSONB,
    "ipAddress" TEXT,
    "regularizationStatus" "app_quikhrms"."RegularizationStatus" NOT NULL DEFAULT 'None',
    "regularizationReason" TEXT,
    "remarks" TEXT,
    "isLateCheckIn" BOOLEAN NOT NULL DEFAULT false,
    "isEarlyCheckOut" BOOLEAN NOT NULL DEFAULT false,
    "lateByMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyByMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."AttendancePolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "applicableTo" JSONB,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "halfDayThresholdHours" DECIMAL(4,2) NOT NULL DEFAULT 4,
    "fullDayThresholdHours" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "minHoursForOvertime" DECIMAL(4,2) NOT NULL DEFAULT 9,
    "ipWhitelist" JSONB,
    "geoFenceRadius" INTEGER,
    "geoFenceCoordinates" JSONB,
    "allowWebCheckin" BOOLEAN NOT NULL DEFAULT true,
    "allowMobileCheckin" BOOLEAN NOT NULL DEFAULT true,
    "requireLocationForMobile" BOOLEAN NOT NULL DEFAULT false,
    "latePenalization" JSONB,
    "absentPenalization" JSONB,
    "allowRegularization" BOOLEAN NOT NULL DEFAULT true,
    "regularizationApprovalLevels" INTEGER NOT NULL DEFAULT 1,
    "maxRegularizationsPerMonth" INTEGER NOT NULL DEFAULT 3,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ShiftPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakDuration" INTEGER NOT NULL DEFAULT 60,
    "breakStartTime" TEXT,
    "breakEndTime" TEXT,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "minHoursRequired" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "isFlexible" BOOLEAN NOT NULL DEFAULT false,
    "flexibleWindowStart" TEXT,
    "flexibleWindowEnd" TEXT,
    "isNightShift" BOOLEAN NOT NULL DEFAULT false,
    "weekOffs" JSONB,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ShiftPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ShiftAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isRotating" BOOLEAN NOT NULL DEFAULT false,
    "rotationPattern" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Roster" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "app_quikhrms"."RosterStatus" NOT NULL DEFAULT 'Draft',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Roster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."RosterEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftId" TEXT,
    "type" "app_quikhrms"."RosterEntryType" NOT NULL DEFAULT 'Duty',
    "note" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LeaveType" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "isCarryForward" BOOLEAN NOT NULL DEFAULT false,
    "maxCarryForward" INTEGER,
    "isEncashable" BOOLEAN NOT NULL DEFAULT false,
    "maxEncashment" INTEGER,
    "accrualType" "app_quikhrms"."LeaveAccrualType" NOT NULL DEFAULT 'Yearly',
    "accrualCount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "maxBalance" INTEGER NOT NULL DEFAULT 0,
    "minConsecutiveDays" INTEGER,
    "maxConsecutiveDays" INTEGER,
    "maxPerMonth" INTEGER,
    "maxPerYear" INTEGER,
    "isOnceInLifetime" BOOLEAN NOT NULL DEFAULT false,
    "applicableGender" TEXT,
    "applicableEmploymentType" JSONB,
    "applicableAfterDays" INTEGER NOT NULL DEFAULT 0,
    "requiresDocumentation" BOOLEAN NOT NULL DEFAULT false,
    "documentationAfterDays" INTEGER,
    "isNegativeBalanceAllowed" BOOLEAN NOT NULL DEFAULT false,
    "maxNegativeBalance" INTEGER,
    "includesHolidays" BOOLEAN NOT NULL DEFAULT false,
    "includesWeekoffs" BOOLEAN NOT NULL DEFAULT false,
    "isHalfDayAllowed" BOOLEAN NOT NULL DEFAULT true,
    "isHourlyAllowed" BOOLEAN NOT NULL DEFAULT false,
    "clubbingRestrictions" JSONB,
    "isCompOff" BOOLEAN NOT NULL DEFAULT false,
    "compOffExpiryDays" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LeaveGroup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LeaveGroupItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leaveGroupId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "overrideQuota" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveGroupItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LeaveGroupAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leaveGroupId" TEXT NOT NULL,
    "assigneeType" TEXT NOT NULL,
    "employeeId" TEXT,
    "roleId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveGroupAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LeaveRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "duration" DECIMAL(5,2) NOT NULL,
    "dayBreakdown" JSONB,
    "reason" TEXT NOT NULL,
    "attachments" JSONB,
    "status" "app_quikhrms"."LeaveRequestStatus" NOT NULL DEFAULT 'Pending',
    "appliedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelReason" TEXT,
    "isPlanned" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LeaveApproval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "status" "app_quikhrms"."LeaveApprovalStatus" NOT NULL DEFAULT 'Pending',
    "comment" TEXT,
    "actionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LeaveBalance" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "opening" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "accrued" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taken" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "adjusted" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "carriedForward" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "encashed" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lapsed" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LeavePolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "app_quikhrms"."LeavePolicyStatus" NOT NULL DEFAULT 'Draft',
    "description" TEXT,
    "sourceFileUrl" TEXT,
    "sourceFileName" TEXT,
    "sourceFileType" TEXT,
    "extractedRules" JSONB,
    "approvedRules" JSONB,
    "extractedAt" TIMESTAMP(3),
    "extractedBy" TEXT,
    "extractionLog" JSONB,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "appliesToDeptIds" JSONB,
    "appliesToRoleIds" JSONB,
    "appliesToEmploymentTypes" JSONB,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ExpenseClaim" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "policyId" TEXT,
    "category" "app_quikhrms"."ExpenseCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "expenseDate" DATE,
    "receiptUrl" TEXT,
    "receiptFileType" TEXT,
    "policySnapshot" JSONB,
    "status" "app_quikhrms"."ExpenseClaimStatus" NOT NULL DEFAULT 'Draft',
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ExpensePolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "maxPerTransaction" DECIMAL(15,2),
    "maxPerMonth" DECIMAL(15,2),
    "maxPerYear" DECIMAL(15,2),
    "requiresReceipt" BOOLEAN NOT NULL DEFAULT true,
    "receiptThreshold" DECIMAL(15,2) NOT NULL DEFAULT 500,
    "requiresPreApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalLevels" INTEGER NOT NULL DEFAULT 1,
    "approvalChain" JSONB,
    "applicableTo" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpensePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ExpenseApproval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "action" "app_quikhrms"."ExpenseApprovalAction" NOT NULL,
    "comments" TEXT,
    "actionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Goal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "parentGoalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "app_quikhrms"."GoalType" NOT NULL DEFAULT 'Individual',
    "category" "app_quikhrms"."GoalCategory" NOT NULL DEFAULT 'Business',
    "metric" TEXT,
    "targetValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currentValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "startDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "app_quikhrms"."GoalStatus" NOT NULL DEFAULT 'NotStarted',
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "alignedTo" TEXT,
    "visibility" "app_quikhrms"."GoalVisibility" NOT NULL DEFAULT 'TeamVisible',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."KeyResult" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currentValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "app_quikhrms"."KeyResultStatus" NOT NULL DEFAULT 'NotStarted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."GoalCheckIn" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousValue" DECIMAL(15,2) NOT NULL,
    "currentValue" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."AppraisalCycle" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "app_quikhrms"."AppraisalCycleType" NOT NULL DEFAULT 'Annual',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "app_quikhrms"."AppraisalCycleStatus" NOT NULL DEFAULT 'Setup',
    "reviewFormId" TEXT,
    "applicableTo" JSONB,
    "stages" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AppraisalCycle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ReviewForm" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewForm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."EmployeeAppraisal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "status" "app_quikhrms"."EmployeeAppraisalStatus" NOT NULL DEFAULT 'Pending',
    "selfRating" DECIMAL(3,1),
    "selfComments" TEXT,
    "selfResponses" JSONB,
    "managerRating" DECIMAL(3,1),
    "managerComments" TEXT,
    "managerResponses" JSONB,
    "calibratedRating" DECIMAL(3,1),
    "finalRating" DECIMAL(3,1),
    "finalBand" TEXT,
    "promotionRecommendation" BOOLEAN,
    "salaryRevisionRecommended" DECIMAL(5,2),
    "employeeAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "employeeAcknowledgedAt" TIMESTAMP(3),
    "employeeFeedback" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeAppraisal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ContinuousFeedback" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fromEmployeeId" TEXT NOT NULL,
    "toEmployeeId" TEXT NOT NULL,
    "type" "app_quikhrms"."FeedbackType" NOT NULL DEFAULT 'Praise',
    "category" "app_quikhrms"."FeedbackCategory" NOT NULL DEFAULT 'Teamwork',
    "message" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "badges" JSONB,
    "relatedGoalId" TEXT,
    "approvalStatus" "app_quikhrms"."ContentApprovalStatus" NOT NULL DEFAULT 'Approved',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContinuousFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PIP" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "objectives" JSONB,
    "status" "app_quikhrms"."PIPStatus" NOT NULL DEFAULT 'PIPActive',
    "outcome" "app_quikhrms"."PIPOutcome",
    "supportProvided" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PIP_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."JobRequisition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requisitionNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" TEXT,
    "reportingToId" TEXT,
    "positions" INTEGER NOT NULL DEFAULT 1,
    "filledPositions" INTEGER NOT NULL DEFAULT 0,
    "jobLocation" TEXT,
    "jobDuration" TEXT,
    "workTimings" TEXT,
    "interviewMode" TEXT,
    "type" "app_quikhrms"."RequisitionType" NOT NULL DEFAULT 'NewPosition',
    "employmentType" "app_quikhrms"."EmploymentType" NOT NULL DEFAULT 'FullTime',
    "workLocation" "app_quikhrms"."WorkLocation" NOT NULL DEFAULT 'Office',
    "experienceMin" INTEGER,
    "experienceMax" INTEGER,
    "salaryMin" DECIMAL(15,2),
    "salaryMax" DECIMAL(15,2),
    "salaryCurrency" TEXT NOT NULL DEFAULT 'INR',
    "jobDescription" TEXT,
    "responsibilities" JSONB,
    "requirements" JSONB,
    "niceToHave" JSONB,
    "skills" JSONB,
    "skillWeights" JSONB,
    "education" TEXT,
    "benefits" JSONB,
    "rolePurpose" TEXT,
    "status" "app_quikhrms"."RequisitionStatus" NOT NULL DEFAULT 'ReqDraft',
    "priority" "app_quikhrms"."RequisitionPriority" NOT NULL DEFAULT 'Medium',
    "careerPageVisible" BOOLEAN NOT NULL DEFAULT true,
    "internalPostingOnly" BOOLEAN NOT NULL DEFAULT false,
    "referralBonusAmount" DECIMAL(15,2),
    "createdById" TEXT,
    "hiringManagerId" TEXT,
    "recruiterId" TEXT,
    "pipelineId" TEXT,
    "raisedById" TEXT,
    "raisedAt" TIMESTAMP(3),
    "justification" TEXT,
    "closedDate" DATE,
    "closureReason" TEXT,
    "jobOpeningName" TEXT,
    "interviewPanel" JSONB,
    "postToJobPortal" BOOLEAN NOT NULL DEFAULT false,
    "budget" DECIMAL(15,2),
    "etaToFillDays" INTEGER,
    "targetJoiningDate" DATE,
    "jobGrade" TEXT,
    "costCenter" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobRequisition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Candidate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "resumeUrl" TEXT,
    "parsedResume" JSONB,
    "currentCompany" TEXT,
    "currentDesignation" TEXT,
    "currentCTC" DECIMAL(15,2),
    "expectedCTC" DECIMAL(15,2),
    "noticePeriod" INTEGER,
    "totalExperience" INTEGER,
    "skills" JSONB,
    "education" JSONB,
    "linkedinUrl" TEXT,
    "portfolioUrl" TEXT,
    "source" "app_quikhrms"."CandidateSource" NOT NULL DEFAULT 'CandDirect',
    "referredById" TEXT,
    "location" TEXT,
    "willingToRelocate" BOOLEAN NOT NULL DEFAULT false,
    "tags" JSONB,
    "rating" DECIMAL(3,1),
    "status" "app_quikhrms"."CandidateStatus" NOT NULL DEFAULT 'New',
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "gdprConsent" BOOLEAN NOT NULL DEFAULT false,
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklistReason" TEXT,
    "blacklistedAt" TIMESTAMP(3),
    "blacklistedBy" TEXT,
    "blacklistedUntil" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archiveReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."HiringPipeline" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stages" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HiringPipeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."JobApplication" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "appliedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentStage" TEXT,
    "stageHistory" JSONB,
    "status" "app_quikhrms"."ApplicationStatus" NOT NULL DEFAULT 'AppActive',
    "aiMatchScore" DECIMAL(5,2),
    "aiMatchAnalysis" JSONB,
    "rejectionReason" TEXT,
    "rejectionStage" TEXT,
    "offerStatus" "app_quikhrms"."OfferStatus",
    "offerDesignation" TEXT,
    "offerDepartmentId" TEXT,
    "offerReportingToId" TEXT,
    "offeredCTC" DECIMAL(15,2),
    "offeredComponents" JSONB,
    "offerJoiningDate" DATE,
    "offerJoiningBonus" DECIMAL(15,2),
    "offerRelocationBonus" DECIMAL(15,2),
    "offerEquityGrant" TEXT,
    "offerSentAt" TIMESTAMP(3),
    "offerRespondedAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "offerDeclineReason" TEXT,
    "offerCounterOfferCTC" DECIMAL(15,2),
    "offerNegotiationNotes" TEXT,
    "offerLetterUrl" TEXT,
    "offerCreatedAt" TIMESTAMP(3),
    "offerCreatedBy" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Interview" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "type" "app_quikhrms"."InterviewType" NOT NULL DEFAULT 'Video',
    "interviewerId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT,
    "meetingLink" TEXT,
    "status" "app_quikhrms"."InterviewStatus" NOT NULL DEFAULT 'IntScheduled',
    "candidateFeedback" TEXT,
    "feedbackToken" TEXT,
    "feedbackTokenExpiresAt" TIMESTAMP(3),
    "feedbackRequestSentAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "overallRating" INTEGER,
    "recommendation" "app_quikhrms"."InterviewRecommendation",
    "criteria" JSONB,
    "strengths" TEXT,
    "concerns" TEXT,
    "overallComments" TEXT,
    "scorecardSubmittedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."SocialPost" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "app_quikhrms"."SocialPostType" NOT NULL DEFAULT 'Update',
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "pollData" JSONB,
    "visibility" "app_quikhrms"."PostVisibility" NOT NULL DEFAULT 'Organization',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "likes" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "approvalStatus" "app_quikhrms"."ContentApprovalStatus" NOT NULL DEFAULT 'Approved',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PostComment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Announcement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "attachments" JSONB,
    "visibility" "app_quikhrms"."PostVisibility" NOT NULL DEFAULT 'Organization',
    "targetDepartments" JSONB,
    "targetLocations" JSONB,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "approvalStatus" "app_quikhrms"."ContentApprovalStatus" NOT NULL DEFAULT 'Approved',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Survey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "app_quikhrms"."SurveyType" NOT NULL DEFAULT 'Engagement',
    "status" "app_quikhrms"."SurveyStatus" NOT NULL DEFAULT 'SurveyDraft',
    "questions" JSONB NOT NULL,
    "audience" JSONB,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "recurrence" TEXT,
    "responseRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."SurveyResponse" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Recognition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fromEmployeeId" TEXT NOT NULL,
    "toEmployeeId" TEXT NOT NULL,
    "type" "app_quikhrms"."RecognitionType" NOT NULL DEFAULT 'Kudos',
    "message" TEXT NOT NULL,
    "badge" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "approvalStatus" "app_quikhrms"."ContentApprovalStatus" NOT NULL DEFAULT 'Approved',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recognition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "app_quikhrms"."AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Notification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "app_quikhrms"."NotificationType" NOT NULL DEFAULT 'Info',
    "channel" "app_quikhrms"."NotificationChannel" NOT NULL DEFAULT 'InApp',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."DataImport" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "status" "app_quikhrms"."ImportStatus" NOT NULL DEFAULT 'ImportPending',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."CompanySettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "legalName" TEXT,
    "logo" TEXT,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'India',
    "postalCode" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "cin" TEXT,
    "tan" TEXT,
    "tdsCircleCodeArea" TEXT,
    "tdsCircleCodeType" TEXT,
    "tdsCircleNumber" TEXT,
    "tdsCircleSubNumber" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "fiscalYearStart" INTEGER NOT NULL DEFAULT 4,
    "probationPeriodDays" INTEGER NOT NULL DEFAULT 90,
    "noticePeriodDays" INTEGER NOT NULL DEFAULT 60,
    "workWeek" JSONB,
    "workHoursPerDay" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "letterheadKey" TEXT,
    "sealKey" TEXT,
    "signatureKey" TEXT,
    "signatoryName" TEXT,
    "signatoryDesignation" TEXT,
    "offerLetterFooter" TEXT,
    "offerLetterBody" TEXT,
    "hrmsSetupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "hrmsSetupCompletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."CompanyHoliday" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "year" INTEGER NOT NULL,
    "type" "app_quikhrms"."CompanyHolidayType" NOT NULL DEFAULT 'National',
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "maxOptionalAllowed" INTEGER,
    "applicableDepartments" JSONB,
    "applicableLocations" JSONB,
    "description" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyHoliday_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ApprovalChain" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" "app_quikhrms"."ApprovalModule" NOT NULL,
    "levels" JSONB NOT NULL,
    "autoApproveAfterDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalChain_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Document" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "app_quikhrms"."DocumentCategory" NOT NULL DEFAULT 'Other',
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentDocumentId" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "status" "app_quikhrms"."DocumentStatus" NOT NULL DEFAULT 'Active',
    "expiryDate" DATE,
    "uploadedBy" TEXT NOT NULL,
    "tags" JSONB,
    "metadata" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."DocumentAcknowledgment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "signature" TEXT,
    "declineReason" TEXT,
    "status" "app_quikhrms"."DocumentAckStatus" NOT NULL DEFAULT 'Pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentAcknowledgment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."DocumentShare" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sharedWith" TEXT NOT NULL,
    "sharedBy" TEXT NOT NULL,
    "accessLevel" "app_quikhrms"."DocumentAccessLevel" NOT NULL DEFAULT 'View',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."OnboardingTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" TEXT,
    "designationId" TEXT,
    "tasks" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."OnboardingInstance" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "templateId" TEXT,
    "startDate" DATE NOT NULL,
    "status" "app_quikhrms"."OnboardingStatus" NOT NULL DEFAULT 'NotStarted',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."OnboardingTask" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "assigneeRole" "app_quikhrms"."AssigneeRole" NOT NULL DEFAULT 'HRRole',
    "category" "app_quikhrms"."OnboardingTaskCategory" NOT NULL DEFAULT 'TaskOther',
    "dueDate" DATE,
    "status" "app_quikhrms"."OnboardingTaskStatus" NOT NULL DEFAULT 'TaskPending',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ProvisionItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "app_quikhrms"."ProvisionCategory" NOT NULL DEFAULT 'ProvOther',
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "departmentIds" JSONB,
    "roleIds" JSONB,
    "designationIds" JSONB,
    "ownerAssigneeRole" "app_quikhrms"."AssigneeRole",
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProvisionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."EmployeeProvision" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "provisionItemId" TEXT,
    "name" TEXT NOT NULL,
    "category" "app_quikhrms"."ProvisionCategory" NOT NULL DEFAULT 'ProvOther',
    "status" "app_quikhrms"."ProvisionStatus" NOT NULL DEFAULT 'ProvPending',
    "assignedTo" TEXT,
    "notes" TEXT,
    "dueDate" DATE,
    "provisionedAt" TIMESTAMP(3),
    "provisionedBy" TEXT,
    "meta" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeProvision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."OffboardingInstance" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "templateId" TEXT,
    "resignationDate" DATE NOT NULL,
    "lastWorkingDate" DATE NOT NULL,
    "reason" "app_quikhrms"."OffboardingReason" NOT NULL DEFAULT 'Resignation',
    "status" "app_quikhrms"."OffboardingStatus" NOT NULL DEFAULT 'Initiated',
    "exitInterviewDone" BOOLEAN NOT NULL DEFAULT false,
    "exitInterviewNotes" TEXT,
    "exitInterviewAt" TIMESTAMP(3),
    "notes" TEXT,
    "resignationApprovalStatus" "app_quikhrms"."ResignationApprovalStatus",
    "resignationApproverId" TEXT,
    "resignationDecisionById" TEXT,
    "resignationDecisionAt" TIMESTAMP(3),
    "resignationRejectionReason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OffboardingInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."OffboardingTask" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "department" TEXT,
    "category" "app_quikhrms"."OffboardingTaskCategory" NOT NULL DEFAULT 'Clearance',
    "status" "app_quikhrms"."OnboardingTaskStatus" NOT NULL DEFAULT 'TaskPending',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffboardingTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Asset" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'AssetOther',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "serialNumber" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "purchaseDate" DATE,
    "purchasePrice" DECIMAL(15,2),
    "warrantyExpiry" DATE,
    "status" "app_quikhrms"."AssetStatus" NOT NULL DEFAULT 'Available',
    "condition" "app_quikhrms"."AssetCondition" NOT NULL DEFAULT 'New',
    "location" TEXT,
    "specs" JSONB,
    "notes" TEXT,
    "disposalDate" DATE,
    "disposalReason" TEXT,
    "scrapValue" DECIMAL(15,2),
    "scrappedBy" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."AssetAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnDate" DATE,
    "returnedAt" TIMESTAMP(3),
    "returnedTo" TEXT,
    "returnCondition" "app_quikhrms"."AssetCondition",
    "status" "app_quikhrms"."AssetAssignmentStatus" NOT NULL DEFAULT 'AssignmentActive',
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."AssetScrap" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "scrapDate" DATE NOT NULL,
    "scrapValue" DECIMAL(15,2),
    "markedLost" BOOLEAN NOT NULL DEFAULT false,
    "scrappedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetScrap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Report" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parameters" JSONB,
    "generatedBy" TEXT NOT NULL,
    "format" "app_quikhrms"."ReportFormat" NOT NULL DEFAULT 'PDF',
    "fileUrl" TEXT,
    "status" "app_quikhrms"."ReportStatus" NOT NULL DEFAULT 'ReportQueued',
    "scheduleCron" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Dashboard" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "iconName" TEXT,
    "color" TEXT,
    "isPrebuilt" BOOLEAN NOT NULL DEFAULT false,
    "widgets" JSONB NOT NULL,
    "roleAccess" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TimeProject" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "clientName" TEXT,
    "departmentId" TEXT,
    "ownerId" TEXT,
    "budgetHours" DECIMAL(10,2),
    "startDate" DATE,
    "endDate" DATE,
    "isBillable" BOOLEAN NOT NULL DEFAULT false,
    "status" "app_quikhrms"."ProjectStatus" NOT NULL DEFAULT 'ProjectActive',
    "memberIds" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TimeProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TimeJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "assigneeId" TEXT,
    "departmentId" TEXT,
    "estimatedHours" DECIMAL(10,2),
    "startDate" DATE,
    "dueDate" DATE,
    "isBillable" BOOLEAN NOT NULL DEFAULT false,
    "status" "app_quikhrms"."JobStatus" NOT NULL DEFAULT 'JobActive',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TimeJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."JobScheduleEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "jobId" TEXT,
    "projectId" TEXT,
    "note" TEXT,
    "status" "app_quikhrms"."ScheduleStatus" NOT NULL DEFAULT 'ScheduleDraft',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobScheduleEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TimeLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "duration" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "projectId" TEXT,
    "taskId" TEXT,
    "description" TEXT,
    "isBillable" BOOLEAN NOT NULL DEFAULT false,
    "status" "app_quikhrms"."TimeLogStatus" NOT NULL DEFAULT 'LogDraft',
    "timesheetId" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TimeLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Timesheet" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodType" "app_quikhrms"."TimesheetPeriodType" NOT NULL DEFAULT 'Weekly',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "totalHours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "billableHours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "status" "app_quikhrms"."TimesheetStatus" NOT NULL DEFAULT 'TsDraft',
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Delegation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "delegatorId" TEXT NOT NULL,
    "delegateeId" TEXT NOT NULL,
    "type" "app_quikhrms"."DelegationType" NOT NULL DEFAULT 'DelegationTemporary',
    "modules" JSONB NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE,
    "notifyMode" "app_quikhrms"."DelegationNotifyMode" NOT NULL DEFAULT 'NotifyBoth',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."EmploymentHistory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "changeType" "app_quikhrms"."EmploymentChangeType" NOT NULL,
    "fromValue" JSONB,
    "toValue" JSONB NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT,
    "approvedBy" TEXT,
    "letterUrl" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ESignRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "provider" "app_quikhrms"."ESignProvider" NOT NULL DEFAULT 'Internal',
    "signers" JSONB NOT NULL,
    "message" TEXT,
    "status" "app_quikhrms"."ESignStatus" NOT NULL DEFAULT 'ESignDraft',
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ESignRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."CandidatePortalAccess" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CandidatePortalAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."AppRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."RoleNavigation" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,

    CONSTRAINT "RoleNavigation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."UserAppRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."UserPermissionExtra" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "kind" "app_quikhrms"."PermissionGrantKind" NOT NULL DEFAULT 'GRANT',
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionExtra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PayrollSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orgDetailsCompleted" BOOLEAN NOT NULL DEFAULT false,
    "taxDetailsCompleted" BOOLEAN NOT NULL DEFAULT false,
    "payScheduleCompleted" BOOLEAN NOT NULL DEFAULT false,
    "statutoryComponentsCompleted" BOOLEAN NOT NULL DEFAULT false,
    "salaryComponentsCompleted" BOOLEAN NOT NULL DEFAULT false,
    "employeesCompleted" BOOLEAN NOT NULL DEFAULT false,
    "priorPayrollCompleted" BOOLEAN NOT NULL DEFAULT false,
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "setupCompletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PayrollTaxDetails" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "pan" TEXT,
    "tan" TEXT,
    "tdsCircleCodeArea" TEXT,
    "tdsCircleCodeType" TEXT,
    "tdsCircleNumber" TEXT,
    "tdsCircleSubNumber" TEXT,
    "taxPaymentFrequency" "app_quikhrms"."TaxPaymentFrequency" NOT NULL DEFAULT 'Monthly',
    "deductorType" "app_quikhrms"."DeductorType" NOT NULL DEFAULT 'Employee',
    "deductorEmployeeId" TEXT,
    "deductorName" TEXT,
    "deductorFatherName" TEXT,
    "deductorAddress" TEXT,
    "deductorDesignation" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollTaxDetails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PaySchedule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workWeek" JSONB NOT NULL,
    "salaryCalcBasis" "app_quikhrms"."SalaryCalcBasis" NOT NULL DEFAULT 'ActualDaysInMonth',
    "orgWorkingDays" INTEGER,
    "payDayType" "app_quikhrms"."PayDayType" NOT NULL DEFAULT 'LastWorkingDay',
    "payDayOfMonth" INTEGER,
    "payFrequency" "app_quikhrms"."PayFrequency" NOT NULL DEFAULT 'Monthly',
    "firstPayrollMonth" DATE,
    "autoCreate" BOOLEAN NOT NULL DEFAULT false,
    "autoCreateDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "autoCreateLastRunAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaySchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."EPFConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "epfNumber" TEXT,
    "deductionCycle" "app_quikhrms"."PFDeductionCycle" NOT NULL DEFAULT 'Monthly',
    "employeeContributionRate" "app_quikhrms"."EPFContributionRate" NOT NULL DEFAULT 'TwelvePercentActual',
    "employerContributionRate" "app_quikhrms"."EPFContributionRate" NOT NULL DEFAULT 'TwelvePercentActual',
    "includeEmployerInCTC" BOOLEAN NOT NULL DEFAULT true,
    "includeEDLIInCTC" BOOLEAN NOT NULL DEFAULT false,
    "includeAdminChargesInCTC" BOOLEAN NOT NULL DEFAULT false,
    "allowOverrideAtEmployee" BOOLEAN NOT NULL DEFAULT false,
    "proRateRestrictedWage" BOOLEAN NOT NULL DEFAULT false,
    "considerAllComponentsOnLOP" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EPFConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ESIConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "esiNumber" TEXT,
    "deductionCycle" "app_quikhrms"."PFDeductionCycle" NOT NULL DEFAULT 'Monthly',
    "employeeContributionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0.75,
    "employerContributionPercent" DECIMAL(5,2) NOT NULL DEFAULT 3.25,
    "includeEmployerInCTC" BOOLEAN NOT NULL DEFAULT false,
    "grossCeiling" DECIMAL(12,2) NOT NULL DEFAULT 21000,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ESIConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ProfessionalTaxConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "locationId" TEXT,
    "state" TEXT NOT NULL,
    "ptNumber" TEXT,
    "deductionCycle" "app_quikhrms"."ProfessionalTaxCycle" NOT NULL DEFAULT 'Monthly',
    "slabs" JSONB NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalTaxConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LWFConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL,
    "calcType" TEXT NOT NULL DEFAULT 'Flat',
    "employeeContribution" DECIMAL(10,2) NOT NULL,
    "employerContribution" DECIMAL(10,2) NOT NULL,
    "employeeRate" DECIMAL(6,4),
    "employerRate" DECIMAL(6,4),
    "employeeCap" DECIMAL(10,2),
    "employerCap" DECIMAL(10,2),
    "deductionCycle" "app_quikhrms"."LWFCycle" NOT NULL DEFAULT 'HalfYearly',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LWFConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."StatutoryBonusConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "minPercent" DECIMAL(5,2) NOT NULL DEFAULT 8.33,
    "maxPercent" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    "eligibilityWageCap" DECIMAL(12,2) NOT NULL DEFAULT 21000,
    "calculationWageCap" DECIMAL(12,2) NOT NULL DEFAULT 7000,
    "payoutFrequency" "app_quikhrms"."SalaryFrequency" NOT NULL DEFAULT 'Yearly',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatutoryBonusConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."StateMinimumWage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "scheduledEmployment" TEXT NOT NULL DEFAULT '',
    "skillLevel" TEXT NOT NULL DEFAULT '',
    "zone" TEXT NOT NULL DEFAULT '',
    "monthlyWage" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StateMinimumWage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."SalaryComponent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "app_quikhrms"."SalaryComponentType" NOT NULL,
    "category" "app_quikhrms"."SalaryComponentCategory" NOT NULL,
    "amountType" "app_quikhrms"."SalaryAmountType" NOT NULL DEFAULT 'Fixed',
    "amountValue" DECIMAL(15,4),
    "formula" TEXT,
    "frequency" "app_quikhrms"."SalaryFrequency" NOT NULL DEFAULT 'Monthly',
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "includeInCTC" BOOLEAN NOT NULL DEFAULT true,
    "includeInGross" BOOLEAN NOT NULL DEFAULT true,
    "considerForEPF" BOOLEAN NOT NULL DEFAULT false,
    "considerForESI" BOOLEAN NOT NULL DEFAULT false,
    "considerForPT" BOOLEAN NOT NULL DEFAULT false,
    "considerForLWF" BOOLEAN NOT NULL DEFAULT false,
    "proRateOnLOP" BOOLEAN NOT NULL DEFAULT true,
    "considerEPFIfPFWageLT15k" BOOLEAN NOT NULL DEFAULT false,
    "maxAmount" DECIMAL(15,2),
    "description" TEXT,
    "nameInPayslip" TEXT,
    "showInPayslip" BOOLEAN NOT NULL DEFAULT true,
    "partOfSalaryStructure" BOOLEAN NOT NULL DEFAULT true,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "isFBP" BOOLEAN NOT NULL DEFAULT false,
    "carryForwardUnclaimed" BOOLEAN NOT NULL DEFAULT true,
    "requireBillNumber" BOOLEAN NOT NULL DEFAULT false,
    "requireMerchantName" BOOLEAN NOT NULL DEFAULT false,
    "requireUploadDoc" BOOLEAN NOT NULL DEFAULT false,
    "claimInstructions" TEXT,
    "investmentSection" TEXT,
    "investmentType" TEXT,
    "correctionForId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."SalaryStructure" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "ctcMin" DECIMAL(15,2),
    "ctcMax" DECIMAL(15,2),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."SalaryStructureComponent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "amountType" "app_quikhrms"."SalaryAmountType" NOT NULL DEFAULT 'Fixed',
    "amountValue" DECIMAL(15,4),
    "formula" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryStructureComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."EmployeeSalary" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "structureId" TEXT,
    "ctc" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "revisionReason" TEXT,
    "overrides" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeSalary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PayRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "payFrequency" "app_quikhrms"."PayFrequency" NOT NULL DEFAULT 'Monthly',
    "status" "app_quikhrms"."PayRunStatus" NOT NULL DEFAULT 'Draft',
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "processedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "computeStatus" TEXT,
    "computeStartedAt" TIMESTAMP(3),
    "computeFinishedAt" TIMESTAMP(3),
    "computeEmployeeCount" INTEGER,
    "computeTotalGross" DOUBLE PRECISION,
    "computeTotalNet" DOUBLE PRECISION,
    "computeTotalDeductions" DOUBLE PRECISION,
    "computeError" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PayRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."OneTimeStatutoryDefault" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "app_quikhrms"."OneTimeEarningKind" NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "considerForEPF" BOOLEAN NOT NULL DEFAULT false,
    "considerForESI" BOOLEAN NOT NULL DEFAULT true,
    "considerForPT" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneTimeStatutoryDefault_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TdsOverride" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "setOnPayRunId" TEXT NOT NULL,
    "setOnPeriod" DATE NOT NULL,
    "fy" TEXT NOT NULL,
    "originalTds" DECIMAL(15,2) NOT NULL,
    "overrideTds" DECIMAL(15,2) NOT NULL,
    "shortfall" DECIMAL(15,2) NOT NULL,
    "recoveryStrategy" "app_quikhrms"."TdsRecoveryStrategy" NOT NULL,
    "recoveryMonths" INTEGER NOT NULL,
    "perMonthAmount" DECIMAL(15,2) NOT NULL,
    "recoveryStart" DATE NOT NULL,
    "recoveryEnd" DATE NOT NULL,
    "reason" TEXT,
    "status" "app_quikhrms"."TdsOverrideStatus" NOT NULL DEFAULT 'Active',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TdsOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PayRunAdjustment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "paidDaysOverride" DECIMAL(6,2),
    "reason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PayRunAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Payslip" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "workingDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "paidDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "lopDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "grossEarnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "app_quikhrms"."PayslipStatus" NOT NULL DEFAULT 'Draft',
    "releasedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PayslipLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "componentId" TEXT,
    "componentCode" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "type" "app_quikhrms"."SalaryComponentType" NOT NULL,
    "category" "app_quikhrms"."SalaryComponentCategory" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayslipLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PriorPayroll" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "financialYear" TEXT,
    "fromMonth" DATE,
    "toMonth" DATE,
    "dataUploaded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriorPayroll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PriorPayrollRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "grossEarnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "epfEmployee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "epfEmployer" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "esiEmployee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "esiEmployer" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "professionalTax" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PriorPayrollRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."EmployeeLoan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "loanType" "app_quikhrms"."LoanType" NOT NULL DEFAULT 'Personal',
    "principalAmount" DECIMAL(15,2) NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tenureMonths" INTEGER NOT NULL,
    "emiAmount" DECIMAL(15,2) NOT NULL,
    "disbursementDate" DATE,
    "startDate" DATE,
    "endDate" DATE,
    "holdUntil" DATE,
    "outstandingAmount" DECIMAL(15,2) NOT NULL,
    "emisPaid" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "status" "app_quikhrms"."LoanStatus" NOT NULL DEFAULT 'Pending',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LoanRepayment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "payRunId" TEXT,
    "payslipId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "repaidOn" DATE NOT NULL,
    "emiNumber" INTEGER NOT NULL,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanRepayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Donation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "donorPAN" TEXT,
    "doneeName" TEXT NOT NULL,
    "doneePAN" TEXT,
    "section" TEXT NOT NULL DEFAULT '80G',
    "donationDate" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "exemptionPercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "qualifyingLimit" DECIMAL(15,2),
    "exemptAmount" DECIMAL(15,2),
    "receiptNumber" TEXT,
    "fileUrl" TEXT,
    "notes" TEXT,
    "status" "app_quikhrms"."DonationStatus" NOT NULL DEFAULT 'Submitted',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ReimbursementClaim" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "componentId" TEXT,
    "componentName" TEXT NOT NULL,
    "title" TEXT,
    "billDate" DATE NOT NULL,
    "billDateTo" DATE,
    "billNumber" TEXT,
    "merchantName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isProject" BOOLEAN NOT NULL DEFAULT false,
    "amountClaimed" DECIMAL(15,2) NOT NULL,
    "amountApproved" DECIMAL(15,2),
    "fileUrl" TEXT,
    "attachments" JSONB,
    "description" TEXT,
    "status" "app_quikhrms"."ReimbursementClaimStatus" NOT NULL DEFAULT 'Submitted',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "payRunId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReimbursementClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."InvestmentProof" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "investmentType" TEXT NOT NULL,
    "declaredAmount" DECIMAL(15,2) NOT NULL,
    "proofAmount" DECIMAL(15,2) NOT NULL,
    "approvedAmount" DECIMAL(15,2),
    "fileUrl" TEXT,
    "remarks" TEXT,
    "status" "app_quikhrms"."InvestmentProofStatus" NOT NULL DEFAULT 'Submitted',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InvestmentProof_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."SalaryRevision" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "currentCTC" DECIMAL(15,2) NOT NULL,
    "proposedCTC" DECIMAL(15,2) NOT NULL,
    "structureId" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "reason" TEXT,
    "status" "app_quikhrms"."SalaryRevisionStatus" NOT NULL DEFAULT 'Pending',
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "appliedSalaryId" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SalaryRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."PayRunApproval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "approverId" TEXT NOT NULL,
    "approverRole" TEXT,
    "status" "app_quikhrms"."PayRunApprovalStatus" NOT NULL DEFAULT 'Pending',
    "comments" TEXT,
    "actedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayRunApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TaskList" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TaskList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Task" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "taskListId" TEXT,
    "assigneeId" TEXT NOT NULL,
    "requesterId" TEXT,
    "requestedFor" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "app_quikhrms"."TaskStatus" NOT NULL DEFAULT 'Open',
    "priority" "app_quikhrms"."TaskPriority" NOT NULL DEFAULT 'Normal',
    "groupKey" TEXT,
    "meta" JSONB,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TaskActivity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."LegalEntity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registeredName" TEXT,
    "pan" TEXT,
    "tan" TEXT,
    "gstin" TEXT,
    "cin" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "state" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "pincode" TEXT,
    "pfEstablishmentCode" TEXT,
    "esiEstablishmentCode" TEXT,
    "ptRegistrationNumber" TEXT,
    "lwfRegistrationNumber" TEXT,
    "status" "app_quikhrms"."LegalEntityStatus" NOT NULL DEFAULT 'Active',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."FullAndFinalSettlement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "resignationDate" DATE NOT NULL,
    "lastWorkingDate" DATE NOT NULL,
    "reason" TEXT,
    "status" "app_quikhrms"."SettlementStatus" NOT NULL DEFAULT 'Draft',
    "pendingSalary" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "leaveEncashment" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "gratuityAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "bonusAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "noticePayRecovery" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "loanRecovery" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "otherEarnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tdsDeducted" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netSettlement" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "details" JSONB,
    "payslipId" TEXT,
    "payRunId" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FullAndFinalSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."GratuityRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "computeDate" DATE NOT NULL,
    "yearsOfService" DECIMAL(5,2) NOT NULL,
    "lastBasicDA" DECIMAL(15,2) NOT NULL,
    "formula" TEXT NOT NULL DEFAULT 'PaymentOfGratuityAct',
    "computedAmount" DECIMAL(15,2) NOT NULL,
    "taxExemptAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidOn" DATE,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GratuityRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Form12BBDeclaration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "hraClaimed" BOOLEAN NOT NULL DEFAULT false,
    "rentPaid" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "landlordName" TEXT,
    "landlordPan" TEXT,
    "landlordAddress" TEXT,
    "ltaClaimed" BOOLEAN NOT NULL DEFAULT false,
    "ltaAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ltaDetails" TEXT,
    "homeLoanInterest" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lenderName" TEXT,
    "lenderPan" TEXT,
    "lenderAddress" TEXT,
    "lenderType" TEXT,
    "section80C" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "section80CCC" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "section80CCD1" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "section80D" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "section80E" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "section80G" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "section80TTA" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "nps80CCD1B" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "otherDeductions" JSONB,
    "verificationPlace" TEXT,
    "verificationDate" DATE,
    "verificationName" TEXT,
    "verificationDesignation" TEXT,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedFileUrl" TEXT,
    "documents" JSONB,
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Form12BBDeclaration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."EmailTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'Email',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."BankReconciliation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileName" TEXT,
    "totalDebited" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalMatched" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "app_quikhrms"."BankReconciliationStatus" NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."BankReconciliationLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "payslipId" TEXT,
    "employeeName" TEXT NOT NULL,
    "bankAccount" TEXT,
    "ifsc" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "txnDate" DATE,
    "txnRef" TEXT,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "matchReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReconciliationLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."OneTimeEarning" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "app_quikhrms"."OneTimeEarningKind" NOT NULL,
    "category" "app_quikhrms"."SalaryComponentCategory" NOT NULL DEFAULT 'OtherEarning',
    "componentCode" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "payPeriod" DATE NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "considerForEPF" BOOLEAN NOT NULL DEFAULT false,
    "considerForESI" BOOLEAN NOT NULL DEFAULT true,
    "considerForPT" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "status" "app_quikhrms"."OneTimeEarningStatus" NOT NULL DEFAULT 'Pending',
    "appliedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "sourceReimbursementClaimId" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OneTimeEarning_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."ClaimsDeclarationSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "itDeclarationReleased" BOOLEAN NOT NULL DEFAULT false,
    "itDeclarationReleasedAt" TIMESTAMP(3),
    "poiReleased" BOOLEAN NOT NULL DEFAULT false,
    "poiReleasedAt" TIMESTAMP(3),
    "poiStartMonth" INTEGER NOT NULL DEFAULT 3,
    "allowRegimeSwitch" BOOLEAN NOT NULL DEFAULT true,
    "allowTDSModification" BOOLEAN NOT NULL DEFAULT false,
    "allowTDSModificationPayroll" BOOLEAN NOT NULL DEFAULT false,
    "defaultRegime" "app_quikhrms"."TaxRegime" NOT NULL DEFAULT 'NewRegime',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimsDeclarationSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."WfhRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" DECIMAL(5,2) NOT NULL,
    "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "session" "app_quikhrms"."WfhSession" NOT NULL DEFAULT 'FullDay',
    "reason" TEXT NOT NULL,
    "attachments" JSONB,
    "status" "app_quikhrms"."WfhStatus" NOT NULL DEFAULT 'Pending',
    "appliedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelReason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WfhRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."WfhApproval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "wfhRequestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "role" "app_quikhrms"."WfhApproverRole" NOT NULL,
    "status" "app_quikhrms"."WfhApprovalStatus" NOT NULL DEFAULT 'Pending',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WfhApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."WfhQuotaGroup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "yearlyQuota" INTEGER NOT NULL,
    "mode" "app_quikhrms"."WfhGroupMode" NOT NULL DEFAULT 'Department',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "departmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "WfhQuotaGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."CandidateDocumentType" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "bundle" "app_quikhrms"."DocumentBundle" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "helpText" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CandidateDocumentType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."CandidateDocumentRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "bundle" "app_quikhrms"."DocumentBundle" NOT NULL,
    "status" "app_quikhrms"."CandidateDocRequestStatus" NOT NULL DEFAULT 'Pending',
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "requestSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "selectedDocTypeIds" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CandidateDocumentRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."CandidateDocumentUpload" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "documentTypeId" TEXT,
    "customLabel" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "status" "app_quikhrms"."CandidateDocUploadStatus" NOT NULL DEFAULT 'Pending',
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CandidateDocumentUpload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."RequisitionApproval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "role" "app_quikhrms"."RequisitionApproverRole",
    "status" "app_quikhrms"."RequisitionApprovalStatus" NOT NULL DEFAULT 'Pending',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequisitionApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TicketCategory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "defaultAssigneeId" TEXT,
    "departmentId" TEXT,
    "slaResponseHours" INTEGER NOT NULL DEFAULT 24,
    "slaResolveHours" INTEGER NOT NULL DEFAULT 72,
    "slaMatrix" JSONB,
    "autoCloseAfterDays" INTEGER NOT NULL DEFAULT 7,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Ticket" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT,
    "departmentId" TEXT,
    "priority" "app_quikhrms"."TicketPriority" NOT NULL DEFAULT 'Medium',
    "status" "app_quikhrms"."TicketStatus" NOT NULL DEFAULT 'Open',
    "source" "app_quikhrms"."TicketSource" NOT NULL DEFAULT 'Web',
    "raisedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "slaResponseDueAt" TIMESTAMP(3),
    "slaResolveDueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "responseBreachedAt" TIMESTAMP(3),
    "resolveBreachedAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "resolutionNote" TEXT,
    "rejectionReason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TicketComment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TicketAttachment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TicketActivity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "action" TEXT NOT NULL,
    "fromVal" TEXT,
    "toVal" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."KraScorecard" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "designationId" TEXT,
    "departmentId" TEXT,
    "tags" JSONB,
    "effectiveFrom" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KraScorecard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."KraTemplateEntry" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(5,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "kpis" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "KraTemplateEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."EmployeeKraAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "cycleId" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "snapshot" JSONB NOT NULL,
    "progress" JSONB NOT NULL DEFAULT '{}',
    "compositeScore" DECIMAL(5,2),
    "status" "app_quikhrms"."KraAssignmentStatus" NOT NULL DEFAULT 'Active',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeKraAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TdsLiabilityPeriod" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "natureOfPayment" TEXT NOT NULL DEFAULT '92B',
    "totalDeducted" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAllocated" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "payslipIds" JSONB NOT NULL DEFAULT '[]',
    "dueDate" DATE NOT NULL,
    "status" "app_quikhrms"."TdsPeriodStatus" NOT NULL DEFAULT 'Pending',
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TdsLiabilityPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TdsChallan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "cin" TEXT NOT NULL,
    "bsrCode" TEXT NOT NULL,
    "challanSerial" TEXT NOT NULL,
    "depositDate" DATE NOT NULL,
    "assessmentYear" TEXT NOT NULL,
    "natureOfPayment" TEXT NOT NULL DEFAULT '92B',
    "tanNumber" TEXT NOT NULL,
    "basicTax" DECIMAL(15,2) NOT NULL,
    "surcharge" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "educationCess" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "interest" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lateFee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "others" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "paymentMode" "app_quikhrms"."TdsPaymentMode" NOT NULL,
    "bankName" TEXT,
    "acknowledgmentNumber" TEXT,
    "remainingAmount" DECIMAL(15,2) NOT NULL,
    "status" "app_quikhrms"."TdsChallanStatus" NOT NULL DEFAULT 'Recorded',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TdsChallan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."TdsChallanAllocation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "liabilityPeriodId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(15,2) NOT NULL,
    "isAutoAllocated" BOOLEAN NOT NULL DEFAULT true,
    "allocatedBy" TEXT,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TdsChallanAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikhrms"."Invitation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "roleIds" TEXT[],
    "departmentId" TEXT,
    "designationId" TEXT,
    "managerId" TEXT,
    "token" TEXT NOT NULL,
    "centralInviteToken" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "app_quikhrms"."InvitationStatus" NOT NULL DEFAULT 'Pending',
    "invitedBy" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Department_orgId_idx" ON "app_quikhrms"."Department"("orgId");

CREATE INDEX IF NOT EXISTS "Department_orgId_deletedAt_idx" ON "app_quikhrms"."Department"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Department_orgId_code_key" ON "app_quikhrms"."Department"("orgId", "code");

CREATE INDEX IF NOT EXISTS "Team_orgId_idx" ON "app_quikhrms"."Team"("orgId");

CREATE INDEX IF NOT EXISTS "Team_orgId_deletedAt_idx" ON "app_quikhrms"."Team"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Team_orgId_departmentId_idx" ON "app_quikhrms"."Team"("orgId", "departmentId");

CREATE INDEX IF NOT EXISTS "Designation_orgId_idx" ON "app_quikhrms"."Designation"("orgId");

CREATE INDEX IF NOT EXISTS "Designation_orgId_deletedAt_idx" ON "app_quikhrms"."Designation"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Grade_orgId_idx" ON "app_quikhrms"."Grade"("orgId");

CREATE INDEX IF NOT EXISTS "Grade_orgId_deletedAt_idx" ON "app_quikhrms"."Grade"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "OfficeLocation_orgId_idx" ON "app_quikhrms"."OfficeLocation"("orgId");

CREATE INDEX IF NOT EXISTS "OfficeLocation_orgId_deletedAt_idx" ON "app_quikhrms"."OfficeLocation"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Employee_orgId_workEmail_idx" ON "app_quikhrms"."Employee"("orgId", "workEmail");

CREATE INDEX IF NOT EXISTS "Employee_orgId_idx" ON "app_quikhrms"."Employee"("orgId");

CREATE INDEX IF NOT EXISTS "Employee_orgId_deletedAt_idx" ON "app_quikhrms"."Employee"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Employee_orgId_departmentId_idx" ON "app_quikhrms"."Employee"("orgId", "departmentId");

CREATE INDEX IF NOT EXISTS "Employee_orgId_status_idx" ON "app_quikhrms"."Employee"("orgId", "status");

CREATE INDEX IF NOT EXISTS "Employee_orgId_reportingManagerId_idx" ON "app_quikhrms"."Employee"("orgId", "reportingManagerId");

CREATE INDEX IF NOT EXISTS "Employee_orgId_deletedAt_status_idx" ON "app_quikhrms"."Employee"("orgId", "deletedAt", "status");

CREATE INDEX IF NOT EXISTS "Employee_orgId_deletedAt_departmentId_status_idx" ON "app_quikhrms"."Employee"("orgId", "deletedAt", "departmentId", "status");

CREATE INDEX IF NOT EXISTS "Employee_orgId_dateOfJoining_idx" ON "app_quikhrms"."Employee"("orgId", "dateOfJoining");

CREATE INDEX IF NOT EXISTS "Employee_orgId_lastWorkingDate_idx" ON "app_quikhrms"."Employee"("orgId", "lastWorkingDate");

CREATE INDEX IF NOT EXISTS "Employee_orgId_deletedAt_employmentType_idx" ON "app_quikhrms"."Employee"("orgId", "deletedAt", "employmentType");

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_orgId_employeeCode_key" ON "app_quikhrms"."Employee"("orgId", "employeeCode");

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_orgId_authUserId_key" ON "app_quikhrms"."Employee"("orgId", "authUserId");

CREATE INDEX IF NOT EXISTS "AttendanceRecord_orgId_idx" ON "app_quikhrms"."AttendanceRecord"("orgId");

CREATE INDEX IF NOT EXISTS "AttendanceRecord_orgId_deletedAt_idx" ON "app_quikhrms"."AttendanceRecord"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "AttendanceRecord_orgId_employeeId_idx" ON "app_quikhrms"."AttendanceRecord"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "AttendanceRecord_orgId_date_idx" ON "app_quikhrms"."AttendanceRecord"("orgId", "date");

CREATE INDEX IF NOT EXISTS "AttendanceRecord_orgId_employeeId_date_idx" ON "app_quikhrms"."AttendanceRecord"("orgId", "employeeId", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_orgId_employeeId_date_key" ON "app_quikhrms"."AttendanceRecord"("orgId", "employeeId", "date");

CREATE INDEX IF NOT EXISTS "AttendancePolicy_orgId_idx" ON "app_quikhrms"."AttendancePolicy"("orgId");

CREATE INDEX IF NOT EXISTS "AttendancePolicy_orgId_deletedAt_idx" ON "app_quikhrms"."AttendancePolicy"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "ShiftPolicy_orgId_idx" ON "app_quikhrms"."ShiftPolicy"("orgId");

CREATE INDEX IF NOT EXISTS "ShiftPolicy_orgId_deletedAt_idx" ON "app_quikhrms"."ShiftPolicy"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ShiftPolicy_orgId_code_key" ON "app_quikhrms"."ShiftPolicy"("orgId", "code");

CREATE INDEX IF NOT EXISTS "ShiftAssignment_orgId_idx" ON "app_quikhrms"."ShiftAssignment"("orgId");

CREATE INDEX IF NOT EXISTS "ShiftAssignment_orgId_deletedAt_idx" ON "app_quikhrms"."ShiftAssignment"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "ShiftAssignment_orgId_employeeId_idx" ON "app_quikhrms"."ShiftAssignment"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "Roster_orgId_idx" ON "app_quikhrms"."Roster"("orgId");

CREATE INDEX IF NOT EXISTS "Roster_orgId_deletedAt_idx" ON "app_quikhrms"."Roster"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Roster_orgId_departmentId_idx" ON "app_quikhrms"."Roster"("orgId", "departmentId");

CREATE INDEX IF NOT EXISTS "RosterEntry_orgId_rosterId_idx" ON "app_quikhrms"."RosterEntry"("orgId", "rosterId");

CREATE INDEX IF NOT EXISTS "RosterEntry_orgId_employeeId_idx" ON "app_quikhrms"."RosterEntry"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "RosterEntry_orgId_deletedAt_idx" ON "app_quikhrms"."RosterEntry"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "RosterEntry_rosterId_employeeId_date_key" ON "app_quikhrms"."RosterEntry"("rosterId", "employeeId", "date");

CREATE INDEX IF NOT EXISTS "LeaveType_orgId_idx" ON "app_quikhrms"."LeaveType"("orgId");

CREATE INDEX IF NOT EXISTS "LeaveType_orgId_deletedAt_idx" ON "app_quikhrms"."LeaveType"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "LeaveType_orgId_code_key" ON "app_quikhrms"."LeaveType"("orgId", "code");

CREATE INDEX IF NOT EXISTS "LeaveGroup_orgId_idx" ON "app_quikhrms"."LeaveGroup"("orgId");

CREATE INDEX IF NOT EXISTS "LeaveGroup_orgId_deletedAt_idx" ON "app_quikhrms"."LeaveGroup"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "LeaveGroup_orgId_name_key" ON "app_quikhrms"."LeaveGroup"("orgId", "name");

CREATE INDEX IF NOT EXISTS "LeaveGroupItem_orgId_leaveGroupId_idx" ON "app_quikhrms"."LeaveGroupItem"("orgId", "leaveGroupId");

CREATE UNIQUE INDEX IF NOT EXISTS "LeaveGroupItem_leaveGroupId_leaveTypeId_key" ON "app_quikhrms"."LeaveGroupItem"("leaveGroupId", "leaveTypeId");

CREATE INDEX IF NOT EXISTS "LeaveGroupAssignment_orgId_leaveGroupId_idx" ON "app_quikhrms"."LeaveGroupAssignment"("orgId", "leaveGroupId");

CREATE INDEX IF NOT EXISTS "LeaveGroupAssignment_orgId_employeeId_idx" ON "app_quikhrms"."LeaveGroupAssignment"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "LeaveGroupAssignment_orgId_roleId_idx" ON "app_quikhrms"."LeaveGroupAssignment"("orgId", "roleId");

CREATE UNIQUE INDEX IF NOT EXISTS "LeaveGroupAssignment_leaveGroupId_assigneeType_employeeId_r_key" ON "app_quikhrms"."LeaveGroupAssignment"("leaveGroupId", "assigneeType", "employeeId", "roleId");

CREATE INDEX IF NOT EXISTS "LeaveRequest_orgId_idx" ON "app_quikhrms"."LeaveRequest"("orgId");

CREATE INDEX IF NOT EXISTS "LeaveRequest_orgId_deletedAt_idx" ON "app_quikhrms"."LeaveRequest"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "LeaveRequest_orgId_employeeId_idx" ON "app_quikhrms"."LeaveRequest"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "LeaveRequest_orgId_status_idx" ON "app_quikhrms"."LeaveRequest"("orgId", "status");

CREATE INDEX IF NOT EXISTS "LeaveRequest_orgId_startDate_endDate_idx" ON "app_quikhrms"."LeaveRequest"("orgId", "startDate", "endDate");

CREATE INDEX IF NOT EXISTS "LeaveRequest_orgId_employeeId_status_createdAt_idx" ON "app_quikhrms"."LeaveRequest"("orgId", "employeeId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "LeaveRequest_orgId_status_deletedAt_idx" ON "app_quikhrms"."LeaveRequest"("orgId", "status", "deletedAt");

CREATE INDEX IF NOT EXISTS "LeaveApproval_orgId_leaveRequestId_idx" ON "app_quikhrms"."LeaveApproval"("orgId", "leaveRequestId");

CREATE INDEX IF NOT EXISTS "LeaveApproval_orgId_approverId_idx" ON "app_quikhrms"."LeaveApproval"("orgId", "approverId");

CREATE INDEX IF NOT EXISTS "LeaveBalance_orgId_idx" ON "app_quikhrms"."LeaveBalance"("orgId");

CREATE INDEX IF NOT EXISTS "LeaveBalance_orgId_employeeId_idx" ON "app_quikhrms"."LeaveBalance"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "LeaveBalance_orgId_employeeId_year_idx" ON "app_quikhrms"."LeaveBalance"("orgId", "employeeId", "year");

CREATE UNIQUE INDEX IF NOT EXISTS "LeaveBalance_orgId_employeeId_leaveTypeId_year_key" ON "app_quikhrms"."LeaveBalance"("orgId", "employeeId", "leaveTypeId", "year");

CREATE INDEX IF NOT EXISTS "LeavePolicy_orgId_idx" ON "app_quikhrms"."LeavePolicy"("orgId");

CREATE INDEX IF NOT EXISTS "LeavePolicy_orgId_deletedAt_idx" ON "app_quikhrms"."LeavePolicy"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "LeavePolicy_orgId_status_idx" ON "app_quikhrms"."LeavePolicy"("orgId", "status");

CREATE INDEX IF NOT EXISTS "LeavePolicy_orgId_status_effectiveFrom_idx" ON "app_quikhrms"."LeavePolicy"("orgId", "status", "effectiveFrom");

CREATE INDEX IF NOT EXISTS "ExpenseClaim_orgId_idx" ON "app_quikhrms"."ExpenseClaim"("orgId");

CREATE INDEX IF NOT EXISTS "ExpenseClaim_orgId_deletedAt_idx" ON "app_quikhrms"."ExpenseClaim"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "ExpenseClaim_orgId_employeeId_idx" ON "app_quikhrms"."ExpenseClaim"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "ExpenseClaim_orgId_status_idx" ON "app_quikhrms"."ExpenseClaim"("orgId", "status");

CREATE INDEX IF NOT EXISTS "ExpensePolicy_orgId_idx" ON "app_quikhrms"."ExpensePolicy"("orgId");

CREATE INDEX IF NOT EXISTS "ExpensePolicy_orgId_deletedAt_idx" ON "app_quikhrms"."ExpensePolicy"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "ExpensePolicy_orgId_isActive_idx" ON "app_quikhrms"."ExpensePolicy"("orgId", "isActive");

CREATE INDEX IF NOT EXISTS "ExpenseApproval_orgId_idx" ON "app_quikhrms"."ExpenseApproval"("orgId");

CREATE INDEX IF NOT EXISTS "ExpenseApproval_orgId_claimId_idx" ON "app_quikhrms"."ExpenseApproval"("orgId", "claimId");

CREATE INDEX IF NOT EXISTS "ExpenseApproval_orgId_approverId_idx" ON "app_quikhrms"."ExpenseApproval"("orgId", "approverId");

CREATE INDEX IF NOT EXISTS "Goal_orgId_idx" ON "app_quikhrms"."Goal"("orgId");

CREATE INDEX IF NOT EXISTS "Goal_orgId_deletedAt_idx" ON "app_quikhrms"."Goal"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Goal_orgId_employeeId_idx" ON "app_quikhrms"."Goal"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "Goal_orgId_status_idx" ON "app_quikhrms"."Goal"("orgId", "status");

CREATE INDEX IF NOT EXISTS "AppraisalCycle_orgId_idx" ON "app_quikhrms"."AppraisalCycle"("orgId");

CREATE INDEX IF NOT EXISTS "AppraisalCycle_orgId_deletedAt_idx" ON "app_quikhrms"."AppraisalCycle"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "ReviewForm_orgId_idx" ON "app_quikhrms"."ReviewForm"("orgId");

CREATE INDEX IF NOT EXISTS "ReviewForm_orgId_deletedAt_idx" ON "app_quikhrms"."ReviewForm"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "EmployeeAppraisal_orgId_idx" ON "app_quikhrms"."EmployeeAppraisal"("orgId");

CREATE INDEX IF NOT EXISTS "EmployeeAppraisal_orgId_deletedAt_idx" ON "app_quikhrms"."EmployeeAppraisal"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "EmployeeAppraisal_orgId_cycleId_idx" ON "app_quikhrms"."EmployeeAppraisal"("orgId", "cycleId");

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeAppraisal_orgId_employeeId_cycleId_key" ON "app_quikhrms"."EmployeeAppraisal"("orgId", "employeeId", "cycleId");

CREATE INDEX IF NOT EXISTS "ContinuousFeedback_orgId_idx" ON "app_quikhrms"."ContinuousFeedback"("orgId");

CREATE INDEX IF NOT EXISTS "ContinuousFeedback_orgId_toEmployeeId_idx" ON "app_quikhrms"."ContinuousFeedback"("orgId", "toEmployeeId");

CREATE INDEX IF NOT EXISTS "ContinuousFeedback_orgId_fromEmployeeId_idx" ON "app_quikhrms"."ContinuousFeedback"("orgId", "fromEmployeeId");

CREATE INDEX IF NOT EXISTS "ContinuousFeedback_orgId_approvalStatus_idx" ON "app_quikhrms"."ContinuousFeedback"("orgId", "approvalStatus");

CREATE INDEX IF NOT EXISTS "PIP_orgId_idx" ON "app_quikhrms"."PIP"("orgId");

CREATE INDEX IF NOT EXISTS "PIP_orgId_deletedAt_idx" ON "app_quikhrms"."PIP"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "PIP_orgId_employeeId_idx" ON "app_quikhrms"."PIP"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "JobRequisition_orgId_idx" ON "app_quikhrms"."JobRequisition"("orgId");

CREATE INDEX IF NOT EXISTS "JobRequisition_orgId_deletedAt_idx" ON "app_quikhrms"."JobRequisition"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "JobRequisition_orgId_status_idx" ON "app_quikhrms"."JobRequisition"("orgId", "status");

CREATE INDEX IF NOT EXISTS "JobRequisition_orgId_pipelineId_idx" ON "app_quikhrms"."JobRequisition"("orgId", "pipelineId");

CREATE UNIQUE INDEX IF NOT EXISTS "JobRequisition_orgId_requisitionNumber_key" ON "app_quikhrms"."JobRequisition"("orgId", "requisitionNumber");

CREATE INDEX IF NOT EXISTS "Candidate_orgId_idx" ON "app_quikhrms"."Candidate"("orgId");

CREATE INDEX IF NOT EXISTS "Candidate_orgId_deletedAt_idx" ON "app_quikhrms"."Candidate"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Candidate_orgId_status_idx" ON "app_quikhrms"."Candidate"("orgId", "status");

CREATE INDEX IF NOT EXISTS "Candidate_orgId_isBlacklisted_idx" ON "app_quikhrms"."Candidate"("orgId", "isBlacklisted");

CREATE INDEX IF NOT EXISTS "Candidate_orgId_isArchived_idx" ON "app_quikhrms"."Candidate"("orgId", "isArchived");

CREATE INDEX IF NOT EXISTS "Candidate_orgId_deletedAt_isBlacklisted_isArchived_status_idx" ON "app_quikhrms"."Candidate"("orgId", "deletedAt", "isBlacklisted", "isArchived", "status");

CREATE INDEX IF NOT EXISTS "Candidate_orgId_createdAt_idx" ON "app_quikhrms"."Candidate"("orgId", "createdAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "Candidate_orgId_email_key" ON "app_quikhrms"."Candidate"("orgId", "email");

CREATE INDEX IF NOT EXISTS "HiringPipeline_orgId_idx" ON "app_quikhrms"."HiringPipeline"("orgId");

CREATE INDEX IF NOT EXISTS "HiringPipeline_orgId_deletedAt_idx" ON "app_quikhrms"."HiringPipeline"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "JobApplication_orgId_idx" ON "app_quikhrms"."JobApplication"("orgId");

CREATE INDEX IF NOT EXISTS "JobApplication_orgId_deletedAt_idx" ON "app_quikhrms"."JobApplication"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "JobApplication_orgId_requisitionId_idx" ON "app_quikhrms"."JobApplication"("orgId", "requisitionId");

CREATE INDEX IF NOT EXISTS "JobApplication_orgId_status_idx" ON "app_quikhrms"."JobApplication"("orgId", "status");

CREATE INDEX IF NOT EXISTS "JobApplication_orgId_candidateId_status_idx" ON "app_quikhrms"."JobApplication"("orgId", "candidateId", "status");

CREATE INDEX IF NOT EXISTS "JobApplication_orgId_requisitionId_currentStage_idx" ON "app_quikhrms"."JobApplication"("orgId", "requisitionId", "currentStage");

CREATE INDEX IF NOT EXISTS "JobApplication_orgId_requisitionId_status_createdAt_idx" ON "app_quikhrms"."JobApplication"("orgId", "requisitionId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "JobApplication_orgId_offerStatus_idx" ON "app_quikhrms"."JobApplication"("orgId", "offerStatus");

CREATE UNIQUE INDEX IF NOT EXISTS "JobApplication_orgId_candidateId_requisitionId_key" ON "app_quikhrms"."JobApplication"("orgId", "candidateId", "requisitionId");

CREATE UNIQUE INDEX IF NOT EXISTS "Interview_feedbackToken_key" ON "app_quikhrms"."Interview"("feedbackToken");

CREATE INDEX IF NOT EXISTS "Interview_orgId_idx" ON "app_quikhrms"."Interview"("orgId");

CREATE INDEX IF NOT EXISTS "Interview_orgId_deletedAt_idx" ON "app_quikhrms"."Interview"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Interview_orgId_applicationId_idx" ON "app_quikhrms"."Interview"("orgId", "applicationId");

CREATE INDEX IF NOT EXISTS "SocialPost_orgId_idx" ON "app_quikhrms"."SocialPost"("orgId");

CREATE INDEX IF NOT EXISTS "SocialPost_orgId_deletedAt_idx" ON "app_quikhrms"."SocialPost"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "SocialPost_orgId_type_idx" ON "app_quikhrms"."SocialPost"("orgId", "type");

CREATE INDEX IF NOT EXISTS "SocialPost_orgId_approvalStatus_idx" ON "app_quikhrms"."SocialPost"("orgId", "approvalStatus");

CREATE INDEX IF NOT EXISTS "PostComment_orgId_postId_idx" ON "app_quikhrms"."PostComment"("orgId", "postId");

CREATE INDEX IF NOT EXISTS "Announcement_orgId_idx" ON "app_quikhrms"."Announcement"("orgId");

CREATE INDEX IF NOT EXISTS "Announcement_orgId_deletedAt_idx" ON "app_quikhrms"."Announcement"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Announcement_orgId_approvalStatus_idx" ON "app_quikhrms"."Announcement"("orgId", "approvalStatus");

CREATE INDEX IF NOT EXISTS "Survey_orgId_idx" ON "app_quikhrms"."Survey"("orgId");

CREATE INDEX IF NOT EXISTS "Survey_orgId_deletedAt_idx" ON "app_quikhrms"."Survey"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Survey_orgId_status_idx" ON "app_quikhrms"."Survey"("orgId", "status");

CREATE INDEX IF NOT EXISTS "SurveyResponse_orgId_surveyId_idx" ON "app_quikhrms"."SurveyResponse"("orgId", "surveyId");

CREATE INDEX IF NOT EXISTS "Recognition_orgId_idx" ON "app_quikhrms"."Recognition"("orgId");

CREATE INDEX IF NOT EXISTS "Recognition_orgId_toEmployeeId_idx" ON "app_quikhrms"."Recognition"("orgId", "toEmployeeId");

CREATE INDEX IF NOT EXISTS "Recognition_orgId_approvalStatus_idx" ON "app_quikhrms"."Recognition"("orgId", "approvalStatus");

CREATE INDEX IF NOT EXISTS "AuditLog_orgId_idx" ON "app_quikhrms"."AuditLog"("orgId");

CREATE INDEX IF NOT EXISTS "AuditLog_orgId_entityType_idx" ON "app_quikhrms"."AuditLog"("orgId", "entityType");

CREATE INDEX IF NOT EXISTS "AuditLog_orgId_userId_idx" ON "app_quikhrms"."AuditLog"("orgId", "userId");

CREATE INDEX IF NOT EXISTS "AuditLog_orgId_createdAt_idx" ON "app_quikhrms"."AuditLog"("orgId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_orgId_entityType_entityId_idx" ON "app_quikhrms"."AuditLog"("orgId", "entityType", "entityId");

CREATE INDEX IF NOT EXISTS "Notification_orgId_employeeId_idx" ON "app_quikhrms"."Notification"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "Notification_orgId_employeeId_isRead_idx" ON "app_quikhrms"."Notification"("orgId", "employeeId", "isRead");

CREATE INDEX IF NOT EXISTS "Notification_orgId_employeeId_isRead_createdAt_idx" ON "app_quikhrms"."Notification"("orgId", "employeeId", "isRead", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Notification_orgId_employeeId_createdAt_idx" ON "app_quikhrms"."Notification"("orgId", "employeeId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Notification_orgId_entityType_entityId_idx" ON "app_quikhrms"."Notification"("orgId", "entityType", "entityId");

CREATE INDEX IF NOT EXISTS "DataImport_orgId_idx" ON "app_quikhrms"."DataImport"("orgId");

CREATE INDEX IF NOT EXISTS "DataImport_orgId_status_idx" ON "app_quikhrms"."DataImport"("orgId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "CompanySettings_orgId_key" ON "app_quikhrms"."CompanySettings"("orgId");

CREATE INDEX IF NOT EXISTS "CompanySettings_orgId_idx" ON "app_quikhrms"."CompanySettings"("orgId");

CREATE INDEX IF NOT EXISTS "CompanyHoliday_orgId_idx" ON "app_quikhrms"."CompanyHoliday"("orgId");

CREATE INDEX IF NOT EXISTS "CompanyHoliday_orgId_deletedAt_idx" ON "app_quikhrms"."CompanyHoliday"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CompanyHoliday_orgId_year_idx" ON "app_quikhrms"."CompanyHoliday"("orgId", "year");

CREATE INDEX IF NOT EXISTS "CompanyHoliday_orgId_date_idx" ON "app_quikhrms"."CompanyHoliday"("orgId", "date");

CREATE INDEX IF NOT EXISTS "ApprovalChain_orgId_idx" ON "app_quikhrms"."ApprovalChain"("orgId");

CREATE INDEX IF NOT EXISTS "ApprovalChain_orgId_deletedAt_idx" ON "app_quikhrms"."ApprovalChain"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "ApprovalChain_orgId_module_idx" ON "app_quikhrms"."ApprovalChain"("orgId", "module");

CREATE INDEX IF NOT EXISTS "Document_orgId_idx" ON "app_quikhrms"."Document"("orgId");

CREATE INDEX IF NOT EXISTS "Document_orgId_deletedAt_idx" ON "app_quikhrms"."Document"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Document_orgId_employeeId_idx" ON "app_quikhrms"."Document"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "Document_orgId_category_idx" ON "app_quikhrms"."Document"("orgId", "category");

CREATE INDEX IF NOT EXISTS "Document_orgId_status_idx" ON "app_quikhrms"."Document"("orgId", "status");

CREATE INDEX IF NOT EXISTS "Document_orgId_expiryDate_idx" ON "app_quikhrms"."Document"("orgId", "expiryDate");

CREATE INDEX IF NOT EXISTS "DocumentAcknowledgment_orgId_documentId_idx" ON "app_quikhrms"."DocumentAcknowledgment"("orgId", "documentId");

CREATE INDEX IF NOT EXISTS "DocumentAcknowledgment_orgId_employeeId_idx" ON "app_quikhrms"."DocumentAcknowledgment"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "DocumentAcknowledgment_orgId_status_idx" ON "app_quikhrms"."DocumentAcknowledgment"("orgId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentAcknowledgment_orgId_documentId_employeeId_key" ON "app_quikhrms"."DocumentAcknowledgment"("orgId", "documentId", "employeeId");

CREATE INDEX IF NOT EXISTS "DocumentShare_orgId_documentId_idx" ON "app_quikhrms"."DocumentShare"("orgId", "documentId");

CREATE INDEX IF NOT EXISTS "DocumentShare_orgId_sharedWith_idx" ON "app_quikhrms"."DocumentShare"("orgId", "sharedWith");

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentShare_orgId_documentId_sharedWith_key" ON "app_quikhrms"."DocumentShare"("orgId", "documentId", "sharedWith");

CREATE INDEX IF NOT EXISTS "OnboardingTemplate_orgId_idx" ON "app_quikhrms"."OnboardingTemplate"("orgId");

CREATE INDEX IF NOT EXISTS "OnboardingTemplate_orgId_deletedAt_idx" ON "app_quikhrms"."OnboardingTemplate"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "OnboardingTemplate_orgId_departmentId_idx" ON "app_quikhrms"."OnboardingTemplate"("orgId", "departmentId");

CREATE INDEX IF NOT EXISTS "OnboardingInstance_orgId_idx" ON "app_quikhrms"."OnboardingInstance"("orgId");

CREATE INDEX IF NOT EXISTS "OnboardingInstance_orgId_deletedAt_idx" ON "app_quikhrms"."OnboardingInstance"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "OnboardingInstance_orgId_status_idx" ON "app_quikhrms"."OnboardingInstance"("orgId", "status");

CREATE INDEX IF NOT EXISTS "OnboardingInstance_orgId_employeeId_idx" ON "app_quikhrms"."OnboardingInstance"("orgId", "employeeId");

CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingInstance_orgId_employeeId_key" ON "app_quikhrms"."OnboardingInstance"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "OnboardingTask_orgId_idx" ON "app_quikhrms"."OnboardingTask"("orgId");

CREATE INDEX IF NOT EXISTS "OnboardingTask_orgId_instanceId_idx" ON "app_quikhrms"."OnboardingTask"("orgId", "instanceId");

CREATE INDEX IF NOT EXISTS "OnboardingTask_orgId_assigneeId_idx" ON "app_quikhrms"."OnboardingTask"("orgId", "assigneeId");

CREATE INDEX IF NOT EXISTS "OnboardingTask_orgId_status_idx" ON "app_quikhrms"."OnboardingTask"("orgId", "status");

CREATE INDEX IF NOT EXISTS "ProvisionItem_orgId_idx" ON "app_quikhrms"."ProvisionItem"("orgId");

CREATE INDEX IF NOT EXISTS "ProvisionItem_orgId_deletedAt_idx" ON "app_quikhrms"."ProvisionItem"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "ProvisionItem_orgId_category_idx" ON "app_quikhrms"."ProvisionItem"("orgId", "category");

CREATE UNIQUE INDEX IF NOT EXISTS "ProvisionItem_orgId_name_key" ON "app_quikhrms"."ProvisionItem"("orgId", "name");

CREATE INDEX IF NOT EXISTS "EmployeeProvision_orgId_idx" ON "app_quikhrms"."EmployeeProvision"("orgId");

CREATE INDEX IF NOT EXISTS "EmployeeProvision_orgId_employeeId_idx" ON "app_quikhrms"."EmployeeProvision"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "EmployeeProvision_orgId_status_idx" ON "app_quikhrms"."EmployeeProvision"("orgId", "status");

CREATE INDEX IF NOT EXISTS "EmployeeProvision_orgId_assignedTo_idx" ON "app_quikhrms"."EmployeeProvision"("orgId", "assignedTo");

CREATE INDEX IF NOT EXISTS "OffboardingInstance_orgId_idx" ON "app_quikhrms"."OffboardingInstance"("orgId");

CREATE INDEX IF NOT EXISTS "OffboardingInstance_orgId_deletedAt_idx" ON "app_quikhrms"."OffboardingInstance"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "OffboardingInstance_orgId_status_idx" ON "app_quikhrms"."OffboardingInstance"("orgId", "status");

CREATE INDEX IF NOT EXISTS "OffboardingInstance_orgId_employeeId_idx" ON "app_quikhrms"."OffboardingInstance"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "OffboardingInstance_orgId_resignationApprovalStatus_idx" ON "app_quikhrms"."OffboardingInstance"("orgId", "resignationApprovalStatus");

CREATE INDEX IF NOT EXISTS "OffboardingInstance_orgId_resignationApproverId_idx" ON "app_quikhrms"."OffboardingInstance"("orgId", "resignationApproverId");

CREATE UNIQUE INDEX IF NOT EXISTS "OffboardingInstance_orgId_employeeId_key" ON "app_quikhrms"."OffboardingInstance"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "OffboardingTask_orgId_idx" ON "app_quikhrms"."OffboardingTask"("orgId");

CREATE INDEX IF NOT EXISTS "OffboardingTask_orgId_instanceId_idx" ON "app_quikhrms"."OffboardingTask"("orgId", "instanceId");

CREATE INDEX IF NOT EXISTS "OffboardingTask_orgId_assigneeId_idx" ON "app_quikhrms"."OffboardingTask"("orgId", "assigneeId");

CREATE INDEX IF NOT EXISTS "OffboardingTask_orgId_status_idx" ON "app_quikhrms"."OffboardingTask"("orgId", "status");

CREATE INDEX IF NOT EXISTS "OffboardingTask_orgId_department_idx" ON "app_quikhrms"."OffboardingTask"("orgId", "department");

CREATE INDEX IF NOT EXISTS "Asset_orgId_idx" ON "app_quikhrms"."Asset"("orgId");

CREATE INDEX IF NOT EXISTS "Asset_orgId_deletedAt_idx" ON "app_quikhrms"."Asset"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Asset_orgId_status_idx" ON "app_quikhrms"."Asset"("orgId", "status");

CREATE INDEX IF NOT EXISTS "Asset_orgId_category_idx" ON "app_quikhrms"."Asset"("orgId", "category");

CREATE INDEX IF NOT EXISTS "Asset_orgId_serialNumber_idx" ON "app_quikhrms"."Asset"("orgId", "serialNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "Asset_orgId_assetCode_key" ON "app_quikhrms"."Asset"("orgId", "assetCode");

CREATE INDEX IF NOT EXISTS "AssetAssignment_orgId_idx" ON "app_quikhrms"."AssetAssignment"("orgId");

CREATE INDEX IF NOT EXISTS "AssetAssignment_orgId_deletedAt_idx" ON "app_quikhrms"."AssetAssignment"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "AssetAssignment_orgId_assetId_idx" ON "app_quikhrms"."AssetAssignment"("orgId", "assetId");

CREATE INDEX IF NOT EXISTS "AssetAssignment_orgId_employeeId_idx" ON "app_quikhrms"."AssetAssignment"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "AssetAssignment_orgId_status_idx" ON "app_quikhrms"."AssetAssignment"("orgId", "status");

CREATE INDEX IF NOT EXISTS "AssetScrap_orgId_idx" ON "app_quikhrms"."AssetScrap"("orgId");

CREATE INDEX IF NOT EXISTS "AssetScrap_orgId_assetId_idx" ON "app_quikhrms"."AssetScrap"("orgId", "assetId");

CREATE INDEX IF NOT EXISTS "AssetScrap_orgId_scrapDate_idx" ON "app_quikhrms"."AssetScrap"("orgId", "scrapDate");

CREATE INDEX IF NOT EXISTS "Report_orgId_idx" ON "app_quikhrms"."Report"("orgId");

CREATE INDEX IF NOT EXISTS "Report_orgId_deletedAt_idx" ON "app_quikhrms"."Report"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Report_orgId_status_idx" ON "app_quikhrms"."Report"("orgId", "status");

CREATE INDEX IF NOT EXISTS "Report_orgId_type_idx" ON "app_quikhrms"."Report"("orgId", "type");

CREATE INDEX IF NOT EXISTS "Dashboard_orgId_idx" ON "app_quikhrms"."Dashboard"("orgId");

CREATE INDEX IF NOT EXISTS "Dashboard_orgId_deletedAt_idx" ON "app_quikhrms"."Dashboard"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Dashboard_orgId_createdBy_idx" ON "app_quikhrms"."Dashboard"("orgId", "createdBy");

CREATE INDEX IF NOT EXISTS "TimeProject_orgId_idx" ON "app_quikhrms"."TimeProject"("orgId");

CREATE INDEX IF NOT EXISTS "TimeProject_orgId_deletedAt_idx" ON "app_quikhrms"."TimeProject"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "TimeProject_orgId_status_idx" ON "app_quikhrms"."TimeProject"("orgId", "status");

CREATE INDEX IF NOT EXISTS "TimeProject_orgId_departmentId_idx" ON "app_quikhrms"."TimeProject"("orgId", "departmentId");

CREATE UNIQUE INDEX IF NOT EXISTS "TimeProject_orgId_code_key" ON "app_quikhrms"."TimeProject"("orgId", "code");

CREATE INDEX IF NOT EXISTS "TimeJob_orgId_idx" ON "app_quikhrms"."TimeJob"("orgId");

CREATE INDEX IF NOT EXISTS "TimeJob_orgId_deletedAt_idx" ON "app_quikhrms"."TimeJob"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "TimeJob_orgId_projectId_idx" ON "app_quikhrms"."TimeJob"("orgId", "projectId");

CREATE INDEX IF NOT EXISTS "TimeJob_orgId_assigneeId_idx" ON "app_quikhrms"."TimeJob"("orgId", "assigneeId");

CREATE INDEX IF NOT EXISTS "JobScheduleEntry_orgId_idx" ON "app_quikhrms"."JobScheduleEntry"("orgId");

CREATE INDEX IF NOT EXISTS "JobScheduleEntry_orgId_deletedAt_idx" ON "app_quikhrms"."JobScheduleEntry"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "JobScheduleEntry_orgId_employeeId_date_idx" ON "app_quikhrms"."JobScheduleEntry"("orgId", "employeeId", "date");

CREATE INDEX IF NOT EXISTS "JobScheduleEntry_orgId_status_idx" ON "app_quikhrms"."JobScheduleEntry"("orgId", "status");

CREATE INDEX IF NOT EXISTS "TimeLog_orgId_idx" ON "app_quikhrms"."TimeLog"("orgId");

CREATE INDEX IF NOT EXISTS "TimeLog_orgId_deletedAt_idx" ON "app_quikhrms"."TimeLog"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "TimeLog_orgId_employeeId_date_idx" ON "app_quikhrms"."TimeLog"("orgId", "employeeId", "date");

CREATE INDEX IF NOT EXISTS "TimeLog_orgId_timesheetId_idx" ON "app_quikhrms"."TimeLog"("orgId", "timesheetId");

CREATE INDEX IF NOT EXISTS "TimeLog_orgId_status_idx" ON "app_quikhrms"."TimeLog"("orgId", "status");

CREATE INDEX IF NOT EXISTS "Timesheet_orgId_idx" ON "app_quikhrms"."Timesheet"("orgId");

CREATE INDEX IF NOT EXISTS "Timesheet_orgId_deletedAt_idx" ON "app_quikhrms"."Timesheet"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Timesheet_orgId_employeeId_idx" ON "app_quikhrms"."Timesheet"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "Timesheet_orgId_status_idx" ON "app_quikhrms"."Timesheet"("orgId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "Timesheet_orgId_employeeId_periodStart_periodEnd_key" ON "app_quikhrms"."Timesheet"("orgId", "employeeId", "periodStart", "periodEnd");

CREATE INDEX IF NOT EXISTS "Delegation_orgId_idx" ON "app_quikhrms"."Delegation"("orgId");

CREATE INDEX IF NOT EXISTS "Delegation_orgId_deletedAt_idx" ON "app_quikhrms"."Delegation"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Delegation_orgId_delegatorId_idx" ON "app_quikhrms"."Delegation"("orgId", "delegatorId");

CREATE INDEX IF NOT EXISTS "Delegation_orgId_delegateeId_idx" ON "app_quikhrms"."Delegation"("orgId", "delegateeId");

CREATE INDEX IF NOT EXISTS "Delegation_orgId_isActive_idx" ON "app_quikhrms"."Delegation"("orgId", "isActive");

CREATE INDEX IF NOT EXISTS "EmploymentHistory_orgId_idx" ON "app_quikhrms"."EmploymentHistory"("orgId");

CREATE INDEX IF NOT EXISTS "EmploymentHistory_orgId_employeeId_idx" ON "app_quikhrms"."EmploymentHistory"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "EmploymentHistory_orgId_changeType_idx" ON "app_quikhrms"."EmploymentHistory"("orgId", "changeType");

CREATE INDEX IF NOT EXISTS "EmploymentHistory_orgId_effectiveDate_idx" ON "app_quikhrms"."EmploymentHistory"("orgId", "effectiveDate");

CREATE INDEX IF NOT EXISTS "ESignRequest_orgId_idx" ON "app_quikhrms"."ESignRequest"("orgId");

CREATE INDEX IF NOT EXISTS "ESignRequest_orgId_deletedAt_idx" ON "app_quikhrms"."ESignRequest"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "ESignRequest_orgId_documentId_idx" ON "app_quikhrms"."ESignRequest"("orgId", "documentId");

CREATE INDEX IF NOT EXISTS "ESignRequest_orgId_status_idx" ON "app_quikhrms"."ESignRequest"("orgId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "CandidatePortalAccess_accessToken_key" ON "app_quikhrms"."CandidatePortalAccess"("accessToken");

CREATE INDEX IF NOT EXISTS "CandidatePortalAccess_orgId_idx" ON "app_quikhrms"."CandidatePortalAccess"("orgId");

CREATE INDEX IF NOT EXISTS "CandidatePortalAccess_orgId_deletedAt_idx" ON "app_quikhrms"."CandidatePortalAccess"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CandidatePortalAccess_orgId_candidateId_idx" ON "app_quikhrms"."CandidatePortalAccess"("orgId", "candidateId");

CREATE UNIQUE INDEX IF NOT EXISTS "CandidatePortalAccess_orgId_candidateId_key" ON "app_quikhrms"."CandidatePortalAccess"("orgId", "candidateId");

CREATE INDEX IF NOT EXISTS "AppRole_orgId_appId_idx" ON "app_quikhrms"."AppRole"("orgId", "appId");

CREATE UNIQUE INDEX IF NOT EXISTS "AppRole_orgId_appId_name_key" ON "app_quikhrms"."AppRole"("orgId", "appId", "name");

CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx" ON "app_quikhrms"."RolePermission"("roleId");

CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_resource_action_key" ON "app_quikhrms"."RolePermission"("roleId", "resource", "action");

CREATE INDEX IF NOT EXISTS "RoleNavigation_roleId_idx" ON "app_quikhrms"."RoleNavigation"("roleId");

CREATE UNIQUE INDEX IF NOT EXISTS "RoleNavigation_roleId_navKey_key" ON "app_quikhrms"."RoleNavigation"("roleId", "navKey");

CREATE INDEX IF NOT EXISTS "UserAppRole_roleId_idx" ON "app_quikhrms"."UserAppRole"("roleId");

CREATE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_idx" ON "app_quikhrms"."UserAppRole"("userId", "orgId");

CREATE INDEX IF NOT EXISTS "UserAppRole_expiresAt_idx" ON "app_quikhrms"."UserAppRole"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_roleId_key" ON "app_quikhrms"."UserAppRole"("userId", "orgId", "roleId");

CREATE INDEX IF NOT EXISTS "UserPermissionExtra_userId_orgId_idx" ON "app_quikhrms"."UserPermissionExtra"("userId", "orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "UserPermissionExtra_orgId_userId_resource_action_key" ON "app_quikhrms"."UserPermissionExtra"("orgId", "userId", "resource", "action");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollSettings_orgId_key" ON "app_quikhrms"."PayrollSettings"("orgId");

CREATE INDEX IF NOT EXISTS "PayrollSettings_orgId_idx" ON "app_quikhrms"."PayrollSettings"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollTaxDetails_orgId_key" ON "app_quikhrms"."PayrollTaxDetails"("orgId");

CREATE INDEX IF NOT EXISTS "PayrollTaxDetails_orgId_idx" ON "app_quikhrms"."PayrollTaxDetails"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "PaySchedule_orgId_key" ON "app_quikhrms"."PaySchedule"("orgId");

CREATE INDEX IF NOT EXISTS "PaySchedule_orgId_idx" ON "app_quikhrms"."PaySchedule"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "EPFConfig_orgId_key" ON "app_quikhrms"."EPFConfig"("orgId");

CREATE INDEX IF NOT EXISTS "EPFConfig_orgId_idx" ON "app_quikhrms"."EPFConfig"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "ESIConfig_orgId_key" ON "app_quikhrms"."ESIConfig"("orgId");

CREATE INDEX IF NOT EXISTS "ESIConfig_orgId_idx" ON "app_quikhrms"."ESIConfig"("orgId");

CREATE INDEX IF NOT EXISTS "ProfessionalTaxConfig_orgId_idx" ON "app_quikhrms"."ProfessionalTaxConfig"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "ProfessionalTaxConfig_orgId_state_locationId_key" ON "app_quikhrms"."ProfessionalTaxConfig"("orgId", "state", "locationId");

CREATE INDEX IF NOT EXISTS "LWFConfig_orgId_idx" ON "app_quikhrms"."LWFConfig"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "LWFConfig_orgId_state_key" ON "app_quikhrms"."LWFConfig"("orgId", "state");

CREATE UNIQUE INDEX IF NOT EXISTS "StatutoryBonusConfig_orgId_key" ON "app_quikhrms"."StatutoryBonusConfig"("orgId");

CREATE INDEX IF NOT EXISTS "StatutoryBonusConfig_orgId_idx" ON "app_quikhrms"."StatutoryBonusConfig"("orgId");

CREATE INDEX IF NOT EXISTS "StateMinimumWage_orgId_idx" ON "app_quikhrms"."StateMinimumWage"("orgId");

CREATE INDEX IF NOT EXISTS "StateMinimumWage_orgId_state_effectiveFrom_idx" ON "app_quikhrms"."StateMinimumWage"("orgId", "state", "effectiveFrom");

CREATE UNIQUE INDEX IF NOT EXISTS "StateMinimumWage_orgId_state_scheduledEmployment_skillLevel_key" ON "app_quikhrms"."StateMinimumWage"("orgId", "state", "scheduledEmployment", "skillLevel", "zone", "effectiveFrom");

CREATE INDEX IF NOT EXISTS "SalaryComponent_orgId_idx" ON "app_quikhrms"."SalaryComponent"("orgId");

CREATE INDEX IF NOT EXISTS "SalaryComponent_orgId_deletedAt_idx" ON "app_quikhrms"."SalaryComponent"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "SalaryComponent_orgId_code_key" ON "app_quikhrms"."SalaryComponent"("orgId", "code");

CREATE INDEX IF NOT EXISTS "SalaryStructure_orgId_idx" ON "app_quikhrms"."SalaryStructure"("orgId");

CREATE INDEX IF NOT EXISTS "SalaryStructure_orgId_deletedAt_idx" ON "app_quikhrms"."SalaryStructure"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "SalaryStructure_orgId_code_key" ON "app_quikhrms"."SalaryStructure"("orgId", "code");

CREATE INDEX IF NOT EXISTS "SalaryStructureComponent_orgId_idx" ON "app_quikhrms"."SalaryStructureComponent"("orgId");

CREATE INDEX IF NOT EXISTS "SalaryStructureComponent_structureId_idx" ON "app_quikhrms"."SalaryStructureComponent"("structureId");

CREATE UNIQUE INDEX IF NOT EXISTS "SalaryStructureComponent_structureId_componentId_key" ON "app_quikhrms"."SalaryStructureComponent"("structureId", "componentId");

CREATE INDEX IF NOT EXISTS "EmployeeSalary_orgId_idx" ON "app_quikhrms"."EmployeeSalary"("orgId");

CREATE INDEX IF NOT EXISTS "EmployeeSalary_orgId_employeeId_idx" ON "app_quikhrms"."EmployeeSalary"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "EmployeeSalary_orgId_effectiveFrom_idx" ON "app_quikhrms"."EmployeeSalary"("orgId", "effectiveFrom");

CREATE INDEX IF NOT EXISTS "EmployeeSalary_orgId_employeeId_isActive_deletedAt_idx" ON "app_quikhrms"."EmployeeSalary"("orgId", "employeeId", "isActive", "deletedAt");

CREATE INDEX IF NOT EXISTS "EmployeeSalary_orgId_isActive_effectiveFrom_idx" ON "app_quikhrms"."EmployeeSalary"("orgId", "isActive", "effectiveFrom");

CREATE INDEX IF NOT EXISTS "PayRun_orgId_idx" ON "app_quikhrms"."PayRun"("orgId");

CREATE INDEX IF NOT EXISTS "PayRun_orgId_status_idx" ON "app_quikhrms"."PayRun"("orgId", "status");

CREATE INDEX IF NOT EXISTS "PayRun_orgId_payDate_idx" ON "app_quikhrms"."PayRun"("orgId", "payDate");

CREATE UNIQUE INDEX IF NOT EXISTS "PayRun_orgId_periodStart_periodEnd_key" ON "app_quikhrms"."PayRun"("orgId", "periodStart", "periodEnd");

CREATE INDEX IF NOT EXISTS "OneTimeStatutoryDefault_orgId_idx" ON "app_quikhrms"."OneTimeStatutoryDefault"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "OneTimeStatutoryDefault_orgId_kind_key" ON "app_quikhrms"."OneTimeStatutoryDefault"("orgId", "kind");

CREATE INDEX IF NOT EXISTS "TdsOverride_orgId_employeeId_status_idx" ON "app_quikhrms"."TdsOverride"("orgId", "employeeId", "status");

CREATE INDEX IF NOT EXISTS "TdsOverride_orgId_fy_status_idx" ON "app_quikhrms"."TdsOverride"("orgId", "fy", "status");

CREATE INDEX IF NOT EXISTS "TdsOverride_orgId_setOnPayRunId_idx" ON "app_quikhrms"."TdsOverride"("orgId", "setOnPayRunId");

CREATE INDEX IF NOT EXISTS "PayRunAdjustment_orgId_payRunId_idx" ON "app_quikhrms"."PayRunAdjustment"("orgId", "payRunId");

CREATE UNIQUE INDEX IF NOT EXISTS "PayRunAdjustment_payRunId_employeeId_key" ON "app_quikhrms"."PayRunAdjustment"("payRunId", "employeeId");

CREATE INDEX IF NOT EXISTS "Payslip_orgId_idx" ON "app_quikhrms"."Payslip"("orgId");

CREATE INDEX IF NOT EXISTS "Payslip_orgId_employeeId_idx" ON "app_quikhrms"."Payslip"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "Payslip_orgId_employeeId_periodStart_idx" ON "app_quikhrms"."Payslip"("orgId", "employeeId", "periodStart");

CREATE INDEX IF NOT EXISTS "Payslip_orgId_status_periodStart_idx" ON "app_quikhrms"."Payslip"("orgId", "status", "periodStart");

CREATE INDEX IF NOT EXISTS "Payslip_orgId_deletedAt_idx" ON "app_quikhrms"."Payslip"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Payslip_orgId_payRunId_status_idx" ON "app_quikhrms"."Payslip"("orgId", "payRunId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "Payslip_payRunId_employeeId_key" ON "app_quikhrms"."Payslip"("payRunId", "employeeId");

CREATE INDEX IF NOT EXISTS "PayslipLine_orgId_idx" ON "app_quikhrms"."PayslipLine"("orgId");

CREATE INDEX IF NOT EXISTS "PayslipLine_payslipId_idx" ON "app_quikhrms"."PayslipLine"("payslipId");

CREATE UNIQUE INDEX IF NOT EXISTS "PriorPayroll_orgId_key" ON "app_quikhrms"."PriorPayroll"("orgId");

CREATE INDEX IF NOT EXISTS "PriorPayroll_orgId_idx" ON "app_quikhrms"."PriorPayroll"("orgId");

CREATE INDEX IF NOT EXISTS "PriorPayrollRecord_orgId_idx" ON "app_quikhrms"."PriorPayrollRecord"("orgId");

CREATE INDEX IF NOT EXISTS "PriorPayrollRecord_orgId_employeeId_financialYear_idx" ON "app_quikhrms"."PriorPayrollRecord"("orgId", "employeeId", "financialYear");

CREATE INDEX IF NOT EXISTS "PriorPayrollRecord_orgId_employeeId_financialYear_periodEnd_idx" ON "app_quikhrms"."PriorPayrollRecord"("orgId", "employeeId", "financialYear", "periodEnd");

CREATE UNIQUE INDEX IF NOT EXISTS "PriorPayrollRecord_orgId_employeeId_periodStart_key" ON "app_quikhrms"."PriorPayrollRecord"("orgId", "employeeId", "periodStart");

CREATE INDEX IF NOT EXISTS "EmployeeLoan_orgId_idx" ON "app_quikhrms"."EmployeeLoan"("orgId");

CREATE INDEX IF NOT EXISTS "EmployeeLoan_orgId_employeeId_idx" ON "app_quikhrms"."EmployeeLoan"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "EmployeeLoan_orgId_status_idx" ON "app_quikhrms"."EmployeeLoan"("orgId", "status");

CREATE INDEX IF NOT EXISTS "LoanRepayment_orgId_idx" ON "app_quikhrms"."LoanRepayment"("orgId");

CREATE INDEX IF NOT EXISTS "LoanRepayment_loanId_idx" ON "app_quikhrms"."LoanRepayment"("loanId");

CREATE INDEX IF NOT EXISTS "LoanRepayment_orgId_payRunId_idx" ON "app_quikhrms"."LoanRepayment"("orgId", "payRunId");

CREATE INDEX IF NOT EXISTS "Donation_orgId_idx" ON "app_quikhrms"."Donation"("orgId");

CREATE INDEX IF NOT EXISTS "Donation_orgId_employeeId_idx" ON "app_quikhrms"."Donation"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "Donation_orgId_financialYear_idx" ON "app_quikhrms"."Donation"("orgId", "financialYear");

CREATE INDEX IF NOT EXISTS "ReimbursementClaim_orgId_idx" ON "app_quikhrms"."ReimbursementClaim"("orgId");

CREATE INDEX IF NOT EXISTS "ReimbursementClaim_orgId_employeeId_idx" ON "app_quikhrms"."ReimbursementClaim"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "ReimbursementClaim_orgId_status_idx" ON "app_quikhrms"."ReimbursementClaim"("orgId", "status");

CREATE INDEX IF NOT EXISTS "InvestmentProof_orgId_idx" ON "app_quikhrms"."InvestmentProof"("orgId");

CREATE INDEX IF NOT EXISTS "InvestmentProof_orgId_employeeId_idx" ON "app_quikhrms"."InvestmentProof"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "InvestmentProof_orgId_financialYear_idx" ON "app_quikhrms"."InvestmentProof"("orgId", "financialYear");

CREATE INDEX IF NOT EXISTS "InvestmentProof_orgId_status_idx" ON "app_quikhrms"."InvestmentProof"("orgId", "status");

CREATE INDEX IF NOT EXISTS "InvestmentProof_orgId_employeeId_financialYear_status_idx" ON "app_quikhrms"."InvestmentProof"("orgId", "employeeId", "financialYear", "status");

CREATE INDEX IF NOT EXISTS "SalaryRevision_orgId_idx" ON "app_quikhrms"."SalaryRevision"("orgId");

CREATE INDEX IF NOT EXISTS "SalaryRevision_orgId_employeeId_idx" ON "app_quikhrms"."SalaryRevision"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "SalaryRevision_orgId_status_idx" ON "app_quikhrms"."SalaryRevision"("orgId", "status");

CREATE INDEX IF NOT EXISTS "SalaryRevision_orgId_status_effectiveFrom_idx" ON "app_quikhrms"."SalaryRevision"("orgId", "status", "effectiveFrom");

CREATE INDEX IF NOT EXISTS "PayRunApproval_orgId_idx" ON "app_quikhrms"."PayRunApproval"("orgId");

CREATE INDEX IF NOT EXISTS "PayRunApproval_orgId_payRunId_idx" ON "app_quikhrms"."PayRunApproval"("orgId", "payRunId");

CREATE INDEX IF NOT EXISTS "PayRunApproval_orgId_approverId_status_idx" ON "app_quikhrms"."PayRunApproval"("orgId", "approverId", "status");

CREATE INDEX IF NOT EXISTS "TaskList_orgId_idx" ON "app_quikhrms"."TaskList"("orgId");

CREATE INDEX IF NOT EXISTS "TaskList_orgId_isArchived_idx" ON "app_quikhrms"."TaskList"("orgId", "isArchived");

CREATE UNIQUE INDEX IF NOT EXISTS "TaskList_orgId_name_key" ON "app_quikhrms"."TaskList"("orgId", "name");

CREATE INDEX IF NOT EXISTS "Task_orgId_idx" ON "app_quikhrms"."Task"("orgId");

CREATE INDEX IF NOT EXISTS "Task_orgId_assigneeId_status_idx" ON "app_quikhrms"."Task"("orgId", "assigneeId", "status");

CREATE INDEX IF NOT EXISTS "Task_orgId_requesterId_idx" ON "app_quikhrms"."Task"("orgId", "requesterId");

CREATE INDEX IF NOT EXISTS "Task_orgId_taskListId_idx" ON "app_quikhrms"."Task"("orgId", "taskListId");

CREATE INDEX IF NOT EXISTS "Task_orgId_dueDate_idx" ON "app_quikhrms"."Task"("orgId", "dueDate");

CREATE INDEX IF NOT EXISTS "Task_orgId_status_idx" ON "app_quikhrms"."Task"("orgId", "status");

CREATE INDEX IF NOT EXISTS "TaskActivity_orgId_idx" ON "app_quikhrms"."TaskActivity"("orgId");

CREATE INDEX IF NOT EXISTS "TaskActivity_taskId_idx" ON "app_quikhrms"."TaskActivity"("taskId");

CREATE INDEX IF NOT EXISTS "LegalEntity_orgId_idx" ON "app_quikhrms"."LegalEntity"("orgId");

CREATE INDEX IF NOT EXISTS "LegalEntity_orgId_status_idx" ON "app_quikhrms"."LegalEntity"("orgId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "LegalEntity_orgId_code_key" ON "app_quikhrms"."LegalEntity"("orgId", "code");

CREATE INDEX IF NOT EXISTS "FullAndFinalSettlement_orgId_idx" ON "app_quikhrms"."FullAndFinalSettlement"("orgId");

CREATE INDEX IF NOT EXISTS "FullAndFinalSettlement_orgId_status_idx" ON "app_quikhrms"."FullAndFinalSettlement"("orgId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "FullAndFinalSettlement_orgId_employeeId_key" ON "app_quikhrms"."FullAndFinalSettlement"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "GratuityRecord_orgId_idx" ON "app_quikhrms"."GratuityRecord"("orgId");

CREATE INDEX IF NOT EXISTS "GratuityRecord_orgId_employeeId_idx" ON "app_quikhrms"."GratuityRecord"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "Form12BBDeclaration_orgId_idx" ON "app_quikhrms"."Form12BBDeclaration"("orgId");

CREATE INDEX IF NOT EXISTS "Form12BBDeclaration_orgId_financialYear_idx" ON "app_quikhrms"."Form12BBDeclaration"("orgId", "financialYear");

CREATE UNIQUE INDEX IF NOT EXISTS "Form12BBDeclaration_orgId_employeeId_financialYear_key" ON "app_quikhrms"."Form12BBDeclaration"("orgId", "employeeId", "financialYear");

CREATE INDEX IF NOT EXISTS "EmailTemplate_orgId_idx" ON "app_quikhrms"."EmailTemplate"("orgId");

CREATE INDEX IF NOT EXISTS "EmailTemplate_orgId_key_idx" ON "app_quikhrms"."EmailTemplate"("orgId", "key");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_orgId_key_channel_key" ON "app_quikhrms"."EmailTemplate"("orgId", "key", "channel");

CREATE INDEX IF NOT EXISTS "BankReconciliation_orgId_idx" ON "app_quikhrms"."BankReconciliation"("orgId");

CREATE INDEX IF NOT EXISTS "BankReconciliation_orgId_payRunId_idx" ON "app_quikhrms"."BankReconciliation"("orgId", "payRunId");

CREATE INDEX IF NOT EXISTS "BankReconciliationLine_orgId_idx" ON "app_quikhrms"."BankReconciliationLine"("orgId");

CREATE INDEX IF NOT EXISTS "BankReconciliationLine_reconciliationId_idx" ON "app_quikhrms"."BankReconciliationLine"("reconciliationId");

CREATE INDEX IF NOT EXISTS "OneTimeEarning_orgId_idx" ON "app_quikhrms"."OneTimeEarning"("orgId");

CREATE INDEX IF NOT EXISTS "OneTimeEarning_orgId_employeeId_idx" ON "app_quikhrms"."OneTimeEarning"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "OneTimeEarning_orgId_payPeriod_idx" ON "app_quikhrms"."OneTimeEarning"("orgId", "payPeriod");

CREATE INDEX IF NOT EXISTS "OneTimeEarning_orgId_status_idx" ON "app_quikhrms"."OneTimeEarning"("orgId", "status");

CREATE INDEX IF NOT EXISTS "OneTimeEarning_orgId_status_payPeriod_idx" ON "app_quikhrms"."OneTimeEarning"("orgId", "status", "payPeriod");

CREATE UNIQUE INDEX IF NOT EXISTS "ClaimsDeclarationSettings_orgId_key" ON "app_quikhrms"."ClaimsDeclarationSettings"("orgId");

CREATE INDEX IF NOT EXISTS "ClaimsDeclarationSettings_orgId_idx" ON "app_quikhrms"."ClaimsDeclarationSettings"("orgId");

CREATE INDEX IF NOT EXISTS "WfhRequest_orgId_idx" ON "app_quikhrms"."WfhRequest"("orgId");

CREATE INDEX IF NOT EXISTS "WfhRequest_orgId_deletedAt_idx" ON "app_quikhrms"."WfhRequest"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "WfhRequest_orgId_employeeId_idx" ON "app_quikhrms"."WfhRequest"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "WfhRequest_orgId_status_idx" ON "app_quikhrms"."WfhRequest"("orgId", "status");

CREATE INDEX IF NOT EXISTS "WfhRequest_orgId_startDate_endDate_idx" ON "app_quikhrms"."WfhRequest"("orgId", "startDate", "endDate");

CREATE INDEX IF NOT EXISTS "WfhApproval_orgId_idx" ON "app_quikhrms"."WfhApproval"("orgId");

CREATE INDEX IF NOT EXISTS "WfhApproval_orgId_wfhRequestId_idx" ON "app_quikhrms"."WfhApproval"("orgId", "wfhRequestId");

CREATE INDEX IF NOT EXISTS "WfhApproval_orgId_approverId_status_idx" ON "app_quikhrms"."WfhApproval"("orgId", "approverId", "status");

CREATE INDEX IF NOT EXISTS "WfhQuotaGroup_orgId_idx" ON "app_quikhrms"."WfhQuotaGroup"("orgId");

CREATE INDEX IF NOT EXISTS "WfhQuotaGroup_orgId_deletedAt_idx" ON "app_quikhrms"."WfhQuotaGroup"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WfhQuotaGroup_orgId_name_key" ON "app_quikhrms"."WfhQuotaGroup"("orgId", "name");

CREATE INDEX IF NOT EXISTS "CandidateDocumentType_orgId_idx" ON "app_quikhrms"."CandidateDocumentType"("orgId");

CREATE INDEX IF NOT EXISTS "CandidateDocumentType_orgId_bundle_isActive_idx" ON "app_quikhrms"."CandidateDocumentType"("orgId", "bundle", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "CandidateDocumentType_orgId_code_bundle_key" ON "app_quikhrms"."CandidateDocumentType"("orgId", "code", "bundle");

CREATE UNIQUE INDEX IF NOT EXISTS "CandidateDocumentRequest_token_key" ON "app_quikhrms"."CandidateDocumentRequest"("token");

CREATE INDEX IF NOT EXISTS "CandidateDocumentRequest_orgId_idx" ON "app_quikhrms"."CandidateDocumentRequest"("orgId");

CREATE INDEX IF NOT EXISTS "CandidateDocumentRequest_orgId_status_idx" ON "app_quikhrms"."CandidateDocumentRequest"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CandidateDocumentRequest_orgId_applicationId_idx" ON "app_quikhrms"."CandidateDocumentRequest"("orgId", "applicationId");

CREATE UNIQUE INDEX IF NOT EXISTS "CandidateDocumentRequest_orgId_applicationId_bundle_key" ON "app_quikhrms"."CandidateDocumentRequest"("orgId", "applicationId", "bundle");

CREATE INDEX IF NOT EXISTS "CandidateDocumentUpload_orgId_idx" ON "app_quikhrms"."CandidateDocumentUpload"("orgId");

CREATE INDEX IF NOT EXISTS "CandidateDocumentUpload_orgId_requestId_idx" ON "app_quikhrms"."CandidateDocumentUpload"("orgId", "requestId");

CREATE INDEX IF NOT EXISTS "CandidateDocumentUpload_orgId_status_idx" ON "app_quikhrms"."CandidateDocumentUpload"("orgId", "status");

CREATE INDEX IF NOT EXISTS "RequisitionApproval_orgId_idx" ON "app_quikhrms"."RequisitionApproval"("orgId");

CREATE INDEX IF NOT EXISTS "RequisitionApproval_orgId_requisitionId_idx" ON "app_quikhrms"."RequisitionApproval"("orgId", "requisitionId");

CREATE INDEX IF NOT EXISTS "RequisitionApproval_orgId_approverId_status_idx" ON "app_quikhrms"."RequisitionApproval"("orgId", "approverId", "status");

CREATE INDEX IF NOT EXISTS "TicketCategory_orgId_idx" ON "app_quikhrms"."TicketCategory"("orgId");

CREATE INDEX IF NOT EXISTS "TicketCategory_orgId_deletedAt_idx" ON "app_quikhrms"."TicketCategory"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "TicketCategory_orgId_isActive_idx" ON "app_quikhrms"."TicketCategory"("orgId", "isActive");

CREATE INDEX IF NOT EXISTS "TicketCategory_orgId_departmentId_idx" ON "app_quikhrms"."TicketCategory"("orgId", "departmentId");

CREATE UNIQUE INDEX IF NOT EXISTS "TicketCategory_orgId_slug_key" ON "app_quikhrms"."TicketCategory"("orgId", "slug");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_idx" ON "app_quikhrms"."Ticket"("orgId");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_deletedAt_idx" ON "app_quikhrms"."Ticket"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_status_idx" ON "app_quikhrms"."Ticket"("orgId", "status");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_priority_idx" ON "app_quikhrms"."Ticket"("orgId", "priority");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_categoryId_idx" ON "app_quikhrms"."Ticket"("orgId", "categoryId");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_departmentId_idx" ON "app_quikhrms"."Ticket"("orgId", "departmentId");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_raisedById_idx" ON "app_quikhrms"."Ticket"("orgId", "raisedById");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_assignedToId_idx" ON "app_quikhrms"."Ticket"("orgId", "assignedToId");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_slaResolveDueAt_idx" ON "app_quikhrms"."Ticket"("orgId", "slaResolveDueAt");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_slaResponseDueAt_firstResponseAt_idx" ON "app_quikhrms"."Ticket"("orgId", "slaResponseDueAt", "firstResponseAt");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_resolveBreachedAt_idx" ON "app_quikhrms"."Ticket"("orgId", "resolveBreachedAt");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_status_priority_createdAt_idx" ON "app_quikhrms"."Ticket"("orgId", "status", "priority", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Ticket_orgId_assignedToId_status_idx" ON "app_quikhrms"."Ticket"("orgId", "assignedToId", "status");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_raisedById_status_idx" ON "app_quikhrms"."Ticket"("orgId", "raisedById", "status");

CREATE INDEX IF NOT EXISTS "Ticket_orgId_deletedAt_status_createdAt_idx" ON "app_quikhrms"."Ticket"("orgId", "deletedAt", "status", "createdAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_orgId_ticketNo_key" ON "app_quikhrms"."Ticket"("orgId", "ticketNo");

CREATE INDEX IF NOT EXISTS "TicketComment_orgId_idx" ON "app_quikhrms"."TicketComment"("orgId");

CREATE INDEX IF NOT EXISTS "TicketComment_orgId_ticketId_idx" ON "app_quikhrms"."TicketComment"("orgId", "ticketId");

CREATE INDEX IF NOT EXISTS "TicketComment_orgId_deletedAt_idx" ON "app_quikhrms"."TicketComment"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "TicketAttachment_orgId_idx" ON "app_quikhrms"."TicketAttachment"("orgId");

CREATE INDEX IF NOT EXISTS "TicketAttachment_orgId_ticketId_idx" ON "app_quikhrms"."TicketAttachment"("orgId", "ticketId");

CREATE INDEX IF NOT EXISTS "TicketActivity_orgId_idx" ON "app_quikhrms"."TicketActivity"("orgId");

CREATE INDEX IF NOT EXISTS "TicketActivity_orgId_ticketId_idx" ON "app_quikhrms"."TicketActivity"("orgId", "ticketId");

CREATE INDEX IF NOT EXISTS "TicketActivity_orgId_actorId_idx" ON "app_quikhrms"."TicketActivity"("orgId", "actorId");

CREATE INDEX IF NOT EXISTS "KraScorecard_orgId_idx" ON "app_quikhrms"."KraScorecard"("orgId");

CREATE INDEX IF NOT EXISTS "KraScorecard_orgId_deletedAt_idx" ON "app_quikhrms"."KraScorecard"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "KraScorecard_orgId_designationId_idx" ON "app_quikhrms"."KraScorecard"("orgId", "designationId");

CREATE INDEX IF NOT EXISTS "KraScorecard_orgId_departmentId_idx" ON "app_quikhrms"."KraScorecard"("orgId", "departmentId");

CREATE INDEX IF NOT EXISTS "KraTemplateEntry_scorecardId_idx" ON "app_quikhrms"."KraTemplateEntry"("scorecardId");

CREATE INDEX IF NOT EXISTS "EmployeeKraAssignment_orgId_idx" ON "app_quikhrms"."EmployeeKraAssignment"("orgId");

CREATE INDEX IF NOT EXISTS "EmployeeKraAssignment_orgId_employeeId_idx" ON "app_quikhrms"."EmployeeKraAssignment"("orgId", "employeeId");

CREATE INDEX IF NOT EXISTS "EmployeeKraAssignment_orgId_status_idx" ON "app_quikhrms"."EmployeeKraAssignment"("orgId", "status");

CREATE INDEX IF NOT EXISTS "EmployeeKraAssignment_orgId_scorecardId_idx" ON "app_quikhrms"."EmployeeKraAssignment"("orgId", "scorecardId");

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeKraAssignment_employeeId_scorecardId_effectiveFrom_key" ON "app_quikhrms"."EmployeeKraAssignment"("employeeId", "scorecardId", "effectiveFrom");

CREATE INDEX IF NOT EXISTS "TdsLiabilityPeriod_orgId_status_idx" ON "app_quikhrms"."TdsLiabilityPeriod"("orgId", "status");

CREATE INDEX IF NOT EXISTS "TdsLiabilityPeriod_orgId_periodYear_periodMonth_idx" ON "app_quikhrms"."TdsLiabilityPeriod"("orgId", "periodYear", "periodMonth");

CREATE UNIQUE INDEX IF NOT EXISTS "TdsLiabilityPeriod_orgId_periodYear_periodMonth_natureOfPay_key" ON "app_quikhrms"."TdsLiabilityPeriod"("orgId", "periodYear", "periodMonth", "natureOfPayment");

CREATE INDEX IF NOT EXISTS "TdsChallan_orgId_depositDate_idx" ON "app_quikhrms"."TdsChallan"("orgId", "depositDate");

CREATE INDEX IF NOT EXISTS "TdsChallan_orgId_assessmentYear_idx" ON "app_quikhrms"."TdsChallan"("orgId", "assessmentYear");

CREATE INDEX IF NOT EXISTS "TdsChallan_orgId_status_idx" ON "app_quikhrms"."TdsChallan"("orgId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "TdsChallan_orgId_cin_key" ON "app_quikhrms"."TdsChallan"("orgId", "cin");

CREATE INDEX IF NOT EXISTS "TdsChallanAllocation_orgId_challanId_idx" ON "app_quikhrms"."TdsChallanAllocation"("orgId", "challanId");

CREATE INDEX IF NOT EXISTS "TdsChallanAllocation_orgId_liabilityPeriodId_idx" ON "app_quikhrms"."TdsChallanAllocation"("orgId", "liabilityPeriodId");

CREATE UNIQUE INDEX IF NOT EXISTS "TdsChallanAllocation_challanId_liabilityPeriodId_key" ON "app_quikhrms"."TdsChallanAllocation"("challanId", "liabilityPeriodId");

CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "app_quikhrms"."Invitation"("token");

CREATE INDEX IF NOT EXISTS "Invitation_orgId_status_idx" ON "app_quikhrms"."Invitation"("orgId", "status");

CREATE INDEX IF NOT EXISTS "Invitation_orgId_email_idx" ON "app_quikhrms"."Invitation"("orgId", "email");

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Department" ADD CONSTRAINT "Department_parentDepartmentId_fkey" FOREIGN KEY ("parentDepartmentId") REFERENCES "app_quikhrms"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Team" ADD CONSTRAINT "Team_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "app_quikhrms"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Team" ADD CONSTRAINT "Team_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Designation" ADD CONSTRAINT "Designation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "app_quikhrms"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "app_quikhrms"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Employee" ADD CONSTRAINT "Employee_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "app_quikhrms"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Employee" ADD CONSTRAINT "Employee_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "app_quikhrms"."Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Employee" ADD CONSTRAINT "Employee_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "app_quikhrms"."Grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Employee" ADD CONSTRAINT "Employee_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "app_quikhrms"."OfficeLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Employee" ADD CONSTRAINT "Employee_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Employee" ADD CONSTRAINT "Employee_dottedLineManagerId_fkey" FOREIGN KEY ("dottedLineManagerId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Employee" ADD CONSTRAINT "Employee_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Employee" ADD CONSTRAINT "Employee_wfhQuotaGroupId_fkey" FOREIGN KEY ("wfhQuotaGroupId") REFERENCES "app_quikhrms"."WfhQuotaGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "app_quikhrms"."ShiftPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."RosterEntry" ADD CONSTRAINT "RosterEntry_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "app_quikhrms"."Roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."RosterEntry" ADD CONSTRAINT "RosterEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."RosterEntry" ADD CONSTRAINT "RosterEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "app_quikhrms"."ShiftPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."LeaveGroupItem" ADD CONSTRAINT "LeaveGroupItem_leaveGroupId_fkey" FOREIGN KEY ("leaveGroupId") REFERENCES "app_quikhrms"."LeaveGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."LeaveGroupItem" ADD CONSTRAINT "LeaveGroupItem_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "app_quikhrms"."LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."LeaveGroupAssignment" ADD CONSTRAINT "LeaveGroupAssignment_leaveGroupId_fkey" FOREIGN KEY ("leaveGroupId") REFERENCES "app_quikhrms"."LeaveGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "app_quikhrms"."LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."LeaveApproval" ADD CONSTRAINT "LeaveApproval_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "app_quikhrms"."LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."LeaveApproval" ADD CONSTRAINT "LeaveApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "app_quikhrms"."LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "app_quikhrms"."ExpensePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."ExpenseApproval" ADD CONSTRAINT "ExpenseApproval_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "app_quikhrms"."ExpenseClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Goal" ADD CONSTRAINT "Goal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Goal" ADD CONSTRAINT "Goal_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "app_quikhrms"."Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."KeyResult" ADD CONSTRAINT "KeyResult_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "app_quikhrms"."Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."GoalCheckIn" ADD CONSTRAINT "GoalCheckIn_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "app_quikhrms"."Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."GoalCheckIn" ADD CONSTRAINT "GoalCheckIn_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."AppraisalCycle" ADD CONSTRAINT "AppraisalCycle_reviewFormId_fkey" FOREIGN KEY ("reviewFormId") REFERENCES "app_quikhrms"."AppraisalCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."EmployeeAppraisal" ADD CONSTRAINT "EmployeeAppraisal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."EmployeeAppraisal" ADD CONSTRAINT "EmployeeAppraisal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "app_quikhrms"."AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."ContinuousFeedback" ADD CONSTRAINT "ContinuousFeedback_fromEmployeeId_fkey" FOREIGN KEY ("fromEmployeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."ContinuousFeedback" ADD CONSTRAINT "ContinuousFeedback_toEmployeeId_fkey" FOREIGN KEY ("toEmployeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."PIP" ADD CONSTRAINT "PIP_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."PIP" ADD CONSTRAINT "PIP_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."JobRequisition" ADD CONSTRAINT "JobRequisition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "app_quikhrms"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."JobRequisition" ADD CONSTRAINT "JobRequisition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."JobRequisition" ADD CONSTRAINT "JobRequisition_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."JobRequisition" ADD CONSTRAINT "JobRequisition_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."JobRequisition" ADD CONSTRAINT "JobRequisition_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."JobRequisition" ADD CONSTRAINT "JobRequisition_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "app_quikhrms"."HiringPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Candidate" ADD CONSTRAINT "Candidate_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."JobApplication" ADD CONSTRAINT "JobApplication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "app_quikhrms"."Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."JobApplication" ADD CONSTRAINT "JobApplication_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "app_quikhrms"."JobRequisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "app_quikhrms"."JobApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Interview" ADD CONSTRAINT "Interview_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."SocialPost" ADD CONSTRAINT "SocialPost_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."PostComment" ADD CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "app_quikhrms"."SocialPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."PostComment" ADD CONSTRAINT "PostComment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "app_quikhrms"."Survey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."SurveyResponse" ADD CONSTRAINT "SurveyResponse_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Recognition" ADD CONSTRAINT "Recognition_fromEmployeeId_fkey" FOREIGN KEY ("fromEmployeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Recognition" ADD CONSTRAINT "Recognition_toEmployeeId_fkey" FOREIGN KEY ("toEmployeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Notification" ADD CONSTRAINT "Notification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Document" ADD CONSTRAINT "Document_parentDocumentId_fkey" FOREIGN KEY ("parentDocumentId") REFERENCES "app_quikhrms"."Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."DocumentAcknowledgment" ADD CONSTRAINT "DocumentAcknowledgment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "app_quikhrms"."Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."DocumentShare" ADD CONSTRAINT "DocumentShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "app_quikhrms"."Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."OnboardingInstance" ADD CONSTRAINT "OnboardingInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "app_quikhrms"."OnboardingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."OnboardingTask" ADD CONSTRAINT "OnboardingTask_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "app_quikhrms"."OnboardingInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."EmployeeProvision" ADD CONSTRAINT "EmployeeProvision_provisionItemId_fkey" FOREIGN KEY ("provisionItemId") REFERENCES "app_quikhrms"."ProvisionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."OffboardingTask" ADD CONSTRAINT "OffboardingTask_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "app_quikhrms"."OffboardingInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."AssetAssignment" ADD CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "app_quikhrms"."Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."AssetScrap" ADD CONSTRAINT "AssetScrap_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "app_quikhrms"."Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TimeJob" ADD CONSTRAINT "TimeJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app_quikhrms"."TimeProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TimeLog" ADD CONSTRAINT "TimeLog_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "app_quikhrms"."Timesheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikhrms"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."RoleNavigation" ADD CONSTRAINT "RoleNavigation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikhrms"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."UserAppRole" ADD CONSTRAINT "UserAppRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikhrms"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."UserAppRole" ADD CONSTRAINT "UserAppRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."UserPermissionExtra" ADD CONSTRAINT "UserPermissionExtra_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."SalaryStructureComponent" ADD CONSTRAINT "SalaryStructureComponent_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "app_quikhrms"."SalaryStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."SalaryStructureComponent" ADD CONSTRAINT "SalaryStructureComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "app_quikhrms"."SalaryComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "app_quikhrms"."SalaryStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."PayRunAdjustment" ADD CONSTRAINT "PayRunAdjustment_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "app_quikhrms"."PayRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Payslip" ADD CONSTRAINT "Payslip_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "app_quikhrms"."PayRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."PayslipLine" ADD CONSTRAINT "PayslipLine_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "app_quikhrms"."Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."LoanRepayment" ADD CONSTRAINT "LoanRepayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "app_quikhrms"."EmployeeLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Task" ADD CONSTRAINT "Task_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "app_quikhrms"."TaskList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "app_quikhrms"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."BankReconciliationLine" ADD CONSTRAINT "BankReconciliationLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "app_quikhrms"."BankReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."WfhRequest" ADD CONSTRAINT "WfhRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."WfhApproval" ADD CONSTRAINT "WfhApproval_wfhRequestId_fkey" FOREIGN KEY ("wfhRequestId") REFERENCES "app_quikhrms"."WfhRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."WfhApproval" ADD CONSTRAINT "WfhApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."CandidateDocumentRequest" ADD CONSTRAINT "CandidateDocumentRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "app_quikhrms"."JobApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."CandidateDocumentUpload" ADD CONSTRAINT "CandidateDocumentUpload_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "app_quikhrms"."CandidateDocumentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."CandidateDocumentUpload" ADD CONSTRAINT "CandidateDocumentUpload_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "app_quikhrms"."CandidateDocumentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."RequisitionApproval" ADD CONSTRAINT "RequisitionApproval_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "app_quikhrms"."JobRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."RequisitionApproval" ADD CONSTRAINT "RequisitionApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TicketCategory" ADD CONSTRAINT "TicketCategory_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "app_quikhrms"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Ticket" ADD CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "app_quikhrms"."TicketCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Ticket" ADD CONSTRAINT "Ticket_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "app_quikhrms"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Ticket" ADD CONSTRAINT "Ticket_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."Ticket" ADD CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "app_quikhrms"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TicketComment" ADD CONSTRAINT "TicketComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "app_quikhrms"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TicketActivity" ADD CONSTRAINT "TicketActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "app_quikhrms"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TicketActivity" ADD CONSTRAINT "TicketActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "app_quikhrms"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."KraTemplateEntry" ADD CONSTRAINT "KraTemplateEntry_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "app_quikhrms"."KraScorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."EmployeeKraAssignment" ADD CONSTRAINT "EmployeeKraAssignment_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "app_quikhrms"."KraScorecard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "app_quikhrms"."TdsChallan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikhrms"."TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_liabilityPeriodId_fkey" FOREIGN KEY ("liabilityPeriodId") REFERENCES "app_quikhrms"."TdsLiabilityPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Additive column sync for existing tables (new fields) ──────────────────
ALTER TABLE app_quikhrms."JobRequisition"
  ADD COLUMN IF NOT EXISTS "jobLocation" TEXT,
  ADD COLUMN IF NOT EXISTS "jobDuration" TEXT,
  ADD COLUMN IF NOT EXISTS "workTimings" TEXT,
  ADD COLUMN IF NOT EXISTS "interviewMode" TEXT,
  ADD COLUMN IF NOT EXISTS "rolePurpose" TEXT,
  ADD COLUMN IF NOT EXISTS "jobOpeningName" TEXT,
  ADD COLUMN IF NOT EXISTS "interviewPanel" JSONB,
  ADD COLUMN IF NOT EXISTS "postToJobPortal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "budget" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "etaToFillDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "targetJoiningDate" DATE,
  ADD COLUMN IF NOT EXISTS "jobGrade" TEXT,
  ADD COLUMN IF NOT EXISTS "costCenter" TEXT;

ALTER TABLE app_quikhrms."OffboardingInstance"
  ADD COLUMN IF NOT EXISTS "resignationApprovalStatus" app_quikhrms."ResignationApprovalStatus",
  ADD COLUMN IF NOT EXISTS "resignationApproverId" TEXT,
  ADD COLUMN IF NOT EXISTS "resignationDecisionById" TEXT,
  ADD COLUMN IF NOT EXISTS "resignationDecisionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resignationRejectionReason" TEXT;
