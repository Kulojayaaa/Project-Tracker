import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, X } from "lucide-react";
import { Field, ModuleMessage } from "../components/FormBits";
import {
  createEmptySalesForm,
  listFinancialYears,
  listSales,
  salesToForm,
  saveSales,
} from "../services/operations";
import type {
  FinancialYearOption,
  SalesFormValues,
  SalesRecord,
} from "../types/domain";
import { formatCurrencyCompact, percentage } from "../utils/formatting";

export function DailySalesPage({
  comparison = false,
}: {
  comparison?: boolean;
}) {
  const [fyFilter, setFyFilter] = useState("");
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYearOption[]>(
    [],
  );
  const [form, setForm] = useState<SalesFormValues>(() =>
    createEmptySalesForm(),
  );
  const [editing, setEditing] = useState<SalesRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const latest =
    records.find(
      (r) =>
        (!fyFilter || r.financial_year_id === fyFilter) &&
        r.sales_group === "Irrigation",
    ) ?? null;
  const selectedFy = useMemo(
    () => financialYears.find((fy) => fy.id === form.financial_year_id),
    [financialYears, form.financial_year_id],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [fyRows, salesRows] = await Promise.all([
        listFinancialYears(),
        listSales(),
      ]);
      setFinancialYears(fyRows);
      setRecords(salesRows);
      setFyFilter(
        (current) => current || fyRows.find((f) => f.active)?.id || "",
      );
      const activeFy = fyRows.find((fy) => fy.active) ?? fyRows[0];
      setForm((current) =>
        current.financial_year_id ? current : createEmptySalesForm(activeFy),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load sales.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function update<Key extends keyof SalesFormValues>(
    key: Key,
    value: SalesFormValues[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    const activeFy =
      financialYears.find((fy) => fy.active) ?? financialYears[0];
    setEditing(null);
    setForm(createEmptySalesForm(activeFy));
    setFormOpen(true);
    setNotice(null);
    setError(null);
  }

  function openEdit(record: SalesRecord) {
    setEditing(record);
    setForm(salesToForm(record));
    setFormOpen(true);
    setNotice(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveSales(form, editing?.id);
      await load();
      setFormOpen(false);
      setNotice(
        editing
          ? "Sales entry updated successfully."
          : "Sales entry created successfully.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save sales entry.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (comparison) {
    const snapshots = financialYears.map((fy) => ({
      fy,
      sale: records.find(
        (r) => r.financial_year_id === fy.id && r.sales_group === "Irrigation",
      ),
    }));
    return (
      <div className="page-stack">
        {error && <ModuleMessage tone="error">{error}</ModuleMessage>}
        <section className="panel">
          <div className="panel-header">
            <h2>Financial Year Sales Comparison</h2>
            <button className="outline-button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>FY</th>
                  <th>Target</th>
                  <th>Latest Report</th>
                  <th>Cumulative Sales</th>
                  <th>Achievement</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map(({ fy, sale }) => (
                  <tr key={fy.id}>
                    <td>{fy.name}</td>
                    <td>
                      {formatCurrencyCompact(
                        sale?.sales_target ?? fy.sales_target,
                      )}
                    </td>
                    <td>{sale?.report_date ?? "-"}</td>
                    <td>
                      {sale
                        ? formatCurrencyCompact(sale.cumulative_sales)
                        : "No sales snapshot"}
                    </td>
                    <td>
                      {sale ? percentage(sale.achievement_percentage) : "-"}
                    </td>
                    <td>
                      {sale
                        ? formatCurrencyCompact(sale.balance_to_target)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="page-stack">
      <section className="summary-strip">
        <article>
          <span>Target</span>
          <strong>
            {latest
              ? formatCurrencyCompact(latest.sales_target)
              : selectedFy
                ? formatCurrencyCompact(selectedFy.sales_target)
                : "No FY"}
          </strong>
        </article>
        <article>
          <span>Achieved</span>
          <strong>
            {latest
              ? formatCurrencyCompact(latest.cumulative_sales)
              : "No sales data"}
          </strong>
        </article>
        <article>
          <span>Balance</span>
          <strong>
            {latest
              ? formatCurrencyCompact(latest.balance_to_target)
              : "No sales data"}
          </strong>
        </article>
      </section>
      {notice ? <ModuleMessage tone="success">{notice}</ModuleMessage> : null}
      {error ? <ModuleMessage tone="error">{error}</ModuleMessage> : null}
      <section className="panel">
        <div className="panel-header controls-header">
          <div>
            <h2>Daily Sales</h2>
            <p>
              Accounts-entered sales are the official department sales figure.
            </p>
          </div>
          <div className="button-row">
            <button
              className="outline-button"
              onClick={() => void load()}
              type="button"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              className="primary-button"
              onClick={openCreate}
              type="button"
            >
              <Plus size={16} />
              Daily Sales Entry
            </button>
          </div>
        </div>
        <Field label="Financial Year">
          <select
            value={fyFilter}
            onChange={(e) => setFyFilter(e.target.value)}
          >
            <option value="">All financial years</option>
            {financialYears.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        {loading ? (
          <div className="empty-state">Loading daily sales...</div>
        ) : null}
        {!loading && !records.length ? (
          <div className="empty-state">
            No sales data entered for this financial year.
          </div>
        ) : null}
        {!loading && records.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>FY</th>
                  <th>Group</th>
                  <th>Today</th>
                  <th>Month</th>
                  <th>Cumulative</th>
                  <th>Achievement</th>
                  <th>Balance</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records
                  .filter((r) => !fyFilter || r.financial_year_id === fyFilter)
                  .map((record) => (
                    <tr key={record.id}>
                      <td>{record.report_date}</td>
                      <td>{record.financial_year_name ?? "-"}</td>
                      <td>{record.sales_group}</td>
                      <td>{formatCurrencyCompact(record.today_sales)}</td>
                      <td>
                        {formatCurrencyCompact(record.current_month_sales)}
                      </td>
                      <td>{formatCurrencyCompact(record.cumulative_sales)}</td>
                      <td>{percentage(record.achievement_percentage)}</td>
                      <td>{formatCurrencyCompact(record.balance_to_target)}</td>
                      <td>{record.source_reference ?? "-"}</td>
                      <td>
                        <button
                          className="icon-button"
                          onClick={() => openEdit(record)}
                          type="button"
                        >
                          <Edit3 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {formOpen ? (
        <section className="panel form-panel">
          <div className="panel-header">
            <div>
              <h2>{editing ? "Edit Sales Entry" : "Daily Sales Entry"}</h2>
              <p>
                Do not classify reconciliation differences until Accounts
                provides a verified breakup.
              </p>
            </div>
            <button
              className="icon-button"
              onClick={() => setFormOpen(false)}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
          <form
            className="project-form"
            onSubmit={(event) => void submit(event)}
          >
            <Field label="Report Date *">
              <input
                required
                type="date"
                value={form.report_date}
                onChange={(event) => update("report_date", event.target.value)}
              />
            </Field>
            <Field label="Financial Year *">
              <select
                required
                value={form.financial_year_id}
                onChange={(event) => {
                  const fy = financialYears.find(
                    (item) => item.id === event.target.value,
                  );
                  update("financial_year_id", event.target.value);
                  if (fy) update("sales_target", String(fy.sales_target));
                }}
              >
                <option value="">Select FY</option>
                {financialYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sales Group">
              <input
                value={form.sales_group}
                onChange={(event) => update("sales_group", event.target.value)}
              />
            </Field>
            <Field label="Sales Target">
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.sales_target}
                onChange={(event) => update("sales_target", event.target.value)}
              />
            </Field>
            <Field label="Sales Up To Yesterday">
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.sales_up_to_yesterday}
                onChange={(event) =>
                  update("sales_up_to_yesterday", event.target.value)
                }
              />
            </Field>
            <Field label="Today's Sales">
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.today_sales}
                onChange={(event) => update("today_sales", event.target.value)}
              />
            </Field>
            <Field label="Current Month Sales">
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.current_month_sales}
                onChange={(event) =>
                  update("current_month_sales", event.target.value)
                }
              />
            </Field>
            <Field label="Cumulative Sales">
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.cumulative_sales}
                onChange={(event) =>
                  update("cumulative_sales", event.target.value)
                }
              />
            </Field>
            <Field label="Source / Reference">
              <input
                value={form.source_reference}
                onChange={(event) =>
                  update("source_reference", event.target.value)
                }
              />
            </Field>
            <label className="form-field full-span">
              <span>Remarks</span>
              <textarea
                value={form.remarks}
                onChange={(event) => update("remarks", event.target.value)}
              />
            </label>
            <div className="form-actions full-span">
              <button
                className="ghost-button"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={saving}
                type="submit"
              >
                {saving ? "Saving..." : "Save Sales Entry"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
