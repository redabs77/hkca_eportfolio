/**
 * HKCA NextGen ePortfolio — Domain Logic: ITA item validation, distribution and overall-assessment rule.
 *
 * Two distinct layers, deliberately separate (M1):
 *   • Tier 1 — each trainer submits ratings for all 15 items (X allowed). Private to SOT/College.
 *   • Tier 2 — the SOT records one consolidated grade per item, plus an overall 1–4 assessment.
 *     The College rule ("unsatisfactory if, but not limited to, >= 4 of the 15 items unsatisfactory")
 *     is applied to the SOT's consolidated items, NOT to an individual trainer's form.
 *
 * Nothing here auto-sets a grade. The engine validates, counts and constrains; the SOT decides.
 */

import { ITA_DOMAINS, ITA_UNSATISFACTORY_ITEM_THRESHOLD, type ItaGrade } from "./itaDomains.ts";

export interface TrainerItemResponse {
  grade: ItaGrade | null;
  example?: string; // "Examples of performance below or better than expected"
}
export type TrainerRatings = Record<string, TrainerItemResponse>;

const VALID: ReadonlyArray<ItaGrade> = [1, 2, 3, 4, "X"];

export class ItaOverallAssessment {
  /**
   * Validates one trainer's Tier-1 submission.
   * - All 15 items are mandatory on the College form (asterisked); "X" counts as an answer.
   * - An example is mandatory for grade 4 (unsatisfactory must be defensible on appeal).
   * - Examples for grades 1 and 2 are encouraged, never required.
   */
  public static validateTrainerSubmission(ratings: TrainerRatings): { ok: boolean; missing: string[]; needsExample: string[] } {
    const missing: string[] = [];
    const needsExample: string[] = [];
    for (const d of ITA_DOMAINS) {
      const r = ratings[d.code];
      if (!r || r.grade === null || r.grade === undefined || !VALID.includes(r.grade)) {
        missing.push(d.code);
        continue;
      }
      if (r.grade === 4 && !(r.example && r.example.trim().length >= 10)) needsExample.push(d.code);
    }
    return { ok: missing.length === 0 && needsExample.length === 0, missing, needsExample };
  }

  /** Per-item grade distribution across trainers (counts for 1,2,3,4,X) plus spread of numeric grades. */
  public static distribution(all: TrainerRatings[], code: string) {
    const counts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, X: 0 };
    const numeric: number[] = [];
    for (const t of all) {
      const g = t[code]?.grade;
      if (g === null || g === undefined) continue;
      counts[String(g)]++;
      if (g !== "X") numeric.push(g);
    }
    const spread = numeric.length ? Math.max(...numeric) - Math.min(...numeric) : 0;
    return { counts, spread, divergent: spread >= 2 };
  }

  /** Number of the 15 SOT-consolidated items graded 4. */
  public static countUnsatisfactoryItems(sotItems: Record<string, ItaGrade | null>): number {
    return ITA_DOMAINS.filter((d) => sotItems[d.code] === 4).length;
  }

  /**
   * College rule on the SOT-consolidated items.
   * - >= 4 items graded 4  → overall MUST be 4 (locked).
   * - below the threshold  → SOT free to choose 1–4 ("but not limited to"); a 4 below threshold needs reasoning.
   */
  public static overallConstraint(sotItems: Record<string, ItaGrade | null>): {
    unsatisfactoryItems: number;
    ruleTriggered: boolean;
    allowedOverall: ReadonlyArray<1 | 2 | 3 | 4>;
    reasoningRequiredFor4: boolean;
  } {
    const unsatisfactoryItems = this.countUnsatisfactoryItems(sotItems);
    const ruleTriggered = unsatisfactoryItems >= ITA_UNSATISFACTORY_ITEM_THRESHOLD;
    return {
      unsatisfactoryItems,
      ruleTriggered,
      allowedOverall: ruleTriggered ? [4] : [1, 2, 3, 4],
      reasoningRequiredFor4: !ruleTriggered,
    };
  }

  /** Overall grade 4 is the only unsatisfactory outcome; 3 ("usually meets expectation") is a pass. */
  public static isOverallUnsatisfactory(overall: number): boolean {
    return overall === 4;
  }
}
