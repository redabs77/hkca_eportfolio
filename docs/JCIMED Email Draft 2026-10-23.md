---
type: draft_email
project: "[[HKCA Portfolio Revamp]]"
status: draft_not_sent
---

# Draft email to JCIMED / zlightinno (not sent)

**To:** JCIMED / zlightinno WBA development team
**Subject:** HKCA iWBA integration: curriculum mapping and questions after the 20 Oct API refresh
**Attach:** `HKCA iWBA Curriculum Items for JCIMED.csv`

Dear colleagues,

Thank you for the 20 October API update. The batch endpoint, the backfill summary and `iwba_user_id` are what we asked for, and we are building against them now.

**1. Curriculum mapping (attached CSV)**
The attached file lists every HKCA workplace-based assessment requirement: 53 rows, 63 assessments plus 3 multi-source feedback, by curriculum code (CF-2.1 to 2.7, SM-3.1 to 3.13, PFY, ECHO-WBA, MSF), modality, and the stage in which it is required (BAT, HAT, PFY, either, any, or by Exit Assessment). Two corrections to your current configuration: "Transducer set-up and troubleshooting" is CF-2.1, required once in Basic Training (BAT) only (not Higher Training x3); and CEX/CBD items are needed in every CF and SM domain, together with ALMAT and MSF, none of which exist yet.
Could you tell us how the code will come back in the API? Our preference is a new `curriculum_code` on each summary and detail item (for example `CF-2.1`), with `procedure.code` as a stable item code from the CSV. We work out the trainee's stage from the assessment date ourselves, unless iWBA already records it.

**2. Modalities**
HKCA uses CEX, CBD, DOPS, ALMAT and MSF only. EPA is reserved for later. We will not use PBA or ACR. Please confirm that no HKCA assessment will carry those two values.

**3. Linking people**
The API has no email, MCHK or college trainee number, so we will link each person to our records once, using `iwba_user_id`. Can iWBA store a college-supplied external ID (our trainee number) on each user and return it in the trainee and trainer objects? That would let us link automatically.

**4. Voided or deleted assessments**
How is an assessment that has been voided or deleted signalled? An assessment that simply stops appearing would be invisible to a polling client.

**5. Status `unverified`**
What exactly does `unverified` mean, and which states can it move to?

**6. Historical backfill**
When can backfill be enabled on our token, and for how long a window? We will need it once for the initial import before go-live. Please also confirm that regenerating the token keeps the window.

**7. Ordering and paging**
Are `summary` and `backfill/summary` results ordered by `updated_at` ascending, and can several records share the same `updated_at`? We plan to re-read a short overlap on each poll.

**8. Multi-source feedback**
Is an MSF one summary record per assessment, or one per respondent? Where do the individual respondents appear?

Thank you,
Dr Albert Chan
Chief of Service, Anaesthesia, Pain and Perioperative Medicine, Prince of Wales Hospital
