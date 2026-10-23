import * as DB from './fb.js';
import { seed as SEED } from './seed.js';

const KINDS = {
  percent:{label:'Процент с дохода', short:'%'},
  monthly:{label:'Платёж каждый месяц', short:'в месяц'},
  goal:{label:'Накопить сумму', short:'цель'},
  debt:{label:'Погасить долг', short:'долг'},
  rest:{label:'Всё, что осталось', short:'остаток'}
};
const PREP = ['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
const NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

const S = { uid:null, hid:null, myName:'', pendingName:'', members:{}, household:null, authMode:'login', gateErr:'', canWrite:true, status:'loading', funds:[], tx:[], wishes:[], confirmFund:null, tab:'now', histMonth:curMonth(), names:{} };

function curMonth(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function today(){const d=new Date();return curMonth(d)+'-'+String(d.getDate()).padStart(2,'0')}
function monthLabel(m){const [y,mm]=m.split('-').map(Number);return NOM[mm-1]+' '+y}
function shiftMonth(m,k){const [y,mm]=m.split('-').map(Number);return curMonth(new Date(y,mm-1+k,1))}
function dateLabel(s){if(!s)return '';const [y,m,d]=s.split('-').map(Number);return d+' '+GEN[m-1]}
const nf = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
const fmt = n => nf.format(Math.round(n||0))+' ₽';
function parseAmt(s){s=String(s??'').replace(/[\s ₽]/g,'').replace(',','.');const n=parseFloat(s);return isFinite(n)?n:0}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const sum = a => a.reduce((x,y)=>x+y,0);
const $ = s => document.querySelector(s);

function activeFunds(){return S.funds.filter(f=>!f.archived)}
function fundName(id){if(id==='_free')return 'Без фонда';const f=S.funds.find(x=>x.id===id);return f?f.name:'Удалённый фонд'}

/* ---------- calculations ---------- */
function stats(){
  const m=curMonth(), st={}; let incomeM=0, spentM=0;
  const get=id=>st[id]||(st[id]={alloc:0,allocM:0,spent:0,spentM:0});
  for(const t of S.tx){
    const inM=t.month===m;
    if(t.type==='income'){
      if(inM) incomeM+=+t.amount||0;
      for(const [fid,a] of Object.entries(t.alloc||{})){const s=get(fid);s.alloc+=+a||0;if(inM)s.allocM+=+a||0}
    } else if(t.type==='expense'){
      const s=get(t.fundId);s.spent+=+t.amount||0;if(inM){s.spentM+=+t.amount||0;spentM+=+t.amount||0}
    } else if(t.type==='transfer'){
      get(t.from).spent+=+t.amount||0;
      for(const [fid,a] of Object.entries(t.alloc||{})){const s=get(fid);s.alloc+=+a||0;if(inM)s.allocM+=+a||0}
    }
  }
  return {st,get,incomeM,spentM};
}
function fstate(f,get){
  const s=get(f.id), v=+f.value||0, start=+f.start||0;
  if(f.kind==='debt'){const paid=s.alloc+s.spent;return {paid,remaining:Math.max(0,v-paid),need:Math.max(0,v-paid),balance:0,allocM:s.allocM,moved:s.alloc-s.spent}}
  const balance=start+s.alloc-s.spent;
  let need=0;
  if(f.kind==='monthly') need=Math.max(0,v-s.spentM-balance,-balance);
  else if(f.kind==='goal') need=Math.max(0,v-balance);
  return {balance,need,spentM:s.spentM,allocM:s.allocM,moved:s.alloc-s.spent};
}
function monthsLeft(deadline){
  if(!deadline)return 0;
  const [dy,dm]=deadline.split('-').map(Number);const n=new Date();
  return (dy-n.getFullYear())*12+(dm-(n.getMonth()+1))+1;
}
function plan(amount,taxable){
  const {get}=stats(); let rem=amount; const rows=[];
  for(const f of activeFunds()){
    let need=0;
    if(f.kind==='percent') need=(f.taxOnly&&!taxable)?0:Math.round(amount*(+f.value||0)/100);
    else if(f.kind==='rest') need=rem;
    else need=Math.round(fstate(f,get).need);
    const give=Math.max(0,Math.min(rem,need)); rem-=give; rows.push({f,give});
  }
  return {rows,free:Math.max(0,Math.round(rem))};
}
function monthPicture(){
  const {get,incomeM,spentM}=stats(); const funds=activeFunds(); const m=curMonth(); const mi=+m.slice(5)-1;
  const monthly=funds.filter(f=>f.kind==='monthly');
  const needMonthly=sum(monthly.map(f=>fstate(f,get).need));
  const totalMonthly=sum(monthly.map(f=>+f.value||0));
  const pct=sum(funds.filter(f=>f.kind==='percent').map(f=>+f.value||0));
  const dl=[];
  for(const f of funds.filter(f=>(f.kind==='debt'||f.kind==='goal')&&f.deadline)){
    const s=fstate(f,get); const left=f.kind==='debt'?s.remaining:s.need;
    const ml=monthsLeft(f.deadline);
    const base=left+s.allocM;
    const perMonth=ml>0?base/ml:base;
    const stillThisMonth=Math.max(0,Math.min(left,perMonth-s.allocM));
    dl.push({f,left,ml,perMonth,stillThisMonth});
  }
  const stillNet=needMonthly+sum(dl.map(d=>d.stillThisMonth));
  const stillGross=pct<100?stillNet/(1-pct/100):stillNet;
  const free=fstate({id:'_free',kind:'goal',value:0},get).balance;
  return {get,funds,mi,incomeM,spentM,needMonthly,totalMonthly,pct,dl,stillNet,stillGross,free};
}
function tips(P){
  const out=[]; const {get,funds,mi}=P;
  if(!funds.length) return out;
  if(P.totalMonthly>0){
    if(P.needMonthly>0) out.push({tone:'warn',title:`На ежемесячные платежи в ${PREP[mi]} не хватает ${fmt(P.needMonthly)}`,text:`Всего они стоят ${fmt(P.totalMonthly)} в месяц. Следующий доход сначала пойдёт на них.`});
    else out.push({tone:'good',title:`Ежемесячные платежи на ${NOM[mi].toLowerCase()} покрыты`,text:'Новые деньги пойдут дальше по очереди фондов.'});
  }
  for(const d of P.dl){
    if(d.left<=0){out.push({tone:'good',title:`«${d.f.name}»: ${d.f.kind==='debt'?'долг закрыт':'цель достигнута'}`,text:'Фонд больше ничего не забирает из доходов.'});continue}
    if(d.ml<=0) out.push({tone:'bad',title:`«${d.f.name}»: срок прошёл, осталось ${fmt(d.left)}`,text:'Поставьте новый срок в настройках фонда, чтобы подсказка пересчитала план.'});
    else out.push({tone:d.stillThisMonth>0?'info':'good',title:`«${d.f.name}»: осталось ${fmt(d.left)}`,text:`До ${dateLabel(d.f.deadline)} нужно по ${fmt(d.perMonth)} в месяц.`+(d.stillThisMonth>0?` В ${PREP[mi]} ещё ${fmt(d.stillThisMonth)}.`:` План на ${NOM[mi].toLowerCase()} выполнен.`)});
  }
  const next=funds.find(f=>f.kind!=='percent'&&(f.kind==='rest'||fstate(f,get).need>0));
  if(next) out.push({tone:'info',title:`Следующие свободные деньги пойдут в «${next.name}»`,text:next.kind==='rest'?'Все фонды выше заполнены, остаток копится здесь.':`Ему нужно ещё ${fmt(fstate(next,get).need)}.`});
  for(const f of funds){const s=fstate(f,get);if(f.kind!=='debt'&&s.balance<-0.5) out.push({tone:'bad',title:`«${f.name}» в минусе на ${fmt(-s.balance)}`,text:'Потратили больше, чем было в фонде. Следующий доход закроет минус, если фонд стоит выше по очереди.'})}
  if(P.free>0.5) out.push({tone:'warn',title:`${fmt(P.free)} лежат без фонда`,text:'Так бывает после удаления фонда или когда все фонды заполнены.',act:{label:'Разложить по фондам',act:'distribute-free'}});
  return out;
}
function verdict(price,fundId){
  if(!(price>0)) return null;
  const P=monthPicture(); const {get,funds,mi}=P; const gross=x=>P.pct<100?x/(1-P.pct/100):x;
  const chosen=fundId?(fundId==='_free'?{id:'_free',name:'Без фонда',kind:'free'}:funds.find(f=>f.id===fundId)):null;
  const bal=f=>f.kind==='free'?P.free:fstate(f,get).balance;
  if(chosen&&chosen.kind==='monthly'&&bal(chosen)>=price) return {tone:'good',title:'Можно покупать',lines:[`Укладывается в фонд «${chosen.name}»: после покупки там останется ${fmt(bal(chosen)-price)}.`],src:chosen.id};
  const blockers=[]; let negSum=0;
  if(P.needMonthly>0) blockers.push(`Ежемесячные платежи на ${NOM[mi].toLowerCase()} ещё не покрыты, не хватает ${fmt(P.needMonthly)}.`);
  for(const d of P.dl) if(d.left>0&&d.stillThisMonth>0) blockers.push(`«${d.f.name}»: в ${PREP[mi]} по плану нужно внести ещё ${fmt(d.stillThisMonth)}.`);
  for(const f of funds){if(f.kind==='debt')continue;const b=fstate(f,get).balance;if(b<-0.5){negSum+=-b;blockers.push(`«${f.name}» в минусе на ${fmt(-b)}.`)}}
  if(blockers.length){
    const lines=[];
    if(chosen&&chosen.kind==='monthly') lines.push(`В фонде «${chosen.name}» ${fmt(bal(chosen))}, на покупку не хватает ${fmt(price-bal(chosen))}.`);
    lines.push(...blockers, `Покупка не помешает плану, когда в ${PREP[mi]} придёт ещё около ${fmt(gross(P.stillNet+negSum+price))} дохода.`);
    return {tone:'bad',title:'Лучше повременить',lines,src:chosen?chosen.id:null};
  }
  let src=null;
  if(chosen&&chosen.kind!=='monthly'){if(bal(chosen)>=price)src=chosen}
  else if(!chosen){const c=[];if(P.free>0.5)c.push({id:'_free',name:'Без фонда',kind:'free'});c.push(...funds.filter(f=>f.kind==='rest'||f.kind==='goal').slice().reverse());src=c.find(x=>bal(x)>=price)||null}
  if(!src){
    const lines=[chosen?`В фонде «${chosen.name}» ${fmt(bal(chosen))}, не хватает ${fmt(price-bal(chosen))}.`:'Ни в одном накопительном фонде нет такой суммы.'];
    lines.push(`План на ${NOM[mi].toLowerCase()} выполнен. Купить без ущерба можно, когда придёт ещё около ${fmt(gross(price))} сверх плана.`);
    return {tone:'bad',title:'Пока не на что',lines,src:chosen?chosen.id:null};
  }
  const debt=funds.find(f=>f.kind==='debt'&&fstate(f,get).remaining>0);
  if(src.kind==='free'&&!debt) return {tone:'good',title:'Можно покупать',lines:[`Возьмите из денег без фонда, останется ${fmt(P.free-price)}.`],src:'_free'};
  const lines=[];
  if(src.kind==='free') lines.push(`Деньги без фонда есть (${fmt(P.free)}), но пока не закрыт долг «${debt.name}», их лучше направить туда.`);
  else {
    const b=bal(src);
    lines.push(`Деньги возьмутся из «${src.name}»: было ${fmt(b)}, станет ${fmt(b-price)}${src.kind==='goal'&&+src.value?` из ${fmt(src.value)}`:''}.`);
    if(debt&&(+src.order||0)<(+debt.order||0)) lines.push(`Этот фонд стоит в очереди раньше, чем «${debt.name}». Следующие доходы сначала восстановят его, и долг закроется позже.`);
    else lines.push('Фонд восстановится из будущих доходов после более важных фондов.');
  }
  if(debt) lines.push(`По «${debt.name}» осталось ${fmt(fstate(debt,get).remaining)}.`);
  return {tone:'warn',title:'Можно, но цели сдвинутся',lines,src:src.id};
}
const VSHORT={good:'можно сейчас',warn:'можно, но сдвинет цели',bad:'лучше подождать'};
function verdictBox(v){
  if(!v) return `<p class="note">Введите цену, и здесь появится подсказка.</p>`;
  return `<div class="verdict ${v.tone}"><b>${esc(v.title)}</b>${v.lines.map(l=>`<p>${esc(l)}</p>`).join('')}</div>`;
}

/* ---------- render ---------- */
function render(){
  $('#monthLbl').textContent=monthLabel(curMonth());
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===S.tab?'page':'false'));
  $('#addBtn').hidden=!(S.status==='ready'&&S.canWrite&&activeFunds().length);
  const main=$('#main');
  document.querySelector('nav.tabs').hidden=S.status!=='ready';
  $('#setBtn').hidden=S.status!=='ready';
  if(S.status!=='ready'){renderGate(main);return}
  let html='';
  if(!S.canWrite) html+=`<div class="ro">У вас доступ только для просмотра. Чтобы вносить записи, владелец должен выдать права на изменение.</div>`;
  if(S.tab==='now') html+=renderNow();
  else if(S.tab==='funds') html+=renderFunds();
  else html+=renderHist();
  main.innerHTML=html;
  resolveNames();
}
function emptyFunds(){
  return `<div class="empty"><h2>Фондов пока нет</h2><p class="muted small">Фонд — это конверт для денег: налоги, квартира, кредитка, подушка. Добавьте первый, и каждый доход будет раскладываться по ним автоматически.</p>${S.canWrite?'<button class="btn primary" data-act="new-fund">Добавить фонд</button>':''}</div>`;
}
function renderNow(){
  if(!activeFunds().length) return emptyFunds();
  const P=monthPicture(); const mi=P.mi;
  let h=`<section class="hero">`;
  if(P.stillNet>0.5){
    h+=`<div class="eyebrow">Ещё нужно заработать в ${PREP[mi]}</div><div class="fig">${fmt(P.stillGross)}</div>
    <div class="muted small">Столько дохода закроет ежемесячные платежи${P.dl.length?' и план по срокам':''}${P.pct?`, с учётом ${nf.format(P.pct)}% в процентные фонды`:''}.</div>`;
  } else {
    h+=`<div class="eyebrow">${NOM[mi]}</div><div class="fig ok">План месяца выполнен</div><div class="muted small">Дальнейший доход пойдёт в накопления по очереди фондов.</div>`;
  }
  h+=`<div class="hero-split"><div class="kv"><div class="k">Доход в ${PREP[mi]}</div><div class="v">${fmt(P.incomeM)}</div></div><div class="kv"><div class="k">Траты в ${PREP[mi]}</div><div class="v">${fmt(P.spentM)}</div></div></div></section>`;
  if(S.canWrite) h+=`<div class="btn-row"><button class="btn primary" data-act="open-income">Пришли деньги</button><button class="btn ghost" data-act="open-expense">Потратили</button><button class="btn ghost wide" data-act="new-wish">Хочу купить…</button></div>`;
  const T=tips(P);
  if(T.length) h+=`<section class="block"><h2>Что делать сейчас</h2><div class="tips">${T.map(t=>`<div class="tip ${t.tone}"><span class="dot"></span><div><b>${esc(t.title)}</b><span class="muted small">${esc(t.text)}</span>${t.act&&S.canWrite?`<div style="margin-top:8px"><button class="btn sm ghost" data-act="${t.act.act}">${esc(t.act.label)}</button></div>`:''}</div></div>`).join('')}</div></section>`;
  if(S.wishes.length) h+=`<section class="block"><h2>Хочу купить</h2><div class="list">${S.wishes.map(w=>{const v=verdict(+w.price||0,w.fundId||'');return `<button class="row wish" data-act="edit-wish" data-id="${esc(w.id)}" ${S.canWrite?'':'disabled'}><span class="row-main"><span class="name">${esc(w.name||'Без названия')}</span><span class="amt">${fmt(w.price)}</span></span><span>${v?`<span class="chip v-${v.tone}">${VSHORT[v.tone]}</span>`:''}</span></button>`}).join('')}</div></section>`;
  h+=`<section class="block"><div class="sec-head"><h2>Фонды</h2><button class="btn sm ghost" data-tab-go="funds">Настроить</button></div><div class="list">${activeFunds().map(f=>fundRowNow(f,P.get,mi)).join('')}</div></section>`;
  return h;
}
function fundRowNow(f,get,mi){
  const s=fstate(f,get), v=+f.value||0; let right='',sub='',pc=null;
  if(f.kind==='monthly'){const cov=Math.max(0,v-s.need);pc=v?cov/v:1;right=`${fmt(cov)} из ${fmt(v)}`;sub=`в фонде <span class="${s.balance<0?'neg':''}">${fmt(s.balance)}</span> · потрачено в ${PREP[mi]} ${fmt(s.spentM)}`}
  else if(f.kind==='goal'){pc=v?s.balance/v:0;right=`${fmt(s.balance)} из ${fmt(v)}`;sub=s.need>0?`осталось ${fmt(s.need)}`+(f.deadline?` · до ${dateLabel(f.deadline)}`:''):'цель достигнута'}
  else if(f.kind==='debt'){pc=v?s.paid/v:1;right=s.remaining>0?`осталось ${fmt(s.remaining)}`:'закрыт';sub=`погашено ${fmt(s.paid)} из ${fmt(v)}`+(f.deadline?` · до ${dateLabel(f.deadline)}`:'')}
  else if(f.kind==='percent'){right=`<span class="${s.balance<0?'neg':''}">${fmt(s.balance)}</span>`;sub=`${nf.format(v)}% ${f.taxOnly?'с облагаемых доходов':'с каждого дохода'}`}
  else {right=`<span class="${s.balance<0?'neg':''}">${fmt(s.balance)}</span>`;sub='получает всё, что осталось'}
  return `<div class="row"><div class="row-main"><span class="name">${esc(f.name)}</span><span class="amt">${right}</span></div>${pc!==null?`<div class="bar"><i style="width:${Math.max(0,Math.min(100,pc*100)).toFixed(1)}%"></i></div>`:''}<div class="note">${sub}</div></div>`;
}
function renderFunds(){
  const funds=activeFunds();
  let h=`<section class="block"><h2>Очередь фондов</h2><p class="note">Каждый доход проходит фонды сверху вниз. Фонд забирает сумму, которой ему не хватает, остаток уходит следующему. Порядок меняется стрелками.</p></section>`;
  if(!funds.length) return h+emptyFunds();
  const {get}=stats();
  h+=`<div class="list">${funds.map((f,i)=>{
    const s=fstate(f,get), v=+f.value||0;
    let val=f.kind==='percent'?`${nf.format(v)}%`:f.kind==='rest'?'':fmt(v)+(f.kind==='monthly'?' в месяц':'');
    let st=f.kind==='debt'?`осталось ${fmt(s.remaining)}`:f.kind==='percent'||f.kind==='rest'||f.kind==='goal'?`в фонде ${fmt(s.balance)}`:`в фонде ${fmt(s.balance)}`;
    return `<div class="fund"><span class="pos">${i+1}</span>
      <button class="body" data-act="edit-fund" data-id="${esc(f.id)}" ${S.canWrite?'':'disabled'}><span class="name">${esc(f.name)}</span><span class="note"><span class="chip ${f.kind}">${KINDS[f.kind]?.label||f.kind}</span>${val}</span><span class="note">${st}${f.deadline?` · до ${dateLabel(f.deadline)}`:''}</span></button>
      ${S.canWrite?`<div class="mv"><button data-act="mv" data-id="${esc(f.id)}" data-d="-1" aria-label="Выше" ${i===0?'disabled':''}>↑</button><button data-act="mv" data-id="${esc(f.id)}" data-d="1" aria-label="Ниже" ${i===funds.length-1?'disabled':''}>↓</button></div><button class="del" data-act="ask-del-fund" data-id="${esc(f.id)}" aria-label="Удалить фонд «${esc(f.name)}»">×</button>`:'<span></span><span></span>'}
      ${S.confirmFund===f.id?`<div class="confirm"><span>Удалить «${esc(f.name)}»?${f.kind!=='debt'&&s.balance>0.5?` В нём лежит ${fmt(s.balance)}, эти деньги перейдут в «Без фонда».`:''} Записи в истории останутся.</span><span class="confirm-btns"><button class="btn sm danger" data-act="del-fund" data-id="${esc(f.id)}">Удалить</button><button class="btn sm ghost" data-act="cancel-del">Отмена</button></span></div>`:''}
    </div>`}).join('')}</div>`;
  if(S.canWrite) h+=`<button class="btn primary" data-act="new-fund">+ Добавить фонд</button>`;
  return h;
}
function renderHist(){
  const m=S.histMonth; const list=S.tx.filter(t=>t.month===m);
  const inc=sum(list.filter(t=>t.type==='income').map(t=>+t.amount||0));
  const exp=sum(list.filter(t=>t.type==='expense').map(t=>+t.amount||0));
  let h=`<div class="month-sw"><button data-act="hm" data-d="-1" aria-label="Предыдущий месяц">‹</button><span class="lbl">${monthLabel(m)}</span><button data-act="hm" data-d="1" aria-label="Следующий месяц" ${m>=curMonth()?'disabled':''}>›</button></div>
  <section class="hero"><div class="hero-split" style="margin:0;padding:0;border:0"><div class="kv"><div class="k">Доходы</div><div class="v">${fmt(inc)}</div></div><div class="kv"><div class="k">Траты</div><div class="v">${fmt(exp)}</div></div></div></section>`;
  if(!list.length) return h+`<div class="empty"><h2>В этом месяце записей нет</h2><p class="muted small">Доходы и траты, которые вы внесёте, появятся здесь с разбивкой по фондам.</p></div>`;
  h+=`<div class="list">${list.map(t=>{
    const isIn=t.type==='income', isTr=t.type==='transfer';
    const title=t.note||(isIn?'Доход':isTr?'Перевод между фондами':fundName(t.fundId));
    const who=t.by?`<span data-who="${esc(t.by)}">${esc(S.names[t.by]||'')}</span>`:'';
    const sub=[dateLabel(t.date), isTr?`из «${fundName(t.from)}»`:isIn?'':(t.note?fundName(t.fundId):'')].filter(Boolean).join(' · ');
    let body='';
    if(isTr){
      body+=Object.entries(t.alloc||{}).filter(([,a])=>a>0).map(([fid,a])=>`<div class="alloc-line"><span>→ ${esc(fundName(fid))}</span><span>${fmt(a)}</span></div>`).join('');
      if(S.canWrite) body+=`<div><button class="btn sm danger" data-act="del-tx" data-id="${esc(t.id)}">Удалить запись</button></div>`;
      return `<details class="tx"><summary><span class="sign">⇄</span><span class="t-main"><span class="t-title">${esc(title)}</span><br><span class="note">${esc(sub)}${who?' · ':''}${who}</span></span><span class="t-amt">${fmt(t.amount)}</span></summary><div class="tx-body">${body}</div></details>`;
    }
    if(isIn){
      body+=Object.entries(t.alloc||{}).filter(([,a])=>a>0).map(([fid,a])=>`<div class="alloc-line"><span>${esc(fundName(fid))}</span><span>${fmt(a)}</span></div>`).join('');
      if(t.taxable===false) body+=`<div class="note">Без налога</div>`;
    }
    if(S.canWrite) body+=`<div><button class="btn sm danger" data-act="del-tx" data-id="${esc(t.id)}">Удалить запись</button></div>`;
    return `<details class="tx"><summary><span class="sign ${isIn?'in':''}">${isIn?'+':'−'}</span><span class="t-main"><span class="t-title">${esc(title)}</span><br><span class="note">${esc(sub)}${who?' · ':''}${who}</span></span><span class="t-amt ${isIn?'in':''}">${isIn?'+':'−'}${fmt(t.amount)}</span></summary><div class="tx-body">${body}</div></details>`;
  }).join('')}</div>`;
  return h;
}
function resolveNames(){document.querySelectorAll('[data-who]').forEach(el=>{el.textContent=S.names[el.dataset.who]||''})}

/* ---------- sheets ---------- */
function openSheet(html,onMount){
  const sh=$('#sheet'); sh.innerHTML=`<div class="wrap">${html}</div>`; sh.hidden=false; $('#scrim').hidden=false;
  onMount&&onMount(sh); const f=sh.querySelector('input.big,input'); f&&setTimeout(()=>f.focus(),60);
}
function closeSheet(){$('#sheet').hidden=true;$('#scrim').hidden=true;$('#sheet').innerHTML=''}
function sheetHead(t){return `<div class="sheet-head"><h2>${t}</h2><button class="x" data-act="close" aria-label="Закрыть">×</button></div>`}
function typeSeg(active){return `<div class="seg"><button data-act="open-income" aria-pressed="${active==='income'}">Доход</button><button data-act="open-expense" aria-pressed="${active==='expense'}">Трата</button></div>`}

function openIncome(mode){
  const isFree=mode==='free'; const freeBal=isFree?Math.round(monthPicture().free):0;
  openSheet(`${sheetHead(isFree?'Разложить деньги без фонда':'Пришли деньги')}${isFree?`<p class="note">Без фонда лежит ${fmt(freeBal)}. Они разойдутся по очереди фондов, налог с них не берётся.</p>`:typeSeg('income')}
  <div class="field"><label for="inAmt">Сумма</label><input class="big" id="inAmt" inputmode="decimal" placeholder="0 ₽" autocomplete="off" value="${isFree?nf.format(freeBal):''}"></div>
  <div class="grid2"><div class="field"><label for="inDate">Дата</label><input type="date" id="inDate" value="${today()}"></div><div class="field"><label for="inNote">${isFree?'Комментарий':'Откуда'}</label><input id="inNote" placeholder="${isFree?'Необязательно':'Ученики, декретные…'}"></div></div>
  <label class="check" ${isFree?'hidden':''}><input type="checkbox" id="inTax" ${isFree?'':'checked'}> Облагается налогом</label>
  <div id="planBox"></div>
  <div class="err" id="inErr"></div>
  <button class="btn primary" id="inSave">Записать и разложить</button>`, sh=>{
    let edited=null;
    const draw=()=>{
      const amt=Math.round(parseAmt($('#inAmt').value)); const box=$('#planBox');
      if(amt<=0){box.innerHTML=`<p class="note">Введите сумму, и здесь появится, сколько положить в каждый фонд.</p>`;return}
      const p=plan(amt,$('#inTax').checked);
      box.innerHTML=`<div class="eyebrow" style="margin-bottom:8px">Как разложить</div><div class="plan">${p.rows.map(r=>{
        const v=edited&&edited[r.f.id]!==undefined?edited[r.f.id]:r.give;
        return `<div class="plan-row ${v>0?'':'zero'}"><span class="n">${esc(r.f.name)}<small>${KINDS[r.f.kind]?.label||''}</small></span><input id="pa-${esc(r.f.id)}" data-fid="${esc(r.f.id)}" inputmode="decimal" value="${v?nf.format(v):''}" placeholder="0"></div>`}).join('')}</div>
        <div class="plan-foot" id="planFoot"></div>`;
      foot();
      box.querySelectorAll('input[data-fid]').forEach(inp=>inp.addEventListener('input',()=>{edited=edited||{};edited[inp.dataset.fid]=Math.round(parseAmt(inp.value));foot()}));
    };
    const collect=()=>{const a={};document.querySelectorAll('#planBox input[data-fid]').forEach(i=>{const v=Math.round(parseAmt(i.value));if(v>0)a[i.dataset.fid]=v});return a};
    const foot=()=>{const amt=Math.round(parseAmt($('#inAmt').value));const used=sum(Object.values(collect()));const rest=amt-used;
      $('#planFoot').innerHTML=`<span>Разложено ${fmt(used)} из ${fmt(amt)}</span><span class="${rest<0?'neg':''}">${rest>0?'без фонда '+fmt(rest):rest<0?'больше суммы на '+fmt(-rest):'всё распределено'}</span>`;
      $('#inSave').disabled=rest<0;};
    $('#inAmt').addEventListener('input',()=>{edited=null;draw()});
    $('#inTax').addEventListener('change',()=>{edited=null;draw()});
    draw();
    $('#inSave').addEventListener('click',async()=>{
      const amt=Math.round(parseAmt($('#inAmt').value)); if(amt<=0){$('#inErr').textContent='Введите сумму больше нуля.';return}
      const alloc=collect(); const rest=amt-sum(Object.values(alloc)); if(rest<0)return;
      const date=$('#inDate').value||today();
      if(isFree){
        if(amt>freeBal){$('#inErr').textContent=`Без фонда лежит только ${fmt(freeBal)}.`;return}
        const moved=sum(Object.values(alloc)); if(moved<=0){$('#inErr').textContent='Укажите, сколько положить хотя бы в один фонд.';return}
        await write(async()=>{await DB.add('tx',{type:'transfer',from:'_free',alloc,amount:moved,date,month:date.slice(0,7),note:$('#inNote').value.trim(),by:S.uid||null,createdAt:Date.now()})},'Деньги разложены по фондам');
        return;
      }
      if(rest>0)alloc._free=(alloc._free||0)+rest;
      await write(async()=>{await DB.add('tx',{type:'income',amount:amt,date,month:date.slice(0,7),note:$('#inNote').value.trim(),taxable:$('#inTax').checked,alloc,by:S.uid||null,createdAt:Date.now()})},'Доход записан и разложен по фондам');
    });
  });
}
function openExpense(){
  const {get}=stats();
  const opts=activeFunds().filter(f=>f.kind!=='debt').map(f=>({id:f.id,name:f.name,bal:fstate(f,get).balance}));
  const free=fstate({id:'_free',kind:'goal',value:0},get).balance; if(free>0.5)opts.push({id:'_free',name:'Без фонда',bal:free});
  openSheet(`${sheetHead('Потратили')}${typeSeg('expense')}
  <div class="field"><label for="exAmt">Сумма</label><input class="big" id="exAmt" inputmode="decimal" placeholder="0 ₽" autocomplete="off"></div>
  <div class="field"><label for="exFund">Из какого фонда</label><select id="exFund">${opts.map(o=>`<option value="${esc(o.id)}">${esc(o.name)} · ${fmt(o.bal)}</option>`).join('')}</select></div>
  <div class="grid2"><div class="field"><label for="exDate">Дата</label><input type="date" id="exDate" value="${today()}"></div><div class="field"><label for="exNote">На что</label><input id="exNote" placeholder="Продукты, ЖКХ…"></div></div>
  <p class="note" id="exHint"></p><div class="err" id="exErr"></div>
  <button class="btn primary" id="exSave">Записать трату</button>
  <p class="note">Платежи по долгам не вносятся сюда: деньги, разложенные в фонд долга, считаются уже внесёнными.</p>`, ()=>{
    const hint=()=>{const o=opts.find(x=>x.id===$('#exFund').value);const a=parseAmt($('#exAmt').value);if(!o){$('#exHint').textContent='';return}const after=o.bal-a;$('#exHint').innerHTML=`После траты в фонде останется <span class="${after<0?'neg':''}">${fmt(after)}</span>`};
    $('#exAmt').addEventListener('input',hint);$('#exFund').addEventListener('change',hint);hint();
    $('#exSave').addEventListener('click',async()=>{
      const amt=Math.round(parseAmt($('#exAmt').value)); if(amt<=0){$('#exErr').textContent='Введите сумму больше нуля.';return}
      const fundId=$('#exFund').value; if(!fundId){$('#exErr').textContent='Сначала добавьте фонд.';return}
      const date=$('#exDate').value||today();
      await write(async()=>{await DB.add('tx',{type:'expense',amount:amt,fundId,date,month:date.slice(0,7),note:$('#exNote').value.trim(),by:S.uid||null,createdAt:Date.now()})},'Трата записана');
    });
  });
}
function openFund(f){
  const isNew=!f; f=f||{kind:'monthly',name:'',value:'',taxOnly:true};
  const {get}=stats(); const s=isNew?{balance:0,remaining:0,moved:0,paid:0}:fstate(f,get);
  const cur=f.kind==='debt'?s.remaining:s.balance;
  openSheet(`${sheetHead(isNew?'Новый фонд':'Фонд')}
  <div class="field"><label for="fName">Название</label><input id="fName" value="${esc(f.name)}" placeholder="Например, Кредитка"></div>
  <div class="field"><label for="fKind">Как он забирает деньги</label><select id="fKind">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${f.kind===k?'selected':''}>${v.label}</option>`).join('')}</select></div>
  <div class="field" id="fValBox"><label for="fVal" id="fValLbl"></label><input id="fVal" inputmode="decimal" value="${f.value!==''&&f.value!=null&&f.kind!=='debt'?nf.format(f.value):''}"></div>
  <label class="check" id="fTaxBox"><input type="checkbox" id="fTax" ${f.taxOnly?'checked':''}> Только с доходов, облагаемых налогом</label>
  <div class="field" id="fDlBox"><label for="fDl">Срок (необязательно)</label><input type="date" id="fDl" value="${esc(f.deadline||'')}"></div>
  <div class="field" id="fCurBox"><label for="fCur" id="fCurLbl"></label><input id="fCur" inputmode="decimal" value="${isNew&&f.kind!=='debt'?'':nf.format(cur)}"><span class="note" id="fCurNote"></span></div>
  <div class="err" id="fErr"></div>
  <button class="btn primary" id="fSave">${isNew?'Добавить фонд':'Сохранить'}</button>
  ${isNew?'':`<button class="btn danger" id="fDel">Удалить фонд</button>`}`, ()=>{
    const sync=()=>{const k=$('#fKind').value;
      $('#fValBox').hidden=k==='rest'||k==='debt';
      $('#fValLbl').textContent=k==='percent'?'Процент от дохода':k==='monthly'?'Сумма в месяц, ₽':'Цель, ₽';
      $('#fTaxBox').hidden=k!=='percent';
      $('#fDlBox').hidden=!(k==='goal'||k==='debt');
      $('#fCurLbl').textContent=k==='debt'?'Сколько осталось погасить, ₽':'Сколько сейчас лежит в фонде, ₽';
      $('#fCurNote').textContent=k==='debt'?'Укажите текущий остаток. Позже его можно поправить, если банк начислил проценты.':'Если деньги уже отложены, укажите сумму. Иначе оставьте пустым.';
    };
    $('#fKind').addEventListener('change',sync);sync();
    $('#fSave').addEventListener('click',async()=>{
      const name=$('#fName').value.trim(); const kind=$('#fKind').value;
      if(!name){$('#fErr').textContent='Дайте фонду название.';return}
      const val=parseAmt($('#fVal').value); const curIn=parseAmt($('#fCur').value);
      if((kind==='monthly'||kind==='goal')&&val<=0){$('#fErr').textContent='Укажите сумму больше нуля.';return}
      if(kind==='percent'&&(val<=0||val>100)){$('#fErr').textContent='Процент должен быть от 1 до 100.';return}
      if(kind==='debt'&&curIn<=0&&isNew){$('#fErr').textContent='Укажите сумму долга.';return}
      const data={name,kind,taxOnly:kind==='percent'?$('#fTax').checked:false,deadline:(kind==='goal'||kind==='debt')?($('#fDl').value||''):''};
      const moved=isNew?0:(s.moved||0); const paid=isNew?0:(s.paid||0);
      if(kind==='debt'){data.value=Math.round(curIn+paid);data.start=0}
      else {data.value=kind==='rest'?0:val;data.start=Math.round(curIn-moved)}
      await write(async()=>{
        if(isNew){data.order=(activeFunds().reduce((m,x)=>Math.max(m,+x.order||0),0))+1;data.createdAt=Date.now();await DB.add('funds',data)}
        else await DB.update('funds',f.id,data);
      },isNew?'Фонд добавлен':'Фонд сохранён');
    });
    const del=$('#fDel'); if(del){let armed=false;del.addEventListener('click',async()=>{
      if(!armed){armed=true;del.textContent='Нажмите ещё раз, чтобы удалить';setTimeout(()=>{armed=false;del.textContent='Удалить фонд'},4000);return}
      await deleteFund(f);
    })}
  });
}
async function deleteFund(f){
  const s=fstate(f,stats().get);
  await write(async()=>{
    if(f.kind!=='debt'&&s.balance>0.5){const a=Math.round(s.balance);await DB.add('tx',{type:'transfer',from:f.id,alloc:{_free:a},amount:a,date:today(),month:curMonth(),note:`Фонд «${f.name}» удалён`,by:S.uid||null,createdAt:Date.now()})}
    await DB.update('funds',f.id,{archived:true});
  },'Фонд удалён, записи в истории остались');
  S.confirmFund=null; render();
}
function openWish(w){
  const isNew=!w; w=w||{name:'',price:'',fundId:''};
  const P=monthPicture();
  const opts=activeFunds().filter(f=>f.kind!=='debt');
  const fundOpts=`<option value="">Подобрать автоматически</option>${opts.map(f=>`<option value="${esc(f.id)}" ${w.fundId===f.id?'selected':''}>${esc(f.name)} · ${fmt(fstate(f,P.get).balance)}</option>`).join('')}${P.free>0.5||w.fundId==='_free'?`<option value="_free" ${w.fundId==='_free'?'selected':''}>Без фонда · ${fmt(P.free)}</option>`:''}`;
  openSheet(`${sheetHead(isNew?'Хочу купить':'Покупка')}
  <div class="field"><label for="wName">Что</label><input id="wName" value="${esc(w.name)}" placeholder="Кроссовки, планшет, ремонт…"></div>
  <div class="field"><label for="wPrice">Цена</label><input class="big" id="wPrice" inputmode="decimal" placeholder="0 ₽" autocomplete="off" value="${w.price?nf.format(w.price):''}"></div>
  <div class="field"><label for="wFund">Из какого фонда платить</label><select id="wFund">${fundOpts}</select></div>
  <div id="wVerdict"></div><div class="err" id="wErr"></div>
  <button class="btn primary" id="wBuy">Покупаю, записать трату</button>
  <button class="btn ghost" id="wSave">${isNew?'Отложить в список':'Сохранить изменения'}</button>
  ${isNew?'':'<button class="btn danger" id="wDel">Убрать из списка</button>'}`, ()=>{
    let v=null;
    const draw=()=>{v=verdict(Math.round(parseAmt($('#wPrice').value)),$('#wFund').value);$('#wVerdict').innerHTML=verdictBox(v);$('#wErr').textContent=''};
    $('#wPrice').addEventListener('input',draw);$('#wFund').addEventListener('change',draw);draw();
    const price=()=>Math.round(parseAmt($('#wPrice').value));
    $('#wBuy').addEventListener('click',async()=>{
      const p=price(); if(p<=0){$('#wErr').textContent='Введите цену больше нуля.';return}
      const fundId=$('#wFund').value||(v&&v.src)||'';
      if(!fundId){$('#wErr').textContent='Выберите фонд, из которого платите.';return}
      const date=today(); const name=$('#wName').value.trim()||'Покупка';
      await write(async()=>{
        await DB.add('tx',{type:'expense',amount:p,fundId,date,month:date.slice(0,7),note:name,by:S.uid||null,createdAt:Date.now()});
        if(!isNew) await DB.del('wishes',w.id);
      },`Покупка записана: ${fundName(fundId)}`);
    });
    $('#wSave').addEventListener('click',async()=>{
      const p=price(); const name=$('#wName').value.trim();
      if(!name){$('#wErr').textContent='Напишите, что хотите купить.';return}
      if(p<=0){$('#wErr').textContent='Введите цену больше нуля.';return}
      const data={name,price:p,fundId:$('#wFund').value};
      await write(async()=>{
        if(isNew) await DB.add('wishes',{...data,by:S.uid||null,createdAt:Date.now()});
        else await DB.update('wishes',w.id,data);
      },isNew?'Добавлено в список «Хочу купить»':'Сохранено');
    });
    const del=$('#wDel'); if(del){let armed=false;del.addEventListener('click',async()=>{
      if(!armed){armed=true;del.textContent='Нажмите ещё раз, чтобы убрать';setTimeout(()=>{armed=false;del.textContent='Убрать из списка'},4000);return}
      await write(async()=>{await DB.del('wishes',w.id)},'Убрано из списка');
    })}
  });
}

/* ---------- writes ---------- */
async function write(fn,okMsg){
  try{await fn();closeSheet();toast(okMsg)}
  catch(e){
    const code=e&&e.code;
    const msg=code==='invalid_argument'?'Нет прав на изменение. Попросите владельца выдать доступ на редактирование.':code==='quota_exceeded'?'Хранилище заполнено. Удалите старые записи.':'Не получилось сохранить. Проверьте интернет и попробуйте ещё раз.';
    if(code==='invalid_argument'){S.canWrite=false}
    const err=document.querySelector('#sheet .err'); if(err&&!$('#sheet').hidden) err.textContent=msg; else toast(msg);
    render();
  }
}
async function moveFund(id,d){
  const list=activeFunds().slice(); const i=list.findIndex(f=>f.id===id); const j=i+d; if(i<0||j<0||j>=list.length)return;
  [list[i],list[j]]=[list[j],list[i]];
  try{for(let k=0;k<list.length;k++){if((+list[k].order||0)!==k+1) await DB.update('funds',list[k].id,{order:k+1})}}
  catch(e){toast('Не получилось изменить порядок.')}
}
let toastT;
function toast(t){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,2600)}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const tab=e.target.closest('[data-tab]'); if(tab){S.tab=tab.dataset.tab;render();window.scrollTo(0,0);return}
  const go=e.target.closest('[data-tab-go]'); if(go){S.tab=go.dataset.tabGo;render();window.scrollTo(0,0);return}
  if(e.target.id==='scrim'){closeSheet();return}
  const a=e.target.closest('[data-act]'); if(!a)return;
  const act=a.dataset.act;
  if(await onGateAction(act,a))return;
  if(act==='close')closeSheet();
  else if(act==='open-income'){if(S.canWrite)openIncome()}
  else if(act==='open-expense'){if(S.canWrite)openExpense()}
  else if(act==='new-fund')openFund(null);
  else if(act==='edit-fund'){const f=S.funds.find(x=>x.id===a.dataset.id);if(f)openFund(f)}
  else if(act==='mv')moveFund(a.dataset.id,+a.dataset.d);
  else if(act==='ask-del-fund'){S.confirmFund=a.dataset.id;render()}
  else if(act==='cancel-del'){S.confirmFund=null;render()}
  else if(act==='del-fund'){const f=S.funds.find(x=>x.id===a.dataset.id);if(f){a.disabled=true;deleteFund(f)}}
  else if(act==='distribute-free'){if(S.canWrite)openIncome('free')}
  else if(act==='new-wish'){if(S.canWrite)openWish(null)}
  else if(act==='edit-wish'){const w=S.wishes.find(x=>x.id===a.dataset.id);if(w&&S.canWrite)openWish(w)}
  else if(act==='hm'){S.histMonth=shiftMonth(S.histMonth,+a.dataset.d);render()}
  else if(act==='del-tx'){
    if(a.dataset.armed!=='1'){a.dataset.armed='1';a.textContent='Нажмите ещё раз, чтобы удалить';setTimeout(()=>{if(a.isConnected){a.dataset.armed='';a.textContent='Удалить запись'}},4000);return}
    try{await DB.del('tx',a.dataset.id);toast('Запись удалена')}catch(err){toast('Не получилось удалить запись.')}
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet()});

/* ---------- вход и семья ---------- */
const AUTH_ERR = {
  'auth/invalid-credential':'Неверная почта или пароль.', 'auth/wrong-password':'Неверная почта или пароль.',
  'auth/user-not-found':'Аккаунта с такой почтой нет. Зарегистрируйтесь.', 'auth/invalid-email':'Почта записана с ошибкой.',
  'auth/email-already-in-use':'Эта почта уже зарегистрирована. Войдите.', 'auth/weak-password':'Пароль слишком короткий: нужно хотя бы 6 символов.',
  'auth/missing-password':'Введите пароль.', 'auth/too-many-requests':'Слишком много попыток. Подождите пару минут.',
  'auth/network-request-failed':'Нет связи с сервером. Проверьте интернет.', 'bad-code':'Такого кода нет. Проверьте код у того, кто создал бюджет.',
  'permission-denied':'Нет доступа. Проверьте код приглашения или правила Firestore.', 'unavailable':'Нет связи с сервером. Проверьте интернет.'
};
const errText = e => AUTH_ERR[e && e.code] || 'Что-то пошло не так. Попробуйте ещё раз.';

function renderGate(main){
  if(S.status==='loading'){main.innerHTML=`<div class="empty"><h2>Загружаем ваш бюджет</h2><p class="muted small">Фонды и записи появятся через секунду.</p></div>`;return}
  if(S.status==='config'){main.innerHTML=`<div class="empty"><h2>Сайт ещё не подключён к базе</h2><p class="muted small">${S.gateErr?esc(S.gateErr):'Заполните файл firebase-config.js ключами вашего проекта Firebase и загрузите его на GitHub.'}</p></div>`;return}
  if(S.status==='auth'){
    const reg=S.authMode==='register';
    main.innerHTML=`<section class="gate"><div><div class="eyebrow">Семейный бюджет</div><h2 class="gate-h">${reg?'Регистрация':'Вход'}</h2><p class="muted small">${reg?'Каждый член семьи заводит свой аккаунт. Данные будут общими.':'Войдите, чтобы видеть общие фонды семьи.'}</p></div>
    <form id="authForm" class="gate-form" novalidate>
      ${reg?`<div class="field"><label for="aName">Как вас зовут</label><input id="aName" autocomplete="given-name" placeholder="Макс"></div>`:''}
      <div class="field"><label for="aEmail">Почта</label><input id="aEmail" type="email" autocomplete="email" inputmode="email" autocapitalize="off"></div>
      <div class="field"><label for="aPw">Пароль</label><input id="aPw" type="password" autocomplete="${reg?'new-password':'current-password'}" ${reg?'placeholder="Не меньше 6 символов"':''}></div>
      <div class="err" id="gErr"></div><p class="note" id="gNote"></p>
      <button class="btn primary" type="submit" id="aGo">${reg?'Создать аккаунт':'Войти'}</button>
    </form>
    <div class="gate-links"><button class="link" data-act="auth-mode">${reg?'У меня уже есть аккаунт':'Зарегистрироваться'}</button>${reg?'':'<button class="link" data-act="reset-pw">Забыли пароль?</button>'}</div></section>`;
    return;
  }
  if(S.status==='onboard'){
    const n=(SEED.funds||[]).length, t=(SEED.tx||[]).length;
    main.innerHTML=`<section class="gate"><div><div class="eyebrow">Почти готово</div><h2 class="gate-h">Подключите бюджет</h2><p class="muted small">Один человек создаёт бюджет, второй присоединяется по коду.</p></div>
    <div class="card"><h2>Создать семейный бюджет</h2>
      ${n?`<label class="check"><input type="checkbox" id="oSeed" checked> Перенести ${n} фондов${t?` и ${t} ${t===1?'запись':'записей'}`:''} из версии в Claude</label>`:''}
      <button class="btn primary" data-act="create-hh">Создать</button></div>
    <div class="card"><h2>Присоединиться по коду</h2><p class="note">Код есть у того, кто создал бюджет: в меню «Семья».</p>
      <div class="field"><label for="oCode">Код приглашения</label><input id="oCode" autocapitalize="characters" autocomplete="off" placeholder="Например, K7MP2QXA"></div>
      <button class="btn ghost" data-act="join-hh">Присоединиться</button></div>
    <div class="err" id="gErr"></div>
    <div class="gate-links"><button class="link" data-act="logout">Выйти из аккаунта</button></div></section>`;
  }
}

async function gateBusy(btn,fn){
  const err=$('#gErr'); if(err)err.textContent=''; if(btn)btn.disabled=true;
  try{await fn()}catch(e){const el=$('#gErr');if(el)el.textContent=errText(e)} finally{if(btn&&btn.isConnected)btn.disabled=false}
}
document.addEventListener('submit',e=>{
  if(e.target.id!=='authForm')return; e.preventDefault();
  const reg=S.authMode==='register'; const email=$('#aEmail').value.trim(), pw=$('#aPw').value;
  if(!email){$('#gErr').textContent='Введите почту.';return}
  gateBusy($('#aGo'),async()=>{
    if(reg){const name=$('#aName').value.trim(); if(!name){throw {code:'_name'}} S.pendingName=name; await DB.signUp(email,pw,name)}
    else await DB.signIn(email,pw);
  });
});
AUTH_ERR._name='Напишите, как вас зовут: имя видно в истории записей.';

async function onGateAction(act,a){
  if(act==='auth-mode'){S.authMode=S.authMode==='register'?'login':'register';render();return true}
  if(act==='reset-pw'){const email=$('#aEmail').value.trim(); if(!email){$('#gErr').textContent='Введите почту, и мы пришлём ссылку для нового пароля.';return true}
    gateBusy(a,async()=>{await DB.resetPassword(email);$('#gNote').textContent='Письмо со ссылкой отправлено. Проверьте почту, в том числе «Спам».'});return true}
  if(act==='logout'){closeSheet();await DB.signOut();return true}
  if(act==='create-hh'){const useSeed=$('#oSeed')?$('#oSeed').checked:false;
    gateBusy(a,async()=>{const hid=await DB.createHousehold(S.uid,S.myName,useSeed?SEED:null);startHousehold(hid)});return true}
  if(act==='join-hh'){const code=$('#oCode').value.trim(); if(!code){$('#gErr').textContent='Введите код приглашения.';return true}
    gateBusy(a,async()=>{const hid=await DB.joinHousehold(S.uid,S.myName,code);startHousehold(hid)});return true}
  if(act==='settings'){openSettings();return true}
  return false;
}

function openSettings(){
  const code=S.household&&S.household.inviteCode||'';
  const ids=Object.keys(S.members);
  openSheet(`${sheetHead('Семья')}
  <div class="field"><label>Код приглашения</label><div class="code" id="sCode">${esc(code)}</div>
  <p class="note">Второй человек регистрируется на этом сайте, выбирает «Присоединиться по коду» и вводит этот код.</p>
  <div class="btn-row"><button class="btn ghost" id="sCopy">Скопировать</button><button class="btn ghost" id="sNew">Новый код</button></div></div>
  <div class="field"><label>Участники</label><div class="list">${ids.map(id=>`<div class="row"><div class="row-main"><span class="name">${esc(S.members[id]||'Без имени')}</span><span class="note">${id===S.uid?'вы':''}</span></div></div>`).join('')}</div></div>
  <div class="field"><label for="sName">Ваше имя</label><input id="sName" value="${esc(S.members[S.uid]||S.myName||'')}"></div>
  <button class="btn ghost" id="sSaveName">Сохранить имя</button>
  <div class="err" id="sErr"></div>
  <button class="btn danger" data-act="logout">Выйти из аккаунта</button>`,()=>{
    $('#sCopy').addEventListener('click',async()=>{const c=$('#sCode').textContent;try{await navigator.clipboard.writeText(c);toast('Код скопирован')}catch(e){const r=document.createRange();r.selectNodeContents($('#sCode'));const s=getSelection();s.removeAllRanges();s.addRange(r)}});
    const nb=$('#sNew');let armed=false;nb.addEventListener('click',async()=>{
      if(!armed){armed=true;nb.textContent='Старый код перестанет работать. Нажмите ещё раз';setTimeout(()=>{armed=false;if(nb.isConnected)nb.textContent='Новый код'},4000);return}
      nb.disabled=true;try{const c=await DB.newInvite(code);$('#sCode').textContent=c;toast('Новый код создан')}catch(e){$('#sErr').textContent=errText(e)}finally{nb.disabled=false;nb.textContent='Новый код';armed=false}
    });
    $('#sSaveName').addEventListener('click',async()=>{const n=$('#sName').value.trim();if(!n){$('#sErr').textContent='Имя не может быть пустым.';return}await DB.setName(S.uid,n);S.myName=n;toast('Имя сохранено')});
  });
}

/* ---------- запуск ---------- */
let unsubs=[];
function stopWatching(){unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[]}
function startHousehold(hid){
  stopWatching(); S.hid=hid; DB.useHousehold(hid); S.status='loading'; render();
  let gotF=false,gotT=false;
  const done=()=>{if(gotF&&gotT&&S.status==='loading')S.status='ready';if(S.status==='ready')render()};
  const onErr=e=>{if(e&&e.code==='permission-denied'){stopWatching();S.status='onboard';render();toast('Нет доступа к этому бюджету. Присоединитесь заново по коду.')}};
  unsubs.push(DB.watchCol('funds',list=>{S.funds=list.sort((a,b)=>(+a.order||0)-(+b.order||0)||(a.createdAt||0)-(b.createdAt||0));gotF=true;done()},onErr));
  unsubs.push(DB.watchCol('tx',list=>{S.tx=list.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||0)-(a.createdAt||0));gotT=true;done()},onErr));
  unsubs.push(DB.watchCol('wishes',list=>{S.wishes=list.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));done()},()=>{}));
  unsubs.push(DB.watchCol('members',list=>{S.members={};for(const m of list)S.members[m.id]=m.name||'';S.names={...S.members,[S.uid]:'вы'};done()},()=>{}));
  unsubs.push(DB.watchHousehold(h=>{S.household=h},()=>{}));
}

render();
(async()=>{
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{})}
  if(!DB.configured){S.status='config';render();return}
  try{await DB.init()}catch(e){S.status='config';S.gateErr='Не удалось загрузить библиотеки Firebase. Проверьте интернет и обновите страницу.';render();return}
  DB.setErrorHandler(e=>{if(e&&e.code==='permission-denied')toast('Сервер не принял запись: нет доступа.');else if(e&&e.code!=='unavailable')toast('Запись не сохранилась на сервере. Попробуйте ещё раз.')});
  DB.onAuth(async u=>{
    stopWatching(); closeSheet();
    if(!u){S.uid=null;S.hid=null;S.funds=[];S.tx=[];S.wishes=[];S.members={};S.status='auth';render();return}
    S.uid=u.uid; S.myName=u.name||S.pendingName||''; S.status='loading'; render();
    let prof=null; try{prof=await DB.getProfile(u.uid)}catch(e){}
    if(prof&&prof.name&&!S.myName)S.myName=prof.name;
    if(!prof||!prof.hid){S.status='onboard';render();return}
    startHousehold(prof.hid);
  });
})();
