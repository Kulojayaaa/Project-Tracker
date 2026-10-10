-- Apply once in the existing Supabase project's SQL Editor.
-- All changes commit together; failure rolls back the upgrade.
begin;
-- 004_dc_linking_and_audit
create or replace function public.sync_dc_invoice_flags()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invoice_id is not null then
    new.tax_invoice_raised := true;
  elsif new.invoice_id is null then
    new.tax_invoice_raised := false;
  end if;

  return new;
end;
$$;

drop trigger if exists delivery_challans_sync_invoice_flags on public.delivery_challans;
create trigger delivery_challans_sync_invoice_flags
before insert or update of invoice_id on public.delivery_challans
for each row
execute function public.sync_dc_invoice_flags();

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (user_id, action, module, record_id, old_value, new_value)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists projects_audit_changes on public.projects;
create trigger projects_audit_changes after insert or update on public.projects for each row execute function public.audit_row_change();

drop trigger if exists project_invoices_audit_changes on public.project_invoices;
create trigger project_invoices_audit_changes after insert or update on public.project_invoices for each row execute function public.audit_row_change();

drop trigger if exists ra_bill_schedules_audit_changes on public.ra_bill_schedules;
create trigger ra_bill_schedules_audit_changes after insert or update on public.ra_bill_schedules for each row execute function public.audit_row_change();

drop trigger if exists delivery_challans_audit_changes on public.delivery_challans;
create trigger delivery_challans_audit_changes after insert or update on public.delivery_challans for each row execute function public.audit_row_change();

drop trigger if exists sales_daily_audit_changes on public.sales_daily;
create trigger sales_daily_audit_changes after insert or update on public.sales_daily for each row execute function public.audit_row_change();

-- 005_operational_tracking_views
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

-- 006_workbook_tracking
alter table public.projects
  add column if not exists project_description text,
  add column if not exists carry_forward boolean not null default true,
  add column if not exists billing_closure text not null default 'open',
  add column if not exists closure_remarks text;
alter table public.projects add constraint projects_closure_valid
  check (billing_closure in ('open','closed','cancelled_balance','pending_confirmation')
    and (billing_closure not in ('closed','cancelled_balance') or nullif(btrim(closure_remarks),'') is not null));

create table public.project_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  project_id uuid not null references public.projects(id),
  order_number text not null,
  order_date date,
  description text,
  order_type text not null check (order_type in ('original','additional','revision')),
  order_group text not null,
  version integer not null default 1 check (version > 0),
  previous_order_id uuid references public.project_orders(id),
  base_value numeric(14,2) not null check (base_value >= 0),
  gst_value numeric(14,2) not null default 0 check (gst_value >= 0),
  status text not null default 'active' check (status in ('active','superseded','cancelled')),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, order_group, version)
);
create unique index project_orders_one_active_version on public.project_orders(project_id,order_group) where status = 'active';
alter table public.project_orders enable row level security;
grant select,insert,update on public.project_orders to authenticated;
create policy orders_read on public.project_orders for select to authenticated using (true);
create policy orders_insert on public.project_orders for insert to authenticated with check (public.can_write_operations());
create policy orders_update on public.project_orders for update to authenticated using (public.can_write_operations()) with check (public.can_write_operations());
create trigger orders_updated before update on public.project_orders for each row execute function public.set_updated_at();
create trigger orders_audit after insert or update on public.project_orders for each row execute function public.audit_row_change();

alter table public.project_invoices
  add column if not exists document_type text not null default 'tax_invoice',
  add column if not exists order_id uuid references public.project_orders(id),
  add column if not exists original_invoice_id uuid references public.project_invoices(id),
  add column if not exists remarks text;
alter table public.project_invoices drop constraint project_invoices_amount_nonnegative;
alter table public.project_invoices add constraint invoice_document_amount_sign check (
  (document_type = 'tax_invoice' and amount_before_gst >= 0 and gst_amount >= 0)
  or (document_type = 'credit_note' and amount_before_gst <= 0 and gst_amount <= 0 and amount_before_gst < 0)
);
create index invoices_order_idx on public.project_invoices(order_id);

create or replace function public.validate_tracking_links() returns trigger
language plpgsql set search_path = public as $$
declare linked public.project_invoices; fy public.financial_years;
begin
  if tg_table_name = 'project_invoices' then
    if new.order_id is not null and not exists(select 1 from public.project_orders where id = new.order_id and project_id = new.project_id) then
      raise exception 'WO/PO must belong to the invoice project';
    end if;
    if new.original_invoice_id is not null then
      select * into linked from public.project_invoices where id = new.original_invoice_id;
      if linked.id is null or linked.id = new.id or linked.project_id <> new.project_id or linked.document_type <> 'tax_invoice' or new.document_type <> 'credit_note' then
        raise exception 'Credit note must reference a tax invoice in the same project';
      end if;
    end if;
    if new.financial_year_id is not null then
      select * into fy from public.financial_years where id = new.financial_year_id;
      if new.invoice_date not between fy.start_date and fy.end_date then raise exception 'Invoice date is outside the selected financial year'; end if;
    end if;
    if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.document_type <> old.document_type) and (
      exists(select 1 from public.ra_bill_schedules where actual_invoice_id = old.id)
      or exists(select 1 from public.delivery_challans where invoice_id = old.id)
      or exists(select 1 from public.project_invoices where original_invoice_id = old.id)
    ) then raise exception 'Linked invoice cannot move to a different project'; end if;
  elsif tg_table_name = 'project_orders' then
    if new.previous_order_id is not null and not exists(select 1 from public.project_orders where id = new.previous_order_id and id <> new.id and project_id = new.project_id and order_group = new.order_group and version < new.version) then
      raise exception 'Previous order must be an earlier version in the same project and order group';
    end if;
    if new.order_type = 'revision' and new.previous_order_id is null then raise exception 'Revision requires a previous order'; end if;
    if tg_op = 'UPDATE' and new.project_id <> old.project_id and exists(select 1 from public.project_invoices where order_id = old.id) then
      raise exception 'An invoiced order cannot move to a different project';
    end if;
  else
    if tg_table_name = 'ra_bill_schedules' then
      if new.actual_invoice_id is not null then
        select * into linked from public.project_invoices where id = new.actual_invoice_id;
        if linked.id is null or linked.project_id <> new.project_id or linked.document_type <> 'tax_invoice' then raise exception 'RA invoice must be a tax invoice in the same project'; end if;
        new.actual_invoice_date := linked.invoice_date;
        new.actual_invoice_amount := linked.amount_before_gst;
      else
        if new.bill_status in ('raised','completed') then raise exception 'Raised or completed RA bill requires an invoice'; end if;
        new.actual_invoice_date := null;
        new.actual_invoice_amount := null;
      end if;
    elsif tg_table_name = 'delivery_challans' then
      if new.client_id is distinct from (select client_id from public.projects where id = new.project_id) then raise exception 'DC client must match project client'; end if;
      if new.invoice_id is not null then
        select * into linked from public.project_invoices where id = new.invoice_id;
        if linked.id is null or linked.project_id <> new.project_id or linked.document_type <> 'tax_invoice' then raise exception 'DC invoice must be a tax invoice in the same project'; end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger invoice_tracking_links before insert or update on public.project_invoices for each row execute function public.validate_tracking_links();
create trigger order_tracking_links before insert or update on public.project_orders for each row execute function public.validate_tracking_links();
create trigger ra_tracking_links before insert or update on public.ra_bill_schedules for each row execute function public.validate_tracking_links();
create trigger dc_tracking_links before insert or update on public.delivery_challans for each row execute function public.validate_tracking_links();

create or replace function public.save_project_order(payload jsonb, record_id uuid default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare parent public.project_orders; result_id uuid; group_name text; ver integer;
begin
  if not public.can_write_operations() then raise exception 'Operations access required'; end if;
  perform pg_advisory_xact_lock(hashtext(payload->>'project_id'));
  group_name := payload->>'order_code'; ver := 1;
  if record_id is null and nullif(payload->>'previous_order_id','') is not null then
    select * into parent from public.project_orders where id = (payload->>'previous_order_id')::uuid for update;
    if parent.id is null or parent.status <> 'active' or parent.project_id <> (payload->>'project_id')::uuid then raise exception 'Previous order must belong to this project'; end if;
    group_name := parent.order_group; ver := parent.version + 1;
    update public.project_orders set status = 'superseded' where id = parent.id and status = 'active';
  end if;
  if record_id is null then
    insert into public.project_orders(order_code,project_id,order_number,order_date,description,order_type,order_group,version,previous_order_id,base_value,gst_value,status,remarks)
    values(payload->>'order_code',(payload->>'project_id')::uuid,payload->>'order_number',nullif(payload->>'order_date','')::date,payload->>'description',payload->>'order_type',group_name,ver,nullif(payload->>'previous_order_id','')::uuid,(payload->>'base_value')::numeric,(payload->>'gst_value')::numeric,payload->>'status',payload->>'remarks') returning id into result_id;
  else
    update public.project_orders set order_number=payload->>'order_number',order_date=nullif(payload->>'order_date','')::date,
      description=payload->>'description',base_value=(payload->>'base_value')::numeric,gst_value=(payload->>'gst_value')::numeric,status=payload->>'status',remarks=payload->>'remarks'
      where id=record_id and project_id=(payload->>'project_id')::uuid returning id into result_id;
    if result_id is null then raise exception 'Order not found or not editable'; end if;
  end if;
  return result_id;
end;
$$;
revoke all on function public.save_project_order(jsonb,uuid) from public;
grant execute on function public.save_project_order(jsonb,uuid) to authenticated;

create or replace function public.sync_ra_invoice_amounts() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.ra_bill_schedules set actual_invoice_date=new.invoice_date, actual_invoice_amount=new.amount_before_gst
  where actual_invoice_id=new.id;
  return new;
end;
$$;
create trigger invoices_sync_ra after update of amount_before_gst,invoice_date on public.project_invoices
for each row execute function public.sync_ra_invoice_amounts();

create policy fy_operations_insert on public.financial_years for insert to authenticated
with check (public.current_user_role() in ('admin','project_admin','accounts_finance') and active = false);

create or replace function public.import_billing_tracker(payload jsonb, source_name text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare item jsonb; project_uuid uuid; client_uuid uuid; fy_uuid uuid; existing record; imported integer := 0; skipped integer := 0;
begin
  if public.current_user_role() not in ('admin','project_admin','accounts_finance') then raise exception 'Import requires Accounts or Project Admin access'; end if;
  perform pg_advisory_xact_lock(hashtext('billing_tracker_import'));
  if jsonb_array_length(payload->'projects') > 1000 or jsonb_array_length(payload->'invoices') > 10000 then raise exception 'Import exceeds batch limit'; end if;
  for item in select value from jsonb_array_elements(payload->'financialYears') loop
    if not exists(select 1 from public.financial_years where start_date=(item->>'start_date')::date and end_date=(item->>'end_date')::date) then
      insert into public.financial_years(name,start_date,end_date,sales_target,active)
      values(item->>'name',(item->>'start_date')::date,(item->>'end_date')::date,(item->>'sales_target')::numeric,false);
    end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'projects') loop
    insert into public.clients(name) values(item->>'client_name') on conflict(name) do nothing;
    select id into client_uuid from public.clients where name=item->>'client_name';
    select * into existing from public.projects where project_code=item->>'project_code';
    if found then
      if existing.project_name is distinct from item->>'project_name' or existing.client_id is distinct from client_uuid
        or existing.base_wo_value <> (item->>'base_wo_value')::numeric or existing.gst_value <> (item->>'gst_value')::numeric
        or existing.wo_number is distinct from nullif(item->>'wo_number','')
        or existing.project_description is distinct from item->>'project_description'
        or existing.project_status::text <> item->>'project_status'
        or existing.carry_forward <> (item->>'carry_forward')::boolean or existing.billing_closure <> item->>'billing_closure'
        or coalesce(existing.closure_remarks,'') <> coalesce(item->>'closure_remarks','')
        or existing.opening_invoiced_amount <> 0 then
        raise exception 'Existing project % differs from the workbook; no records were imported', item->>'project_code';
      end if;
      skipped := skipped + 1;
    else
      insert into public.projects(project_code,project_name,client_id,project_description,wo_number,wo_date,project_start_date,expected_completion_date,project_status,base_wo_value,gst_value,billing_target,opening_invoiced_amount,carry_forward,billing_closure,closure_remarks,remarks,created_by)
      values(item->>'project_code',item->>'project_name',client_uuid,item->>'project_description',nullif(item->>'wo_number',''),nullif(item->>'wo_date','')::date,nullif(item->>'project_start_date','')::date,nullif(item->>'expected_completion_date','')::date,(item->>'project_status')::public.project_status,(item->>'base_wo_value')::numeric,(item->>'gst_value')::numeric,(item->>'base_wo_value')::numeric,0,(item->>'carry_forward')::boolean,item->>'billing_closure',item->>'closure_remarks',item->>'remarks',auth.uid());
      imported := imported + 1;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'orders') loop
    select id into project_uuid from public.projects where project_code=item->>'project_code';
    select * into existing from public.project_orders where order_code=item->>'order_code';
    if found then
      if existing.project_id <> project_uuid or existing.base_value <> (item->>'base_value')::numeric or existing.gst_value <> (item->>'gst_value')::numeric or existing.order_number <> item->>'order_number' then
        raise exception 'Existing WO/PO % differs from workbook; no records were imported',item->>'order_code';
      end if;
      skipped := skipped + 1;
    else
      insert into public.project_orders(order_code,project_id,order_number,order_date,description,order_type,order_group,base_value,gst_value,remarks)
      values(item->>'order_code',project_uuid,item->>'order_number',nullif(item->>'order_date','')::date,item->>'description','original',item->>'order_code',(item->>'base_value')::numeric,(item->>'gst_value')::numeric,item->>'remarks');
      imported := imported + 1;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'invoices') loop
    select id into project_uuid from public.projects where project_code=item->>'project_code';
    select id into fy_uuid from public.financial_years where start_date=((left(item->>'financial_year',4))||'-04-01')::date and end_date=(((left(item->>'financial_year',4))::integer+1)||'-03-31')::date;
    select * into existing from public.project_invoices where invoice_number=item->>'invoice_number';
    if found then
      if existing.project_id <> project_uuid or existing.invoice_date <> (item->>'invoice_date')::date
        or existing.amount_before_gst <> (item->>'amount_before_gst')::numeric or existing.gst_amount <> (item->>'gst_amount')::numeric
        or existing.document_type <> item->>'document_type' or existing.financial_year_id is distinct from fy_uuid then
        raise exception 'Existing invoice % differs from workbook; no records were imported',item->>'invoice_number';
      end if;
      skipped := skipped + 1;
    else
      insert into public.project_invoices(invoice_number,invoice_date,project_id,invoice_type,invoice_description,amount_before_gst,gst_amount,financial_year_id,document_type,order_id,remarks,entered_by)
      values(item->>'invoice_number',(item->>'invoice_date')::date,project_uuid,item->>'invoice_type',item->>'invoice_description',(item->>'amount_before_gst')::numeric,(item->>'gst_amount')::numeric,fy_uuid,item->>'document_type',(select id from public.project_orders where order_code=item->>'order_code'),item->>'remarks',auth.uid());
      imported := imported + 1;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'sales') loop
    select id into fy_uuid from public.financial_years where start_date=((left(item->>'financial_year',4))||'-04-01')::date and end_date=(((left(item->>'financial_year',4))::integer+1)||'-03-31')::date;
    select * into existing from public.sales_daily where financial_year_id=fy_uuid and sales_group=item->>'sales_group' and report_date=(item->>'report_date')::date;
    if found then
      if existing.cumulative_sales <> (item->>'cumulative_sales')::numeric or existing.today_sales <> (item->>'today_sales')::numeric
        or existing.sales_target <> (item->>'sales_target')::numeric or existing.current_month_sales <> (item->>'current_month_sales')::numeric then
        raise exception 'Existing sales snapshot differs from workbook; no records were imported';
      end if;
      skipped := skipped + 1;
    else
      insert into public.sales_daily(report_date,financial_year_id,sales_group,sales_target,sales_up_to_yesterday,today_sales,current_month_sales,cumulative_sales,source_reference,remarks,created_by)
      values((item->>'report_date')::date,fy_uuid,item->>'sales_group',(item->>'sales_target')::numeric,(item->>'sales_up_to_yesterday')::numeric,(item->>'today_sales')::numeric,(item->>'current_month_sales')::numeric,(item->>'cumulative_sales')::numeric,source_name,item->>'remarks',auth.uid());
      imported := imported + 1;
    end if;
  end loop;
  insert into public.audit_logs(user_id,action,module,new_value) values(auth.uid(),'IMPORT','billing_tracker',jsonb_build_object('source',source_name,'imported',imported,'skipped',skipped));
  return jsonb_build_object('imported',imported,'skipped',skipped);
end;
$$;
revoke all on function public.import_billing_tracker(jsonb,text) from public;
grant execute on function public.import_billing_tracker(jsonb,text) to authenticated;

-- Zero is a valid target; new project billing targets are base amounts.
create or replace function public.set_project_code_and_billing_target() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.project_code is null or btrim(new.project_code)='' then new.project_code:=public.generate_project_code(); end if;
  if new.billing_target is null then new.billing_target:=coalesce(new.base_wo_value,0); end if;
  return new;
end;
$$;
create unique index financial_years_one_active on public.financial_years(active) where active;
create policy fy_operations_update on public.financial_years for update to authenticated
using (public.current_user_role() in ('admin','project_admin','accounts_finance'))
with check (public.current_user_role() in ('admin','project_admin','accounts_finance'));
create or replace function public.activate_financial_year(year_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if public.current_user_role() not in ('admin','project_admin','accounts_finance') then raise exception 'Accounts or Project Admin access required'; end if;
  perform pg_advisory_xact_lock(hashtext('active_financial_year'));
  if not exists(select 1 from public.financial_years where id=year_id) then raise exception 'Financial year not found'; end if;
  update public.financial_years set active=false where active;
  update public.financial_years set active=true where id=year_id;
end;
$$;
revoke all on function public.activate_financial_year(uuid) from public;
grant execute on function public.activate_financial_year(uuid) to authenticated;

-- A new account cannot grant itself administrative privileges.
drop policy "users can insert own profile" on public.users;
create policy "users can insert own profile" on public.users for insert to authenticated
with check (id=auth.uid() and role='project_manager' and active=true);

notify pgrst, 'reload schema';


-- 007_private_project_documents
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('project-documents','project-documents',false,10485760,array[
  'application/pdf','image/jpeg','image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy project_document_objects_read on storage.objects for select to authenticated
using (bucket_id='project-documents' and exists(
  select 1 from public.projects where id::text=split_part(name,'/',1)
));
create policy project_document_objects_insert on storage.objects for insert to authenticated
with check (bucket_id='project-documents' and owner_id=auth.uid()::text and public.can_write_operations() and exists(
  select 1 from public.projects where id::text=split_part(name,'/',1)
));
create policy project_document_objects_cleanup on storage.objects for delete to authenticated
using (bucket_id='project-documents' and public.can_write_operations() and owner_id=auth.uid()::text);

create policy operations_read_tracking_audit on public.audit_logs for select to authenticated
using (public.can_write_operations() and module in ('projects','project_invoices','project_orders','ra_bill_schedules','delivery_challans','sales_daily','project_documents','billing_tracker'));
drop policy "operations can create documents" on public.project_documents;
create policy "operations can create documents" on public.project_documents for insert to authenticated
with check (public.can_write_operations() and uploaded_by=auth.uid());

create trigger project_documents_audit after insert on public.project_documents for each row execute function public.audit_row_change();


-- 008_main_project_grouping
create sequence public.project_group_code_seq;
create function public.generate_main_project_code() returns text
language plpgsql set search_path = public as $$
declare code text;
begin
  code := nextval('public.project_group_code_seq')::text;
  return 'PRJ-' || lpad(code,greatest(3,length(code)),'0');
end; $$;
create table public.project_groups (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique default public.generate_main_project_code(),
  project_name text not null check (length(btrim(project_name)) > 0),
  client_id uuid not null references public.clients(id),
  location text,
  description text,
  created_by uuid references public.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index project_groups_client_name on public.project_groups(client_id,lower(btrim(project_name)));
alter table public.project_groups enable row level security;
grant select,insert,update on public.project_groups to authenticated;
grant usage,select on sequence public.project_group_code_seq to authenticated;
create policy groups_read on public.project_groups for select to authenticated using (true);
create policy groups_insert on public.project_groups for insert to authenticated with check (public.can_write_operations());
create policy groups_update on public.project_groups for update to authenticated using (public.can_write_operations()) with check (public.can_write_operations());
create trigger groups_updated before update on public.project_groups for each row execute function public.set_updated_at();
create trigger groups_audit after insert or update on public.project_groups for each row execute function public.audit_row_change();
alter table public.projects add column main_project_id uuid references public.project_groups(id);
create index projects_main_project_idx on public.projects(main_project_id);
create function public.validate_main_project_link() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'projects' then
    if tg_op='UPDATE' and new.client_id is distinct from old.client_id and (
      exists(select 1 from public.project_invoices where project_id=old.id)
      or exists(select 1 from public.project_orders where project_id=old.id)
      or exists(select 1 from public.delivery_challans where project_id=old.id)
    ) then raise exception 'A linked WO scope cannot change client'; end if;
    if new.main_project_id is not null and not exists(select 1 from public.project_groups where id=new.main_project_id and client_id=new.client_id) then
      raise exception 'WO scope and main project must have the same client';
    end if;
  elsif new.client_id is distinct from old.client_id and exists(select 1 from public.projects where main_project_id=old.id) then
    raise exception 'A main project with WO scopes cannot change client';
  end if;
  return new;
end; $$;
create trigger scope_main_project before insert or update on public.projects for each row execute function public.validate_main_project_link();
create trigger group_client_guard before update on public.project_groups for each row execute function public.validate_main_project_link();

create function public.assign_main_project(scope_ids uuid[], main_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare main public.project_groups;
begin
  if not public.can_write_operations() then raise exception 'Operations access required'; end if;
  select * into main from public.project_groups where id=main_id;
  if main.id is null then raise exception 'Main project not found'; end if;
  if scope_ids is null or cardinality(scope_ids)=0 or exists(select 1 from unnest(scope_ids) as s(id) left join public.projects p on p.id=s.id where p.id is null or p.client_id is distinct from main.client_id) then
    raise exception 'Select existing WO scopes from the same client';
  end if;
  update public.projects set main_project_id=main_id where id=any(scope_ids);
end; $$;
revoke all on function public.assign_main_project(uuid[],uuid) from public;
grant execute on function public.assign_main_project(uuid[],uuid) to authenticated;

create schema tracker_internal;
grant usage on schema tracker_internal to authenticated;
alter function public.import_billing_tracker(jsonb,text) set schema tracker_internal;
create function public.import_billing_tracker(payload jsonb, source_name text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare result jsonb; item jsonb; member text; main_id uuid; client_uuid uuid; scope_uuid uuid; group_count integer := 0; scope_count integer := 0; seen text[] := '{}';
begin
  if public.current_user_role() not in ('admin','project_admin','accounts_finance') then raise exception 'Import requires Accounts or Project Admin access'; end if;
  if jsonb_typeof(payload->'groups') is distinct from 'array' or jsonb_array_length(payload->'groups')=0 then raise exception 'Review main-project grouping before importing'; end if;
  perform pg_advisory_xact_lock(hashtext('billing_tracker_import'));
  for item in select value from jsonb_array_elements(payload->'groups') loop
    if nullif(btrim(item->>'project_name'),'') is null or jsonb_typeof(item->'source_codes') is distinct from 'array' or jsonb_array_length(item->'source_codes')=0 then raise exception 'Invalid main-project mapping'; end if;
    for member in select jsonb_array_elements_text(item->'source_codes') loop
      if member=any(seen) or not exists(select 1 from jsonb_array_elements(payload->'projects') p where p->>'project_code'=member and p->>'client_name'=item->>'client_name') then raise exception 'Duplicate, unknown or cross-client WO scope in main-project mapping'; end if;
      seen := array_append(seen,member);
    end loop;
  end loop;
  if cardinality(seen) <> jsonb_array_length(payload->'projects') then raise exception 'Every source WO scope must have a main project'; end if;
  result := tracker_internal.import_billing_tracker(payload,source_name);
  for item in select value from jsonb_array_elements(payload->'groups') loop
    select id into client_uuid from public.clients where name=item->>'client_name';
    select id into main_id from public.project_groups where client_id=client_uuid and lower(btrim(project_name))=lower(btrim(item->>'project_name'));
    if main_id is null then
      insert into public.project_groups(project_name,client_id) values(item->>'project_name',client_uuid) returning id into main_id;
    end if;
    for member in select jsonb_array_elements_text(item->'source_codes') loop
      select id into scope_uuid from public.projects where project_code=member;
      if exists(select 1 from public.projects where id=scope_uuid and main_project_id is not null and main_project_id<>main_id) then raise exception 'WO scope % is already assigned to another main project; review before regrouping',member; end if;
      update public.projects set main_project_id=main_id where id=scope_uuid and main_project_id is distinct from main_id;
      scope_count := scope_count + 1;
    end loop;
    group_count := group_count + 1;
  end loop;
  for item in select value from jsonb_array_elements(payload->'orders') loop
    if item->>'order_type'='additional' then
      update public.project_orders set order_type='additional'
      where order_code=item->>'order_code' and order_type='original' and previous_order_id is null;
    end if;
  end loop;
  return result || jsonb_build_object('main_projects',group_count,'wo_scopes',scope_count);
end; $$;
revoke all on function public.import_billing_tracker(jsonb,text) from public;
grant execute on function public.import_billing_tracker(jsonb,text) to authenticated;
create policy operations_read_main_project_audit on public.audit_logs for select to authenticated using (public.can_write_operations() and module='project_groups');
notify pgrst, 'reload schema';

commit;
