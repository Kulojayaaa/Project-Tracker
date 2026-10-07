import { supabase } from "../lib/supabase";
import type {
  BillStatus,
  ClientOption,
  DcFormValues,
  DcRecord,
  FinancialYearOption,
  InvoiceFormValues,
  InvoiceRecord,
  ProjectOption,
  RaScheduleFormValues,
  RaScheduleRecord,
  SalesFormValues,
  SalesRecord
} from "../types/domain";

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function relationName(value: unknown, field = "name") {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown> | undefined)?.[field] as string | null | undefined ?? null;
  }

  return (value as Record<string, unknown> | null | undefined)?.[field] as string | null | undefined ?? null;
}

function relationValue(value: unknown, field: string) {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown> | undefined)?.[field] ?? null;
  }

  return (value as Record<string, unknown> | null | undefined)?.[field] ?? null;
}

export async function listFinancialYears(): Promise<FinancialYearOption[]> {
  const { data, error } = await supabase
    .from("financial_years")
    .select("id, name, sales_target, active")
    .order("start_date", { ascending: false });

  if (error) throw new Error("Unable to load financial years.");

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sales_target: toNumber(row.sales_target),
    active: Boolean(row.active)
  }));
}

export async function listProjectOptions(): Promise<ProjectOption[]> {
  const { data, error } = await supabase
    .from("project_billing_summary")
    .select("id, project_code, project_name, client_name, wo_number, total_wo_value, total_invoiced_amount, pending_billing_amount")
    .order("project_code");

  if (error) throw new Error("Unable to load project options.");

  return (data ?? []).map((row) => ({
    id: row.id,
    project_code: row.project_code,
    project_name: row.project_name,
    client_name: row.client_name,
    wo_number: row.wo_number,
    total_wo_value: toNumber(row.total_wo_value),
    total_invoiced_amount: toNumber(row.total_invoiced_amount),
    pending_billing_amount: toNumber(row.pending_billing_amount)
  }));
}

export async function listClientOptions(): Promise<ClientOption[]> {
  const { data, error } = await supabase.from("clients").select("id, name").eq("active", true).order("name");
  if (error) throw new Error("Unable to load clients.");
  return data ?? [];
}

export async function listInvoiceOptions(): Promise<{ id: string; invoice_number: string; total_amount: number; invoice_date: string }[]> {
  const { data, error } = await supabase
    .from("project_invoices")
    .select("id, invoice_number, total_amount, invoice_date")
    .order("invoice_date", { ascending: false })
    .limit(200);

  if (error) throw new Error("Unable to load invoices.");

  return (data ?? []).map((row) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    total_amount: toNumber(row.total_amount),
    invoice_date: row.invoice_date
  }));
}

export function createEmptyInvoiceForm(activeFyId = ""): InvoiceFormValues {
  return {
    invoice_number: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    project_id: "",
    invoice_type: "RA Bill",
    invoice_description: "",
    billing_period_from: "",
    billing_period_to: "",
    amount_before_gst: "",
    gst_amount: "",
    financial_year_id: activeFyId
  };
}

export async function listInvoices(search = ""): Promise<InvoiceRecord[]> {
  let query = supabase
    .from("project_invoices")
    .select("*, projects(project_code, project_name, clients(name)), financial_years(name)")
    .order("invoice_date", { ascending: false })
    .limit(200);

  if (search.trim()) {
    query = query.ilike("invoice_number", `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error("Unable to load invoice register.");

  return (data ?? []).map((row) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    invoice_date: row.invoice_date,
    project_id: row.project_id,
    project_code: relationValue(row.projects, "project_code") as string | null,
    project_name: relationValue(row.projects, "project_name") as string | null,
    client_name: relationName(relationValue(row.projects, "clients")),
    invoice_type: row.invoice_type,
    invoice_description: row.invoice_description,
    billing_period_from: row.billing_period_from,
    billing_period_to: row.billing_period_to,
    amount_before_gst: toNumber(row.amount_before_gst),
    gst_amount: toNumber(row.gst_amount),
    total_amount: toNumber(row.total_amount),
    financial_year_id: row.financial_year_id,
    financial_year_name: relationName(row.financial_years)
  }));
}

export async function saveInvoice(values: InvoiceFormValues, id?: string) {
  const payload = {
    invoice_number: values.invoice_number.trim(),
    invoice_date: values.invoice_date,
    project_id: values.project_id,
    invoice_type: values.invoice_type,
    invoice_description: emptyToNull(values.invoice_description),
    billing_period_from: values.billing_period_from || null,
    billing_period_to: values.billing_period_to || null,
    amount_before_gst: toNumber(values.amount_before_gst),
    gst_amount: toNumber(values.gst_amount),
    financial_year_id: values.financial_year_id || null
  };

  const result = id
    ? await supabase.from("project_invoices").update(payload).eq("id", id)
    : await supabase.from("project_invoices").insert(payload);

  if (result.error) {
    if (result.error.code === "23505") throw new Error("Invoice number already exists. Please check the invoice number.");
    throw new Error(result.error.message || "Unable to save invoice.");
  }
}

export function invoiceToForm(invoice: InvoiceRecord): InvoiceFormValues {
  return {
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    project_id: invoice.project_id,
    invoice_type: invoice.invoice_type,
    invoice_description: invoice.invoice_description ?? "",
    billing_period_from: invoice.billing_period_from ?? "",
    billing_period_to: invoice.billing_period_to ?? "",
    amount_before_gst: String(invoice.amount_before_gst || ""),
    gst_amount: String(invoice.gst_amount || ""),
    financial_year_id: invoice.financial_year_id ?? ""
  };
}

export function createEmptyRaForm(): RaScheduleFormValues {
  return {
    project_id: "",
    billing_period: "",
    billing_period_from: "",
    billing_period_to: "",
    proposed_bill_date: new Date().toISOString().slice(0, 10),
    proposed_bill_amount: "",
    billing_type: "RA Bill",
    work_status: "",
    bill_status: "planned",
    actual_invoice_id: "",
    reason_not_raised: "",
    remarks: ""
  };
}

export async function listRaSchedules(): Promise<RaScheduleRecord[]> {
  const { data, error } = await supabase
    .from("ra_bill_schedules")
    .select("*, projects(project_code, project_name), project_invoices(invoice_number)")
    .order("proposed_bill_date", { ascending: true })
    .limit(300);

  if (error) throw new Error("Unable to load RA bill schedules.");

  return (data ?? []).map((row) => ({
    id: row.id,
    project_id: row.project_id,
    project_code: relationValue(row.projects, "project_code") as string | null,
    project_name: relationValue(row.projects, "project_name") as string | null,
    billing_period: row.billing_period,
    billing_period_from: row.billing_period_from,
    billing_period_to: row.billing_period_to,
    proposed_bill_date: row.proposed_bill_date,
    proposed_bill_amount: toNumber(row.proposed_bill_amount),
    billing_type: row.billing_type,
    work_status: row.work_status,
    bill_status: row.bill_status as BillStatus,
    actual_invoice_id: row.actual_invoice_id,
    actual_invoice_number: relationValue(row.project_invoices, "invoice_number") as string | null,
    actual_invoice_date: row.actual_invoice_date,
    actual_invoice_amount: row.actual_invoice_amount === null ? null : toNumber(row.actual_invoice_amount),
    reason_not_raised: row.reason_not_raised,
    remarks: row.remarks
  }));
}

export async function saveRaSchedule(values: RaScheduleFormValues, id?: string) {
  const invoice = values.actual_invoice_id ? (await listInvoiceOptions()).find((item) => item.id === values.actual_invoice_id) : null;
  const payload = {
    project_id: values.project_id,
    billing_period: emptyToNull(values.billing_period),
    billing_period_from: values.billing_period_from || null,
    billing_period_to: values.billing_period_to || null,
    proposed_bill_date: values.proposed_bill_date,
    proposed_bill_amount: toNumber(values.proposed_bill_amount),
    billing_type: values.billing_type || "RA Bill",
    work_status: emptyToNull(values.work_status),
    bill_status: values.bill_status,
    actual_invoice_id: values.actual_invoice_id || null,
    actual_invoice_date: invoice?.invoice_date ?? null,
    actual_invoice_amount: invoice?.total_amount ?? null,
    reason_not_raised: emptyToNull(values.reason_not_raised),
    remarks: emptyToNull(values.remarks)
  };

  const result = id
    ? await supabase.from("ra_bill_schedules").update(payload).eq("id", id)
    : await supabase.from("ra_bill_schedules").insert(payload);

  if (result.error) throw new Error(result.error.message || "Unable to save RA bill schedule.");
}

export function raToForm(record: RaScheduleRecord): RaScheduleFormValues {
  return {
    project_id: record.project_id,
    billing_period: record.billing_period ?? "",
    billing_period_from: record.billing_period_from ?? "",
    billing_period_to: record.billing_period_to ?? "",
    proposed_bill_date: record.proposed_bill_date,
    proposed_bill_amount: String(record.proposed_bill_amount || ""),
    billing_type: record.billing_type,
    work_status: record.work_status ?? "",
    bill_status: record.bill_status,
    actual_invoice_id: record.actual_invoice_id ?? "",
    reason_not_raised: record.reason_not_raised ?? "",
    remarks: record.remarks ?? ""
  };
}

export function createEmptyDcForm(): DcFormValues {
  return {
    dc_number: "",
    dc_date: new Date().toISOString().slice(0, 10),
    project_id: "",
    client_id: "",
    material_description: "",
    quantity: "",
    uom: "Nos",
    dc_value: "",
    tax_invoice_required: true,
    invoice_id: "",
    expected_invoice_date: "",
    reason_pending: "",
    remarks: ""
  };
}

function dcStatus(row: Record<string, unknown>) {
  if (row.tax_invoice_raised) return "Invoiced";
  if (row.expected_invoice_date && String(row.expected_invoice_date) < new Date().toISOString().slice(0, 10)) return "Overdue";
  if (row.expected_invoice_date && String(row.expected_invoice_date) <= new Date().toISOString().slice(0, 10)) return "Due";
  return "Pending";
}

export async function listDcs(pendingOnly = false): Promise<DcRecord[]> {
  let query = supabase
    .from("delivery_challans")
    .select("*, projects(project_code, project_name), clients(name), project_invoices(invoice_number)")
    .order("dc_date", { ascending: false })
    .limit(300);

  if (pendingOnly) {
    query = query.eq("tax_invoice_required", true).eq("tax_invoice_raised", false);
  }

  const { data, error } = await query;
  if (error) throw new Error("Unable to load DC records.");

  const today = new Date();
  return (data ?? []).map((row) => {
    const dcDate = new Date(row.dc_date);
    const pendingDays = Math.max(Math.floor((today.getTime() - dcDate.getTime()) / 86400000), 0);
    return {
      id: row.id,
      dc_number: row.dc_number,
      dc_date: row.dc_date,
      project_id: row.project_id,
      project_code: relationValue(row.projects, "project_code") as string | null,
      project_name: relationValue(row.projects, "project_name") as string | null,
      client_id: row.client_id,
      client_name: relationName(row.clients),
      material_description: row.material_description,
      quantity: toNumber(row.quantity),
      uom: row.uom,
      dc_value: toNumber(row.dc_value),
      tax_invoice_required: Boolean(row.tax_invoice_required),
      tax_invoice_raised: Boolean(row.tax_invoice_raised),
      invoice_id: row.invoice_id,
      invoice_number: relationValue(row.project_invoices, "invoice_number") as string | null,
      expected_invoice_date: row.expected_invoice_date,
      reason_pending: row.reason_pending,
      remarks: row.remarks,
      pending_days: pendingDays,
      status: dcStatus(row)
    };
  });
}

export async function saveDc(values: DcFormValues, id?: string) {
  const payload = {
    dc_number: values.dc_number.trim(),
    dc_date: values.dc_date,
    project_id: values.project_id,
    client_id: values.client_id || null,
    material_description: values.material_description.trim(),
    quantity: toNumber(values.quantity),
    uom: emptyToNull(values.uom),
    dc_value: toNumber(values.dc_value),
    tax_invoice_required: values.tax_invoice_required,
    tax_invoice_raised: Boolean(values.invoice_id),
    invoice_id: values.invoice_id || null,
    expected_invoice_date: values.expected_invoice_date || null,
    reason_pending: emptyToNull(values.reason_pending),
    remarks: emptyToNull(values.remarks)
  };

  const result = id
    ? await supabase.from("delivery_challans").update(payload).eq("id", id)
    : await supabase.from("delivery_challans").insert(payload);

  if (result.error) {
    if (result.error.code === "23505") throw new Error("DC number already exists. Please check the DC number.");
    throw new Error(result.error.message || "Unable to save DC.");
  }
}

export function dcToForm(record: DcRecord): DcFormValues {
  return {
    dc_number: record.dc_number,
    dc_date: record.dc_date,
    project_id: record.project_id,
    client_id: record.client_id ?? "",
    material_description: record.material_description,
    quantity: String(record.quantity || ""),
    uom: record.uom ?? "",
    dc_value: String(record.dc_value || ""),
    tax_invoice_required: record.tax_invoice_required,
    invoice_id: record.invoice_id ?? "",
    expected_invoice_date: record.expected_invoice_date ?? "",
    reason_pending: record.reason_pending ?? "",
    remarks: record.remarks ?? ""
  };
}

export function createEmptySalesForm(activeFy?: FinancialYearOption): SalesFormValues {
  return {
    report_date: new Date().toISOString().slice(0, 10),
    financial_year_id: activeFy?.id ?? "",
    sales_group: "Irrigation",
    sales_target: activeFy ? String(activeFy.sales_target) : "",
    sales_up_to_yesterday: "",
    today_sales: "",
    current_month_sales: "",
    cumulative_sales: "",
    source_reference: "",
    remarks: ""
  };
}

export async function listSales(): Promise<SalesRecord[]> {
  const { data, error } = await supabase
    .from("sales_daily")
    .select("*, financial_years(name)")
    .order("report_date", { ascending: false })
    .limit(200);

  if (error) throw new Error("Unable to load daily sales.");

  return (data ?? []).map((row) => ({
    id: row.id,
    report_date: row.report_date,
    financial_year_id: row.financial_year_id,
    financial_year_name: relationName(row.financial_years),
    sales_group: row.sales_group,
    sales_target: toNumber(row.sales_target),
    sales_up_to_yesterday: toNumber(row.sales_up_to_yesterday),
    today_sales: toNumber(row.today_sales),
    current_month_sales: toNumber(row.current_month_sales),
    cumulative_sales: toNumber(row.cumulative_sales),
    achievement_percentage: toNumber(row.achievement_percentage),
    balance_to_target: toNumber(row.balance_to_target),
    balance_percentage: toNumber(row.balance_percentage),
    source_reference: row.source_reference,
    remarks: row.remarks
  }));
}

export async function saveSales(values: SalesFormValues, id?: string) {
  const payload = {
    report_date: values.report_date,
    financial_year_id: values.financial_year_id,
    sales_group: values.sales_group || "Irrigation",
    sales_target: toNumber(values.sales_target),
    sales_up_to_yesterday: toNumber(values.sales_up_to_yesterday),
    today_sales: toNumber(values.today_sales),
    current_month_sales: toNumber(values.current_month_sales),
    cumulative_sales: toNumber(values.cumulative_sales),
    source_reference: emptyToNull(values.source_reference),
    remarks: emptyToNull(values.remarks)
  };

  const result = id ? await supabase.from("sales_daily").update(payload).eq("id", id) : await supabase.from("sales_daily").insert(payload);
  if (result.error) throw new Error(result.error.message || "Unable to save sales entry.");
}

export function salesToForm(record: SalesRecord): SalesFormValues {
  return {
    report_date: record.report_date,
    financial_year_id: record.financial_year_id,
    sales_group: record.sales_group,
    sales_target: String(record.sales_target || ""),
    sales_up_to_yesterday: String(record.sales_up_to_yesterday || ""),
    today_sales: String(record.today_sales || ""),
    current_month_sales: String(record.current_month_sales || ""),
    cumulative_sales: String(record.cumulative_sales || ""),
    source_reference: record.source_reference ?? "",
    remarks: record.remarks ?? ""
  };
}
