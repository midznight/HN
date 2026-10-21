import { createMessageId } from './chat-protocol.js';
import { supabase } from './supabase.js';
import { OurSpaceKeyStore as KeyStore } from './secure-keys.js';
import { getPrivateChatContext } from './chat.js';

const $ = (id) => document.getElementById(id);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REACTION_EMOJIS = ['❤️', '😂', '🥰', '😮', '😢', '👍', '🙏'];
const MAX_ANNOTATIONS = 500;

let initialized = false;
let channel = null;
let channelPairId = null;
let contextSnapshot = null;
let knownMessages = new Map();
let seenAnnotationIds = new Set();
let latestReactions = new Map();
let repliesByMessageId = new Map();
let pendingReply = null;
let refreshing = false;
let refreshQueued = false;

function getContext() {
  const context = getPrivateChatContext();
  return context?.partnerVerified ? context : null;
}

function sameContext(expected) {
  const current = getContext();
  return Boolean(current && expected &&
    current.userId === expected.userId &&
    current.pairId === expected.pairId &&
    current.partnerId === expected.partnerId &&
    current.keyVersion === expected.keyVersion &&
    current.partnerPublicKey === expected.partnerPublicKey);
}

function isValidAnnotationRow(row, context) {
  return Boolean(row && context &&
    UUID_V4.test(row.id || '') &&
    row.pair_id === context.pairId &&
    UUID_V4.test(row.sender_id || '') &&
    UUID_V4.test(row.recipient_id || '') &&
    row.sender_id !== row.recipient_id &&
    [context.userId, context.partnerId].includes(row.sender_id) &&
    [context.userId, context.partnerId].includes(row.recipient_id) &&
    row.key_version === context.keyVersion &&
    typeof row.ciphertext === 'string' &&
    row.ciphertext.length >= 22 && row.ciphertext.length <= 22000 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(row.ciphertext) &&
    typeof row.nonce === 'string' &&
    /^[A-Za-z0-9+/]{16}$/.test(row.nonce) &&
    typeof row.created_at === 'string' &&
    Number.isFinite(Date.parse(row.created_at)));
}

function reactionKey(targetMessageId, senderId, emoji) {
  return targetMessageId + ':' + senderId + ':' + emoji;
}

function safePreview(value, maximum = 105) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maximum ? normalized.slice(0, maximum - 1) + '…' : normalized;
}

function senderLabel(senderId, context = getContext()) {
  if (!context) return 'Pasangan';
  return senderId === context.userId ? 'Kamu' : 'Pasangan';
}

function applyDecryptedAnnotation(row, value) {
  const createdAt = Date.parse(row.created_at);
  if (!Number.isFinite(createdAt) || !value || value.version !== 1) return;
  if (value.kind === 'reaction') {
    if (!UUID_V4.test(value.targetMessageId || '') ||
        !REACTION_EMOJIS.includes(value.emoji) ||
        typeof value.active !== 'boolean') return;
    const key = reactionKey(value.targetMessageId, row.sender_id, value.emoji);
    const previous = latestReactions.get(key);
    if (!previous || createdAt >= previous.createdAt) {
      latestReactions.set(key, {
        targetMessageId: value.targetMessageId,
        senderId: row.sender_id,
        emoji: value.emoji,
        active: value.active,
        createdAt,
      });
    }
    renderOneTarget(value.targetMessageId);
    return;
  }

  if (value.kind === 'reply') {
    if (!UUID_V4.test(value.replyMessageId || '') ||
        !UUID_V4.test(value.targetMessageId || '') ||
        value.replyMessageId === value.targetMessageId) return;
    const previous = repliesByMessageId.get(value.replyMessageId);
    if (!previous || createdAt >= previous.createdAt) {
      repliesByMessageId.set(value.replyMessageId, {
        replyMessageId: value.replyMessageId,
        targetMessageId: value.targetMessageId,
        senderId: row.sender_id,
        createdAt,
      });
    }
    renderOneTarget(value.replyMessageId);
  }
}

async function decryptAnnotationRow(row, expectedContext) {
  if (!isValidAnnotationRow(row, expectedContext) || !sameContext(expectedContext)) return null;
  const opened = await KeyStore.decryptMessage({
    peerPublicKey: expectedContext.partnerPublicKey,
    pairId: row.pair_id,
    messageId: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    keyVersion: row.key_version,
    messageType: 'text',
    nonce: row.nonce,
    ciphertext: row.ciphertext,
  });
  if (!sameContext(expectedContext)) return null;
  let value;
  try { value = JSON.parse(opened.plaintext); } catch { return null; }
  if (!value || value.version !== 1) return null;
  if (value.kind === 'reaction') {
    if (!UUID_V4.test(value.targetMessageId || '') ||
        !REACTION_EMOJIS.includes(value.emoji) || typeof value.active !== 'boolean') return null;
  } else if (value.kind === 'reply') {
    if (!UUID_V4.test(value.targetMessageId || '') ||
        !UUID_V4.test(value.replyMessageId || '') ||
        value.targetMessageId === value.replyMessageId) return null;
  } else {
    return null;
  }
  return value;
}

function renderReplyBanner() {
  const banner = $('chat-reply-banner');
  const label = $('chat-reply-author');
  const excerpt = $('chat-reply-excerpt');
  if (!banner || !label || !excerpt) return;
  if (!pendingReply) {
    banner.classList.add('hidden');
    label.textContent = '';
    excerpt.textContent = '';
    return;
  }
  const target = knownMessages.get(pendingReply.targetMessageId);
  banner.classList.remove('hidden');
  label.textContent = 'Membalas ' + senderLabel(pendingReply.targetSenderId);
  excerpt.textContent = target
    ? (target.kind === 'media' ? 'Lampiran terenkripsi' : safePreview(target.text, 135))
    : 'Pesan yang dipilih';
  $('chat-message-input')?.focus();
}

function setPendingReply(targetMessageId) {
  const target = knownMessages.get(targetMessageId);
  const context = getContext();
  if (!target || !context || !sameContext(context)) return;
  pendingReply = {
    targetMessageId,
    targetSenderId: target.row.sender_id,
    pairId: context.pairId,
    userId: context.userId,
  };
  renderReplyBanner();
}

function clearPendingReply() {
  pendingReply = null;
  renderReplyBanner();
}

function currentReaction(targetMessageId, senderId, emoji) {
  const state = latestReactions.get(reactionKey(targetMessageId, senderId, emoji));
  return Boolean(state?.active);
}

function renderReactionSummary(record) {
  const bubble = record.line.firstElementChild;
  if (!bubble) return;
  let summary = bubble.querySelector('.message-reaction-summary');
  const active = [...latestReactions.values()].filter((state) =>
    state.targetMessageId === record.row.id && state.active);
  const grouped = new Map();
  for (const state of active) {
    const item = grouped.get(state.emoji) || { count: 0, self: false };
    item.count++;
    if (state.senderId === getContext()?.userId) item.self = true;
    grouped.set(state.emoji, item);
  }
  if (!grouped.size) {
    summary?.remove();
    return;
  }
  if (!summary) {
    summary = document.createElement('div');
    summary.className = 'message-reaction-summary flex flex-wrap gap-1.5 mt-2';
    bubble.appendChild(summary);
  }
  summary.replaceChildren();
  for (const [emoji, item] of grouped) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'min-h-12 min-w-12 px-2.5 rounded-full border text-sm inline-flex items-center justify-center gap-1 ' +
      (item.self ? 'bg-[#fce0e5] border-[#c65e70] text-[#793c4a]' : 'bg-white/70 border-[#eedbd8] text-[#34292b]');
    button.setAttribute('aria-label', 'Reaksi ' + emoji + ', ' + item.count + '. Ketuk untuk mengubah reaksi');
    button.textContent = emoji + ' ' + item.count;
    button.addEventListener('click', () => {
      const context = getContext();
      if (!context || !sameContext(context)) return;
      void sendReaction(record.row.id, emoji, !currentReaction(record.row.id, context.userId, emoji));
    });
    summary.appendChild(button);
  }
}

function renderReplyQuote(record) {
  const bubble = record.line.firstElementChild;
  if (!bubble) return;
  let quote = bubble.querySelector('.message-reply-quote');
  const link = repliesByMessageId.get(record.row.id);
  if (!link) {
    quote?.remove();
    return;
  }
  const target = knownMessages.get(link.targetMessageId);
  if (!quote) {
    quote = document.createElement('button');
    quote.type = 'button';
    quote.className = 'message-reply-quote block w-full text-left rounded-xl border-l-4 border-[#c65e70] bg-[#fcece8]/80 px-3 py-2 mb-2';
    quote.addEventListener('click', () => {
      const current = getContext();
      if (!current || !sameContext(current)) return;
      const targetRecord = knownMessages.get(link.targetMessageId);
      targetRecord?.line.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (targetRecord) {
        targetRecord.line.classList.add('message-target-flash');
        window.setTimeout(() => targetRecord.line.classList.remove('message-target-flash'), 1100);
      }
    });
    bubble.insertBefore(quote, bubble.firstChild);
  }
  quote.replaceChildren();
  const author = document.createElement('span');
  author.className = 'block text-[10px] font-semibold text-[#9e3e54] mb-0.5';
  author.textContent = 'Balasan untuk ' + (target ? senderLabel(target.row.sender_id) : 'pesan sebelumnya');
  const excerpt = document.createElement('span');
  excerpt.className = 'block text-xs text-[#765059] break-words';
  excerpt.textContent = target
    ? (target.kind === 'media' ? 'Lampiran terenkripsi' : safePreview(target.text, 135))
    : 'Isi pesan tidak dimuat atau tidak lagi tersedia.';
  quote.append(author, excerpt);
}

function makeToolButton(label, icon, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'message-annotation-action min-h-12 min-w-12 px-2.5 rounded-xl text-[11px] font-medium border border-[#eedbd8] bg-white/80 text-[#765059] hover:bg-[#fcece8]';
  button.setAttribute('aria-label', label);
  button.textContent = icon + ' ' + label;
  button.addEventListener('click', handler);
  return button;
}

function renderMessageTools(record) {
  const bubble = record.line.firstElementChild;
  if (!bubble) return;
  let tools = bubble.querySelector('.message-annotation-tools');
  let picker = bubble.querySelector('.message-emoji-picker');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'message-annotation-tools flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[#eedbd8]/60';
    const reply = makeToolButton('Balas', '↩', () => setPendingReply(record.row.id));
    const react = makeToolButton('Reaksi', '☺', () => {
      const currentlyOpen = picker && !picker.classList.contains('hidden');
      if (!picker) {
        picker = document.createElement('div');
        picker.className = 'message-emoji-picker flex flex-wrap gap-1.5 mt-2';
        picker.setAttribute('role', 'group');
        picker.setAttribute('aria-label', 'Pilih reaksi emoji');
        for (const emoji of REACTION_EMOJIS) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'min-h-12 min-w-12 rounded-full border border-[#eedbd8] bg-white hover:bg-[#fcece8] text-lg';
          button.setAttribute('aria-label', 'Beri reaksi ' + emoji);
          button.textContent = emoji;
          button.addEventListener('click', async () => {
            const context = getContext();
            if (!context || !sameContext(context)) return;
            await sendReaction(record.row.id, emoji, !currentReaction(record.row.id, context.userId, emoji));
            picker?.classList.add('hidden');
          });
          picker.appendChild(button);
        }
        bubble.appendChild(picker);
      }
      if (picker) picker.classList.toggle('hidden', currentlyOpen);
    });
    tools.append(reply, react);
    bubble.appendChild(tools);
    picker = bubble.querySelector('.message-emoji-picker');
  }
  renderReplyQuote(record);
  renderReactionSummary(record);
}

function renderOneTarget(messageId) {
  const record = knownMessages.get(messageId);
  if (!record || !record.line?.isConnected || !sameContext(contextSnapshot)) return;
  renderMessageTools(record);
}

function registerMessage(row, line, { text = '', kind = 'text' } = {}) {
  if (!row || !line || !UUID_V4.test(row.id || '')) return;
  knownMessages.set(row.id, { row, line, text: String(text || ''), kind });
  renderMessageTools(knownMessages.get(row.id));
  renderReplyBanner();
}

async function insertAnnotation(context, event) {
  if (!sameContext(context) || context.pairId !== event.pairId) return false;
  const annotationId = createMessageId();
  const plaintext = JSON.stringify(event.value);
  const encrypted = await KeyStore.encryptMessage({
    peerPublicKey: context.partnerPublicKey,
    pairId: context.pairId,
    messageId: annotationId,
    senderId: context.userId,
    recipientId: context.partnerId,
    keyVersion: context.keyVersion,
    messageType: 'text',
    plaintext,
  });
  if (!sameContext(context)) return false;
  const { data, error } = await supabase.from('message_annotations').insert({
    id: annotationId,
    pair_id: context.pairId,
    sender_id: context.userId,
    recipient_id: context.partnerId,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    key_version: context.keyVersion,
  }).select('id,pair_id,sender_id,recipient_id,ciphertext,nonce,key_version,created_at').single();
  if (error) throw error;
  if (!sameContext(context)) return false;
  if (data) await handleAnnotationRow(data, context);
  return sameContext(context);
}

async function sendReaction(targetMessageId, emoji, active) {
  const context = getContext();
  if (!context || !sameContext(context) || !knownMessages.has(targetMessageId) || !REACTION_EMOJIS.includes(emoji)) return false;
  try {
    return await insertAnnotation(context, {
      pairId: context.pairId,
      value: { version: 1, kind: 'reaction', targetMessageId, emoji, active: Boolean(active) },
    });
  } catch {
    if (sameContext(context)) announce('Reaksi belum tersinkron. Coba lagi saat koneksi pulih.', true);
    return false;
  }
}

async function handleAnnotationRow(row, expectedContext = getContext()) {
  if (!sameContext(expectedContext) || !isValidAnnotationRow(row, expectedContext) || seenAnnotationIds.has(row.id)) return;
  seenAnnotationIds.add(row.id);
  if (seenAnnotationIds.size > MAX_ANNOTATIONS * 2) {
    seenAnnotationIds = new Set([...seenAnnotationIds].slice(-MAX_ANNOTATIONS));
  }
  try {
    const value = await decryptAnnotationRow(row, expectedContext);
    if (!value || !sameContext(expectedContext)) return;
    applyDecryptedAnnotation(row, value);
  } catch {
    // Unauthenticated/wrong-key annotation ciphertext is not rendered.
  }
}

async function refreshAnnotations() {
  const context = getContext();
  if (!context || !sameContext(context)) return;
  if (refreshing) { refreshQueued = true; return; }
  refreshing = true;
  try {
    const { data, error } = await supabase.from('message_annotations')
      .select('id,pair_id,sender_id,recipient_id,ciphertext,nonce,key_version,created_at')
      .eq('pair_id', context.pairId)
      .order('created_at', { ascending: false })
      .limit(MAX_ANNOTATIONS);
    if (error) throw error;
    if (!sameContext(context)) return;
    for (const row of [...(data || [])].reverse()) {
      if (!sameContext(context)) return;
      await handleAnnotationRow(row, context);
    }
  } catch {
    if (sameContext(context)) announce('Reaksi atau balasan belum dapat dimuat. Percakapan tetap tersedia.', true);
  } finally {
    refreshing = false;
    if (refreshQueued) {
      refreshQueued = false;
      queueMicrotask(() => { void refreshAnnotations(); });
    }
  }
}

function attachRealtime(context) {
  if (channel && channelPairId === context.pairId) return;
  if (channel) supabase.removeChannel(channel).catch(() => {});
  channelPairId = context.pairId;
  channel = supabase.channel('our-space-annotations-' + context.pairId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'message_annotations',
      filter: 'pair_id=eq.' + context.pairId,
    }, (payload) => {
      if (sameContext(context)) void handleAnnotationRow(payload.new, context);
    })
    .subscribe((status) => {
      if (!sameContext(context)) return;
      if (status === 'SUBSCRIBED') void refreshAnnotations();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        announce('Sinkronisasi reaksi/balasan terputus. Chat teks tetap tersedia.', true);
      }
    });
}

function announce(message, isError = false) {
  const status = $('chat-annotation-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('hidden', !message);
  status.classList.toggle('text-red-700', isError);
  status.classList.toggle('text-[#76656a]', !isError);
}

function clearUiAnnotations() {
  for (const record of knownMessages.values()) {
    record.line?.querySelectorAll('.message-annotation-tools,.message-emoji-picker,.message-reaction-summary,.message-reply-quote')
      .forEach((node) => node.remove());
  }
  knownMessages.clear();
  seenAnnotationIds.clear();
  latestReactions.clear();
  repliesByMessageId.clear();
  pendingReply = null;
  announce('');
  renderReplyBanner();
}

function initComposerBanner() {
  const footer = $('chat-composer');
  if (!footer || $('chat-reply-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'chat-reply-banner';
  banner.className = 'hidden mx-1 mb-2 rounded-xl border border-[#eedbd8] bg-[#fff4f0] px-3 py-2 flex items-start justify-between gap-3';
  banner.innerHTML = '<div class="min-w-0 flex-1"><p id="chat-reply-author" class="text-xs font-semibold text-[#9e3e54]"></p><p id="chat-reply-excerpt" class="text-xs text-[#765059] mt-1 break-words"></p></div>';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'min-h-12 min-w-12 rounded-xl bg-white border border-[#eedbd8] text-[#9e3e54] font-semibold';
  cancel.setAttribute('aria-label', 'Batalkan balasan');
  cancel.textContent = '×';
  cancel.addEventListener('click', clearPendingReply);
  banner.appendChild(cancel);
  const recordStatus = $('chat-record-status');
  if (recordStatus) footer.insertBefore(banner, recordStatus);
  else footer.prepend(banner);
}

function clearState() {
  if (channel) supabase.removeChannel(channel).catch(() => {});
  channel = null;
  channelPairId = null;
  contextSnapshot = null;
  clearUiAnnotations();
  refreshQueued = false;
  refreshing = false;
}

export function initMessageAnnotations() {
  if (initialized) return;
  initialized = true;
  initComposerBanner();
  const container = $('chat-container');
  if (container) {
    container.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-message-annotation-scroll]') : null;
      if (!target) return;
      const id = target.getAttribute('data-message-annotation-scroll');
      const record = knownMessages.get(id);
      record?.line.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  window.ourSpaceAnnotations = {
    onReady: async () => {
      const context = getContext();
      if (!context) return;
      if (!sameContext(contextSnapshot)) {
        clearState();
        contextSnapshot = context;
      }
      attachRealtime(context);
      await refreshAnnotations();
    },
    onLocked: clearState,
    registerMessage,
    getPendingReply: () => {
      if (!pendingReply || !sameContext(contextSnapshot)) return null;
      return { ...pendingReply };
    },
    attachReply: async (replyMessageId, replyContext) => {
      const context = getContext();
      if (!context || !sameContext(context) || !replyContext ||
          replyContext.pairId !== context.pairId || replyContext.userId !== context.userId ||
          !UUID_V4.test(replyMessageId || '') || !UUID_V4.test(replyContext.targetMessageId || '') ||
          replyMessageId === replyContext.targetMessageId) return false;
      try {
        const success = await insertAnnotation(context, {
          pairId: context.pairId,
          value: {
            version: 1,
            kind: 'reply',
            replyMessageId,
            targetMessageId: replyContext.targetMessageId,
          },
        });
        if (pendingReply?.targetMessageId === replyContext.targetMessageId) clearPendingReply();
        if (!success && sameContext(context)) announce('Pesan terkirim, tetapi penanda balasan belum tersinkron.', true);
        return success;
      } catch {
        if (sameContext(context)) announce('Pesan terkirim, tetapi penanda balasan belum tersinkron.', true);
        if (pendingReply?.targetMessageId === replyContext.targetMessageId) clearPendingReply();
        return false;
      }
    },
  };
}
