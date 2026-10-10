begin;
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
commit;
