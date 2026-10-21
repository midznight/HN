-- Integrity hardening after Phase 2 schema verification.
-- SHA-256 fingerprint must be the hash of the exact DER public-key bytes.
alter table public.device_keys
  drop constraint if exists device_keys_fingerprint_matches_public_key;

alter table public.device_keys
  add constraint device_keys_fingerprint_matches_public_key
  check (
    fingerprint = encode(
      extensions.digest(decode(public_key, 'base64'), 'sha256'),
      'hex'
    )
  );

-- Cover foreign-key joins used by pair membership policy checks and message routing.
create index if not exists key_verifications_target_idx
  on public.key_verifications(pair_id, target_user_id);
create index if not exists messages_pair_sender_idx
  on public.messages(pair_id, sender_id);
create index if not exists messages_pair_recipient_idx
  on public.messages(pair_id, recipient_id);

-- This event-trigger helper may be executed only by PostgreSQL's event trigger system.
-- Remove direct execution rights without disabling its existing DDL event trigger.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
