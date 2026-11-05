// Тесты расчётов. Запуск: node --test tests/calc  (без зависимостей, нужен Node 20+)
// Берём из app.js только блок расчётов (до функции render) и блоки долгов и прогноза мастера.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const L = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8').split('\n');
const idx = re => { const i = L.findIndex(l => re.test(l)); assert.ok(i >= 0, 'не найдено: ' + re); return i; };
const block = (from, to) => L.slice(idx(from), idx(to)).join('\n');
const core = L.slice(3, idx(/^\/\* -+ render -+ \*\//)).join('\n');
const debts = block(/^const STRATS=/, /^function debtSummary/);
const eta = block(/^function etaSim/, /^function wzMetrics/);
const pay = block(/^function isoD/, /^function icsEsc/);
const shape = block(/^const RULE_UI/, /^function ruleHint/);
const pend = block(/^function accounts\(\)/, /^function moveTitle/);
const order = block(/^const FTIERS=/, /^function renderFunds/) + '\n' + block(/^function reorderGroup/, /^async function moveFund/);
const A = new Function('ic', core + '\n' + debts + '\n' + eta + '\n' + pay + '\n' + shape + '\n' + pend + '\n' + order + '\nreturn {weekStats,weekDiff,weekQuestion,weekText,rewardDue,quickSpends,noteFund,debtList,debtAdvice,debtTip,canPause,checkFunds,checkDays,checkedSet,paused,cutTip,incomeBasis,shiftMonth,reorderGroup,fundTier,debtPending,debtBank,reconcile,accBalances,S,stats,fstate,distribute,monthPicture,curMonth,simulate,etaSim,dlPlan,upcoming,fundShape,fundFields,tips,reallocIncome,reqParts,planCheck,debtBudget};')(() => '');
const { weekStats, weekDiff, weekQuestion, weekText, rewardDue, quickSpends, noteFund, debtList, debtAdvice, debtTip, canPause, checkFunds, checkDays, checkedSet, paused, cutTip, incomeBasis, shiftMonth, reorderGroup, fundTier, debtPending, debtBank, reconcile, accBalances, S, stats, fstate, distribute, monthPicture, curMonth, simulate, etaSim, dlPlan, upcoming, fundShape, fundFields, tips, reallocIncome, reqParts, planCheck, debtBudget } = A;

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

// доход записан и разложен как в приложении
function addIncome(amount, taxable = true) {
  const d = distribute(amount, taxable); const alloc = {};
  d.rows.forEach(r => { if (r.give) alloc[r.f.id] = r.give; }); if (d.free) alloc._free = d.free;
  const t = { id: 'inc' + S.tx.length, type: 'income', amount, taxable, alloc, date: m + '-03', month: m, createdAt: S.tx.length + 1 };
  S.tx.push(t); return t;
}
const taxF = { id: 'tax', name: 'Налог', kind: 'percent', value: 6, taxOnly: true };
const ccF = { id: 'cc', name: 'Кредитка', kind: 'debt', value: 200000, minPay: 10000 };
const sumA = a => Object.values(a).reduce((x, y) => x + y, 0);

test('пришло меньше: налог пересчитан, разница снята с накоплений и сверх плана, еда и минимальный платёж не тронуты', () => {
  setup([taxF, food, ccF, rest]);
  const t = addIncome(100000);
  const na = reallocIncome(t, 85000, true);
  assert.equal(sumA(na), 85000);
  assert.equal(na.tax, 5100);
  assert.equal(na.food, 30000);
  assert.ok(na.cc >= 10000, 'минимальный платёж по долгу на месте');
  assert.ok(na.cc < t.alloc.cc, 'сокращено досрочное погашение');
});

test('пришло меньше: награды уменьшаются пропорционально доходу', () => {
  setup([taxF, food, ccF, { id: 'rw', name: 'Награды', kind: 'reward', value: 10 }, rest]);
  const t = addIncome(100000);
  const na = reallocIncome(t, 85000, true);
  assert.equal(sumA(na), 85000);
  assert.equal(na.rw, Math.round(t.alloc.rw * 0.85));
});

test('пришло сильно меньше: после всего сверх плана обязательное режется пропорционально', () => {
  setup([taxF, food, comm, rest]);
  const t = addIncome(100000);
  const na = reallocIncome(t, 20000, true);
  assert.equal(sumA(na), 20000);
  assert.equal(na.tax, 1200);
  assert.ok(!na.rest, 'накопления сняты первыми');
  assert.ok(na.food > na.com && Math.abs(na.food / na.com - 6) < 0.1, 'еда и связь урезаны в пропорции 30 000 : 5 000');
});

test('пришло больше: добавка разложена как обычный доход, уже заполненное не переполняется', () => {
  setup([taxF, food, ccF, rest]);
  const t = addIncome(50000);
  const na = reallocIncome(t, 120000, true);
  assert.equal(sumA(na), 120000);
  assert.equal(na.tax, 7200);
  assert.equal(na.food, 30000);
});

test('сняли галочку «облагается налогом»: налог возвращается в раскладку', () => {
  setup([taxF, food, rest]);
  const t = addIncome(100000);
  const na = reallocIncome(t, 100000, false);
  assert.ok(!na.tax);
  assert.equal(sumA(na), 100000);
  assert.equal(na.food, 30000);
});

test('изменение суммы дохода: деньги сходятся до рубля, отрицательных частей нет (2000 случаев)', () => {
  const kinds = ['monthly', 'goal', 'debt', 'percent', 'reward', 'rest']; const r = n => Math.floor(Math.random() * n);
  for (let it = 0; it < 2000; it++) {
    const fs_ = Array.from({ length: 1 + r(6) }, (_, i) => { const k = kinds[r(6)];
      return { id: 'f' + i, name: 'F' + i, kind: k, value: k === 'percent' ? r(30) : k === 'reward' ? r(20) : 1000 * (1 + r(80)), minPay: k === 'debt' ? r(3) * 3000 : 0, taxOnly: k === 'percent' && r(2) === 0, pct: (k === 'goal' || k === 'debt') && r(4) === 0 ? 1 + r(20) : 0 }; });
    setup(fs_); for (let j = 0; j < r(3); j++) addIncome(1000 * (1 + r(100)));
    const t = addIncome(1000 * (1 + r(150)));
    const amt = 1000 * (1 + r(200)), tx = r(2) === 0;
    const na = reallocIncome(t, amt, tx);
    assert.equal(sumA(na), amt, JSON.stringify({ fs_, amt }));
    assert.ok(Object.values(na).every(v => v > 0));
  }
});

test('«Уже оплачено»: просроченный платёж уходит из ближайших, фонды и деньги не меняются', () => {
  const car = { id: 'car', name: 'Кредит жены', kind: 'monthly', value: 15000, payDay: 1 };
  setup([car, rest]);
  const L0 = upcoming(7);
  assert.ok(L0.some(x => x.f.id === 'car'), 'платёж виден');
  S.tx.push({ id: 'pm', type: 'paidmark', fundId: 'car', amount: 15000, date: m + '-27', month: m, createdAt: 5 });
  assert.ok(upcoming(7).every(x => !(x.f.id === 'car' && x.overdue)), 'просроченного платежа больше нет');
  assert.equal(monthPicture().stillNet, 0, 'обязательство месяца по оплаченному платежу закрыто');
  assert.equal(fstate(S.funds[0], stats().get).balance, 0, 'баланс фонда не изменился, в минус не ушёл');
  // следующий доход не отдаёт деньги фонду, который уже оплачен
  assert.equal(distribute(50000, true).rows.find(r => r.f.id === 'car').give, 0);
});

test('«Уже оплачено» для долга: ожидание платежа в «Ресурсах» закрывается', () => {
  const debt = { id: 'd', name: 'Кредит', kind: 'debt', value: 100000, minPay: 10000, payDay: 1 };
  setup([debt, rest]); S.household = { accSince: 1 };
  S.tx.push({ id: 'i', type: 'income', amount: 50000, alloc: { d: 10000, rest: 40000 }, date: m + '-02', month: m, createdAt: 2 });
  assert.equal(debtPending().d, 10000);
  S.tx.push({ id: 'pm', type: 'paidmark', fundId: 'd', amount: 10000, date: m + '-27', month: m, createdAt: 5 });
  assert.equal(debtPending().d, undefined);
  assert.ok(upcoming(7).every(x => !(x.f.id === 'd' && x.overdue)));
});

test('«Нужно заработать»: платёж и добавка ради срока разделены, задвоения нет', () => {
  const mm = k => { const x = new Date(new Date().getFullYear(), new Date().getMonth() + k, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
  setup([
    { id: 'rent', name: 'Ипотека', kind: 'monthly', value: 40000 },
    { id: 'car', name: 'Кредит за машину', kind: 'debt', value: 500000, minPay: 20000, rate: 15, deadline: mm(1) },
    { id: 'lump', name: 'Рассрочка', kind: 'goal', isDebt: true, value: 300000, deadline: mm(0) }, rest]);
  const P = monthPicture(); const parts = S.funds.map(f => reqParts(f, P.get));
  parts.forEach(p => { assert.ok(Math.abs(p.base + p.extra - p.total) < 1e-6 && p.extra >= -1e-6); });
  assert.equal(Math.round(parts.reduce((x, p) => x + p.total, 0)), Math.round(P.stillNet), 'разбивка даёт ту же сумму');
  assert.equal(parts[0].extra, 0); assert.equal(parts[0].base, 40000);
  assert.equal(parts[1].base, 20000); assert.ok(parts[1].extra > 200000);
  assert.equal(parts[2].base, 0); assert.equal(parts[2].extra, 300000);
  assert.ok(Math.abs(P.extraNet - (parts[1].extra + parts[2].extra)) < 1e-6);
});

const mmK = k => { const x = new Date(new Date().getFullYear(), new Date().getMonth() + k, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-28'; };

test('уровни: дохода мало, сначала жизнь целиком, потом минимальные платежи, планы по срокам последними', () => {
  setup([
    { id: 'rent', name: 'Квартира', kind: 'monthly', value: 40000 }, food,
    { id: 'cc', name: 'Кредитка', kind: 'debt', value: 200000, minPay: 10000, deadline: mmK(2) },
    { id: 'pad', name: 'Подушка', kind: 'goal', value: 600000, deadline: mmK(4) }, rest]);
  let d = distribute(60000, true);
  assert.equal(give(d, 'rent') + give(d, 'food'), 60000, 'всё ушло на жизнь'); assert.equal(give(d, 'rent'), 34286, 'жизнь делит нехватку пропорционально между собой');
  assert.equal(give(d, 'cc'), 0); assert.equal(give(d, 'pad'), 0, 'планы ничего не забирают у жизни');
  d = distribute(75000, true);
  assert.equal(give(d, 'rent'), 40000); assert.equal(give(d, 'food'), 30000);
  assert.equal(give(d, 'cc'), 5000, 'на минимальный платёж то, что осталось после жизни');
  assert.equal(give(d, 'pad'), 0);
  d = distribute(90000, true);
  assert.equal(give(d, 'cc') >= 10000, true); assert.ok(give(d, 'pad') > 0, 'планы получают после жизни и минимальных платежей');
  assert.equal(total(d), 90000);
});

test('главная: «нужно заработать» = жизнь и минимальные платежи, планы отдельно', () => {
  setup([{ id: 'rent', name: 'Квартира', kind: 'monthly', value: 40000 },
    { id: 'cc', name: 'Кредитка', kind: 'debt', value: 200000, minPay: 10000, deadline: mmK(1) },
    { id: 'pad', name: 'Подушка', kind: 'goal', value: 600000, deadline: mmK(4) }, rest]);
  const P = monthPicture();
  assert.equal(P.coreNet, 50000);
  assert.ok(Math.abs(P.coreNet + P.planNet - P.stillNet) < 1);
  assert.ok(P.planNet > 200000);
});

test('реальность сроков: план больше свободных денег, просроченные по доходу фонды названы', () => {
  setup([{ id: 'rent', name: 'Квартира', kind: 'monthly', value: 40000 }, food,
    { id: 'cc', name: 'Кредитка', kind: 'debt', value: 200000, minPay: 10000, deadline: mmK(2) },
    { id: 'pad', name: 'Подушка', kind: 'goal', value: 600000, deadline: mmK(5) }, rest]);
  S.household = { expectedIncome: 150000 };
  const c = planCheck(monthPicture());
  assert.equal(c.known, true);
  assert.equal(Math.round(c.free), 70000, '150 000 − 70 000 жизнь − 10 000 минимальный платёж');
  assert.ok(c.ask > c.free); assert.equal(c.ok, false);
  assert.ok(c.late.some(x => x.f.id === 'pad'), 'подушка к сроку не успевает');
  S.household = { expectedIncome: 400000 };
  const c2 = planCheck(monthPicture());
  assert.equal(c2.ok, true); assert.equal(c2.late.length, 0, 'при большом доходе всё успевается');
});

test('перестановка в очереди долгов и целей не трогает остальные фонды и ничего не теряет', () => {
  setup([food, { id: 'a', name: 'A', kind: 'debt', value: 1 }, { id: 'tax', name: 'Налог', kind: 'percent', value: 6 },
    { id: 'b', name: 'B', kind: 'goal', value: 1 }, { id: 'c', name: 'C', kind: 'debt', value: 1 }, rest]);
  const out = reorderGroup(['c', 'a', 'b']).map(f => f.id);
  assert.deepEqual(out, ['food', 'c', 'tax', 'a', 'b', 'rest']);
  assert.equal(fundTier(S.funds[0]), 'life'); assert.equal(fundTier(S.funds[3]), 'queue');
});

test('бюджет на долги считается из дохода, а не из сроков', () => {
  setup([{ id: 'rent', name: 'Квартира', kind: 'monthly', value: 40000 }, food,
    { id: 'car', name: 'Кредит', kind: 'debt', value: 500000, minPay: 20000, rate: 15, deadline: mmK(1) }, rest]);
  S.household = { expectedIncome: 150000 };
  assert.equal(debtBudget().v, 80000, '150 000 − 70 000 жизнь = 80 000 на долги, хотя срок просит 250 000+');
});

test('проверка планов: расчёт от всего дохода по шагам (300 000 − налог − жизнь − минимальные − награды)', () => {
  setup([{ id: 'tax', name: 'Налог', kind: 'percent', value: 6, taxOnly: true }, { id: 'rent', name: 'Квартира', kind: 'monthly', value: 40000 }, food,
    { id: 'cc', name: 'Кредитка', kind: 'debt', value: 200000, minPay: 10000, deadline: mmK(2) },
    { id: 'rw', name: 'Награды', kind: 'reward', value: 10 }, rest]);
  S.household = { expectedIncome: 300000 };
  const c = planCheck(monthPicture());
  assert.equal(c.inc, 300000); assert.equal(c.taxAmt, 18000); assert.equal(c.life, 70000); assert.equal(c.mins, 10000);
  assert.equal(Math.round(c.rew), 20200, '10% от 202 000');
  assert.equal(Math.round(c.free), 181800);
  assert.equal(Math.round(c.inc - c.taxAmt - c.life - c.mins - c.rew), Math.round(c.free), 'строки сходятся с итогом');
});

/* ---------- Счета и фонды: пять сценариев (деньги «где лежат» и «для чего») ---------- */
const withCards = (funds, tx = []) => {
  setup(funds, tx);
  S.household = { accSince: 1, accounts: { c1: { name: 'Основная', kind: 'card', bal: 0, at: 0, order: 1 }, c2: { name: 'Вторая', kind: 'card', bal: 0, at: 0, order: 2 } } };
};
const cardSum = () => Object.values(accBalances()).reduce((a, b) => a + b, 0);
const fundSum = () => { const { get } = stats(); return S.funds.filter(f => f.kind !== 'debt').reduce((a, f) => a + fstate(f, get).balance, 0); };
const pendSum = () => Object.values(debtPending()).reduce((a, b) => a + b, 0);
const dKredit = { id: 'dk', name: 'Кредит', kind: 'debt', value: 100000, minPay: 20 };
const rent = { id: 'rent', name: 'Жильё', kind: 'monthly', value: 40 };
const food100 = { id: 'food', name: 'Продукты', kind: 'monthly', value: 30 };
const income100 = { id: 'i1', type: 'income', amount: 100, acc: 'c1', alloc: { food: 30, rent: 40, dk: 20, rest: 10 }, date: day, month: m, createdAt: 2 };
// контрольное равенство: деньги на картах = деньги в фондах + отложенное на долги
const balanced = () => { assert.equal(cardSum(), fundSum() + pendSum()); assert.equal(reconcile().disc, 0); };

test('сценарий 1: доход 100 ₽ лёг на карту и разошёлся по фондам', () => {
  withCards([food100, rent, dKredit, rest], [income100]);
  assert.equal(accBalances().c1, 100);
  assert.equal(fundSum(), 80);
  assert.equal(debtPending().dk, 20);
  balanced();
});

test('сценарий 2: перевод 30 ₽ между картами не меняет фонды', () => {
  withCards([food100, rent, dKredit, rest], [income100]);
  const before = fundSum();
  S.tx.push({ id: 'mv', type: 'move', from: 'c1', to: 'c2', debt: '', amount: 30, date: day, month: m, createdAt: 3 });
  assert.equal(accBalances().c1, 70); assert.equal(accBalances().c2, 30);
  assert.equal(cardSum(), 100); assert.equal(fundSum(), before);
  balanced();
});

test('сценарий 3: покупка на 20 ₽ уменьшает и карту, и фонд продуктов', () => {
  withCards([food100, rent, dKredit, rest], [income100]);
  S.tx.push({ id: 'e', type: 'expense', amount: 20, fundId: 'food', from: 'food', acc: 'c1', date: day, month: m, createdAt: 3 });
  const { get } = stats();
  assert.equal(accBalances().c1, 80);
  assert.equal(fstate(food100, get).balance, 10);
  balanced();
});

test('сценарий 4: перераспределение 15 ₽ между фондами не трогает карты', () => {
  withCards([food100, rent, dKredit, rest], [income100]);
  S.tx.push({ id: 'tr', type: 'transfer', from: 'rent', amount: 15, alloc: { food: 15 }, date: day, month: m, createdAt: 3 });
  const { get } = stats();
  assert.equal(cardSum(), 100); assert.equal(fundSum(), 80);
  assert.equal(fstate(rent, get).balance, 25); assert.equal(fstate(food100, get).balance, 45);
  balanced();
});

test('сценарий 5: отложенное на долг не уменьшает долг перед банком, «Внёс» уменьшает', () => {
  const debt = { id: 'dk', name: 'Кредит', kind: 'debt', value: 100000, minPay: 10000 };
  withCards([debt, rest], [{ id: 'i', type: 'income', amount: 50000, acc: 'c1', alloc: { dk: 10000, rest: 40000 }, date: day, month: m, createdAt: 2 }]);
  let s = fstate(debt, stats().get), b = debtBank(debt, s, debtPending());
  assert.equal(s.remaining, 90000);            // осталось отложить: по нему фонд получает деньги
  assert.deepEqual(b, { inBank: 0, aside: 10000, owed: 100000 });
  balanced();
  S.tx.push({ id: 'p', type: 'move', from: 'c1', to: '', debt: 'dk', amount: 10000, date: day, month: m, createdAt: 3 });
  s = fstate(debt, stats().get); b = debtBank(debt, s, debtPending());
  assert.equal(s.remaining, 90000);            // платёж не засчитывается второй раз
  assert.deepEqual(b, { inBank: 10000, aside: 0, owed: 90000 });
  assert.equal(accBalances().c1, 40000);
  balanced();
});

test('долг полностью отложен, но не внесён: он ещё открыт, а доходы его больше не пополняют', () => {
  const debt = { id: 'dk', name: 'Рассрочка', kind: 'debt', value: 30000 };
  withCards([debt, rest], [{ id: 'i', type: 'income', amount: 50000, acc: 'c1', alloc: { dk: 30000, rest: 20000 }, date: day, month: m, createdAt: 2 }]);
  const s = fstate(debt, stats().get), b = debtBank(debt, s, debtPending());
  assert.equal(s.remaining, 0);
  assert.equal(b.owed, 30000);
  assert.equal(distribute(10000, true).rows.find(r => r.f.id === 'dk').give, 0);
});

test('платёж по долгу тратой из другого фонда сразу уменьшает долг перед банком', () => {
  const debt = { id: 'dk', name: 'Кредит', kind: 'debt', value: 100000, minPay: 10000 };
  withCards([debt, rest], [
    { id: 'i', type: 'income', amount: 50000, acc: 'c1', alloc: { rest: 50000 }, date: day, month: m, createdAt: 2 },
    { id: 'e', type: 'expense', amount: 10000, fundId: 'dk', from: 'rest', acc: 'c1', date: day, month: m, createdAt: 3 }]);
  const s = fstate(debt, stats().get);
  assert.deepEqual(debtBank(debt, s, debtPending()), { inBank: 10000, aside: 0, owed: 90000 });
  balanced();
});

test('без учёта карт остаток долга считается как раньше', () => {
  const debt = { id: 'dk', name: 'Кредит', kind: 'debt', value: 100000, minPay: 10000 };
  setup([debt, rest], [{ id: 'i', type: 'income', amount: 50000, alloc: { dk: 10000, rest: 40000 }, date: day, month: m, createdAt: 2 }]);
  const s = fstate(debt, stats().get);
  assert.equal(debtBank(debt, s, debtPending()).owed, s.remaining);
});

/* ---------- пауза фонда на месяц ---------- */
const pool = () => ({ id: 'pool', name: 'Бассейн Мии', kind: 'monthly', value: 6000, payDay: 15 });
const flat = { id: 'flat', name: 'Ипотека', kind: 'monthly', value: 40000 };
const card = { id: 'cc', name: 'Кредитка', kind: 'debt', value: 200000, minPay: 5000, rate: 30 };

test('фонд на паузе в этом месяце не получает деньги, они идут дальше по очереди', () => {
  setup([flat, { ...pool(), pausedM: m }, card, rest]);
  const d = distribute(60000, true);
  assert.equal(give(d, 'pool'), 0);
  assert.equal(give(d, 'flat'), 40000);
  assert.equal(give(d, 'cc'), 20000);          // 5 000 минимальный платёж и 15 000 досрочно, вместе с деньгами бассейна
  assert.ok(upcoming(31).every(x => x.f.id !== 'pool'));
});

test('пауза прошлого месяца больше не действует', () => {
  setup([flat, { ...pool(), pausedM: shiftMonth(m, -1) }, card, rest]);
  assert.equal(paused(S.funds[1]), false);
  assert.equal(give(distribute(60000, true), 'pool'), 6000);
});

test('на паузу не ставятся долги и налог, а % с дохода на паузе не берёт процент', () => {
  setup([{ ...tax, taxOnly: true, pausedM: m }, { ...card, pausedM: m }, { id: 'inv', name: 'Инвестиции', kind: 'percent', value: 10, pausedM: m }, rest]);
  assert.equal(paused(S.funds[0]), false);
  assert.equal(paused(S.funds[1]), false);
  const d = distribute(100000, true);
  assert.equal(give(d, 'tax'), 6000);
  assert.equal(give(d, 'inv'), 0);
});

test('фонд на паузе, ушедший в минус, всё равно закрывает минус следующим доходом', () => {
  setup([{ ...pool(), pausedM: m }, rest], [{ id: 'e', type: 'expense', amount: 2000, fundId: 'pool', from: 'pool', date: day, month: m, createdAt: 1 }]);
  assert.equal(give(distribute(10000, true), 'pool'), 2000);
});

test('подсказка: что сократить ради долгов', () => {
  setup([flat, { id: 'food', name: 'Еда', kind: 'monthly', value: 50000 }, pool(), card, rest]);
  let t = cutTip(monthPicture());
  assert.ok(t && t.title.includes('Бассейн Мии'));
  assert.equal(t.act.act, 'pause-fund');
  assert.ok(t.text.includes('Кредитка'));
  setup([flat, { ...pool(), noCut: true }, card, rest]);
  assert.equal(cutTip(monthPicture()), null);
  setup([flat, pool(), card, rest], [{ id: 'e', type: 'expense', amount: 6000, fundId: 'pool', from: 'pool', date: day, month: m, createdAt: 1 }]);
  assert.equal(cutTip(monthPicture()), null);   // за бассейн в этом месяце уже заплатили
  setup([flat, pool(), rest]);
  assert.equal(cutTip(monthPicture()), null);   // долгов нет, сокращать незачем
});

/* ---------- обычный доход по опыту ---------- */
const inc = (mm, a, extra = {}) => ({ id: 'i' + mm + a, type: 'income', amount: a, alloc: {}, date: mm + '-05', month: mm, createdAt: 1, ...extra });

test('доход по опыту: средний за полные месяцы, первый неполный месяц и стартовые остатки не считаются', () => {
  const m1 = shiftMonth(m, -1), m2 = shiftMonth(m, -2), m3 = shiftMonth(m, -3);
  setup([rest], [inc(m3, 50000), inc(m3, 900000, { found: true }), inc(m2, 200000), inc(m1, 300000), inc(m, 10000)]);
  S.household = { expectedIncome: 400000 };
  const B = incomeBasis();
  assert.equal(B.src, 'hist');
  assert.equal(B.inc, 250000);
  assert.deepEqual(B.h.map(x => x.m), [m1, m2]);
});

test('пока полных месяцев меньше двух, берётся доход из настроек', () => {
  const m1 = shiftMonth(m, -1), m2 = shiftMonth(m, -2);
  setup([rest], [inc(m2, 50000), inc(m1, 300000)]);
  S.household = { expectedIncome: 400000 };
  assert.deepEqual([incomeBasis().src, incomeBasis().inc], ['set', 400000]);
  S.household = {};
  assert.deepEqual([incomeBasis().src, incomeBasis().inc], ['hist', 300000]);
});

/* ---------- сверка дня ---------- */
test('запись сверки не меняет фонды, карты и доход по опыту', () => {
  withCards([food100, rent, dKredit, rest], [income100]);
  const before = { cards: cardSum(), funds: fundSum(), pend: pendSum() };
  S.tx.push({ id: 'c1', type: 'check', date: day, month: m, accs: { c1: { exp: 100, act: 100 } }, by: 'u', createdAt: 9 });
  assert.deepEqual({ cards: cardSum(), funds: fundSum(), pend: pendSum() }, before);
  balanced();
});

test('сверка: не записанная трата, внесённая по разнице, сводит карту с банком', () => {
  withCards([food100, rent, dKredit, rest], [income100]);
  // в банке 88 вместо 100: 12 ₽ ушли на еду и не были записаны
  S.tx.push({ id: 'e', type: 'expense', amount: 12, fundId: 'food', from: 'food', acc: 'c1', note: 'Не записано, найдено при сверке', date: day, month: m, createdAt: 3 });
  S.tx.push({ id: 'c', type: 'check', date: day, month: m, accs: { c1: { exp: 100, act: 88 } }, createdAt: 4 });
  assert.equal(accBalances().c1, 88);
  assert.equal(fstate(food100, stats().get).balance, 18);
  balanced();
});

test('серия недели: дни со сверкой считаются по датам, кто бы ни сверял', () => {
  setup([rest]);
  const d = checkDays(7);
  assert.equal(d.length, 7);
  S.tx = [{ type: 'check', date: d.at(-1), by: 'a' }, { type: 'check', date: d.at(-1), by: 'b' }, { type: 'check', date: d.at(2), by: 'a' }, { type: 'expense', date: d.at(3) }];
  assert.equal(d.filter(x => checkedSet().has(x)).length, 2);
});

test('сверка: фонды для не записанных трат, частые сверху, без долгов и налога', () => {
  const debt = { id: 'cc', name: 'Кредитка', kind: 'debt', value: 1000, minPay: 100 };
  setup([{ ...tax, taxOnly: true }, rent, food100, debt, rest], [
    { id: 'a', type: 'expense', amount: 1, fundId: 'food', from: 'food', date: day, month: m },
    { id: 'b', type: 'expense', amount: 1, fundId: 'food', from: 'food', date: day, month: m }]);
  const ids = checkFunds().map(f => f.id);
  assert.equal(ids.at(0), 'food');
  assert.ok(!ids.includes('cc') && !ids.includes('tax'));
  assert.ok(ids.includes('rest'));
});

/* ---------- кредиты и очередь долгов ---------- */
test('платёж за машину не ставится на паузу и не предлагается к сокращению', () => {
  const car = { id: 'car', name: 'Платёж за машину', kind: 'monthly', value: 44000 };
  setup([flat, car, { id: 'gym', name: 'Спортзал', kind: 'monthly', value: 3000 }, card, rest]);
  assert.equal(canPause(car), false);
  assert.equal(canPause({ id: 'pool', name: 'Бассейн Мии', kind: 'monthly', value: 6000 }), true);
  const t = cutTip(monthPicture());
  assert.ok(t && t.title.includes('Спортзал'));
});

test('кредит, заведённый как обычный расход, подсказка предлагает сделать его долгом', () => {
  setup([flat, { id: 'car', name: 'Машина', kind: 'monthly', value: 44000 }, card, rest]);
  const t = tips(monthPicture()).find(x => x.title.includes('похож на кредит'));
  assert.ok(t); assert.equal(t.act.id, 'car');
  setup([flat, { id: 'car', name: 'Машина', kind: 'monthly', value: 44000, notLoan: true }, card, rest]);
  assert.ok(!tips(monthPicture()).some(x => x.title.includes('похож на кредит')));
});

test('куда отдавать лишние деньги: кредитка с высокой ставкой первой, хоть машина и дольше', () => {
  const cc = { id: 'cc', name: 'Кредитка', kind: 'debt', value: 80000, minPay: 5000, rate: 32 };
  const car = { id: 'car', name: 'Кредит за машину', kind: 'debt', value: 2000000, minPay: 44000, rate: 18 };
  setup([car, cc, rest]);
  const a = debtAdvice(null, 100000);
  assert.equal(a.target.f.id, 'cc');
  assert.equal(a.next.f.id, 'car');
  assert.equal(a.per.at(0).save, 3200);
  assert.equal(a.per.at(1).save, 1800);
  assert.ok(a.closeIn >= 1 && a.closeIn <= 3);       // кредитка закрывается за пару месяцев
  // каскад «Лавиной» выгоднее, чем вкладывать лишнее сначала в машину
  const firstCar = simulate('custom', 100000, debtList());
  const aval = simulate('avalanche', 100000, debtList());
  assert.ok(aval.interest < firstCar.interest);
  assert.ok(a.curExtra > 0);                          // текущая очередь (машина первой) переплачивает
});

test('совет не строится, пока у долга нет ставки, и подсказка на главной молчит', () => {
  setup([{ id: 'a', name: 'Долг другу', kind: 'debt', value: 50000 }, { id: 'b', name: 'Кредитка', kind: 'debt', value: 80000, minPay: 5000, rate: 30 }, rest]);
  const a = debtAdvice(null, 50000);
  assert.equal(a.noRate.length, 1);
  assert.equal(debtTip(), null);
});

/* ---------- частые траты одним касанием ---------- */
const dAgo = n => { const d = new Date(Date.now() - n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const ex = (id, fundId, amount, ago, extra = {}) => ({ id, type: 'expense', fundId, from: fundId, amount, date: dAgo(ago), month: dAgo(ago).slice(0, 7), createdAt: 1000 - ago, ...extra });

test('частые траты: одна сумма в разные дни становится кнопкой, один день и разные суммы нет', () => {
  const cafe = { id: 'cafe', name: 'Кофе и перекусы', kind: 'monthly', value: 4000 };
  setup([food, cafe, rest], [
    ex('a', 'cafe', 250, 1, { note: 'Кофе' }), ex('b', 'cafe', 250, 3), ex('c', 'cafe', 250, 5),
    ex('d', 'food', 840, 2), ex('e', 'food', 1210, 4), ex('f', 'food', 530, 6),
    ex('g', 'rest', 100, 2), ex('h', 'rest', 100, 2)]);
  const q = quickSpends();
  const amt = q.filter(x => x.type === 'amt');
  assert.equal(amt.length, 1);
  assert.deepEqual([amt[0].fundId, amt[0].amount, amt[0].label], ['cafe', 250, 'Кофе']);
  // еда без постоянной суммы: кнопка фонда, которая откроет окно траты
  assert.ok(q.some(x => x.type === 'fund' && x.fundId === 'food'));
  // две траты за один день не повтор
  assert.ok(!q.some(x => x.fundId === 'rest' && x.type === 'amt'));
});

test('частые траты: регулярный платёж, сверка, чужой фонд, долги и старые записи не попадают', () => {
  const pool = { id: 'pool', name: 'Бассейн', kind: 'monthly', value: 6000 };
  setup([pool, food, card, rest], [
    ex('a', 'pool', 6000, 3), ex('b', 'pool', 6000, 33),
    ex('c', 'food', 700, 1, { note: 'Не записано, найдено при сверке' }), ex('d', 'food', 700, 2, { note: 'Не записано, найдено при сверке' }),
    ex('e', 'food', 300, 1, { from: 'rest' }), ex('f', 'food', 300, 2, { from: 'rest' }),
    ex('g', 'cc', 5000, 4), ex('h', 'cc', 5000, 34),
    ex('i', 'rest', 90, 120), ex('j', 'rest', 90, 130)]);
  assert.deepEqual(quickSpends(), []);
});

test('частые траты: не больше шести кнопок, суммы идут первыми', () => {
  const fs = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, name: 'Фонд ' + id, kind: 'monthly', value: 100000 }));
  const tx = [];
  fs.forEach((f, i) => { tx.push(ex(f.id + '1', f.id, 100 + i, 1), ex(f.id + '2', f.id, 100 + i, 2), ex(f.id + '3', f.id, 555 + i, 3)); });
  setup(fs, tx);
  const q = quickSpends();
  assert.equal(q.length, 6);
  assert.deepEqual(q.slice(0, 4).map(x => x.type), ['amt', 'amt', 'amt', 'amt']);
  assert.deepEqual(q.slice(4).map(x => x.type), ['fund', 'fund']);
});

test('подсказка фонда по комментарию: берётся последняя запись, регистр и пробелы не важны', () => {
  setup([food, { id: 'cafe', name: 'Кофе', kind: 'monthly', value: 4000 }, rest], [
    ex('a', 'food', 300, 9, { note: 'Кофе утром' }), ex('b', 'cafe', 250, 2, { note: 'кофе утром ' }),
    ex('c', 'food', 1, 1, { note: 'Не записано, найдено при сверке' })]);
  assert.deepEqual(noteFund('  Кофе утром'), { fundId: 'cafe', amount: 250 });
  assert.equal(noteFund('Такси'), null);
  assert.equal(noteFund('к'), null);
  assert.equal(noteFund('Не записано, найдено при сверке'), null);
});

/* ---------- итоги недели и награда ---------- */
test('итоги недели: доход, траты, долги, топ фондов и сравнение с прошлой неделей', () => {
  setup([food, { id: 'cafe', name: 'Кофе', kind: 'monthly', value: 4000 }, card, rest], [
    { id: 'i1', type: 'income', amount: 60000, date: dAgo(2), month: m, alloc: {} },
    { id: 'i0', type: 'income', amount: 99999, date: dAgo(1), month: m, found: true, alloc: {} },
    ex('a', 'food', 5000, 1), ex('b', 'cafe', 700, 3), ex('c', 'food', 2000, 5),
    ex('d', 'cc', 5000, 2), { id: 'mv', type: 'move', debt: 'cc', amount: 3000, date: dAgo(4), month: m },
    ex('p1', 'food', 4000, 9), ex('p2', 'cafe', 1000, 10), { id: 'old', type: 'income', amount: 1, date: dAgo(30), month: m, alloc: {} }]);
  const w = weekStats();
  assert.equal(w.inc, 60000);
  assert.equal(w.exp, 7700);
  assert.equal(w.debt, 8000);
  assert.deepEqual(w.top.map(x => [x.id, x.sum]), [['food', 7000], ['cafe', 700]]);
  assert.equal(w.prev.exp, 5000);
  assert.match(weekDiff(w.exp, w.prev.exp), /на .*2.?700.* больше, чем неделей раньше/);
  assert.equal(weekDiff(100, 0), '');
});

test('итоги недели: вопрос для совета зависит от того, что заметнее, текст для отправки собирается', () => {
  setup([food, card, rest], []);
  const base = { from: dAgo(6), to: dAgo(0), inc: 0, exp: 1000, debt: 0, top: [], checks: 6, prev: { inc: 0, exp: 1000, debt: 0 } };
  assert.match(weekQuestion({ ...base, exp: 2000 }), /Расходы выросли на 100%/);
  assert.match(weekQuestion({ ...base, debt: 5000 }), /По долгам внесли/);
  assert.match(weekQuestion({ ...base, checks: 2 }), /Сверок 2 из 7/);
  assert.match(weekQuestion(base), /Что порадовало/);
  const t = weekText({ ...base, top: [{ id: 'food', name: 'Еда', sum: 800 }] });
  assert.match(t, /^Итоги недели, /);
  assert.match(t, /Больше всего ушло: Еда 800/);
  assert.match(t, /Вопрос для разговора: /);
});

test('награда за неделю сверок: нужно 5 дней из 7 и вошедший пользователь', () => {
  const d = checkDays(7);
  S.uid = 'u1';
  S.tx = d.slice(0, 4).map((x, i) => ({ id: 'c' + i, type: 'check', date: x }));
  assert.equal(rewardDue(), null);
  S.tx = d.slice(0, 5).map((x, i) => ({ id: 'c' + i, type: 'check', date: x }));
  assert.equal(rewardDue(), 5);
  S.uid = null;
  assert.equal(rewardDue(), null);
});
