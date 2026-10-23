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
  
  UNIQUE(user_id, role, scope_type, scope_id)
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
  current_stage             TEXT NOT NULL, -- BAT, HAT, PFY, Fellow, Suspended
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
  training_status           TEXT DEFAULT 'active', -- active, suspended, terminated, completed
  
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
  curriculum_code       TEXT,             -- CF-2.x | SM-3.x | PFY | MSF | ECHO-TTE (from the mapping)
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
  link_method    TEXT NOT NULL,             -- sso_hkam_id | admin_confirmed | admin_csv
  confirmed_by   INTEGER REFERENCES users(id),
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wba_sync_state (            -- one row per college token and endpoint
  endpoint       TEXT PRIMARY KEY,         -- summary | backfill
  cursor_updated_at TIMESTAMPTZ,           -- advanced only after a full traversal succeeds
  last_run_at    TIMESTAMPTZ, last_status TEXT, last_error TEXT
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
  
  -- Vetting status
  vetting_status                TEXT DEFAULT 'pending',
  -- pending → under_review → approved / rejected
  
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
CREATE TABLE exam_results (
  id                    SERIAL PRIMARY KEY,
  trainee_id            INTEGER REFERENCES trainee_profiles(id) ON DELETE CASCADE,
  
  exam_type             TEXT NOT NULL,    -- intermediate, final, exit
  exam_date             DATE NOT NULL,
  result                TEXT NOT NULL,    -- pass, fail
  score                 TEXT,
  
  attempt_number        INTEGER DEFAULT 1,
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_exams_trainee ON exam_results(trainee_id, exam_type);
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
  
  course_code           TEXT NOT NULL,    -- EASE, EMAC, ADAM-A, UGRA, ECHO-A
  course_name           TEXT NOT NULL,
  
  completion_date       DATE,
  certificate_uploaded  BOOLEAN DEFAULT false,
  certificate_file_path TEXT,
  
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
  
  protocol_submitted_date   DATE,
  protocol_anonymized_path  TEXT,
  protocol_identified_path  TEXT,
  
  -- Blinded review
  reviewer_1_id             TEXT REFERENCES users(id),
  reviewer_2_id             TEXT REFERENCES users(id),
  reviewer_1_status         TEXT,            -- approved, minor_revision, major_revision
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
- `course_catalogue` (legacy `atp_course`)
- `exam_catalogue` (legacy `atp_exam`)
- `course_registrations` (legacy `atp_reg`, `atp_reg_exam`)

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
