---
type: reference
project: "[[HKCA Portfolio Revamp]]"
created: 2026-09-29
---

# Legacy System Audit & Data Model Mapping

## 1. Legacy Architecture Overview
- **Technology Stack:** Procedural PHP (~2004–2025 iterations) with direct MySQL queries (`mysqli` / legacy MySQL drivers), jQuery, and Bootstrap/CSS.
- **Hosting Environment:** Hosted on CUHK Department of Anaesthesia & Intensive Care server (`aic-server3.aic.cuhk.edu.hk`), database `eps`.
- **Primary Domain Code:**
  - `portfolio.php`, `portfolio_edit.php`: Central trainee summary profile.
  - `in_training_assessment.php`, `add_ita.php`, `add_ita1.php`, `add_mita.php`: In-training assessment (ITA) creation, trainer feedback routing, and SOT sign-off.
  - `myvop.php`: Volume of Practice (e-Logbook).
  - `mywba.php`: Legacy Workplace-Based Assessments.
  - `echo_curriculum.php`: Transthoracic/Transoesophageal Echo module.
  - `common.php`: Session management, role access control, database connections.

---

## 2. Key Legacy Tables & Relational Schema

### 2.1 Users & Roles (`user`, `cluster`)
- **Table `user`:**
  - `tid` (Primary Key, e.g., `T0000000...`, `S0000000...` for SOT/Trainers)
  - `type`: `trainee`, `sot`, `admin`, `trainer`
  - `admin_type`, `admin_cluster`, `admin_hospital`
  - `current_cluster`, `current_hospital`
  - `trainee_type` (Basic, Higher, PFY)
  - `level_of_training`: Basic, Higher, Provisional Fellowship
  - `date_of_commencement_of_ht`, `date_of_commencement_of_pfy`
  - `echo_trainer`, `echo_trainer_hospital`
- **Table `cluster`:** Composite PK `(cluster, hospital)` mapping HA clusters (e.g. NTEC, NTWC, KCC, HKEC, etc.) to accredited hospitals (PWH, TMH, QMH, QEH, HKCH, etc.).

### 2.2 Rotations & Accredited Training (`atp_training_experience`)
- **Table `atp_training_experience`:**
  - `id`, `tid`, `year`
  - `start_date`, `end_date`
  - `hospital`, `department`
  - Experience breakdown: `anaesthesia` (months/days), `intensive_care`, `elective`, `non_anaesthesia_experience`
  - Sign-offs: `verified_by_sot`, `verified_by_hkca_admin`, `rotation_type`

### 2.3 In-Training Assessment Architecture (`atp_in_training_assessment`, `atp_mita`, `atp_ita1`, `atp_ita_assessor`)
The legacy system separated the master SOT form from individual trainer consultations:
1. `atp_mita` (Master ITA session record initiated per trainee rotation block).
2. `atp_ita_assessor`: Specialists/trainers invited by SOT to assess the trainee.
3. `atp_ita1`: Individual trainer feedback responses (scored items `assessment_1a` through `3b`, plus comments).
4. `atp_in_training_assessment`: Final consolidated ITA form filled by the SOT:
   - Domains:
     - 1a–1g: Clinical knowledge, perioperative assessment, anaesthetic techniques, crisis management, postop care, procedural skills.
     - 2a–2g: Professional attitude, communication with team/patients, reliability, punctuality, ethical behavior.
     - 3a–3b: Self-reflection, response to feedback, teaching & audit contribution.
   - Scale: 1 (Consistently exceeds), 2 (Occasionally exceeds), 3 (Meets), 4 (Unsatisfactory), X (Unable to assess).
   - Signatures: `fill_in_by_sot`, `date_of_fill_in_by_sot`, `verified_by_trainee`, `date_of_verified_by_trainee`, `admin_unverified`.

### 2.4 Volume of Practice / Case Log (`patient2`)
- **Table `patient2`:**
  - `pid`, `tid`
  - `start_date`, `date_entry` (enforces the 2-year retrospective rule)
  - `hospital`, `cluster`
  - Patient demographics: `age`, `sex`, `asa`
  - Case metadata: `length_hours`, `surg_dx`, `op1`, `mode_anaesthesia`, `level_supervision`
  - Module / Specialty tags: `module_claimed`, `specialty_module_claimed`, `general_anaesthesia_and_sedation`, `regional_anaesthesia`, `airway_management`, `acute_pain_management`
  - Sign-off: `approved_status`, `approved_by`, `approved_date`

### 2.5 Central Portfolio Tracking (`atp_portfolio`)
- Consolidated trainee milestones:
  - Formal Project: `formal_project_title`, `formal_project_date_of_approval`, `formal_project_project_number`, `formal_project_verified_by_admin`
  - Mandatory Courses: `training_course_ease`, `training_course_emac`, `training_course_other1..9` (UGRA, ECHO-A, ADAM-A, etc.) + attendance and verification flags.
  - Examinations: `examination_intermediate_passing_date`, `examination_final_passing_date`, `examination_final_passing_date_icu`
  - Exit Assessment: `exit_assessment_on`, `exit_assessment_on_icu`

### 2.6 Active Course & Examination Registration Subsystem (`atp_exam`, `atp_reg_exam`, `atp_course`, `atp_reg`)
The legacy system is not merely a passive portfolio; it contains an active registration and vetting engine:
- Trainees apply online to sit college examinations (Intermediate, Final Fellowship Anaesthesia, Final Fellowship Intensive Care) and mandatory courses (EMAC, EASE, etc.).
- **SOT Formal Vetting (`process_add_approve.php`):** The SOT must formally approve or disapprove the examination application. The system checks prerequisites (e.g. passing Intermediate exam, recognized training time $\ge 60$ months for ICU, etc.) before sign-off.
- Workflow tracks automated acknowledgement letters, withdrawal requests, and SOT approval emails (`acknowledgement_letter_sent`, `withdraw_letter_sent`, `sot_approve_email_sent`).

### 2.7 Subspecialty Tracks, Non-Clinical Modules & Auxiliary Workflows
- **Intensive Care Medicine (ICM) Track:**
  - Distinct commencement dates (`date_of_commencement_of_ht_icu`), distinct final exam (`examination_final_passing_date_icu`), and distinct exit assessment (`exit_assessment_on_icu`).
  - **ICM Tutorial & QR Attendance:** `atp_icu_tutorial` and `atp_icu_tutorial_trainee` with encrypted QR code generation and mobile scanning check-in (`icu_app_process_qrcode.php`).
- **Pain Medicine Track:** Dedicated pain case counters (`num_of_pain_case`), specialized pain module logging (`pain_module_record.php`, `trainee_list_pain.php`).
- **FHKAM Nomination Portal (`nomination.php`):**
  - Post-exit assessment application for nomination to the Fellowship of the Hong Kong Academy of Medicine (HKAM).
  - Hard gated: trainee cannot apply until `exit_assessment_on` or `exit_assessment_on_icu` is recorded.
  - Connects to HKAM ePortfolio system (`test1/` reference pages: `Step0Note`, `Section1_5Detail`, `Section2Qualification`, `Section3TrainingList`, `Section4PubSubscription`, `ReviewPage`).
- **Automated Cron Notification Daemons:**
  - `cron2.php`: Groups multi-trainee ITA assessor invitations by assessor email and sends a single consolidated batch digest at midnight.
  - `cron1.php`: 7-day automatic reminder ping to specialist assessors for pending ITA evaluations.
  - `cron_cex.php`: 7-day automatic reminder ping to trainees to counter-sign completed Mini-CEX assessments.
  - `cron.php`: 14-day automatic escalation ping to multi-rater MSF evaluators (consultants, peers, nurses, assistants).
- **Formal Learning Plans & Research Registry:**
  - `learning_plan.php`: Trainee annual/rotation objective setting.
  - `activity_reports.php`: Non-clinical contributions (teaching, audits, departmental presentations).
  - `atp_study`: Departmental research project registry.

---

## 3. Recommended Modern Data Architecture (PostgreSQL / Prisma)

### Target Normalized Schema
```
User (id, email, password_hash, full_name, role, status)
  ├── TraineeProfile (hkca_num, training_stage: BAT/HAT/PFY/Fellow, parent_hospital_id, cluster_id)
  ├── TrainerProfile (qualifications, hospital_id, is_sot, is_cluster_sot)
  └── AuditLog (actor_id, action, target_entity, details, timestamp, ip)

TrainingRotation (id, trainee_id, hospital_id, rotation_type, start_date, end_date, sot_verified, admin_verified)

InTrainingAssessment (id, rotation_id, trainee_id, sot_id, status, overall_grade, sot_comments, trainee_comments, signed_at)
  ├── ItaDomainScores (category, sub_item, score: 1|2|3|4|X, specific_detail)
  ├── ItaTrainerInvitation (trainer_id, token, status, submitted_at)
  │     └── ItaTrainerScore (trainer_id, sub_item, score, narrative_feedback)
  └── RemedialPlan (trigger_reason, action_items, re_assessment_date, boe_notified)

FormalProject (id, trainee_id, title, category: RCT/Meta/Obs/QIP/CaseReport, status)
  ├── ProjectVersion (version_num, manuscript_url, blinded_url, submitted_at)
  └── ProjectReview (reviewer_id, rubric_scores_json, recommendations, is_blinded)

WorkplaceAssessment (id, trainee_id, trainer_id, tool_type: DOPS/CEX/CBD/ALMAT/MSF, source: 'JCIMED'|'MANUAL', external_ref_id, payload_json)

LogbookEntry (id, trainee_id, procedure_date, hospital_id, asa, supervision_level, subspecialties, techniques)

PfyPlan (id, trainee_id, academic_year, clinical_objectives, management_objectives, education_objectives, sot_signed_at, cos_signed_at, completion_report_url)
```

---

## 4. Key Improvements Over Legacy System
1. **Type-Safety & Data Integrity:** Eliminate wide tables with arbitrary columns (`training_course_other1..9`, `tutorial_admin1..38`) in favor of normalized relational tables.
2. **True RBAC:** Modern role & permission middleware replacing ad-hoc `$_SESSION['type']` checks.
3. **Automated Reminders:** Replacing manual cron scripts (`cron.php`, `cron1.php`) with robust server-side scheduled jobs or database-backed message queues.
4. **JCIMED Webhook Integration:** Clean ingestion endpoint with deduplication on `external_ref_id`.
5. **Responsive Modern UI:** Modern component architecture replacing legacy table-sorter and server-rendered HTML snippets.
