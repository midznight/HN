-- Our Space: guarded recovery when a device identity key changed.
-- This can only rebind the authenticated member's own key when the pair has
-- no messages and no key verification records. The client must require an
-- explicit user confirmation; no chat unlock or trust is granted by this RPC.

create or replace function private.recover_own_device_key_if_unused(
  p_pair_id uuid,
  p_public_key text,
  p_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_existing public.device_keys%rowtype;
  v_decoded_key bytea;
begin
  if v_user_id is null then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;

  if p_pair_id is null
     or p_public_key is null
     or length(p_public_key) not between 80 and 2048
     or p_fingerprint is null
     or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid public key or fingerprint' using errcode = '22023';
  end if;

  begin
    v_decoded_key := decode(p_public_key, 'base64');
  exception when others then
    raise exception 'Public key is not valid base64' using errcode = '22023';
  end;

  if encode(extensions.digest(v_decoded_key, 'sha256'), 'hex') <> p_fingerprint then
    raise exception 'Fingerprint does not match the provided public key' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.pair_members pm
    where pm.pair_id = p_pair_id and pm.user_id = v_user_id
  ) then
    raise exception 'You are not a member of this pair' using errcode = '42501';
  end if;

  select dk.*
    into v_existing
    from public.device_keys dk
   where dk.pair_id = p_pair_id and dk.user_id = v_user_id
   for update;

  if not found then
    raise exception 'No existing device key to recover' using errcode = 'P0002';
  end if;

  if v_existing.key_version <> 1 or v_existing.algorithm <> 'ECDH-P256' then
    raise exception 'Only an ECDH-P256 v1 key can use this recovery path' using errcode = '22023';
  end if;

  if v_existing.public_key = p_public_key and v_existing.fingerprint = p_fingerprint then
    return;
  end if;

  if exists (select 1 from public.messages m where m.pair_id = p_pair_id) then
    raise exception 'Recovery blocked because the pair already has messages' using errcode = '55000';
  end if;

  if exists (select 1 from public.key_verifications kv where kv.pair_id = p_pair_id) then
    raise exception 'Recovery blocked because the pair already has fingerprint verifications' using errcode = '55000';
  end if;

  update public.device_keys
     set public_key = p_public_key,
         fingerprint = p_fingerprint,
         created_at = now()
   where id = v_existing.id
     and pair_id = p_pair_id
     and user_id = v_user_id;
end;
$function$;

revoke all on function private.recover_own_device_key_if_unused(uuid, text, text) from public, anon;
grant execute on function private.recover_own_device_key_if_unused(uuid, text, text) to authenticated;

-- Public API wrapper is SECURITY INVOKER; privileged work stays in the private schema.
create or replace function public.recover_own_device_key_if_unused(
  p_pair_id uuid,
  p_public_key text,
  p_fingerprint text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  perform private.recover_own_device_key_if_unused(p_pair_id, p_public_key, p_fingerprint);
end;
$function$;

revoke all on function public.recover_own_device_key_if_unused(uuid, text, text) from public, anon;
grant execute on function public.recover_own_device_key_if_unused(uuid, text, text) to authenticated;
