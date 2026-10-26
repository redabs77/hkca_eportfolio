/**
 * Legacy e-logbook (`eps.patient2`) -> `volume_of_practice` import and merge.
 *
 * Pure functions, no I/O. The ETL job feeds rows in and persists the result.
 * Source columns and target fields: Database Schema and Data Model.md, "Volume of Practice (e-Logbook) -- RECONCILED".
 *
 * PRODUCTION CONFIRMATIONS (settled 2026-10-26 against production SQL export):
 *   A1  approved_status confirmed strictly NULL, 'A', 'R'. Out of 307,721 rows:
 *       Approved ('A'): 299,289 (97.3%), Pending (NULL): 7,097 (2.3%), Rejected ('R'): 1,335 (0.4%).
 *   A2  specialty_module_claimed is a closed 21-value dropdown (SPECIALTY_MODULE_EXACT).
 *   A3  2-year window violations are negligible: only 7 approved cases across all 307,721 records (0.002%)
 *       were approved >2 years before entry date. Missing start dates: only 2 cases.
 *       grandfatherApproved: true preserves 100% parity with zero material distortion.
 */

export type VerificationStatus = "pending" | "under_review" | "revision_requested" | "approved" | "rejected";

export interface LegacyPatient2Row {
  pid: number; tid: string;
  approved_status?: string | null; approved_by?: string | null; approved_date?: string | null; approved_notes?: string | null;
  date_entry?: string | null; cluster?: string | null; year_training?: string | null; level_training?: string | null; hospital?: string | null;
  hkid?: string | null; sex?: string | null; date_birth?: string | null; age?: string | number | null; asa?: string | number | null;
  start_date?: string | null; length_hours?: string | number | null; surg_dx?: string | null; op1?: string | null;
  module_claimed?: string | null; specialty_module_claimed?: string | null; procedure_claimed?: string | null;
  general_anaesthesia_and_sedation?: string | number | null; regional_anaesthesia?: string | number | null;
  airway_management?: string | number | null; acute_pain_management?: string | number | null;
  mode_anaesthesia?: string | null; level_supervision?: string | number | null;
  block1?: string | null; block2?: string | null; block3?: string | null; block4?: string | null; block5?: string | null; block6?: string | null;
  pain_session_am?: string | null; pain_session_pm?: string | null; remark?: string | null;
}

export type QuarantineReason =
  | "orphan_trainee" | "no_case_date" | "unmapped_classification" | "unmapped_hospital"
  | "unmapped_technique" | "bad_supervision" | "unknown_status" | "bad_asa";

export interface VopCase {
  case_ref: string;                 // synthetic, replaces patient identity
  trainee_id: string;
  hospital_code: string | null;
  case_date: string; logged_date: string | null; duration_hours: number | null;
  patient_age: number | null; asa_class: number | null;
  surgical_diagnosis: string | null; primary_operation: string | null;
  anaesthetic_technique: string[]; supervision_level: number | null;
  training_stage_at_entry: string | null;
  vop_category: "clinical_fundamentals" | "specialty_module" | null;
  descriptor_code: string | null;   // "2.2", "3.5"
  cf_domain_flags: string[];
  classified_by: "migrated" | "trainee" | "sot_corrected" | "classifier";
  classification_basis: "code" | "alias" | "flags" | null;
  blocks: { sequence: number; text: string }[];
  trainee_notes: string | null;
  verification_status: VerificationStatus;
  verified_by_name: string | null; verified_by_role: "sot" | "assistant_sot" | null;
  verified_at: string | null; verification_notes: string | null;
  is_within_2yr_window: boolean; legacy_window_anomaly: boolean; is_accredited: boolean; needs_classification: boolean;
  legacy_pid: number | null; legacy_tid: string | null; migrated_at: string | null;
  has_pain_session: boolean;        // preserved on the side, Phase 2 (Pain Medicine)
  dedupe_key: string;
}

export interface Quarantined { pid: number; tid: string; reasons: QuarantineReason[]; raw: Record<string, unknown>; }

export interface ImportOptions {
  traineeIdByTid: Record<string, string>;                      // legacy tid -> new trainee_id
  verifierRole?: (name: string) => "sot" | "assistant_sot" | null; // resolve from the users table
  grandfatherApproved?: boolean;                               // A3, default true
  now?: string;                                                // ISO date, injectable for tests
}

/* ------------------------------ normalisers ------------------------------ */

export function parseLegacyDate(s?: string | null): string | null {
  if (!s) return null; const t = String(s).trim(); if (!t || /^0000/.test(t)) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const num = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : null; };
const txt = (v: unknown): string | null => { const t = v === null || v === undefined ? "" : String(v).trim(); return t ? t : null; };
/** CF columns (general_anaesthesia_and_sedation etc.) store the ticked checkbox labels as text, so any non-empty value means the domain was claimed. */
const cfClaimed = (v: unknown) => { const t = String(v ?? "").trim().toLowerCase(); return t !== "" && t !== "0" && t !== "n" && t !== "no" && t !== "false"; };
const flag = (v: unknown) => { const t = String(v ?? "").trim().toLowerCase(); return t === "1" || t === "y" || t === "yes" || t === "true" || t === "x"; };

export function normaliseStatus(raw?: string | null): { status: VerificationStatus; known: boolean } {
  const t = String(raw ?? "").trim().toLowerCase();
  // Confirmed from the legacy source (hkcalog/sot_waiting.php, list.inc.php): NULL = outstanding, 'A' = Checked, 'R' = Rejected.
  // There is no revision-requested or under-review state in legacy data. The other spellings below are defensive only.
  if (t === "a") return { status: "approved", known: true };
  if (t === "r") return { status: "rejected", known: true };
  if (t === "" || t === "0" || /^(pending|submitted|new|waiting)/.test(t)) return { status: "pending", known: true };
  if (t === "1" || /^(approved?|verified|accepted|y)$/.test(t)) return { status: "approved", known: true };
  if (/^(revis|amend|return|resubmit|2$)/.test(t)) return { status: "revision_requested", known: true };
  if (/^(reject|declin|disapprov|3$|n$)/.test(t)) return { status: "rejected", known: true };
  return { status: "pending", known: false };
}

const HOSPITALS: [RegExp, string][] = [
  [/\bpwh\b|prince of wales/i, "PWH"], [/\bndh\b|north district/i, "NDH"], [/\bahnh\b|alice ho/i, "AHNH"],
  [/\bpyneh\b|pamela youde/i, "PYNEH"], [/\bqmh\b|queen mary/i, "QMH"], [/\bqeh\b|queen elizabeth/i, "QEH"],
  [/\bkwh\b|kwong wah/i, "KWH"], [/\buch\b|united christian/i, "UCH"], [/\btkoh\b|tseung kwan o/i, "TKOH"],
  [/\btph\b|tai po/i, "TPH"], [/\bsh\b|shatin|sha tin/i, "SH"]];
export const normaliseHospital = (s?: string | null) => { const t = txt(s); if (!t) return null; const h = HOSPITALS.find(([re]) => re.test(t)); return h ? h[1] : null; };

/** First match wins; order specific before general. Extend from SELECT DISTINCT on the real data (A2). */
export const CLASSIFICATION_ALIASES: [RegExp, string][] = [
  [/obstetric|caesarean|c-?section|labou?r/i, "3.5"], [/paediatric|pediatric|neonat/i, "3.4"],
  [/cardiac|cardiothoracic|bypass|cpb/i, "3.9"], [/neuro/i, "3.6"], [/\bent\b|head and neck|head & neck/i, "3.2"],
  [/orthop|trauma\b/i, "3.3"], [/general surg|urolog|gynae|endoscop/i, "3.1"],
  [/\bsga\b|supraglottic|\bdl\b|laryngoscop|intubat|fibreoptic|airway/i, "2.3"],
  [/spinal|epidural|\bcse\b|plexus|nerve block|regional/i, "2.2"],
  [/\bpca\b|acute pain|analgesi/i, "2.4"],
  [/\btiva\b|\bmac\b|sedation|general anaesth|\bga\b|central venous|arterial/i, "2.1"]];

/** Exact stored values of patient2.specialty_module_claimed (the dropdown in the legacy logbook form) -> SM code. SM-3.12 Pain is Phase 2 (not tracked). */
export const SPECIALTY_MODULE_EXACT: Record<string, string> = {
  "Gen Sur / Uro / Gyn (elective)": "3.1", "Gen Sur / Uro / Gyn (emergency)": "3.1",
  "H&N / ENT (airway procedure)": "3.2", "H&N / ENT (others)": "3.2",
  "Ortho (hip fracture)": "3.3", "Ortho (major joint replacement)": "3.3", "Ortho (C-spine surgery)": "3.3", "Ortho (others)": "3.3",
  "Paed (<= 8)": "3.4", "OBS (CS under GA)": "3.5", "OBS (CS under RA)": "3.5", "OBS (EA for labour pain)": "3.5",
  "NS (interventional neuroradiology)": "3.6", "NS (others)": "3.6", "Eye": "3.7", "Remote anaes": "3.8",
  "Cardiac (with CPB)": "3.9", "Cardiac (interventional cardi)": "3.9", "Thoracic": "3.10", "Vascular": "3.11", "Pain": "3.12"};

export function normaliseClassification(r: LegacyPatient2Row) {
  const flags = ([["2.1", r.general_anaesthesia_and_sedation], ["2.2", r.regional_anaesthesia], ["2.3", r.airway_management], ["2.4", r.acute_pain_management]] as [string, unknown][])
    .filter(([, v]) => cfClaimed(v)).map(([k]) => k);
  const claim = [r.procedure_claimed, r.specialty_module_claimed, r.module_claimed].map(txt).filter(Boolean) as string[];
  const direct = claim.map(c => c.match(/(?:^|\D)(2\.[1-4]|3\.(?:[1-9]|1[0-3]))(?:\D|$)/)).find(Boolean);
  let code: string | null = null, basis: "code" | "alias" | "flags" | null = null;
  const exact = r.specialty_module_claimed ? SPECIALTY_MODULE_EXACT[String(r.specialty_module_claimed).trim()] : undefined;
  if (direct) { code = direct[1]; basis = "code"; }
  else if (exact) { code = exact; basis = "alias"; }
  else { for (const c of claim) { const a = CLASSIFICATION_ALIASES.find(([re]) => re.test(c)); if (a) { code = a[1]; basis = "alias"; break; } } }
  if (!code && flags.length === 1) { code = flags[0]; basis = "flags"; }
  const category = code ? (code.startsWith("2.") ? "clinical_fundamentals" as const : "specialty_module" as const) : null;
  return { code, basis, category, flags };
}

export const TECHNIQUE_ALIASES: [RegExp, string][] = [
  [/\bcse\b|combined spinal/i, "CSE"], [/spinal|\bsab\b/i, "Spinal"], [/epidural/i, "Epidural"],
  [/\bga\b|general/i, "GA"], [/\bmac\b|sedation/i, "Sedation/MAC"], [/regional|plexus|nerve block/i, "Regional"], [/local/i, "Local"]];
export function normaliseTechnique(s?: string | null) {
  const t = txt(s); if (!t) return { values: [] as string[], unmapped: [] as string[] };
  const values = new Set<string>(), unmapped: string[] = [];
  for (const part of t.split(/[,;/+&]|\band\b/i).map(p => p.trim()).filter(Boolean)) {
    const a = TECHNIQUE_ALIASES.find(([re]) => re.test(part)); if (a) values.add(a[1]); else unmapped.push(part);
  }
  return { values: [...values], unmapped };
}

const fnv = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, "0"); };
const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const dedupeKey = (c: { trainee_id: string; case_date: string; hospital_code: string | null; asa_class: number | null; patient_age: number | null; primary_operation: string | null }) =>
  fnv([c.trainee_id, c.case_date, c.hospital_code, c.asa_class, c.patient_age, norm(c.primary_operation)].join("|"));
const addYears = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); };

/* --------------------------------- import --------------------------------- */

export function importLegacyRow(r: LegacyPatient2Row, o: ImportOptions): { ok: VopCase | null; quarantine: Quarantined | null; warnings: QuarantineReason[] } {
  const reasons: QuarantineReason[] = [], warn: QuarantineReason[] = [];
  const traineeIdMaybe = o.traineeIdByTid[r.tid]; if (!traineeIdMaybe) reasons.push("orphan_trainee");
  const caseDateMaybe = parseLegacyDate(r.start_date) ?? parseLegacyDate(r.date_entry); if (!caseDateMaybe) reasons.push("no_case_date");
  if (!traineeIdMaybe || !caseDateMaybe) return { ok: null, quarantine: { pid: r.pid, tid: r.tid, reasons, raw: { ...r, hkid: undefined, date_birth: undefined, sex: undefined } }, warnings: [] };
  const traineeId: string = traineeIdMaybe, caseDate: string = caseDateMaybe;

  const st = normaliseStatus(r.approved_status); if (!st.known) warn.push("unknown_status");
  const cls = normaliseClassification(r); if (!cls.code) warn.push("unmapped_classification");
  const hosp = normaliseHospital(r.hospital); if (!hosp) warn.push("unmapped_hospital");
  const tech = normaliseTechnique(r.mode_anaesthesia); if (tech.unmapped.length) warn.push("unmapped_technique");
  const sup = num(r.level_supervision); const supOk = sup !== null && Number.isInteger(sup) && sup >= 1 && sup <= 4; if (!supOk) warn.push("bad_supervision");
  const asa = num(r.asa); const asaOk = asa !== null && Number.isInteger(asa) && asa >= 1 && asa <= 6; if (r.asa != null && String(r.asa).trim() !== "" && !asaOk) warn.push("bad_asa");
  const logged = parseLegacyDate(r.date_entry);
  const within = logged ? logged <= addYears(caseDate, 2) : true;
  const grand = o.grandfatherApproved !== false;
  const blocks = [r.block1, r.block2, r.block3, r.block4, r.block5, r.block6].map(txt).map((t, i) => t ? { sequence: i + 1, text: t } : null).filter(Boolean) as { sequence: number; text: string }[];
  const approver = txt(r.approved_by);
  const base = { trainee_id: traineeId, case_date: caseDate, hospital_code: hosp, asa_class: asaOk ? asa : null, patient_age: num(r.age), primary_operation: txt(r.op1) };
  const c: VopCase = {
    case_ref: "VOP-" + fnv(`${r.tid}#${r.pid}`).toUpperCase(),
    ...base, logged_date: logged, duration_hours: num(r.length_hours),
    surgical_diagnosis: txt(r.surg_dx), anaesthetic_technique: tech.values, supervision_level: supOk ? sup : null,
    training_stage_at_entry: txt(r.level_training), // denormalised snapshot, kept as entered
    vop_category: cls.category, descriptor_code: cls.code, cf_domain_flags: cls.flags, classified_by: "migrated", classification_basis: cls.basis,
    blocks, trainee_notes: txt(r.remark),
    verification_status: st.status, verified_by_name: approver, verified_by_role: approver && o.verifierRole ? o.verifierRole(approver) : null,
    verified_at: parseLegacyDate(r.approved_date), verification_notes: txt(r.approved_notes),
    is_within_2yr_window: within, legacy_window_anomaly: !within, is_accredited: within || (st.status === "approved" && grand),
    needs_classification: !cls.code,
    legacy_pid: r.pid, legacy_tid: r.tid, migrated_at: o.now ?? new Date().toISOString().slice(0, 10),
    has_pain_session: !!(txt(r.pain_session_am) || txt(r.pain_session_pm)),
    dedupe_key: dedupeKey(base)
  };
  return { ok: c, quarantine: null, warnings: warn };
}

export interface ImportReport {
  rowsIn: number; imported: number; quarantined: number; needsClassification: number; notAccredited: number;
  windowAnomalies: number; byStatus: Record<string, number>; warnings: Record<string, number>; balanced: boolean;
}

export function importLegacy(rows: LegacyPatient2Row[], o: ImportOptions) {
  const cases: VopCase[] = [], quarantine: Quarantined[] = [], warnings: Record<string, number> = {};
  for (const r of rows) {
    const x = importLegacyRow(r, o);
    x.warnings.forEach(w => { warnings[w] = (warnings[w] ?? 0) + 1; });
    if (x.ok) cases.push(x.ok); else if (x.quarantine) quarantine.push(x.quarantine);
  }
  const byStatus: Record<string, number> = {}; cases.forEach(c => { byStatus[c.verification_status] = (byStatus[c.verification_status] ?? 0) + 1; });
  const report: ImportReport = {
    rowsIn: rows.length, imported: cases.length, quarantined: quarantine.length,
    needsClassification: cases.filter(c => c.needs_classification).length, notAccredited: cases.filter(c => !c.is_accredited).length, windowAnomalies: cases.filter(c => c.legacy_window_anomaly).length,
    byStatus, warnings, balanced: rows.length === cases.length + quarantine.length
  };
  return { cases, quarantine, report };
}

/* ---------------------------------- merge ---------------------------------- */

/**
 * Merge imported legacy cases into the live ledger.
 *  - Idempotent: a (legacy_tid, legacy_pid) already present is skipped, so the job can be re-run for the delta before cutover.
 *  - Never deletes or overwrites a live case. A legacy case that looks like a live one (same dedupe_key) is still imported,
 *    and the pair is reported for a human to review (a trainee may have re-entered it by hand).
 */
export function mergeIntoLedger(existing: VopCase[], incoming: VopCase[]) {
  const seenLegacy = new Set(existing.filter(c => c.legacy_pid !== null).map(c => `${c.legacy_tid}#${c.legacy_pid}`));
  const liveByKey = new Map<string, VopCase[]>(); existing.forEach(c => { const a = liveByKey.get(c.dedupe_key) ?? []; a.push(c); liveByKey.set(c.dedupe_key, a); });
  const added: VopCase[] = [], skipped: VopCase[] = [], possibleDuplicates: { legacy: string; live: string }[] = [];
  for (const c of incoming) {
    if (seenLegacy.has(`${c.legacy_tid}#${c.legacy_pid}`)) { skipped.push(c); continue; }
    (liveByKey.get(c.dedupe_key) ?? []).filter(l => l.legacy_pid === null).forEach(l => possibleDuplicates.push({ legacy: c.case_ref, live: l.case_ref }));
    added.push(c); seenLegacy.add(`${c.legacy_tid}#${c.legacy_pid}`);
  }
  return { ledger: existing.concat(added), added: added.length, skipped: skipped.length, possibleDuplicates };
}
