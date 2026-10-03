---
type: reference
project: "[[HKCA Portfolio Revamp]]"
created: 2026-09-30
source: "eps_sql_table_only.sql (MariaDB 10.11.14 dump, 2026-09-30)"
---

# Legacy EPS Schema Audit

**Source file:** `eps_sql_table_only.sql` — MariaDB dump, structure only, 21 tables, 562 columns.
**Database:** `eps` @ MariaDB 10.11.14

---

## 1. Headline Findings

| # | Finding | Impact |
|---|---------|--------|
| 1 | **Zero foreign keys, zero indexes, zero constraints** across all 21 tables | Referential integrity is entirely in application code. Highest-severity issue. |
| 2 | **`atp_portfolio` is a 123-column kitchen sink** with repeating groups (15× `training_course_other_N`, 38× `tutorial_admin_N`) | This is our "trainee profile" table. Needs full normalisation. |
| 3 | **Two parallel ITA systems coexist** | Migration must decide which is authoritative, or merge. |
| 4 | **No Volume of Practice / logbook table exists** | VOP is either in a separate system or missing. Blocking question — see §5. |
| 5 | **All WBA types live in one table (`atp_cex`)** discriminated by a free-text `form_type` | Confirms the aggregate-tracking decision, but needs a controlled vocabulary. |
| 6 | 241 of 562 columns are `text` (not `varchar`) | No length validation, unindexable in MariaDB without prefix. |
| 7 | **18 dates stored as `varchar`** (e.g. `date_attended`, `passing_date`) | Data quality risk on migration; needs parsing and quarantine. |
| 8 | `hkca_log` has **1.94M rows** with no index on `user_id` | Audit log needs partitioning/retention policy. |
| 9 | `hkid` stored as `blob` (×2 columns) | Encrypted HKID. Migration must preserve encryption or re-encrypt. |
| 10 | **No accredited-centre table** — `cluster` is only a cluster→hospital lookup (2 columns) | The accreditation registry is new build, as we planned. Confirms design. |

---

## 2. Table Inventory

| Table | Cols | Rows (auto-inc) | Purpose | New-model target |
|---|---:|---:|---|---|
| `atp_portfolio` | 123 | ~647 | **Trainee master record + courses + exams + project + tutorials** | `trainee_profiles`, `mandatory_courses`, `exam_results`, `formal_projects`, `pfy_plans` |
| `atp_in_training_assessment` | 50 | ~5,187 | 6-monthly ITA (mature, form-based) | `itas` + `ita_domain_ratings` |
| `atp_ita` | 48 | — | ITA variant (email-driven, `form_type`) | `itas` (merge candidate) |
| `atp_ita1` | 43 | ~17,757 | **Per-assessor ITA responses** | `ita_assessor_responses` (new table) |
| `user` | 40 | — | Auth + profile + role + training level | `users`, `user_roles`, `trainee_profiles` |
| `atp_msf` | 33 | ~6,207 | Individual MSF questionnaire responses (q1–q20) | `msf_responses` |
| `atp_reg` | 30 | ~590 | Course registration | *(out of scope for MVP)* |
| `atp_cex` | 29 | ~11,264 | **All WBA forms** (CEX/DOPS/CBD/ALMAT via `form_type`) | `wbas` |
| `atp_echo` | 28 | ~1,350 | Echo (FTTE) assessments | `echo_assessments` |
| `atp_reg_exam` | 26 | ~4 | Exam registration + SOT approval | *(out of scope / phase 2)* |
| `atp_course` | 23 | ~31 | Course catalogue | `course_catalogue` |
| `atp_exam` | 18 | ~3 | Exam catalogue | `exam_catalogue` |
| `atp_training_experience` | 17 | ~5,893 | **Rotation / training period records** | `rotations` |
| `atp_assessor` | 12 | ~6,550 | External assessors (MSF raters) | `external_assessors` |
| `atp_ita_assessor` | 10 | ~17,545 | ITA assessor invitations + mail state | `ita_assessors` |
| `atp_mita` | 9 | ~2,091 | **Multi-source ITA session header** (per period) | `itas` (session parent) |
| `atp_msfs` | 7 | ~744 | MSF session header | `msf_sessions` |
| `hkca_log` | 6 | ~1,944,803 | Page-view audit log | `audit_log` (archive + retention) |
| `atp_icu_tutorial` | 5 | ~567 | ICU tutorial catalogue | `icu_tutorials` |
| `atp_icu_tutorial_trainee` | 3 | ~1,453 | Tutorial attendance join | `icu_tutorial_attendance` |
| `cluster` | 2 | — | Cluster → hospital mapping | `hospitals` (seed) |

---

## 3. Critical Structural Problems

### 3.1 No referential integrity whatsoever

```
FOREIGN KEY / REFERENCES / CREATE INDEX / UNIQUE KEY / CONSTRAINT  →  0 occurrences
```

Relationships are held by loose `varchar(11)` columns:
- `tid` — trainee key, appears in **12 tables**, no FK
- `fsid`, `mita_id`, `aid`, `course_id` — soft references, no FK

**Consequence for migration:** orphan rows are possible everywhere. Every join must be validated, and a quarantine set must be produced during ETL.

### 3.2 `atp_portfolio` — 123 columns, three problems in one table

This table conflates at least five entities:

| Column group | Actually belongs to |
|---|---|
| `formal_project_*` (5 cols) | `formal_projects` |
| `training_course_other1..15_*` (45 cols) | `mandatory_courses` (one row per course) |
| `tutorial_admin1..38` (38 cols) | `icu_tutorial_attendance` (already exists as a separate table!) |
| `examination_intermediate_*`, `examination_final_*` (7 cols) | `exam_results` |
| `exit_assessment_on`, `remarks` | `trainee_profiles` / `exit_assessments` |

Worst offenders:
- **15 repeating `training_course_otherN` blocks** (name / date / verified / attendance × 15)
- **38 repeating `tutorial_adminN` flags** — duplicated effort, since `atp_icu_tutorial_trainee` already models this as rows

Also: dates stored as text. `training_course_ease_date_attended` is `varchar(200)`, and `examination_intermediate_date_of_qualification_held` is `varchar(200)`. These must be parsed with a quarantine path for unparseable values.

### 3.3 Duplicate and parallel ITA systems

Two incompatible ITA models coexist:

**System A — form-based (mature):**
```
atp_in_training_assessment   (5,187 rows)  ← 6-monthly ITA, SOT fills directly
  assessment_1a…1g, 2a…2g, 3a/3b + _detail   (16 rating pairs)
  rotation_type, level_training, year_of_training
```

**System B — assessor-collated (newer):**
```
atp_mita          (2,091)  session header: tid, level_training, year, period, sot_tid, mita_complete
  └── atp_ita1    (17,757) per-assessor response (mita_id → atp_mita, aid → atp_ita_assessor)
  └── atp_ita     (—)      SOT-level ITA, has form_type + flag
  └── atp_ita_assessor (17,545) assessor invitations + sent/resent mail state
```

System B is the one that matches our new design (SOT collates ≥4 trainer responses, then signs off). System A is the legacy bulk of historical data.

**Decision needed:** migrate A into the B-shaped target model, or preserve both as historical record with A read-only?

### 3.4 The 16-column rating matrix

Both ITA tables use fixed columns `assessment_1a`…`assessment_3b`, `varchar(1)` per rating with a paired `_detail` text column. Three domains:

- Domain 1: 1a–1g (7 items)
- Domain 2: 2a–2g (7 items)
- Domain 3: 3a, 3b (2 items)

This maps cleanly to our `ita_domain_ratings` child table (one row per item). Good — no data loss risk here, but the item codes must be mapped to descriptive names on migration.

`varchar(1)` also means an unenforced rating vocabulary. Expect stray values; the new system needs a CHECK constraint (1–4, X).

### 3.5 `atp_cex` — all WBA types in one table

Confirms our aggregate-tracking decision. Columns of note:

```sql
form_type            text   -- discriminator: CEX / DOPS / CBD / ALMAT?
level_training       text   -- free text, not enum
clinical_or_specialty text  -- free text; likely the CF vs Specialty category
brief_case_description text
nature_of_operating_list_managed text
ot_date              date
hn_number            text   -- patient identifier
flag                 text
```

**Two problems:**
1. `form_type` is free `text` — no controlled vocabulary. Needs enumerating during ETL.
2. `clinical_or_specialty` is free `text`.

⚠️ **Corrected in §5.2:** `clinical_or_specialty` is **not** the VOP classification field, as
previously hypothesised. VOP classification lives in `patient2`
(`module_claimed`, `specialty_module_claimed`, `procedure_claimed`). See §5.

There is **no curriculum descriptor reference** in `atp_cex` — confirming the legacy system never
classified WBAs against curriculum minimums. Our classifier is genuinely new for WBA.
(For VOP, by contrast, claim fields *do* exist — see §5.1.)

### 3.6 Weak mail-state modelling

Three tables carry `sent` / `sent_date` / `resent` / `resent_date` / `send_at_midnight` as free-text flags:

- `atp_assessor` (sent, sent_date, resent, resent_date)
- `atp_ita_assessor` (same + send_at_midnight)
- `atp_mita`, `atp_msfs` (completion flags as `text`)

Boolean state stored as `text` with inconsistent values. Needs a state machine in the new system (`notification_state` enum).

### 3.7 `hkca_log` at scale

1.94M rows, 6 columns, no index on `user_id`, `page_name` or `tt` (`datetime`). This is a page-view log, not a compliance audit trail. Recommend:
- Migrate a time-bounded window only (e.g. last 24 months) into the new audit log
- Archive the remainder outside the operational DB
- Do **not** carry `mobile` / `ip` as `text` into the compliant audit table

---

## 4. Tables Missing From Legacy (New Build Required)

These were confirmed absent from the 21-table schema:

| Missing entity | Status in new model |
|---|---|
| **Volume of Practice / e-logbook** | ✅ **FOUND** — table `patient2` (38 cols). See §5. |
| **Accredited centres registry** | New build (as planned). `cluster` gives cluster→hospital only |
| **Retrospective recognition** | New build entirely |
| **Formal projects** (as a table) | Exists only as flat columns in `atp_portfolio` |
| **PFY 3-domain plan** | Exists only as flat columns in `atp_portfolio` |
| **Sensitive records ledger** (warnings, remedial) | Absent. Remediation exists only as an ITA `flag` |
| **Notifications** | Absent — mail state is scattered across 4 tables |
| **WBAs curriculum classification** | Absent for WBA (new classifier needed). **Present for VOP** via `patient2` claim fields. |

---

## 5. RESOLVED — Volume of Practice Found (`patient2`)

**Previously reported as absent. It is not.** The VOP/logbook table was supplied separately
(`vop_sql_table_only.sql`, same `eps` database, dumped 2026-09-30 15:23). Two tables in that dump:
`backup` (2 columns, trivial) and **`patient2`** — the logbook, 38 columns.

### 5.1 Table `patient2`

| Column group | Columns | Notes |
|---|---|---|
| **Identity** | `pid`, `tid` | Composite PK (`pid`,`tid`). `tid` → trainee. **No FK to `user`.** |
| **SOT approval** | `approved_status`, `approved_by`, `approved_date`, `approved_notes` | ⚠️ **A verification workflow already exists** |
| **Entry metadata** | `date_entry`, `cluster`, `year_training`, `level_training`, `hospital` | Training context denormalised at entry time |
| **Patient** | `hkid`, `sex`, `date_birth`, `age`, `asa` | ⚠️ **Patient HKID in plaintext `varchar(15)`** |
| **Case** | `start_date`, `length_hours`, `surg_dx`, `op1` | `op1` = primary operation, free text |
| **Classification** | `module_claimed`, `specialty_module_claimed`, `procedure_claimed` | ⚠️ **All free `text`** |
| **Clinical Fundamentals flags** | `general_anaesthesia_and_sedation`, `regional_anaesthesia`, `airway_management`, `acute_pain_management` | Map to Curriculum §2.1–2.4 |
| **Technique** | `mode_anaesthesia` `varchar(30)`, `level_supervision` `tinyint`, `block1`…`block6` | Six repeated regional-block slots |
| **Pain Medicine** | `pain_session_am`, `pain_session_pm` | |
| **Free text** | `remark` | |

Indexes: `PRIMARY KEY (pid, tid)` + **two FULLTEXT indexes** — one spanning 14 columns
(`cluster, hospital, hkid, surg_dx, op1, module_claimed, specialty_module_claimed, mode_anaesthesia,
general_anaesthesia_and_sedation, regional_anaesthesia, airway_management, acute_pain_management,
procedure_claimed, level_training`) and a second on `hkid` alone.

### 5.2 ⚠️ CORRECTION to §3.5

§3.5 previously hypothesised that `atp_cex.clinical_or_specialty` was the field deciding whether a
WBA credits Clinical Fundamentals or a Specialty Module, and that it was the historic source of the
miscategorisation pain point.

**That inference was wrong.** WBA classification and **VOP classification are separate mechanisms.**
The VOP classification lives here, in `patient2`:

- `module_claimed` → the Clinical Fundamentals module claimed
- `specialty_module_claimed` → the Specialty Module claimed
- `procedure_claimed` → the specific curriculum descriptor/procedure claimed
- `general_anaesthesia_and_sedation`, `regional_anaesthesia`, `airway_management`,
  `acute_pain_management` → per-domain flags aligning to Curriculum §2.1, §2.2, §2.3, §2.4

**This is the real source of the miscategorisation pain point Albert described.** All four claim
fields are free `text` with no controlled vocabulary, no lookup table, and no validation — so a
trainee types whatever they believe the case to be, with nothing tying the entry to a valid
curriculum descriptor.

### 5.3 Confirmed: the verification workflow already exists

`approved_status` / `approved_by` / `approved_date` / `approved_notes` mean the legacy system
**already had SOT logbook verification**. This validates the logbook-verification surface designed
in the SOT console prototype — it is a refinement of an existing workflow, not a new one.

**Confirmed by Dr. Albert Chan (2026-09-30):**
- `approved_by` may be **either an SOT or an Assistant SOT**
- `approved_status` **includes revision states** (not binary approve/reject)

**Consequence for the target model:** `verification_status` must be a state machine
(`pending | under_review | revision_requested | approved | rejected`), plus `verified_by_role`, plus
transition history — not just a current-state flag.

### 5.3a ⚠️ Patient identifier — HN number is NOT in the source

Dr. Chan confirmed the intended patient identifier should be the **HN (hospital number)**, not the HKID.

**However, `patient2` contains no HN column.** Its identity fields are only:
`pid` (int), `tid` (trainee), `hkid` (`varchar(15)`, plaintext).

So the HKID → HN substitution **cannot be performed during migration** — the HN is absent from the
logbook. See [[Legacy Data Migration and Rollover Plan]] §6.5 for the three options and the
recommendation (drop patient identity; retain a synthetic per-case reference).

### 5.4 New risks introduced by this table

| Risk | Severity | Detail |
|---|---|---|
| **Patient HKID stored in plaintext** | **High** | `hkid` is `varchar(15)` here, whereas `user.hkid` is `blob`. If that blob is encrypted, patient HKID is **not**. Unexplained inconsistency — must be confirmed with the College before any transfer. |
| Patient identifiers in scope | High | `hkid`, `date_birth`, `age`, `sex`, `surg_dx`, `op1` constitute identifiable clinical data |
| 14-column FULLTEXT index | Medium | Search workaround on a production case table; indicates the app needed ad-hoc text search. Index maintenance cost is real. |
| `patient2` naming | Low | Implies a `patient` v1 exists or existed — **not present in either dump**. Confirm no orphaned dependency. |
| `block1`…`block6` repeating group | Low | Same denormalisation pattern as `atp_portfolio.tutorial_admin1..38`; normalises to `case_blocks` child table |
| `level_supervision tinyint` | Low | Unenforced range; needs a documented 1–4 (or similar) vocabulary |

### 5.5 Impact on prior conclusions

| Earlier claim | Status now |
|---|---|
| "No logbook table exists" (§5, old) | ❌ **Wrong** — it is `patient2` |
| "VOP baselines cannot be seeded" | ❌ **Wrong** — baselines **can** be seeded from `patient2` |
| "VOP module is blocked pending schema" | ✅ **Unblocked** |
| "Illustrative VOP counts in prototypes have no source" | ✅ Now sourced |
| `patient2` absent from the 21-table audit | ✅ Explained — supplied as a second dump |

---

## 6. Sample Data — Yes, Needed

Structure alone answered the schema questions. Sample data is required for a different set of decisions, and it is the **only** way to resolve several of the items above.

### What sample data will resolve

| Question | Data needed |
|---|---|
| What values does `atp_cex.form_type` actually take? | 200–500 rows from `atp_cex` |
| What values does `clinical_or_specialty` take? | Same sample — this drives the classifier |
| How many orphan rows exist? | All `tid` values from the 12 tables with `tid`, cross-checked against `user` |
| Which ITA system is live? | Row counts + date ranges for both ITA systems |
| How dirty are the 18 `varchar` dates? | All rows containing those columns |
| What is `tid` vs `hkcanum` vs `userid`? | 100 rows from `user`, including `type` distribution |
| How is `level_training` spelled? | Distinct values across all tables |
| Is `atp_portfolio.tutorial_admin1..38` actually populated? | 50 rows, all 38 columns |
| What do the MSF q1–q20 scales look like? | 20 rows from `atp_msf` |

### Recommended request (privacy-conscious)

Given HKID and patient identifiers (`hn_number`, `sopd_number`) exist in the schema, a **masked export** is preferable to the production dump:

```sql
-- Recommended sample: structure + vocabulary + integrity, no patient identity
-- 1. Lookup/vocabulary tables in full (small)
SELECT * FROM cluster;
SELECT * FROM atp_course;
SELECT * FROM atp_exam;
SELECT * FROM atp_icu_tutorial;

-- 2. 300 most recent WBA rows (drives the classifier)
SELECT * FROM atp_cex ORDER BY id DESC LIMIT 300;

-- 3. 200 most recent training periods (drives rotation migration)
SELECT * FROM atp_training_experience ORDER BY id DESC LIMIT 200;

-- 4. Completed ITA sessions — both systems, for comparison
SELECT * FROM atp_mita ORDER BY mita_id DESC LIMIT 100;
SELECT * FROM atp_in_training_assessment ORDER BY id DESC LIMIT 100;

-- 5. 80 trainee accounts (all types, not just trainees)
SELECT tid, type, first_name, last_name, hkcanum, training_year_start,
       active, level_of_training, trainee_type, sot_type,
       current_hospital, current_cluster, admin_type
FROM user ORDER BY tid LIMIT 80;

-- 6. Portfolio rows, to see which of the 123 columns are actually used
SELECT * FROM atp_portfolio ORDER BY id DESC LIMIT 50;
```

**Masking requirement:** `user.hkid`, `user.hkid1`, `user.password`, `atp_cex.hn_number`, `atp_echo.hn_number`, `atp_echo.sopd_number` must be redacted or replaced with synthetic values before transfer. `hkca_log.mobile` and `.ip` likewise.

### What sample data will *not* resolve

- The missing logbook (§5) — needs a separate schema or a written description
- Whether the two ITA systems can be merged — needs a product decision from the College, not data

---

## 7. Revised Migration Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Orphaned rows (no FKs) | **High** | Full referential sweep; quarantine table; explicit orphan report to College Admin |
| Unparseable `varchar` dates | **High** | Parse + quarantine; report count before cutover |
| Two ITA systems | **High** | Product decision required before ETL design |
| Logbook absent | **High** | Blocking — resolve before VOP module build |
| Free-text `form_type` / `clinical_or_specialty` / `level_training` | Medium | Value discovery from sample data, then controlled vocabulary + CHECK constraints |
| HKID blob re-encryption | Medium | Confirm encryption scheme with College; decide re-encrypt vs carry-forward |
| `atp_portfolio` 123→normalised split | Medium | Column-usage audit from sample data before designing the transform |
| `hkca_log` 1.94M rows | Low | Window + archive; do not migrate wholesale |
| Duplicate WBA entries (already credited 3×) | Medium | Deduplicate on `(tid, ot_date, brief_case_description)`; report |

---

## 8. Confirmed Decisions (Validated by This Schema)

These prior design choices are now evidence-backed rather than assumed:

1. ✅ **Aggregate WBA tracking** — legacy has no per-descriptor minimum enforcement, only `form_type` rows
2. ✅ **Accreditation registry is new build** — no legacy equivalent exists
3. ✅ **Retrospective recognition is new build** — no legacy equivalent exists
4. ✅ **Sensitive records ledger is new build** — remediation is only an ITA `flag`
5. ✅ **Progression gating is new** — legacy has no gate logic in schema; it is manual
6. ✅ **Rotation declaration workflow is new** — `atp_training_experience` has `anaesthesia`/`intensive_care`/`elective` month counts but no declared-type-at-start field

---

## 9. Changes Required to Existing Design Docs

| Document | Change |
|---|---|
| [[Database Schema and Data Model]] | Add MVP tables: `ita_assessor_responses`, `ita_assessors`, `msf_sessions`, `msf_responses`, `external_assessors` |
| [[Database Schema and Data Model]] | Add phase-2 placeholders: `icu_tutorials`, `icu_tutorial_attendance`, `icm_assessments`, `pain_med_cases`, `pain_med_assessments`, `echo_assessments`, `course_catalogue`, `exam_catalogue` |
| [[Database Schema and Data Model]] | ✅ Update `volume_of_practice` to reconciled schema from `patient2`; add `case_blocks`; add `curriculum_descriptors` lookup |
| [[Database Schema and Data Model]] | Add `notification_state` enum replacing the 4 scattered mail-state patterns |
| [[Database Schema and Data Model]] | Add legacy provenance columns (`legacy_tid`, `legacy_table`, `migrated_at`) for traceability |
| [[New Workflow Changes - Curriculum Updates Required]] | Add logbook classification workflow as a new tracked change |
| [[System Architecture and Roadmap]] | Add explicit ETL integrity-validation phase before cutover |

---

## 10. Immediate Next Actions

1. **Ask the College for the logbook schema or a description of current VOP recording** — blocking
2. **Obtain the masked sample data** per §6
3. **Decide how to treat the two ITA systems** before ETL design begins
4. **Confirm HKID encryption scheme**
5. Then: design the ETL transform map (legacy → new) column by column

---

## Related Documents

- [[Legacy System Audit and Data Model]]
- [[Database Schema and Data Model]]
- [[Backend Requirements - Accreditation and WBA]]
- [[New Workflow Changes - Curriculum Updates Required]]
