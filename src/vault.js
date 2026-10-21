import { supabase } from './supabase.js';
import { OurSpaceKeyStore as KeyStore } from './secure-keys.js';
import { createMessageId, isSupportedMediaMimeType, MAX_MEDIA_BYTES } from './chat-protocol.js';
import { getPrivateChatContext } from './chat.js';

const BUCKET = 'our-space-encrypted-media';
const $ = (id) => document.getElementById(id);

let initialized = false;
let busy = false;
let pendingFile = null;
let pendingPreviewUrl = null;
let viewerUrl = null;
let channel = null;
let channelPairId = null;
let itemsById = new Map();

function currentContext(expected) {
  const current = getPrivateChatContext();
  if (!current || !current.partnerVerified) return null;
  if (!expected) return current;
  return current.userId === expected.userId &&
    current.pairId === expected.pairId &&
    current.partnerId === expected.partnerId &&
    current.keyVersion === expected.keyVersion &&
    current.partnerPublicKey === expected.partnerPublicKey
    ? current : null;
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function safeFilename(value) {
  const cleaned = String(value || 'lampiran')
    .replace(/[\/\\]/g, '_')
    .trim()
    .slice(0, 120);
  const safe = Array.from(cleaned).filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('');
  return safe || 'lampiran';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MiB';
}

function sayStatus(message, isError = false) {
  const node = $('vault-status');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('text-red-700', isError);
  node.classList.toggle('text-[#76656a]', !isError);
  node.classList.remove('hidden');
}

function clearStatus() {
  const node = $('vault-status');
  if (node) {
    node.textContent = '';
    node.classList.add('hidden');
    node.classList.remove('text-red-700');
    node.classList.add('text-[#76656a]');
  }
}

function validateMetadata(value, row) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.vaultVersion !== 1) {
    throw new Error('Metadata Brankas tidak valid.');
  }
  const expectedPath = row.pair_id + '/' + row.sender_id + '/' + row.id + '.bin';
  if (value.objectPath !== expectedPath) throw new Error('Lokasi file Brankas tidak valid.');
  if (typeof value.filename !== 'string' || !value.filename.trim() || value.filename.length > 120 ||
      Array.from(value.filename).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 || character === '/' || character === String.fromCharCode(92);
      })) {
    throw new Error('Nama file Brankas tidak valid.');
  }
  if (!isSupportedMediaMimeType(value.mimeType)) throw new Error('Format file Brankas tidak didukung.');
  if (!Number.isSafeInteger(value.size) || value.size < 1 || value.size > MAX_MEDIA_BYTES) {
    throw new Error('Ukuran file Brankas tidak valid.');
  }
  if (typeof value.nonce !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(value.nonce)) {
    throw new Error('Nonce file Brankas tidak valid.');
  }
  return value;
}

async function decryptMetadata(row, context) {
  const opened = await KeyStore.decryptMessage({
    peerPublicKey: context.partnerPublicKey,
    pairId: row.pair_id,
    messageId: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    keyVersion: row.key_version,
    messageType: 'media',
    nonce: row.nonce,
    ciphertext: row.ciphertext,
  });
  if (!currentContext(context)) return null;
  return validateMetadata(JSON.parse(opened.plaintext), row);
}

function releasePreview() {
  const frame = $('vault-preview-frame');
  if (frame) {
    frame.querySelectorAll('video,audio').forEach((media) => {
      try { media.pause(); media.removeAttribute('src'); media.load(); } catch { /* best effort */ }
    });
    frame.replaceChildren();
  }
  if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
  pendingPreviewUrl = null;
  pendingFile = null;
  const modal = $('vault-preview-modal');
  modal?.classList.add('hidden');
  modal?.setAttribute('aria-hidden', 'true');
  const send = $('vault-preview-send');
  if (send) { send.disabled = false; send.textContent = 'Simpan ke Brankas'; }
  const name = $('vault-preview-name');
  const meta = $('vault-preview-meta');
  if (name) name.textContent = '';
  if (meta) meta.textContent = '';
}

function openPreview(file) {
  if (!file || !currentContext()) {
    sayStatus('Masuk ke akun dan verifikasi fingerprint pasangan terlebih dahulu.', true);
    return;
  }
  if (!isSupportedMediaMimeType(file.type)) {
    sayStatus('Format file tidak didukung. Pilih gambar, video, atau audio yang didukung.', true);
    return;
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_MEDIA_BYTES) {
    sayStatus('Ukuran file harus lebih dari 0 dan maksimal 3 MiB.', true);
    return;
  }
  releasePreview();
  pendingFile = file;
  pendingPreviewUrl = URL.createObjectURL(file);
  const frame = $('vault-preview-frame');
  const name = $('vault-preview-name');
  const meta = $('vault-preview-meta');
  const modal = $('vault-preview-modal');
  if (!frame || !name || !meta || !modal) {
    releasePreview();
    sayStatus('Pratinjau tidak tersedia. File tidak disimpan.', true);
    return;
  }
  let media;
  if (file.type.startsWith('image/')) {
    media = document.createElement('img');
    media.alt = 'Pratinjau file yang akan disimpan ke Brankas';
  } else if (file.type.startsWith('video/')) {
    media = document.createElement('video');
    media.controls = true;
    media.playsInline = true;
    media.preload = 'metadata';
  } else {
    media = document.createElement('audio');
    media.controls = true;
    media.preload = 'metadata';
  }
  media.src = pendingPreviewUrl;
  frame.replaceChildren(media);
  name.textContent = safeFilename(file.name);
  meta.textContent = file.type + ' · ' + formatSize(file.size);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  $('vault-preview-send')?.focus();
}

async function uploadVaultFile(file, expectedContext) {
  if (busy) return;
  const context = currentContext(expectedContext);
  if (!context) {
    sayStatus('Sesi terkunci atau fingerprint belum diverifikasi. File tidak diunggah.', true);
    return;
  }

  let objectPath = '';
  let objectUploaded = false;
  let rowInserted = false;
  let mediaBase64 = null;
  let inputBytes = null;
  let encryptedBytes = null;
  busy = true;
  const send = $('vault-preview-send');
  if (send) { send.disabled = true; send.textContent = 'Mengenkripsi…'; }
  sayStatus('Mengenkripsi file di perangkat…');

  try {
    const fileBuffer = await file.arrayBuffer();
    if (!currentContext(context)) {
      new Uint8Array(fileBuffer).fill(0);
      return;
    }
    inputBytes = new Uint8Array(fileBuffer);
    mediaBase64 = bytesToBase64(inputBytes);
    inputBytes.fill(0);
    inputBytes = null;

    const itemId = createMessageId();
    objectPath = context.pairId + '/' + context.userId + '/' + itemId + '.bin';
    const mimeType = file.type.trim().toLowerCase();
    const filename = safeFilename(file.name);

    const encryptedFile = await KeyStore.encryptMedia({
      peerPublicKey: context.partnerPublicKey,
      pairId: context.pairId,
      messageId: itemId,
      senderId: context.userId,
      recipientId: context.partnerId,
      keyVersion: context.keyVersion,
      filename,
      mimeType,
      mediaBase64,
    });
    mediaBase64 = null;
    if (!currentContext(context)) return;

    sayStatus('Mengunggah ciphertext ke Brankas privat…');
    encryptedBytes = base64ToBytes(encryptedFile.ciphertext);
    const encryptedBlob = new Blob([encryptedBytes], { type: 'application/octet-stream' });
    encryptedBytes.fill(0);
    encryptedBytes = null;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, encryptedBlob, {
      contentType: 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) throw uploadError;
    objectUploaded = true;
    if (!currentContext(context)) return;

    sayStatus('Menyegel metadata file…');
    const metadata = {
      vaultVersion: 1,
      objectPath,
      filename,
      mimeType,
      size: file.size,
      nonce: encryptedFile.nonce,
    };
    const encryptedMetadata = await KeyStore.encryptMessage({
      peerPublicKey: context.partnerPublicKey,
      pairId: context.pairId,
      messageId: itemId,
      senderId: context.userId,
      recipientId: context.partnerId,
      keyVersion: context.keyVersion,
      messageType: 'media',
      plaintext: JSON.stringify(metadata),
    });
    if (!currentContext(context)) return;

    const { error: insertError } = await supabase.from('vault_items').insert({
      id: itemId,
      pair_id: context.pairId,
      sender_id: context.userId,
      recipient_id: context.partnerId,
      ciphertext: encryptedMetadata.ciphertext,
      nonce: encryptedMetadata.nonce,
      key_version: context.keyVersion,
    });
    if (insertError) throw insertError;
    rowInserted = true;
    objectUploaded = false;
    if (!currentContext(context)) return;
    sayStatus('File berhasil disimpan di Brankas terenkripsi.');
    await refreshVault();
  } catch (error) {
    if (currentContext(context)) {
      const message = typeof error?.message === 'string' && !/token|jwt|authorization|secret/i.test(error.message)
        ? error.message : 'File tidak berhasil disimpan. Periksa koneksi lalu coba lagi.';
      sayStatus(message, true);
    }
  } finally {
    mediaBase64 = null;
    if (inputBytes) inputBytes.fill(0);
    if (encryptedBytes) encryptedBytes.fill(0);
    if (objectUploaded && !rowInserted && objectPath) {
      // An orphan can only contain ciphertext; attempt server-side cleanup.
      try { await supabase.storage.from(BUCKET).remove([objectPath]); } catch { /* no plaintext was uploaded */ }
    }
    busy = false;
    if (send) { send.disabled = false; send.textContent = 'Simpan ke Brankas'; }
    if (!pendingFile) $('vault-file-input') && ($('vault-file-input').value = '');
  }
}

function clearViewer() {
  const frame = $('vault-viewer-frame');
  if (frame) {
    frame.querySelectorAll('video,audio').forEach((media) => {
      try { media.pause(); media.removeAttribute('src'); media.load(); } catch { /* best effort */ }
    });
    frame.replaceChildren();
  }
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = null;
  $('vault-viewer-modal')?.classList.add('hidden');
  $('vault-viewer-modal')?.setAttribute('aria-hidden', 'true');
}

async function openVaultItem(row, metadata) {
  const context = currentContext();
  if (!context || context.pairId !== row.pair_id) {
    sayStatus('Brankas terkunci. Buka kembali setelah verifikasi.', true);
    return;
  }
  let cipherBytes = null;
  let cipherBase64 = null;
  try {
    sayStatus('Membuka file terenkripsi di perangkat…');
    const result = await supabase.storage.from(BUCKET).download(metadata.objectPath);
    if (!currentContext(context)) return;
    if (result.error || !result.data) throw result.error || new Error('File terenkripsi tidak ditemukan.');
    if (result.data.size > MAX_MEDIA_BYTES + 1024) throw new Error('Ukuran ciphertext file tidak valid.');

    const buffer = await result.data.arrayBuffer();
    if (!currentContext(context)) {
      new Uint8Array(buffer).fill(0);
      return;
    }
    cipherBytes = new Uint8Array(buffer);
    cipherBase64 = bytesToBase64(cipherBytes);
    cipherBytes.fill(0);
    cipherBytes = null;

    const opened = await KeyStore.decryptMedia({
      peerPublicKey: context.partnerPublicKey,
      pairId: row.pair_id,
      messageId: row.id,
      senderId: row.sender_id,
      recipientId: row.recipient_id,
      keyVersion: row.key_version,
      nonce: metadata.nonce,
      ciphertext: cipherBase64,
    });
    cipherBase64 = null;
    if (!currentContext(context)) return;
    if (opened.filename !== metadata.filename || opened.mimeType !== metadata.mimeType ||
        opened.size !== metadata.size) {
      throw new Error('Isi file tidak cocok dengan metadata terenkripsi.');
    }

    const plainBytes = base64ToBytes(opened.mediaBase64);
    const blob = new Blob([plainBytes], { type: metadata.mimeType });
    plainBytes.fill(0);
    clearViewer();
    viewerUrl = URL.createObjectURL(blob);
    const frame = $('vault-viewer-frame');
    const title = $('vault-viewer-title');
    const modal = $('vault-viewer-modal');
    if (!frame || !title || !modal) return;
    let media;
    if (metadata.mimeType.startsWith('image/')) {
      media = document.createElement('img');
      media.alt = metadata.filename;
    } else if (metadata.mimeType.startsWith('video/')) {
      media = document.createElement('video');
      media.controls = true;
      media.playsInline = true;
    } else {
      media = document.createElement('audio');
      media.controls = true;
    }
    media.src = viewerUrl;
    frame.replaceChildren(media);
    title.textContent = metadata.filename;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    $('vault-viewer-close')?.focus();
    clearStatus();
  } catch (error) {
    cipherBase64 = null;
    if (currentContext(context)) {
      sayStatus(typeof error?.message === 'string' ? error.message : 'File tidak dapat dibuka dengan kunci saat ini.', true);
    }
  } finally {
    if (cipherBytes) cipherBytes.fill(0);
    cipherBase64 = null;
  }
}

function renderItems(items, context) {
  const list = $('vault-items');
  const empty = $('vault-empty');
  if (!list || !empty || !currentContext(context)) return;
  list.replaceChildren();
  itemsById = new Map();
  if (!items.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  for (const item of items) {
    itemsById.set(item.row.id, item);
    const card = document.createElement('article');
    card.className = 'rounded-2xl border border-[#eedbd8] bg-[#fffdfb] p-4 flex gap-3 items-start shadow-sm';
    const marker = document.createElement('div');
    marker.className = 'w-11 h-11 rounded-2xl bg-[#fcece8] text-[#9e3e54] flex items-center justify-center shrink-0';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', item.metadata.mimeType.startsWith('image/') ? 'image' :
      item.metadata.mimeType.startsWith('video/') ? 'video' : 'audio-lines');
    icon.className = 'w-5 h-5';
    marker.appendChild(icon);

    const detail = document.createElement('div');
    detail.className = 'min-w-0 flex-1';
    const name = document.createElement('p');
    name.className = 'text-sm font-semibold text-[#34292b] break-words';
    name.textContent = item.metadata.filename;
    const meta = document.createElement('p');
    meta.className = 'text-xs text-[#76656a] mt-1';
    const date = new Date(item.row.created_at);
    const dateText = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date) : '';
    meta.textContent = item.metadata.mimeType + ' · ' + formatSize(item.metadata.size) + (dateText ? ' · ' + dateText : '');
    const actions = document.createElement('div');
    actions.className = 'flex gap-2 mt-3 flex-wrap';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'min-h-12 px-4 py-2 rounded-xl bg-[#c65e70] text-white text-sm font-semibold';
    open.textContent = 'Buka';
    open.addEventListener('click', () => openVaultItem(item.row, item.metadata));
    actions.appendChild(open);
    if (item.row.sender_id === context.userId) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'min-h-12 px-4 py-2 rounded-xl border border-[#e8cdd0] text-[#9e3e54] text-sm font-medium';
      remove.textContent = 'Hapus';
      remove.addEventListener('click', () => removeVaultItem(item.row, item.metadata, context));
      actions.appendChild(remove);
    }
    detail.append(name, meta, actions);
    card.append(marker, detail);
    list.appendChild(card);
  }
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

async function refreshVault() {
  const context = currentContext();
  if (!context) {
    itemsById = new Map();
    $('vault-items')?.replaceChildren();
    $('vault-empty')?.classList.add('hidden');
    sayStatus('Buka Obrolan, masuk ke akun privat, dan verifikasi fingerprint pasangan untuk mengakses Brankas.', true);
    return;
  }
  if (busy) return;
  clearStatus();
  sayStatus('Memuat Brankas terenkripsi…');
  const list = $('vault-items');
  list?.replaceChildren();
  $('vault-empty')?.classList.add('hidden');
  try {
    const { data, error } = await supabase.from('vault_items')
      .select('id,pair_id,sender_id,recipient_id,ciphertext,nonce,key_version,created_at')
      .eq('pair_id', context.pairId)
      .order('created_at', { ascending: false });
    if (!currentContext(context)) return;
    if (error) throw error;
    const items = [];
    let unreadable = 0;
    for (const row of (data || [])) {
      if (!currentContext(context)) return;
      try {
        const metadata = await decryptMetadata(row, context);
        if (!metadata || !currentContext(context)) return;
        items.push({ row, metadata });
      } catch {
        unreadable++;
      }
    }
    if (!currentContext(context)) return;
    renderItems(items, context);
    if (unreadable) sayStatus('Sebagian item tidak dapat dibuka. Item tersebut tidak ditampilkan karena metadata tidak lolos verifikasi.', true);
    else if (items.length) sayStatus(items.length + ' file tersimpan · metadata didekripsi hanya di perangkat ini.');
    else clearStatus();
  } catch (error) {
    if (currentContext(context)) sayStatus('Brankas belum dapat dimuat. Periksa koneksi lalu coba lagi.', true);
  }
}

async function removeVaultItem(row, metadata, expectedContext) {
  const context = currentContext(expectedContext);
  if (!context || row.sender_id !== context.userId || busy) return;
  if (!window.confirm('Hapus file ini dari Brankas? Penghapusan tidak dapat dibatalkan.')) return;
  busy = true;
  try {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([metadata.objectPath]);
    if (removeError) throw removeError;
    if (!currentContext(context)) return;
    const { error: deleteError } = await supabase.from('vault_items').delete()
      .eq('id', row.id).eq('pair_id', context.pairId).eq('sender_id', context.userId);
    if (deleteError) throw deleteError;
    if (!currentContext(context)) return;
    sayStatus('File dihapus dari Brankas.');
  } catch {
    if (currentContext(context)) sayStatus('File belum berhasil dihapus. Periksa koneksi lalu perbarui Brankas.', true);
  } finally {
    busy = false;
    if (currentContext(context)) await refreshVault();
  }
}

function attachRealtime(context) {
  if (channel && channelPairId === context.pairId) return;
  if (channel) supabase.removeChannel(channel).catch(() => {});
  channelPairId = context.pairId;
  channel = supabase.channel('our-space-vault-' + context.pairId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'vault_items',
      filter: 'pair_id=eq.' + context.pairId,
    }, () => {
      if (currentContext(context) && $('view-storage')?.classList.contains('active') && !busy) {
        refreshVault();
      }
    })
    .subscribe();
}

function closeVaultPreview() {
  releasePreview();
  $('vault-file-input') && ($('vault-file-input').value = '');
}

function initControls() {
  if ($('vault-add-button')) {
    $('vault-add-button').addEventListener('click', () => {
      if (!currentContext()) {
        sayStatus('Buka Obrolan, masuk ke akun privat, dan verifikasi fingerprint pasangan terlebih dahulu.', true);
        return;
      }
      $('vault-file-input')?.click();
    });
  }
  $('vault-file-input')?.addEventListener('change', (event) => {
    const file = event.currentTarget?.files?.[0] || null;
    if (event.currentTarget) event.currentTarget.value = '';
    if (file) openPreview(file);
  });
  $('vault-preview-cancel')?.addEventListener('click', closeVaultPreview);
  $('vault-preview-modal')?.addEventListener('click', (event) => {
    if (event.target === $('vault-preview-modal')) closeVaultPreview();
  });
  $('vault-preview-send')?.addEventListener('click', async () => {
    const file = pendingFile;
    const context = currentContext();
    if (!file || !context || busy) {
      closeVaultPreview();
      return;
    }
    closeVaultPreview();
    await uploadVaultFile(file, context);
  });
  $('vault-viewer-close')?.addEventListener('click', clearViewer);
  $('vault-viewer-modal')?.addEventListener('click', (event) => {
    if (event.target === $('vault-viewer-modal')) clearViewer();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('vault-preview-modal')?.classList.contains('hidden')) closeVaultPreview();
    else if (!$('vault-viewer-modal')?.classList.contains('hidden')) clearViewer();
  });
}

export function initVault() {
  if (initialized) return;
  initialized = true;
  initControls();
  window.ourSpaceVault = {
    onViewOpened: async () => {
      const context = currentContext();
      if (context) attachRealtime(context);
      await refreshVault();
    },
    onLocked: () => {
      closeVaultPreview();
      clearViewer();
      itemsById = new Map();
      $('vault-items')?.replaceChildren();
      $('vault-empty')?.classList.add('hidden');
      clearStatus();
      if (channel) supabase.removeChannel(channel).catch(() => {});
      channel = null;
      channelPairId = null;
    },
  };
}

