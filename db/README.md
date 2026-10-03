# Database & Migration

## ⚠️ No real data in this directory, ever

`db/seeds/` holds **synthetic fixtures only**. The legacy source contains plaintext patient HKIDs
(see `patient2.hkid`); real extracts stay outside this repository entirely.

## Layout

```
schema/      Prisma or Drizzle schema definitions
migrations/  ETL scripts — one per phase (extract, transform, verify, cutover)
seeds/       Synthetic fixtures for local development and tests
```

## Source systems

| System | Engine | Tables | Status |
|---|---|---|---|
| Legacy EPS | MariaDB 10.11 | 21 tables + `patient2` (logbook) | Audited |
| Target | PostgreSQL | To be built | Drafted |

**Critical characteristic of the legacy schema: there are no foreign keys, no indexes and no
constraints anywhere.** All relationships are held by unvalidated `varchar(11)` columns (`tid`, `pid`,
`aid`, `fsid`, `mita_id`). Orphan rows are therefore possible in every table, and migration must
include an explicit referential-integrity sweep with a quarantine path.

## Migration phases

| Phase | Produces | Gate to proceed |
|---|---|---|
| 1 — Extract & profile | Distinct-value report, orphan report | College resolves which ITA system is authoritative |
| 2 — Transform | Normalised records with provenance stamps | Quarantine sets reviewed, no unrecoverable loss |
| 3 — Dry run | Parity report (legacy vs new, per trainee) | Full parity, no unexplained mismatches |
| 4 — Cutover | Production load | **College sign-off on the parity report** |

Phases 1–3 are repeatable and have no production impact. Only phase 4 is a one-way door, and legacy
stays read-only rather than deleted for at least one full rotation cycle afterwards.

## The classification problem

Free-text fields with no controlled vocabulary are the largest data-quality risk:

- `patient2`: `module_claimed`, `specialty_module_claimed`, `procedure_claimed`, `mode_anaesthesia`
- `atp_cex`: `form_type`, `clinical_or_specialty`, `level_training`
- `atp_training_experience`, `atp_in_training_assessment`: `rotation_type`, `level_training`

These must be mapped to `curriculum_descriptors` (`2.1`–`2.7`, `3.1`–`3.13`) **and signed off by the
College** before trainees see the result — re-classification can change a trainee's progression
eligibility, so it is not a technical decision.

## Verifying a migration

`tests/parity/` holds the verification suite. For every trainee it compares legacy-computed against
new-system-computed values across accredited months, WBA counts by category, VOP counts by descriptor,
MSF completions and ITA outcomes.

Run it after **every** mapping change — not once at the end. A mapping edit that fixes one trainee can
silently break another.
