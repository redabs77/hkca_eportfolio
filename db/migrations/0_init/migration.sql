-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TRAINEE', 'TRAINER', 'SOT', 'ASSISTANT_SOT', 'CLUSTER_SOT', 'CHIEF_OF_SERVICE', 'COLLEGE_ADMIN', 'BOE_MEMBER', 'EXTERNAL_ASSESSOR');

-- CreateEnum
CREATE TYPE "TrainingStage" AS ENUM ('BAT', 'HAT', 'PFY', 'FELLOW', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "RotationType" AS ENUM ('CLINICAL_ANAESTHESIA', 'ICU', 'PAIN_MEDICINE', 'ELECTIVE_OTHER', 'ELECTIVE_RESEARCH', 'OVERSEAS_APPROVED');

-- CreateEnum
CREATE TYPE "LedgerDecision" AS ENUM ('GRANT', 'REVOKE', 'AMEND');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('SATISFACTORY_ITA_COMPLETION', 'CONFLICT_OF_INTEREST', 'NON_ACCREDITED_SITE', 'UNAUTHORIZED_SIGNATORY', 'SUCCESSFUL_APPEAL_OVERTURN', 'ADMINISTRATIVE_ERROR', 'FRAUDULENT_RECORD', 'INCORRECT_CATEGORY', 'PARTIAL_CREDIT_CORRECTION', 'CONDITIONAL_REQUIREMENT_FULFILLED', 'CURRICULUM_RULE_CHANGE', 'SUPERSEDES_DUPLICATE', 'OTHER_BOE_DIRECTED');

-- CreateEnum
CREATE TYPE "ItaStatus" AS ENUM ('PENDING_TRAINER_FEEDBACK', 'SOT_SYNTHESIS', 'AWAITING_TRAINEE_SIGNATURE', 'COMPLETED_SATISFACTORY', 'COMPLETED_UNSATISFACTORY', 'CONTESTED', 'PENDING_BOE_REVIEW');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED_FOR_REVIEW');

-- CreateEnum
CREATE TYPE "WbaModality" AS ENUM ('CEX', 'DOPS', 'CBD', 'ALMAT', 'EPA', 'MSF');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PROTOCOL_DRAFT', 'PROTOCOL_SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'MANUSCRIPT_SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hkcaNumber" TEXT,
    "hkamId" TEXT,
    "mchkNumber" TEXT,
    "iwbaUserId" TEXT,
    "primaryRole" "UserRole" NOT NULL DEFAULT 'TRAINEE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraineeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hkcaNumber" TEXT NOT NULL,
    "currentStage" "TrainingStage" NOT NULL DEFAULT 'BAT',
    "curriculumEditionId" TEXT NOT NULL,
    "parentHospitalId" TEXT NOT NULL,
    "commencementBat" TIMESTAMP(3),
    "completionBat" TIMESTAMP(3),
    "commencementHat" TIMESTAMP(3),
    "completionHat" TIMESTAMP(3),
    "commencementPfy" TIMESTAMP(3),
    "completionPfy" TIMESTAMP(3),
    "intermediateExamPassed" BOOLEAN NOT NULL DEFAULT false,
    "intermediateExamDate" TIMESTAMP(3),
    "finalExamPassed" BOOLEAN NOT NULL DEFAULT false,
    "finalExamDate" TIMESTAMP(3),
    "formalProjectApproved" BOOLEAN NOT NULL DEFAULT false,
    "formalProjectApprovalDate" TIMESTAMP(3),
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "lifetimeUnsatItaCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraineeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "isSot" BOOLEAN NOT NULL DEFAULT false,
    "isAssistantSot" BOOLEAN NOT NULL DEFAULT false,
    "isClusterSot" BOOLEAN NOT NULL DEFAULT false,
    "qualifications" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cluster" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Cluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "hospitalCode" TEXT NOT NULL,
    "hospitalName" TEXT NOT NULL,
    "isHaHospital" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalClusterHistory" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),

    CONSTRAINT "HospitalClusterHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccreditedCentre" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "centreName" TEXT NOT NULL,
    "accreditationTypes" TEXT[],
    "accreditationStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "accreditationStartDate" TIMESTAMP(3) NOT NULL,
    "accreditationEndDate" TIMESTAMP(3) NOT NULL,
    "maxDurationMonths" INTEGER,
    "maxTraineeCapacity" INTEGER,
    "trainerTraineeRatio" TEXT,
    "isSatelliteCentre" BOOLEAN NOT NULL DEFAULT false,
    "parentCentreId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditedCentre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccreditationAuditLog" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fieldChanged" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "AccreditationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumEdition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "description" TEXT,

    CONSTRAINT "CurriculumEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumRule" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "ruleCategory" TEXT NOT NULL,
    "thresholdValue" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "curriculumReference" TEXT,

    CONSTRAINT "CurriculumRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumDescriptor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subspecialtyTag" TEXT,
    "description" TEXT,

    CONSTRAINT "CurriculumDescriptor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumMilestone" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "stage" "TrainingStage" NOT NULL,
    "milestoneCode" TEXT NOT NULL,
    "requirementsJson" JSONB NOT NULL,

    CONSTRAINT "CurriculumMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentTool" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modality" "WbaModality" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rubricSchema" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),

    CONSTRAINT "AssessmentTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rotation" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "accreditedCentreId" TEXT NOT NULL,
    "rotationType" "RotationType" NOT NULL,
    "subspecialty" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationMonths" DECIMAL(5,2) NOT NULL,
    "sotId" TEXT NOT NULL,
    "approvalStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "learningGoals" TEXT,
    "isAccredited" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccreditedTimeLedger" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "rotationId" TEXT,
    "itaSessionId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "calendarMonthsCredited" DECIMAL(5,2) NOT NULL,
    "category" "RotationType" NOT NULL,
    "countsTowardLast3Years" BOOLEAN NOT NULL DEFAULT true,
    "decision" "LedgerDecision" NOT NULL DEFAULT 'GRANT',
    "decisionReason" "LedgerReason" NOT NULL,
    "decisionNotes" TEXT,
    "authorityId" TEXT NOT NULL,
    "authorityRole" "UserRole" NOT NULL,
    "conditionsJson" JSONB,
    "supersedesId" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AccreditedTimeLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItaSession" (
    "id" TEXT NOT NULL,
    "rotationId" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "sotId" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "trainingStage" "TrainingStage" NOT NULL,
    "status" "ItaStatus" NOT NULL DEFAULT 'PENDING_TRAINER_FEEDBACK',
    "sotGrade" INTEGER,
    "finalGrade" INTEGER,
    "sotComments" TEXT,
    "learningSummary" TEXT,
    "traineeReflection" TEXT,
    "traineeSignedAt" TIMESTAMP(3),
    "isContested" BOOLEAN NOT NULL DEFAULT false,
    "contestedStatement" TEXT,
    "contestedAt" TIMESTAMP(3),
    "boeReviewStatus" TEXT,
    "sotSignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItaSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItaAssessorResponse" (
    "id" TEXT NOT NULL,
    "itaSessionId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "domainRatingsJson" JSONB NOT NULL,
    "notableStrength" TEXT,
    "keyAreaForGrowth" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItaAssessorResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItaAppeal" (
    "id" TEXT NOT NULL,
    "itaSessionId" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "appealDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groundsForAppeal" TEXT NOT NULL,
    "supportingDocsJson" JSONB,
    "boeDecision" TEXT,
    "overturnedGrade" INTEGER,
    "boeDecisionDate" TIMESTAMP(3),
    "boeMinutesRef" TEXT,

    CONSTRAINT "ItaAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemedialPlan" (
    "id" TEXT NOT NULL,
    "itaSessionId" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "assignedMentorId" TEXT,
    "triggerReason" TEXT NOT NULL,
    "actionItemsJson" JSONB NOT NULL,
    "targetReassessmentDate" TIMESTAMP(3) NOT NULL,
    "actualReassessmentDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RemedialPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeOfPractice" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "caseDate" DATE NOT NULL,
    "firstLoggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceLoggedAt" TIMESTAMP(3),
    "durationHours" DECIMAL(4,2),
    "asaClass" INTEGER,
    "patientAgeYears" INTEGER,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "surgicalDiagnosis" TEXT,
    "primaryOperation" TEXT,
    "anaestheticTechnique" TEXT[],
    "supervisionLevel" INTEGER NOT NULL,
    "descriptorCode" TEXT NOT NULL,
    "vopCategory" TEXT NOT NULL,
    "classifiedBy" TEXT NOT NULL,
    "classificationConfidence" DECIMAL(4,3),
    "classifierDiverged" BOOLEAN NOT NULL DEFAULT false,
    "isAccredited" BOOLEAN NOT NULL DEFAULT true,
    "disqualificationReason" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "legacyPid" INTEGER,
    "legacyTid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolumeOfPractice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseBlock" (
    "id" TEXT NOT NULL,
    "vopId" TEXT NOT NULL,
    "blockSite" TEXT NOT NULL,
    "blockTechnique" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CaseBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WbaAssessment" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "descriptorCode" TEXT,
    "jcimedWbaId" TEXT NOT NULL,
    "modality" "WbaModality" NOT NULL,
    "datePerformed" DATE NOT NULL,
    "assessorHkamId" TEXT,
    "assessorNameSnapshot" TEXT NOT NULL,
    "assessorHospitalSnapshot" TEXT,
    "procedureCode" TEXT,
    "procedureName" TEXT,
    "iwbaCurriculumCode" TEXT,
    "iwbaTrainingStage" TEXT,
    "entrustmentLevel" INTEGER,
    "workflowOutcome" TEXT,
    "timelineAnswersJson" JSONB NOT NULL,
    "syncBatchId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WbaAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WbaSyncConflict" (
    "id" TEXT NOT NULL,
    "jcimedWbaId" TEXT NOT NULL,
    "errorReason" TEXT NOT NULL,
    "rawPayloadJson" JSONB NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WbaSyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamApplication" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "examType" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sotApprovalStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "sotApprovedAt" TIMESTAMP(3),
    "sotApprovedById" TEXT,
    "collegeVettingStatus" TEXT NOT NULL DEFAULT 'UNDER_REVIEW',
    "result" TEXT,

    CONSTRAINT "ExamApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormalProject" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PROTOCOL_DRAFT',
    "protocolSubmittedDate" TIMESTAMP(3),
    "protocolPath" TEXT,
    "manuscriptPath" TEXT,
    "reviewer1Id" TEXT,
    "reviewer2Id" TEXT,
    "reviewer1Status" TEXT,
    "reviewer2Status" TEXT,
    "reviewDueDate" TIMESTAMP(3),
    "finalApprovalDate" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormalProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfyPlan" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "clinicalPlan" TEXT NOT NULL,
    "managementPlan" TEXT NOT NULL,
    "educationPlan" TEXT NOT NULL,
    "sotApprovedById" TEXT,
    "sotApprovedDate" TIMESTAMP(3),
    "cosApprovedById" TEXT,
    "cosApprovedDate" TIMESTAMP(3),
    "completionReport" TEXT,
    "completionDate" TIMESTAMP(3),
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "PfyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "performedById" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "prevHash" TEXT,
    "rowHash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_hkcaNumber_key" ON "User"("hkcaNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_hkamId_key" ON "User"("hkamId");

-- CreateIndex
CREATE UNIQUE INDEX "User_mchkNumber_key" ON "User"("mchkNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_iwbaUserId_key" ON "User"("iwbaUserId");

-- CreateIndex
CREATE INDEX "User_email_hkcaNumber_idx" ON "User"("email", "hkcaNumber");

-- CreateIndex
CREATE INDEX "User_hkamId_idx" ON "User"("hkamId");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_userId_role_isActive_idx" ON "UserRoleAssignment"("userId", "role", "isActive");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_scopeType_scopeId_idx" ON "UserRoleAssignment"("scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "TraineeProfile_userId_key" ON "TraineeProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TraineeProfile_hkcaNumber_key" ON "TraineeProfile"("hkcaNumber");

-- CreateIndex
CREATE INDEX "TraineeProfile_currentStage_isSuspended_idx" ON "TraineeProfile"("currentStage", "isSuspended");

-- CreateIndex
CREATE INDEX "TraineeProfile_parentHospitalId_idx" ON "TraineeProfile"("parentHospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerProfile_userId_key" ON "TrainerProfile"("userId");

-- CreateIndex
CREATE INDEX "TrainerProfile_hospitalId_isSot_idx" ON "TrainerProfile"("hospitalId", "isSot");

-- CreateIndex
CREATE UNIQUE INDEX "Cluster_code_key" ON "Cluster"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_hospitalCode_key" ON "Hospital"("hospitalCode");

-- CreateIndex
CREATE INDEX "Hospital_hospitalCode_idx" ON "Hospital"("hospitalCode");

-- CreateIndex
CREATE INDEX "HospitalClusterHistory_hospitalId_effectiveUntil_idx" ON "HospitalClusterHistory"("hospitalId", "effectiveUntil");

-- CreateIndex
CREATE INDEX "HospitalClusterHistory_clusterId_idx" ON "HospitalClusterHistory"("clusterId");

-- CreateIndex
CREATE INDEX "AccreditedCentre_hospitalId_accreditationStatus_idx" ON "AccreditedCentre"("hospitalId", "accreditationStatus");

-- CreateIndex
CREATE INDEX "AccreditedCentre_accreditationEndDate_idx" ON "AccreditedCentre"("accreditationEndDate");

-- CreateIndex
CREATE INDEX "AccreditationAuditLog_centreId_changedAt_idx" ON "AccreditationAuditLog"("centreId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumEdition_code_key" ON "CurriculumEdition"("code");

-- CreateIndex
CREATE INDEX "CurriculumEdition_code_effectiveFrom_idx" ON "CurriculumEdition"("code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CurriculumRule_editionId_ruleCode_idx" ON "CurriculumRule"("editionId", "ruleCode");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumDescriptor_code_key" ON "CurriculumDescriptor"("code");

-- CreateIndex
CREATE INDEX "CurriculumDescriptor_code_category_idx" ON "CurriculumDescriptor"("code", "category");

-- CreateIndex
CREATE INDEX "CurriculumMilestone_editionId_stage_milestoneCode_idx" ON "CurriculumMilestone"("editionId", "stage", "milestoneCode");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentTool_code_key" ON "AssessmentTool"("code");

-- CreateIndex
CREATE INDEX "AssessmentTool_code_modality_idx" ON "AssessmentTool"("code", "modality");

-- CreateIndex
CREATE INDEX "Rotation_traineeId_startDate_endDate_idx" ON "Rotation"("traineeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Rotation_hospitalId_rotationType_idx" ON "Rotation"("hospitalId", "rotationType");

-- CreateIndex
CREATE INDEX "AccreditedTimeLedger_traineeId_isCurrent_idx" ON "AccreditedTimeLedger"("traineeId", "isCurrent");

-- CreateIndex
CREATE INDEX "AccreditedTimeLedger_rotationId_idx" ON "AccreditedTimeLedger"("rotationId");

-- CreateIndex
CREATE INDEX "ItaSession_traineeId_status_idx" ON "ItaSession"("traineeId", "status");

-- CreateIndex
CREATE INDEX "ItaSession_rotationId_idx" ON "ItaSession"("rotationId");

-- CreateIndex
CREATE INDEX "ItaAssessorResponse_itaSessionId_trainerId_idx" ON "ItaAssessorResponse"("itaSessionId", "trainerId");

-- CreateIndex
CREATE INDEX "ItaAppeal_itaSessionId_idx" ON "ItaAppeal"("itaSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RemedialPlan_itaSessionId_key" ON "RemedialPlan"("itaSessionId");

-- CreateIndex
CREATE INDEX "RemedialPlan_traineeId_status_idx" ON "RemedialPlan"("traineeId", "status");

-- CreateIndex
CREATE INDEX "VolumeOfPractice_traineeId_caseDate_idx" ON "VolumeOfPractice"("traineeId", "caseDate");

-- CreateIndex
CREATE INDEX "VolumeOfPractice_firstLoggedAt_isAccredited_idx" ON "VolumeOfPractice"("firstLoggedAt", "isAccredited");

-- CreateIndex
CREATE INDEX "VolumeOfPractice_descriptorCode_idx" ON "VolumeOfPractice"("descriptorCode");

-- CreateIndex
CREATE INDEX "VolumeOfPractice_verificationStatus_idx" ON "VolumeOfPractice"("verificationStatus");

-- CreateIndex
CREATE INDEX "CaseBlock_vopId_idx" ON "CaseBlock"("vopId");

-- CreateIndex
CREATE UNIQUE INDEX "WbaAssessment_jcimedWbaId_key" ON "WbaAssessment"("jcimedWbaId");

-- CreateIndex
CREATE INDEX "WbaAssessment_traineeId_modality_datePerformed_idx" ON "WbaAssessment"("traineeId", "modality", "datePerformed");

-- CreateIndex
CREATE INDEX "WbaAssessment_jcimedWbaId_idx" ON "WbaAssessment"("jcimedWbaId");

-- CreateIndex
CREATE UNIQUE INDEX "WbaSyncConflict_jcimedWbaId_key" ON "WbaSyncConflict"("jcimedWbaId");

-- CreateIndex
CREATE INDEX "WbaSyncConflict_resolved_createdAt_idx" ON "WbaSyncConflict"("resolved", "createdAt");

-- CreateIndex
CREATE INDEX "ExamApplication_traineeId_examType_examDate_idx" ON "ExamApplication"("traineeId", "examType", "examDate");

-- CreateIndex
CREATE INDEX "FormalProject_traineeId_status_idx" ON "FormalProject"("traineeId", "status");

-- CreateIndex
CREATE INDEX "PfyPlan_traineeId_academicYear_idx" ON "PfyPlan"("traineeId", "academicYear");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_performedById_performedAt_idx" ON "AuditLog"("performedById", "performedAt");

-- CreateIndex
CREATE INDEX "AuditLog_performedAt_idx" ON "AuditLog"("performedAt");

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraineeProfile" ADD CONSTRAINT "TraineeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraineeProfile" ADD CONSTRAINT "TraineeProfile_parentHospitalId_fkey" FOREIGN KEY ("parentHospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraineeProfile" ADD CONSTRAINT "TraineeProfile_curriculumEditionId_fkey" FOREIGN KEY ("curriculumEditionId") REFERENCES "CurriculumEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerProfile" ADD CONSTRAINT "TrainerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerProfile" ADD CONSTRAINT "TrainerProfile_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalClusterHistory" ADD CONSTRAINT "HospitalClusterHistory_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalClusterHistory" ADD CONSTRAINT "HospitalClusterHistory_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccreditedCentre" ADD CONSTRAINT "AccreditedCentre_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccreditationAuditLog" ADD CONSTRAINT "AccreditationAuditLog_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "AccreditedCentre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumRule" ADD CONSTRAINT "CurriculumRule_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "CurriculumEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumMilestone" ADD CONSTRAINT "CurriculumMilestone_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "CurriculumEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rotation" ADD CONSTRAINT "Rotation_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rotation" ADD CONSTRAINT "Rotation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rotation" ADD CONSTRAINT "Rotation_accreditedCentreId_fkey" FOREIGN KEY ("accreditedCentreId") REFERENCES "AccreditedCentre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rotation" ADD CONSTRAINT "Rotation_sotId_fkey" FOREIGN KEY ("sotId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccreditedTimeLedger" ADD CONSTRAINT "AccreditedTimeLedger_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccreditedTimeLedger" ADD CONSTRAINT "AccreditedTimeLedger_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "Rotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccreditedTimeLedger" ADD CONSTRAINT "AccreditedTimeLedger_itaSessionId_fkey" FOREIGN KEY ("itaSessionId") REFERENCES "ItaSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccreditedTimeLedger" ADD CONSTRAINT "AccreditedTimeLedger_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItaSession" ADD CONSTRAINT "ItaSession_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "Rotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItaSession" ADD CONSTRAINT "ItaSession_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItaSession" ADD CONSTRAINT "ItaSession_sotId_fkey" FOREIGN KEY ("sotId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItaAssessorResponse" ADD CONSTRAINT "ItaAssessorResponse_itaSessionId_fkey" FOREIGN KEY ("itaSessionId") REFERENCES "ItaSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItaAssessorResponse" ADD CONSTRAINT "ItaAssessorResponse_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItaAssessorResponse" ADD CONSTRAINT "ItaAssessorResponse_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "AssessmentTool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItaAppeal" ADD CONSTRAINT "ItaAppeal_itaSessionId_fkey" FOREIGN KEY ("itaSessionId") REFERENCES "ItaSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemedialPlan" ADD CONSTRAINT "RemedialPlan_itaSessionId_fkey" FOREIGN KEY ("itaSessionId") REFERENCES "ItaSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemedialPlan" ADD CONSTRAINT "RemedialPlan_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemedialPlan" ADD CONSTRAINT "RemedialPlan_assignedMentorId_fkey" FOREIGN KEY ("assignedMentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeOfPractice" ADD CONSTRAINT "VolumeOfPractice_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeOfPractice" ADD CONSTRAINT "VolumeOfPractice_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeOfPractice" ADD CONSTRAINT "VolumeOfPractice_descriptorCode_fkey" FOREIGN KEY ("descriptorCode") REFERENCES "CurriculumDescriptor"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeOfPractice" ADD CONSTRAINT "VolumeOfPractice_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseBlock" ADD CONSTRAINT "CaseBlock_vopId_fkey" FOREIGN KEY ("vopId") REFERENCES "VolumeOfPractice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbaAssessment" ADD CONSTRAINT "WbaAssessment_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbaAssessment" ADD CONSTRAINT "WbaAssessment_descriptorCode_fkey" FOREIGN KEY ("descriptorCode") REFERENCES "CurriculumDescriptor"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamApplication" ADD CONSTRAINT "ExamApplication_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalProject" ADD CONSTRAINT "FormalProject_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalProject" ADD CONSTRAINT "FormalProject_reviewer1Id_fkey" FOREIGN KEY ("reviewer1Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalProject" ADD CONSTRAINT "FormalProject_reviewer2Id_fkey" FOREIGN KEY ("reviewer2Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfyPlan" ADD CONSTRAINT "PfyPlan_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfyPlan" ADD CONSTRAINT "PfyPlan_sotApprovedById_fkey" FOREIGN KEY ("sotApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfyPlan" ADD CONSTRAINT "PfyPlan_cosApprovedById_fkey" FOREIGN KEY ("cosApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

