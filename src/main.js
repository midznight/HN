import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createIcons, icons } from "lucide";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "./tailwind.generated.css";
import "./app.css";

const STORAGE = Object.freeze({
  identity: "our-space.identity.v1",
  pinSalt: "our-space.pin-salt.v1",
  pinHash: "our-space.pin-hash.v1",
  pinFailures: "our-space.pin-failures.v1",
  pinBlockedUntil: "our-space.pin-blocked-until.v1",
  keyWarningFlag: "our-space.private-key-present.v1"
});
const PBKDF2_ITERATIONS = 310_000;
const MAX_LOCK_DELAY_MS = 5 * 60 * 1000;
const encoder = new TextEncoder();

const setupScreen = document.getElementById("setup-screen");
const identityStep = document.getElementById("identity-step");
const pinSetupStep = document.getElementById("pin-setup-step");
const loginScreen = document.getElementById("login-screen");
const appLayout = document.getElementById("app-layout");
const loginForm = document.getElementById("login-form");
const pinInput = document.getElementById("pin-input");
const loginButton = document.getElementById("login-btn");
const loginFeedback = document.getElementById("login-feedback");
const pinSetupForm = document.getElementById("pin-setup-form");
const newPinInput = document.getElementById("new-pin-input");
const confirmPinInput = document.getElementById("confirm-pin-input");
const savePinButton = document.getElementById("save-pin-button");
const pinSetupFeedback = document.getElementById("pin-setup-feedback");
const identityFeedback = document.getElementById("identity-feedback");

let selectedIdentity = null;
let activeView = "home";
let unlocked = false;
let frameMonitorStarted = false;

function encodeBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}
async function derivePinHash(pin, salt) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto aman tidak tersedia. Buka aplikasi Android hasil build, bukan file HTML langsung.");
  }
  const material = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    256
  );
  return new Uint8Array(bits);
}
function getIdentity() { return localStorage.getItem(STORAGE.identity); }
function hasLocalPin() { return Boolean(localStorage.getItem(STORAGE.pinSalt) && localStorage.getItem(STORAGE.pinHash)); }
function showMessage(element, message) { if (element) element.textContent = message; }

function setScreen(screen) {
  setupScreen.classList.toggle("hidden", screen !== "setup");
  loginScreen.style.display = screen === "login" ? "flex" : "none";
  if (screen !== "login") loginScreen.classList.remove("fade-out");
  if (screen === "setup") appLayout.classList.add("hidden");
}

function updateIdentityLabels(identity) {
  const partner = identity === "Hamid" ? "Nur" : "Hamid";
  const currentName = document.getElementById("current-user-name");
  const partnerName = document.getElementById("chat-partner-name");
  const partnerAvatar = document.getElementById("chat-partner-avatar");
  if (currentName) currentName.textContent = identity;
  if (partnerName) partnerName.textContent = partner;
  if (partnerAvatar) {
    partnerAvatar.textContent = partner === "Hamid" ? "H" : "N";
    partnerAvatar.setAttribute("aria-label", `Avatar ${partner}; foto belum dipilih`);
  }
}

function showApplication() {
  if (!hasLocalPin() || !getIdentity()) { setScreen("setup"); return; }
  unlocked = true;
  setScreen("app");
  appLayout.classList.remove("hidden");
  appLayout.classList.add("flex", "fade-in");
  updateIdentityLabels(getIdentity());
  window.setTimeout(() => {
    const chat = document.getElementById("chat-container");
    if (chat) chat.scrollTop = chat.scrollHeight;
  }, 0);
  startFrameMonitor();
}

function lockApplication() {
  if (!hasLocalPin() || !getIdentity()) return;
  unlocked = false;
  appLayout.classList.add("hidden");
  appLayout.classList.remove("flex", "fade-in");
  loginScreen.classList.remove("fade-out");
  loginScreen.style.display = "flex";
  pinInput.value = "";
  pinInput.blur();
  showMessage(loginFeedback, "");
}

function validatePin(pin) { return /^[0-9]{6,8}$/.test(pin); }
function getFailureCount() {
  const n = Number.parseInt(localStorage.getItem(STORAGE.pinFailures) || "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function getBlockedUntil() {
  const n = Number.parseInt(localStorage.getItem(STORAGE.pinBlockedUntil) || "0", 10);
  return Number.isFinite(n) && n > Date.now() ? n : 0;
}
function recordFailure() {
  const failures = getFailureCount() + 1;
  const delay = Math.min(MAX_LOCK_DELAY_MS, 1000 * (2 ** Math.min(failures - 1, 20)));
  localStorage.setItem(STORAGE.pinFailures, String(failures));
  localStorage.setItem(STORAGE.pinBlockedUntil, String(Date.now() + delay));
  return delay;
}
function clearFailures() {
  localStorage.removeItem(STORAGE.pinFailures);
  localStorage.removeItem(STORAGE.pinBlockedUntil);
}

async function handleLogin(event) {
  event.preventDefault();
  if (!hasLocalPin() || !getIdentity()) { setScreen("setup"); return; }
  const blockedUntil = getBlockedUntil();
  if (blockedUntil) {
    showMessage(loginFeedback, `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((blockedUntil - Date.now()) / 1000)} detik.`);
    return;
  }
  const pin = pinInput.value;
  if (!validatePin(pin)) { showMessage(loginFeedback, "Masukkan PIN 6–8 digit angka."); return; }

  loginButton.disabled = true;
  loginButton.innerHTML = '<i data-lucide="loader-circle" class="w-4 h-4 animate-spin"></i>';
  createIcons({ icons });
  showMessage(loginFeedback, "");
  try {
    const salt = decodeBase64(localStorage.getItem(STORAGE.pinSalt));
    const expected = decodeBase64(localStorage.getItem(STORAGE.pinHash));
    const actual = await derivePinHash(pin, salt);
    if (equalBytes(actual, expected)) {
      clearFailures();
      pinInput.value = "";
      showApplication();
      return;
    }
    const delay = recordFailure();
    pinInput.value = "";
    showMessage(loginFeedback, `PIN salah. Coba lagi setelah ${Math.ceil(delay / 1000)} detik.`);
    const card = document.getElementById("login-card");
    card.classList.add("shake-anim");
    window.setTimeout(() => card.classList.remove("shake-anim"), 400);
  } catch (error) {
    showMessage(loginFeedback, "PIN tidak dapat diverifikasi dengan aman. Tutup lalu buka kembali aplikasi. Detail: " + error.message);
  } finally {
    loginButton.disabled = false;
    loginButton.innerHTML = '<i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>';
    createIcons({ icons });
  }
}

async function handlePinSetup(event) {
  event.preventDefault();
  const pin = newPinInput.value;
  const confirmation = confirmPinInput.value;
  if (!selectedIdentity) { showMessage(pinSetupFeedback, "Pilih identitas terlebih dahulu."); return; }
  if (!validatePin(pin)) { showMessage(pinSetupFeedback, "PIN harus terdiri dari 6–8 digit angka."); return; }
  if (pin !== confirmation) {
    showMessage(pinSetupFeedback, "Kedua PIN belum sama. Periksa dan ulangi.");
    confirmPinInput.value = "";
    confirmPinInput.focus();
    return;
  }

  savePinButton.disabled = true;
  savePinButton.textContent = "Menyimpan secara lokal…";
  showMessage(pinSetupFeedback, "");
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const digest = await derivePinHash(pin, salt);
    localStorage.setItem(STORAGE.identity, selectedIdentity);
    localStorage.setItem(STORAGE.pinSalt, encodeBase64(salt));
    localStorage.setItem(STORAGE.pinHash, encodeBase64(digest));
    clearFailures();
    newPinInput.value = "";
    confirmPinInput.value = "";
    showApplication();
  } catch (error) {
    showMessage(pinSetupFeedback, "PIN belum tersimpan. " + error.message);
  } finally {
    savePinButton.disabled = false;
    savePinButton.textContent = "Simpan PIN dan buka aplikasi";
  }
}

function chooseIdentity(identity) {
  if (identity !== "Hamid" && identity !== "Nur") {
    showMessage(identityFeedback, "Identitas tidak valid.");
    return;
  }
  selectedIdentity = identity;
  showMessage(identityFeedback, "");
  identityStep.classList.add("hidden");
  pinSetupStep.classList.remove("hidden");
  newPinInput.focus();
}

function switchView(viewId, fromBack = false) {
  const target = document.getElementById(`view-${viewId}`);
  if (!target) return;
  document.querySelectorAll(".app-view").forEach(view => view.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  target.classList.add("active");
  activeView = viewId;
  const nav = document.querySelector(`.nav-item[onclick="switchView('${viewId}')"]`);
  if (nav) nav.classList.add("active");
  if (viewId === "chat") {
    const chat = document.getElementById("chat-container");
    if (chat) chat.scrollTop = chat.scrollHeight;
  }
  if (!fromBack) window.history.replaceState({ view: viewId }, "", window.location.pathname + window.location.search);
}

function navigateBack() {
  if (!unlocked || !setupScreen.classList.contains("hidden")) return;
  if (activeView !== "home") { switchView("home", true); return; }
  lockApplication();
}

function handleLockButton() {
  // This button only locks the UI; deleting the device key will be a separate, guarded action in Phase 2.
  lockApplication();
}

function updateKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  document.documentElement.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
  if (inset > 0 && activeView === "chat") {
    const chat = document.getElementById("chat-container");
    if (chat) chat.scrollTop = chat.scrollHeight;
  }
}

function startFrameMonitor() {
  if (frameMonitorStarted || document.body.classList.contains("low-performance")) return;
  frameMonitorStarted = true;
  let previous = 0;
  let frames = 0;
  let slowFrames = 0;
  const tick = time => {
    if (document.hidden || !unlocked) { frameMonitorStarted = false; return; }
    if (previous) {
      const delta = time - previous;
      frames += 1;
      if (delta > 28) slowFrames += 1;
      if (slowFrames >= 8 || (frames >= 45 && slowFrames / frames > 0.12)) {
        document.body.classList.add("low-performance");
        frameMonitorStarted = false;
        return;
      }
      if (frames >= 90) { frameMonitorStarted = false; return; }
    }
    previous = time;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function initialise() {
  createIcons({ icons });
  const identity = getIdentity();
  if (hasLocalPin() && (identity === "Hamid" || identity === "Nur")) {
    setScreen("login");
    updateIdentityLabels(identity);
  } else {
    setScreen("setup");
    identityStep.classList.remove("hidden");
    pinSetupStep.classList.add("hidden");
  }
  document.querySelectorAll("[data-identity]").forEach(button =>
    button.addEventListener("click", () => chooseIdentity(button.dataset.identity))
  );
  document.getElementById("back-to-identity").addEventListener("click", () => {
    selectedIdentity = null;
    pinSetupStep.classList.add("hidden");
    identityStep.classList.remove("hidden");
    newPinInput.value = "";
    confirmPinInput.value = "";
    showMessage(pinSetupFeedback, "");
  });
  loginForm.addEventListener("submit", handleLogin);
  pinSetupForm.addEventListener("submit", handlePinSetup);
  document.getElementById("lock-app-button").addEventListener("click", handleLockButton);
  window.addEventListener("resize", updateKeyboardInset);
  window.visualViewport?.addEventListener("resize", updateKeyboardInset);
  window.visualViewport?.addEventListener("scroll", updateKeyboardInset);
  document.addEventListener("visibilitychange", () => { if (document.hidden) lockApplication(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") navigateBack(); });
  if (Capacitor.isNativePlatform()) {
    App.addListener("backButton", () => navigateBack()).catch(error => {
      showMessage(loginFeedback, "Navigasi Back Android belum terpasang: " + error.message);
    });
    App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) lockApplication();
    }).catch(error => {
      showMessage(loginFeedback, "Penguncian saat background belum terpasang: " + error.message);
    });
  }
}

window.switchView = switchView;
window.ourSpace = Object.freeze({ lockApplication, switchView });
initialise();
