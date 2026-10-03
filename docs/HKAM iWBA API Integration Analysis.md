---
type: technical_spec
project: "[[HKCA Portfolio Revamp]]"
created: 2026-10-01
status: in_discussion
source_doc: "[[iWBA ePortfolio read API _Draft Version_.pdf]]"
endpoint: "https://wba.zlightinno.com"
---

# HKAM iWBA Read API — Technical Analysis & College Integration Gaps

**Document Evaluated:** `iWBA ePortfolio Read API Specification (Draft Version - 20261001)`  
**Environment:** `https://wba.zlightinno.com` (Deployed 01 Oct 2026; subject to change upon HKAM production cutover)  
**Authentication:** Bearer token (`Authorization: Bearer <token>`), tenant-isolated per College.  
**Architecture:** Asynchronous pull-based REST API (delta polling via `updated_since` cursor). Webhooks / push events are *not* supported.

---

## 1. Summary of API Capabilities (Draft Spec)

1. **`GET /api/v1/eportfolio/summary`**
   * Parameters: `updated_since` (mandatory ISO-8601), `updated_before` (optional ISO-8601, max 90-day span), `page` (default 1), `page_size` (max 100).
   * Payload: Returns array of assessment headers: `id`, `updated_at`, `status` (`completed`, `failed`, `in_progress`, `unverified`), `modality` (`CEX`, `EPA`, `DOPS`), `date`, `college`, `trainee`, `trainer`, `hospital`, `ward`, `procedure`.
   * *Omissions:* Excludes timeline steps, rubric checklists, and qualitative comments.
2. **`GET /api/v1/eportfolio/assessments/{id}`**
   * Parameters: UUID path parameter.
   * Payload: Full assessment structure with ordered `timeline` steps (`step_type`: `form`, `review`, `reflection`), including embedded answers, Likert scores, and free-text supervisor feedback.
3. **Rate Limits & Throttling:**
   * 60 requests/minute and 10 requests/second per College token.
   * Exceeding limits returns HTTP 429 (`rate_limited`) with `Retry-After` header.

---

## 2. Five Critical Gaps Raised to Developers (zlightinno / HKAM)

On **2026-10-01**, Dr. Albert Chan submitted the following 5 formal queries and enhancement requests to the developer team:

| # | Gap / Constraint | Technical Risk to HKCA | Proposed Remedy to zlight |
|---|---|---|---|
| **1** | **`hkam_id: null` on junior trainees** | Basic (BAT) and early Higher (HAT) trainees do not hold HKAM Fellow IDs. Matching purely on full name risks severe cross-trainee data corruption. | Add `college_trainee_id` (`hkca_number`) or MCHK Medical Registration Number to payload. |
| **2** | **N+1 Polling Bottleneck** | Detailed scores/comments require individual `GET /{id}` calls. At 60 req/min, backfilling 2,000 WBAs requires >30 minutes of serialized requests. | Provide batch detail endpoint (`POST /assessments/batch` up to 50 UUIDs) or `include_answers=true` query flag on summary. |
| **3** | **Missing Core Modalities (CBD, ALMAT, MSF)** | Spec only details CEX, EPA, and DOPS. HKCA curriculum explicitly mandates CBD, ALMAT, and 360° MSF. | Clarify how CBD, ALMAT, and MSF will be mapped or if distinct modalities will be added. |
| **4** | **Curriculum Domain Mapping** | Generic procedure codes (`DOPS-12`) do not map to HKCA Clinical Fundamentals (2.1–2.7) or Specialty Modules (3.1–3.13). | Support College-specific curriculum competency codes in payload. |
| **5** | **90-Day Sliding Window Limit** | `updated_before - updated_since <= 90 days` cap breaks naive historical data sync. | Confirm multi-year onboarding export procedure or relaxed date window for initial sync. |

---

## 3. Impact on HKCA ePortfolio Schema & Architecture

Pending the response from zlightinno:
* **`wbas` Table Schema:** Must ensure `jcimed_sync_id` (UUID), `modality`, and `sync_status` cleanly ingest the incoming JSON timeline without data loss.
* **Sync Engine Daemon:** Design the delta-polling background worker to support sliding 90-day time chunking and rate-limit backoff (`429` exponential backoff).
* **Identity Resolution Layer:** Build a fallback resolver: `hkam_id` $\rightarrow$ `mchk_registration_number` $\rightarrow$ exact name match with SOT verification gate when `hkam_id` is null.
