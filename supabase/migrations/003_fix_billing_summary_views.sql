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
  p.project_status
from public.projects p
left join public.clients c on c.id = p.client_id
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
) current_invoices on true;

create or replace view public.billing_pipeline_summary
with (security_invoker = true)
as
select date_trunc('month', proposed_bill_date)::date as billing_month,
  sum(proposed_bill_amount) as planned_amount,
  sum(case when bill_status in ('raised', 'completed') then coalesce(actual_invoice_amount, proposed_bill_amount) else 0 end) as actual_amount,
  sum(case when bill_status not in ('raised', 'completed', 'cancelled') then proposed_bill_amount else 0 end) as pending_amount
from public.ra_bill_schedules
group by date_trunc('month', proposed_bill_date)::date;

create or replace view public.dc_pending_summary
with (security_invoker = true)
as
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

create or replace view public.sales_summary
with (security_invoker = true)
as
select distinct on (fy.id) fy.id as financial_year_id, fy.name as financial_year, fy.sales_target as target,
  coalesce(sd.cumulative_sales, 0) as achieved,
  greatest(fy.sales_target - coalesce(sd.cumulative_sales, 0), 0) as balance,
  case when fy.sales_target > 0 then (coalesce(sd.cumulative_sales, 0) / fy.sales_target) * 100 else 0 end as achievement_percentage,
  sd.report_date
from public.financial_years fy
left join public.sales_daily sd on sd.financial_year_id = fy.id
order by fy.id, sd.report_date desc nulls last;

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
    coalesce(sum(total_wo_value), 0) as total_wo_value,
    coalesce(sum(total_invoiced_amount), 0) as total_invoiced_amount,
    coalesce(sum(pending_billing_amount), 0) as pending_billing_amount
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
dc_totals as (
  select
    coalesce(sum(case when tax_invoice_required and not tax_invoice_raised then dc_value else 0 end), 0) as pending_value,
    count(*) filter (where tax_invoice_required and not tax_invoice_raised) as pending_count,
    count(*) filter (where tax_invoice_required and not tax_invoice_raised and expected_invoice_date < current_date) as overdue_count
  from public.delivery_challans
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
  greatest(project_totals.pending_billing_amount - pipeline_current.pending_amount, 0) as billing_plan_shortfall,
  dc_totals.pending_value as pending_dc_invoice_value,
  dc_totals.pending_count as pending_dc_count,
  dc_totals.overdue_count as overdue_dc_count
from active_fy fy
cross join project_totals
cross join pipeline_current
cross join dc_totals
left join sales_latest on sales_latest.financial_year_id = fy.id;


