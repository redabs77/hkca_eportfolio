# HKCA e-Portfolio System

Replacement for the legacy HKCA Electronic Training Portfolio (ETP/EPS) — a role-aware web
application tracking anaesthesia trainees from Basic Anaesthesia Training (BAT) through Higher
Anaesthesia Training (HAT) and Provisional Fellowship Year (PFY) to Fellowship.

**Client:** Hong Kong College of Anaesthesiologists (HKCA)
**Sponsor:** Dr Albert Chan — Chief of Service, PWH Anaesthesia, Pain and Perioperative Medicine;
Cluster Director, NTEC Anaesthesia Services; Honorary Clinical Associate Professor, CUHK

---

## ⚠️ Read before committing

**This repository must never contain real patient, trainee or staff data.**

The legacy database dump includes a logbook table (`patient2`) that stores **plaintext patient HKIDs**
alongside surgical diagnoses. Nothing resembling production data belongs in Git.

- All `*.sql`, `*.csv`, `*.xlsx` and dump files are gitignored
- Use synthetic fixtures only (see `db/seeds/`)
- If you need a real data extract for migration testing, keep it outside this repo entirely

---

## Repository layout

```
docs/         Design decisions, schema notes, migration plan (mirrors the Obsidian project)
prototypes/   Self-contained HTML prototypes for stakeholder review
db/
  schema/     Prisma / Drizzle schema definitions
  migrations/ ETL scripts — one per migration phase
  seeds/      Synthetic fixtures (never real data)
tests/
  parity/     Legacy-vs-new verification suite
src/          Next.js application
```

---

## Current status

| Area | Status |
|---|---|
| Legacy schema audit | Complete — 21 tables + logbook (`patient2`), **no foreign keys anywhere** |
| Curriculum requirements | Complete — BAT 3y / HAT 2y / PFY 1y, WBA, VOP, ITA, MSF minimums captured |
| Data model | Drafted, pending migration reconciliation |
| Migration plan | Drafted — 4-phase, parity-tested |
| Prototypes | 4 HTML prototypes complete |
| Migration tooling | **Not started** |
| Application | **Not started** |

---

## Design direction

**Split by surface**, agreed 2026-09-30:

> Direction B (Clinical Dense) for anything the SOT scans in bulk.
> Direction A (Stripe Executive) for anything a human reads one at a time.

| Surface | Direction |
|---|---|
| SOT roster, logbook queue, cluster tables, ITA queue | B — Clinical Dense |
| Trainee dashboard, ITA form, PFY plan, formal project | A — Stripe Executive |

Same type family, same semantic colours, same status pills — only density and elevation differ.

---

## Prototypes

Open any file in `prototypes/` directly in a browser. No build step, no dependencies at runtime
(web fonts load from Google Fonts).

| File | Direction | Covers |
|---|---|---|
| `HKCA_SOT_Console_Prototype.html` | B | SOT roster, logbook verification, rotation handshake, ITA queue |
| `HKCA_SOT_Direction_Comparison.html` | A + B | The visual-direction decision, side by side |
| `HKCA_Trainee_Dashboard_DirectionA.html` | A | Trainee progress, peer percentiles, gate status |
| `HKCA_Portfolio_StateOfTheArt.html` | — | Early combined exploration |

---

## Domain vocabulary

Use these exact terms in code, schema and UI copy.

**Training stages:** `BAT` (Basic Anaesthesia Training, min 3y) → `HAT` (Higher Anaesthesia Training,
min 2y) → `PFY` (Provisional Fellowship Year, 1y) → `Fellow`

**Roles:** `trainee`, `sot`, `assistant_sot`, `trainer`, `admin`, `boe_officer`

**Assessment types:** `CEX`, `CBD`, `DOPS`, `ALMAT`, `MSF`
*(note: `CEX` — not Mini-CEX, which was the legacy name)*

**Training composition (6 years / 72 months):** Clinical Anaesthesia 48mo · Intensive Care 6mo ·
Elective Options 18mo

**Two WBA tracking categories:** Clinical Fundamentals (target 29 by end of HAT) ·
Specialty Modules (target 31 before Exit)

---

## Migration note

Trainees will be **mid-training at cutover**, so the new system must import complete historical
records and be indistinguishable from a continuously-running record on day one.
See `docs/` for the full migration and rollover plan — it is a product feature with its own tests,
not a one-off export.

---

## Pilot deployment

Mock-data pilot: **Vercel + Supabase** (no real data).
Production: **Hong Kong-hosted Postgres** — residency must be confirmed with the College before any
patient-adjacent data is hosted.

Do not run the pilot on the same host as the legacy data.
