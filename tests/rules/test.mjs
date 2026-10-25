import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId: 'ff-test', firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 } });
const results = []; let failed = 0;
async function t(name, fn, expectPass = true) {
  await env.clearFirestore();
  try { await fn(); results.push(['ok  ', name]); } catch (e) { failed++; results.push(['FAIL', name + ' :: ' + String(e.message).split('\n')[0].slice(0, 90)]); }
}
const as = u => env.authenticatedContext(u).firestore();
// помощник: семья h1, владелец alice, участник bob (через админ-обход правил)
async function seed() { await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
  await setDoc(doc(d,'households/h1'), { owner:'alice', inviteCode:'CODE1111' });
  await setDoc(doc(d,'households/h1/members/alice'), { name:'A' });
  await setDoc(doc(d,'households/h1/members/bob'), { name:'B', code:'CODE1111' });
  await setDoc(doc(d,'invites/CODE1111'), { hid:'h1' });
  await setDoc(doc(d,'households/h1/funds/f1'), { name:'x' }); }); }

await t('приложение: владелец создаёт семью (как createHousehold)', async () => { const d = as('alice');
  await assertSucceeds(setDoc(doc(d,'households/h9'), { owner:'alice', inviteCode:'AAAA2222', createdAt:1 }));
  await assertSucceeds(setDoc(doc(d,'households/h9/members/alice'), { name:'A', joinedAt:1 }));
  await assertSucceeds(setDoc(doc(d,'invites/AAAA2222'), { hid:'h9' }));
  await assertSucceeds(setDoc(doc(d,'users/alice'), { hid:'h9', name:'A' }));
  await assertSucceeds(setDoc(doc(d,'households/h9/funds/f1'), { name:'Налог', kind:'percent', value:13 })); });
await t('приложение: присоединение по коду', async () => { await seed(); const d = as('carol');
  await assertSucceeds(getDoc(doc(d,'invites/CODE1111')));
  await assertSucceeds(setDoc(doc(d,'households/h1/members/carol'), { name:'C', code:'CODE1111', joinedAt:1 }));
  await assertSucceeds(setDoc(doc(d,'users/carol'), { hid:'h1', name:'C' }));
  await assertSucceeds(getDoc(doc(d,'households/h1/funds/f1'))); });
await t('приложение: участник пишет фонды, траты, желания, настройки семьи', async () => { await seed(); const d = as('bob');
  await assertSucceeds(setDoc(doc(d,'households/h1/funds/f2'), { name:'Еда', alloc:{ a:1, b:2 } }));
  await assertSucceeds(setDoc(doc(d,'households/h1/tx/t1'), { type:'income', amount:100, alloc:{ f1:50 }, by:'bob' }));
  await assertSucceeds(updateDoc(doc(d,'households/h1/tx/t1'), { note:'ok' }));
  await assertSucceeds(setDoc(doc(d,'households/h1/wishes/w1'), { name:'w', price:5 }));
  await assertSucceeds(deleteDoc(doc(d,'households/h1/wishes/w1')));
  await assertSucceeds(updateDoc(doc(d,'households/h1'), { debtStrategy:'avalanche', expectedIncome:100000, accounts:{ a1:{ name:'Карта' } }, setupDone:true }));
  await assertSucceeds(setDoc(doc(d,'households/h1/members/bob'), { name:'Боб' }, { merge:true })); });
await t('приложение: новый код приглашения и удаление старого', async () => { await seed(); const d = as('bob');
  await assertSucceeds(setDoc(doc(d,'invites/NEWC3333'), { hid:'h1' }));
  await assertSucceeds(updateDoc(doc(d,'households/h1'), { inviteCode:'NEWC3333' }));
  await assertSucceeds(deleteDoc(doc(d,'invites/CODE1111'))); });
await t('чужой не читает и не пишет данные семьи', async () => { await seed(); const d = as('eve');
  await assertFails(getDoc(doc(d,'households/h1/funds/f1')));
  await assertFails(setDoc(doc(d,'households/h1/funds/f9'), { name:'x' }));
  await assertFails(getDoc(doc(d,'households/h1')));
  await assertFails(setDoc(doc(d,'households/h1/members/eve'), { name:'E', code:'WRONG' }));
  await assertFails(getDoc(doc(as(null ?? 'x'),'users/alice'))); });
await t('нельзя создать семью на чужого владельца', async () => { await assertFails(setDoc(doc(as('eve'),'households/h5'), { owner:'alice' })); });
await t('НОВОЕ: участник не может сменить владельца семьи', async () => { await seed(); await assertFails(updateDoc(doc(as('bob'),'households/h1'), { owner:'bob' })); });
await t('НОВОЕ: участник не может удалить другого участника', async () => { await seed(); await assertFails(deleteDoc(doc(as('bob'),'households/h1/members/alice'))); });
await t('НОВОЕ: владелец может убрать участника, участник может выйти сам', async () => { await seed();
  await assertSucceeds(deleteDoc(doc(as('alice'),'households/h1/members/bob')));
  await seed(); await assertSucceeds(deleteDoc(doc(as('bob'),'households/h1/members/bob'))); });
await t('НОВОЕ: документ с более чем 60 полями отклоняется', async () => { await seed();
  const big = Object.fromEntries(Array.from({ length: 61 }, (_, i) => ['k'+i, i]));
  await assertFails(setDoc(doc(as('bob'),'households/h1/tx/big'), big));
  const ok = Object.fromEntries(Array.from({ length: 60 }, (_, i) => ['k'+i, i]));
  await assertSucceeds(setDoc(doc(as('bob'),'households/h1/tx/ok'), ok)); });
console.log(results.map(r => r.join(' ')).join('\n')); console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await env.cleanup(); process.exit(0);
