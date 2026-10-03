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
| `atp_icu_tutorial*`, `atp_course`, `atp_exam`, `atp_reg*` | Phase 2 placeholders | **Preserve** — not in MVP scope |
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
Any ITA begun but not signed off at cutover must migrate in its **actual workflow state**
(`pending_trainer_feedback` / `sot_assessment` / `trainee_review`), not as complete. Trainer
invitations in `atp_ita_assessor` map to `ita_assessors` with their response state.

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
Confirmed: `approved_status` **includes revision states**, and `approved_by` may be either an SOT or an
Assistant SOT. Target model must therefore support:
- `verification_status`: `pending` | `under_review` | `revision_requested` | `approved` | `rejected`
- `verified_by` + `verified_by_role` (`sot` | `assistant_sot`)
- Full transition history, not just current state

### 6.7 2-year retrospective rule
Confirmed: **enforced in the legacy application.** Migration must therefore trust the existing
`date_entry` / `start_date` relationship rather than recomputing it, and flag any rows where
`date_entry > start_date + 2 years` as a legacy anomaly rather than silently accepting or rejecting them.

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
