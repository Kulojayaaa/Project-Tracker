import { supabase } from "../lib/supabase";
import type { ClientOption, ProjectFormValues, ProjectStatus, ProjectSummary } from "../types/domain";

const projectSelect = `
  id,
  project_code,
  project_name,
  client_id,
  clients(name),
  location,
  wo_number,
  wo_date,
  project_start_date,
  expected_completion_date,
  project_status,
  base_wo_value,
  gst_value,
  total_wo_value,
  billing_target,
  opening_invoiced_amount,
  remarks
`;

type ProjectRow = {
  id: string;
  project_code: string;
  project_name: string;
  client_id: string | null;
  clients: { name: string | null } | { name: string | null }[] | null;
  location: string | null;
  wo_number: string | null;
  wo_date: string | null;
  project_start_date: string | null;
  expected_completion_date: string | null;
  project_status: ProjectStatus;
  base_wo_value: number | string;
  gst_value: number | string;
  total_wo_value: number | string;
  billing_target: number | string;
  opening_invoiced_amount: number | string;
  remarks: string | null;
};

type BillingSummaryRow = {
  id: string;
  current_invoiced_amount: number | string | null;
  total_invoiced_amount: number | string | null;
  pending_billing_amount: number | string | null;
  billing_percentage: number | string | null;
};

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function numberFromInput(value: string) {
  return Number(value || 0);
}

function clientName(row: ProjectRow) {
  if (Array.isArray(row.clients)) {
    return row.clients[0]?.name ?? null;
  }

  return row.clients?.name ?? null;
}

function mapProject(row: ProjectRow, summary?: BillingSummaryRow): ProjectSummary {
  return {
    id: row.id,
    project_code: row.project_code,
    project_name: row.project_name,
    client_id: row.client_id,
    client_name: clientName(row),
    location: row.location,
    wo_number: row.wo_number,
    wo_date: row.wo_date,
    project_start_date: row.project_start_date,
    expected_completion_date: row.expected_completion_date,
    project_status: row.project_status,
    base_wo_value: toNumber(row.base_wo_value),
    gst_value: toNumber(row.gst_value),
    total_wo_value: toNumber(row.total_wo_value),
    billing_target: toNumber(row.billing_target),
    opening_invoiced_amount: toNumber(row.opening_invoiced_amount),
    current_invoiced_amount: toNumber(summary?.current_invoiced_amount),
    total_invoiced_amount: toNumber(summary?.total_invoiced_amount ?? row.opening_invoiced_amount),
    pending_billing_amount: toNumber(summary?.pending_billing_amount ?? row.billing_target),
    billing_percentage: toNumber(summary?.billing_percentage),
    remarks: row.remarks
  };
}

export async function listClients(): Promise<ClientOption[]> {
  const { data, error } = await supabase.from("clients").select("id, name").eq("active", true).order("name");

  if (error) {
    throw new Error("Unable to load clients. Please try again.");
  }

  return data ?? [];
}

export async function listProjects(search: string): Promise<ProjectSummary[]> {
  const cleanedSearch = search.trim();
  let query = supabase.from("projects").select(projectSelect).order("created_at", { ascending: false }).limit(100);

  if (cleanedSearch) {
    query = query.or(
      `project_code.ilike.%${cleanedSearch}%,project_name.ilike.%${cleanedSearch}%,wo_number.ilike.%${cleanedSearch}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Unable to load projects. Please check your connection and Supabase permissions.");
  }

  const projectRows = (data ?? []) as ProjectRow[];
  const ids = projectRows.map((project) => project.id);
  const summaries = new Map<string, BillingSummaryRow>();

  if (ids.length) {
    const { data: summaryData, error: summaryError } = await supabase
      .from("project_billing_summary")
      .select("id, current_invoiced_amount, total_invoiced_amount, pending_billing_amount, billing_percentage")
      .in("id", ids);

    if (!summaryError) {
      for (const summary of (summaryData ?? []) as BillingSummaryRow[]) {
        summaries.set(summary.id, summary);
      }
    }
  }

  return projectRows.map((project) => mapProject(project, summaries.get(project.id)));
}

export function createEmptyProjectForm(): ProjectFormValues {
  return {
    project_name: "",
    client_id: "",
    location: "",
    wo_number: "",
    wo_date: "",
    project_start_date: "",
    expected_completion_date: "",
    project_status: "planned",
    base_wo_value: "",
    gst_value: "",
    billing_target: "",
    opening_invoiced_amount: "",
    remarks: ""
  };
}

export function projectToForm(project: ProjectSummary): ProjectFormValues {
  return {
    project_name: project.project_name,
    client_id: project.client_id ?? "",
    location: project.location ?? "",
    wo_number: project.wo_number ?? "",
    wo_date: project.wo_date ?? "",
    project_start_date: project.project_start_date ?? "",
    expected_completion_date: project.expected_completion_date ?? "",
    project_status: project.project_status,
    base_wo_value: String(project.base_wo_value || ""),
    gst_value: String(project.gst_value || ""),
    billing_target: String(project.billing_target || ""),
    opening_invoiced_amount: String(project.opening_invoiced_amount || ""),
    remarks: project.remarks ?? ""
  };
}

function toProjectPayload(values: ProjectFormValues) {
  const baseWoValue = numberFromInput(values.base_wo_value);
  const gstValue = numberFromInput(values.gst_value);
  const billingTarget = values.billing_target.trim() ? numberFromInput(values.billing_target) : baseWoValue + gstValue;

  return {
    project_name: values.project_name.trim(),
    client_id: values.client_id || null,
    location: emptyToNull(values.location),
    wo_number: emptyToNull(values.wo_number),
    wo_date: values.wo_date || null,
    project_start_date: values.project_start_date || null,
    expected_completion_date: values.expected_completion_date || null,
    project_status: values.project_status,
    base_wo_value: baseWoValue,
    gst_value: gstValue,
    billing_target: billingTarget,
    opening_invoiced_amount: numberFromInput(values.opening_invoiced_amount),
    remarks: emptyToNull(values.remarks)
  };
}

export async function saveProject(values: ProjectFormValues, projectId?: string): Promise<void> {
  if (!values.project_name.trim()) {
    throw new Error("Project name is required.");
  }

  const payload = toProjectPayload(values);
  const result = projectId
    ? await supabase.from("projects").update(payload).eq("id", projectId)
    : await supabase.from("projects").insert(payload);

  if (result.error) {
    if (result.error.code === "23505") {
      throw new Error("Project code or WO number already exists. Please check the project details.");
    }

    throw new Error(result.error.message || "Unable to save project. Please try again.");
  }
}

export async function archiveProject(projectId: string): Promise<void> {
  const { error } = await supabase.from("projects").update({ project_status: "cancelled" }).eq("id", projectId);

  if (error) {
    throw new Error("Unable to archive this project. Please try again.");
  }
}


