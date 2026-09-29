// In-memory Firestore fake shared through globalThis.__cloud so tests can play "another device".
const cloud = (globalThis.__cloud = globalThis.__cloud || { docs: new Map(), listeners: new Map(), stats: { transactions: 0, txWrites: 0, sets: 0, gets: 0 }, failNext: null });
const pathOf = (ref) => ref.path;
function snapshotOf(path) {
  const data = cloud.docs.get(path);
  return { exists: () => data !== undefined, data: () => (data === undefined ? undefined : JSON.parse(JSON.stringify(data))) };
}
function notify(path) {
  (cloud.listeners.get(path) || []).forEach((cb) => setTimeout(() => cb(snapshotOf(path)), 0));
}
export function getFirestore() { return {}; }
export function doc(db, col, id) { return { path: col + "/" + id }; }
export async function setDoc(ref, data) {
  if (cloud.failNext) { const e = cloud.failNext; cloud.failNext = null; throw e; }
  cloud.stats.sets++;
  cloud.docs.set(pathOf(ref), JSON.parse(JSON.stringify(data)));
  notify(pathOf(ref));
}
export async function getDoc(ref) { cloud.stats.gets++; await Promise.resolve(); return snapshotOf(pathOf(ref)); }
export function onSnapshot(ref, cb) {
  const p = pathOf(ref);
  if (!cloud.listeners.has(p)) cloud.listeners.set(p, []);
  cloud.listeners.get(p).push(cb);
  setTimeout(() => cb(snapshotOf(p)), 0);
  return () => { cloud.listeners.set(p, cloud.listeners.get(p).filter((x) => x !== cb)); };
}
let txChain = Promise.resolve();
export function runTransaction(db, fn) {
  const run = txChain.then(async () => {
    if (cloud.failNext) { const e = cloud.failNext; cloud.failNext = null; throw e; }
    cloud.stats.transactions++;
    const writes = [];
    const tx = { get: async (ref) => snapshotOf(pathOf(ref)), set: (ref, data) => writes.push([pathOf(ref), data]) };
    const out = await fn(tx);
    writes.forEach(([p, d]) => { cloud.stats.txWrites++; cloud.docs.set(p, JSON.parse(JSON.stringify(d))); notify(p); });
    return out;
  });
  txChain = run.catch(() => {});
  return run;
}
