/**
 * Seed — comprehensive demo data for all major tables.
 * Covers both corporate (Acme Corp) and school (Bright School) tenants.
 * All demo users share the password below.
 *
 *   npx tsx prisma/seed.ts   (or: npm run db:seed)
 */
import { PrismaClient, type LmsUserRole as UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'Passw0rd!';

const CORP_ID   = '11111111-1111-1111-1111-111111111111';
const SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

// Fixed user IDs — keep in sync with lib/auth/context.ts
const U = {
  SA:         '00000000-0000-0000-0000-0000000000aa',
  // Corporate
  CORP_ADMIN: '1111aaaa-0000-0000-0000-000000000001',
  CORP_SUB:   '1111aaaa-0000-0000-0000-000000000002',
  CORP_MGR:   '1111aaaa-0000-0000-0000-000000000003',
  CORP_L1:    '1111aaaa-0000-0000-0000-000000000004', // Leo Learner
  CORP_L2:    '1111aaaa-0000-0000-0000-000000000005', // Emma Employee
  CORP_L3:    '1111aaaa-0000-0000-0000-000000000006', // Jake Engineer
  CORP_MGR2:  '1111aaaa-0000-0000-0000-000000000007', // Nick Manager
  // School
  SCH_ADMIN:  '2222bbbb-0000-0000-0000-000000000001',
  SCH_T1:     '2222bbbb-0000-0000-0000-000000000003', // Tara Teacher
  SCH_P1:     '2222bbbb-0000-0000-0000-000000000004', // Param Parent
  SCH_S1:     '2222bbbb-0000-0000-0000-000000000005', // Sara Student
  SCH_T2:     '2222bbbb-0000-0000-0000-000000000006', // Raj Kumar (Teacher)
  SCH_S2:     '2222bbbb-0000-0000-0000-000000000007', // Arjun Mehta (Student)
  SCH_S3:     '2222bbbb-0000-0000-0000-000000000008', // Meera Gupta (Student)
  SCH_P2:     '2222bbbb-0000-0000-0000-000000000009', // Priti Sharma (Parent)
};

const CORP_FEAT = {
  enableCourses: true, enableScorm: true, enableCompliance: true, enableManagerReports: true,
  enableMessaging: true, enableCertificates: true, enableAnalytics: true,
};
const SCH_FEAT = {
  enableBatches: true, enableAttendance: true, enableHomework: true, enableCredits: true,
  enablePayouts: true, enableVideoClasses: true, enableParentPortal: true,
  enableMessaging: true, enableCertificates: true, enableAnalytics: true,
};

/**
 * `hash` is accepted but no longer stored: LmsUser's credential columns
 * (password / mustChangePassword / passwordSetup* / provider* / activeSessionId)
 * were dropped — credentials live only on `auth.User`, owned by the central
 * auth service. The parameter is kept so the ~30 call sites below need no edit;
 * seeded users sign in through SSO, not through this row.
 */
async function upsertUser(
  id: string, email: string, role: UserRole, orgId: string | null,
  first: string, last: string, _hash: string, extra: Record<string, unknown> = {},
) {
  await prisma.lmsUser.upsert({
    where: { id },
    create: { id, email, firstName: first, lastName: last, role, orgId, isActive: true, ...extra },
    update: { email, role, orgId, firstName: first, lastName: last, ...extra },
  });
}

async function main() {
  // Hardcoded demo tenants (Acme / Bright, fixed UUIDs) are NOT orgId-native —
  // their ids don't correspond to any platform Org. QuikLMS is now orgId-native
  // (Tenant.id === platform Org.id), so this fixture seed is OFF by default.
  // Real tenants come from onboarding / the platform. Set SEED_DEMO_TENANTS=true
  // only for isolated local testing that doesn't touch the platform.
  if (process.env.SEED_DEMO_TENANTS !== 'true') {
    console.log(
      '[seed] Hardcoded demo tenants are disabled (orgId-native). ' +
        'Set SEED_DEMO_TENANTS=true to seed the legacy Acme/Bright fixture.',
    );
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);

  // ── Tenants ──────────────────────────────────────────────────────────────
  await prisma.lmsTenant.upsert({
    where: { id: CORP_ID },
    update: { featureConfig: CORP_FEAT },
    create: {
      id: CORP_ID, name: 'Acme Corp', subdomain: 'acme', tenantType: 'corporate',
      tenantKey: 'tk_acme_demo', status: 'Active',
      orgName: 'Acme Corporation', fullAddress: '1 Acme Way', country: 'IN',
      officialPhone: '+910000000000', officialEmail: 'ops@acme.test',
      contactFirstName: 'Cora', contactLastName: 'Porate', contactPhone: '+910000000001',
      contactEmail: 'admin@acme.test', contactRoleInOrganization: 'L&D Head',
      billingFirstName: 'Cora', billingLastName: 'Porate', billingAddress: '1 Acme Way',
      featureConfig: CORP_FEAT,
    },
  });
  await prisma.lmsTenant.upsert({
    where: { id: SCHOOL_ID },
    update: { featureConfig: SCH_FEAT },
    create: {
      id: SCHOOL_ID, name: 'Bright School', subdomain: 'bright', tenantType: 'school',
      tenantKey: 'tk_bright_demo', status: 'Active',
      orgName: 'Bright Public School', fullAddress: '2 School Rd', country: 'IN',
      officialPhone: '+910000000010', officialEmail: 'office@bright.test',
      contactFirstName: 'Priya', contactLastName: 'Principal', contactPhone: '+910000000011',
      contactEmail: 'admin@bright.test', contactRoleInOrganization: 'Principal',
      billingFirstName: 'Priya', billingLastName: 'Principal', billingAddress: '2 School Rd',
      featureConfig: SCH_FEAT,
      schoolConfig: {
        academicYearStartMonth: 5,
        gradeLevels: ['LKG', 'UKG', '1', '2', '3', '4', '5'],
        subjects: ['Math', 'Science', 'English'],
        defaultCreditExpiryMonths: 6,
        defaultTeacherRatePerClass: 500,
      },
    },
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  await upsertUser(U.SA,         'superadmin@quikskill.test', 'SUPER_ADMIN', null,      'Super', 'Admin',     hash);
  await upsertUser(U.CORP_ADMIN, 'admin@acme.test',           'TENANT_ADMIN', CORP_ID,   'Aria',  'Admin',     hash);
  await upsertUser(U.CORP_SUB,   'subadmin@acme.test',        'SUB_ADMIN',    CORP_ID,   'Sam',   'SubAdmin',  hash);
  await upsertUser(U.CORP_MGR,   'manager@acme.test',         'MANAGER',      CORP_ID,   'Maya',  'Manager',   hash, { managerId: U.CORP_ADMIN });
  await upsertUser(U.CORP_MGR2,  'nick@acme.test',            'MANAGER',      CORP_ID,   'Nick',  'Manager',   hash, { managerId: U.CORP_ADMIN });
  await upsertUser(U.CORP_L1,    'learner@acme.test',         'LEARNER',      CORP_ID,   'Leo',   'Learner',   hash, { managerId: U.CORP_MGR,  employeeId: 'EMP-001', secondaryRole: 'SUB_ADMIN' });
  await upsertUser(U.CORP_L2,    'emma@acme.test',            'LEARNER',      CORP_ID,   'Emma',  'Employee',  hash, { managerId: U.CORP_MGR,  employeeId: 'EMP-002' });
  await upsertUser(U.CORP_L3,    'jake@acme.test',            'LEARNER',      CORP_ID,   'Jake',  'Engineer',  hash, { managerId: U.CORP_MGR2, employeeId: 'EMP-003' });
  await upsertUser(U.SCH_ADMIN,  'admin@bright.test',         'TENANT_ADMIN', SCHOOL_ID, 'Priya', 'Principal', hash);
  await upsertUser(U.SCH_T1,     'teacher@bright.test',       'TEACHER',      SCHOOL_ID, 'Tara',  'Teacher',   hash, { ratePerClass: 500.0, qualification: 'PGT' });
  await upsertUser(U.SCH_T2,     'raj@bright.test',           'TEACHER',      SCHOOL_ID, 'Raj',   'Kumar',     hash, { ratePerClass: 450.0, qualification: 'TGT' });
  await upsertUser(U.SCH_P1,     'parent@bright.test',        'PARENT',       SCHOOL_ID, 'Param', 'Parent',    hash);
  await upsertUser(U.SCH_P2,     'priti@bright.test',         'PARENT',       SCHOOL_ID, 'Priti', 'Sharma',    hash);
  await upsertUser(U.SCH_S1,     'student@bright.test',       'LEARNER',      SCHOOL_ID, 'Sara',  'Student',   hash, { grade: '5', section: 'A', studentId: 'STU-001' });
  await upsertUser(U.SCH_S2,     'arjun@bright.test',         'LEARNER',      SCHOOL_ID, 'Arjun', 'Mehta',     hash, { grade: '5', section: 'A', studentId: 'STU-002' });
  await upsertUser(U.SCH_S3,     'meera@bright.test',         'LEARNER',      SCHOOL_ID, 'Meera', 'Gupta',     hash, { grade: '5', section: 'B', studentId: 'STU-003' });

  // ── Parent ↔ Child links ──────────────────────────────────────────────────
  await prisma.lmsUserParent.upsert({ where: { parentId_childId: { parentId: U.SCH_P1, childId: U.SCH_S1 } }, create: { parentId: U.SCH_P1, childId: U.SCH_S1 }, update: {} });
  await prisma.lmsUserParent.upsert({ where: { parentId_childId: { parentId: U.SCH_P2, childId: U.SCH_S2 } }, create: { parentId: U.SCH_P2, childId: U.SCH_S2 }, update: {} });

  // ── Groups (corporate) ────────────────────────────────────────────────────
  const GRP_ENG   = 'gg-eng-00001';
  const GRP_SALES = 'gg-sales-0002';
  await prisma.lmsGroup.upsert({ where: { id: GRP_ENG   }, create: { id: GRP_ENG,   orgId: CORP_ID, name: 'Engineering Team', description: 'All engineering employees', createdBy: U.CORP_ADMIN }, update: {} });
  await prisma.lmsGroup.upsert({ where: { id: GRP_SALES }, create: { id: GRP_SALES, orgId: CORP_ID, name: 'Sales Team',        description: 'Sales & business development', createdBy: U.CORP_ADMIN }, update: {} });
  for (const [gid, uid] of [
    [GRP_ENG, U.CORP_L1], [GRP_ENG, U.CORP_L3],
    [GRP_SALES, U.CORP_L2], [GRP_SALES, U.CORP_MGR],
  ] as [string, string][]) {
    await prisma.lmsGroupMember.upsert({ where: { groupId_userId: { groupId: gid, userId: uid } }, create: { groupId: gid, userId: uid }, update: {} });
  }

  // ── Courses ───────────────────────────────────────────────────────────────
  const CRS = {
    SAFETY:  'c-safety-corp-01',
    LEADER:  'c-leader-corp-02',
    GDPR:    'c-gdpr-corp-003',
    MATH:    'c-math-sch-0001',
    SCIENCE: 'c-science-sch-2',
  };
  await prisma.lmsCourse.upsert({ where: { id: CRS.SAFETY  }, create: { id: CRS.SAFETY,  orgId: CORP_ID,   title: 'Workplace Safety & Compliance', category: 'Safety',     description: 'Essential safety procedures for all employees.',               authorId: U.CORP_ADMIN, status: 'Published' }, update: { status: 'Published' } });
  await prisma.lmsCourse.upsert({ where: { id: CRS.LEADER  }, create: { id: CRS.LEADER,  orgId: CORP_ID,   title: 'Leadership Essentials',         category: 'Leadership', description: 'Core leadership skills for managers and aspiring leaders.',    authorId: U.CORP_ADMIN, status: 'Published' }, update: { status: 'Published' } });
  await prisma.lmsCourse.upsert({ where: { id: CRS.GDPR    }, create: { id: CRS.GDPR,    orgId: CORP_ID,   title: 'GDPR & Data Privacy',           category: 'Compliance', description: 'GDPR requirements and data protection best practices.',       authorId: U.CORP_ADMIN, status: 'Published' }, update: { status: 'Published' } });
  await prisma.lmsCourse.upsert({ where: { id: CRS.MATH    }, create: { id: CRS.MATH,    orgId: SCHOOL_ID, title: 'Mathematics Grade 5',           category: 'Math',       description: 'Grade 5 mathematics: fractions, geometry, and algebra.',     authorId: U.SCH_ADMIN,  status: 'Published' }, update: { status: 'Published' } });
  await prisma.lmsCourse.upsert({ where: { id: CRS.SCIENCE }, create: { id: CRS.SCIENCE, orgId: SCHOOL_ID, title: 'Science Grade 5',               category: 'Science',    description: 'Grade 5 science: plants, animals, matter, and basic physics.', authorId: U.SCH_ADMIN, status: 'Published' }, update: { status: 'Published' } });

  // ── Modules ───────────────────────────────────────────────────────────────
  const mods = [
    { id: 'mod-s1', courseId: CRS.SAFETY,  title: 'Introduction to Safety',   orderIndex: 1, orgId: CORP_ID   },
    { id: 'mod-s2', courseId: CRS.SAFETY,  title: 'Emergency Procedures',     orderIndex: 2, orgId: CORP_ID   },
    { id: 'mod-l1', courseId: CRS.LEADER,  title: 'Communication Skills',     orderIndex: 1, orgId: CORP_ID   },
    { id: 'mod-l2', courseId: CRS.LEADER,  title: 'Team Management',          orderIndex: 2, orgId: CORP_ID   },
    { id: 'mod-g1', courseId: CRS.GDPR,    title: 'GDPR Fundamentals',        orderIndex: 1, orgId: CORP_ID   },
    { id: 'mod-g2', courseId: CRS.GDPR,    title: 'Data Subject Rights',      orderIndex: 2, orgId: CORP_ID   },
    { id: 'mod-m1', courseId: CRS.MATH,    title: 'Fractions & Decimals',     orderIndex: 1, orgId: SCHOOL_ID },
    { id: 'mod-m2', courseId: CRS.MATH,    title: 'Geometry Basics',          orderIndex: 2, orgId: SCHOOL_ID },
    { id: 'mod-c1', courseId: CRS.SCIENCE, title: 'Living World',             orderIndex: 1, orgId: SCHOOL_ID },
    { id: 'mod-c2', courseId: CRS.SCIENCE, title: 'Matter & Materials',       orderIndex: 2, orgId: SCHOOL_ID },
  ];
  for (const m of mods) {
    await prisma.lmsModule.upsert({ where: { id: m.id }, create: m, update: {} });
  }

  // ── Lessons ───────────────────────────────────────────────────────────────
  const lessons = [
    { id: 'les-s1-1', moduleId: 'mod-s1', title: 'Safety Overview',            type: 'Video', orderIndex: 1, duration: 15 },
    { id: 'les-s1-2', moduleId: 'mod-s1', title: 'Safety Knowledge Check',     type: 'Quiz',  orderIndex: 2 },
    { id: 'les-s2-1', moduleId: 'mod-s2', title: 'Fire Exit Procedures (PDF)', type: 'PDF',   orderIndex: 1, duration: 10 },
    { id: 'les-s2-2', moduleId: 'mod-s2', title: 'First Aid Basics',           type: 'Video', orderIndex: 2, duration: 12 },
    { id: 'les-l1-1', moduleId: 'mod-l1', title: 'Active Listening',           type: 'Video', orderIndex: 1, duration: 20 },
    { id: 'les-l2-1', moduleId: 'mod-l2', title: 'Delegation Framework',       type: 'Video', orderIndex: 1, duration: 25 },
    { id: 'les-g1-1', moduleId: 'mod-g1', title: 'What is GDPR?',              type: 'Text',  orderIndex: 1 },
    { id: 'les-g1-2', moduleId: 'mod-g1', title: 'GDPR Assessment',            type: 'Quiz',  orderIndex: 2 },
    { id: 'les-g2-1', moduleId: 'mod-g2', title: 'Right to Erasure',           type: 'Video', orderIndex: 1, duration: 18 },
    { id: 'les-m1-1', moduleId: 'mod-m1', title: 'Adding Fractions',           type: 'Video', orderIndex: 1, duration: 18 },
    { id: 'les-m1-2', moduleId: 'mod-m1', title: 'Fractions Quiz',             type: 'Quiz',  orderIndex: 2 },
    { id: 'les-m2-1', moduleId: 'mod-m2', title: 'Shapes & Angles',            type: 'Video', orderIndex: 1, duration: 22 },
    { id: 'les-c1-1', moduleId: 'mod-c1', title: 'Plants & Photosynthesis',    type: 'Video', orderIndex: 1, duration: 20 },
    { id: 'les-c2-1', moduleId: 'mod-c2', title: 'States of Matter',           type: 'Video', orderIndex: 1, duration: 16 },
  ];
  for (const l of lessons) {
    await prisma.lmsLesson.upsert({ where: { id: l.id }, create: l as any, update: {} });
  }

  // ── Course Assignments ────────────────────────────────────────────────────
  const assignments = [
    { id: 'ca-001', orgId: CORP_ID, courseId: CRS.SAFETY, targetType: 'USER',  targetId: U.CORP_L1,  isMandatory: true,  assignedBy: U.CORP_ADMIN, dueDate: new Date('2026-07-31') },
    { id: 'ca-002', orgId: CORP_ID, courseId: CRS.SAFETY, targetType: 'GROUP', targetId: GRP_ENG,    isMandatory: true,  assignedBy: U.CORP_ADMIN, dueDate: new Date('2026-07-31') },
    { id: 'ca-003', orgId: CORP_ID, courseId: CRS.LEADER, targetType: 'USER',  targetId: U.CORP_MGR, isMandatory: false, assignedBy: U.CORP_ADMIN },
    { id: 'ca-004', orgId: CORP_ID, courseId: CRS.GDPR,   targetType: 'GROUP', targetId: GRP_SALES,  isMandatory: true,  assignedBy: U.CORP_SUB,   dueDate: new Date('2026-08-15') },
    { id: 'ca-005', orgId: CORP_ID, courseId: CRS.GDPR,   targetType: 'USER',  targetId: U.CORP_L2,  isMandatory: true,  assignedBy: U.CORP_ADMIN, dueDate: new Date('2026-08-15') },
    { id: 'ca-006', orgId: CORP_ID, courseId: CRS.SAFETY, targetType: 'USER',  targetId: U.CORP_L2,  isMandatory: true,  assignedBy: U.CORP_ADMIN, dueDate: new Date('2026-07-31') },
    { id: 'ca-007', orgId: CORP_ID, courseId: CRS.LEADER, targetType: 'GROUP', targetId: GRP_ENG,    isMandatory: false, assignedBy: U.CORP_ADMIN },
  ];
  for (const a of assignments) {
    await prisma.lmsCourseAssignment.upsert({ where: { id: a.id }, create: a as any, update: {} });
  }

  // ── Progress ──────────────────────────────────────────────────────────────
  const progressRecs = [
    { id: 'pg-001', orgId: CORP_ID,   learnerId: U.CORP_L1, courseId: CRS.SAFETY, status: 'Completed',  completionPercentage: 100, isPassed: true,  completedAt: new Date('2026-06-01'), startedAt: new Date('2026-05-01') },
    { id: 'pg-002', orgId: CORP_ID,   learnerId: U.CORP_L1, courseId: CRS.LEADER, status: 'InProgress', completionPercentage: 60,  startedAt: new Date('2026-06-05') },
    { id: 'pg-003', orgId: CORP_ID,   learnerId: U.CORP_L2, courseId: CRS.SAFETY, status: 'InProgress', completionPercentage: 40,  startedAt: new Date('2026-06-10') },
    { id: 'pg-004', orgId: CORP_ID,   learnerId: U.CORP_L2, courseId: CRS.GDPR,   status: 'NotStarted', completionPercentage: 0,   startedAt: new Date('2026-06-15') },
    { id: 'pg-005', orgId: CORP_ID,   learnerId: U.CORP_L3, courseId: CRS.SAFETY, status: 'Completed',  completionPercentage: 100, isPassed: true,  completedAt: new Date('2026-06-10'), startedAt: new Date('2026-05-15') },
    { id: 'pg-006', orgId: CORP_ID,   learnerId: U.CORP_L3, courseId: CRS.GDPR,   status: 'InProgress', completionPercentage: 75,  startedAt: new Date('2026-06-12') },
    { id: 'pg-007', orgId: CORP_ID,   learnerId: U.CORP_MGR,courseId: CRS.LEADER, status: 'Completed',  completionPercentage: 100, isPassed: true,  completedAt: new Date('2026-06-18'), startedAt: new Date('2026-06-01') },
    { id: 'pg-008', orgId: SCHOOL_ID, learnerId: U.SCH_S1,  courseId: CRS.MATH,   status: 'Completed',  completionPercentage: 100, isPassed: true,  completedAt: new Date('2026-05-20'), startedAt: new Date('2026-04-01') },
    { id: 'pg-009', orgId: SCHOOL_ID, learnerId: U.SCH_S2,  courseId: CRS.MATH,   status: 'InProgress', completionPercentage: 50,  startedAt: new Date('2026-04-15') },
    { id: 'pg-010', orgId: SCHOOL_ID, learnerId: U.SCH_S3,  courseId: CRS.MATH,   status: 'InProgress', completionPercentage: 30,  startedAt: new Date('2026-05-01') },
    { id: 'pg-011', orgId: SCHOOL_ID, learnerId: U.SCH_S1,  courseId: CRS.SCIENCE,status: 'InProgress', completionPercentage: 65,  startedAt: new Date('2026-05-01') },
    { id: 'pg-012', orgId: SCHOOL_ID, learnerId: U.SCH_S2,  courseId: CRS.SCIENCE,status: 'NotStarted', completionPercentage: 0,   startedAt: new Date('2026-06-01') },
  ];
  for (const p of progressRecs) {
    await prisma.lmsProgress.upsert({ where: { id: p.id }, create: p as any, update: {} });
  }

  // ── Certificate template ──────────────────────────────────────────────────
  const CERT_TPL_CORP   = 'cert-tpl-acme-01';
  const CERT_TPL_SCHOOL = 'cert-tpl-bright-1';
  await prisma.lmsCertificate.upsert({
    where: { id: CERT_TPL_CORP },
    create: {
      id: CERT_TPL_CORP, orgId: CORP_ID, name: 'Acme Course Completion Certificate',
      backgroundImageUrl: 'https://placehold.co/1200x850/1d4ed8/ffffff?text=Certificate',
      designation: 'Chief Learning Officer', signatoryName: 'Aria Admin', approvalStatus: 'approved', isActive: true,
    },
    update: {},
  });
  await prisma.lmsCertificate.upsert({
    where: { id: CERT_TPL_SCHOOL },
    create: {
      id: CERT_TPL_SCHOOL, orgId: SCHOOL_ID, name: 'Bright School Academic Achievement',
      backgroundImageUrl: 'https://placehold.co/1200x850/065f46/ffffff?text=Certificate',
      designation: 'Principal', signatoryName: 'Priya Principal', approvalStatus: 'approved', isActive: true,
    },
    update: {},
  });

  // ── Issued Certificates ───────────────────────────────────────────────────
  await prisma.lmsCertificateIssued.upsert({
    where: { id: 'ci-001' },
    create: { id: 'ci-001', orgId: CORP_ID,   learnerId: U.CORP_L1,  courseId: CRS.SAFETY,  certificateTemplateId: CERT_TPL_CORP,   courseName: 'Workplace Safety & Compliance', learnerName: 'Leo Learner',   certificateId: 'QS-CERT-20260601-001', verificationUrl: 'https://quikskill.test/verify/QS-CERT-20260601-001', issuedAt: new Date('2026-06-01'), score: 92, passingScore: 70, passed: true, pdfUrl: '', qrCodeUrl: '' },
    update: {},
  });
  await prisma.lmsCertificateIssued.upsert({
    where: { id: 'ci-002' },
    create: { id: 'ci-002', orgId: CORP_ID,   learnerId: U.CORP_L3,  courseId: CRS.SAFETY,  certificateTemplateId: CERT_TPL_CORP,   courseName: 'Workplace Safety & Compliance', learnerName: 'Jake Engineer', certificateId: 'QS-CERT-20260610-002', verificationUrl: 'https://quikskill.test/verify/QS-CERT-20260610-002', issuedAt: new Date('2026-06-10'), score: 88, passingScore: 70, passed: true, pdfUrl: '', qrCodeUrl: '' },
    update: {},
  });
  await prisma.lmsCertificateIssued.upsert({
    where: { id: 'ci-003' },
    create: { id: 'ci-003', orgId: CORP_ID,   learnerId: U.CORP_MGR, courseId: CRS.LEADER,  certificateTemplateId: CERT_TPL_CORP,   courseName: 'Leadership Essentials',         learnerName: 'Maya Manager',  certificateId: 'QS-CERT-20260618-003', verificationUrl: 'https://quikskill.test/verify/QS-CERT-20260618-003', issuedAt: new Date('2026-06-18'), score: 95, passingScore: 70, passed: true, pdfUrl: '', qrCodeUrl: '' },
    update: {},
  });
  await prisma.lmsCertificateIssued.upsert({
    where: { id: 'ci-004' },
    create: { id: 'ci-004', orgId: SCHOOL_ID, learnerId: U.SCH_S1,   courseId: CRS.MATH,    certificateTemplateId: CERT_TPL_SCHOOL, courseName: 'Mathematics Grade 5',           learnerName: 'Sara Student',  certificateId: 'QS-CERT-20260520-004', verificationUrl: 'https://quikskill.test/verify/QS-CERT-20260520-004', issuedAt: new Date('2026-05-20'), score: 95, passingScore: 60, passed: true, pdfUrl: '', qrCodeUrl: '' },
    update: {},
  });

  // ── Batches (school) ──────────────────────────────────────────────────────
  const BATCH_MATH = 'batch-math-5a-01';
  const BATCH_SCI  = 'batch-sci-5a-001';
  await prisma.lmsBatch.upsert({
    where: { id: BATCH_MATH },
    create: {
      id: BATCH_MATH, orgId: SCHOOL_ID, name: 'Math 5A', grade: '5', section: 'A', subject: 'Math',
      teacherId: U.SCH_T1, academicYear: '2025-26', term: 'Term 1',
      startDate: new Date('2025-06-01'), endDate: new Date('2025-11-30'),
      maxCapacity: 30, creditPerClass: 1, ratePerClass: 500, status: 'active',
      createdBy: U.SCH_ADMIN, defaultMeetingProvider: 'jitsi',
    },
    update: {},
  });
  await prisma.lmsBatch.upsert({
    where: { id: BATCH_SCI },
    create: {
      id: BATCH_SCI, orgId: SCHOOL_ID, name: 'Science 5A', grade: '5', section: 'A', subject: 'Science',
      teacherId: U.SCH_T2, academicYear: '2025-26', term: 'Term 1',
      startDate: new Date('2025-06-01'), endDate: new Date('2025-11-30'),
      maxCapacity: 30, creditPerClass: 1, ratePerClass: 450, status: 'active',
      createdBy: U.SCH_ADMIN, defaultMeetingProvider: 'jitsi',
    },
    update: {},
  });

  // ── Batch Students ────────────────────────────────────────────────────────
  for (const [batchId, studentId] of [
    [BATCH_MATH, U.SCH_S1], [BATCH_MATH, U.SCH_S2], [BATCH_MATH, U.SCH_S3],
    [BATCH_SCI,  U.SCH_S1], [BATCH_SCI,  U.SCH_S2],
  ] as [string, string][]) {
    await prisma.lmsBatchStudent.upsert({ where: { batchId_studentId: { batchId, studentId } }, create: { batchId, studentId }, update: {} });
  }

  // ── Batch Schedule ────────────────────────────────────────────────────────
  for (const s of [
    { id: 'bs-m1', batchId: BATCH_MATH, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
    { id: 'bs-m2', batchId: BATCH_MATH, dayOfWeek: 3, startTime: '09:00', endTime: '10:00' },
    { id: 'bs-s1', batchId: BATCH_SCI,  dayOfWeek: 2, startTime: '10:00', endTime: '11:00' },
    { id: 'bs-s2', batchId: BATCH_SCI,  dayOfWeek: 4, startTime: '10:00', endTime: '11:00' },
  ]) {
    await prisma.lmsBatchSchedule.upsert({ where: { id: s.id }, create: s, update: {} });
  }

  // ── Scheduled Classes ─────────────────────────────────────────────────────
  const classes = [
    { id: 'sc-m1', orgId: SCHOOL_ID, batchId: BATCH_MATH, teacherId: U.SCH_T1, title: 'Math Class 1 – Fractions',    startTime: new Date('2026-06-02T09:00:00Z'), endTime: new Date('2026-06-02T10:00:00Z'), status: 'completed' },
    { id: 'sc-m2', orgId: SCHOOL_ID, batchId: BATCH_MATH, teacherId: U.SCH_T1, title: 'Math Class 2 – Decimals',     startTime: new Date('2026-06-04T09:00:00Z'), endTime: new Date('2026-06-04T10:00:00Z'), status: 'completed' },
    { id: 'sc-m3', orgId: SCHOOL_ID, batchId: BATCH_MATH, teacherId: U.SCH_T1, title: 'Math Class 3 – Geometry',     startTime: new Date('2026-06-09T09:00:00Z'), endTime: new Date('2026-06-09T10:00:00Z'), status: 'completed' },
    { id: 'sc-m4', orgId: SCHOOL_ID, batchId: BATCH_MATH, teacherId: U.SCH_T1, title: 'Math Class 4 – Angles',       startTime: new Date('2026-06-25T09:00:00Z'), endTime: new Date('2026-06-25T10:00:00Z'), status: 'scheduled' },
    { id: 'sc-s1', orgId: SCHOOL_ID, batchId: BATCH_SCI,  teacherId: U.SCH_T2, title: 'Science Class 1 – Plants',    startTime: new Date('2026-06-03T10:00:00Z'), endTime: new Date('2026-06-03T11:00:00Z'), status: 'completed' },
    { id: 'sc-s2', orgId: SCHOOL_ID, batchId: BATCH_SCI,  teacherId: U.SCH_T2, title: 'Science Class 2 – Animals',   startTime: new Date('2026-06-10T10:00:00Z'), endTime: new Date('2026-06-10T11:00:00Z'), status: 'completed' },
    { id: 'sc-s3', orgId: SCHOOL_ID, batchId: BATCH_SCI,  teacherId: U.SCH_T2, title: 'Science Class 3 – Matter',    startTime: new Date('2026-06-26T10:00:00Z'), endTime: new Date('2026-06-26T11:00:00Z'), status: 'scheduled' },
  ];
  for (const c of classes) {
    await prisma.lmsScheduledClass.upsert({ where: { id: c.id }, create: c as any, update: {} });
  }

  // ── Attendance ────────────────────────────────────────────────────────────
  const attRecs = [
    // Math Class 1
    { id: 'att-001', orgId: SCHOOL_ID, scheduledClassId: 'sc-m1', batchId: BATCH_MATH, studentId: U.SCH_S1, markedBy: U.SCH_T1, status: 'present', classDate: new Date('2026-06-02') },
    { id: 'att-002', orgId: SCHOOL_ID, scheduledClassId: 'sc-m1', batchId: BATCH_MATH, studentId: U.SCH_S2, markedBy: U.SCH_T1, status: 'present', classDate: new Date('2026-06-02') },
    { id: 'att-003', orgId: SCHOOL_ID, scheduledClassId: 'sc-m1', batchId: BATCH_MATH, studentId: U.SCH_S3, markedBy: U.SCH_T1, status: 'absent',  classDate: new Date('2026-06-02') },
    // Math Class 2
    { id: 'att-004', orgId: SCHOOL_ID, scheduledClassId: 'sc-m2', batchId: BATCH_MATH, studentId: U.SCH_S1, markedBy: U.SCH_T1, status: 'present', classDate: new Date('2026-06-04') },
    { id: 'att-005', orgId: SCHOOL_ID, scheduledClassId: 'sc-m2', batchId: BATCH_MATH, studentId: U.SCH_S2, markedBy: U.SCH_T1, status: 'late',    classDate: new Date('2026-06-04') },
    { id: 'att-006', orgId: SCHOOL_ID, scheduledClassId: 'sc-m2', batchId: BATCH_MATH, studentId: U.SCH_S3, markedBy: U.SCH_T1, status: 'present', classDate: new Date('2026-06-04') },
    // Math Class 3
    { id: 'att-007', orgId: SCHOOL_ID, scheduledClassId: 'sc-m3', batchId: BATCH_MATH, studentId: U.SCH_S1, markedBy: U.SCH_T1, status: 'present', classDate: new Date('2026-06-09') },
    { id: 'att-008', orgId: SCHOOL_ID, scheduledClassId: 'sc-m3', batchId: BATCH_MATH, studentId: U.SCH_S2, markedBy: U.SCH_T1, status: 'present', classDate: new Date('2026-06-09') },
    { id: 'att-009', orgId: SCHOOL_ID, scheduledClassId: 'sc-m3', batchId: BATCH_MATH, studentId: U.SCH_S3, markedBy: U.SCH_T1, status: 'present', classDate: new Date('2026-06-09') },
    // Science Class 1
    { id: 'att-010', orgId: SCHOOL_ID, scheduledClassId: 'sc-s1', batchId: BATCH_SCI,  studentId: U.SCH_S1, markedBy: U.SCH_T2, status: 'present', classDate: new Date('2026-06-03') },
    { id: 'att-011', orgId: SCHOOL_ID, scheduledClassId: 'sc-s1', batchId: BATCH_SCI,  studentId: U.SCH_S2, markedBy: U.SCH_T2, status: 'absent',  classDate: new Date('2026-06-03') },
    // Science Class 2
    { id: 'att-012', orgId: SCHOOL_ID, scheduledClassId: 'sc-s2', batchId: BATCH_SCI,  studentId: U.SCH_S1, markedBy: U.SCH_T2, status: 'present', classDate: new Date('2026-06-10') },
    { id: 'att-013', orgId: SCHOOL_ID, scheduledClassId: 'sc-s2', batchId: BATCH_SCI,  studentId: U.SCH_S2, markedBy: U.SCH_T2, status: 'present', classDate: new Date('2026-06-10') },
  ];
  for (const a of attRecs) {
    await prisma.lmsAttendance.upsert({ where: { id: a.id }, create: a as any, update: {} });
  }

  // ── Homework ──────────────────────────────────────────────────────────────
  const HW1 = 'hw-math-frac-01';
  const HW2 = 'hw-sci-plant-01';
  const HW3 = 'hw-math-geo-001';
  await prisma.lmsHomework.upsert({
    where: { id: HW1 },
    create: {
      id: HW1, orgId: SCHOOL_ID, batchId: BATCH_MATH, teacherId: U.SCH_T1,
      title: 'Fraction Addition Worksheet', description: 'Complete all 20 questions on fraction addition.',
      dueDate: new Date('2026-06-20'), assignedToStudentIds: [U.SCH_S1, U.SCH_S2, U.SCH_S3],
      maxScore: 20, status: 'published', type: 'assignment', publishedAt: new Date('2026-06-10'),
    },
    update: {},
  });
  await prisma.lmsHomework.upsert({
    where: { id: HW2 },
    create: {
      id: HW2, orgId: SCHOOL_ID, batchId: BATCH_SCI, teacherId: U.SCH_T2,
      title: 'Plant Life Cycle Diagram', description: 'Draw and label the life cycle of a flowering plant.',
      dueDate: new Date('2026-06-22'), assignedToStudentIds: [U.SCH_S1, U.SCH_S2],
      maxScore: 15, status: 'published', type: 'assignment', publishedAt: new Date('2026-06-11'),
    },
    update: {},
  });
  await prisma.lmsHomework.upsert({
    where: { id: HW3 },
    create: {
      id: HW3, orgId: SCHOOL_ID, batchId: BATCH_MATH, teacherId: U.SCH_T1,
      title: 'Geometry: Identify Shapes', description: 'Identify and classify 15 geometric shapes.',
      dueDate: new Date('2026-06-30'), assignedToStudentIds: [U.SCH_S1, U.SCH_S2, U.SCH_S3],
      maxScore: 15, status: 'published', type: 'assignment', publishedAt: new Date('2026-06-20'),
    },
    update: {},
  });

  // ── Homework Submissions ──────────────────────────────────────────────────
  for (const sub of [
    { id: 'hws-001', orgId: SCHOOL_ID, homeworkId: HW1, studentId: U.SCH_S1, submittedAt: new Date('2026-06-18'), isLate: false, status: 'graded',    score: 18, feedback: 'Excellent work! Keep it up.', gradedBy: U.SCH_T1, gradedAt: new Date('2026-06-19'), finalScore: 18 },
    { id: 'hws-002', orgId: SCHOOL_ID, homeworkId: HW1, studentId: U.SCH_S2, submittedAt: new Date('2026-06-19'), isLate: false, status: 'submitted' },
    { id: 'hws-003', orgId: SCHOOL_ID, homeworkId: HW1, studentId: U.SCH_S3, submittedAt: new Date('2026-06-21'), isLate: true,  status: 'submitted' },
    { id: 'hws-004', orgId: SCHOOL_ID, homeworkId: HW2, studentId: U.SCH_S1, submittedAt: new Date('2026-06-21'), isLate: false, status: 'graded',    score: 14, feedback: 'Great diagram, label the roots clearly.', gradedBy: U.SCH_T2, gradedAt: new Date('2026-06-22'), finalScore: 14 },
    { id: 'hws-005', orgId: SCHOOL_ID, homeworkId: HW2, studentId: U.SCH_S2, submittedAt: new Date('2026-06-22'), isLate: false, status: 'submitted' },
  ]) {
    await prisma.lmsHomeworkSubmission.upsert({ where: { id: sub.id }, create: sub as any, update: {} });
  }

  // ── Teacher Payouts ───────────────────────────────────────────────────────
  await prisma.lmsTeacherPayout.upsert({
    where: { id: 'tp-tara-june-1' },
    create: {
      id: 'tp-tara-june-1', orgId: SCHOOL_ID, teacherId: U.SCH_T1,
      periodStart: new Date('2026-06-01'), periodEnd: new Date('2026-06-30'),
      totalClassesCompleted: 3, ratePerClass: 500, rateType: 'per_class',
      grossAmount: 1500, totalBonus: 200, totalDeductions: 0, nonTeachingWorkAmount: 500, netAmount: 2200,
      status: 'pending',
    },
    update: {},
  });
  await prisma.lmsTeacherPayout.upsert({
    where: { id: 'tp-raj-june-01' },
    create: {
      id: 'tp-raj-june-01', orgId: SCHOOL_ID, teacherId: U.SCH_T2,
      periodStart: new Date('2026-06-01'), periodEnd: new Date('2026-06-30'),
      totalClassesCompleted: 2, ratePerClass: 450, rateType: 'per_class',
      grossAmount: 900, totalBonus: 0, totalDeductions: 0, nonTeachingWorkAmount: 0, netAmount: 900,
      status: 'draft',
    },
    update: {},
  });
  await prisma.lmsPayoutAdjustment.upsert({
    where: { id: 'pa-001' },
    create: { id: 'pa-001', payoutId: 'tp-tara-june-1', type: 'bonus', amount: 200, reason: 'Excellent parent feedback score this month', appliedBy: U.SCH_ADMIN },
    update: {},
  });

  // ── Credit Packages ───────────────────────────────────────────────────────
  await prisma.lmsCreditPackage.upsert({
    where: { id: 'cp-sara-june1' },
    create: {
      id: 'cp-sara-june1', orgId: SCHOOL_ID, studentId: U.SCH_S1,
      packageName: 'June Monthly Package', purchasedCredits: 20, usedCredits: 3, remainingCredits: 17,
      purchaseDate: new Date('2026-06-01'), expiresAt: new Date('2026-07-31'),
      status: 'active', price: 1000, allocatedBy: U.SCH_ADMIN,
    },
    update: {},
  });
  await prisma.lmsCreditPackage.upsert({
    where: { id: 'cp-arjun-jun1' },
    create: {
      id: 'cp-arjun-jun1', orgId: SCHOOL_ID, studentId: U.SCH_S2,
      packageName: 'June Monthly Package', purchasedCredits: 20, usedCredits: 2, remainingCredits: 18,
      purchaseDate: new Date('2026-06-01'), expiresAt: new Date('2026-07-31'),
      status: 'active', price: 1000, allocatedBy: U.SCH_ADMIN,
    },
    update: {},
  });
  for (const txn of [
    { id: 'ct-001', orgId: SCHOOL_ID, packageId: 'cp-sara-june1', studentId: U.SCH_S1, transactionType: 'deduct', amount: -1, balanceAfter: 19, relatedClassId: 'sc-m1', notes: 'Class deduction: Math Class 1' },
    { id: 'ct-002', orgId: SCHOOL_ID, packageId: 'cp-sara-june1', studentId: U.SCH_S1, transactionType: 'deduct', amount: -1, balanceAfter: 18, relatedClassId: 'sc-m2', notes: 'Class deduction: Math Class 2' },
    { id: 'ct-003', orgId: SCHOOL_ID, packageId: 'cp-sara-june1', studentId: U.SCH_S1, transactionType: 'deduct', amount: -1, balanceAfter: 17, relatedClassId: 'sc-s1', notes: 'Class deduction: Science Class 1' },
    { id: 'ct-004', orgId: SCHOOL_ID, packageId: 'cp-arjun-jun1', studentId: U.SCH_S2, transactionType: 'deduct', amount: -1, balanceAfter: 19, relatedClassId: 'sc-m1', notes: 'Class deduction: Math Class 1' },
    { id: 'ct-005', orgId: SCHOOL_ID, packageId: 'cp-arjun-jun1', studentId: U.SCH_S2, transactionType: 'deduct', amount: -1, balanceAfter: 18, relatedClassId: 'sc-m2', notes: 'Class deduction: Math Class 2' },
  ]) {
    await prisma.lmsCreditTransaction.upsert({ where: { id: txn.id }, create: txn as any, update: {} });
  }

  // ── Meetings ──────────────────────────────────────────────────────────────
  await prisma.lmsMeeting.upsert({
    where: { id: 'meet-sc-m1' },
    create: {
      id: 'meet-sc-m1', orgId: SCHOOL_ID, scheduledClassId: 'sc-m1', hostId: U.SCH_T1,
      provider: 'jitsi', joinUrl: 'https://meet.jit.si/bright-math-5a-sc-m1',
      scheduledStartTime: new Date('2026-06-02T09:00:00Z'), scheduledEndTime: new Date('2026-06-02T10:00:00Z'),
      actualStartTime: new Date('2026-06-02T09:01:00Z'), actualEndTime: new Date('2026-06-02T10:02:00Z'),
      status: 'ended', participantCount: 3, createdBy: U.SCH_T1, title: 'Math Class 1 – Fractions',
    },
    update: {},
  });
  await prisma.lmsMeeting.upsert({
    where: { id: 'meet-sc-m2' },
    create: {
      id: 'meet-sc-m2', orgId: SCHOOL_ID, scheduledClassId: 'sc-m2', hostId: U.SCH_T1,
      provider: 'jitsi', joinUrl: 'https://meet.jit.si/bright-math-5a-sc-m2',
      scheduledStartTime: new Date('2026-06-04T09:00:00Z'), scheduledEndTime: new Date('2026-06-04T10:00:00Z'),
      actualStartTime: new Date('2026-06-04T09:00:00Z'), actualEndTime: new Date('2026-06-04T10:05:00Z'),
      status: 'ended', participantCount: 3, createdBy: U.SCH_T1, title: 'Math Class 2 – Decimals',
    },
    update: {},
  });
  await prisma.lmsMeeting.upsert({
    where: { id: 'meet-sc-s1' },
    create: {
      id: 'meet-sc-s1', orgId: SCHOOL_ID, scheduledClassId: 'sc-s1', hostId: U.SCH_T2,
      provider: 'jitsi', joinUrl: 'https://meet.jit.si/bright-sci-5a-sc-s1',
      scheduledStartTime: new Date('2026-06-03T10:00:00Z'), scheduledEndTime: new Date('2026-06-03T11:00:00Z'),
      actualStartTime: new Date('2026-06-03T10:02:00Z'), actualEndTime: new Date('2026-06-03T11:01:00Z'),
      status: 'ended', participantCount: 2, createdBy: U.SCH_T2, title: 'Science Class 1 – Plants',
    },
    update: {},
  });
  for (const ma of [
    { id: 'ma-001', meetingId: 'meet-sc-m1', userId: U.SCH_T1, role: 'teacher', joinedAt: new Date('2026-06-02T09:01:00Z'), leftAt: new Date('2026-06-02T10:02:00Z'), durationMinutes: 61 },
    { id: 'ma-002', meetingId: 'meet-sc-m1', userId: U.SCH_S1, role: 'student', joinedAt: new Date('2026-06-02T09:02:00Z'), leftAt: new Date('2026-06-02T10:02:00Z'), durationMinutes: 60 },
    { id: 'ma-003', meetingId: 'meet-sc-m1', userId: U.SCH_S2, role: 'student', joinedAt: new Date('2026-06-02T09:03:00Z'), leftAt: new Date('2026-06-02T10:00:00Z'), durationMinutes: 57 },
  ]) {
    await prisma.lmsMeetingAttendance.upsert({ where: { id: ma.id }, create: ma as any, update: {} });
  }

  // ── Question Bank ─────────────────────────────────────────────────────────
  for (const q of [
    { id: 'q-001', orgId: SCHOOL_ID, createdBy: U.SCH_T1, subject: 'Math',       topic: 'Fractions',   difficulty: 'easy',   type: 'mcq',        text: 'What is 1/4 + 1/4?',                      options: [{ text: '1/2', isCorrect: true },{ text: '1/8', isCorrect: false },{ text: '2/8', isCorrect: false },{ text: '1/4', isCorrect: false }], points: 1 },
    { id: 'q-002', orgId: SCHOOL_ID, createdBy: U.SCH_T1, subject: 'Math',       topic: 'Fractions',   difficulty: 'medium', type: 'mcq',        text: 'What is 3/5 − 1/5?',                     options: [{ text: '2/5', isCorrect: true },{ text: '4/5', isCorrect: false },{ text: '2/10', isCorrect: false },{ text: '1/5', isCorrect: false }], points: 1 },
    { id: 'q-003', orgId: SCHOOL_ID, createdBy: U.SCH_T1, subject: 'Science',    topic: 'Plants',      difficulty: 'easy',   type: 'true_false', text: 'Photosynthesis requires sunlight.',        options: [{ text: 'True', isCorrect: true },{ text: 'False', isCorrect: false }], points: 1 },
    { id: 'q-004', orgId: SCHOOL_ID, createdBy: U.SCH_T1, subject: 'Math',       topic: 'Geometry',    difficulty: 'easy',   type: 'mcq',        text: 'How many sides does a hexagon have?',     options: [{ text: '6', isCorrect: true },{ text: '5', isCorrect: false },{ text: '7', isCorrect: false },{ text: '8', isCorrect: false }], points: 1 },
    { id: 'q-005', orgId: CORP_ID,   createdBy: U.CORP_ADMIN, subject: 'Safety', topic: 'Fire Safety', difficulty: 'easy',   type: 'mcq',        text: 'Fire emergency number in India?',         options: [{ text: '101', isCorrect: true },{ text: '100', isCorrect: false },{ text: '999', isCorrect: false },{ text: '112', isCorrect: false }], points: 2 },
    { id: 'q-006', orgId: CORP_ID,   createdBy: U.CORP_ADMIN, subject: 'Compliance', topic: 'GDPR',    difficulty: 'medium', type: 'mcq',        text: 'Maximum GDPR fine for serious violation?', options: [{ text: '€20M or 4% turnover', isCorrect: true },{ text: '€10M or 2% turnover', isCorrect: false },{ text: '€5M or 1% turnover', isCorrect: false },{ text: '€50M or 10% turnover', isCorrect: false }], points: 3 },
    { id: 'q-007', orgId: CORP_ID,   createdBy: U.CORP_ADMIN, subject: 'Safety',     topic: 'PPE',     difficulty: 'easy',   type: 'true_false', text: 'Hard hats must be worn in all site areas.',options: [{ text: 'True', isCorrect: true },{ text: 'False', isCorrect: false }], points: 1 },
  ]) {
    await prisma.lmsQuestion.upsert({ where: { id: q.id }, create: { ...q, options: q.options, isActive: true } as any, update: {} });
  }

  // ── Exams ─────────────────────────────────────────────────────────────────
  const EXAM1 = 'exam-math-mid1';
  const EXAM2 = 'exam-safety-01';
  await prisma.lmsExam.upsert({
    where: { id: EXAM1 },
    create: {
      id: EXAM1, orgId: SCHOOL_ID, createdBy: U.SCH_T1, batchId: BATCH_MATH,
      title: 'Math Mid-Term – Term 1', description: 'Mid-term covering fractions and geometry.',
      instructions: 'Answer all questions. No calculators.', subject: 'Math',
      duration: 60, totalMarks: 4, status: 'published',
      scheduledStartTime: new Date('2026-07-01T09:00:00Z'), scheduledEndTime: new Date('2026-07-01T10:00:00Z'),
    },
    update: {},
  });
  await prisma.lmsExam.upsert({
    where: { id: EXAM2 },
    create: {
      id: EXAM2, orgId: CORP_ID, createdBy: U.CORP_ADMIN,
      title: 'Workplace Safety Assessment', description: 'Annual safety knowledge assessment for all employees.',
      instructions: 'Complete within 30 minutes. All questions are mandatory.', subject: 'Safety',
      duration: 30, totalMarks: 6, status: 'published',
      scheduledStartTime: new Date('2026-07-15T10:00:00Z'), scheduledEndTime: new Date('2026-07-15T10:30:00Z'),
    },
    update: {},
  });
  for (const [examId, questionId, pts, ord] of [
    [EXAM1, 'q-001', 1, 1], [EXAM1, 'q-002', 1, 2], [EXAM1, 'q-003', 1, 3], [EXAM1, 'q-004', 1, 4],
    [EXAM2, 'q-005', 2, 1], [EXAM2, 'q-007', 1, 2],
  ] as [string, string, number, number][]) {
    await prisma.lmsExamQuestion.upsert({ where: { examId_questionId: { examId, questionId } }, create: { examId, questionId, points: pts, order: ord }, update: {} });
  }
  // Sara's completed exam session
  await prisma.lmsExamSession.upsert({
    where: { id: 'es-001' },
    create: {
      id: 'es-001', orgId: SCHOOL_ID, examId: EXAM1, studentId: U.SCH_S1,
      startedAt: new Date('2026-06-15T09:00:00Z'), endedAt: new Date('2026-06-15T09:42:00Z'),
      status: 'submitted', score: 3, totalPoints: 4, percentage: 75, passed: true,
      answers: {
        'q-001': { answer: '1/2', isCorrect: true },
        'q-002': { answer: '2/5', isCorrect: true },
        'q-003': { answer: 'True', isCorrect: true },
        'q-004': { answer: '5', isCorrect: false },
      },
      gradedBy: U.SCH_T1, gradedAt: new Date('2026-06-16T10:00:00Z'),
    },
    update: {},
  });

  // ── Conversations + Messages ──────────────────────────────────────────────
  const CONV1 = 'conv-direct-001'; // Tara ↔ Priya (admin)
  const CONV2 = 'conv-grp-math-1'; // Math 5A group

  await prisma.lmsConversation.upsert({
    where: { id: CONV1 },
    create: {
      id: CONV1, orgId: SCHOOL_ID, type: 'direct',
      lastMessageText: 'Please check Sara\'s attendance for Monday.', lastMessageAt: new Date('2026-06-20T11:30:00Z'),
      lastMessageBy: U.SCH_ADMIN, messageCount: 2, createdBy: U.SCH_T1,
    },
    update: {},
  });
  await prisma.lmsConversation.upsert({
    where: { id: CONV2 },
    create: {
      id: CONV2, orgId: SCHOOL_ID, type: 'group', title: 'Math 5A',
      lastMessageText: 'Next class is on 25th June at 9 AM.', lastMessageAt: new Date('2026-06-21T09:00:00Z'),
      lastMessageBy: U.SCH_T1, messageCount: 3, createdBy: U.SCH_T1,
    },
    update: {},
  });
  for (const [cvid, uid, role] of [
    [CONV1, U.SCH_T1, 'member'], [CONV1, U.SCH_ADMIN, 'member'],
    [CONV2, U.SCH_T1, 'admin'], [CONV2, U.SCH_S1, 'member'], [CONV2, U.SCH_S2, 'member'], [CONV2, U.SCH_S3, 'member'],
  ] as [string, string, string][]) {
    await prisma.lmsConversationParticipant.upsert({ where: { conversationId_userId: { conversationId: cvid, userId: uid } }, create: { conversationId: cvid, userId: uid, role: role as any }, update: {} });
  }
  for (const msg of [
    { id: 'msg-001', conversationId: CONV1, senderId: U.SCH_T1,    text: 'Hello, I wanted to discuss Sara\'s progress in Math.', createdAt: new Date('2026-06-20T11:00:00Z') },
    { id: 'msg-002', conversationId: CONV1, senderId: U.SCH_ADMIN,  text: 'Please check Sara\'s attendance for Monday.',          createdAt: new Date('2026-06-20T11:30:00Z') },
    { id: 'msg-003', conversationId: CONV2, senderId: U.SCH_T1,    text: 'Welcome to Math 5A group chat! Check the schedule.',   createdAt: new Date('2026-06-19T09:00:00Z') },
    { id: 'msg-004', conversationId: CONV2, senderId: U.SCH_S1,    text: 'Thank you, teacher!',                                  createdAt: new Date('2026-06-19T09:05:00Z') },
    { id: 'msg-005', conversationId: CONV2, senderId: U.SCH_T1,    text: 'Next class is on 25th June at 9 AM.',                  createdAt: new Date('2026-06-21T09:00:00Z') },
  ]) {
    await prisma.lmsMessage.upsert({ where: { id: msg.id }, create: msg, update: {} });
  }

  // ── Teacher Levels ────────────────────────────────────────────────────────
  await prisma.lmsTeacherLevel.upsert({
    where: { teacherId: U.SCH_T1 },
    create: {
      orgId: SCHOOL_ID, teacherId: U.SCH_T1, currentLevel: 'lead', totalClassesTaught: 45,
      attendanceScore: 92, homeworkCompletionRate: 88, parentFeedbackScore: 94, overallScore: 91, classesMissed: 1,
    },
    update: {},
  });
  await prisma.lmsTeacherLevel.upsert({
    where: { teacherId: U.SCH_T2 },
    create: {
      orgId: SCHOOL_ID, teacherId: U.SCH_T2, currentLevel: 'intermediate', totalClassesTaught: 22,
      attendanceScore: 78, homeworkCompletionRate: 72, parentFeedbackScore: 80, overallScore: 76, classesMissed: 3,
    },
    update: {},
  });

  // ── Non-Teaching Tasks ────────────────────────────────────────────────────
  await prisma.lmsNonTeachingTask.upsert({
    where: { id: 'ntt-001' },
    create: {
      id: 'ntt-001', orgId: SCHOOL_ID, teacherId: U.SCH_T1, assignedBy: U.SCH_ADMIN,
      title: 'Prepare Mid-Term Question Paper', description: 'Create 20 questions covering fractions and geometry.',
      category: 'curriculum', paymentAmount: 500, status: 'approved',
      dueDate: new Date('2026-06-25'), completedAt: new Date('2026-06-22'), approvedAt: new Date('2026-06-23'), approvedBy: U.SCH_ADMIN,
    },
    update: {},
  });
  await prisma.lmsNonTeachingTask.upsert({
    where: { id: 'ntt-002' },
    create: {
      id: 'ntt-002', orgId: SCHOOL_ID, teacherId: U.SCH_T2, assignedBy: U.SCH_ADMIN,
      title: 'Science Lab Preparation', description: 'Set up science lab materials for next term\'s practical sessions.',
      category: 'content', paymentAmount: 300, status: 'in_progress',
      dueDate: new Date('2026-07-05'),
    },
    update: {},
  });

  // ── Teacher Availability ──────────────────────────────────────────────────
  for (const slot of [
    { id: 'av-t1-1', userId: U.SCH_T1, dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
    { id: 'av-t1-2', userId: U.SCH_T1, dayOfWeek: 3, startTime: '08:00', endTime: '12:00' },
    { id: 'av-t1-3', userId: U.SCH_T1, dayOfWeek: 5, startTime: '09:00', endTime: '13:00' },
    { id: 'av-t2-1', userId: U.SCH_T2, dayOfWeek: 2, startTime: '09:00', endTime: '13:00' },
    { id: 'av-t2-2', userId: U.SCH_T2, dayOfWeek: 4, startTime: '09:00', endTime: '13:00' },
  ]) {
    await prisma.lmsUserAvailabilitySlot.upsert({ where: { id: slot.id }, create: slot, update: {} });
  }

  // ── Tutoring Request ──────────────────────────────────────────────────────
  await prisma.lmsTutoringRequest.upsert({
    where: { id: 'tr-001' },
    create: {
      id: 'tr-001', orgId: SCHOOL_ID, studentId: U.SCH_S2, teacherId: U.SCH_T1,
      subject: 'Math', notes: 'Need help with fractions and long division.',
      proposedSlots: [{ date: '2026-06-28', startTime: '16:00', endTime: '17:00' },{ date: '2026-06-29', startTime: '16:00', endTime: '17:00' }],
      status: 'pending',
    },
    update: {},
  });

  // ── Activity Logs ─────────────────────────────────────────────────────────
  for (const log of [
    { id: 'al-001', type: 'course_created',  message: 'Course "Workplace Safety & Compliance" created',         orgId: CORP_ID,   userId: U.CORP_ADMIN, timestamp: new Date('2026-06-01T10:00:00Z') },
    { id: 'al-002', type: 'course_created',  message: 'Course "Leadership Essentials" created',                 orgId: CORP_ID,   userId: U.CORP_ADMIN, timestamp: new Date('2026-06-02T09:00:00Z') },
    { id: 'al-003', type: 'user_action',     message: 'User Leo Learner completed Workplace Safety course',     orgId: CORP_ID,   userId: U.CORP_L1,   timestamp: new Date('2026-06-01T15:30:00Z') },
    { id: 'al-004', type: 'tenant_created',  message: 'Tenant Bright School onboarded to the platform',        orgId: SCHOOL_ID, userId: U.SA,         timestamp: new Date('2026-05-01T09:00:00Z') },
    { id: 'al-005', type: 'upload',          message: 'New lesson video uploaded for Mathematics Grade 5',      orgId: SCHOOL_ID, userId: U.SCH_T1,     timestamp: new Date('2026-06-10T11:00:00Z') },
    { id: 'al-006', type: 'user_action',     message: 'User Jake Engineer completed Workplace Safety course',   orgId: CORP_ID,   userId: U.CORP_L3,   timestamp: new Date('2026-06-10T14:00:00Z') },
  ]) {
    await prisma.lmsActivityLog.upsert({ where: { id: log.id }, create: log as any, update: {} });
  }

  // ── Tenant Logs ───────────────────────────────────────────────────────────
  for (const tl of [
    { id: 'tl-001', orgId: CORP_ID,   actionType: 'NewLearnerInvited',        description: 'New employee Leo Learner invited to Acme Corp',      performedBy: U.CORP_ADMIN, createdAt: new Date('2026-05-20T09:00:00Z') },
    { id: 'tl-002', orgId: CORP_ID,   actionType: 'CourseAssignedToUser',     description: 'Safety course assigned to Leo Learner',              performedBy: U.CORP_ADMIN, createdAt: new Date('2026-06-01T09:00:00Z') },
    { id: 'tl-003', orgId: CORP_ID,   actionType: 'CourseCompleted',          description: 'Leo Learner completed Workplace Safety & Compliance', performedBy: U.CORP_L1,   createdAt: new Date('2026-06-01T15:30:00Z') },
    { id: 'tl-004', orgId: CORP_ID,   actionType: 'BrandingUpdated',          description: 'Tenant branding updated by Aria Admin',               performedBy: U.CORP_ADMIN, createdAt: new Date('2026-06-05T11:00:00Z') },
    { id: 'tl-005', orgId: SCHOOL_ID, actionType: 'NewLearnerInvited',        description: 'New student Sara Student enrolled at Bright School',  performedBy: U.SCH_ADMIN,  createdAt: new Date('2026-04-01T09:00:00Z') },
    { id: 'tl-006', orgId: SCHOOL_ID, actionType: 'AttendanceMarkedByManager',description: 'Attendance marked for Math Class 1 – Fractions',     performedBy: U.SCH_T1,    createdAt: new Date('2026-06-02T10:15:00Z') },
    { id: 'tl-007', orgId: CORP_ID,   actionType: 'CourseAssignedToGroup',    description: 'Safety course assigned to Engineering Team group',     performedBy: U.CORP_ADMIN, createdAt: new Date('2026-06-01T09:30:00Z') },
    { id: 'tl-008', orgId: CORP_ID,   actionType: 'UserActivated',            description: 'User Emma Employee account activated',                performedBy: U.CORP_ADMIN, createdAt: new Date('2026-06-08T10:00:00Z') },
  ]) {
    await prisma.lmsTenantLog.upsert({ where: { id: tl.id }, create: tl as any, update: {} });
  }

  console.log('✅ Seed complete. Password for all demo users:', PASSWORD);
  console.log('');
  console.log('   super:  superadmin@quikskill.test');
  console.log('   corp:   admin@acme.test / subadmin@acme.test / manager@acme.test / nick@acme.test');
  console.log('           learner@acme.test / emma@acme.test / jake@acme.test');
  console.log('   school: admin@bright.test / teacher@bright.test / raj@bright.test');
  console.log('           parent@bright.test / priti@bright.test');
  console.log('           student@bright.test / arjun@bright.test / meera@bright.test');
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
