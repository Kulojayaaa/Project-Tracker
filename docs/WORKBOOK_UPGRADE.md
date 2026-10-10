# Workbook Billing Upgrade
Implemented: 2026-10-10

## Database Activation
Apply `docs/LIVE_DATABASE_UPGRADE.sql` once in the existing Supabase SQL Editor.
This combines the audit setup, repaired views, workbook tracking, and private storage policies in one transaction.
It requires the original schema (migrations 001-003). It preserves existing operational rows.
If any statement fails, the entire upgrade rolls back. Do not apply both the combined file and migrations 006/007 separately.

The application checks whether the new order table exists. Existing basic pages still work before activation,
while the import and new tracking fields require the upgrade.

## Billing Rules
- WO/PO and invoice base amounts exclude GST. GST and document gross totals remain available separately.
- Prior billing is the manual opening base plus all recorded invoices before the active FY.
- Manual opening amounts cover transactions not already entered in the invoice ledger.
- FY target is effective order base minus prior net billing, when carried forward. Signed targets are retained.
- Current FY billing sums signed base transactions by invoice date within the active FY.
- Credit notes store negative base/GST amounts. Forms accept positive credit amounts and deduct them once.
- Active order versions contribute to contract value; superseded versions do not. Revisions replace one prior version, while additional orders add value.
- Operational completion and billing closure are separate. Closure needs a reason.
- Closed/cancelled balances do not appear as open pending billing; the raw remaining balance is retained.
- Closing a project does not manufacture 100% invoicing.
- Last invoice date uses chronological dates rather than spreadsheet row order.
- Official department sales are Accounts snapshots and remain separate from project invoicing.
- Daily cumulative snapshots are compared, never summed across days.
- A cancelled RA plan is excluded from planned billing. Linking requires a tax invoice in the same project.

## Excel Import
Settings > Excel Import supports the supplied FY2026-27 tracker layout, including hidden sheets.
The workbook is read in the browser; uploading/selecting it does not write database records.
The preview checks source IDs, dates, amounts, financial years, closure reasons, relationships, and summary totals.
Blank WO/PO base values can use the project's verified base only for a single-order project; this is exposed for review.
Blank invoice order links can use the single order belonging to that project; this is exposed for review.
Negative entries are imported as credit notes and require later verification of the original tax invoice.
The stored ledger keeps cents; the preview separately reproduces the workbook's whole-rupee summary rounding.

Import requires Accounts, Project Admin, or Admin access and a reviewed preview.
The database imports the batch in one transaction. Matching records are skipped.
Conflicting existing financial records stop the entire batch; the app never overwrites them automatically.
Project IDs are preserved. Imported historical invoices do not also become opening balances.
New financial years are created inactive; activate the correct year in Financial Years if needed.

## Private Documents And Access
Project files use the private `project-documents` bucket with a 10 MB limit.
Documents support PDF, JPEG, PNG, XLSX, and DOCX. Signed links expire after ten minutes.
Metadata is linked to the project and the authenticated uploader.
Failed metadata creation attempts to remove only the file just uploaded.
New signups receive the Project Manager role; accounts cannot grant themselves administrative roles.
Existing user roles are preserved. Only Admin users can change user roles/activation.
An existing Admin is needed for staff access administration; the upgrade does not silently promote any account.
Audit history is visible for operational tables to operational staff and administrators.

## Verification
- TypeScript production build and existing lint check.
- PostgreSQL migration sequence and combined upgrade, using PGlite.
- Read-only parsing of the actual supplied workbook; no workbook copy or business-data seed is committed.
- Actual import: 24 projects, 24 orders, 58 documents including 3 credit notes, and 1 sales snapshot.
- Repeat import, conflicting batch rollback, cross-project links, and privilege checks.
- Browser workflow tests with intercepted test data, desktop/mobile screenshots, horizontal overflow check, and genuine XLSX export parsing.
- Live database application, Storage uploads and real-account end-to-end checks require Supabase activation/access.

Regenerate the combined SQL with `pnpm run db:upgrade`.
Run database tests with `pnpm test`; pass a local workbook path to include its import/reconciliation checks.
Browser tests use installed Playwright or the `PLAYWRIGHT_RUNTIME` package location and a running server at port 5175.
