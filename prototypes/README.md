# Prototypes

Self-contained HTML files for stakeholder review. Each opens directly in a browser — no build step,
no runtime dependencies (web fonts load from Google Fonts).

## Current files

| File | Direction | Covers |
|---|---|---|
| `HKCA_SOT_Console_Prototype.html` | Linear Precision (roster) → Stripe Executive (trainee drill-down) | SOT triage roster (dense, scan-first), ITA action queue w/ escalation ladder, logbook verification queue (batch vs. individual review), rotation handshake queue; clicking a trainee row opens a Stripe Executive single-trainee record with SOT-side actions (synthesis, verification) |
| `HKCA_Portfolio_Prototypes_3Ways.html` | A / B / C | The three named visual directions (Linear Precision, Stripe Executive, Apple HealthOS) side by side, toggleable, trainee-facing content only |
| `HKCA_Portfolio_Prototype.html` | — | Earlier single-direction trainee/SOT/admin mockup; superseded by the above |

Note: `HKCA_SOT_Direction_Comparison.html` and `HKCA_Trainee_Dashboard_DirectionA.html` referenced in an earlier version of this file do not exist in the vault — removed from this table on 2026-10-03 rather than left as broken links. If those were meant to exist, they still need building.

## Revision convention

Keep superseded versions rather than overwriting. Use `Name v2.html`, `Name v3.html` — or, for
iteration on a single screen, keep one file and change it in a commit so the history is in Git.

## Context for reviewers

All numbers in these prototypes are **illustrative**. They exist to show composition, hierarchy and
interaction — not to state policy. Authoritative curriculum figures live in the requirements
documents, and the accreditation position is set by the College.

## What a prototype is not

None of these are production code. No accessibility audit has been run, no browser verification
against a real device, and the JavaScript is deliberately minimal. Treat them as design artifacts.
