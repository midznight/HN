import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../supabase/migrations/20261021014018_phase2_e2ee_text_chat.sql', import.meta.url), 'utf8');
const hardening = readFileSync(new URL('../supabase/migrations/20261021014020_phase2_key_fingerprint_integrity.sql', import.meta.url), 'utf8');
const native = readFileSync(new URL('../android-native/src/main/java/com/ourspace/app/OurSpaceKeyStorePlugin.java', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/chat.js', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/secure-keys.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const mediaMigration = readFileSync(new URL('../supabase/migrations/20261021102710_phase3_encrypted_media.sql', import.meta.url), 'utf8');
const pushMigration = readFileSync(new URL('../supabase/migrations/20261021123417_phase4_push_notifications.sql', import.meta.url), 'utf8');
const pushClient = readFileSync(new URL('../src/push-notifications.js', import.meta.url), 'utf8');
const pushFunction = readFileSync(new URL('../supabase/functions/send-chat-push/index.ts', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/android-debug.yml', import.meta.url), 'utf8');
const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
const supabaseConfig = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');

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
  assert.match(native, /deriveMessageKey\(sharedSecret, pairId, senderId, recipientId, version, messageType\)/);
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

test('ECDH output is normalized to a 32-byte P-256 secret before key derivation', () => {
  assert.match(native, /ECDH_SECRET_BYTES = 32/);
  assert.match(native, /rawSecret\.length > ECDH_SECRET_BYTES/);
  assert.match(native, /System\.arraycopy\(rawSecret, 0, normalized, ECDH_SECRET_BYTES - rawSecret\.length, rawSecret\.length\)/);
  assert.match(native, /clear\(rawSecret\)/);
});

test('Android 11 fallback uses Keystore AES-GCM wrapping and fails closed on incomplete identity material', () => {
  assert.match(native, /Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.M/);
  assert.match(native, /software-backed and briefly present in/);
  assert.match(native, /native process memory/);
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
  const recovery = readFileSync(new URL('../supabase/migrations/20261021083734_guarded_device_key_recovery.sql', import.meta.url), 'utf8');
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

test('Phase 3 stores only encrypted media in a private bucket with membership and verified-peer policies', () => {
  assert.match(mediaMigration, /check \(message_type in \('text', 'media'\)\)/i);
  assert.match(mediaMigration, /our-space-encrypted-media[\s\S]*?false[\s\S]*?4194304/i);
  assert.match(mediaMigration, /for select\s+to authenticated[\s\S]*?storage\.foldername\(name\)/i);
  assert.match(mediaMigration, /for insert\s+to authenticated[\s\S]*?key_verifications/i);
  assert.match(mediaMigration, /for delete\s+to authenticated[\s\S]*?auth\.uid\(\)/i);
  assert.doesNotMatch(mediaMigration, /public\s*=\s*true/i);
  assert.match(native, /public void encryptMedia\(PluginCall call\)/);
  assert.match(native, /public void decryptMedia\(PluginCall call\)/);
  assert.match(native, /MAX_MEDIA_BYTES = 3 \* 1024 \* 1024/);
  const mediaEncryptIndex = native.indexOf('public void encryptMedia(PluginCall call)');
  const explicitNonceIndex = native.indexOf('nonce = new byte[GCM_NONCE_BYTES]', mediaEncryptIndex);
  const randomNonceIndex = native.indexOf('new SecureRandom().nextBytes(nonce)', explicitNonceIndex);
  const gcmInitIndex = native.indexOf('new GCMParameterSpec(GCM_TAG_BITS, nonce)', randomNonceIndex);
  assert.ok(mediaEncryptIndex >= 0 && explicitNonceIndex > mediaEncryptIndex);
  assert.ok(randomNonceIndex > explicitNonceIndex && gcmInitIndex > randomNonceIndex);
  assert.match(native, /deriveMessageKey\(sharedSecret, pairId, senderId, recipientId, version, "media\/blob"\)/);
  assert.match(native, /associatedData\(pairId, messageId, senderId, recipientId, version, "media\/blob"\)/);
  assert.match(client, /supabase\.storage\.from\(MEDIA_BUCKET\)\.upload\(objectPath, encryptedBlob/);
  assert.match(client, /supabase\.storage\.from\(MEDIA_BUCKET\)\.download\(metadata\.objectPath\)/);
  assert.match(client, /messageType: 'media'/);
  assert.match(html, /id="chat-attach-btn"/);
  assert.match(html, /id="chat-attachment-input"/);
  assert.match(native, /public void saveMediaToGallery\(PluginCall call\)/);
  assert.match(native, /MediaStore\.MediaColumns\.RELATIVE_PATH/);
  assert.match(native, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.Q/);
  assert.match(native, /getExternalFilesDir\(Environment\.DIRECTORY_DOCUMENTS\)/);
  assert.match(client, /KeyStore\.saveMediaToGallery\(/);
  assert.match(client, /Simpan ke perangkat/);
  assert.match(client, /saved\.destination === 'gallery'/);
  assert.match(client, /if \(!appUnlocked \|\| !partnerVerified\) return;\s+if \(openedMedia\.filename/);
  assert.match(client, /clearMediaObjectUrls\(\);\s+container\.replaceChildren\(\)/);
  assert.match(client, /if \(!appUnlocked \|\| !partnerVerified \|\| !sessionUser\)/);
});

test('media display and download happen only after native authenticated decryption', () => {
  const downloadIndex = client.indexOf('.download(metadata.objectPath)');
  const decryptIndex = client.indexOf('KeyStore.decryptMedia({', downloadIndex);
  const renderIndex = client.indexOf('renderMediaMessage(row, blob, metadata)', decryptIndex);
  assert.ok(downloadIndex >= 0);
  assert.ok(decryptIndex > downloadIndex);
  assert.ok(renderIndex > decryptIndex);
  assert.match(client, /URL\.revokeObjectURL/);
  assert.match(client, /file\.size > MAX_MEDIA_BYTES/);
});

test('async message decryption never renders plaintext or crypto errors after the app locks', () => {
  const start = client.indexOf('async function decryptAndRender(row)');
  const decryptIndex = client.indexOf('const opened = await KeyStore.decryptMessage({', start);
  const renderIndex = client.indexOf('renderMessage(row, opened.plaintext)', decryptIndex);
  const successGuardIndex = client.indexOf('if (!appUnlocked || !partnerVerified) return;', decryptIndex);
  const catchIndex = client.indexOf('} catch {', renderIndex);
  const catchGuardIndex = client.indexOf('if (!appUnlocked || !partnerVerified) return;', catchIndex);
  assert.ok(start >= 0 && decryptIndex > start);
  assert.ok(successGuardIndex > decryptIndex && successGuardIndex < renderIndex);
  assert.ok(catchIndex > renderIndex);
  assert.ok(catchGuardIndex > catchIndex && catchGuardIndex < client.indexOf('renderUndecryptableMessage()', catchGuardIndex));
  assert.match(client, /if \(!appUnlocked \|\| !partnerVerified\) return;\s+if \(error\) throw error;/);
});


test('Android gallery picking defers only the expected app background lock and safely relocks on cancellation', () => {
  assert.match(client, /function beginAttachmentPicker\(\)/);
  assert.match(client, /function clearAttachmentPickerState\(\)/);
  assert.match(client, /function finishAttachmentPicker\(fileSelected\)/);
  assert.match(client, /const ATTACHMENT_PICKER_RESUME_GRACE_MS = 12000/);
  assert.match(client, /finishAttachmentPicker\(Boolean\(file\)\)/);
  assert.match(client, /addEventListener\('cancel', \(\) => finishAttachmentPicker\(false\)\)/);
  assert.match(client, /window\.ourSpaceAttachmentPicker = \{/);
  assert.match(client, /if \(!attachmentPickerPending \|\| !attachmentPickerBackgrounded\) return/);
  assert.match(client, /if \(attachmentPickerPending \&\& attachmentPickerBackgrounded\) finishAttachmentPicker\(false\)/);
  assert.match(client, /export function onChatLocked\(\) \{\s+clearAttachmentPickerState\(\)/);
  assert.match(main, /ourspace:attachment-picker-cancelled/);
  assert.match(main, /if\(picker\?\.isPending\(\)\)\{picker\.onBackground\(\);return\}/);
  assert.match(main, /if\(isActive\)window\.ourSpaceAttachmentPicker\?\.onForeground\(\)/);
  assert.match(main, /backButton[\s\S]*?ourSpaceAttachmentPicker\?\.isPending\(\)\)return/);
});


test('media metadata is not parsed and Storage download is not started after lock during decryption', () => {
  const start = client.indexOf('async function decryptAndRenderMedia(row, peerKey)');
  const decryptIndex = client.indexOf('const opened = await KeyStore.decryptMessage({', start);
  const parseIndex = client.indexOf('validateMediaMetadata(JSON.parse(opened.plaintext), row)', decryptIndex);
  const downloadIndex = client.indexOf('supabase.storage.from(MEDIA_BUCKET).download(metadata.objectPath)', decryptIndex);
  const afterDecryptGuard = client.indexOf('if (!appUnlocked || !partnerVerified || !sessionUser) return;', decryptIndex);
  const afterDownloadGuard = client.indexOf('if (!appUnlocked || !partnerVerified || !sessionUser) return;', afterDecryptGuard + 1);
  assert.ok(start >= 0 && decryptIndex > start);
  assert.ok(afterDecryptGuard > decryptIndex && afterDecryptGuard < parseIndex);
  assert.ok(parseIndex > afterDecryptGuard && downloadIndex > parseIndex);
  assert.ok(afterDownloadGuard > downloadIndex);
});


test('media pipeline rechecks lock after Blob.arrayBuffer before starting native media decryption', () => {
  const start = client.indexOf('async function decryptAndRenderMedia(row, peerKey)');
  const bufferAwait = client.indexOf('const encryptedBuffer = await result.data.arrayBuffer()', start);
  const lockGuard = client.indexOf('if (!appUnlocked || !partnerVerified || !sessionUser) {', bufferAwait);
  const zeroBuffer = client.indexOf('new Uint8Array(encryptedBuffer).fill(0)', lockGuard);
  const bytesWrap = client.indexOf('const encryptedBytes = new Uint8Array(encryptedBuffer)', lockGuard);
  const toBase64 = client.indexOf('const encryptedBase64 = bytesToBase64(encryptedBytes)', bytesWrap);
  const nativeDecrypt = client.indexOf('KeyStore.decryptMedia({', toBase64);
  assert.ok(start >= 0 && bufferAwait > start);
  assert.ok(lockGuard > bufferAwait && lockGuard < bytesWrap);
  assert.ok(zeroBuffer > lockGuard && zeroBuffer < bytesWrap);
  assert.ok(bytesWrap > lockGuard && toBase64 > bytesWrap && nativeDecrypt > toBase64);
});


test('private app layout is shielded during the system picker and restored when picker state ends', () => {
  const begin = client.indexOf('function beginAttachmentPicker()');
  const click = client.indexOf('picker.click();', begin);
  const shield = client.indexOf("appLayout.style.visibility = 'hidden';", click);
  const clear = client.indexOf('function clearAttachmentPickerState()', begin);
  const restore = client.indexOf('appLayout.style.visibility = attachmentPickerPreviousVisibility;', clear);
  const reset = client.indexOf('attachmentPickerPreviousVisibility = null;', restore);
  assert.ok(begin >= 0 && click > begin);
  assert.ok(shield > click, 'shield is applied after the file chooser activation is requested');
  assert.ok(clear > shield && restore > clear && reset > restore);
});


test('media sender checks app lock after File.arrayBuffer before Base64 conversion or native encryption', () => {
  const start = client.indexOf('async function sendMediaFile(file)');
  const read = client.indexOf('const inputBuffer = await file.arrayBuffer()', start);
  const guard = client.indexOf('if (!appUnlocked || !partnerVerified || !sessionUser) {', read);
  const zero = client.indexOf('new Uint8Array(inputBuffer).fill(0)', guard);
  const wrap = client.indexOf('const inputBytes = new Uint8Array(inputBuffer)', guard);
  const toBase64 = client.indexOf('mediaBase64 = bytesToBase64(inputBytes)', wrap);
  const nativeEncrypt = client.indexOf('KeyStore.encryptMedia({', toBase64);
  const clearAfterEncrypt = client.indexOf('mediaBase64 = null;', nativeEncrypt);
  assert.ok(start >= 0 && read > start);
  assert.ok(guard > read && guard < wrap);
  assert.ok(zero > guard && zero < wrap);
  assert.ok(wrap > guard && toBase64 > wrap && nativeEncrypt > toBase64);
  assert.ok(clearAfterEncrypt > nativeEncrypt);
  assert.match(client.slice(start, client.indexOf('function updateComposerState', start)), /finally \{\s+mediaBase64 = null;/);
});


test('media sender suppresses stale failures when the app locks before async send work rejects', () => {
  const start = client.indexOf('async function sendMediaFile(file)');
  const end = client.indexOf('function updateComposerState', start);
  const send = client.slice(start, end);
  const catchIndex = send.indexOf('} catch (error) {');
  const guard = send.indexOf('if (!appUnlocked || !partnerVerified || !sessionUser) return;', catchIndex);
  const visibleError = send.indexOf('messageError(visibleMessage)', catchIndex);
  assert.ok(catchIndex >= 0 && guard > catchIndex);
  assert.ok(visibleError > guard);
});


test('Phase 4 push tokens are owner-scoped and dispatch ledger is service-role-only', () => {
  assert.match(pushMigration, /alter table public\.device_push_tokens enable row level security/i);
  assert.match(pushMigration, /for select to authenticated[\s\S]*?user_id = \(select auth\.uid\(\)\)/i);
  assert.match(pushMigration, /for insert to authenticated[\s\S]*?user_id = \(select auth\.uid\(\)\)/i);
  assert.match(pushMigration, /for update to authenticated[\s\S]*?user_id = \(select auth\.uid\(\)\)/i);
  assert.match(pushMigration, /for delete to authenticated[\s\S]*?user_id = \(select auth\.uid\(\)\)/i);
  assert.match(pushMigration, /alter table public\.push_dispatches enable row level security/i);
  assert.match(pushMigration, /revoke all on table public\.push_dispatches from public, anon, authenticated/i);
  assert.match(pushMigration, /grant select, insert, update, delete on table public\.push_dispatches to service_role/i);
  assert.doesNotMatch(pushMigration, /grant\s+(?:all|select|insert|update|delete)[^;]*push_dispatches[^;]*to authenticated/i);
});

test('FCM payload is generic and never embeds message identifiers or content', () => {
  assert.match(pushFunction, /title: "Our Space"/);
  assert.match(pushFunction, /body: "Ada pesan baru menunggu\."/);
  assert.match(pushFunction, /data:\s*\{\s*type: "new_message"\s*\}/);
  const start = pushFunction.indexOf('const fcmPayload = {');
  const end = pushFunction.indexOf('};', start);
  assert.ok(start >= 0 && end > start);
  const payload = pushFunction.slice(start, end);
  assert.doesNotMatch(payload, /ciphertext|plaintext|message_id|sender_id|recipient_id|pair_id|filename|mimeType|mediaVersion/i);
  assert.match(pushFunction, /select\("id,pair_id,sender_id,recipient_id,message_type,created_at"\)/);
  assert.doesNotMatch(pushFunction, /select\("\*"\)/);
});

test('Push requests permission only after explicit opt-in and fails closed without configuration', () => {
  assert.match(pushClient, /VITE_FCM_CONFIGURED === 'true'/);
  assert.match(pushClient, /if \(!FCM_ANDROID_CONFIGURED \|\| !FCM_PROJECT_ID \|\| !ANDROID_NATIVE \|\| !supabase\)/);
  assert.match(pushClient, /if \(!explicitUserAction\) return false/);
  assert.match(pushClient, /PushNotifications\.requestPermissions\(\)/);
  assert.match(pushClient, /supabase\.functions\.invoke\('send-chat-push'/);
  assert.match(pushClient, /user_id: snapshot\.userId/);
  assert.match(pushClient, /device_push_tokens/);
  assert.match(client, /disablePushBeforeSignOut/);
});

test('Push tap routes to chat only after the existing local PIN gate', () => {
  assert.match(pushClient, /pushNotificationActionPerformed/);
  assert.match(pushClient, /ourspace:push-open-chat/);
  assert.match(main, /pendingPushOpenChat=true/);
  assert.match(main, /if\(pendingPushOpenChat\)\{pendingPushOpenChat=false;window\.switchView\('chat'\)\}/);
});

test('Phase 4 workflow keeps Firebase config optional and never tracks google-services.json', () => {
  assert.match(workflow, /'phase-4\/\*\*'/);
  assert.match(workflow, /FIREBASE_ANDROID_CONFIG_BASE64/);
  assert.match(workflow, /VITE_FCM_CONFIGURED=false/);
  assert.match(workflow, /VITE_FCM_CONFIGURED=true/);
  assert.match(workflow, /com\.ourspace\.app/);
  assert.match(gitignore, /^google-services\.json$/m);
  assert.match(supabaseConfig, /\[functions\.send-chat-push\][\s\S]*?verify_jwt\s*=\s*true/);
});

test('Encrypted message sends request a generic push only after message insert succeeds', () => {
  const textStart = client.indexOf('async function sendMessage()');
  const textInsert = client.indexOf("supabase.from('messages').insert(record)", textStart);
  const textPush = client.indexOf('void notifyPartnerForMessage(data.id)', textInsert);
  assert.ok(textStart >= 0 && textInsert > textStart && textPush > textInsert);

  const mediaStart = client.indexOf('async function sendMediaFile(file)');
  const mediaInsert = client.indexOf("supabase.from('messages').insert(record)", mediaStart);
  const mediaPush = client.indexOf('void notifyPartnerForMessage(data.id)', mediaInsert);
  assert.ok(mediaStart >= 0 && mediaInsert > mediaStart && mediaPush > mediaInsert);
  assert.match(client, /void setPushContext\(\{ userId: sessionUser\.id, pairId: pair\.id, verified: true \}\)/);
});


test('Push token refresh cannot recreate a token while opt-out or sign-out is revoking it', () => {
  assert.match(pushClient, /let revokingPush = false/);
  assert.match(pushClient, /currentContext && backendReady && !revokingPush/);
  assert.match(pushClient, /if \(revokingPush \|\| !token \|\| !contextStillMatches\(snapshot\) \|\| !supabase\)/);
  assert.match(pushClient, /async function turnOffPush\(\)[\s\S]*?revokingPush = true;[\s\S]*?revokingPush = false;/);
  assert.match(pushClient, /export async function disablePushBeforeSignOut\(\)[\s\S]*?revokingPush = true;[\s\S]*?currentContext = null;[\s\S]*?revokingPush = false;/);
});


test('Push opt-out persists local choice before server token deletion and retries stale token cleanup on next context', () => {
  const optOutStart = pushClient.indexOf('async function turnOffPush()');
  const optOutEnd = pushClient.indexOf('export async function initPushNotifications()', optOutStart);
  const optOut = pushClient.slice(optOutStart, optOutEnd);
  const persistOff = optOut.indexOf('await setSavedPreference(false)');
  const deleteToken = optOut.indexOf(".from('device_push_tokens')");
  const restoreOn = optOut.indexOf('await setSavedPreference(true).catch', deleteToken);
  assert.ok(optOutStart >= 0 && persistOff >= 0 && deleteToken > persistOff);
  assert.ok(restoreOn > deleteToken);

  const contextStart = pushClient.indexOf('export async function setPushContext');
  const contextEnd = pushClient.indexOf('export async function notifyPartnerForMessage', contextStart);
  const context = pushClient.slice(contextStart, contextEnd);
  assert.match(context, /if \(!enabled && supabase\)/);
  assert.match(context, /const \{ data: staleToken, error: staleLookupError \}/);
  assert.match(context, /const \{ error: staleDeleteError \}/);
});

test('Push sign-out does not swallow local opt-out preference persistence failure', () => {
  const start = pushClient.indexOf('export async function disablePushBeforeSignOut()');
  const end = pushClient.length;
  const fn = pushClient.slice(start, end);
  assert.match(fn, /await setSavedPreference\(false\);/);
  assert.doesNotMatch(fn, /await setSavedPreference\(false\)\.catch\(\(\) => \{\}\)/);
});


test('Push registration failure attempts server token rollback and never shows off if rollback is uncertain', () => {
  assert.match(pushClient, /A network error can arrive after the server upsert actually succeeded/);
  assert.match(pushClient, /let cleanupFailed = false/);
  assert.match(pushClient, /const \{ error \} = await supabase\.from\('device_push_tokens'\)[\s\S]*?cleanupFailed = Boolean\(error\)/);
  assert.match(pushClient, /failure\.preservePushState = true/);
  assert.match(pushClient, /if \(error\?\.preservePushState === true\)[\s\S]*?checkbox\.checked = true/);
  assert.match(pushClient, /Push mungkin masih aktif/);
});


test('FCM server auth uses short-lived Workload Identity Federation and no service-account JSON key', () => {
  assert.ok(pushFunction.includes('GOOGLE_WIF_AUDIENCE'));
  assert.ok(pushFunction.includes('GOOGLE_SERVICE_ACCOUNT_EMAIL'));
  assert.ok(pushFunction.includes('FCM_PROJECT_ID'));
  assert.ok(pushFunction.includes('https://sts.googleapis.com/v1/token'));
  assert.ok(pushFunction.includes('iamcredentials.googleapis.com'));
  assert.ok(pushFunction.includes('requested_token_type: "urn:ietf:params:oauth:token-type:access_token"'));
  assert.ok(pushFunction.includes('subject_token: subjectToken'));
  assert.ok(pushFunction.includes('lifetime: "600s"'));
  assert.ok(pushFunction.includes('https://www.googleapis.com/auth/firebase.messaging'));
  assert.ok(!pushFunction.includes('FCM_SERVICE_ACCOUNT_JSON'));
  assert.ok(!pushFunction.includes('private_key'));
  assert.ok(!pushFunction.includes('google-auth-library'));
  assert.ok(pushFunction.includes('if (!serviceKey || !ready || !wifConfig)'));
});
