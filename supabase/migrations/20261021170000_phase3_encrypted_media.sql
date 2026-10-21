-- Our Space Phase 3: encrypted media in a private Supabase Storage bucket.
-- The app encrypts the complete media envelope on-device before upload.
-- Server-visible database metadata is limited to a generic "media" row and an opaque object path encrypted inside its ciphertext.

alter table public.messages
  drop constraint if exists messages_message_type_check;
alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'media'));

-- Media metadata remains a small encrypted envelope in messages.ciphertext.
-- The actual encrypted object is stored separately and never written as plaintext.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'our-space-encrypted-media',
  'our-space-encrypted-media',
  false,
  4194304,
  array['application/octet-stream']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 4194304,
    allowed_mime_types = array['application/octet-stream']::text[];

drop policy if exists "our space media members can download encrypted objects" on storage.objects;
create policy "our space media members can download encrypted objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'our-space-encrypted-media'
    and exists (
      select 1
      from public.pair_members pm
      where pm.pair_id::text = (storage.foldername(name))[1]
        and pm.user_id = (select auth.uid())
    )
  );

drop policy if exists "our space verified members can upload encrypted objects" on storage.objects;
create policy "our space verified members can upload encrypted objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'our-space-encrypted-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1
      from public.pair_members own_member
      join public.pair_members peer_member
        on peer_member.pair_id = own_member.pair_id
       and peer_member.user_id <> own_member.user_id
      join public.device_keys peer_key
        on peer_key.pair_id = peer_member.pair_id
       and peer_key.user_id = peer_member.user_id
      join public.key_verifications verified
        on verified.pair_id = peer_key.pair_id
       and verified.target_user_id = peer_key.user_id
       and verified.verifier_user_id = own_member.user_id
       and verified.verified_fingerprint = peer_key.fingerprint
       and verified.key_version = peer_key.key_version
      where own_member.pair_id::text = (storage.foldername(name))[1]
        and own_member.user_id = (select auth.uid())
        and peer_key.algorithm = 'ECDH-P256'
    )
    and array_length(storage.foldername(name), 1) = 2
  );

drop policy if exists "our space media senders can delete their own encrypted objects" on storage.objects;
create policy "our space media senders can delete their own encrypted objects"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'our-space-encrypted-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1
      from public.pair_members pm
      where pm.pair_id::text = (storage.foldername(name))[1]
        and pm.user_id = (select auth.uid())
    )
  );

comment on constraint messages_message_type_check on public.messages is
  'Fase 3 extends supported ciphertext message envelopes to generic media metadata. The media bytes remain in private Storage as ciphertext.';
