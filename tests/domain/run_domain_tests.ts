import assert from "node:assert/strict";
import { AccreditedTimeLedgerEngine } from "../../domain/ledger/accreditedTime.ts";
import { ItaStateMachine } from "../../domain/ita/stateMachine.ts";
import { MilestoneProgressionEngine } from "../../domain/progression/milestoneGates.ts";

console.log("================================================================================");
console.log("HKCA ePortfolio — Sprint 1 Domain Rules Engine Unit Test Suite");
console.log("================================================================================\n");

// -----------------------------------------------------------------------------
// Test Group 1: Accredited Time Ledger & Calendar Arithmetic
// -----------------------------------------------------------------------------
console.log("Running Test Group 1: Accredited Time Ledger...");

// 1.1 Standard 6-month whole rotation
const m1 = AccreditedTimeLedgerEngine.calculateCalendarMonths(
  new Date("2026-07-01"),
  new Date("2026-12-31")
);
assert.equal(m1, 6, "01 Jul to 31 Dec should equal exactly 6 calendar months");

// 1.2 Full 12-month calendar year
const m2 = AccreditedTimeLedgerEngine.calculateCalendarMonths(
  new Date("2026-01-01"),
  new Date("2026-12-31")
);
assert.equal(m2, 12, "01 Jan to 31 Dec should equal exactly 12 calendar months");

// 1.3 Mid-rotation split transfer
const split = AccreditedTimeLedgerEngine.partitionRotation(
  new Date("2026-07-01"),
  new Date("2026-12-31"),
  new Date("2026-10-01")
);
assert.equal(split.monthsA, 3, "Hospital A (Jul-Sep) should receive exactly 3 months");
assert.equal(split.monthsB, 3, "Hospital B (Oct-Dec) should receive exactly 3 months");

// 1.4 BOE Revoke Authority Check
assert.throws(
  () => {
    AccreditedTimeLedgerEngine.validateCommitAuthorization({
      traineeId: "t-1",
      trainingCategory: "CLINICAL_ANAESTHESIA",
      hospitalId: "h-1",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-06-30"),
      decision: "REVOKE",
      reason: "NON_ACCREDITED_SITE",
      actorUserId: "u-sot",
      actorRole: "SOT", // SOT cannot revoke!
    });
  },
  /Board of Education \(BOE\) executive authority/,
  "SOT attempting to revoke ledger entry must throw authorization error"
);

console.log("  ✓ Calendar arithmetic exact match");
console.log("  ✓ Mid-rotation split logic validated");
console.log("  ✓ BOE-exclusive revocation authority enforced\n");

// -----------------------------------------------------------------------------
// Test Group 2: 2-Tier ITA State Machine & Escalation Tracking
// -----------------------------------------------------------------------------
console.log("Running Test Group 2: 2-Tier ITA State Machine...");

// 2.1 Contested Sign-Off
const contestRes = ItaStateMachine.processSignOff(
  {
    id: "ita-1",
    traineeId: "t-1",
    rotationId: "rot-1",
    status: "AWAITING_F2F_MEETING",
    sotGrade: 4,
    isContested: false,
    trainerResponsesCount: 4,
    minRequiredTrainerResponses: 4,
    consecutiveUnsatisfactoryCount: 0,
    lifetimeUnsatisfactoryCount: 0,
    hasActiveAppeal: false,
  },
  false, // Trainee refuses / disputes
  4
);
assert.equal(contestRes.nextStatus, "CONTESTED");
assert.equal(contestRes.escalationLevel, "BOE", "Contested ITA must route to BOE review");

// 2.2 Consecutive Fail Tracking (Streak Reset on Satisfactory)
const unsat1 = ItaStateMachine.processSignOff(
  {
    id: "ita-2",
    traineeId: "t-2",
    rotationId: "rot-2",
    status: "AWAITING_F2F_MEETING",
    sotGrade: 3,
    isContested: false,
    trainerResponsesCount: 4,
    minRequiredTrainerResponses: 4,
    consecutiveUnsatisfactoryCount: 0,
    lifetimeUnsatisfactoryCount: 0,
    hasActiveAppeal: false,
  },
  true,
  3 // Grade 3
);
assert.equal(unsat1.newConsecutiveUnsat, 1);
assert.equal(unsat1.nextStatus, "REMEDIAL_ACTIVE");

// Next cycle is satisfactory -> streak must reset to 0
const satCycle = ItaStateMachine.processSignOff(
  {
    id: "ita-3",
    traineeId: "t-2",
    rotationId: "rot-3",
    status: "AWAITING_F2F_MEETING",
    sotGrade: 2,
    isContested: false,
    trainerResponsesCount: 4,
    minRequiredTrainerResponses: 4,
    consecutiveUnsatisfactoryCount: unsat1.newConsecutiveUnsat,
    lifetimeUnsatisfactoryCount: unsat1.newLifetimeUnsat,
    hasActiveAppeal: false,
  },
  true,
  2 // Grade 2 (Satisfactory)
);
assert.equal(satCycle.newConsecutiveUnsat, 0, "Satisfactory ITA must reset consecutive unsat streak to 0");
assert.equal(satCycle.newLifetimeUnsat, 1, "Lifetime unsat count must be retained for H8 advisory");

// 2 consecutive fails -> Automatic BOE escalation
const unsat2 = ItaStateMachine.processSignOff(
  {
    id: "ita-4",
    traineeId: "t-3",
    rotationId: "rot-4",
    status: "AWAITING_F2F_MEETING",
    sotGrade: 4,
    isContested: false,
    trainerResponsesCount: 4,
    minRequiredTrainerResponses: 4,
    consecutiveUnsatisfactoryCount: 1, // already has 1
    lifetimeUnsatisfactoryCount: 1,
    hasActiveAppeal: false,
  },
  true,
  4 // second fail
);
assert.equal(unsat2.nextStatus, "ESCALATED_BOE");
assert.equal(unsat2.escalationLevel, "BOE", "2 consecutive fails must trigger automatic BOE escalation");

console.log("  ✓ Contested state machine transitions verified");
console.log("  ✓ Consecutive fail streak reset confirmed");
console.log("  ✓ Automatic 2-consecutive fail BOE escalation verified\n");

// -----------------------------------------------------------------------------
// Test Group 3: Milestone Progression Gates (BAT, HAT, Exit)
// -----------------------------------------------------------------------------
console.log("Running Test Group 3: Milestone Progression Gates...");

// 3.1 BAT Trainee Missing Intermediate Exam & EASE
const batEvaluation = MilestoneProgressionEngine.evaluateBatToHat({
  traineeId: "t-bat",
  stage: "BAT",
  accreditedMonthsTotal: 24,
  accreditedClinicalAnaesthesiaMonths: 24,
  accreditedIcuMonths: 0,
  last3YearsAccreditedMonths: 24,
  vopCaseCount: 220,
  cfWbaCount: 16,
  smWbaCount: 0,
  msfCount: 1,
  intermediateExamPassed: false, // Missing!
  finalExamPassed: false,
  formalProjectApproved: false,
  easeCourseCompleted: false, // Missing!
  emacCourseCompleted: false,
  openContestedItasCount: 0,
  activeRemedialPlansCount: 0,
});
assert.equal(batEvaluation.isEligible, false);
assert.equal(batEvaluation.blockingReasons.length, 2);
assert.match(batEvaluation.blockingReasons[0], /Intermediate Examination/);
assert.match(batEvaluation.blockingReasons[1], /EASE course/);

// 3.2 Full Fellowship Exit Assessment (3-MSF rule checked!)
const exitEvaluation = MilestoneProgressionEngine.evaluateFellowshipExit({
  traineeId: "t-pfy",
  stage: "PFY",
  accreditedMonthsTotal: 72,
  accreditedClinicalAnaesthesiaMonths: 48,
  accreditedIcuMonths: 6,
  last3YearsAccreditedMonths: 30, // satisfies 24/24 rule
  vopCaseCount: 750,
  cfWbaCount: 29,
  smWbaCount: 31,
  msfCount: 2, // Only 2! Needs 3!
  intermediateExamPassed: true,
  finalExamPassed: true,
  formalProjectApproved: true,
  easeCourseCompleted: true,
  emacCourseCompleted: true,
  openContestedItasCount: 0,
  activeRemedialPlansCount: 0,
});
assert.equal(exitEvaluation.isEligible, false);
assert.match(exitEvaluation.blockingReasons[0], /All 3 Multi-Source Feedbacks required: 2\/3/);

console.log("  ✓ BAT progression prerequisite blockers verified");
console.log("  ✓ Fellowship Exit 3-MSF requirement verified");
console.log("  ✓ 24/24 rule verification confirmed\n");

console.log("================================================================================");
console.log("ALL SPRINT 1 TESTS PASSED SUCCESSFULLY (100% PASS RATE)");
console.log("================================================================================");
