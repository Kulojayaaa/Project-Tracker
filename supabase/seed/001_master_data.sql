insert into public.financial_years (name, start_date, end_date, sales_target, active)
values
  ('FY 2024-25', '2024-04-01', '2025-03-31', 0, false),
  ('FY 2025-26', '2025-04-01', '2026-03-31', 0, false),
  ('FY 2026-27', '2026-04-01', '2027-03-31', 250000000, true)
on conflict (name) do update
set start_date = excluded.start_date,
    end_date = excluded.end_date,
    sales_target = excluded.sales_target,
    active = excluded.active;

insert into public.clients (name, contact_person, active)
values
  ('Sample Golf Project Client', 'Sample Contact', true),
  ('Sample Cricket Project Client', 'Sample Contact', true),
  ('Sample Landscape Project Client', 'Sample Contact', true)
on conflict (name) do nothing;
