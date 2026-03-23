-- ============================================
-- COMPREHENSIVE SYNC MIGRATION
-- Syncs Supabase PostgreSQL to match Prisma schema
-- Idempotent: safe to run multiple times
-- ============================================

-- ============================================
-- 1. ENUMS
-- ============================================

DO $$ BEGIN CREATE TYPE "CandidateStatus" AS ENUM ('SOURCED', 'CONTACTED', 'INTERVIEWED', 'OFFERED', 'HIRED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "InterviewStatus" AS ENUM ('CREATED', 'PLAN_GENERATED', 'PENDING', 'IN_PROGRESS', 'DISCONNECTED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'REPORT_GENERATING', 'REPORT_READY', 'REPORT_FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "InterviewType" AS ENUM ('TECHNICAL', 'BEHAVIORAL', 'DOMAIN_EXPERT', 'LANGUAGE', 'CASE_STUDY'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "InterviewMode" AS ENUM ('GENERAL_PROFILE', 'JOB_FIT', 'HYBRID', 'CULTURAL_FIT', 'TECHNICAL_DEEP_DIVE', 'SCREENING', 'CUSTOM'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "RecordingState" AS ENUM ('UPLOADING', 'FINALIZING', 'COMPLETE', 'VERIFIED', 'DELETED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "EvidenceConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED', 'FILLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMP_TO_HIRE'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "RemoteType" AS ENUM ('REMOTE', 'ONSITE', 'HYBRID'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEWING', 'SHORTLISTED', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'SENT', 'OPENED', 'ACCEPTED', 'COMPLETED', 'EXPIRED', 'DECLINED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "NotificationType" AS ENUM ('INTERVIEW_INVITE', 'APPLICATION_UPDATE', 'MATCH_ALERT', 'FEEDBACK_READY', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "SkillImportance" AS ENUM ('REQUIRED', 'PREFERRED', 'NICE_TO_HAVE'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "PassiveProfileStatus" AS ENUM ('CREATED', 'INVITED', 'LINKED', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "DocumentType" AS ENUM ('RESUME', 'COVER_LETTER', 'CERTIFICATION', 'OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "ProctoringEventSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED', 'OVERRIDDEN'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "ReviewDecisionType" AS ENUM ('APPROVE', 'REJECT', 'FLAG', 'OVERRIDE'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "RemotePreference" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "CandidateAvailability" AS ENUM ('IMMEDIATELY', 'TWO_WEEKS', 'ONE_MONTH', 'THREE_MONTHS', 'NOT_LOOKING'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "OnboardingStatus" AS ENUM ('INVITED', 'PROFILE_STARTED', 'PROFILE_COMPLETED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ON_HOLD'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "RecruiterOnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "MessageSenderRole" AS ENUM ('RECRUITER', 'CANDIDATE', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add any missing enum values to InterviewStatus
ALTER TYPE "InterviewStatus" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "InterviewStatus" ADD VALUE IF NOT EXISTS 'PLAN_GENERATED';
ALTER TYPE "InterviewStatus" ADD VALUE IF NOT EXISTS 'DISCONNECTED';
ALTER TYPE "InterviewStatus" ADD VALUE IF NOT EXISTS 'REPORT_GENERATING';
ALTER TYPE "InterviewStatus" ADD VALUE IF NOT EXISTS 'REPORT_READY';
ALTER TYPE "InterviewStatus" ADD VALUE IF NOT EXISTS 'REPORT_FAILED';

-- ============================================
-- 2. NEW COLUMNS ON EXISTING TABLES
-- ============================================

-- Recruiter: new columns
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "supabaseUserId" TEXT;
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "onboardingStatus" "RecruiterOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT;
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "profileImage" TEXT;
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "hiringPreferences" JSONB;

-- Candidate: new columns
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "ariaInterviewed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "ariaOverallScore" DOUBLE PRECISION;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'PROFILE_STARTED';
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "invitationSource" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "profileCompleteness" DOUBLE PRECISION;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "riskScore" DOUBLE PRECISION;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "riskFlags" JSONB;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "linkedinConsistencyScore" DOUBLE PRECISION;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "linkedinConsistencyFlags" JSONB;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "demographicData" JSONB;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "demographicConsentGiven" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "visaStatus" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "preferredTitles" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "consentGdpr" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "consentDataProcessing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "consentedAt" TIMESTAMP(3);
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "legalHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "legalHoldReason" TEXT;

-- Client: new columns
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "domain" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "brandColor" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "regions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Match: new columns
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "jobId" TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "skillMatchScore" DOUBLE PRECISION;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "experienceMatchScore" DOUBLE PRECISION;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'pending';

-- ============================================
-- 3. NEW TABLES
-- ============================================

-- AIUsageLog
CREATE TABLE IF NOT EXISTS "AIUsageLog" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "companyId" TEXT,
    "recruiterId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageLog_pkey" PRIMARY KEY ("id")
);

-- InterviewQualityMetrics
CREATE TABLE IF NOT EXISTS "InterviewQualityMetrics" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "followUpQuestions" INTEGER NOT NULL DEFAULT 0,
    "avgResponseDepth" DOUBLE PRECISION,
    "topicTransitions" INTEGER NOT NULL DEFAULT 0,
    "adaptiveDifficulty" JSONB,
    "coveragePercentage" DOUBLE PRECISION,
    "timeUtilization" DOUBLE PRECISION,
    "depthScore" DOUBLE PRECISION,
    "personalizationScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewQualityMetrics_pkey" PRIMARY KEY ("id")
);

-- HiringManagerMembership
CREATE TABLE IF NOT EXISTS "HiringManagerMembership" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HiringManagerMembership_pkey" PRIMARY KEY ("id")
);

-- Job
CREATE TABLE IF NOT EXISTS "Job" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "department" TEXT,
    "industry" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "remoteType" "RemoteType" NOT NULL DEFAULT 'ONSITE',
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "salaryCurrency" TEXT DEFAULT 'USD',
    "experienceMin" INTEGER,
    "experienceMax" INTEGER,
    "urgencyLevel" INTEGER DEFAULT 3,
    "skillsRequired" JSONB NOT NULL DEFAULT '[]',
    "embedding" JSONB,
    "postedAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "recruiterId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- JobSkill
CREATE TABLE IF NOT EXISTS "JobSkill" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "jobId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "skillCategory" TEXT,
    "importance" "SkillImportance" NOT NULL DEFAULT 'REQUIRED',
    "minYears" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("id")
);

-- Application
CREATE TABLE IF NOT EXISTS "Application" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "coverLetterUrl" TEXT,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- Interview
CREATE TABLE IF NOT EXISTS "Interview" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "scheduledBy" TEXT NOT NULL,
    "jobId" TEXT,
    "templateId" TEXT,
    "invitationId" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'PENDING',
    "type" "InterviewType" NOT NULL DEFAULT 'TECHNICAL',
    "mode" "InterviewMode" NOT NULL DEFAULT 'GENERAL_PROFILE',
    "duration" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "transcript" JSONB,
    "videoUrl" TEXT,
    "audioUrl" TEXT,
    "voiceProvider" TEXT DEFAULT 'text-sse',
    "recordingUrl" TEXT,
    "recordingFormat" TEXT DEFAULT 'webm',
    "recordingSize" INTEGER,
    "interviewPlan" JSONB,
    "skillModuleScores" JSONB,
    "isPractice" BOOLEAN NOT NULL DEFAULT false,
    "overallScore" DOUBLE PRECISION,
    "reportStatus" TEXT DEFAULT 'pending',
    "reportRetryCount" INTEGER NOT NULL DEFAULT 0,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "invitedEmail" TEXT,
    "integrityEvents" JSONB,
    "consentRecording" BOOLEAN NOT NULL DEFAULT false,
    "consentProctoring" BOOLEAN NOT NULL DEFAULT false,
    "consentPrivacy" BOOLEAN NOT NULL DEFAULT false,
    "consentedAt" TIMESTAMP(3),
    "interviewPlanVersion" TEXT,
    "screenRecordingUrl" TEXT,
    "screenRecordingSize" INTEGER,
    "templateSnapshot" JSONB,
    "templateSnapshotHash" TEXT,
    "recordingState" "RecordingState",
    "recordingManifestHash" TEXT,
    "reconnectToken" TEXT,
    "accommodations" JSONB,
    "retakeOfInterviewId" TEXT,
    "readinessVerified" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT,
    "recruiterObjectives" JSONB,
    "hmNotes" JSONB,
    "candidateSelfAssessment" JSONB,
    "coverageMap" JSONB,
    "evidenceBundle" JSONB,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "legalHoldReason" TEXT,
    "legalHoldSetBy" TEXT,
    "legalHoldSetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- InterviewReport
CREATE TABLE IF NOT EXISTS "InterviewReport" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "technicalSkills" JSONB NOT NULL,
    "softSkills" JSONB NOT NULL,
    "domainExpertise" DOUBLE PRECISION,
    "clarityStructure" DOUBLE PRECISION,
    "problemSolving" DOUBLE PRECISION,
    "communicationScore" DOUBLE PRECISION,
    "measurableImpact" DOUBLE PRECISION,
    "summary" TEXT NOT NULL,
    "strengths" JSONB NOT NULL,
    "areasToImprove" JSONB NOT NULL,
    "recommendation" TEXT,
    "hiringAdvice" TEXT,
    "overallScore" DOUBLE PRECISION,
    "professionalExperience" DOUBLE PRECISION,
    "roleFit" DOUBLE PRECISION,
    "culturalFit" DOUBLE PRECISION,
    "thinkingJudgment" DOUBLE PRECISION,
    "confidenceLevel" TEXT,
    "headline" TEXT,
    "riskSignals" JSONB,
    "hypothesisOutcomes" JSONB,
    "evidenceHighlights" JSONB,
    "rubricSnapshot" JSONB,
    "jobMatchScore" DOUBLE PRECISION,
    "requirementMatches" JSONB,
    "environmentFitNotes" TEXT,
    "candidateSelfAssessment" JSONB,
    "integrityScore" DOUBLE PRECISION,
    "integrityFlags" JSONB,
    "scorerModelVersion" TEXT,
    "scorerPromptVersion" TEXT,
    "rubricVersion" TEXT,
    "evidenceHash" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "shareToken" TEXT,
    "shareExpiresAt" TIMESTAMP(3),
    "recipientEmail" TEXT,
    "sharePurpose" TEXT,
    "shareRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewReport_pkey" PRIMARY KEY ("id")
);

-- InterviewTemplate
CREATE TABLE IF NOT EXISTS "InterviewTemplate" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "roleType" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "aiConfig" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "InterviewMode" NOT NULL DEFAULT 'GENERAL_PROFILE',
    "strategicObjectives" JSONB,
    "customScreeningQuestions" JSONB,
    "hmNotesTemplate" TEXT,
    "scoringWeights" JSONB,
    "maxDurationMinutes" INTEGER NOT NULL DEFAULT 45,
    "minDurationMinutes" INTEGER NOT NULL DEFAULT 15,
    "candidateReportPolicy" JSONB,
    "retakePolicy" JSONB,
    "readinessCheckRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "recruiterId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewTemplate_pkey" PRIMARY KEY ("id")
);

-- SkillModule
CREATE TABLE IF NOT EXISTS "SkillModule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 5,
    "rubric" JSONB NOT NULL DEFAULT '{}',
    "prompts" JSONB NOT NULL DEFAULT '[]',
    "difficulty" TEXT NOT NULL DEFAULT 'mid',
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "recruiterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillModule_pkey" PRIMARY KEY ("id")
);

-- InterviewTemplateModule
CREATE TABLE IF NOT EXISTS "InterviewTemplateModule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewTemplateModule_pkey" PRIMARY KEY ("id")
);

-- InterviewInvitation
CREATE TABLE IF NOT EXISTS "InterviewInvitation" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "recruiterId" TEXT NOT NULL,
    "candidateId" TEXT,
    "jobId" TEXT,
    "templateId" TEXT,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewInvitation_pkey" PRIMARY KEY ("id")
);

-- InterviewResponse
CREATE TABLE IF NOT EXISTS "InterviewResponse" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "responseTranscript" TEXT,
    "videoUrl" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "aiScore" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "skillsDemonstrated" JSONB DEFAULT '[]',
    "answerQuality" INTEGER,
    "evidenceStrength" INTEGER,
    "flags" JSONB,
    "hypothesesTested" JSONB,
    "mediaTimestampStartMs" INTEGER,
    "mediaTimestampEndMs" INTEGER,
    "sectionName" TEXT,
    "difficultyLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewResponse_pkey" PRIMARY KEY ("id")
);

-- InterviewFeedback
CREATE TABLE IF NOT EXISTS "InterviewFeedback" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "narrative" TEXT,
    "strengths" JSONB DEFAULT '[]',
    "improvements" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewFeedback_pkey" PRIMARY KEY ("id")
);

-- ProctoringEvent
CREATE TABLE IF NOT EXISTS "ProctoringEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,
    "severity" "ProctoringEventSeverity" NOT NULL DEFAULT 'LOW',

    CONSTRAINT "ProctoringEvent_pkey" PRIMARY KEY ("id")
);

-- InterviewHypothesis
CREATE TABLE IF NOT EXISTS "InterviewHypothesis" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "outcome" TEXT,
    "evidence" TEXT,
    "confidenceLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewHypothesis_pkey" PRIMARY KEY ("id")
);

-- InterviewSection
CREATE TABLE IF NOT EXISTS "InterviewSection" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "sectionOrder" INTEGER NOT NULL,
    "skillModuleName" TEXT,
    "plannedDuration" INTEGER NOT NULL,
    "actualDuration" INTEGER,
    "coverageScore" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InterviewSection_pkey" PRIMARY KEY ("id")
);

-- PassiveProfile
CREATE TABLE IF NOT EXISTS "PassiveProfile" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "linkedinUrl" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "currentTitle" TEXT,
    "currentCompany" TEXT,
    "yearsExperience" INTEGER,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resumeUrl" TEXT,
    "notes" TEXT,
    "extractedData" JSONB,
    "source" TEXT,
    "status" "PassiveProfileStatus" NOT NULL DEFAULT 'CREATED',
    "sourceRecruiterId" TEXT,
    "linkedCandidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassiveProfile_pkey" PRIMARY KEY ("id")
);

-- Notification
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "candidateId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Document
CREATE TABLE IF NOT EXISTS "Document" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'RESUME',
    "fileUrl" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "parsedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CandidateSkill
CREATE TABLE IF NOT EXISTS "CandidateSkill" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "category" TEXT,
    "proficiency" INTEGER,
    "yearsExp" DOUBLE PRECISION,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateSkill_pkey" PRIMARY KEY ("id")
);

-- CandidateExperience
CREATE TABLE IF NOT EXISTS "CandidateExperience" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateExperience_pkey" PRIMARY KEY ("id")
);

-- CandidateEducation
CREATE TABLE IF NOT EXISTS "CandidateEducation" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "field" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "gpa" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateEducation_pkey" PRIMARY KEY ("id")
);

-- CandidateCertification
CREATE TABLE IF NOT EXISTS "CandidateCertification" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuingOrg" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "credentialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateCertification_pkey" PRIMARY KEY ("id")
);

-- Message
CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "MessageSenderRole" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientRole" "MessageSenderRole" NOT NULL,
    "content" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- ActivityLog
CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- NotificationPreference
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "interviewInvites" BOOLEAN NOT NULL DEFAULT true,
    "applicationUpdates" BOOLEAN NOT NULL DEFAULT true,
    "matchAlerts" BOOLEAN NOT NULL DEFAULT true,
    "feedbackReady" BOOLEAN NOT NULL DEFAULT true,
    "systemAlerts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- JobPreference
CREATE TABLE IF NOT EXISTS "JobPreference" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "jobTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remotePreference" "RemotePreference" NOT NULL DEFAULT 'FLEXIBLE',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
    "availability" "CandidateAvailability" NOT NULL DEFAULT 'IMMEDIATELY',
    "willingToRelocate" BOOLEAN NOT NULL DEFAULT false,
    "noticePeriod" TEXT,
    "preferredCurrency" TEXT DEFAULT 'USD',
    "preferredIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredCompanies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPreference_pkey" PRIMARY KEY ("id")
);

-- ApprovalAction
CREATE TABLE IF NOT EXISTS "ApprovalAction" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "adminUserId" TEXT NOT NULL,
    "adminEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- TeamInvitation
CREATE TABLE IF NOT EXISTS "TeamInvitation" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'recruiter',
    "department" TEXT,
    "companyId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);

-- ReviewDecision
CREATE TABLE IF NOT EXISTS "ReviewDecision" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerEmail" TEXT,
    "decision" "ReviewDecisionType" NOT NULL,
    "overrideReason" TEXT,
    "previousRecommendation" TEXT,
    "newRecommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- ReportShareView
CREATE TABLE IF NOT EXISTS "ReportShareView" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "reportId" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "viewerIp" TEXT,
    "userAgent" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportShareView_pkey" PRIMARY KEY ("id")
);

-- RetentionPolicy
CREATE TABLE IF NOT EXISTS "RetentionPolicy" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "recordingDays" INTEGER NOT NULL DEFAULT 90,
    "transcriptDays" INTEGER NOT NULL DEFAULT 365,
    "candidateDataDays" INTEGER NOT NULL DEFAULT 730,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- SSOConfig
CREATE TABLE IF NOT EXISTS "SSOConfig" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "metadataUrl" TEXT,
    "entityId" TEXT,
    "certificate" TEXT,
    "domain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SSOConfig_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- 4. UNIQUE CONSTRAINTS
-- ============================================

-- Recruiter
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Recruiter_supabaseUserId_key') THEN
    ALTER TABLE "Recruiter" ADD CONSTRAINT "Recruiter_supabaseUserId_key" UNIQUE ("supabaseUserId");
  END IF;
END $$;

-- InterviewQualityMetrics
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewQualityMetrics_interviewId_key') THEN
    ALTER TABLE "InterviewQualityMetrics" ADD CONSTRAINT "InterviewQualityMetrics_interviewId_key" UNIQUE ("interviewId");
  END IF;
END $$;

-- HiringManagerMembership
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HiringManagerMembership_userId_companyId_key') THEN
    ALTER TABLE "HiringManagerMembership" ADD CONSTRAINT "HiringManagerMembership_userId_companyId_key" UNIQUE ("userId", "companyId");
  END IF;
END $$;

-- InterviewReport
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewReport_interviewId_key') THEN
    ALTER TABLE "InterviewReport" ADD CONSTRAINT "InterviewReport_interviewId_key" UNIQUE ("interviewId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewReport_shareToken_key') THEN
    ALTER TABLE "InterviewReport" ADD CONSTRAINT "InterviewReport_shareToken_key" UNIQUE ("shareToken");
  END IF;
END $$;

-- Interview
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_invitationId_key') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_invitationId_key" UNIQUE ("invitationId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_accessToken_key') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_accessToken_key" UNIQUE ("accessToken");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_reconnectToken_key') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_reconnectToken_key" UNIQUE ("reconnectToken");
  END IF;
END $$;

-- InterviewInvitation
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewInvitation_token_key') THEN
    ALTER TABLE "InterviewInvitation" ADD CONSTRAINT "InterviewInvitation_token_key" UNIQUE ("token");
  END IF;
END $$;

-- InterviewTemplateModule
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewTemplateModule_templateId_moduleId_key') THEN
    ALTER TABLE "InterviewTemplateModule" ADD CONSTRAINT "InterviewTemplateModule_templateId_moduleId_key" UNIQUE ("templateId", "moduleId");
  END IF;
END $$;

-- JobSkill
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobSkill_jobId_skillName_key') THEN
    ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobId_skillName_key" UNIQUE ("jobId", "skillName");
  END IF;
END $$;

-- Application
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Application_candidateId_jobId_key') THEN
    ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_jobId_key" UNIQUE ("candidateId", "jobId");
  END IF;
END $$;

-- CandidateSkill
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateSkill_candidateId_skillName_key') THEN
    ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_candidateId_skillName_key" UNIQUE ("candidateId", "skillName");
  END IF;
END $$;

-- NotificationPreference
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_userId_key') THEN
    ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_key" UNIQUE ("userId");
  END IF;
END $$;

-- JobPreference
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobPreference_candidateId_key') THEN
    ALTER TABLE "JobPreference" ADD CONSTRAINT "JobPreference_candidateId_key" UNIQUE ("candidateId");
  END IF;
END $$;

-- TeamInvitation
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamInvitation_token_key') THEN
    ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_token_key" UNIQUE ("token");
  END IF;
END $$;

-- RetentionPolicy
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RetentionPolicy_companyId_key') THEN
    ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_companyId_key" UNIQUE ("companyId");
  END IF;
END $$;

-- SSOConfig
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SSOConfig_companyId_key') THEN
    ALTER TABLE "SSOConfig" ADD CONSTRAINT "SSOConfig_companyId_key" UNIQUE ("companyId");
  END IF;
END $$;

-- Match (already exists from init but ensure jobId index)
-- Match_candidateId_roleId_key already exists from init

-- ============================================
-- 5. INDEXES
-- ============================================

-- Recruiter indexes
CREATE INDEX IF NOT EXISTS "Recruiter_companyId_idx" ON "Recruiter"("companyId");
CREATE INDEX IF NOT EXISTS "Recruiter_onboardingStatus_idx" ON "Recruiter"("onboardingStatus");

-- Candidate indexes (some exist from init)
CREATE INDEX IF NOT EXISTS "Candidate_ariaInterviewed_idx" ON "Candidate"("ariaInterviewed");
CREATE INDEX IF NOT EXISTS "Candidate_email_idx" ON "Candidate"("email");
CREATE INDEX IF NOT EXISTS "Candidate_onboardingStatus_idx" ON "Candidate"("onboardingStatus");

-- Match indexes
CREATE INDEX IF NOT EXISTS "Match_jobId_idx" ON "Match"("jobId");

-- AIUsageLog indexes
CREATE INDEX IF NOT EXISTS "AIUsageLog_interviewId_idx" ON "AIUsageLog"("interviewId");
CREATE INDEX IF NOT EXISTS "AIUsageLog_companyId_idx" ON "AIUsageLog"("companyId");
CREATE INDEX IF NOT EXISTS "AIUsageLog_createdAt_idx" ON "AIUsageLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AIUsageLog_operation_idx" ON "AIUsageLog"("operation");

-- InterviewQualityMetrics indexes
CREATE INDEX IF NOT EXISTS "InterviewQualityMetrics_interviewId_idx" ON "InterviewQualityMetrics"("interviewId");

-- HiringManagerMembership indexes
CREATE INDEX IF NOT EXISTS "HiringManagerMembership_companyId_idx" ON "HiringManagerMembership"("companyId");
CREATE INDEX IF NOT EXISTS "HiringManagerMembership_userId_idx" ON "HiringManagerMembership"("userId");
CREATE INDEX IF NOT EXISTS "HiringManagerMembership_email_idx" ON "HiringManagerMembership"("email");

-- Job indexes
CREATE INDEX IF NOT EXISTS "Job_recruiterId_idx" ON "Job"("recruiterId");
CREATE INDEX IF NOT EXISTS "Job_companyId_idx" ON "Job"("companyId");
CREATE INDEX IF NOT EXISTS "Job_status_idx" ON "Job"("status");
CREATE INDEX IF NOT EXISTS "Job_employmentType_idx" ON "Job"("employmentType");
CREATE INDEX IF NOT EXISTS "Job_remoteType_idx" ON "Job"("remoteType");
CREATE INDEX IF NOT EXISTS "Job_postedAt_idx" ON "Job"("postedAt");

-- JobSkill indexes
CREATE INDEX IF NOT EXISTS "JobSkill_jobId_idx" ON "JobSkill"("jobId");
CREATE INDEX IF NOT EXISTS "JobSkill_skillName_idx" ON "JobSkill"("skillName");

-- Application indexes
CREATE INDEX IF NOT EXISTS "Application_candidateId_idx" ON "Application"("candidateId");
CREATE INDEX IF NOT EXISTS "Application_jobId_idx" ON "Application"("jobId");
CREATE INDEX IF NOT EXISTS "Application_status_idx" ON "Application"("status");
CREATE INDEX IF NOT EXISTS "Application_appliedAt_idx" ON "Application"("appliedAt");

-- Interview indexes
CREATE INDEX IF NOT EXISTS "Interview_candidateId_idx" ON "Interview"("candidateId");
CREATE INDEX IF NOT EXISTS "Interview_scheduledBy_idx" ON "Interview"("scheduledBy");
CREATE INDEX IF NOT EXISTS "Interview_status_idx" ON "Interview"("status");
CREATE INDEX IF NOT EXISTS "Interview_jobId_idx" ON "Interview"("jobId");
CREATE INDEX IF NOT EXISTS "Interview_mode_idx" ON "Interview"("mode");
CREATE INDEX IF NOT EXISTS "Interview_reconnectToken_idx" ON "Interview"("reconnectToken");

-- InterviewResponse indexes
CREATE INDEX IF NOT EXISTS "InterviewResponse_interviewId_idx" ON "InterviewResponse"("interviewId");

-- InterviewFeedback indexes
CREATE INDEX IF NOT EXISTS "InterviewFeedback_interviewId_idx" ON "InterviewFeedback"("interviewId");

-- ProctoringEvent indexes
CREATE INDEX IF NOT EXISTS "ProctoringEvent_interviewId_idx" ON "ProctoringEvent"("interviewId");
CREATE INDEX IF NOT EXISTS "ProctoringEvent_eventType_idx" ON "ProctoringEvent"("eventType");

-- InterviewHypothesis indexes
CREATE INDEX IF NOT EXISTS "InterviewHypothesis_interviewId_idx" ON "InterviewHypothesis"("interviewId");

-- InterviewSection indexes
CREATE INDEX IF NOT EXISTS "InterviewSection_interviewId_idx" ON "InterviewSection"("interviewId");

-- InterviewTemplate indexes
CREATE INDEX IF NOT EXISTS "InterviewTemplate_recruiterId_idx" ON "InterviewTemplate"("recruiterId");
CREATE INDEX IF NOT EXISTS "InterviewTemplate_companyId_idx" ON "InterviewTemplate"("companyId");

-- SkillModule indexes
CREATE INDEX IF NOT EXISTS "SkillModule_category_idx" ON "SkillModule"("category");
CREATE INDEX IF NOT EXISTS "SkillModule_recruiterId_idx" ON "SkillModule"("recruiterId");

-- InterviewTemplateModule indexes
CREATE INDEX IF NOT EXISTS "InterviewTemplateModule_templateId_idx" ON "InterviewTemplateModule"("templateId");
CREATE INDEX IF NOT EXISTS "InterviewTemplateModule_moduleId_idx" ON "InterviewTemplateModule"("moduleId");

-- InterviewInvitation indexes
CREATE INDEX IF NOT EXISTS "InterviewInvitation_recruiterId_idx" ON "InterviewInvitation"("recruiterId");
CREATE INDEX IF NOT EXISTS "InterviewInvitation_candidateId_idx" ON "InterviewInvitation"("candidateId");
CREATE INDEX IF NOT EXISTS "InterviewInvitation_jobId_idx" ON "InterviewInvitation"("jobId");
CREATE INDEX IF NOT EXISTS "InterviewInvitation_status_idx" ON "InterviewInvitation"("status");
CREATE INDEX IF NOT EXISTS "InterviewInvitation_token_idx" ON "InterviewInvitation"("token");

-- PassiveProfile indexes
CREATE INDEX IF NOT EXISTS "PassiveProfile_email_idx" ON "PassiveProfile"("email");
CREATE INDEX IF NOT EXISTS "PassiveProfile_sourceRecruiterId_idx" ON "PassiveProfile"("sourceRecruiterId");
CREATE INDEX IF NOT EXISTS "PassiveProfile_status_idx" ON "PassiveProfile"("status");

-- Notification indexes
CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification"("type");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

-- Document indexes
CREATE INDEX IF NOT EXISTS "Document_candidateId_idx" ON "Document"("candidateId");
CREATE INDEX IF NOT EXISTS "Document_type_idx" ON "Document"("type");

-- CandidateSkill indexes
CREATE INDEX IF NOT EXISTS "CandidateSkill_candidateId_idx" ON "CandidateSkill"("candidateId");
CREATE INDEX IF NOT EXISTS "CandidateSkill_skillName_idx" ON "CandidateSkill"("skillName");

-- CandidateExperience indexes
CREATE INDEX IF NOT EXISTS "CandidateExperience_candidateId_idx" ON "CandidateExperience"("candidateId");

-- CandidateEducation indexes
CREATE INDEX IF NOT EXISTS "CandidateEducation_candidateId_idx" ON "CandidateEducation"("candidateId");

-- CandidateCertification indexes
CREATE INDEX IF NOT EXISTS "CandidateCertification_candidateId_idx" ON "CandidateCertification"("candidateId");

-- Message indexes
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX IF NOT EXISTS "Message_recipientId_idx" ON "Message"("recipientId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- ActivityLog indexes
CREATE INDEX IF NOT EXISTS "ActivityLog_userId_idx" ON "ActivityLog"("userId");
CREATE INDEX IF NOT EXISTS "ActivityLog_entityType_idx" ON "ActivityLog"("entityType");
CREATE INDEX IF NOT EXISTS "ActivityLog_action_idx" ON "ActivityLog"("action");
CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- JobPreference indexes
CREATE INDEX IF NOT EXISTS "JobPreference_candidateId_idx" ON "JobPreference"("candidateId");

-- ApprovalAction indexes
CREATE INDEX IF NOT EXISTS "ApprovalAction_candidateId_idx" ON "ApprovalAction"("candidateId");
CREATE INDEX IF NOT EXISTS "ApprovalAction_adminUserId_idx" ON "ApprovalAction"("adminUserId");
CREATE INDEX IF NOT EXISTS "ApprovalAction_createdAt_idx" ON "ApprovalAction"("createdAt");

-- TeamInvitation indexes
CREATE INDEX IF NOT EXISTS "TeamInvitation_email_idx" ON "TeamInvitation"("email");
CREATE INDEX IF NOT EXISTS "TeamInvitation_companyId_idx" ON "TeamInvitation"("companyId");
CREATE INDEX IF NOT EXISTS "TeamInvitation_token_idx" ON "TeamInvitation"("token");
CREATE INDEX IF NOT EXISTS "TeamInvitation_status_idx" ON "TeamInvitation"("status");

-- ReviewDecision indexes
CREATE INDEX IF NOT EXISTS "ReviewDecision_interviewId_idx" ON "ReviewDecision"("interviewId");
CREATE INDEX IF NOT EXISTS "ReviewDecision_reviewerId_idx" ON "ReviewDecision"("reviewerId");
CREATE INDEX IF NOT EXISTS "ReviewDecision_createdAt_idx" ON "ReviewDecision"("createdAt");

-- ReportShareView indexes
CREATE INDEX IF NOT EXISTS "ReportShareView_reportId_idx" ON "ReportShareView"("reportId");
CREATE INDEX IF NOT EXISTS "ReportShareView_shareToken_idx" ON "ReportShareView"("shareToken");

-- SSOConfig indexes
CREATE INDEX IF NOT EXISTS "SSOConfig_domain_idx" ON "SSOConfig"("domain");

-- ============================================
-- 6. FOREIGN KEY CONSTRAINTS
-- ============================================

-- Recruiter -> Client (companyId)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Recruiter_companyId_fkey') THEN
    ALTER TABLE "Recruiter" ADD CONSTRAINT "Recruiter_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Candidate -> Recruiter (already exists from init, but ensure it's there)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Candidate_recruiterId_fkey') THEN
    ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_recruiterId_fkey"
      FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Note -> Candidate (already exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_candidateId_fkey') THEN
    ALTER TABLE "Note" ADD CONSTRAINT "Note_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Role -> Client (already exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Role_clientId_fkey') THEN
    ALTER TABLE "Role" ADD CONSTRAINT "Role_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Match -> Candidate (already exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Match_candidateId_fkey') THEN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Match -> Role (already exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Match_roleId_fkey') THEN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Match -> Job
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Match_jobId_fkey') THEN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- HiringManagerMembership -> Client
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HiringManagerMembership_companyId_fkey') THEN
    ALTER TABLE "HiringManagerMembership" ADD CONSTRAINT "HiringManagerMembership_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Job -> Recruiter
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_recruiterId_fkey') THEN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_recruiterId_fkey"
      FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Job -> Client
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_companyId_fkey') THEN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Job -> InterviewTemplate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_templateId_fkey') THEN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "InterviewTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- JobSkill -> Job
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobSkill_jobId_fkey') THEN
    ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Application -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Application_candidateId_fkey') THEN
    ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Application -> Job
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Application_jobId_fkey') THEN
    ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Interview -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_candidateId_fkey') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Interview -> Recruiter (scheduledBy)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_scheduledBy_fkey') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_scheduledBy_fkey"
      FOREIGN KEY ("scheduledBy") REFERENCES "Recruiter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Interview -> Job
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_jobId_fkey') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Interview -> InterviewTemplate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_templateId_fkey') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "InterviewTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Interview -> InterviewInvitation
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_invitationId_fkey') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_invitationId_fkey"
      FOREIGN KEY ("invitationId") REFERENCES "InterviewInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Interview -> Client (companyId)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_companyId_fkey') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewReport -> Interview
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewReport_interviewId_fkey') THEN
    ALTER TABLE "InterviewReport" ADD CONSTRAINT "InterviewReport_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewTemplate -> Recruiter
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewTemplate_recruiterId_fkey') THEN
    ALTER TABLE "InterviewTemplate" ADD CONSTRAINT "InterviewTemplate_recruiterId_fkey"
      FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewTemplate -> Client
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewTemplate_companyId_fkey') THEN
    ALTER TABLE "InterviewTemplate" ADD CONSTRAINT "InterviewTemplate_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- SkillModule -> Recruiter
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SkillModule_recruiterId_fkey') THEN
    ALTER TABLE "SkillModule" ADD CONSTRAINT "SkillModule_recruiterId_fkey"
      FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewTemplateModule -> InterviewTemplate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewTemplateModule_templateId_fkey') THEN
    ALTER TABLE "InterviewTemplateModule" ADD CONSTRAINT "InterviewTemplateModule_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "InterviewTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewTemplateModule -> SkillModule
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewTemplateModule_moduleId_fkey') THEN
    ALTER TABLE "InterviewTemplateModule" ADD CONSTRAINT "InterviewTemplateModule_moduleId_fkey"
      FOREIGN KEY ("moduleId") REFERENCES "SkillModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewInvitation -> Recruiter
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewInvitation_recruiterId_fkey') THEN
    ALTER TABLE "InterviewInvitation" ADD CONSTRAINT "InterviewInvitation_recruiterId_fkey"
      FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewInvitation -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewInvitation_candidateId_fkey') THEN
    ALTER TABLE "InterviewInvitation" ADD CONSTRAINT "InterviewInvitation_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewInvitation -> Job
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewInvitation_jobId_fkey') THEN
    ALTER TABLE "InterviewInvitation" ADD CONSTRAINT "InterviewInvitation_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewInvitation -> InterviewTemplate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewInvitation_templateId_fkey') THEN
    ALTER TABLE "InterviewInvitation" ADD CONSTRAINT "InterviewInvitation_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "InterviewTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewResponse -> Interview
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewResponse_interviewId_fkey') THEN
    ALTER TABLE "InterviewResponse" ADD CONSTRAINT "InterviewResponse_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewFeedback -> Interview
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewFeedback_interviewId_fkey') THEN
    ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ProctoringEvent -> Interview
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProctoringEvent_interviewId_fkey') THEN
    ALTER TABLE "ProctoringEvent" ADD CONSTRAINT "ProctoringEvent_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewHypothesis -> Interview
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewHypothesis_interviewId_fkey') THEN
    ALTER TABLE "InterviewHypothesis" ADD CONSTRAINT "InterviewHypothesis_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- InterviewSection -> Interview
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterviewSection_interviewId_fkey') THEN
    ALTER TABLE "InterviewSection" ADD CONSTRAINT "InterviewSection_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- PassiveProfile -> Recruiter
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PassiveProfile_sourceRecruiterId_fkey') THEN
    ALTER TABLE "PassiveProfile" ADD CONSTRAINT "PassiveProfile_sourceRecruiterId_fkey"
      FOREIGN KEY ("sourceRecruiterId") REFERENCES "Recruiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Notification -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_candidateId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Document -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_candidateId_fkey') THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CandidateSkill -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateSkill_candidateId_fkey') THEN
    ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CandidateExperience -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateExperience_candidateId_fkey') THEN
    ALTER TABLE "CandidateExperience" ADD CONSTRAINT "CandidateExperience_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CandidateEducation -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateEducation_candidateId_fkey') THEN
    ALTER TABLE "CandidateEducation" ADD CONSTRAINT "CandidateEducation_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CandidateCertification -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateCertification_candidateId_fkey') THEN
    ALTER TABLE "CandidateCertification" ADD CONSTRAINT "CandidateCertification_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- JobPreference -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobPreference_candidateId_fkey') THEN
    ALTER TABLE "JobPreference" ADD CONSTRAINT "JobPreference_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ApprovalAction -> Candidate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalAction_candidateId_fkey') THEN
    ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- TeamInvitation -> Client
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamInvitation_companyId_fkey') THEN
    ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ReviewDecision -> Interview
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewDecision_interviewId_fkey') THEN
    ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ReportShareView -> InterviewReport
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportShareView_reportId_fkey') THEN
    ALTER TABLE "ReportShareView" ADD CONSTRAINT "ReportShareView_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "InterviewReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RetentionPolicy -> Client
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RetentionPolicy_companyId_fkey') THEN
    ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- SSOConfig -> Client
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SSOConfig_companyId_fkey') THEN
    ALTER TABLE "SSOConfig" ADD CONSTRAINT "SSOConfig_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================
-- DONE: All Prisma schema objects synced
-- ============================================
