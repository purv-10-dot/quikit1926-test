-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'TEACHER', 'PARENT', 'LEARNER');

-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('corporate', 'school');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('Active', 'Paused', 'Trial');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('per_class', 'per_hour', 'monthly', 'hybrid');

-- CreateEnum
CREATE TYPE "UserQualification" AS ENUM ('PGT', 'TGT', 'PRT', 'NTT', 'Other');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('Draft', 'Published', 'Archived');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('Video', 'PDF', 'PPT', 'SCORM', 'Text', 'Quiz', 'Audio', 'Document', 'Slides');

-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('Beginner', 'Intermediate', 'Advanced', 'Expert');

-- CreateEnum
CREATE TYPE "MasterCourseStatus" AS ENUM ('Draft', 'Published', 'Archived', 'PendingTenantApproval', 'RejectedByTenantAdmin', 'PendingApproval', 'Rejected', 'Resubmitted');

-- CreateEnum
CREATE TYPE "MasterQuestionType" AS ENUM ('mcq', 'multi_select', 'true_false', 'drag_drop', 'fill_blank');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('video_upload', 'video_youtube', 'video_vimeo', 'audio_upload', 'audio_soundcloud', 'document_pdf', 'document_ppt', 'document_word', 'document_excel', 'rich_text', 'scorm_12', 'scorm_2004', 'external_link', 'iframe_embed');

-- CreateEnum
CREATE TYPE "AssessmentQuestionType" AS ENUM ('MCQ', 'True/False');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('Not Started', 'In Progress', 'Overdue', 'Completed', 'Failed');

-- CreateEnum
CREATE TYPE "AssignmentTargetType" AS ENUM ('USER', 'GROUP');

-- CreateEnum
CREATE TYPE "CertificateApprovalStatus" AS ENUM ('pending_approval', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('video_recording', 'data_processing', 'photo_usage');

-- CreateEnum
CREATE TYPE "EmailTemplateType" AS ENUM ('welcome-kit', 'course-completion', 'certificate', 'upgrade-invoice');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "BatchType" AS ENUM ('regular', 'one_on_one');

-- CreateEnum
CREATE TYPE "BatchSource" AS ENUM ('manual', 'auto_tutoring');

-- CreateEnum
CREATE TYPE "BatchClassType" AS ENUM ('regular', 'demo', 'trial');

-- CreateEnum
CREATE TYPE "BatchMeetingProvider" AS ENUM ('zoom', 'google_meet', 'jitsi', 'manual');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled');

-- CreateEnum
CREATE TYPE "RescheduleApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "CreditPackageStatus" AS ENUM ('active', 'exhausted', 'expired');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('purchase', 'deduct', 'refund', 'expire', 'adjustment', 'tutoring_hold', 'tutoring_hold_release', 'tutoring_deduction');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'late', 'excused');

-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('draft', 'published', 'closed');

-- CreateEnum
CREATE TYPE "HomeworkType" AS ENUM ('assignment', 'quiz', 'project', 'reading');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('submitted', 'graded', 'returned');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('draft', 'pending', 'approved', 'paid', 'disputed', 'rejected');

-- CreateEnum
CREATE TYPE "PayoutAdjustmentType" AS ENUM ('bonus', 'deduction', 'reimbursement');

-- CreateEnum
CREATE TYPE "PayoutSource" AS ENUM ('batch', 'tutoring');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('scheduled', 'started', 'ended', 'cancelled');

-- CreateEnum
CREATE TYPE "MeetingProvider" AS ENUM ('zoom', 'google_meet', 'teams', 'jitsi', 'manual');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('pending', 'processing', 'available', 'expired');

-- CreateEnum
CREATE TYPE "MeetingAttendanceRole" AS ENUM ('teacher', 'student');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('desktop', 'mobile', 'tablet', 'unknown');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('curriculum', 'content', 'training', 'meeting', 'other');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('assigned', 'in_progress', 'completed_pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "TeacherStatus" AS ENUM ('beginner', 'intermediate', 'lead');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('pending', 'escalating', 'resolved', 'failed');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('initiated', 'ringing', 'answered', 'no_answer', 'busy', 'failed');

-- CreateEnum
CREATE TYPE "TutoringRequestStatus" AS ENUM ('pending', 'accepted', 'rejected', 'completed');

-- CreateEnum
CREATE TYPE "ReminderCallStatus" AS ENUM ('pending', 'calling', 'resolved', 'failed');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('draft', 'published', 'active', 'completed', 'results_published');

-- CreateEnum
CREATE TYPE "ProctoringLevel" AS ENUM ('none', 'soft');

-- CreateEnum
CREATE TYPE "QuestionSelectionMode" AS ENUM ('manual', 'auto_random');

-- CreateEnum
CREATE TYPE "ExamSessionStatus" AS ENUM ('not_started', 'in_progress', 'submitted', 'auto_submitted', 'timed_out', 'voided');

-- CreateEnum
CREATE TYPE "IncidentDisposition" AS ENUM ('pending', 'dismissed', 'confirmed_violation');

-- CreateEnum
CREATE TYPE "IncidentAction" AS ENUM ('none', 'warning', 'penalty_applied', 'session_voided');

-- CreateEnum
CREATE TYPE "ProctoringEventType" AS ENUM ('tab_switch', 'fullscreen_exit', 'copy_attempt', 'paste_attempt', 'right_click', 'shortcut_key', 'print_attempt', 'blur', 'beforeunload');

-- CreateEnum
CREATE TYPE "ProctoringSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "QuizSessionStatus" AS ENUM ('in_progress', 'submitted', 'auto_submitted', 'voided');

-- CreateEnum
CREATE TYPE "QuizProctoringEventType" AS ENUM ('tab_switch', 'fullscreen_exit', 'copy_attempt', 'paste_attempt', 'right_click', 'shortcut_key', 'print_attempt', 'blur', 'beforeunload', 'face_no_face', 'face_multiple', 'face_looking_away', 'face_looking_down', 'face_eyes_closed', 'face_too_far', 'face_camera_error');

-- CreateEnum
CREATE TYPE "BankQuestionType" AS ENUM ('mcq', 'multi_select', 'true_false', 'short_answer', 'long_answer', 'fill_blank', 'one_word', 'match_column');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('direct', 'group');

-- CreateEnum
CREATE TYPE "ConversationParticipantRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'file', 'image', 'system');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('upload', 'storage_threshold', 'course_created', 'course_deleted', 'tenant_created', 'tenant_updated', 'user_action');

-- CreateEnum
CREATE TYPE "TenantActionType" AS ENUM ('New Learner Invited', 'Course Assigned to User', 'Course Assigned to Group', 'Course Completed', 'Quiz Passing Score Updated', 'User Activated', 'User Deactivated', 'Branding Updated', 'Storage Requested', 'Quiz Reset by Manager', 'User Nudged by Manager', 'Attendance Marked by Manager', 'Certificate Approved by Manager', 'Team Report Exported by Manager');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "tenantType" "TenantType" NOT NULL DEFAULT 'corporate',
    "gstNumber" TEXT,
    "dbConnectionString" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'Active',
    "tenantKey" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "fullAddress" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "officialPhone" TEXT NOT NULL,
    "website" TEXT,
    "officialEmail" TEXT NOT NULL,
    "contactFirstName" TEXT NOT NULL,
    "contactMiddleName" TEXT,
    "contactLastName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactRoleInOrganization" TEXT NOT NULL,
    "billingFirstName" TEXT NOT NULL,
    "billingMiddleName" TEXT,
    "billingLastName" TEXT NOT NULL,
    "billingAddress" TEXT NOT NULL,
    "featureConfig" JSONB NOT NULL DEFAULT '{}',
    "schoolConfig" JSONB,
    "corporateConfig" JSONB,
    "creditConfig" JSONB,
    "payoutConfig" JSONB,
    "videoConfig" JSONB,
    "enhancementConfig" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "enabledLanguages" TEXT[] DEFAULT ARRAY['en']::TEXT[],
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "localeSettings" JSONB,
    "storageLimit" INTEGER NOT NULL DEFAULT 2,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#3B82F6',
    "secondaryColor" TEXT NOT NULL DEFAULT '#1E40AF',
    "auth0OrganizationId" TEXT,
    "auth0UserId" TEXT,
    "loginUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'LEARNER',
    "secondaryRole" "UserRole",
    "tenantId" TEXT,
    "managerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "parentEmail" TEXT,
    "guardianContact" TEXT,
    "phone" TEXT,
    "guardianRelation" TEXT,
    "grade" TEXT,
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ratePerClass" DOUBLE PRECISION,
    "ratePerHour" DOUBLE PRECISION,
    "rateType" "RateType" DEFAULT 'per_class',
    "qualification" "UserQualification",
    "monthlyPayout" DOUBLE PRECISION,
    "employeeId" TEXT,
    "studentId" TEXT,
    "parentCode" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "section" TEXT,
    "maxSlotsPerWeek" INTEGER DEFAULT 0,
    "tutoringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tutoringCreditCost" DOUBLE PRECISION,
    "classesCompleted" INTEGER DEFAULT 0,
    "classesMissed" INTEGER DEFAULT 0,
    "classesCancelled" INTEGER DEFAULT 0,
    "classesRescheduledAndCompleted" INTEGER DEFAULT 0,
    "punctualityScore" DOUBLE PRECISION DEFAULT 0,
    "provider" TEXT,
    "providerId" TEXT,
    "profilePicture" TEXT,
    "aiApiKey" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "passwordSetupToken" TEXT,
    "passwordSetupTokenExpiry" TIMESTAMP(3),
    "activeSessionId" TEXT,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" TIMESTAMP(3),
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT,
    "notificationPreferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_availability_slots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_parents" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "consentVersion" TEXT NOT NULL DEFAULT '1.0',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "authorId" TEXT NOT NULL,
    "status" "CourseStatus" NOT NULL DEFAULT 'Draft',
    "thumbnailUrl" TEXT,
    "isMaster" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_selected_tenants" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_selected_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_prerequisites" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_prerequisites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "assessmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "LessonType" NOT NULL,
    "contentUrl" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "isMaster" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "duration" INTEGER,
    "fileSize" INTEGER,
    "captions" JSONB,
    "quiz" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_courses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "level" "CourseLevel" NOT NULL DEFAULT 'Beginner',
    "thumbnailUrl" TEXT,
    "aiGeneratedThumbnail" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "modules" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" "MasterCourseStatus" NOT NULL DEFAULT 'Draft',
    "isMaster" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedDuration" INTEGER,
    "lastAutoSaveAt" TIMESTAMP(3),
    "draftData" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedBy" TEXT,
    "submittedByTenantId" TEXT,
    "parentCourseId" TEXT,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "tenantApprovedBy" TEXT,
    "tenantApprovalDate" TIMESTAMP(3),
    "tenantRejectionReason" TEXT,
    "approvedBy" TEXT,
    "approvalDate" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_course_selected_tenants" (
    "id" TEXT NOT NULL,
    "masterCourseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_course_selected_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "passingScore" INTEGER NOT NULL DEFAULT 75,
    "retryLimit" INTEGER NOT NULL DEFAULT 3,
    "timeLimit" INTEGER,
    "randomizeQuestions" BOOLEAN NOT NULL DEFAULT false,
    "questionsToShow" INTEGER,
    "additionalQuestions" JSONB NOT NULL DEFAULT '[]',
    "additionalQuestionsToInclude" INTEGER,
    "isMaster" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "score" INTEGER NOT NULL,
    "totalPoints" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proctoringSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "currentModuleId" TEXT,
    "status" "ProgressStatus" NOT NULL DEFAULT 'Not Started',
    "completionPercentage" INTEGER NOT NULL DEFAULT 0,
    "scorePercentage" DOUBLE PRECISION,
    "quizScore" DOUBLE PRECISION,
    "isPassed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lessonProgress" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "targetType" "AssignmentTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "backgroundImageUrl" TEXT NOT NULL,
    "logoImageUrl" TEXT,
    "signatureImageUrl" TEXT,
    "designation" TEXT,
    "signatoryName" TEXT,
    "textPlacements" JSONB,
    "logoPlacement" JSONB,
    "signaturePlacement" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvalStatus" "CertificateApprovalStatus" NOT NULL DEFAULT 'approved',
    "submittedBy" TEXT,
    "submittedByTenantId" TEXT,
    "approvedBy" TEXT,
    "approvalDate" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_selected_tenants" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_selected_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates_issued" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "certificateTemplateId" TEXT,
    "courseName" TEXT,
    "learnerName" TEXT,
    "certificateId" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL DEFAULT '',
    "qrCodeUrl" TEXT NOT NULL DEFAULT '',
    "verificationUrl" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "isComplianceCertificate" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "passingScore" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_issued_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lessonId" TEXT,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "upvotedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "downvotedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSticky" BOOLEAN NOT NULL DEFAULT false,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discussions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "term" TEXT,
    "academicYear" TEXT,
    "homeworkAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assessmentAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attendancePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalGrade" TEXT,
    "gradePoints" DOUBLE PRECISION,
    "overallPercentage" DOUBLE PRECISION,
    "remarks" TEXT,
    "gradedBy" TEXT,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT,
    "lessonId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_calendars" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_terms" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_holidays" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'custom',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "type" "EmailTemplateType" NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_content" (
    "id" TEXT NOT NULL,
    "masterCourseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantCourseId" TEXT NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shared_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT,
    "section" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "teacherId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "maxCapacity" INTEGER,
    "defaultMeetingProvider" "BatchMeetingProvider" DEFAULT 'jitsi',
    "creditPerClass" DOUBLE PRECISION DEFAULT 1,
    "ratePerClass" DOUBLE PRECISION,
    "ratePerHour" DOUBLE PRECISION,
    "classType" "BatchClassType" DEFAULT 'regular',
    "trialClassCount" INTEGER DEFAULT 0,
    "convertedToRegular" BOOLEAN DEFAULT false,
    "convertedAt" TIMESTAMP(3),
    "status" "BatchStatus" NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "batchType" "BatchType" NOT NULL DEFAULT 'regular',
    "source" "BatchSource" NOT NULL DEFAULT 'manual',
    "tutoringRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_schedule" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_students" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_substitute_teachers" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_substitute_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_classes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "substituteTeacherId" TEXT,
    "title" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "status" "ClassStatus" NOT NULL DEFAULT 'scheduled',
    "cancellationReason" TEXT,
    "rescheduledTo" TEXT,
    "rescheduledFrom" TEXT,
    "rescheduleReason" TEXT,
    "rescheduleApprovalStatus" "RescheduleApprovalStatus",
    "meetingId" TEXT,
    "attendanceMarkedAt" TIMESTAMP(3),
    "classNotes" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringPattern" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_packages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "purchasedCredits" DOUBLE PRECISION NOT NULL,
    "usedCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingCredits" DOUBLE PRECISION NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" "CreditPackageStatus" NOT NULL DEFAULT 'active',
    "price" DOUBLE PRECISION,
    "notes" TEXT,
    "allocatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "relatedClassId" TEXT,
    "relatedAttendanceId" TEXT,
    "notes" TEXT,
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduledClassId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "markedBy" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "classDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "creditDeducted" BOOLEAN NOT NULL DEFAULT false,
    "creditTransactionId" TEXT,
    "editedBy" TEXT,
    "editReason" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resourceLinks" JSONB NOT NULL DEFAULT '[]',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assignedToStudentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxScore" INTEGER,
    "allowLateSubmission" BOOLEAN NOT NULL DEFAULT false,
    "lateSubmissionDeadline" TIMESTAMP(3),
    "latePenaltyPercent" INTEGER,
    "status" "HomeworkStatus" NOT NULL DEFAULT 'published',
    "type" "HomeworkType" NOT NULL DEFAULT 'assignment',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "textResponse" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'submitted',
    "score" INTEGER,
    "feedback" TEXT,
    "gradedBy" TEXT,
    "gradedAt" TIMESTAMP(3),
    "correctedFileUrl" TEXT,
    "richFeedback" TEXT,
    "latePenaltyApplied" DOUBLE PRECISION,
    "finalScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_rubric_scores" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "criterion" TEXT NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_rubric_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_payouts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalClassesCompleted" INTEGER NOT NULL DEFAULT 0,
    "ratePerClass" DOUBLE PRECISION NOT NULL,
    "rateType" "RateType" DEFAULT 'per_class',
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "totalBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nonTeachingWorkAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'draft',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "notes" TEXT,
    "source" "PayoutSource" DEFAULT 'batch',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_adjustments" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "type" "PayoutAdjustmentType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "appliedBy" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_completed_classes" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "scheduledClassId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_completed_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduledClassId" TEXT,
    "hostId" TEXT,
    "provider" "MeetingProvider" NOT NULL,
    "externalMeetingId" TEXT,
    "joinUrl" TEXT NOT NULL,
    "hostUrl" TEXT,
    "password" TEXT,
    "scheduledStartTime" TIMESTAMP(3) NOT NULL,
    "scheduledEndTime" TIMESTAMP(3) NOT NULL,
    "actualStartTime" TIMESTAMP(3),
    "actualEndTime" TIMESTAMP(3),
    "status" "MeetingStatus" NOT NULL DEFAULT 'scheduled',
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recordingUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordingStatus" "RecordingStatus" NOT NULL DEFAULT 'pending',
    "providerMetadata" JSONB,
    "createdBy" TEXT,
    "title" TEXT,
    "isInstant" BOOLEAN NOT NULL DEFAULT false,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MeetingAttendanceRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'unknown',
    "deviceInfo" TEXT,
    "joinLeaveHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_teaching_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "TaskCategory" NOT NULL DEFAULT 'other',
    "paymentAmount" DOUBLE PRECISION NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'assigned',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "completionNotes" TEXT,
    "hoursSpent" DOUBLE PRECISION,
    "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "non_teaching_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_levels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "currentLevel" "TeacherStatus" NOT NULL DEFAULT 'beginner',
    "totalClassesTaught" INTEGER NOT NULL DEFAULT 0,
    "attendanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "homeworkCompletionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parentFeedbackScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "classesMissed" INTEGER NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_level_history" (
    "id" TEXT NOT NULL,
    "teacherLevelId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "level" "TeacherStatus" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_level_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_escalations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduledClassId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'pending',
    "resolutionTime" TIMESTAMP(3),
    "teacherJoinedAt" TIMESTAMP(3),
    "adminNotified" BOOLEAN NOT NULL DEFAULT false,
    "adminNotifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_escalation_attempts" (
    "id" TEXT NOT NULL,
    "escalationId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "attemptTime" TIMESTAMP(3) NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "callStatus" "CallStatus" NOT NULL,
    "callDuration" INTEGER,
    "callSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_escalation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutoring_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT,
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "proposedSlots" JSONB NOT NULL,
    "confirmedSlot" JSONB,
    "status" "TutoringRequestStatus" NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "teacherNotes" TEXT,
    "batchId" TEXT,
    "scheduledClassId" TEXT,
    "creditCostSnapshot" DOUBLE PRECISION,
    "teacherRateSnapshot" DOUBLE PRECISION,
    "creditHoldId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutoring_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_reminder_calls" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduledClassId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "ReminderCallStatus" NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_reminder_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_reminder_call_attempts" (
    "id" TEXT NOT NULL,
    "reminderCallId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "attemptTime" TIMESTAMP(3) NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "callStatus" "CallStatus" NOT NULL,
    "callDuration" INTEGER,
    "callSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_reminder_call_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_lateness_reminder_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "lastNotifiedScheduledClassId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_lateness_reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'medium',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "type" "BankQuestionType" NOT NULL,
    "text" TEXT NOT NULL,
    "imageUrl" TEXT,
    "audioUrl" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" JSONB,
    "points" INTEGER NOT NULL DEFAULT 1,
    "negativeMarks" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "batchId" TEXT,
    "duration" INTEGER NOT NULL,
    "totalMarks" INTEGER NOT NULL DEFAULT 0,
    "questionSelectionMode" "QuestionSelectionMode" NOT NULL DEFAULT 'manual',
    "autoSelectRules" JSONB,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "proctoringLevel" "ProctoringLevel" NOT NULL DEFAULT 'soft',
    "scheduledStartTime" TIMESTAMP(3),
    "scheduledEndTime" TIMESTAMP(3),
    "status" "ExamStatus" NOT NULL DEFAULT 'draft',
    "resultPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "serverDeadline" TIMESTAMP(3),
    "status" "ExamSessionStatus" NOT NULL DEFAULT 'not_started',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "lastSavedAt" TIMESTAMP(3),
    "assignedQuestions" JSONB NOT NULL DEFAULT '[]',
    "score" DOUBLE PRECISION,
    "totalPoints" DOUBLE PRECISION,
    "percentage" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "teacherRemarks" TEXT,
    "gradedBy" TEXT,
    "gradedAt" TIMESTAMP(3),
    "proctoringFlags" JSONB NOT NULL DEFAULT '{}',
    "isReconnection" BOOLEAN NOT NULL DEFAULT false,
    "disconnectedAt" TIMESTAMP(3),
    "reconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proctoring_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "eventType" "ProctoringEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "severity" "ProctoringSeverity" NOT NULL DEFAULT 'low',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proctoring_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "flagSummary" JSONB NOT NULL DEFAULT '{}',
    "disposition" "IncidentDisposition" NOT NULL DEFAULT 'pending',
    "action" "IncidentAction" NOT NULL DEFAULT 'none',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_proctoring_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "serverDeadline" TIMESTAMP(3),
    "status" "QuizSessionStatus" NOT NULL DEFAULT 'in_progress',
    "proctoringFlags" JSONB NOT NULL DEFAULT '{}',
    "isReconnection" BOOLEAN NOT NULL DEFAULT false,
    "disconnectedAt" TIMESTAMP(3),
    "reconnectedAt" TIMESTAMP(3),
    "selectedQuestionIndices" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "selectedAdditionalIndices" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "questionManifest" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_proctoring_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_proctoring_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "eventType" "QuizProctoringEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "severity" "ProctoringSeverity" NOT NULL DEFAULT 'low',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_proctoring_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_incident_reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "flagSummary" JSONB NOT NULL DEFAULT '{}',
    "disposition" "IncidentDisposition" NOT NULL DEFAULT 'pending',
    "action" "IncidentAction" NOT NULL DEFAULT 'none',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'direct',
    "title" TEXT,
    "groupIcon" TEXT,
    "description" TEXT,
    "lastMessageText" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageBy" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "blockedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "ConversationParticipantRole" NOT NULL DEFAULT 'member',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "replyTo" TEXT,
    "forwardedFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB,
    "sessionId" TEXT,
    "deviceType" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_cache" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "filters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "type" "ActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actionType" "TenantActionType" NOT NULL,
    "description" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "fieldsStripped" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordsAffected" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_name_key" ON "tenants"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_gstNumber_key" ON "tenants"("gstNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_tenantKey_key" ON "tenants"("tenantKey");

-- CreateIndex
CREATE INDEX "tenants_tenantType_status_idx" ON "tenants"("tenantType", "status");

-- CreateIndex
CREATE INDEX "users_tenantId_role_idx" ON "users"("tenantId", "role");

-- CreateIndex
CREATE INDEX "users_tenantId_grade_idx" ON "users"("tenantId", "grade");

-- CreateIndex
CREATE INDEX "users_tenantId_email_idx" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "users_tenantId_totalPoints_idx" ON "users"("tenantId", "totalPoints" DESC);

-- CreateIndex
CREATE INDEX "users_tenantId_currentStreak_idx" ON "users"("tenantId", "currentStreak" DESC);

-- CreateIndex
CREATE INDEX "users_tenantId_parentEmail_idx" ON "users"("tenantId", "parentEmail");

-- CreateIndex
CREATE INDEX "users_managerId_idx" ON "users"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_studentId_key" ON "users"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_employeeId_key" ON "users"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_parentCode_key" ON "users"("tenantId", "parentCode");

-- CreateIndex
CREATE INDEX "user_availability_slots_userId_idx" ON "user_availability_slots"("userId");

-- CreateIndex
CREATE INDEX "user_parents_childId_idx" ON "user_parents"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "user_parents_parentId_childId_key" ON "user_parents"("parentId", "childId");

-- CreateIndex
CREATE INDEX "otps_email_idx" ON "otps"("email");

-- CreateIndex
CREATE INDEX "otps_expiresAt_idx" ON "otps"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "counters_tenantId_type_key" ON "counters"("tenantId", "type");

-- CreateIndex
CREATE INDEX "groups_tenantId_idx" ON "groups"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "groups_tenantId_name_key" ON "groups"("tenantId", "name");

-- CreateIndex
CREATE INDEX "group_members_userId_idx" ON "group_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_groupId_userId_key" ON "group_members"("groupId", "userId");

-- CreateIndex
CREATE INDEX "consent_records_tenantId_studentId_consentType_idx" ON "consent_records"("tenantId", "studentId", "consentType");

-- CreateIndex
CREATE INDEX "consent_records_tenantId_parentId_idx" ON "consent_records"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "courses_tenantId_status_idx" ON "courses"("tenantId", "status");

-- CreateIndex
CREATE INDEX "courses_isMaster_idx" ON "courses"("isMaster");

-- CreateIndex
CREATE INDEX "courses_isFeatured_status_idx" ON "courses"("isFeatured", "status");

-- CreateIndex
CREATE INDEX "courses_category_tenantId_idx" ON "courses"("category", "tenantId");

-- CreateIndex
CREATE INDEX "course_selected_tenants_tenantId_idx" ON "course_selected_tenants"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "course_selected_tenants_courseId_tenantId_key" ON "course_selected_tenants"("courseId", "tenantId");

-- CreateIndex
CREATE INDEX "course_prerequisites_prerequisiteId_idx" ON "course_prerequisites"("prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "course_prerequisites_courseId_prerequisiteId_key" ON "course_prerequisites"("courseId", "prerequisiteId");

-- CreateIndex
CREATE INDEX "modules_tenantId_courseId_idx" ON "modules"("tenantId", "courseId");

-- CreateIndex
CREATE INDEX "modules_courseId_orderIndex_idx" ON "modules"("courseId", "orderIndex");

-- CreateIndex
CREATE INDEX "lessons_moduleId_orderIndex_idx" ON "lessons"("moduleId", "orderIndex");

-- CreateIndex
CREATE INDEX "master_courses_isMaster_status_idx" ON "master_courses"("isMaster", "status");

-- CreateIndex
CREATE INDEX "master_courses_authorId_idx" ON "master_courses"("authorId");

-- CreateIndex
CREATE INDEX "master_courses_category_level_idx" ON "master_courses"("category", "level");

-- CreateIndex
CREATE INDEX "master_courses_status_submittedByTenantId_idx" ON "master_courses"("status", "submittedByTenantId");

-- CreateIndex
CREATE INDEX "master_courses_parentCourseId_status_idx" ON "master_courses"("parentCourseId", "status");

-- CreateIndex
CREATE INDEX "master_course_selected_tenants_tenantId_idx" ON "master_course_selected_tenants"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "master_course_selected_tenants_masterCourseId_tenantId_key" ON "master_course_selected_tenants"("masterCourseId", "tenantId");

-- CreateIndex
CREATE INDEX "assessments_tenantId_moduleId_idx" ON "assessments"("tenantId", "moduleId");

-- CreateIndex
CREATE INDEX "assessments_isMaster_idx" ON "assessments"("isMaster");

-- CreateIndex
CREATE INDEX "quiz_attempts_tenantId_learnerId_courseId_idx" ON "quiz_attempts"("tenantId", "learnerId", "courseId");

-- CreateIndex
CREATE INDEX "quiz_attempts_tenantId_learnerId_assessmentId_idx" ON "quiz_attempts"("tenantId", "learnerId", "assessmentId");

-- CreateIndex
CREATE INDEX "quiz_attempts_learnerId_courseId_submittedAt_idx" ON "quiz_attempts"("learnerId", "courseId", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "progress_learnerId_status_idx" ON "progress"("learnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "progress_tenantId_learnerId_courseId_key" ON "progress"("tenantId", "learnerId", "courseId");

-- CreateIndex
CREATE INDEX "course_assignments_tenantId_courseId_idx" ON "course_assignments"("tenantId", "courseId");

-- CreateIndex
CREATE INDEX "course_assignments_tenantId_targetId_targetType_idx" ON "course_assignments"("tenantId", "targetId", "targetType");

-- CreateIndex
CREATE INDEX "course_assignments_tenantId_isMandatory_idx" ON "course_assignments"("tenantId", "isMandatory");

-- CreateIndex
CREATE INDEX "certificates_tenantId_isActive_idx" ON "certificates"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "certificates_approvalStatus_idx" ON "certificates"("approvalStatus");

-- CreateIndex
CREATE INDEX "certificate_selected_tenants_tenantId_idx" ON "certificate_selected_tenants"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_selected_tenants_certificateId_tenantId_key" ON "certificate_selected_tenants"("certificateId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_issued_certificateId_key" ON "certificates_issued"("certificateId");

-- CreateIndex
CREATE INDEX "certificates_issued_tenantId_learnerId_courseId_idx" ON "certificates_issued"("tenantId", "learnerId", "courseId");

-- CreateIndex
CREATE INDEX "certificates_issued_expiresAt_idx" ON "certificates_issued"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_issued_tenantId_learnerId_courseId_key" ON "certificates_issued"("tenantId", "learnerId", "courseId");

-- CreateIndex
CREATE INDEX "discussions_courseId_isSticky_createdAt_idx" ON "discussions"("courseId", "isSticky", "createdAt");

-- CreateIndex
CREATE INDEX "discussions_courseId_lessonId_createdAt_idx" ON "discussions"("courseId", "lessonId", "createdAt");

-- CreateIndex
CREATE INDEX "discussions_parentId_createdAt_idx" ON "discussions"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "discussions_userId_createdAt_idx" ON "discussions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "discussions_tenantId_courseId_isDeleted_idx" ON "discussions"("tenantId", "courseId", "isDeleted");

-- CreateIndex
CREATE INDEX "grade_records_tenantId_batchId_overallPercentage_idx" ON "grade_records"("tenantId", "batchId", "overallPercentage" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "grade_records_tenantId_studentId_batchId_term_key" ON "grade_records"("tenantId", "studentId", "batchId", "term");

-- CreateIndex
CREATE INDEX "bookmarks_userId_createdAt_idx" ON "bookmarks"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_tenantId_userId_courseId_key" ON "bookmarks"("tenantId", "userId", "courseId");

-- CreateIndex
CREATE INDEX "sections_tenantId_idx" ON "sections"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sections_tenantId_grade_name_key" ON "sections"("tenantId", "grade", "name");

-- CreateIndex
CREATE INDEX "subjects_tenantId_idx" ON "subjects"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenantId_name_key" ON "subjects"("tenantId", "name");

-- CreateIndex
CREATE INDEX "academic_calendars_tenantId_idx" ON "academic_calendars"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "academic_calendars_tenantId_academicYear_key" ON "academic_calendars"("tenantId", "academicYear");

-- CreateIndex
CREATE INDEX "academic_terms_calendarId_idx" ON "academic_terms"("calendarId");

-- CreateIndex
CREATE INDEX "academic_holidays_calendarId_idx" ON "academic_holidays"("calendarId");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_type_key" ON "email_templates"("type");

-- CreateIndex
CREATE INDEX "shared_content_tenantId_isActive_idx" ON "shared_content"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "shared_content_masterCourseId_tenantId_key" ON "shared_content"("masterCourseId", "tenantId");

-- CreateIndex
CREATE INDEX "batches_tenantId_academicYear_status_idx" ON "batches"("tenantId", "academicYear", "status");

-- CreateIndex
CREATE INDEX "batches_tenantId_teacherId_status_idx" ON "batches"("tenantId", "teacherId", "status");

-- CreateIndex
CREATE INDEX "batches_tenantId_grade_section_subject_idx" ON "batches"("tenantId", "grade", "section", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "batches_tenantId_name_academicYear_key" ON "batches"("tenantId", "name", "academicYear");

-- CreateIndex
CREATE INDEX "batch_schedule_batchId_idx" ON "batch_schedule"("batchId");

-- CreateIndex
CREATE INDEX "batch_students_studentId_idx" ON "batch_students"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "batch_students_batchId_studentId_key" ON "batch_students"("batchId", "studentId");

-- CreateIndex
CREATE INDEX "batch_substitute_teachers_teacherId_idx" ON "batch_substitute_teachers"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "batch_substitute_teachers_batchId_teacherId_key" ON "batch_substitute_teachers"("batchId", "teacherId");

-- CreateIndex
CREATE INDEX "scheduled_classes_tenantId_teacherId_startTime_idx" ON "scheduled_classes"("tenantId", "teacherId", "startTime");

-- CreateIndex
CREATE INDEX "scheduled_classes_tenantId_batchId_startTime_idx" ON "scheduled_classes"("tenantId", "batchId", "startTime");

-- CreateIndex
CREATE INDEX "scheduled_classes_tenantId_status_startTime_idx" ON "scheduled_classes"("tenantId", "status", "startTime");

-- CreateIndex
CREATE INDEX "scheduled_classes_startTime_idx" ON "scheduled_classes"("startTime");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_classes_batchId_startTime_key" ON "scheduled_classes"("batchId", "startTime");

-- CreateIndex
CREATE INDEX "credit_packages_studentId_status_expiresAt_idx" ON "credit_packages"("studentId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "credit_packages_tenantId_studentId_idx" ON "credit_packages"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "credit_transactions_tenantId_studentId_createdAt_idx" ON "credit_transactions"("tenantId", "studentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "credit_transactions_packageId_idx" ON "credit_transactions"("packageId");

-- CreateIndex
CREATE INDEX "attendance_tenantId_scheduledClassId_idx" ON "attendance"("tenantId", "scheduledClassId");

-- CreateIndex
CREATE INDEX "attendance_tenantId_studentId_classDate_idx" ON "attendance"("tenantId", "studentId", "classDate" DESC);

-- CreateIndex
CREATE INDEX "attendance_tenantId_batchId_classDate_idx" ON "attendance"("tenantId", "batchId", "classDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_scheduledClassId_studentId_key" ON "attendance"("scheduledClassId", "studentId");

-- CreateIndex
CREATE INDEX "homework_tenantId_batchId_status_idx" ON "homework"("tenantId", "batchId", "status");

-- CreateIndex
CREATE INDEX "homework_tenantId_teacherId_idx" ON "homework"("tenantId", "teacherId");

-- CreateIndex
CREATE INDEX "homework_submissions_tenantId_studentId_submittedAt_idx" ON "homework_submissions"("tenantId", "studentId", "submittedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_homeworkId_studentId_key" ON "homework_submissions"("homeworkId", "studentId");

-- CreateIndex
CREATE INDEX "homework_rubric_scores_submissionId_idx" ON "homework_rubric_scores"("submissionId");

-- CreateIndex
CREATE INDEX "teacher_payouts_tenantId_status_idx" ON "teacher_payouts"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_payouts_tenantId_teacherId_periodStart_periodEnd_key" ON "teacher_payouts"("tenantId", "teacherId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "payout_adjustments_payoutId_idx" ON "payout_adjustments"("payoutId");

-- CreateIndex
CREATE INDEX "payout_completed_classes_scheduledClassId_idx" ON "payout_completed_classes"("scheduledClassId");

-- CreateIndex
CREATE UNIQUE INDEX "payout_completed_classes_payoutId_scheduledClassId_key" ON "payout_completed_classes"("payoutId", "scheduledClassId");

-- CreateIndex
CREATE INDEX "meetings_tenantId_scheduledClassId_idx" ON "meetings"("tenantId", "scheduledClassId");

-- CreateIndex
CREATE INDEX "meetings_tenantId_status_idx" ON "meetings"("tenantId", "status");

-- CreateIndex
CREATE INDEX "meetings_status_scheduledStartTime_idx" ON "meetings"("status", "scheduledStartTime");

-- CreateIndex
CREATE INDEX "meeting_attendance_meetingId_userId_idx" ON "meeting_attendance"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "non_teaching_tasks_tenantId_teacherId_status_idx" ON "non_teaching_tasks"("tenantId", "teacherId", "status");

-- CreateIndex
CREATE INDEX "non_teaching_tasks_tenantId_status_createdAt_idx" ON "non_teaching_tasks"("tenantId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_levels_teacherId_key" ON "teacher_levels"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_levels_tenantId_teacherId_key" ON "teacher_levels"("tenantId", "teacherId");

-- CreateIndex
CREATE INDEX "teacher_level_history_teacherLevelId_idx" ON "teacher_level_history"("teacherLevelId");

-- CreateIndex
CREATE INDEX "call_escalations_tenantId_scheduledClassId_idx" ON "call_escalations"("tenantId", "scheduledClassId");

-- CreateIndex
CREATE INDEX "call_escalations_tenantId_teacherId_createdAt_idx" ON "call_escalations"("tenantId", "teacherId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "call_escalation_attempts_escalationId_idx" ON "call_escalation_attempts"("escalationId");

-- CreateIndex
CREATE INDEX "tutoring_requests_tenantId_studentId_status_idx" ON "tutoring_requests"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "tutoring_requests_tenantId_teacherId_status_idx" ON "tutoring_requests"("tenantId", "teacherId", "status");

-- CreateIndex
CREATE INDEX "student_reminder_calls_tenantId_scheduledClassId_studentId_idx" ON "student_reminder_calls"("tenantId", "scheduledClassId", "studentId");

-- CreateIndex
CREATE INDEX "student_reminder_calls_tenantId_studentId_createdAt_idx" ON "student_reminder_calls"("tenantId", "studentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "student_reminder_call_attempts_reminderCallId_idx" ON "student_reminder_call_attempts"("reminderCallId");

-- CreateIndex
CREATE INDEX "teacher_lateness_reminder_logs_batchId_idx" ON "teacher_lateness_reminder_logs"("batchId");

-- CreateIndex
CREATE INDEX "teacher_lateness_reminder_logs_teacherId_idx" ON "teacher_lateness_reminder_logs"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_lateness_reminder_logs_tenantId_batchId_teacherId_key" ON "teacher_lateness_reminder_logs"("tenantId", "batchId", "teacherId");

-- CreateIndex
CREATE INDEX "questions_tenantId_subject_difficulty_idx" ON "questions"("tenantId", "subject", "difficulty");

-- CreateIndex
CREATE INDEX "questions_tenantId_type_idx" ON "questions"("tenantId", "type");

-- CreateIndex
CREATE INDEX "questions_tenantId_tags_idx" ON "questions"("tenantId", "tags");

-- CreateIndex
CREATE INDEX "exams_tenantId_batchId_status_idx" ON "exams"("tenantId", "batchId", "status");

-- CreateIndex
CREATE INDEX "exams_tenantId_status_scheduledStartTime_idx" ON "exams"("tenantId", "status", "scheduledStartTime");

-- CreateIndex
CREATE INDEX "exam_questions_questionId_idx" ON "exam_questions"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_examId_questionId_key" ON "exam_questions"("examId", "questionId");

-- CreateIndex
CREATE INDEX "exam_sessions_status_serverDeadline_idx" ON "exam_sessions"("status", "serverDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sessions_tenantId_examId_studentId_key" ON "exam_sessions"("tenantId", "examId", "studentId");

-- CreateIndex
CREATE INDEX "proctoring_logs_sessionId_eventType_idx" ON "proctoring_logs"("sessionId", "eventType");

-- CreateIndex
CREATE INDEX "proctoring_logs_sessionId_timestamp_idx" ON "proctoring_logs"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "incident_reports_examId_disposition_idx" ON "incident_reports"("examId", "disposition");

-- CreateIndex
CREATE INDEX "incident_reports_sessionId_idx" ON "incident_reports"("sessionId");

-- CreateIndex
CREATE INDEX "quiz_proctoring_sessions_status_serverDeadline_idx" ON "quiz_proctoring_sessions"("status", "serverDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_proctoring_sessions_tenantId_assessmentId_learnerId_key" ON "quiz_proctoring_sessions"("tenantId", "assessmentId", "learnerId");

-- CreateIndex
CREATE INDEX "quiz_proctoring_logs_sessionId_eventType_idx" ON "quiz_proctoring_logs"("sessionId", "eventType");

-- CreateIndex
CREATE INDEX "quiz_proctoring_logs_sessionId_timestamp_idx" ON "quiz_proctoring_logs"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "quiz_incident_reports_assessmentId_disposition_idx" ON "quiz_incident_reports"("assessmentId", "disposition");

-- CreateIndex
CREATE INDEX "quiz_incident_reports_sessionId_idx" ON "quiz_incident_reports"("sessionId");

-- CreateIndex
CREATE INDEX "conversations_tenantId_lastMessageAt_idx" ON "conversations"("tenantId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "conversation_participants_userId_idx" ON "conversation_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversationId_userId_key" ON "conversation_participants"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "message_reactions_messageId_idx" ON "message_reactions"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "message_reactions_messageId_userId_emoji_key" ON "message_reactions"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "analytics_events_tenantId_eventType_createdAt_idx" ON "analytics_events"("tenantId", "eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "analytics_events_userId_createdAt_idx" ON "analytics_events"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "analytics_cache_tenantId_metricKey_idx" ON "analytics_cache"("tenantId", "metricKey");

-- CreateIndex
CREATE INDEX "analytics_cache_expiresAt_idx" ON "analytics_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "activity_logs_tenantId_timestamp_idx" ON "activity_logs"("tenantId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_type_timestamp_idx" ON "activity_logs"("type", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_timestamp_idx" ON "activity_logs"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "tenant_logs_tenantId_createdAt_idx" ON "tenant_logs"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "tenant_logs_tenantId_actionType_createdAt_idx" ON "tenant_logs"("tenantId", "actionType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "privacy_audit_logs_tenantId_createdAt_idx" ON "privacy_audit_logs"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "privacy_audit_logs_userId_createdAt_idx" ON "privacy_audit_logs"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "user_availability_slots" ADD CONSTRAINT "user_availability_slots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_parents" ADD CONSTRAINT "user_parents_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_parents" ADD CONSTRAINT "user_parents_childId_fkey" FOREIGN KEY ("childId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_selected_tenants" ADD CONSTRAINT "course_selected_tenants_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_course_selected_tenants" ADD CONSTRAINT "master_course_selected_tenants_masterCourseId_fkey" FOREIGN KEY ("masterCourseId") REFERENCES "master_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_selected_tenants" ADD CONSTRAINT "certificate_selected_tenants_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "academic_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_holidays" ADD CONSTRAINT "academic_holidays_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "academic_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_schedule" ADD CONSTRAINT "batch_schedule_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_students" ADD CONSTRAINT "batch_students_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_substitute_teachers" ADD CONSTRAINT "batch_substitute_teachers_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_classes" ADD CONSTRAINT "scheduled_classes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "credit_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_scheduledClassId_fkey" FOREIGN KEY ("scheduledClassId") REFERENCES "scheduled_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_rubric_scores" ADD CONSTRAINT "homework_rubric_scores_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_adjustments" ADD CONSTRAINT "payout_adjustments_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "teacher_payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_completed_classes" ADD CONSTRAINT "payout_completed_classes_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "teacher_payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_completed_classes" ADD CONSTRAINT "payout_completed_classes_scheduledClassId_fkey" FOREIGN KEY ("scheduledClassId") REFERENCES "scheduled_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_level_history" ADD CONSTRAINT "teacher_level_history_teacherLevelId_fkey" FOREIGN KEY ("teacherLevelId") REFERENCES "teacher_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_escalation_attempts" ADD CONSTRAINT "call_escalation_attempts_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "call_escalations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_reminder_call_attempts" ADD CONSTRAINT "student_reminder_call_attempts_reminderCallId_fkey" FOREIGN KEY ("reminderCallId") REFERENCES "student_reminder_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proctoring_logs" ADD CONSTRAINT "proctoring_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_proctoring_logs" ADD CONSTRAINT "quiz_proctoring_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "quiz_proctoring_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_incident_reports" ADD CONSTRAINT "quiz_incident_reports_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "quiz_proctoring_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
