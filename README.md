# IPI Irrigation Project Billing & Sales Management

Internal web application for project billing, RA bill control, DC-to-tax-invoice tracking, daily sales, and management reporting.

## Workbook Upgrade (2026-10-10)

See [Main Project Grouping](docs/MAIN_PROJECT_GROUPING.md) for the corrected main-project / WO structure and incremental upgrade for an already upgraded database.

See [Workbook Billing Upgrade](docs/WORKBOOK_UPGRADE.md) for the implemented tracking rules and Excel import.
For a database already using the earlier billing upgrade, apply only [Main Project Grouping Upgrade](docs/MAIN_PROJECT_GROUPING_UPGRADE.sql) once. Do not rerun the full upgrade.
For an original-schema installation, apply [Live Database Upgrade](docs/LIVE_DATABASE_UPGRADE.sql) once. Review the upgrade notes first.

## Run Locally

Double-click `run-localhost.cmd`, or run:

```bash
pnpm install
pnpm exec vite --host 127.0.0.1 --port 5175
```

Then open `http://127.0.0.1:5175`.

## Supabase

The browser-safe Supabase URL and publishable key are stored in `.env.local` for local development and in Vercel Environment Variables for deployment.

Required variables:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Optional production override for networks that block `*.supabase.co`:

```bash
VITE_SUPABASE_API_URL=https://api.yourdomain.com
```

When `VITE_SUPABASE_API_URL` is set, the browser client uses that URL instead of `VITE_SUPABASE_URL`. For a full domain URL, configure a Supabase custom domain first. This deployment instead uses `VITE_SUPABASE_API_URL=/supabase` with the trusted server-side Vercel rewrite, so browser requests stay on the application domain.

Do not place database passwords, personal access tokens, or service-role keys in frontend files. Use those only in trusted local tooling or CI secrets.

Database migration and seed files are in:

- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_project_code_generation.sql`
- `supabase/migrations/003_fix_billing_summary_views.sql`
- `supabase/migrations/004_dc_linking_and_audit.sql`
- `supabase/migrations/005_operational_tracking_views.sql`
- `supabase/seed/001_master_data.sql`

## Deploy To Vercel

1. Push this repository to GitHub.
2. Import the GitHub repository in Vercel.
3. Set Framework Preset to `Vite`.
4. Set Build Command to `pnpm run build`.
5. Set Output Directory to `dist`.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel Project Settings. Add `VITE_SUPABASE_API_URL` only if you have configured a Supabase custom domain.
7. Deploy.

After deployment, open Supabase Dashboard and check Authentication settings:

- Site URL should be your Vercel production URL.
- Add your Vercel production URL to Redirect URLs.
- If email confirmation is enabled, configure SMTP or use a real email address for signup.

## Network/DNS Check

The app does not block DNS and does not hardcode IP addresses. The browser must be able to resolve and reach your Supabase project URL over HTTPS. A reported Supabase issue describes Indian Jio/Reliance networks resolving `*.supabase.co` to ISP-controlled sinkhole IPs, causing timeout/fetch failures. If your users are affected, use Supabase custom domains and set `VITE_SUPABASE_API_URL` to that custom domain in Vercel.

On Windows, check DNS with:

```powershell
Resolve-DnsName your-project.supabase.co -Server 1.1.1.1
Resolve-DnsName your-project.supabase.co -Server 8.8.8.8
```

If local DNS returns a different or suspicious IP, change the computer/router DNS to trusted public DNS such as `1.1.1.1` and `8.8.8.8`, then run:

```powershell
ipconfig /flushdns
```
