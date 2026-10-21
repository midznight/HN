-- Our Space Phase 2: two-member, E2EE-only text messaging.
-- No column stores message plaintext, media bytes, filenames, or key material.
-- Pair membership rows must be seeded by a trusted project owner after auth users are created.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'Our Space' check (display_name = 'Our Space'),
  created_at timestamptz not null default now()
);

create table if not exists public.pair_members (
  pair_id uuid not null references public.pairs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null check (member_name in ('hamid', 'nur')),
  created_at timestamptz not null default now(),
  primary key (pair_id, user_id),
  unique (user_id),
  unique (pair_id, member_name)
);

create table if not exists public.device_keys (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null,
  user_id uuid not null,
  public_key text not null check (length(public_key) between 80 and 2048),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  key_version integer not null default 1 check (key_version = 1),
  algorithm text not null default 'ECDH-P256' check (algorithm = 'ECDH-P256'),
  created_at timestamptz not null default now(),
  constraint device_keys_member_fk foreign key (pair_id, user_id)
    references public.pair_members(pair_id, user_id) on delete cascade,
  constraint device_keys_one_device_per_member unique (pair_id, user_id)
);

create table if not exists public.key_verifications (
  pair_id uuid not null,
  verifier_user_id uuid not null,
  target_user_id uuid not null,
  verified_fingerprint text not null check (verified_fingerprint ~ '^[0-9a-f]{64}$'),
  key_version integer not null default 1 check (key_version = 1),
  verified_at timestamptz not null default now(),
  primary key (pair_id, verifier_user_id, target_user_id),
  check (verifier_user_id <> target_user_id),
  constraint key_verifications_verifier_fk foreign key (pair_id, verifier_user_id)
    references public.pair_members(pair_id, user_id) on delete cascade,
  constraint key_verifications_target_fk foreign key (pair_id, target_user_id)
    references public.pair_members(pair_id, user_id) on delete cascade
);

create table if not exists public.messages (
  id uuid primary key,
  pair_id uuid not null,
  sender_id uuid not null,
  recipient_id uuid not null,
  ciphertext text not null check (length(ciphertext) between 22 and 22000),
  nonce text not null check (nonce ~ '^[A-Za-z0-9+/]{16}$'),
  key_version integer not null default 1 check (key_version = 1),
  message_type text not null default 'text' check (message_type = 'text'),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  constraint messages_sender_member_fk foreign key (pair_id, sender_id)
    references public.pair_members(pair_id, user_id) on delete cascade,
  constraint messages_recipient_member_fk foreign key (pair_id, recipient_id)
    references public.pair_members(pair_id, user_id) on delete cascade
);

create index if not exists messages_pair_created_idx
  on public.messages(pair_id, created_at, id);
create index if not exists device_keys_pair_idx
  on public.device_keys(pair_id, user_id);

comment on table public.messages is
  'E2EE ciphertext only. The plaintext must never be written to this table, logs, analytics, or push payloads.';
comment on column public.messages.ciphertext is
  'Base64 AES-256-GCM ciphertext including the 128-bit authentication tag; never plaintext.';
comment on column public.device_keys.public_key is
  'Base64 DER-encoded P-256 public key. Never store the private key here.';

create or replace function private.is_pair_member(target_pair_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.pair_members pm
    where pm.pair_id = target_pair_id
      and pm.user_id = (select auth.uid())
  );
$function$;

revoke all on function private.is_pair_member(uuid) from public, anon;
grant execute on function private.is_pair_member(uuid) to authenticated;

alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.device_keys enable row level security;
alter table public.key_verifications enable row level security;
alter table public.messages enable row level security;

drop policy if exists "pair members can read their pair" on public.pairs;
create policy "pair members can read their pair"
  on public.pairs for select to authenticated
  using (private.is_pair_member(id));

drop policy if exists "members can read pair membership" on public.pair_members;
create policy "members can read pair membership"
  on public.pair_members for select to authenticated
  using (private.is_pair_member(pair_id));

drop policy if exists "members can read device public keys" on public.device_keys;
create policy "members can read device public keys"
  on public.device_keys for select to authenticated
  using (private.is_pair_member(pair_id));

drop policy if exists "a member can register only their own public key" on public.device_keys;
create policy "a member can register only their own public key"
  on public.device_keys for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_pair_member(pair_id)
  );
-- Intentionally no UPDATE/DELETE policy for device_keys: implicit replacement/rotation
-- could bypass fingerprint verification. Key rotation needs a separate audited workflow.

drop policy if exists "users can read their own fingerprint verifications" on public.key_verifications;
create policy "users can read their own fingerprint verifications"
  on public.key_verifications for select to authenticated
  using (
    verifier_user_id = (select auth.uid())
    and private.is_pair_member(pair_id)
  );

drop policy if exists "users can create their own fingerprint verifications" on public.key_verifications;
create policy "users can create their own fingerprint verifications"
  on public.key_verifications for insert to authenticated
  with check (
    verifier_user_id = (select auth.uid())
    and verifier_user_id <> target_user_id
    and private.is_pair_member(pair_id)
    and exists (
      select 1 from public.device_keys peer_key
      where peer_key.pair_id = key_verifications.pair_id
        and peer_key.user_id = key_verifications.target_user_id
        and peer_key.fingerprint = key_verifications.verified_fingerprint
        and peer_key.key_version = key_verifications.key_version
    )
  );

drop policy if exists "users can refresh their own fingerprint verification" on public.key_verifications;
create policy "users can refresh their own fingerprint verification"
  on public.key_verifications for update to authenticated
  using (
    verifier_user_id = (select auth.uid())
    and private.is_pair_member(pair_id)
  )
  with check (
    verifier_user_id = (select auth.uid())
    and verifier_user_id <> target_user_id
    and private.is_pair_member(pair_id)
    and exists (
      select 1 from public.device_keys peer_key
      where peer_key.pair_id = key_verifications.pair_id
        and peer_key.user_id = key_verifications.target_user_id
        and peer_key.fingerprint = key_verifications.verified_fingerprint
        and peer_key.key_version = key_verifications.key_version
    )
  );

drop policy if exists "pair members can read encrypted messages" on public.messages;
create policy "pair members can read encrypted messages"
  on public.messages for select to authenticated
  using (private.is_pair_member(pair_id));

drop policy if exists "senders can insert encrypted messages to verified peers" on public.messages;
create policy "senders can insert encrypted messages to verified peers"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_id <> recipient_id
    and private.is_pair_member(pair_id)
    and exists (
      select 1 from public.device_keys own_key
      where own_key.pair_id = messages.pair_id
        and own_key.user_id = (select auth.uid())
        and own_key.key_version = messages.key_version
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
      where peer_key.pair_id = messages.pair_id
        and peer_key.user_id = messages.recipient_id
        and peer_key.key_version = messages.key_version
        and peer_key.algorithm = 'ECDH-P256'
    )
  );
-- No message UPDATE or DELETE policy in Phase 2. Message history is append-only.

revoke all on table public.pairs from anon, authenticated;
revoke all on table public.pair_members from anon, authenticated;
revoke all on table public.device_keys from anon, authenticated;
revoke all on table public.key_verifications from anon, authenticated;
revoke all on table public.messages from anon, authenticated;

grant select on table public.pairs to authenticated;
grant select on table public.pair_members to authenticated;
grant select, insert on table public.device_keys to authenticated;
grant select, insert, update on table public.key_verifications to authenticated;
grant select, insert on table public.messages to authenticated;

-- Realtime is used only for notification of ciphertext INSERTs; it never carries plaintext.
do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
exception
  when undefined_object then
    raise notice 'Publication supabase_realtime does not exist yet; configure Realtime before enabling chat.';
end
$publication$;
