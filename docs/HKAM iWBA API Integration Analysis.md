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

On **2026-10-01**, Dr. Albert Chan submitted 5 formal queries to the developer team. On **2026-10-06**, JCIMED / zlightinno responded with complete architectural resolutions:

| # | Gap / Constraint | Developer Resolution (2026-10-06) | Status |
|---|---|---|---|
| **1** | **`hkam_id: null` on junior trainees** | **Resolved (2026-10-07).** `hkam_id` = eHKAM account ID (HKAM single sign-on identity), **not** the HKAM Fellow ID. All trainees (incl. BAT/HAT) are eligible; HKAM rolled out self-registration from 2026-09-30. Null only until a trainee signs in via SSO (pre-SSO = local account by College Admin). eHKAM ID is HKAM's recommended stable cross-college identifier — survives college transfers and MCHK registration-status changes, and cannot be shared (GWS security). iWBA also supports local accounts throughout the transition; every account (eHKAM-linked or local) has a unique `iwba_user_id`. JCIMED also offered to carry HKCA's own **College Trainee Number** as a supplementary field, synced via a mapping table (same mechanism as the curriculum mapping). | **Resolved** |
| **2** | **N+1 Polling Bottleneck** | Added `POST /api/v1/eportfolio/assessments/batch` accepting up to 50 assessment IDs per call. Under 60 req/min limit, throughput is ~3,000 assessments/min. | **Resolved** |
| **3** | **Modality Values** | Formal modality enum confirmed: `CEX`, `EPA`, `DOPS`, `CBD`, `MSF`, `PBA`, `ACR`, `ALMAT`. | **Resolved** |
| **4** | **Curriculum Domain Mapping** | JCIMED shared current 14-item config (all DOPS). Agreed to add curriculum category, training stage, and map College-provided competency codes into API responses. **2026-10-07: JCIMED confirmed support — "just let me know the mapping table."** | **Mapping table finalized** (see [[HKCA Curriculum Competency Mapping Table (for JCIMED)]], cross-checked against the legacy EPS system and HKCA-E01) — ready to send, pending Albert's final go-ahead |
| **5** | **90-Day Sliding Window Limit** | 90-day limit is per summary query only. Team offered a dedicated backfill endpoint without the 90-day cap for initial historical data rollover. | **Resolved** |

---

## 3. Curriculum Review & Discrepancies in iWBA (as of 2026-10-06)

Analysis of current iWBA admin configuration (`upload_20261006_101256_1.jpg`):
1. **Modality Coverage:** Only 14 procedures configured, all DOPS. Zero EPAs, Mini-CEX, CBDs, or ALMAT currently exist in iWBA.
2. **Stage Misallocations:** "Transducer setup" is marked HT mandatory $\times 3$, but should be available/mandatory at Basic Training (BT).
3. **Coding Scheme:** Procedures currently use free-text strings. Formal mapping table drafted and verified against the official HKCA-E01 curriculum (2026-10-07): see [[HKCA Curriculum Competency Mapping Table (for JCIMED)]].
   - Clinical Fundamentals: `CF-2.1` to `CF-2.7`
   - Subspecialties: `SM-3.1` to `SM-3.13`
4. **Transducer setup fix identified:** Belongs under `CF-2.5` (Perioperative Medicine), should be available at BT not HT-only — flagged in the mapping table doc for JCIMED.

---

## 4. Impact on HKCA ePortfolio Schema & Architecture

* **`wbas` Table Schema:** Modality enum updated to include all 8 JCIMED modalities. Added `iwba_user_id` and `iwba_procedure_code`.
* **Sync Engine Daemon:** Ingestion pipeline will query `GET /summary` using 90-day slices, chunk IDs into batches of 50, and fetch full records via `POST /assessments/batch`.
* **Identity Resolution Layer:** Resolution priority: `iwba_user_id` $\rightarrow$ `hkam_id` (eHKAM SSO account ID — NOT the HKAM Fellow ID; confirmed 2026-10-07) $\rightarrow$ `email` $\rightarrow$ SOT manual verification queue. HKCA's own College Trainee Number (`hkcaNumber`) is supplementary only, synced via a mapping table, not used for identity resolution.
