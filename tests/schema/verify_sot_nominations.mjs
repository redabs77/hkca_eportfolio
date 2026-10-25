// Verifies migration 6 (SOT / Assistant SOT nominations) on real Postgres (PGlite):
//  A. upgrade path: migrations 0-5 + seed, then migration 6, existing rows untouched
//  B. enum and table shape
//  C. one real flow (check, Board, endorsed, entered), then every rule that Prisma cannot express
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS  " + m); } else { fail++; console.log("  FAIL  " + m); } };
const rejects = async (fn, m, re) => {
  try { await fn(); fail++; console.log("  FAIL  " + m + " (was accepted)"); }
  catch (e) { const good = !re || re.test(String(e.message)); good ? pass++ : fail++; console.log((good ? "  PASS  " : "  FAIL  ") + m + (good ? "" : " (wrong error: " + e.message.slice(0, 80) + ")")); }
};
const dirs = fs.readdirSync("db/migrations").filter(d => /^\d+_/.test(d)).sort((a, b) => parseInt(a) - parseInt(b));
const mig = d => fs.readFileSync(`db/migrations/${d}/migration.sql`, "utf-8");
const seed = JSON.parse(fs.readFileSync("db/seeds/synthetic_seed.json", "utf-8"));
const ORDER = ["Cluster","Hospital","HospitalClusterHistory","AccreditedCentre","CurriculumEdition","CurriculumRule","CurriculumDescriptor","AssessmentTool","User","TraineeProfile"];

async function load(pg) {
  for (const t of ORDER) for (const row of (seed[t] || [])) {
    const k = Object.keys(row);
    await pg.query(`INSERT INTO "${t}" (${k.map(x => `"${x}"`).join(",")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(",")})`,
      k.map(x => (row[x] !== null && typeof row[x] === "object" && !Array.isArray(row[x])) ? JSON.stringify(row[x]) : row[x]));
  }
}
const U = pg => async (sql, p = []) => (await pg.query(sql, p)).rows;

console.log("A. Upgrade path (0..5 + seed, then migration 6)");
const pg = new PGlite();
for (const d of dirs.filter(d => parseInt(d) < 6)) await pg.exec(mig(d));
await load(pg);
const q = U(pg);
const hospBefore = (await q(`SELECT count(*)::int n FROM "Hospital"`))[0].n;
const userBefore = (await q(`SELECT count(*)::int n FROM "User"`))[0].n;
const m6 = dirs.find(d => d.startsWith("6_"));
ok(!!m6, "migration 6 exists: " + m6);
await pg.exec(mig(m6));
ok((await q(`SELECT count(*)::int n FROM "Hospital"`))[0].n === hospBefore && (await q(`SELECT count(*)::int n FROM "User"`))[0].n === userBefore, "existing hospitals and users untouched");

console.log("B. Shape");
const labels = (await q(`SELECT e.enumlabel l FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='SotNominationState' ORDER BY e.enumsortorder`)).map(r => r.l);
ok(JSON.stringify(labels) === JSON.stringify(["CHECK","BOARD","ENDORSED","ENTERED","NOT_ENDORSED","WITHDRAWN"]), "state enum has the six states in order");
const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='SotNomination'`)).map(r => r.column_name);
for (const c of ["hospitalId","role","nomineeName","nomineeUserId","receivedOn","fellowSinceYear","wbaTrainerCourse","jcimedSotCourse","basicMedEdCourse","checkedById","checkedAt","state","sentToBoardOn","boardEndorsedOn","effectiveFrom","closedReason","appointmentId"])
  ok(cols.includes(c), "column " + c);
const chks = (await q(`SELECT conname FROM pg_constraint WHERE conrelid='"SotNomination"'::regclass AND contype='c'`)).map(r => r.conname);
for (const c of ["role","fellow","sent","endorsed","entered","closed","dates"]) ok(chks.includes(`SotNomination_${c}_chk`), `check constraint ${c}`);
ok((await q(`SELECT count(*)::int n FROM pg_indexes WHERE indexname='SotNomination_open_uq'`))[0].n === 1, "partial unique index present");

console.log("C. Flow and rules");
const H = (await q(`SELECT id FROM "Hospital" ORDER BY "hospitalCode" LIMIT 2`)).map(r => r.id);
const users = (await q(`SELECT id FROM "User" ORDER BY id LIMIT 3`)).map(r => r.id);
const ins = (o) => q(`INSERT INTO "SotNomination" (id,"hospitalId",role,"nomineeName","receivedOn",state,"fellowSinceYear","sentToBoardOn","boardEndorsedOn","effectiveFrom","closedReason","appointmentId","nomineeUserId")
  VALUES (gen_random_uuid()::text,$1,$2::"UserRole",$3,$4,$5::"SotNominationState",$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
  [o.h ?? H[0], o.role ?? "SOT", o.name ?? "Dr. A", o.recv ?? "2026-10-01", o.state ?? "CHECK", o.fy ?? null, o.sent ?? null, o.boe ?? null, o.eff ?? null, o.why ?? null, o.appt ?? null, o.user ?? null]);

const id1 = (await ins({ name: "Dr. Flow", fy: 2014 }))[0].id;
await q(`UPDATE "SotNomination" SET "wbaTrainerCourse"=true,"jcimedSotCourse"=true,"basicMedEdCourse"=true,"checkedById"=$2,"checkedAt"=now() WHERE id=$1`, [id1, users[0]]);
await q(`UPDATE "SotNomination" SET state='BOARD',"sentToBoardOn"='2026-10-08' WHERE id=$1`, [id1]);
await q(`UPDATE "SotNomination" SET state='ENDORSED',"boardEndorsedOn"='2026-10-20',"effectiveFrom"='2027-01-01' WHERE id=$1`, [id1]);
const ra = (await q(`INSERT INTO "UserRoleAssignment" (id,"userId",role,"scopeType","scopeId","boardEndorsedOn") VALUES (gen_random_uuid()::text,$1,'SOT','HOSPITAL',$2,'2026-10-20') RETURNING id`, [users[1], H[0]]))[0].id;
await q(`UPDATE "SotNomination" SET state='ENTERED',"appointmentId"=$2 WHERE id=$1`, [id1, ra]);
ok((await q(`SELECT state::text s,"appointmentId" a FROM "SotNomination" WHERE id=$1`, [id1]))[0].s === "ENTERED", "check, Board, endorsed, entered runs end to end");

await rejects(() => ins({ role: "TRAINER" }), "role other than SOT or ASSISTANT_SOT refused", /role_chk/);
await rejects(() => ins({ fy: 1900 }), "Fellow year before 1950 refused", /fellow_chk/);
await rejects(() => ins({ name: "Dr. B", state: "BOARD" }), "BOARD without a sent date refused", /sent_chk/);
await rejects(() => ins({ name: "Dr. C", state: "ENDORSED", sent: "2026-10-02" }), "ENDORSED without endorsement and effective dates refused", /endorsed_chk/);
await rejects(() => ins({ name: "Dr. D", state: "ENTERED", sent: "2026-10-02", boe: "2026-10-03", eff: "2027-01-01" }), "ENTERED without an appointment refused", /entered_chk/);
await rejects(() => ins({ name: "Dr. E", state: "NOT_ENDORSED", sent: "2026-10-02" }), "NOT_ENDORSED without a reason refused", /closed_chk/);
await rejects(() => ins({ name: "Dr. F", state: "WITHDRAWN", why: "   " }), "WITHDRAWN with a blank reason refused", /closed_chk/);
await rejects(() => ins({ name: "Dr. G", state: "BOARD", recv: "2026-10-10", sent: "2026-10-01" }), "sent to Board before it was received refused", /dates_chk/);
await ins({ name: "Dr. H", state: "NOT_ENDORSED", sent: "2026-10-02", why: "Board asked for another nominee" });
ok(true, "NOT_ENDORSED with sent date and reason accepted");

await ins({ name: "Dr. Open", h: H[1] });
await rejects(() => ins({ name: "dr. open", h: H[1] }), "second open nomination for the same hospital, role and nominee refused (case-insensitive)", /open_uq/);
await ins({ name: "Dr. Open", h: H[1], role: "ASSISTANT_SOT" });
ok(true, "same nominee for the other role is allowed");
const closedId = (await ins({ name: "Dr. Again", h: H[1], state: "WITHDRAWN", why: "Withdrawn by the Chief of Service" }))[0].id;
await ins({ name: "Dr. Again", h: H[1] });
ok(!!closedId, "a closed nomination does not block a new one for the same person");

await rejects(() => q(`DELETE FROM "Hospital" WHERE id=$1`, [H[0]]), "a hospital with nominations cannot be deleted", /RESTRICT|foreign key/);
await rejects(() => q(`INSERT INTO "SotNomination" (id,"hospitalId",role,"nomineeName","receivedOn") VALUES (gen_random_uuid()::text,'no-such-hospital','SOT','Dr. X','2026-10-01')`), "unknown hospital refused", /foreign key/);
const orphans = (await q(`SELECT count(*)::int n FROM "SotNomination" n LEFT JOIN "Hospital" h ON h.id=n."hospitalId" WHERE h.id IS NULL`))[0].n;
ok(orphans === 0, "no orphan nominations");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
