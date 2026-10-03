---
type: audit_report
project: "[[HKCA Portfolio Revamp]]"
created: 2026-09-30
status: delivered
reviewer: "Claude Opus (claude-opus-5-5)"
dossier: "[[Pre-Implementation Appraisal Dossier]]"
---

# HKCA ePortfolio Revamp — Pre-Implementation Red Team Audit Report

**Reviewer:** Claude Opus (`claude-opus-5-5`)
**Scope:** Target data architecture, progression state machine, SOT/trainee workflows, proposed curriculum changes
**Verdict:** The architecture is sound and the design instincts are correct. The **credit model** and the **authority model for disputed facts** are the two places where the current design can produce a legally contestable trainee record. Both are structural, both are cheap to fix now, and both are expensive to fix after cutover.

---

## Executive Summary — Top 8 Must-Fix Findings

| # | Finding | Severity | Where |
|---|---|---|---|
| **F1** | **Two parallel ITA systems (`atp_in_training_assessment` ~5,187 rows and `atp_mita`/`atp_ita1` ~17,757 rows) have no documented reconciliation.** No decision has been recorded on which is authoritative. This is the single largest migration risk. | **Critical** | Migration §9 item 4 |
| **F2** | **Automatic credit on ITA sign-off has no void/rollback path and no appeal-safe state.** Credit is the legally operative act; the ITA is merely evidence. The design conflates them. | **Critical** | Workflow change §5 |
| **F3** | **Accredited-month arithmetic is float-based (`NUMERIC(5,2)` months) and will not reconcile.** Parity tests comparing float sums will fail on rounding, and a trainee sitting on 23.99 vs 24.00 months is a real dispute. | **Critical** | Schema §2, Migration §5 |
| **F4** | **The 2-year retrospective rule is implemented as a copy-time generated column on a mutable field.** This allows a case to be "legal" forever if someone edits `case_date` forward. It also creates a race on bulk import. | **High** | Schema § VOP |
| **F5** | **No `accredited_months` ledger — only a running total on `trainee_profiles`.** A cumulative `+=` counter cannot be audited, cannot be reconstructed, and cannot answer "why does this trainee have 42 months?" | **High** | Schema §2 |
| **F6** | **Mid-rotation transfer, SOT unavailability, and trainee refusal to counter-sign have no defined state transitions.** All three are guaranteed to occur in the first year of operation. | **High** | Dossier Lens 3 |
| **F7** | **SOT conflict of interest is unmodelled.** The schema permits a trainee's spouse, project supervisor, or the assessor of their own appeal to sign the ITA. | **High** | Schema §4/§5 |
| **F8** | **Cohort-relative percentile flags will fire on every trainee during every ICU block** (already identified, but the chosen fix is incomplete — see §2.4). | **Medium-High** | Workflow §9 |

---

## 1. Critical Governance & Regulatory Gaps (Must Fix)

### 1.1 The two-ITA problem is unresolved and it is blocking

The audit already flags "two parallel ITA systems coexist" and the migration plan lists "College decision: which ITA system is authoritative" as item 4. **That item has no owner date and no fallback.** Meanwhile `atp_ita1` has 17,757 rows versus `atp_in_training_assessment` at 5,187 — the newer-looking table has **three times less data**.

Three outcomes are possible, and the schema must be chosen *after* the decision, not before:

- **If `atp_mita` is authoritative:** the assessor-collated model (multiple trainers → consensus → SOT synthesis) is the real workflow, and `itas.trainer_feedback_json` is the wrong shape — you need a first-class `ita_assessor_responses` table as the primary record, not an add-on listed under "MVP Additions."
- **If `atp_in_training_assessment` is authoritative:** `atp_mita`/`atp_ita1` is a dead legacy branch and must be archived, not merged.
- **If they coexisted by period** (likely, given a system rebuilt mid-life): the target needs an `ita_provenance` discriminator so a trainee's record can contain both vintages without the UI lying about which process produced which grade.

**Recommendation:** do not proceed past migration Phase 1 until the College answers this in writing. Add a hard gate: **no schema finalisation, no UI build on the ITA module** until resolved. This is also a curriculum question, not just an engineering one — because the two systems likely graded differently, and merged history may show a trainee with a mix of two rubrics.

### 1.2 Automatic credit on ITA sign-off conflates evidence with entitlement

The proposed rule — *"satisfactory ITA → automatically credit rotation duration"* — is procedurally defensible but the implementation is not. Three specific problems:

**(a) No void path.** If an ITA is later found to be signed by someone without authority, or obtained under a conflict of interest, or the rotation is retrospectively found to be at a non-accredited site, there is currently no state in which credit is *removed*. `trainee_profiles.total_accredited_months` is a bare number with `+=`. You cannot subtract your way out of a disputed record convincingly.

**(b) Conditional sign-off is unmodelled.** The dossier asks whether conditional ITA sign-off creates liability. It does. "Satisfactory, subject to completing 20 more paediatric cases" is a real thing SOTs will write — and under the current design it credits the months, while the condition is not tracked, not enforced, and not visible at the next gate check.

**(c) The credit is a side effect of a workflow transition, not an entity.** This is the root cause of (a) and (b).

**Recommendation — introduce an explicit credit ledger:**

```sql
CREATE TABLE accredited_time_ledger (
  id                BIGSERIAL PRIMARY KEY,
  trainee_id        INTEGER NOT NULL REFERENCES trainee_profiles(id),
  rotation_id       INTEGER REFERENCES rotations(id),
  ita_id            INTEGER REFERENCES itas(id),
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  days_credited     INTEGER NOT NULL,        -- integer days, never float months
  category          TEXT NOT NULL,           -- clinical_anaesthesia | icu | elective
  counts_toward_3yr BOOLEAN NOT NULL,
  decision          TEXT NOT NULL,           -- grant | revoke | amend
  decision_reason   TEXT NOT NULL,
  authority_id      INTEGER REFERENCES users(id),
  authority_role    TEXT NOT NULL,           -- sot | assistant_sot | boe | college_admin
  conditions_json   JSONB,                   -- conditional credits
  supersedes_id     BIGINT REFERENCES accredited_time_ledger(id),
  effective_at      TIMESTAMP NOT NULL DEFAULT now(),
  is_current        BOOLEAN NOT NULL DEFAULT true
);
```

`trainee_profiles.total_accredited_months` then becomes a **cached aggregate of the ledger**, recomputable at any time. A revocation is a `revoke` row that supersedes the original — never a deletion, never a subtraction from a counter. This also makes the parity suite provable: legacy sum vs ledger sum is a real comparison, not a float comparison.

### 1.3 Float months will not reconcile — this is a guaranteed dispute

`total_accredited_months NUMERIC(5,2)` and the parity check `sum(atp_training_experience.anaesthesia + intensive_care + elective)` are both in months. Two problems:

1. **Rounding divergence.** 6 rotations of 30.4375 days each is 182.625 days = 5.9979 months. Whether you round at row level or at sum level changes the answer, and the difference lands a trainee either side of the 24-month PFY gate.
2. **Month arithmetic vs day arithmetic.** `numer_of_months` in the legacy table is presumably whatever the SOT typed. Days are the only unit that reconciles.

**Recommendation:** store `days_credited` as `INTEGER`, compute months only for display, and define the display rule in the curriculum (*"24 months = 730 days"* or *"counted by calendar month"* — pick one and put it in the Training Guide). Add a **gate-versus-ledger reconciliation test** to CI: for every trainee, `days_credited / 30.4375` must agree with the displayed month figure to 0.01.

### 1.4 The 2-year rule is enforced at the wrong layer

Current design:

```sql
logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
is_within_2yr_window BOOLEAN GENERATED ALWAYS AS
  (logged_date <= case_date + INTERVAL '2 years') STORED
```

Two failure modes:

- **`case_date` is mutable.** A trainee editing `case_date` forward by a day flips the window to true. The rule is therefore advisory, not enforced. Because the rule was *enforced in the legacy application* (confirmed), the new system must be **at least as strict**, and the migration must flag legacy rows where `date_entry > start_date + 2 years` as anomalies rather than accepting them.
- **Bulk import bypass.** During ETL, `logged_date` defaults to `CURRENT_DATE`, so every historical case imports as out-of-window — or worse, if `logged_date` is set from `date_entry`, the rule is satisfied by construction and proves nothing.

**Recommendation:**
1. Add an immutable `first_logged_at TIMESTAMP` set on insert, never updatable, and compute the window from **that** rather than from a mutable `logged_date`.
2. Enforce with a `BEFORE INSERT OR UPDATE` trigger that **rejects** out-of-window classification as accredited, but permits the row to exist with `is_accredited = false` and a `rule_exception_id` — so the case is preserved as evidence but cannot be counted.
3. During ETL, set `first_logged_at` from `date_entry` and **report** every anomaly rather than silently repairing it.

### 1.5 The "≥2 consecutive unsatisfactory ITAs → BOE escalation" rule needs an appeal path

As specified, the escalation is automatic. That is the correct default, but it is not appeal-safe as modelled. What's missing:

- **No state for "escalation disputed."** A trainee who contests an ITA grade must be able to do so without the automatic escalation already having fired.
- **No representation of the appeal outcome.** If the BOE overturns an unsatisfactory grade, the `itas.is_satisfactory = false` row still exists, and `can_progress_to_hat()` currently blocks on `EXISTS (... is_satisfactory = false)`. **A successful appeal therefore does not unblock progression.** That is a bug, not a policy question.
- **No "consecutive" definition.** Consecutive by assessment date? By rotation? What if there are three ITAs across two rotations and the middle one is satisfactory?

**Recommendation:** add `itas.final_grade` (post-appeal, authoritative) distinct from `itas.sot_grade` (as signed), plus an `ita_appeals` table. Change the gate function to read `final_grade`. Define "consecutive" in the Training Guide as *consecutive assessment periods with no intervening satisfactory ITA*.

### 1.6 Conflict of interest is unmodelled

The schema allows `formal_projects.reviewer_1_id` to be the trainee's own SOT, `itas.sot_signed_by` to be the trainee's spouse, and — most seriously — a person who signed an unsatisfactory ITA to subsequently sit on its appeal.

**Recommendation:** add a `declared_relationships` table (`user_a`, `user_b`, `relationship_type`: spouse, first-degree relative, project_supervisor, co-author, financial) and a `check_conflict(actor, action, entity)` function called on every signature event. Where a conflict exists, require a second signature from an alternate SOT or the Cluster SOT. Log the declaration in `audit_log`. This is cheap and it is the first thing a legal challenge will probe.

---

## 2. Clinical UX & Operational Friction (High Priority)

### 2.1 The single biggest adoption risk is the trainer, not the trainee

Trainees have a direct incentive to log (progression depends on it). **Trainers and SOTs have none.** The design's answer — the nightly multi-trainee digest — is good, but it is a *notification* improvement, not a *workload* improvement. The ITA workflow still requires a trainer to produce per-domain ratings across 16+ items for every trainee every 6 months.

**Recommendations:**
- **Default to last-cycle values.** When a trainer opens an ITA for a trainee they assessed last cycle, pre-fill every domain at the previous rating and require an explicit change. Most ITAs are "same as last time" — this turns 16 decisions into 2.
- **Batch mode.** One screen, all trainees for a given trainer, one row per trainee, tap-to-rate. This is the shape that survives a theatre list.
- **Cap the free-text.** Encourage one "notable concern" and one "notable strength" rather than a paragraph per domain. Long-form fields are where ITAs get abandoned at 80% completion.
- **Time-to-complete SLO.** Instrument it. If median ITA completion exceeds 12 minutes, the design has failed and you will know by week 3 rather than by attrition at month 18.

### 2.2 "Batch sign-off" is the right instinct but needs a guardrail

Bulk-approving 12 logbook cases in one action is correct for adoption and dangerous for data quality — the SOT is attesting to cases they may not have read. **Recommendation:** allow batch verify only for cases classified at high classifier confidence and with no divergence flag; anything divergent requires individual review. This gives the SOT a genuine reason to use the batch path and preserves the audit value of the divergence flag.

### 2.3 Mobile is not a nice-to-have for the logbook

The logbook is used in the theatre recovery bay, standing up, between cases. Any design requiring desktop entry will be filled in retrospectively at month-end — which is exactly the failure the whole redesign is trying to fix.

**Recommendation:** the offline-capable logbook entry path (client-side queue, background sync, conflict resolution) is **MVP scope, not later**. Budget it explicitly. Note the interaction with F4: sync must set `first_logged_at` from the *device* time at capture, not the server time at sync, or a trainee logging offline for a week will have their entries date-stamped a week late.

### 2.4 The ICU percentile fix as specified is still incomplete

The dossier's recommendation (a)+(c) — exclude VOP from percentile during declared ICU rotations, and show an explanatory state — solves the false-alarm case but introduces a new one: **the trainee's percentile silently disappears for 6 months**, and when it returns they have fallen far behind peers with no warning during the absence.

**Better:** compute percentile on **VOP-per-eligible-anaesthesia-month** (rate, not cumulative total), and exclude ICU months from the denominator. A trainee on ICU block holds their position rather than dropping; a trainee genuinely idle still falls. Pair this with the explanatory state so the UI says *"rate based on 14 eligible months; 6 ICU months excluded."* This also removes the arbitrariness of "declared ICU rotation" as a special case — it becomes an arithmetic consequence of the denominator.

### 2.5 Avoid building a second HA CMS — three specific traps

- **Do not require a signature for reading.** If any screen a trainee opens to check progress requires a sign-off, the system becomes something people avoid.
- **Do not gate a rotation start on a form.** Rotation declarations should be creatable late and back-dated with a reason, not block a trainee from starting.
- **Do not make the SOT the single point of failure.** Every SOT-only action needs a documented delegate path (see §3.2).

---

## 3. Adversarial Edge Cases & Failure Modes

### 3.1 Mid-rotation centre transfer (month 4 of a 6-month block)

**Who signs the ITA?** The design does not say. Three defensible models, and the College must pick one:

| Model | Rule | Consequence |
|---|---|---|
| **A — Receiving SOT signs** | SOT of the centre where the trainee finishes | Simple, but attests to 4 months they didn't observe |
| **B — Split ITA** | Two ITAs, one per segment; credit partitioned | Cleanest evidence; more administrative load; below the 3-month ITA minimum for a 2-month segment |
| **C — Originating SOT signs with receiving SOT counter-sign** | Both signatures required | Strongest evidence; needs dual-signature UI |

**Recommendation: C**, with the below-minimum case handled as part of a single ITA covering the whole block rather than two short ones. Add `itas.signatory_2_id` and `itas.signatory_1_segment`. Critically: **credit must be partitioned by accredited centre**, because `counts_toward_last_3_years` is per-segment — 4 months at an accredited centre and 2 at a non-accredited one is not 6 accredited months.

### 3.2 SOT unavailable at a deadline (leave, illness, sabbatical)

Also unmodelled, and it will happen in the first exam cycle. Sub-cases:

- **SOT on annual leave at exam registration deadline.** The exam-application SOT gatekeeper will simply stall. **Recommendation:** auto-escalate to Assistant SOT after N days, then Cluster SOT after 2N, then College Admin. Make N configurable and log every escalation step. The deadline-critical actions (exam approval, ITA final sign-off) must have an escalation ladder; the non-critical ones need not.
- **SOT on prolonged sick leave with in-flight ITAs.** Need a bulk-reassignment mechanism that transfers open ITAs, rotation-signing authority, and pending verifications to a named alternate, with an audit record. Do **not** require per-item reassignment.
- **SOT is deceased or departed.** Role deactivation must not orphan their open items. Add an `unrecoverable_actor` handling path.

### 3.3 Trainee refuses to counter-sign an unsatisfactory ITA

The most likely to be litigated of all the scenarios. The design has a `trainee_signed_at` but no defined behaviour when it stays null.

**Recommendation — define this state explicitly:**

- ITA enters **`awaiting_trainee_counter_signature`**.
- Trainee has a fixed window (recommend 14 days) to sign, or to **submit a written objection** (which is a first-class record, not an email).
- After the window: ITA becomes **`completed_uncontested`** if unsigned with no objection, or **`contested`** if objected.
- **The ITA's substantive grade takes effect either way** — the trainee's signature is acknowledgement, not assent. Otherwise the refusal becomes a veto on an adverse finding, which is not a defensible design.
- **The contested state must block progression to the next gate pending review** (not the current cycle's completion), and must route to the BOE/assessment committee. This is the trainee's protection, and it should be visible and timed.
- Trainee's right to attach a written response to the signed record must be permanent, and the response must travel with the ITA wherever it's displayed.

### 3.4 Further failure modes not yet covered

- **Retrospective recognition granted, then the trainee resigns and re-joins.** Credit must be tied to the trainee identity across a break, or re-assessed. Currently `retrospective_recognitions` has no relationship to a training interruption.
- **A rotation declared in the wrong category, discovered 18 months later.** The design permits prospective BOE approval for retrospective changes — good. But the credit ledger (§1.2) is what makes the correction clean; without it, the change becomes an unexplained delta in a counter.
- **Trainee sits the Final exam in the same period as an unsatisfactory ITA.** The gate checks should be evaluated at *application* time and re-evaluated at *result* time; a result list computed once and cached will produce an ineligible candidate passing.
- **Double-blind formal project review where one reviewer never responds.** No timeout, no reassignment. Add `review_due_date` and reviewer reassignment after timeout.
- **Concurrent SOT edits to the same ITA.** No optimistic locking in the schema. Add a `version` column and reject stale writes; clinical users *will* double-submit.

---

## 4. Data Architecture & Concurrency (Engineering Refinements)

### 4.1 Audit log: append-only and tamper-evident, or it is worthless in a dispute

`audit_log` is currently a normal table with a normal `performed_by` FK and no protection. For remediation records, appeals, and credit decisions this is insufficient.

**Recommendations:**
- Revoke `UPDATE`/`DELETE` on `audit_log` at the database role level, not the application level.
- Add a hash chain: `prev_hash`, `row_hash = sha256(prev_hash || canonical_row)`. The current `field_changed / old_value / new_value` single-field model also cannot represent a multi-field update atomically — move to `before_json` / `after_json` per row.
- Partition `hkca_log`-derived history by month; retain 24 months hot, archive the rest. Preserve legacy `hkca_log` in cold storage regardless (it is the only record of what the old system actually did).
- **Separate the audit log from the analytics path.** Do not let any future reporting query read the audit table; it will grow to millions of rows.

### 4.2 Foreign keys: the legacy system has none — do not repeat that

The audit correctly identifies zero FKs in legacy as the highest-severity issue. The target schema text in the dossier lists FKs but the full schema document is inconsistent (some tables reference `users(id)` as `TEXT`, others as `INTEGER`; `trainee_id` appears as both `INTEGER REFERENCES trainee_profiles(id)` and `TEXT`).

**Recommendation:** settle the key type globally — `users.id` should be a stable opaque identifier (`TEXT`/UUID) but **all FKs must use one type**, and `trainee_profiles.id` must be `INTEGER` everywhere or nowhere. Pick one before Prisma schema generation; a mixed-key model will produce silent join failures during ETL.

Also add, everywhere: `ON DELETE RESTRICT` (not `CASCADE`) for anything carrying training credit, audit value, or legal significance. `ON DELETE CASCADE` from `trainee_profiles` currently means deleting a trainee silently deletes their ITAs, remediation plans, and logbook. **That is unacceptable for a College record.** Trainees are deactivated, never deleted.

### 4.3 JCIMED / HKAM WBA integration readiness

The schema has `jcimed_sync_id TEXT UNIQUE` and `jcimed_last_sync` and nothing else. That is enough for a one-way import and not enough for anything real. Missing:

- **Direction of authority.** If a WBA is corrected in JCIMED after import, does the portfolio update? Does it conflict?
- **Idempotency.** A retried sync must not create duplicates. `jcimed_sync_id UNIQUE` handles this *only if the sync always populates it* — make it `NOT NULL` for imported rows and add a `sync_batch_id`.
- **Reconciliation state.** Add `sync_state` (`pending | synced | conflicted | orphaned`) and a `wba_sync_conflicts` table.
- **Field-level provenance.** `assessor_name TEXT` alongside `assessor_id` is a denormalisation that will drift. Keep it as an entry-time snapshot with an explicit `assessor_snapshot_at`.

For the HKAM nomination export, the practical risk is **version drift** — the HKAM form changes and the portfolio's stored mapping silently exports stale fields. **Recommendation:** store the HKAM mapping as versioned configuration data, not code, and record which mapping version each export used.

### 4.4 Materialised views as the gate mechanism — reconsider

`wba_progress_summary` and `vop_requirements_tracking` as materialised views are used by `can_progress_to_hat()`. That means **progression eligibility depends on view freshness**. A trainee who logs the case that qualifies them may be told they are ineligible until a cron job runs.

**Recommendation:** compute gates from base tables inside the gate function (it is a handful of indexed `COUNT`s on one trainee — milliseconds), or refresh on write via trigger. Reserve materialised views for dashboards where seconds of staleness are acceptable. **Never let a legal progression decision read a stale cache.**

Related: `itas.is_overdue` and `days_overdue` as `GENERATED ALWAYS AS (...) STORED` referencing `CURRENT_DATE` is a PostgreSQL anti-pattern — generated columns cannot reference volatile functions. **This will not compile.** Replace with a view or compute in application code.

Similarly, the `rotations` check constraint containing a subquery (`SELECT max_duration_months FROM accredited_centres`) is **invalid in PostgreSQL** — check constraints cannot contain subqueries. This must be a trigger.

These two are the kind of error that surfaces at implementation time and derails a sprint; worth fixing in the schema doc now.

### 4.5 Soft-delete and retention policy

No table has a soft-delete flag or a retention rule. For a College record with a statutory flavour (and a documented appeal process), every trainee-facing artefact needs: created/updated timestamps (present), `deleted_at` + `deleted_by` (absent), and a documented retention period. Add a project-level data retention schedule covering trainee records, logbook, audit, and uploaded documents.

---

## 5. Actionable Implementation Matrix

### Must Fix — before schema finalisation

| # | Item | Impact | Effort | Owner |
|---|---|---|---|---|
| M1 | College decision: authoritative ITA system | Unblocks the whole ITA module | **Decision** | College / BOE |
| M2 | `accredited_time_ledger` with grant/revoke/amend + conditions | Makes credit auditable and appeal-safe | 3–5 days | Eng |
| M3 | Integer days replaces float months; curriculum states the conversion | Removes the 23.99/24.00 dispute class | 2 days + policy | Eng + BOE |
| M4 | Fix invalid SQL: volatile generated columns, subquery check constraint | Prevents build-time derailment | 1 day | Eng |
| M5 | Global FK key-type decision + `ON DELETE RESTRICT` on training records | Prevents silent data loss | 2 days | Eng |
| M6 | `final_grade` vs `sot_grade` + `ita_appeals`; gate reads `final_grade` | Fixes appeal-doesn't-unblock bug | 3 days | Eng |

### High Priority — before UI build

| # | Item | Impact | Effort |
|---|---|---|---|
| H1 | Trainee counter-signature state machine (14-day window, objection as first-class record, grade stands) | Removes the veto/litigation gap | 3 days |
| H2 | SOT escalation ladder for deadline-critical actions + bulk reassignment | Removes single-point-of-failure at exam deadlines | 3 days |
| H3 | Mid-rotation transfer model (dual signature, per-segment accredited credit) | Correct 3-year rule arithmetic | 3 days |
| H4 | Conflict-of-interest table + `check_conflict()` on signature events | Legal defensibility | 2 days |
| H5 | Immutable `first_logged_at` + 2-year rule trigger | Makes an existing rule actually enforced | 2 days |
| H6 | Optimistic locking (`version`) on ITAs and logbook verification | Prevents lost updates | 1 day |
| H7 | Audit log: hash chain, `before/after_json`, DB-level immutability | Dispute-proof evidence | 3 days |

### High Priority — UX (adoption risk)

| # | Item | Impact | Effort |
|---|---|---|---|
| U1 | ITA pre-fill from last cycle + batch rating screen | The difference between used and abandoned | 4 days |
| U2 | Mobile offline logbook with client-side queue and device-time capture | Fixes the retrospective-entry root cause | 5–8 days |
| U3 | Batch verify gated on confidence + no divergence flag | Protects audit value of the flag | 1 day |
| U4 | VOP percentile as rate-per-eligible-month with ICU months excluded from denominator | Removes both false alarms and silent blind spots | 2 days |
| U5 | Instrument time-to-complete for ITA and logbook entry | Turns "does it feel heavy?" into a number | 1 day |

### Engineering Refinements — before pilot

| # | Item | Impact | Effort |
|---|---|---|---|
| E1 | Gate functions read base tables, not materialised views | Correct progression decisions | 1 day |
| E2 | JCIMED: direction of authority, idempotency, conflict table, sync state | Integration viability | 3 days |
| E3 | Versioned HKAM export mapping (config, not code) | Prevents silent stale exports | 2 days |
| E4 | Soft-delete + retention schedule + PDPO data-controller documentation | Compliance | 2 days + legal |
| E5 | Parity suite in CI (already recommended) | Repeatable migration proof | in plan |
| E6 | Formal project reviewer timeout + reassignment | Removes a stall condition | 1 day |

### Reject / Defer

| Item | Verdict |
|---|---|
| Composite "falling behind" score | **Reject** — per-dimension only; a composite number is not actionable (confirmed in the design; hold the line) |
| Pain / ICM module build | **Defer** — as directed |
| Real-time dashboard push (Supabase realtime / Pusher) | **Defer** — polling every 60s is sufficient for 200 users and removes an entire dependency |
| Patient identity in the logbook | **Reject** — confirmed drop; keep synthetic `case_ref` |

---

## 6. Two Structurally Important Suggestions

Beyond the matrix, two changes would improve the system's long-term integrity more than any individual fix:

**6.1 Make the curriculum a versioned data artefact, not code.** Every gate in this system encodes curriculum rules — 218 cases, 615 cases, 29 CF WBA, 31 specialty WBA, 24 months in the last 3 years, 2-year retrospective window. All of these *will* change, and they will change while trainees are mid-training. If they are literals in a SQL function, every change is a deployment with regression risk, and there is no record of which rule version was applied to which trainee. Store them in a `curriculum_rules` table with `effective_from` / `effective_to`, apply the rule version in force at the relevant date, and version the gate logic alongside it. This is the difference between "the College can amend its curriculum" and "the College must commission a software release to amend its curriculum."

**6.2 The parity suite should include a rule-version check.** When the curriculum changes, the migration parity suite should prove that historical trainees' computed eligibility is unchanged *unless the College intended it to change*. Without this, a curriculum amendment silently re-scores the entire historical cohort.

---

## 7. Overall Assessment

The design is **stronger than most systems of this kind** and the instincts behind it are right: proactive declaration over retrospective logging, automated credit over manual tallying, cohort-relative risk over arbitrary thresholds, explicit authority models over implied ones. The team has already found and fixed the two problems that usually sink these projects — the unenforced 2-year rule and the unnormalised claim fields.

What remains is a consistent pattern: **the design treats credit and identity as facts that change by update, when they need to change by new record.** Everything in Must Fix follows from that single observation.

Close M1 through M6 before writing the Prisma schema. H1 through H3 before the SOT console UI. U1, U2, and U4 before pilot. The rest can trail implementation.

---

## 8. Decisions Log

Tracking resolution of Must-Fix / High-Priority items as they are worked through with Dr. Chan, one issue at a time.

### M4 — Invalid SQL constructs (generated columns, check constraint subquery) — **RESOLVED 2026-10-01**

**Decision:** Confirmed as pure SQL correctness fixes, no policy tradeoff. Both approved as designed.

1. **`itas.is_overdue` / `itas.days_overdue`** — remove as stored/generated columns (invalid: generated columns cannot reference volatile functions like `CURRENT_DATE`). Replace with a view (`itas_with_status`) that computes overdue status at query time. Gates and dashboards must query the view, never the base `itas` table, when overdue status matters.

2. **`rotations` duration check constraint** — remove as a `CHECK` constraint (invalid: check constraints cannot reference other tables). Replace with a `BEFORE INSERT OR UPDATE OF duration_months, centre_id` trigger (`check_rotation_duration()`) that looks up `accredited_centres.max_duration_months` and raises an exception if exceeded.

**Outstanding before implementation:** exact column/table names in the actual draft Prisma/SQL schema need confirming (illustrative names used: `due_date`, `completed_at`, `duration_months`, `centre_id`, `accredited_centres.max_duration_months`) — apply as a real diff against the schema doc when that work starts, not before.

**Status:** Design-closed. No further decision needed. Implementation pending (sequenced after M1–M3, M5, M6 per §5 matrix).

### E2 — JCIMED / HKAM iWBA API Integration Readiness — **IN PROGRESS (2026-10-01)**

**Action:** Evaluated HKAM iWBA Draft Specification (`doc_c050126f3499_iWBA ePortfolio read API (Draft Version).pdf`). Formal query submitted to developers (zlightinno / HKAM) covering:
1. Support for junior trainees where `hkam_id: null` (`college_trainee_id` or `mchk_registration_number`).
2. Mitigation of N+1 detail endpoint bottleneck under 60 req/min rate limit (batch endpoint request).
3. Modality coverage confirmation for CBD, ALMAT, and MSF.
4. College-specific curriculum competency code mapping.
5. Clarification on historical 90-day sliding window constraint.

Detailed technical analysis documented in: `[[HKAM iWBA API Integration Analysis]]`.

---

## Related Documents

- [[Pre-Implementation Appraisal Dossier]]
- [[Database Schema and Data Model]]
- [[New Workflow Changes - Curriculum Updates Required]]
- [[Legacy Data Migration and Rollover Plan]]
- [[Legacy EPS Schema Audit]]
- [[System Architecture and Roadmap]]
