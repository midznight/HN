import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../supabase/migrations/20261021010159_phase2_e2ee_text_chat.sql', import.meta.url), 'utf8');
const hardening = readFileSync(new URL('../supabase/migrations/20261021010335_phase2_key_fingerprint_integrity.sql', import.meta.url), 'utf8');
const native = readFileSync(new URL('../android-native/src/main/java/com/ourspace/app/OurSpaceKeyStorePlugin.java', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/chat.js', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/secure-keys.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('all exposed chat tables have RLS and least-privilege grants', () => {
  for (const table of ['pairs', 'pair_members', 'device_keys', 'key_verifications', 'messages']) {
    assert.match(schema, new RegExp('alter table public\\.' + table + ' enable row level security', 'i'));
  }
  assert.match(schema, /revoke all on table public\.pair_members from anon, authenticated/i);
  assert.match(schema, /grant select on table public\.pair_members to authenticated/i);
  assert.doesNotMatch(schema, /grant\s+(?:all|insert|update|delete)[^;]*\bpair_members\b/i);
  assert.match(schema, /no message UPDATE or DELETE policy/i);
});

test('message storage contract contains ciphertext but no plaintext body column', () => {
  const match = schema.match(/create table if not exists public\.messages\s*\(([\s\S]*?)\n\);/i);
  assert.ok(match, 'messages table must be explicitly defined');
  const columns = match[1].split('\n')
    .map((line) => line.trim().match(/^([a-z_]+)\s+/i)?.[1])
    .filter(Boolean);
  assert.ok(columns.includes('ciphertext'));
  assert.ok(columns.includes('nonce'));
  assert.ok(columns.includes('sender_id'));
  assert.ok(columns.includes('recipient_id'));
  for (const forbidden of ['plaintext', 'body', 'content', 'message_text', 'raw_text']) {
    assert.ok(!columns.includes(forbidden), 'plaintext column found: ' + forbidden);
  }
});

test('database binds stored fingerprint to exact DER public-key bytes', () => {
  assert.match(hardening, /extensions\.digest\(decode\(public_key, 'base64'\), 'sha256'\)/i);
  assert.match(hardening, /device_keys_fingerprint_matches_public_key/i);
});

test('native implementation preserves ECDH protocol while using strongest available identity-key storage', () => {
  assert.match(native, /KeyProperties\.PURPOSE_AGREE_KEY/);
  assert.match(native, /new ECGenParameterSpec\("secp256r1"\)/);
  assert.match(native, /KeyAgreement\.getInstance\("ECDH"\)/);
  assert.match(native, /AES\/GCM\/NoPadding/);
  assert.match(native, /HmacSHA256/);
  assert.match(native, /deriveMessageKey\(sharedSecret, pairId, senderId, recipientId, version\)/);
  assert.match(native, /aes-256-gcm\/v1/);
  assert.match(native, /clear\(plainBytes\);/);
  assert.match(native, /cipher\.updateAAD\(associatedData/);
  assert.match(native, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.S/);
  assert.match(native, /SOFTWARE_IDENTITY_WRAP_ALIAS/);
  assert.match(native, /SOFTWARE_PRIVATE_CIPHERTEXT_PREF/);
  assert.match(native, /cipher\.updateAAD\(IDENTITY_WRAP_AAD\)/);
  assert.match(native, /verifySoftwareIdentityPair/);
  assert.match(native, /refusing automatic replacement/);
});

test('Android 11 fallback uses Keystore AES-GCM wrapping and fails closed on incomplete identity material', () => {
  assert.match(native, /Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.M/);
  assert.match(native, /private key is software-backed and briefly present in native process memory/i);
  assert.match(native, /putString\(SOFTWARE_PRIVATE_CIPHERTEXT_PREF/);
  assert.match(native, /Wrapped identity key record is incomplete; refusing automatic key rotation/);
  assert.match(native, /Identity wrapping key is missing; refusing automatic replacement/);
});

test('identity-key setup failures disclose safe platform diagnostics without insecure fallback', () => {
  assert.match(native, /identityFailureMessage\(e\)/);
  assert.match(native, /Chat E2EE memerlukan Android 6 \/ API 23 atau lebih baru/);
  assert.match(native, /API 23-30 does not expose PURPOSE_AGREE_KEY/);
  assert.match(native, /AES-GCM key held in/);
  assert.match(native, /Build\.VERSION\.SDK_INT/);
  assert.doesNotMatch(native, /privateKey\.getEncoded\(/);
});

test('fingerprint confirmation starts hidden until a partner key exists', () => {
  assert.match(html, /<button id="chat-confirm-key" type="button" class="hidden [^"]*">/);
  assert.match(client, /classList\.toggle\('hidden', !peerKey \|\| partnerVerified\)/);
});

test('local fingerprint panel is rendered before server-key mismatch can abort setup', () => {
  const localKeyIndex = client.indexOf('const localKey = await ensureDeviceIdentityKey();');
  const panelIndex = client.indexOf('await updateFingerprintPanel(localKey, null);', localKeyIndex);
  const serverMismatchIndex = client.indexOf('Fingerprint kunci lokal berbeda dari kunci yang tercatat di server.', localKeyIndex);
  assert.ok(localKeyIndex >= 0, 'local identity key must be loaded');
  assert.ok(panelIndex > localKeyIndex, 'local fingerprint panel must render after key load');
  assert.ok(serverMismatchIndex > panelIndex, 'mismatch guard must run after diagnostic fingerprint rendering');
  assert.match(client, /Pengiriman dihentikan; jangan hapus kunci atau mengganti fingerprint secara otomatis/);
});

test('guarded device-key recovery requires an authenticated own member, valid fingerprint, and empty pair history', () => {
  const recovery = readFileSync(new URL('../supabase/migrations/20261021152500_guarded_device_key_recovery.sql', import.meta.url), 'utf8');
  assert.match(recovery, /create or replace function private\.recover_own_device_key_if_unused/i);
  assert.match(recovery, /create or replace function public\.recover_own_device_key_if_unused[\s\S]*?security invoker/i);
  assert.match(recovery, /security definer/i);
  assert.match(recovery, /set search_path = ''/i);
  assert.match(recovery, /auth\.uid\(\)/i);
  assert.match(recovery, /extensions\.digest\(v_decoded_key, 'sha256'\)/i);
  assert.match(recovery, /from public\.messages[\s\S]*?raise exception/i);
  assert.match(recovery, /from public\.key_verifications[\s\S]*?raise exception/i);
  assert.match(recovery, /update public\.device_keys[\s\S]*?public_key = p_public_key[\s\S]*?fingerprint = p_fingerprint/i);
  assert.match(recovery, /revoke all on function public\.recover_own_device_key_if_unused\(uuid, text, text\) from public, anon/i);
  assert.match(recovery, /grant execute on function public\.recover_own_device_key_if_unused\(uuid, text, text\) to authenticated/i);
  assert.match(client, /supabase\.rpc\('recover_own_device_key_if_unused'/);
  assert.match(client, /window\.confirm\([\s\S]*?PEMULIHAN KUNCI IDENTITAS/);
});

test('client recomputes remote key fingerprint and only trusts a matching verification', () => {
  assert.match(client, /fingerprintPublicKey/);
  assert.match(client, /calculated\.fingerprint !== partnerDeviceKey\.fingerprint/);
  assert.match(client, /trust\.verified_fingerprint === partnerDeviceKey\.fingerprint/);
});

test('Supabase auth session persistence stores only a sealed envelope', () => {
  assert.match(session, /sealSessionValue\(\{ value \}\)/);
  assert.match(session, /openSessionValue\(envelope\)/);
  assert.doesNotMatch(session, /Preferences\.set\(\{\s*key,\s*value\s*\}\)/);
});
