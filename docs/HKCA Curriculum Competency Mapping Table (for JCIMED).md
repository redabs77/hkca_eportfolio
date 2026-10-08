---
type: technical_spec
project: "[[HKCA Portfolio Revamp]]"
created: 2026-10-07
status: draft_pending_review
source_doc: "HKCA-E01 Anaesthesia Training Curriculum (Dec 2017) — Section 2/3 and Appendices 1 & 3, verified direct from source PDF"
recipient: JCIMED / zlightinno WBA development team
---

# HKCA Curriculum Competency Mapping Table — for JCIMED iWBA Integration

## Purpose
JCIMED's current iWBA "Curriculum Items" admin config (reviewed 2026-10-06, screenshot `upload_20261006_101256_1.jpg`)
has only 14 items, all modality `DOPS`, with at least one stage misallocation (Transducer setup marked HT-only).
This table gives JCIMED the authoritative HKCA-E01 **WBA** structure (CEX/CBD/DOPS/ALMAT/MSF counts per code/stage),
so they can tag every iWBA procedure correctly.

**Scope note: JCIMED only needs the WBA columns. VOP (case-count) minimums shown in this table are for HKCA's own
internal reference only** — VOP is tracked entirely within our own system (the `VolumeOfPractice` model), not in
iWBA. Do not ask JCIMED to build or validate VOP case-count tracking; it is out of scope for their system.

**Modality scope confirmed with Albert (2026-10-07): HKCA does not use `PBA` or `ACR`.** Despite JCIMED's reply
listing `PBA`/`ACR` as available enum values, the College's actual WBA toolset per HKCA-E01 Appendix 2/3 is only
**CEX, CBD, DOPS, ALMAT, MSF** today. `EPA` is **not currently used** by HKCA either, but the option should stay
open in iWBA's config and in our own schema for future adoption — do not remove it, just don't request EPA items
be built right now. Do not request or map any items to `PBA`/`ACR`.

**Cross-checked against the live legacy EPS requirement tree (2026-10-07):** all CF-2.x and SM-3.x WBA counts in
this table (CEX/CBD, DOPS sub-items, ALMAT) were verified against the actual legacy portfolio system's requirement
tree, not just the raw PDF text — 25 of 27 items matched exactly. Two corrections resulted: MSF is required 3×
(one per stage), not 1× college-wide (see §2); and a previously-missed "Echo Curriculum" DOPS ×1 requirement exists
outside the CF/SM taxonomy entirely (see §2). VOP case-count minimums were **not** visible in the legacy screenshots
cross-checked, so those remain verified only against the HKCA-E01 PDF directly.

---

## 1. Clinical Fundamentals (CF) — WBA & VOP minimums, explicit by stage

**Key: "BT" = Basic Training, "HT" = Higher Training. Where a count is listed only for one stage, it is not required
again at the other stage. "1 total, either BT or HT" means the requirement is satisfied once, in whichever stage
it happens — not once per stage.**

| Code | Domain | WBA required | VOP minimum |
|---|---|---|---|
| `CF-2.1` | General Anaesthesia and Sedation | CEX/CBD: BT 1, HT 1 · DOPS (US-guided CVC): BT 1 only · DOPS (Arterial cannulation): BT 1 only · DOPS (Transducer set-up & troubleshooting): **BT 1 only** | TIVA: BT 10, cumulative by HT exit 50 · MAC/Sedation: BT 10, cumulative 50 · Central venous cannulation: BT 10, cumulative 50 · Arterial cannulation: BT 10, cumulative 50 |
| `CF-2.2` | Regional Anaesthesia | CEX/CBD: BT 1, HT 1 · DOPS (Spinal): BT 1 only · DOPS (Epidural/CSE, non-obs): HT 1 only · DOPS (Peripheral plexus/nerve block): BT 1, HT 1 | Spinal blocks: BT 50, cumulative 100 · Epidural/CSE (non-obs): no BT minimum, cumulative by HT exit 15 · Major plexus/peripheral nerve block: no BT minimum, cumulative by HT exit 50 |
| `CF-2.3` | Airway Management | CEX/CBD: BT 1, HT 1 · DOPS (Elective airway BVM/LMA/ETT): BT 1 only · DOPS (RSI): BT 1 only · DOPS (Fibreoptic intubation): 1 total, either BT or HT · DOPS (Airway mgmt with C-spine instability): 1 total, either BT or HT · DOPS (Anaesthesia for tracheostomy): 1 total, either BT or HT | Supraglottic device insertion: BT 50, no separate HT-exit cumulative minimum · Direct laryngoscopy & intubation: BT 50, no separate HT-exit cumulative minimum · Video laryngoscopy & intubation: BT 10, cumulative 20 · Fibreoptic intubation: BT 3, cumulative 10 |
| `CF-2.4` | Acute Pain Management | CEX/CBD: BT 1, HT 1 (during acute pain round) · DOPS (Setting up PCA/postop analgesic infusion): BT 1 only | Postop IV PCA: BT 10, cumulative 80 · Postop central neuraxial analgesia: BT 5, cumulative 20 · Any acute pain modality (post-CS obstetric): no BT minimum, cumulative by HT exit 20 |
| `CF-2.5` | Perioperative Medicine | CEX/CBD: BT 1, HT 1 | No minimum VOP in this section |
| `CF-2.6` | Trauma, Crisis Management and Resuscitation | CEX/CBD: BT 1, HT 1 | No minimum VOP in this section |
| `CF-2.7` | Safety and Quality in Anaesthesia | CEX/CBD: BT 1, HT 1 · DOPS (Checking anaesthesia machine & breathing system): BT 1 only · DOPS (Care of patient prone position): 1 total, either BT or HT | No minimum VOP in this section |

**Confirmed correction for JCIMED:** "Transducer set up and problem solving" is a `CF-2.1` (General Anaesthesia and
Sedation) DOPS item, required **once during Basic Training only** (not HT-mandatory ×3 as currently configured).
Source: HKCA-E01 Appendix 3, §2.1.

---

## 2. Specialty Modules (SM) — WBA & VOP minimums (by Exit Assessment)

| Code | Domain | MVP Status | WBA required | VOP minimum |
|---|---|---|---|---|
| `SM-3.1` | General Surgery / Urology / Gynaecology / Endoscopic Procedures | MVP | CEX/CBD: 2 | Elective cases 100 · Emergency cases 100 |
| `SM-3.2` | Head & Neck / ENT Procedures | MVP | CEX/CBD: 2 | Airway surgery* 30 · H&N/ENT (not otherwise specified) 30 |
| `SM-3.3` | Orthopaedic Surgery | MVP | CEX/CBD: 2 | Hip fracture 30 · Major joint replacement 20 · Cervical spine surgery 5 · Other orthopaedic 100 |
| `SM-3.4` | Paediatric Anaesthesia | MVP | CEX/CBD: 2 · DOPS (Elective airway mgmt, paediatric): 1 · DOPS (Inhalational induction): 1 · DOPS (Caudal/penile/ilioinguinal block): 1 | Age ≤8 years: 100 |
| `SM-3.5` | Obstetric Anaesthesia and Analgesia | MVP | CEX/CBD: 2 · DOPS (Epidural insertion): 1 | Caesarean section under GA 10 · Under regional 50 · Labour epidural 30 |
| `SM-3.6` | Neuroanaesthesia | MVP | CEX/CBD: 2 | Interventional neuro-radiological procedures 5 · Neurosurgical procedures 50 |
| `SM-3.7` | Ophthalmic Anaesthesia | MVP | CEX/CBD: 2 | Ophthalmic surgery 20 |
| `SM-3.8` | Anaesthesia Outside Operating Theatre | MVP | CEX/CBD: 2 | 20 |
| `SM-3.9` | Cardiac Surgery and Interventional Cardiology | MVP | CEX/CBD: 2 | Cardiac surgery with CPB 10 · Other cardiac/interventional cardiology 10 |
| `SM-3.10` | Thoracic Surgery | MVP | CEX/CBD: 2 · DOPS (Lung isolation/one-lung ventilation): 1 | 30 |
| `SM-3.11` | Vascular Surgery | MVP | CEX/CBD: 2 | 20 |
| `SM-3.12` | Pain Medicine | **Phase 2 placeholder** | CEX/CBD: 2 | Pain consultations 20 · MDT case conference 1 · Pain intervention procedures 5 — *not built in MVP per standing scope directive* |
| `SM-3.13` | Intensive Care Medicine | **Phase 2 placeholder (curriculum module only — ICU rotation tracking is MVP)** | CEX/CBD: 2 | No case-load minimum; minimum 6-month ICU attachment (up to 2 weeks normal leave included) — *ICU rotation duration tracking is MVP; CEX/CBD/ICM curriculum module itself is deferred* |

*Airway surgery = tonsillectomy, adenoidectomy, laser airway surgery, microlaryngoscopy, FB removal, tracheostomy, rigid bronchoscopy, panendoscopy, FESS, OSA surgery.

### Provisional Fellowship Year
- CEX/CBD: 1 · **ALMAT: 1**

### Multi-Source Feedback (MSF)
- **3 MSF required total — one per stage: Basic Training ×1, Higher Training ×1, Provisional Fellowship Year ×1.** (Corrected 2026-10-07 after cross-check against the live legacy EPS requirement tree — not 1 college-wide as earlier drafted.)

### Echo Curriculum (new item — confirmed separate from the HKCA-FTTE mandatory course)
- **Echo Curriculum — DOPS ×1 (TTE — Transthoracic Echocardiography).** Found only in the legacy EPS live requirement tree (top-level node, outside the CF-2.x/SM-3.x taxonomy), not itemized in HKCA-E01 Appendix 3 as read directly from the PDF. Confirmed with Albert (2026-10-07): this is a **separate graded WBA/DOPS assessment**, distinct from the `HKCA-FTTE (Echo)` mandatory course certificate tracked elsewhere in this project. **Stage: can be done at any training stage (BT, HT, or PFY) — not stage-locked.** Modality/procedure confirmed as TTE, not TOE.

---

## 3. WBA Modality List (confirmed, final)

| Modality | Full name | Confirmed in use |
|---|---|---|
| `CEX` | Clinical Evaluation Exercise | Yes — every CF/SM domain |
| `CBD` | Case-Based Discussion | Yes — interchangeable with CEX per domain ("CEX/CBD") |
| `DOPS` | Direct Observation of Procedural Skills | Yes — discrete procedures, see tables above |
| `ALMAT` | Anaesthesia List Management Assessment Tool | Yes — PFY only (×1) |
| `EPA` | Entrustable Professional Activity | **Not currently used by HKCA** — HKCA-E01 does not itemize EPA requirements in Appendix 3 (CEX/CBD/DOPS/ALMAT only). Reserved in the modality enum for possible future adoption; do not ask JCIMED to build EPA curriculum items yet. |
| `MSF` | Multi-Source Feedback | Yes — 1 required College-wide |

**`PBA` and `ACR` are explicitly excluded** — not part of the HKCA WBA toolset. Do not configure iWBA items against
these modalities for HKCA trainees.

---

## 4. Corrections to Send JCIMED
1. **Modality gap:** Only DOPS items exist in iWBA. HKCA requires CEX/CBD in every single CF (2.1–2.7) and SM (3.1–3.13) domain, plus ALMAT (PFY) and MSF (×3, one per stage — BT/HT/PFY) — none of these exist in iWBA yet.
2. **Stage correction:** "Transducer set up and problem solving" is `CF-2.1`, Basic Training only (×1), not HT-mandatory ×3.
3. **Coding scheme:** Replace free-text procedure labels with the `CF-2.x` / `SM-3.x` codes above; each code should carry its own BT/HT (or Exit Assessment, for SM) **WBA** minimum count so the API can report fulfilment, not just raw case counts. (VOP case-count minimums are HKCA's internal concern — not part of this ask.)
4. **Missing domains entirely:** No items yet exist for `CF-2.6` (Trauma/Crisis/Resuscitation) or `CF-2.7` beyond the "checking anaesthesia machine" DOPS — both need CEX/CBD items added regardless of modality gaps elsewhere.
5. **Do not add `PBA`/`ACR` mappings** — confirmed out of scope for HKCA (2026-10-07).
6. **New item: Echo Curriculum** — add a `DOPS` item (TTE, any training stage) requiring ×1. Not part of the existing CF-2.x/SM-3.x taxonomy; needs its own standalone curriculum item in iWBA, same as it appears in the legacy EPS system.

---

## 5. Open Items Before This Goes to JCIMED
- [x] EPA confirmed not currently in use by HKCA (2026-10-07, Albert) — kept as a reserved modality for future use, not sent to JCIMED as an active requirement.
- [x] VOP/WBA minimums cross-checked directly against HKCA-E01 Appendix 1 & Appendix 3 (2026-10-07).
- [x] PBA/ACR confirmed excluded from HKCA's WBA toolset (2026-10-07, Albert).
- [x] WBA counts (CEX/CBD/DOPS/ALMAT) cross-checked against the live legacy EPS requirement tree (2026-10-07) — MSF corrected to 3× (one per stage); Echo Curriculum DOPS ×1 added as a confirmed-separate item.
- [x] Echo Curriculum confirmed (2026-10-07, Albert): TTE, any training stage (not stage-locked).
- [ ] Get Albert's final sign-off on wording before sending to JCIMED.

---

## 6. Third-Party Corroboration (reference only, not authoritative)
["WBA Guidance for UCH Trainees"](<WBA Guidance for UCH Trainees (J Yau, Apr 2026).pdf>) (Dr. J Yau, UCH, Apr 2026) — a colleague-authored informal guide, shared by Albert 2026-10-07 as "guidance, not mandatory, but a good reference for their milestones." Independently confirms this table's structure: 66 total WBAs, identical CF-2.x/SM-3.x counts, and the same standalone "ECHO curriculum — DOPS ×1" item (matches the legacy EPS finding in §2 above). **Does not mention MSF.**

**New asset not captured elsewhere in this project:** a suggested year-by-year pacing curve (BT Year 1 → BT Year 2 → BT Year 3 → HT Year 4 → HT Year 5 → PFY Year 6) recommending which WBA to attempt in which year, so trainees don't cluster them near stage-gates. Explicitly non-mandatory. Potential future use: a benchmark pacing curve for the Progression Risk "Velocity" signal in the SOT Console prototype, replacing the current placeholder 10% schedule-margin default — not actioned yet, flagged for later discussion.
