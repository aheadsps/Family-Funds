// Тесты расчётов. Запуск: node --test tests/calc  (без зависимостей, нужен Node 20+)
// Берём из app.js только блок расчётов (до функции render) и блоки долгов и прогноза мастера.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const L = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8').split('\n');
const idx = re => { const i = L.findIndex(l => re.test(l)); assert.ok(i >= 0, 'не найдено: ' + re); return i; };
const block = (from, to) => L.slice(idx(from), idx(to)).join('\n');
const core = L.slice(3, idx(/^\/\* -+ render -+ \*\//)).join('\n');
const debts = block(/^function orderDebts/, /^function debtSummary/);
const eta = block(/^function etaSim/, /^function wzMetrics/);
const pay = block(/^function isoD/, /^function icsEsc/);
const shape = block(/^const RULE_UI/, /^function ruleHint/);
const A = new Function('ic', core + '\n' + debts + '\n' + eta + '\n' + pay + '\n' + shape + '\nreturn {S,stats,fstate,distribute,monthPicture,curMonth,simulate,etaSim,dlPlan,upcoming,fundShape,fundFields,tips};')(() => '');
const { S, stats, fstate, distribute, monthPicture, curMonth, simulate, etaSim, dlPlan, upcoming, fundShape, fundFields, tips } = A;

const m = curMonth(), day = m + '-10';
const setup = (funds, tx = []) => { S.funds = funds.map((f, i) => ({ order: i, ...f })); S.tx = tx; S.household = {}; S.wishes = []; };
const total = d => d.rows.reduce((s, r) => s + r.give, 0) + d.free;
const give = (d, id) => d.rows.find(r => r.f.id === id).give;
const food = { id: 'food', name: 'Еда', kind: 'monthly', value: 30000 };
const comm = { id: 'com', name: 'Связь', kind: 'monthly', value: 5000 };
const tax = { id: 'tax', name: 'Налог', kind: 'percent', value: 6 };
const rest = { id: 'rest', name: 'Накопления', kind: 'rest' };

test('доход 20 000 делится между обязательными пропорционально, налог берётся первым', () => {
  setup([tax, { id: 'rent', name: 'Ипотека', kind: 'monthly', value: 40000 }, food, comm, rest]);
  const d = distribute(20000, true);
  assert.equal(give(d, 'tax'), 1200);
  assert.equal(total(d), 20000);
  assert.ok(give(d, 'rent') > give(d, 'food') && give(d, 'food') > give(d, 'com'));
});

test('просроченный срок не забирает все деньги у еды и связи', () => {
  const overdue = { id: 'od', name: 'Просрочка', kind: 'debt', value: 500000, minPay: 5000, deadline: '2020-01' };
  setup([tax, food, comm, overdue, rest]);
  const d = distribute(100000, true);
  assert.equal(give(d, 'food'), 30000);
  assert.equal(give(d, 'com'), 5000);
  assert.equal(monthPicture().stillNet, 40000);
});

test('доход частями: обязательное закрывается ровно один раз, лишнее идёт сверх плана', () => {
  setup([tax, food, comm, { id: 'd1', name: 'Кредитка', kind: 'debt', value: 200000, minPay: 10000 }, rest]);
  let tid = 0;
  for (const a of [20000, 20000, 60000]) {
    const d = distribute(a, true); const alloc = {};
    d.rows.forEach(r => { if (r.give) alloc[r.f.id] = r.give; }); if (d.free) alloc._free = d.free;
    S.tx.push({ id: 't' + (++tid), type: 'income', amount: a, alloc, date: day, month: m, createdAt: tid });
  }
  const { get } = stats();
  assert.equal(fstate(S.funds[1], get).allocM, 30000);
  assert.equal(fstate(S.funds[2], get).allocM, 5000);
  assert.equal(monthPicture().stillNet, 0);
});

test('перерасход фонда месяца закрывается следующим доходом в первую очередь', () => {
  setup([food, rest], [{ id: 'e', type: 'expense', amount: 35000, fundId: 'food', from: 'food', date: day, month: m, createdAt: 1 }]);
  assert.equal(fstate(S.funds[0], stats().get).balance, -35000);
  assert.equal(give(distribute(100000, true), 'food'), 35000);   // вернуть баланс в ноль закрывает и месячную норму 30 000
});

test('деньги не теряются и не создаются: 3000 случайных наборов фондов', () => {
  const kinds = ['monthly', 'goal', 'debt', 'percent', 'reward', 'rest']; const r = n => Math.floor(Math.random() * n);
  for (let it = 0; it < 3000; it++) {
    const fs_ = Array.from({ length: 1 + r(7) }, (_, i) => { const k = kinds[r(6)];
      return { id: 'f' + i, name: 'F' + i, kind: k, value: k === 'percent' ? r(30) : k === 'reward' ? r(20) : 1000 * (1 + r(80)), minPay: k === 'debt' ? r(3) * 3000 : 0, cap: k === 'goal' && r(2) ? 1000 * r(8) : 0, pct: (k === 'goal' || k === 'debt') && r(4) === 0 ? 1 + r(20) : 0, deadline: r(4) === 0 ? ['2026-12', '2027-06', '2020-01'][r(3)] : '' }; });
    setup(fs_); const amt = 1000 * (1 + r(200)); const d = distribute(amt, r(2) === 0);
    assert.ok(Math.abs(total(d) - amt) <= 1, 'сумма не сходится: ' + JSON.stringify(fs_));
    assert.ok(d.rows.every(x => x.give >= 0) && d.free >= 0);
    for (const x of d.rows) if (x.f.kind === 'debt') assert.ok(x.give <= fstate(x.f, stats().get).remaining + 1, 'переплата долга');
  }
});

test('прогноз мастера по долгам учитывает проценты и совпадает с расчётом стратегий', () => {
  const ds = [{ id: 'd1', name: 'Кредитка', kind: 'debt', value: 200000, rate: 30, minPay: 10000 }, { id: 'd2', name: 'Потреб', kind: 'debt', value: 300000, rate: 18, minPay: 8000 }];
  const funds = [...ds, { id: 'm', kind: 'monthly', value: 70000 }];
  const e = etaSim(funds, 100000, f => +f.value || 0);
  const sim = simulate('custom', 30000, ds.map(f => ({ f, bal: f.value, rate: f.rate, min: f.minPay })));
  assert.equal(Math.max(e.d1, e.d2), sim.months);
});

const inMonths = k => { const d = new Date(); d.setMonth(d.getMonth() + k - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

test('план по сроку для долга со ставкой даёт аннуитет и закрывает долг ровно к сроку', () => {
  const debt = { id: 'd', name: 'Кредит', kind: 'debt', value: 120000, rate: 24, deadline: inMonths(12) };
  setup([debt]);
  const d = dlPlan(S.funds[0], fstate(S.funds[0], stats().get));
  assert.equal(d.ml, 12);
  const r = 0.02, expect = 120000 * r / (1 - Math.pow(1 + r, -12));
  assert.ok(Math.abs(d.perMonth - expect) < 1, `${d.perMonth} против ${expect}`);
  const sim = simulate('custom', d.perMonth + 0.5, [{ f: debt, bal: 120000, rate: 24, min: 0 }]);
  assert.ok(sim.months <= 12, 'закрылся за ' + sim.months);
});

test('план по сроку без ставки остался равными долями', () => {
  setup([{ id: 'd', name: 'Другу', kind: 'debt', value: 120000, rate: 0, deadline: inMonths(12) }]);
  assert.equal(Math.round(dlPlan(S.funds[0], fstate(S.funds[0], stats().get)).perMonth), 10000);
});

test('платёж по долгу считается оплаченным, когда деньги внесены в банк, а не когда отложены', () => {
  const day = new Date().getDate();
  const debt = { id: 'd', name: 'Кредитка', kind: 'debt', value: 100000, minPay: 10000, payDay: day };
  setup([debt, rest]);
  S.tx.push({ id: 'i', type: 'income', amount: 50000, alloc: { d: 10000, rest: 40000 }, date: m + '-01', month: m, createdAt: 1 });
  let L = upcoming(7);
  assert.equal(L.length, 1, 'отложенные деньги ещё не оплата');
  assert.equal(L[0].paidNow, false);
  assert.equal(L[0].enough, true);
  assert.equal(Math.round(L[0].amount), 10000);
  S.tx.push({ id: 'mv', type: 'move', from: 'acc', to: '', debt: 'd', amount: 10000, date: day10(), month: m, createdAt: 2 });
  assert.equal(upcoming(7).length, 0, 'после внесения в банк платёж закрыт');
});
function day10() { return m + '-10'; }

test('окно фонда: все сочетания «как получает деньги / долг / накопить» сохраняются и читаются обратно', () => {
  const vals = { amt: 5000, pct: 10, tgt: 100000, day: 5, rate: 12, rateSet: true, tax: false, dl: '' };
  for (const rule of ['monthly', 'percent', 'rest']) for (const debt of [false, true]) for (const accum of [false, true]) {
    const st = { rule, debt, accum, reward: false };
    const back = fundShape(fundFields(st, vals));
    assert.deepEqual({ rule: back.rule, debt: back.debt, accum: back.accum }, { rule, debt, accum }, JSON.stringify(st));
  }
  const rw = fundFields({ rule: 'percent', debt: false, accum: false, reward: true }, vals);
  assert.equal(rw.kind, 'reward'); assert.equal(rw.value, 10); assert.equal(fundShape(rw).reward, true);
  // долг, который закрывается одним платежом: цель с флагом долга, без ставки
  const lump = fundFields({ rule: 'rest', debt: true, accum: true, reward: false }, { ...vals, rate: 0, rateSet: false });
  assert.equal(lump.kind, 'goal'); assert.equal(lump.isDebt, true); assert.equal(lump.value, 100000); assert.equal(lump.rate, 0);
});

test('цель с правилом «процент» берёт свой процент с каждого дохода и не больше, чем осталось накопить', () => {
  setup([{ id: 'g', name: 'Отпуск', kind: 'goal', value: 15000, pct: 10 }, food, rest]);
  const d = distribute(100000, true);
  assert.equal(give(d, 'g'), 10000);
  assert.equal(give(d, 'food'), 30000);
  // остаток цели меньше процента: берёт только остаток
  setup([{ id: 'g', name: 'Отпуск', kind: 'goal', value: 15000, pct: 10, start: 9000 }, food, rest]);
  assert.equal(give(distribute(100000, true), 'g'), 6000);
  // сверх процента из свободных денег цель не получает
  setup([{ id: 'g', name: 'Отпуск', kind: 'goal', value: 500000, pct: 10 }, rest]);
  const d2 = distribute(100000, true);
  assert.equal(give(d2, 'g'), 10000); assert.equal(give(d2, 'rest'), 90000);
});

test('долг с правилом «процент» гасится процентом с дохода и не переплачивается', () => {
  setup([{ id: 'd', name: 'Рассрочка', kind: 'debt', value: 8000, pct: 10 }, rest]);
  assert.equal(give(distribute(100000, true), 'd'), 8000);
  assert.equal(give(distribute(50000, true), 'd'), 5000);
});

test('процентные цель и долг входят в процент с дохода для расчёта «сколько ещё заработать»', () => {
  setup([food, { id: 'g', name: 'Отпуск', kind: 'goal', value: 500000, pct: 10 }, rest]);
  const P = monthPicture();
  assert.equal(P.pct, 10);
  assert.equal(Math.round(P.stillGross), Math.round(30000 / 0.9));
});

test('долг на одном платеже: подсказка «накоплено» предлагает записать платёж', () => {
  setup([{ id: 'l', name: 'Рассрочка (приставы)', kind: 'goal', isDebt: true, value: 50000, start: 50000 }, rest]);
  const t = tips(monthPicture()).find(x => x.title.includes('накоплено'));
  assert.ok(t, 'нет подсказки');
  assert.equal(t.act.act, 'pay-lump');
});
