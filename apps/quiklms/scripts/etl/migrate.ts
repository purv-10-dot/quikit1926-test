/**
 * ETL — MongoDB (legacy) → PostgreSQL/Prisma.
 *
 * Idempotent + resumable: a persistent old→new id map (etl-idmap.json) means
 * re-running skips already-migrated rows and re-points references consistently.
 * Collections are processed in dependency order; embedded subdoc arrays are
 * split into child/join tables; config blobs land in Json columns.
 *
 * Usage:
 *   MONGODB_URI=mongodb://... DATABASE_URL=postgres://... npx tsx scripts/etl/migrate.ts
 *   (optional) ONLY=tenants,users   to run a subset of collections
 *
 * Verification: prints per-table source vs. target row counts at the end.
 */
import { MongoClient, ObjectId } from 'mongodb';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quikskill-lms';
const prisma = new PrismaClient();
// ETL is a one-shot script: use a loosely-typed client for the nested-create
// blocks (Mongo docs are dynamic; Prisma's generated input types add no value here).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const px = prisma as any;
const IDMAP_PATH = join(process.cwd(), 'scripts', 'etl', 'etl-idmap.json');

// ── id map (persistent) ───────────────────────────────────────────────────────
const idMap: Record<string, string> = existsSync(IDMAP_PATH) ? JSON.parse(readFileSync(IDMAP_PATH, 'utf8')) : {};
function uid(oldId: unknown): string {
  const key = String(oldId);
  if (!idMap[key]) idMap[key] = randomUUID();
  return idMap[key];
}
function refId(oldId: unknown): string | null {
  if (oldId === null || oldId === undefined || oldId === '') return null;
  const key = String(oldId);
  return idMap[key] ?? uid(key); // resolve, minting a stable id if the target wasn't migrated yet
}
function saveIdMap() { writeFileSync(IDMAP_PATH, JSON.stringify(idMap), 'utf8'); }

function d(v: unknown): Date | null { return v ? new Date(v as string) : null; }
function dReq(v: unknown): Date { return v ? new Date(v as string) : new Date(); }
function arr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }

// ── enum value remaps (Mongo display string → Prisma member name) ─────────────
const PROGRESS_STATUS: Record<string, string> = {
  'Not Started': 'NotStarted', 'In Progress': 'InProgress', Overdue: 'Overdue', Completed: 'Completed', Failed: 'Failed',
};

const TENANT_ACTION_MAP: Record<string, string> = {
  'New Learner Invited': 'NewLearnerInvited',
  'Course Assigned to User': 'CourseAssignedToUser',
  'Course Assigned to Group': 'CourseAssignedToGroup',
  'Course Completed': 'CourseCompleted',
  'Quiz Passing Score Updated': 'QuizPassingScoreUpdated',
  'User Activated': 'UserActivated',
  'User Deactivated': 'UserDeactivated',
  'Branding Updated': 'BrandingUpdated',
  'Storage Requested': 'StorageRequested',
  'Quiz Reset by Manager': 'QuizResetByManager',
  'User Nudged by Manager': 'UserNudgedByManager',
  'Attendance Marked by Manager': 'AttendanceMarkedByManager',
  'Certificate Approved by Manager': 'CertificateApprovedByManager',
  'Team Report Exported by Manager': 'TeamReportExportedByManager',
};

const EMAIL_TEMPLATE_TYPE_MAP: Record<string, string> = {
  'welcome-kit': 'welcome_kit',
  'course-completion': 'course_completion',
  'certificate': 'certificate',
  'upgrade-invoice': 'upgrade_invoice',
};

const counts: Record<string, { source: number; target: number }> = {};

async function main() {
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const run = (name: string) => !only || only.has(name);

  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const db = mongo.db();
  console.log(`[etl] connected to mongo: ${db.databaseName}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — foundation (tenants, users, groups, courses, mastercourses,
  //           assessments, progresses)  ← originally migrated, kept intact
  // ═══════════════════════════════════════════════════════════════════════════

  // ───────────────── TENANTS ─────────────────
  if (run('tenants')) await migrateSimple(db, 'tenants', (m) => ({
    id: uid(m._id), name: m.name, subdomain: m.subdomain, tenantType: m.tenantType ?? 'corporate',
    gstNumber: m.gstNumber ?? null, dbConnectionString: m.dbConnectionString ?? null, status: m.status ?? 'Active',
    tenantKey: m.tenantKey, orgName: m.orgName, fullAddress: m.fullAddress, country: m.country, officialPhone: m.officialPhone,
    website: m.website ?? null, officialEmail: m.officialEmail, contactFirstName: m.contactFirstName, contactMiddleName: m.contactMiddleName ?? null,
    contactLastName: m.contactLastName, contactPhone: m.contactPhone, contactEmail: m.contactEmail, contactRoleInOrganization: m.contactRoleInOrganization,
    billingFirstName: m.billingFirstName, billingMiddleName: m.billingMiddleName ?? null, billingLastName: m.billingLastName, billingAddress: m.billingAddress,
    featureConfig: m.featureConfig ?? {}, schoolConfig: m.schoolConfig ?? null, corporateConfig: m.corporateConfig ?? null,
    creditConfig: m.creditConfig ?? null, payoutConfig: m.payoutConfig ?? null, videoConfig: m.videoConfig ?? null, enhancementConfig: m.enhancementConfig ?? null,
    timezone: m.timezone ?? 'UTC', defaultLanguage: m.defaultLanguage ?? 'en', enabledLanguages: arr<string>(m.enabledLanguages).length ? m.enabledLanguages : ['en'],
    locale: m.locale ?? 'en-US', currency: m.currency ?? 'USD', localeSettings: m.localeSettings ?? null, storageLimit: Math.round(m.storageLimit ?? 2),
    logoUrl: m.logoUrl ?? null, faviconUrl: m.faviconUrl ?? null, primaryColor: m.primaryColor ?? '#3B82F6', secondaryColor: m.secondaryColor ?? '#1E40AF',
    auth0OrganizationId: m.auth0OrganizationId ?? null, auth0UserId: m.auth0UserId ?? null, loginUrl: m.loginUrl ?? null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsTenant.create({ data }));

  // ───────────────── USERS (+ availableSlots child, user_parents join) ─────────────────
  if (run('users')) {
    const docs = await db.collection('users').find().toArray();
    counts.users = { source: docs.length, target: 0 };
    for (const m of docs) {
      try {
        await px.user.create({ data: {
          // NOTE: the source Mongo docs carry password / mustChangePassword /
          // passwordSetupToken(+Expiry) / provider / providerId /
          // activeSessionId. Those columns no longer exist on LmsUser — under
          // centralized auth credentials belong to `auth.User` and sessions to
          // the shared Redis session id — so they are intentionally NOT copied.
          id: uid(m._id), email: String(m.email).toLowerCase().trim(),
          firstName: m.firstName, lastName: m.lastName, role: m.role ?? 'LEARNER', secondaryRole: m.secondaryRole ?? null,
          tenantId: m.tenantId ? refId(m.tenantId) : null, managerId: m.managerId ? refId(m.managerId) : null, isActive: m.isActive ?? true,
          parentEmail: m.parentEmail ?? null, guardianContact: m.guardianContact ?? null, phone: m.phone ?? null, guardianRelation: m.guardianRelation ?? null,
          grade: m.grade ?? null, subjects: arr<string>(m.subjects), ratePerClass: m.ratePerClass ?? null, ratePerHour: m.ratePerHour ?? null,
          rateType: m.rateType ?? null, qualification: m.qualification ?? null, monthlyPayout: m.monthlyPayout ?? null,
          employeeId: m.employeeId ?? null, studentId: m.studentId ?? null, parentCode: m.parentCode ?? null, dateOfBirth: d(m.dateOfBirth), section: m.section ?? null,
          maxSlotsPerWeek: m.maxSlotsPerWeek ?? 0, tutoringEnabled: m.tutoringEnabled ?? false, tutoringCreditCost: m.tutoringCreditCost ?? null,
          classesCompleted: m.classesCompleted ?? 0, classesMissed: m.classesMissed ?? 0, classesCancelled: m.classesCancelled ?? 0,
          classesRescheduledAndCompleted: m.classesRescheduledAndCompleted ?? 0, punctualityScore: m.punctualityScore ?? 0,
          profilePicture: m.profilePicture ?? null, aiApiKey: m.aiApiKey ?? null,
          currentStreak: m.currentStreak ?? 0, totalPoints: m.totalPoints ?? 0, lastActivityDate: d(m.lastActivityDate),
          preferredLanguage: m.preferredLanguage ?? 'en', timezone: m.timezone ?? null, notificationPreferences: m.notificationPreferences ?? null,
          createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
          availableSlots: { create: arr<{ dayOfWeek: number; startTime: string; endTime: string }>(m.availableSlots).map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })) },
        } });
        counts.users.target++;
      } catch (e) { console.warn('[etl] user skip', m._id, (e as Error).message); }
    }
    // user_parents join — from parentIds on each user (child → parents)
    for (const m of docs) {
      for (const pid of arr<ObjectId>(m.parentIds)) {
        const parentId = refId(pid), childId = refId(m._id);
        if (parentId && childId) await prisma.lmsUserParent.upsert({ where: { parentId_childId: { parentId, childId } }, create: { parentId, childId }, update: {} }).catch(() => {});
      }
    }
    saveIdMap();
    console.log(`[etl] users: ${counts.users.target}/${counts.users.source}`);
  }

  // ───────────────── GROUPS (+members) ─────────────────
  if (run('groups')) {
    const docs = await db.collection('groups').find().toArray();
    counts.groups = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.group.create({ data: {
        id: uid(m._id), tenantId: refId(m.tenantId)!, name: m.name, description: m.description ?? null, createdBy: m.createdBy ? refId(m.createdBy) : null,
        createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        members: { create: arr<ObjectId>(m.memberIds).map((u) => ({ userId: refId(u)! })) },
      } }).then(() => counts.groups.target++).catch((e: any) => console.warn('[etl] group skip', (e as Error).message));
    }
    saveIdMap();
    console.log(`[etl] groups: ${counts.groups.target}/${counts.groups.source}`);
  }

  // ───────────────── COURSES (+selectedTenants, +prereqs) ─────────────────
  if (run('courses')) {
    const docs = await db.collection('courses').find().toArray();
    counts.courses = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.course.create({ data: {
        id: uid(m._id), tenantId: m.tenantId ? refId(m.tenantId) : null, title: m.title, category: m.category ?? null, description: m.description ?? null,
        authorId: refId(m.authorId)!, status: m.status ?? 'Draft', thumbnailUrl: m.thumbnailUrl ?? null, isMaster: m.isMaster ?? false,
        isFeatured: m.isFeatured ?? false, version: m.version ?? 1, createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        selectedTenants: { create: arr<ObjectId>(m.selectedTenants).map((t) => ({ tenantId: refId(t)! })) },
      } }).then(() => counts.courses.target++).catch((e: any) => console.warn('[etl] course skip', (e as Error).message));
    }
    for (const m of docs) {
      for (const p of arr<ObjectId>(m.prerequisites)) {
        const courseId = refId(m._id), prerequisiteId = refId(p);
        if (courseId && prerequisiteId) await prisma.lmsCoursePrerequisite.upsert({ where: { courseId_prerequisiteId: { courseId, prerequisiteId } }, create: { courseId, prerequisiteId }, update: {} }).catch(() => {});
      }
    }
    saveIdMap();
    console.log(`[etl] courses: ${counts.courses.target}/${counts.courses.source}`);
  }

  // ───────────────── MODULES (+lessons child) ─────────────────
  if (run('modules')) {
    const docs = await db.collection('modules').find().toArray();
    counts.modules = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.module.create({ data: {
        id: uid(m._id), tenantId: m.tenantId ? refId(m.tenantId) : null, courseId: refId(m.courseId)!, title: m.title, description: m.description ?? null,
        orderIndex: m.orderIndex ?? 0, assessmentId: m.assessmentId ? refId(m.assessmentId) : null, createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        lessons: { create: arr<Record<string, unknown>>(m.lessons).map((l, i) => ({
          title: l.title as string, type: (l.type as string) ?? 'Text', contentUrl: (l.contentUrl as string) ?? null, orderIndex: (l.orderIndex as number) ?? i,
          isMaster: (l.isMaster as boolean) ?? false, description: (l.description as string) ?? null, duration: (l.duration as number) ?? null,
          fileSize: (l.fileSize as number) ?? null, captions: (l.captions as object) ?? undefined, quiz: (l.quiz as object) ?? undefined,
        })) },
      } }).then(() => counts.modules.target++).catch((e: any) => console.warn('[etl] module skip', (e as Error).message));
    }
    saveIdMap();
    console.log(`[etl] modules: ${counts.modules.target}/${counts.modules.source}`);
  }

  // ───────────────── MASTER COURSES (+selectedTenants) ─────────────────
  if (run('mastercourses')) await migrateSimple(db, 'mastercourses', (m) => ({
    id: uid(m._id), title: m.title, description: m.description ?? null, category: m.category ?? null, level: m.level ?? 'Beginner',
    thumbnailUrl: m.thumbnailUrl ?? null, aiGeneratedThumbnail: m.aiGeneratedThumbnail ?? false, authorId: refId(m.authorId)!,
    modules: m.modules ?? [], settings: m.settings ?? {}, status: m.status ?? 'Draft', isMaster: m.isMaster ?? true, tags: arr<string>(m.tags),
    estimatedDuration: m.estimatedDuration ?? null, lastAutoSaveAt: d(m.lastAutoSaveAt), draftData: m.draftData ?? null, version: m.version ?? 1,
    submittedBy: m.submittedBy ? refId(m.submittedBy) : null, submittedByTenantId: m.submittedByTenantId ? refId(m.submittedByTenantId) : null,
    parentCourseId: m.parentCourseId ? refId(m.parentCourseId) : null, revisionNumber: m.revisionNumber ?? 1,
    tenantApprovedBy: m.tenantApprovedBy ? refId(m.tenantApprovedBy) : null, tenantApprovalDate: d(m.tenantApprovalDate), tenantRejectionReason: m.tenantRejectionReason ?? null,
    approvedBy: m.approvedBy ? refId(m.approvedBy) : null, approvalDate: d(m.approvalDate), rejectionReason: m.rejectionReason ?? null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
    selectedTenants: { create: arr<ObjectId>(m.selectedTenants).map((t) => ({ tenantId: refId(t)! })) },
  }), (data) => prisma.lmsMasterCourse.create({ data }));

  // ───────────────── ASSESSMENTS ─────────────────
  if (run('assessments')) await migrateSimple(db, 'assessments', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, moduleId: refId(m.moduleId)!, title: m.title, questions: m.questions ?? [],
    passingScore: m.passingScore ?? 75, retryLimit: m.retryLimit ?? 3, timeLimit: m.timeLimit ?? null, randomizeQuestions: m.randomizeQuestions ?? false,
    questionsToShow: m.questionsToShow ?? null, additionalQuestions: m.additionalQuestions ?? [], additionalQuestionsToInclude: m.additionalQuestionsToInclude ?? null,
    isMaster: m.isMaster ?? false, createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsAssessment.create({ data }));

  // ───────────────── PROGRESSES ─────────────────
  if (run('progress')) await migrateSimple(db, 'progresses', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, learnerId: refId(m.learnerId)!, courseId: refId(m.courseId)!, currentModuleId: m.currentModuleId ? refId(m.currentModuleId) : null,
    status: m.status ?? 'Not Started', completionPercentage: m.completionPercentage ?? 0, scorePercentage: m.scorePercentage ?? null, quizScore: m.quizScore ?? null,
    isPassed: m.isPassed ?? false, completedAt: d(m.completedAt), startedAt: dReq(m.startedAt), lessonProgress: m.lessonProgress ?? null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsProgress.create({ data }), { statusMap: PROGRESS_STATUS });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — operational data (school ops, credits, meetings, messaging, etc.)
  // ═══════════════════════════════════════════════════════════════════════════

  // ───────────────── COUNTERS ─────────────────
  if (run('counters')) await migrateSimple(db, 'counters', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, type: m.type, seq: m.seq ?? 0,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsCounter.create({ data }));

  // ───────────────── SECTIONS ─────────────────
  if (run('sections')) await migrateSimple(db, 'sections', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, grade: m.grade, name: m.name,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsSection.create({ data }));

  // ───────────────── SUBJECTS ─────────────────
  if (run('subjects')) await migrateSimple(db, 'subjects', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, name: m.name, isDefault: m.isDefault ?? false,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsSubject.create({ data }));

  // ───────────────── EMAIL TEMPLATES ─────────────────
  if (run('emailtemplates')) await migrateSimple(db, 'emailtemplates', (m) => ({
    id: uid(m._id), type: EMAIL_TEMPLATE_TYPE_MAP[m.type as string] ?? m.type,
    subject: m.subject, htmlContent: m.htmlContent,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsEmailTemplate.create({ data }));

  // ───────────────── COURSE ASSIGNMENTS ─────────────────
  if (run('courseassignments')) await migrateSimple(db, 'courseassignments', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, courseId: refId(m.courseId)!,
    targetType: m.targetType ?? 'USER', targetId: refId(m.targetId)!,
    dueDate: d(m.dueDate), isMandatory: m.isMandatory ?? true,
    assignedBy: refId(m.assignedBy)!, assignedAt: dReq(m.assignedAt ?? m.createdAt),
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsCourseAssignment.create({ data }));

  // ───────────────── TENANT LOGS ─────────────────
  if (run('tenantlogs')) await migrateSimple(db, 'tenantlogs', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!,
    actionType: TENANT_ACTION_MAP[m.actionType as string] ?? m.actionType,
    description: m.description, performedBy: refId(m.performedBy)!,
    metadata: m.metadata ?? null, ipAddress: m.ipAddress ?? null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsTenantLog.create({ data }));

  // ───────────────── PRIVACY AUDIT LOGS ─────────────────
  if (run('privacyauditlogs')) await migrateSimple(db, 'privacyauditlogs', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, userId: refId(m.userId)!,
    userRole: m.userRole, endpoint: m.endpoint, method: m.method,
    fieldsStripped: arr<string>(m.fieldsStripped), recordsAffected: m.recordsAffected ?? 0,
    ipAddress: m.ipAddress ?? null, userAgent: m.userAgent ?? null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsPrivacyAuditLog.create({ data }));

  // ───────────────── CERTIFICATES (+selectedTenants) ─────────────────
  if (run('certificates')) {
    const docs = await db.collection('certificates').find().toArray();
    counts.certificates = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.certificate.create({ data: {
        id: uid(m._id), tenantId: m.tenantId ? refId(m.tenantId) : null,
        name: m.name, backgroundImageUrl: m.backgroundImageUrl,
        logoImageUrl: m.logoImageUrl ?? null, signatureImageUrl: m.signatureImageUrl ?? null,
        designation: m.designation ?? null, signatoryName: m.signatoryName ?? null,
        textPlacements: m.textPlacements ?? null, logoPlacement: m.logoPlacement ?? null,
        signaturePlacement: m.signaturePlacement ?? null, isActive: m.isActive ?? true,
        approvalStatus: m.approvalStatus ?? 'approved',
        submittedBy: m.submittedBy ? refId(m.submittedBy) : null,
        submittedByTenantId: m.submittedByTenantId ? refId(m.submittedByTenantId) : null,
        approvedBy: m.approvedBy ? refId(m.approvedBy) : null,
        approvalDate: d(m.approvalDate), rejectionReason: m.rejectionReason ?? null,
        createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        selectedTenants: { create: arr<ObjectId>(m.selectedTenants).map((t) => ({ tenantId: refId(t)! })) },
      } }).then(() => counts.certificates.target++).catch((e: any) => console.warn('[etl] certificate skip', m._id, (e as Error).message));
    }
    saveIdMap();
    console.log(`[etl] certificates: ${counts.certificates.target}/${counts.certificates.source}`);
  }

  // ───────────────── CERTIFICATES ISSUED ─────────────────
  if (run('certificateissueds')) await migrateSimple(db, 'certificateissueds', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, learnerId: refId(m.learnerId)!,
    courseId: refId(m.courseId)!,
    certificateTemplateId: m.certificateTemplateId ? refId(m.certificateTemplateId) : null,
    courseName: m.courseName ?? null, learnerName: m.learnerName ?? null,
    certificateId: m.certificateId, pdfUrl: m.pdfUrl ?? '', qrCodeUrl: m.qrCodeUrl ?? '',
    verificationUrl: m.verificationUrl, issuedAt: dReq(m.issuedAt),
    isComplianceCertificate: m.isComplianceCertificate ?? false,
    expiresAt: d(m.expiresAt), score: m.score ?? null, passingScore: m.passingScore ?? null,
    passed: m.passed ?? null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsCertificateIssued.create({ data }));

  // ───────────────── QUIZ ATTEMPTS ─────────────────
  if (run('quizattempts')) await migrateSimple(db, 'quizattempts', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, learnerId: refId(m.learnerId)!,
    courseId: refId(m.courseId)!, assessmentId: refId(m.assessmentId)!,
    answers: m.answers ?? [], score: Math.round(m.score ?? 0),
    totalPoints: Math.round(m.totalPoints ?? 0), percentage: m.percentage ?? 0,
    passed: m.passed ?? false, submittedAt: dReq(m.submittedAt ?? m.createdAt),
    proctoringSessionId: m.proctoringSessionId ? refId(m.proctoringSessionId) : null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsQuizAttempt.create({ data }));

  // ───────────────── NON-TEACHING TASKS ─────────────────
  if (run('nonteachingtasks')) await migrateSimple(db, 'nonteachingtasks', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, teacherId: refId(m.teacherId)!,
    assignedBy: refId(m.assignedBy)!, title: m.title, description: m.description ?? null,
    category: m.category ?? 'other', paymentAmount: m.paymentAmount ?? 0,
    status: m.status ?? 'assigned', dueDate: d(m.dueDate), completedAt: d(m.completedAt),
    approvedAt: d(m.approvedAt), approvedBy: m.approvedBy ? refId(m.approvedBy) : null,
    rejectionReason: m.rejectionReason ?? null, completionNotes: m.completionNotes ?? null,
    hoursSpent: m.hoursSpent ?? null, attachmentUrls: arr<string>(m.attachmentUrls),
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsNonTeachingTask.create({ data }));

  // ───────────────── TUTORING REQUESTS ─────────────────
  if (run('tutoringrequests')) await migrateSimple(db, 'tutoringrequests', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!,
    studentId: refId(m.studentId)!, teacherId: m.teacherId ? refId(m.teacherId) : null,
    subject: m.subject, notes: m.notes ?? null,
    proposedSlots: m.proposedSlots ?? [], confirmedSlot: m.confirmedSlot ?? null,
    status: m.status ?? 'pending', rejectionReason: m.rejectionReason ?? null,
    teacherNotes: m.teacherNotes ?? null,
    batchId: m.batchId ? refId(m.batchId) : null,
    scheduledClassId: m.scheduledClassId ? refId(m.scheduledClassId) : null,
    creditCostSnapshot: m.creditCostSnapshot ?? null, teacherRateSnapshot: m.teacherRateSnapshot ?? null,
    creditHoldId: m.creditHoldId ? refId(m.creditHoldId) : null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsTutoringRequest.create({ data }));

  // ───────────────── CREDIT PACKAGES ─────────────────
  if (run('creditpackages')) await migrateSimple(db, 'creditpackages', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, studentId: refId(m.studentId)!,
    packageName: m.packageName, purchasedCredits: m.purchasedCredits,
    usedCredits: m.usedCredits ?? 0, remainingCredits: m.remainingCredits,
    purchaseDate: dReq(m.purchaseDate), expiresAt: d(m.expiresAt),
    status: m.status ?? 'active', price: m.price ?? null, notes: m.notes ?? null,
    allocatedBy: m.allocatedBy ? refId(m.allocatedBy) : null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsCreditPackage.create({ data }));

  // ───────────────── CREDIT TRANSACTIONS ─────────────────
  if (run('credittransactions')) await migrateSimple(db, 'credittransactions', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, packageId: refId(m.packageId)!,
    studentId: refId(m.studentId)!, transactionType: m.transactionType ?? 'purchase',
    amount: m.amount, balanceAfter: m.balanceAfter,
    relatedClassId: m.relatedClassId ? refId(m.relatedClassId) : null,
    relatedAttendanceId: m.relatedAttendanceId ? refId(m.relatedAttendanceId) : null,
    notes: m.notes ?? null, processedBy: m.processedBy ? refId(m.processedBy) : null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsCreditTransaction.create({ data }));

  // ───────────────── BATCHES (+schedule +students +substituteTeachers) ─────────────────
  if (run('batches')) {
    const docs = await db.collection('batches').find().toArray();
    counts.batches = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.batch.create({ data: {
        id: uid(m._id), tenantId: refId(m.tenantId)!, name: m.name, grade: m.grade ?? null,
        section: m.section ?? null, subject: m.subject, description: m.description ?? null,
        teacherId: refId(m.teacherId)!, academicYear: m.academicYear, term: m.term ?? null,
        startDate: dReq(m.startDate), endDate: dReq(m.endDate),
        maxCapacity: m.maxCapacity ?? null, defaultMeetingProvider: m.defaultMeetingProvider ?? 'jitsi',
        creditPerClass: m.creditPerClass ?? 1, ratePerClass: m.ratePerClass ?? null,
        ratePerHour: m.ratePerHour ?? null, classType: m.classType ?? 'regular',
        trialClassCount: m.trialClassCount ?? 0, convertedToRegular: m.convertedToRegular ?? false,
        convertedAt: d(m.convertedAt), status: m.status ?? 'active',
        createdBy: m.createdBy ? refId(m.createdBy) : null,
        batchType: m.batchType ?? 'regular', source: m.source ?? 'manual',
        tutoringRequestId: m.tutoringRequestId ? refId(m.tutoringRequestId) : null,
        createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        schedule: { create: arr<{ dayOfWeek: number; startTime: string; endTime: string; location?: string }>(m.schedule).map((s) => ({
          dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, location: s.location ?? null,
        })) },
        students: { create: arr<ObjectId>(m.studentIds).map((sid) => ({ studentId: refId(sid)! })) },
        substituteTeachers: { create: arr<ObjectId>(m.substituteTeacherIds).map((tid) => ({ teacherId: refId(tid)! })) },
      } }).then(() => counts.batches.target++).catch((e: any) => console.warn('[etl] batch skip', m._id, (e as Error).message));
    }
    saveIdMap();
    console.log(`[etl] batches: ${counts.batches.target}/${counts.batches.source}`);
  }

  // ───────────────── SCHEDULED CLASSES ─────────────────
  if (run('scheduledclasses')) await migrateSimple(db, 'scheduledclasses', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, batchId: refId(m.batchId)!,
    teacherId: refId(m.teacherId)!,
    substituteTeacherId: m.substituteTeacherId ? refId(m.substituteTeacherId) : null,
    title: m.title, startTime: dReq(m.startTime), endTime: dReq(m.endTime),
    location: m.location ?? null, status: m.status ?? 'scheduled',
    cancellationReason: m.cancellationReason ?? null,
    rescheduledTo: m.rescheduledTo ? refId(m.rescheduledTo) : null,
    rescheduledFrom: m.rescheduledFrom ? refId(m.rescheduledFrom) : null,
    rescheduleReason: m.rescheduleReason ?? null,
    rescheduleApprovalStatus: m.rescheduleApprovalStatus ?? null,
    meetingId: m.meetingId ? refId(m.meetingId) : null,
    attendanceMarkedAt: d(m.attendanceMarkedAt), classNotes: m.classNotes ?? null,
    isRecurring: m.isRecurring ?? false, recurringPattern: m.recurringPattern ?? null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsScheduledClass.create({ data }));

  // ───────────────── ATTENDANCES ─────────────────
  if (run('attendances')) await migrateSimple(db, 'attendances', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!,
    scheduledClassId: refId(m.scheduledClassId)!, batchId: refId(m.batchId)!,
    studentId: refId(m.studentId)!, markedBy: refId(m.markedBy)!,
    status: m.status ?? 'present', classDate: dReq(m.classDate),
    notes: m.notes ?? null, creditDeducted: m.creditDeducted ?? false,
    creditTransactionId: m.creditTransactionId ? refId(m.creditTransactionId) : null,
    editedBy: m.editedBy ? refId(m.editedBy) : null,
    editReason: m.editReason ?? null, editedAt: d(m.editedAt),
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsAttendance.create({ data }));

  // ───────────────── HOMEWORKS ─────────────────
  if (run('homeworks')) await migrateSimple(db, 'homeworks', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, batchId: refId(m.batchId)!,
    teacherId: refId(m.teacherId)!, title: m.title, description: m.description ?? null,
    instructions: m.instructions ?? null, attachmentUrls: arr<string>(m.attachmentUrls),
    resourceLinks: m.resourceLinks ?? [], dueDate: dReq(m.dueDate),
    assignedToStudentIds: arr<string>(m.assignedToStudentIds).map((id) => refId(id)!),
    maxScore: m.maxScore ?? null, allowLateSubmission: m.allowLateSubmission ?? false,
    lateSubmissionDeadline: d(m.lateSubmissionDeadline),
    latePenaltyPercent: m.latePenaltyPercent ?? null,
    status: m.status ?? 'published', type: m.type ?? 'assignment',
    publishedAt: d(m.publishedAt),
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsHomework.create({ data }));

  // ───────────────── HOMEWORK SUBMISSIONS (+rubricScores) ─────────────────
  if (run('homeworksubmissions')) {
    const docs = await db.collection('homeworksubmissions').find().toArray();
    counts.homeworksubmissions = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.homeworkSubmission.create({ data: {
        id: uid(m._id), tenantId: refId(m.tenantId)!, homeworkId: refId(m.homeworkId)!,
        studentId: refId(m.studentId)!, attachmentUrls: arr<string>(m.attachmentUrls),
        textResponse: m.textResponse ?? null, submittedAt: dReq(m.submittedAt),
        isLate: m.isLate ?? false, status: m.status ?? 'submitted',
        score: m.score ?? null, feedback: m.feedback ?? null,
        gradedBy: m.gradedBy ? refId(m.gradedBy) : null, gradedAt: d(m.gradedAt),
        correctedFileUrl: m.correctedFileUrl ?? null, richFeedback: m.richFeedback ?? null,
        latePenaltyApplied: m.latePenaltyApplied ?? null, finalScore: m.finalScore ?? null,
        createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        rubricScores: { create: arr<{ criterion: string; maxScore: number; score: number; comment?: string }>(m.rubricScores).map((r) => ({
          criterion: r.criterion, maxScore: r.maxScore, score: r.score, comment: r.comment ?? null,
        })) },
      } }).then(() => counts.homeworksubmissions.target++).catch((e: any) => console.warn('[etl] homeworksubmission skip', m._id, (e as Error).message));
    }
    saveIdMap();
    console.log(`[etl] homeworksubmissions: ${counts.homeworksubmissions.target}/${counts.homeworksubmissions.source}`);
  }

  // ───────────────── MEETINGS ─────────────────
  if (run('meetings')) await migrateSimple(db, 'meetings', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!,
    scheduledClassId: m.scheduledClassId ? refId(m.scheduledClassId) : null,
    hostId: m.hostId ? refId(m.hostId) : null, provider: m.provider ?? 'jitsi',
    externalMeetingId: m.externalMeetingId ?? null, joinUrl: m.joinUrl,
    hostUrl: m.hostUrl ?? null, password: m.password ?? null,
    scheduledStartTime: dReq(m.scheduledStartTime), scheduledEndTime: dReq(m.scheduledEndTime),
    actualStartTime: d(m.actualStartTime), actualEndTime: d(m.actualEndTime),
    status: m.status ?? 'scheduled', recordingEnabled: m.recordingEnabled ?? false,
    recordingUrls: arr<string>(m.recordingUrls), recordingStatus: m.recordingStatus ?? 'pending',
    providerMetadata: m.providerMetadata ?? null,
    createdBy: m.createdBy ? refId(m.createdBy) : null,
    title: m.title ?? null, isInstant: m.isInstant ?? false,
    participantCount: m.participantCount ?? 0,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsMeeting.create({ data }));

  // ───────────────── MEETING ATTENDANCES ─────────────────
  if (run('meetingattendances')) await migrateSimple(db, 'meetingattendances', (m) => ({
    id: uid(m._id), meetingId: refId(m.meetingId)!, userId: refId(m.userId)!,
    role: m.role ?? 'student', joinedAt: dReq(m.joinedAt), leftAt: d(m.leftAt),
    durationMinutes: m.durationMinutes ?? null, deviceType: m.deviceType ?? 'unknown',
    deviceInfo: m.deviceInfo ?? null, joinLeaveHistory: m.joinLeaveHistory ?? [],
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsMeetingAttendance.create({ data }));

  // ───────────────── TEACHER LEVELS (+levelHistory) ─────────────────
  if (run('teacherlevels')) {
    const docs = await db.collection('teacherlevels').find().toArray();
    counts.teacherlevels = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.teacherLevel.create({ data: {
        id: uid(m._id), tenantId: refId(m.tenantId)!, teacherId: refId(m.teacherId)!,
        currentLevel: m.currentLevel ?? 'beginner',
        totalClassesTaught: m.totalClassesTaught ?? 0, attendanceScore: m.attendanceScore ?? 0,
        homeworkCompletionRate: m.homeworkCompletionRate ?? 0,
        parentFeedbackScore: m.parentFeedbackScore ?? 0, classesMissed: m.classesMissed ?? 0,
        overallScore: m.overallScore ?? 0, lastCalculatedAt: d(m.lastCalculatedAt),
        createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        levelHistory: { create: arr<{ month: number; year: number; level: string; score: number; calculatedAt: string }>(m.levelHistory).map((h) => ({
          month: h.month, year: h.year, level: h.level,
          score: h.score, calculatedAt: dReq(h.calculatedAt),
        })) },
      } }).then(() => counts.teacherlevels.target++).catch((e: any) => console.warn('[etl] teacherlevel skip', m._id, (e as Error).message));
    }
    saveIdMap();
    console.log(`[etl] teacherlevels: ${counts.teacherlevels.target}/${counts.teacherlevels.source}`);
  }

  // ───────────────── TEACHER PAYOUTS (+adjustments) ─────────────────
  if (run('teacherpayouts')) {
    const docs = await db.collection('teacherpayouts').find().toArray();
    counts.teacherpayouts = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.teacherPayout.create({ data: {
        id: uid(m._id), tenantId: refId(m.tenantId)!, teacherId: refId(m.teacherId)!,
        periodStart: dReq(m.periodStart), periodEnd: dReq(m.periodEnd),
        totalClassesCompleted: m.totalClassesCompleted ?? 0,
        ratePerClass: m.ratePerClass ?? 0, rateType: m.rateType ?? 'per_class',
        grossAmount: m.grossAmount ?? 0, totalBonus: m.totalBonus ?? 0,
        totalDeductions: m.totalDeductions ?? 0, nonTeachingWorkAmount: m.nonTeachingWorkAmount ?? 0,
        netAmount: m.netAmount ?? 0, status: m.status ?? 'draft',
        approvedBy: m.approvedBy ? refId(m.approvedBy) : null,
        approvedAt: d(m.approvedAt), paidAt: d(m.paidAt),
        paymentMethod: m.paymentMethod ?? null, paymentReference: m.paymentReference ?? null,
        notes: m.notes ?? null, source: m.source ?? 'batch',
        createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        adjustments: { create: arr<{ type: string; amount: number; reason: string; appliedBy?: string; appliedAt?: string }>(m.adjustments).map((a) => ({
          type: a.type, amount: a.amount, reason: a.reason,
          appliedBy: a.appliedBy ? refId(a.appliedBy) : null, appliedAt: d(a.appliedAt),
        })) },
      } }).then(() => counts.teacherpayouts.target++).catch((e: any) => console.warn('[etl] teacherpayout skip', m._id, (e as Error).message));
    }
    // payout completed classes — cross-ref after both payouts and scheduledclasses exist
    for (const m of docs) {
      for (const cid of arr<ObjectId>(m.completedClassIds)) {
        const payoutId = refId(m._id), scheduledClassId = refId(cid);
        if (payoutId && scheduledClassId) {
          await prisma.lmsPayoutCompletedClass.upsert({
            where: { payoutId_scheduledClassId: { payoutId, scheduledClassId } },
            create: { payoutId, scheduledClassId },
            update: {},
          }).catch(() => {});
        }
      }
    }
    saveIdMap();
    console.log(`[etl] teacherpayouts: ${counts.teacherpayouts.target}/${counts.teacherpayouts.source}`);
  }

  // ───────────────── CALL ESCALATIONS (+callAttempts) ─────────────────
  if (run('callescalations')) {
    const docs = await db.collection('callescalations').find().toArray();
    counts.callescalations = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.callEscalation.create({ data: {
        id: uid(m._id), tenantId: refId(m.tenantId)!,
        scheduledClassId: refId(m.scheduledClassId)!, teacherId: refId(m.teacherId)!,
        status: m.status ?? 'pending', resolutionTime: d(m.resolutionTime),
        teacherJoinedAt: d(m.teacherJoinedAt), adminNotified: m.adminNotified ?? false,
        adminNotifiedAt: d(m.adminNotifiedAt), notes: m.notes ?? null,
        createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        callAttempts: { create: arr<{ attemptNumber: number; attemptTime: string; phoneNumber: string; callStatus: string; callDuration?: number; callSid?: string }>(m.callAttempts).map((a) => ({
          attemptNumber: a.attemptNumber, attemptTime: dReq(a.attemptTime),
          phoneNumber: a.phoneNumber, callStatus: a.callStatus,
          callDuration: a.callDuration ?? null, callSid: a.callSid ?? null,
        })) },
      } }).then(() => counts.callescalations.target++).catch((e: any) => console.warn('[etl] callescalation skip', m._id, (e as Error).message));
    }
    saveIdMap();
    console.log(`[etl] callescalations: ${counts.callescalations.target}/${counts.callescalations.source}`);
  }

  // ───────────────── STUDENT REMINDER CALLS (+callAttempts) ─────────────────
  if (run('studentremindercalls')) {
    const docs = await db.collection('studentremindercalls').find().toArray();
    counts.studentremindercalls = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.studentReminderCall.create({ data: {
        id: uid(m._id), tenantId: refId(m.tenantId)!,
        scheduledClassId: refId(m.scheduledClassId)!, studentId: refId(m.studentId)!,
        batchId: refId(m.batchId)!, status: m.status ?? 'pending',
        resolvedAt: d(m.resolvedAt), notes: m.notes ?? null,
        createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        callAttempts: { create: arr<{ attemptNumber: number; attemptTime: string; phoneNumber: string; callStatus: string; callDuration?: number; callSid?: string }>(m.callAttempts).map((a) => ({
          attemptNumber: a.attemptNumber, attemptTime: dReq(a.attemptTime),
          phoneNumber: a.phoneNumber, callStatus: a.callStatus,
          callDuration: a.callDuration ?? null, callSid: a.callSid ?? null,
        })) },
      } }).then(() => counts.studentremindercalls.target++).catch((e: any) => console.warn('[etl] studentremindercall skip', m._id, (e as Error).message));
    }
    saveIdMap();
    console.log(`[etl] studentremindercalls: ${counts.studentremindercalls.target}/${counts.studentremindercalls.source}`);
  }

  // ───────────────── QUIZ PROCTORING SESSIONS ─────────────────
  if (run('quizproctoringsessions')) await migrateSimple(db, 'quizproctoringsessions', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!,
    assessmentId: refId(m.assessmentId)!, courseId: refId(m.courseId)!,
    learnerId: refId(m.learnerId)!, startedAt: d(m.startedAt), endedAt: d(m.endedAt),
    serverDeadline: d(m.serverDeadline), status: m.status ?? 'in_progress',
    proctoringFlags: m.proctoringFlags ?? {}, isReconnection: m.isReconnection ?? false,
    disconnectedAt: d(m.disconnectedAt), reconnectedAt: d(m.reconnectedAt),
    selectedQuestionIndices: arr<number>(m.selectedQuestionIndices),
    selectedAdditionalIndices: arr<number>(m.selectedAdditionalIndices),
    questionManifest: m.questionManifest ?? null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsQuizProctoringSession.create({ data }));

  // ───────────────── QUIZ PROCTORING LOGS ─────────────────
  if (run('quizproctoringlogs')) await migrateSimple(db, 'quizproctoringlogs', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, sessionId: refId(m.sessionId)!,
    learnerId: refId(m.learnerId)!, eventType: m.eventType,
    timestamp: dReq(m.timestamp), metadata: m.metadata ?? null, severity: m.severity ?? 'low',
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsQuizProctoringLog.create({ data }));

  // ───────────────── QUIZ INCIDENT REPORTS ─────────────────
  if (run('quizincidentreports')) await migrateSimple(db, 'quizincidentreports', (m) => ({
    id: uid(m._id), tenantId: refId(m.tenantId)!, sessionId: refId(m.sessionId)!,
    assessmentId: refId(m.assessmentId)!,
    reviewedBy: m.reviewedBy ? refId(m.reviewedBy) : null, reviewedAt: d(m.reviewedAt),
    flagSummary: m.flagSummary ?? {}, disposition: m.disposition ?? 'pending',
    action: m.action ?? 'none', remarks: m.remarks ?? null,
    createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
  }), (data) => prisma.lmsQuizIncidentReport.create({ data }));

  // ───────────────── CONVERSATIONS (+participants) ─────────────────
  if (run('conversations')) {
    const docs = await db.collection('conversations').find().toArray();
    counts.conversations = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.conversation.create({ data: {
        id: uid(m._id), tenantId: refId(m.tenantId)!, type: m.type ?? 'direct',
        title: m.title ?? null, groupIcon: m.groupIcon ?? null, description: m.description ?? null,
        lastMessageText: m.lastMessageText ?? null, lastMessageAt: d(m.lastMessageAt),
        lastMessageBy: m.lastMessageBy ? refId(m.lastMessageBy) : null,
        messageCount: m.messageCount ?? 0,
        blockedUserIds: arr<string>(m.blockedUserIds).map((id) => refId(id)!),
        createdBy: m.createdBy ? refId(m.createdBy) : null,
        createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        participants: { create: arr<{ userId: string; joinedAt?: string; lastReadAt?: string; role?: string; isArchived?: boolean; isDeleted?: boolean; isMuted?: boolean; deletedAt?: string }>(m.participants).map((p) => ({
          userId: refId(p.userId)!, joinedAt: d(p.joinedAt) ?? new Date(),
          lastReadAt: d(p.lastReadAt) ?? new Date(),
          role: p.role ?? 'member', isArchived: p.isArchived ?? false,
          isDeleted: p.isDeleted ?? false, deletedAt: d(p.deletedAt), isMuted: p.isMuted ?? false,
        })) },
      } }).then(() => counts.conversations.target++).catch((e: any) => console.warn('[etl] conversation skip', m._id, (e as Error).message));
    }
    saveIdMap();
    console.log(`[etl] conversations: ${counts.conversations.target}/${counts.conversations.source}`);
  }

  // ───────────────── MESSAGES (+reactions) ─────────────────
  if (run('messages')) {
    const docs = await db.collection('messages').find().toArray();
    counts.messages = { source: docs.length, target: 0 };
    for (const m of docs) {
      await px.message.create({ data: {
        id: uid(m._id), conversationId: refId(m.conversationId)!, senderId: refId(m.senderId)!,
        text: m.text, attachmentUrls: arr<string>(m.attachmentUrls),
        isEdited: m.isEdited ?? false, editedAt: d(m.editedAt),
        isDeleted: m.isDeleted ?? false,
        deletedBy: m.deletedBy ? refId(m.deletedBy) : null, deletedAt: d(m.deletedAt),
        isFlagged: m.isFlagged ?? false, flagReason: m.flagReason ?? null,
        replyTo: m.replyTo ? refId(m.replyTo) : null,
        forwardedFrom: m.forwardedFrom ? refId(m.forwardedFrom) : null,
        createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
        reactions: { create: arr<{ userId: string; emoji: string }>(m.reactions).map((r) => ({
          userId: refId(r.userId)!, emoji: r.emoji,
        })) },
      } }).then(() => counts.messages.target++).catch((e: any) => console.warn('[etl] message skip', m._id, (e as Error).message));
    }
    saveIdMap();
    console.log(`[etl] messages: ${counts.messages.target}/${counts.messages.source}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSE + VERIFY
  // ═══════════════════════════════════════════════════════════════════════════

  await mongo.close();
  saveIdMap();

  // ── row-count verification (source vs migrated) ───────────────────────────
  console.log('\n[etl] ─── row-count verification ───');
  for (const [name, c] of Object.entries(counts)) {
    const flag = c.source === c.target ? 'OK' : 'MISMATCH';
    console.log(`  ${name.padEnd(24)} source=${c.source}  target=${c.target}  [${flag}]`);
  }

  // ── actual postgres row counts ────────────────────────────────────────────
  console.log('\n[etl] ─── postgres row counts ───');
  const pgCounts = await Promise.all([
    prisma.lmsTenant.count().then((n) => ['tenants', n]),
    prisma.lmsUser.count().then((n) => ['users', n]),
    prisma.lmsUserAvailabilitySlot.count().then((n) => ['user_availability_slots', n]),
    prisma.lmsUserParent.count().then((n) => ['user_parents', n]),
    prisma.lmsGroup.count().then((n) => ['groups', n]),
    prisma.lmsGroupMember.count().then((n) => ['group_members', n]),
    prisma.lmsCourse.count().then((n) => ['courses', n]),
    prisma.lmsModule.count().then((n) => ['modules', n]),
    prisma.lmsLesson.count().then((n) => ['lessons', n]),
    prisma.lmsMasterCourse.count().then((n) => ['master_courses', n]),
    prisma.lmsMasterCourseSelectedTenant.count().then((n) => ['master_course_selected_tenants', n]),
    prisma.lmsAssessment.count().then((n) => ['assessments', n]),
    prisma.lmsProgress.count().then((n) => ['progress', n]),
    prisma.lmsCounter.count().then((n) => ['counters', n]),
    prisma.lmsSection.count().then((n) => ['sections', n]),
    prisma.lmsSubject.count().then((n) => ['subjects', n]),
    prisma.lmsEmailTemplate.count().then((n) => ['email_templates', n]),
    prisma.lmsCourseAssignment.count().then((n) => ['course_assignments', n]),
    prisma.lmsTenantLog.count().then((n) => ['tenant_logs', n]),
    prisma.lmsPrivacyAuditLog.count().then((n) => ['privacy_audit_logs', n]),
    prisma.lmsCertificate.count().then((n) => ['certificates', n]),
    prisma.lmsCertificateIssued.count().then((n) => ['certificates_issued', n]),
    prisma.lmsQuizAttempt.count().then((n) => ['quiz_attempts', n]),
    prisma.lmsNonTeachingTask.count().then((n) => ['non_teaching_tasks', n]),
    prisma.lmsTutoringRequest.count().then((n) => ['tutoring_requests', n]),
    prisma.lmsCreditPackage.count().then((n) => ['credit_packages', n]),
    prisma.lmsCreditTransaction.count().then((n) => ['credit_transactions', n]),
    prisma.lmsBatch.count().then((n) => ['batches', n]),
    prisma.lmsBatchSchedule.count().then((n) => ['batch_schedule', n]),
    prisma.lmsBatchStudent.count().then((n) => ['batch_students', n]),
    prisma.lmsScheduledClass.count().then((n) => ['scheduled_classes', n]),
    prisma.lmsAttendance.count().then((n) => ['attendance', n]),
    prisma.lmsHomework.count().then((n) => ['homework', n]),
    prisma.lmsHomeworkSubmission.count().then((n) => ['homework_submissions', n]),
    prisma.lmsMeeting.count().then((n) => ['meetings', n]),
    prisma.lmsMeetingAttendance.count().then((n) => ['meeting_attendance', n]),
    prisma.lmsTeacherLevel.count().then((n) => ['teacher_levels', n]),
    prisma.lmsTeacherLevelHistory.count().then((n) => ['teacher_level_history', n]),
    prisma.lmsTeacherPayout.count().then((n) => ['teacher_payouts', n]),
    prisma.lmsPayoutAdjustment.count().then((n) => ['payout_adjustments', n]),
    prisma.lmsPayoutCompletedClass.count().then((n) => ['payout_completed_classes', n]),
    prisma.lmsCallEscalation.count().then((n) => ['call_escalations', n]),
    prisma.lmsCallEscalationAttempt.count().then((n) => ['call_escalation_attempts', n]),
    prisma.lmsStudentReminderCall.count().then((n) => ['student_reminder_calls', n]),
    prisma.lmsStudentReminderCallAttempt.count().then((n) => ['student_reminder_call_attempts', n]),
    prisma.lmsQuizProctoringSession.count().then((n) => ['quiz_proctoring_sessions', n]),
    prisma.lmsQuizProctoringLog.count().then((n) => ['quiz_proctoring_logs', n]),
    prisma.lmsQuizIncidentReport.count().then((n) => ['quiz_incident_reports', n]),
    prisma.lmsConversation.count().then((n) => ['conversations', n]),
    prisma.lmsConversationParticipant.count().then((n) => ['conversation_participants', n]),
    prisma.lmsMessage.count().then((n) => ['messages', n]),
  ]);
  for (const [table, n] of pgCounts) {
    if ((n as number) > 0) console.log(`  ${(table as string).padEnd(36)} ${n}`);
  }

  console.log('\n[etl] done. id map saved to', IDMAP_PATH);
  await prisma.$disconnect();
}

// ── Enum value remaps where Mongo stored the literal display string ────────────
interface SimpleOpts { statusMap?: Record<string, string> }

async function migrateSimple(
  db: import('mongodb').Db,
  collection: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: (m: any) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (data: any) => Promise<unknown>,
  opts: SimpleOpts = {},
) {
  const docs = await db.collection(collection).find().toArray();
  counts[collection] = { source: docs.length, target: 0 };
  for (const m of docs) {
    try {
      const data = map(m as Record<string, unknown>);
      if (opts.statusMap && typeof data.status === 'string' && opts.statusMap[data.status]) data.status = opts.statusMap[data.status];
      await create(data);
      counts[collection].target++;
    } catch (e) {
      console.warn(`[etl] ${collection} skip`, m._id, (e as Error).message);
    }
  }
  saveIdMap();
  console.log(`[etl] ${collection}: ${counts[collection].target}/${counts[collection].source}`);
}

main().catch((e: any) => { console.error('[etl] FATAL', e); process.exit(1); });
