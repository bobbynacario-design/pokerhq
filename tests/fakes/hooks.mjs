// Node module-loader hooks: map the Firebase CDN URLs that js/data/sync.js imports
// onto the in-memory fakes next to this file, so the real sync.js can run in tests.
const MAP = {
  "firebase-app.js": "./firebase-app.mjs",
  "firebase-firestore.js": "./firebase-firestore.mjs",
  "firebase-auth.js": "./firebase-auth.mjs",
  "firebase-functions.js": "./firebase-functions.mjs",
};
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("https://www.gstatic.com/firebasejs/")) {
    const file = specifier.split("/").pop();
    if (MAP[file]) return { url: new URL(MAP[file], import.meta.url).href, shortCircuit: true };
    throw new Error("No fake for " + specifier);
  }
  return nextResolve(specifier, context);
}
