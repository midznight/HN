import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export const OurSpaceKeyStore = registerPlugin('OurSpaceKeyStore');

const STORAGE_PREFIX = 'os.secure.session.v1.';
const memoryStorage = new Map();

export function requireAndroidE2EE() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new Error('Chat E2EE hanya tersedia di APK Android resmi.');
  }
}

export async function ensureDeviceIdentityKey() {
  requireAndroidE2EE();
  return OurSpaceKeyStore.createIdentityKey();
}

export async function readDeviceIdentityKey() {
  requireAndroidE2EE();
  return OurSpaceKeyStore.getIdentityKey();
}

/**
 * Supabase auth tokens are sealed with an AES-256-GCM key held by Android Keystore.
 * Preferences stores only {nonce,ciphertext}; it never stores the raw session JSON.
 * A non-Android preview uses memory only and therefore does not persist a session.
 */
export const keystoreSessionStorage = {
  async getItem(key) {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return memoryStorage.get(key) ?? null;
    }
    const storageKey = STORAGE_PREFIX + key;
    const { value } = await Preferences.get({ key: storageKey });
    if (!value) return null;
    try {
      const envelope = JSON.parse(value);
      const opened = await OurSpaceKeyStore.openSessionValue(envelope);
      return opened.value;
    } catch {
      // Android backup/restore or a reset Keystore can leave an unusable sealed session.
      // Discard only the invalid session blob; never discard E2EE identity keys automatically.
      await Preferences.remove({ key: storageKey });
      return null;
    }
  },

  async setItem(key, value) {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      memoryStorage.set(key, value);
      return;
    }
    const sealed = await OurSpaceKeyStore.sealSessionValue({ value });
    await Preferences.set({
      key: STORAGE_PREFIX + key,
      value: JSON.stringify({ nonce: sealed.nonce, ciphertext: sealed.ciphertext }),
    });
  },

  async removeItem(key) {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      memoryStorage.delete(key);
      return;
    }
    await Preferences.remove({ key: STORAGE_PREFIX + key });
  },
};
