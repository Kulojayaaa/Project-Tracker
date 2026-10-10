import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const runtime = createRequire(
  process.env.PLAYWRIGHT_RUNTIME ?? import.meta.url,
);
const workbookPath = process.argv[2];
if (!workbookPath)
  throw new Error("Pass the reference workbook path as the first argument.");
const { chromium } = runtime("playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const uid = "00000000-0000-0000-0000-000000000001",
  pid = "00000000-0000-0000-0000-000000000101",
  pid2 = "00000000-0000-0000-0000-000000000102",
  fyid = "00000000-0000-0000-0000-000000000201",
  cid = "00000000-0000-0000-0000-000000000301";
const user = {
  id: uid,
  email: "operator@example.invalid",
  role: "authenticated",
  aud: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const token =
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ) +
  "." +
  Buffer.from(
    JSON.stringify({
      sub: uid,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: "authenticated",
    }),
  ).toString("base64url") +
  ".test";
await context.addInitScript(
  ({ user, token }) =>
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        user,
        access_token: token,
        refresh_token: "test-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
      }),
    ),
  { user, token },
);
const project = (id, code, name) => ({
  id,
  project_code: code,
  project_name: name,
  client_id: cid,
  base_wo_value: 1000000,
  gst_value: 180000,
  total_wo_value: 1180000,
  opening_invoiced_amount: 0,
  billing_target: 1000000,
  project_status: "active",
  carry_forward: true,
  billing_closure: "open",
  project_description: "Irrigation works",
  wo_number: code + "/WO",
  project_manager_id: uid,
});
const tables = {
  users: [{ ...user, name: "Operator", role: "project_admin", active: true }],
  clients: [{ id: cid, name: "Example Client", active: true }],
  financial_years: [
    {
      id: fyid,
      name: "FY 2026-27",
      start_date: "2026-04-01",
      end_date: "2027-03-31",
      sales_target: 250000000,
      active: true,
    },
  ],
  projects: [
    project(pid, "IRR-001", "Course Irrigation"),
    project(pid2, "IRR-002", "Ground Maintenance"),
  ],
  project_orders: [
    {
      id: "00000000-0000-0000-0000-000000000401",
      project_id: pid,
      order_code: "ORD-001",
      order_number: "WO-001",
      order_group: "ORD-001",
      order_type: "original",
      version: 1,
      base_value: 1000000,
      gst_value: 180000,
      status: "active",
    },
  ],
  project_invoices: [
    {
      id: "00000000-0000-0000-0000-000000000501",
      invoice_number: "INV-001",
      invoice_date: "2026-10-01",
      project_id: pid,
      invoice_type: "Material",
      amount_before_gst: 200000,
      gst_amount: 36000,
      total_amount: 236000,
      financial_year_id: fyid,
      document_type: "tax_invoice",
      projects: {
        project_code: "IRR-001",
        project_name: "Course Irrigation",
        clients: { name: "Example Client" },
      },
      financial_years: { name: "FY 2026-27" },
    },
  ],
  ra_bill_schedules: [],
  delivery_challans: [],
  sales_daily: [],
  project_documents: [],
  audit_logs: [],
};
const requests = [];
await context.route(
  (url) =>
    url.pathname.includes("/rest/v1/") || url.pathname.includes("/auth/v1/"),
  async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    requests.push(url.pathname);
    if (url.pathname.includes("/auth/v1/user"))
      return route.fulfill({ json: user });
    if (url.pathname.includes("/auth/v1/token"))
      return route.fulfill({
        json: {
          user,
          access_token: token,
          refresh_token: "test-refresh",
          expires_in: 3600,
          token_type: "bearer",
        },
      });
    if (url.pathname.includes("/rpc/import_billing_tracker"))
      return route.fulfill({ json: { imported: 107, skipped: 0 } });
    const name = url.pathname.split("/").pop();
    let rows = tables[name] ?? [];
    for (const [key, v] of url.searchParams)
      if (v.startsWith("eq."))
        rows = rows.filter((r) => String(r[key]) === v.slice(3));
    if (url.searchParams.get("limit") === "0") rows = [];
    if (request.headers().accept?.includes("vnd.pgrst.object"))
      return route.fulfill({ json: rows[0] ?? null });
    return route.fulfill({
      json: rows,
      headers: {
        "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
      },
    });
  },
);
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("Console", m.text());
});
page.on("requestfailed", (r) =>
  console.log("Failed", r.url(), r.failure()?.errorText),
);
mkdirSync("artifacts", { recursive: true });
await page.goto("http://127.0.0.1:5175/");

await page.screenshot({ path: "artifacts/startup.png" });
await page
  .getByRole("heading", { name: "Project Billing & Sales Dashboard" })
  .waitFor();
await page
  .getByRole("button", { name: "Project Tracker", exact: true })
  .click();
await page.getByRole("button", { name: "IRR-001", exact: true }).waitFor();
await page.screenshot({ path: "artifacts/projects-desktop.png" });
await page.getByRole("button", { name: "IRR-001", exact: true }).click();
await page
  .getByRole("button", { name: "Documents", exact: true })
  .first()
  .click();
await page.getByLabel("Upload project document").waitFor();
await page
  .getByRole("button", { name: "Activity / Audit", exact: true })
  .click();
await page
  .getByText("No recorded activity available for this account.")
  .waitFor();
await page
  .getByRole("button", { name: "Invoice Register", exact: true })
  .click();
await page.getByRole("button", { name: "New Invoice", exact: true }).click();
await page.getByRole("heading", { name: "New Invoice", exact: true }).waitFor();
await page.getByLabel("Project *", { exact: true }).selectOption(pid2);
await page.getByLabel("Document", { exact: true }).selectOption("credit_note");
assert.equal(
  await page
    .getByLabel("Original Tax Invoice", { exact: true })
    .locator("option")
    .count(),
  1,
);
await page.getByRole("button", { name: "Excel Import", exact: true }).click();
await page.getByLabel("Choose billing workbook").setInputFiles(workbookPath);
await page.getByRole("heading", { name: "Reconciliation" }).waitFor();
assert.equal(
  await page.getByText("Needs correction", { exact: true }).count(),
  0,
);
await page.screenshot({ path: "artifacts/import-desktop.png" });
await page
  .getByLabel("I have reviewed the reconciliation and mapping items.")
  .check();
await page.getByRole("button", { name: "Import Records", exact: true }).click();
await page.getByText(/Import complete: 107 records/).waitFor();
await page
  .getByRole("button", { name: "Project Billing Report", exact: true })
  .click();
await page.getByText("Lifetime Net Invoiced", { exact: true }).waitFor();
const download = page.waitForEvent("download");
await page.getByRole("button", { name: "Export Excel", exact: true }).click();
const file = await download;
assert.ok(file.suggestedFilename().endsWith(".xlsx"));
await file.saveAs("artifacts/report-test.xlsx");
const ExcelJS = createRequire(import.meta.url)("exceljs");
const book = new ExcelJS.Workbook();
await book.xlsx.readFile("artifacts/report-test.xlsx");
assert.equal(book.getWorksheet("Report").rowCount, 3);
assert.equal(
  typeof book.getWorksheet("Report").getRow(2).getCell(5).value,
  "number",
);
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Menu", exact: true }).click();
await page
  .getByRole("button", { name: "Project Tracker", exact: true })
  .click();
await page.getByRole("button", { name: "IRR-001", exact: true }).waitFor();
assert.equal(await page.locator(".sidebar").isVisible(), false);
await page.screenshot({ path: "artifacts/projects-mobile.png" });
assert.equal(
  await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
  true,
);
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "PASS desktop/mobile navigation, invoice links, actual workbook preview, import state, real XLSX export, no browser errors",
);
