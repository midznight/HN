const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const main = readFileSync(resolve(root, "src/main.js"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const capacitor = readFileSync(resolve(root, "capacitor.config.json"), "utf8");

test("production entrypoint has no third-party runtime scripts or stylesheets", () => {
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']https?:\/\//i);
  assert.doesNotMatch(html, /images\.unsplash\.com|fonts\.googleapis\.com|cdn\.tailwindcss\.com|unpkg\.com/i);
});
test("active UI has no old fake counters or a literal PIN check", () => {
  assert.doesNotMatch(html, /pin\s*===\s*['"]\d{4}['"]/i);
  assert.doesNotMatch(html, /1,024 Days|Anniversary in 42 days|42 Jam|50GB|Enter PIN \(/i);
  assert.doesNotMatch(html, /onsubmit\s*=\s*["']handleLogin/i);
});
test("first-use setup captures identity and hashes PIN locally", () => {
  assert.match(html, /data-identity="Hamid"/);
  assert.match(html, /data-identity="Nur"/);
  assert.match(html, /id="pin-setup-form"/);
  assert.match(main, /PBKDF2/);
  assert.match(main, /deriveBits/);
  assert.match(main, /our-space\.pin-hash\.v1/);
  assert.match(main, /our-space\.pin-salt\.v1/);
  assert.doesNotMatch(main, /localStorage\.setItem\([^,]+,\s*pin\s*\)/i);
});
test("features waiting for later phases are explicit empty states", () => {
  assert.match(html, /Chat belum aktif/);
  assert.match(html, /Belum ada riwayat/);
  assert.match(html, /Brankas belum terhubung/);
  assert.match(html, /Fase 8 opsional/);
});
test("direct runtime dependencies are version-pinned", () => {
  assert.equal(packageJson.dependencies["@capacitor/core"], "8.5.3");
  assert.equal(packageJson.dependencies["@capacitor/app"], "8.1.2");
  assert.equal(packageJson.dependencies["lucide"], "1.59.0");
  assert.equal(packageJson.dependencies["@fontsource/inter"], "5.3.0");
  assert.equal(packageJson.dependencies["@fontsource/playfair-display"], "5.3.0");
  assert.equal(packageJson.devDependencies["tailwindcss"], "3.4.19");
  assert.equal(packageJson.devDependencies["vite"], "8.3.4");
  assert.match(capacitor, /"webDir": "dist"/);
});
