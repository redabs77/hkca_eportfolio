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
- **Batch Matrix Rating Screen ("Trainee List View"; originally called "Theatre List Mode"):** Approved in principle. A high-density interactive prototype will be constructed first for user testing before implementation.
- **Structured Constructive Feedback:** ~~Free text replaced with two focused prompts: *"Notable Strength"* and *"Key Area for Growth / Development"*.~~ **Superseded by I1 (2026-10-12):** the College's own form uses a per-item example field plus one "Comments from Specialist Assessors" box.
- **Clinical Behavioral Anchors:** Mandatory integration of contextual tooltips and pop-up descriptors defining rating criteria (e.g. operational difference between *Usually Meets* vs *Occasionally Exceeds*) across all clinical rubrics.

---

## U1 extension — Trainee List View (trainer batch view)

**Date:** 2026-10-16 · **Status:** prototype built (`repo-scaffold/HKCA_ITA_Trainee_List.html`); interaction logic smoke-tested (jsdom) and rendered in headless Chromium at 1440 px and 390 px (light/dark; no console errors, no horizontal overflow on phone). Screen-reader and real-device checks pending.

**Naming (Albert, 2026-10-16):** the feature is called **Trainee List View** (alt. *Overall Trainee List*). "Theatre List" is retired: it reads as an operating-theatre case list, which this is not. It is the list of trainees one trainer has been asked to assess this round. The College's own anchor text ("runs theatre lists") is unchanged.

**Decided:**
- **Same form, same rules, faster entry.** Trainees × the 15 College items in one grid; scale, anchors, level-relative framing and the required-example-for-4-only rule are identical to the single-trainee form (I1). X is never a warning.
- **No shortcuts that reintroduce rubber-stamping (U1):** no defaults, no fill-down, no "set all", nothing from earlier cycles. A non-blocking note at review if all 15 ratings are identical.
- **Seal per trainee.** Each trainee is reviewed and sealed on their own (one sealed response per trainer per trainee/session; SHA-256 of that record). There is no "submit all".
- **Keyboard-first on desktop:** 1–4/X rate and advance; advance direction is switchable (next item vs next trainee); a 4 jumps straight to its required example.
- **Phones:** the matrix is replaced by a **By item** layout (one item at a time, every trainee beneath it). It is also available on desktop.
- **Privacy unchanged:** trainer sees no overall result and no other trainer's ratings; trainee never sees any of it.

**Open:** screen-reader pass on the grid; real-phone touch test; whether the SOT assignment supplies each trainee's level/year (assumed yes).

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

---

## I1 — Official 15-item ITA form (amends U1; corrects grade semantics)

**Date:** 2026-10-12 · **Source:** College form `Training-ITA-form.doc` (the form trainers already use) · **Status:** prototype, domain code and schema migration done (migration `1_ita_15_item_form`, verified in PGlite; 14/14 parity). Confirmed by Albert 2026-10-12: X excluded from the 4-item rule; an example is required for a 4 only.

**Decided:**
- **The ITA is the College's 15 feedback items**, in two groups: *Clinical Performance* (9: patient assessment, clinical management, technical skills, knowledge/learning, time management, crisis management, leadership, vigilance, insightfulness) and *Communication, Teamwork and Interpersonal skills* (6: communication with patients, with colleagues, integrity, teamwork, respects patient's right, professional behaviour). All 15 are mandatory (`*`). The earlier 7-domain placeholder was invented and is retired. Catalogue + anchors: `domain/ita/itaDomains.ts`.
- **Scale:** `1` consistently exceeds · `2` occasionally exceeds · `3` usually meets · `4` unsatisfactory · `X` unable to assess. Each item is rated **against the expectation for the trainee's level and year**, not against other trainees.
- **Bug found and fixed:** the Sprint 1 state machine treated grade `>= 3` as unsatisfactory. Grade 3 is a **pass**; only **4** is unsatisfactory. Fixed in `domain/ita/stateMachine.ts`; consecutive-failure tests now use grade 4. Prototype colour for 3 changed from amber to neutral so it no longer reads as a warning.
- **Tier 1 (trainer form, `HKCA_ITA_Trainer_Form.html`):** one rating per item, no defaults, no bulk "set all". Example field per item: **required for 4 only**; optional for 1, 2, 3 and X (all comments other than a 4's are optional). Behavioural anchor under a "What this covers" toggle per item (plus show-all per group). One optional "Comments from Specialist Assessors" box. Draft autosaves on the device; submit is sealed with a SHA-256 of the record. Trainer sees no overall result and never sees other trainers' forms.
- **Tier 2 (SOT synthesis):** the SOT records the grade for **each of the 15 items** (this is the form the trainee signs) plus the **overall assessment (1–4)**. Spread is shown, not an average. Where trainers differ by **2 or more levels** (X excluded) the SOT must record why. In the product every SOT grade starts blank — no median or suggestion — to keep U1's no-rubber-stamping intent.
- **College overall rule, enforced:** overall is unsatisfactory if, *but not limited to*, **4 or more of the 15 SOT items are 4**. At 4+ items the overall is locked to 4. Below 4, the SOT may still award 4 but must give reasons. The rule counts the **SOT's consolidated items**, not any one trainer's ratings.
- **SOT-only fields on the form:** compulsory courses attended (EASE, ADAM-A, EMAC, ECHO-A, UGRA), formal project completed, and Supervisor of Training's comments/suggestions. The trainee adds their own comments/suggestions at the face-to-face.
- **Applies to all stages:** Albert confirmed 2026-10-12 that PFY uses the same 15-item form as BAT and HAT. (The PFY 3-domain plan is a separate sign-off.)
- **Trainee sees:** overall assessment, the 15 item grades, SOT comments. Never an individual trainer's form or examples.

**Schema change applied as migration `db/migrations/1_ita_15_item_form/` (`0_init` untouched):**
- `ItaAssessorResponse.domainRatingsJson` keeps its column type; shape is now `{ "<ITEM_CODE>": { "grade": "1|2|3|4|X", "example": "…" } }` for all 15 codes in `itaDomains.ts`.
- `notableStrength` / `keyAreaForGrowth` dropped, after being copied into new `specialistComments` (backfill verified on old-shape rows). Destructive, acceptable only because no production data exists yet.
- New on `ItaAssessorResponse`: `recordHash` (SHA-256 of the sealed record), `formVersion`, and a **unique (`itaSessionId`, `trainerId`)** — one sealed response per trainer per session.
- New on `ItaSession`: `itemGradesJson` (SOT's 15 consolidated grades), `divergenceReasonsJson`, `unsatisfactoryItemCount` (frozen at signing), `discretionaryUnsatReason`, `coursesAttendedJson`, `formalProjectCompleted`, `formVersion`. `sotGrade` remains the overall 1–4.
- Persisted grades are strings (`"1"`–`"4"`, `"X"`); `normaliseGrade()` in the domain layer accepts either form.
- Seed generator and `db/seeds/synthetic_seed.json` rebuilt in the new shape. A seed test checks every response and every SOT session against the same domain rules the app will enforce. One synthetic REMEDIAL session was corrected from overall 3 to a discretionary 4 (a remedial plan implies unsatisfactory).

**Confirmed (Albert, 2026-10-12):** `X` items never count toward the 4-item rule — a trainer who did not see the competency (for example no crisis occurred) cannot comment on it.

---

## S1 — Admin Bulk Ingestion Engine (Secretariat Operations)

**Date:** 2026-10-16 · **Source:** Stakeholder Survey (HKCA Secretariat / Phoebe) · **Status:** Decided (incorporate into Admin specifications).

**Decided:**
- Build an Administrative Bulk CSV Ingestion tool in the College Secretariat Console.
- Solves Secretariat pain point of slow, manual one-by-one record entry for batch events.
- **Supported ingestion streams:** Mandatory course completions (EASE, EMAC, ADAM-A, ECHO-A, UGRA), Fellowship exam pass lists (Intermediate and Final), rotation cohort allocations, and training centre appointment updates.
- **Engine architecture:**
  - Client-side CSV/Excel parsing and schema validation against active trainee identifiers (HKCA Trainee ID / email).
  - Dry-run validation docket showing matching records, unmatched/unregistered trainees, and diff previews before execution.
  - Transactional batch commit with complete rollback on foreign key violations.
  - Full audit logging linking every bulk insert/update to the authenticated College Admin user.

---

## S2 — One-Click Fellowship Exit Dossier & Portfolio Compiler (MVP Scope)

**Date:** 2026-10-16 · **Source:** Stakeholder Survey (HKCA Secretariat & SOT consensus) · **Status:** Decided (added to MVP scope).

**Decided:**
- Implement an automated Fellowship Exit application compiler within the core system.
- Replaces manual paper/PDF compilation during the final Fellowship application at month 70–72.
- **Compiled dossier contents:**
  1. Executive Summary & Verification Hash (cryptographically signed snapshot of Fellowship readiness).
  2. Accredited Time Ledger attestation (72 accredited calendar months verified across BAT, HAT, PFY).
  3. Volume of Practice (VOP) curriculum compliance audit (verifying all stage gates: 218 BT, 615 HT, subspecialty quotas).
  4. 3-Stage Multi-Source Feedback (MSF) summary (BAT, HAT, PFY completions).
  5. 15-Item In-Training Assessment (ITA) longitudinal summary ladder.
  6. Verified Mandatory Course completion certificates with College verification timestamps.
  7. Board-approved Formal Project manuscript completion sign-off.
  8. Intermediate & Final Fellowship Examination passing records.
- Export formats: Standardized high-craft College PDF dossier + interactive digital verification portal for BOE adjudicators.

---

## S3 — Trainee Document Lifecycle & Versioning (PFY Exit Documents)

**Date:** 2026-10-16 · **Source:** Stakeholder Survey (HKCA Secretariat / Phoebe) · **Status:** Decided.

**Decided:**
- Implement versioned, mutable document management for trainees prior to verification.
- Trainees (especially PFY trainees preparing for Exit) can upload, delete, update, and replace supporting documents (course certificates, formal project revisions, exemption petitions) while the document state is `DRAFT` or `PENDING_REVIEW`.
- Once verified by an SOT or College Secretariat administrator, the document status transitions to `VERIFIED` and is locked to prevent unauthorized tampering.
- If rejected or flagged by the Secretariat, the document returns to `ACTION_REQUIRED` status with admin commentary, unlocking trainee re-upload while preserving previous rejection history in the audit log.

---

## S4 — Unified Echocardiography Logbook & Assessment Integration (Core MVP)

**Date:** 2026-10-16 · **Source:** Stakeholder Survey (SOTs QMH & TMH) · **Status:** Decided (elevated to Core MVP alongside core Anaesthesia VOP/ITA).

**Decided:**
- The Echocardiography Logbook is unified directly into the core platform rather than deferred as an isolated sub-system or Phase 2 add-on.
- **Echocardiography DOPS Workflow Modernization:**
  - Eliminates the legacy bug requiring trainers to log in with trainee credentials.
  - Standardizes Echo DOPS and case verifications under the same responsive, tokenized magic-link email workflow as general WBAs.
  - Automatically dispatches email notifications to designated Echo trainers upon trainee submission.
- **Integrated Dashboard & Milestones:**
  - Echocardiography requirements are tracked directly within the Trainee Dashboard and SOT Departmental Overview alongside core subspecialty requirements (Cardiac, Neuro, Paediatric, Obstetric, Regional, ICU).
  - Trainees log echocardiography cases (TTE/TOE) with subspecialty procedural tagging and structured study indications.


## I-series addendum (2026-10-22): trainer edits and worklist
- **Edit until round close.** A submitted trainer form can be edited until the round deadline; each submission is a new hashed version (`ita_assessor_responses` needs a version/supersedes column, and the unique key becomes (`itaSessionId`, `trainerId`, `version`) with one current row). The SOT team sees only the latest submitted version; edits in progress are not visible. Locks at round close.
- **Trainer worklist.** Trainers see every department trainee, with those they have shared cases with (VOP supervisor entries, theatre lists) listed first. Columns: trainee, stage, shared cases, form status (Not started / In draft / Submitted), action.
- **Grade palette** is one shared token set (`--gr1..gr4`, `--grxbg` in `hkca-theme.css`): 1 forest, 2 mint, 3 slate (a pass, never amber), 4 red, X hatched slate.

## V-series addendum (2026-10-22): trainee logbook, legacy import, progression record
- **Logbook shows the legacy fields.** The trainee logbook carries diagnosis, technique, blocks, duration, patient age, supervision, remarks and the full verification trail (4 trainee-facing states, with who, role, date and note). Patient HKID, DOB and sex are not collected or imported; each case has a synthetic `case_ref`.
- **Legacy logbook is importable and mergeable.** `domain/vop/legacyImport.ts` imports `patient2`, quarantines rows with no trainee or case date, imports unclassifiable rows as `needs_classification` (trainee resolves them), flags 2-year-rule anomalies instead of dropping them, and merges idempotently without overwriting live cases. Open for the College: A1 status vocabulary, A2 free-text values, A3 whether late-but-approved legacy cases keep credit. See Migration Plan §6.8.
- **Progression record.** The Trainee Dashboard shows when each exam was passed (Intermediate, Final Fellowship) and when the trainee moved to each stage (BAT, HAT years, PFY, Exit). New table `training_stage_history`; exam passes stay in `exam_results`, one row per attempt.
- **Course names aligned.** The five compulsory courses are EASE, EMAC, ADAM-A, ECHO-A and UGRA. Earlier prototypes, domain code and PRD wrongly said USRA-E; corrected 2026-10-23 on Dr. Chan's instruction.
- **Trainee Overview simplified (2026-10-23).** Ten stacked cards became four blocks (Next steps, Where I am, Next gate, collapsed How I compare). Nested tabs inside the Overview were rejected: the five top-level tabs already own the detail, and a second tab level would hide the same content deeper. Collapsing is used only for secondary content, with the headline shown on the closed header. Course Completion, rotation and learning goals moved to their own tabs; demo controls moved behind a "Demo controls" button.
- **Logbook status simplified (2026-10-23).** The trainee sees four verification states. "Under review" was merged into "Waiting for verifier": it changed nothing the trainee can do or what counts, the legacy data has no such step, and the prototype never moved a case into it. `under_review` is kept in the schema for later.
- **Formal project record (2026-10-23).** Each formal project carries a College-issued project number and title, and a dated submission record (submissions, resubmissions with version, revision requests, approvals). Read-only for the trainee; reviewers are never named. New table `formal_project_events` and column `formal_projects.project_number`. Legacy has only title, number and approval date, so migrated projects show a single backfilled approval entry. Confirmed 2026-10-23: the legacy `formal_project_date_of_approval` is the final manuscript approval, so it migrates as a `manuscript_approved` event and all four stages show complete.
- **iWBA API refresh reviewed (2026-10-23).** Spec of 2026-10-20 delivers batch, backfill and `iwba_user_id`. Decisions: (1) modalities in use are CEX, CBD, DOPS, ALMAT, MSF with EPA reserved; PBA and ACR will not exist and any other value is quarantined; (2) identity is a stored one-time link (`wba_iwba_links`), because the API has no email, MCHK or trainee number; (3) sync pulls with an overlap, batches of 50, and advances the cursor only after a full traversal; initial history uses backfill once JCIMED enables it; (4) stage at assessment time is derived from our own stage history; (5) stage names are BAT/HAT/PFY everywhere, including the JCIMED pack; (6) the curriculum mapping goes to JCIMED as a clean CSV (not the internal note). Open with JCIMED: curriculum code in responses, external ID field, voided assessments, `unverified`, backfill window, ordering, MSF shape. Corrections made: the analysis note said transducer set-up belongs to CF-2.5 (it is CF-2.1) and that the schema already had the 8 modalities (it did not); the mapping note said MSF was required once (it is three, one per stage).
- **WBA and iWBA sync on hold (2026-10-23).** Dr. Chan paused the WBA and iWBA sync build to finish the prototypes and PRD first. Specification (PRD §4) and the JCIMED questions stay as they are.
- **PRD housekeeping (2026-10-23).** The PRD file is renamed `HKCA ePortfolio Master PRD.md` (no version in the name; an Obsidian alias keeps old links working). It has a revision-history table, and each release is tagged `prd-vX.Y.Z` in git. Current version 1.4.0.

## A-series addendum (2026-10-24): Admin console and legacy source
- **Admin console prototype built** (`HKCA_Admin_Console_Prototype.html`): work queue, intake, registry, progression docket, recognition, course seats and attendance, exams, formal projects, centres and SOTs, iWBA sync, activity log.
- **Trainee status words (decided).** Active, on leave, deactivated, completed. Suspension is a separate Board-imposed flag, not a stage or a status.
- **Recognition ledger reasons (decided).** `RETROSPECTIVE_OVERSEAS_RECOGNITION` and `RETROSPECTIVE_SPECIALTY_TRANSFER` are added, with a `board_decision_date` on the credit.
- **Recognised logbook cases (decided, option A).** Stored as permanent case-credit rows (`vop_credit_adjustments`). They count in overall totals, count towards a module minimum only when the Board allocates a module, are shown as "Recognised by the Board" and never as verified cases, and sit outside the 2-year lock.
- **No Acting SOT role (decided).** The role set stays SOT and Assistant SOT.
- **Legacy source code review** (see `Legacy Source Code Findings 2026-10-24.md`): legacy approval status is blank, `A` or `R` only; course names are fixed in code, not data; the 15-item ITA matches, with column 3b unused.
- **Prisma brought up to the schema doc** (migration `3_admin_console_schema_alignment`, 22 new tables, `TrainingStage` loses SUSPENDED and TERMINATED, `TraineeStatus` added). Tested by `tests/schema/verify_admin_schema.mjs` (57 checks). Differences by design are listed at the top of schema doc section 12.
- **PRD 1.5.0.** Board-recognised cases bypass hospital scoping (§3.1) and the 2-year lock (§3.2); new §3.10.
- **Membership Application and Training Progression (decided 2026-10-25, Dr. Chan).** (1) The Admin "Intake queue" is renamed **Membership Application** and "Progression docket" is renamed **Training Progression**. (2) The applicant completes an online application form (not built yet). The Chief of Service and the SOT endorse it **electronically**: each is sent a signing request and signs with their own portfolio login, as a trainee does for an ITA; Admin can attach a signed PDF instead for a signer who cannot. (3) Medical Council registration is checked as full or limited registration; it is **not** a specialist registration, because the applicant is not yet a specialist. (4) On approval the HKCA number is issued and the account is opened; the welcome email carries a **one-time set-password link**, never a default password. (5) Training Progression is grouped by gate (BAT to HAT, HAT to PFY, PFY to Exit) and filterable by gate and by ready or needs attention. (6) Today this is Admin vetting against numeric criteria only. A future competence committee (chairman, training officer, designated members) will vet progression using the whole record, including qualitative trainer feedback and learning-goal outcomes; it extends the ACRC in the Admin workflows note. Open: `applications` needs per-signer endorsement fields (signer role, method e-sign or PDF, signed_at) and the Medical Council registration type and number captured at application, which is a separate tested Prisma change.
- **Retrospective Recognition flow (decided 2026-10-25, Dr. Chan).** (1) Renamed from Recognition requests. (2) PFY to Exit also requires the formal project (final manuscript approved). (3) The applicant is already a member; the application form is built later. Origin is structured: another country's anaesthesia training, or another specialty (for example surgery or emergency medicine). (4) Flow: request, **Admin enables the application** (step kept, named "Enable application" rather than "Unlock form", which was not intuitive), applicant submits, **Admin checks the documents** are supplied (or returns them), sends to the **Training Officer**, who vets. If there is no particular issue, **the Training Officer's vetting is the decision** and Admin executes the credit; if there is a problem, the Training Officer refers it to the **Board**, which decides. The Training Officer may also send it back for more documents. A **decision trail** (who, role, date, outcome, note) is kept on every case and each step is also in the chained activity log. (5) The Training Officer uses the system (a separate login in the console); if an outcome arrives outside it, Admin can record it on their behalf and the trail says so. Prototype assumptions to confirm: the Training Officer may grant fewer months than requested if a reason is recorded; a rejection is never the Training Officer's alone and goes to the Board; the document checklist is one list for both origins (decided 2026-10-25: same list for now): letter or certificate from the previous training body, record of posts held with dates, logbook or case summary; wording illustrative. Open (schema, separate tested Prisma change): `RecognitionStatus` needs a with-Training-Officer, referred-to-Board and approved-by-Training-Officer step; an append-only `retrospective_recognition_events` table for the trail; the credit's `board_decision_date` becomes a decision date plus `decided_by_body` (TRAINING_OFFICER or BOARD); origin fields (kind, specialty, place). The Training Officer role exists in the schema doc's `AdminProfile` but has no console login yet.
- **Courses: rounds, registration, decisions (decided 2026-10-25, Dr. Chan).** (1) Admin creates **course rounds** and sets the course date or dates, venue, format, seats (optional), **fees for HKCA members and non-members**, coordinators, and **when registration opens and closes** (a date, or Open now / Close now; a closed round can be reopened with a new deadline). Round status: Not open yet, Open, Closed, Held, Attendance recorded. (2) Decisions are **Accepted, Rejected, Waitlisted** (Deferred removed). (3) **Priority:** a trainee waitlisted for an earlier round of the same course, and a trainee about to progress (inside the stage-gate window and still missing that mandatory course), are shown first, ahead of the stage-need ranking; request time breaks ties. **Admin has the final say:** nothing is decided automatically, "Review a suggestion" shows who would be accepted and waitlisted and only applies on confirmation, any row can be overridden, and a full course warns rather than blocks. (4) **Mandatory courses:** EASE, EMAC, ADAM-A, ECHO-A, UGRA (UGRA is the same course as the College page's UGRA-E). **Other courses** from the College courses page: ADAM-D, ASSW, Basic Sciences Course, Intermediate Examination Mock Viva, Revision Tutorial Course in Basic Sciences, Higher Training Course in Clinical Anaesthesia, Crash Course for Clinical Anaesthesiology, Revision Tutorial Course in Clinical Anaesthesiology. Intensive Care and Pain Medicine courses are the next iteration. (5) CSC is the **Clinical Simulation Committee**; its courses (EASE, EMAC, ADAM-A, UGRA, ADAM-D, ASSW) also take registration in the College portfolio. ECHO-A is run by the College. (6) Course names follow the College courses page; the Admin prototype had wrong full names for EASE and EMAC (assumed, now corrected) and the Trainee Dashboard wording is aligned. (7) Attendance for an other course is kept on the round only and does not change the mandatory course record. Prototype assumptions to confirm: waitlisted trainees still apply themselves to the next round and carry the priority tag (they are not added automatically); mandatory courses are not charged at present, so their rounds carry fees of 0 and show No charge, and a fee can be set at any time if charging starts (decided 2026-10-25); the Home calendar now follows the rounds. **Attendance rule (decided 2026-10-25, College Regulations for Courses, May 2026; applies to HKCA courses only, see the CSC correction at the end of this log):** 70% attendance or more earns the Certificate of Attendance; below 70% gets none and a mandatory course is not marked completed; below 50% is reported to the trainee's Chief of Service and SOT. The attendance check takes an optional rate after each HKCA number (for example `HKCA-2022-006, 60`); a line with no rate means full attendance (assumption to confirm). The rate is stored on the round; each trainee below 50% queues a notice and writes an activity log entry. That assumption was wrong for the CSC courses: see the CSC correction at the end of this log. The Chief of Service is not an appointment in the console, so the notice names the hospital's Chief of Service and the current SOT where one is recorded. **Intermediate Examination Mock Viva priority (decided 2026-10-25):** trainees on the entry list for the coming Intermediate examination are shown first, as the College page says. Not built: payment tracking (only needed once mandatory courses are charged; the regulations say unpaid applicants may not sit in, and only applicants with the form and fee in before the deadline are considered), and the Revision Tutorial 50-place selection (the College regulations cap the course at 50 and have the course coordinator select by Board of Education criteria when there are more than 50 applications; Albert to decide whether Admin or the coordinator decides; both Revision Tutorial rounds are capped at 50 in the prototype). Open (schema, separate tested Prisma change): `CourseDecision` needs REJECTED (DEFERRED unused); `CourseRound` needs end date, venue, format, member and non-member fee (0 for no charge), per-attendee attendance rate (a column on the attendance record), a notice record for the under-50% report, registration opens and closes, a manual-close flag, coordinators, an organiser (CSC or HKCA) and nullable seats; the round status string needs not-open, open, closed, held, recorded.

**Course registration, Trainee side (closed loop, decided 2026-10-25, built):** The Trainee Dashboard (Courses and Overview) and the Admin console now share one store, `hkca-courses-store.js` (localStorage, key `hkca.courses.v1`), so a change on either page shows on the other. In production both read the database. (1) When Admin opens a round, the trainee gets a "Registration is open for ..." item under Next steps and a card under Courses. Notified: mandatory courses the trainee still lacks, plus other courses that match their stage (basic training: Basic Sciences Course, Intermediate Mock Viva, Revision Tutorial in Basic Sciences; higher training: Higher Training Course, Crash Course, Revision Tutorial in Clinical Anaesthesia). Other open rounds are still listed under "Other open courses" with no notice. The stage mapping follows the College page and is a placeholder for Albert to confirm. (2) The trainee applies from the card (fee, deadline, withdrawal rule shown first) and can withdraw until registration closes; after close, withdrawal is refused and points to College Admin. A withdrawn application stays on the round as "Withdrawn by the trainee" and no longer counts as an applicant; re-applying before the deadline is allowed. (3) Admin's decisions show on the trainee side: Applied, Accepted (notice of acceptance queued by email, written to the activity log), Waitlisted (priority next round), Not accepted. (4) Admin closing registration moves the card to "Your applications". (5) Recording attendance turns the course Completed (70% or more) or shows the rate with no certificate; below 50% also states the Chief of Service and SOT have been told. Admin sees each application and withdrawal in the activity log and as a toast. The trainee's "Upload certificate" prompt for a missing mandatory course is replaced by "Registration open or applied" while a round is open or an application is live. Demo: the dashboard persona (Dr. Kelvin Wong, HKCA-2022-019, HAT year 2, PWH) is now the same record in the Admin console; he has EASE, EMAC, ADAM-A and ECHO-A and lacks UGRA, for which an illustrative round is open. The demo date for courses is fixed at 24 Oct 2026. Open (schema): an application withdrawal state and timestamp on `CourseApplication`, plus an event or notification table for trainee notices.

**Over-subscribed rounds (decided 2026-10-25):** When live applications (not withdrawn, not rejected) exceed the places, Admin is flagged: a "N for M places" pill on the round, a banner and count on Seat allocation, and a line on the Home work queue. Each round has a ranking setting: "Priority, then request time" (default) or "First come, first served" (anyone waitlisted last time still goes first). Both Revision Tutorial rounds (Basic Sciences and Clinical Anaesthesiology, 50 places) default to first come, first served; Albert said "likely", so it is a setting and not hard-wired. Admin still decides every place; the ranking only orders the suggestion. This replaces the coordinator-selection idea for now (the College regulations have the course coordinator select by Board of Education criteria above 50; not built). Request time is a date only, so applicants on the same day keep the order they applied in. Schema: `CourseRound` needs a ranking mode column, and `CourseApplication` needs a full timestamp.
**Phone layout, Admin console (2026-10-25):** At 720px and below the console is a phone layout: slimmer header, Training Progression rows stack into one card per trainee (no more overlapping columns), the seat applicant list stacks with a full-width decision, and every other list becomes one card per row with column headings as small labels. Tested at 390 and 360px: no horizontal overflow on Home, the four Trainees views and the three Courses views. The floating Demo controls button sits over content on a phone; leave it as a prototype aid.

**Examinations: closed loop (decided 2026-10-25):** The Exams tab has an Intermediate and a Final tab, each with Sittings, Exam Applications, Upload results and Past sittings. ("Entry list" is now "Exam Applications"; "Why not yet" is now "Criteria not met".) Admin opens and closes applications for each sitting; the closing date must be 3 to 8 weeks before the written examination (Vocational Training Guide 2.4.2), the fee is HK$8,000 (Intermediate) or HK$16,000 (Final), and an application that is not complete when the sitting closes lapses. The trainee applies on the Trainee Dashboard, after a live criteria check and a declaration. The application does not appear on the Admin page until the SOT has endorsed it. It is complete when the SOT has endorsed it, Admin has recorded the fee as received (the trainee may attach a payment slip or email the College, "both ways for now"), and the criteria are met. Trainee withdrawal is free before the closing date; after it Admin records a medical withdrawal (fee less 10%) or a forfeit. A Board of Examinations exception or a "not admitted" decision is recorded with a reason; Admin cannot override a criterion silently.

**Examination criteria (single list in `hkca-courses-store.js`, `EX_RULES`):** both exams: Member and registered trainee; registration and training fees paid (recorded by Admin on the trainee record). Intermediate: in Basic training; not already passed or exempt. Final: in Higher training; Intermediate passed or exempt; working in a College-accredited centre; Final not already passed. Sources are the Vocational Training Guide 2.4 and the Intermediate and Final Exam FAQs; two checks ("not already passed") are our own additions and are labelled as such. The Administrative Instructions (members only) were not read. Albert will double-check the exact criteria, so they live in one list and are easy to change. Exemption from the Intermediate is recorded on the trainee (ANZCA primary exam, FRCA primary exam, or another overseas qualification by Board of Examinations decision) with a Board reference. The old Pathway 4 checks (12/48 months, EASE/EMAC, WBA quotas, VOP thresholds, ITA) are not College requirements for sitting the exam; the SOT sees them as a training record, for information only.

**SOT step:** the demo has "View as Supervisor of Training" in Demo controls. The SOT sees pending endorsements with the system criteria check and the training record, and endorses (certifying that the candidate holds the post and is eligible to present, as on the College form) or declines with a reason. The real SOT console is not built.

**Carry-forward of section passes (decided 2026-10-25):** Intermediate: a pass in one subject (Physiology or Pharmacology) is carried forward when the other subject meets the minimum score; the trainee sits only the remaining subject. Final: the written pass is carried forward when the oral or OSCE is failed; the trainee sits Oral and OSCE only. Each lasts up to four subsequent consecutive exams, then all sections are re-sat. The fee is the same. Examiners' results are per subject (Intermediate: `physiology`, `pharmacology`, `minimum_met`) and per section (Final: `written`, `oral_osce`, the oral and OSCE result together; separate oral and OSCE columns are refused, per Albert 2026-10-25). The upload sets, keeps, clears or expires the carry-forward on the trainee record; Admin can correct it by hand. The application records the sections the trainee sits, shown to the trainee, the SOT-endorsed Admin list and the drawer. **To verify with the College:** we count every sitting the College holds towards the four, whether or not the trainee sat it; and we assume that the minimum score is recorded by the examiners as `minimum_met` (Yes or No).

**Formal projects restructure (decided 2026-10-25):** per HKCA-E03 (March 2026) a case has a Protocol part and a Manuscript part; the Manuscript opens after the Protocol is approved. Alternative route: an accepted peer-reviewed paper (guideline 2.1) with the trainee as first or corresponding author, recorded with journal, date and evidence. Review period is two months (not 30 days); after two months the Formal Project Team handles the review. Outcomes replace the four grades: Approved, Revision and resubmission, Rejected. A revision is resubmitted to the same reviewers for a new two months. A rejection can be appealed once with a point-by-point reply; a rejection after appeal is final. A manuscript approval or accepted paper queues advice to the Board of Education and the Board of Censors. Admin Formal projects has Protocols, Manuscripts (including projects underway, with a filter) and an Approval log (dates per case plus a dated timeline per case). The exit-gate Formal project criterion is now derived from the cases. Trainee-side submission, with journal-style declarations (authorship, ethics, conflicts, originality), is a later phase and the mechanism is not yet designed.

**Overdue formal project reviews (decided 2026-10-25):** a reminder goes to each reviewer who has not finished 14 days before the two-month deadline. After the deadline the hand-over is per reviewer (the split): a review already in stands, and only the missing report goes to the Formal Project Team, whose review is recorded in its place. A late report is ignored unless there are exceptional circumstances; the Secretariat can override by accepting it with a recorded reason, and the timeline marks it as an override. The case then goes to the decision step with every review marked as reviewer, Team or late.

**Reviewer reassignment (decided 2026-10-25):** the Formal Project Team may reassign a review to another reviewer when a reviewer is non-responsive; this stays open alongside handing the missing review to the Team. Admin can reassign any outstanding reviewer at any time (reason: no response, unavailable or conflict of interest). The new reviewer is chosen from eligible assessors (not the trainee's hospital, not already on the case, never a previously replaced one) and gets their own two months from the day of reassignment. A reviewer already handed to the Team can still be reassigned, which clears the hand-over. Each reassignment is dated in the case timeline.

**Secretariat console: scope and schema (decided 2026-10-25, Dr. Chan, second delta check).** (D1) Course registration and exam applications are part of the **first launch**, not Phase 2; the Migration Plan and the schema doc's Phase 2 list are corrected. (D2) The formal-project **Escalated** state is dropped (no screen or rule used it) and **Appeal** is added; review outcomes are Approved, Revision and resubmission, Rejected (the four grades are gone) and the review period is two months, not 30 days. (D3) **Fee status is entered by hand** by Admin from payment slips, with date and reference: registration fee, training fee and each exam fee received; a wrong entry is voided, never deleted. (D4) The **Final examination in Intensive Care** is out of scope for the first release; the database value stays. (D5) The PRD gets a short **College Secretariat console** section (Feature 11); the detail stays in this log. Schema: Prisma migration 5 adds course attendance (with the rate) and under-50% notices, exam sittings, exam results with per-subject and per-section outcomes, carried-forward section passes, trainee fee payments and exemptions, formal-project stages (protocol and manuscript each with state, round, decision, appeal), the Team hand-over, the late-report override and reassignment reason on a review, trainee-visible versus internal timeline entries, the accepted-paper route, membership endorsement rows (Chief of Service and SOT, e-sign or attached PDF) with registration type and number, extra recognition steps (With Training Officer, Referred to Board, Approved credit to execute), a decision date plus decision body replacing the Board decision date, structured recognition origin, and an append-only recognition trail. Two corrections to the second delta check note: a Team review is recorded on the same row as the reviewer it replaces, so `reviewer_id` stays required; and recognition status gained one "approved, credit to execute" step for both the Training Officer and the Board, with the deciding body in its own column. **Prototype assumptions still to confirm with the College:** every sitting counts toward the four-sitting carry-forward limit; the stage-to-course mapping for notices; the "not already passed" exam checks; the exams Administrative Instructions (members only) were not read; a line with no rate on an attendance sheet means full attendance.

**CSC courses need 100% attendance (decided 2026-10-25, Dr. Chan; PRD 1.6.1).** The 70% certificate rule and the under-50% report apply to HKCA courses only. Clinical Simulation Committee courses (EASE, EMAC, ADAM-A, UGRA, ADAM-D, ASSW) run one to three days and full attendance is expected: only 100% earns the certificate and completes the course; anything less earns none and the trainee needs another round. The Admin attendance check, the trainee's Courses card and Next steps all read the pass mark from one place (`HKC.passPct`) and the under-50% notice is switched off for CSC courses (`HKC.noticeOn`). **A CSC trainee below 100% is reported to the SOT** (Dr. Chan, 2026-10-25; the notice names the current SOT of the trainee's hospital, `HKC.noticeBelow`). The trainee's card says "Your SOT has been told." Whether the Chief of Service should also be told has not been decided; the notice goes to the SOT only.
