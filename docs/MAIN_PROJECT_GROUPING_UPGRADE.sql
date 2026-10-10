begin;
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
