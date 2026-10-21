-- Publish only encrypted vault-row events. Row payloads contain ciphertext and non-sensitive routing metadata only.
do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vault_items'
  ) then
    alter publication supabase_realtime add table public.vault_items;
  end if;
exception
  when undefined_object then
    raise notice 'Publication supabase_realtime does not exist yet; configure Realtime before enabling vault sync.';
end
$publication$;
