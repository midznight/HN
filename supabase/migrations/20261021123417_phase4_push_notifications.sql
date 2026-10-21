-- Our Space Phase 4: owner-scoped FCM tokens and an internal dispatch ledger.
-- Never store message plaintext/ciphertext or put message IDs in FCM payloads.

create table if not exists public.device_push_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pair_id uuid not null,
  token text not null unique check (char_length(token) between 32 and 4096),
  platform text not null default 'android' check (platform = 'android'),
  updated_at timestamptz not null default now(),
  constraint device_push_tokens_pair_member_fk
    foreign key (pair_id, user_id)
    references public.pair_members(pair_id, user_id)
    on delete cascade
);

create index if not exists device_push_tokens_pair_idx
  on public.device_push_tokens(pair_id, user_id);

alter table public.device_push_tokens enable row level security;

drop policy if exists "users can read only their own push token" on public.device_push_tokens;
create policy "users can read only their own push token"
  on public.device_push_tokens for select to authenticated
  using (user_id = (select auth.uid()) and private.is_pair_member(pair_id));

drop policy if exists "users can register only their own push token" on public.device_push_tokens;
create policy "users can register only their own push token"
  on public.device_push_tokens for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_pair_member(pair_id));

drop policy if exists "users can refresh only their own push token" on public.device_push_tokens;
create policy "users can refresh only their own push token"
  on public.device_push_tokens for update to authenticated
  using (user_id = (select auth.uid()) and private.is_pair_member(pair_id))
  with check (user_id = (select auth.uid()) and private.is_pair_member(pair_id));

drop policy if exists "users can delete only their own push token" on public.device_push_tokens;
create policy "users can delete only their own push token"
  on public.device_push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.device_push_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.device_push_tokens to authenticated;

create table if not exists public.push_dispatches (
  message_id uuid primary key references public.messages(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('sending', 'sent', 'failed')),
  attempts smallint not null default 1 check (attempts between 1 and 3),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists push_dispatches_status_claimed_idx
  on public.push_dispatches(status, claimed_at);

alter table public.push_dispatches enable row level security;
revoke all on table public.push_dispatches from public, anon, authenticated;
grant select, insert, update, delete on table public.push_dispatches to service_role;

comment on table public.device_push_tokens is
  'Private device registration tokens. Only the token owner may access their own token.';
comment on table public.push_dispatches is
  'Service-role-only idempotency ledger. Contains no message text, ciphertext, or media metadata.';
