# Main Project Grouping
Updated: 2026-10-10

The owner clarified that the workbook's 24 legacy Project Master rows are WO scopes, not 24 main projects.
Prestige Lake Works and Lake Additional Works share one main project. Prestige Bunker Works is separate.
The current reviewed workbook mapping produces 10 main projects and 24 WO scopes.

## Activation
For a database where the earlier billing upgrade is already applied, run MAIN_PROJECT_GROUPING_UPGRADE.sql once.
Do not rerun LIVE_DATABASE_UPGRADE.sql on an already upgraded database.
The combined file now includes migration 008 only for installations that have not applied the prior upgrade.

## Data Preservation
project_groups stores main projects. projects retains the legacy WO scope IDs and all existing foreign keys.
project_orders stores orders and their revisions under these scopes.
Invoices, RA bills, DCs, documents and audit history retain their existing scope links.
No existing records are deleted or automatically reassigned by migration 008.

## Workbook Review And Import
The preview shows main-project mapping separately from WO scope source records.
Grouping matches project name plus client. The confirmed Prestige Lake Additional Works rule shares the Lake main project.
The Bunker is not merged with the Lake.
Review the mapping before import. Unrelated projects must not be merged merely because their clients match.

Import remains atomic and rejects cross-client mappings, duplicate/missing source assignments, financial conflicts, and reassignment of already grouped scopes to another main project.
If the workbook was already imported unchanged, importing the same reviewed workbook skips matching financial rows and assigns their main-project groups without creating duplicate invoices.
If financial records were subsequently edited, import stops for review instead of overwriting them.
For other existing records, Project Master offers explicit same-client assignment of unassigned WO scopes.
Existing reassignment can be made through the WO Scope form; it does not move or delete invoice IDs.

## Calculations
Main project amounts roll up the individual WO scopes.
Pending billing is the sum of each scope's eligible pending billing, not the positive part of one combined balance.
This preserves per-WO closure/carry-forward decisions and prevents an overbilled or closed scope from hiding another scope's pending billing.
A main project is not marked fully invoiced merely because one child scope is closed.
Prestige Lake Additional Works is classified as an additional order.
An AMD-1 reference retains the current supplied amount once; missing earlier versions are not fabricated or added again.

## Verification
Actual workbook: 10 main projects, 24 scopes, 24 orders, 58 invoice/credit-note entries and one sales snapshot.
Fresh import, repeat import, regrouping existing rows with stable invoice IDs, cross-client rejection, and rollback tests.
Separate PostgreSQL checks for the incremental upgrade and the combined upgrade.
Desktop/mobile parent expansion, scope navigation, workbook mapping and grouped Excel export tests.
Live execution of migration 008 requires the Supabase administrator; the application cannot apply schema changes from a browser session.

