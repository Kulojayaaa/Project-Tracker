import type { ImportProject } from "../services/trackerWorkbook";
export type ImportGroup = {
  group_key: string;
  project_name: string;
  client_name: string;
  source_codes: string[];
};
export function workbookGroups(rows: ImportProject[]): ImportGroup[] {
  const groups = new Map<string, ImportGroup>();
  for (const row of rows) {
    let name = row.project_name.trim();
    // The owner confirmed lake additional works belong with the lake, not the bunker.
    if (
      name === "Prestige Lake Additional Works" &&
      rows.some(
        (p) =>
          p.project_name.trim() === "Prestige Lake Works" &&
          p.client_name === row.client_name,
      )
    )
      name = "Prestige Lake Works";
    const key = JSON.stringify([
      row.client_name.trim().toLowerCase(),
      name.toLowerCase(),
    ]);
    const group = groups.get(key) ?? {
      group_key: row.project_code,
      project_name: name,
      client_name: row.client_name,
      source_codes: [],
    };
    group.source_codes.push(row.project_code);
    groups.set(key, group);
  }
  return [...groups.values()];
}
