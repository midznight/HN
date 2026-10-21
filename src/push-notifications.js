import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase.js';

const ENABLED_KEY = 'os.push.enabled.v1';
const FCM_ANDROID_CONFIGURED = import.meta.env.VITE_FCM_CONFIGURED === 'true';
const FCM_PROJECT_ID = typeof import.meta.env.VITE_FCM_PROJECT_ID === 'string'
  ? import.meta.env.VITE_FCM_PROJECT_ID
  : '';
const ANDROID_NATIVE = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const CHANNEL_ID = 'our-space-messages';

let initialized = false;
let currentContext = null;
let backendReady = false;
let readinessPromise = null;
let listenersReady = false;
let registrationWaiter = null;

function control() { return document.getElementById('push-notifications-toggle'); }
function statusNode() { return document.getElementById('push-notifications-status'); }
function status(message) { const node = statusNode(); if (node) node.textContent = message; }
function disableControl(message) {
  const checkbox = control();
  if (checkbox) checkbox.disabled = true;
  status(message);
}
function contextStillMatches(snapshot) {
  return Boolean(currentContext && snapshot &&
    currentContext.userId === snapshot.userId &&
    currentContext.pairId === snapshot.pairId &&
    currentContext.verified === true);
}
async function savedPreference() {
  try { return (await Preferences.get({ key: ENABLED_KEY })).value === 'true'; }
  catch { return false; }
}
async function setSavedPreference(enabled) {
  await Preferences.set({ key: ENABLED_KEY, value: enabled ? 'true' : 'false' });
}

function ensureListeners() {
  if (listenersReady) return Promise.resolve();
  listenersReady = true;
  return (async () => {
    await PushNotifications.addListener('registration', (registration) => {
      if (registrationWaiter) {
        const waiter = registrationWaiter;
        registrationWaiter = null;
        clearTimeout(waiter.timer);
        waiter.resolve(registration.value);
      } else if (currentContext && backendReady) {
        void savedPreference().then((enabled) => {
          const snapshot = currentContext ? { ...currentContext } : null;
          if (enabled && snapshot) return persistToken(registration.value, snapshot);
          return undefined;
        });
      }
    });
    await PushNotifications.addListener('registrationError', () => {
      if (registrationWaiter) {
        const waiter = registrationWaiter;
        registrationWaiter = null;
        clearTimeout(waiter.timer);
        waiter.reject(new Error('registration_failed'));
      }
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', () => {
      // The notification has no message ID, sender identity, or chat data.
      window.dispatchEvent(new Event('ourspace:push-open-chat'));
    });
  })().catch((error) => {
    listenersReady = false;
    throw error;
  });
}

async function serverReady() {
  if (backendReady) return true;
  if (readinessPromise) return readinessPromise;
  if (!FCM_ANDROID_CONFIGURED || !FCM_PROJECT_ID || !ANDROID_NATIVE || !supabase) return false;

  readinessPromise = (async () => {
    const { data, error } = await supabase.functions.invoke('send-chat-push', {
      body: { action: 'status', firebase_project_id: FCM_PROJECT_ID },
    });
    backendReady = !error && data?.ready === true;
    return backendReady;
  })();

  try { return await readinessPromise; }
  catch { backendReady = false; return false; }
  finally { readinessPromise = null; }
}

function waitForRegistrationToken() {
  return new Promise((resolve, reject) => {
    if (registrationWaiter) {
      clearTimeout(registrationWaiter.timer);
      registrationWaiter.reject(new Error('registration_replaced'));
      registrationWaiter = null;
    }
    const timer = setTimeout(() => {
      if (!registrationWaiter) return;
      registrationWaiter = null;
      reject(new Error('registration_timeout'));
    }, 15000);
    registrationWaiter = { resolve, reject, timer };
  });
}

async function persistToken(token, snapshot) {
  if (!token || !contextStillMatches(snapshot) || !supabase) {
    throw new Error('invalid_push_context');
  }
  const { error } = await supabase.from('device_push_tokens').upsert({
    user_id: snapshot.userId,
    pair_id: snapshot.pairId,
    token,
    platform: 'android',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw new Error('push_token_not_saved');
  if (!contextStillMatches(snapshot)) {
    await supabase.from('device_push_tokens').delete().eq('user_id', snapshot.userId);
    throw new Error('push_context_changed');
  }
}

async function askPermissionIfNeeded(explicitUserAction) {
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'granted') return true;
  if (!explicitUserAction) return false;
  permission = await PushNotifications.requestPermissions();
  return permission.receive === 'granted';
}

async function registerDevice(explicitUserAction) {
  const snapshot = currentContext ? { ...currentContext } : null;
  if (!FCM_ANDROID_CONFIGURED || !FCM_PROJECT_ID || !ANDROID_NATIVE || !supabase) {
    disableControl('Konfigurasi Firebase belum tersedia pada build ini; izin Android tidak diminta.');
    return false;
  }
  if (!snapshot || !snapshot.verified || !snapshot.userId || !snapshot.pairId) {
    disableControl('Masuk dan verifikasi fingerprint pasangan untuk mengatur push.');
    return false;
  }
  if (!(await serverReady())) {
    disableControl('Push menunggu konfigurasi Firebase server yang valid. Notifikasi tetap nonaktif.');
    return false;
  }
  await ensureListeners();
  if (!(await askPermissionIfNeeded(explicitUserAction))) {
    status(explicitUserAction
      ? 'Izin notifikasi tidak diberikan. Aktifkan izin Our Space di pengaturan Android jika diperlukan.'
      : 'Push tersimpan sebagai preferensi, tetapi izin Android belum aktif. Matikan lalu aktifkan kembali untuk mencoba.');
    return false;
  }

  await PushNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Our Space',
    description: 'Pemberitahuan pesan baru tanpa isi pesan atau nama file',
    importance: 5,
    visibility: 0,
    sound: 'default',
    vibration: true,
  });

  const tokenPromise = waitForRegistrationToken();
  try {
    await PushNotifications.register();
    const token = await tokenPromise;
    await persistToken(token, snapshot);
    await setSavedPreference(true);
    const checkbox = control();
    if (checkbox) { checkbox.checked = true; checkbox.disabled = false; }
    status('Push aktif. Notifikasi hanya menyebut ada pesan baru; isi chat tetap privat.');
    return true;
  } catch {
    if (registrationWaiter) {
      clearTimeout(registrationWaiter.timer);
      registrationWaiter = null;
    }
    throw new Error('push_registration_failed');
  }
}

async function turnOffPush() {
  const checkbox = control();
  if (checkbox) checkbox.disabled = true;
  try {
    if (currentContext && supabase) {
      const { error } = await supabase.from('device_push_tokens')
        .delete().eq('user_id', currentContext.userId);
      if (error) throw new Error('push_token_delete_failed');
    }
    await setSavedPreference(false);
    if (FCM_ANDROID_CONFIGURED && ANDROID_NATIVE) {
      try { await PushNotifications.unregister(); } catch { /* server token is already removed */ }
    }
    if (checkbox) checkbox.checked = false;
    status('Notifikasi push nonaktif pada akun dan perangkat ini.');
  } catch {
    if (checkbox) checkbox.checked = true;
    status('Token push belum bisa dicabut. Sambungkan internet lalu coba lagi.');
  } finally {
    if (checkbox) checkbox.disabled = !(await serverReady());
  }
}

export async function initPushNotifications() {
  if (initialized) return;
  initialized = true;
  const checkbox = control();
  if (checkbox) {
    checkbox.checked = false;
    checkbox.disabled = true;
    checkbox.addEventListener('change', async () => {
      if (!checkbox.checked) { await turnOffPush(); return; }
      checkbox.disabled = true;
      try {
        const enabled = await registerDevice(true);
        if (!enabled) {
          checkbox.checked = false;
          await setSavedPreference(false);
        }
      } catch {
        checkbox.checked = false;
        await setSavedPreference(false).catch(() => {});
        status('Push gagal diaktifkan. Periksa izin dan konfigurasi server; isi pesan tidak dikirim.');
      } finally {
        checkbox.disabled = !(await serverReady());
      }
    });
  }

  if (!ANDROID_NATIVE) {
    disableControl('Push hanya tersedia di APK Android.');
    return;
  }
  if (!FCM_ANDROID_CONFIGURED || !FCM_PROJECT_ID) {
    disableControl('Konfigurasi Firebase Android belum ada pada build ini; push tetap nonaktif.');
    return;
  }
  await ensureListeners();
  const preference = await savedPreference();
  if (checkbox) checkbox.checked = preference;
  status('Push menunggu login dan verifikasi fingerprint pasangan.');
}

export async function setPushContext(nextContext) {
  if (!nextContext || nextContext.verified !== true || !nextContext.userId || !nextContext.pairId) {
    currentContext = null;
    backendReady = false;
    disableControl('Masuk dan verifikasi fingerprint pasangan untuk mengatur push.');
    return;
  }
  currentContext = { userId: nextContext.userId, pairId: nextContext.pairId, verified: true };

  if (!ANDROID_NATIVE) { disableControl('Push hanya tersedia di APK Android.'); return; }
  if (!FCM_ANDROID_CONFIGURED || !FCM_PROJECT_ID) {
    disableControl('Konfigurasi Firebase Android belum ada pada build ini; push tetap nonaktif.');
    return;
  }

  const checkbox = control();
  if (checkbox) checkbox.disabled = true;
  status('Memeriksa konfigurasi push yang aman…');
  if (!(await serverReady())) {
    disableControl('Push belum aktif: kredensial server belum tersedia atau project Firebase tidak cocok.');
    return;
  }

  const enabled = await savedPreference();
  if (checkbox) { checkbox.checked = enabled; checkbox.disabled = false; }
  status(enabled
    ? 'Memulihkan pendaftaran push untuk perangkat ini…'
    : 'Push siap. Aktifkan bila ingin menerima pemberitahuan generik.');
  if (enabled) {
    try { await registerDevice(false); }
    catch { status('Pendaftaran push belum pulih. Matikan lalu aktifkan kembali untuk mencoba.'); }
  }
}

export async function notifyPartnerForMessage(messageId) {
  if (!messageId || !currentContext?.verified || !FCM_ANDROID_CONFIGURED ||
      !FCM_PROJECT_ID || !ANDROID_NATIVE || !supabase) return;
  if (!(await serverReady())) return;
  await supabase.functions.invoke('send-chat-push', {
    body: { message_id: messageId, firebase_project_id: FCM_PROJECT_ID },
  }).catch(() => {});
}

export async function disablePushBeforeSignOut() {
  const snapshot = currentContext ? { ...currentContext } : null;
  if (snapshot && supabase) {
    const { error } = await supabase.from('device_push_tokens')
      .delete().eq('user_id', snapshot.userId);
    if (error) throw new Error('push_token_not_revoked');
  }
  await setSavedPreference(false).catch(() => {});
  if (FCM_ANDROID_CONFIGURED && ANDROID_NATIVE) {
    try { await PushNotifications.unregister(); } catch { /* no server token remains */ }
  }
  const checkbox = control();
  if (checkbox) { checkbox.checked = false; checkbox.disabled = true; }
  currentContext = null;
  backendReady = false;
  status('Notifikasi push nonaktif setelah keluar akun.');
}
