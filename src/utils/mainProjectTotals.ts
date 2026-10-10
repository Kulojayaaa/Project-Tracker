import { money } from "./billing";
import type { MainProject, MainSummary } from "../services/mainProjects";
import type { ProjectSummary } from "../types/domain";
export function rollupMainProjects(
  groups: MainProject[],
  scopes: ProjectSummary[],
): MainSummary[] {
  return groups.map((group) => {
    const members = scopes.filter((s) => s.main_project_id === group.id);
    const sum = (field: keyof ProjectSummary) =>
      money(members.reduce((n, s) => n + Number(s[field] ?? 0), 0));
    return {
      ...group,
      client_name: members[0]?.client_name ?? "",
      scopes: members,
      base: sum("base_wo_value"),
      historical: sum("opening_invoiced_amount"),
      fyTarget: sum("fy_billing_target"),
      current: sum("current_invoiced_amount"),
      total: sum("total_invoiced_amount"),
      pending: sum("pending_billing_amount"),
      rawBalance: sum("raw_remaining_amount"),
      planned: sum("future_planned_billing"),
    };
  });
}
