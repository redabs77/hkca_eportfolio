# Prototypes

Self-contained HTML files for stakeholder review. Each opens directly in a browser — no build step,
no runtime dependencies (web fonts load from Google Fonts).

## Current files

| File | Direction | Covers |
|---|---|---|
| `HKCA_SOT_Console_Prototype.html` | Linear Precision (roster) → Stripe Executive (trainee drill-down) | SOT triage roster (dense, scan-first), ITA action queue w/ escalation ladder, logbook verification queue (batch vs. individual review), rotation handshake queue; clicking a trainee row opens a Stripe Executive single-trainee record with SOT-side actions (synthesis, verification) |
| `HKCA_Admin_Console_Prototype.html` | Secretariat work tool (shared theme) | Work queue home; Membership Application vetting (Medical Council registration, fee, e-signed or PDF endorsement) and account opening; registry and status changes, with a Status to confirm list for statuses still as imported from the legacy system (doubtful first, set one or many at once); Training Progression by gate (BAT to HAT, HAT to PFY, PFY to Exit; advance only fully eligible trainees); Retrospective Recognition (Admin enables the application and checks documents, Training Officer vets and decides, Board only when a problem is raised, then ledger credit with a decision trail; Training Officer view in Demo controls); Courses (course rounds the Secretariat sets up with date, member and non-member fees, and when registration opens and closes; seat allocation with Accepted, Rejected and Waitlisted decided by Admin, waitlisted and about-to-progress trainees shown first; attendance check (rate required on HKCA courses, none needed for full attendance on CSC courses; HKCA courses: 70% certificate and under-50% notice; CSC courses: 100% only, shortfall reported to the SOT); mandatory courses (no charge at present) and other College courses); exam entry list and results-file dry run; formal project reviewer dispatch; accreditation registry, SOT appointments, roster review; iWBA sync (link people, map items, held-back items); chained activity log |
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

`hkca-courses-store.js` is the shared course registration store used by the Admin console (Courses tab) and the Trainee Dashboard (Courses and Next steps). It keeps rounds, applications, decisions and attendance in localStorage so a change on one page shows on the other. Use the same browser and the same site origin. Reset it from Demo controls on the dashboard or the Admin console.

**Exams (Admin console):** Intermediate and Final tabs, each with Sittings, Exam Applications, Upload results and Past sittings. Closed loop with the Trainee Dashboard (overview card and Next steps) through `hkca-courses-store.js`; the SOT step is the demo role "View as Supervisor of Training". Criteria are one list (`EX_RULES`) in the store.

Exam results are per subject (Intermediate) and per section (Final) and drive the carry-forward of section passes (see the decisions log).

Formal projects tab: Protocols, Manuscripts and Approval log, following HKCA-E03; the exit-gate formal project criterion is derived from the cases.
