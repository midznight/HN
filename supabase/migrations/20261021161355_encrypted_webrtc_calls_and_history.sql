-- Phase 5: encrypted WebRTC signaling packets and encrypted call history.
-- SDP, ICE candidates/addresses, call status, and duration must remain inside ciphertext.
create table if not exists public.call_signals (
  id uuid primary key,
  pair_id uuid not null,
  sender_id uuid not null,
  recipient_id uuid not null,
  ciphertext text not null check (length(ciphertext) between 22 and 24000),
  nonce text not null check (nonce ~ '^[A-Za-z0-9+/]{16}$'),
  key_version integer not null default 1 check (key_version = 1),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  constraint call_signals_sender_member_fk foreign key (pair_id, sender_id)
    references public.pair_members(pair_id, user_id) on delete cascade,
  constraint call_signals_recipient_member_fk foreign key (pair_id, recipient_id)
    references public.pair_members(pair_id, user_id) on delete cascade
);

create index if not exists call_signals_recipient_created_idx
  on public.call_signals(recipient_id, created_at desc);
create index if not exists call_signals_pair_created_idx
  on public.call_signals(pair_id, created_at desc);

alter table public.call_signals enable row level security;

drop policy if exists "call participants receive only addressed ciphertext signals" on public.call_signals;
create policy "call participants receive only addressed ciphertext signals"
  on public.call_signals for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and private.is_pair_member(pair_id)
  );

drop policy if exists "verified members can send encrypted call signals" on public.call_signals;
create policy "verified members can send encrypted call signals"
  on public.call_signals for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_id <> recipient_id
    and private.is_pair_member(pair_id)
    and exists (
      select 1 from public.device_keys own_key
      where own_key.pair_id = call_signals.pair_id
        and own_key.user_id = (select auth.uid())
        and own_key.key_version = call_signals.key_version
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
      where peer_key.pair_id = call_signals.pair_id
        and peer_key.user_id = call_signals.recipient_id
        and peer_key.key_version = call_signals.key_version
        and peer_key.algorithm = 'ECDH-P256'
    )
  );

revoke all on table public.call_signals from public, anon, authenticated;
grant select, insert on table public.call_signals to authenticated;

create or replace function private.prune_expired_call_signals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.call_signals
  where created_at < now() - interval '1 hour';
  return new;
end;
$function$;
revoke all on function private.prune_expired_call_signals() from public, anon, authenticated;
drop trigger if exists prune_expired_call_signals on public.call_signals;
create trigger prune_expired_call_signals
  after insert on public.call_signals
  for each row execute function private.prune_expired_call_signals();

create table if not exists public.call_records (
  id uuid primary key,
  pair_id uuid not null,
  sender_id uuid not null,
  recipient_id uuid not null,
  ciphertext text not null check (length(ciphertext) between 22 and 22000),
  nonce text not null check (nonce ~ '^[A-Za-z0-9+/]{16}$'),
  key_version integer not null default 1 check (key_version = 1),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  constraint call_records_sender_member_fk foreign key (pair_id, sender_id)
    references public.pair_members(pair_id, user_id) on delete cascade,
  constraint call_records_recipient_member_fk foreign key (pair_id, recipient_id)
    references public.pair_members(pair_id, user_id) on delete cascade
);
create index if not exists call_records_pair_created_idx
  on public.call_records(pair_id, created_at desc, id);
create index if not exists call_records_sender_member_idx
  on public.call_records(pair_id, sender_id);
create index if not exists call_records_recipient_member_idx
  on public.call_records(pair_id, recipient_id);

alter table public.call_records enable row level security;

drop policy if exists "pair members can read encrypted call history" on public.call_records;
create policy "pair members can read encrypted call history"
  on public.call_records for select to authenticated
  using (
    private.is_pair_member(pair_id)
    and (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  );

drop policy if exists "verified members can insert encrypted call history" on public.call_records;
create policy "verified members can insert encrypted call history"
  on public.call_records for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_id <> recipient_id
    and private.is_pair_member(pair_id)
    and exists (
      select 1 from public.device_keys own_key
      where own_key.pair_id = call_records.pair_id
        and own_key.user_id = (select auth.uid())
        and own_key.key_version = call_records.key_version
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
      where peer_key.pair_id = call_records.pair_id
        and peer_key.user_id = call_records.recipient_id
        and peer_key.key_version = call_records.key_version
        and peer_key.algorithm = 'ECDH-P256'
    )
  );

revoke all on table public.call_records from public, anon, authenticated;
grant select, insert on table public.call_records to authenticated;

do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_signals'
  ) then
    alter publication supabase_realtime add table public.call_signals;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_records'
  ) then
    alter publication supabase_realtime add table public.call_records;
  end if;
exception
  when undefined_object then
    raise notice 'Publication supabase_realtime does not exist yet; configure Realtime before enabling calls.';
end
$publication$;

comment on table public.call_signals is
  'Ephemeral WebRTC signaling envelopes only. SDP/ICE are E2EE ciphertext; rows older than one hour are pruned on each new signal.';
comment on table public.call_records is
  'Append-only E2EE call history. Mode, outcome, start time, and duration are encrypted; database timestamps and pair membership remain observable.';
