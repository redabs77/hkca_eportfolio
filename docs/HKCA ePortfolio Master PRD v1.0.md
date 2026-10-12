---
type: prd
project: "[[HKCA Portfolio Revamp]]"
version: "1.1.0"
date: 2026-10-06
status: draft_for_review
stakeholders:
  - "Dr. Albert Chan (Chief of Service / Project Lead)"
  - "Hong Kong College of Anaesthesiologists (HKCA) Board of Education"
  - "Tina Huang / Engineering Team"
---

# Master Product Requirements Document (PRD v1.0)
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

The platform combines an **executive supervisor triage console** (featuring a high-density **Linear Precision** tabular roster for multi-trainee overview transitioning into **Stripe Executive** cards for individual trainee drill-downs) with an **offline-capable Progressive Web Application (PWA) logbook**, backed by an **extensible, schema-driven curriculum engine**. Design iterations follow the anti-slop, component-driven **Claude Design methodology** (referencing curated systems from 21st.dev, Land-book, and Linear).

---

## 2. Core Architectural Pillar: The Dynamic Curriculum Engine

> ### ⚠️ Critical Architectural Mandate (Dr. Albert Chan, 2026-10-01)
> *The system structure must remain stable, but future curriculum reviews will inevitably alter competency domains, assessment tools (e.g., Entrustable Professional Activities / EPAs), Volume of Practice minimums, ITA intervals, and WBA requirements. The architecture must guarantee that **no code deployment or schema migration is required when the College updates its curriculum**.*

### 2.1 How This Mandate Transforms the System Design
In the legacy system, questions were hardcoded columns (`q1`, `q2`, `domain_1a`, `module_claimed`). In this PRD, the system separates **Software Plumbing** from **Curriculum Policy**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CONFIGURABLE DATA LAYER (Policy)                     │
│  - Curriculum Editions (2017 v1.1, 2028 NextGen)                      │
│  - Assessment Tool Registry (ITA, CEX, CBD, DOPS, ALMAT, EPA, MSF)     │
│  - Form Rubrics & Behavioral Anchors (JSON Schema)                    │
│  - Progression Milestone Rules & Thresholds                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Evaluates against
┌───────────────────────────────────▼────────────────────────────────────┐
│                    IMMUTABLE CORE PLATFORM (Plumbing)                  │
│  - User Directory & Hospital RBAC                                      │
│  - Accredited Time Ledger (Double-Entry Accounting)                    │
│  - Workflow State Machines & Signature Capture                        │
│  - Offline PWA Sync & Tamper-Evident Audit Trail                       │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Dynamic Entities
1. **`curriculum_editions`:** Represents a formal curriculum publication (e.g. `HKCA-CURR-2017-v1.1`, `HKCA-CURR-2028-v1.0`). Trainees are bound to an edition upon registration, with version migration rules supported.
2. **`assessment_tools` & `form_templates`:** Tool definitions (e.g., Mini-CEX, DOPS, EPA, ITA) stored as structured JSON schemas. Defines question types, Likert scales, entrustment levels (1–5), behavioral anchor descriptors, and mandatory validation rules.
3. **`curriculum_milestones`:** Progression criteria stored as configurable records rather than hardcoded logic:
   - Threshold counts (e.g., VOP cases: BAT 218, HAT 615; Paediatric $<6\text{ yr}$: 80; Obstetric: 100).
   - WBA counts and cadence.
   - ITA mandatory intervals (e.g., standard 6 months vs. flexible 3-month modular blocks).
   - Prerequisite gates (Intermediate exam, Formal Project, 24/24 month rule).

### 2.3 Temporal Hospital & Cluster Accreditation Engine
To absorb Hospital Authority (HA) cluster realignments, hospital mergers, and College accreditation adjustments:
1. **Temporal Cluster Affiliations (`hospital_cluster_history`):**
   * Hospitals are mapped to clusters with `effective_from` and `effective_until` timestamps.
   * If HA reallocates a hospital to a new cluster (e.g. boundary shifts), past rotations preserve the historical cluster identity for statutory audits, while RBAC scopes and SOT reporting dynamically follow the active affiliation.
2. **Point-in-Time Center Accreditation (`accredited_centres`):**
   * Each accredited unit has explicit `accreditation_start_date` and `accreditation_end_date` bounds, accredited subspecialty types (`Clinical_Anaesthesia`, `ICU`, `Pain`), and trainee capacity limits.
   * **Historical Immutability:** Rotation credit validity is determined by whether the center was active *at the time the rotation occurred*. If a hospital loses or suspends accreditation in 2028, a rotation completed there in 2025 remains 100% credited and legally unassailable.
3. **Administrative Self-Service Registry:** College Administrators manage centers, renewal inspection dates, and cluster assignments via an administrative console, requiring zero code deployments. Automatic alerts notify administrators 12 months prior to any center's accreditation expiry.

---

## 3. User Personas & Role-Based Access Control (RBAC)

| Role | Persona & Scope | Primary Jobs to be Done |
| :--- | :--- | :--- |
| **Trainee** | Basic (BAT), Higher (HAT), or Provisional Fellow (PFY). Scoped to self. | Mobile logbook entry in recovery; proactive rotation declaration; WBA initiation; reviewing feedback; exam registration. |
| **Trainer / Assessor** | Specialist Anaesthetist / Consultant in accredited centre. Scoped to hospital. | Completing private ITA feedback ("theatre list" batch matrix); bedside WBA evaluation; reviewing logbook cases. |
| **Supervisor of Training (SOT / Assistant SOT)** | Clinical lead for training at hospital level. Scoped to hospital trainees. | Multi-trainee RAG status triage; synthesizing trainer feedback into summative ITAs; logbook verification; exam gating. |
| **Cluster SOT / COS** | Cluster Training Director / Chief of Service. Scoped to hospital cluster. | Cross-hospital rotation oversight; Level 2 deadline escalation; PFY 3-domain plan sign-off. |
| **College Admin / BOE** | HKCA Board of Education & Administrative Staff. College-wide scope. | Accreditation registry; curriculum edition management; approving credit revocations/appeals; formal project reviewer assignment. |

---

## 4. Product Scope & Phasing Boundaries

### 4.1 In Scope for MVP (Phase 1 — Launch Core)
* **Core Anaesthesia Training Pathway:** BAT (24m), HAT (24m), PFY (12m), and Fellowship exit nomination.
* **ICU as an Accredited Rotation Type:** Tracking mandatory 6-month ICU rotations at College-accredited units.
* **Configurable Curriculum Engine:** Versioned rules, dynamic form rubrics, and JSON behavioral anchors.
* **2-Tier ITA Engine:** Private trainer input matrix $\rightarrow$ SOT summative synthesis $\rightarrow$ Trainee in-person sign-off.
* **Double-Entry Accredited Time Ledger:** BOE-governed credit allocations and amendments.
* **Offline-First PWA Logbook:** Fast mobile data entry with automated curriculum classification and 2-year retrospective locks.
* **Executive SOT Console:** High-density **Linear Precision** tabular data grid (micro-progress meters, rotation pills, hairline rows) for cohort triage, paired with **Stripe Executive** cards for individual summative assessments.
* **External WBA Asynchronous Sync:** Ingestion integration with HKAM iWBA API (reflecting JCIMED specifications and quarantine conflict handling).

* **4.2 Explicit Non-Goals / Deferred to Phase 2
* **Intensive Care Medicine (ICM) Specialty Module:** Standalone ICM tutorials, QR-code check-ins, and dedicated ICM assessments are deferred to Phase 2 (schemas reserved).
* **Pain Medicine Module:** Specialized chronic/acute pain logbooks and pain ITA modules deferred to Phase 2.
* **Automated Project Reviewer Matching Algorithm:** Handled via admin console assignment in MVP.
* **Annual Competence Review Committee (ACRC / ARCP Engine):** An automated College-wide annual panel review system that generates a consolidated cohort docket: (1) trainees meeting all stage criteria for routine progression, and (2) trainees flagged for panel review due to performance flags, stalled velocity, or open appeals. (Architecture and data models reserved in Phase 1; dedicated committee scoring UI in Phase 2).

---

## 5. Functional Feature Specifications (P0 Priority)

### Feature 1: The Accredited Time Ledger & Rotation Engine (P0)
* **1.1 Proactive Rotation Declaration:** Trainee and SOT declare rotation type (`clinical_anaesthesia`, `icu`, `elective`) and prospective learning goals at rotation commencement.
* **1.2 Automatic Time Crediting:** Upon satisfactory completion of the summative ITA, rotation time is automatically committed to the `accredited_time_ledger`.
* **1.3 Ledger Accounting Model:**
  * Credits are recorded in **exact calendar months** anchored by `period_start` and `period_end`.
  * Running totals on `trainee_profiles` are cached views derived from the ledger.
  * **Revocation / Amendment Authority:** Restricted exclusively to the **Board of Education (BOE)** using a strict reason taxonomy (`conflict_of_interest`, `non_accredited_site`, `successful_appeal_overturn`, `administrative_error`, `curriculum_rule_change`).
* **1.4 Mid-Rotation Hospital Transfers:** Handled via **Split ITAs** (Option B). Hospital A and Hospital B each execute an interim assessment, partitioning accredited credit cleanly between institutions.

### Feature 2: 2-Tier In-Training Assessment (ITA) Pipeline (P0)
* **2.1 Tier 1: Private Trainer Input Layer:**
  * SOT assigns supervising trainers for the 6-month cycle.
  * Each trainer completes the College's **15-item In-Training Assessment form** (9 Clinical Performance + 6 Communication, Teamwork and Interpersonal items; all mandatory), rating each item X/1/2/3/4 against the expectation for the trainee's level and year, with the item's behavioural anchor one tap away. Prototype: `HKCA_ITA_Trainer_Form.html`.
  * An **example** is required only for an item rated 4 (unsatisfactory must be defensible); for 1, 2, 3 and X it is optional. One optional *"Comments from Specialist Assessors"* box replaces the earlier "Notable Strength / Key Area for Growth" prompts (decision I1).
  * A multi-trainee "Theatre List" batch view (U1) remains a later layer on top of this form.
  * No auto-prefill from previous cycles (eliminates rubber-stamping).
  * Trainees are strictly walled off from viewing individual trainer submissions.
* **2.2 Tier 2: SOT Summative Synthesis:**
  * SOT console shows, for each of the 15 items, every trainer's grade (spread, not average) and their examples.
  * SOT records the consolidated grade for each of the 15 items (blank by default, no suggested value) and must record reasons wherever trainers differ by 2 or more levels.
  * SOT sets the **overall assessment** (`sot_grade`, 1–4). **College rule:** overall is unsatisfactory if, but not limited to, 4 or more of the 15 items are unsatisfactory; the system locks the overall to 4 at that point, and requires reasons for a discretionary 4 below it. Items graded X (unable to assess) never count toward the threshold.
  * SOT-only fields: compulsory courses (EASE, ADAM-A, EMAC, ECHO-A, USRA-E), formal project completed, and SOT comments/suggestions.
* **2.3 In-Person Sign-Off & Contested Workflow:**
  * Trainee reviews and signs during a mandatory face-to-face feedback meeting.
  * If a trainee disputes the assessment, the record transitions to **`contested`**, the trainee submits an objection statement, and the grade/credit is held in **`pending_boe_review`** until formal Board adjudication.
* **2.4 Appeal Defensibility:** Schema stores both `sot_grade` and `final_grade`. Progression gates evaluate `final_grade`, guaranteeing that a successful appeal unblocks progression.
* **2.5 Consecutive vs. Non-Consecutive Fails:**
  * **$\ge 2$ Consecutive Unsatisfactory ITAs:** Triggers automatic BOE escalation. (A satisfactory cycle resets the streak).
  * **2 Lifetime Non-Consecutive Unsatisfactory ITAs:** Triggers an advisory alert to the current SOT and surfaces an evaluation flag at subsequent milestone gates (H8).
* **2.6 Early Formative Warning / PIP:** SOT can trigger an interim Formative ITA (Month 2–3) initiating a Performance Improvement Plan (PIP) without logging an official College failure.

### Feature 3: Offline-Capable Mobile Volume of Practice (Logbook) (P0)
* **3.1 Mobile-First PWA:** Installable Progressive Web Application with client-side persistent cache (`IndexedDB`).
* **3.2 Rapid In-Theatre Capture:** Target median entry time $< 45\text{ seconds}$ per surgical case.
* **3.3 2-Year Retrospective Lock:**
  * System stamps an immutable database-generated `first_logged_at TIMESTAMP` on insert (and client-side `device_logged_at`).
  * Cases where `first_logged_at - case_date > 2 years` are retained for personal records but strictly flagged `is_accredited = false`.
* **3.4 AI / Heuristic Curriculum Classifier:**
  * System suggests curriculum descriptor code (e.g. 2.1 General, 2.2 Regional, 3.5 Obstetric) with a confidence score.
  * Trainee selects the category; discrepancies are flagged.
  * SOT possesses authoritative edit/override authority during sign-off.
* **3.5 SOT Verification Guardrails:** Batch sign-off permitted only for clean, high-confidence cases. Divergent cases require individual review.
* **3.6 Cohort-Relative Caseload Velocity:**
  * Replaces raw volume with **velocity per eligible clinical anaesthesia month**:
    $$\text{Velocity} = \frac{\text{Logged Cases}}{\text{Accredited Months (Excluding ICU \& Extended Leave)}}$$
  * Prevents trainees rotating through mandatory ICU blocks from triggering false-alarm "falling behind" warnings.

### Feature 4: Workplace-Based Assessments (WBA) & HKAM iWBA Linkage (P0)
* **4.1 Supported Modalities:** Mini-CEX, DOPS, CBD, ALMAT, EPA, and MSF.
* **4.2 Direct Single Sign-On (SSO):** Integration via HKAM OAuth2 / OpenID Connect (OIDC).
* **4.3 Deep-Link Initiation:** One-click launch from the trainee dashboard into iWBA pre-populating trainee HKAM ID, supervisor ID, and curriculum descriptor code.
* **4.4 Asynchronous Ingestion Worker (JCIMED Spec Aligned):**
  * Decoupled delta-polling daemon querying `/api/v1/eportfolio/summary` using sliding 90-day time slices (reflecting the 2026-10-06 JCIMED technical integration clarification).
  * Idempotent upserts keyed on `(jcimed_wba_id, assessment_type)`.
  * Point-in-time immutable snapshot of assessor metadata (`name`, `rank`, `hospital`).
  * Discrepant records divert to a `wba_sync_conflicts` quarantine table.
  * Webhook notification listener support for real-time assessment completion callbacks where supported by JCIMED.

### Feature 5: SOT Executive Triage Console (P0)
* **5.1 Visual & UX Standard:**
  * **Cohort Triage & Roster (Linear Precision):** Hairline border table layout, monospaced tabular figures (`JetBrains Mono`), micro-progress meters for WBA/VOP targets, RAG status pills, rotation origin indicators (`In department`, `Rotated in`, `Rotated out`), and a non-disruptive slide-in inspection drawer.
  * **Individual Trainee Drill-Down (Stripe Executive):** Structured card hierarchy, calm slate borders, and institutional navy accents for deep-dive summative ITA reviews and remedial plans.
  * **Design Integrity:** Follows the 6-step Claude Design anti-slop process (surface-first composition, zero generic AI cards/gradients, touch targets $\ge 44\text{px}$).
* **5.2 Multi-Trainee Roster:** Instant triage into *Satisfactory*, *Under Observation / Remedial*, and *Action Required*.
* **5.3 Deadline Escalation Ladder:** Automated routing for pending sign-offs: SOT $\rightarrow$ Assistant SOT $\rightarrow$ Cluster SOT $\rightarrow$ BOE / Cluster Director. Self-service delegation for SOT planned leave.
* **5.4 AI-Assisted SOT Synthesis & Progression Drafter:**
  * Synthesises trainee quarterly logbook entries, WBA outcomes, and supervisor feedback into an editable draft ITA summary.
  * **Draft-Only Authority Bound:** Architecture physically prohibits autonomous submission, accreditation, or record locking. System enforces a strict hard-stop requiring authenticated SOT review and click-to-commit.
  * **Governance SLA:** Bound by project [[Model Contract — SOT Review and Progression Assistant]].

### Feature 6: Formal Projects, Exams & College Gatekeeping (P0)
* **6.1 Formal Projects (HKCA-E03):** 2-stage workflow (Protocol $\rightarrow$ Manuscript). Double-blind review interface with 30-day automated timer and one-click administrator reassignment.
* **6.2 Examination Gating:** Real-time eligibility vetting querying live base tables ($<5\text{ms}$) followed by mandatory SOT digital approval.
* **6.3 Academy Fellowship Nomination Export:** Generates standardized 5-section HKAM nomination dataset driven by decoupled, versioned JSON configuration schemas.

---

## 6. Non-Functional Requirements (NFRs)

| Domain | Specification | Acceptance Criteria |
| :--- | :--- | :--- |
| **Performance** | Progression Gate Evaluation | Live base table query executes in $< 5\text{ ms}$; no dependency on stale materialized views. |
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

---

## 8. Requirements Traceability Matrix

| PRD Section | Audit Finding / Directive | Implementation Component |
| :--- | :--- | :--- |
| **§2 (Curriculum Engine)** | Future Curriculum Review Flexibility | `curriculum_editions`, `form_templates`, `curriculum_milestones` |
| **§5.1 (Ledger)** | M2, M3, H5, F5 | `accredited_time_ledger`, Calendar Month Arithmetic |
| **§5.2 (2-Tier ITA)** | M1, M6, H1, H8, U1 | `ita_assessor_responses`, `itas`, Contested Workflow |
| **§5.3 (PWA Logbook)** | H5, U2, U3, U4 | Mobile PWA, `IndexedDB`, Velocity Formula |
| **§5.4 (WBA & iWBA)** | E2, Albert Directive | OAuth2 SSO, Background Polling Daemon |
| **§5.5 (SOT Console)** | H2, Direction B | High-Density Triage Board, Escalation Ladder |
| **§6 (NFRs & Security)** | M4, M5, H6, H7, E1, E4 | Append-Only Hashes, Base Table Queries, `ON DELETE RESTRICT` |
| **§5.5 & §6 (AI Safety)** | Albert Directive / Model Contract | `draft_only` Hard-Stop, Pinned Snapshot, Cache Breakpoint, [[Model Contract — SOT Review and Progression Assistant]] |
| **§7 (Migration)** | E5, Rollover Plan | Scoped Active Migration, CI Parity Suite |
