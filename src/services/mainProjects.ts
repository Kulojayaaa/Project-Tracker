import { supabase } from "../lib/supabase";
import { allRows } from "./data";
import { listProjectSummaries } from "./projects";
import { rollupMainProjects } from "../utils/mainProjectTotals";
export { rollupMainProjects } from "../utils/mainProjectTotals";
import type { ProjectSummary } from "../types/domain";
export type MainProject = {
  id: string;
  project_code: string;
  project_name: string;
  client_id: string;
  location: string | null;
  description: string | null;
};
export type MainSummary = MainProject & {
  client_name: string;
  scopes: ProjectSummary[];
  base: number;
  historical: number;
  fyTarget: number;
  current: number;
  total: number;
  pending: number;
  rawBalance: number;
  planned: number;
};
export async function mainProjectsReady() {
  const { error } = await supabase.from("project_groups").select("id").limit(0);
  if (!error) return true;
  if (["42P01", "PGRST205"].includes(error.code)) return false;
  throw new Error(error.message);
}
export async function listMainProjectOptions(): Promise<MainProject[]> {
  if (!(await mainProjectsReady())) return [];
  const rows = await allRows<MainProject>("project_groups");
  return rows.sort((a, b) => a.project_name.localeCompare(b.project_name));
}
export async function listMainProjectSummaries() {
  if (!(await mainProjectsReady()))
    throw new Error(
      "Apply the main-project grouping upgrade before using Project Master.",
    );
  const groups = await listMainProjectOptions();
  const scopes = await listProjectSummaries();
  const clients = await allRows<{ id: string; name: string }>("clients");
  return {
    groups: rollupMainProjects(groups, scopes).map((g) => ({
      ...g,
      client_name:
        clients.find((c) => c.id === g.client_id)?.name ?? g.client_name,
    })),
    unassigned: scopes.filter((s) => !s.main_project_id),
  };
}
export async function saveMainProject(
  values: {
    project_name: string;
    client_id: string;
    location: string;
    description: string;
  },
  id?: string,
) {
  if (!values.project_name.trim() || !values.client_id)
    throw new Error("Project name and client are required.");
  const payload = {
    ...values,
    project_name: values.project_name.trim(),
    location: values.location.trim() || null,
    description: values.description.trim() || null,
  };
  const { error } = id
    ? await supabase.from("project_groups").update(payload).eq("id", id)
    : await supabase.from("project_groups").insert(payload);
  if (error)
    throw new Error(
      error.code === "23505"
        ? "This main project already exists for this client."
        : error.message,
    );
}
export async function assignMainProject(scopeIds: string[], mainId: string) {
  const { error } = await supabase.rpc("assign_main_project", {
    scope_ids: scopeIds,
    main_id: mainId,
  });
  if (error) throw new Error(error.message);
}
