import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  billingFigures,
  dcBillingStatus,
  financialYearFor,
} from "../src/utils/billing";
import { readTrackerWorkbook } from "../src/services/trackerWorkbook";
import { rollupMainProjects } from "../src/utils/mainProjectTotals";
import type { ProjectSummary } from "../src/types/domain";
async function main() {
  assert.equal(financialYearFor("2026-03-31"), "2025-26");
  assert.equal(financialYearFor("2026-04-01"), "2026-27");
  assert.equal(
    billingFigures(10000000, 0, 3500000, 2000000, true, "open").pending,
    4500000,
  );
  const credit = billingFigures(
    8384735.59,
    0,
    14574446.6,
    -7921067.2,
    true,
    "open",
  );
  assert.equal(credit.fyTarget, -6189711.01);
  assert.equal(credit.pending, 1731356.19);
  const closed = billingFigures(973254.24, 0, 0, 627539.83, true, "closed");
  assert.equal(closed.pending, 0);
  assert.equal(closed.rawRemaining, 345714.41);
  assert.ok(closed.percentage < 100);
  assert.equal(
    dcBillingStatus(false, true, "2026-10-01", null, 7, "2026-10-09"),
    "Overdue",
  );
  assert.equal(
    dcBillingStatus(false, true, "2026-10-01", "2026-10-08", 7, "2026-10-08"),
    "Due",
  );
  assert.equal(
    dcBillingStatus(false, false, "2026-10-01", null, 7, "2026-10-09"),
    "Not Required",
  );
  assert.equal(
    dcBillingStatus(true, true, "2026-10-01", null, 7, "2026-10-09"),
    "Invoiced",
  );
  const rolled = rollupMainProjects(
    [
      {
        id: "main",
        project_code: "PRJ-1",
        project_name: "Parent",
        client_id: "client",
        location: null,
        description: null,
      },
    ],
    [
      {
        main_project_id: "main",
        client_name: "Client",
        pending_billing_amount: 100,
        raw_remaining_amount: 100,
        base_wo_value: 200,
        current_invoiced_amount: 100,
        total_invoiced_amount: 100,
      },
      {
        main_project_id: "main",
        client_name: "Client",
        pending_billing_amount: 0,
        raw_remaining_amount: -90,
        base_wo_value: 100,
        current_invoiced_amount: 190,
        total_invoiced_amount: 190,
      },
    ] as ProjectSummary[],
  );
  assert.equal(rolled[0].pending, 100);
  assert.equal(rolled[0].rawBalance, 10);
  const db = new PGlite();
  await db.exec(`create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  const files = process.argv.includes("--bundle")
    ? [
        "001_initial_schema",
        "002_project_code_generation",
        "003_fix_billing_summary_views",
      ]
    : [
        "001_initial_schema",
        "002_project_code_generation",
        "003_fix_billing_summary_views",
        "004_dc_linking_and_audit",
        "005_operational_tracking_views",
        "006_workbook_tracking",
        "007_private_project_documents",
        "008_main_project_grouping",
      ];
  for (const file of files) {
    await db.exec(
      readFileSync(`supabase/migrations/${file}.sql`, "utf8").replace(
        'create extension if not exists "pgcrypto";',
        "",
      ),
    );
    console.log(`PASS migration ${file}`);
  }
  if (process.argv.includes("--bundle")) {
    await db.exec(readFileSync("docs/LIVE_DATABASE_UPGRADE.sql", "utf8"));
    console.log("PASS combined live upgrade");
  }
  await db.query("select setval('project_group_code_seq',999)");
  assert.equal(
    (
      await db.query<{ code: string }>(
        "select generate_main_project_code() as code",
      )
    ).rows[0].code,
    "PRJ-1000",
  );
  await db.query("select setval('project_group_code_seq',1,false)");
  const user = "00000000-0000-0000-0000-000000000001";
  await db.exec(`insert into auth.users values ('${user}');insert into public.users(id,name,email,role) values ('${user}','Tester','test@example.invalid','project_admin');
    select set_config('request.jwt.claim.sub','${user}',false);
    grant usage on schema public,auth to authenticated;grant select,insert,update on all tables in schema public to authenticated;grant usage,select on all sequences in schema public to authenticated;
    insert into financial_years(name,start_date,end_date,sales_target,active) values ('FY 2026-27','2026-04-01','2027-03-31',250000000,true);`);
  const workbookPath = process.argv
    .slice(2)
    .find((arg) => !arg.startsWith("--"));
  if (workbookPath) {
    const bytes = readFileSync(workbookPath);
    const preview = await readTrackerWorkbook(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    );
    assert.deepEqual(
      preview.issues.filter((i) => i.severity === "error"),
      [],
    );
    assert.equal(preview.payload.projects.length, 24);
    assert.equal(preview.payload.groups?.length, 10);
    assert.deepEqual(
      preview.payload.groups?.find(
        (g) => g.project_name === "Prestige Lake Works",
      )?.source_codes,
      ["IRR-005", "IRR-007"],
    );
    assert.deepEqual(
      preview.payload.groups?.find(
        (g) => g.project_name === "Prestige Bunker Works",
      )?.source_codes,
      ["IRR-006"],
    );
    assert.equal(preview.clientCount, 9);
    assert.equal(preview.payload.invoices.length, 58);
    assert.equal(preview.creditCount, 3);
    assert.ok(
      preview.issues.some(
        (i) => i.location === "ORD-006" && i.message.startsWith("Amended WO"),
      ),
    );
    assert.equal(preview.payload.orders.length, 24);
    assert.equal(preview.payload.sales.length, 1);
    await db.exec("set role authenticated");
    const run = (payload: unknown) =>
      db.query<{ result: { imported: number; skipped: number } }>(
        "select import_billing_tracker($1::jsonb,'reference.xlsx') as result",
        [JSON.stringify(payload)],
      );
    const first = await run(preview.payload);
    assert.equal(first.rows[0].result.imported, 107);
    const repeat = await run(preview.payload);
    assert.deepEqual(repeat.rows[0].result, {
      imported: 0,
      skipped: 107,
      main_projects: 10,
      wo_scopes: 24,
    });
    assert.equal(
      (
        await db.query<{ order_type: string }>(
          "select order_type from project_orders where order_code='ORD-007'",
        )
      ).rows[0].order_type,
      "additional",
    );
    const grouped = await db.query<{ count: number }>(
      "select count(*)::int as count from project_groups",
    );
    assert.equal(grouped.rows[0].count, 10);
    const sandur = await db.query<{ count: number }>(
      "select count(*)::int as count from projects p join project_groups g on g.id=p.main_project_id where g.project_name='Sandur - Golf'",
    );
    assert.equal(sandur.rows[0].count, 10);
    const invoiceIds = await db.query<{ id: string }>(
      "select id from project_invoices order by id",
    );
    await db.exec(
      "reset role;update projects set main_project_id=null;delete from project_groups;set role authenticated;",
    );
    assert.deepEqual((await run(preview.payload)).rows[0].result, {
      imported: 0,
      skipped: 107,
      main_projects: 10,
      wo_scopes: 24,
    });
    assert.deepEqual(
      (
        await db.query<{ id: string }>(
          "select id from project_invoices order by id",
        )
      ).rows,
      invoiceIds.rows,
    );
    const malformed = structuredClone(preview.payload);
    malformed.groups![0].source_codes.push("IRR-004");
    await assert.rejects(run(malformed), /cross-client/);
    await assert.rejects(
      db.query(
        "select assign_main_project(array[(select id from projects where project_code='IRR-004')],(select id from project_groups where project_name='Mahabaleshwar Golf'))",
      ),
      /same client/,
    );
    await assert.rejects(
      db.query(
        "update projects set client_id=(select client_id from projects where project_code='IRR-004') where project_code='IRR-001'",
      ),
      /linked WO scope/,
    );
    console.log(
      "PASS 10 main projects, separate Prestige bunker, safe existing-record regrouping and cross-client rejection",
    );
    const net = await db.query<{ net: string }>(
      "select sum(amount_before_gst) as net from project_invoices where invoice_date between '2026-04-01' and '2027-03-31'",
    );
    assert.equal(Number(net.rows[0].net), 61427667.73);
    const corrupt = structuredClone(preview.payload);
    corrupt.invoices[0].amount_before_gst += 100;
    corrupt.projects.push({
      ...corrupt.projects[0],
      project_code: "IRR-999",
      wo_number: "WO-ROLLBACK",
    });
    corrupt.groups![0].source_codes.push("IRR-999");
    await assert.rejects(run(corrupt), /differs/);
    const rollback = await db.query<{ count: number }>(
      "select count(*)::int as count from projects where project_code='IRR-999'",
    );
    assert.equal(rollback.rows[0].count, 0);
    const wrong = await db.query<{ id: string }>(
      "select id from projects where project_code='IRR-001'",
    );
    await assert.rejects(
      db.query(
        "update project_invoices set project_id=$1 where invoice_number=$2",
        [wrong.rows[0].id, preview.payload.invoices[0].invoice_number],
      ),
      /WO\/PO must belong/,
    );
    const tax = await db.query<{ id: string }>(
      "select id from project_invoices where document_type='tax_invoice' and project_id<>$1 limit 1",
      [wrong.rows[0].id],
    );
    await assert.rejects(
      db.query(
        "insert into ra_bill_schedules(project_id,proposed_bill_date,proposed_bill_amount,billing_type,bill_status,actual_invoice_id) values ($1,'2026-10-10',10,'RA Bill','raised',$2)",
        [wrong.rows[0].id, tax.rows[0].id],
      ),
      /same project/,
    );
    const parent = (
      await db.query<{ id: string; project_id: string }>(
        "select id,project_id from project_orders where order_code='ORD-001'",
      )
    ).rows[0];
    const revision = {
      order_code: "ORD-REV",
      project_id: parent.project_id,
      order_number: "WO-REV",
      order_date: "2026-10-10",
      description: "Revised order",
      order_type: "revision",
      previous_order_id: parent.id,
      base_value: 22000000,
      gst_value: 3960000,
      status: "active",
      remarks: "Revision test",
    };
    const revisionResult = await db.query<{ id: string }>(
      "select save_project_order($1::jsonb) as id",
      [JSON.stringify(revision)],
    );
    const parentStatus = await db.query<{ status: string }>(
      "select status from project_orders where id=$1",
      [parent.id],
    );
    assert.equal(parentStatus.rows[0].status, "superseded");
    await db.query("select save_project_order($1::jsonb,$2::uuid)", [
      JSON.stringify({ ...revision, base_value: 22500000 }),
      revisionResult.rows[0].id,
    ]);
    const activeCount = await db.query<{ count: number }>(
      "select count(*)::int as count from project_orders where project_id=$1 and order_group='ORD-001' and status='active'",
      [parent.project_id],
    );
    assert.equal(activeCount.rows[0].count, 1);
    await assert.rejects(
      db.query("select save_project_order($1::jsonb)", [
        JSON.stringify({ ...revision, order_code: "ORD-REV-DUP" }),
      ]),
      /Previous order/,
    );
    const sameTax = (
      await db.query<{ id: string; invoice_date: string }>(
        "select id,invoice_date from project_invoices where project_id=$1 and document_type='tax_invoice' limit 1",
        [parent.project_id],
      )
    ).rows[0];
    await db.query(
      "insert into ra_bill_schedules(project_id,proposed_bill_date,proposed_bill_amount,billing_type,bill_status,actual_invoice_id) values ($1,'2026-10-10',100,'RA Bill','raised',$2)",
      [parent.project_id, sameTax.id],
    );
    await db.query(
      "update project_invoices set amount_before_gst=123456 where id=$1",
      [sameTax.id],
    );
    const raAmount = await db.query<{ amount: string }>(
      "select actual_invoice_amount as amount from ra_bill_schedules where actual_invoice_id=$1",
      [sameTax.id],
    );
    assert.equal(Number(raAmount.rows[0].amount), 123456);
    await assert.rejects(
      db.query(
        "update project_invoices set document_type='credit_note',amount_before_gst=-100,gst_amount=-18 where id=$1",
        [sameTax.id],
      ),
      /Linked invoice/,
    );
    await db.exec(
      "reset role;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;set role authenticated;",
    );
    await db.query(
      "insert into storage.objects(bucket_id,name,owner_id) values ('project-documents',$1,$2)",
      [parent.project_id + "/test.pdf", user],
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name,owner_id) values ('project-documents','unknown-project/test.pdf',$1)",
        [user],
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(
        "insert into project_documents(project_id,document_type,file_path,file_name,uploaded_by) values ($1,'WO',$2,'test.pdf',null)",
        [parent.project_id, parent.project_id + "/test.pdf"],
      ),
      /row-level security/,
    );
    console.log(
      "PASS order revisions, linked invoice updates and private document policy checks",
    );
    console.log(
      "PASS actual workbook, totals, repeat import, conflicts and cross-project links",
    );
  }
  await db.exec("reset role");
  const viewer = "00000000-0000-0000-0000-000000000002";
  await db.exec(
    `insert into auth.users values ('${viewer}');insert into users(id,name,email,role) values ('${viewer}','Viewer','viewer@example.invalid','hod_management');select set_config('request.jwt.claim.sub','${viewer}',false);set role authenticated;`,
  );
  await assert.rejects(
    db.query("select import_billing_tracker($1::jsonb,'denied.xlsx')", [
      JSON.stringify({
        projects: [],
        invoices: [],
        orders: [],
        sales: [],
        financialYears: [],
      }),
    ]),
    /requires Accounts/,
  );
  const fresh = "00000000-0000-0000-0000-000000000003";
  await db.exec("reset role");
  await db.exec(
    `insert into auth.users values ('${fresh}');select set_config('request.jwt.claim.sub','${fresh}',false);set role authenticated;`,
  );
  await assert.rejects(
    db.query(
      "insert into users(id,name,email,role) values ($1,'Bad','bad@example.invalid','admin')",
      [fresh],
    ),
    /row-level security/,
  );
  console.log("PASS role enforcement and signup privileges");
  await db.close();
  console.log("All tracker checks passed.");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
