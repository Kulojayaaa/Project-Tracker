create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'project_admin', 'project_manager', 'accounts_finance', 'hod_management');
create type public.project_status as enum ('planned', 'active', 'on_hold', 'near_completion', 'completed', 'cancelled');
create type public.bill_status as enum ('planned', 'due_soon', 'due', 'raised', 'delayed', 'cancelled', 'completed');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role public.user_role not null default 'project_admin',
  department text not null default 'Irrigation',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  sales_target numeric(14,2) not null default 0,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint financial_years_date_order check (end_date > start_date)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_person text,
  email text,
  phone text,
  gstin text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique,
  project_name text not null,
  client_id uuid references public.clients(id),
  location text,
  wo_number text,
  wo_date date,
  project_start_date date,
  expected_completion_date date,
  project_manager_id uuid references public.users(id),
  project_status public.project_status not null default 'planned',
  base_wo_value numeric(14,2) not null default 0,
  gst_value numeric(14,2) not null default 0,
  total_wo_value numeric(14,2) generated always as (base_wo_value + gst_value) stored,
  billing_target numeric(14,2) not null default 0,
  opening_invoiced_amount numeric(14,2) not null default 0,
  remarks text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_base_wo_nonnegative check (base_wo_value >= 0),
  constraint projects_gst_nonnegative check (gst_value >= 0),
  constraint projects_billing_target_nonnegative check (billing_target >= 0),
  constraint projects_opening_invoice_nonnegative check (opening_invoiced_amount >= 0)
);
create unique index projects_wo_number_unique_not_null on public.projects (wo_number) where wo_number is not null and wo_number <> '';
create index projects_client_id_idx on public.projects(client_id);
create index projects_project_manager_id_idx on public.projects(project_manager_id);
create index projects_status_idx on public.projects(project_status);

create table public.project_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  invoice_date date not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  invoice_type text not null,
  invoice_description text,
  billing_period_from date,
  billing_period_to date,
  amount_before_gst numeric(14,2) not null default 0,
  gst_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) generated always as (amount_before_gst + gst_amount) stored,
  financial_year_id uuid references public.financial_years(id),
  entered_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_invoices_amount_nonnegative check (amount_before_gst >= 0 and gst_amount >= 0)
);
create index project_invoices_project_id_idx on public.project_invoices(project_id);
create index project_invoices_financial_year_id_idx on public.project_invoices(financial_year_id);
create index project_invoices_invoice_date_idx on public.project_invoices(invoice_date);

create table public.ra_bill_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  billing_period text,
  billing_period_from date,
  billing_period_to date,
  proposed_bill_date date not null,
  proposed_bill_amount numeric(14,2) not null default 0,
  billing_type text not null default 'RA Bill',
  work_status text,
  bill_status public.bill_status not null default 'planned',
  actual_invoice_id uuid references public.project_invoices(id),
  actual_invoice_date date,
  actual_invoice_amount numeric(14,2),
  responsible_person uuid references public.users(id),
  reason_not_raised text,
  remarks text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ra_bill_schedules_proposed_amount_nonnegative check (proposed_bill_amount >= 0),
  constraint ra_bill_schedules_actual_amount_nonnegative check (actual_invoice_amount is null or actual_invoice_amount >= 0)
);
create index ra_bill_schedules_project_id_idx on public.ra_bill_schedules(project_id);
create index ra_bill_schedules_proposed_bill_date_idx on public.ra_bill_schedules(proposed_bill_date);
create index ra_bill_schedules_bill_status_idx on public.ra_bill_schedules(bill_status);

create table public.delivery_challans (
  id uuid primary key default gen_random_uuid(),
  dc_number text not null unique,
  dc_date date not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid references public.clients(id),
  material_description text not null,
  quantity numeric(14,3) not null default 0,
  uom text,
  dc_value numeric(14,2) not null default 0,
  tax_invoice_required boolean not null default true,
  tax_invoice_raised boolean not null default false,
  invoice_id uuid references public.project_invoices(id),
  expected_invoice_date date,
  reason_pending text,
  responsible_person uuid references public.users(id),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_challans_quantity_nonnegative check (quantity >= 0),
  constraint delivery_challans_value_nonnegative check (dc_value >= 0)
);
create index delivery_challans_project_id_idx on public.delivery_challans(project_id);
create index delivery_challans_client_id_idx on public.delivery_challans(client_id);
create index delivery_challans_dc_date_idx on public.delivery_challans(dc_date);
create index delivery_challans_invoice_pending_idx on public.delivery_challans(tax_invoice_required, tax_invoice_raised);

create table public.sales_daily (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  financial_year_id uuid not null references public.financial_years(id),
  sales_group text not null default 'Irrigation',
  sales_target numeric(14,2) not null default 0,
  sales_up_to_yesterday numeric(14,2) not null default 0,
  today_sales numeric(14,2) not null default 0,
  current_month_sales numeric(14,2) not null default 0,
  cumulative_sales numeric(14,2) not null default 0,
  achievement_percentage numeric(8,4) generated always as (case when sales_target > 0 then (cumulative_sales / sales_target) * 100 else 0 end) stored,
  balance_to_target numeric(14,2) generated always as (greatest(sales_target - cumulative_sales, 0)) stored,
  balance_percentage numeric(8,4) generated always as (case when sales_target > 0 then (greatest(sales_target - cumulative_sales, 0) / sales_target) * 100 else 0 end) stored,
  source_reference text,
  remarks text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  constraint sales_daily_unique_report_date unique (financial_year_id, sales_group, report_date),
  constraint sales_daily_amounts_nonnegative check (sales_target >= 0 and sales_up_to_yesterday >= 0 and today_sales >= 0 and current_month_sales >= 0 and cumulative_sales >= 0)
);

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  document_type text not null,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  action text not null,
  module text not null,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  title text not null,
  body text not null,
  module text,
  record_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid() and active = true
$$;

create or replace function public.can_write_operations()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role() in ('admin', 'project_admin', 'project_manager', 'accounts_finance')
$$;

create or replace function public.can_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role() = 'admin'
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger project_invoices_set_updated_at before update on public.project_invoices for each row execute function public.set_updated_at();
create trigger ra_bill_schedules_set_updated_at before update on public.ra_bill_schedules for each row execute function public.set_updated_at();
create trigger delivery_challans_set_updated_at before update on public.delivery_challans for each row execute function public.set_updated_at();

create or replace view public.project_billing_summary as
select p.id, p.project_code, p.project_name, c.name as client_name, p.wo_number, p.total_wo_value,
  p.opening_invoiced_amount,
  coalesce(sum(pi.total_amount), 0) as current_invoiced_amount,
  p.opening_invoiced_amount + coalesce(sum(pi.total_amount), 0) as total_invoiced_amount,
  greatest(p.billing_target - (p.opening_invoiced_amount + coalesce(sum(pi.total_amount), 0)), 0) as pending_billing_amount,
  case when p.billing_target > 0 then ((p.opening_invoiced_amount + coalesce(sum(pi.total_amount), 0)) / p.billing_target) * 100 else 0 end as billing_percentage,
  max(pi.invoice_date) as last_invoice_date,
  p.project_status
from public.projects p
left join public.clients c on c.id = p.client_id
left join public.project_invoices pi on pi.project_id = p.id
group by p.id, c.name;

create or replace view public.billing_pipeline_summary as
select date_trunc('month', proposed_bill_date)::date as billing_month,
  sum(proposed_bill_amount) as planned_amount,
  sum(case when bill_status in ('raised', 'completed') then coalesce(actual_invoice_amount, proposed_bill_amount) else 0 end) as actual_amount,
  sum(case when bill_status not in ('raised', 'completed', 'cancelled') then proposed_bill_amount else 0 end) as pending_amount
from public.ra_bill_schedules
group by date_trunc('month', proposed_bill_date)::date;

create or replace view public.dc_pending_summary as
select dc.id, dc.dc_number, dc.dc_date, p.project_code, p.project_name, c.name as client_name, dc.dc_value,
  dc.expected_invoice_date, greatest((current_date - dc.dc_date), 0) as pending_days,
  case when dc.tax_invoice_raised then 'Invoiced'
    when dc.expected_invoice_date is not null and dc.expected_invoice_date < current_date then 'Overdue'
    when dc.expected_invoice_date is not null and dc.expected_invoice_date <= current_date + 3 then 'Due'
    else 'Pending' end as status
from public.delivery_challans dc
join public.projects p on p.id = dc.project_id
left join public.clients c on c.id = dc.client_id
where dc.tax_invoice_required = true;

create or replace view public.sales_summary as
select distinct on (fy.id) fy.id as financial_year_id, fy.name as financial_year, fy.sales_target as target,
  coalesce(sd.cumulative_sales, 0) as achieved,
  greatest(fy.sales_target - coalesce(sd.cumulative_sales, 0), 0) as balance,
  case when fy.sales_target > 0 then (coalesce(sd.cumulative_sales, 0) / fy.sales_target) * 100 else 0 end as achievement_percentage,
  sd.report_date
from public.financial_years fy
left join public.sales_daily sd on sd.financial_year_id = fy.id
order by fy.id, sd.report_date desc nulls last;

alter table public.users enable row level security;
alter table public.financial_years enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_invoices enable row level security;
alter table public.ra_bill_schedules enable row level security;
alter table public.delivery_challans enable row level security;
alter table public.sales_daily enable row level security;
alter table public.project_documents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

create policy "authenticated users can read users" on public.users for select to authenticated using (true);
create policy "admins can manage users" on public.users for all to authenticated using (public.can_admin()) with check (public.can_admin());
create policy "users can insert own profile" on public.users for insert to authenticated with check (id = auth.uid());

create policy "authenticated can read financial years" on public.financial_years for select to authenticated using (true);
create policy "admins can manage financial years" on public.financial_years for all to authenticated using (public.can_admin()) with check (public.can_admin());

create policy "authenticated can read clients" on public.clients for select to authenticated using (true);
create policy "operations can create clients" on public.clients for insert to authenticated with check (public.can_write_operations());
create policy "operations can update clients" on public.clients for update to authenticated using (public.can_write_operations()) with check (public.can_write_operations());

create policy "authenticated can read projects" on public.projects for select to authenticated using (true);
create policy "operations can create projects" on public.projects for insert to authenticated with check (public.can_write_operations());
create policy "operations can update projects" on public.projects for update to authenticated using (public.can_write_operations()) with check (public.can_write_operations());

create policy "authenticated can read invoices" on public.project_invoices for select to authenticated using (true);
create policy "operations can create invoices" on public.project_invoices for insert to authenticated with check (public.can_write_operations());
create policy "operations can update invoices" on public.project_invoices for update to authenticated using (public.can_write_operations()) with check (public.can_write_operations());

create policy "authenticated can read ra schedules" on public.ra_bill_schedules for select to authenticated using (true);
create policy "operations can create ra schedules" on public.ra_bill_schedules for insert to authenticated with check (public.can_write_operations());
create policy "operations can update ra schedules" on public.ra_bill_schedules for update to authenticated using (public.can_write_operations()) with check (public.can_write_operations());

create policy "authenticated can read delivery challans" on public.delivery_challans for select to authenticated using (true);
create policy "operations can create delivery challans" on public.delivery_challans for insert to authenticated with check (public.can_write_operations());
create policy "operations can update delivery challans" on public.delivery_challans for update to authenticated using (public.can_write_operations()) with check (public.can_write_operations());

create policy "authenticated can read sales" on public.sales_daily for select to authenticated using (true);
create policy "accounts and admins can create sales" on public.sales_daily for insert to authenticated with check (public.current_user_role() in ('admin', 'project_admin', 'accounts_finance'));
create policy "accounts and admins can update sales" on public.sales_daily for update to authenticated using (public.current_user_role() in ('admin', 'accounts_finance')) with check (public.current_user_role() in ('admin', 'accounts_finance'));

create policy "authenticated can read documents" on public.project_documents for select to authenticated using (true);
create policy "operations can create documents" on public.project_documents for insert to authenticated with check (public.can_write_operations());

create policy "admins can read audit logs" on public.audit_logs for select to authenticated using (public.can_admin());
create policy "authenticated can create audit logs" on public.audit_logs for insert to authenticated with check (auth.uid() = user_id);

create policy "users can read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "users can update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "operations can create notifications" on public.notifications for insert to authenticated with check (public.can_write_operations());
