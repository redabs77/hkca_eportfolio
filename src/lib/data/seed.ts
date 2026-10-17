import "server-only";
import seed from "@seed";
import { MilestoneProgressionEngine, type TraineeProgressionSnapshot } from "@domain/progression/milestoneGates.ts";
import type { Stage } from "@/lib/curriculum";
import type { PortfolioRepository, TraineeRow } from "./types";

/* Minimal shapes for the seed tables this adapter reads. */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const t = seed as unknown as Record<string, Row[]>;

function sum(rows: Row[], f: (r: Row) => number) {
  return rows.reduce((a, r) => a + f(r), 0);
}

function snapshotFor(p: Row, ledger: Row[], vop: number, wba: Row[], itas: Row[]): TraineeProgressionSnapshot {
  const months = sum(ledger, (l) => l.calendarMonthsCredited);
  const byCat = (c: string) => sum(ledger.filter((l) => l.category === c), (l) => l.calendarMonthsCredited);
  return {
    traineeId: p.id,
    stage: p.currentStage as Stage,
    accreditedMonthsTotal: months,
    accreditedClinicalAnaesthesiaMonths: byCat("CLINICAL_ANAESTHESIA"),
    accreditedIcuMonths: byCat("INTENSIVE_CARE"),
    last3YearsAccreditedMonths: months, // TODO: windowed calc once the ledger engine exposes it
    vopCaseCount: vop,
    cfWbaCount: wba.length, // TODO: split Clinical Fundamentals vs Specialty Modules by descriptor
    smWbaCount: 0,
    msfCount: wba.filter((w) => w.modality === "MSF").length,
    intermediateExamPassed: !!p.intermediateExamPassed,
    finalExamPassed: !!p.finalExamPassed,
    formalProjectApproved: !!p.formalProjectApproved,
    easeCourseCompleted: false, // TODO: MandatoryCourse table (migration 2)
    emacCourseCompleted: false,
    openContestedItasCount: itas.filter((i) => i.isContested).length,
    activeRemedialPlansCount: 0,
  };
}

export const seedRepository: PortfolioRepository = {
  async listTrainees() {
    const users = new Map(t.User.map((u) => [u.id, u]));
    const hospitals = new Map(t.Hospital.map((h) => [h.id, h]));

    return t.TraineeProfile.map((p): TraineeRow => {
      const ledger = t.AccreditedTimeLedger.filter((l) => l.traineeId === p.id && l.isCurrent && l.decision === "GRANT");
      const vop = t.VolumeOfPractice.filter((v) => v.traineeId === p.id).length;
      const wba = t.WbaAssessment.filter((w) => w.traineeId === p.id);
      const itas = t.ItaSession.filter((i) => i.traineeId === p.id);
      const snap = snapshotFor(p, ledger, vop, wba, itas);

      const gate =
        p.currentStage === "BAT"
          ? { label: "BAT → HAT", r: MilestoneProgressionEngine.evaluateBatToHat(snap) }
          : p.currentStage === "HAT"
            ? { label: "HAT → PFY", r: MilestoneProgressionEngine.evaluateHatToPfy(snap) }
            : { label: "Fellowship exit", r: MilestoneProgressionEngine.evaluateFellowshipExit(snap) };

      return {
        id: p.id,
        name: users.get(p.userId)?.name ?? "Unknown",
        hkcaNumber: p.hkcaNumber,
        stage: p.currentStage,
        hospital: hospitals.get(p.parentHospitalId)?.hospitalName ?? "—",
        accreditedMonths: snap.accreditedMonthsTotal,
        vopCases: vop,
        wbaCount: wba.length,
        itaStatus: itas.at(-1)?.status ?? null,
        itaContested: itas.some((i) => i.isContested),
        lifetimeUnsatIta: p.lifetimeUnsatItaCount ?? 0,
        nextGateLabel: gate.label,
        nextGateBlockers: gate.r.blockingReasons,
      };
    }).sort((a, b) => a.hkcaNumber.localeCompare(b.hkcaNumber));
  },
};

export const repo: PortfolioRepository = seedRepository;
