-- Migration 1: official 15-item HKCA In-Training Assessment form (decision I1)
--
-- Generated with `prisma migrate diff` from the 0_init schema, then hand-ordered so existing
-- trainer text is preserved before the old columns are dropped.
--
-- DESTRUCTIVE: drops ItaAssessorResponse.notableStrength and .keyAreaForGrowth. Their text is
-- first copied into the new specialistComments column. No production data exists yet (synthetic
-- seeds only), so a single-step drop is acceptable; do not reuse this pattern once live.
--
-- domainRatingsJson keeps its column type; only the JSON shape changes (see schema.prisma).
-- Existing rows in the old shape are NOT converted — old keys do not map to the 15 official items.

-- DropIndex (superseded by the unique index below)
DROP INDEX "ItaAssessorResponse_itaSessionId_trainerId_idx";

-- AlterTable: ItaSession (SOT consolidated 15-item grades and SOT-only fields)
ALTER TABLE "ItaSession" ADD COLUMN     "coursesAttendedJson" JSONB,
ADD COLUMN     "discretionaryUnsatReason" TEXT,
ADD COLUMN     "divergenceReasonsJson" JSONB,
ADD COLUMN     "formVersion" TEXT NOT NULL DEFAULT 'HKCA-ITA-15-v1',
ADD COLUMN     "formalProjectCompleted" BOOLEAN,
ADD COLUMN     "itemGradesJson" JSONB,
ADD COLUMN     "unsatisfactoryItemCount" INTEGER;

-- AlterTable: ItaAssessorResponse, step 1 — add the new columns
ALTER TABLE "ItaAssessorResponse" ADD COLUMN     "formVersion" TEXT NOT NULL DEFAULT 'HKCA-ITA-15-v1',
ADD COLUMN     "recordHash" TEXT,
ADD COLUMN     "specialistComments" TEXT;

-- Preserve the old two prompts as plain text in the new comments column
UPDATE "ItaAssessorResponse"
SET "specialistComments" = NULLIF(concat_ws(E'\n',
      'Strength: ' || "notableStrength",
      'Area for growth: ' || "keyAreaForGrowth"), '')
WHERE "notableStrength" IS NOT NULL OR "keyAreaForGrowth" IS NOT NULL;

-- AlterTable: ItaAssessorResponse, step 2 — drop the old columns
ALTER TABLE "ItaAssessorResponse" DROP COLUMN "keyAreaForGrowth",
DROP COLUMN "notableStrength";

-- CreateIndex: one sealed response per trainer per ITA session
CREATE UNIQUE INDEX "ItaAssessorResponse_itaSessionId_trainerId_key" ON "ItaAssessorResponse"("itaSessionId", "trainerId");
