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
