import assert from "node:assert/strict";
import { importLegacy, importLegacyRow, mergeIntoLedger, normaliseStatus, parseLegacyDate, normaliseClassification, normaliseTechnique, type LegacyPatient2Row } from "../../domain/vop/legacyImport.ts";

console.log("HKCA ePortfolio: legacy VOP import and merge tests");
const opts = { traineeIdByTid: { "2022019": "2022-019", "2024011": "2024-011" }, now: "2026-10-22", verifierRole: (n: string) => (/chan/i.test(n) ? "sot" as const : "assistant_sot" as const) };

// --- dates
assert.equal(parseLegacyDate("2024-02-29"), "2024-02-29");
assert.equal(parseLegacyDate("29/02/2024"), "2024-02-29");
assert.equal(parseLegacyDate("31/02/2024"), null, "impossible date");
assert.equal(parseLegacyDate("0000-00-00"), null, "MySQL zero date");

// --- status vocabulary (A1)
assert.equal(normaliseStatus("1").status, "approved");
assert.equal(normaliseStatus("Approved").status, "approved");
assert.equal(normaliseStatus("revision").status, "revision_requested");
assert.equal(normaliseStatus("").status, "pending");
assert.deepEqual(normaliseStatus("???"), { status: "pending", known: false }, "unknown status falls back to pending and is reported");

// --- classification (A2)
const base: LegacyPatient2Row = { pid: 1, tid: "2022019", start_date: "2025-03-10", date_entry: "2025-03-11", hospital: "PWH", asa: "2", level_supervision: "2", op1: "Lap chole", age: "54" };
assert.equal(normaliseClassification({ ...base, procedure_claimed: "2.2 Regional anaesthesia - spinal" }).code, "2.2");
assert.equal(normaliseClassification({ ...base, procedure_claimed: "Caesarean section under spinal" }).code, "3.5", "specific alias beats general");
assert.equal(normaliseClassification({ ...base, procedure_claimed: "xyz", airway_management: "1" }).basis, "flags", "single CF flag is a last resort");
assert.equal(normaliseClassification({ ...base, procedure_claimed: "xyz", airway_management: "1", regional_anaesthesia: "1" }).code, null, "two flags and no text is ambiguous");
assert.deepEqual(normaliseTechnique("GA + spinal; sedation").values.sort(), ["GA", "Sedation/MAC", "Spinal"]);
assert.deepEqual(normaliseTechnique("hypnosis").unmapped, ["hypnosis"]);

// --- one clean approved row keeps every field and drops patient identity
const clean = importLegacyRow({ ...base, approved_status: "1", approved_by: "Dr Chan", approved_date: "2025-03-20", approved_notes: "ok",
  procedure_claimed: "2.1 GA", mode_anaesthesia: "GA", length_hours: "2.5", surg_dx: "Gallstones", block1: "TAP block L", remark: "teaching case",
  hkid: "A1234567", date_birth: "1971-01-01", sex: "F", pain_session_am: "x" }, opts);
assert.ok(clean.ok); const c = clean.ok!;
assert.equal(c.verification_status, "approved"); assert.equal(c.verified_by_role, "sot"); assert.equal(c.verified_at, "2025-03-20");
assert.equal(c.descriptor_code, "2.1"); assert.equal(c.vop_category, "clinical_fundamentals"); assert.equal(c.duration_hours, 2.5);
assert.deepEqual(c.blocks, [{ sequence: 1, text: "TAP block L" }]); assert.equal(c.trainee_notes, "teaching case"); assert.equal(c.has_pain_session, true);
assert.equal(c.training_stage_at_entry, null); assert.ok(c.case_ref.startsWith("VOP-"));
assert.ok(!JSON.stringify(c).includes("A1234567") && !JSON.stringify(c).includes("1971"), "no patient identifiers in the target row");

// --- messy batch + reconciliation
const rows: LegacyPatient2Row[] = [
  { ...base, pid: 1, approved_status: "1", procedure_claimed: "2.1" },
  { ...base, pid: 2, approved_status: "1", procedure_claimed: "something odd" },                        // unmapped classification
  { ...base, pid: 3, tid: "9999999", procedure_claimed: "2.1" },                                         // orphan trainee
  { ...base, pid: 4, start_date: "0000-00-00", date_entry: null, procedure_claimed: "2.1" },             // no date
  { ...base, pid: 5, start_date: "2022-01-05", date_entry: "2025-06-01", approved_status: "1", procedure_claimed: "2.2" }, // logged >2y late, approved
  { ...base, pid: 6, start_date: "2022-01-05", date_entry: "2025-06-01", approved_status: "0", procedure_claimed: "2.2" }, // logged >2y late, pending
  { ...base, pid: 7, level_supervision: "7", mode_anaesthesia: "hypnosis", hospital: "Moon Base", procedure_claimed: "2.4" },
];
const r = importLegacy(rows, opts);
assert.equal(r.report.rowsIn, 7); assert.equal(r.report.imported, 5); assert.equal(r.report.quarantined, 2);
assert.equal(r.report.balanced, true, "every input row is either imported or quarantined");
assert.equal(r.report.needsClassification, 1);
assert.deepEqual(r.quarantine.map(q => q.reasons[0]).sort(), ["no_case_date", "orphan_trainee"]);
assert.ok(r.quarantine.every(q => !("hkid" in q.raw) || q.raw.hkid === undefined), "quarantine copies never carry patient identity");
const by = (pid: number) => r.cases.find(x => x.legacy_pid === pid)!;
assert.equal(by(5).is_within_2yr_window, false); assert.equal(by(5).is_accredited, true, "approved legacy case is grandfathered by default (A3)");
assert.equal(by(6).is_accredited, false, "unapproved late case is not accredited");
assert.equal(by(5).legacy_window_anomaly && by(6).legacy_window_anomaly, true, "late rows are flagged as legacy anomalies"); assert.equal(r.report.windowAnomalies, 2);
const strict = importLegacy(rows, { ...opts, grandfatherApproved: false });
assert.equal(strict.cases.find(x => x.legacy_pid === 5)!.is_accredited, false, "A3 switch");
assert.deepEqual([r.report.warnings.unmapped_hospital, r.report.warnings.bad_supervision, r.report.warnings.unmapped_technique], [1, 1, 1]);

// --- merge: idempotent re-run, and a hand-entered duplicate is reported but never deleted
const m1 = mergeIntoLedger([], r.cases); assert.equal(m1.added, 5);
const m2 = mergeIntoLedger(m1.ledger, r.cases); assert.equal(m2.added, 0); assert.equal(m2.skipped, 5, "re-running the import adds nothing");
const handEntered = { ...by(1), case_ref: "VOP-LIVE0001", legacy_pid: null, legacy_tid: null, migrated_at: null };
const m3 = mergeIntoLedger([handEntered], [by(1)]);
assert.equal(m3.added, 1, "legacy row is still imported"); assert.equal(m3.ledger.length, 2, "nothing overwritten or removed");
assert.deepEqual(m3.possibleDuplicates, [{ legacy: by(1).case_ref, live: "VOP-LIVE0001" }]);
console.log("All VOP import tests passed.");
