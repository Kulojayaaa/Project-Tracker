create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

insert into public.app_settings (key, value, description)
values ('dc_overdue_days', '7'::jsonb, 'Default number of days after DC date before a pending tax invoice is treated as overdue.')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "authenticated can read app settings" on public.app_settings;
create policy "authenticated can read app settings" on public.app_settings
for select to authenticated using (true);

drop policy if exists "admins can manage app settings" on public.app_settings;
create policy "admins can manage app settings" on public.app_settings
for all to authenticated using (public.can_admin()) with check (public.can_admin());

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
before update on public.app_settings
for each row
execute function public.set_updated_at();

create or replace view public.project_billing_summary
with (security_invoker = true)
as
with active_fy as (
  select id, start_date, end_date
  from public.financial_years
  where active = true
  order by start_date desc
  limit 1
)
select
  p.id,
  p.project_code,
  p.project_name,
  c.name as client_name,
  p.wo_number,
  p.total_wo_value,
  p.opening_invoiced_amount,
  coalesce(current_invoices.current_invoiced_amount, 0) as current_invoiced_amount,
  p.opening_invoiced_amount + coalesce(current_invoices.current_invoiced_amount, 0) as total_invoiced_amount,
  greatest(p.billing_target - (p.opening_invoiced_amount + coalesce(current_invoices.current_invoiced_amount, 0)), 0) as pending_billing_amount,
  case
    when p.billing_target > 0 then ((p.opening_invoiced_amount + coalesce(current_invoices.current_invoiced_amount, 0)) / p.billing_target) * 100
    else 0
  end as billing_percentage,
  current_invoices.last_invoice_date,
  p.project_status,
  p.client_id,
  p.location,
  p.wo_date,
  p.project_start_date,
  p.expected_completion_date,
  p.project_manager_id,
  u.name as project_manager_name,
  p.base_wo_value,
  p.gst_value,
  p.billing_target,
  next_plan.next_proposed_billing_date,
  coalesce(next_plan.proposed_billing_amount, 0) as proposed_billing_amount,
  coalesce(future_plan.future_planned_billing, 0) as future_planned_billing,
  case
    when p.project_status = 'completed'
      and greatest(p.billing_target - (p.opening_invoiced_amount + coalesce(current_invoices.current_invoiced_amount, 0)), 0) > 0
      then 'Completed Project - Billing Pending'
    when greatest(p.billing_target - (p.opening_invoiced_amount + coalesce(current_invoices.current_invoiced_amount, 0)), 0) >
      coalesce(future_plan.future_planned_billing, 0)
      then 'Billing Plan Shortfall'
    when greatest(p.billing_target - (p.opening_invoiced_amount + coalesce(current_invoices.current_invoiced_amount, 0)), 0) = 0
      then 'Fully Billed'
    else 'Billing Fully Planned'
  end as billing_status,
  p.remarks,
  p.created_at,
  p.updated_at
from public.projects p
left join public.clients c on c.id = p.client_id
left join public.users u on u.id = p.project_manager_id
left join lateral (
  select
    sum(pi.total_amount) as current_invoiced_amount,
    max(pi.invoice_date) as last_invoice_date
  from public.project_invoices pi
  left join active_fy fy on true
  where pi.project_id = p.id
    and (
      pi.financial_year_id = fy.id
      or (
        pi.financial_year_id is null
        and fy.id is not null
        and pi.invoice_date between fy.start_date and fy.end_date
      )
    )
) current_invoices on true
left join lateral (
  select
    r.proposed_bill_date as next_proposed_billing_date,
    r.proposed_bill_amount as proposed_billing_amount
  from public.ra_bill_schedules r
  where r.project_id = p.id
    and r.bill_status not in ('raised', 'completed', 'cancelled')
  order by r.proposed_bill_date asc
  limit 1
) next_plan on true
left join lateral (
  select sum(r.proposed_bill_amount) as future_planned_billing
  from public.ra_bill_schedules r
  where r.project_id = p.id
    and r.bill_status not in ('raised', 'completed', 'cancelled')
) future_plan on true;

create or replace view public.dc_pending_summary
with (security_invoker = true)
as
with settings as (
  select coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'dc_overdue_days'), 7) as overdue_days
)
select
  dc.id,
  dc.dc_number,
  dc.dc_date,
  p.project_code,
  p.project_name,
  c.name as client_name,
  dc.dc_value,
  dc.expected_invoice_date,
  greatest((current_date - dc.dc_date), 0) as pending_days,
  case
    when dc.tax_invoice_raised then 'Invoiced'
    when current_date - dc.dc_date > settings.overdue_days then 'Overdue'
    when dc.expected_invoice_date is not null and dc.expected_invoice_date <= current_date then 'Due'
    else 'Pending'
  end as status,
  dc.project_id,
  dc.client_id,
  dc.material_description,
  dc.quantity,
  dc.uom,
  dc.responsible_person,
  u.name as responsible_person_name,
  dc.reason_pending,
  dc.invoice_id
from public.delivery_challans dc
cross join settings
join public.projects p on p.id = dc.project_id
left join public.clients c on c.id = dc.client_id
left join public.users u on u.id = dc.responsible_person
where dc.tax_invoice_required = true;

create or replace view public.dashboard_summary
with (security_invoker = true)
as
with active_fy as (
  select id, name, sales_target
  from public.financial_years
  where active = true
  order by start_date desc
  limit 1
),
sales_latest as (
  select distinct on (sd.financial_year_id)
    sd.financial_year_id,
    sd.cumulative_sales,
    sd.current_month_sales,
    sd.today_sales,
    sd.report_date
  from public.sales_daily sd
  join active_fy fy on fy.id = sd.financial_year_id
  order by sd.financial_year_id, sd.report_date desc
),
project_totals as (
  select
    count(*) as project_count,
    count(*) filter (where pending_billing_amount = 0) as fully_billed_project_count,
    count(*) filter (where pending_billing_amount > 0) as pending_project_count,
    coalesce(sum(total_wo_value), 0) as total_wo_value,
    coalesce(sum(total_invoiced_amount), 0) as total_invoiced_amount,
    coalesce(sum(pending_billing_amount), 0) as pending_billing_amount,
    coalesce(sum(future_planned_billing), 0) as future_planned_billing
  from public.project_billing_summary
),
pipeline_current as (
  select
    coalesce(sum(proposed_bill_amount), 0) as planned_amount,
    coalesce(sum(case when bill_status in ('raised', 'completed') then coalesce(actual_invoice_amount, proposed_bill_amount) else 0 end), 0) as actual_amount,
    coalesce(sum(case when bill_status not in ('raised', 'completed', 'cancelled') then proposed_bill_amount else 0 end), 0) as pending_amount
  from public.ra_bill_schedules
  where proposed_bill_date >= date_trunc('month', current_date)::date
    and proposed_bill_date < (date_trunc('month', current_date)::date + interval '1 month')
),
ra_totals as (
  select
    count(*) filter (where bill_status in ('due_soon', 'due')) as ra_due_count,
    count(*) filter (where bill_status = 'raised') as ra_raised_count,
    count(*) filter (where bill_status = 'delayed') as ra_delayed_count
  from public.ra_bill_schedules
),
dc_totals as (
  select
    coalesce(sum(case when status <> 'Invoiced' then dc_value else 0 end), 0) as pending_value,
    count(*) filter (where status <> 'Invoiced') as pending_count,
    count(*) filter (where status = 'Overdue') as overdue_count
  from public.dc_pending_summary
)
select
  fy.id as financial_year_id,
  fy.name as financial_year,
  fy.sales_target,
  sales_latest.cumulative_sales as sales_achieved,
  coalesce(sales_latest.current_month_sales, 0) as current_month_sales,
  coalesce(sales_latest.today_sales, 0) as today_sales,
  sales_latest.report_date as latest_sales_report_date,
  greatest(fy.sales_target - coalesce(sales_latest.cumulative_sales, 0), 0) as balance_to_target,
  case when fy.sales_target > 0 then (coalesce(sales_latest.cumulative_sales, 0) / fy.sales_target) * 100 else 0 end as sales_achievement_percentage,
  project_totals.total_wo_value,
  project_totals.total_invoiced_amount,
  project_totals.pending_billing_amount,
  case when project_totals.total_wo_value > 0 then (project_totals.total_invoiced_amount / project_totals.total_wo_value) * 100 else 0 end as project_billing_percentage,
  pipeline_current.planned_amount as current_month_planned_billing,
  pipeline_current.actual_amount as current_month_actual_billing,
  pipeline_current.pending_amount as current_month_pending_planned,
  greatest(project_totals.pending_billing_amount - project_totals.future_planned_billing, 0) as billing_plan_shortfall,
  dc_totals.pending_value as pending_dc_invoice_value,
  dc_totals.pending_count as pending_dc_count,
  dc_totals.overdue_count as overdue_dc_count,
  project_totals.project_count,
  project_totals.fully_billed_project_count,
  project_totals.pending_project_count,
  project_totals.future_planned_billing,
  ra_totals.ra_due_count,
  ra_totals.ra_raised_count,
  ra_totals.ra_delayed_count
from active_fy fy
cross join project_totals
cross join pipeline_current
cross join ra_totals
cross join dc_totals
left join sales_latest on sales_latest.financial_year_id = fy.id;
