import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

async function runSeed() {
  const pg = new PGlite();
  // Apply every migration in numeric order (0_init, 1_..., 2_...)
  const migrationDirs = fs.readdirSync("db/migrations").filter(d => /^\d+_/.test(d)).sort((x, y) => parseInt(x) - parseInt(y));
  for (const d of migrationDirs) {
    await pg.exec(fs.readFileSync(`db/migrations/${d}/migration.sql`, "utf-8"));
  }

  const rawSeed = JSON.parse(fs.readFileSync("db/seeds/synthetic_seed.json", "utf-8"));
  
  // Dependency-ordered tables
  const orderedTables = [
    "Cluster",
    "Hospital",
    "HospitalClusterHistory",
    "AccreditedCentre",
    "CurriculumEdition",
    "CurriculumRule",
    "CurriculumDescriptor",
    "AssessmentTool",
    "User",
    "TrainerProfile",
    "TraineeProfile",
    "Rotation",
    "ItaSession",
    "ItaAssessorResponse",
    "ItaAppeal",
    "RemedialPlan",
    "AccreditedTimeLedger",
    "VolumeOfPractice",
    "CaseBlock",
    "WbaAssessment",
    "AuditLog"
  ];

  let totalRows = 0;
  for (const table of orderedTables) {
    const rows = rawSeed[table];
    if (!rows || rows.length === 0) continue;

    for (const row of rows) {
      const keys = Object.keys(row);
      const cols = keys.map(k => `"${k}"`).join(", ");
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      
      const values = keys.map(k => {
        let val = row[k];
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
          return JSON.stringify(val);
        }
        return val;
      });

      const sql = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders});`;
      try {
        await pg.query(sql, values);
        totalRows++;
      } catch (err) {
        console.error(`Error inserting into ${table}:`, err.message, "Row:", row);
        throw err;
      }
    }
    console.log(`✓ Seeded ${table}: ${rows.length} rows`);
  }

  console.log(`\n🎉 Seed completed successfully! Total rows inserted: ${totalRows}`);
  
  // Verify foreign key relations and counts
  const traineeCount = await pg.query('SELECT count(*) FROM "TraineeProfile";');
  const vopCount = await pg.query('SELECT count(*) FROM "VolumeOfPractice";');
  const itaCount = await pg.query('SELECT count(*) FROM "ItaSession";');
  const wbaCount = await pg.query('SELECT count(*) FROM "WbaAssessment";');
  console.log(`Verification:`);
  console.log(`- Trainees: ${traineeCount.rows[0].count}`);
  console.log(`- VOP Cases: ${vopCount.rows[0].count}`);
  console.log(`- ITA Sessions: ${itaCount.rows[0].count}`);
  console.log(`- WBAs: ${wbaCount.rows[0].count}`);
}

runSeed().catch(err => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
