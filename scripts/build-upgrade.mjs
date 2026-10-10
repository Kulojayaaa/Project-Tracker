import { readFileSync, writeFileSync } from "node:fs";
const files = [
  "004_dc_linking_and_audit",
  "005_operational_tracking_views",
  "006_workbook_tracking",
  "007_private_project_documents",
  "008_main_project_grouping",
];
const parts = files.map((name) => {
  const sql = readFileSync(`supabase/migrations/${name}.sql`, "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^begin;\s*/i, "")
    .replace(/commit;\s*$/i, "");
  return `-- ${name}\n${sql}`;
});
writeFileSync(
  "docs/LIVE_DATABASE_UPGRADE.sql",
  "-- Apply once in the existing Supabase project's SQL Editor.\n-- All changes commit together; failure rolls back the upgrade.\nbegin;\n" +
    parts.join("\n\n") +
    "\ncommit;\n",
);
writeFileSync(
  "docs/MAIN_PROJECT_GROUPING_UPGRADE.sql",
  readFileSync("supabase/migrations/008_main_project_grouping.sql", "utf8"),
);
console.log("Database upgrade files generated.");
