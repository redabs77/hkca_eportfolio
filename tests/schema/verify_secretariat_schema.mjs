// Verifies migration 5 (Secretariat console: courses, exams, formal projects, recognition) on real Postgres (PGlite):
//  A. upgrade path: migrations 0-4 + seed + rows that the migration must carry over, then migration 5
//  B. destructive-step guards (ProjectStatus ESCALATED, CourseDecision DEFERRED)
//  C. enums
//  D. one real flow per new table or rule (unique, check, cascade, append-only) and an orphan sweep
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS  " + m); } else { fail++; console.log("  FAIL  " + m); } };
const rejects = async (fn, m, re) => {
  try { await fn(); fail++; console.log("  FAIL  " + m + " (was accepted)"); }
  catch (e) { const good = !re || re.test(String(e.message)); good ? pass++ : fail++; console.log((good ? "  PASS  " : "  FAIL  ") + m + (good ? "" : " (wrong error: " + String(e.message).slice(0, 90) + ")")); }
};
const dirs = fs.readdirSync("db/migrations").filter(d => /^\d+_/.test(d)).sort((a, b) => parseInt(a) - parseInt(b));
const mig = d => fs.readFileSync(`db/migrations/${d}/migration.sql`, "utf-8");
const m5 = dirs.find(d => d.startsWith("5_"));
const seed = JSON.parse(fs.readFileSync("db/seeds/synthetic_seed.json", "utf-8"));
const ORDER = ["Cluster","Hospital","HospitalClusterHistory","AccreditedCentre","CurriculumEdition","CurriculumRule","CurriculumDescriptor","AssessmentTool","User","TrainerProfile","TraineeProfile","Rotation","ItaSession","ItaAssessorResponse","ItaAppeal","RemedialPlan","AccreditedTimeLedger","VolumeOfPractice","CaseBlock","WbaAssessment","AuditLog"];

async function load(pg) {
  for (const t of ORDER) for (const row of (seed[t] || [])) {
    const k = Object.keys(row);
    await pg.query(`INSERT INTO "${t}" (${k.map(x => `"${x}"`).join(",")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(",")})`,
      k.map(x => (row[x] !== null && typeof row[x] === "object" && !Array.isArray(row[x])) ? JSON.stringify(row[x]) : row[x]));
  }
}
const count = async (pg, t) => Number((await pg.query(`SELECT count(*)::int n FROM "${t}"`)).rows[0].n);
const enumVals = async (pg, n) => (await pg.query(`SELECT e.enumlabel l FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname=$1 ORDER BY e.enumsortorder`, [n])).rows.map(r => r.l);
const has = async (pg, n) => (await pg.query(`SELECT count(*)::int n FROM pg_type WHERE typname=$1`, [n])).rows[0].n > 0;
const U = pg => async (sql, p = []) => (await pg.query(sql, p)).rows;

console.log("A. Upgrade path (0..4 + seed + rows to carry over, then migration 5)");
const pg = new PGlite();
for (const d of dirs.filter(d => parseInt(d) < 5)) await pg.exec(mig(d));
await load(pg);
let q = U(pg);
const trainees = await q(`SELECT id, "userId", "parentHospitalId" FROM "TraineeProfile" ORDER BY "hkcaNumber"`);
const users = await q(`SELECT id FROM "User" ORDER BY id`);
const hosp = await q(`SELECT id FROM "Hospital" ORDER BY id`);
const [T1, T2, T3] = trainees, U1 = users[0].id, U2 = users[1].id, U3 = users[2].id, H1 = hosp[0].id;

// rows written under the old shape
await q(`INSERT INTO "ExamApplication" (id,"traineeId","examType","examDate",result,score) VALUES (gen_random_uuid()::text,$1,'INTERMEDIATE','2025-04-10','FAIL',41.5)`, [T1.id]);
await q(`INSERT INTO "ExamApplication" (id,"traineeId","examType","examDate",result,score) VALUES (gen_random_uuid()::text,$1,'INTERMEDIATE','2025-10-09','PASS',62)`, [T1.id]);
await q(`INSERT INTO "ExamApplication" (id,"traineeId","examType","examDate") VALUES (gen_random_uuid()::text,$1,'FINAL_ANAESTHESIA','2026-05-14')`, [T1.id]);
const pid0 = (await q(`INSERT INTO "FormalProject" (id,"traineeId","projectType",title,status) VALUES (gen_random_uuid()::text,$1,'QIP','Old project','UNDER_REVIEW') RETURNING id`, [T2.id]))[0].id;
for (const g of ["SATISFACTORY", "MINOR_REVISION", "MAJOR_REVISION", "UNSATISFACTORY"])
  await q(`INSERT INTO "FormalProjectReview" (id,"projectId",stage,"reviewerId","assignedAt","dueAt",grade) VALUES (gen_random_uuid()::text,$1,'protocol',$2,now(),'2026-11-23',$3)`, [pid0, U1, g]);
await q(`INSERT INTO "FormalProjectReview" (id,"projectId",stage,"reviewerId","assignedAt","dueAt") VALUES (gen_random_uuid()::text,$1,'manuscript',$2,now(),'2026-12-23')`, [pid0, U1]);
await q(`INSERT INTO "RetrospectiveRecognition" (id,"traineeId","applicationType","boardDecisionDate") VALUES (gen_random_uuid()::text,$1,'overseas_training','2026-09-30')`, [T3.id]);
await q(`INSERT INTO "AccreditedTimeLedger" (id,"traineeId","periodStart","periodEnd","calendarMonthsCredited",category,"decisionReason","authorityId","authorityRole","boardDecisionDate") VALUES (gen_random_uuid()::text,$1,'2025-01-01','2025-12-31',12,'CLINICAL_ANAESTHESIA','RETROSPECTIVE_OVERSEAS_RECOGNITION',$2,'COLLEGE_ADMIN','2026-10-20')`, [T3.id, U2]);
await q(`INSERT INTO "CourseCatalogue" ("courseCode","courseName","isMandatory") VALUES ('EASE','Exposure to Anaesthetic Safety & Emergencies',true)`);
const rid0 = (await q(`INSERT INTO "CourseRound" (id,"courseCode","roundDate",seats) VALUES (gen_random_uuid()::text,'EASE','2026-11-14',12) RETURNING id`))[0].id;
await q(`INSERT INTO "CourseRequest" (id,"roundId","traineeId","requestedAt",decision) VALUES (gen_random_uuid()::text,$1,$2,now(),'WAITLISTED')`, [rid0, T1.id]);
await q(`INSERT INTO "VopCreditAdjustment" (id,"traineeId",cases,reason,"boardDecisionDate") VALUES (gen_random_uuid()::text,$1,40,'RETROSPECTIVE_SPECIALTY_TRANSFER','2026-09-30')`, [T3.id]);

const before = {};
for (const t of ORDER) before[t] = await count(pg, t);
const tablesBefore = (await q(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`))[0].n;
await pg.exec(mig(m5));
for (const t of ORDER) ok(await count(pg, t) === before[t], `${t}: ${before[t]} rows preserved`);
const tablesAfter = (await q(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`))[0].n;
ok(tablesAfter - tablesBefore === 10, `10 new tables (${tablesBefore} -> ${tablesAfter})`);
ok(await count(pg, "ExamApplication") === 3, "the three old exam applications are still there");
const er = await q(`SELECT "attemptNumber" a, result, score::text s, "applicationId" FROM "ExamResult" ORDER BY "attemptNumber"`);
ok(er.length === 2 && er[0].a === 1 && er[0].result === "FAIL" && er[1].a === 2 && er[1].result === "PASS" && er[1].s === "62.00", "results moved to ExamResult as attempt 1 (fail) and attempt 2 (pass), score kept");
ok(er.every(r => r.applicationId), "each moved result still points at its application");
const map = Object.fromEntries((await q(`SELECT recommendation r, count(*)::int n FROM "FormalProjectReview" WHERE "projectId"=$1 AND stage='protocol' GROUP BY 1`, [pid0])).map(r => [r.r, r.n]));
ok(map.APPROVED === 1 && map.REVISION === 2 && map.REJECTED === 1, "four old grades map to Approved 1, Revision 2, Rejected 1");
ok((await q(`SELECT recommendation FROM "FormalProjectReview" WHERE stage='manuscript'`))[0].recommendation === null, "a review with no grade stays without a recommendation");
ok(!(await has(pg, "ReviewGrade")), "the four-grade type is gone");
ok((await q(`SELECT "decisionDate"::text d FROM "RetrospectiveRecognition"`))[0].d === "2026-09-30", "recognition keeps its decision date after the rename");
ok((await q(`SELECT "decisionDate"::text d, "decidedByBody" b FROM "AccreditedTimeLedger" WHERE "decisionReason"='RETROSPECTIVE_OVERSEAS_RECOGNITION'`))[0].d === "2026-10-20", "ledger keeps its decision date after the rename");
ok((await q(`SELECT "decisionDate"::text d FROM "VopCreditAdjustment"`))[0].d === "2026-09-30", "case credit keeps its decision date after the rename");
ok((await q(`SELECT decision FROM "CourseRequest"`))[0].decision === "WAITLISTED", "an existing waitlisted request survives the enum rewrite");
const rr0 = (await q(`SELECT seats, "rankingMode" m, "feeMember" f FROM "CourseRound"`))[0];
ok(rr0.seats === 12 && rr0.m === "priority" && rr0.f === null, "an existing round keeps its seats, defaults to priority ranking, fee not set");

console.log("\nB. Destructive-step guards");
for (const [what, sqlSeed, re] of [
  ["a project is still ESCALATED", `UPDATE "FormalProject" SET status='ESCALATED' WHERE id=$1`, /ESCALATED is still in use/],
  ["a course request is still DEFERRED", `UPDATE "CourseRequest" SET decision='DEFERRED'`, /DEFERRED is still in use/]]) {
  const g = new PGlite();
  for (const d of dirs.filter(d => parseInt(d) < 5)) await g.exec(mig(d));
  await load(g);
  const gq = U(g);
  const gt = (await gq(`SELECT id FROM "TraineeProfile" LIMIT 1`))[0].id;
  const gp = (await gq(`INSERT INTO "FormalProject" (id,"traineeId","projectType",title) VALUES (gen_random_uuid()::text,$1,'QIP','x') RETURNING id`, [gt]))[0].id;
  await gq(`INSERT INTO "CourseCatalogue" ("courseCode","courseName") VALUES ('X','X')`);
  const gr = (await gq(`INSERT INTO "CourseRound" (id,"courseCode","roundDate",seats) VALUES (gen_random_uuid()::text,'X','2026-11-14',1) RETURNING id`))[0].id;
  await gq(`INSERT INTO "CourseRequest" (id,"roundId","traineeId","requestedAt") VALUES (gen_random_uuid()::text,$1,$2,now())`, [gr, gt]);
  await gq(sqlSeed, sqlSeed.includes("$1") ? [gp] : []);
  await rejects(() => g.exec(mig(m5)), `migration refuses to run while ${what}`, re);
}

console.log("\nC. Enums");
ok(JSON.stringify(await enumVals(pg, "ProjectStatus")) === JSON.stringify(["PROTOCOL_DRAFT","PROTOCOL_SUBMITTED","UNDER_REVIEW","REVISION_REQUIRED","MANUSCRIPT_SUBMITTED","APPROVED","REJECTED","APPEAL"]), "ProjectStatus has APPEAL and no ESCALATED");
ok(JSON.stringify(await enumVals(pg, "CourseDecision")) === JSON.stringify(["REQUESTED","ACCEPTED","WAITLISTED","REJECTED"]), "CourseDecision is requested, accepted, waitlisted, rejected");
ok(JSON.stringify(await enumVals(pg, "ReviewRecommendation")) === JSON.stringify(["APPROVED","REVISION","REJECTED"]), "ReviewRecommendation is approved, revision, rejected");
const rs = await enumVals(pg, "RecognitionStatus");
ok(["WITH_TRAINING_OFFICER","REFERRED_TO_BOARD","APPROVED_PENDING_CREDIT"].every(v => rs.includes(v)) && rs.length === 8, "RecognitionStatus has the Training Officer, Board and credit-to-execute steps");
ok(JSON.stringify(await enumVals(pg, "DecisionBody")) === JSON.stringify(["TRAINING_OFFICER","BOARD"]), "DecisionBody is Training Officer or Board");
ok(JSON.stringify(await enumVals(pg, "ProjectStageState")) === JSON.stringify(["AWAITING_REVIEWERS","UNDER_REVIEW","REVIEWS_IN","REVISION","APPEAL","APPROVED","REJECTED"]), "ProjectStageState has the seven stage states");

console.log("\nD. Flows");
q = U(pg);
const MAND = "EMAC";
await q(`INSERT INTO "CourseCatalogue" ("courseCode","courseName","isMandatory",organiser) VALUES ('IMV','Intermediate Examination Mock Viva',false,'HKCA')`);
// courses
const rid = (await q(`INSERT INTO "CourseRound" (id,"courseCode","roundDate","endDate",seats,venue,format,"feeMember","feeNonMember","registrationOpens","registrationCloses","coordinators") VALUES (gen_random_uuid()::text,'IMV','2026-12-12',NULL,NULL,'PACU, 4/F, Block D, Queen Elizabeth Hospital','Face-to-face',1500,1500,'2026-10-01','2026-11-25','Dr TAM') RETURNING id`))[0].id;
ok((await q(`SELECT seats FROM "CourseRound" WHERE id=$1`, [rid]))[0].seats === null, "a round can have no seat cap (Mock Viva)");
const rid2 = (await q(`INSERT INTO "CourseRound" (id,"courseCode","roundDate",seats,"feeMember","feeNonMember","rankingMode") VALUES (gen_random_uuid()::text,'EASE','2027-02-14',12,0,0,'fcfs') RETURNING id`))[0].id;
ok((await q(`SELECT "feeMember" a, "feeNonMember" b FROM "CourseRound" WHERE id=$1`, [rid2]))[0].a === 0, "fee 0 is stored as No charge, distinct from a fee not yet set (null)");
await rejects(() => q(`INSERT INTO "CourseRound" (id,"courseCode","roundDate",seats,"rankingMode") VALUES (gen_random_uuid()::text,'EASE','2027-03-14',12,'random')`), "ranking is priority or first come first served only", /CourseRound_ranking_chk/);
await rejects(() => q(`INSERT INTO "CourseRound" (id,"courseCode","roundDate","registrationOpens","registrationCloses") VALUES (gen_random_uuid()::text,'EASE','2027-03-14','2026-12-01','2026-11-01')`), "registration cannot close before it opens", /CourseRound_dates_chk/);
await rejects(() => q(`INSERT INTO "CourseRequest" (id,"roundId","traineeId","requestedAt",decision) VALUES (gen_random_uuid()::text,$1,$2,now(),'DEFERRED')`, [rid, T1.id]), "Deferred is no longer a decision", /invalid input value/i);
await q(`INSERT INTO "CourseRequest" (id,"roundId","traineeId","requestedAt",decision,"decidedById","decidedAt") VALUES (gen_random_uuid()::text,$1,$2,now(),'REJECTED',$3,now())`, [rid, T1.id, U2]);
await q(`INSERT INTO "CourseRequest" (id,"roundId","traineeId","requestedAt") VALUES (gen_random_uuid()::text,$1,$2,now())`, [rid, T2.id]);
await q(`UPDATE "CourseRequest" SET "withdrawnAt"=now() WHERE "roundId"=$1 AND "traineeId"=$2`, [rid, T2.id]);
ok((await q(`SELECT count(*)::int n FROM "CourseRequest" WHERE "roundId"=$1 AND "withdrawnAt" IS NULL`, [rid]))[0].n === 1, "a withdrawn request drops out of the live applicant count");
await q(`INSERT INTO "CourseAttendance" (id,"roundId","traineeId","ratePercent","certificateIssued") VALUES (gen_random_uuid()::text,$1,$2,100,true)`, [rid2, T1.id]);
await q(`INSERT INTO "CourseAttendance" (id,"roundId","traineeId","ratePercent") VALUES (gen_random_uuid()::text,$1,$2,40)`, [rid2, T2.id]);
await rejects(() => q(`INSERT INTO "CourseAttendance" (id,"roundId","traineeId","ratePercent") VALUES (gen_random_uuid()::text,$1,$2,100)`, [rid2, T1.id]), "attendance is recorded once per trainee and round", /unique|duplicate/i);
await rejects(() => q(`INSERT INTO "CourseAttendance" (id,"roundId","traineeId","ratePercent") VALUES (gen_random_uuid()::text,$1,$2,120)`, [rid2, T3.id]), "an attendance rate above 100 is refused", /CourseAttendance_rate_chk/);
await q(`INSERT INTO "CourseNotice" (id,"roundId","traineeId","ratePercent") VALUES (gen_random_uuid()::text,$1,$2,40)`, [rid2, T2.id]);
await rejects(() => q(`INSERT INTO "CourseNotice" (id,"roundId","traineeId","ratePercent") VALUES (gen_random_uuid()::text,$1,$2,40)`, [rid2, T2.id]), "one under-50% notice per trainee and round", /unique|duplicate/i);
ok((await q(`SELECT count(*)::int n FROM "CourseAttendance" WHERE "roundId"=$1 AND "ratePercent"<50`, [rid2]))[0].n === (await q(`SELECT count(*)::int n FROM "CourseNotice" WHERE "roundId"=$1`, [rid2]))[0].n, "every attendance under 50% has its notice");

// exams
const sid = (await q(`INSERT INTO "ExamSitting" (id,"examType",name,"opensOn","closesOn","writtenOn","oralOn","oralEndOn","feeHkd") VALUES (gen_random_uuid()::text,'INTERMEDIATE','Feb / Apr 2027','2026-10-05','2027-01-08','2027-02-19','2027-04-09','2027-04-10',8000) RETURNING id`))[0].id;
await rejects(() => q(`INSERT INTO "ExamSitting" (id,"examType",name,"opensOn","closesOn","writtenOn","feeHkd") VALUES (gen_random_uuid()::text,'INTERMEDIATE','Bad','2026-10-05','2027-03-01','2027-02-19',8000)`), "applications must close before the written paper", /ExamSitting_dates_chk/);
const aid = (await q(`INSERT INTO "ExamApplication" (id,"traineeId","examType","examDate","sittingId","sectionsToSit","sotApprovalStatus","sotApprovedAt","sotApprovedById","feeReceivedAt","feeMethod","feeReference") VALUES (gen_random_uuid()::text,$1,'INTERMEDIATE','2027-02-19',$2,ARRAY['PHARMACOLOGY'],'APPROVED',now(),$3,'2026-10-16','Faster Payment System','FPS 2026101688124') RETURNING id`, [T2.id, sid, U3]))[0].id;
ok((await q(`SELECT "sectionsToSit" s FROM "ExamApplication" WHERE id=$1`, [aid]))[0].s.join() === "PHARMACOLOGY", "the application keeps the sections the trainee sits (carry-forward snapshot)");
await rejects(() => q(`INSERT INTO "ExamApplication" (id,"traineeId","examType","examDate","sittingId") VALUES (gen_random_uuid()::text,$1,'INTERMEDIATE','2027-02-19',$2)`, [T2.id, sid]), "one application per trainee and sitting", /unique|duplicate/i);
await q(`INSERT INTO "ExamApplication" (id,"traineeId","examType","examDate","sittingId","sotApprovalStatus","sotDeclineReason") VALUES (gen_random_uuid()::text,$1,'INTERMEDIATE','2027-02-19',$2,'REJECTED','Not yet at the required stage')`, [T3.id, sid]);
ok((await q(`SELECT count(*)::int n FROM "ExamApplication" WHERE "sittingId"=$1 AND "sotApprovalStatus"='APPROVED'`, [sid]))[0].n === 1, "only the endorsed application is visible to Admin (query rule)");
await q(`INSERT INTO "ExamResult" (id,"traineeId","examType","sittingId","applicationId","examDate","attemptNumber",result,physiology,pharmacology,"minimumMet") VALUES (gen_random_uuid()::text,$1,'INTERMEDIATE',$2,$3,'2027-04-09',1,'FAIL','PASS','FAIL',true)`, [T2.id, sid, aid]);
await rejects(() => q(`INSERT INTO "ExamResult" (id,"traineeId","examType","examDate","attemptNumber",result) VALUES (gen_random_uuid()::text,$1,'INTERMEDIATE','2027-09-10',1,'PASS')`, [T2.id]), "one result per trainee, exam and attempt", /unique|duplicate/i);
await q(`INSERT INTO "ExamSectionPass" (id,"traineeId","examType",section,"passedOn","passedSittingId") VALUES (gen_random_uuid()::text,$1,'INTERMEDIATE','PHYSIOLOGY','2027-04-09',$2)`, [T2.id, sid]);
ok((await q(`SELECT "sittingsLeft" n FROM "ExamSectionPass"`))[0].n === 4, "a carried-forward pass starts with four sittings left");
await rejects(() => q(`INSERT INTO "ExamSectionPass" (id,"traineeId","examType",section,"passedOn") VALUES (gen_random_uuid()::text,$1,'INTERMEDIATE','PHARMACOLOGY','2027-04-09')`, [T2.id]), "only one carried-forward pass can be active per trainee and exam", /ExamSectionPass_one_active|unique|duplicate/i);
await rejects(() => q(`UPDATE "ExamSectionPass" SET "sittingsLeft"=5`), "sittings left cannot exceed four", /ExamSectionPass_left_chk/);
await q(`UPDATE "ExamSectionPass" SET "isActive"=false,"sittingsLeft"=0 WHERE "traineeId"=$1`, [T2.id]);
await q(`INSERT INTO "ExamSectionPass" (id,"traineeId","examType",section,"passedOn") VALUES (gen_random_uuid()::text,$1,'INTERMEDIATE','PHARMACOLOGY','2027-09-10')`, [T2.id]);
ok((await q(`SELECT count(*)::int n FROM "ExamSectionPass" WHERE "traineeId"=$1 AND "isActive"`, [T2.id]))[0].n === 1, "once a pass is used up a new one can be active");
await q(`INSERT INTO "TraineeFeePayment" (id,"traineeId","feeType","paidOn",reference,"recordedById") VALUES (gen_random_uuid()::text,$1,'REGISTRATION','2026-01-15','Receipt 2026-0114',$2)`, [T1.id, U2]);
await rejects(() => q(`INSERT INTO "TraineeFeePayment" (id,"traineeId","feeType","paidOn") VALUES (gen_random_uuid()::text,$1,'LUNCH','2026-01-15')`, [T1.id]), "fee type is registration or training", /TraineeFeePayment_type_chk/);
await q(`UPDATE "TraineeFeePayment" SET "voidedAt"=now()`);
ok((await q(`SELECT count(*)::int n FROM "TraineeFeePayment" WHERE "voidedAt" IS NULL`))[0].n === 0, "a wrongly recorded payment is voided and the row is kept");
await q(`INSERT INTO "TraineeExemption" (id,"traineeId",kind,"grantedOn",reference,"recordedById") VALUES (gen_random_uuid()::text,$1,'FRCA_PRIMARY','2026-06-01','Board 2026-06',$2)`, [T3.id, U2]);
await rejects(() => q(`INSERT INTO "TraineeExemption" (id,"traineeId",kind,"grantedOn") VALUES (gen_random_uuid()::text,$1,'ANZCA_PRIMARY','2026-06-02')`, [T3.id]), "one Intermediate exemption per trainee", /unique|duplicate/i);
await rejects(() => q(`INSERT INTO "TraineeExemption" (id,"traineeId",kind,"grantedOn",\"examType\") VALUES (gen_random_uuid()::text,$1,'MADE_UP','2026-06-02','FINAL_ANAESTHESIA')`, [T3.id]), "exemption kind must be ANZCA primary, FRCA primary or Board decision", /TraineeExemption_kind_chk/);

// formal projects
const pid = (await q(`INSERT INTO "FormalProject" (id,"traineeId","projectType",title,status,"projectNumber") VALUES (gen_random_uuid()::text,$1,'QIP','Handover tool','UNDER_REVIEW','FP-26-021') RETURNING id`, [T1.id]))[0].id;
await q(`INSERT INTO "FormalProjectStage" (id,"projectId",stage,state,"dispatchedAt","dueAt") VALUES (gen_random_uuid()::text,$1,'protocol','UNDER_REVIEW','2026-09-01','2026-11-01')`, [pid]);
await rejects(() => q(`INSERT INTO "FormalProjectStage" (id,"projectId",stage) VALUES (gen_random_uuid()::text,$1,'protocol')`, [pid]), "one protocol part and one manuscript part per project", /unique|duplicate/i);
await q(`INSERT INTO "FormalProjectStage" (id,"projectId",stage) VALUES (gen_random_uuid()::text,$1,'manuscript')`, [pid]);
await q(`UPDATE "FormalProjectStage" SET state='REJECTED',decision='REJECTED',"decidedOn"='2026-11-02' WHERE "projectId"=$1 AND stage='protocol'`, [pid]);
await q(`UPDATE "FormalProjectStage" SET state='APPEAL',"appealedOn"=now() WHERE "projectId"=$1 AND stage='protocol'`, [pid]);
await q(`UPDATE "FormalProject" SET status='APPEAL' WHERE id=$1`, [pid]);
ok((await q(`SELECT state FROM "FormalProjectStage" WHERE "projectId"=$1 AND stage='protocol'`, [pid]))[0].state === "APPEAL", "a rejected protocol can go to appeal");
await rejects(() => q(`UPDATE "FormalProjectStage" SET decision='EXCELLENT' WHERE "projectId"=$1`, [pid]), "an outcome outside Approved, Revision, Rejected is refused", /invalid input value/i);
const rv = (await q(`INSERT INTO "FormalProjectReview" (id,"projectId",stage,"reviewerId","assignedAt","dueAt") VALUES (gen_random_uuid()::text,$1,'protocol',$2,'2026-09-01','2026-11-01') RETURNING id`, [pid, U1]))[0].id;
await rejects(() => q(`UPDATE "FormalProjectReview" SET "byTeam"=true,recommendation='APPROVED' WHERE id=$1`, [rv]), "a Team review needs a hand-over date first", /FormalProjectReview_team_chk/);
await q(`UPDATE "FormalProjectReview" SET "handedToTeamAt"=now() WHERE id=$1`, [rv]);
await q(`UPDATE "FormalProjectReview" SET "byTeam"=true,recommendation='REVISION',"submittedAt"=now() WHERE id=$1`, [rv]);
ok((await q(`SELECT "byTeam" b, "reviewerId" r FROM "FormalProjectReview" WHERE id=$1`, [rv]))[0].r === U1, "the Team review sits on the same row; the original reviewer stays on record");
await rejects(() => q(`UPDATE "FormalProjectReview" SET "lateOverrideById"=$2 WHERE id=$1`, [rv, U2]), "a late-report override needs a reason", /FormalProjectReview_override_chk/);
await q(`UPDATE "FormalProjectReview" SET "lateOverrideById"=$2,"lateOverrideReason"='Bereavement; report received 3 days late' WHERE id=$1`, [rv, U2]);
await q(`INSERT INTO "FormalProjectReview" (id,"projectId",stage,"reviewerId","assignedAt","dueAt","reassignReason") VALUES (gen_random_uuid()::text,$1,'protocol',$2,now(),'2027-01-20','No response after two reminders')`, [pid, U3]);
ok((await q(`SELECT count(*)::int n FROM "FormalProjectReview" WHERE "projectId"=$1 AND "reassignReason" IS NOT NULL`, [pid]))[0].n === 1, "a reassignment is a new row carrying its reason");
await q(`INSERT INTO "FormalProjectEvent" (id,"projectId",\"eventType\",\"eventDate\",source,visibility) VALUES (gen_random_uuid()::text,$1,'reminder_sent','2026-10-18','admin','internal')`, [pid]);
await q(`INSERT INTO "FormalProjectEvent" (id,"projectId",\"eventType\",\"eventDate\",source,\"outcomeNote\") VALUES (gen_random_uuid()::text,$1,'revision_requested','2026-11-02','admin','Revision and resubmission')`, [pid]);
ok((await q(`SELECT count(*)::int n FROM "FormalProjectEvent" WHERE "projectId"=$1 AND visibility='trainee'`, [pid]))[0].n === 1, "the trainee sees one event; the reminder stays internal");
await rejects(() => q(`INSERT INTO "FormalProjectEvent" (id,"projectId","eventType","eventDate",source,visibility) VALUES (gen_random_uuid()::text,$1,'x','2026-11-02','admin','everyone')`, [pid]), "event visibility is trainee or internal", /FormalProjectEvent_visibility_chk/);
await q(`UPDATE "FormalProject" SET route='ACCEPTED_PAPER',"paperJournal"='Anaesthesia',"paperAuthorship"='First author',"paperAcceptedOn"='2026-05-30' WHERE id=$1`, [pid]);
await rejects(() => q(`UPDATE "FormalProject" SET route='ACCEPTED_PAPER',"paperJournal"=NULL WHERE id=$1`, [pid]), "an accepted-paper project must name the journal", /FormalProject_route_chk/);
await rejects(() => q(`UPDATE "FormalProject" SET route='OTHER' WHERE id=$1`, [pid]), "route is standard or accepted paper", /FormalProject_route_chk/);

// membership application: two signers
const app = (await q(`INSERT INTO "Application" (id,"applicantUserId","parentHospitalId","submittedAt","mchkRegistrationType","mchkRegistrationNumber") VALUES (gen_random_uuid()::text,$1,$2,now(),'limited','L12345') RETURNING id`, [U1, H1]))[0].id;
await q(`INSERT INTO "ApplicationEndorsement" (id,"applicationId","signerRole","signerUserId") VALUES (gen_random_uuid()::text,$1,'CHIEF_OF_SERVICE',$2)`, [app, U2]);
await q(`INSERT INTO "ApplicationEndorsement" (id,"applicationId","signerRole","signerUserId") VALUES (gen_random_uuid()::text,$1,'SOT',$2)`, [app, U3]);
await rejects(() => q(`INSERT INTO "ApplicationEndorsement" (id,"applicationId","signerRole") VALUES (gen_random_uuid()::text,$1,'SOT')`, [app]), "one endorsement row per signer role", /unique|duplicate/i);
await rejects(() => q(`UPDATE "ApplicationEndorsement" SET "signedAt"=now() WHERE "applicationId"=$1 AND "signerRole"='SOT'`, [app]), "a signature needs a method (e-sign or PDF)", /ApplicationEndorsement_signed_chk/);
await rejects(() => q(`UPDATE "ApplicationEndorsement" SET "signedAt"=now(),method='PDF' WHERE "applicationId"=$1 AND "signerRole"='SOT'`, [app]), "an attached-PDF signature needs the document", /ApplicationEndorsement_pdf_chk/);
await q(`UPDATE "ApplicationEndorsement" SET "signedAt"=now(),method='ESIGN' WHERE "applicationId"=$1 AND "signerRole"='CHIEF_OF_SERVICE'`, [app]);
await q(`UPDATE "ApplicationEndorsement" SET "signedAt"=now(),method='PDF',"documentId"='endorse-sot.pdf',"attachedById"=$2 WHERE "applicationId"=$1 AND "signerRole"='SOT'`, [app, U2]);
ok((await q(`SELECT count(*)::int n FROM "ApplicationEndorsement" WHERE "applicationId"=$1 AND "signedAt" IS NOT NULL`, [app]))[0].n === 2, "endorsement is complete when both rows are signed (derived check)");
ok((await q(`SELECT "mchkRegistrationType" t FROM "Application" WHERE id=$1`, [app]))[0].t === "limited", "application records limited or full registration");
await q(`DELETE FROM "Application" WHERE id=$1`, [app]);
ok((await count(pg, "ApplicationEndorsement")) === 0, "deleting an application removes its signer rows");

// recognition: structured origin, Training Officer decision, append-only trail
const rec = (await q(`INSERT INTO "RetrospectiveRecognition" (id,"traineeId","applicationType","originKind","originSpecialty","originPlace") VALUES (gen_random_uuid()::text,$1,'lateral_transfer','OTHER_SPECIALTY','Emergency medicine','Prince of Wales Hospital') RETURNING id`, [T1.id]))[0].id;
await rejects(() => q(`UPDATE "RetrospectiveRecognition" SET "originKind"='ELSEWHERE' WHERE id=$1`, [rec]), "origin is overseas training or another specialty", /RetrospectiveRecognition_origin_chk/);
await q(`UPDATE "RetrospectiveRecognition" SET "vettingStatus"='WITH_TRAINING_OFFICER' WHERE id=$1`, [rec]);
await rejects(() => q(`UPDATE "RetrospectiveRecognition" SET "vettingStatus"='REJECTED',"decidedByBody"='TRAINING_OFFICER' WHERE id=$1`, [rec]), "a rejection is never the Training Officer's alone", /RetrospectiveRecognition_reject_chk/);
await q(`UPDATE "RetrospectiveRecognition" SET "vettingStatus"='APPROVED_PENDING_CREDIT',"decidedByBody"='TRAINING_OFFICER',"decisionDate"='2026-10-30' WHERE id=$1`, [rec]);
await q(`UPDATE "RetrospectiveRecognition" SET "vettingStatus"='REFERRED_TO_BOARD',"decidedByBody"=NULL,"decisionDate"=NULL WHERE id=$1`, [rec]);
await q(`UPDATE "RetrospectiveRecognition" SET "vettingStatus"='REJECTED',"decidedByBody"='BOARD',"decisionDate"='2026-11-10' WHERE id=$1`, [rec]);
ok((await q(`SELECT "vettingStatus" s FROM "RetrospectiveRecognition" WHERE id=$1`, [rec]))[0].s === "REJECTED", "the Board can reject");
const ev = (await q(`INSERT INTO "RetrospectiveRecognitionEvent" (id,"recognitionId","eventType","toStatus","actorUserId","actorRole","onBehalf",outcome,note,"eventDate") VALUES (gen_random_uuid()::text,$1,'decided','APPROVED_PENDING_CREDIT',$2,'TRAINING_OFFICER',true,'Approved','Outcome arrived by email','2026-10-30') RETURNING id`, [rec, U2]))[0].id;
await rejects(() => q(`UPDATE "RetrospectiveRecognitionEvent" SET note='edited' WHERE id=$1`, [ev]), "a trail entry cannot be edited", /append-only/);
await rejects(() => q(`DELETE FROM "RetrospectiveRecognitionEvent" WHERE id=$1`, [ev]), "a trail entry cannot be deleted", /append-only/);
await rejects(() => q(`DELETE FROM "RetrospectiveRecognition" WHERE id=$1`, [rec]), "a recognition with a trail cannot be deleted", /foreign key|violates/i);
await rejects(() => q(`UPDATE "RetrospectiveRecognition" SET "decidedByBody"='COMMITTEE' WHERE id=$1`, [rec]), "decision body is Training Officer or Board", /invalid input value/i);
await rejects(() => q(`INSERT INTO "VopCreditAdjustment" (id,"traineeId",cases,reason) VALUES (gen_random_uuid()::text,$1,5,'OTHER_BOE_DIRECTED')`, [T2.id]), "decision date is still required on case credit", /null value in column "decisionDate"/);
await q(`INSERT INTO "VopCreditAdjustment" (id,"traineeId","recognitionId",cases,reason,"decisionDate","decidedByBody") VALUES (gen_random_uuid()::text,$1,$2,60,'RETROSPECTIVE_SPECIALTY_TRANSFER','2026-10-30','TRAINING_OFFICER')`, [T1.id, rec]);
ok((await q(`SELECT "decidedByBody" b FROM "VopCreditAdjustment" WHERE "recognitionId"=$1`, [rec]))[0].b === "TRAINING_OFFICER", "case credit records who decided it");

// FK integrity over every new or changed table
const fkTables = ["CourseRound","CourseRequest","CourseAttendance","CourseNotice","ExamSitting","ExamApplication","ExamResult","ExamSectionPass","TraineeFeePayment","TraineeExemption","FormalProjectStage","FormalProjectReview","FormalProjectEvent","ApplicationEndorsement","RetrospectiveRecognition","RetrospectiveRecognitionEvent","VopCreditAdjustment","AccreditedTimeLedger"];
let orphans = 0;
for (const t of fkTables) {
  const fks = await q(`SELECT kcu.column_name c, ccu.table_name rt, ccu.column_name rc FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name=$1`, [t]);
  for (const f of fks) orphans += (await q(`SELECT count(*)::int n FROM "${t}" x LEFT JOIN "${f.rt}" y ON y."${f.rc}"=x."${f.c}" WHERE x."${f.c}" IS NOT NULL AND y."${f.rc}" IS NULL`))[0].n;
}
ok(orphans === 0, `orphan sweep over ${fkTables.length} new/changed tables: ${orphans} orphans`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
