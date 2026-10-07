# IPI Irrigation Project Billing & Sales Management

Internal web application starter for project billing, RA bill control, DC-to-tax-invoice tracking, daily sales, and management reporting.

## Run Locally

Double-click `run-localhost.cmd`, or run:

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Then open `http://localhost:5173`.

## Supabase

The browser-safe Supabase URL and publishable key are stored in `.env.local`.

Do not place database passwords, personal access tokens, or service-role keys in frontend files. Use those only in trusted local tooling or CI secrets.

Database migration and seed files are in:

- `supabase/migrations/001_initial_schema.sql`
- `supabase/seed/001_master_data.sql`
