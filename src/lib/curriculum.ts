/**
 * Stage targets used for display only (progress bars, labels).
 *
 * TODO(curriculum_rules): these must be read from the versioned `curriculum_rules` table, never
 * hardcoded (AI Development and Architectural Strategy §3A). They are centralised here so the swap is
 * one file. NB `domain/progression/milestoneGates.ts` still carries the same literals (24/48/72,
 * 218/615, WBA counts) and needs the same treatment before pilot.
 */
export type Stage = "BAT" | "HAT" | "PFY";

export const STAGE_ORDER: readonly Stage[] = ["BAT", "HAT", "PFY"];

export const STAGE_LABEL: Record<Stage, string> = {
  BAT: "Basic Anaesthesia Training",
  HAT: "Higher Anaesthesia Training",
  PFY: "Provisional Fellowship Year",
};

/** Cumulative accredited months required to leave each stage. */
export const STAGE_EXIT_MONTHS: Record<Stage, number> = { BAT: 24, HAT: 48, PFY: 72 };
export const TOTAL_TRAINING_MONTHS = 72;
