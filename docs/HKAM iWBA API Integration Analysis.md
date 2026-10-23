---
type: technical_spec
project: "[[HKCA Portfolio Revamp]]"
created: 2026-10-01
status: in_discussion
source_doc: "[[iWBA ePortfolio read API (Draft Version refreshed 20261020).pdf]]"
updated: 2026-10-23
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
4. **Transducer setup fix identified:** Belongs under `CF-2.1` (General Anaesthesia and Sedation), Basic Training only, not HT-only (corrected 2026-10-23: this note previously said CF-2.5; the mapping table, checked against HKCA-E01 Appendix 3 §2.1, says CF-2.1).

---

## 4. Impact on HKCA ePortfolio Schema & Architecture

* **`wbas` Table Schema:** see §5 below. (Corrected 2026-10-23: an earlier version of this line said the enum and `iwba_user_id` were already in the schema; they were not. They are now.)
* **Sync Engine Daemon:** Ingestion pipeline will query `GET /summary` using 90-day slices, chunk IDs into batches of 50, and fetch full records via `POST /assessments/batch`.
* **Identity Resolution Layer:** Resolution priority: `iwba_user_id` $\rightarrow$ `hkam_id` (eHKAM SSO account ID — NOT the HKAM Fellow ID; confirmed 2026-10-07) $\rightarrow$ `email` $\rightarrow$ SOT manual verification queue. HKCA's own College Trainee Number (`hkcaNumber`) is supplementary only, synced via a mapping table, not used for identity resolution.

---

## 5. Spec refresh of 2026-10-20: review (2026-10-23)

**Source:** `iWBA ePortfolio Read API (Draft Version refreshed 20261020).pdf`, 26 pages. College feedback items #74 (batch), #75 (backfill summary) and #83 (`iwba_user_id`) merged by JCIMED around 10 Oct 2026.

### 5.1 What the refresh delivered
| Item | Detail |
|---|---|
| Batch | `POST /assessments/batch`, `{"ids":[...]}`, 1 to 50 UUIDs. Duplicates merged case-insensitively. Unknown or other-college IDs come back in `not_found` with HTTP 200, and the two cases cannot be told apart. One call is one request against the rate limit. |
| Backfill | `GET /backfill/summary`. `updated_since` required, `updated_before` optional, **no 90-day cap**. Off unless the token's `backfill_enabled_until` is in the future, else 403 `backfill_not_enabled`. A Super Admin sets it through `POST /api/admin/tenants/{id}/api-token/backfill`; there is no UI. Regenerating a token copies the window; new tokens start closed. |
| Identity | Trainee and trainer carry `iwba_user_id` (always present, UUID) and `hkam_id` (null until HKAM SSO sign-in). **No email, MCHK or college trainee number.** |
| Detail shape | The old top-level `answers` and `written_feedback` are gone. All form data is in `timeline[].answers[]`, each with `question_id`, `title`, `type`, `respondent_role`, `value`. Datetime values are local wall-clock, no timezone. Steps with no answers are omitted; `timeline` can be empty. DOPS keeps `workflow_outcome` (COMPLETE, FAIL, null). |
| Summary window | `updated_since` inclusive, `updated_before` exclusive, span at most 90 days. Omitting `updated_before` means "now", so a cursor older than 90 days is rejected. |
| Errors | `updated_since_required`, `invalid_updated_since`, `invalid_updated_before`, `updated_window_too_long`, `updated_before_before_updated_since`, `page_size_exceeds_cap`, `invalid_id`, `ids_required`, `ids_empty`, `ids_exceed_cap`, `unauthorized`, `college_inactive`, `backfill_not_enabled`, `not_found`, `rate_limited` (with `Retry-After`). |
| Unchanged | Bearer token per college; `college_id` ignored; cross-tenant access is 404; 60 requests/min and 10/s; page size default 50, max 100; no webhooks. The base URL is a dev URL and may change at HKAM production cutover. |

### 5.2 Conflicts found in our own documents (all corrected 2026-10-23)
1. **Identity resolution by email is impossible** because the API omits email. Replaced with a stored link table (`wba_iwba_links`) confirmed once by College Admin; see PRD 4.3.
2. **The schema was behind this note.** `wbas` lacked the new modality values, `iwba_user_id`, and the sync tables. Fixed.
3. **PRD 4.1** now lists the modalities actually used.
4. **Curriculum mapping has not reached JCIMED.** JCIMED offered on 2026-10-07 to add curriculum category, stage and codes; the spec shows only `procedure: {code, name}` (examples `EPA-01`, `DOPS-12`). Pack prepared 2026-10-23.
5. **Catch-up after downtime longer than 90 days** needs explicit `updated_before` slices or backfill.

### 5.3 Modality decision (Albert, 2026-10-23)
HKCA uses `CEX`, `CBD`, `DOPS`, `ALMAT`, `MSF`. `EPA` is reserved. **There will be no `PBA` or `ACR`.** The API's enum still lists them, so the ingester quarantines any assessment with a modality outside the six HKCA values rather than guessing.

### 5.4 Open questions for JCIMED (status)
| # | Question | Status |
|---|---|---|
| 1 | Curriculum codes: how will `CF-2.x` / `SM-3.x` / stage come back in responses? | **Sent 2026-10-23** with the CSV; awaiting reply |
| 2 | PBA and ACR | Closed: not used. Ask JCIMED only to confirm none will appear in HKCA data. |
| 3 | Can a college-supplied external ID (HKCA trainee number) be stored on the iWBA user and returned? | Sent 2026-10-23; awaiting reply |
| 4 | How are voided or deleted assessments signalled? (There is no tombstone.) | Sent 2026-10-23; awaiting reply |
| 5 | What does `unverified` mean? | Sent 2026-10-23; awaiting reply |
| 6 | When is backfill enabled on our token, and for how long? | Sent 2026-10-23; awaiting reply |
| 7 | Result ordering and `updated_at` ties while paging | Sent 2026-10-23; awaiting reply |
| 8 | MSF: one summary row per respondent or per assessment? | Sent 2026-10-23; awaiting reply |
