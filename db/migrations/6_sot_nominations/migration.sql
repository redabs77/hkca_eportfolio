-- Migration 6: SOT / Assistant SOT nominations (Chief of Service by email, Admin checks, Board endorses)

-- CreateEnum
CREATE TYPE "SotNominationState" AS ENUM ('CHECK', 'BOARD', 'ENDORSED', 'ENTERED', 'NOT_ENDORSED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "SotNomination" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "nomineeName" TEXT NOT NULL,
    "nomineeUserId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "receivedOn" DATE NOT NULL,
    "fellowSinceYear" INTEGER,
    "wbaTrainerCourse" BOOLEAN NOT NULL DEFAULT false,
    "jcimedSotCourse" BOOLEAN NOT NULL DEFAULT false,
    "basicMedEdCourse" BOOLEAN NOT NULL DEFAULT false,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "state" "SotNominationState" NOT NULL DEFAULT 'CHECK',
    "sentToBoardOn" DATE,
    "boardEndorsedOn" DATE,
    "effectiveFrom" DATE,
    "closedReason" TEXT,
    "appointmentId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SotNomination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SotNomination_appointmentId_key" ON "SotNomination"("appointmentId");

-- CreateIndex
CREATE INDEX "SotNomination_hospitalId_state_idx" ON "SotNomination"("hospitalId", "state");

-- AddForeignKey
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_nomineeUserId_fkey" FOREIGN KEY ("nomineeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "UserRoleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma cannot express (hand-written, 2026-10-25)
-- ---------------------------------------------------------------------------
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_role_chk"
  CHECK ("role"::text IN ('SOT', 'ASSISTANT_SOT'));
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_fellow_chk"
  CHECK ("fellowSinceYear" IS NULL OR "fellowSinceYear" BETWEEN 1950 AND 2100);
-- A nomination that has gone to the Board has the date it went.
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_sent_chk"
  CHECK ("state"::text NOT IN ('BOARD', 'ENDORSED', 'ENTERED', 'NOT_ENDORSED') OR "sentToBoardOn" IS NOT NULL);
-- An endorsed nomination has the Board date and the effective date.
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_endorsed_chk"
  CHECK ("state"::text NOT IN ('ENDORSED', 'ENTERED') OR ("boardEndorsedOn" IS NOT NULL AND "effectiveFrom" IS NOT NULL));
-- An entered nomination points at the appointment it became.
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_entered_chk"
  CHECK ("state"::text <> 'ENTERED' OR "appointmentId" IS NOT NULL);
-- A closed nomination says why.
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_closed_chk"
  CHECK ("state"::text NOT IN ('NOT_ENDORSED', 'WITHDRAWN') OR length(btrim(coalesce("closedReason", ''))) > 0);
-- Dates run forwards.
ALTER TABLE "SotNomination" ADD CONSTRAINT "SotNomination_dates_chk"
  CHECK (("sentToBoardOn" IS NULL OR "sentToBoardOn" >= "receivedOn")
     AND ("boardEndorsedOn" IS NULL OR "sentToBoardOn" IS NULL OR "boardEndorsedOn" >= "sentToBoardOn"));
-- One open nomination per hospital, role and nominee.
CREATE UNIQUE INDEX "SotNomination_open_uq"
  ON "SotNomination" ("hospitalId", "role", lower("nomineeName"))
  WHERE "state" IN ('CHECK', 'BOARD'); -- enum comparison, not ::text: index predicates must be immutable
