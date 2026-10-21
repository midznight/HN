import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../supabase/migrations/20261021010159_phase2_e2ee_text_chat.sql', import.meta.url), 'utf8');
const hardening = readFileSync(new URL('../supabase/migrations/20261021010335_phase2_key_fingerprint_integrity.sql', import.meta.url), 'utf8');
const native = readFileSync(new URL('../android-native/src/main/java/com/ourspace/app/OurSpaceKeyStorePlugin.java', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/chat.js', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/secure-keys.js', import.meta.url), 'utf8');

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

test('native implementation keeps ECDH private key inside Android Keystore', () => {
  assert.match(native, /KeyProperties\.PURPOSE_AGREE_KEY/);
  assert.match(native, /new ECGenParameterSpec\("secp256r1"\)/);
  assert.match(native, /KeyAgreement\.getInstance\("ECDH"\)/);
  assert.match(native, /AES\/GCM\/NoPadding/);
  assert.match(native, /HmacSHA256/);
  assert.match(native, /cipher\.updateAAD\(associatedData/);
  assert.doesNotMatch(native, /privateKey\.getEncoded\(/);
  assert.match(native, /Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.S/);
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
