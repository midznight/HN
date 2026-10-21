export const TEXT_MESSAGE_MAX_CHARS = 4000;
export const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/3gpp',
  'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/webm',
  'audio/wav', 'audio/x-wav', 'audio/3gpp', 'audio/amr',
]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function normalizeTextMessage(value) {
  if (typeof value !== 'string') throw new TypeError('Pesan harus berupa teks.');
  if (!value.trim()) throw new Error('Pesan tidak boleh kosong.');
  if (value.length > TEXT_MESSAGE_MAX_CHARS) {
    throw new Error('Pesan maksimal ' + TEXT_MESSAGE_MAX_CHARS + ' karakter.');
  }
  return value;
}

export function createMessageId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Generator acak aman tidak tersedia pada perangkat ini.');
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export function validateCiphertextMessage(row) {
  if (!row || typeof row !== 'object') throw new TypeError('Format pesan tidak valid.');
  for (const key of ['id', 'pair_id', 'sender_id', 'recipient_id']) {
    if (typeof row[key] !== 'string' || !UUID_V4.test(row[key])) {
      throw new Error('Metadata ID pesan tidak valid.');
    }
  }
  if (row.sender_id === row.recipient_id) throw new Error('Pengirim dan penerima tidak boleh sama.');
  if (!['text', 'media'].includes(row.message_type) || row.key_version !== 1) {
    throw new Error('Versi atau tipe pesan belum didukung.');
  }
  if (typeof row.nonce !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(row.nonce)) {
    throw new Error('Nonce pesan tidak valid.');
  }
  if (typeof row.ciphertext !== 'string' || row.ciphertext.length < 22 ||
      row.ciphertext.length > 22000 || !BASE64.test(row.ciphertext)) {
    throw new Error('Ciphertext pesan tidak valid.');
  }
  if (typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) {
    throw new Error('Waktu pesan tidak valid.');
  }
  return row;
}

export function validateMediaMetadata(value, row) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Metadata lampiran tidak valid.');
  }
  if (value.mediaVersion !== 1 || typeof value.objectPath !== 'string' ||
      value.objectPath !== row.pair_id + '/' + row.sender_id + '/' + row.id + '.bin') {
    throw new Error('Lokasi lampiran tidak valid.');
  }
  if (typeof value.filename !== 'string' || !value.filename.trim() ||
      value.filename.length > 255 ||
      Array.from(value.filename).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 || character === '/' || character === String.fromCharCode(92);
      })) {
    throw new Error('Nama lampiran tidak valid.');
  }
  if (typeof value.mimeType !== 'string' || !ALLOWED_MEDIA_TYPES.has(value.mimeType)) {
    throw new Error('Jenis lampiran tidak didukung.');
  }
  if (typeof value.nonce !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(value.nonce)) {
    throw new Error('Nonce lampiran tidak valid.');
  }
  if (!Number.isSafeInteger(value.size) || value.size < 1 || value.size > MAX_MEDIA_BYTES) {
    throw new Error('Ukuran lampiran tidak valid.');
  }
  return value;
}

export function isSupportedMediaMimeType(mimeType) {
  return typeof mimeType === 'string' && ALLOWED_MEDIA_TYPES.has(mimeType.trim().toLowerCase());
}
