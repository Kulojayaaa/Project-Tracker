import { allRows, trackingReady, requireTracking } from "./data";
import { listProjectSummaries } from "./projects";
import {
  dcBillingStatus,
  financialYearFor,
  localDate,
  money,
} from "../utils/billing";
import { supabase } from "../lib/supabase";
import type {
  BillStatus,
  ClientOption,
  ClientFormValues,
  ClientRecord,
  DcFormValues,
  DcRecord,
  FinancialYearOption,
  InvoiceFormValues,
  InvoiceRecord,
  ProjectOption,
  RaScheduleFormValues,
  RaScheduleRecord,
  SalesFormValues,
  SalesRecord,
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
    return (
      ((value[0] as Record<string, unknown> | undefined)?.[field] as
        string | null | undefined) ?? null
    );
  }

  return (
    ((value as Record<string, unknown> | null | undefined)?.[field] as
      string | null | undefined) ?? null
  );
}

function relationValue(value: unknown, field: string) {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown> | undefined)?.[field] ?? null;
  }

  return (value as Record<string, unknown> | null | undefined)?.[field] ?? null;
}

export function createEmptyClientForm(): ClientFormValues {
  return {
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    gstin: "",
    active: true,
  };
}

export function clientToForm(client: ClientRecord): ClientFormValues {
  return {
    name: client.name,
    contact_person: client.contact_person ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    gstin: client.gstin ?? "",
    active: client.active,
  };
}

export async function listClientsMaster(search = ""): Promise<ClientRecord[]> {
  const rows = await allRows<ClientRecord>(
    "clients",
    "id, name, contact_person, email, phone, gstin, active",
  );
  const searchText = search.trim().toLowerCase();
  const data = rows.filter(
    (row) =>
      !searchText ||
      [row.name, row.contact_person, row.email, row.phone, row.gstin].some(
        (value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(searchText),
      ),
  );
  data.sort((a, b) => a.name.localeCompare(b.name));
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    contact_person: row.contact_person,
    email: row.email,
    phone: row.phone,
    gstin: row.gstin,
    active: Boolean(row.active),
  }));
}

export async function saveClient(
  values: ClientFormValues,
  id?: string,
): Promise<void> {
  if (!values.name.trim()) {
    throw new Error("Client name is required.");
  }

  const payload = {
    name: values.name.trim(),
    contact_person: emptyToNull(values.contact_person),
    email: emptyToNull(values.email),
    phone: emptyToNull(values.phone),
    gstin: emptyToNull(values.gstin),
    active: values.active,
  };

  const result = id
    ? await supabase.from("clients").update(payload).eq("id", id)
    : await supabase.from("clients").insert(payload);

  if (result.error) {
    if (result.error.code === "23505")
      throw new Error(
        "Client name already exists. Please check the client master.",
      );
    throw new Error(result.error.message || "Unable to save client.");
  }
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
    active: Boolean(row.active),
  }));
}

export async function listProjectOptions(): Promise<ProjectOption[]> {
  const scopes = await listProjectSummaries();
  return scopes.map((scope) => ({
    ...scope,
    project_name: scope.wo_number
      ? `${scope.project_name} / ${scope.wo_number}`
      : scope.project_name,
  }));
}

export async function listClientOptions(): Promise<ClientOption[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("active", true)
    .order("name");
  if (error) throw new Error("Unable to load clients.");
  return data ?? [];
}

export async function listInvoiceOptions(): Promise<
  {
    id: string;
    project_id: string;
    document_type: string;
    amount_before_gst: number;
    invoice_number: string;
    total_amount: number;
    invoice_date: string;
  }[]
> {
  const data = await allRows<Record<string, any>>("project_invoices");
  data.sort((a, b) =>
    String(b.invoice_date).localeCompare(String(a.invoice_date)),
  );

  return (data ?? []).map((row) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    project_id: row.project_id,
    document_type: row.document_type ?? "tax_invoice",
    amount_before_gst: toNumber(row.amount_before_gst),
    total_amount: toNumber(row.total_amount),
    invoice_date: row.invoice_date,
  }));
}

export function createEmptyInvoiceForm(activeFyId = ""): InvoiceFormValues {
  return {
    document_type: "tax_invoice",
    order_id: "",
    original_invoice_id: "",
    remarks: "",
    invoice_number: "",
    invoice_date: localDate(),
    project_id: "",
    invoice_type: "RA Bill",
    invoice_description: "",
    billing_period_from: "",
    billing_period_to: "",
    amount_before_gst: "",
    gst_amount: "",
    financial_year_id: activeFyId,
  };
}

export async function listInvoices(search = ""): Promise<InvoiceRecord[]> {
  const all = await allRows<Record<string, any>>(
    "project_invoices",
    "*, projects(project_code, project_name, clients(name)), financial_years(name)",
  );
  const data = all.filter(
    (r) =>
      !search.trim() ||
      String(r.invoice_number)
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  data.sort((a, b) =>
    String(b.invoice_date).localeCompare(String(a.invoice_date)),
  );

  return (data ?? []).map((row) => ({
    id: row.id,
    document_type: row.document_type ?? "tax_invoice",
    order_id: row.order_id ?? null,
    original_invoice_id: row.original_invoice_id ?? null,
    remarks: row.remarks ?? null,
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
    financial_year_name: relationName(row.financial_years),
  }));
}

export async function saveInvoice(values: InvoiceFormValues, id?: string) {
  const ready = await trackingReady();
  if (
    !ready &&
    (values.document_type !== "tax_invoice" ||
      values.order_id ||
      values.original_invoice_id ||
      values.remarks)
  )
    await requireTracking();
  const amount = money(values.amount_before_gst);
  const gst = money(values.gst_amount);
  if (amount < 0 || gst < 0)
    throw new Error(
      "Enter positive amounts; credit notes are deducted automatically.",
    );
  if (values.document_type === "credit_note" && amount === 0)
    throw new Error("Credit note amount must be greater than zero.");
  const years = await allRows<Record<string, unknown>>("financial_years");
  const fy = years.find(
    (y) =>
      String(y.name).replace(/^FY\s*/i, "") ===
      financialYearFor(values.invoice_date),
  );
  if (!fy)
    throw new Error(
      "Create the financial year matching the invoice date first.",
    );
  if (values.financial_year_id && values.financial_year_id !== fy.id)
    throw new Error("Invoice date must match the selected financial year.");
  const sign = values.document_type === "credit_note" ? -1 : 1;
  const payload = {
    ...(ready
      ? {
          document_type: values.document_type,
          order_id: values.order_id || null,
          original_invoice_id: values.original_invoice_id || null,
          remarks: values.remarks.trim() || null,
        }
      : {}),
    invoice_number: values.invoice_number.trim(),
    invoice_date: values.invoice_date,
    project_id: values.project_id,
    invoice_type: values.invoice_type,
    invoice_description: emptyToNull(values.invoice_description),
    billing_period_from: values.billing_period_from || null,
    billing_period_to: values.billing_period_to || null,
    amount_before_gst: sign * amount,
    gst_amount: sign * gst,
    financial_year_id: String(fy.id),
  };

  const result = id
    ? await supabase.from("project_invoices").update(payload).eq("id", id)
    : await supabase.from("project_invoices").insert(payload);

  if (result.error) {
    if (result.error.code === "23505")
      throw new Error(
        "Invoice number already exists. Please check the invoice number.",
      );
    throw new Error(result.error.message || "Unable to save invoice.");
  }
}

export function invoiceToForm(invoice: InvoiceRecord): InvoiceFormValues {
  return {
    document_type: invoice.document_type,
    order_id: invoice.order_id ?? "",
    original_invoice_id: invoice.original_invoice_id ?? "",
    remarks: invoice.remarks ?? "",
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    project_id: invoice.project_id,
    invoice_type: invoice.invoice_type,
    invoice_description: invoice.invoice_description ?? "",
    billing_period_from: invoice.billing_period_from ?? "",
    billing_period_to: invoice.billing_period_to ?? "",
    amount_before_gst: String(Math.abs(invoice.amount_before_gst)),
    gst_amount: String(Math.abs(invoice.gst_amount)),
    financial_year_id: invoice.financial_year_id ?? "",
  };
}

export function createEmptyRaForm(): RaScheduleFormValues {
  return {
    project_id: "",
    billing_period: "",
    billing_period_from: "",
    billing_period_to: "",
    proposed_bill_date: localDate(),
    proposed_bill_amount: "",
    billing_type: "RA Bill",
    work_status: "",
    bill_status: "planned",
    actual_invoice_id: "",
    reason_not_raised: "",
    remarks: "",
  };
}

export async function listRaSchedules(): Promise<RaScheduleRecord[]> {
  const data = await allRows<Record<string, any>>(
    "ra_bill_schedules",
    "*, projects(project_code, project_name), project_invoices(invoice_number)",
  );
  data.sort((a, b) =>
    String(a.proposed_bill_date).localeCompare(String(b.proposed_bill_date)),
  );

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
    actual_invoice_number: relationValue(
      row.project_invoices,
      "invoice_number",
    ) as string | null,
    actual_invoice_date: row.actual_invoice_date,
    actual_invoice_amount:
      row.actual_invoice_amount === null
        ? null
        : toNumber(row.actual_invoice_amount),
    reason_not_raised: row.reason_not_raised,
    remarks: row.remarks,
  }));
}

export async function saveRaSchedule(
  values: RaScheduleFormValues,
  id?: string,
) {
  const invoice = values.actual_invoice_id
    ? (await listInvoiceOptions()).find(
        (item) => item.id === values.actual_invoice_id,
      )
    : null;
  if (
    values.actual_invoice_id &&
    (!invoice ||
      invoice.project_id !== values.project_id ||
      invoice.document_type !== "tax_invoice")
  )
    throw new Error("Select a tax invoice belonging to this project.");
  if (["raised", "completed"].includes(values.bill_status) && !invoice)
    throw new Error(
      "Link an invoice before marking the RA bill raised or completed.",
    );
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
    actual_invoice_amount: invoice?.amount_before_gst ?? null,
    reason_not_raised: emptyToNull(values.reason_not_raised),
    remarks: emptyToNull(values.remarks),
  };

  const result = id
    ? await supabase.from("ra_bill_schedules").update(payload).eq("id", id)
    : await supabase.from("ra_bill_schedules").insert(payload);

  if (result.error)
    throw new Error(result.error.message || "Unable to save RA bill schedule.");
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
    remarks: record.remarks ?? "",
  };
}

export function createEmptyDcForm(): DcFormValues {
  return {
    dc_number: "",
    dc_date: localDate(),
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
    remarks: "",
  };
}

export async function listDcs(pendingOnly = false): Promise<DcRecord[]> {
  const all = await allRows<Record<string, any>>(
    "delivery_challans",
    "*, projects(project_code, project_name), clients(name), project_invoices(invoice_number)",
  );
  const data = all.filter(
    (r) => !pendingOnly || (r.tax_invoice_required && !r.tax_invoice_raised),
  );
  data.sort((a, b) => String(b.dc_date).localeCompare(String(a.dc_date)));

  const { data: setting, error: settingError } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "dc_overdue_days")
    .maybeSingle();
  if (settingError)
    throw new Error(
      "Unable to load DC overdue settings: " + settingError.message,
    );
  const configuredDays = Number(setting?.value ?? 7);
  const overdueDays =
    Number.isFinite(configuredDays) && configuredDays >= 0 ? configuredDays : 7;
  const todayDate = localDate();
  const today = new Date(todayDate);
  return (data ?? []).map((row) => {
    const dcDate = new Date(row.dc_date);
    const pendingDays = Math.max(
      Math.floor((today.getTime() - dcDate.getTime()) / 86400000),
      0,
    );
    return {
      id: row.id,
      dc_number: row.dc_number,
      dc_date: row.dc_date,
      project_id: row.project_id,
      project_code: relationValue(row.projects, "project_code") as
        string | null,
      project_name: relationValue(row.projects, "project_name") as
        string | null,
      client_id: row.client_id,
      client_name: relationName(row.clients),
      material_description: row.material_description,
      quantity: toNumber(row.quantity),
      uom: row.uom,
      dc_value: toNumber(row.dc_value),
      tax_invoice_required: Boolean(row.tax_invoice_required),
      tax_invoice_raised: Boolean(row.tax_invoice_raised),
      invoice_id: row.invoice_id,
      invoice_number: relationValue(row.project_invoices, "invoice_number") as
        string | null,
      expected_invoice_date: row.expected_invoice_date,
      reason_pending: row.reason_pending,
      remarks: row.remarks,
      pending_days: pendingDays,
      status: dcBillingStatus(
        Boolean(row.tax_invoice_raised),
        Boolean(row.tax_invoice_required),
        row.dc_date,
        row.expected_invoice_date,
        overdueDays,
        todayDate,
      ),
    };
  });
}

export async function saveDc(values: DcFormValues, id?: string) {
  const project = (await listProjectOptions()).find(
    (p) => p.id === values.project_id,
  );
  if (!project) throw new Error("Select a valid project.");
  if (values.invoice_id) {
    const invoice = (await listInvoiceOptions()).find(
      (i) => i.id === values.invoice_id,
    );
    if (
      !invoice ||
      invoice.project_id !== values.project_id ||
      invoice.document_type !== "tax_invoice"
    )
      throw new Error("DC invoice must belong to this project.");
  }
  const payload = {
    dc_number: values.dc_number.trim(),
    dc_date: values.dc_date,
    project_id: values.project_id,
    client_id: project.client_id,
    material_description: values.material_description.trim(),
    quantity: toNumber(values.quantity),
    uom: emptyToNull(values.uom),
    dc_value: toNumber(values.dc_value),
    tax_invoice_required: values.tax_invoice_required,
    tax_invoice_raised: Boolean(values.invoice_id),
    invoice_id: values.invoice_id || null,
    expected_invoice_date: values.expected_invoice_date || null,
    reason_pending: emptyToNull(values.reason_pending),
    remarks: emptyToNull(values.remarks),
  };

  const result = id
    ? await supabase.from("delivery_challans").update(payload).eq("id", id)
    : await supabase.from("delivery_challans").insert(payload);

  if (result.error) {
    if (result.error.code === "23505")
      throw new Error("DC number already exists. Please check the DC number.");
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
    remarks: record.remarks ?? "",
  };
}

export function createEmptySalesForm(
  activeFy?: FinancialYearOption,
): SalesFormValues {
  return {
    report_date: localDate(),
    financial_year_id: activeFy?.id ?? "",
    sales_group: "Irrigation",
    sales_target: activeFy ? String(activeFy.sales_target) : "",
    sales_up_to_yesterday: "",
    today_sales: "",
    current_month_sales: "",
    cumulative_sales: "",
    source_reference: "",
    remarks: "",
  };
}

export async function listSales(): Promise<SalesRecord[]> {
  const data = await allRows<Record<string, any>>(
    "sales_daily",
    "*, financial_years(name)",
  );
  data.sort((a, b) =>
    String(b.report_date).localeCompare(String(a.report_date)),
  );

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
    remarks: row.remarks,
  }));
}

export async function saveSales(values: SalesFormValues, id?: string) {
  if (
    Math.abs(
      money(values.sales_up_to_yesterday) +
        money(values.today_sales) -
        money(values.cumulative_sales),
    ) > 0.01
  )
    throw new Error(
      "Cumulative sales must equal sales up to yesterday plus today's sales.",
    );
  const years = await allRows<Record<string, unknown>>("financial_years");
  const fy = years.find((y) => y.id === values.financial_year_id);
  if (
    !fy ||
    values.report_date < String(fy.start_date) ||
    values.report_date > String(fy.end_date)
  )
    throw new Error("Report date must be within the selected financial year.");
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
    remarks: emptyToNull(values.remarks),
  };

  const result = id
    ? await supabase.from("sales_daily").update(payload).eq("id", id)
    : await supabase.from("sales_daily").insert(payload);
  if (result.error)
    throw new Error(result.error.message || "Unable to save sales entry.");
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
    remarks: record.remarks ?? "",
  };
}
