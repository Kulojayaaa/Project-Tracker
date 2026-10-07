create sequence if not exists public.project_code_seq start with 1 increment by 1;

create or replace function public.generate_project_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_code text;
begin
  loop
    next_code := 'IRR-' || lpad(nextval('public.project_code_seq')::text, 3, '0');
    exit when not exists (select 1 from public.projects where project_code = next_code);
  end loop;

  return next_code;
end;
$$;

create or replace function public.set_project_code_and_billing_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.project_code is null or btrim(new.project_code) = '' then
    new.project_code := public.generate_project_code();
  end if;

  if new.billing_target is null or new.billing_target = 0 then
    new.billing_target := coalesce(new.base_wo_value, 0) + coalesce(new.gst_value, 0);
  end if;

  return new;
end;
$$;

drop trigger if exists projects_set_code_and_target on public.projects;
create trigger projects_set_code_and_target
before insert on public.projects
for each row
execute function public.set_project_code_and_billing_target();

select setval(
  'public.project_code_seq',
  greatest(
    coalesce((select max(nullif(regexp_replace(project_code, '^IRR-', ''), '')::integer) from public.projects where project_code ~ '^IRR-[0-9]+$'), 0),
    1
  ),
  true
);
