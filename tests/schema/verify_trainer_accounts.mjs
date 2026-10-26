// Verifies migration 7 (trainer lists, one login per person, light trainer accounts) on real Postgres (PGlite):
//  A. upgrade path: migrations 0-6 + seed, then migration 7, existing rows untouched
//  B. enums, columns, constraints, triggers
//  C. the rules: trainee and trainer exclusion, SOT is a trainer, account invitations
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS  " + m); } else { fail++; console.log("  FAIL  " + m); } };
const rejects = async (fn, m, re) => {
  try { await fn(); fail++; console.log("  FAIL  " + m + " (was accepted)"); }
  catch (e) { const good = !re || re.test(String(e.message)); good ? pass++ : fail++; console.log((good ? "  PASS  " : "  FAIL  ") + m + (good ? "" : " (wrong error: " + e.message.slice(0, 90) + ")")); }
};
const dirs = fs.readdirSync("db/migrations").filter(d => /^\d+_/.test(d)).sort((a, b) => parseInt(a) - parseInt(b));
const mig = d => fs.readFileSync(`db/migrations/${d}/migration.sql`, "utf-8");
const seed = JSON.parse(fs.readFileSync("db/seeds/synthetic_seed.json", "utf-8"));
const ORDER = ["Cluster","Hospital","HospitalClusterHistory","AccreditedCentre","CurriculumEdition","CurriculumRule","CurriculumDescriptor","AssessmentTool","User","TraineeProfile","TrainerProfile"];

async function load(pg) {
  for (const t of ORDER) for (const row of (seed[t] || [])) {
    const k = Object.keys(row);
    await pg.query(`INSERT INTO "${t}" (${k.map(x => `"${x}"`).join(",")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(",")})`,
      k.map(x => (row[x] !== null && typeof row[x] === "object" && !Array.isArray(row[x])) ? JSON.stringify(row[x]) : row[x]));
  }
}
const U = pg => async (sql, p = []) => (await pg.query(sql, p)).rows;

console.log("A. Upgrade path (0..6 + seed, then migration 7)");
const pg = new PGlite();
for (const d of dirs.filter(d => parseInt(d) < 7)) await pg.exec(mig(d));
await load(pg);
const q = U(pg);
const before = {
  users: (await q(`SELECT count(*)::int n FROM "User"`))[0].n,
  trainers: (await q(`SELECT count(*)::int n FROM "TrainerProfile"`))[0].n,
  trainees: (await q(`SELECT count(*)::int n FROM "TraineeProfile"`))[0].n,
};
const m7 = dirs.find(d => d.startsWith("7_"));
ok(!!m7, "migration 7 exists: " + m7);
await pg.exec(mig(m7));
const after = {
  users: (await q(`SELECT count(*)::int n FROM "User"`))[0].n,
  trainers: (await q(`SELECT count(*)::int n FROM "TrainerProfile"`))[0].n,
  trainees: (await q(`SELECT count(*)::int n FROM "TraineeProfile"`))[0].n,
};
ok(JSON.stringify(before) === JSON.stringify(after), "existing users, trainers and trainees untouched");
ok((await q(`SELECT count(*)::int n FROM "TrainerProfile" WHERE "listStatus"::text='ON_LIST'`))[0].n === before.trainers, "existing trainers are on the list");
ok((await q(`SELECT count(*)::int n FROM "TraineeProfile" WHERE "programme"::text='ANAESTHESIA'`))[0].n === before.trainees, "existing trainees are anaesthesia trainees");
ok((await q(`SELECT count(*)::int n FROM "User" WHERE "accountStatus"::text='NONE'`))[0].n === before.users, "existing users start with no account status");

console.log("B. Shape");
const enumLabels = async n => (await q(`SELECT e.enumlabel l FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname=$1 ORDER BY e.enumsortorder`, [n])).map(r => r.l).join();
ok(await enumLabels("AccountStatus") === "NONE,INVITED,ACTIVE", "AccountStatus enum");
ok(await enumLabels("TrainerListStatus") === "ON_LIST,LEFT,MOVED,RETIRED", "TrainerListStatus enum");
ok(await enumLabels("TrainingProgramme") === "ANAESTHESIA,ICU,PAIN_MEDICINE", "TrainingProgramme enum");
ok(await enumLabels("InvitationReason") === "TRAINER_ROUND,SOT_APPOINTMENT,GO_LIVE", "InvitationReason enum");
const cols = async t => (await q(`SELECT column_name c, is_nullable n FROM information_schema.columns WHERE table_name=$1`, [t])).reduce((a, r) => (a[r.c] = r.n, a), {});
const tc = await cols("TrainerProfile");
for (const c of ["listStatus","movedToHospitalId","joinedOn","leftOn","fellowshipYear","legacySource"]) ok(c in tc, "TrainerProfile." + c);
ok(tc.hospitalId === "YES", "TrainerProfile.hospitalId may be empty (no hospital yet)");
const uc = await cols("User");
for (const c of ["familyName","givenName","accountStatus","accountActivatedAt"]) ok(c in uc, "User." + c);
ok("programme" in await cols("TraineeProfile"), "TraineeProfile.programme");
const ic = await cols("AccountInvitation");
for (const c of ["userId","reason","tokenHash","expiresAt","usedAt","revokedAt","invitedById"]) ok(c in ic, "AccountInvitation." + c);
const trg = (await q(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`)).map(r => r.tgname);
for (const t of ["TrainerProfile_not_trainee","TraineeProfile_not_trainer","UserRoleAssignment_sot_is_trainer","TrainerProfile_sot_stays","AccountInvitation_no_login","AccountInvitation_sent","AccountInvitation_used"]) ok(trg.includes(t), "trigger " + t);

console.log("C. Rules");
const H = (await q(`SELECT id FROM "Hospital" ORDER BY "hospitalCode" LIMIT 3`)).map(r => r.id);
let n = 0;
const mkUser = async (name) => (await q(`INSERT INTO "User" (id,email,name,"primaryRole") VALUES (gen_random_uuid()::text,$1,$2,'TRAINER') RETURNING id`, [`p${++n}@example.org`, name]))[0].id;
const addTrainer = (uid, o = {}) => q(`INSERT INTO "TrainerProfile" (id,"userId","hospitalId",qualifications,"listStatus","movedToHospitalId","fellowshipYear","joinedOn","leftOn") VALUES (gen_random_uuid()::text,$1,$2,ARRAY[]::text[],$3::"TrainerListStatus",$4,$5,$6,$7)`,
  [uid, "h" in o ? o.h : H[0], o.st ?? "ON_LIST", o.to ?? null, o.fy ?? null, o.joined ?? null, o.left ?? null]);

// trainer list rows
const t1 = await mkUser("Dr. One"); await addTrainer(t1, { fy: 2012 });
ok(true, "trainer with a fellowship year accepted");
await rejects(async () => addTrainer(await mkUser("Dr. Old"), { fy: 1900 }), "fellowship year before 1960 refused", /fellow_chk/);
const t2 = await mkUser("Dr. Pool"); await addTrainer(t2, { h: null });
ok(true, "imported trainer with no hospital yet is accepted");
await rejects(async () => addTrainer(await mkUser("Dr. Lost"), { h: null, st: "LEFT" }), "a trainer who left must have a hospital", /hosp_chk/);
await rejects(async () => addTrainer(await mkUser("Dr. Mv"), { st: "MOVED" }), "moved without a destination refused", /status_chk/);
await rejects(async () => addTrainer(await mkUser("Dr. Mv2"), { st: "MOVED", to: H[0] }), "moved to the same hospital refused", /status_chk/);
await addTrainer(await mkUser("Dr. Mv3"), { st: "MOVED", to: H[1] });
ok(true, "moved to another hospital accepted");
await rejects(async () => addTrainer(await mkUser("Dr. To"), { to: H[1] }), "a destination on a trainer who has not moved refused", /status_chk/);
await rejects(async () => addTrainer(await mkUser("Dr. Dt"), { joined: "2026-05-01", left: "2026-01-01" }), "left before joined refused", /dates_chk/);
await rejects(() => addTrainer(t1), "a second trainer row for the same person refused", /unique|duplicate/i);

// trainee and trainer exclusion
const tr = (await q(`SELECT "userId", id FROM "TraineeProfile" ORDER BY id LIMIT 3`));
const traineeUser = tr[0].userId;
await rejects(() => addTrainer(traineeUser), "a current anaesthesia trainee cannot be put on a trainer list", /trainer_is_trainee/);
await q(`UPDATE "TraineeProfile" SET "programme"='PAIN_MEDICINE' WHERE "userId"=$1`, [traineeUser]);
await addTrainer(traineeUser);
ok(true, "a pain trainee can be a trainer");
await rejects(() => q(`UPDATE "TraineeProfile" SET "programme"='ANAESTHESIA' WHERE "userId"=$1`, [traineeUser]), "...and cannot be switched to an anaesthesia trainee while on a list", /trainee_is_trainer/);
const traineeUser2 = tr[1].userId;
await q(`UPDATE "TraineeProfile" SET "programme"='ICU' WHERE "userId"=$1`, [traineeUser2]);
await addTrainer(traineeUser2);
ok(true, "an ICU trainee can be a trainer");
const traineeUser3 = tr[2].userId;
await q(`UPDATE "TraineeProfile" SET "currentStage"='FELLOW' WHERE "userId"=$1`, [traineeUser3]);
await addTrainer(traineeUser3);
ok(true, "someone who has completed anaesthesia training can be a trainer on the same login");
const ex = await mkUser("Dr. Ex");
await addTrainer(ex, { st: "LEFT" });
ok(true, "a trainer no longer on the list does not block anything");

// SOT is a trainer
const sot = await mkUser("Dr. Sot");
await q(`INSERT INTO "UserRoleAssignment" (id,"userId",role,"scopeType","scopeId") VALUES (gen_random_uuid()::text,$1,'SOT','HOSPITAL',$2)`, [sot, H[2]]);
let p = (await q(`SELECT "hospitalId" h,"listStatus"::text s,"isSot" x FROM "TrainerProfile" WHERE "userId"=$1`, [sot]))[0];
ok(p && p.h === H[2] && p.s === "ON_LIST" && p.x === true, "appointing an SOT puts them on that hospital's trainer list");
const asot = t1;
await q(`INSERT INTO "UserRoleAssignment" (id,"userId",role,"scopeType","scopeId") VALUES (gen_random_uuid()::text,$1,'ASSISTANT_SOT','HOSPITAL',$2)`, [asot, H[1]]);
p = (await q(`SELECT "hospitalId" h,"isAssistantSot" x FROM "TrainerProfile" WHERE "userId"=$1`, [asot]))[0];
ok(p.h === H[1] && p.x === true, "an existing trainer appointed elsewhere moves to the appointing hospital, one row only");
ok((await q(`SELECT count(*)::int n FROM "TrainerProfile" WHERE "userId"=$1`, [asot]))[0].n === 1, "still one trainer row for that person");
await rejects(() => q(`UPDATE "TrainerProfile" SET "listStatus"='LEFT',"leftOn"='2026-10-26' WHERE "userId"=$1`, [sot]), "an SOT in post cannot be marked as left", /sot_must_train/);
await q(`UPDATE "UserRoleAssignment" SET "isActive"=false,"effectiveUntil"=now() WHERE "userId"=$1 AND role='SOT'`, [sot]);
await q(`UPDATE "TrainerProfile" SET "listStatus"='LEFT',"leftOn"='2026-10-26' WHERE "userId"=$1`, [sot]);
ok(true, "after the appointment ends the trainer can be marked as left");
const future = await mkUser("Dr. Future");
await q(`INSERT INTO "UserRoleAssignment" (id,"userId",role,"scopeType","scopeId","effectiveFrom") VALUES (gen_random_uuid()::text,$1,'SOT','HOSPITAL',$2,now() + interval '60 days')`, [future, H[0]]);
ok((await q(`SELECT count(*)::int n FROM "TrainerProfile" WHERE "userId"=$1`, [future]))[0].n === 0, "an appointment that has not started yet does not add them yet");
const trainee4 = (await q(`SELECT "userId" FROM "TraineeProfile" WHERE "programme"::text='ANAESTHESIA' AND "currentStage"::text<>'FELLOW' LIMIT 1`))[0]?.userId;
if (trainee4) await rejects(() => q(`INSERT INTO "UserRoleAssignment" (id,"userId",role,"scopeType","scopeId") VALUES (gen_random_uuid()::text,$1,'SOT','HOSPITAL',$2)`, [trainee4, H[0]]), "a current anaesthesia trainee cannot be appointed SOT", /trainer_is_trainee/);

// invitations
const inv = (uid, o = {}) => q(`INSERT INTO "AccountInvitation" (id,"userId",reason,"tokenHash","expiresAt","createdAt","revokedAt") VALUES (gen_random_uuid()::text,$1,$2::"InvitationReason",$3,$4,$5,$6) RETURNING id`,
  [uid, o.reason ?? "TRAINER_ROUND", o.tok ?? `tok-${++n}`, o.exp ?? "2027-01-01", o.created ?? "2026-10-26", o.revoked ?? null]);
const fresh = await mkUser("Dr. Fresh");
const i1 = (await inv(fresh))[0].id;
ok((await q(`SELECT "accountStatus"::text s FROM "User" WHERE id=$1`, [fresh]))[0].s === "INVITED", "sending a link moves the account to INVITED");
await rejects(() => inv(fresh), "a second open link for the same person refused", /open_uq/);
await q(`UPDATE "AccountInvitation" SET "revokedAt"='2026-10-27' WHERE id=$1`, [i1]);
const i2 = (await inv(fresh))[0].id;
ok(true, "after revoking, a new link can be sent");
await rejects(() => q(`UPDATE "AccountInvitation" SET "usedAt"='2026-10-28' WHERE id=$1`, [i1]), "a revoked link cannot be used", /invitation_not_usable/);
await rejects(() => q(`UPDATE "AccountInvitation" SET "usedAt"='2027-06-01' WHERE id=$1`, [i2]), "an expired link cannot be used", /invitation_not_usable/);
await q(`UPDATE "AccountInvitation" SET "usedAt"='2026-10-28' WHERE id=$1`, [i2]);
const a = (await q(`SELECT "accountStatus"::text s,"accountActivatedAt" t FROM "User" WHERE id=$1`, [fresh]))[0];
ok(a.s === "ACTIVE" && a.t, "using the link makes the account ACTIVE and records when");
await rejects(() => inv(fresh), "no link to someone who already has a login", /already_has_login/);
await rejects(() => inv(traineeUser2), "no link to a trainee, who already has a login", /already_has_login/);
await rejects(() => q(`UPDATE "AccountInvitation" SET "revokedAt"='2026-10-29' WHERE id=$1`, [i2]), "a link that was used cannot also be revoked", /closed_chk/);
await rejects(async () => inv(await mkUser("Dr. Exp"), { exp: "2026-10-01" }), "a link that expires before it is created refused", /expiry_chk/);
const sotNew = await mkUser("Dr. SotNew");
await inv(sotNew, { reason: "SOT_APPOINTMENT" });
ok((await q(`SELECT "accountStatus"::text s FROM "User" WHERE id=$1`, [sotNew]))[0].s === "INVITED", "an SOT appointee with no login is invited");
await rejects(() => q(`DELETE FROM "User" WHERE id=$1`, [fresh]), "a user with invitations cannot be deleted", /RESTRICT|foreign key/);
const orphans = (await q(`SELECT count(*)::int n FROM "AccountInvitation" i LEFT JOIN "User" u ON u.id=i."userId" WHERE u.id IS NULL`))[0].n;
ok(orphans === 0, "no orphan invitations");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
