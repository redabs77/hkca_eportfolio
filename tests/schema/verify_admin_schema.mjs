// Verifies migration 3 (Admin console tables + schema-doc alignment) on real Postgres (PGlite):
//  A. upgrade path: migrations 0-2 + seed, then migration 3, existing data intact
//  B. destructive-step guard (removed TrainingStage values)
//  C. enums, tables and the Admin console flows (constraints, supersede chains, FK integrity)
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS  " + m); } else { fail++; console.log("  FAIL  " + m); } };
const rejects = async (fn, m, re) => {
  try { await fn(); fail++; console.log("  FAIL  " + m + " (was accepted)"); }
  catch (e) { const good = !re || re.test(String(e.message)); good ? pass++ : fail++; console.log((good ? "  PASS  " : "  FAIL  ") + m + (good ? "" : " (wrong error: " + String(e.message).slice(0, 80) + ")")); }
};
const dirs = fs.readdirSync("db/migrations").filter(d => /^\d+_/.test(d)).sort((a, b) => parseInt(a) - parseInt(b));
const mig = d => fs.readFileSync(`db/migrations/${d}/migration.sql`, "utf-8");
const m3 = dirs.find(d => d.startsWith("3_"));
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

console.log("A. Upgrade path (0..2 + seed, then migration 3)");
const pg = new PGlite();
for (const d of dirs.filter(d => d !== m3 && parseInt(d) < 3)) await pg.exec(mig(d));
await load(pg);
const before = {};
for (const t of ORDER) before[t] = await count(pg, t);
const tablesBefore = (await pg.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`)).rows[0].n;
await pg.exec(mig(m3));
for (const t of ORDER) ok(await count(pg, t) === before[t], `${t}: ${before[t]} rows preserved`);
const tablesAfter = (await pg.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`)).rows[0].n;
ok(tablesAfter - tablesBefore === 22, `22 new tables (${tablesBefore} -> ${tablesAfter})`);
const ts = (await pg.query(`SELECT "trainingStatus" s, count(*)::int n FROM "TraineeProfile" GROUP BY 1`)).rows;
ok(ts.length === 1 && ts[0].s === "ACTIVE", "existing trainees default to trainingStatus ACTIVE");

console.log("\nB. Destructive-step guard");
const pg2 = new PGlite();
for (const d of dirs.filter(d => parseInt(d) < 3)) await pg2.exec(mig(d));
await load(pg2);
await pg2.exec(`UPDATE "TraineeProfile" SET "currentStage"='SUSPENDED' WHERE id=(SELECT id FROM "TraineeProfile" LIMIT 1)`);
await rejects(() => pg2.exec(mig(m3)), "migration refuses to run while a trainee is still in stage SUSPENDED", /still in use/);

console.log("\nC. Enums");
ok(JSON.stringify(await enumVals(pg, "TrainingStage")) === JSON.stringify(["BAT","HAT","PFY","FELLOW"]), "TrainingStage is BAT, HAT, PFY, FELLOW");
ok(JSON.stringify(await enumVals(pg, "TraineeStatus")) === JSON.stringify(["ACTIVE","ON_LEAVE","DEACTIVATED","COMPLETED"]), "TraineeStatus is ACTIVE, ON_LEAVE, DEACTIVATED, COMPLETED");
ok((await enumVals(pg, "LedgerReason")).includes("RETROSPECTIVE_OVERSEAS_RECOGNITION") && (await enumVals(pg, "LedgerReason")).includes("RETROSPECTIVE_SPECIALTY_TRANSFER"), "LedgerReason has both recognition reasons");
ok((await enumVals(pg, "ProjectStatus")).includes("ESCALATED"), "ProjectStatus has ESCALATED");
ok((await enumVals(pg, "BulkIngestionType")).includes("IWBA_LINK"), "BulkIngestionType has IWBA_LINK");
ok(!(await enumVals(pg, "UserRole")).includes("ACTING_SOT"), "no ACTING_SOT role");

console.log("\nD. Admin console flows");
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const trainees = await q(`SELECT id, "userId", "parentHospitalId" FROM "TraineeProfile" ORDER BY "hkcaNumber"`);
const users = await q(`SELECT id FROM "User" ORDER BY id`);
const hosp = await q(`SELECT id FROM "Hospital" ORDER BY id`);
const [T1, T2] = trainees, U1 = users[0].id, U2 = users[1].id, U3 = users[2].id, H1 = hosp[0].id, H2 = hosp[1].id;

// intake
await q(`INSERT INTO "Application" (id,"applicantUserId","parentHospitalId","submittedAt","checkMchk","checkFee","checkEndorsement",status,"traineeId","decidedById","decidedAt") VALUES (gen_random_uuid()::text,$1,$2,now(),true,true,true,'APPROVED',$3,$4,now())`, [U1, H1, T1.id, U2]);
await rejects(() => q(`INSERT INTO "Application" (id,"submittedAt","traineeId") VALUES (gen_random_uuid()::text,now(),$1)`, [T1.id]), "one application per resulting trainee (unique)", /unique|duplicate/i);
await rejects(() => q(`INSERT INTO "Application" (id,"submittedAt",status) VALUES (gen_random_uuid()::text,now(),'WITHDRAWN')`), "invalid application status rejected", /invalid input value/i);
// status events
await q(`INSERT INTO "TraineeStatusEvent" (id,"traineeId",status,"effectiveDate",reason,"recordedById") VALUES (gen_random_uuid()::text,$1,'ON_LEAVE','2026-10-01','Parental leave',$2)`, [T1.id, U2]);
await rejects(() => q(`INSERT INTO "TraineeStatusEvent" (id,"traineeId",status,"effectiveDate") VALUES (gen_random_uuid()::text,$1,'SUSPENDED','2026-10-01')`, [T1.id]), "SUSPENDED is not a trainee status", /invalid input value/i);
// courses
await q(`INSERT INTO "CourseCatalogue" ("courseCode","courseName","isMandatory") VALUES ('EMAC','Echocardiography and Managing Anaesthetic Complications',true)`);
const rid = (await q(`INSERT INTO "CourseRound" (id,"courseCode","roundDate",seats) VALUES (gen_random_uuid()::text,'EMAC','2026-11-14',12) RETURNING id`))[0].id;
await rejects(() => q(`INSERT INTO "CourseRound" (id,"courseCode","roundDate",seats) VALUES (gen_random_uuid()::text,'NOPE','2026-11-14',12)`), "round must reference a catalogue course", /foreign key/i);
await q(`INSERT INTO "CourseRequest" (id,"roundId","traineeId","requestedAt",decision) VALUES (gen_random_uuid()::text,$1,$2,now(),'ACCEPTED')`, [rid, T1.id]);
await rejects(() => q(`INSERT INTO "CourseRequest" (id,"roundId","traineeId","requestedAt") VALUES (gen_random_uuid()::text,$1,$2,now())`, [rid, T1.id]), "a trainee requests a round only once", /unique|duplicate/i);
await q(`INSERT INTO "MandatoryCourse" (id,"traineeId","courseCode","courseName","completionDate","roundId") VALUES (gen_random_uuid()::text,$1,'EMAC','EMAC','2026-11-14',$2)`, [T1.id, rid]);
ok((await q(`SELECT count(*)::int n FROM "MandatoryCourse" m JOIN "CourseRound" r ON r.id=m."roundId" WHERE m."traineeId"=$1`, [T1.id]))[0].n === 1, "completion links back to the round it came from");
// recognition + ledger + case credit (option A)
const rec = (await q(`INSERT INTO "RetrospectiveRecognition" (id,"traineeId","applicationType","accessRequestedAt","requestedClinicalMonths","requestedCases") VALUES (gen_random_uuid()::text,$1,'overseas_training',now(),12,180) RETURNING id, "vettingStatus" s`, [T2.id]))[0];
ok(rec.s === "ACCESS_REQUESTED", "recognition starts at ACCESS_REQUESTED");
await q(`UPDATE "RetrospectiveRecognition" SET "vettingStatus"='UNLOCKED',"formUnlockedAt"=now(),"formUnlockedById"=$2 WHERE id=$1`, [rec.id, U2]);
await q(`INSERT INTO "AccreditedTimeLedger" (id,"traineeId","periodStart","periodEnd","calendarMonthsCredited",category,"decisionReason","authorityId","authorityRole","boardDecisionDate") VALUES (gen_random_uuid()::text,$1,'2025-01-01','2025-12-31',12,'CLINICAL_ANAESTHESIA','RETROSPECTIVE_OVERSEAS_RECOGNITION',$2,'COLLEGE_ADMIN','2026-10-20')`, [T2.id, U2]);
ok((await q(`SELECT "boardDecisionDate"::text d FROM "AccreditedTimeLedger" WHERE "decisionReason"='RETROSPECTIVE_OVERSEAS_RECOGNITION'`))[0].d === "2026-10-20", "ledger stores the Board decision date");
const c1 = (await q(`INSERT INTO "VopCreditAdjustment" (id,"traineeId","recognitionId",cases,reason,"boardDecisionDate","recordedById") VALUES (gen_random_uuid()::text,$1,$2,180,'RETROSPECTIVE_OVERSEAS_RECOGNITION','2026-10-20',$3) RETURNING id`, [T2.id, rec.id, U2]))[0].id;
await q(`UPDATE "VopCreditAdjustment" SET "isCurrent"=false WHERE id=$1`, [c1]);
await q(`INSERT INTO "VopCreditAdjustment" (id,"traineeId","recognitionId",cases,"moduleCode",reason,"boardDecisionDate","supersedesId") VALUES (gen_random_uuid()::text,$1,$2,150,'3.4','PARTIAL_CREDIT_CORRECTION','2026-11-02',$3)`, [T2.id, rec.id, c1]);
ok((await q(`SELECT sum(cases)::int n FROM "VopCreditAdjustment" WHERE "traineeId"=$1 AND "isCurrent"`, [T2.id]))[0].n === 150, "current case credit counts only the superseding row (150, not 330)");
await rejects(() => q(`INSERT INTO "VopCreditAdjustment" (id,"traineeId",cases,reason,"boardDecisionDate") VALUES (gen_random_uuid()::text,$1,5,'MADE_UP','2026-10-20')`, [T2.id]), "case credit reason must be a ledger reason", /invalid input value/i);
await rejects(() => q(`INSERT INTO "VopCreditAdjustment" (id,"traineeId",cases,reason) VALUES (gen_random_uuid()::text,$1,5,'OTHER_BOE_DIRECTED')`, [T2.id]), "board decision date is required on case credit", /null value in column "boardDecisionDate"/i);
// formal project reviews
const pid = (await q(`INSERT INTO "FormalProject" (id,"traineeId","projectType",title,status,"projectNumber") VALUES (gen_random_uuid()::text,$1,'QIP','Test project','UNDER_REVIEW','FP-26-014') RETURNING id`, [T1.id]))[0].id;
await rejects(() => q(`INSERT INTO "FormalProject" (id,"traineeId","projectType",title,"projectNumber") VALUES (gen_random_uuid()::text,$1,'QIP','Dup','FP-26-014')`, [T1.id]), "project numbers are unique", /unique|duplicate/i);
const r1 = (await q(`INSERT INTO "FormalProjectReview" (id,"projectId",stage,"reviewerId","assignedAt","dueAt") VALUES (gen_random_uuid()::text,$1,'protocol',$2,now(),'2026-11-23') RETURNING id`, [pid, U1]))[0].id;
await q(`INSERT INTO "FormalProjectReview" (id,"projectId",stage,"reviewerId","assignedAt","dueAt") VALUES (gen_random_uuid()::text,$1,'protocol',$2,now(),'2026-11-23')`, [pid, U2]);
await q(`UPDATE "FormalProjectReview" SET "replacedAt"=now(),"replacedById"=$2 WHERE id=$1`, [r1, U3]);
await q(`INSERT INTO "FormalProjectReview" (id,"projectId",stage,"reviewerId","assignedAt","dueAt") VALUES (gen_random_uuid()::text,$1,'protocol',$2,now(),'2026-11-24')`, [pid, U3]);
ok((await q(`SELECT count(*)::int n FROM "FormalProjectReview" WHERE "projectId"=$1 AND "replacedAt" IS NULL`, [pid]))[0].n === 2 && (await q(`SELECT count(*)::int n FROM "FormalProjectReview" WHERE "projectId"=$1`, [pid]))[0].n === 3, "replacement keeps history: 3 rows, 2 current reviewers");
await rejects(() => q(`UPDATE "FormalProjectReview" SET grade='EXCELLENT' WHERE id=$1`, [r1]), "invalid review grade rejected", /invalid input value/i);
await q(`UPDATE "FormalProject" SET status='ESCALATED' WHERE id=$1`, [pid]);
// rosters
const rr = (await q(`INSERT INTO "RosterRound" (id,period,"opensOn","closesOn") VALUES (gen_random_uuid()::text,'2026-12','2026-12-01','2026-12-31') RETURNING id`))[0].id;
await q(`INSERT INTO "RosterAttestation" (id,"roundId","hospitalId","confirmedById","confirmedAt") VALUES (gen_random_uuid()::text,$1,$2,$3,now())`, [rr, H1, U1]);
await rejects(() => q(`INSERT INTO "RosterAttestation" (id,"roundId","hospitalId") VALUES (gen_random_uuid()::text,$1,$2)`, [rr, H1]), "one attestation per hospital per round", /unique|duplicate/i);
await q(`INSERT INTO "RosterAttestation" (id,"roundId","hospitalId") VALUES (gen_random_uuid()::text,$1,$2)`, [rr, H2]);
await rejects(() => q(`INSERT INTO "RosterRound" (id,period,"opensOn","closesOn") VALUES (gen_random_uuid()::text,'2026-12','2026-12-01','2026-12-31')`), "round period is unique", /unique|duplicate/i);
// iWBA
await q(`INSERT INTO "WbaIwbaLink" ("iwbaUserId","iwbaDisplayName","iwbaHospital","iwbaRole") VALUES ('b1a5c8e0-0000-4000-8000-000000000001','Lau, Sarah','PWH','Trainee')`);
ok((await q(`SELECT status, "userId" FROM "WbaIwbaLink"`))[0].status === "UNLINKED" && (await q(`SELECT "userId" FROM "WbaIwbaLink"`))[0].userId === null, "an unlinked iWBA person can be stored (no user yet)");
await q(`UPDATE "WbaIwbaLink" SET status='CONFIRMED',"userId"=$1,"linkMethod"='admin_confirmed',"confirmedById"=$2,"confirmedAt"=now()`, [U1, U2]);
ok((await q(`SELECT l.status FROM "WbaIwbaLink" l JOIN "User" u ON u.id=l."userId"`))[0].status === "CONFIRMED", "confirmed link joins to the HKCA person");
await q(`INSERT INTO "WbaProcedureMap" ("iwbaProcedureCode","curriculumCode","setById") VALUES ('DOPS-12','SM-3.2',$1)`, [U2]);
await rejects(() => q(`INSERT INTO "WbaProcedureMap" ("iwbaProcedureCode","curriculumCode") VALUES ('DOPS-12','CF-2.1')`), "one mapping per iWBA procedure code", /unique|duplicate/i);
await q(`INSERT INTO "WbaSyncState" (endpoint,"lastRecordsRead","lastRecordsFailed") VALUES ('summary',143,0)`);
// SOT appointments: re-appointment allowed, endorsement stored
for (const from of ["2024-01-01", "2026-01-01"])
  await q(`INSERT INTO "UserRoleAssignment" (id,"userId",role,"scopeType","scopeId","effectiveFrom","boardEndorsedOn","endorsementDocId") VALUES (gen_random_uuid()::text,$1,'SOT','HOSPITAL',$2,$3,'2025-12-20','BOE-2025-12')`, [U1, H1, from]);
ok((await q(`SELECT count(*)::int n FROM "UserRoleAssignment" WHERE "userId"=$1 AND role='SOT' AND "boardEndorsedOn" IS NOT NULL`, [U1]))[0].n === 2, "same person can hold the same role again after a gap; endorsement date stored");
// learning plan cascade
const lp = (await q(`INSERT INTO "LearningPlan" (id,"traineeId","planType","periodStart","periodEnd") VALUES (gen_random_uuid()::text,$1,'SIX_MONTH','2026-07-01','2026-12-31') RETURNING id`, [T1.id]))[0].id;
await q(`INSERT INTO "LearningGoal" (id,"planId","planVersion","domainCode",objective,success) VALUES (gen_random_uuid()::text,$1,1,'CF-2.1','o','s')`, [lp]);
await rejects(() => q(`INSERT INTO "LearningPlan" (id,"traineeId","planType","periodStart","periodEnd") VALUES (gen_random_uuid()::text,$1,'SIX_MONTH','2026-07-01','2026-12-31')`, [T1.id]), "one plan per trainee, type and period", /unique|duplicate/i);
await q(`DELETE FROM "LearningPlan" WHERE id=$1`, [lp]);
ok((await q(`SELECT count(*)::int n FROM "LearningGoal"`))[0].n === 0, "deleting a plan cascades to its goals");
// verifier pool + stage history
await q(`INSERT INTO "LogbookVerifierAssignment" (id,"traineeId") VALUES (gen_random_uuid()::text,$1)`, [T1.id]);
ok((await q(`SELECT count(*)::int n FROM "LogbookVerifierAssignment" WHERE "verifierId" IS NULL AND "isCurrent"`))[0].n === 1, "unassigned logbook-verifier pool row (null verifier)");
await q(`INSERT INTO "TrainingStageHistory" (id,"traineeId",stage,"effectiveDate",source) VALUES (gen_random_uuid()::text,$1,'HAT-1','2026-07-01','app')`, [T1.id]);
await rejects(() => q(`INSERT INTO "TrainingStageHistory" (id,"traineeId",stage,"effectiveDate",source) VALUES (gen_random_uuid()::text,$1,'HAT-1','2026-07-02','app')`, [T1.id]), "a trainee enters each stage once", /unique|duplicate/i);
// VOP legacy key
const vops = await q(`SELECT id FROM "VolumeOfPractice" LIMIT 2`);
if (vops.length === 2) {
  await q(`UPDATE "VolumeOfPractice" SET "legacyPid"=7,"legacyTid"='A1' WHERE id=$1`, [vops[0].id]);
  await rejects(() => q(`UPDATE "VolumeOfPractice" SET "legacyPid"=7,"legacyTid"='A1' WHERE id=$1`, [vops[1].id]), "legacy case key (pid, tid) cannot be imported twice", /unique|duplicate/i);
  await q(`INSERT INTO "VopVerificationEvent" (id,"vopId","toStatus","occurredAt",source) VALUES (gen_random_uuid()::text,$1,'APPROVED',now(),'legacy_import')`, [vops[0].id]);
}
// trainee status default and new profile fields
ok((await q(`SELECT count(*)::int n FROM "TraineeProfile" WHERE "trainingStatus"='ACTIVE'`))[0].n === trainees.length, "trainees remain ACTIVE after the flows");
// FK integrity over every new table
const fkTables = ["Application","TraineeStatusEvent","CourseRound","CourseRequest","RetrospectiveRecognition","VopCreditAdjustment","FormalProjectReview","RosterAttestation","WbaIwbaLink","UserRoleAssignment","TrainingStageHistory"];
let orphans = 0;
for (const t of fkTables) {
  const fks = await q(`SELECT kcu.column_name c, ccu.table_name rt, ccu.column_name rc FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name=$1`, [t]);
  for (const f of fks) orphans += (await q(`SELECT count(*)::int n FROM "${t}" x LEFT JOIN "${f.rt}" y ON y."${f.rc}"=x."${f.c}" WHERE x."${f.c}" IS NOT NULL AND y."${f.rc}" IS NULL`))[0].n;
}
ok(orphans === 0, `orphan sweep over ${fkTables.length} new/changed tables: ${orphans} orphans`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
