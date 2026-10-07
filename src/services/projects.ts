import { supabase } from "../lib/supabase";
import type {
  ClientOption,
  ProjectFormValues,
  ProjectListOptions,
  ProjectListResult,
  ProjectStatus,
  ProjectSummary
} from "../types/domain";

type ProjectSummaryRow = {
  id: string;
  project_code: string;
  project_name: string;
  client_id: string | null;
  client_name: string | null;
  location: string | null;
  wo_number: string | null;
  wo_date: string | null;
  project_start_date: string | null;
  expected_completion_date: string | null;
  project_manager_id: string | null;
  project_manager_name: string | null;
  project_status: ProjectStatus;
  base_wo_value: number | string;
  gst_value: number | string;
  total_wo_value: number | string;
  billing_target: number | string;
  opening_invoiced_amount: number | string;
  current_invoiced_amount: number | string | null;
  total_invoiced_amount: number | string | null;
  pending_billing_amount: number | string | null;
  billing_percentage: number | string | null;
  last_invoice_date: string | null;
  next_proposed_billing_date: string | null;
  proposed_billing_amount: number | string | null;
  future_planned_billing: number | string | null;
  billing_status: string | null;
  remarks: string | null;
};

type ProjectManagerOption = {
  id: string;
  name: string;
};

const projectSummarySelect = `
  id,
  project_code,
  project_name,
  client_id,
  client_name,
  location,
  wo_number,
  wo_date,
  project_start_date,
  expected_completion_date,
  project_manager_id,
  project_manager_name,
  project_status,
  base_wo_value,
  gst_value,
  total_wo_value,
  billing_target,
  opening_invoiced_amount,
  current_invoiced_amount,
  total_invoiced_amount,
  pending_billing_amount,
  billing_percentage,
  last_invoice_date,
  next_proposed_billing_date,
  proposed_billing_amount,
  future_planned_billing,
  billing_status,
  remarks
`;

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

function mapProject(row: ProjectSummaryRow): ProjectSummary {
  return {
    id: row.id,
    project_code: row.project_code,
    project_name: row.project_name,
    client_id: row.client_id,
    client_name: row.client_name,
    location: row.location,
    wo_number: row.wo_number,
    wo_date: row.wo_date,
    project_start_date: row.project_start_date,
    expected_completion_date: row.expected_completion_date,
    project_manager_id: row.project_manager_id,
    project_manager_name: row.project_manager_name,
    project_status: row.project_status,
    base_wo_value: toNumber(row.base_wo_value),
    gst_value: toNumber(row.gst_value),
    total_wo_value: toNumber(row.total_wo_value),
    billing_target: toNumber(row.billing_target),
    opening_invoiced_amount: toNumber(row.opening_invoiced_amount),
    current_invoiced_amount: toNumber(row.current_invoiced_amount),
    total_invoiced_amount: toNumber(row.total_invoiced_amount),
    pending_billing_amount: toNumber(row.pending_billing_amount),
    billing_percentage: toNumber(row.billing_percentage),
    last_invoice_date: row.last_invoice_date,
    next_proposed_billing_date: row.next_proposed_billing_date,
    proposed_billing_amount: toNumber(row.proposed_billing_amount),
    future_planned_billing: toNumber(row.future_planned_billing),
    billing_status: row.billing_status ?? "Billing Plan Shortfall",
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

export async function listProjectManagers(): Promise<ProjectManagerOption[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id, name")
    .eq("active", true)
    .in("role", ["admin", "project_admin", "project_manager"])
    .order("name");

  if (error) {
    return [];
  }

  return data ?? [];
}

export async function listProjects(options: ProjectListOptions | string = {}): Promise<ProjectListResult> {
  const normalized: ProjectListOptions = typeof options === "string" ? { search: options } : options;
  const page = normalized.page ?? 1;
  const pageSize = normalized.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortBy = normalized.sortBy ?? "project_code";
  const sortDirection = normalized.sortDirection ?? "ascending";
  const cleanedSearch = normalized.search?.trim() ?? "";

  let query = supabase
    .from("project_billing_summary")
    .select(projectSummarySelect, { count: "exact" })
    .order(sortBy, { ascending: sortDirection === "ascending", nullsFirst: false })
    .range(from, to);

  if (cleanedSearch) {
    query = query.or(
      `project_code.ilike.%${cleanedSearch}%,project_name.ilike.%${cleanedSearch}%,client_name.ilike.%${cleanedSearch}%,wo_number.ilike.%${cleanedSearch}%`
    );
  }

  if (normalized.clientId) query = query.eq("client_id", normalized.clientId);
  if (normalized.managerId) query = query.eq("project_manager_id", normalized.managerId);
  if (normalized.status) query = query.eq("project_status", normalized.status);
  if (normalized.billingStatus) query = query.eq("billing_status", normalized.billingStatus);

  const { data, error, count } = await query;

  if (error) {
    throw new Error("Unable to load projects. Please check your connection and Supabase permissions.");
  }

  return { rows: ((data ?? []) as ProjectSummaryRow[]).map(mapProject), count: count ?? 0 };
}

export async function getProject(projectId: string): Promise<ProjectSummary | null> {
  const { data, error } = await supabase
    .from("project_billing_summary")
    .select(projectSummarySelect)
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load project details.");
  }

  return data ? mapProject(data as ProjectSummaryRow) : null;
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
