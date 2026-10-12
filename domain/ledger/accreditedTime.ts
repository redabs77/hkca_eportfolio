/**
 * HKCA NextGen ePortfolio — Domain Logic: Accredited Time Ledger Engine
 * Implements strict calendar-month accounting per M2, M3, and PRD §5.1.
 */

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export type LedgerDecisionType = "GRANT" | "REVOKE" | "AMEND";

export type LedgerReasonType =
  | "SATISFACTORY_ITA_COMPLETION"
  | "INTERIM_SPLIT_ROTATION"
  | "RETROSPECTIVE_OVERSEAS_RECOGNITION"
  | "RETROSPECTIVE_SPECIALTY_TRANSFER"
  | "CONFLICT_OF_INTEREST"
  | "NON_ACCREDITED_SITE"
  | "UNAUTHORIZED_SIGNATORY"
  | "SUCCESSFUL_APPEAL_OVERTURN"
  | "ADMINISTRATIVE_ERROR"
  | "FRAUDULENT_RECORD"
  | "INCORRECT_CATEGORY"
  | "PARTIAL_CREDIT_CORRECTION"
  | "CONDITIONAL_REQUIREMENT_FULFILLED"
  | "CURRICULUM_RULE_CHANGE"
  | "SUPERSEDES_DUPLICATE"
  | "OTHER_BOE_DIRECTED";

export interface LedgerCommitRequest {
  traineeId: string;
  rotationId?: string;
  trainingCategory: string;
  hospitalId: string;
  periodStart: Date;
  periodEnd: Date;
  monthsToCredit?: number; // Optional override if pre-calculated
  decision: LedgerDecisionType;
  reason: LedgerReasonType;
  actorUserId: string;
  actorRole: string; // Enforces BOE-only authority on REVOKE/AMEND
  rationaleText?: string;
  amendsLedgerId?: string;
}

export class AccreditedTimeLedgerEngine {
  /**
   * Calculates exact credited calendar months between two dates.
   * Standard HKCA rotation convention: 1st of month to last of month = exactly N months.
   * Day-based partial calculations are converted to 1-decimal precision.
   */
  public static calculateCalendarMonths(start: Date, end: Date): number {
    if (end < start) {
      throw new Error("Invalid rotation date range: end date precedes start date.");
    }

    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    const startDay = start.getDate();

    const endYear = end.getFullYear();
    const endMonth = end.getMonth();
    const endDay = end.getDate();

    // Check if end date is last day of the month
    const lastDayOfEndMonth = new Date(endYear, endMonth + 1, 0).getDate();
    const isFullEndMonth = endDay === lastDayOfEndMonth;
    const isStartOfStartMonth = startDay === 1;

    // Standard whole-month case (e.g. 01 Jul to 31 Dec)
    if (isStartOfStartMonth && isFullEndMonth) {
      return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    }

    // Exact days calculation converted via average calendar month factor (30.4375)
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
    const months = diffDays / 30.4375;
    return Math.round(months * 10) / 10;
  }

  /**
   * Validates governance and permission rules for committing ledger changes.
   * Enforces M2: Revocation and Amendment require BOE authority.
   */
  public static validateCommitAuthorization(req: LedgerCommitRequest): void {
    if (req.decision === "REVOKE" || req.decision === "AMEND") {
      const isBoeAuthorized =
        req.actorRole === "BOE_MEMBER" || req.actorRole === "COLLEGE_ADMIN";
      if (!isBoeAuthorized) {
        throw new Error(
          `Unauthorized ledger modification: ${req.decision} decisions require Board of Education (BOE) executive authority.`
        );
      }

      if (!req.amendsLedgerId && req.decision === "AMEND") {
        throw new Error("An AMEND decision must reference the original ledger entry ID.");
      }

      if (req.reason === "OTHER_BOE_DIRECTED" && (!req.rationaleText || req.rationaleText.trim().length < 10)) {
        throw new Error(
          "Escape hatch reason 'OTHER_BOE_DIRECTED' requires an accompanying written explanation."
        );
      }
    }
  }

  /**
   * Partitions an accredited period cleanly between two centres (Split ITA / Mid-rotation transfer).
   */
  public static partitionRotation(
    originalStart: Date,
    originalEnd: Date,
    splitDate: Date
  ): { periodA: DateRange; periodB: DateRange; monthsA: number; monthsB: number } {
    if (splitDate <= originalStart || splitDate >= originalEnd) {
      throw new Error("Split transfer date must fall strictly within the rotation period.");
    }

    // Hospital A: start to splitDate - 1 day
    const endA = new Date(splitDate.getTime() - 24 * 60 * 60 * 1000);
    // Hospital B: splitDate to originalEnd
    const startB = new Date(splitDate.getTime());

    const monthsA = this.calculateCalendarMonths(originalStart, endA);
    const monthsB = this.calculateCalendarMonths(startB, originalEnd);

    return {
      periodA: { startDate: originalStart, endDate: endA },
      periodB: { startDate: startB, endDate: originalEnd },
      monthsA,
      monthsB,
    };
  }
}
