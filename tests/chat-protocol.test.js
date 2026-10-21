import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXT_MESSAGE_MAX_CHARS,
  MAX_MEDIA_BYTES,
  createMessageId,
  isSupportedMediaMimeType,
  normalizeTextMessage,
  validateCiphertextMessage,
  validateMediaMetadata,
} from '../src/chat-protocol.js';

const uuidA = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
const uuidB = 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0';

function row(overrides = {}) {
  return {
    id: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
    pair_id: uuidA,
    sender_id: uuidA,
    recipient_id: uuidB,
    ciphertext: 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=', // syntactically valid test data; not a real message
    nonce: 'MDEyMzQ1Njc4OWFi',
    key_version: 1,
    message_type: 'text',
    created_at: '2026-10-21T00:00:00.000Z',
    ...overrides,
  };
}

test('accepts non-empty text and enforces the character limit', () => {
  assert.equal(normalizeTextMessage('  halo  '), '  halo  ');
  assert.throws(() => normalizeTextMessage('  '), /kosong/);
  assert.throws(() => normalizeTextMessage('a'.repeat(TEXT_MESSAGE_MAX_CHARS + 1)), /maksimal/);
});

test('generates UUIDv4 message IDs', () => {
  assert.match(createMessageId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('accepts a structurally valid ciphertext envelope', () => {
  assert.equal(validateCiphertextMessage(row()).id, row().id);
});

test('rejects unknown message types or key versions', () => {
  assert.throws(() => validateCiphertextMessage(row({ message_type: 'image' })), /Versi atau tipe/);
  assert.throws(() => validateCiphertextMessage(row({ key_version: 2 })), /Versi atau tipe/);
});

test('rejects mismatched actors and malformed nonce/ciphertext', () => {
  assert.throws(() => validateCiphertextMessage(row({ recipient_id: uuidA })), /tidak boleh sama/);
  assert.throws(() => validateCiphertextMessage(row({ nonce: 'short' })), /Nonce/);
  assert.throws(() => validateCiphertextMessage(row({ ciphertext: 'not base64 !!!' })), /Ciphertext/);
});

test('accepts the generic media message envelope without accepting arbitrary message types', () => {
  assert.equal(validateCiphertextMessage(row({ message_type: 'media' })).message_type, 'media');
  assert.throws(() => validateCiphertextMessage(row({ message_type: 'video' })), /Versi atau tipe/);
});

test('validates encrypted media metadata against the message identity and strict size/type limits', () => {
  const mediaRow = row({ message_type: 'media' });
  const metadata = {
    mediaVersion: 1,
    objectPath: mediaRow.pair_id + '/' + mediaRow.sender_id + '/' + mediaRow.id + '.bin',
    filename: 'foto.png',
    mimeType: 'image/png',
    size: 2048,
    nonce: 'MDEyMzQ1Njc4OWFi',
  };
  assert.equal(validateMediaMetadata(metadata, mediaRow).filename, 'foto.png');
  assert.equal(MAX_MEDIA_BYTES, 3 * 1024 * 1024);
  assert.equal(isSupportedMediaMimeType('image/png'), true);
  assert.equal(isSupportedMediaMimeType('audio/webm'), true);
  assert.equal(isSupportedMediaMimeType('image/svg+xml'), false);
  assert.throws(() => validateMediaMetadata({ ...metadata, objectPath: 'other/path' }, mediaRow), /Lokasi/);
  assert.throws(() => validateMediaMetadata({ ...metadata, filename: '../private.png' }, mediaRow), /Nama lampiran/);
  assert.throws(() => validateMediaMetadata({ ...metadata, mimeType: 'image/svg+xml' }, mediaRow), /Jenis lampiran/);
  assert.throws(() => validateMediaMetadata({ ...metadata, size: MAX_MEDIA_BYTES + 1 }, mediaRow), /Ukuran lampiran/);
  assert.throws(() => validateMediaMetadata({ ...metadata, nonce: 'bad' }, mediaRow), /Nonce/);
});
