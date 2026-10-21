-- E2EE message annotations: replies and emoji reactions.
-- All target message IDs, reply relations, emoji names and active/inactive state stay inside ciphertext.
create table if not exists public.message_annotations (
  id uuid primary key,
  pair_id uuid not null,
  sender_id uuid not null,
  recipient_id uuid not null,
  ciphertext text not null check (length(ciphertext) between 22 and 22000),
  nonce text not null check (nonce ~ '^[A-Za-z0-9+/]{16}$'),
  key_version integer not null default 1 check (key_version = 1),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  constraint message_annotations_sender_member_fk foreign key (pair_id, sender_id)
    references public.pair_members(pair_id, user_id) on delete cascade,
  constraint message_annotations_recipient_member_fk foreign key (pair_id, recipient_id)
    references public.pair_members(pair_id, user_id) on delete cascade
);

create index if not exists message_annotations_pair_created_idx
  on public.message_annotations(pair_id, created_at desc, id);
create index if not exists message_annotations_sender_member_idx
  on public.message_annotations(pair_id, sender_id);
create index if not exists message_annotations_recipient_member_idx
  on public.message_annotations(pair_id, recipient_id);

alter table public.message_annotations enable row level security;

drop policy if exists "pair members can read encrypted message annotations" on public.message_annotations;
create policy "pair members can read encrypted message annotations"
  on public.message_annotations for select to authenticated
  using (
    private.is_pair_member(pair_id)
    and (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  );

drop policy if exists "verified members can insert encrypted message annotations" on public.message_annotations;
create policy "verified members can insert encrypted message annotations"
  on public.message_annotations for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_id <> recipient_id
    and private.is_pair_member(pair_id)
    and exists (
      select 1 from public.device_keys own_key
      where own_key.pair_id = message_annotations.pair_id
        and own_key.user_id = (select auth.uid())
        and own_key.key_version = message_annotations.key_version
        and own_key.algorithm = 'ECDH-P256'
    )
    and exists (
      select 1 from public.device_keys peer_key
      join public.key_verifications verified
        on verified.pair_id = peer_key.pair_id
       and verified.target_user_id = peer_key.user_id
       and verified.verifier_user_id = (select auth.uid())
       and verified.verified_fingerprint = peer_key.fingerprint
       and verified.key_version = peer_key.key_version
      where peer_key.pair_id = message_annotations.pair_id
        and peer_key.user_id = message_annotations.recipient_id
        and peer_key.key_version = message_annotations.key_version
        and peer_key.algorithm = 'ECDH-P256'
    )
  );

revoke all on table public.message_annotations from public, anon, authenticated;
grant select, insert on table public.message_annotations to authenticated;

do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_annotations'
  ) then
    alter publication supabase_realtime add table public.message_annotations;
  end if;
exception
  when undefined_object then
    raise notice 'Publication supabase_realtime does not exist yet; configure Realtime before enabling message annotations.';
end
$publication$;

comment on table public.message_annotations is
  'Append-only E2EE reactions and reply links. Target IDs, emoji values, reply relation and active state are only in ciphertext; no plaintext annotation columns or update/delete policy.';
