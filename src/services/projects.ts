import { supabase } from "../lib/supabase";
import { allRows, requireTracking, trackingReady } from "./data";
import { billingFigures, money, type Closure } from "../utils/billing";
import type {
  ClientOption,
  ProjectFormValues,
  ProjectListOptions,
  ProjectListResult,
  ProjectSummary,
} from "../types/domain";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null || v === "" ? null : String(v));
const n = (v: unknown) => money(v);
export async function listProjectSummaries(
  financialYearId?: string,
): Promise<ProjectSummary[]> {
  const [projects, invoices, years, clients, users, schedules] =
    await Promise.all(
      [
        "projects",
        "project_invoices",
        "financial_years",
        "clients",
        "users",
        "ra_bill_schedules",
      ].map((table) => allRows<Row>(table)),
    );
  const fy = financialYearId
    ? years.find((y) => y.id === financialYearId)
    : years
        .filter((y) => y.active)
        .sort((a, b) =>
          String(b.start_date).localeCompare(String(a.start_date)),
        )[0];
  if (!fy)
    throw new Error(
      "Select an active financial year in Financial Years before viewing project billing.",
    );
  const { data: orderRows, error: orderError } = await supabase
    .from("project_orders")
    .select("id")
    .limit(0);
  void orderRows;
  if (orderError && !["42P01", "PGRST205"].includes(orderError.code))
    throw new Error(orderError.message);
  const orders = orderError ? [] : await allRows<Row>("project_orders");
  return projects.map((p) => {
    const projectInvoices = invoices.filter(
      (i) =>
        i.project_id === p.id && String(i.invoice_date) <= String(fy.end_date),
    );
    const prior = projectInvoices
      .filter((i) => String(i.invoice_date) < String(fy.start_date))
      .reduce((sum, i) => sum + n(i.amount_before_gst), 0);
    const current = projectInvoices
      .filter((i) => String(i.invoice_date) >= String(fy.start_date))
      .reduce((sum, i) => sum + n(i.amount_before_gst), 0);
    const projectOrders = orders.filter((o) => o.project_id === p.id);
    const activeOrders = projectOrders.filter((o) => o.status === "active");
    const base = projectOrders.length
      ? money(activeOrders.reduce((sum, o) => sum + n(o.base_value), 0))
      : n(p.base_wo_value);
    const gst = projectOrders.length
      ? money(activeOrders.reduce((sum, o) => sum + n(o.gst_value), 0))
      : n(p.gst_value);
    const plans = schedules
      .filter(
        (r) =>
          r.project_id === p.id &&
          !["raised", "completed", "cancelled"].includes(
            String(r.bill_status),
          ) &&
          String(r.proposed_bill_date) >= String(fy.start_date) &&
          String(r.proposed_bill_date) <= String(fy.end_date),
      )
      .sort((a, b) =>
        String(a.proposed_bill_date).localeCompare(
          String(b.proposed_bill_date),
        ),
      );
    const planned = money(
      plans.reduce((sum, r) => sum + n(r.proposed_bill_amount), 0),
    );
    const closure = (p.billing_closure ?? "open") as Closure;
    const figures = billingFigures(
      base,
      n(p.opening_invoiced_amount),
      prior,
      current,
      p.carry_forward !== false,
      closure,
      planned,
    );
    return {
      ...p,
      order_count: projectOrders.length,
      main_project_id: str(p.main_project_id),
      id: String(p.id),
      project_code: String(p.project_code),
      project_name: String(p.project_name),
      client_id: str(p.client_id),
      client_name: str(clients.find((c) => c.id === p.client_id)?.name),
      project_manager_id: str(p.project_manager_id),
      project_manager_name: str(
        users.find((u) => u.id === p.project_manager_id)?.name,
      ),
      location: str(p.location),
      wo_number: str(p.wo_number),
      wo_date: str(p.wo_date),
      project_start_date: str(p.project_start_date),
      expected_completion_date: str(p.expected_completion_date),
      project_status: p.project_status as ProjectSummary["project_status"],
      project_description: str(p.project_description),
      base_wo_value: base,
      gst_value: gst,
      total_wo_value: money(base + gst),
      billing_target: base,
      opening_invoiced_amount: figures.historical,
      prior_invoiced_amount: money(prior),
      current_invoiced_amount: money(current),
      total_invoiced_amount: figures.total,
      fy_billing_target: figures.fyTarget,
      raw_remaining_amount: figures.rawRemaining,
      pending_billing_amount: figures.pending,
      billing_percentage: figures.percentage,
      last_invoice_date:
        projectInvoices
          .map((i) => String(i.invoice_date))
          .sort()
          .pop() ?? null,
      next_proposed_billing_date: str(plans[0]?.proposed_bill_date),
      proposed_billing_amount: n(plans[0]?.proposed_bill_amount),
      future_planned_billing: planned,
      carry_forward: p.carry_forward !== false,
      billing_closure: closure,
      closure_remarks: str(p.closure_remarks),
      remarks: str(p.remarks),
      billing_status:
        closure === "open" &&
        p.project_status === "completed" &&
        figures.pending > 0
          ? "Completed Project - Billing Pending"
          : figures.status,
    };
  });
}
export async function listClients(): Promise<ClientOption[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id,name")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function listProjectManagers(): Promise<
  { id: string; name: string }[]
> {
  const { data, error } = await supabase
    .from("users")
    .select("id,name")
    .eq("active", true)
    .in("role", ["admin", "project_admin", "project_manager"])
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function listProjects(
  options: ProjectListOptions | string = {},
): Promise<ProjectListResult> {
  const o = typeof options === "string" ? { search: options } : options;
  const search = (o.search ?? "").trim().toLowerCase();
  let rows = (await listProjectSummaries()).filter(
    (p) =>
      (!search ||
        [
          p.project_code,
          p.project_name,
          p.client_name,
          p.wo_number,
          p.project_description,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)) &&
      (!o.clientId || p.client_id === o.clientId) &&
      (!o.managerId || p.project_manager_id === o.managerId) &&
      (!o.status || p.project_status === o.status) &&
      (!o.billingStatus || p.billing_status === o.billingStatus),
  );
  const field = o.sortBy ?? "project_code";
  const direction = o.sortDirection === "descending" ? -1 : 1;
  rows.sort(
    (a, b) =>
      direction *
      (typeof a[field] === "number"
        ? Number(a[field]) - Number(b[field])
        : String(a[field] ?? "").localeCompare(String(b[field] ?? ""))),
  );
  const count = rows.length;
  const size = o.pageSize ?? 25;
  const start = ((o.page ?? 1) - 1) * size;
  rows = rows.slice(start, start + size);
  return { rows, count };
}
export async function getProject(id: string) {
  return (await listProjectSummaries()).find((p) => p.id === id) ?? null;
}
export function createEmptyProjectForm(): ProjectFormValues {
  return {
    main_project_id: "",
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
    remarks: "",
    project_description: "",
    project_manager_id: "",
    carry_forward: true,
    billing_closure: "open",
    closure_remarks: "",
  };
}
export function projectToForm(p: ProjectSummary): ProjectFormValues {
  return {
    ...createEmptyProjectForm(),
    main_project_id: p.main_project_id ?? "",
    project_name: p.project_name,
    client_id: p.client_id ?? "",
    location: p.location ?? "",
    wo_number: p.wo_number ?? "",
    wo_date: p.wo_date ?? "",
    project_start_date: p.project_start_date ?? "",
    expected_completion_date: p.expected_completion_date ?? "",
    project_status: p.project_status,
    base_wo_value: String(p.base_wo_value),
    gst_value: String(p.gst_value),
    billing_target: String(p.base_wo_value),
    // Recorded prior-year invoices are calculated separately from the manual opening balance.
    opening_invoiced_amount: String(
      money(p.opening_invoiced_amount - p.prior_invoiced_amount),
    ),
    remarks: p.remarks ?? "",
    project_description: p.project_description ?? "",
    project_manager_id: p.project_manager_id ?? "",
    carry_forward: p.carry_forward,
    billing_closure: p.billing_closure,
    closure_remarks: p.closure_remarks ?? "",
  };
}
export async function saveProject(v: ProjectFormValues, id?: string) {
  if (!v.project_name.trim()) throw new Error("Project name is required.");
  if (
    ["closed", "cancelled_balance"].includes(v.billing_closure) &&
    !v.closure_remarks.trim()
  )
    throw new Error("A closure reason is required.");
  if (
    v.expected_completion_date &&
    v.project_start_date &&
    v.expected_completion_date < v.project_start_date
  )
    throw new Error("Completion cannot be before the start date.");
  const enhanced =
    !!v.project_description ||
    !!v.project_manager_id ||
    !v.carry_forward ||
    v.billing_closure !== "open" ||
    !!v.closure_remarks;
  const ready = await trackingReady();
  if (enhanced && !ready) await requireTracking();
  const payload = {
    project_name: v.project_name.trim(),
    client_id: v.client_id || null,
    location: v.location.trim() || null,
    wo_number: v.wo_number.trim() || null,
    wo_date: v.wo_date || null,
    project_start_date: v.project_start_date || null,
    expected_completion_date: v.expected_completion_date || null,
    project_manager_id: v.project_manager_id || null,
    project_status: v.project_status,
    base_wo_value: money(v.base_wo_value),
    gst_value: money(v.gst_value),
    billing_target: money(v.base_wo_value),
    opening_invoiced_amount: money(v.opening_invoiced_amount),
    remarks: v.remarks.trim() || null,
    ...(v.main_project_id ? { main_project_id: v.main_project_id } : {}),
    ...(ready
      ? {
          project_description: v.project_description.trim() || null,
          carry_forward: v.carry_forward,
          billing_closure: v.billing_closure,
          closure_remarks: v.closure_remarks.trim() || null,
        }
      : {}),
  };
  const result = id
    ? await supabase.from("projects").update(payload).eq("id", id)
    : await supabase.from("projects").insert(payload);
  if (result.error)
    throw new Error(
      result.error.code === "23505"
        ? "Project code or WO number already exists."
        : result.error.message,
    );
}
export async function archiveProject(id: string) {
  const { error } = await supabase
    .from("projects")
    .update({ project_status: "cancelled" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
