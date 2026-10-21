import { Capacitor } from '@capacitor/core';
import { createIcons, icons } from 'lucide';
import { supabase } from './supabase.js';
import { OurSpaceKeyStore as KeyStore } from './secure-keys.js';
import { createMessageId } from './chat-protocol.js';
import { getPrivateChatContext } from './chat.js';

const $ = (id) => document.getElementById(id);
const SIGNAL_TTL_MS = 40_000;
const CALL_RING_TIMEOUT_MS = 35_000;
const ICE_GATHER_TIMEOUT_MS = 9_000;
const STUN_SERVERS = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let initialized = false;
let signalChannel = null;
let signalChannelPairId = null;
let signalSubscriptionReady = false;
let activeCall = null;
let incomingCall = null;
let disconnectedTimer = null;
let callClockTimer = null;
let seenSignalIds = new Set();
let callHistoryById = new Map();
let callHistoryRefreshInProgress = false;
let callHistoryRefreshQueued = false;

function getContext() {
  const ctx = getPrivateChatContext();
  return ctx?.partnerVerified ? ctx : null;
}

function sameContext(expected) {
  const current = getContext();
  return Boolean(current && expected &&
    current.userId === expected.userId &&
    current.partnerId === expected.partnerId &&
    current.pairId === expected.pairId &&
    current.keyVersion === expected.keyVersion &&
    current.partnerPublicKey === expected.partnerPublicKey);
}

function setCallState(text) {
  const node = $('call-state-text');
  if (node) node.textContent = text;
}

function setInlineNotice(text, isError = false) {
  const node = $('call-inline-status');
  if (!node) return;
  node.textContent = text;
  node.classList.toggle('hidden', !text);
  node.classList.toggle('text-red-700', isError);
  node.classList.toggle('text-[#76656a]', !isError);
  node.classList.toggle('border-red-200', isError);
  node.classList.toggle('bg-red-50', isError);
}

function openCallModal({ incoming = false, mode = 'audio', heading = 'Panggilan dengan pasangan', status = 'Menyiapkan koneksi…' } = {}) {
  const modal = $('call-modal');
  if (!modal) return;
  const title = $('call-modal-title');
  const videoStage = $('call-video-stage');
  const audioStage = $('call-audio-stage');
  if (title) title.textContent = heading;
  setCallState(status);
  videoStage?.classList.toggle('hidden', mode !== 'video');
  audioStage?.classList.toggle('hidden', mode === 'video');
  $('call-accept-button')?.classList.toggle('hidden', !incoming);
  $('call-reject-button')?.classList.toggle('hidden', !incoming);
  $('call-end-button')?.classList.toggle('hidden', incoming);
  $('call-mute-button')?.classList.add('hidden');
  $('call-camera-button')?.classList.add('hidden');
  $('call-close-button')?.classList.add('hidden');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  createIcons({ icons });
}

function closeCallModal() {
  const modal = $('call-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  $('call-remote-audio')?.pause?.();
  const remoteAudio = $('call-remote-audio');
  if (remoteAudio) remoteAudio.srcObject = null;
  const remoteVideo = $('call-remote-video');
  if (remoteVideo) remoteVideo.srcObject = null;
  const localVideo = $('call-local-video');
  if (localVideo) localVideo.srcObject = null;
  if (callClockTimer !== null) clearInterval(callClockTimer);
  callClockTimer = null;
}

function durationText(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return minutes + ':' + String(remaining).padStart(2, '0');
}

function outcomeLabel(outcome) {
  const labels = {
    ended: 'Selesai',
    rejected: 'Ditolak',
    no_answer: 'Tidak dijawab',
    cancelled: 'Dibatalkan',
    failed: 'Gagal tersambung',
    network_lost: 'Koneksi terputus',
    interrupted: 'Terhenti saat aplikasi dikunci',
  };
  return labels[outcome] || 'Selesai';
}

function stopStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try { track.stop(); } catch { /* release all permission-backed tracks best-effort */ }
  }
}

function stopCallResources(call) {
  if (!call) return;
  if (call.ringTimer !== null) clearTimeout(call.ringTimer);
  if (call.connectTimer !== null) clearTimeout(call.connectTimer);
  if (disconnectedTimer !== null) clearTimeout(disconnectedTimer);
  disconnectedTimer = null;
  if (call.pc) {
    call.pc.ontrack = null;
    call.pc.oniceconnectionstatechange = null;
    call.pc.onconnectionstatechange = null;
    try { call.pc.close(); } catch { /* closed already */ }
  }
  stopStream(call.localStream);
  stopStream(call.remoteStream);
  call.localStream = null;
  call.remoteStream = null;
  call.pc = null;
}

async function encryptedSignal(ctx, signal) {
  if (!sameContext(ctx)) return false;
  const id = createMessageId();
  const plaintext = JSON.stringify({ version: 1, ...signal });
  const plaintextBytes = new TextEncoder().encode(plaintext);
  if (plaintextBytes.length > 14 * 1024) {
    throw new Error('Data negosiasi panggilan terlalu besar. Panggilan dibatalkan demi keamanan.');
  }
  const encrypted = await KeyStore.encryptMessage({
    peerPublicKey: ctx.partnerPublicKey,
    pairId: ctx.pairId,
    messageId: id,
    senderId: ctx.userId,
    recipientId: ctx.partnerId,
    keyVersion: ctx.keyVersion,
    messageType: 'text',
    plaintext,
  });
  plaintextBytes.fill(0);
  if (!sameContext(ctx)) return false;
  const { error } = await supabase.from('call_signals').insert({
    id,
    pair_id: ctx.pairId,
    sender_id: ctx.userId,
    recipient_id: ctx.partnerId,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    key_version: ctx.keyVersion,
  });
  if (error) throw error;
  return sameContext(ctx);
}

async function encryptedCallRecord(ctx, record) {
  if (!sameContext(ctx)) return false;
  const id = createMessageId();
  const plaintext = JSON.stringify({
    version: 1,
    kind: 'call-record',
    callId: record.callId,
    mode: record.mode,
    direction: record.direction,
    outcome: record.outcome,
    startedAt: record.startedAt || null,
    endedAt: record.endedAt,
    durationSeconds: record.durationSeconds,
  });
  const encrypted = await KeyStore.encryptMessage({
    peerPublicKey: ctx.partnerPublicKey,
    pairId: ctx.pairId,
    messageId: id,
    senderId: ctx.userId,
    recipientId: ctx.partnerId,
    keyVersion: ctx.keyVersion,
    messageType: 'text',
    plaintext,
  });
  if (!sameContext(ctx)) return false;
  const { error } = await supabase.from('call_records').insert({
    id,
    pair_id: ctx.pairId,
    sender_id: ctx.userId,
    recipient_id: ctx.partnerId,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    key_version: ctx.keyVersion,
  });
  if (error) throw error;
  return true;
}

async function saveCallRecord(ctx, call, outcome) {
  if (!ctx || !call || call.historySaved) return;
  call.historySaved = true;
  const endedAt = new Date().toISOString();
  const seconds = call.connectedAt ? Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000)) : 0;
  const record = {
    callId: call.id,
    mode: call.mode,
    direction: call.direction,
    outcome,
    startedAt: call.connectedAt ? new Date(call.connectedAt).toISOString() : null,
    endedAt,
    durationSeconds: seconds,
  };
  try {
    await encryptedCallRecord(ctx, record);
  } catch {
    setInlineNotice('Panggilan berakhir, tetapi riwayat panggilan terenkripsi belum tersimpan. Riwayat tidak diisi dengan data palsu.', true);
  }
}

function currentCall(call) {
  return Boolean(call && activeCall === call && sameContext(call.context));
}

function startCallClock(call) {
  if (callClockTimer !== null) clearInterval(callClockTimer);
  callClockTimer = setInterval(() => {
    if (!currentCall(call) || !call.connectedAt) return;
    const duration = durationText((Date.now() - call.connectedAt) / 1000);
    setCallState('Tersambung · ' + duration);
    const subtitle = $('call-audio-subtitle');
    if (subtitle) subtitle.textContent = call.mode === 'video'
      ? 'Panggilan video tersambung · ' + duration
      : 'Panggilan suara tersambung · ' + duration;
  }, 1000);
}

function markConnected(call) {
  if (!currentCall(call) || call.connectedAt) return;
  call.connectedAt = Date.now();
  call.ringTimer !== null && clearTimeout(call.ringTimer);
  call.ringTimer = null;
  call.connectTimer !== null && clearTimeout(call.connectTimer);
  call.connectTimer = null;
  setCallState('Tersambung · 0:00');
  const subtitle = $('call-audio-subtitle');
  if (subtitle) subtitle.textContent = call.mode === 'video' ? 'Panggilan video tersambung.' : 'Panggilan suara tersambung.';
  $('call-accept-button')?.classList.add('hidden');
  $('call-reject-button')?.classList.add('hidden');
  $('call-end-button')?.classList.remove('hidden');
  $('call-mute-button')?.classList.remove('hidden');
  if (call.mode === 'video') $('call-camera-button')?.classList.remove('hidden');
  startCallClock(call);
}

function bindPeerConnection(call) {
  call.pc.ontrack = (event) => {
    if (!currentCall(call)) return;
    const stream = event.streams?.[0];
    if (stream) call.remoteStream = stream;
    else {
      if (!call.remoteStream) call.remoteStream = new MediaStream();
      call.remoteStream.addTrack(event.track);
    }
    const remoteVideo = $('call-remote-video');
    const remoteAudio = $('call-remote-audio');
    if (call.mode === 'video' && remoteVideo) {
      remoteVideo.srcObject = call.remoteStream;
      void remoteVideo.play().catch(() => {});
    } else if (remoteAudio) {
      remoteAudio.srcObject = call.remoteStream;
      void remoteAudio.play().catch(() => {});
    }
  };
  const checkConnection = () => {
    if (!currentCall(call)) return;
    const state = call.pc?.connectionState;
    const iceState = call.pc?.iceConnectionState;
    if (state === 'connected' || iceState === 'connected' || iceState === 'completed') {
      markConnected(call);
      return;
    }
    if (state === 'failed' || iceState === 'failed') {
      void finishCall(call, 'failed', false);
      return;
    }
    if (state === 'disconnected' || iceState === 'disconnected') {
      if (disconnectedTimer !== null) clearTimeout(disconnectedTimer);
      disconnectedTimer = setTimeout(() => {
        if (currentCall(call) &&
            (call.pc?.connectionState === 'disconnected' || call.pc?.iceConnectionState === 'disconnected')) {
          void finishCall(call, 'network_lost', true);
        }
      }, 6000);
    } else if (disconnectedTimer !== null) {
      clearTimeout(disconnectedTimer);
      disconnectedTimer = null;
    }
  };
  call.pc.onconnectionstatechange = checkConnection;
  call.pc.oniceconnectionstatechange = checkConnection;
}

function createPeer(call) {
  if (typeof RTCPeerConnection !== 'function') {
    throw new Error('Komponen WebRTC tidak tersedia di WebView perangkat ini.');
  }
  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  call.pc = pc;
  bindPeerConnection(call);
  return pc;
}

async function acquireMedia(call) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Izin mikrofon/kamera tidak tersedia. Perbarui Android System WebView lalu coba lagi.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: call.mode === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
  });
  if (!currentCall(call)) {
    stopStream(stream);
    return null;
  }
  call.localStream = stream;
  for (const track of stream.getTracks()) call.pc.addTrack(track, stream);
  const localVideo = $('call-local-video');
  if (localVideo && call.mode === 'video') localVideo.srcObject = stream;
  return stream;
}

function waitForIceGathering(pc, maxMs = ICE_GATHER_TIMEOUT_MS) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve(true);
  return new Promise((resolve) => {
    let completed = false;
    const finish = (value) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', listener);
      resolve(value);
    };
    const listener = () => {
      if (pc.iceGatheringState === 'complete') finish(true);
    };
    const timer = setTimeout(() => finish(false), maxMs);
    pc.addEventListener('icegatheringstatechange', listener);
  });
}

function showSession(call, status) {
  openCallModal({
    incoming: false,
    mode: call.mode,
    heading: call.direction === 'outgoing' ? 'Memanggil pasangan' : 'Panggilan dengan pasangan',
    status,
  });
  $('call-end-button')?.classList.remove('hidden');
  $('call-mute-button')?.classList.remove('hidden');
  if (call.mode === 'video') $('call-camera-button')?.classList.remove('hidden');
}

function showIncoming(call) {
  openCallModal({
    incoming: true,
    mode: call.mode,
    heading: call.mode === 'video' ? 'Panggilan video masuk' : 'Panggilan suara masuk',
    status: 'Pasangan sedang menelepon. Angkat hanya jika kamu siap.',
  });
  $('call-audio-subtitle') && ($('call-audio-subtitle').textContent = 'Belum tersambung.');
}

async function refreshCallHistory() {
  const ctx = getContext();
  if (!ctx) return;
  if (callHistoryRefreshInProgress) {
    callHistoryRefreshQueued = true;
    return;
  }
  callHistoryRefreshInProgress = true;
  try {
    const { data, error } = await supabase.from('call_records')
      .select('id,pair_id,sender_id,recipient_id,ciphertext,nonce,key_version,created_at')
      .eq('pair_id', ctx.pairId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!sameContext(ctx)) return;
    if (error) throw error;
    const records = new Map();
    for (const row of (data || [])) {
      if (!sameContext(ctx)) return;
      try {
        const opened = await KeyStore.decryptMessage({
          peerPublicKey: ctx.partnerPublicKey,
          pairId: row.pair_id,
          messageId: row.id,
          senderId: row.sender_id,
          recipientId: row.recipient_id,
          keyVersion: row.key_version,
          messageType: 'text',
          nonce: row.nonce,
          ciphertext: row.ciphertext,
        });
        if (!sameContext(ctx)) return;
        const value = JSON.parse(opened.plaintext);
        if (!value || value.version !== 1 || value.kind !== 'call-record' ||
            typeof value.callId !== 'string' || !UUID.test(value.callId) ||
            !['audio', 'video'].includes(value.mode) ||
            !['incoming', 'outgoing'].includes(value.direction) ||
            !['ended', 'rejected', 'no_answer', 'cancelled', 'failed', 'network_lost', 'interrupted'].includes(value.outcome) ||
            !Number.isSafeInteger(value.durationSeconds) || value.durationSeconds < 0 || value.durationSeconds > 24 * 3600 ||
            (value.startedAt !== null && !Number.isFinite(Date.parse(value.startedAt))) ||
            !Number.isFinite(Date.parse(value.endedAt))) {
          continue;
        }
        if (!records.has(value.callId)) records.set(value.callId, { row, value });
      } catch {
        // Invalid or wrong-key records are not rendered as data.
      }
    }
    if (!sameContext(ctx)) return;
    callHistoryById = records;
    renderCallHistory(ctx);
  } catch {
    // Calls should still work when history is temporarily unavailable.
  } finally {
    callHistoryRefreshInProgress = false;
    if (callHistoryRefreshQueued) {
      callHistoryRefreshQueued = false;
      queueMicrotask(() => { void refreshCallHistory(); });
    }
  }
}

function insertTimelineItem(container, node) {
  const timestamp = Date.parse(node.dataset.createdAt || '');
  const children = [...container.children];
  const before = children.find((child) => {
    const childTime = Date.parse(child.dataset.createdAt || '');
    return Number.isFinite(timestamp) && Number.isFinite(childTime) && childTime > timestamp;
  });
  container.insertBefore(node, before || null);
}

function renderCallHistory(ctx) {
  const container = $('chat-container');
  if (!container || !sameContext(ctx)) return;
  container.querySelectorAll('.call-history-card').forEach((node) => node.remove());

  const entries = [...callHistoryById.values()].sort((a, b) =>
    Date.parse(a.row.created_at) - Date.parse(b.row.created_at));
  for (const { row, value } of entries) {
    const card = document.createElement('article');
    card.className = 'call-history-card w-full max-w-md mx-auto rounded-2xl border border-[#eedbd8] bg-[#fff8f5] p-4 flex items-start gap-3';
    card.dataset.createdAt = row.created_at;
    card.dataset.callId = value.callId;
    const iconWrap = document.createElement('div');
    iconWrap.className = 'w-10 h-10 rounded-xl shrink-0 bg-[#fcece8] text-[#9e3e54] flex items-center justify-center';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', value.mode === 'video' ? 'video' : 'phone');
    icon.className = 'w-5 h-5';
    iconWrap.appendChild(icon);
    const detail = document.createElement('div');
    detail.className = 'min-w-0 flex-1';
    const label = document.createElement('p');
    label.className = 'text-sm font-semibold text-[#613641]';
    label.textContent = (value.mode === 'video' ? 'Panggilan video' : 'Panggilan suara') +
      ' · ' + (value.direction === 'incoming' ? 'masuk' : 'keluar');
    const status = document.createElement('p');
    status.className = 'text-xs text-[#76656a] mt-1';
    status.textContent = outcomeLabel(value.outcome) +
      (value.startedAt && value.durationSeconds > 0 ? ' · ' + durationText(value.durationSeconds) : '');
    const time = document.createElement('p');
    time.className = 'text-[10px] text-[#76656a] mt-1';
    const date = new Date(row.created_at);
    time.textContent = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(date) : '';
    detail.append(label, status, time);
    card.append(iconWrap, detail);
    insertTimelineItem(container, card);
  }
  createIcons({ icons });
}

async function handleSignalRow(row) {
  const ctx = getContext();
  if (!ctx || !row || row.pair_id !== ctx.pairId || row.recipient_id !== ctx.userId ||
      row.sender_id !== ctx.partnerId || row.key_version !== ctx.keyVersion ||
      typeof row.ciphertext !== 'string' || row.ciphertext.length < 22 ||
      row.ciphertext.length > 24000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(row.ciphertext) ||
      typeof row.nonce !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(row.nonce) ||
      !UUID.test(row.id) || seenSignalIds.has(row.id)) return;
  const created = Date.parse(row.created_at || '');
  if (!Number.isFinite(created) || Date.now() - created > SIGNAL_TTL_MS || created > Date.now() + 5000) return;
  seenSignalIds.add(row.id);
  if (seenSignalIds.size > 500) seenSignalIds = new Set([...seenSignalIds].slice(-250));

  try {
    const opened = await KeyStore.decryptMessage({
      peerPublicKey: ctx.partnerPublicKey,
      pairId: row.pair_id,
      messageId: row.id,
      senderId: row.sender_id,
      recipientId: row.recipient_id,
      keyVersion: row.key_version,
      messageType: 'text',
      nonce: row.nonce,
      ciphertext: row.ciphertext,
    });
    if (!sameContext(ctx)) return;
    const signal = JSON.parse(opened.plaintext);
    if (!signal || signal.version !== 1 || !UUID.test(signal.callId) ||
        !['offer', 'answer', 'reject', 'end'].includes(signal.type) ||
        !['audio', 'video'].includes(signal.mode)) return;

    if (signal.type === 'offer') {
      if (!signal.description || signal.description.type !== 'offer' ||
          typeof signal.description.sdp !== 'string' ||
          signal.description.sdp.length > 14 * 1024 ||
          !signal.description.sdp.startsWith('v=0')) return;
      if (activeCall || incomingCall) {
        await encryptedSignal(ctx, { type: 'reject', callId: signal.callId, mode: signal.mode });
        return;
      }
      incomingCall = { id: signal.callId, mode: signal.mode, description: signal.description, context: ctx };
      showIncoming(incomingCall);
      return;
    }

    if (signal.type === 'answer') {
      const call = activeCall;
      if (!call || call.direction !== 'outgoing' || call.id !== signal.callId ||
          !signal.description || signal.description.type !== 'answer' ||
          typeof signal.description.sdp !== 'string' ||
          signal.description.sdp.length > 14 * 1024 ||
          !signal.description.sdp.startsWith('v=0')) return;
      await call.pc.setRemoteDescription(new RTCSessionDescription(signal.description));
      if (!currentCall(call)) return;
      setCallState('Jawaban diterima · menghubungkan audio/video…');
      return;
    }

    if (signal.type === 'reject') {
      if (incomingCall?.id === signal.callId) {
        const ctxForRecord = currentContextFrom(incomingCall);
        const rejected = incomingCall;
        incomingCall = null;
        closeCallModal();
        await saveCallRecord(ctxForRecord, {
          id: rejected.id, mode: rejected.mode, direction: 'outgoing',
          connectedAt: null, historySaved: false,
        }, 'rejected');
        return;
      }
      if (activeCall?.id === signal.callId) await finishCall(activeCall, 'rejected', false);
      return;
    }

    if (signal.type === 'end') {
      if (incomingCall?.id === signal.callId) {
        const ended = incomingCall;
        const ctxForRecord = currentContextFrom(ended);
        incomingCall = null;
        closeCallModal();
        await saveCallRecord(ctxForRecord, {
          id: ended.id, mode: ended.mode, direction: 'incoming',
          connectedAt: null, historySaved: false,
        }, 'no_answer');
        return;
      }
      if (activeCall?.id === signal.callId) await finishCall(activeCall, 'ended', false);
    }
  } catch {
    // Authentication/decryption failures are deliberately ignored as unauthenticated noise.
  }
}

function currentContextFrom(call) {
  return call?.context && sameContext(call.context) ? call.context : null;
}

function attachSignalChannel(ctx) {
  if (signalChannel && signalChannelPairId === ctx.pairId) return;
  if (signalChannel) supabase.removeChannel(signalChannel).catch(() => {});
  signalChannelPairId = ctx.pairId;
  signalSubscriptionReady = false;
  signalChannel = supabase.channel('our-space-webrtc-' + ctx.pairId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'call_signals',
      filter: 'pair_id=eq.' + ctx.pairId,
    }, (payload) => {
      if (payload.new?.recipient_id === getContext()?.userId) void handleSignalRow(payload.new);
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'call_records',
      filter: 'pair_id=eq.' + ctx.pairId,
    }, (payload) => {
      if (payload.new?.pair_id === getContext()?.pairId) void refreshCallHistory();
    })
    .subscribe((status) => {
      signalSubscriptionReady = status === 'SUBSCRIBED';
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setInlineNotice('Sinyal panggilan tidak tersambung. Chat teks tetap bisa digunakan; coba buka Obrolan lagi.', true);
      }
    });
}

async function startCall(mode) {
  const ctx = getContext();
  if (!ctx || !sameContext(ctx)) {
    setInlineNotice('Masuk ke akun privat dan verifikasi fingerprint pasangan terlebih dahulu.', true);
    return;
  }
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    setInlineNotice('Panggilan hanya tersedia di APK Android.', true);
    return;
  }
  if (!signalSubscriptionReady) {
    setInlineNotice('Koneksi sinyal panggilan belum siap. Periksa jaringan lalu coba lagi.', true);
    return;
  }
  if (activeCall || incomingCall || !['audio', 'video'].includes(mode)) return;
  setInlineNotice('');
  const call = {
    id: createMessageId(),
    mode,
    direction: 'outgoing',
    context: ctx,
    pc: null,
    localStream: null,
    remoteStream: null,
    connectedAt: null,
    ringTimer: null,
    connectTimer: null,
    historySaved: false,
    muted: false,
    cameraOff: false,
  };
  activeCall = call;
  showSession(call, mode === 'video' ? 'Meminta izin kamera dan mikrofon…' : 'Meminta izin mikrofon…');

  try {
    createPeer(call);
    const stream = await acquireMedia(call);
    if (!stream || !currentCall(call)) return;
    setCallState('Menyiapkan koneksi langsung…');
    const offer = await call.pc.createOffer();
    if (!currentCall(call)) return;
    await call.pc.setLocalDescription(offer);
    if (!currentCall(call)) return;
    const gathered = await waitForIceGathering(call.pc);
    if (!currentCall(call)) return;
    if (!gathered) throw new Error('Jaringan belum selesai menyiapkan rute panggilan. Coba lagi di jaringan lain.');
    const description = call.pc.localDescription;
    if (!description?.sdp || description.sdp.length > 14 * 1024) {
      throw new Error('Deskripsi koneksi terlalu besar untuk kanal aman ini.');
    }
    await encryptedSignal(ctx, {
      type: 'offer',
      callId: call.id,
      mode: call.mode,
      description: { type: description.type, sdp: description.sdp },
    });
    if (!currentCall(call)) return;
    setCallState('Memanggil pasangan…');
    call.ringTimer = setTimeout(() => {
      if (currentCall(call) && !call.connectedAt) void finishCall(call, 'no_answer', true);
    }, CALL_RING_TIMEOUT_MS);
    call.connectTimer = setTimeout(() => {
      if (currentCall(call) && !call.connectedAt) void finishCall(call, 'failed', true);
    }, 55_000);
  } catch (error) {
    if (!currentCall(call)) return;
    const reason = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
      ? 'Izin mikrofon/kamera ditolak. Aktifkan izin Our Space di pengaturan Android.'
      : typeof error?.message === 'string' ? error.message : 'Panggilan tidak dapat dimulai.';
    await finishCall(call, 'failed', false);
    setInlineNotice(reason, true);
  }
}

async function acceptIncomingCall() {
  const inbound = incomingCall;
  const ctx = currentContextFrom(inbound);
  if (!inbound || !ctx || activeCall || !sameContext(ctx)) return;
  incomingCall = null;
  const call = {
    id: inbound.id,
    mode: inbound.mode,
    direction: 'incoming',
    context: ctx,
    pc: null,
    localStream: null,
    remoteStream: null,
    connectedAt: null,
    ringTimer: null,
    connectTimer: null,
    historySaved: false,
    muted: false,
    cameraOff: false,
  };
  activeCall = call;
  showSession(call, 'Meminta izin mikrofon' + (call.mode === 'video' ? ' dan kamera…' : '…'));
  try {
    createPeer(call);
    await call.pc.setRemoteDescription(new RTCSessionDescription(inbound.description));
    if (!currentCall(call)) return;
    const stream = await acquireMedia(call);
    if (!stream || !currentCall(call)) return;
    const answer = await call.pc.createAnswer();
    if (!currentCall(call)) return;
    await call.pc.setLocalDescription(answer);
    if (!currentCall(call)) return;
    const gathered = await waitForIceGathering(call.pc);
    if (!currentCall(call)) return;
    if (!gathered) throw new Error('Jaringan belum selesai menyiapkan rute panggilan. Coba lagi di jaringan lain.');
    const description = call.pc.localDescription;
    if (!description?.sdp || description.sdp.length > 14 * 1024) {
      throw new Error('Deskripsi koneksi terlalu besar untuk kanal aman ini.');
    }
    await encryptedSignal(ctx, {
      type: 'answer',
      callId: call.id,
      mode: call.mode,
      description: { type: description.type, sdp: description.sdp },
    });
    if (!currentCall(call)) return;
    setCallState('Jawaban terkirim · menghubungkan audio/video…');
    call.connectTimer = setTimeout(() => {
      if (currentCall(call) && !call.connectedAt) void finishCall(call, 'failed', true);
    }, 55_000);
  } catch (error) {
    if (currentCall(call)) {
      const reason = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
        ? 'Izin mikrofon/kamera ditolak. Aktifkan izin Our Space di pengaturan Android.'
        : typeof error?.message === 'string' ? error.message : 'Panggilan tidak dapat dijawab.';
      await finishCall(call, 'failed', true);
      setInlineNotice(reason, true);
    }
  }
}

async function rejectIncomingCall(outcome = 'rejected') {
  const inbound = incomingCall;
  const ctx = currentContextFrom(inbound);
  if (!inbound) return;
  incomingCall = null;
  closeCallModal();
  if (ctx) {
    try {
      await encryptedSignal(ctx, { type: 'reject', callId: inbound.id, mode: inbound.mode });
    } catch { /* local rejection still ends the ring */ }
    await saveCallRecord(ctx, {
      id: inbound.id, mode: inbound.mode, direction: 'incoming',
      connectedAt: null, historySaved: false,
    }, outcome);
  }
}

async function finishCall(call, outcome, notifyPeer) {
  if (!call || activeCall !== call || call.finishing) return;
  call.finishing = true;
  const ctx = currentContextFrom(call);
  const duration = call.connectedAt ? Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000)) : 0;
  if (call.ringTimer !== null) clearTimeout(call.ringTimer);
  if (call.connectTimer !== null) clearTimeout(call.connectTimer);
  stopCallResources(call);
  activeCall = null;
  closeCallModal();

  if (notifyPeer && ctx) {
    try { await encryptedSignal(ctx, { type: 'end', callId: call.id, mode: call.mode }); } catch { /* link may already be lost */ }
  }
  await saveCallRecord(ctx, { ...call, historySaved: false }, outcome);
  const modeLabel = call.mode === 'video' ? 'Panggilan video' : 'Panggilan suara';
  setInlineNotice(modeLabel + ' · ' + outcomeLabel(outcome) +
    (duration > 0 ? ' · ' + durationText(duration) : '') + '.', outcome === 'failed' || outcome === 'network_lost');
  if (sameContext(ctx)) await refreshCallHistory();
}

function setupCallControls() {
  $('chat-audio-call')?.addEventListener('click', () => { void startCall('audio'); });
  $('chat-video-call')?.addEventListener('click', () => { void startCall('video'); });
  $('call-accept-button')?.addEventListener('click', () => { void acceptIncomingCall(); });
  $('call-reject-button')?.addEventListener('click', () => { void rejectIncomingCall('rejected'); });
  $('call-end-button')?.addEventListener('click', () => {
    if (activeCall) void finishCall(activeCall, activeCall.connectedAt ? 'ended' : 'cancelled', true);
  });
  $('call-close-button')?.addEventListener('click', () => {
    if (incomingCall) void rejectIncomingCall('rejected');
    else if (activeCall) void finishCall(activeCall, activeCall.connectedAt ? 'ended' : 'cancelled', true);
    else closeCallModal();
  });
  $('call-mute-button')?.addEventListener('click', () => {
    const call = activeCall;
    if (!currentCall(call) || !call.localStream) return;
    call.muted = !call.muted;
    for (const track of call.localStream.getAudioTracks()) track.enabled = !call.muted;
    const button = $('call-mute-button');
    if (button) button.textContent = call.muted ? 'Nyalakan mikrofon' : 'Bisukan mikrofon';
  });
  $('call-camera-button')?.addEventListener('click', () => {
    const call = activeCall;
    if (!currentCall(call) || !call.localStream || call.mode !== 'video') return;
    call.cameraOff = !call.cameraOff;
    for (const track of call.localStream.getVideoTracks()) track.enabled = !call.cameraOff;
    const button = $('call-camera-button');
    if (button) button.textContent = call.cameraOff ? 'Nyalakan kamera' : 'Matikan kamera';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || $('call-modal')?.classList.contains('hidden')) return;
    if (incomingCall) void rejectIncomingCall('rejected');
    else if (activeCall) void finishCall(activeCall, activeCall.connectedAt ? 'ended' : 'cancelled', true);
  });
}

export function initCalls() {
  if (initialized) return;
  initialized = true;
  setupCallControls();
  window.ourSpaceCalls = {
    onReady: async () => {
      const ctx = getContext();
      if (!ctx) return;
      attachSignalChannel(ctx);
      await refreshCallHistory();
    },
    onLocked: () => {
      const call = activeCall;
      activeCall = null;
      incomingCall = null;
      if (call) stopCallResources(call);
      if (signalChannel) supabase.removeChannel(signalChannel).catch(() => {});
      signalChannel = null;
      signalChannelPairId = null;
      signalSubscriptionReady = false;
      seenSignalIds.clear();
      callHistoryById.clear();
      $('chat-container')?.querySelectorAll('.call-history-card').forEach((node) => node.remove());
      closeCallModal();
      setInlineNotice('');
    },
  };
}
