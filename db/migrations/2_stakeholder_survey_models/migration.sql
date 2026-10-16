-- CreateEnum
CREATE TYPE "BulkIngestionType" AS ENUM ('MANDATORY_COURSE', 'EXAM_RESULT', 'ROTATION_ALLOCATION', 'CENTRE_APPOINTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "BulkIngestionStatus" AS ENUM ('PENDING_VALIDATION', 'VALIDATED', 'COMMITTED', 'ROLLED_BACK', 'FAILED');

-- CreateEnum
CREATE TYPE "ExitDossierStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ACTION_REQUIRED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('MANDATORY_COURSE_CERT', 'FORMAL_PROJECT_MANUSCRIPT', 'PFY_EVALUATION', 'EXEMPTION_PETITION', 'EXIT_SUPPORTING_DOC', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'VERIFIED', 'ACTION_REQUIRED');

-- CreateEnum
CREATE TYPE "EchoStudyType" AS ENUM ('TTE', 'TOE', 'FOCUS');

-- CreateTable
CREATE TABLE "BulkIngestionBatch" (
    "id" TEXT NOT NULL,
    "batchType" "BulkIngestionType" NOT NULL,
    "status" "BulkIngestionStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "dryRunSummaryJson" JSONB,
    "errorLogJson" JSONB,
    "executedById" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "BulkIngestionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FellowshipExitDossier" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "status" "ExitDossierStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "academicYear" TEXT NOT NULL,
    "executiveSummaryJson" JSONB NOT NULL,
    "accreditedMonthsSnapshot" DECIMAL(5,2) NOT NULL,
    "vopAuditSnapshotJson" JSONB NOT NULL,
    "msfSummaryJson" JSONB NOT NULL,
    "itaLadderJson" JSONB NOT NULL,
    "courseCertificatesJson" JSONB NOT NULL,
    "formalProjectApproved" BOOLEAN NOT NULL DEFAULT false,
    "formalProjectSignedAt" TIMESTAMP(3),
    "examRecordsJson" JSONB NOT NULL,
    "verificationHash" TEXT NOT NULL,
    "qrVerificationToken" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "boeApprovedAt" TIMESTAMP(3),
    "boeComments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "FellowshipExitDossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRecord" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "mimeType" TEXT,
    "fileHash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewerFeedback" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "DocumentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MandatoryCourse" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "completionDate" DATE NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "documentId" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MandatoryCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EchoStudy" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "studyDate" DATE NOT NULL,
    "echoType" "EchoStudyType" NOT NULL DEFAULT 'TTE',
    "maskedHospitalNumber" TEXT,
    "indication" TEXT NOT NULL,
    "viewsObtainedJson" JSONB NOT NULL,
    "findingsSummary" TEXT NOT NULL,
    "isDops" BOOLEAN NOT NULL DEFAULT false,
    "dopsRating" INTEGER,
    "dopsFeedback" TEXT,
    "supervisorId" TEXT,
    "supervisorToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "recordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "EchoStudy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkIngestionBatch_batchType_status_idx" ON "BulkIngestionBatch"("batchType", "status");

-- CreateIndex
CREATE INDEX "BulkIngestionBatch_executedById_executedAt_idx" ON "BulkIngestionBatch"("executedById", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FellowshipExitDossier_qrVerificationToken_key" ON "FellowshipExitDossier"("qrVerificationToken");

-- CreateIndex
CREATE INDEX "FellowshipExitDossier_traineeId_status_idx" ON "FellowshipExitDossier"("traineeId", "status");

-- CreateIndex
CREATE INDEX "FellowshipExitDossier_qrVerificationToken_idx" ON "FellowshipExitDossier"("qrVerificationToken");

-- CreateIndex
CREATE INDEX "DocumentRecord_traineeId_category_status_idx" ON "DocumentRecord"("traineeId", "category", "status");

-- CreateIndex
CREATE INDEX "DocumentRecord_status_idx" ON "DocumentRecord"("status");

-- CreateIndex
CREATE INDEX "MandatoryCourse_traineeId_status_idx" ON "MandatoryCourse"("traineeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MandatoryCourse_traineeId_courseCode_key" ON "MandatoryCourse"("traineeId", "courseCode");

-- CreateIndex
CREATE UNIQUE INDEX "EchoStudy_supervisorToken_key" ON "EchoStudy"("supervisorToken");

-- CreateIndex
CREATE INDEX "EchoStudy_traineeId_studyDate_idx" ON "EchoStudy"("traineeId", "studyDate");

-- CreateIndex
CREATE INDEX "EchoStudy_supervisorId_status_idx" ON "EchoStudy"("supervisorId", "status");

-- CreateIndex
CREATE INDEX "EchoStudy_supervisorToken_idx" ON "EchoStudy"("supervisorToken");

-- AddForeignKey
ALTER TABLE "BulkIngestionBatch" ADD CONSTRAINT "BulkIngestionBatch_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FellowshipExitDossier" ADD CONSTRAINT "FellowshipExitDossier_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FellowshipExitDossier" ADD CONSTRAINT "FellowshipExitDossier_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRecord" ADD CONSTRAINT "DocumentRecord_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRecord" ADD CONSTRAINT "DocumentRecord_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MandatoryCourse" ADD CONSTRAINT "MandatoryCourse_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MandatoryCourse" ADD CONSTRAINT "MandatoryCourse_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EchoStudy" ADD CONSTRAINT "EchoStudy_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "TraineeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EchoStudy" ADD CONSTRAINT "EchoStudy_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

