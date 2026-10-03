---
type: decision_log
project: "[[HKCA Portfolio Revamp]]"
created: 2026-10-01
status: in_progress
source: "[[Pre-Implementation Red Team Audit Report]]"
---

# Pre-Implementation Audit Decisions Log (M, H, U & E Series)

Working decisions and agreed architecture closing all findings from the [[Pre-Implementation Red Team Audit Report]] before Prisma schema finalisation, SOT console build, and pilot rollout.

---

## M1 — Authoritative ITA system

**Status:** Resolved (Confirmed via code audit)

**Finding & Code Evidence:**
Albert's hypothesis was **100% confirmed** by inspecting the legacy PHP codebase (`add_mita.php`, `process_add_mita.php`, `atp_ita1`, and `in_training_assessment.php`):
1. **`atp_mita` (Master ITA session):** SOT creates an assessment round for a trainee, selecting supervising assessors/trainers into `atp_ita_assessor`.
2. **`atp_ita1` (Trainer Feedback, ~17,757 rows):** Individual trainers fill out scores (1–4, X) and free-text comments. Trainees are explicitly permission-blocked from accessing or viewing `add_mita.php` or `atp_ita1`.
3. **`add_mita.php` (SOT Synthesis View):** Lines 240–317 query all completed `atp_ita1` entries for that `mita_id` and compute distribution statistics (counts and percentages across 1–4, X) with graphical horizontal bar charts for all 15 clinical items and overall assessment, pooling all trainer comments into an aggregated list.
4. **`atp_in_training_assessment` (Authoritative SOT Record, ~5,187 rows):** SOT makes the final judgment based on trainer input distributions, submitting the official final summative rating. This is the only record exposed on the trainee's `portfolio.php` and counter-signed by the trainee (`verified_by_trainee = 'Yes'`).

**Decided Architecture for Target Schema:**
- Both tables represent legitimate stages of the assessment lifecycle; neither is legacy dead code.
- Target schema will adopt the 2-tier model:
  - `itas`: Authoritative final summative rating signed by SOT and counter-signed by trainee (replaces `atp_in_training_assessment`).
  - `ita_assessor_responses`: First-class entity for individual supervising trainers' scores and comments (replaces `atp_ita1`), private to SOT/College.
- Resolves Red Team Finding F1 without requiring College arbitration over "which table to discard".

---

## M2 — Credit ledger (`accredited_time_ledger`)

**Decided:**
- Revoke/amend authority: **BOE level only.** No SOT, Assistant SOT, or Cluster SOT may revoke or amend a credit ledger entry.
- Reason codes: **fixed list required**, not free text (except the designated escape-hatch code below, which still requires BOE-level action and mandatory accompanying free text).

**Proposed `decision_reason` taxonomy (pending Albert's confirmation of the list itself):**

Revoke:
- `conflict_of_interest`
- `non_accredited_site`
- `unauthorized_signatory`
- `successful_appeal_overturn`
- `administrative_error`
- `fraudulent_record`
- `incorrect_category`
- `other_boe_directed` (escape hatch — requires BOE actor + mandatory free-text explanation)

Amend:
- `partial_credit_correction`
- `conditional_requirement_fulfilled`
- `curriculum_rule_change`
- `supersedes_duplicate`

---

## M3 — Integer days vs float months

**Decided:** Count by **actual calendar months**, not days or a fixed day-conversion constant (e.g. not 730 days / 24).

**Implication for engineering:** The report's original "store `days_credited` as INTEGER, convert via 30.4375 days/month" approach does not apply as specified. Instead: `accredited_time_ledger` should retain `period_start`/`period_end` as dates (already in schema per report §1.2), and the "months credited" figure is derived by calendar-month arithmetic between those dates — not a day-count divided by a constant.

**Still open:** exact calendar-month counting rule at the edges — e.g. does Jan 15–Apr 14 count as 3 months or does it round, and how are partial months at rotation boundaries handled. Needs to be written into the Training Guide as explicit policy.

---

## M4 — Invalid SQL (generated columns, check constraint subquery)

**Status:** No decision needed — pure engineering fix, confirmed closed.

- `itas.is_overdue` / `days_overdue` as `GENERATED ALWAYS AS (...) STORED` referencing `CURRENT_DATE` is invalid in Postgres (generated columns cannot reference volatile functions). Fix: compute via view or application code.
- `rotations` check constraint containing a subquery against `accredited_centres` is invalid in Postgres (check constraints cannot query other tables). Fix: enforce via trigger instead.

---

## M5 — FK key types + ON DELETE behaviour

**Decided:** Trainees are **never deleted**, only deactivated. All training records (ITAs, logbook, remediation plans, etc.) are retained indefinitely under this policy. `ON DELETE RESTRICT` (not `CASCADE`) applies to every table carrying training credit, audit value, or legal significance.

**Still open:** global FK key-type choice (`users.id` as `TEXT`/UUID vs `INTEGER`, consistently across all tables) — engineering call, no governance angle, needs to be settled before Prisma schema generation.

---

## M6 — final_grade vs sot_grade split + consecutive-unsatisfactory definition

**Decided:**
- Confirmed bug fix: add `itas.final_grade` (post-appeal, authoritative) distinct from `itas.sot_grade` (as signed). Gate functions (e.g. `can_progress_to_hat()`) must read `final_grade`, not `sot_grade`, so a successful appeal unblocks progression.
- "Consecutive unsatisfactory ITAs" (the automatic BOE escalation trigger) is defined as: **a satisfactory ITA in between resets the count to zero.** Confirmed this matches actual administrative practice — a good result in between means the automatic escalation does not fire.
- **New requirement surfaced (not in original report):** even when the streak is broken (so automatic escalation does not fire), if a trainee has **2 unsatisfactory ITAs on record** (consecutive or not), this should be flagged for human review at the next progression gate, **and the assigned SOT should be notified.** This is a visible/soft signal, not an automatic BOE trigger.
- This new requirement is tracked separately as **H8** (High Priority / UI-build-blocking, not schema-blocking) since it's a new consumer of existing M6 data rather than new schema. To be written up in full once the H-series items are addressed.

---

## Related

- [[Pre-Implementation Red Team Audit Report]]
- [[Pre-Implementation Appraisal Dossier]]
- [[Database Schema and Data Model]]

---

# H-Series (High Priority — SOT Console & Operations) Decisions Log

Working decisions made for items H1–H8 before SOT Console UI and workflow engine implementation.

---

## H1 — Trainee Counter-Signature & Contested ITA State Machine

**Decided:**
- **Primary Clinical Workflow:** Signatures occur primarily in a mandatory **face-to-face feedback meeting** between SOT and trainee after reviewing the synthesized feedback and ratings.
- **Refusal / Disputed Evaluation Handling:** If a trainee refuses to counter-sign:
  - SOT flags the record as **`contested`**, with the trainee providing their written statement/objection.
  - Both the ITA outcome and the associated training time credit enter a **`pending_boe_review`** state.
  - Progression to subsequent milestones (e.g., HAT, Final Exam) is placed on hold until the Board of Education formally reviews and rules on the assessment.

---

## H2 — SOT Unavailability & Escalation Ladder at Deadlines

**Decided:**
- **Escalation Ladder for Critical Deadlines (Exam Registration / Milestones):**
  - **Level 1:** Assistant SOT (hospital deputy).
  - **Level 2:** Cluster SOT.
  - **Level 3 (College Exam Chair / Admin):** Explicitly **rejected** as incompatible with HKCA governance structure. If Level 2 is unavailable, unresolved items escalate to the Board of Education / Cluster Director.
- **Delegation of Authority:** SOTs have a self-service feature in their console to delegate acting signing authority to their nominated **Assistant SOT** during planned leave or absence, with automated audit logging.

---

## H3 — Mid-Rotation Centre Transfer & Early Warning Intervention

**Decided:**
- **Mid-Rotation Centre Transfers:** Handled via **Option B (Split ITAs)**:
  - Consecutive interim ITAs are generated for each hospital segment (e.g., 4 months at Hospital A, 2 months at Hospital B).
  - Each SOT signs only for their observed segment, and time credit is partitioned accurately in the ledger.
- **Short Segment Exception Rule:** An unsatisfactory rating on an interim segment shorter than the standard 6 months is flagged as an **Exceptional Segment Assessment** and routed directly to the BOE rather than triggering standard automated 6-month failure tariffs.
- **Early Warning & Performance Improvement Plan (PIP) Workflow:**
  - SOTs can trigger an **Interim Formative ITA** before month 6 (e.g. Month 2–3) for struggling trainees.
  - An unsatisfactory formative rating does not count as an official College failure.
  - Automatically initiates a structured **Performance Improvement Plan (PIP)** with concrete domains, actions, mentors, and review dates, which automatically links into the final 6-month summative ITA.

---

## H4 — Conflict of Interest (COI) & Reviewer Safeguards

**Decided:**
- **General Trainee–SOT COI Declarations:** Deferred to the **product backlog** (no existing College declaration framework; avoids introducing artificial clinical friction).
- **Formal Project Reviewer Blinding:**
  - Mandatory policy: Reviewers must **not** be the SOT or a trainer from the same hospital as the trainee.
  - Phasing: Maintained as a manual coordination process by the Formal Project Officer in Phase 1 MVP, with automated blinding and assignment algorithms scheduled for **Phase 2**.

---

## H5 — Immutable `first_logged_at` & 2-Year Retrospective Window Trigger

**Decided:**
- Add an immutable database-generated `first_logged_at TIMESTAMP` set on insert (cannot be modified).
- Cases logged $> 2$ years after procedure date are saved for trainee logbook completeness, but automatically flagged `is_accredited = false` with `disqualification_reason = 'exceeded_2yr_window'`.
- ETL migration will seed `first_logged_at` from legacy `date_entry`, with any $> 2$-year historical anomalies exported to a validation report for College review.

---

## H6 — Optimistic Locking (`version`) on Shared Records

**Decided:**
- Implement standard optimistic concurrency control via a `version INT NOT NULL DEFAULT 1` column across all shared/concurrent entities (`itas`, `rotations`, `trainee_profiles`).
- Prevents silent overwrites from concurrent tabs, network latency, or multi-signatory edits.

---

## H7 — Tamper-Evident Append-Only Audit Log

**Decided:**
- Enforce append-only immutability at the database role level (revoke `UPDATE` and `DELETE` on audit tables).
- Capture structured `before_json` and `after_json` for all state transitions on critical entities.
- Implement cryptographic hash chaining (`prev_hash` + `row_hash = sha256(...)`) to ensure audit trail cannot be manipulated in legal or regulatory challenges.
- Partition audit logs monthly to protect application read performance.

---

## H8 — Non-Consecutive Unsatisfactory ITA Review Flag & SOT Alert

**Decided (surfaced from M6):**
- When a trainee accumulates **2 unsatisfactory ITAs on record** across their training history (even if non-consecutive and streak reset by a satisfactory cycle):
  - Does **not** trigger automatic BOE escalation (which is reserved strictly for consecutive fails).
  - Triggers an automated advisory alert to the trainee's current supervising SOT.
  - Surfaces a prominent advisory flag on the progression panel for human review at subsequent milestone gates (HAT, Final Exam, Exit).

---

# U-Series (UX & Clinical Adoption) Decisions Log

Working decisions made for items U1–U5 to ensure clinical feasibility, mobile utility, and minimize administrative burden before pilot rollout.

---

## U1 — Trainer Assessment Workload, Batch Matrix & Feedback Anchors

**Decided:**
- **No Auto-Prefill from Previous Cycle:** Explicitly rejected to eliminate "rubber-stamping" and complacency. Assessors must actively select ratings each cycle.
- **Batch Matrix Rating Screen ("Theatre List" Mode):** Approved in principle. A high-density interactive prototype will be constructed first for user testing before implementation.
- **Structured Constructive Feedback:** Free text replaced with two focused prompts: *"Notable Strength"* and *"Key Area for Growth / Development"*.
- **Clinical Behavioral Anchors:** Mandatory integration of contextual tooltips and pop-up descriptors defining rating criteria (e.g. operational difference between *Usually Meets* vs *Occasionally Exceeds*) across all clinical rubrics.

---

## U2 — Offline-Capable Mobile Logbook Entry (PWA)

**Decided:**
- Implement an offline-first Progressive Web Application (PWA) installable on mobile home screens.
- Utilizes client-side persistent storage (`IndexedDB`) to allow rapid case entry in theatre suites and dead zones.
- Automatically synchronizes queued cases in the background when connectivity returns.
- Preserves immutable `device_logged_at` timestamps to ensure offline entries are not penalized by sync latency under the 2-year retrospective rule (linking to H5).

---

## U3 — SOT Batch Verification Guardrails for Caseload

**Decided:**
- Batch verification is restricted to **clean cases** (high classification confidence, within standard training scope, zero anomalies).
- **Mandatory Individual Review for Divergent Cases:** Cases triggering anomaly flags (specialty mismatches, out-of-hours seniority discrepancies, borderline retrospective logs) are excluded from batch sign-off and require individual review.
- Requires a single explicit attestation modal logged in the audit trail.

---

## U4 — Volume of Practice (VOP) Velocity During ICU Rotations

**Decided:**
- Replace raw cumulative case volume with **caseload velocity per eligible clinical anaesthesia month**:
  $$\text{Velocity} = \frac{\text{Total Logged Cases}}{\text{Accredited Anaesthesia Months (Excluding ICU \& Extended Leave)}}$$
- Trainees rotating through ICU blocks freeze their anaesthetic caseload percentile without triggering false-alarm downward spikes.
- UI explicitly explains the calculation basis (e.g. *"Rate based on 14 eligible anaesthesia months; 6 months of ICU excluded"*).
- Dedicated ICU progress indicators tracked on a separate modular card during intensive care rotations.

---

## U5 — Usability Telemetry & Active Interaction Time-to-Complete

**Decided:**
- Embedded technical telemetry to monitor system usability and form fatigue for administrators.
- Measures **True Active Interaction Time** (captures active typing/clicking; automatically pauses after 60 seconds of idle inactivity; aggregates across draft sessions).
- Target College Usability SLOs:
  - Mobile case entry: Median $< 45\text{ seconds}$.
  - Individual trainer ITA feedback: Median $< 5\text{ minutes}$.
  - SOT summative synthesis: Median $< 10\text{ minutes}$.
- Analytics are anonymized and aggregated for user interface optimization.

---

# E-Series (Engineering Refinements before Pilot) Decisions Log

Working decisions made for items E1–E6 to ensure platform resilience, integration contracts, regulatory data compliance, and automated quality gates.

---

## E1 — Real-Time Base Table Queries for Progression Gates

**Decided:**
- High-stakes regulatory milestone gates (**Exam Eligibility, HAT Progression, Exit Assessment**) must **always query live base tables** in real time (indexed count queries $< 5\text{ ms}$).
- Eliminates the risk of trainees being wrongly rejected at deadlines due to stale materialized views or delayed cache refreshes.
- Materialized views and pre-calculated caches are restricted strictly to non-critical statistical overview dashboards.

---

## E2 — JCIMED (Jockey Club Institute of Medical Education and Development) iWBA Integration

**Decided:**
- **Master Direction of Authority:** JCIMED is the sole authoritative source of record for clinical WBAs (DOPS, Mini-CEX, CbD) conducted on its platform. Assessments are read-only inside the HKCA portfolio; corrections must originate in JCIMED and flow down.
- **Strict Idempotency:** Sync transactions require unique constraints on `(jcimed_wba_id, assessment_type)` plus `sync_batch_id` to guarantee zero duplicate records on retries.
- **Immutable Assessor Snapshot:** Capture an immutable point-in-time snapshot of the assessor's name, rank, and hospital at assessment time to avoid drift when consultants move hospitals.
- **Sync Conflict Quarantine:** Any mismatched trainee IDs or dates out of training scope divert to `wba_sync_conflicts` for College administrative review without disrupting the sync queue.

---

## E3 — Versioned HKAM Nomination Export Mappings

**Decided:**
- Decouple Academy nomination export structures from application code into versioned JSON configuration schemas (e.g. `hkam_export_v2026_1.json`).
- Prevents silent export corruption when HKAM amends forms and eliminates the need for emergency code deployments.
- Every generated export logs the exact mapping schema version used for reproducible historical auditing.

---

## E4 — Universal Soft-Delete & PDPO Retention Schedule

**Decided:**
- Universal soft-delete (`deleted_at`, `deleted_by`) across all operational tables; physical SQL `DELETE` permissions revoked at the database role level.
- **Permanent Professional Training Records:** Accredited ledger entries, completed ITAs, verified surgical logbook cases, and exam milestones are retained permanently for lifelong medical licensing verification.
- **Audit Log Retention:** Retained in live hot storage for 24 months, then archived to encrypted cold storage with a statutory 7-year retention period.
- **Draft Disposal:** Unsubmitted, abandoned drafts older than 180 days are flagged and purged following a 30-day user notification window.

---

## E5 — CI/CD Parity Testing Suite & Scoped Migration Cohort

**Decided:**
- **Target Migration Scope:** Limited strictly to **active trainees** (Basic, Higher, Provisional Fellowship, and approved interruptions) and **new incoming intakes**. Historical alumni who completed training will remain in read-only legacy cold storage, dramatically reducing migration risk and complexity.
- **Automated Parity Suite:** Runs in CI pipeline comparing legacy calculation outputs to modern engine outputs across 100% of the migrating active cohort, requiring zero drift in accredited calendar months, category case counts, and assessments.
- **Curriculum Version Regression Lock:** Future curriculum revisions must execute regression parity tests to guarantee that older active cohorts are not inadvertently re-scored under newer criteria.

---

## E6 — Formal Project Reviewer Timeout & Escalation Dashboard

**Decided:**
- Formal project manuscripts assigned to blinded reviewers will feature an automated tracking clock (nominal 30-day target window with automated reminders).
- If a reviewer becomes unresponsive, the system flags the file as `overdue_unresponsive` and alerts the **Formal Project Officer's console**.
- Provides actionable one-click management: **"Reassign to Alternate Reviewer"** (revoking the previous reviewer's token) or **"Grant Extension"**.
- Final reminder intervals and threshold dates will be calibrated to the Formal Project Officer's official guidance during implementation.
