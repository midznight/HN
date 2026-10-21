import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { supabase, hasSupabaseConfig } from './supabase.js';
import { OurSpaceKeyStore as KeyStore, ensureDeviceIdentityKey, requireAndroidE2EE } from './secure-keys.js';
import { createMessageId, normalizeTextMessage, validateCiphertextMessage, validateMediaMetadata, isSupportedMediaMimeType, MAX_MEDIA_BYTES } from './chat-protocol.js';
import { setPushContext, notifyPartnerForMessage, disablePushBeforeSignOut } from './push-notifications.js';

const $ = (id) => document.getElementById(id);
const PIN_IDENTITY_KEY = 'os.identity.v1';
const EXPECTED_KEY_VERSION = 1;
const MEDIA_BUCKET = 'our-space-encrypted-media';

let initialized = false;
let appUnlocked = false;
let sessionUser = null;
let pair = null;
let ownMember = null;
let partnerMember = null;
let ownDeviceKey = null;
let partnerDeviceKey = null;
let partnerVerified = false;
let realtimeChannel = null;
let renderedIds = new Set();
let isSending = false;
let pendingLocalRecoveryKey = null;
let attachmentPickerPending = false;
let attachmentPickerBackgrounded = false;
let attachmentPickerResumeTimeout = null;
let attachmentPickerPreviousVisibility = null;
const ATTACHMENT_PICKER_RESUME_GRACE_MS = 12000;
const mediaObjectUrls = new Set();

function messageError(message) {
  const node = $('chat-alert');
  if (!node) return;
  node.textContent = message;
  node.classList.remove('hidden');
}
function clearMessageError() {
  const node = $('chat-alert');
  if (!node) return;
  node.textContent = '';
  node.classList.add('hidden');
}
function showSetup() {
  $('chat-setup')?.classList.remove('hidden');
  $('chat-container')?.classList.add('hidden');
  $('chat-composer')?.classList.add('hidden');
}
function showConversation() {
  $('chat-setup')?.classList.add('hidden');
  $('chat-container')?.classList.remove('hidden');
  $('chat-composer')?.classList.remove('hidden');
}
function setConnectionLabel(text, good = false) {
  const label = $('chat-connection-label');
  if (!label) return;
  label.textContent = text;
  label.classList.toggle('text-brand-500', good);
  label.classList.toggle('text-red-600', !good);
}
function setAuthFormVisible(visible) {
  $('chat-auth-form')?.classList.toggle('hidden', !visible);
  $('chat-key-panel')?.classList.toggle('hidden', visible);
}
function humanError(error, fallback) {
  const code = error?.code;
  if (code === 'Invalid login credentials') return 'Email atau kata sandi akun Supabase tidak cocok.';
  if (error?.message?.includes('Failed to fetch') || error?.name === 'TypeError') {
    return 'Server belum siap atau koneksi internet tidak tersedia. Coba lagi setelah jaringan pulih.';
  }
  return fallback;
}
function uuidLooksValid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function initChat() {
  if (initialized) return;
  initialized = true;

  $('chat-auth-form')?.addEventListener('submit', signIn);
  $('chat-confirm-key')?.addEventListener('click', confirmPartnerFingerprint);
  $('chat-recover-own-key')?.addEventListener('click', recoverOwnDeviceKey);
  $('chat-copy-own-key')?.addEventListener('click', () => copyFingerprint('chat-own-fingerprint'));
  $('chat-copy-partner-key')?.addEventListener('click', () => copyFingerprint('chat-partner-fingerprint'));
  $('chat-retry-setup')?.addEventListener('click', () => onChatUnlocked());
  $('chat-message-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  $('chat-send-btn')?.addEventListener('click', sendMessage);
  $('chat-attach-btn')?.addEventListener('click', beginAttachmentPicker);
  $('chat-attachment-input')?.addEventListener('change', async (event) => {
    const picker = event.currentTarget;
    const file = picker?.files?.[0] || null;
    if (picker) picker.value = '';
    finishAttachmentPicker(Boolean(file));
    if (file) await sendMediaFile(file);
  });
  // Some Android WebViews emit "cancel" without a corresponding empty change event.
  $('chat-attachment-input')?.addEventListener('cancel', () => finishAttachmentPicker(false));

  // main.js uses this narrow signal to distinguish the system file chooser from a real app switch.
  // The normal background lock remains active for all other app transitions.
  window.ourSpaceAttachmentPicker = {
    isPending: () => attachmentPickerPending,
    onBackground: () => {
      if (attachmentPickerPending) attachmentPickerBackgrounded = true;
    },
    onForeground: () => {
      if (!attachmentPickerPending || !attachmentPickerBackgrounded) return;
      if (attachmentPickerResumeTimeout !== null) window.clearTimeout(attachmentPickerResumeTimeout);
      attachmentPickerResumeTimeout = window.setTimeout(() => {
        if (attachmentPickerPending && attachmentPickerBackgrounded) finishAttachmentPicker(false);
      }, ATTACHMENT_PICKER_RESUME_GRACE_MS);
    },
  };

  const logoutButton = document.querySelector('#view-profile button.text-red-700');
  logoutButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await signOut();
  });

  if (!hasSupabaseConfig) {
    showSetup();
    messageError('Konfigurasi backend belum tersedia. Isi URL dan publishable key Supabase sebelum login.');
  } else {
    showSetup();
  }
}

export async function onChatUnlocked() {
  appUnlocked = true;
  clearMessageError();

  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    showSetup();
    setConnectionLabel('Khusus APK Android');
    messageError('Enkripsi E2EE menggunakan Android Keystore. Browser preview tidak boleh dipakai untuk mengirim pesan.');
    return;
  }
  if (!hasSupabaseConfig || !supabase) {
    showSetup();
    setConnectionLabel('Backend belum dikonfigurasi');
    messageError('Konfigurasi Supabase tidak ditemukan. Periksa pengaturan build.');
    return;
  }

  setConnectionLabel('Memeriksa sesi…');
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!appUnlocked) return;
    if (data.session?.user) {
      sessionUser = data.session.user;
      $('chat-auth-form')?.classList.add('hidden');
      await bootstrapPrivateChat();
    } else {
      clearPrivateState();
      showSetup();
      setAuthFormVisible(true);
      setConnectionLabel('Masuk diperlukan');
      $('chat-email')?.focus();
    }
  } catch (error) {
    showSetup();
    setAuthFormVisible(true);
    setConnectionLabel('Sesi belum tersedia');
    messageError('Sesi aman tidak dapat dibuka. Jika kunci Keystore berubah setelah pemulihan perangkat, masuk kembali. Detail: ' + safeMessage(error));
  }
}

function beginAttachmentPicker() {
  if (!appUnlocked || !partnerVerified || !sessionUser || isSending) return;
  const picker = $('chat-attachment-input');
  if (!picker) return;

  if (attachmentPickerResumeTimeout !== null) window.clearTimeout(attachmentPickerResumeTimeout);
  attachmentPickerResumeTimeout = null;
  attachmentPickerPending = true;
  attachmentPickerBackgrounded = false;
  picker.value = '';
  try {
    // Mark the expected temporary activity switch before launching Android's picker.
    picker.click();
    // Shield private chat contents behind the system picker and in app-task previews.
    // Keep the WebView mounted so the selected File can still reach its change event.
    const appLayout = $('app-layout');
    if (appLayout && attachmentPickerPreviousVisibility === null) {
      attachmentPickerPreviousVisibility = appLayout.style.visibility;
      appLayout.style.visibility = 'hidden';
    }
  } catch {
    finishAttachmentPicker(false);
    messageError('Galeri tidak dapat dibuka. Coba lagi.');
  }
}

function clearAttachmentPickerState() {
  if (attachmentPickerResumeTimeout !== null) window.clearTimeout(attachmentPickerResumeTimeout);
  attachmentPickerResumeTimeout = null;
  attachmentPickerPending = false;
  attachmentPickerBackgrounded = false;
  if (attachmentPickerPreviousVisibility !== null) {
    const appLayout = $('app-layout');
    if (appLayout) appLayout.style.visibility = attachmentPickerPreviousVisibility;
    attachmentPickerPreviousVisibility = null;
  }
}

function finishAttachmentPicker(fileSelected) {
  const shouldRelock = !fileSelected && attachmentPickerPending && attachmentPickerBackgrounded;
  clearAttachmentPickerState();
  if (shouldRelock) window.dispatchEvent(new Event('ourspace:attachment-picker-cancelled'));
}

function clearMediaObjectUrls() {
  document.querySelectorAll('#chat-container video, #chat-container audio').forEach((media) => {
    try { media.pause(); media.removeAttribute('src'); media.load(); } catch { /* best-effort local media release */ }
  });
  for (const url of mediaObjectUrls) URL.revokeObjectURL(url);
  mediaObjectUrls.clear();
}

export function onChatLocked() {
  clearAttachmentPickerState();
  clearMediaObjectUrls();
  appUnlocked = false;
  if (realtimeChannel && supabase) {
    supabase.removeChannel(realtimeChannel).catch(() => {});
  }
  realtimeChannel = null;
  renderedIds.clear();
  if ($('chat-container')) $('chat-container').replaceChildren();
  if ($('chat-message-input')) $('chat-message-input').value = '';
  if ($('chat-password')) $('chat-password').value = '';
  setConnectionLabel('Terkunci');
}

async function signIn(event) {
  event.preventDefault();
  clearMessageError();
  if (!appUnlocked) return;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    messageError('Masuk akun hanya tersedia di APK Android.');
    return;
  }
  if (!supabase || !hasSupabaseConfig) {
    messageError('Backend Supabase belum dikonfigurasi.');
    return;
  }

  const email = $('chat-email')?.value.trim();
  const password = $('chat-password')?.value;
  if (!email || !password) {
    messageError('Isi email dan kata sandi akun Supabase.');
    return;
  }
  const button = $('chat-auth-submit');
  if (button) button.disabled = true;
  setConnectionLabel('Memverifikasi akun…');

  try {
    // Supabase stores session data through keystoreSessionStorage; the password is never persisted.
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    $('chat-password').value = '';
    if (!data.user) throw new Error('Akun tidak mengembalikan identitas.');
    sessionUser = data.user;
    $('chat-auth-form')?.classList.add('hidden');
    await bootstrapPrivateChat();
  } catch (error) {
    $('chat-password').value = '';
    showSetup();
    setAuthFormVisible(true);
    setConnectionLabel('Login gagal');
    messageError(humanError(error, 'Login belum berhasil. Pastikan akun sudah dibuat pada project Supabase yang benar.'));
  } finally {
    if (button) button.disabled = false;
  }
}

async function bootstrapPrivateChat() {
  clearMessageError();
  showSetup();
  setAuthFormVisible(false);
  setConnectionLabel('Memeriksa keanggotaan…');

  try {
    requireAndroidE2EE();
    const selectedIdentity = await Preferences.get({ key: PIN_IDENTITY_KEY });
    const localName = selectedIdentity.value;
    if (localName !== 'hamid' && localName !== 'nur') {
      throw new Error('Identitas perangkat belum benar. Keluar akun, tutup aplikasi, dan ulangi pengaturan lokal.');
    }

    const { data: members, error: membersError } = await supabase
      .from('pair_members')
      .select('pair_id,user_id,member_name')
      .order('member_name', { ascending: true });
    if (membersError) throw membersError;
    const ownRows = (members || []).filter((member) => member.user_id === sessionUser.id);
    if (ownRows.length !== 1) {
      throw new Error('Akun berhasil masuk, tetapi belum terdaftar tepat satu kali sebagai anggota pasangan. Migration/seed Fase 2 perlu diselesaikan.');
    }
    ownMember = ownRows[0];
    if (ownMember.member_name !== localName) {
      throw new Error('Identitas lokal tidak cocok dengan akun server. Keluar dari akun Supabase yang salah; nama lokal tidak memberi akses ke akun lain.');
    }
    pair = { id: ownMember.pair_id };
    const partners = (members || []).filter((member) => member.pair_id === pair.id && member.user_id !== sessionUser.id);
    if (partners.length !== 1) {
      throw new Error('Pasangan server belum lengkap. Database harus memiliki tepat dua anggota terverifikasi, Hamid dan Nur.');
    }
    partnerMember = partners[0];
    if (partnerMember.member_name === ownMember.member_name) {
      throw new Error('Konfigurasi pasangan tidak valid: identitas anggota duplikat.');
    }

    setConnectionLabel('Menyiapkan kunci perangkat…');
    const localKey = await ensureDeviceIdentityKey();
    if (!appUnlocked) return;

    // Show the local fingerprint immediately, even if the server has a stale key record.
    // This is diagnostic-only: mismatch checks below still abort and keep chat locked.
    await updateFingerprintPanel(localKey, null);
    if (!appUnlocked) return;

    const { data: existingKey, error: existingError } = await supabase
      .from('device_keys')
      .select('id,pair_id,user_id,public_key,fingerprint,key_version,algorithm')
      .eq('pair_id', pair.id)
      .eq('user_id', sessionUser.id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (!existingKey) {
      const { error: insertError } = await supabase.from('device_keys').insert({
        pair_id: pair.id,
        user_id: sessionUser.id,
        public_key: localKey.publicKey,
        fingerprint: localKey.fingerprint,
        key_version: EXPECTED_KEY_VERSION,
        algorithm: 'ECDH-P256',
      });
      if (insertError && insertError.code !== '23505') throw insertError;
      const { data: insertedOrRaced, error: rereadError } = await supabase
        .from('device_keys')
        .select('id,pair_id,user_id,public_key,fingerprint,key_version,algorithm')
        .eq('pair_id', pair.id)
        .eq('user_id', sessionUser.id)
        .maybeSingle();
      if (rereadError) throw rereadError;
      ownDeviceKey = insertedOrRaced;
    } else {
      ownDeviceKey = existingKey;
    }

    const ownKeyMismatch = Boolean(
      ownDeviceKey &&
      ownDeviceKey.key_version === EXPECTED_KEY_VERSION &&
      ownDeviceKey.algorithm === 'ECDH-P256' &&
      (ownDeviceKey.fingerprint !== localKey.fingerprint || ownDeviceKey.public_key !== localKey.publicKey)
    );
    if (ownKeyMismatch) {
      // Offer an explicit, server-guarded recovery only for an unused pair.
      // The chat remains locked until the server accepts a separately guarded rebind.
      pendingLocalRecoveryKey = localKey;
      $('chat-key-recovery-note')?.classList.remove('hidden');
      $('chat-recover-own-key')?.classList.remove('hidden');
    }
    if (!ownDeviceKey || ownDeviceKey.fingerprint !== localKey.fingerprint ||
        ownDeviceKey.public_key !== localKey.publicKey ||
        ownDeviceKey.key_version !== EXPECTED_KEY_VERSION ||
        ownDeviceKey.algorithm !== 'ECDH-P256') {
      throw new Error('Fingerprint kunci lokal berbeda dari kunci yang tercatat di server. Pengiriman dihentikan; jangan hapus kunci atau mengganti fingerprint secara otomatis.');
    }

    const { data: peerKey, error: peerKeyError } = await supabase
      .from('device_keys')
      .select('id,pair_id,user_id,public_key,fingerprint,key_version,algorithm')
      .eq('pair_id', pair.id)
      .eq('user_id', partnerMember.user_id)
      .maybeSingle();
    if (peerKeyError) throw peerKeyError;
    partnerDeviceKey = peerKey || null;
    if (partnerDeviceKey) {
      // Never trust a fingerprint string supplied by the same server as its public key.
      // Compute SHA-256 over the exact DER bytes natively, then compare to the server record.
      const calculated = await KeyStore.fingerprintPublicKey({ publicKey: partnerDeviceKey.public_key });
      if (calculated.fingerprint !== partnerDeviceKey.fingerprint || calculated.algorithm !== 'ECDH-P256') {
        throw new Error('Fingerprint public key pasangan tidak cocok dengan data server. Ini dapat menandakan kunci diganti; chat dihentikan.');
      }
    }

    await updateFingerprintPanel(localKey, partnerDeviceKey);
    if (!appUnlocked) return;
    if (!partnerDeviceKey) {
      setConnectionLabel('Menunggu pasangan');
      messageError('Kunci pasangan belum terdaftar. Pasangan harus masuk dari HP-nya sendiri dan menyiapkan kunci sebelum verifikasi.');
      return;
    }
    if (partnerDeviceKey.key_version !== EXPECTED_KEY_VERSION || partnerDeviceKey.algorithm !== 'ECDH-P256') {
      throw new Error('Algoritma/versi kunci pasangan tidak didukung. Chat tetap terkunci.');
    }

    const { data: trust, error: trustError } = await supabase
      .from('key_verifications')
      .select('verified_fingerprint,key_version')
      .eq('pair_id', pair.id)
      .eq('verifier_user_id', sessionUser.id)
      .eq('target_user_id', partnerMember.user_id)
      .maybeSingle();
    if (trustError) throw trustError;

    partnerVerified = Boolean(
      trust &&
      trust.verified_fingerprint === partnerDeviceKey.fingerprint &&
      trust.key_version === partnerDeviceKey.key_version
    );
    $('chat-confirm-key')?.classList.toggle('hidden', partnerVerified);
    $('chat-key-verified')?.classList.toggle('hidden', !partnerVerified);
    $('chat-trust-explanation')?.classList.toggle('hidden', partnerVerified);

    if (!partnerVerified) {
      setConnectionLabel('Fingerprint belum diverifikasi');
      messageError('Chat masih terkunci. Bandingkan seluruh fingerprint pasangan melalui kanal lain yang tepercaya sebelum mengonfirmasi.');
      return;
    }

    void setPushContext({ userId: sessionUser.id, pairId: pair.id, verified: true });
    clearMessageError();
    showConversation();
    setConnectionLabel('E2EE aktif · fingerprint cocok', true);
    await loadMessages();
    await subscribeToMessages();
    updateComposerState();
  } catch (error) {
    showSetup();
    setAuthFormVisible(false);
    setConnectionLabel('Chat terkunci');
    messageError(safeMessage(error));
  }
}

async function updateFingerprintPanel(localKey, peerKey) {
  const ownNode = $('chat-own-fingerprint');
  const peerNode = $('chat-partner-fingerprint');
  if (ownNode) ownNode.textContent = localKey.fingerprint;
  if (peerNode) peerNode.textContent = peerKey?.fingerprint || 'Belum tersedia';
  if ($('chat-own-key-copy-row')) $('chat-own-key-copy-row').classList.remove('hidden');
  if ($('chat-partner-key-copy-row')) $('chat-partner-key-copy-row').classList.toggle('hidden', !peerKey);
  if ($('chat-confirm-key')) $('chat-confirm-key').classList.toggle('hidden', !peerKey || partnerVerified);
  if ($('chat-fingerprint-panel')) $('chat-fingerprint-panel').classList.remove('hidden');
  if ($('chat-key-version')) $('chat-key-version').textContent = 'ECDH P-256 · kunci v' + EXPECTED_KEY_VERSION;
}

async function recoverOwnDeviceKey() {
  const localKey = pendingLocalRecoveryKey;
  const button = $('chat-recover-own-key');
  if (!appUnlocked || !sessionUser || !pair || !ownDeviceKey || !localKey || !supabase) {
    messageError('Pemulihan kunci belum siap. Periksa sesi akun dan muat ulang status.');
    return;
  }

  const accepted = window.confirm(
    'PEMULIHAN KUNCI IDENTITAS\n\n' +
    'Tindakan ini akan mengganti public key akunmu di server dengan kunci yang sedang ada di HP ini. ' +
    'Server akan menolak pemulihan jika sudah ada pesan atau catatan verifikasi.\n\n' +
    'Fingerprint lokal baru:\n' + localKey.fingerprint +
    '\n\nLanjutkan hanya jika kamu memang baru mengganti/membuat ulang kunci dan memahami bahwa fingerprint akan berubah.'
  );
  if (!accepted) return;

  if (button) button.disabled = true;
  try {
    const { error } = await supabase.rpc('recover_own_device_key_if_unused', {
      p_pair_id: pair.id,
      p_public_key: localKey.publicKey,
      p_fingerprint: localKey.fingerprint,
    });
    if (error) throw error;

    pendingLocalRecoveryKey = null;
    button?.classList.add('hidden');
    $('chat-key-recovery-note')?.classList.add('hidden');
    messageError('Catatan kunci server telah diperbarui. Chat tetap terkunci sampai kunci pasangan tersedia dan fingerprint pasangan diverifikasi.');
    await bootstrapPrivateChat();
  } catch (error) {
    messageError('Pemulihan kunci ditolak atau belum tersedia. Server hanya mengizinkan pemulihan jika belum ada pesan dan verifikasi. Pastikan migrasi pemulihan sudah diterapkan. Detail: ' + safeMessage(error));
  } finally {
    if (button) button.disabled = false;
  }
}

async function confirmPartnerFingerprint() {
  clearMessageError();
  if (!appUnlocked || !sessionUser || !pair || !partnerMember || !partnerDeviceKey) {
    messageError('Kunci pasangan belum tersedia untuk diverifikasi.');
    return;
  }
  const promptText = 'Pastikan kamu sudah membandingkan SELURUH 64 karakter fingerprint di bawah dengan fingerprint yang tampil langsung di HP pasangan melalui kanal lain yang tepercaya. Konfirmasi ini bukan pengganti perbandingan.';
  if (!window.confirm(promptText + '\n\nFingerprint pasangan:\n' + partnerDeviceKey.fingerprint)) return;

  const button = $('chat-confirm-key');
  if (button) button.disabled = true;
  try {
    const { error } = await supabase.from('key_verifications').upsert({
      pair_id: pair.id,
      verifier_user_id: sessionUser.id,
      target_user_id: partnerMember.user_id,
      verified_fingerprint: partnerDeviceKey.fingerprint,
      key_version: partnerDeviceKey.key_version,
    }, { onConflict: 'pair_id,verifier_user_id,target_user_id' });
    if (error) throw error;
    await bootstrapPrivateChat();
  } catch (error) {
    messageError('Verifikasi fingerprint tidak tersimpan. Pastikan kebijakan RLS/migrasi sudah diterapkan.');
  } finally {
    if (button) button.disabled = false;
  }
}

async function copyFingerprint(elementId) {
  const value = $(elementId)?.textContent?.trim();
  if (!value || value === 'Belum tersedia') return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const temporary = document.createElement('textarea');
      temporary.value = value;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.appendChild(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
    }
    clearMessageError();
  } catch {
    messageError('Salin otomatis gagal. Tekan lama fingerprint lalu salin secara manual.');
  }
}

async function loadMessages() {
  if (!partnerVerified || !appUnlocked || !pair || !sessionUser || !partnerDeviceKey) return;
  const container = $('chat-container');
  if (!container) return;
  clearMediaObjectUrls();
  container.replaceChildren();
  renderedIds.clear();
  const { data, error } = await supabase.from('messages')
    .select('id,pair_id,sender_id,recipient_id,ciphertext,nonce,key_version,message_type,created_at')
    .eq('pair_id', pair.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (!appUnlocked || !partnerVerified) return;
  if (error) throw error;

  if (!data?.length) {
    const empty = document.createElement('div');
    empty.className = 'h-full min-h-48 flex flex-col items-center justify-center text-center px-6';
    const heading = document.createElement('h3');
    heading.className = 'font-serif text-lg text-surface-dark mb-2';
    heading.textContent = 'Ruang pesan siap';
    const note = document.createElement('p');
    note.className = 'text-xs text-surface-muted leading-relaxed max-w-xs';
    note.textContent = 'Belum ada pesan. Isi percakapan baru akan ditampilkan setelah didekripsi di perangkat ini.';
    empty.append(heading, note);
    container.appendChild(empty);
    return;
  }

  for (const row of [...data].reverse()) {
    if (!appUnlocked || !partnerVerified) return;
    await decryptAndRender(row);
  }
}

async function decryptAndRender(row) {
  if (!appUnlocked || !partnerVerified) return;
  try {
    validateCiphertextMessage(row);
    const peerKey = partnerDeviceKey;
    if (!peerKey || peerKey.key_version !== row.key_version) return;
    if (row.message_type === 'media') {
      await decryptAndRenderMedia(row, peerKey);
      return;
    }
    const opened = await KeyStore.decryptMessage({
      peerPublicKey: peerKey.public_key,
      pairId: row.pair_id,
      messageId: row.id,
      senderId: row.sender_id,
      recipientId: row.recipient_id,
      keyVersion: row.key_version,
      messageType: row.message_type,
      nonce: row.nonce,
      ciphertext: row.ciphertext,
    });
    if (!appUnlocked || !partnerVerified) return;
    renderMessage(row, opened.plaintext);
  } catch {
    if (!appUnlocked || !partnerVerified) return;
    if (row?.message_type === 'media') renderMediaFailure(row);
    else renderUndecryptableMessage();
  }
}

async function decryptAndRenderMedia(row, peerKey) {
  if (!appUnlocked || !partnerVerified) return;
  const opened = await KeyStore.decryptMessage({
    peerPublicKey: peerKey.public_key,
    pairId: row.pair_id,
    messageId: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    keyVersion: row.key_version,
    messageType: 'media',
    nonce: row.nonce,
    ciphertext: row.ciphertext,
  });
  // Metadata is plaintext only on this device; do not parse it or start a Storage
  // request if the app locked while native decryption was in flight.
  if (!appUnlocked || !partnerVerified || !sessionUser) return;
  const metadata = validateMediaMetadata(JSON.parse(opened.plaintext), row);
  const result = await supabase.storage.from(MEDIA_BUCKET).download(metadata.objectPath);
  if (!appUnlocked || !partnerVerified || !sessionUser) return;
  if (result.error || !result.data) throw result.error || new Error('Lampiran tidak tersedia.');
  if (result.data.size > MAX_MEDIA_BYTES + 1024) throw new Error('Ukuran ciphertext lampiran tidak valid.');

  const encryptedBuffer = await result.data.arrayBuffer();
  // A lock can happen while Blob.arrayBuffer() is pending. Do not start another
  // native media operation once the session is no longer authorized to continue.
  if (!appUnlocked || !partnerVerified || !sessionUser) {
    new Uint8Array(encryptedBuffer).fill(0);
    return;
  }
  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const encryptedBase64 = bytesToBase64(encryptedBytes);
  encryptedBytes.fill(0);
  const openedMedia = await KeyStore.decryptMedia({
    peerPublicKey: peerKey.public_key,
    pairId: row.pair_id,
    messageId: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    keyVersion: row.key_version,
    nonce: metadata.nonce,
    ciphertext: encryptedBase64,
  });
  if (!appUnlocked || !partnerVerified) return;
  if (openedMedia.filename !== metadata.filename ||
      openedMedia.mimeType !== metadata.mimeType ||
      openedMedia.size !== metadata.size) {
    throw new Error('Metadata media tidak cocok dengan lampiran.');
  }
  const mediaBytes = base64ToBytes(openedMedia.mediaBase64);
  const blob = new Blob([mediaBytes], { type: openedMedia.mimeType });
  mediaBytes.fill(0);
  renderMediaMessage(row, blob, metadata);
}



function renderMediaMessage(row, blob, metadata) {
  if (renderedIds.has(row.id)) return;
  renderedIds.add(row.id);
  const container = $('chat-container');
  if (!container) return;
  const outgoing = row.sender_id === sessionUser.id;
  const line = document.createElement('div');
  line.className = outgoing ? 'flex justify-end' : 'flex justify-start';
  const bubble = document.createElement('div');
  bubble.className = outgoing
    ? 'max-w-[88%] sm:max-w-[78%] rounded-2xl rounded-br-sm bg-surface-dark text-white px-3 py-3 shadow-sm break-words'
    : 'max-w-[88%] sm:max-w-[78%] rounded-2xl rounded-bl-sm bg-white text-surface-dark border border-gray-100 px-3 py-3 shadow-sm break-words';
  const objectUrl = URL.createObjectURL(blob);
  mediaObjectUrls.add(objectUrl);

  const filename = document.createElement('p');
  filename.className = 'text-xs font-medium mb-2 break-all';
  filename.textContent = metadata.filename;
  bubble.appendChild(filename);

  let mediaElement;
  if (metadata.mimeType.startsWith('image/')) {
    mediaElement = document.createElement('img');
    mediaElement.alt = metadata.filename;
    mediaElement.className = 'rounded-xl max-w-full max-h-72 object-contain';
    mediaElement.loading = 'lazy';
    mediaElement.decoding = 'async';
    mediaElement.src = objectUrl;
  } else if (metadata.mimeType.startsWith('video/')) {
    mediaElement = document.createElement('video');
    mediaElement.controls = true;
    mediaElement.playsInline = true;
    mediaElement.preload = 'metadata';
    mediaElement.className = 'rounded-xl max-w-full max-h-72';
    mediaElement.src = objectUrl;
  } else {
    mediaElement = document.createElement('audio');
    mediaElement.controls = true;
    mediaElement.preload = 'metadata';
    mediaElement.className = 'w-full max-w-full';
    mediaElement.src = objectUrl;
  }
  bubble.appendChild(mediaElement);

  const details = document.createElement('p');
  details.className = outgoing ? 'mt-2 text-[10px] text-white/70' : 'mt-2 text-[10px] text-surface-muted';
  details.textContent = formatMediaSize(metadata.size);
  bubble.appendChild(details);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = outgoing ? 'inline-block mt-2 text-[10px] underline text-white/80 disabled:opacity-50' : 'inline-block mt-2 text-[10px] underline text-brand-600 disabled:opacity-50';
  save.textContent = 'Simpan ke perangkat';
  const saveStatus = document.createElement('p');
  saveStatus.className = outgoing ? 'mt-1 text-[10px] text-white/70' : 'mt-1 text-[10px] text-surface-muted';
  save.addEventListener('click', async () => {
    if (!appUnlocked || !partnerVerified || !sessionUser) {
      saveStatus.textContent = 'Buka kunci aplikasi dan verifikasi pasangan sebelum menyimpan.';
      return;
    }
    save.disabled = true;
    saveStatus.textContent = 'Menyimpan media terdekripsi…';
    let bytes = null;
    try {
      bytes = new Uint8Array(await blob.arrayBuffer());
      if (!appUnlocked || !partnerVerified || !sessionUser) {
        throw new Error('Simpan dibatalkan karena aplikasi dikunci.');
      }
      const mediaBase64 = bytesToBase64(bytes);
      bytes.fill(0);
      bytes = null;
      const saved = await KeyStore.saveMediaToGallery({
        filename: metadata.filename,
        mimeType: metadata.mimeType,
        mediaBase64,
      });
      if (saved.destination === 'gallery') {
        saveStatus.textContent = 'Tersimpan ke Galeri: ' + saved.filename;
      } else {
        saveStatus.textContent = 'Tersimpan di folder file aplikasi: ' + saved.filename;
      }
      save.textContent = 'Tersimpan ✓';
    } catch {
      saveStatus.textContent = 'Gagal menyimpan. Coba lagi setelah ruang penyimpanan tersedia.';
    } finally {
      if (bytes) bytes.fill(0);
      save.disabled = false;
    }
  });
  bubble.append(save, saveStatus);

  const time = document.createElement('p');
  time.className = outgoing ? 'mt-1 text-[9px] text-white/60 text-right' : 'mt-1 text-[9px] text-surface-muted text-right';
  time.textContent = formatMessageTime(row.created_at);
  bubble.appendChild(time);
  line.appendChild(bubble);
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function renderMediaFailure(row) {
  if (renderedIds.has(row.id)) return;
  renderedIds.add(row.id);
  const container = $('chat-container');
  if (!container) return;
  const line = document.createElement('div');
  line.className = row.sender_id === sessionUser?.id ? 'flex justify-end' : 'flex justify-start';
  const notice = document.createElement('div');
  notice.className = 'max-w-[85%] rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-800';
  notice.appendChild(document.createTextNode('Lampiran tidak dapat dimuat atau diverifikasi. Isi tidak ditampilkan. '));
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'mt-2 underline font-medium';
  retry.textContent = 'Coba lagi';
  retry.addEventListener('click', () => {
    renderedIds.delete(row.id);
    line.remove();
    decryptAndRender(row).catch(() => {});
  }, { once: true });
  notice.appendChild(retry);
  line.appendChild(notice);
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeMediaFilename(value) {
  const cleaned = String(value || 'lampiran').replace(/[\/\\]/g, '_').trim().slice(0, 120);
  const noControls = Array.from(cleaned).filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('');
  return noControls || 'lampiran';
}

function formatMediaSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderMessage(row, text) {
  if (renderedIds.has(row.id)) return;
  renderedIds.add(row.id);
  const container = $('chat-container');
  if (!container) return;
  const outgoing = row.sender_id === sessionUser.id;
  const line = document.createElement('div');
  line.className = outgoing ? 'flex justify-end' : 'flex justify-start';
  const bubble = document.createElement('div');
  bubble.className = outgoing
    ? 'max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-sm bg-surface-dark text-white px-4 py-2.5 shadow-sm break-words'
    : 'max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-bl-sm bg-white text-surface-dark border border-gray-100 px-4 py-2.5 shadow-sm break-words';
  const body = document.createElement('p');
  body.className = 'text-xs sm:text-sm whitespace-pre-wrap break-words';
  body.textContent = text;
  const time = document.createElement('p');
  time.className = outgoing ? 'mt-1 text-[9px] text-white/60 text-right' : 'mt-1 text-[9px] text-surface-muted text-right';
  time.textContent = formatMessageTime(row.created_at);
  bubble.append(body, time);
  line.appendChild(bubble);
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function renderUndecryptableMessage() {
  const container = $('chat-container');
  if (!container) return;
  const notice = document.createElement('p');
  notice.className = 'text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-xl p-3 text-center';
  notice.textContent = 'Satu pesan tidak dapat diverifikasi/dekripsi; isi tidak ditampilkan.';
  container.appendChild(notice);
}

function formatMessageTime(value) {
  try {
    return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

async function subscribeToMessages() {
  if (!appUnlocked || !pair || !supabase) return;
  if (realtimeChannel) await supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel('our-space-messages-' + pair.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: 'pair_id=eq.' + pair.id,
    }, (payload) => {
      if (!appUnlocked || !partnerVerified) return;
      if (payload.new?.sender_id === sessionUser?.id) return;
      decryptAndRender(payload.new).catch(() => {});
    })
    .subscribe((status) => {
      if (!appUnlocked) return;
      if (status === 'SUBSCRIBED') setConnectionLabel('E2EE aktif · tersambung', true);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setConnectionLabel('E2EE tersimpan · live terputus');
      }
    });
}

async function sendMediaFile(file) {
  if (isSending || !appUnlocked || !sessionUser || !pair || !partnerMember || !partnerDeviceKey || !partnerVerified) return;
  clearMessageError();
  const status = $('chat-upload-status');
  let objectUploaded = false;
  let objectPath = '';
  let uploadedBytes = null;
  let mediaBase64 = null;
  try {
    if (!file || !isSupportedMediaMimeType(file.type)) {
      throw new Error('Pilih gambar, video, atau audio dengan format yang didukung.');
    }
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_MEDIA_BYTES) {
      throw new Error('Ukuran lampiran maksimal 3 MiB.');
    }

    const filename = safeMediaFilename(file.name);
    const mimeType = file.type.trim().toLowerCase();
    const messageId = createMessageId();
    objectPath = pair.id + '/' + sessionUser.id + '/' + messageId + '.bin';

    isSending = true;
    updateComposerState();
    if (status) {
      status.textContent = 'Mengamankan lampiran di perangkat…';
      status.classList.remove('hidden');
    }

    const inputBuffer = await file.arrayBuffer();
    // The app can lock while File.arrayBuffer() is pending. Stop before creating
    // a Base64 plaintext copy or calling native crypto when the session is no longer active.
    if (!appUnlocked || !partnerVerified || !sessionUser) {
      new Uint8Array(inputBuffer).fill(0);
      return;
    }
    const inputBytes = new Uint8Array(inputBuffer);
    mediaBase64 = bytesToBase64(inputBytes);
    inputBytes.fill(0);
    const encrypted = await KeyStore.encryptMedia({
      peerPublicKey: partnerDeviceKey.public_key,
      pairId: pair.id,
      messageId,
      senderId: sessionUser.id,
      recipientId: partnerMember.user_id,
      keyVersion: EXPECTED_KEY_VERSION,
      filename,
      mimeType,
      mediaBase64,
    });
    mediaBase64 = null;
    if (!appUnlocked || !partnerVerified || !sessionUser) return;

    if (status) status.textContent = 'Mengunggah ciphertext terenkripsi…';
    uploadedBytes = base64ToBytes(encrypted.ciphertext);
    const encryptedBlob = new Blob([uploadedBytes], { type: 'application/octet-stream' });
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, encryptedBlob, {
      contentType: 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) throw uploadError;
    objectUploaded = true;
    uploadedBytes.fill(0);
    uploadedBytes = null;
    if (!appUnlocked || !partnerVerified) return;

    if (status) status.textContent = 'Menyimpan metadata terenkripsi…';
    const metadata = {
      mediaVersion: 1,
      objectPath,
      filename,
      mimeType,
      size: file.size,
      nonce: encrypted.nonce,
    };
    const encryptedMetadata = await KeyStore.encryptMessage({
      peerPublicKey: partnerDeviceKey.public_key,
      pairId: pair.id,
      messageId,
      senderId: sessionUser.id,
      recipientId: partnerMember.user_id,
      keyVersion: EXPECTED_KEY_VERSION,
      messageType: 'media',
      plaintext: JSON.stringify(metadata),
    });
    if (!appUnlocked || !partnerVerified) return;

    const record = {
      id: messageId,
      pair_id: pair.id,
      sender_id: sessionUser.id,
      recipient_id: partnerMember.user_id,
      ciphertext: encryptedMetadata.ciphertext,
      nonce: encryptedMetadata.nonce,
      key_version: EXPECTED_KEY_VERSION,
      message_type: 'media',
    };
    const { data, error } = await supabase.from('messages').insert(record)
      .select('id,pair_id,sender_id,recipient_id,ciphertext,nonce,key_version,message_type,created_at')
      .single();
    if (error) throw error;
    objectUploaded = false;
    void notifyPartnerForMessage(data.id);
    if (!appUnlocked || !partnerVerified) return;
    renderMediaMessage(data, file.slice(0, file.size, mimeType), metadata);
    const bottom = $('chat-container');
    if (bottom) bottom.scrollTop = bottom.scrollHeight;
  } catch (error) {
    // Do not surface stale upload/encryption errors into a locked chat view.
    if (!appUnlocked || !partnerVerified || !sessionUser) return;
    const visibleMessage = error?.message && !/jwt|token|authorization|secret/i.test(error.message)
      ? error.message
      : humanError(error, 'Lampiran tidak terkirim. File asli tidak disimpan di server.');
    messageError(visibleMessage);
  } finally {
    mediaBase64 = null;
    if (objectUploaded && objectPath) {
      try { await supabase.storage.from(MEDIA_BUCKET).remove([objectPath]); } catch { /* an orphan contains ciphertext only */ }
    }
    if (uploadedBytes) uploadedBytes.fill(0);
    if (status) status.classList.add('hidden');
    isSending = false;
    updateComposerState();
  }
}

function updateComposerState() {
  const enabled = Boolean(appUnlocked && sessionUser && partnerVerified && partnerDeviceKey && pair);
  if ($('chat-message-input')) $('chat-message-input').disabled = !enabled;
  if ($('chat-send-btn')) $('chat-send-btn').disabled = !enabled || isSending;
  if ($('chat-attach-btn')) $('chat-attach-btn').disabled = !enabled || isSending;
  if ($('chat-attachment-input')) $('chat-attachment-input').disabled = !enabled || isSending;
  if ($('chat-message-input')) $('chat-message-input').placeholder = enabled ? 'Ketik pesan terenkripsi…' : 'Verifikasi fingerprint untuk mulai chat';
}

async function sendMessage() {
  if (isSending || !appUnlocked || !sessionUser || !pair || !partnerMember || !partnerDeviceKey || !partnerVerified) return;
  clearMessageError();
  const input = $('chat-message-input');
  let plaintext;
  try {
    plaintext = normalizeTextMessage(input?.value ?? '');
  } catch (error) {
    messageError(safeMessage(error));
    return;
  }
  const messageId = createMessageId();
  isSending = true;
  updateComposerState();
  try {
    const encrypted = await KeyStore.encryptMessage({
      peerPublicKey: partnerDeviceKey.public_key,
      pairId: pair.id,
      messageId,
      senderId: sessionUser.id,
      recipientId: partnerMember.user_id,
      keyVersion: EXPECTED_KEY_VERSION,
      plaintext,
    });
    if (!appUnlocked) return;
    const record = {
      id: messageId,
      pair_id: pair.id,
      sender_id: sessionUser.id,
      recipient_id: partnerMember.user_id,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      key_version: EXPECTED_KEY_VERSION,
      message_type: 'text',
    };
    const { data, error } = await supabase.from('messages').insert(record)
      .select('id,pair_id,sender_id,recipient_id,ciphertext,nonce,key_version,message_type,created_at')
      .single();
    if (error) throw error;
    void notifyPartnerForMessage(data.id);
    if (!appUnlocked) return;
    renderMessage(data, plaintext);
    input.value = '';
    input.style.height = '';
    const bottom = $('chat-container');
    if (bottom) bottom.scrollTop = bottom.scrollHeight;
  } catch (error) {
    messageError(humanError(error, 'Pesan tidak terkirim. Tidak ada plaintext yang disimpan pada server.'));
  } finally {
    isSending = false;
    updateComposerState();
  }
}

async function signOut() {
  if (!supabase) return;
  try {
    await disablePushBeforeSignOut();
  } catch {
    messageError('Token notifikasi belum bisa dicabut karena jaringan belum siap. Sesi akun dipertahankan demi privasi; sambungkan internet lalu coba Keluar lagi.');
    return;
  }
  try {
    await supabase.auth.signOut();
  } catch {
    // Local Keystore keys are intentionally retained; logout is not key deletion.
  }
  if (realtimeChannel) await supabase.removeChannel(realtimeChannel).catch(() => {});
  realtimeChannel = null;
  clearPrivateState();
  showSetup();
  setAuthFormVisible(true);
  setConnectionLabel('Keluar dari akun');
  messageError('Sesi akun dikeluarkan. Kunci E2EE perangkat tetap dipertahankan.');
}

function clearPrivateState() {
  clearMediaObjectUrls();
  sessionUser = null;
  pair = null;
  ownMember = null;
  partnerMember = null;
  ownDeviceKey = null;
  partnerDeviceKey = null;
  partnerVerified = false;
  renderedIds.clear();
  if ($('chat-container')) $('chat-container').replaceChildren();
  updateComposerState();
}

function safeMessage(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/JWT|token|password|secret|authorization|key is invalid/i.test(message)) {
    return 'Sesi atau kunci aman belum dapat diverifikasi. Coba login lagi; jangan bagikan kredensial ke siapa pun.';
  }
  if (/Failed to fetch|ECONNREFUSED|timeout|network/i.test(message)) {
    return 'Layanan Supabase belum siap atau koneksi terputus. Coba lagi setelah server aktif dan jaringan pulih.';
  }
  return message || 'Operasi chat gagal. Chat tetap terkunci sampai proses aman selesai.';
}
