-- Migration 4: provenance on trainee status events (2026-10-24)
-- Additive only. Existing rows (none in use yet) default to source 'app', confirmed.

-- AlterTable
ALTER TABLE "TraineeStatusEvent" ADD COLUMN     "isConfirmed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'app';

-- CreateIndex
CREATE INDEX "TraineeStatusEvent_isConfirmed_idx" ON "TraineeStatusEvent"("isConfirmed");

