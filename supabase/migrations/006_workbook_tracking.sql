begin;
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
commit;
