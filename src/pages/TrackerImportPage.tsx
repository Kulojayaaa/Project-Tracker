import { useEffect, useState } from "react";
import { Download, Upload, RefreshCw } from "lucide-react";
import { ModuleMessage } from "../components/FormBits";
import { supabase } from "../lib/supabase";
import { trackingReady } from "../services/data";
import type { TrackerPreview } from "../services/trackerWorkbook";
import { formatCurrencyCompact } from "../utils/formatting";
import upgradeSql from "../../docs/LIVE_DATABASE_UPGRADE.sql?raw";

export function TrackerImportPage() {
  const [preview, setPreview] = useState<TrackerPreview | null>(null);
  const [filename, setFilename] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canImport, setCanImport] = useState(false);
  async function check() {
    try {
      setReady(await trackingReady());
      const { data } = await supabase.auth.getUser();
      const { data: profile, error: lookupError } = await supabase
        .from("users")
        .select("role")
        .eq("id", data.user?.id ?? "")
        .maybeSingle();
      if (lookupError) throw lookupError;
      setCanImport(
        ["admin", "project_admin", "accounts_finance"].includes(
          profile?.role ?? "",
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to check database.");
    }
  }
  useEffect(() => {
    void check();
  }, []);
  async function choose(file: File) {
    setPreview(null);
    setReviewed(false);
    setError("");
    setNotice("");
    setFilename(file.name);
    setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a workbook smaller than 10 MB.");
      const { readTrackerWorkbook } =
        await import("../services/trackerWorkbook");
      setPreview(await readTrackerWorkbook(await file.arrayBuffer()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read workbook.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (
      !preview ||
      !reviewed ||
      !ready ||
      preview.issues.some((i) => i.severity === "error")
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "import_billing_tracker",
        { payload: preview.payload, source_name: filename },
      );
      if (rpcError) throw rpcError;
      setNotice(
        `Import complete: ${data.imported} records created; ${data.skipped} matching records skipped.`,
      );
      setReviewed(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Import failed. No records were saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  function downloadMigration() {
    const url = URL.createObjectURL(
      new Blob([upgradeSql], { type: "text/plain" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "LIVE_DATABASE_UPGRADE.sql";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="page-stack">
      {error && <ModuleMessage tone="error">{error}</ModuleMessage>}
      {notice && <ModuleMessage tone="success">{notice}</ModuleMessage>}
      {!ready && (
        <section className="panel">
          <div className="panel-header">
            <h2>Database Upgrade Required</h2>
            <button className="outline-button" onClick={() => void check()}>
              <RefreshCw size={16} />
              Check Again
            </button>
          </div>
          <p>
            The live database needs the billing upgrade before records can be
            imported.
          </p>
          <button className="outline-button" onClick={downloadMigration}>
            <Download size={16} />
            Download Database Upgrade
          </button>
        </section>
      )}
      <section className="panel">
        <div className="panel-header">
          <h2>Import Billing Tracker</h2>
          <label className="outline-button file-picker">
            <Upload size={16} />
            Choose Workbook
            <input
              aria-label="Choose billing workbook"
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void choose(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {filename && <p>{filename}</p>}
        {busy && <div className="empty-state">Processing...</div>}
        {preview && (
          <>
            <div className="summary-strip">
              <article>
                <span>Clients</span>
                <strong>{preview.clientCount}</strong>
              </article>
              <article>
                <span>Projects / Orders</span>
                <strong>
                  {preview.payload.projects.length} /{" "}
                  {preview.payload.orders.length}
                </strong>
              </article>
              <article>
                <span>Invoices / Credit Notes</span>
                <strong>
                  {preview.payload.invoices.length} / {preview.creditCount}
                </strong>
              </article>
            </div>
            <h3>Reconciliation</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Workbook</th>
                    <th>Calculated</th>
                    <th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.checks.map((c) => (
                    <tr key={c.metric}>
                      <td>{c.metric}</td>
                      <td>{formatCurrencyCompact(c.source)}</td>
                      <td>{formatCurrencyCompact(c.calculated)}</td>
                      <td>{(c.calculated - c.source).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Review Items</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Record</th>
                    <th>Finding</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.issues.map((i, n) => (
                    <tr key={n}>
                      <td>
                        {i.severity === "error" ? "Needs correction" : "Review"}
                      </td>
                      <td>{i.location}</td>
                      <td className="wrap-cell">{i.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Projects</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Base Value</th>
                    <th>Billing Closure</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.payload.projects.map((p) => (
                    <tr key={p.project_code}>
                      <td>{p.project_code}</td>
                      <td>{p.project_name}</td>
                      <td>{p.client_name}</td>
                      <td>{formatCurrencyCompact(p.base_wo_value)}</td>
                      <td>{p.billing_closure}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I have reviewed the reconciliation and mapping items.
              </label>
              <button
                className="primary-button"
                onClick={() => void save()}
                disabled={
                  busy ||
                  !ready ||
                  !canImport ||
                  !reviewed ||
                  preview.issues.some((i) => i.severity === "error")
                }
              >
                <Upload size={16} />
                Import Records
              </button>
            </div>
            {!canImport && (
              <p>
                Accounts or Project Admin access is required to import records.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
