/**
 * HKCA NextGen ePortfolio — Domain Logic: 2-Tier ITA State Machine
 * Implements 2-tier assessment lifecycle, contested appeals, and escalation tracking per M1, M6, H1, H8.
 */

export type ItaStatus =
  | "DRAFT"
  | "AWAITING_TRAINER_INPUT"
  | "AWAITING_SOT_SYNTHESIS"
  | "AWAITING_F2F_MEETING"
  | "COMPLETED_SATISFACTORY"
  | "CONTESTED"
  | "ESCALATED_BOE"
  | "REMEDIAL_ACTIVE";

export type EscalationLevel = "SOT" | "ASSISTANT_SOT" | "CLUSTER_SOT" | "BOE";

export interface ItaSessionContext {
  id: string;
  traineeId: string;
  rotationId: string;
  status: ItaStatus;
  sotGrade?: number; // 1-4 scale
  finalGrade?: number; // Post-appeal authoritative grade
  isContested: boolean;
  trainerResponsesCount: number;
  minRequiredTrainerResponses: number;
  consecutiveUnsatisfactoryCount: number;
  lifetimeUnsatisfactoryCount: number;
  hasActiveAppeal: boolean;
}

export class ItaStateMachine {
  /**
   * Advances the assessment from trainer input collection to SOT synthesis.
   */
  public static checkTrainerReadiness(ctx: ItaSessionContext): boolean {
    return ctx.trainerResponsesCount >= ctx.minRequiredTrainerResponses;
  }

  /**
   * Evaluates SOT summative grade and determines transition to F2F meeting or warning.
   */
  public static evaluateSotSynthesis(
    ctx: ItaSessionContext,
    sotGrade: number
  ): { nextStatus: ItaStatus; isUnsatisfactory: boolean } {
    if (sotGrade < 1 || sotGrade > 4) {
      throw new Error("SOT Grade must be on the standard 1–4 Likert scale.");
    }

    // College scale: 1 consistently exceeds, 2 occasionally exceeds, 3 usually meets expectation, 4 unsatisfactory.
    // Only 4 is unsatisfactory — 3 is a pass (a development plan may still be attached by the SOT).
    const isUnsatisfactory = sotGrade === 4;
    return {
      nextStatus: "AWAITING_F2F_MEETING",
      isUnsatisfactory,
    };
  }

  /**
   * Handles the in-person trainee sign-off outcome.
   * If trainee agrees -> COMPLETED_SATISFACTORY.
   * If trainee disputes -> CONTESTED (triggers pending BOE review).
   */
  public static processSignOff(
    ctx: ItaSessionContext,
    traineeAgreed: boolean,
    sotGrade: number
  ): { nextStatus: ItaStatus; escalationLevel: EscalationLevel; newConsecutiveUnsat: number; newLifetimeUnsat: number } {
    if (!traineeAgreed) {
      return {
        nextStatus: "CONTESTED",
        escalationLevel: "BOE",
        newConsecutiveUnsat: ctx.consecutiveUnsatisfactoryCount,
        newLifetimeUnsat: ctx.lifetimeUnsatisfactoryCount,
      };
    }

    // Trainee signed
    const isUnsat = sotGrade === 4; // 3 = usually meets expectation = satisfactory
    let newConsecutive = isUnsat ? ctx.consecutiveUnsatisfactoryCount + 1 : 0; // Satisfactory resets the streak!
    let newLifetime = isUnsat ? ctx.lifetimeUnsatisfactoryCount + 1 : ctx.lifetimeUnsatisfactoryCount;

    let nextStatus: ItaStatus = isUnsat ? "REMEDIAL_ACTIVE" : "COMPLETED_SATISFACTORY";
    let escalationLevel: EscalationLevel = "SOT";

    // Consecutive fail rule: >= 2 consecutive unsatisfactory -> Automatic BOE Escalation
    if (newConsecutive >= 2) {
      nextStatus = "ESCALATED_BOE";
      escalationLevel = "BOE";
    } else if (isUnsat) {
      escalationLevel = "ASSISTANT_SOT"; // Mentor assignment
    }

    return {
      nextStatus,
      escalationLevel,
      newConsecutiveUnsat: newConsecutive,
      newLifetimeUnsat: newLifetime,
    };
  }

  /**
   * Adjudicates formal BOE appeal.
   * Overturning sets authoritative finalGrade distinct from sotGrade (M6).
   */
  public static adjudicateAppeal(
    ctx: ItaSessionContext,
    boeDecision: "UPHELD" | "OVERTURNED",
    amendedGrade?: number
  ): { nextStatus: ItaStatus; finalGrade: number; unblocksProgression: boolean } {
    if (boeDecision === "OVERTURNED") {
      const finalGrade = amendedGrade ?? 2; // Default to Satisfactory
      return {
        nextStatus: "COMPLETED_SATISFACTORY",
        finalGrade,
        unblocksProgression: true,
      };
    }

    // Appeal Upheld (SOT grade stands)
    return {
      nextStatus: "REMEDIAL_ACTIVE",
      finalGrade: ctx.sotGrade ?? 4,
      unblocksProgression: false,
    };
  }
}
