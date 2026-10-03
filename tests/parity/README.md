# Parity Test Suite

Verifies that a migrated record set is **faithful to the legacy source**. Run after every mapping or
transform change — a fix for one trainee can silently break another.

## Why this exists

Trainees will be mid-training at cutover. A trainee who has logged 608 cases and holds 42 accredited
months must see exactly that in the new system on day one. If the parity suite does not pass, the
College cannot cut over.

**The College signs off on the per-trainee report — not on a summary count.**

## Checks

| Check | Legacy source | Target |
|---|---|---|
| Total accredited months | `sum(atp_training_experience.anaesthesia + intensive_care + elective)` | `trainee_profiles.total_accredited_months` |
| Clinical Anaesthesia months | `sum(atp_training_experience.anaesthesia)` | `clinical_anaesthesia_months` |
| ICU months | `sum(atp_training_experience.intensive_care)` | `icu_months` |
| Clinical Fundamentals WBA | `count(atp_cex)` where category = CF | `count(wbas)` where category = CF |
| Specialty Modules WBA | `count(atp_cex)` where category = specialty | `count(wbas)` where category = specialty |
| VOP total cases | `count(patient2)` | `count(volume_of_practice)` |
| VOP by descriptor | `group by module_claimed` | `group by descriptor_code` |
| MSF completions | `count(atp_msfs)` where complete | `count(msf_sessions)` |
| ITA count and outcomes | `atp_in_training_assessment` | `itas` |
| Current training stage | `user.level_of_training` | `trainee_profiles.current_stage` |

## Expected output

Per trainee, per check:

```
HKCA 2022-019  Dr Kelvin Wong
  accredited_months      legacy 42.0   new 42.0   ✓
  clinical_anaesthesia   legacy 36.0   new 36.0   ✓
  cf_wba                 legacy 20     new 20     ✓
  specialty_wba          legacy 12     new 12     ✓
  vop_total              legacy 608    new 608    ✓
  vop_by_descriptor      2.2: 85/85 ✓   3.5: 42/42 ✓
  msf                    legacy 1      new 1      ✓
  ita_count              legacy 7      new 7      ✓
  stage                  legacy HAT-2  new HAT-2  ✓
  RESULT: PASS
```

Any mismatch lists the field and both values, and the trainee is marked `FAIL`. The run fails as a
whole if any trainee fails.

## Known-acceptable differences

Some divergence is expected and must be declared rather than treated as a defect:

- **Re-classification.** Cases reclassified during normalisation will change per-descriptor counts.
  This is the intended outcome, but each affected trainee must be listed explicitly and signed off.
- **Dropped patient identity.** `patient2.hkid`, `date_birth` and `sex` are not migrated (see the
  migration plan). Comparisons must not reference them.
- **Phase-2 data.** `atp_echo`, `atp_icu_tutorial*`, `atp_course`, `atp_exam`, `atp_reg*` are preserved
  but not loaded into MVP tables, so they are out of scope for parity.

## Running

To be wired to CI once the schema and ETL exist. It must be runnable **outside** the web application —
the migration is not a request-handler job and should not depend on serverless execution limits.
