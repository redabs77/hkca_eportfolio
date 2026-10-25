---
type: reference
project: "[[HKCA Portfolio Revamp]]"
created: 2026-09-30
---

# Database Schema & Data Model

Comprehensive data model for HKCA Electronic Portfolio System.

**Tech Stack**: PostgreSQL (primary) + Next.js/React frontend
**ORM**: Prisma or Drizzle
**Auth**: NextAuth.js with RBAC

---

## Core Entity Relationships

```
User (Auth & RBAC)
├─→ TraineeProfile
│   ├─→ Rotations
│   ├─→ ITAs (In-Training Assessments)
│   ├─→ WBAs (Workplace-Based Assessments)
│   ├─→ VolumeOfPractice (e-Logbook)
│   ├─→ MandatoryCourses
│   ├─→ FormalProject
│   ├─→ PFYPlan
│   ├─→ RetrospectiveRecognition
│   └─→ ExamResults
│
├─→ TrainerProfile (SOT, Assistant SOT, Trainer)
│   ├─→ SupervisedTrainees
│   └─→ WBAsCompleted (as assessor)
│
└─→ AdminProfile (College Admin, Training Officer)
    ├─→ AccreditedCentres (manages)
    └─→ ProjectReviewerAssignments

AccreditedCentre
├─→ Rotations (hosted at this center)
└─→ AccreditationHistory

Hospital / Cluster
├─→ AccreditedCentres
└─→ Trainees (parent hospital)
```

---

## 1. User & Authentication

### `users`
Core authentication table (NextAuth.js schema)

```sql
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT UNIQUE NOT NULL,
  email_verified        TIMESTAMP,
  name                  TEXT,
  image                 TEXT,
  
  -- HKCA specific
  hkca_number           TEXT UNIQUE,      -- e.g., "2022-019"
  role                  TEXT NOT NULL,    -- trainee, sot, trainer, admin, boe_officer
  
  -- Metadata
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login            TIMESTAMP,
  is_active             BOOLEAN DEFAULT true
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_hkca_number ON users(hkca_number);
```

### `user_roles` (RBAC)
Multi-role support (e.g., trainee who becomes trainer)

```sql
CREATE TABLE user_roles (
  id                    SERIAL PRIMARY KEY,
  user_id               TEXT REFERENCES users(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL,    -- trainee, sot, assistant_sot, trainer, admin, etc.
  scope_type            TEXT,             -- hospital, cluster, college
  scope_id              TEXT,             -- hospital_id or cluster_code
  
  effective_from        DATE NOT NULL,
  effective_until       DATE,
  is_active             BOOLEAN DEFAULT true,
  
  granted_by            TEXT REFERENCES users(id),
  granted_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  board_endorsed_on     DATE,             -- Board of Education endorsement date; required for SOT and Assistant SOT (Admin console, 2026-10-24)
  endorsement_doc_id    TEXT,             -- reference to the circulated endorsement record
  end_reason            TEXT              -- recorded when a term ends or its end date changes
  -- No UNIQUE constraint: the same person can hold the same role again after a gap. The role set stays SOT and Assistant SOT; there is no Acting SOT role (decision 2026-10-24).
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_active ON user_roles(is_active, effective_from, effective_until);
```

---

## 2. Trainee Profile & Training Progression

### `trainee_profiles`
Core trainee information

```sql
CREATE TABLE trainee_profiles (
  id                        SERIAL PRIMARY KEY,
  user_id                   TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  hkca_number               TEXT UNIQUE NOT NULL,
  
  -- Personal
  full_name                 TEXT NOT NULL,
  mchk_registration_type    TEXT,         -- full, limited, special
  mchk_registration_number  TEXT,
  
  -- Training stage
  current_stage             TEXT NOT NULL, -- BAT, HAT, PFY, Fellow. Suspension is a separate Board-imposed flag (is_suspended), not a stage
  stage_start_date          DATE,
  expected_completion_date  DATE,
  
  -- Parent hospital (administrative home)
  parent_hospital_id        INTEGER REFERENCES hospitals(id),
  current_cluster           TEXT,         -- NTEC, KWC, etc.
  
  -- Training dates
  training_start_date       DATE NOT NULL,
  bat_start_date            DATE,
  bat_completion_date       DATE,
  hat_start_date            DATE,
  hat_completion_date       DATE,
  pfy_start_date            DATE,
  pfy_completion_date       DATE,
  
  -- Accredited time tracking (months)
  total_accredited_months           NUMERIC(5,2) DEFAULT 0,
  clinical_anaesthesia_months       NUMERIC(5,2) DEFAULT 0,
  icu_months                        NUMERIC(5,2) DEFAULT 0,
  elective_months                   NUMERIC(5,2) DEFAULT 0,
  accredited_last_3_years_months    NUMERIC(5,2) DEFAULT 0,  -- Section 1.2.4 rule
  
  -- Progression eligibility flags
  intermediate_exam_passed  BOOLEAN DEFAULT false,
  intermediate_exam_date    DATE,
  final_exam_passed         BOOLEAN DEFAULT false,
  final_exam_date           DATE,

  -- Learning-contract gate (cohort-scoped; Albert directive 2026-10-19)
  -- Confirmed policy going forward: the Assigned SOT cannot open ITA Tier-2 synthesis until
  -- the current-period learning contract is signed (itas.status = 'waitcontract' until then).
  -- Applies only to trainees who start training under the curriculum review introducing it;
  -- legacy/already-training trainees default to false and are never gated retroactively.
  learning_contract_gate_required BOOLEAN NOT NULL DEFAULT false,
  
  -- Status
  is_active                 BOOLEAN DEFAULT true,
  training_status           TEXT DEFAULT 'active', -- active | on_leave | deactivated | completed (decision 2026-10-24). Changes are recorded in trainee_status_events (section 12)
  is_suspended              BOOLEAN DEFAULT false, -- Board-imposed suspension, independent of training_status
  
  -- Metadata
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trainee_stage ON trainee_profiles(current_stage);
CREATE INDEX idx_trainee_hospital ON trainee_profiles(parent_hospital_id);
CREATE INDEX idx_trainee_active ON trainee_profiles(is_active, training_status);
```

---

## 3. Hospitals & Accredited Training Centers

### `hospitals`
Hospital Authority hospitals

```sql
CREATE TABLE hospitals (
  id                    SERIAL PRIMARY KEY,
  hospital_code         TEXT UNIQUE NOT NULL,
  hospital_name         TEXT NOT NULL,
  cluster               TEXT NOT NULL,    -- NTEC, KWC, HKE, KCC, HKWC, NTWC, KEC
  
  is_ha_hospital        BOOLEAN DEFAULT true,
  
  address               TEXT,
  contact_phone         TEXT,
  contact_email         TEXT,
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hospitals_cluster ON hospitals(cluster);
```

### `accredited_centres`
College-accredited training centers

```sql
CREATE TABLE accredited_centres (
  id                            SERIAL PRIMARY KEY,
  hospital_id                   INTEGER REFERENCES hospitals(id),
  centre_name                   TEXT NOT NULL,  -- e.g., "PWH Anaesthesia", "QMH ICU"
  
  -- Accreditation type
  accreditation_types           TEXT[] NOT NULL, -- ["Clinical_Anaesthesia", "ICU", "Pain_Medicine"]
  
  -- Status
  accreditation_status          TEXT NOT NULL DEFAULT 'active', -- active, pending_review, suspended, expired
  accreditation_start_date      DATE NOT NULL,
  accreditation_end_date        DATE NOT NULL,
  
  -- Inspection
  last_inspection_date          DATE,
  next_inspection_due           DATE,
  trainer_trainee_ratio         TEXT,       -- e.g., "1:1.2"
  
  -- Training limits
  max_duration_months           INTEGER,    -- max rotation duration
  max_trainee_capacity          INTEGER,
  
  -- Satellite center
  is_satellite_centre           BOOLEAN DEFAULT false,
  parent_centre_id              INTEGER REFERENCES accredited_centres(id),
  
  -- Alert configuration
  review_alert_months_before    INTEGER DEFAULT 12,
  
  -- Metadata
  created_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by                    TEXT REFERENCES users(id),
  last_modified_by              TEXT REFERENCES users(id)
);

CREATE INDEX idx_accredited_centres_hospital ON accredited_centres(hospital_id);
CREATE INDEX idx_accredited_centres_status ON accredited_centres(accreditation_status);
CREATE INDEX idx_accredited_centres_expiry ON accredited_centres(accreditation_end_date);

-- Alert view: centers expiring soon
CREATE VIEW centres_expiring_soon AS
SELECT 
  id,
  centre_name,
  accreditation_end_date,
  accreditation_end_date - CURRENT_DATE AS days_until_expiry
FROM accredited_centres
WHERE 
  accreditation_status = 'active' 
  AND accreditation_end_date <= CURRENT_DATE + INTERVAL '12 months';
```

### `accreditation_audit_log`
Track all accreditation changes

```sql
CREATE TABLE accreditation_audit_log (
  id                    SERIAL PRIMARY KEY,
  centre_id             INTEGER REFERENCES accredited_centres(id),
  
  action                TEXT NOT NULL,    -- created, updated, status_changed, expired, renewed
  field_changed         TEXT,
  old_value             TEXT,
  new_value             TEXT,
  
  changed_by            TEXT REFERENCES users(id),
  changed_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes                 TEXT
);

CREATE INDEX idx_audit_centre ON accreditation_audit_log(centre_id, changed_at);
```

---

## 4. Rotations

### `rotations`
Training rotations at hospitals

```sql
CREATE TABLE rotations (
  id                    SERIAL PRIMARY KEY,
  trainee_id            INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  
  -- Location
  hospital_id           INTEGER REFERENCES hospitals(id),
  accredited_centre_id  INTEGER REFERENCES accredited_centres(id),
  
  -- Rotation details
  rotation_type         TEXT NOT NULL,    -- clinical_anaesthesia, icu, pain, elective_other, elective_research
  subspecialty          TEXT,             -- cardiac, paediatric, neuro, obstetric, etc.
  
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  duration_months       NUMERIC(4,2) GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (end_date - start_date)) / (30.44 * 24 * 60 * 60)
  ) STORED,
  
  -- Accreditation status
  is_accredited         BOOLEAN DEFAULT true,
  counts_toward_last_3_years BOOLEAN DEFAULT true,  -- Section 1.2.4
  
  -- Approval
  approval_status       TEXT DEFAULT 'pending',  -- pending, approved, rejected
  approved_by_sot       TEXT REFERENCES users(id),
  approved_at           TIMESTAMP,
  
  -- Supervisor
  supervising_sot_id    TEXT REFERENCES users(id),  -- SOT during this rotation
  
  -- Notes
  rotation_notes        TEXT,
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rotations_trainee ON rotations(trainee_id);
CREATE INDEX idx_rotations_dates ON rotations(start_date, end_date);
CREATE INDEX idx_rotations_hospital ON rotations(hospital_id);

-- Check constraint: rotation duration must not exceed center's max
ALTER TABLE rotations ADD CONSTRAINT check_rotation_duration
  CHECK (duration_months <= (
    SELECT max_duration_months 
    FROM accredited_centres 
    WHERE id = accredited_centre_id
  ));
```

---

## 5. In-Training Assessments (ITA)

### `itas`
6-monthly assessments (HKCA-E06)

```sql
CREATE TABLE itas (
  id                        SERIAL PRIMARY KEY,
  trainee_id                INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  
  -- Assessment period
  assessment_period_start   DATE NOT NULL,
  assessment_period_end     DATE NOT NULL,
  rotation_id               INTEGER REFERENCES rotations(id),
  
  -- Assessment details
  form_code                 TEXT DEFAULT 'HKCA-E06',
  training_stage            TEXT NOT NULL,    -- BAT, HAT, PFY
  
  -- Workflow status
  status                    TEXT DEFAULT 'pending_trainer_feedback',
  -- pending_trainer_feedback → waitcontract (if gated and unsigned) → sot_assessment → trainee_review → completed
  -- 'waitcontract' added 2026-10-19: gates Tier-2 synthesis on the period's learning contract
  -- being signed; only reachable when trainee_profiles.learning_contract_gate_required = true.

  -- ITA round lifecycle (Albert directive 2026-10-19)
  round_opened_at           TIMESTAMP,        -- set when the SOT clicks "Initiate ITA & invite all trainers"
  min_forms_threshold        INTEGER DEFAULT 3,
  started_below_threshold    BOOLEAN DEFAULT false, -- true if synthesis began via the explicit "start anyway" override

  -- Trainer feedback (consensus)
  trainers_consulted        TEXT[],           -- Array of trainer user IDs
  trainer_feedback_json     JSONB,            -- Domain ratings + comments
  trainer_consensus_date    DATE,
  
  -- SOT assessment
  sot_overall_rating        INTEGER,          -- 1-4 scale (1=exceeds, 4=unsatisfactory); this is sot_grade in M6/PRD §2.3
  final_grade                INTEGER,          -- M6: distinct from sot_overall_rating; equal by default, may change after a BOE ruling (see boe_ruling* below)
  sot_comments              TEXT,
  sot_signed_by             TEXT REFERENCES users(id),
  sot_signed_at             TIMESTAMP,
  
  -- Trainee reflection
  trainee_reflection        TEXT,
  trainee_learning_goals    TEXT,
  trainee_signed_at         TIMESTAMP,
  
  -- Outcomes
  is_satisfactory           BOOLEAN,
  requires_remediation      BOOLEAN DEFAULT false,
  escalated_to_boe          BOOLEAN DEFAULT false,
  boe_escalation_date       DATE,
  
  -- Remediation plan (if unsatisfactory)
  remediation_plan          TEXT,
  remediation_due_date      DATE,
  remediation_completed     BOOLEAN DEFAULT false,

  -- BOE ruling on an externally-raised dispute (Albert directive 2026-10-19: appeals are
  -- raised with the College by email, not through the system -- these fields are an
  -- administrative record of the outcome, entered by College Admin, not an in-app appeal flow)
  boe_ruling                 TEXT,             -- upheld | overturned | re_assess
  boe_ruling_recorded_by     TEXT REFERENCES users(id),
  boe_ruling_recorded_at     TIMESTAMP,
  boe_ruling_note            TEXT,
  
  -- Overdue tracking
  due_date                  DATE NOT NULL,
  is_overdue                BOOLEAN GENERATED ALWAYS AS (
    CURRENT_DATE > due_date AND status != 'completed'
  ) STORED,
  days_overdue              INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN CURRENT_DATE > due_date AND status != 'completed'
      THEN CURRENT_DATE - due_date
      ELSE 0
    END
  ) STORED,
  
  -- Metadata
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at              TIMESTAMP
);

CREATE INDEX idx_itas_trainee ON itas(trainee_id);
CREATE INDEX idx_itas_status ON itas(status);
CREATE INDEX idx_itas_overdue ON itas(is_overdue, days_overdue);
CREATE INDEX idx_itas_dates ON itas(assessment_period_start, assessment_period_end);
```

### `ita_domain_ratings`
Detailed ratings by clinical domain

```sql
CREATE TABLE ita_domain_ratings (
  id                    SERIAL PRIMARY KEY,
  ita_id                INTEGER REFERENCES itas(id) ON DELETE CASCADE,
  
  domain_code           TEXT NOT NULL,    -- e.g., "1a", "1b", "2a"
  domain_name           TEXT NOT NULL,
  rating                INTEGER,          -- 1-4 scale, X=unable to assess
  trainer_id            TEXT REFERENCES users(id),
  comments              TEXT,
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ita_domains_ita ON ita_domain_ratings(ita_id);
```

---

## 6. Workplace-Based Assessments (WBA)

### `wbas`
Individual WBA records

```sql
CREATE TABLE wbas (
  id                    SERIAL PRIMARY KEY,
  trainee_id            INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  
  -- WBA type
  wba_type              TEXT NOT NULL,    -- CEX, CBD, DOPS, ALMAT, MSF in use; EPA reserved. PBA and ACR are never stored (quarantined).
  
  -- Category classification
  wba_category          TEXT NOT NULL,    -- clinical_fundamentals, specialty_modules
  domain_code           TEXT,             -- e.g., "2.1", "3.4"
  domain_name           TEXT,             -- e.g., "General Anaesthesia", "Paediatric Anaesthesia"
  
  -- Training stage when completed
  training_stage        TEXT,             -- BAT, HAT, PFY
  
  -- Assessment details
  focus_area            TEXT,
  clinical_encounter    TEXT,
  date_performed        DATE NOT NULL,
  
  -- Assessor
  assessor_id           TEXT REFERENCES users(id),
  assessor_name         TEXT,
  assessor_hospital     TEXT,
  
  -- Outcome
  outcome               TEXT,             -- Independent, Above Standard, Meets Standard, Satisfactory
  feedback_given        TEXT,
  learning_points       TEXT,
  
  -- iWBA integration (read API refreshed 2026-10-20). jcimed_sync_id was renamed iwba_assessment_id.
  iwba_assessment_id    UUID UNIQUE,      -- iWBA assessment id; the upsert key
  iwba_status           TEXT,             -- completed | failed | in_progress | unverified
  workflow_outcome      TEXT,             -- DOPS only: COMPLETE | FAIL | null while in progress
  iwba_updated_at       TIMESTAMPTZ,      -- source updated_at, used for the sync cursor
  curriculum_code       TEXT,             -- CF-2.x | SM-3.x | PFY | MSF | ECHO-WBA (from the mapping)
  procedure_code        TEXT,             -- iWBA procedure.code, kept as received
  procedure_name        TEXT,
  entrustment_level     SMALLINT,         -- EPA only (reserved)
  hospital_snapshot     TEXT,
  ward_snapshot         TEXT,
  trainee_iwba_user_id  UUID NOT NULL,    -- always present in the API; links to wba_iwba_links
  trainer_iwba_user_id  UUID,
  trainer_hkam_id       TEXT,
  trainer_name_snapshot TEXT,             -- immutable; the live user record can change later
  timeline              JSONB,            -- immutable snapshot of timeline[] (steps and answers). Empty array allowed.
  iwba_last_sync        TIMESTAMPTZ,
  
  -- Metadata
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- trainee_id is nullable on purpose: an unlinked assessment is held with trainee_id NULL until College Admin links the person.
CREATE INDEX idx_wbas_iwba_user ON wbas(trainee_iwba_user_id);
CREATE INDEX idx_wbas_trainee ON wbas(trainee_id);
CREATE INDEX idx_wbas_type_category ON wbas(wba_type, wba_category);
CREATE INDEX idx_wbas_date ON wbas(date_performed);
CREATE INDEX idx_wbas_stage ON wbas(training_stage);
```

### `wba_iwba_links`, `wba_sync_state`, `wba_sync_conflicts`

The iWBA API returns no email, MCHK or college trainee number, so a person is linked once and the link is stored.

```sql
CREATE TABLE wba_iwba_links (
  iwba_user_id   UUID PRIMARY KEY,          -- iWBA users.id, stable
  user_id        TEXT REFERENCES users(id), -- the HKCA person (trainee or trainer)
  hkam_id        TEXT,                      -- eHKAM SSO account id; not the HKAM Fellow ID; may start null
  -- Unlinked people (Admin console, 2026-10-24): a row exists from first sight, with user_id null until confirmed
  iwba_display_name TEXT, iwba_hospital TEXT, iwba_role TEXT,   -- exactly as iWBA sent them
  status         TEXT NOT NULL DEFAULT 'unlinked',            -- unlinked | confirmed | ignored
  link_method    TEXT,                      -- null while unlinked; sso_hkam_id | admin_confirmed | admin_csv
  confirmed_by   INTEGER REFERENCES users(id),
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wba_sync_state (            -- one row per college token and endpoint
  endpoint       TEXT PRIMARY KEY,         -- summary | backfill
  cursor_updated_at TIMESTAMPTZ,           -- advanced only after a full traversal succeeds
  last_run_at    TIMESTAMPTZ, last_status TEXT, last_error TEXT,
  last_records_read INTEGER, last_records_failed INTEGER   -- shown in the Admin console health strip
);

CREATE TABLE wba_sync_conflicts (
  id             SERIAL PRIMARY KEY,
  iwba_assessment_id UUID,
  reason         TEXT NOT NULL,            -- unknown_modality | unlinked_trainee | unmapped_procedure | field_conflict | not_found
  raw_payload    JSONB NOT NULL,
  detected_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolved_by    INTEGER REFERENCES users(id), resolved_at TIMESTAMPTZ, resolution_note TEXT
);
```

### `wba_progress_summary` (Materialized View)
Aggregate WBA counts for dashboard

```sql
CREATE MATERIALIZED VIEW wba_progress_summary AS
SELECT 
  trainee_id,
  
  -- Clinical Fundamentals
  COUNT(*) FILTER (WHERE wba_category = 'clinical_fundamentals') AS clinical_fundamentals_total,
  COUNT(*) FILTER (WHERE wba_category = 'clinical_fundamentals' AND training_stage = 'BAT') AS clinical_fundamentals_bat,
  COUNT(*) FILTER (WHERE wba_category = 'clinical_fundamentals' AND training_stage = 'HAT') AS clinical_fundamentals_hat,
  
  -- Specialty Modules
  COUNT(*) FILTER (WHERE wba_category = 'specialty_modules') AS specialty_modules_total,
  
  -- By type
  COUNT(*) FILTER (WHERE wba_type = 'CEX') AS cex_count,
  COUNT(*) FILTER (WHERE wba_type = 'CBD') AS cbd_count,
  COUNT(*) FILTER (WHERE wba_type = 'DOPS') AS dops_count,
  COUNT(*) FILTER (WHERE wba_type = 'ALMAT') AS almat_count,
  COUNT(*) FILTER (WHERE wba_type = 'MSF') AS msf_count,
  
  MAX(date_performed) AS last_wba_date
FROM wbas
GROUP BY trainee_id;

CREATE UNIQUE INDEX idx_wba_summary_trainee ON wba_progress_summary(trainee_id);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_wba_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY wba_progress_summary;
END;
$$ LANGUAGE plpgsql;
```

---

## 7. Volume of Practice (e-Logbook)

### `volume_of_practice`
Individual case logs

```sql
CREATE TABLE volume_of_practice (
  id                    SERIAL PRIMARY KEY,
  trainee_id            INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  
  -- Case details
  case_date             DATE NOT NULL,
  hospital_id           INTEGER REFERENCES hospitals(id),
  
  -- Patient demographics
  patient_age_years     INTEGER,
  patient_asa_class     INTEGER,
  is_emergency          BOOLEAN DEFAULT false,
  
  -- Procedure
  surgical_specialty    TEXT,
  procedure_type        TEXT,
  procedure_description TEXT,
  
  -- Anaesthetic technique
  anaesthetic_type      TEXT[],           -- GA, spinal, epidural, regional, sedation
  airway_management     TEXT,             -- LMA, ETT, face mask
  regional_technique    TEXT,             -- if applicable
  
  -- Subspecialty classification (for VOP requirements)
  subspecialty_tags     TEXT[],           -- paediatric, obstetric, cardiac, neuro, icu, etc.
  
  -- Supervision level
  supervision_level     TEXT,             -- independent, supervised, assisted
  supervising_consultant TEXT,
  
  -- VOP category tracking
  vop_category          TEXT,             -- clinical_fundamentals_bat, clinical_fundamentals_hat
  
  -- 2-year retrospective rule
  logged_date           DATE DEFAULT CURRENT_DATE,
  is_within_2yr_window  BOOLEAN GENERATED ALWAYS AS (
    logged_date <= case_date + INTERVAL '2 years'
  ) STORED,
  
  -- Metadata
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vop_trainee ON volume_of_practice(trainee_id);
CREATE INDEX idx_vop_date ON volume_of_practice(case_date);
CREATE INDEX idx_vop_subspecialty ON volume_of_practice USING GIN(subspecialty_tags);
CREATE INDEX idx_vop_2yr_window ON volume_of_practice(is_within_2yr_window);
```

### `vop_requirements_tracking` (Materialized View)
Track progress against curriculum VOP requirements

```sql
CREATE MATERIALIZED VIEW vop_requirements_tracking AS
SELECT 
  trainee_id,
  
  -- Clinical Fundamentals BAT (≥218)
  COUNT(*) FILTER (WHERE vop_category = 'clinical_fundamentals_bat') AS cf_bat_cases,
  
  -- Clinical Fundamentals HAT (≥615 cumulative)
  COUNT(*) FILTER (WHERE vop_category IN ('clinical_fundamentals_bat', 'clinical_fundamentals_hat')) AS cf_total_cases,
  
  -- Subspecialty counts
  COUNT(*) FILTER (WHERE 'paediatric' = ANY(subspecialty_tags)) AS paediatric_cases,
  COUNT(*) FILTER (WHERE 'obstetric' = ANY(subspecialty_tags)) AS obstetric_cases,
  COUNT(*) FILTER (WHERE 'cardiac' = ANY(subspecialty_tags)) AS cardiac_cases,
  COUNT(*) FILTER (WHERE 'icu' = ANY(subspecialty_tags)) AS icu_cases,
  
  MAX(case_date) AS last_logged_case
FROM volume_of_practice
WHERE is_within_2yr_window = true
GROUP BY trainee_id;

CREATE UNIQUE INDEX idx_vop_tracking_trainee ON vop_requirements_tracking(trainee_id);
```

---

## 8. Retrospective Recognition / Lateral Transfer

### `retrospective_recognitions`
Credit for prior/overseas training

```sql
CREATE TABLE retrospective_recognitions (
  id                            SERIAL PRIMARY KEY,
  trainee_id                    INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  
  -- Application
  application_date              DATE NOT NULL,
  application_type              TEXT NOT NULL, -- overseas_training, lateral_transfer, prior_experience
  
  -- Gated access (Admin console, 2026-10-24): the form is locked until Admin unlocks it for this trainee
  access_requested_at           TIMESTAMP,
  form_unlocked_at              TIMESTAMP,
  form_unlocked_by              TEXT REFERENCES users(id),
  
  -- What the applicant asked for (what the Board granted is in the credited_* columns below)
  requested_clinical_months     NUMERIC(4,2),
  requested_icu_months          NUMERIC(4,2),
  requested_elective_months     NUMERIC(4,2),
  requested_cases               INTEGER,
  decision_date                 DATE,          -- date the Training Officer or the Board decided; approval_date is when Admin executed it (renamed from board_decision_date, migration 5)
  decided_by_body               TEXT,          -- TRAINING_OFFICER | BOARD. A rejection is only ever the Board's (database check)
  -- Origin is structured, never free text. The ledger reason is DERIVED from it: OVERSEAS_TRAINING gives RETROSPECTIVE_OVERSEAS_RECOGNITION, OTHER_SPECIALTY gives RETROSPECTIVE_SPECIALTY_TRANSFER.
  origin_kind                   TEXT,          -- OVERSEAS_TRAINING | OTHER_SPECIALTY
  origin_specialty              TEXT,          -- for OTHER_SPECIALTY, for example surgery or emergency medicine
  origin_place                  TEXT,          -- country (overseas) or hospital or place (other specialty); the training body is overseas_institution below
  
  -- Vetting status
  vetting_status                TEXT DEFAULT 'access_requested',
  -- access_requested → unlocked → submitted → with_training_officer → (approved_pending_credit | referred_to_board → approved_pending_credit | rejected) → approved
  -- (Admin console: Request access, With applicant, Check documents, With Training Officer, Needs Board decision, Approved credit to execute, Credit executed.)
  -- The Training Officer's vetting IS the decision when there is no particular issue; a problem goes to the Board; only the Board rejects. Every step is a row in retrospective_recognition_events (section 13).
  
  assigned_reviewer_id          TEXT REFERENCES users(id),
  boe_review_date               DATE,
  approval_date                 DATE,
  
  -- Credit allocation (individually assessed)
  credited_bat_months           NUMERIC(4,2) DEFAULT 0,
  credited_hat_months           NUMERIC(4,2) DEFAULT 0,
  credited_icu_months           NUMERIC(4,2) DEFAULT 0,
  credited_elective_months      NUMERIC(4,2) DEFAULT 0,
  credited_accredited_months    NUMERIC(4,2) DEFAULT 0,  -- for 24/24 rule
  
  -- Subspecialty credits
  credited_clinical_anaesthesia_months NUMERIC(4,2) DEFAULT 0,
  credited_cardiac_months       NUMERIC(4,2) DEFAULT 0,
  credited_paediatric_months    NUMERIC(4,2) DEFAULT 0,
  credited_obstetric_months     NUMERIC(4,2) DEFAULT 0,
  credited_pain_months          NUMERIC(4,2) DEFAULT 0,
  
  -- Overseas institution details
  overseas_institution          TEXT,
  overseas_program_name         TEXT,
  overseas_training_start       DATE,
  overseas_training_end         DATE,
  overseas_duration_months      NUMERIC(4,2),
  
  -- Vetting details
  vetting_notes                 TEXT,
  boe_decision_rationale        TEXT,
  conditions_attached           TEXT,          -- e.g., "Must complete 6 months ICU in HK"
  
  -- Supporting documents
  documents_json                JSONB,         -- Array of {type, file_path, uploaded_date}
  
  -- Audit
  created_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by                    TEXT REFERENCES users(id),
  approved_by                   TEXT REFERENCES users(id)
);

CREATE INDEX idx_retro_trainee ON retrospective_recognitions(trainee_id);
CREATE INDEX idx_retro_status ON retrospective_recognitions(vetting_status);
```

---

## 9. Exams, Courses & Formal Projects

### `exam_results`

```sql
CREATE TABLE exam_results (                -- one row per attempt; built as `ExamResult` (migration 5)
  id                    SERIAL PRIMARY KEY,
  trainee_id            INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  
  exam_type             TEXT NOT NULL,    -- INTERMEDIATE | FINAL_ANAESTHESIA | FINAL_ICU (names as built in Prisma; decision 2026-10-24). The first release covers INTERMEDIATE and FINAL_ANAESTHESIA only (decision 2026-10-25)
  sitting_id            INTEGER,          -- exam_sittings.id (section 13)
  application_id        INTEGER,          -- exam application it came from; null for an imported historical result
  exam_date             DATE NOT NULL,
  result                TEXT NOT NULL,    -- PASS | FAIL overall. Legacy `atp_reg_exam` rows with Processing / Withdraw / Cancel are applications, not results, and are not imported here (Migration Plan 6.9, item 6)
  score                 TEXT,
  -- Intermediate, per subject (results upload columns physiology, pharmacology, minimum_met). A blank subject is carried forward.
  physiology            TEXT,             -- PASS | FAIL
  pharmacology          TEXT,             -- PASS | FAIL
  minimum_met           BOOLEAN,          -- needed when one subject passed and the other failed: the pass carries forward only if the minimum score was met in the failed subject
  -- Final, per section (results upload columns written, oral_osce). Oral and OSCE are one result; separate oral and OSCE columns are refused (decision 2026-10-25).
  written               TEXT,             -- PASS | FAIL; blank = carried forward
  oral_osce             TEXT,             -- PASS | FAIL
  
  attempt_number        INTEGER DEFAULT 1, -- unique per trainee and exam
  source_batch_id       INTEGER,          -- bulk ingestion batch that recorded it; null if entered one at a time
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_exams_trainee ON exam_results(trainee_id, exam_type);
-- Migration 5 moved the result, score, attempt number and batch that used to sit on ExamApplication into this table (one row per result, attempts numbered by date).
-- Those four columns remain on ExamApplication, deprecated, until no code reads them.
```

### `training_stage_history` (added 2026-10-22: Trainee Dashboard progression record)

Append-only log of every stage a trainee enters, so the dashboard can show *when* they moved up, not only where they are now. `trainee_profiles.current_stage` and the `bat_/hat_/pfy_ _start_date` columns stay as the fast read path and are written from this table.

```sql
CREATE TABLE training_stage_history (
  id              SERIAL PRIMARY KEY,
  trainee_id      INTEGER NOT NULL REFERENCES trainee_profiles(id) ON DELETE RESTRICT,
  stage           TEXT NOT NULL,        -- BAT-1 .. BAT-3, HAT-1, HAT-2 .., PFY, EXIT, FELLOW (codes from curriculum_editions)
  effective_date  DATE NOT NULL,
  recorded_by     INTEGER REFERENCES users(id),
  source          TEXT NOT NULL,        -- app | secretariat_csv | legacy_backfill
  note            TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trainee_id, stage)
);
```

Exam passes use `exam_results` as above (one row per attempt; the dashboard shows the passing attempt). Backfill: BAT/HAT/PFY start dates from `trainee_profiles` (legacy `atp_portfolio`), exam dates from `examination_intermediate_passing_date` and `examination_final_passing_date`. The legacy exam dates are `varchar`, so unparseable values go to quarantine and the trainee's record shows "Not yet" until the Secretariat corrects them. HAT year steps (HAT-2 and later) are derived from the HAT start date when no explicit date exists, and marked `source = 'legacy_backfill'`.

### `mandatory_courses`

```sql
CREATE TABLE mandatory_courses (
  id                    SERIAL PRIMARY KEY,
  trainee_id            INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  
  course_code           TEXT NOT NULL,    -- EASE, EMAC, ADAM-A, UGRA, ECHO-A. Legacy source: EASE/EMAC own columns; ADAM-A = training_course_other1, ECHO-A = other2 (FTTE Echo-A workshop), UGRA = other3 (Migration Plan 6.9, item 1)
  course_name           TEXT NOT NULL,
  
  completion_date       DATE,
  certificate_uploaded  BOOLEAN DEFAULT false,
  certificate_file_path TEXT,
  source_batch_id       INTEGER,          -- attendance-sheet batch that marked it completed (Admin console)
  round_id              INTEGER,          -- course_rounds.id the trainee attended (section 12)
  
  verified_by           TEXT REFERENCES users(id),
  verified_at           TIMESTAMP,
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_courses_trainee ON mandatory_courses(trainee_id);
CREATE INDEX idx_courses_completion ON mandatory_courses(completion_date, verified_at);
```

### `formal_projects`
HKCA-E03 project tracking

```sql
CREATE TABLE formal_projects (
  id                        SERIAL PRIMARY KEY,
  trainee_id                INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  
  project_code              TEXT DEFAULT 'HKCA-E03',   -- the requirement code, the same for every trainee
  project_number            TEXT UNIQUE,               -- College-issued formal project number (legacy formal_project_project_number)
  project_type              TEXT,            -- case_report, meta_analysis, observational, qip, rct
  
  title                     TEXT NOT NULL,
  parent_hospital           TEXT,
  
  -- Submission workflow
  status                    TEXT DEFAULT 'protocol_draft',
  -- protocol_draft → protocol_submitted → under_review → revision_required → 
  -- manuscript_submitted → approved → final_approval_letter_issued
  -- plus: appeal (a rejected part under the once-only appeal; migration 5). The earlier `escalated` state (divergent reviews sent to the Subcommittee Chair) was dropped on 2026-10-25: no screen or rule used it.
  -- The state of each PART (protocol, manuscript) is in formal_project_stages (section 13); this column is the project-level summary.
  
  protocol_submitted_date   DATE,
  protocol_anonymized_path  TEXT,
  protocol_identified_path  TEXT,
  
  -- Blinded review
  reviewer_1_id             TEXT REFERENCES users(id),
  reviewer_2_id             TEXT REFERENCES users(id),
  -- reviewer_1/2 columns hold only the CURRENT reviewers. The source of truth for assignment, deadline, replacement and grade is formal_project_reviews (section 12).
  reviewer_1_status         TEXT,            -- approved, revision, rejected (three outcomes, 2026-10-25; the four grades were dropped)
  reviewer_2_status         TEXT,
  reviewer_1_feedback       TEXT,
  reviewer_2_feedback       TEXT,
  review_completed_date     DATE,
  
  -- Revision cycle
  revision_due_date         DATE,
  manuscript_submitted_date DATE,
  manuscript_file_path      TEXT,
  
  -- Final approval
  final_approval_date       DATE,
  approval_letter_path      TEXT,
  
  -- Metadata
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_formal_projects_trainee ON formal_projects(trainee_id);

-- Append-only track record of submissions and approvals, shown to the trainee as the "Submission record".
CREATE TABLE formal_project_events (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES formal_projects(id) ON DELETE RESTRICT,
  event_type   TEXT NOT NULL,   -- protocol_submitted | revision_requested | protocol_resubmitted | protocol_approved
                                -- | manuscript_submitted | manuscript_revision_requested | manuscript_resubmitted | manuscript_approved
  event_date   DATE NOT NULL,
  version_no   SMALLINT,        -- 1 for the first submission, 2 for the first resubmission, ...
  outcome_note TEXT,            -- trainee-visible summary, for example 'Minor revisions'. Never names a blinded reviewer.
  recorded_by  INTEGER REFERENCES users(id),   -- College Admin or the workflow; null when migrated
  source       TEXT NOT NULL,   -- app | admin | legacy_backfill
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fpe_project ON formal_project_events(project_id, event_date);
CREATE INDEX idx_formal_projects_status ON formal_projects(status);
```

### `pfy_plans`
Provisional Fellowship Year 3-domain plans

```sql
CREATE TABLE pfy_plans (
  id                    SERIAL PRIMARY KEY,
  trainee_id            INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  
  -- 3 domains
  clinical_plan         TEXT NOT NULL,
  management_plan       TEXT NOT NULL,
  education_plan        TEXT NOT NULL,
  
  -- Approval workflow
  status                TEXT DEFAULT 'draft',
  -- draft → submitted → sot_review → cos_review → approved
  
  submitted_date        DATE,
  sot_approved_by       TEXT REFERENCES users(id),
  sot_approved_date     DATE,
  cos_approved_by       TEXT REFERENCES users(id),
  cos_approved_date     DATE,
  
  -- Completion report
  completion_report     TEXT,
  completion_date       DATE,
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pfy_plans_trainee ON pfy_plans(trainee_id);
```

---

### PROPOSED: `learning_plans`, `learning_goals` & `logbook_verifier_assignments` (supersedes `pfy_plans` and `ita_sessions.trainee_learning_goals`; `logbook_verifier_assignments` has no legacy predecessor)
Learning plans are **linked** to the ITA via goal-achievement review during synthesis (confirmed 2026-10-19, corrects the earlier "delinked" framing) &mdash; but goals are still never shown to trainers, and a Not Achieved goal is advisory-only (does not affect the ITA grade; see PRD §2.4). One table serves both plan types. Proposal only; the committed baseline migration is not edited.

```sql
CREATE TABLE learning_plans (
  id                 SERIAL PRIMARY KEY,
  trainee_id         INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  plan_type          TEXT NOT NULL,            -- SIX_MONTH | PF_YEAR
  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,
  assigned_sot_id    TEXT REFERENCES users(id), -- set at period start; transferable
  status             TEXT DEFAULT 'NOT_SET',
  -- NOT_SET -> DRAFT -> SUBMITTED -> (CHANGES_REQUESTED) -> [PF: AWAITING_COS ->] SIGNED -> CHANGE_PROPOSED -> [PF: CHANGE_COS ->] SIGNED
  -- review: REVIEW_OPEN -> REVIEW_SUBMITTED -> REVIEWED
  version            INTEGER DEFAULT 0,
  notified_at        DATE,
  submitted_at       DATE,
  signed_by          TEXT REFERENCES users(id), -- immutable once signed; survives a later transfer
  signed_at          DATE,
  cos_approved_by    TEXT REFERENCES users(id), -- PF_YEAR only
  cos_approved_at    DATE,
  -- end-of-period formative review (not graded)
  review_summary     TEXT,                      -- PF_YEAR completion report
  review_submitted_at DATE,
  reviewed_by        TEXT REFERENCES users(id),
  reviewed_at        DATE,
  review_comment     TEXT,
  UNIQUE (trainee_id, plan_type, period_start)
);
CREATE TABLE learning_goals (
  id            SERIAL PRIMARY KEY,
  plan_id       INTEGER REFERENCES learning_plans(id) ON DELETE CASCADE,
  plan_version  INTEGER NOT NULL,              -- goals are versioned with the plan
  domain_code   TEXT NOT NULL,                 -- CF-2.x | SM-3.x | ITA-CLINICAL_SKILLS | ITA-CRISIS_MANAGEMENT | ITA-TEAMWORK | ITA-COMMUNICATION | OTHER | CLINICAL | MANAGEMENT | EDUCATION
  objective     TEXT NOT NULL,
  success       TEXT NOT NULL,
  evidence      TEXT,
  reflection    TEXT,                           -- trainee's note at review
  -- Goal-achievement outcome (Albert directive 2026-10-19: linked to the ITA, graded by the
  -- Assigned SOT during synthesis -- shown to the trainee, never to trainers, advisory only:
  -- does not affect the ITA's overall grade or the College Overall Rule, PRD §2.2/§2.4)
  outcome            TEXT,                      -- COMPLETELY_ACHIEVED | PARTIALLY_ACHIEVED | NOT_ACHIEVED
  outcome_graded_by  TEXT REFERENCES users(id),
  outcome_graded_at  TIMESTAMP,
  outcome_ita_id     INTEGER REFERENCES itas(id) -- which ITA synthesis session graded this goal
);
CREATE TABLE learning_plan_proposals (          -- mid-period change request
  id SERIAL PRIMARY KEY, plan_id INTEGER REFERENCES learning_plans(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, proposed_goals_json JSONB NOT NULL, proposed_at DATE,
  sot_decided_by TEXT REFERENCES users(id), sot_decided_at DATE, sot_decision TEXT,   -- step 1, Assigned SOT
  cos_decided_by TEXT REFERENCES users(id), cos_decided_at DATE, cos_decision TEXT,   -- step 2, PF_YEAR only
  board_informed_at DATE                                                              -- Board of Education notified on final approval (PF_YEAR)
);
CREATE TABLE sot_assignments (                  -- carried over each period; reassign writes a new row
  id SERIAL PRIMARY KEY, trainee_id INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  sot_id TEXT REFERENCES users(id), period_start DATE NOT NULL, reassigned_from TEXT REFERENCES users(id),
  reassigned_at DATE, reassigned_by TEXT REFERENCES users(id), reason TEXT
);
CREATE TABLE logbook_verifier_assignments (     -- ONGOING, not period-boxed (unlike sot_assignments above)
  id SERIAL PRIMARY KEY, trainee_id INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  verifier_id TEXT REFERENCES users(id),        -- NULL = unassigned pool, open for any ASOT/SOT at the
                                                 -- trainee's hospital to claim (PRD §3.1)
  assigned_at TIMESTAMP, assigned_by TEXT REFERENCES users(id),
  unassigned_at TIMESTAMP, unassigned_reason TEXT,
  is_current BOOLEAN DEFAULT true
);
```
The Chief of Service is a distinct role (`role = 'COS'`), not an SOT permission; PF plan approval and PF plan change approval are gated on it.
Migration: each legacy `pfy_plans` row (clinical/management/education text) becomes one `PF_YEAR` plan with one goal per domain, marked signed/approved from `sot_signed_at` / `cos_signed_at`. `ita_sessions.trainee_learning_goals` is deprecated; keep read-only for history. `logbook_verifier_assignments` has **no legacy predecessor** &mdash; `patient2.approved_by` was free text with no foreign key, and any SOT/Assistant SOT could sign off any case ad hoc (see Legacy EPS Schema Audit §5). The table therefore starts empty at cutover; every trainee needs a fresh initial assignment or sits in the unassigned pool.

---

## 10. Audit & Notifications

### `audit_log`
System-wide audit trail

```sql
CREATE TABLE audit_log (
  id                    BIGSERIAL PRIMARY KEY,
  
  entity_type           TEXT NOT NULL,    -- trainee, ita, wba, rotation, etc.
  entity_id             TEXT NOT NULL,
  
  action                TEXT NOT NULL,    -- create, update, delete, approve, reject
  field_changed         TEXT,
  old_value             TEXT,
  new_value             TEXT,
  
  performed_by          TEXT REFERENCES users(id),
  performed_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  ip_address            INET,
  user_agent            TEXT,
  notes                 TEXT
);

-- Hash chain, as built in Prisma (H7); this doc previously omitted it:
ALTER TABLE audit_log ADD COLUMN prev_hash TEXT, ADD COLUMN row_hash TEXT NOT NULL;   -- row_hash = sha256(prev_hash + canonical row payload)
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_log(performed_by, performed_at);
CREATE INDEX idx_audit_timestamp ON audit_log(performed_at);
```

### `notifications`

```sql
CREATE TABLE notifications (
  id                    SERIAL PRIMARY KEY,
  user_id               TEXT REFERENCES users(id) ON DELETE CASCADE,
  
  notification_type     TEXT NOT NULL,    -- ita_overdue, center_expiring, exam_result, etc.
  priority              TEXT DEFAULT 'normal', -- low, normal, high, urgent
  
  title                 TEXT NOT NULL,
  message               TEXT NOT NULL,
  link_url              TEXT,
  
  is_read               BOOLEAN DEFAULT false,
  read_at               TIMESTAMP,
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);
```

---

## Key Business Logic Functions

### Progression Gate Validation

```sql
CREATE OR REPLACE FUNCTION can_progress_to_hat(trainee_id_param INTEGER)
RETURNS JSONB AS $$
DECLARE
  trainee RECORD;
  wba_summary RECORD;
  vop_summary RECORD;
  blockers TEXT[] := '{}';
BEGIN
  SELECT * INTO trainee FROM trainee_profiles WHERE id = trainee_id_param;
  SELECT * INTO wba_summary FROM wba_progress_summary WHERE trainee_id = trainee_id_param;
  SELECT * INTO vop_summary FROM vop_requirements_tracking WHERE trainee_id = trainee_id_param;
  
  -- Check accredited time (≥36 months)
  IF trainee.total_accredited_months < 36 THEN
    blockers := array_append(blockers, format('Need %.1f more months of accredited training', 36 - trainee.total_accredited_months));
  END IF;
  
  -- Check Clinical Fundamentals WBA (≥16)
  IF wba_summary.clinical_fundamentals_total < 16 THEN
    blockers := array_append(blockers, format('Need %s more Clinical Fundamentals WBA', 16 - wba_summary.clinical_fundamentals_total));
  END IF;
  
  -- Check VOP (≥218)
  IF vop_summary.cf_bat_cases < 218 THEN
    blockers := array_append(blockers, format('Need %s more cases for VOP', 218 - vop_summary.cf_bat_cases));
  END IF;
  
  -- Check MSF (≥1)
  IF wba_summary.msf_count < 1 THEN
    blockers := array_append(blockers, 'Need 1 MSF');
  END IF;
  
  -- Check Intermediate Exam
  IF NOT trainee.intermediate_exam_passed THEN
    blockers := array_append(blockers, 'Must pass Intermediate Exam');
  END IF;
  
  -- Check all ITAs satisfactory
  IF EXISTS (SELECT 1 FROM itas WHERE trainee_id = trainee_id_param AND is_satisfactory = false) THEN
    blockers := array_append(blockers, 'All ITAs must be satisfactory');
  END IF;
  
  RETURN jsonb_build_object(
    'can_progress', array_length(blockers, 1) IS NULL,
    'blockers', blockers
  );
END;
$$ LANGUAGE plpgsql;
```

---

## Indexes Summary

**High-cardinality queries:**
- Trainee dashboards: `trainee_id` indexes on all trainee-related tables
- Date range queries: Composite indexes on `(trainee_id, date)` for ITAs, WBAs, VOP
- Status filtering: Indexes on `status`, `is_active`, `training_stage`

**Materialized views refresh strategy:**
- `wba_progress_summary`: Refresh on WBA insert/update (trigger)
- `vop_requirements_tracking`: Refresh daily (cron job)
- `centres_expiring_soon`: Refresh weekly

---

## Next Steps

1. **Implement in Prisma schema** (or Drizzle)
2. **Seed data**: Import accredited centers, hospitals, test trainees
3. **Write migration scripts** for legacy data import
4. **API layer**: tRPC or Next.js API routes with type-safe queries
5. **Real-time updates**: Consider Supabase realtime or Pusher for live dashboard updates

---

## MVP Additions (Discovered in Legacy Audit)

These entities were found in the legacy schema and are required for MVP workflows, but were not in the original draft. Full definitions to be added.

| Entity | Why needed | Source evidence |
|---|---|---|
| `ita_assessor_responses` | SOT collates per-trainer feedback before synthesis. Built (migration `1_ita_15_item_form`): per-item `{grade, example}` for the College's 15 items, `specialistComments`, sealed `recordHash`, unique per trainer per session; see decision I1. Legacy models this as `atp_ita1` (17,757 rows) under `atp_mita`. | Legacy `atp_mita` → `atp_ita1` → `atp_ita_assessor` |
| `ita_assessors` | Tracks trainer invitations + response state per ITA session | Legacy `atp_ita_assessor` (17,545 rows) |
| `msf_sessions` | MSF session header (one per BAT/HAT/PFY completion) | Legacy `atp_msfs` |
| `msf_responses` | Individual rater questionnaire responses | Legacy `atp_msf` (q1–q20 + 4 free-text domains) |
| `external_assessors` | MSF raters outside the College user directory | Legacy `atp_assessor` |
| `notification_state` (enum) | Replaces four inconsistent free-text mail-state patterns | Legacy `sent` / `resent` / `send_at_midnight` as `text` |
| Legacy provenance columns | `legacy_tid`, `legacy_table`, `migrated_at` on every migrated entity | Needed for audit traceability across ETL |

---

## Volume of Practice (e-Logbook) — RECONCILED

✅ **Source located:** legacy table `patient2` (38 columns) in the `eps` database.
See [[Legacy EPS Schema Audit]] §5.

### Legacy → target mapping

| Legacy `patient2` column | Target field | Treatment |
|---|---|---|
| `pid`, `tid` | composite key | `legacy_pid` + `trainee_id` FK |
| `approved_status`, `approved_by`, `approved_date`, `approved_notes` | `verification_status`, `verified_by`, `verified_at`, `verification_notes` | Preserve. Verification workflow already existed. |
| `date_entry` | `logged_date` | Drives the 2-year retrospective rule |
| `cluster`, `hospital`, `level_training`, `year_training` | `hospital_id`, `training_stage` at entry | Denormalised snapshot — preserve as entry-time values |
| `hkid`, `sex`, `date_birth`, `age` | ⚠️ **see handling note** | Patient identifiers |
| `asa` | `asa_class` | Parse to int |
| `start_date`, `length_hours` | `case_date`, `duration_hours` | |
| `surg_dx`, `op1` | `surgical_diagnosis`, `primary_operation` | Free text — retain, plus structured `procedure_code` |
| **`module_claimed`** | `cf_module` (FK to curriculum descriptor) | ⚠️ **Free text → must be normalised** |
| **`specialty_module_claimed`** | `specialty_module` (FK) | ⚠️ **Free text → must be normalised** |
| **`procedure_claimed`** | `descriptor_code` (FK) | ⚠️ **Free text → must be normalised** |
| `general_anaesthesia_and_sedation`, `regional_anaesthesia`, `airway_management`, `acute_pain_management` | `cf_domain_flags[]` | Map to Curriculum §2.1–2.4 |
| `mode_anaesthesia` | `anaesthetic_technique[]` | Enumerate into controlled list |
| `level_supervision` | `supervision_level` | Confirm 1–4 vocabulary |
| `block1`…`block6` | `case_blocks` child table | **Normalise** — six repeating rows |
| `pain_session_am`, `pain_session_pm` | `pain_sessions` child table | Phase 2 (Pain Medicine) — **preserve, do not migrate to MVP** |
| `remark` | `trainee_notes` | |

### Target schema

```sql
CREATE TABLE volume_of_practice (
  id                SERIAL PRIMARY KEY,
  trainee_id        INTEGER NOT NULL REFERENCES trainee_profiles(id),
  hospital_id       INTEGER REFERENCES hospitals(id),

  case_ref          TEXT NOT NULL UNIQUE, -- synthetic reference; replaces patient identity

  -- case
  case_date         DATE NOT NULL,
  duration_hours    NUMERIC(4,2),
  asa_class         SMALLINT,
  patient_age       SMALLINT,             -- retained as clinical context; HKID, DOB and sex are dropped
  training_stage_at_entry TEXT,           -- legacy level_training / stage when logged (snapshot)
  trainee_notes     TEXT,                 -- legacy remark
  dedupe_key        TEXT NOT NULL,        -- hash of trainee, date, hospital, ASA, age, operation
  surgical_diagnosis TEXT,
  primary_operation TEXT,
  anaesthetic_technique TEXT[],
  supervision_level SMALLINT,

  -- curriculum classification (normalised from free-text claims)
  vop_category      TEXT NOT NULL,        -- clinical_fundamentals | specialty_module
  descriptor_code   TEXT NOT NULL,        -- e.g. "2.2", "3.5" — FK to curriculum_descriptors
  cf_domain_flags   TEXT[],               -- 2.1 / 2.2 / 2.3 / 2.4
  classified_by     TEXT NOT NULL,        -- trainee | sot_corrected | classifier | migrated
  needs_classification BOOLEAN NOT NULL DEFAULT false, -- imported row whose free-text claim matched no descriptor; counts toward nothing until set
  classification_confidence NUMERIC(4,3),
  classifier_diverged BOOLEAN DEFAULT false,

  -- verification (was: approved_*)
  verification_status TEXT NOT NULL DEFAULT 'pending', -- pending | under_review | revision_requested | approved | rejected
  verified_by       INTEGER REFERENCES users(id),
  verified_by_name  TEXT,                 -- legacy approved_by is free text; kept when no users match
  verified_by_role  TEXT,                 -- sot | assistant_sot
  verified_at       TIMESTAMP,
  verification_notes TEXT,

  -- 2-year retrospective rule
  logged_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  is_within_2yr_window BOOLEAN GENERATED ALWAYS AS
                    (logged_date <= case_date + INTERVAL '2 years') STORED,
  legacy_window_anomaly BOOLEAN NOT NULL DEFAULT false, -- imported row outside the window although the legacy app enforced it
  is_accredited     BOOLEAN NOT NULL DEFAULT true,      -- counts toward progress when approved

  -- provenance
  legacy_pid        INTEGER,
  legacy_tid        TEXT,
  migrated_at       TIMESTAMP,
  UNIQUE (legacy_pid, legacy_tid)
);

CREATE TABLE vop_verification_events (   -- full transition history; the columns above hold the current state
  id SERIAL PRIMARY KEY,
  vop_id INTEGER NOT NULL REFERENCES volume_of_practice(id) ON DELETE RESTRICT,
  from_status TEXT, to_status TEXT NOT NULL,
  actor_name TEXT, actor_role TEXT, note TEXT,
  occurred_at TIMESTAMP NOT NULL,
  source TEXT NOT NULL                  -- app | legacy_import (one synthetic event per imported row, dated approved_date)
);

CREATE TABLE case_blocks (          -- normalises block1..block6
  id SERIAL PRIMARY KEY,
  vop_id INTEGER NOT NULL REFERENCES volume_of_practice(id) ON DELETE CASCADE,
  block_site TEXT,
  block_technique TEXT,
  sequence SMALLINT
);
```

### Classification normalisation — the real work

All four claim fields are free `text` with no controlled vocabulary. Migration must therefore:

1. **Extract distinct values** from `module_claimed`, `specialty_module_claimed`,
   `procedure_claimed`, `mode_anaesthesia`, `level_training`, `level_supervision`.
2. **Build a mapping table** from observed values → curriculum descriptor codes (`2.1`–`2.7`, `3.1`–`3.13`).
3. **Quarantine unmapped values** and report counts to the College before cutover.
4. **Create `curriculum_descriptors`** as a real lookup table so the new classifier has an FK target.

This is the single largest piece of ETL work in the project, and the largest data-quality risk.

### ⚠️ Patient identifier handling

`patient2` holds patient `hkid` as plaintext `varchar(15)`, plus `date_birth`, `age`, `sex`,
`surg_dx` and `op1`. Two distinct issues:

1. **Do not migrate patient identifiers into the new logbook** unless there is a documented clinical
   need. The curriculum VOP requirement is satisfied by case type and count — not by patient identity.
   Recommended: drop `hkid`, `date_birth`, `sex`; retain `age` and `asa` as clinical context.
2. **Confirm the plaintext HKID finding with the College.** `user.hkid` is `blob` (probably encrypted)
   while `patient2.hkid` is plaintext. This inconsistency is a privacy exposure that predates this
   project and should be raised regardless of the migration.

### Open questions
1. `approved_by` — SOT, Assistant SOT, or either?
2. Was `approved_status` binary, or did it carry rejection/revision states?
3. Does a `patient` (v1) table exist outside both dumps?
4. Is the 2-year retrospective rule enforced in the legacy application, or only documented? (`date_entry` vs `start_date` would reveal this.)

---

## 12. Admin console additions (added 2026-10-24)

Source: `Admin Prototype Delta Check 2026-10-24.md`. These tables are needed by the College Secretariat Console prototype.

**Prisma status (2026-10-25):** migration 5 (`5_secretariat_courses_exams_projects`) adds the courses, exams, formal-project and recognition changes in section 13 and edits several tables below in place. **Prisma status (2026-10-24):** migration `3_admin_console_schema_alignment` adds all of them, plus the earlier doc-only tables (`wba_iwba_links`, `wba_sync_state`, `retrospective_recognitions`, `training_stage_history`, `formal_project_events`, learning plans with goals and proposals, `sot_assignments`, `logbook_verifier_assignments`, `vop_verification_events`, `notifications`). 22 tables in all, verified on Postgres by `tests/schema/verify_admin_schema.mjs`. Deliberate differences from the SQL in this document:
- Ids are UUID strings and foreign keys to users are text, as in the rest of Prisma, not `SERIAL`/`INTEGER`.
- `ita_domain_ratings` is not built: the 15-item form (migration 1) superseded it.
- `icu_tutorials` and `icu_tutorial_attendance` are not built: whether ICU trainees are in scope is an open question to the College.
- `volume_of_practice.is_within_2yr_window` (a generated column) is not built; `disqualificationReason` and `isAccredited` carry the rule. `dedupeKey` is nullable so existing rows load.
- `users.email_verified`, `image`, `role` and `last_login` are auth-library fields, not built; roles live in `UserRoleAssignment`.
- Where the doc and Prisma already hold the same fact under different names (for example `commencementBat` for `bat_start_date`, the ITA item columns after migration 1), Prisma's names stand. The doc was not re-aligned column by column for these.
- `TrainingStage` no longer contains SUSPENDED or TERMINATED. The migration refuses to run if any row still uses them.

Decisions recorded 2026-10-24 (Dr. Chan): (1) trainee status words are active, on leave, deactivated, completed, with suspension a separate Board flag; (2) recognition credit uses ledger reasons `RETROSPECTIVE_OVERSEAS_RECOGNITION` and `RETROSPECTIVE_SPECIALTY_TRANSFER` and carries the Board decision date; (3) recognised logbook cases are stored as a case-credit row (option A, below); (4) there is no Acting SOT role.

### Intake and status

```sql
CREATE TABLE applications (                  -- Admin intake queue; a trainee exists only after approval
  id               SERIAL PRIMARY KEY,
  applicant_user_id TEXT REFERENCES users(id),
  requested_stage  TEXT NOT NULL DEFAULT 'BAT',        -- BAT, or HAT for a lateral transfer
  parent_hospital_id INTEGER REFERENCES hospitals(id),
  submitted_at     TIMESTAMP NOT NULL,
  check_mchk       BOOLEAN NOT NULL DEFAULT false,     -- Medical Council registration checked
  check_fee        BOOLEAN NOT NULL DEFAULT false,     -- application fee matched to payment record
  check_endorsement BOOLEAN NOT NULL DEFAULT false,    -- DERIVED from application_endorsements (section 13): both signer rows signed, by e-signature or an attached PDF
  endorsement_doc_id TEXT,
  mchk_registration_type   TEXT,                       -- full | limited (never 'specialist': applicants are not yet specialists)
  mchk_registration_number TEXT,
  status           TEXT NOT NULL DEFAULT 'submitted',  -- submitted | returned | approved
  return_note      TEXT,
  decided_by       TEXT REFERENCES users(id),
  decided_at       TIMESTAMP,
  trainee_id       INTEGER REFERENCES trainee_profiles(id)   -- set on approval
);
-- Approval is allowed only when all three checks are true. It issues the HKCA number, binds the current curriculum edition,
-- sets parent hospital and stage, opens the ledger at 0 months and notifies the SOT, in one transaction, and writes audit_log.

CREATE TABLE trainee_status_events (          -- append-only
  id             SERIAL PRIMARY KEY,
  trainee_id     INTEGER NOT NULL REFERENCES trainee_profiles(id) ON DELETE RESTRICT,
  status         TEXT NOT NULL,               -- active | on_leave | deactivated | completed
  effective_date DATE NOT NULL,
  reason         TEXT,                        -- required unless status = active
  source         TEXT NOT NULL DEFAULT 'app', -- app | legacy_import | secretariat_review
  is_confirmed   BOOLEAN NOT NULL DEFAULT true, -- false for a status inferred from legacy `active`
  recorded_by    TEXT REFERENCES users(id),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Legacy status is not trusted (Dr. Chan, 2026-10-24: the legacy active flag is poorly kept). Import writes one event per trainee with `source = 'legacy_import'` and `is_confirmed = false`: legacy Y becomes active, anything else becomes deactivated with the reason "from legacy, reason unknown". The Admin console lists every trainee whose latest event is unconfirmed ("Status to confirm"); confirming writes a new event (`source = 'secretariat_review'`, `is_confirmed = true`) with the real status, reason and effective date. Nothing is overwritten. The cutover report states how many remain unconfirmed.

### Recognition: ledger and case credit

Ledger (`accredited_time_ledger`): add reasons `RETROSPECTIVE_OVERSEAS_RECOGNITION` and `RETROSPECTIVE_SPECIALTY_TRANSFER` to `LedgerReason`, and columns `decision_date DATE` and `decided_by_body TEXT` (TRAINING_OFFICER or BOARD; the authority role stays the Admin who executed it). These replace `board_decision_date` (renamed in migration 5, data kept), because the Training Officer's vetting can itself be the decision.

```sql
CREATE TABLE vop_credit_adjustments (        -- option A: recognised logbook cases (decision 2026-10-24)
  id                  SERIAL PRIMARY KEY,
  trainee_id          INTEGER NOT NULL REFERENCES trainee_profiles(id) ON DELETE RESTRICT,
  recognition_id      INTEGER REFERENCES retrospective_recognitions(id),
  cases               INTEGER NOT NULL,       -- cases recognised by the Board
  module_code         TEXT,                   -- SM-3.x the Board allocated them to; null = counts to the overall total only
  reason              TEXT NOT NULL,          -- RETROSPECTIVE_OVERSEAS_RECOGNITION | RETROSPECTIVE_SPECIALTY_TRANSFER | correction codes
  decision_date       DATE NOT NULL,          -- renamed from board_decision_date (migration 5)
  decided_by_body     TEXT,                   -- TRAINING_OFFICER | BOARD
  note                TEXT,
  recorded_by         TEXT REFERENCES users(id),
  supersedes_id       INTEGER REFERENCES vop_credit_adjustments(id),   -- a correction is a new row; rows are never edited
  is_current          BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
Rules: counted in cumulative case totals; counted towards a module minimum **only** when `module_code` is set; shown to the trainee and SOT as "Recognised by the Board", never as verified cases; outside the 2-year logbook lock; permanent.

### Courses

```sql
CREATE TABLE course_catalogue (
  course_code  TEXT PRIMARY KEY,              -- EASE, EMAC, ADAM-A, ECHO-A, UGRA, plus non-mandatory legacy courses
  course_name  TEXT NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  organiser    TEXT                           -- CSC (Clinical Simulation Committee) | HKCA
);
CREATE TABLE course_rounds (
  id          SERIAL PRIMARY KEY,
  course_code TEXT NOT NULL REFERENCES course_catalogue(course_code),
  round_date  DATE NOT NULL,                  -- first day
  end_date    DATE,                           -- last day of a multi-day course
  seats       INTEGER,                        -- null = no cap (the Mock Viva)
  venue       TEXT,
  format      TEXT,                           -- Face-to-face | Online | Online and face-to-face
  fee_member      INTEGER,                    -- HK$. null = fee to be confirmed, 0 = No charge (mandatory courses are free now; the field stays so charging can start later)
  fee_non_member  INTEGER,
  registration_opens  DATE,
  registration_closes DATE,
  registration_shut_at TIMESTAMP,             -- Admin pressed Close now; reopening clears it and sets a new closing date
  coordinators TEXT,
  ranking_mode TEXT NOT NULL DEFAULT 'priority',  -- priority | fcfs (first come first served). Anyone waitlisted last time still goes first. Admin still decides every place
  status      TEXT NOT NULL DEFAULT 'open',   -- stored: open | cancelled. Not open yet, Open, Closed, Held and Attendance recorded are DERIVED from the dates, registration_shut_at and attendance_recorded_at
  attendance_recorded_at TIMESTAMP
);
CREATE TABLE course_requests (
  id           SERIAL PRIMARY KEY,
  round_id     INTEGER NOT NULL REFERENCES course_rounds(id) ON DELETE RESTRICT,
  trainee_id   INTEGER NOT NULL REFERENCES trainee_profiles(id) ON DELETE RESTRICT,
  requested_at TIMESTAMP NOT NULL,
  decision     TEXT NOT NULL DEFAULT 'requested',   -- requested | accepted | waitlisted | rejected (deferred was removed, migration 5)
  decided_by   TEXT REFERENCES users(id),
  decided_at   TIMESTAMP,
  withdrawn_at TIMESTAMP,                           -- trainee withdrew before the deadline; not counted as an applicant
  UNIQUE (round_id, trainee_id)
);
```
Priority (high, medium, low) is computed from stage and course, not stored. Seats accepted must not exceed `course_rounds.seats` (enforced in the write, not only the UI). Attendance sheets use bulk ingestion type `MANDATORY_COURSE`; each completion row carries `source_batch_id` and `round_id`.

### Formal project reviews

```sql
CREATE TABLE formal_project_reviews (         -- one row per reviewer assignment; replacement writes a new row
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES formal_projects(id) ON DELETE RESTRICT,
  stage        TEXT NOT NULL,                 -- protocol | manuscript
  version_no   SMALLINT NOT NULL DEFAULT 1,   -- the round; a revision goes back to the same reviewers as round 2
  reviewer_id  TEXT NOT NULL REFERENCES users(id),
  assigned_at  TIMESTAMP NOT NULL,
  assigned_by  TEXT REFERENCES users(id),
  due_at       DATE NOT NULL,                 -- assigned_at + 2 months (HKCA-E03; was 30 days). A reminder goes 14 days before
  replaced_at  TIMESTAMP,
  replaced_by  TEXT REFERENCES users(id),
  submitted_at TIMESTAMP,
  recommendation TEXT,                        -- approved | revision | rejected (three outcomes; the four grades were dropped, 2026-10-25)
  feedback     TEXT,
  -- Overdue handling (decided 2026-10-25)
  handed_to_team_at    TIMESTAMP,             -- after the deadline Admin hands ONLY the missing review to the Formal Project Team
  by_team              BOOLEAN NOT NULL DEFAULT false,  -- the Team's review is recorded on the same row; reviewer_id stays as the original assessor. Needs handed_to_team_at
  late_override_reason TEXT,                  -- a late report is ignored unless Admin accepts it with a reason
  late_override_by     TEXT REFERENCES users(id),
  reassign_reason      TEXT,                  -- written on the NEW row of a reassignment (no response, unavailable, conflict of interest)
  reminder_sent_at     TIMESTAMP
);
```
Conflict rule: a reviewer whose current or parent hospital equals the trainee's is not offered. Reviewers never see the trainee's name. The reviewer pool is users with role `EXTERNAL_ASSESSOR` or `TRAINER` flagged `can_review_projects`.

**Migration 5 (2026-10-25) updated the tables above in place** (courses, applications, formal project reviews, recognition decision date) and added the tables in section 13.

### Trainer list update (rosters)

Every January and July the SOT of each department confirms the department's trainer list (Dr. Chan, 2026-10-25; this replaces the June and December round). One `roster_rounds` row per round and one `roster_attestations` row per department. The Admin side (rounds, who confirmed, changes reported, mark reviewed) is built in the prototype; the SOT-side screen is a later build. No migration: the period is free text.

```sql
CREATE TABLE roster_rounds (
  id SERIAL PRIMARY KEY, period TEXT NOT NULL UNIQUE,    -- January and July rounds, e.g. '2026-07', '2027-01'
  opens_on DATE NOT NULL, closes_on DATE NOT NULL
);
CREATE TABLE roster_attestations (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES roster_rounds(id),
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id),
  confirmed_by TEXT REFERENCES users(id), confirmed_at TIMESTAMP,
  changes_json JSONB,                         -- trainer list changes reported by the SOT: joined, left, moved to another hospital
  reviewed_by TEXT REFERENCES users(id), reviewed_at TIMESTAMP,
  UNIQUE (round_id, hospital_id)
);
```

### iWBA mapping

```sql
CREATE TABLE wba_procedure_map (
  iwba_procedure_code TEXT PRIMARY KEY,
  curriculum_code     TEXT NOT NULL,          -- CF-2.x or SM-3.x
  set_by              TEXT REFERENCES users(id),
  set_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
Saving a mapping releases the assessments held under `unmapped_procedure` conflicts for that code. Bulk ingestion type `IWBA_LINK` is added for "link from a file" (two columns: iWBA user id, HKCA number or assessor id).

### Admin audit

Every Admin action in section 12 writes `audit_log` (hash-chained). The console's Activity log reads it.

---

## 13. Secretariat console: courses, exams, formal projects, recognition (added 2026-10-25)

Source: `Admin Prototype Delta Check 2026-10-25.md` and decisions D1 to D5 (Dr. Chan, 2026-10-25). Built as Prisma migration `5_secretariat_courses_exams_projects`, tested on PGlite by `tests/schema/verify_secretariat_schema.mjs` (91 checks). Same conventions as section 12: UUID text ids, `ON DELETE RESTRICT`, Prisma's names stand. Names below are the SQL names; the Prisma models are `CourseAttendance`, `CourseNotice`, `ExamSitting`, `ExamResult`, `ExamSectionPass`, `TraineeFeePayment`, `TraineeExemption`, `FormalProjectStage`, `ApplicationEndorsement`, `RetrospectiveRecognitionEvent`.

**Scope (D1).** Course registration and exam applications are part of the first launch, not Phase 2. The Phase 2 list below no longer holds `course_catalogue`, `exam_catalogue` or `course_registrations`: rounds and requests are section 12, sittings and applications are here.

**Two things the Prisma file does that the SQL below cannot show.** A partial unique index (`exam_section_passes`, one active carried pass per trainee and exam) lives only in the migration, because Prisma cannot express it. The same migration adds check constraints and an append-only trigger, listed at the end of this section; a future `prisma migrate dev` will want to drop the partial index, so keep it in the migration file.

### Courses: attendance and notices

```sql
CREATE TABLE course_attendance (               -- one row per trainee per round; records the RATE, not just the completion
  id SERIAL PRIMARY KEY,
  round_id   INTEGER NOT NULL REFERENCES course_rounds(id) ON DELETE RESTRICT,
  trainee_id INTEGER NOT NULL REFERENCES trainee_profiles(id) ON DELETE RESTRICT,
  rate_percent INTEGER NOT NULL CHECK (rate_percent BETWEEN 0 AND 100),
  certificate_issued BOOLEAN NOT NULL DEFAULT false,   -- HKCA courses: 70% or more (College Regulations for Courses, May 2026); CSC courses: 100% only
  recorded_at TIMESTAMP DEFAULT now(), recorded_by TEXT REFERENCES users(id), source_batch_id INTEGER,
  UNIQUE (round_id, trainee_id)
);
CREATE TABLE course_notices (                  -- HKCA courses: below 50% is reported to the trainee's Chief of Service and SOT; CSC courses: below 100% is reported to the SOT
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL, trainee_id INTEGER NOT NULL, rate_percent INTEGER NOT NULL CHECK (rate_percent BETWEEN 0 AND 100),
  notice_type TEXT NOT NULL DEFAULT 'UNDER_50_REPORT',  -- UNDER_50_REPORT (HKCA courses, to Chief of Service and SOT) | UNDER_100_CSC (CSC courses, to the SOT)
   queued_at TIMESTAMP DEFAULT now(), sent_at TIMESTAMP,
  UNIQUE (round_id, trainee_id, notice_type)
);
```
Rules: the pass mark depends on the organiser (`course_catalogue.organiser`). **HKCA courses:** 70% or more earns the Certificate of Attendance and marks a mandatory course completed (a `mandatory_courses` row linked by `round_id`); below 70% gives none; below 50% queues a notice. **CSC courses** (Clinical Simulation Committee: EASE, EMAC, ADAM-A, UGRA, ADAM-D, ASSW; one to three days): only 100% earns the certificate and completes the course; anything less gives none and queues a notice to the trainee's SOT (`course_notices`, `notice_type` UNDER_100_CSC); the 70% rule and the under-50% notice do not apply (Dr. Chan, 2026-10-25). The pass mark is application logic, not a database constraint. Attendance for a non-mandatory course stays here and does not touch `mandatory_courses`. On the attendance sheet a CSC course line with no rate means 100%; an HKCA course line must state the rate (Dr. Chan, 2026-10-25).

### Exams

```sql
CREATE TABLE exam_sittings (
  id SERIAL PRIMARY KEY,
  exam_type  TEXT NOT NULL,                    -- INTERMEDIATE | FINAL_ANAESTHESIA | FINAL_ICU (ICU Final out of scope for the first release, D4)
  name       TEXT NOT NULL,                    -- for example 'Feb / Apr 2027'
  opens_on   DATE NOT NULL,
  closes_on  DATE NOT NULL,                    -- 3 to 8 weeks before the first written paper (Vocational Training Guide 2.4.2); the 3-to-8-week rule is checked in the write, the database checks opens <= closes < written
  mcq_on DATE, written_on DATE NOT NULL, oral_on DATE, oral_end_on DATE, osce_on DATE,
  fee_hkd    INTEGER NOT NULL,                 -- HK$8,000 Intermediate, HK$16,000 Final (College exams page; changes yearly)
  shut_at    TIMESTAMP,                        -- Admin closed applications early
  created_at TIMESTAMP DEFAULT now()
);
```
`exam_applications` is the existing `ExamApplication` table, extended (not renamed):
```sql
-- added columns (migration 5)
sitting_id TEXT REFERENCES exam_sittings(id),     -- UNIQUE (trainee_id, sitting_id): one application per trainee and sitting
withdrawn_at TIMESTAMP, withdrawn_kind TEXT,      -- trainee | admin
sot_decline_reason TEXT,                          -- the SOT endorses, or declines with a reason, BEFORE Admin sees the application (a query rule: Admin lists only SOT-approved rows)
fee_received_at DATE, fee_method TEXT, fee_reference TEXT,   -- Admin records by hand: Faster Payment System | Bank deposit | E-cheque (decision D3)
slip_document_id TEXT,                            -- payment slip: the trainee attaches it or emails it and Admin attaches it
board_exception_reason TEXT, board_exception_at DATE,        -- Board exception when criteria are not met
not_admitted_at TIMESTAMP,
sections_to_sit TEXT[] DEFAULT '{}'               -- snapshot at application: PHYSIOLOGY / PHARMACOLOGY, or WRITTEN / ORAL / OSCE
```
An application is **complete** when the SOT has endorsed, the fee is received and the criteria are met (or a Board exception is recorded). One that is not complete when the sitting closes lapses; "Lapsed", "Waiting for SOT", "Awaiting fee", "Criteria not met" and "Complete" are derived, not stored.

```sql
CREATE TABLE exam_section_passes (             -- carry-forward of a passed section
  id SERIAL PRIMARY KEY,
  trainee_id INTEGER NOT NULL, exam_type TEXT NOT NULL,
  section TEXT NOT NULL,                         -- PHYSIOLOGY | PHARMACOLOGY (Intermediate: one subject) | WRITTEN (Final)
  passed_on DATE NOT NULL, passed_sitting_id TEXT,
  sittings_left INTEGER NOT NULL DEFAULT 4 CHECK (sittings_left BETWEEN 0 AND 4),
  is_active BOOLEAN NOT NULL DEFAULT true,       -- false once used up or the exam is passed
  created_at TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX one_active_pass ON exam_section_passes(trainee_id, exam_type) WHERE is_active;
```
Carry-forward (Intermediate and Final Exam FAQs): Intermediate, a pass in one subject carries when the other subject meets the minimum score; Final, the written pass carries when the oral or OSCE is failed; each lasts up to four subsequent consecutive exams, then every section is re-sat; the fee is unchanged. **Every sitting the College holds counts toward the four, whether or not the trainee sat it (Dr. Chan, 2026-10-25).** The results file comes from the exam coordinator, who gives the final result: Pass or Fail per subject or section and Yes or No for `minimum_met`; nothing is computed from marks. Results upload formats: Intermediate `hkca_no,exam,sitting_date,physiology,pharmacology,minimum_met`; Final `hkca_no,exam,sitting_date,written,oral_osce`.

```sql
CREATE TABLE trainee_fee_payments (            -- append-only; a wrong entry is voided, never deleted (decision D3: entered by hand from payment slips)
  id SERIAL PRIMARY KEY, trainee_id INTEGER NOT NULL,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('REGISTRATION','TRAINING')),
  paid_on DATE NOT NULL, reference TEXT, recorded_by TEXT REFERENCES users(id), voided_at TIMESTAMP, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE trainee_exemptions (              -- Intermediate exemption
  id SERIAL PRIMARY KEY, trainee_id INTEGER NOT NULL, exam_type TEXT NOT NULL DEFAULT 'INTERMEDIATE',
  kind TEXT NOT NULL CHECK (kind IN ('ANZCA_PRIMARY','FRCA_PRIMARY','OTHER_BOARD')),
  granted_on DATE NOT NULL, reference TEXT, note TEXT, recorded_by TEXT REFERENCES users(id),
  UNIQUE (trainee_id, exam_type)
);
```
Eligibility criteria are read live and kept in one list per exam, each with its source (Intermediate: member and registered trainee, fees paid, in Basic training, not already passed or exempt; Final: member and registered trainee, fees paid, in Higher training, Intermediate passed or exempt, in a College-accredited centre, not already passed). The two "not already passed" checks are our additions and are not in the published rules; Dr. Chan agreed to keep them (2026-10-25). The Administrative Instructions (members only) have not been read yet: Dr. Chan will send them when he has access, and the criteria list is then checked against them.

### Formal projects: stages, appeal, accepted-paper route

```sql
CREATE TABLE formal_project_stages (           -- one row for the protocol part, one for the manuscript part
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES formal_projects(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL,                           -- protocol | manuscript. The manuscript opens after the protocol is approved
  state TEXT NOT NULL DEFAULT 'awaiting_reviewers',  -- awaiting_reviewers | under_review | reviews_in | revision | appeal | approved | rejected
  round_no INTEGER NOT NULL DEFAULT 1,
  dispatched_at DATE, due_at DATE,               -- due_at = dispatched + 2 months
  decision TEXT, decided_on DATE,                -- approved | revision | rejected
  appealed_on TIMESTAMP,                         -- ONE appeal, with a point-by-point reply; a rejection after appeal is final
  created_at TIMESTAMP DEFAULT now(), updated_at TIMESTAMP DEFAULT now(),
  UNIQUE (project_id, stage)
);
-- added to formal_projects
route TEXT NOT NULL DEFAULT 'STANDARD',          -- STANDARD | ACCEPTED_PAPER (HKCA-E03: an accepted peer-reviewed paper counts as the formal project; no protocol; the trainee's authorship is recorded, for example first author, corresponding author, first and corresponding, or other significant contribution)
paper_journal TEXT, paper_authorship TEXT, paper_accepted_on DATE, paper_evidence_doc_id TEXT   -- journal required when ACCEPTED_PAPER
-- added to formal_project_events
visibility TEXT NOT NULL DEFAULT 'trainee'       -- trainee | internal
```
`formal_project_events` now carries two kinds of entry. **Trainee-visible** (submission, resubmission with version, revision request with its outcome, approval, accepted paper recorded) never names a reviewer. **Internal** (reviewers assigned, reminder sent, handed to the Team, late report accepted, reviewer reassigned, appeal received, certification advice queued) is for the Secretariat only. Approving a manuscript queues certification advice to the Board of Education and the Board of Censors (an internal event; a `notifications` row if one is needed). The exit-gate "Formal project" criterion is **derived** from the stages and route (manuscript approved, or accepted paper); `trainee_profiles.formal_project_approved` and its date are a maintained copy and are never edited by hand. College-issued project numbers are of the form FP-26-0xx (year, then a running number) and are issued when a protocol is recorded.

### Membership application: endorsements; recognition trail

```sql
CREATE TABLE application_endorsements (        -- two rows per application: Chief of Service and SOT at the applicant's hospital
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  signer_role TEXT NOT NULL,                     -- CHIEF_OF_SERVICE | SOT
  signer_user_id TEXT REFERENCES users(id),
  method TEXT,                                   -- ESIGN (own portfolio login, like the trainee ITA signature) | PDF (Admin attached a signed PDF instead)
  requested_at TIMESTAMP DEFAULT now(), signed_at TIMESTAMP,
  document_id TEXT, attached_by TEXT REFERENCES users(id),
  UNIQUE (application_id, signer_role)
);
CREATE TABLE retrospective_recognition_events ( -- append-only decision trail (trigger refuses UPDATE and DELETE)
  id SERIAL PRIMARY KEY,
  recognition_id INTEGER NOT NULL REFERENCES retrospective_recognitions(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,                      -- requested | enabled | submitted | documents_returned | sent_to_training_officer | more_documents_asked | decided | referred_to_board | credit_executed
  from_status TEXT, to_status TEXT,
  actor_user_id TEXT REFERENCES users(id),
  actor_role TEXT NOT NULL,                      -- ADMIN | TRAINING_OFFICER | BOARD
  on_behalf BOOLEAN NOT NULL DEFAULT false,      -- Admin recorded an outcome that arrived outside the system; the trail says so
  outcome TEXT, note TEXT, event_date DATE NOT NULL, created_at TIMESTAMP DEFAULT now()
);
```
A signed endorsement row must carry a method, and an attached-PDF signature must carry the document. `applications.check_endorsement` is derived from these rows.

**Database rules added by migration 5 (not visible in the Prisma file):** `course_attendance` and `course_notices` rate 0 to 100; `course_rounds` ranking is priority or fcfs, end date not before start, registration closes not before it opens; `exam_sittings` opens <= closes < written; `exam_section_passes` sittings left 0 to 4 and one active pass per trainee and exam; fee type, exemption kind, project route and event visibility are limited to their listed values; an accepted-paper project names its journal; a Team review needs a hand-over date; a late-report override needs a reason; recognition origin is overseas training or another specialty; **a recognition rejection must be decided by the Board** (`NOT VALID`, so existing rows are not re-checked); the recognition trail refuses UPDATE and DELETE. Enum rewrites refuse to run while `ESCALATED` or `DEFERRED` is in use.

---

## Phase 2 Placeholders (schema reserved, not built in MVP)

Per standing scope directive (2026-09-30), the **Pain Medicine** and **Intensive Care Medicine (ICM)** training modules are documented as placeholders. Indicative shapes only — no MVP code may depend on them.

### ⚠️ Scope distinction — ICU rotation vs ICM module

This distinction is easy to lose and matters:

| Concept | Phase | Rationale |
|---|---|---|
| **ICU as a rotation type** | **MVP** | Section 1.2.3.2 of the Vocational Training Guide requires 6 months Intensive Care Medicine for core anaesthesia progression. `rotations.rotation_type = 'icu'` and `trainee_profiles.icu_months` are **MVP fields**. |
| **ICU rotation accreditation check** | **MVP** | ICU must be undertaken in a College-accredited unit. Core to rotation validation. |
| **ICM training curriculum module** — tutorials, ICM assessments, ICM logbook, ICM exam pathway | **Phase 2** | Separate specialty pathway, out of MVP scope. |

### Placeholder entities

```sql
-- PHASE 2 — indicative only
CREATE TABLE icu_tutorials (            -- legacy: atp_icu_tutorial (567 rows)
  icu_id SERIAL PRIMARY KEY,
  tutorial_name TEXT,
  date_of_tutorial DATE,
  name_of_tutor TEXT
);

CREATE TABLE icu_tutorial_attendance (  -- legacy: atp_icu_tutorial_trainee (1,453 rows)
  id SERIAL PRIMARY KEY,
  trainee_id INTEGER,
  icu_id INTEGER REFERENCES icu_tutorials(icu_id),
  attended BOOLEAN
);

CREATE TABLE icm_assessments (...);     -- ICM-specific assessment pathway
CREATE TABLE pain_med_cases (...);      -- legacy: user.pain_start_date, num_of_pain_case
CREATE TABLE pain_med_assessments (...);-- Pain Medicine pathway
CREATE TABLE echo_assessments (...);    -- legacy: atp_echo (1,350 rows) — FTTE log
```

### Also deferred to Phase 2
- ICU Final examination sittings and the ICU and Pain courses (decisions D4 and the courses note, 2026-10-25).
- **No longer Phase 2 (decided 2026-10-25, D1):** the course catalogue, rounds and requests (section 12), and exam sittings, applications and results (section 13), which replace the idea of `course_registrations` and `exam_catalogue`. The legacy tables `atp_course`, `atp_exam`, `atp_reg` and `atp_reg_exam` are still preserved as raw data (below).

**Legacy data to preserve for these modules** — do not discard during ETL, even though the modules are not built:
`atp_icu_tutorial`, `atp_icu_tutorial_trainee`, `atp_echo`, `atp_course`, `atp_exam`, `atp_reg`, `atp_reg_exam`, and `atp_portfolio.tutorial_admin1..38` (38 columns of ICU tutorial flags that duplicate the join table above).

---

## Related Documents

- [[Backend Requirements - Accreditation and WBA]]
- [[Curriculum and Functional Specifications]]
- [[System Architecture and Roadmap]]
- [[Legacy EPS Schema Audit]]
- [[New Workflow Changes - Curriculum Updates Required]]
- [[Prototype Workflow Appraisal - PRD, Schema, Migration, JCIMED (2026-10-19)]]
