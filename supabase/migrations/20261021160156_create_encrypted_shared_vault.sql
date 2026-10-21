-- Phase 6: encrypted shared vault metadata. File bytes reuse the existing private media bucket.
-- Filenames, MIME types, sizes, and object paths are inside the client-side E2EE envelope.
create table if not exists public.vault_items (
  id uuid primary key,
  pair_id uuid not null,
  sender_id uuid not null,
  recipient_id uuid not null,
  ciphertext text not null check (length(ciphertext) between 22 and 22000),
  nonce text not null check (nonce ~ '^[A-Za-z0-9+/]{16}$'),
  key_version integer not null default 1 check (key_version = 1),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  constraint vault_items_sender_member_fk foreign key (pair_id, sender_id)
    references public.pair_members(pair_id, user_id) on delete cascade,
  constraint vault_items_recipient_member_fk foreign key (pair_id, recipient_id)
    references public.pair_members(pair_id, user_id) on delete cascade
);

create index if not exists vault_items_pair_created_idx
  on public.vault_items(pair_id, created_at desc, id);
create index if not exists vault_items_sender_member_idx
  on public.vault_items(pair_id, sender_id);
create index if not exists vault_items_recipient_member_idx
  on public.vault_items(pair_id, recipient_id);

alter table public.vault_items enable row level security;

drop policy if exists "pair members can read encrypted vault metadata" on public.vault_items;
create policy "pair members can read encrypted vault metadata"
  on public.vault_items for select to authenticated
  using (
    private.is_pair_member(pair_id)
    and (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  );

drop policy if exists "verified senders can add encrypted vault items" on public.vault_items;
create policy "verified senders can add encrypted vault items"
  on public.vault_items for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_id <> recipient_id
    and private.is_pair_member(pair_id)
    and exists (
      select 1 from public.device_keys own_key
      where own_key.pair_id = vault_items.pair_id
        and own_key.user_id = (select auth.uid())
        and own_key.key_version = vault_items.key_version
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
      where peer_key.pair_id = vault_items.pair_id
        and peer_key.user_id = vault_items.recipient_id
        and peer_key.key_version = vault_items.key_version
        and peer_key.algorithm = 'ECDH-P256'
    )
  );

drop policy if exists "senders can delete their own vault items" on public.vault_items;
create policy "senders can delete their own vault items"
  on public.vault_items for delete to authenticated
  using (
    sender_id = (select auth.uid())
    and private.is_pair_member(pair_id)
  );

revoke all on table public.vault_items from public, anon, authenticated;
grant select, insert, delete on table public.vault_items to authenticated;

comment on table public.vault_items is
  'Phase 6 encrypted shared vault. Only E2EE metadata ciphertext is stored; encrypted object bytes remain in the private media bucket. No update policy; items are append-only except owner-initiated deletion.';
