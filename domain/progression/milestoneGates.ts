/**
 * HKCA NextGen ePortfolio — Domain Logic: Milestone Progression Gates
 * Evaluates trainee readiness for stage advancement (BAT -> HAT -> PFY -> Fellowship Exit).
 * Evaluates live metrics in <5ms per PRD §6.
 */

export interface TraineeProgressionSnapshot {
  traineeId: string;
  stage: "BAT" | "HAT" | "PFY";
  accreditedMonthsTotal: number;
  accreditedClinicalAnaesthesiaMonths: number;
  accreditedIcuMonths: number;
  last3YearsAccreditedMonths: number;
  vopCaseCount: number;
  cfWbaCount: number;
  smWbaCount: number;
  msfCount: number;
  intermediateExamPassed: boolean;
  finalExamPassed: boolean;
  formalProjectApproved: boolean;
  easeCourseCompleted: boolean;
  emacCourseCompleted: boolean;
  openContestedItasCount: number;
  activeRemedialPlansCount: number;
}

export interface GateEvaluationResult {
  isEligible: boolean;
  blockingReasons: string[];
  advisoryWarnings: string[];
}

export class MilestoneProgressionEngine {
  /**
   * Gate 1: Advancement from Basic (BAT) to Higher (HAT).
   * Requirements:
   *  - 24 accredited months (including ≥18m Clinical Anaesthesia)
   *  - Intermediate Examination passed
   *  - EASE course completed
   *  - CF WBA ≥ 16
   *  - VOP ≥ 218 cases
   *  - MSF ≥ 1
   *  - Zero open contested ITAs or active remedial plans
   */
  public static evaluateBatToHat(s: TraineeProgressionSnapshot): GateEvaluationResult {
    const blockers: string[] = [];
    const advisories: string[] = [];

    if (s.accreditedMonthsTotal < 24) blockers.push(`Accredited time insufficient: ${s.accreditedMonthsTotal}/24 months.`);
    if (s.accreditedClinicalAnaesthesiaMonths < 18) blockers.push(`Clinical Anaesthesia time insufficient: ${s.accreditedClinicalAnaesthesiaMonths}/18 months.`);
    if (!s.intermediateExamPassed) blockers.push("Intermediate Examination must be passed.");
    if (!s.easeCourseCompleted) blockers.push("Mandatory EASE course must be completed.");
    if (s.cfWbaCount < 16) blockers.push(`Clinical Fundamentals WBA incomplete: ${s.cfWbaCount}/16.`);
    if (s.vopCaseCount < 218) blockers.push(`Volume of Practice caseload below minimum: ${s.vopCaseCount}/218 cases.`);
    if (s.msfCount < 1) blockers.push(`Multi-Source Feedback required: ${s.msfCount}/1.`);
    if (s.openContestedItasCount > 0) blockers.push(`Cannot progress with ${s.openContestedItasCount} contested ITA pending BOE review.`);
    if (s.activeRemedialPlansCount > 0) blockers.push(`Cannot progress while an active Remedial Plan (PIP) is in effect.`);

    return {
      isEligible: blockers.length === 0,
      blockingReasons: blockers,
      advisoryWarnings: advisories,
    };
  }

  /**
   * Gate 2: Advancement from Higher (HAT) to Provisional Fellowship Year (PFY).
   * Requirements:
   *  - 48 accredited months (including mandatory 6m ICU)
   *  - Final Fellowship Examination passed
   *  - CF WBA ≥ 29 (cumulative)
   *  - VOP ≥ 615 cases
   *  - MSF ≥ 2 (cumulative: 1 BAT + 1 HAT)
   *  - Zero open contested ITAs or active remedial plans
   */
  public static evaluateHatToPfy(s: TraineeProgressionSnapshot): GateEvaluationResult {
    const blockers: string[] = [];
    const advisories: string[] = [];

    if (s.accreditedMonthsTotal < 48) blockers.push(`Accredited time insufficient: ${s.accreditedMonthsTotal}/48 months.`);
    if (s.accreditedIcuMonths < 6) blockers.push(`Mandatory 6-month ICU rotation incomplete: ${s.accreditedIcuMonths}/6 months.`);
    if (!s.finalExamPassed) blockers.push("Final Fellowship Examination must be passed.");
    if (s.cfWbaCount < 29) blockers.push(`Clinical Fundamentals WBA incomplete: ${s.cfWbaCount}/29.`);
    if (s.vopCaseCount < 615) blockers.push(`Volume of Practice caseload below minimum: ${s.vopCaseCount}/615 cases.`);
    if (s.msfCount < 2) blockers.push(`Higher Training MSF incomplete: ${s.msfCount}/2 cumulative MSF required.`);
    if (s.openContestedItasCount > 0) blockers.push(`Cannot enter PFY with ${s.openContestedItasCount} contested ITA.`);
    if (s.activeRemedialPlansCount > 0) blockers.push(`Cannot enter PFY while an active Remedial Plan is in effect.`);

    // Advisory check on Specialty WBA (not blocking for PFY, but needed for Exit)
    if (s.smWbaCount < 15) {
      advisories.push(`Specialty WBA progress is low (${s.smWbaCount}/31). Recommend prioritizing subspecialty assessments during PFY.`);
    }

    return {
      isEligible: blockers.length === 0,
      blockingReasons: blockers,
      advisoryWarnings: advisories,
    };
  }

  /**
   * Gate 3: Fellowship Exit Assessment (Completion of Training -> FHKCA / FHKAM).
   * Requirements:
   *  - 72 accredited months
   *  - 24/24 Rule: At least 24 months accredited in the final 36 months in approved training posts
   *  - Formal Project approved
   *  - EMAC course completed
   *  - Specialty WBA ≥ 31
   *  - MSF ≥ 3 (cumulative: BAT + HAT + PFY)
   */
  public static evaluateFellowshipExit(s: TraineeProgressionSnapshot): GateEvaluationResult {
    const blockers: string[] = [];
    const advisories: string[] = [];

    if (s.accreditedMonthsTotal < 72) blockers.push(`Total accredited time incomplete: ${s.accreditedMonthsTotal}/72 months.`);
    if (s.last3YearsAccreditedMonths < 24) blockers.push(`24/24 Rule violated: only ${s.last3YearsAccreditedMonths}/24 accredited months in last 3 years.`);
    if (!s.formalProjectApproved) blockers.push("Formal Project (HKCA-E03) must be approved.");
    if (!s.emacCourseCompleted) blockers.push("Mandatory EMAC course must be completed.");
    if (s.smWbaCount < 31) blockers.push(`Specialty Modules WBA incomplete: ${s.smWbaCount}/31.`);
    if (s.msfCount < 3) blockers.push(`All 3 Multi-Source Feedbacks required: ${s.msfCount}/3.`);
    if (s.openContestedItasCount > 0) blockers.push("Unresolved contested ITAs must be settled by BOE.");
    if (s.activeRemedialPlansCount > 0) blockers.push("Cannot exit training under active remedial supervision.");

    return {
      isEligible: blockers.length === 0,
      blockingReasons: blockers,
      advisoryWarnings: advisories,
    };
  }
}
