---
type: architecture
project: "[[HKCA Portfolio Revamp]]"
created: 2026-09-29
---

# HKCA Portfolio Revamp — Architecture, Roadmap, Subagents & Cost

## 1. Technical Architecture Recommendation

### Recommended Stack
- **Frontend:** Next.js (React 19, TypeScript, Tailwind CSS, shadcn/ui) — delivers fast, accessible, responsive dashboards for mobile and desktop clinical environments.
- **Backend / API:** Next.js Server Actions / Route Handlers or a dedicated Node.js / FastAPI microservice for complex business logic, PDF generation, and automated cron triggers.
- **Database & ORM:** PostgreSQL with Prisma or Drizzle ORM — provides strict relational integrity for complex training hierarchies, historical audit trails, and role-based data isolation.
- **Authentication:** NextAuth.js / Supabase Auth / Keycloak supporting RBAC, session management, and extensible to HKAM SSO or hospital OAuth/SAML in the future.
- **Storage:** S3-compatible object storage (MinIO on-premise or cloud S3) with pre-signed URLs for course certificates, formal project blinded/unblinded manuscripts, and PDF reports.
- **Audit Logging:** Immutable append-only audit table tracking access to sensitive records (warning letters, remedial plans, trainee disputes).

---

## 2. Phased Implementation Roadmap

### Phase 1: MVP Core (Weeks 1 – 8)
- [ ] Ingest & audit legacy database schema and data integrity.
- [ ] User directory & RBAC (College Admin, Cluster SOT, SOT, Asst SOT, Trainer, Trainee).
- [ ] Training Progression State Machine (BAT $\rightarrow$ HAT $\rightarrow$ PFY $\rightarrow$ Fellowship).
- [ ] Hospital Rotations & Centre Accreditation tracker.
- [ ] In-Training Assessment (ITA) module: 6-month / rotation-end forms, Trainer consensus rating, SOT sign-off, remedial workflow trigger.
- [ ] Mandatory Courses & Examination records (upload, verification, gating).
- [ ] PF Year 3-domain plan & SOT/COS sign-off.
- [ ] Basic Trainee and SOT overview status cards.
*(Note: Pain Medicine and Intensive Care Medicine (ICM) modules held off until future phases per Dr. Albert Chan's directive).*

### Phase 2: Logbooks, Echo & Formal Project (Weeks 9 – 14)
- [ ] Volume of Practice (e-Logbook) module with 2-year entry rule enforcement and subspecialty categorization.
- [ ] Integrated Echo Training curriculum & log.
- [ ] Formal Project module: blinded vs unblinded protocol submissions, reviewer assignment, rubric evaluations, revision loops, approval letters.
- [ ] Sensitive events ledger (warning letters, remedial plans with restricted visibility).

### Phase 3: External Integrations & Advanced Workflows (Weeks 15 – 20)
- [ ] HKAM JCIMED WBA adapter (REST API / webhook ingestion for DOPS, CEX, CBD, ALMAT, MSF).
- [ ] Course calendar, trainee application, and attendance verification workflow for mandatory courses.
- [ ] Automated overdue notification daemon (ITA 3-month reminder, 6-month penalty lock).

### Phase 4: SOT & Trainee Dashboards, Analytics & Polish (Weeks 21 – 24)
- [ ] Comprehensive visual progress dashboard (curriculum completion gauges, overdue alerts, rotation timelines).
- [ ] Cluster SOT aggregate cross-hospital oversight dashboards.
- [ ] End-to-end UAT, legacy data migration script execution, and pilot launch.

---

## 3. Launch & Testing Strategy

1. **Synthetic Scenario Test Suite:**
   - Automated integration tests simulating edge cases: failing 2 consecutive ITAs, switching hospitals mid-rotation, attempting to sit Fellowship Exam with an outstanding ITA, uploading log entries $>2$ years old.
2. **Parallel Pilot Running:**
   - 1–2 pilot training centres (e.g., NTEC / Prince of Wales Hospital) running the new portfolio in parallel with the legacy system for one full 3-month or 6-month rotation block.
3. **Data Migration Verification:**
   - Two-phase ETL: 
     - *Dry Run:* Replay historical data from legacy DB into new schema; run verification checks on trainee status parity.
     - *Cutover Run:* Freeze legacy writes, delta sync, and verify hashes/counts before user sign-in opens.
4. **User Acceptance Testing (UAT):**
   - Structured feedback sessions with SOTs, representative trainers, and trainees.

---

## 4. Subagent Orchestration Strategy

*In accordance with project protocol, no autonomous subagent will be launched unannounced. Each subagent task will be clearly scoped and presented for Albert's approval before spawning.*

Recommended subagent roles during development:

1. **Schema & Migration Specialist Subagent:**
   - *Scope:* Parses the legacy database dump, reverse-engineers legacy entity relationships, and writes clean TypeScript/SQL migration scripts.
2. **Curriculum Rules Engine Subagent:**
   - *Scope:* Implements unit-tested pure functions enforcing HKCA progression rules, ITA scoring thresholds (Angoff cutoff, $\ge 4$ unsatisfactory items), and examination prerequisites.
3. **Frontend Component Specialist Subagent:**
   - *Scope:* Generates accessible, mobile-responsive UI components (ITA evaluation matrices, PFY plan forms, review rubrics) adhering to shadcn/ui and Tailwind standards.
4. **Integration Adapter Subagent:**
   - *Scope:* Builds mock endpoints and schemas for future HKAM JCIMED WBA synchronization.

---

## 5. Model Selection & Cost Optimization

### Primary UI/UX & Frontend Design Models (Alternative to Claude 3.7)
1. **`claude-3-5-sonnet` (Anthropic / Zhihui `claude-3-5-sonnet-20241022`):**
   - The gold standard model for frontend code, design taste, and Tailwind/shadcn component architecture prior to 3.7. Available in your Zhihui configuration.
2. **`google/gemini-2.5-pro` / `google/gemini-3.8-flash` (Google via OpenRouter):**
   - Exceptionally fast, massive context window (ideal for rendering full multi-screen HTML/CSS prototypes with interactive JS), excellent at data visualization (SVG/Chart.js/ECharts).
3. **`deepseek/deepseek-chat` (DeepSeek-V3):**
   - Highly capable on clean TypeScript/React code at extremely low token cost ($0.14 / 1M tokens), provided it is given strict anti-slop guidelines (avoid generic cards and emoji soup).
4. **`openai/gpt-4o`:**
   - Reliable for reactive state machines, form validation rules, and modal dialog controllers.

### Design System Baseline Decision (2026-09-30 — SUPERSEDES 2026-09-29)
- **Selected Approach:** **Split by surface.** Direction B (Clinical Dense) is the operational spine;
  Direction A (Stripe Executive) is used for read-one-at-a-time surfaces.
- **Governing rule:** *Direction B for anything the SOT scans in bulk. Direction A for anything a human
  reads one at a time.* Same type family, same semantic colours, same status pills — only density and
  elevation differ. This keeps the split reading as intentional rather than accidental.
- **Direction B (Clinical Dense) applies to:**
  - SOT roster (trainee triage)
  - Logbook verification queue
  - Cluster-scope oversight tables
  - ITA action queue
- **Direction A (Stripe Executive) applies to:**
  - Trainee-facing dashboard
  - ITA form and sign-off surface
  - PFY plan and 3-domain submission
  - Formal project workspace
- **Supersedes:** the 2026-09-29 "Direction B locked" decision, which selected a single direction.
- **Prototype:** `HKCA_SOT_Direction_Comparison.html` — both directions, identical content, toggleable.

---

## 6. Estimated Duration & Resource Cost

- **MVP Development (Phase 1):** 6 – 8 weeks.
- **Full Scope Rollout (Phases 1 – 4):** 20 – 24 weeks (~5 to 6 months).
- **Estimated AI Token / Compute Cost:** ~$120 – $220 total (HK$936 – HK$1,716) using hybrid model routing (Claude Sonnet 5 @ $33.75/$168.75 for UI/UX and clinical state machines; Kimi/Flash for ETL and tests), or ~$350 – $550 if unconstrained Sonnet is utilized. See [[Token and Cost Ledger]] for active provider rates and audit log.
- **Hosting / Infrastructure Cost:** ~$20 – $50/month (VPS / managed PostgreSQL / S3-compatible bucket).
