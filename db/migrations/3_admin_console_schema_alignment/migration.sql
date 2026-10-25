-- Migration 3: Admin console tables and schema-doc alignment (2026-10-24)
-- Source: docs/Database Schema and Data Model.md section 12 and the earlier doc-only tables.
--
-- DESTRUCTIVE STEP (documented): the TrainingStage enum loses SUSPENDED and TERMINATED.
-- Decision 2026-10-24: suspension is the Board flag TraineeProfile.isSuspended; leaving training is
-- TraineeProfile.trainingStatus. The guard below aborts the migration if any row still holds a removed
-- value, so no stage is silently rewritten. At the time of writing no row, seed or code uses them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TraineeProfile" WHERE "currentStage"::text IN ('SUSPENDED','TERMINATED'))
     OR EXISTS (SELECT 1 FROM "CurriculumMilestone" WHERE "stage"::text IN ('SUSPENDED','TERMINATED'))
     OR EXISTS (SELECT 1 FROM "ItaSession" WHERE "trainingStage"::text IN ('SUSPENDED','TERMINATED')) THEN
    RAISE EXCEPTION 'TrainingStage SUSPENDED/TERMINATED still in use: move to isSuspended / trainingStatus first';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "TraineeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'DEACTIVATED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReviewGrade" AS ENUM ('SATISFACTORY', 'MINOR_REVISION', 'MAJOR_REVISION', 'UNSATISFACTORY');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'RETURNED', 'APPROVED');

-- CreateEnum
CREATE TYPE "RecognitionStatus" AS ENUM ('ACCESS_REQUESTED', 'UNLOCKED', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CourseDecision" AS ENUM ('REQUESTED', 'ACCEPTED', 'WAITLISTED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "IwbaLinkStatus" AS ENUM ('UNLINKED', 'CONFIRMED', 'IGNORED');

-- AlterEnum
BEGIN;
CREATE TYPE "TrainingStage_new" AS ENUM ('BAT', 'HAT', 'PFY', 'FELLOW');
ALTER TABLE "TraineeProfile" ALTER COLUMN "currentStage" DROP DEFAULT;
ALTER TABLE "TraineeProfile" ALTER COLUMN "currentStage" TYPE "TrainingStage_new" USING ("currentStage"::text::"TrainingStage_new");
ALTER TABLE "CurriculumMilestone" ALTER COLUMN "stage" TYPE "TrainingStage_new" USING ("stage"::text::"TrainingStage_new");
ALTER TABLE "ItaSession" ALTER COLUMN "trainingStage" TYPE "TrainingStage_new" USING ("trainingStage"::text::"TrainingStage_new");
-- (Application is created further down, after the enum swap, so Prisma's generated ALTER for it was removed.)
ALTER TYPE "TrainingStage" RENAME TO "TrainingStage_old";
ALTER TYPE "TrainingStage_new" RENAME TO "TrainingStage";
DROP TYPE "TrainingStage_old";
ALTER TABLE "TraineeProfile" ALTER COLUMN "currentStage" SET DEFAULT 'BAT';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerReason" ADD VALUE 'RETROSPECTIVE_OVERSEAS_RECOGNITION';
ALTER TYPE "LedgerReason" ADD VALUE 'RETROSPECTIVE_SPECIALTY_TRANSFER';

-- AlterEnum
ALTER TYPE "ProjectStatus" ADD VALUE 'ESCALATED';

-- AlterEnum
ALTER TYPE "BulkIngestionType" ADD VALUE 'IWBA_LINK';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canReviewProjects" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserRoleAssignment" ADD COLUMN     "boardEndorsedOn" DATE,
ADD COLUMN     "endReason" TEXT,
ADD COLUMN     "endorsementDocId" TEXT,
ADD COLUMN     "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "grantedById" TEXT;

-- AlterTable
ALTER TABLE "TraineeProfile" ADD COLUMN     "mchkRegistrationNumber" TEXT,
ADD COLUMN     "mchkRegistrationType" TEXT,
ADD COLUMN     "trainingStatus" "TraineeStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "AccreditedCentre" ADD COLUMN     "lastInspectionDate" DATE,
ADD COLUMN     "nextInspectionDue" DATE,
ADD COLUMN     "reviewAlertMonthsBefore" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "AccreditedTimeLedger" ADD COLUMN     "boardDecisionDate" DATE;

-- AlterTable
ALTER TABLE "VolumeOfPractice" ADD COLUMN     "caseRef" TEXT,
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "legacyWindowAnomaly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loggedDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "migratedAt" TIMESTAMP(3),
ADD COLUMN     "needsClassification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "traineeNotes" TEXT,
ADD COLUMN     "trainingStageAtEntry" TEXT,
ADD COLUMN     "verifiedByName" TEXT,
ADD COLUMN     "verifiedByRole" TEXT;

-- AlterTable
ALTER TABLE "WbaAssessment" ADD COLUMN     "hospitalSnapshot" TEXT,
ADD COLUMN     "iwbaStatus" TEXT,
ADD COLUMN     "iwbaUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "traineeIwbaUserId" TEXT,
ADD COLUMN     "trainerIwbaUserId" TEXT;

-- AlterTable
ALTER TABLE "WbaSyncConflict" ADD COLUMN     "resolutionNote" TEXT;

-- AlterTable
ALTER TABLE "ExamApplication" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "score" DECIMAL(5,2),
ADD COLUMN     "sourceBatchId" TEXT;

-- AlterTable
ALTER TABLE "FormalProject" ADD COLUMN     "projectNumber" TEXT;

-- AlterTable
ALTER TABLE "MandatoryCourse" ADD COLUMN     "roundId" TEXT,
ADD COLUMN     "sourceBatchId" TEXT;

-- CreateTable
CREATE TABLE "WbaIwbaLink" (
    "iwbaUserId" TEXT NOT NULL,
    "userId" TEXT,
    "hkamId" TEXT,
    "iwbaDisplayName" TEXT,
    "iwbaHospital" TEXT,
    "iwbaRole" TEXT,
    "status" "IwbaLinkStatus" NOT NULL DEFAULT 'UNLINKED',
    "linkMethod" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WbaIwbaLink_pkey" PRIMARY KEY ("iwbaUserId")
);

-- CreateTable
CREATE TABLE "WbaSyncState" (
    "endpoint" TEXT NOT NULL,
    "cursorUpdatedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "lastRecordsRead" INTEGER,
    "lastRecordsFailed" INTEGER,

    CONSTRAINT "WbaSyncState_pkey" PRIMARY KEY ("endpoint")
);

-- CreateTable
CREATE TABLE "WbaProcedureMap" (
    "iwbaProcedureCode" TEXT NOT NULL,
    "curriculumCode" TEXT NOT NULL,
    "setById" TEXT,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WbaProcedureMap_pkey" PRIMARY KEY ("iwbaProcedureCode")
);

-- CreateTable
CREATE TABLE "TrainingStageHistory" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "recordedById" TEXT,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraineeStatusEvent" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "status" "TraineeStatus" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraineeStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "applicantUserId" TEXT,
    "requestedStage" "TrainingStage" NOT NULL DEFAULT 'BAT',
    "parentHospitalId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "checkMchk" BOOLEAN NOT NULL DEFAULT false,
    "checkFee" BOOLEAN NOT NULL DEFAULT false,
    "checkEndorsement" BOOLEAN NOT NULL DEFAULT false,
    "endorsementDocId" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "returnNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "traineeId" TEXT,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetrospectiveRecognition" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "applicationDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationType" TEXT NOT NULL,
    "accessRequestedAt" TIMESTAMP(3),
    "formUnlockedAt" TIMESTAMP(3),
    "formUnlockedById" TEXT,
    "requestedClinicalMonths" DECIMAL(4,2),
    "requestedIcuMonths" DECIMAL(4,2),
    "requestedElectiveMonths" DECIMAL(4,2),
    "requestedCases" INTEGER,
    "boardDecisionDate" DATE,
    "vettingStatus" "RecognitionStatus" NOT NULL DEFAULT 'ACCESS_REQUESTED',
    "assignedReviewerId" TEXT,
    "boeReviewDate" DATE,
    "approvalDate" DATE,
    "creditedBatMonths" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "creditedHatMonths" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "creditedIcuMonths" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "creditedElectiveMonths" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "creditedAccreditedMonths" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "creditedClinicalAnaesthesiaMonths" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "creditedCardiacMonths" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "creditedPaediatricMonths" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "creditedObstetricMonths" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "creditedPainMonths" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "overseasInstitution" TEXT,
    "overseasProgramName" TEXT,
    "overseasTrainingStart" DATE,
    "overseasTrainingEnd" DATE,
    "overseasDurationMonths" DECIMAL(4,2),
    "vettingNotes" TEXT,
    "boeDecisionRationale" TEXT,
    "conditionsAttached" TEXT,
    "documentsJson" JSONB,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetrospectiveRecognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VopCreditAdjustment" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "recognitionId" TEXT,
    "cases" INTEGER NOT NULL,
    "moduleCode" TEXT,
    "reason" "LedgerReason" NOT NULL,
    "boardDecisionDate" DATE NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "supersedesId" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VopCreditAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VopVerificationEvent" (
    "id" TEXT NOT NULL,
    "vopId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorName" TEXT,
    "actorRole" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "VopVerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormalProjectEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "versionNo" INTEGER,
    "outcomeNote" TEXT,
    "recordedById" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormalProjectEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormalProjectReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "reviewerId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "assignedById" TEXT,
    "dueAt" DATE NOT NULL,
    "replacedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "grade" "ReviewGrade",
    "feedback" TEXT,

    CONSTRAINT "FormalProjectReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPlan" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "planType" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "assignedSotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_SET',
    "version" INTEGER NOT NULL DEFAULT 0,
    "notifiedAt" DATE,
    "submittedAt" DATE,
    "signedById" TEXT,
    "signedAt" DATE,
    "cosApprovedById" TEXT,
    "cosApprovedAt" DATE,
    "reviewSummary" TEXT,
    "reviewSubmittedAt" DATE,
    "reviewedById" TEXT,
    "reviewedAt" DATE,
    "reviewComment" TEXT,

    CONSTRAINT "LearningPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningGoal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "domainCode" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "success" TEXT NOT NULL,
    "evidence" TEXT,
    "reflection" TEXT,
    "outcome" TEXT,
    "outcomeGradedById" TEXT,
    "outcomeGradedAt" TIMESTAMP(3),
    "outcomeItaId" TEXT,

    CONSTRAINT "LearningGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPlanProposal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedGoalsJson" JSONB NOT NULL,
    "proposedAt" DATE,
    "sotDecidedById" TEXT,
    "sotDecidedAt" DATE,
    "sotDecision" TEXT,
    "cosDecidedById" TEXT,
    "cosDecidedAt" DATE,
    "cosDecision" TEXT,
    "boardInformedAt" DATE,

    CONSTRAINT "LearningPlanProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SotAssignment" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "sotId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "reassignedFromId" TEXT,
    "reassignedAt" DATE,
    "reassignedById" TEXT,
    "reason" TEXT,

    CONSTRAINT "SotAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogbookVerifierAssignment" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "verifierId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "unassignedAt" TIMESTAMP(3),
    "unassignedReason" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LogbookVerifierAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCatalogue" (
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CourseCatalogue_pkey" PRIMARY KEY ("courseCode")
);

-- CreateTable
CREATE TABLE "CourseRound" (
    "id" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "roundDate" DATE NOT NULL,
    "seats" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "attendanceRecordedAt" TIMESTAMP(3),

    CONSTRAINT "CourseRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseRequest" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "decision" "CourseDecision" NOT NULL DEFAULT 'REQUESTED',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "CourseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterRound" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "opensOn" DATE NOT NULL,
    "closesOn" DATE NOT NULL,

    CONSTRAINT "RosterRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterAttestation" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "changesJson" JSONB,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "RosterAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WbaIwbaLink_status_idx" ON "WbaIwbaLink"("status");

-- CreateIndex
CREATE INDEX "WbaIwbaLink_userId_idx" ON "WbaIwbaLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingStageHistory_traineeId_stage_key" ON "TrainingStageHistory"("traineeId", "stage");

-- CreateIndex
CREATE INDEX "TraineeStatusEvent_traineeId_effectiveDate_idx" ON "TraineeStatusEvent"("traineeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "Application_traineeId_key" ON "Application"("traineeId");

-- CreateIndex
CREATE INDEX "Application_status_submittedAt_idx" ON "Application"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "RetrospectiveRecognition_traineeId_idx" ON "RetrospectiveRecognition"("traineeId");

-- CreateIndex
CREATE INDEX "RetrospectiveRecognition_vettingStatus_idx" ON "RetrospectiveRecognition"("vettingStatus");

-- CreateIndex
CREATE INDEX "VopCreditAdjustment_traineeId_isCurrent_idx" ON "VopCreditAdjustment"("traineeId", "isCurrent");

-- CreateIndex
CREATE INDEX "VopVerificationEvent_vopId_occurredAt_idx" ON "VopVerificationEvent"("vopId", "occurredAt");

-- CreateIndex
CREATE INDEX "FormalProjectEvent_projectId_eventDate_idx" ON "FormalProjectEvent"("projectId", "eventDate");

-- CreateIndex
CREATE INDEX "FormalProjectReview_projectId_stage_idx" ON "FormalProjectReview"("projectId", "stage");

-- CreateIndex
CREATE INDEX "FormalProjectReview_reviewerId_idx" ON "FormalProjectReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningPlan_traineeId_planType_periodStart_key" ON "LearningPlan"("traineeId", "planType", "periodStart");

-- CreateIndex
CREATE INDEX "LearningGoal_planId_planVersion_idx" ON "LearningGoal"("planId", "planVersion");

-- CreateIndex
CREATE INDEX "SotAssignment_traineeId_periodStart_idx" ON "SotAssignment"("traineeId", "periodStart");

-- CreateIndex
CREATE INDEX "LogbookVerifierAssignment_traineeId_isCurrent_idx" ON "LogbookVerifierAssignment"("traineeId", "isCurrent");

-- CreateIndex
CREATE INDEX "LogbookVerifierAssignment_verifierId_isCurrent_idx" ON "LogbookVerifierAssignment"("verifierId", "isCurrent");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "CourseRound_courseCode_roundDate_idx" ON "CourseRound"("courseCode", "roundDate");

-- CreateIndex
CREATE INDEX "CourseRequest_traineeId_idx" ON "CourseRequest"("traineeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRequest_roundId_traineeId_key" ON "CourseRequest"("roundId", "traineeId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterRound_period_key" ON "RosterRound"("period");

-- CreateIndex
CREATE UNIQUE INDEX "RosterAttestation_roundId_hospitalId_key" ON "RosterAttestation"("roundId", "hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeOfPractice_legacyPid_legacyTid_key" ON "VolumeOfPractice"("legacyPid", "legacyTid");

-- CreateIndex
CREATE UNIQUE INDEX "FormalProject_projectNumber_key" ON "FormalProject"("projectNumber");

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamApplication" ADD CONSTRAINT "ExamApplication_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "BulkIngestionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MandatoryCourse" ADD CONSTRAINT "MandatoryCourse_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "BulkIngestionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MandatoryCourse" ADD CONSTRAINT "MandatoryCourse_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CourseRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbaIwbaLink" ADD CONSTRAINT "WbaIwbaLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbaIwbaLink" ADD CONSTRAINT "WbaIwbaLink_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbaProcedureMap" ADD CONSTRAINT "WbaProcedureMap_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingStageHistory" ADD CONSTRAINT "TrainingStageHistory_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingStageHistory" ADD CONSTRAINT "TrainingStageHistory_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraineeStatusEvent" ADD CONSTRAINT "TraineeStatusEvent_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraineeStatusEvent" ADD CONSTRAINT "TraineeStatusEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_parentHospitalId_fkey" FOREIGN KEY ("parentHospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetrospectiveRecognition" ADD CONSTRAINT "RetrospectiveRecognition_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetrospectiveRecognition" ADD CONSTRAINT "RetrospectiveRecognition_formUnlockedById_fkey" FOREIGN KEY ("formUnlockedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetrospectiveRecognition" ADD CONSTRAINT "RetrospectiveRecognition_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetrospectiveRecognition" ADD CONSTRAINT "RetrospectiveRecognition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetrospectiveRecognition" ADD CONSTRAINT "RetrospectiveRecognition_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VopCreditAdjustment" ADD CONSTRAINT "VopCreditAdjustment_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VopCreditAdjustment" ADD CONSTRAINT "VopCreditAdjustment_recognitionId_fkey" FOREIGN KEY ("recognitionId") REFERENCES "RetrospectiveRecognition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VopCreditAdjustment" ADD CONSTRAINT "VopCreditAdjustment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VopCreditAdjustment" ADD CONSTRAINT "VopCreditAdjustment_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "VopCreditAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VopVerificationEvent" ADD CONSTRAINT "VopVerificationEvent_vopId_fkey" FOREIGN KEY ("vopId") REFERENCES "VolumeOfPractice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalProjectEvent" ADD CONSTRAINT "FormalProjectEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FormalProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalProjectEvent" ADD CONSTRAINT "FormalProjectEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalProjectReview" ADD CONSTRAINT "FormalProjectReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FormalProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalProjectReview" ADD CONSTRAINT "FormalProjectReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalProjectReview" ADD CONSTRAINT "FormalProjectReview_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalProjectReview" ADD CONSTRAINT "FormalProjectReview_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_assignedSotId_fkey" FOREIGN KEY ("assignedSotId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_cosApprovedById_fkey" FOREIGN KEY ("cosApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningGoal" ADD CONSTRAINT "LearningGoal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LearningPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningGoal" ADD CONSTRAINT "LearningGoal_outcomeGradedById_fkey" FOREIGN KEY ("outcomeGradedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningGoal" ADD CONSTRAINT "LearningGoal_outcomeItaId_fkey" FOREIGN KEY ("outcomeItaId") REFERENCES "ItaSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlanProposal" ADD CONSTRAINT "LearningPlanProposal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LearningPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlanProposal" ADD CONSTRAINT "LearningPlanProposal_sotDecidedById_fkey" FOREIGN KEY ("sotDecidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlanProposal" ADD CONSTRAINT "LearningPlanProposal_cosDecidedById_fkey" FOREIGN KEY ("cosDecidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SotAssignment" ADD CONSTRAINT "SotAssignment_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SotAssignment" ADD CONSTRAINT "SotAssignment_sotId_fkey" FOREIGN KEY ("sotId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SotAssignment" ADD CONSTRAINT "SotAssignment_reassignedFromId_fkey" FOREIGN KEY ("reassignedFromId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SotAssignment" ADD CONSTRAINT "SotAssignment_reassignedById_fkey" FOREIGN KEY ("reassignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogbookVerifierAssignment" ADD CONSTRAINT "LogbookVerifierAssignment_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogbookVerifierAssignment" ADD CONSTRAINT "LogbookVerifierAssignment_verifierId_fkey" FOREIGN KEY ("verifierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogbookVerifierAssignment" ADD CONSTRAINT "LogbookVerifierAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRound" ADD CONSTRAINT "CourseRound_courseCode_fkey" FOREIGN KEY ("courseCode") REFERENCES "CourseCatalogue"("courseCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRequest" ADD CONSTRAINT "CourseRequest_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CourseRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRequest" ADD CONSTRAINT "CourseRequest_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRequest" ADD CONSTRAINT "CourseRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAttestation" ADD CONSTRAINT "RosterAttestation_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RosterRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAttestation" ADD CONSTRAINT "RosterAttestation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAttestation" ADD CONSTRAINT "RosterAttestation_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAttestation" ADD CONSTRAINT "RosterAttestation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

