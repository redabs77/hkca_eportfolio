---
type: reference
project: "[[HKCA Portfolio Revamp]]"
created: 2026-09-30
status: planning
---

# Legacy Data Migration & Rollover Plan

**Purpose:** The new system must go live while trainees are **mid-training**. A trainee partway through
HAT cannot restart their record. Therefore the new system must carry **complete historical training
records** from day one, and be provably correct before anyone relies on it.

**Confirmed requirement (Dr. Albert Chan, 2026-09-30):** historical data must be importable into the
new system at rollover — not archived separately, not re-entered manually.

---

## 1. Core Principle

> The new system must be **indistinguishable from a continuously-running record** on the day it opens.

A HAT-2 trainee who has logged 608 cases, completed 7 ITAs and holds 42 accredited months must see all
of that on first login. Anything less means the College cannot cut over until the entire current cohort
finishes training — a 6-year delay, which is not viable.

**Corollary:** migration is not a one-off export. It is a **product feature**, with its own tests,
verification reports and rollback path.

---

## 2. Scope: What Must Migrate

| Legacy source | Target | Why it must carry over |
|---|---|---|
| `user` (trainee rows + profile) | `users`, `trainee_profiles` | Identity, HKCA number, training dates, stage |
| `atp_training_experience` (~5,893) | `rotations` | **Drives accredited months** — the progression gate |
| `atp_portfolio` (123 cols) | `trainee_profiles`, `mandatory_courses`, `exam_results`, `formal_projects`, `pfy_plans` | Courses, exams, project, exit data |
| `atp_cex` (~11,264) | `wbas` | WBA counts feeding the CF / Specialty gates |
| `atp_msf` + `atp_msfs` | `msf_responses`, `msf_sessions` | MSF completion (1 → 2 → 3) |
| `atp_in_training_assessment` (~5,187) | `itas`, `ita_domain_ratings` | ITA history + remediation trail |
| `atp_mita` + `atp_ita1` + `atp_ita_assessor` | `itas`, `ita_assessor_responses`, `ita_assessors` | Assessor-collated ITA system |
| `atp_echo` (~1,350) | `echo_assessments` (Phase 2) | **Preserve** — not in MVP scope |
| `patient2` (38 cols) | `volume_of_practice`, `case_blocks` | **VOP counts** — the biggest gate |
| `atp_icu_tutorial*` | Phase 2 placeholders | **Preserve** — not in MVP scope |
| `atp_course`, `atp_exam`, `atp_reg`, `atp_reg_exam` | `course_catalogue`, `course_rounds`, `course_requests`, `exam_sittings`, `exam_results` | **MVP since 2026-10-25** (was Phase 2). Results become `exam_results`; open registrations are NOT imported (see 6.9 item 15); raw tables preserved |
| `atp_assessor` | `external_assessors` | MSF rater directory |
| `cluster` | `hospitals` | Seed data |
| `hkca_log` (1.94M) | `audit_log` (windowed) | Last 24 months only; archive the rest |

### Not migrating
- `user.password` — see §6.3
- `user.hkid`, `user.hkid1` — see §6.4
- `patient2.hkid`, `date_birth`, `sex` — see §6.5
- `hkca_log` rows older than the retained window

---

## 3. Migration Strategy: Four Phases

### Phase 1 — Extract & Profile (read-only, no risk)
- Pull all source tables into an isolated staging schema
- **Profile every table:** row counts, null rates, distinct-value counts on every free-text field
- Produce the **classification vocabulary report** (see §4) — this is the critical output
- **Referential sweep:** every `tid`, `pid`, `aid`, `fsid`, `mita_id`, `course_id` checked for orphans

**Gate to proceed:** orphan report reviewed and College has resolved the two-ITA-system question.

### Phase 2 — Transform & Normalise
- Build the **legacy → target mapping** (column-level, already drafted in
  [[Database Schema and Data Model]])
- Normalise free-text classification into `curriculum_descriptors` FKs
- Parse the 18 `varchar` dates; quarantine unparseable values
- Split `atp_portfolio` into its five target entities
- Normalise `block1..block6` → `case_blocks`; `tutorial_admin1..38` → `icu_tutorial_attendance`
- Stamp **provenance** on every row: `legacy_table`, `legacy_pk`, `migrated_at`

**Gate to proceed:** quarantine sets reviewed; no unrecoverable data loss.

### Phase 3 — Dry Run & Verification (repeatable)
Load into a **full copy** of the new database and run the parity suite (§5). Iterate until clean.
This phase can run as many times as needed — it has no production impact.

### Phase 4 — Cutover
1. **Freeze** legacy writes (announce a freeze window, e.g. 48 hours)
2. Extract the delta since the freeze point
3. Load into production
4. Run the parity suite against production
5. **College sign-off** on the parity report
6. Open the new system; legacy becomes read-only

---

## 4. The Classification Problem (largest risk)

Free-text fields with no controlled vocabulary:

| Source | Field |
|---|---|
| `patient2` | `module_claimed`, `specialty_module_claimed`, `procedure_claimed`, `mode_anaesthesia` |
| `patient2` | `level_training`, `level_supervision` |
| `atp_cex` | `form_type`, `clinical_or_specialty`, `level_training` |
| `atp_in_training_assessment` | `rotation_type`, `level_training` |
| `atp_training_experience` | `rotation_type`, `level_training`, `training_post_occupied` |
| `user` | `level_of_training`, `trainee_type`, `sot_type` |

**Method:**
1. Extract and count distinct values per field
2. Cluster near-duplicates (typos, abbreviations, casing)
3. Propose a mapping to curriculum descriptors
4. **Send the mapping table to the College for sign-off** — the College must confirm each historical
   entry is credited to the right curriculum line before trainees see it
5. Anything unmappable → quarantine, reported by trainee

**Why College sign-off matters:** a trainee's progression eligibility may change if a historical case
is re-classified. This is not a technical decision.

---

## 5. Verification: The Parity Suite

The migration is only complete when it can be **proved**. For every trainee, compare legacy-computed
against new-system-computed values:

| Check | Legacy source | Must match |
|---|---|---|
| Total accredited months | `sum(atp_training_experience.anaesthesia + intensive_care + elective)` | `trainee_profiles.total_accredited_months` |
| Clinical Anaesthesia months | `sum(atp_training_experience.anaesthesia)` | `clinical_anaesthesia_months` |
| ICU months | `sum(atp_training_experience.intensive_care)` | `icu_months` |
| Clinical Fundamentals WBA count | `count(atp_cex where category = CF)` | `count(wbas where category = CF)` |
| Specialty WBA count | `count(atp_cex where category = specialty)` | `count(wbas where category = specialty)` |
| VOP cases | `count(patient2)` per trainee | `count(volume_of_practice)` |
| VOP by descriptor | `group by module_claimed` | `group by descriptor_code` |
| MSF completions | `count(atp_msfs where complete)` | `count(msf_sessions)` |
| ITA count + outcomes | `atp_in_training_assessment` | `itas` |
| Current stage | `user.level_of_training` | `trainee_profiles.current_stage` |

**Output:** a per-trainee diff report. Any trainee with a mismatch is listed with the specific field and
both values. **The College signs off on this report**, not on a summary count.

**Recommendation:** run the parity suite as an **automated test in CI**, so it can be re-run on demand
(after any mapping change) rather than only once.

---

## 6. Special Handling

### 6.1 Trainees currently mid-rotation
A trainee partway through a 6-month rotation at cutover has an **open rotation** with no completion
evidence yet. Migration must create the rotation as `in_progress` so the ITA can be completed in the
new system and the credit applied automatically. Do not create it as a completed historical record.

### 6.2 In-flight ITAs
Any ITA begun but not signed off at cutover must migrate in its **actual workflow state**, not as complete. Trainer
invitations in `atp_ita_assessor` map to `ita_assessors` with their response state. Legacy has no status column (see 6.9, item 3): the state is derived from flags, and legacy has no trainee sign-off step, so a legacy ITA never maps to `awaiting signature`.

### 6.3 Passwords
Legacy passwords are in `user.password`. Whether hashed or not, **do not migrate them.** Instead:
- Generate a one-time activation link per user, distributed out-of-band
- Or force a password reset on first login
- **Confirm the legacy hashing scheme with the College** — if plaintext or weak, that is a separate
  security finding to raise.

### 6.4 Staff HKID (`user.hkid`, `user.hkid1` — `blob`)
Presumably encrypted. Confirm the encryption scheme before assuming the ciphertext is portable. If it
cannot be decrypted for re-encryption, the practical options are: carry the ciphertext forward if the
scheme is preserved, or drop it and re-collect. **College decision required.**

### 6.5 ⚠️ Patient identity — HN number does not exist in the source

**Finding (2026-09-30):** Dr. Chan's answer on Q3 clarified the intent — patient identity *should* be
the **HN (hospital number)**, not the HKID. However:

> **`patient2` has no HN column.** Its only identity fields are `pid` (int), `tid` (trainee) and
> `hkid` (`varchar(15)`, plaintext).

There is no hospital-number field anywhere in the logbook table. So the intended substitution
(HKID → HN) **cannot be performed during migration**, because the HN is not in the source data.

**Options:**
| Option | Consequence |
|---|---|
| **Drop patient identity entirely** | Cleanest. VOP requirements are satisfied by case type and count, not patient identity. Retain `age` and `asa` as clinical context. |
| **Derive a surrogate** | Assign a per-case synthetic identifier so duplicate-case detection remains possible. No privacy exposure. |
| **Source the HN elsewhere** | Would require an HA system join not currently available, and adds identifiability — not recommended for a training portfolio. |

**Recommendation:** drop patient identity; retain a per-case synthetic `case_ref` for duplicate
detection. This already goes beyond what the curriculum requires.

**Separately:** `patient2.hkid` being plaintext while `user.hkid` is `blob` is a **privacy exposure
that predates this project**. Flag it to the College regardless of migration decisions.

### 6.6 Approval states
**Corrected 2026-10-24 from the legacy source code** (`hkcalog/sot_waiting.php`, `list.inc.php`): legacy `approved_status` holds only **NULL (outstanding), `A` (Checked) or `R` (Rejected)**. There was never a revision-requested or under-review state. A rejected case is not locked, so `R` was likely used as "returned for revision" (inference from the code); the importer maps it to `rejected`, and the trainee can edit it and resubmit. A verifier could also *de-approve* a case (reset to NULL, clearing approver, date and notes) with no history kept. `approved_by` stores the approver's user `tid`, and any SOT or admin type could approve (types seen in code: `hospital_sot`, `cluster_sot`, `hospital_sot_pain`, `hospital_sot_icu`, `hospital_sot_assist`, `hospital`, `none`). The earlier note that legacy "includes revision states" was an assumption and was wrong. The target model still supports the richer states for new entries:
- `verification_status`: `pending` | `under_review` | `revision_requested` | `approved` | `rejected` (the trainee logbook shows `pending` and `under_review` together as "Waiting for verifier"; legacy rows never map to `under_review`)
- `verified_by` + `verified_by_role` (`sot` | `assistant_sot`)
- Full transition history, not just current state

### 6.7 2-year retrospective rule
Confirmed: **enforced in the legacy application.** Migration must therefore trust the existing
`date_entry` / `start_date` relationship rather than recomputing it, and flag any rows where
`date_entry > start_date + 2 years` as a legacy anomaly rather than silently accepting or rejecting them.

### 6.7b Formal project mapping (`atp_portfolio.formal_project_*`)

Legacy holds five flat columns: `formal_project_title`, `formal_project_project_number`, `formal_project_date_of_approval`, `formal_project_verified_by_admin` (plus a code). They map to `formal_projects.title`, `project_number`, `final_approval_date` and the admin verification. **No submission history exists in the legacy system.** `formal_project_date_of_approval` is the **final manuscript approval** (confirmed by Dr. Chan, 2026-10-23). Each migrated project therefore gets one `formal_project_events` row, `source = 'legacy_backfill'`: `manuscript_approved` dated that value, and `final_approval_date` is set to the same date. A manuscript approval implies the protocol was approved earlier, so the stage path shows all four stages complete, with dates only for the final one; the earlier submissions and revisions show as absent, and the trainee-facing page says so. A project with a title and number but no approval date is imported as in progress with no events. A missing or duplicate project number goes to the quarantine list for College Admin.

### 6.8 Legacy logbook import and merge procedure (`patient2` -> `volume_of_practice`)

Implemented as pure functions in `domain/vop/legacyImport.ts` and covered by `tests/domain/run_vop_import_tests.ts` (run with `npm run test:domain`). The ETL job reads rows, calls `importLegacy`, writes the result, then calls `mergeIntoLedger`.

**Can the legacy data be brought in and merged? Yes, with the conditions below, which the College must confirm from the real data.** The mechanics are built and tested on representative messy rows. Vocabularies were checked against the legacy PHP source on 2026-10-24 (it supplies the allowed values, not the row counts, so the real-data checks are still pending):

| # | Assumption | How to settle it |
|---|---|---|
| A1 | **Settled from the legacy code (2026-10-24):** `approved_status` is NULL / `A` / `R` only (see 6.6). The importer maps `A` to approved, `R` to rejected, NULL to pending; anything else imports as pending and is counted. Real data only needs to confirm no other values exist. | `SELECT approved_status, COUNT(*) FROM patient2 GROUP BY 1;` (in the College request of 2026-10-24) |
| A2 | **Narrowed (2026-10-24):** `specialty_module_claimed` is a closed 21-value dropdown and maps exactly to SM-3.1 to 3.12 (`SPECIALTY_MODULE_EXACT`). The four Clinical Fundamentals columns store the ticked checkbox labels as text, so any non-empty value claims that CF domain. What remains uncertain is rows entered under the older module list (`module_claimed`: "O&T", "Obs Anae", "Gen Sur/Urology/Gyn", ...), which have no exact SM code and import as `needs_classification` unless the College supplies a mapping. | `SELECT DISTINCT module_claimed, specialty_module_claimed, procedure_claimed, mode_anaesthesia FROM patient2;` then extend `CLASSIFICATION_ALIASES` and `TECHNIQUE_ALIASES` until the unmatched share is acceptable to the College. |
| A3 | Legacy-approved cases outside the 2-year window keep their credit (default) or not (`grandfatherApproved: false`). Decision for Dr. Chan and the Board. | Count them from the anomaly report. |

**Steps**
1. **Trainee map.** Build `legacy tid -> trainee_id` from the migrated `trainee_profiles`. Scope is the active cohort (PRD §7). A row whose `tid` is not in the map is quarantined as `orphan_trainee`.
2. **Row transform.** Dates parsed from ISO or `DD/MM/YYYY` (MySQL zero dates become null; a row with no usable case date is quarantined as `no_case_date`). Hospital normalised to a code; technique split into a controlled list; `block1..6` into ordered blocks; `level_training` kept as the entry-time snapshot; pain-session flags kept aside (Phase 2).
3. **Patient identity.** `hkid`, `date_birth` and `sex` are never copied, not even into the quarantine record. `age` and `asa` are kept. The new `case_ref` is `VOP-` plus a hash of `tid#pid`.
4. **Approval.** Status, approver name, approval date and notes are preserved. `verified_by_role` is resolved from the users table by name where possible and left null otherwise. One synthetic `vop_verification_events` row is written per imported row.
5. **Classification.** Order of evidence: an explicit code in the text (`2.2`), then the alias table (specific before general, so "caesarean under spinal" is 3.5, not 2.2), then a single CF flag as a last resort. Anything else sets `needs_classification`. Those cases are shown to the trainee, count toward nothing, and return to `pending` once the trainee classifies them.
6. **2-year rule.** The legacy application enforced it (§6.7), so rows outside the window are anomalies. They are flagged `legacy_window_anomaly` and reported, and their credit follows A3. They are never dropped silently.
7. **Merge.** Idempotent on `(legacy_tid, legacy_pid)`: re-running adds nothing, so the job can be repeated for the delta up to cutover. Nothing live is overwritten or deleted. If a legacy case has the same `dedupe_key` as a hand-entered live case, both are kept and the pair is listed for review.
8. **Reconciliation gate.** The report must balance (`rows in = imported + quarantined`), and per-trainee counts of approved cases by descriptor must equal legacy before cutover (PRD §7 parity suite). Quarantined and `needs_classification` counts go to the College before cutover.

**What the trainee sees after import:** their legacy cases appear in the new logbook tagged "Imported", with approvals, verifier notes and dates unchanged, a one-line notice with the import date, and a "Classify" list for the rows that need it.

---

### 6.9 Findings from the legacy source code (2026-10-24)

Source: the College's legacy PHP package (`hkca eps/`, `hkcalog/`). It contains code and structure files only, **no row data**. Detail and evidence: Obsidian `Legacy Source Code Findings 2026-10-24`.

1. **Course slots.** `atp_portfolio` has dedicated columns for EASE (`training_course_ease*`) and EMAC (`training_course_emac*`). All other courses sit in numbered slots whose names exist only as labels in `portfolio.php`: `other1` ADAM-A, `other2` FTTE course (Echo-A workshop), `other3` UGRA, `other10` FTTE online tutorials and case reviews, `other11` BASIC, `other12` ACLS, `other13` Trauma, `other14` Advanced Airway, `other15` Echocardiography. Slots 4 to 9 have no label (confirmation requested from the College). Proposed import rule: EASE, EMAC, ADAM-A, ECHO-A (from `other2`) and UGRA become `mandatory_courses` rows with the codes in the schema; the remaining labelled slots are kept as non-mandatory course records, not counted toward exit requirements. Proposed, for College confirmation: `other10` (online tutorials) is kept as its own record and is not treated as the Echo-A workshop.
2. **ITA items.** Fifteen graded items: `assessment_1a..1g`, `2a..2g`, `3a`. Column `3b` exists but no form, summary or print page uses it; ignore it on import and report if it holds data. Grades are 1 to 4 and X (4 = unsatisfactory).
3. **ITA state is derived, not stored.** There is no status column. `atp_mita.mita_complete = 'Yes'` marks assessor responses complete; invitation fields `sent`, `resent`, `send_at_midnight` (`Yes` / `Fail`) on `atp_ita_assessor` show invitation progress; a row in `atp_ita` (with `fill_in_by_trainer = 'Yes'`) is the SOT assessment. Proposed mapping for in-flight ITAs: no `mita_complete` and no SOT row = waiting for trainers; SOT row present = SOT assessment done. Legacy has no trainee counter-signature, so none maps to awaiting signature or signed off in the new sense; completed legacy ITAs import as historical records.
4. **Reminders.** Legacy sent one automatic reminder after 7 days (`cron1.php` for ITA assessors; `cron_cex.php` for WBA requests sent after 2024-04-25). The new design uses manual SOT reminders; this is a deliberate change.
5. **WBA rows (`atp_cex`).** Form types CEX, CbD, DOPS, ALMAT (ITA and Logbook rows exist in other tables). Lifecycle flags: `fill_in_by_trainer`, `verified_by_trainee`, `admin_unverified`; `flag = 'y'` means "encouraged to repeat". Legacy WBAs cannot be linked to iWBA records; import read-only as history if the College wants them, otherwise leave them in the archive.
6. **Exam applications.** `atp_reg_exam.application_status` is Processing, Success, Fail, Withdraw or Cancel. Only Success and Fail become `exam_results`; the others are applications, not results, and are not imported as results. Exams: Intermediate, Final (Anaesthesiology), Final (Intensive Care).
7. **Rotations** (`atp_training_experience`): types Anaes, Pain, ICU, Others; two-step verification (`verified_by_sot`, then `verified_by_hkca_admin`). Import the SOT and admin verification as separate flags.
8. **ICU** is a parallel track in the legacy data (ICU trainee type, ICU final exam, ICU tutorial attendance, ICU commencement dates). Scope for the first release is to be confirmed by the College.
9. **`hkca_log`** (about 1.9 million page-view rows with IP addresses) is not migrated; archive outside the new system.
10. **Cluster codes.** The `cluster` table uses HKE, HKW, KCC, KEC, KWC, NTE, NTW, OTHER; the logbook form dropdown uses KC, KE, KW. Map both spellings. One hospital value, `DCA, QMH`, contains a comma and must be handled as a single token, not split.
11. **Passwords and identity.** EPS logins use `crypt(hkid, key)`, so passwords are derived from the HKID; this confirms 6.3 (do not migrate passwords; force reset on first sign-in). Staff and patient HKIDs are encrypted or stored in the legacy database and are not carried across (6.4, 6.5).
12. **Locking.** The legacy "already approved" lock tests for `Y` while approval writes `A`, so approved logbook cases may still have been editable after approval. Not proven without data; the import preserves approval fields as recorded and the reconciliation report should compare counts, not assume immutability.
13. **Code and database versions.** The code refers to tables `atp_study` and `cair_login_log` that are not in the 30 September structure file, and `readme14_all_table.txt` is an older structure snapshot. Treat the 30 September file as the live structure and ask the College to confirm.

14. **Trainee status is not trusted.** The only legacy status field is `user.active` (a single character; the code treats `'Y'` as active and hides everything else). There is no leave, suspended or completed value, and the College's own view (Dr. Chan, 2026-10-24) is that the flag is poorly kept. Import therefore writes a provisional status event per trainee: Y becomes `active`, anything else `deactivated` with the reason "from legacy, reason unknown", always `is_confirmed = false`. The Secretariat resolves them in the Admin console "Status to confirm" list (real status, reason, effective date), oldest and most suspicious first: active but no assessment, rotation or logbook activity for 18 months; Fellow-level and still active; inactive with recent activity. Confirmation appends an event; the provisional row is kept. Report counts at cutover: confirmed, still provisional. Inputs wanted from the College: the `active` by `level_of_training` counts (already in the data request) and last-activity years (follow-up request), plus any list the Secretariat keeps of trainees who left, finished or took leave (names stay with the College).

15. **Course registration and exam applications are in the first release (decided 2026-10-25).** Rules for cutover: (a) legacy `atp_reg_exam` Success and Fail rows become `exam_results` (item 6); (b) **open registrations are not imported**: a round or sitting still open at cutover is re-opened by the Secretariat in the new system and the applicants re-apply, so no legacy `Processing` row is carried over; (c) completed courses are already covered by the course slots (item 1); (d) **carry-forward needs College data**: a trainee who passed one Intermediate subject or the Final written section before cutover and still has sittings left cannot be derived from `atp_reg_exam` alone. Ask the College whether it keeps per-subject and per-section results; until it answers, such trainees are entered by the Secretariat as `exam_section_passes` rows at cutover. Registration fee and training fee status and Intermediate exemptions have no legacy source in the code reviewed and start empty; the Secretariat records them by hand. Formal projects: legacy holds only title, number and one approval date (no review grades), so changing the outcome scale from four grades to three needs no data conversion.

---

## 7. Rollback & Parallel Running

- **Legacy stays read-only, not deleted**, for at least one full rotation cycle (6 months) after cutover
- If a parity failure is found after cutover, the new system can be pointed back before the College
  becomes dependent on it
- **Recommended:** run the new system in **parallel** with legacy for one 3- or 6-month rotation block
  at 1–2 pilot centres (already in the roadmap) — this is the cheapest way to catch migration errors
  before College-wide cutover

---

## 8. Data Residency & Privacy (for the real migration)

Real patient and trainee data must **not** be handled the way the mock-data pilot is. Before production:
- Where does the data physically reside? (HK vs cloud region)
- Does the HKCA/HA have an IT policy that constrains this?
- Who is the data controller, and what is the lawful basis under the PDPO?
- Is the audit log tamper-evident?

See the deployment advice in the reply — pilot and production must not share infrastructure naively.

---

## 9. Migration Workstream Summary

| # | Task | Owner | Depends on |
|---|---|---|---|
| 1 | Extract all source tables to staging | Eng | — |
| 2 | Profile + distinct-value report | Eng | 1 |
| 3 | Referential integrity / orphan report | Eng | 1 |
| 4 | College decision: which ITA system is authoritative | **College** | 3 |
| 5 | Classification mapping table | Eng | 2 |
| 6 | **College sign-off on classification mapping** | **College** | 5 |
| 7 | Confirm legacy password scheme | **College** | — |
| 8 | Confirm HKID `blob` encryption scheme | **College** | — |
| 9 | Build transform + provenance | Eng | 5, 6 |
| 10 | Build parity suite | Eng | 9 |
| 11 | Dry run + iterate | Eng | 10 |
| 12 | Freeze → delta → load | Eng | 11 |
| 13 | **College sign-off on parity report** | **College** | 12 |
| 14 | Cutover + parallel run | Both | 13 |

---

## Related Documents

- [[Legacy EPS Schema Audit]]
- [[Database Schema and Data Model]]
- [[System Architecture and Roadmap]]
- [[New Workflow Changes - Curriculum Updates Required]]
