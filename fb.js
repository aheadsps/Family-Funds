// Слой данных: Firebase Auth (вход по почте) + Firestore (общая база семьи).
// Записи сохраняются на телефоне сразу и уходят на сервер, когда есть сеть.
import { firebaseConfig } from './firebase-config.js';

const V = '10.12.2';
const B = `https://www.gstatic.com/firebasejs/${V}/`;
export const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

let A, F, auth, db, hid = null;
let onError = () => {};
export function setErrorHandler(fn) { onError = fn; }

export async function init() {
  const [appMod, a, f] = await Promise.all([
    import(B + 'firebase-app.js'), import(B + 'firebase-auth.js'), import(B + 'firebase-firestore.js')
  ]);
  A = a; F = f;
  const app = appMod.initializeApp(firebaseConfig);
  auth = a.initializeAuth(app, { persistence: [a.indexedDBLocalPersistence, a.browserLocalPersistence] });
  try {
    db = f.initializeFirestore(app, { localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }) });
  } catch (e) {
    db = f.getFirestore(app);
  }
}

/* ---------- вход ---------- */
export function onAuth(cb) {
  return A.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email, name: u.displayName || '' } : null));
}
export function signIn(email, pw) { return A.signInWithEmailAndPassword(auth, email, pw); }
export async function signUp(email, pw, name) {
  const cred = await A.createUserWithEmailAndPassword(auth, email, pw);
  if (name) { try { await A.updateProfile(cred.user, { displayName: name }); } catch (e) {} }
  return cred;
}
export function resetPassword(email) { return A.sendPasswordResetEmail(auth, email); }
export function signOut() { hid = null; return A.signOut(auth); }

/* ---------- семья ---------- */
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  const b = new Uint8Array(8); crypto.getRandomValues(b);
  return Array.from(b, x => ALPH[x % ALPH.length]).join('');
}
const d = (...p) => F.doc(db, ...p);

export async function getProfile(uid) {
  const s = await F.getDoc(d('users', uid));
  return s.exists() ? s.data() : null;
}

export async function createHousehold(uid, name, seed) {
  const ref = F.doc(F.collection(db, 'households'));
  const code = makeCode();
  await F.setDoc(ref, { owner: uid, inviteCode: code, createdAt: Date.now() });
  await F.setDoc(d('households', ref.id, 'members', uid), { name: name || '', joinedAt: Date.now() });
  await F.setDoc(d('invites', code), { hid: ref.id });
  await F.setDoc(d('users', uid), { hid: ref.id, name: name || '' });
  if (seed) {
    const items = [];
    for (const f of seed.funds || []) items.push(['funds', f]);
    for (const t of seed.tx || []) items.push(['tx', { ...t, by: uid }]);
    for (const w of seed.wishes || []) items.push(['wishes', { ...w, by: uid }]);
    for (let i = 0; i < items.length; i += 400) {
      const batch = F.writeBatch(db);
      for (const [col, item] of items.slice(i, i + 400)) {
        const { id, ...data } = item;
        batch.set(id ? d('households', ref.id, col, id) : F.doc(F.collection(db, 'households', ref.id, col)), data);
      }
      await batch.commit();
    }
  }
  return ref.id;
}

export async function joinHousehold(uid, name, code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let inv;
  try { inv = await F.getDoc(d('invites', code)); } catch (e) { throw { code: 'bad-code' }; }
  if (!inv.exists()) throw { code: 'bad-code' };
  const h = inv.data().hid;
  await F.setDoc(d('households', h, 'members', uid), { name: name || '', code, joinedAt: Date.now() });
  await F.setDoc(d('users', uid), { hid: h, name: name || '' });
  return h;
}

export async function newInvite(oldCode) {
  const code = makeCode();
  await F.setDoc(d('invites', code), { hid });
  await F.updateDoc(d('households', hid), { inviteCode: code });
  if (oldCode) { try { await F.deleteDoc(d('invites', oldCode)); } catch (e) {} }
  return code;
}

export function setName(uid, name) {
  fire(F.setDoc(d('households', hid, 'members', uid), { name }, { merge: true }));
  fire(F.setDoc(d('users', uid), { name }, { merge: true }));
  return Promise.resolve();
}

/* ---------- подписки ---------- */
export function useHousehold(id) { hid = id; }
export function watchHousehold(cb, err) {
  return F.onSnapshot(d('households', hid), s => cb(s.exists() ? s.data() : null), err);
}
export function watchCol(col, cb, err) {
  return F.onSnapshot(F.collection(db, 'households', hid, col), snap => cb(snap.docs.map(x => ({ id: x.id, ...x.data() }))), err);
}

/* ---------- записи ----------
   Возвращают управление сразу после локального сохранения: без сети запись
   ждёт в очереди и уходит на сервер сама. Ошибки сервера идут в onError. */
function fire(p) { p.catch(e => onError(e)); return Promise.resolve(); }
export function add(col, data) { const ref = F.doc(F.collection(db, 'households', hid, col)); fire(F.setDoc(ref, data)); return Promise.resolve(ref.id); }
export function set(col, id, data) { return fire(F.setDoc(d('households', hid, col, id), data)); }
export function setHousehold(data) { return fire(F.updateDoc(d('households', hid), data)); }
export function update(col, id, data) { return fire(F.updateDoc(d('households', hid, col, id), data)); }
export function del(col, id) { return fire(F.deleteDoc(d('households', hid, col, id))); }
