import { readFile, writeFile } from "node:fs/promises";

const manifestPath = "android/app/src/main/AndroidManifest.xml";
const manifest = await readFile(manifestPath, "utf8");
const activityPattern = /<activity\b(?=[^>]*android:name="[^"]*MainActivity")[^>]*>/;
const match = manifest.match(activityPattern);
if (!match) {
  throw new Error("MainActivity is missing from AndroidManifest.xml; keyboard resizing was not configured.");
}
if (!match[0].includes("android:windowSoftInputMode=")) {
  const updatedTag = match[0].replace(/\s*\/?>$/, tagEnd => ` android:windowSoftInputMode="adjustResize"${tagEnd}`);
  await writeFile(manifestPath, manifest.replace(match[0], updatedTag), "utf8");
}
console.log("Android MainActivity keyboard resizing is configured for adjustResize.");
