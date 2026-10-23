---
type: prd
project: "[[HKCA Portfolio Revamp]]"
version: "1.3.1"
date: 2026-10-23
status: approved_for_implementation
stakeholders:
  - "Dr. Albert Chan (Chief of Service / Project Lead)"
  - "Hong Kong College of Anaesthesiologists (HKCA) Board of Education"
  - "Tina Huang / Engineering Team"
---

# Master Product Requirements Document (PRD v1.3)
## Next-Generation HKCA Electronic Portfolio & Vocational Training System

---

## 1. Document Overview & Executive Summary

### 1.1 Problem Statement
The Hong Kong College of Anaesthesiologists (HKCA) currently relies on a legacy procedural PHP/MySQL Electronic Training Portfolio (ETP/EPS) built in the mid-2000s. While functional, the system suffers from severe structural limitations:
1. **Administrative Friction:** Critical workflows (ITA collation, rotation declarations, logbook case verification, exam vetting) are fragmented, resulting in delayed supervisor sign-offs and reliance on paper/email side-channels.
2. **Rigid Hardcoding:** Clinical domains, assessment forms (HKCA-E06), case volume requirements, and rotation intervals are hardcoded as table columns and application constants, making curriculum updates costly and technically risky.
3. **Clinical Burden & Poor Mobile UX:** The system is virtually unusable on mobile devices in operating theatre recovery bays, encouraging delayed retrospective batch logging.
4. **Vulnerable Governance:** Running balances of accredited time lack an immutable audit ledger, creating exposure during formal trainee appeals or remediation disputes.

### 1.2 Proposed Product Vision
Deliver a state-of-the-art, role-aware, mobile-first web application designed for operating theatre clinicians. The platform tracks anaesthesia trainees across a 6-year continuum:
$$\text{Basic Anaesthesia Training (BAT, 24m)} \longrightarrow \text{Higher Anaesthesia Training (HAT, 24m)} \longrightarrow \text{Provisional Fellowship Year (PFY, 12m)} \longrightarrow \text{FHKCA / FHKAM}$$

The platform combines an **executive supervisor triage console** (featuring an **HRM-style executive overview dashboard**, high-density **Linear Precision** tabular rosters with compact column presets, and **Stripe Executive** cards for individual trainee drill-downs) with an **offline-capable Progressive Web Application (PWA) logbook**, backed by an **extensible, schema-driven curriculum engine**. Design iterations follow the anti-slop, component-driven **Claude Design methodology** (referencing curated systems from 21st.dev, Land-book, and Linear).

---

## 2. Core Architectural Pillar: The Dynamic Curriculum Engine

> ### ⚠️ Critical Architectural Mandate (Dr. Albert Chan, 2026-10-01)
> *The system structure must remain stable, but future curriculum reviews will inevitably alter competency domains, assessment tools (e.g., Entrustable Professional Activities / EPAs), Volume of Practice minimums, ITA intervals, and WBA requirements. The architecture must guarantee that **no code deployment or schema migration is required when the College updates its curriculum**.*

### 2.1 Separation of Policy and Platform
The system strictly separates **Software Plumbing** from **Curriculum Policy**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CONFIGURABLE DATA LAYER (Policy)                     │
│  - Curriculum Editions (2017 v1.1, 2028 NextGen)                      │
│  - Assessment Tool Registry (ITA 15-item, CEX, CBD, DOPS, EPA, MSF)   │
│  - Form Rubrics & Behavioral Anchors (JSON Schema)                    │
│  - Progression Milestone Rules & Thresholds                           │
│  - Per-Centre Training Month Capacities & ICU Approved Units          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Evaluates against
┌───────────────────────────────────▼────────────────────────────────────┐
│                    IMMUTABLE CORE PLATFORM (Plumbing)                  │
│  - User Directory, Role Delegation & Handover Wizard                   │
│  - Accredited Time Ledger (Double-Entry Calendar-Month Accounting)    │
│  - Workflow State Machines & Multi-Party Handshakes                   │
│  - Offline PWA Sync & Tamper-Evident Audit Trail                       │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Dynamic Entities
1. **`curriculum_editions`:** Represents a formal curriculum publication (e.g. `HKCA-CURR-2017-v1.1`, `HKCA-CURR-2028-v1.0`). Trainees are bound to an edition upon registration, with version migration rules supported.
2. **`assessment_tools` & `form_templates`:** Tool definitions (e.g., College 15-Item ITA, Mini-CEX, DOPS, EPA) stored as structured JSON schemas. Defines question types, Likert scales, entrustment levels (1–5), behavioral anchor descriptors, and mandatory validation rules.
3. **`curriculum_milestones`:** Progression criteria stored as configurable records:
   - Threshold counts (e.g., VOP cases: BAT 218, HAT 615; Core Fundamentals CF-2.1 to 2.4 and Specialty Modules SM-3.1 to 3.11 stage/cumulative minimums).
   - WBA counts and cadence.
   - ITA mandatory intervals (e.g., standard 6 months vs. flexible 3-month modular blocks).
   - Prerequisite gates (Intermediate exam, Formal Project, 24/24 month rule).

### 2.3 Temporal Hospital & Cluster Accreditation Engine
To absorb Hospital Authority (HA) cluster realignments, hospital mergers, and College accreditation adjustments:
1. **Temporal Cluster Affiliations (`hospital_cluster_history`):** Hospitals are mapped to clusters with `effective_from` and `effective_until` timestamps. RBAC scopes and SOT reporting dynamically follow active affiliations while past rotations preserve historical cluster identities.
2. **Point-in-Time Center Accreditation (`accredited_centres`):**
   - Each accredited unit has explicit `accreditation_start_date` and `accreditation_end_date` bounds, accredited subspecialty types (`Clinical_Anaesthesia`, `ICU`, `Pain`), and trainee duration ceilings (e.g., default 36 clinical anaesthesia months per centre).
   - **Historical Immutability:** Rotation credit validity is determined by whether the center was accredited *at the time the rotation occurred*.
3. **Administrative Self-Service Registry:** College Administrators manage centers, renewal inspection dates, and cluster assignments via an administrative console. Automatic alerts notify administrators 12 months prior to any center's accreditation expiry.

---

## 3. User Personas & Role-Based Access Control (RBAC)

| Role | Persona & Scope | Primary Jobs to be Done |
| :--- | :--- | :--- |
| **Trainee** | Basic (BAT), Higher (HAT), or Provisional Fellow (PFY). Scoped to self. | Mobile logbook entry in recovery; setting 6-month learning goals and (as PFY) the PF year plan; WBA initiation; reviewing feedback; exam registration; exit portfolio compilation. |
| **Trainer / Assessor** | Specialist Anaesthetist / Consultant in accredited centre. Scoped to hospital. | Completing voluntary private ITA feedback (15 College items); bedside WBA evaluation; sees no learning plans (they are separate from the ITA). |
| **Logbook Verifier ASOT** | Assistant SOT / Designated Specialist. Scoped to assigned trainees. | Ongoing, year-round case verification, procedural recategorization, and VOP velocity monitoring for assigned cohort. |
| **Assigned SOT** | SOT or Assistant SOT. Scoped to assigned trainees per 6-month period. | Carried over from the previous period by default; the SOT can reassign at any time (for example if it did not work with the trainee). New joiners are assigned at the start. Signs the trainee's learning plans, reviews them near the end of the period, conducts the face-to-face meeting and executes the final summative ITA sign-off (final, no SOT countersign). |
| **Supervisor of Training (SOT)** | Clinical lead for training at hospital level. Scoped to hospital trainees. | Executive cohort triage via HRM dashboard; assigning SOTs at the start of each period; signing learning plans for own assigned trainees; private rotation planning and bilateral handshakes; delegating sign-offs; escalation management. |
| **Cluster SOT / COS** | Cluster Training Director / Chief of Service. Scoped to hospital cluster. A separate login, not an SOT permission. | Cross-hospital rotation oversight; Level 2 deadline escalation; second-step approval of the PF year plan and of any mid-year change to it (after the Assigned SOT); the Board of Education is informed automatically when a change is approved. |
| **College Admin / BOE** | HKCA Board of Education & Secretariat Staff. College-wide scope. | Accreditation registry; curriculum edition management; approving ledger credit revocations/appeals; appointment of replacement/acting SOTs; bulk CSV ingestion; formal project reviewer assignment. |

### 3.1 Role Delegation & Handover Protocol
1. **Ongoing vs. Cycle-Specific Split:**
   - **Logbook Verifier:** Ongoing operational assignment; verifies cases continuously. An unassigned logbook pool allows peer verifiers to claim unassigned trainees. Backed by `logbook_verifier_assignments` (see Database Schema and Data Model) &mdash; the legacy system had **no equivalent**: `patient2.approved_by` was free text with no foreign key, and any SOT/Assistant SOT could sign off any case ad hoc. The new table therefore starts empty at migration; every trainee needs a fresh initial assignment or sits in the unassigned pool.
   - **Assigned SOT:** Period-specific, carried over from the previous period by default so the learning plan can be signed within 2 weeks and the same person plans, reviews and later conducts the ITA. The SOT reassigns at any time (for example if the relationship did not work); pending sign-offs move with the trainee and plans already signed keep their original signer.
   - **No Suggested-ASOT Heuristics:** Assignment is explicitly driven by SOT clinical discretion; algorithmic matching is excluded.
2. **Transfer Responsibilities Wizard:**
   - Built into the SOT Console to reallocate trainees between supervisors.
   - Supports permanent reassignment or temporary leave cover with mandatory effective dates and automated reversion upon return.
   - In-flight queues re-point automatically; signed historical items permanently preserve the original signatory in the immutable audit log.
   - If an SOT vacates their post, interim or replacement SOT appointments are executed exclusively by the **College Admin**.

---

## 4. Product Scope & Phasing Boundaries

### 4.1 In Scope for MVP (Phase 1 — Launch Core)
* **Core Anaesthesia Training Pathway:** BAT (24m), HAT (24m), PFY (12m), and Fellowship exit nomination.
* **Accredited Time Ledger & Handshake Rotations:** Double-entry calendar-month accounting with bilateral private-plan-to-handshake confirmations, structured departmental cover, and centre duration guardrails.
* **11 Approved ICU Training Units:** Tracking mandatory 6-month ICU rotations constrained strictly to College-accredited units with joint/legacy ICM curriculum rules.
* **Configurable Curriculum Engine:** Versioned rules, dynamic form rubrics, and JSON behavioral anchors.
* **2-Tier ITA Engine (Official 15-Item Form):** Private voluntary trainer feedback $\rightarrow$ SOT/ASOT summative synthesis $\rightarrow$ Trainee in-person sign-off (ASOT sign-off final; no SOT countersign).
* **Learning Plans (two types, linked to the ITA via goal-achievement review, §2.4):** 6-month goals and the PF year plan share one workflow: 2-week drafting $\rightarrow$ Assigned SOT sign-off and locking (PF plan: then Chief of Service approval) $\rightarrow$ versioned change proposals $\rightarrow$ formative end-of-period review (not graded) $\rightarrow$ goal-achievement graded by the Assigned SOT during ITA synthesis (advisory only, never shown to trainers).
* **Dual-Track Volume of Practice (Logbook):** Hospital-only case logging with 2-year retrospective lock, AI/heuristic classification, `To verify` queue with milestone-lock reopening rules, and `Browse trainee progress` featuring Cohort Heatmaps and expandable domain-to-item minimums.
* **Executive SOT Console:** HRM-style overview dashboard (colour-coded KPI cards, ITA assignment donut, unified all-trainee denominators, Needs Attention queue, monthly reminder drawer) and compact roster with "Essential" column presets.
* **External WBA Asynchronous Sync:** Ingestion integration with HKAM iWBA API (reflecting JCIMED specifications and quarantine conflict handling).
* **Secretariat Bulk CSV Ingestion Engine (S1):** Batch ingestion tool for mandatory courses, exam results, and cohort allocations with dry-run validation dockets.
* **One-Click Fellowship Exit Dossier Compiler (S2):** Automated generation of cryptographic 8-part exit application portfolios.
* **Trainee Document Lifecycle (S3):** Pre-verification draft/replace workflows for PFY exit documents and certificates.
* **Unified Echocardiography Logbook (S4):** Seamless integration of Echo DOPS and procedural case logs into core VOP dashboards.

### 4.2 Explicit Non-Goals / Deferred to Phase 2
* **Intensive Care Medicine (ICM) Specialty Module:** Standalone ICM tutorials, QR-code check-ins, and dedicated ICM assessments are deferred to Phase 2 (schemas reserved).
* **Pain Medicine Module:** Specialized chronic/acute pain logbooks and pain ITA modules deferred to Phase 2.
* **Automated Project Reviewer Matching Algorithm:** Handled via admin console assignment in MVP.
* **Annual Competence Review Committee (ACRC / ARCP Engine):** Automated panel scoring UI deferred to Phase 2 (underlying data models and docket queries established in Phase 1).

---

## 5. Functional Feature Specifications (P0 Priority)

### Feature 1: The Accredited Time Ledger & Bilateral Rotation Engine (P0)

* **1.1 Private Planning & Exam Result Triggers:**
  * SOT drafts rotation allocations privately without triggering notifications.
  * Rotations may carry an optional **Exam Condition** linked to upcoming Intermediate/Final exam sittings with a configurable "decide-by" date and fallback plan.
  * Upon release of exam results, the SOT triggers the transition (*Passed / Not passed / Plan changed*), selecting whether the trainee rotates as planned, stays at the parent hospital, or redirects to an alternate centre.
* **1.2 Bilateral Handshake Protocol:**
  * Replaces informal off-system email negotiations with an authoritative digital confirmation:
    $$\text{Private Plan} \longrightarrow \text{Sending SOT Confirms \& Sends} \longrightarrow \text{Receiving SOT Confirms} \longrightarrow \text{CONFIRMED}$$
  * A rotation within the same hospital requires only a single confirmation by the home SOT.
  * Receiving SOT may either *Confirm* or *Return with note*.
* **1.3 Structured Rotation Parameters & Durations:**
  * Exact calendar-date windows with derived durations (supporting flexible 3-month modular blocks, e.g., HK Children's Hospital postings).
  * Destination pickers include all Hospital Authority hospitals grouped by cluster, plus "Other" and an explicit *"Stay at parent hospital"* selection.
  * Replaces free-text rotation notes with structured requirements:
    - Requirement type (Course, Specialty exposure, Subspecialty modular block).
    - Start and end dates.
    - Funding source.
    - **Departmental Cover:** Structured flag indicating whether the department requires locum/staff backfill during the trainee's outward posting.
  * Learning goals are **decoupled** from the rotation proposal and managed under Feature 2.
* **1.4 Accredited Centre & ICU Training Unit Guardrails:**
  * **Centre Capacity Alert:** System maintains accredited maximum training capacities per centre (default ceiling: 36 clinical anaesthesia months). Warns SOT and alerts College Board Admin if an allocation would cause a trainee to exceed the centre limit.
  * **ICU Rotation Restriction:** When rotation type is `Intensive Care`, destination is strictly restricted to the **11 HKCA-approved ICU training units**:
    - *Joint ICM Curriculum (Higher Training from Jul 2023):* Category A (PMH, PWH, PYNEH, QEH, TMH, UCH) and Category B (AHNH, KWH, NDH, POH, YCH).
    - *Legacy ICM Curriculum:* Validates duration limits (12m vs 24m) and warns if the proposed rotation outlasts the unit's approval expiry date.
* **1.5 Double-Entry Ledger Accounting:**
  * Credits are committed to `accredited_time_ledger` in exact calendar months upon satisfactory ITA completion.
  * Revocation / amendment authority is restricted exclusively to the **Board of Education (BOE)** with fixed audit reason codes (`conflict_of_interest`, `non_accredited_site`, `successful_appeal_overturn`, `administrative_error`, `curriculum_rule_change`).

---

### Feature 2: 2-Tier ITA Pipeline & Per-Cycle Learning Goals (P0)

* **2.1 Tier 1: Voluntary Trainer Feedback Layer:**
  * SOT/ASOT invites supervising specialists to provide feedback.
  * Assessors complete the official College **15-item In-Training Assessment form** (9 Clinical Performance + 6 Communication, Teamwork and Interpersonal items), grading against level/year expectations:
    - `1` Consistently exceeds · `2` Occasionally exceeds · `3` Usually meets (Pass) · `4` Unsatisfactory · `X` Unable to assess.
  * Concrete examples are mandatory **only for ratings of 4** (unsatisfactory ratings must be legally defensible); optional for 1, 2, 3, and X.
  * **Voluntary Feedback Principle:** Trainer forms carry no artificial "overdue" state. SOT dashboard monitors forms received and surfaces a **"Thin input" alert** when fewer than 3 forms are returned (default threshold). Assessors with linked WBAs for the trainee are highlighted as recommended responders.
  * **ITA Round Lifecycle (Albert directive 2026-10-19):** Each assessment period opens one round when the SOT clicks **"Initiate ITA & invite all trainers"**, sending one batch of invitations logged with an open timestamp. The SOT may send follow-up reminders to non-responders within the same round rather than opening a new one. A round stays open until the SOT moves to synthesis; starting synthesis below the minimum-forms threshold is allowed but requires an explicit **"start anyway" override**, logged with the form count at the time.
  * Individual trainer submissions are sealed with a cryptographic hash and strictly confidential from the trainee.
  * A trainer may edit a submitted form until the SOT's round closes. Each version is hashed and kept in the audit trail; the SOT team always reads the latest submitted version, and the form locks when the round closes.
* **2.2 Tier 2: Summative Synthesis & ASOT Delegation:**
  * SOT console displays the full distribution spread across all 15 items. If trainer ratings diverge by $\ge 2$ levels, the synthesizer must document a rationale.
  * The summative sign-off is held by the trainee's **Assigned SOT** (SOT or ASOT, set at period start). The ASOT's sign-off is **final and authoritative** (no SOT countersign required).
  * Consolidated grades for the 15 items start completely blank (no automated pre-fill).
  * **College Overall Rule:** Overall rating is automatically locked to `4 (Unsatisfactory)` if 4 or more of the 15 consolidated items are rated 4. If fewer than 4 items are unsatisfactory, the synthesizer may still issue a discretionary 4 but must record an explicit clinical justification. Items rated `X` do not count toward the failure threshold.
  * **Divergence Rule, Scaled for Panel Size (Albert directive 2026-10-19):** Trainer ratings diverging by $\ge 2$ levels require a documented rationale. For panels of 5 or fewer trainer forms, a single outlier is treated as a meaningful signal (unchanged rule). For panels of 6 or more, divergence requires **at least 2 trainers at each end of the gap** — a lone outlier in a large panel is normal variation, not signal, and should not force a justification on nearly every item.
  * **Learning-Contract Gate (cohort-scoped, Albert directive 2026-10-19):** The Assigned SOT cannot open Tier 2 synthesis until the trainee's current-period learning contract (§2.4) is signed — the ITA holds at status `waitcontract` until then. This gate is intentional policy going forward, introduced alongside the ongoing curriculum review, but applies **only to trainees who start training under that review**. Legacy/already-training trainees are exempt by default at migration (see §7) — the rule is never applied retroactively to trainees who never trained under it. The exact cohort cut-off date is a College/Board of Education policy decision, configurable, not hardcoded.
* **2.3 Mandatory Face-to-Face Sign-Off:**
  * Trainee reviews consolidated feedback &mdash; the overall assessment, the 15 item grades, and the SOT's comments, never an individual trainer's form &mdash; during a mandatory in-person meeting.
  * Signing confirms the meeting happened and the grade was explained, not agreement with the grade. If the trainee does not sign, the record simply stays unsigned &mdash; the system does not host a dispute or appeal workflow.
  * **Appeals happen outside the system (Albert directive 2026-10-19):** a trainee who disagrees raises it with the College directly, by email. The College/Board of Education panel process for hearing and ruling on a dispute is explicitly out of scope for the ePortfolio.
  * The system still records `sot_grade` and a `final_grade`. College Admin may manually update `final_grade` to reflect an externally-concluded Board of Education ruling (uphold / overturn / re-assess), with the ruling and reasoning logged for audit &mdash; an administrative record, not an in-app appeal flow. Progression gates evaluate `final_grade`.
  * Production sign-off is an **electronic signature** &mdash; the trainee authenticates with their own ePortfolio login (username and password) &mdash; not a drawn signature.
* **2.4 Learning Plans Workflow (P0), linked to the ITA via goal-achievement review (confirmed 2026-10-19 &mdash; corrects earlier "delinked" framing):** two plan types share one engine. Goal achievement is reviewed and graded by the Assigned SOT as part of ITA synthesis (§2.2) and shown to the trainee alongside the 15 items. What stays true from the original "delinked" intent: goals are **never shown to trainers** and never appear on the trainer form, and a Partially/Not Achieved goal is **advisory only** &mdash; it does not affect the ITA's overall grade or the College Overall Rule (§2.2), the same non-blocking soft-signal pattern as the $\ge 2$ lifetime unsatisfactory-ITA flag in §5.3.
  * **Plan types:**
    - `SIX_MONTH` (6-month learning goals, all stages): 2-5 goals, one per 6-month period.
    - `PF_YEAR` (Provisional Fellow year plan, PFY trainees, in addition to the 6-month goals): one per PFY year, three domains: **Clinical, Management, Education**, at least one goal in each (up to 3 per domain).
  * **Drafting:** the trainee is notified at period start and drafts within **2 weeks**. Each goal has a domain, objective, measurable success criterion and evidence. 6-month goals draw on curriculum domains (Clinical Fundamentals `CF-2.x`, Subspecialty `SM-3.x`), a shortlist of four ITA competencies (clinical skills, crisis management, teamwork, communication), or `Other`; the picker suggests domains from the current rotation.
  * **Assigned SOT:** every trainee keeps their Assigned SOT from the previous period by default (new joiners are unassigned until the SOT assigns one). The SOT can **reassign** at any time, for example when the working relationship did not work, and pending sign-offs move with the trainee while signed plans keep their original signer. The Assigned SOT, or the SOT for any assigned trainee, reviews, requests changes, or signs and locks. An unassigned trainee's plan cannot be signed (alert to the SOT).
  * **PF year plan approval:** Assigned SOT signs, then the **Chief of Service** approves and locks (`AWAITING_COS` state). A Chief of Service may send it back with a comment.
  * **Mid-period changes:** locked plans change only through "Propose change", version-controlled. 6-month goals: re-approved by the Assigned SOT. **PF year plan: Assigned SOT approves, then the Chief of Service approves (`CHANGE_COS` state), and the Board of Education is informed automatically** (notification and audit entry, no approval step). The signed plan stays in force until the final approval; a decline at either step leaves it unchanged.
  * **Separate Chief of Service role:** the Chief of Service is its own login with a narrow console (PF year plans waiting for approval, and PF plan changes), not an SOT permission. SOT and ASOT cannot give the COS approval.
  * **Formative review:** opens a configurable lead time before the period ends (default 4 weeks). The trainee notes progress on each goal (PF plan: also a year summary, the completion report) and sends it; the Assigned SOT adds a comment and marks it reviewed. No Achieved/Partly/Not grade; no effect on the ITA or progression.
  * **Reminders (configurable):** no Assigned SOT after period start; plan not submitted after 2 weeks; plan or review awaiting the signer for 7 days; review not sent.

---

### Feature 3: Offline-Capable Volume of Practice (Logbook) & VOP Analytics (P0)

* **3.1 Mobile-First PWA & Hospital Scoping:**
  * Installable PWA with local `IndexedDB` caching for offline operating theatre entry ($<45\text{s}$ target entry time).
  * **Hospital-Level Scoping:** Case locations are recorded at the **Hospital** level only. Theatre identifiers are deprecated to eliminate clutter and maintain cross-hospital consistency.
* **3.2 2-Year Retrospective Lock:**
  * Cases logged where $\text{first\_logged\_at} - \text{case\_date} > 2\text{ years}$ are stored for personal audit but permanently flagged `is_accredited = false`.
* **3.3 AI / Heuristic Curriculum Classifier:**
  * Client-side model suggests curriculum descriptor codes (e.g. 2.1 General, 2.2 Regional, 3.5 Obstetric) with confidence indicators. Trainee confirms or overrides.
* **3.4 SOT Verification Console (`To Verify`):**
  * High-density verification queue grouped by trainee with bulk approval for clean cases, attestation modals, and immediate undo toasts.
  * Segmented tabs: *Ready to Approve · Needs a Decision (Ambiguous) · Duplicates · Verified*.
  * Ambiguous cases require resolving classification chips before approval. Duplicate cases credit case volume while suppressing duplicate procedural hours.
* **3.5 Retrospective Reopening Window:**
  * SOT or designated verifier can reopen and recategorize a verified case **until a formal stage milestone locks it** (e.g. BAT Exit, Intermediate Exam gating).
  * Once a case is milestone-locked, amendments require a formal BOE ledger amendment request.
* **3.6 Trainee VOP Progress Analytics (`Browse Trainee Progress`):**
  * **Cohort Heatmap:** Matrix displaying all trainees across Core Fundamentals (CF) and Specialty Modules (SM). CF domains are benchmarked against stage-specific minimums (green/amber/rose); SM domains are shaded neutral blue against exit requirements.
  * **Progress by Trainee:** Deep-dive view showing verified (solid) and pending (lighter shade) progress bars against curriculum requirements:
    - *Core Fundamentals (CF-2.1 to 2.4):* Expandable to discrete procedure item minimums (Basic Training vs. Cumulative Higher Training targets).
    - *Specialty Modules (SM-3.1 to 3.11):* Benchmarked against Fellowship exit minimums.
  * **All Cases Log:** Detailed tabular record per trainee with multi-column sorting, search, category-change filters, and full CSV export.
* **3.7 Caseload Velocity Metric:**
  * Evaluates volume velocity per eligible clinical anaesthesia month:
    $$\text{Velocity} = \frac{\text{Total Logged Cases}}{\text{Accredited Months (Excluding ICU \& Extended Leave)}}$$
  * Automatically suspends caseload alerts while trainees complete mandatory ICU blocks.
* **3.8 Trainee Logbook View (Trainee Dashboard, "Logbook (VOP)" tab):**
  * **Progress view:** CF-2.1 to 2.4 against the stage minimum (green/amber/rose), SM-3.1 to 3.11 as neutral progress against exit requirements. Approved cases are solid; waiting, under-review and revision-requested cases are the lighter segment. Only `approved` cases count. The headline is the capped CF total (for example 608 of 615), not a raw case count. Selecting an item opens its cases.
  * **All cases view:** one row per case with date, hospital, operation and surgical diagnosis, requirement, technique, ASA, supervision level and status; search, requirement, procedure-type, status and source filters (`All`, `Needs classification`, `Imported from old logbook`, `Logged here`, `Logged over 2 years late`).
  * **Case detail:** every legacy field is visible: case reference, date, hospital, training level at entry, requirement and CF domain flags, surgical diagnosis, technique, up to six regional blocks, duration, ASA, patient age, supervision, remarks, and the full verification trail (logged, imported, each verifier action with who, role, date and note).
  * **Log a case:** date, hospital, primary operation, surgical diagnosis, curriculum requirement, technique (multi-select), up to six regional blocks, ASA, supervision level, duration, patient age, remarks. Training level is added automatically. **No patient name, HKID or hospital number is collected**; each case gets a synthetic `case_ref`.
  * **Entry checks:** a probable duplicate (same trainee, date, hospital, ASA, age and operation) warns and needs a second confirmation; a case more than 2 years old saves but is flagged `is_accredited = false` and says so at once.
  * **Verification states shown to the trainee:** four: Waiting for verifier, Approved, Revision requested, Rejected. "Waiting for verifier" covers both `pending` and `under_review` in the data model, because the trainee cannot act on either and neither counts toward progress. The legacy logbook has no "under review" step either. `under_review` stays in the schema and can be shown to trainees later if the verifier screen records that a case was opened. A `revision_requested` case can be edited and resubmitted; it returns to Waiting. Rejected cases are kept and never count.
* **3.9 Legacy Logbook Import and Merge:**
  * Every legacy `patient2` row is imported with its approval status, approver, approval date and notes preserved (Migration Plan §6.8). Patient HKID, date of birth and sex are not imported.
  * **Classification:** legacy free-text claims are normalised to descriptor codes (2.1 to 2.4, 3.1 to 3.11). A row whose claim cannot be matched is still imported but has `needs_classification = true`, does not count toward any requirement, and appears on the trainee's logbook with a "Classify" action. Once the trainee classifies it, it returns to `pending` for the verifier to confirm (`classified_by = trainee`).
  * **Merge:** the import is idempotent on `(legacy_tid, legacy_pid)`, so it can be re-run for the delta right up to cutover. It never overwrites or deletes a live case. A legacy case that looks like a hand-entered one is imported and the pair goes to a review list.
  * **Reconciliation gate:** rows in = imported + quarantined, and the cutover is blocked until per-trainee approved counts match legacy exactly (§7, CI parity suite).
  * **Notice to the trainee:** the logbook states how many cases came from the previous e-logbook, the import date, and how many need classification.

---

### Feature 4: Workplace-Based Assessments (WBA) & HKAM iWBA Linkage (P0)

* **4.1 Supported Modalities:** CEX (shown to users as Mini-CEX), CBD, DOPS, ALMAT and MSF are in use. EPA is reserved in the schema for possible future adoption. **PBA and ACR will not be used.** The iWBA enum still lists them, so an assessment with any modality outside the six values is quarantined to `wba_sync_conflicts`, never mapped by guess.
* **4.2 SSO & Asynchronous Sync (JCIMED Compliant, spec refreshed 2026-10-20):**
  * Deep-link initiation pre-populating HKAM ID, supervisor ID and descriptor codes via OAuth2 SSO.
  * Decoupled pull-only ingestion daemon (the API has no webhooks). Each cycle: (1) read the stored cursor; (2) page `GET /summary?updated_since=<cursor minus a 5-minute overlap>` with `has_more` until exhausted; (3) fetch full records with `POST /assessments/batch` in groups of up to 50; (4) upsert idempotently; (5) only then advance the cursor to the highest `updated_at` seen. The overlap and idempotent upserts are there because the spec does not define result ordering.
  * A cursor older than 90 days (for example after downtime) is caught up with explicit `updated_before` slices of at most 90 days. The initial historical load uses `GET /backfill/summary`, which has no 90-day cap but is switched on by JCIMED per token for a limited window; ask for it before rollover.
  * Respect 60 requests/min and 10/s per token: on 429, wait for `Retry-After` and retry with backoff. The base URL and token come from configuration and the secret store, never from code or the repository, because the development URL may change at HKAM production cutover.
  * Idempotent upserts on `iwba_assessment_id` (the iWBA UUID) with immutable snapshots of the trainee, trainer, hospital and `timeline`. Records that cannot be linked, carry an unknown modality or conflict with an existing record go to `wba_sync_conflicts` with the raw payload.
  * Tolerate nulls: trainer name, hospital, ward, procedure and timeline can all be null or empty, especially in backfilled history.
* **4.3 Identity Resolution:** The API provides `iwba_user_id` (stable, always present) and `hkam_id` (null until HKAM SSO sign-in), and **no email, MCHK or college trainee number**. Matching is therefore a one-time link, not a lookup on every record: (1) a stored link in `wba_iwba_links` wins; (2) otherwise `hkam_id` against a user who signed in through SSO; (3) otherwise the assessment is held as unlinked and College Admin sees a queue with name and hospital suggestions and confirms the link once; (4) alternatively College Admin uploads a CSV of `iwba_user_id` and HKCA trainee number. Unlinked assessments are kept and attached automatically when the link is made. Name alone never creates a link.
* **4.4 Curriculum Mapping:** Assessments are classified to a curriculum code (`CF-2.x`, `SM-3.x`, `PFY`, `MSF`, `ECHO-WBA`) from the code JCIMED returns once the mapping pack is adopted. Until then the code is derived from `procedure.code` through a College-maintained mapping table, and unmapped items are listed for College Admin. The trainee's stage at the time of an assessment is derived from the assessment date and `training_stage_history`, not trusted from the source.
* **4.5 Deleted or Voided Assessments:** The API gives no deletion signal, so an assessment that disappears from iWBA is not removed here. Reconciliation is by periodic full-window comparison, and treatment of voided records is pending JCIMED's answer.

---

### Feature 5: Executive SOT Triage Console (P0)

* **5.1 HRM-Style Overview Dashboard:**
  * Top-level landing view featuring 6 colour-coded pastel KPI cards (ITA, Logbook, Goals, Rotations, Trainer Forms, Progression Risk).
  * Radial visualizer: "ITAs assigned to SOT team" donut tracking unassigned, assigned, and completed sign-offs.
  * Action Queue ("Needs Attention") surfacing prioritized items across all trainees.
  * Reminder rules drawer allowing SOTs to customize lead times (e.g., alert if no Assigned SOT has been set a set time after the period starts, plans not submitted or not signed, reviews waiting; monthly cumulative logbook reminder).
  * **Unified ITA & Learning Cycle View:** per-trainee ITA tracking and per-cycle learning-goal tracking are presented as one consolidated view, not two separate tabs, reflecting §2.4's goal-achievement linkage to the ITA.
* **5.2 Compact Trainee Roster & Column Presets:**
  * High-density table with sticky headers, "Last, First" naming, and stage pills (BAT blue, HAT teal, PFY violet).
  * **"Essential" Column Preset:** Toggles between full data grid and high-priority columns: *Trainee · Stage · Rotation · Accredited Time · VOP Progress · Action*.
* **5.3 Progression Risk Gating:**
  * Dedicated Risk board surfacing trainees with stalled caseload velocity, overdue milestones, or $\ge 2$ lifetime unsatisfactory ITAs (H8 policy).

---

### Feature 6: Formal Projects, Exams & College Gatekeeping (P0)

* **6.1 Formal Projects (HKCA-E03):** 2-stage submission (Protocol $\rightarrow$ Manuscript) with double-blind reviewer interface and 30-day automated timer with admin reassignment. Each project carries a **College-issued project number** and its **title**, and a dated **submission record**: every protocol and manuscript submission, resubmission (with version number), revision request (with the trainee-visible outcome, never the reviewer's identity) and approval. The trainee sees the title, number, stage path and record on the Courses & Project tab (read-only; discrepancies are flagged to College Admin) and the number and title on the Overview Exit requirements tile. Legacy records hold only the title, project number and approval date, so migrated projects show those and a single backfilled entry for the final manuscript approval (the legacy date is the final approval); all four stages show complete and earlier submission history cannot be recovered.
* **6.2 Real-Time Exam Gating:** High-stakes eligibility checks querying live base tables ($<5\text{ms}$) followed by SOT digital endorsement.
* **6.4 Trainee Overview Structure (Trainee Dashboard, Overview):** the Overview answers one question, "what do I need to do next?", and holds five blocks only: (1) **Next steps**, one list of up to 3 items ordered by urgency with one primary action, the rest behind "N more", and a muted "waiting on others" line (ITA reflection or signature, learning goals, logbook revisions, certificate uploads, imported cases to classify); (2) **Where I am**, the stage path with exam passes (see 6.3) and a one-line "Time in training" that expands to the breakdown; (3) **Next gate**, the five Provisional Fellowship requirements as a checklist with counts and status words (not colour alone), each row linking to its tab; (3b) **Exit requirements**, a slim panel of three tiles for what is needed before Exit Assessment: Mandatory courses (count, a chip per course, outstanding course named), Formal Project (project number and title, plus a four-step path: protocol submitted, protocol approved, manuscript submitted, manuscript approved) and Specialty Modules WBA; (4) **How I compare**, collapsed by default with its headline percentiles visible. Courses, rotation and the learning-goals card live in their own tabs (Courses & Project; ITA & Assessments). Folded state is remembered per trainee.
* **6.3 Progression Record (Trainee Dashboard, Overview):** a dated record of each stage the trainee has moved through and each exam passed: start of Basic Training, Intermediate Examination passed, move to Higher Training, Final Fellowship Examination passed, start of the Provisional Fellowship (PF) year, Exit Assessment and Fellowship. The Overview path shows these six points only; the HAT year (HAT-1, HAT-2) appears in the stage chip, not the path. Dates come from the College record (`training_stage_history` and `exam_results`) and are read-only for the trainee. Stages and exams not yet reached show "Not yet". The Final Fellowship Examination row agrees with the Next Gate card. Exam passes arrive by the Secretariat ingestion stream (§5.7) and are stored per attempt, so a trainee who passed on a second attempt shows the passing attempt's date and the attempt number.

---

### Feature 7: Administrative Bulk Ingestion Engine (S1, P0)

* **7.1 Purpose:** Enables College Secretariat staff to batch-import external events and historical records without manual record-by-record entry.
* **7.2 Ingestion Streams:** Mandatory course completions (EASE, EMAC, ADAM-A, ECHO-A, UGRA), Fellowship examination results (Intermediate / Final pass lists), cohort rotation allocations, and accredited training centre capacity updates.
* **7.3 Architecture & Validation:**
  - Client-side CSV/Excel parsing and schema validation against active trainee identifiers.
  - Interactive dry-run docket displaying matched trainees, unregistered records, and diff previews.
  - Transactional database commits with complete rollback upon validation failure.
  - Comprehensive audit log linking imported records to the authenticated administrator.

---

### Feature 8: One-Click Fellowship Exit Dossier Compiler (S2, P0)

* **8.1 Purpose:** Automates the compilation of the final Fellowship Exit Application dossier at month 70–72, replacing manual paper/PDF assembly.
* **8.2 Dossier Structure:**
  1. *Executive Summary & Verification Hash:* Cryptographically sealed snapshot of training completion.
  2. *Accredited Time Ledger Attestation:* Verification of 72 accredited calendar months across BAT, HAT, and PFY.
  3. *Volume of Practice Compliance Audit:* Verification of 218 BT cases, 615 HT cases, and subspecialty module quotas.
  4. *Multi-Source Feedback (MSF) Dossier:* Consolidated summaries of 3-stage MSF evaluations.
  5. *Longitudinal ITA Ladder:* Full chronological sequence of summative 15-item ITAs.
  6. *Mandatory Course Certificates:* Attested completion records for EASE, ADAM-A, EMAC, ECHO-A, and UGRA.
  7. *Formal Project Completion Sign-Off:* Approved protocol and manuscript records.
  8. *Examination Passing Records:* Intermediate and Final HKCA Fellowship examination attestations.
* **8.3 Export Formats:** Standardized high-craft College PDF dossier and secure digital verification view for Board adjudicators.

---

### Feature 9: Trainee Document Lifecycle & Versioning (S3, P0)

* **9.1 Purpose:** Governs pre-verification draft and update workflows for supporting certificates and PFY exit documentation.
* **9.2 State Machine:**
  - Trainees upload, amend, or replace documents while status is `DRAFT` or `PENDING_REVIEW`.
  - Upon review by SOT or Secretariat, status transitions to `VERIFIED` and the file is permanently locked.
  - Rejected submissions transition to `ACTION_REQUIRED` with mandatory reviewer feedback, allowing trainee re-upload while preserving previous rejection history in the audit log.

---

### Feature 10: Unified Echocardiography Logbook & DOPS (S4, P0)

* **10.1 Purpose:** Unifies Echocardiography case logging and DOPS assessments into the core ePortfolio platform.
* **10.2 Workflow Modernization:**
  - Trainees log echocardiography studies (TTE / TOE) with procedural tagging and clinical indications.
  - Echo DOPS evaluations utilize tokenized magic-link email workflows, eliminating legacy credential-sharing workarounds.
  - Direct integration into Trainee Dashboard and SOT Departmental Overview alongside core subspecialty domains.

---

## 6. Non-Functional Requirements (NFRs)

| Domain | Specification | Acceptance Criteria |
| :--- | :--- | :--- |
| **Performance** | Progression Gate Evaluation | Live base table query executes in $< 5\text{ ms}$; zero reliance on stale materialized views. |
| **Usability SLOs** | Clinical Interaction Timing | Mobile case entry $< 45\text{s}$; Trainer ITA $< 5\text{min}$; SOT synthesis $< 10\text{min}$. |
| **Concurrency** | Optimistic Record Locking | Multi-user collisions prevented via `version INT NOT NULL DEFAULT 1` checks. |
| **Security & Privacy** | PDPO & Medical Data Sovereignty | Zero plaintext HKIDs stored; patient identifiers anonymized (synthetic `case_ref`); database-level append-only role for audit logs. |
| **Auditability** | Cryptographic Hash Chaining | Tamper-evident ledger using `sha256(prev_hash + row_data)`. |
| **Retention** | Lifecycle Schedule | Training records kept permanently; audit logs hot for 24m / cold for 7yr; abandoned drafts purged at 180d. |
| **AI Governance & Safety** | Model Contract & Prompt Architecture | All AI services operate strictly under `draft_only` authority with named clinical reviewers; prompts enforce cache breakpoint separation (<25k dynamic tokens); empirical task eval concordance $\ge 90\%$. See [[Model Contract — SOT Review and Progression Assistant]]. |

---

## 7. Migration & Rollover Requirements

1. **Active Cohort Scope:** Migration is strictly scoped to **currently active trainees (BAT, HAT, PFY, approved interruptions)** and incoming intakes. Alumni records remain archived in read-only legacy cold storage.
2. **Automated CI Parity Suite:** Automated parity verification must run in CI across 100% of the active migrating cohort, validating zero calculation drift across:
   - Accredited calendar months.
   - WBA category tallies.
   - Verified surgical logbook counts.
   - Historical ITA outcomes and remediation plans.
3. **Data Provenance:** Every migrated record carries `legacy_table`, `legacy_pk`, and `migrated_at` timestamps.
4. **Learning-Contract Gate Exemption (Albert directive 2026-10-19):** The §2.2 contract-signing gate applies only to trainees who start training under the curriculum review that introduces it. All migrated/legacy trainees default to gate-exempt (`learning_contract_gate_required = false`) &mdash; they never trained under this rule, and applying it retroactively would newly block in-flight trainees on the day of cutover.
5. **No Legacy Logbook Verifier Data to Migrate:** The legacy system (`patient2.approved_by`) had no persistent verifier assignment &mdash; any SOT/Assistant SOT could sign off any trainee's case, recorded per-case as free text with no foreign key. The new ongoing Logbook Verifier role (§3.1) starts with an empty `logbook_verifier_assignments` table at cutover; every trainee needs a fresh initial assignment or sits in the unassigned pool.
6. **Legacy Logbook Import (`patient2`):** imported by `domain/vop/legacyImport.ts` as specified in Migration Plan §6.8. Requirements: idempotent re-run, quarantine of rows with no matching trainee or no case date, no patient identifiers carried over, approval states and approver preserved, 2-year-rule anomalies flagged rather than dropped, and a per-trainee approved-count reconciliation to legacy before cutover. Unclassifiable rows are imported as `needs_classification` and resolved by the trainee, not discarded.

---

## 8. Requirements Traceability Matrix

| PRD Section | Audit Finding / Directive | Implementation Component |
| :--- | :--- | :--- |
| **§2 (Curriculum Engine)** | Future Curriculum Review Flexibility | `curriculum_editions`, `form_templates`, `curriculum_milestones` |
| **§5.1 (Ledger & Rotations)** | M2, M3, H5, F5, Albert Rotations Directives | `accredited_time_ledger`, Bilateral Handshake, ICU 11-Unit Filter |
| **§5.2 (2-Tier ITA & Goals)** | M1, M6, H1, H8, I1, Albert ITA/Goals Directives | 15-Item Form, Voluntary Trainer Forms, Learning Plans (6-month goals, PF year plan), Assigned SOT, ASOT Final Sign-Off |
| **§5.3 (PWA Logbook & VOP)** | H5, U2, U3, U4, Albert VOP Directives | Mobile PWA, Hospital-Only Scoping, Milestone Reopening, Cohort Heatmap |
| **§5.3.8 to 5.3.9 (Trainee Logbook, Legacy Import)** | Albert directive 2026-10-22; Legacy EPS Schema Audit §5 | Case detail and entry with legacy fields, 4-state trainee verification, `domain/vop/legacyImport.ts`, `tests/domain/run_vop_import_tests.ts` |
| **§5.6.3 (Progression Record)** | Albert directive 2026-10-22 | `training_stage_history`, `exam_results` |
| **§5.4 (WBA & iWBA)** | E2, Albert Directive | OAuth2 SSO, Background Polling Daemon |
| **§5.5 (SOT Console)** | H2, Direction B, Albert HRM Directives | HRM Dashboard, Unified Denominator, Essential Columns Preset |
| **§5.6 (Gatekeeping & Exams)** | E1, E6 | Live Base Table Queries, 30-Day Project Timer |
| **§5.7 (Admin Ingestion)** | S1 (Stakeholder Survey / Secretariat) | Batch CSV Ingestion Worker & Dry-Run Preview |
| **§5.8 (Exit Dossier Compiler)**| S2 (Stakeholder Survey / Secretariat & SOTs) | One-Click Cryptographic Portfolio Compiler |
| **§5.9 (Document Lifecycle)** | S3 (Stakeholder Survey / Secretariat) | Mutable Pre-Verification Document State Machine |
| **§5.10 (Echocardiography)** | S4 (Stakeholder Survey / SOT Consensus) | Unified Echo Logbook & Tokenized Echo DOPS |
| **§6 (NFRs & Security)** | M4, M5, H6, H7, E1, E4 | Append-Only Hashes, Base Table Queries, `ON DELETE RESTRICT` |
| **§5.5 & §6 (AI Safety)** | Albert Directive / Model Contract | `draft_only` Hard-Stop, Pinned Snapshot, Cache Breakpoint |
| **§7 (Migration)** | E5, Rollover Plan | Scoped Active Migration, CI Parity Suite |
| **§2.2 (ITA Round Model & Contract Gate)** | Albert Directive 2026-10-19 | `itas.status='waitcontract'`, round lifecycle fields, cohort-scoped `trainee_profiles.learning_contract_gate_required` |
| **§2.3 (Appeals Removed from App)** | Albert Directive 2026-10-19 | `itas.boe_ruling*` admin-entered fields; no in-app appeal/BOE UI |
| **§2.4 (Goals Linked to ITA)** | Albert Directive 2026-10-19 | Goal achievement graded in ITA synthesis; advisory-only Not Achieved flag |
| **§3.1 (Logbook Verifier Entity)** | Prototype Workflow Appraisal 2026-10-19 | `logbook_verifier_assignments` (no legacy predecessor) |
