import * as DB from './fb.js';
import { seed as SEED } from './seed.js';

const KINDS = {
  percent:{label:'Процент с дохода', short:'%'},
  monthly:{label:'Платёж каждый месяц', short:'в месяц'},
  goal:{label:'Накопить сумму', short:'цель'},
  debt:{label:'Погасить долг', short:'долг'},
  reward:{label:'Награды: % от денег сверх плана', short:'награды'},
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
      const amt=+t.amount||0, cat=t.fundId, src=t.from||t.fundId;
      const isDebt=(S.funds.find(x=>x.id===cat)||{}).kind==='debt';
      if(inM) spentM+=amt;
      if(src!==cat){
        get(src).spent+=amt;                       // деньги ушли из фонда-источника
        const c=get(cat); c.alloc+=amt; if(isDebt&&inM)c.allocM+=amt;  // и пришли в фонд-категорию
        if(isDebt) continue;                       // платёж по долгу уменьшает остаток
      }
      const s=get(cat); s.spent+=amt; if(inM)s.spentM+=amt;
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
  else if(f.kind==='goal'){need=Math.max(0,v-balance);if(+f.cap>0)need=Math.min(need,Math.max(0,+f.cap-s.allocM))}
  return {balance,need,spentM:s.spentM,allocM:s.allocM,moved:s.alloc-s.spent};
}
function monthsLeft(deadline){
  if(!deadline)return 0;
  const [dy,dm]=deadline.split('-').map(Number);const n=new Date();
  return (dy-n.getFullYear())*12+(dm-(n.getMonth()+1))+1;
}
function plan(amount,taxable){
  const {get}=stats(); let rem=amount; const rows=[];
  let tmp=amount;
  for(const f of activeFunds()){
    if(f.kind==='percent') tmp-=(f.taxOnly&&!taxable)?0:Math.round(amount*(+f.value||0)/100);
    else if(f.kind==='monthly') tmp-=Math.min(Math.max(0,tmp),Math.round(fstate(f,get).need));
  }
  const surplus=Math.max(0,tmp);
  for(const f of activeFunds()){
    let need=0;
    if(f.kind==='percent') need=(f.taxOnly&&!taxable)?0:Math.round(amount*(+f.value||0)/100);
    else if(f.kind==='reward') need=Math.round(surplus*(+f.value||0)/100);
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
/* ---------- «Хочу купить»: варианты по формуле ---------- */
const BONUS_PCT = 5;          // награда за закрытый долг: % от суммы долга
const REWARD_DEFAULT = 10;    // фонд наград: % от денег сверх обязательных платежей
function plural(n,a,b,c){n=Math.abs(Math.round(n))%100;const n1=n%10;if(n>10&&n<20)return c;if(n1>1&&n1<5)return b;if(n1===1)return a;return c}
const daysWord=d=>d>=60?monthsWord(Math.round(d/30.4)):`${d} ${plural(d,'день','дня','дней')}`;
const monthsWord=m=>`${m} ${plural(m,'месяц','месяца','месяцев')}`;
function monthIn(k){const m=shiftMonth(curMonth(),k);const [y,mm]=m.split('-').map(Number);return `в ${PREP[mm-1]}${y!==new Date().getFullYear()?' '+y:''}`}
const round500=x=>Math.max(500,Math.round(x/500)*500);

// Обычный доход в месяц: из настроек семьи, иначе средний за прошлые 2 месяца
function usualIncome(){
  const e=+(S.household&&S.household.expectedIncome)||0; if(e>0) return e;
  const ms=[shiftMonth(curMonth(),-1),shiftMonth(curMonth(),-2)]; const by={};
  for(const t of S.tx) if(t.type==='income'&&ms.includes(t.month)) by[t.month]=(by[t.month]||0)+(+t.amount||0);
  const v=Object.values(by).filter(x=>x>0); return v.length?sum(v)/v.length:0;
}
// Деньги сверх обязательных платежей в обычный месяц: до фонда наград и после него
function monthFlow(P){
  const inc=usualIncome(); if(!inc) return {base:0,free:0,known:false};
  const base=Math.max(0,inc*(1-P.pct/100)-P.totalMonthly);
  const rp=sum(P.funds.filter(f=>f.kind==='reward').map(f=>+f.value||0));
  return {base,free:base*(1-rp/100),known:true};
}

function analyzeWish(price,fundId,wishId){
  if(!(price>0)) return null;
  const P=monthPicture(); const {get,funds,mi}=P; const gross=x=>P.pct<100?x/(1-P.pct/100):x;
  const byId=id=>funds.find(f=>f.id===id);
  const bal=id=>id==='_free'?P.free:(byId(id)?fstate(byId(id),get).balance:0);
  const F=monthFlow(P);
  const debts=funds.filter(f=>f.kind==='debt');
  const openDebt=debts.find(f=>fstate(f,get).remaining>0);
  const monthlyDone=P.needMonthly<=0.5, planDone=P.stillNet<=0.5;
  const delay=x=>{if(!openDebt)return '';if(!F.free)return ` Закрытие «${openDebt.name}» отодвинется.`;return ` «${openDebt.name}» закроется примерно на ${daysWord(Math.max(1,Math.round(x/F.free*30.4)))} позже.`};
  const opts=[]; const used=new Set();
  const push=o=>{if(o.buy){if(used.has(o.buy.src))return;used.add(o.buy.src)}opts.push(o)};

  // 1. Цель, которую копили именно на эту покупку
  const wg=wishId?funds.find(f=>f.kind==='goal'&&f.wishId===wishId):null;
  if(wg){const b=bal(wg.id);
    if(b>=price) push({tone:'good',title:`Из цели «${wg.name}»`,text:`Вы копили именно на это, в цели ${fmt(b)}. Покупка ничего не сдвигает.`,buy:{src:wg.id}});
    else push({tone:'info',title:`Копится в «${wg.name}»`,text:`Накоплено ${fmt(b)} из ${fmt(price)}.`+(+wg.cap?` По ${fmt(wg.cap)} в месяц цель наберётся примерно ${monthIn(Math.ceil((price-b)/+wg.cap))}.`:'')});
  }
  // 2. Фонд наград
  const rfs=funds.filter(f=>f.kind==='reward');
  if(rfs.length){
    const r=rfs.reduce((a,f)=>bal(f.id)>bal(a.id)?f:a,rfs[0]); const b=bal(r.id); const perM=F.base*(+r.value||0)/100;
    if(b>=price) push({tone:'good',title:`Из фонда «${r.name}»`,text:`Это деньги на радости, их тратят без ущерба для плана. После покупки останется ${fmt(b-price)}.`,buy:{src:r.id}});
    else push({tone:'info',title:`В «${r.name}» ${fmt(b)}`,text:`Не хватает ${fmt(price-b)}.`+(perM>0?` Фонд пополняется примерно на ${fmt(perM)} в месяц, нужная сумма соберётся ${monthIn(Math.ceil((price-b)/perM))}.`:' Фонд пополняется, когда доход превышает обязательные платежи.')});
  } else {
    const perM=F.base*REWARD_DEFAULT/100;
    push({tone:'info',title:'Включить фонд наград',text:`С каждого дохода ${REWARD_DEFAULT}% денег, оставшихся после обязательных платежей, будут откладываться на покупки для себя${perM>0?`, примерно ${fmt(perM)} в месяц`:''}. Тратить их можно без ущерба для плана.`,action:'add-reward'});
  }
  // 3. Выбранный фонд расходов на месяц
  const chosen=fundId&&fundId!=='_free'?byId(fundId):null;
  if(chosen&&chosen.kind==='monthly'){const b=bal(chosen.id);
    if(b>=price) push({tone:'good',title:`Из «${chosen.name}»`,text:`Укладывается в бюджет фонда на месяц, останется ${fmt(b-price)}.`,buy:{src:chosen.id}});
    else push({tone:'info',title:`В «${chosen.name}» ${fmt(b)}`,text:`На покупку не хватает ${fmt(price-b)}.`});
  }
  // 4. Награда за закрытие долга
  for(const d of debts){
    const s=fstate(d,get); const B=Math.round((+d.value||0)*BONUS_PCT/100)-(+d.bonusUsed||0); if(B<500) continue;
    if(s.remaining<=0){
      const need=Math.min(price,B);
      const cands=[{id:'_free'},...funds.filter(f=>f.kind==='rest'),...funds.filter(f=>f.kind==='goal'&&!f.deadline&&!f.wishId)];
      const src=cands.map(c=>c.id).find(id=>bal(id)>=need);
      if(price<=B&&src) push({tone:'good',title:`Награда за закрытие «${d.name}»`,text:`Долг закрыт, и до ${fmt(B)} можно потратить на себя. Деньги возьмутся из «${fundName(src)}».`,buy:{src,bonus:d.id}});
      else push({tone:'info',title:`Награда за закрытие «${d.name}»: ${fmt(B)}`,text:price>B?`Покроет ${fmt(B)} из ${fmt(price)}. Остальное придётся добрать из фонда наград или накоплений.`:'Награда доступна, когда в накоплениях появятся деньги.'});
    } else {
      const eta=d.deadline?`, по плану до ${dateLabel(d.deadline)}`:F.free>0?`, примерно ${monthIn(Math.ceil(s.remaining/F.free))}`:'';
      push({tone:'info',title:`Закроете долг «${d.name}» — награда до ${fmt(B)}`,text:`Осталось погасить ${fmt(s.remaining)}${eta}. ${B>=price?'Этой награды хватит на покупку целиком.':`Награда покроет ${fmt(B)} из ${fmt(price)}.`}`});
    }
  }
  // 5. Из накоплений, если платежи месяца покрыты
  const savings=[{id:'_free',kind:'free'},...funds.filter(f=>f.kind==='rest'||(f.kind==='goal'&&!f.deadline&&!f.wishId))]
    .map(f=>({f,b:bal(f.id)})).filter(x=>x.b>=price).sort((a,b)=>b.b-a.b).slice(0,2);
  if(chosen&&!['monthly','reward'].includes(chosen.kind)&&chosen!==wg&&!savings.some(x=>x.f.id===chosen.id)){const b=bal(chosen.id);if(b>=price)savings.unshift({f:chosen,b});}
  for(const {f,b} of savings){
    const nm=f.id==='_free'?'Без фонда':f.name;
    if(f.kind==='free'&&!openDebt&&monthlyDone){push({tone:'good',title:'Из денег без фонда',text:`Долгов нет, платежи месяца покрыты. Останется ${fmt(b-price)}.`,buy:{src:'_free'}});continue}
    const goalTxt=f.kind==='goal'&&+f.value?` из ${fmt(f.value)}`:'';
    push({tone:'warn',title:`Взять из «${nm}»`,text:`Было ${fmt(b)}, станет ${fmt(b-price)}${goalTxt}.`+(monthlyDone?'':` Платежи на ${NOM[mi].toLowerCase()} ещё не покрыты, следующий доход сначала уйдёт на них.`)+delay(price),buy:{src:f.id}});
  }
  // 6. Копить понемногу
  const hasGood=opts.some(o=>o.tone==='good'&&o.buy);
  if(!hasGood&&!wg){
    const N=F.free>0?round500(Math.min(price,Math.max(1000,F.free*0.15))):round500(Math.max(1000,price/4));
    const k=Math.ceil(price/N);
    push({tone:'info',title:`Копить по ${fmt(N)} в месяц`,text:`Купите примерно ${monthIn(k)}. Деньги будут откладываться раньше долгов, понемногу с каждого дохода.`+(openDebt&&F.free>0?` Каждый месяц это сдвигает закрытие «${openDebt.name}» примерно на ${daysWord(Math.max(1,Math.round(N/F.free*30.4)))}.`:''),goal:{perMonth:N}});
  }
  // 7. Порог без ущерба
  const safe=Math.max(0,...opts.filter(o=>o.tone==='good').map(o=>o.buy?bal(o.buy.src):0),
    ...rfs.map(f=>bal(f.id)),chosen&&chosen.kind==='monthly'?bal(chosen.id):0,(!openDebt&&monthlyDone)?P.free:0);
  if(safe>=500&&safe<price) push({tone:'info',title:`Без ущерба сейчас можно до ${fmt(safe)}`,text:'Если найдётся вариант дешевле, его можно взять прямо сейчас.'});
  // 8. Условие по доходу
  if(!planDone&&!opts.some(o=>o.tone==='good'&&o.buy)) push({tone:'info',title:`Или дождитесь ещё ${fmt(gross(P.stillNet+price))} дохода`,text:`Тогда платежи и план по долгам на ${NOM[mi].toLowerCase()} будут закрыты, а покупка поместится сверх них.`});

  const rank={good:0,warn:1,info:2}; opts.sort((a,b)=>rank[a.tone]-rank[b.tone]);
  const lines=[];
  if(P.needMonthly>0.5) lines.push(`Ежемесячные платежи на ${NOM[mi].toLowerCase()} не покрыты: не хватает ${fmt(P.needMonthly)}.`);
  for(const d of P.dl) if(d.left>0&&d.stillThisMonth>0) lines.push(`«${d.f.name}»: в ${PREP[mi]} по плану ещё ${fmt(d.stillThisMonth)}.`);
  if(openDebt&&!F.known) lines.push('Укажите обычный доход семьи в меню ☰ → Семья, и я посчитаю, на сколько покупка сдвигает долги.');
  let tone,title;
  if(hasGood){tone='good';title='Можно купить без ущерба';lines.length=0}
  else if(opts.some(o=>o.tone==='warn'&&o.buy)){tone='warn';title='Можно, но цели сдвинутся'}
  else {tone='bad';title='Сейчас лучше подождать'; lines.push('Ниже варианты, как приблизить покупку.')}
  return {tone,title,lines,opts};
}
const VSHORT={good:'можно сейчас',warn:'можно, но сдвинет цели',bad:'пока копим'};
function wishBox(v){
  if(!v) return `<p class="note">Введите цену, и здесь появятся варианты.</p>`;
  const btn=(o,i)=>o.buy?`<div class="opt-act"><button class="btn sm ${o.tone==='good'?'primary':'ghost'}" data-wopt="${i}">Купить из «${esc(fundName(o.buy.src))}»</button></div>`
    :o.goal?`<div class="opt-act"><button class="btn sm ghost" data-wopt="${i}">Начать копить</button></div>`
    :o.action==='add-reward'?`<div class="opt-act"><button class="btn sm ghost" data-wopt="${i}">Включить фонд наград</button></div>`:'';
  return `<div class="verdict ${v.tone}"><b>${esc(v.title)}</b>${v.lines.map(l=>`<p>${esc(l)}</p>`).join('')}</div>
  ${v.opts.length?`<div class="eyebrow">Варианты</div><div class="tips">${v.opts.map((o,i)=>`<div class="tip ${o.tone}"><span class="dot"></span><div><b>${esc(o.title)}</b><span class="muted small">${esc(o.text)}</span>${btn(o,i)}</div></div>`).join('')}</div>`:''}`;
}

/* ---------- render ---------- */
function render(){
  $('#monthLbl').textContent=monthLabel(curMonth());
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===S.tab?'page':'false'));
  const main=$('#main');
  document.querySelector('nav.tabs').hidden=S.status!=='ready';
  $('#setBtn').hidden=S.status!=='ready';
  if(S.status==='setup'){if(main.dataset.view!=='setup'||S.enterNext){S.enterNext=false;drawWizard()}return}
  if(S.status!=='ready'){main.dataset.view='gate';renderGate(main);return}
  let html='';
  if(!S.canWrite) html+=`<div class="ro">У вас доступ только для просмотра. Чтобы вносить записи, владелец должен выдать права на изменение.</div>`;
  if(S.tab==='now') html+=renderNow();
  else if(S.tab==='funds') html+=renderFunds();
  else html+=renderHist();
  main.innerHTML=html; main.dataset.view=S.tab;
  main.classList.remove('enter');
  if(S.enterNext){S.enterNext=false;void main.offsetWidth;main.classList.add('enter');countUp(main)}
  moveTabInd();
  resolveNames();
  if(S.sheetRefresh&&!$('#sheet').hidden)S.sheetRefresh();
}
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function moveTabInd(){
  const ind=$('#tabInd'); const b=document.querySelector('nav.tabs button[aria-current="page"]'); if(!ind||!b||!b.offsetWidth)return;
  const first=!ind.style.width; if(first)ind.classList.add('noanim');
  ind.style.width=b.offsetWidth+'px'; ind.style.transform=`translateX(${b.offsetLeft}px)`;
  if(first)requestAnimationFrame(()=>requestAnimationFrame(()=>ind.classList.remove('noanim')));
}
addEventListener('resize',()=>moveTabInd());
function countUp(root){
  if(calm())return;
  root.querySelectorAll('[data-count]').forEach(el=>{const to=+el.dataset.count||0,t0=performance.now(),d=550;
    const step=t=>{const k=Math.min(1,(t-t0)/d),e=1-Math.pow(1-k,3);el.textContent=fmt(to*e);if(k<1&&el.isConnected)requestAnimationFrame(step)};requestAnimationFrame(step)});
}
let rT; function renderSoon(){clearTimeout(rT);rT=setTimeout(render,30)}
function emptyFunds(){
  return `<div class="empty"><h2>Фондов пока нет</h2><p class="muted small">Фонд — это конверт для денег: налоги, квартира, кредитка, подушка. Добавьте первый, и каждый доход будет раскладываться по ним автоматически.</p>${S.canWrite?'<button class="btn primary" data-act="new-fund">Добавить фонд</button>':''}</div>`;
}
function renderNow(){
  if(!activeFunds().length) return emptyFunds();
  const P=monthPicture(); const mi=P.mi;
  let h=`<section class="hero">`;
  if(P.stillNet>0.5){
    h+=`<div class="eyebrow">Ещё нужно заработать в ${PREP[mi]}</div><div class="fig" data-count="${Math.round(P.stillGross)}">${fmt(P.stillGross)}</div>
    <div class="muted small">Столько дохода закроет ежемесячные платежи${P.dl.length?' и план по срокам':''}${P.pct?`, с учётом ${nf.format(P.pct)}% в процентные фонды`:''}.</div>`;
  } else {
    h+=`<div class="eyebrow">${NOM[mi]}</div><div class="fig ok">План месяца выполнен</div><div class="muted small">Дальнейший доход пойдёт в накопления по очереди фондов.</div>`;
  }
  h+=`<div class="hero-split"><div class="kv"><div class="k">Доход в ${PREP[mi]}</div><div class="v">${fmt(P.incomeM)}</div></div><div class="kv"><div class="k">Траты в ${PREP[mi]}</div><div class="v">${fmt(P.spentM)}</div></div></div></section>`;
  if(S.canWrite) h+=`<div class="btn-row"><button class="btn primary" data-act="open-income">Пришли деньги</button><button class="btn ghost" data-act="open-expense">Потратили</button><button class="btn ghost wide" data-act="new-wish">Хочу купить…</button></div>`;
  const T=tips(P); T.splice(Math.min(1,T.length),0,...wishTips());
  if(T.length) h+=`<section class="block"><h2>Что делать сейчас</h2><div class="tips">${T.map(t=>`<div class="tip ${t.tone}"><span class="dot"></span><div><b>${esc(t.title)}</b><span class="muted small">${esc(t.text)}</span>${t.act&&S.canWrite?`<div style="margin-top:8px"><button class="btn sm ghost" data-act="${t.act.act}" ${t.act.id?`data-id="${esc(t.act.id)}"`:''}>${esc(t.act.label)}</button></div>`:''}</div></div>`).join('')}</div></section>`;
  if(S.wishes.length) h+=`<section class="block"><h2>Хочу купить</h2><div class="list">${S.wishes.map(w=>{const fc=wishForecast(w);return `<button class="row wish" data-act="edit-wish" data-id="${esc(w.id)}" ${S.canWrite?'':'disabled'}><span class="row-main"><span class="name">${esc(w.name||'Без названия')}</span><span class="amt">${fmt(w.price)}</span></span><span>${fc?`<span class="chip v-${fc.tone}">${esc(fc.text)}</span>${fc.how&&!fc.now?`<span class="note"> ${esc(fc.how)}</span>`:''}`:''}</span></button>`}).join('')}</div></section>`;
  h+=`<section class="block"><div class="sec-head"><h2>Фонды</h2><button class="btn sm ghost" data-tab-go="funds">Настроить</button></div><div class="list">${activeFunds().map(f=>fundRowNow(f,P.get,mi)).join('')}</div></section>`;
  return h;
}
function fundRowNow(f,get,mi){
  const s=fstate(f,get), v=+f.value||0; let right='',sub='',pc=null;
  if(f.kind==='monthly'){const cov=Math.max(0,v-s.need);pc=v?cov/v:1;right=`${fmt(cov)} из ${fmt(v)}`;sub=`в фонде <span class="${s.balance<0?'neg':''}">${fmt(s.balance)}</span> · потрачено в ${PREP[mi]} ${fmt(s.spentM)}`}
  else if(f.kind==='goal'){pc=v?s.balance/v:0;right=`${fmt(s.balance)} из ${fmt(v)}`;sub=s.balance<v-0.5?`осталось ${fmt(v-s.balance)}`+(+f.cap?` · по ${fmt(f.cap)} в месяц`:'')+(f.deadline?` · до ${dateLabel(f.deadline)}`:''):'цель достигнута'}
  else if(f.kind==='reward'){right=`<span class="${s.balance<0?'neg':''}">${fmt(s.balance)}</span>`;sub=`${nf.format(v)}% от денег сверх обязательных платежей · на покупки для себя`}
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
    let val=f.kind==='percent'||f.kind==='reward'?`${nf.format(v)}%`:f.kind==='rest'?'':fmt(v)+(f.kind==='monthly'?' в месяц':'')+(+f.cap?` · по ${fmt(f.cap)} в месяц`:'');
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
    const sub=[dateLabel(t.date), isTr?`из «${fundName(t.from)}»`:isIn?'':(t.note?fundName(t.fundId):''), (!isIn&&!isTr&&t.from&&t.from!==t.fundId)?`из «${fundName(t.from)}»`:''].filter(Boolean).join(' · ');
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
let sheetT;
function openSheet(html,onMount){
  clearTimeout(sheetT); $('#scrim').classList.remove('closing');
  const sh=$('#sheet'); sh.classList.remove('closing'); sh.innerHTML=`<div class="wrap">${html}</div>`; sh.hidden=false; $('#scrim').hidden=false;
  onMount&&onMount(sh); const f=sh.querySelector('input.big,input'); f&&setTimeout(()=>f.focus(),60);
}
function closeSheet(){
  S.sheetRefresh=null; const sh=$('#sheet'), sc=$('#scrim'); if(sh.hidden)return;
  const done=()=>{sh.classList.remove('closing');sc.classList.remove('closing');sh.hidden=true;sc.hidden=true;sh.innerHTML=''};
  if(calm()){done();return}
  sh.classList.add('closing');sc.classList.add('closing');clearTimeout(sheetT);sheetT=setTimeout(done,180);
}
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
  const {get}=stats(); const funds=activeFunds();
  const free=fstate({id:'_free',kind:'goal',value:0},get).balance;
  const srcOpts=funds.filter(f=>f.kind!=='debt').map(f=>({id:f.id,name:f.name,bal:fstate(f,get).balance}));
  if(free>0.5)srcOpts.push({id:'_free',name:'Без фонда',bal:free});
  openSheet(`${sheetHead('Потратили')}${typeSeg('expense')}
  <div class="field"><label for="exAmt">Сумма</label><input class="big" id="exAmt" inputmode="decimal" placeholder="0 ₽" autocomplete="off"></div>
  <div class="field"><label for="exCat">На что потратили</label><select id="exCat">${funds.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select></div>
  <div class="field"><label for="exSrc">Из какого фонда взяли деньги</label><select id="exSrc"><option value="">Из этого же фонда</option>${srcOpts.map(o=>`<option value="${esc(o.id)}">${esc(o.name)} · ${fmt(o.bal)}</option>`).join('')}</select></div>
  <div class="grid2"><div class="field"><label for="exDate">Дата</label><input type="date" id="exDate" value="${today()}"></div><div class="field"><label for="exNote">Комментарий</label><input id="exNote" placeholder="Необязательно"></div></div>
  <div class="note" id="exHint"></div><div class="err" id="exErr"></div>
  <button class="btn primary" id="exSave">Записать трату</button>`, ()=>{
    const hint=()=>{
      const cat=funds.find(f=>f.id===$('#exCat').value); const srcId=$('#exSrc').value||(cat&&cat.id); const a=Math.round(parseAmt($('#exAmt').value));
      if(!cat){$('#exHint').textContent='';return}
      const lines=[];
      if(cat.kind==='debt'&&!$('#exSrc').value){$('#exHint').innerHTML=`<p>Платёж по долгу: выберите фонд, из которого взяли деньги.</p>`;return}
      const src=srcOpts.find(o=>o.id===srcId);
      if(src){const after=src.bal-a;lines.push(`«${esc(src.name)}»: было ${fmt(src.bal)}, станет <span class="${after<0?'neg':''}">${fmt(after)}</span>.`)}
      if(srcId!==cat.id){
        const s=fstate(cat,get);
        if(cat.kind==='debt') lines.push(`«${esc(cat.name)}»: остаток долга станет ${fmt(Math.max(0,s.remaining-a))}.`);
        else if(cat.kind==='monthly') lines.push(`«${esc(cat.name)}»: трата засчитается, на месяц будет покрыто ${fmt(Math.min(+cat.value||0,(+cat.value||0)-s.need+a))} из ${fmt(cat.value)}.`);
        else lines.push(`Трата засчитается в «${esc(cat.name)}».`);
      }
      $('#exHint').innerHTML=lines.map(l=>`<p>${l}</p>`).join('');
    };
    ['#exAmt','#exCat','#exSrc'].forEach(s=>$(s).addEventListener(s==='#exAmt'?'input':'change',hint));hint();
    $('#exSave').addEventListener('click',async()=>{
      const amt=Math.round(parseAmt($('#exAmt').value)); if(amt<=0){$('#exErr').textContent='Введите сумму больше нуля.';return}
      const fundId=$('#exCat').value; if(!fundId){$('#exErr').textContent='Сначала добавьте фонд.';return}
      const cat=funds.find(f=>f.id===fundId);
      if(cat&&cat.kind==='debt'&&!$('#exSrc').value){$('#exErr').textContent='Выберите, из какого фонда взяли деньги на платёж.';return}
      const from=$('#exSrc').value||fundId; const date=$('#exDate').value||today();
      await write(async()=>{await DB.add('tx',{type:'expense',amount:amt,fundId,from,date,month:date.slice(0,7),note:$('#exNote').value.trim(),by:S.uid||null,createdAt:Date.now()})},'Трата записана');
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
  <div class="field" id="fCapBox"><label for="fCap">Не больше в месяц, ₽ (необязательно)</label><input id="fCap" inputmode="decimal" value="${+f.cap?nf.format(f.cap):''}"><span class="note">Цель будет забирать из каждого месяца не больше этой суммы, остальное пойдёт дальше по очереди.</span></div>
  <div class="field" id="fDlBox"><label for="fDl">Срок (необязательно)</label><input type="date" id="fDl" value="${esc(f.deadline||'')}"></div>
  <div class="field" id="fCurBox"><label for="fCur" id="fCurLbl"></label><input id="fCur" inputmode="decimal" value="${isNew&&f.kind!=='debt'?'':nf.format(cur)}"><span class="note" id="fCurNote"></span></div>
  <div class="err" id="fErr"></div>
  <button class="btn primary" id="fSave">${isNew?'Добавить фонд':'Сохранить'}</button>
  ${isNew?'':`<button class="btn danger" id="fDel">Удалить фонд</button>`}`, ()=>{
    const sync=()=>{const k=$('#fKind').value;
      $('#fValBox').hidden=k==='rest'||k==='debt';
      $('#fValLbl').textContent=k==='percent'?'Процент от дохода':k==='reward'?'Процент от денег сверх обязательных платежей':k==='monthly'?'Сумма в месяц, ₽':'Цель, ₽';
      $('#fCapBox').hidden=k!=='goal';
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
      if((kind==='percent'||kind==='reward')&&(val<=0||val>100)){$('#fErr').textContent='Процент должен быть от 1 до 100.';return}
      if(kind==='debt'&&curIn<=0&&isNew){$('#fErr').textContent='Укажите сумму долга.';return}
      const data={name,kind,taxOnly:kind==='percent'?$('#fTax').checked:false,deadline:(kind==='goal'||kind==='debt')?($('#fDl').value||''):'',cap:kind==='goal'?Math.round(parseAmt($('#fCap').value)):0};
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
async function insertFund(data,idx){
  const list=activeFunds().slice(); idx=Math.max(0,Math.min(idx,list.length));
  for(let k=0;k<list.length;k++){const want=k<idx?k+1:k+2; if((+list[k].order||0)!==want) await DB.update('funds',list[k].id,{order:want})}
  data.order=idx+1; data.createdAt=data.createdAt||Date.now();
  return DB.add('funds',data);
}
function rewardIndex(){const l=activeFunds();let i=-1;l.forEach((f,k)=>{if(f.kind==='monthly'||f.kind==='percent')i=k});return i+1}
function wishGoalIndex(){const l=activeFunds();let i=l.findIndex(f=>f.kind==='debt');if(i<0)i=l.findIndex(f=>f.kind==='rest');return i<0?l.length:i}

function openWish(w){
  const isNew=!w; w=w?{...w}:{name:'',price:'',fundId:''};
  const P=monthPicture();
  const opts=activeFunds().filter(f=>f.kind!=='debt');
  const fundOpts=`<option value="">Подобрать автоматически</option>${opts.map(f=>`<option value="${esc(f.id)}" ${w.fundId===f.id?'selected':''}>${esc(f.name)} · ${fmt(fstate(f,P.get).balance)}</option>`).join('')}${P.free>0.5||w.fundId==='_free'?`<option value="_free" ${w.fundId==='_free'?'selected':''}>Без фонда · ${fmt(P.free)}</option>`:''}`;
  openSheet(`${sheetHead(isNew?'Хочу купить':'Покупка')}
  <div class="field"><label for="wName">Что</label><input id="wName" value="${esc(w.name)}" placeholder="Кроссовки, планшет, ремонт…"></div>
  <div class="field"><label for="wPrice">Цена</label><input class="big" id="wPrice" inputmode="decimal" placeholder="0 ₽" autocomplete="off" value="${w.price?nf.format(w.price):''}"></div>
  <div class="field"><label for="wFund">Из какого фонда хотите платить</label><select id="wFund">${fundOpts}</select></div>
  <div id="wVerdict" class="wish-box"></div><div class="err" id="wErr"></div>
  <button class="btn ghost" id="wSave">${isNew?'Отложить в список':'Сохранить изменения'}</button>
  ${isNew?'':'<button class="btn danger" id="wDel">Убрать из списка</button>'}`, ()=>{
    let v=null;
    const price=()=>Math.round(parseAmt($('#wPrice').value));
    const name=()=>$('#wName').value.trim();
    const draw=()=>{if(!$('#wVerdict'))return;v=analyzeWish(price(),$('#wFund').value,w.id||'');$('#wVerdict').innerHTML=wishBox(v)};
    $('#wPrice').addEventListener('input',()=>{$('#wErr').textContent='';draw()});$('#wFund').addEventListener('change',draw);draw();
    S.sheetRefresh=draw;
    $('#wVerdict').addEventListener('click',async e=>{
      const b=e.target.closest('[data-wopt]'); if(!b||!v)return; const o=v.opts[+b.dataset.wopt]; if(!o)return;
      const p=price(); if(p<=0){$('#wErr').textContent='Введите цену больше нуля.';return}
      if(o.action==='add-reward'){
        b.disabled=true;
        try{await insertFund({name:'Награды',kind:'reward',value:REWARD_DEFAULT,start:0,taxOnly:false,deadline:''},rewardIndex());toast('Фонд наград включён. Он пополнится со следующего дохода')}
        catch(err){$('#wErr').textContent='Не получилось создать фонд.'}
        return;
      }
      if(o.goal){
        if(!name()){$('#wErr').textContent='Напишите, что хотите купить.';return}
        await write(async()=>{
          let wid=w.id;
          if(!wid) wid=await DB.add('wishes',{name:name(),price:p,fundId:'',by:S.uid||null,createdAt:Date.now()});
          const gid=await insertFund({name:`Покупка: ${name()}`,kind:'goal',value:p,cap:o.goal.perMonth,wishId:wid,start:0,taxOnly:false,deadline:''},wishGoalIndex());
          await DB.update('wishes',wid,{name:name(),price:p,fundId:gid});
        },`Цель создана: по ${fmt(o.goal.perMonth)} в месяц с ближайших доходов`);
        return;
      }
      if(o.buy){
        const src=o.buy.src; const date=today(); const nm=name()||'Покупка';
        const g=S.funds.find(x=>x.id===src&&x.wishId); const left=g?Math.round(fstate(g,stats().get).balance-p):0;
        await write(async()=>{
          await DB.add('tx',{type:'expense',amount:p,fundId:src,from:src,date,month:date.slice(0,7),note:nm,by:S.uid||null,createdAt:Date.now()});
          if(o.buy.bonus){const d=S.funds.find(x=>x.id===o.buy.bonus);if(d)await DB.update('funds',d.id,{bonusUsed:(+d.bonusUsed||0)+p})}
          if(g){if(left>0)await DB.add('tx',{type:'transfer',from:g.id,alloc:{_free:left},amount:left,date,month:date.slice(0,7),note:`Цель «${g.name}» выполнена`,by:S.uid||null,createdAt:Date.now()});await DB.update('funds',g.id,{archived:true})}
          if(w.id) await DB.del('wishes',w.id);
        },`Покупка записана: ${fundName(src)}`);
      }
    });
    $('#wSave').addEventListener('click',async()=>{
      const p=price();
      if(!name()){$('#wErr').textContent='Напишите, что хотите купить.';return}
      if(p<=0){$('#wErr').textContent='Введите цену больше нуля.';return}
      const data={name:name(),price:p,fundId:$('#wFund').value};
      await write(async()=>{
        if(isNew) await DB.add('wishes',{...data,by:S.uid||null,createdAt:Date.now()});
        else await DB.update('wishes',w.id,data);
      },isNew?'Добавлено в список «Хочу купить»':'Сохранено');
    });
    const del=$('#wDel'); if(del){let armed=false;del.addEventListener('click',async()=>{
      if(!armed){armed=true;del.textContent='Нажмите ещё раз, чтобы убрать';setTimeout(()=>{armed=false;del.textContent='Убрать из списка'},4000);return}
      await write(async()=>{
        const g=S.funds.find(x=>x.wishId===w.id&&!x.archived);
        if(g){const b=Math.round(fstate(g,stats().get).balance);if(b>0)await DB.add('tx',{type:'transfer',from:g.id,alloc:{_free:b},amount:b,date:today(),month:curMonth(),note:`Цель «${g.name}» отменена`,by:S.uid||null,createdAt:Date.now()});await DB.update('funds',g.id,{archived:true})}
        await DB.del('wishes',w.id);
      },'Убрано из списка');
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
function toast(t){const el=$('#toast');el.textContent=t;el.hidden=false;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,2600)}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const tab=e.target.closest('[data-tab]'); if(tab){if(S.tab!==tab.dataset.tab)S.enterNext=true;S.tab=tab.dataset.tab;render();window.scrollTo(0,0);return}
  const go=e.target.closest('[data-tab-go]'); if(go){S.tab=go.dataset.tabGo;S.enterNext=true;render();window.scrollTo(0,0);return}
  if(e.target.id==='scrim'){closeSheet();return}
  const a=e.target.closest('[data-act]'); if(!a)return;
  const act=a.dataset.act;
  if(await onGateAction(act,a))return;
  if(act==='wz-restart'){closeSheet();S.wz=newWizard(activeFunds().length?'existing':'new');S.status='setup';S.enterNext=true;render();window.scrollTo(0,0);return}
  if(await wzAction(act,a))return;
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
  else if(act==='hm'){S.histMonth=shiftMonth(S.histMonth,+a.dataset.d);S.enterNext=true;render()}
  else if(act==='del-tx'){
    if(a.dataset.armed!=='1'){a.dataset.armed='1';a.textContent='Нажмите ещё раз, чтобы удалить';setTimeout(()=>{if(a.isConnected){a.dataset.armed='';a.textContent='Удалить запись'}},4000);return}
    try{await DB.del('tx',a.dataset.id);toast('Запись удалена')}catch(err){toast('Не получилось удалить запись.')}
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet()});

/* ---------- прогноз по желаниям ---------- */
function wishForecast(w){
  const price=+w.price||0; const v=analyzeWish(price,w.fundId||'',w.id); if(!v) return null;
  if(v.tone==='good'){const o=v.opts.find(o=>o.tone==='good'&&o.buy);return {now:true,k:0,tone:'good',text:'можно сейчас',src:o?o.buy.src:null}}
  const P=monthPicture(), F=monthFlow(P), {get,funds}=P;
  const bal=id=>{const f=funds.find(x=>x.id===id);return f?fstate(f,get).balance:0};
  let best=null; const cand=(k,how)=>{if(isFinite(k)&&(best===null||k<best.k))best={k:Math.max(1,k),how}};
  const wg=funds.find(f=>f.kind==='goal'&&f.wishId===w.id);
  if(wg&&+wg.cap) cand(Math.ceil(Math.max(0,price-bal(wg.id))/+wg.cap),`в цели «${wg.name}»`);
  for(const r of funds.filter(f=>f.kind==='reward')){const perM=F.base*(+r.value||0)/100;if(perM>0)cand(Math.ceil(Math.max(0,price-bal(r.id))/perM),`в фонде «${r.name}»`)}
  for(const d of funds.filter(f=>f.kind==='debt')){const s=fstate(d,get);const B=Math.round((+d.value||0)*BONUS_PCT/100)-(+d.bonusUsed||0);if(B>=price&&s.remaining>0&&F.free>0)cand(Math.ceil(s.remaining/F.free),`как награда за долг «${d.name}»`)}
  if(!best) return {now:false,k:null,tone:v.tone,text:VSHORT[v.tone]};
  return {now:false,k:best.k,soon:best.k<=1,tone:best.k<=1?'soon':'later',how:best.how,text:best.k<=1?'скоро, в ближайший месяц':`≈ ${monthIn(best.k)}`};
}
function wishTips(){
  const out=[];
  for(const w of S.wishes){
    const fc=wishForecast(w); if(!fc) continue;
    if(fc.now) out.push({tone:'good',title:`Можно купить: «${w.name}»`,text:fc.src?`Без ущерба для плана, из «${fundName(fc.src)}». Откройте желание, чтобы записать покупку.`:'Без ущерба для плана.',act:{label:'Открыть',act:'edit-wish',id:w.id}});
    else if(fc.soon) out.push({tone:'info',title:`Скоро можно: «${w.name}»`,text:`Нужная сумма соберётся ${fc.how} в ближайший месяц.`,act:{label:'Открыть',act:'edit-wish',id:w.id}});
  }
  return out;
}

/* ---------- пошаговая настройка ---------- */
const TPL_MONTHLY=['Квартира или аренда','Коммуналка','Еда','Связь и интернет','Транспорт, бензин','Платёж по кредиту','Детский сад, кружки','Подписки','Лекарства'];
const KIND_SHORT={percent:'налог',monthly:'каждый месяц',reward:'награды',debt:'долг',goal:'цель',rest:'остаток'};
function newWizard(mode){
  return {mode,step:0,income:+(S.household&&S.household.expectedIncome)?String(S.household.expectedIncome):'',
    tax:{on:true,pct:'6'},
    monthly:[{name:'Квартира или аренда',amount:''},{name:'Коммуналка',amount:''},{name:'Еда',amount:''}],
    debts:[],cushion:'',reward:{on:true,pct:String(REWARD_DEFAULT)},restName:'Накопления',
    wishes:[{name:'',price:''}],busy:false};
}
const wzSteps=()=>S.wz.mode==='new'?['intro','income','monthly','debts','savings','wishes','finish']:['intro','income','queue','wishes','finish'];
const nA=x=>Math.round(parseAmt(x));
function wzFunds(){
  const z=S.wz; if(z.mode!=='new') return activeFunds();
  const L=[];
  if(z.tax.on&&parseAmt(z.tax.pct)>0) L.push({id:'d-tax',name:'Налоги',kind:'percent',value:parseAmt(z.tax.pct),taxOnly:true});
  z.monthly.forEach((r,i)=>{if(r.name.trim()&&nA(r.amount)>0)L.push({id:'d-m'+i,name:r.name.trim(),kind:'monthly',value:nA(r.amount)})});
  if(z.reward.on&&parseAmt(z.reward.pct)>0) L.push({id:'d-rw',name:'Награды',kind:'reward',value:parseAmt(z.reward.pct)});
  if(nA(z.cushion)>0) L.push({id:'d-c',name:'Подушка безопасности',kind:'goal',value:nA(z.cushion)});
  z.debts.forEach((r,i)=>{if(r.name.trim()&&nA(r.amount)>0)L.push({id:'d-d'+i,name:r.name.trim(),kind:'debt',value:nA(r.amount),deadline:r.deadline||''})});
  L.push({id:'d-rest',name:z.restName.trim()||'Накопления',kind:'rest',value:0});
  return L;
}
function wzMetrics(){
  const funds=wzFunds(), inc=nA(S.wz.income), ex=S.wz.mode!=='new';
  const g=ex?stats().get:null; const left=f=>ex?(f.kind==='debt'?fstate(f,g).remaining:Math.max(0,(+f.value||0)-fstate(f,g).balance)):(+f.value||0);
  const pct=sum(funds.filter(f=>f.kind==='percent').map(f=>+f.value||0));
  const monthly=sum(funds.filter(f=>f.kind==='monthly').map(f=>+f.value||0));
  const rp=sum(funds.filter(f=>f.kind==='reward').map(f=>+f.value||0));
  const base=inc*(1-pct/100)-monthly; const free=Math.max(0,base)*(1-rp/100); const perReward=Math.max(0,base)*rp/100;
  // сроки: цели и долги закрываются по очереди свободными деньгами
  let cum=0; const eta={};
  for(const f of funds){if(f.kind==='goal'&&!f.wishId||f.kind==='debt'){cum+=left(f);eta[f.id]=free>0?Math.ceil(cum/free):null}}
  return {funds,inc,pct,monthly,rp,base,free,perReward,eta};
}
function simSplit(funds,amount){
  let tmp=amount;
  for(const f of funds){if(f.kind==='percent')tmp-=amount*(+f.value||0)/100;else if(f.kind==='monthly')tmp-=Math.min(Math.max(0,tmp),+f.value||0)}
  const surplus=Math.max(0,tmp); let rem=amount; const rows=[];
  for(const f of funds){
    const v=+f.value||0; let need=0;
    if(f.kind==='percent')need=amount*v/100; else if(f.kind==='reward')need=surplus*v/100; else if(f.kind==='rest')need=rem;
    else if(f.kind==='goal')need=+f.cap>0?Math.min(v,+f.cap):v; else need=v;
    const give=Math.max(0,Math.min(rem,Math.round(need))); rem-=give; rows.push({f,give});
  }
  return rows;
}
const whenTxt=k=>k==null?'когда появятся свободные деньги':k<=1?'в ближайший месяц':monthIn(k);

function wzRow(list,i,r,fields){
  return `<div class="wz-row" data-row="${list}-${i}">${fields.map(([key,ph,type])=>`<input data-wz-list="${list}" data-i="${i}" data-field="${key}" ${type==='num'?'inputmode="decimal"':type==='date'?'type="date"':''} placeholder="${ph}" value="${esc(r[key]||'')}" aria-label="${ph}" class="${type==='num'?'num':type==='date'?'date':''}">`).join('')}<button class="x sm" data-act="wz-del" data-list="${list}" data-i="${i}" aria-label="Удалить строку">×</button><div class="wz-eta note" data-eta="${list}-${i}"></div></div>`;
}
function wzBody(id){
  const z=S.wz;
  if(id==='intro') return z.mode==='new'?`<h2 class="gate-h">Настроим бюджет</h2>
    <p class="muted">Каждый доход здесь раскладывается по фондам. Фонд — это конверт под одну задачу: квартира, еда, долг, подушка, награды.</p>
    <div class="flow">${[['Обязательные платежи','квартира, еда, связь'],['Награды','немного на радости'],['Подушка и долги','закрываются по очереди'],['Накопления','всё, что осталось']].map(([a,b],i)=>`<div class="flow-step"><span class="flow-n">${i+1}</span><div><b>${a}</b><span class="note">${b}</span></div></div>`).join('<div class="flow-arrow" aria-hidden="true">↓</div>')}</div>
    <p class="note">Деньги идут сверху вниз: пока фонд выше не заполнен, ниже ничего не попадает. Настройка займёт 3–5 минут, всё можно поменять потом.</p>`
    :`<h2 class="gate-h">Настройка заново</h2><p class="muted">Проверим доход семьи, посмотрим, как он делится по вашим фондам, и добавим желания. Фонды и записи не изменятся.</p>`;
  if(id==='income') return `<h2 class="gate-h">Доход семьи</h2>
    <div class="hint">Сложите все регулярные доходы за месяц: зарплаты, подработки, пособия. Если доход плавает, берите средний или чуть ниже: план с запасом надёжнее.</div>
    <div class="field"><label for="wzInc">Сколько семья получает в месяц, ₽</label><input class="big" id="wzInc" data-wz="income" inputmode="decimal" placeholder="Например, 300 000" value="${esc(z.income)}"></div>
    ${z.mode==='new'?`<label class="check"><input type="checkbox" id="wzTax" data-wz="tax.on" ${z.tax.on?'checked':''}> С дохода нужно платить налог</label>
    <div class="field" id="wzTaxBox" ${z.tax.on?'':'hidden'}><label for="wzTaxPct">Ставка налога, %</label><input id="wzTaxPct" data-wz="tax.pct" inputmode="decimal" value="${esc(z.tax.pct)}"><span class="note">Налог будет откладываться в отдельный фонд с каждого дохода, где стоит отметка «облагается налогом».</span></div>`:''}`;
  if(id==='monthly') return `<h2 class="gate-h">Обязательные платежи</h2>
    <div class="hint">То, что нужно оплатить каждый месяц при любом раскладе. Эти фонды стоят в очереди первыми: пока они не заполнены, деньги дальше не идут. Обязательный платёж по кредиту тоже сюда.</div>
    <div class="chips">${TPL_MONTHLY.filter(t=>!z.monthly.some(r=>r.name===t)).map(t=>`<button class="chip-btn" data-act="wz-tpl" data-name="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div>
    <div class="wz-list">${z.monthly.map((r,i)=>wzRow('monthly',i,r,[['name','Название'],['amount','₽ в месяц','num']])).join('')}</div>
    <button class="btn ghost sm" data-act="wz-add" data-list="monthly">+ Свой платёж</button>`;
  if(id==='debts') return `<h2 class="gate-h">Долги</h2>
    <div class="hint">Кредитки, займы, долги друзьям, которые хотите закрыть. На них пойдут свободные деньги после обязательных платежей. Первый в списке закрывается первым, поэтому наверх ставьте самый дорогой по процентам. За каждый закрытый долг полагается награда: ${BONUS_PCT}% от его суммы можно потратить на себя.</div>
    <div class="wz-list">${z.debts.length?z.debts.map((r,i)=>wzRow('debts',i,r,[['name','Название'],['amount','Осталось, ₽','num'],['deadline','Срок','date']])).join(''):'<p class="note">Долгов нет? Тогда свободные деньги сразу пойдут в накопления. Шаг можно пропустить.</p>'}</div>
    <button class="btn ghost sm" data-act="wz-add" data-list="debts">+ Добавить долг</button>`;
  if(id==='savings'){const M=wzMetrics();const sug=Math.max(10000,Math.round(M.monthly/2/5000)*5000);
    return `<h2 class="gate-h">Подушка и награды</h2>
    <div class="hint">Подушка — небольшой запас на непредвиденное, чтобы не брать в долг снова. Она стоит в очереди перед долгами. Для начала хватит суммы на 2–3 недели жизни.</div>
    <div class="field"><label for="wzCush">Подушка безопасности, ₽</label><input id="wzCush" data-wz="cushion" inputmode="decimal" placeholder="Например, ${nf.format(sug)}" value="${esc(z.cushion)}">${M.monthly>0?`<button class="link left" data-act="wz-sug" data-v="${sug}">Подставить ${fmt(sug)}</button>`:''}</div>
    <div class="hint">Без радостей сложно долго держать режим экономии. Небольшой процент на себя помогает не сорваться и не покупать импульсивно в кредит.</div>
    <label class="check"><input type="checkbox" data-wz="reward.on" ${z.reward.on?'checked':''}> Откладывать на награды</label>
    <div class="field" id="wzRwBox" ${z.reward.on?'':'hidden'}><label for="wzRw">Процент от денег, оставшихся после обязательных платежей</label><input id="wzRw" data-wz="reward.pct" inputmode="decimal" value="${esc(z.reward.pct)}"></div>
    <div class="field"><label for="wzRest">Куда копить всё, что останется</label><input id="wzRest" data-wz="restName" value="${esc(z.restName)}"></div>`;}
  if(id==='queue') return `<h2 class="gate-h">Как делится доход</h2>
    <div class="hint">Так ваш обычный доход пройдёт по фондам сверху вниз. Фонд забирает сумму, которой ему не хватает, остаток идёт следующему. Порядок и суммы меняются в разделе «Фонды».</div>
    <div id="wzSplit"></div>`;
  if(id==='wishes') return `<h2 class="gate-h">Желания</h2>
    <div class="hint">Что хочется купить для себя или семьи. Сервис посчитает, когда покупка станет возможной без ущерба для плана, и подскажет, когда срок подойдёт.</div>
    <div class="wz-list">${z.wishes.map((r,i)=>wzRow('wishes',i,r,[['name','Что купить'],['price','Цена, ₽','num']])).join('')}</div>
    <button class="btn ghost sm" data-act="wz-add" data-list="wishes">+ Ещё желание</button>`;
  if(id==='finish') return `<h2 class="gate-h">Готово</h2>
    <div class="hint">Так распределится обычный месячный доход. Всё можно поменять в любой момент в разделе «Фонды».</div>
    <div id="wzSplit"></div>`;
  return '';
}
function wzLive(){
  const z=S.wz; const id=wzSteps()[z.step]; const M=wzMetrics(); const box=$('#wzLive');
  const setEta=(key,html)=>{const el=document.querySelector(`[data-eta="${key}"]`);if(el)el.innerHTML=html};
  let h='';
  if(id==='income'&&M.inc>0) h=`<div class="live">После налога остаётся <b>${fmt(M.inc*(1-M.pct/100))}</b> в месяц.</div>`;
  if(id==='monthly'){
    const after=M.inc*(1-M.pct/100);
    h=`<div class="live ${M.base<0?'bad':''}">Обязательные платежи: <b>${fmt(M.monthly)}</b> в месяц.<br>${M.inc?(M.base>=0?`После них и налога остаётся <b>${fmt(M.base)}</b> на подушку, долги, награды и накопления.`:`Платежи больше дохода после налога на ${fmt(-M.base)}. Проверьте суммы или доход.`):'Укажите доход на прошлом шаге, чтобы увидеть остаток.'}</div>`;
    if(after>0) z.monthly.forEach((r,i)=>setEta('monthly-'+i,nA(r.amount)>0?`${Math.round(nA(r.amount)/after*100)}% дохода`:''));
  }
  if(id==='debts'){
    h=`<div class="live">Свободно для долгов: <b>${fmt(M.free)}</b> в месяц${M.rp?` (после ${nf.format(M.rp)}% на награды)`:''}.</div>`;
    z.debts.forEach((r,i)=>{const k=M.eta['d-d'+i];const late=r.deadline&&k!=null&&shiftMonth(curMonth(),k)>r.deadline.slice(0,7);
      setEta('debts-'+i,nA(r.amount)>0?`Закроется ${whenTxt(k)}${late?' · к сроку не успевает':''} · награда ${fmt(nA(r.amount)*BONUS_PCT/100)}`:'')});
  }
  if(id==='savings') h=`<div class="live">${M.rp?`На награды: около <b>${fmt(M.perReward)}</b> в месяц.<br>`:''}${M.eta['d-c']!=null&&nA(z.cushion)>0?`Подушка наберётся ${whenTxt(M.eta['d-c'])}.`:''}</div>`;
  if(id==='wishes'){
    h=M.perReward>0?`<div class="live">В фонд наград пойдёт около <b>${fmt(M.perReward)}</b> в месяц.</div>`:`<div class="live">${S.wz.mode==='new'?'Фонд наград выключен, поэтому сроки по желаниям не посчитать. Его можно включить на шаге «Подушка и награды».':'Сроки по желаниям считаются по фонду наград. Включите его из карточки любого желания на главной.'}</div>`;
    let acc=0; z.wishes.forEach((r,i)=>{const p=nA(r.price);if(!(p>0)||!M.perReward){setEta('wishes-'+i,'');return}acc+=p;const k=Math.ceil(acc/M.perReward);setEta('wishes-'+i,`Можно купить ${whenTxt(k)} из фонда наград`)});
  }
  if(id==='queue'||id==='finish'){
    const el=$('#wzSplit'); if(el){
      if(!M.inc){el.innerHTML='<p class="note">Укажите доход семьи, чтобы увидеть разбивку.</p>'}
      else{const rows=simSplit(M.funds,M.inc);
        el.innerHTML=`<div class="list">${rows.map(({f,give})=>`<div class="row"><div class="row-main"><span class="name">${esc(f.name)}</span><span class="amt ${give?'':'muted'}">${fmt(give)}</span></div><div class="note"><span class="chip ${f.kind}">${KIND_SHORT[f.kind]||f.kind}</span>${f.kind==='debt'||(f.kind==='goal'&&!f.wishId)?`${M.eta[f.id]!=null?'закроется '+whenTxt(M.eta[f.id]):''}`:''}</div></div>`).join('')}</div>
        <p class="note">Доход в месяц: ${fmt(M.inc)}.${M.base<0?' Обязательные платежи больше дохода: проверьте суммы.':''}</p>`;}
    }
    if(id==='finish'){const n=S.wz.wishes.filter(r=>r.name.trim()&&nA(r.price)>0).length;h=n?`<div class="live">Желаний в списке: ${n}. Сроки по ним появятся на главной.</div>`:''}
  }
  if(box) box.innerHTML=h;
}
function drawWizard(){
  const z=S.wz; const steps=wzSteps(); const id=steps[z.step]; const main=$('#main');
  const last=z.step===steps.length-1;
  main.dataset.view='setup';
  main.innerHTML=`<section class="wz">
    <div class="wz-top"><span class="eyebrow">Шаг ${z.step+1} из ${steps.length}</span><div class="wz-prog"><i style="width:${((z.step+1)/steps.length*100).toFixed(1)}%"></i></div></div>
    <div class="wz-body">${wzBody(id)}</div>
    <div id="wzLive"></div>
    <div class="err" id="wzErr"></div>
    <div class="wz-foot">${z.step>0?'<button class="btn ghost" data-act="wz-back">Назад</button>':'<span></span>'}<button class="btn primary" data-act="wz-next" ${z.busy?'disabled':''}>${z.step===0?'Начать':last?'Начать пользоваться':id==='debts'&&!z.debts.length?'Долгов нет, дальше':'Дальше'}</button></div>
    ${z.step===0?`<div class="gate-links"><button class="link" data-act="wz-skip">${z.mode==='new'?'Пропустить, настрою сам':'Закрыть'}</button></div>`:''}
  </section>`;
  main.classList.remove('enter');void main.offsetWidth;main.classList.add('enter');
  wzLive();
}
function wzSet(path,val){const z=S.wz;const p=path.split('.');if(p.length===2)z[p[0]][p[1]]=val;else z[p[0]]=val}
document.addEventListener('input',e=>{
  if(S.status!=='setup'||!S.wz)return; const t=e.target;
  if(t.dataset.wz){wzSet(t.dataset.wz,t.type==='checkbox'?t.checked:t.value);
    if(t.dataset.wz==='tax.on'){const b=$('#wzTaxBox');if(b)b.hidden=!t.checked}
    if(t.dataset.wz==='reward.on'){const b=$('#wzRwBox');if(b)b.hidden=!t.checked}
    wzLive();return}
  if(t.dataset.wzList){S.wz[t.dataset.wzList][+t.dataset.i][t.dataset.field]=t.value;wzLive()}
});
async function wzAction(act,a){
  const z=S.wz; if(!z) return false; const steps=wzSteps(); const id=steps[z.step];
  if(act==='wz-add'){const L=a.dataset.list;z[L].push(L==='debts'?{name:'',amount:'',deadline:''}:L==='wishes'?{name:'',price:''}:{name:'',amount:''});drawWizard();
    const rows=document.querySelectorAll(`[data-wz-list="${L}"][data-field="name"]`);rows[rows.length-1]?.focus();return true}
  if(act==='wz-del'){z[a.dataset.list].splice(+a.dataset.i,1);drawWizard();return true}
  if(act==='wz-tpl'){z.monthly.push({name:a.dataset.name,amount:''});drawWizard();const r=document.querySelectorAll('[data-wz-list="monthly"][data-field="amount"]');r[r.length-1]?.focus();return true}
  if(act==='wz-sug'){z.cushion=a.dataset.v;drawWizard();return true}
  if(act==='wz-back'){z.step=Math.max(0,z.step-1);drawWizard();window.scrollTo(0,0);return true}
  if(act==='wz-skip'){
    if(z.mode==='new') DB.setHousehold({setupDone:true});
    S.wz=null;S.status='ready';S.enterNext=true;render();return true}
  if(act==='wz-next'){
    if(id==='income'&&!(nA(z.income)>0)){$('#wzErr').textContent='Укажите доход семьи в месяц, по нему строится весь план.';return true}
    if(id==='monthly'&&z.monthly.some(r=>r.name.trim()&&!(nA(r.amount)>0))){$('#wzErr').textContent='У некоторых платежей нет суммы. Укажите её или удалите строку.';return true}
    if(id==='debts'&&z.debts.some(r=>r.name.trim()&&!(nA(r.amount)>0))){$('#wzErr').textContent='Укажите, сколько осталось погасить по каждому долгу.';return true}
    if(z.step<steps.length-1){z.step++;drawWizard();window.scrollTo(0,0);return true}
    z.busy=true;drawWizard();
    try{
      const at=Date.now();
      await DB.setHousehold({expectedIncome:nA(z.income),setupDone:true});
      if(S.household){S.household.expectedIncome=nA(z.income);S.household.setupDone=true}
      if(z.mode==='new'){
        wzFunds().forEach((f,i)=>{const {id,...d}=f;DB.add('funds',{...d,start:0,taxOnly:!!d.taxOnly,deadline:d.deadline||'',cap:0,order:i+1,createdAt:at+i})});
      }
      z.wishes.filter(r=>r.name.trim()&&nA(r.price)>0).forEach((r,i)=>DB.add('wishes',{name:r.name.trim(),price:nA(r.price),fundId:'',by:S.uid||null,createdAt:at+100+i}));
      S.wz=null;S.status='ready';S.tab='now';S.enterNext=true;render();window.scrollTo(0,0);toast('Бюджет настроен');
    }catch(err){z.busy=false;drawWizard();$('#wzErr').textContent='Не получилось сохранить. Проверьте интернет и попробуйте ещё раз.'}
    return true;
  }
  return false;
}

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
  <div class="field"><label for="sInc">Обычный доход семьи в месяц, ₽</label><input id="sInc" inputmode="decimal" value="${S.household&&+S.household.expectedIncome?nf.format(S.household.expectedIncome):''}"><span class="note">По нему считается, на сколько покупки сдвигают закрытие долгов и когда накопится цель.</span></div>
  <button class="btn ghost" id="sSaveInc">Сохранить доход</button>
  <button class="btn ghost" data-act="wz-restart">Пройти настройку заново</button>
  <div class="err" id="sErr"></div>
  <button class="btn danger" data-act="logout">Выйти из аккаунта</button>`,()=>{
    $('#sCopy').addEventListener('click',async()=>{const c=$('#sCode').textContent;try{await navigator.clipboard.writeText(c);toast('Код скопирован')}catch(e){const r=document.createRange();r.selectNodeContents($('#sCode'));const s=getSelection();s.removeAllRanges();s.addRange(r)}});
    const nb=$('#sNew');let armed=false;nb.addEventListener('click',async()=>{
      if(!armed){armed=true;nb.textContent='Старый код перестанет работать. Нажмите ещё раз';setTimeout(()=>{armed=false;if(nb.isConnected)nb.textContent='Новый код'},4000);return}
      nb.disabled=true;try{const c=await DB.newInvite(code);$('#sCode').textContent=c;toast('Новый код создан')}catch(e){$('#sErr').textContent=errText(e)}finally{nb.disabled=false;nb.textContent='Новый код';armed=false}
    });
    $('#sSaveInc').addEventListener('click',async()=>{const n=Math.round(parseAmt($('#sInc').value));if(n<0){$('#sErr').textContent='Введите сумму.';return}await DB.setHousehold({expectedIncome:n});if(S.household)S.household.expectedIncome=n;toast('Доход сохранён')});
    $('#sSaveName').addEventListener('click',async()=>{const n=$('#sName').value.trim();if(!n){$('#sErr').textContent='Имя не может быть пустым.';return}await DB.setName(S.uid,n);S.myName=n;toast('Имя сохранено')});
  });
}

/* ---------- запуск ---------- */
let unsubs=[];
function stopWatching(){unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[]}
function startHousehold(hid){
  stopWatching(); S.hid=hid; DB.useHousehold(hid); S.status='loading'; render();
  let gotF=false,gotT=false,gotH=false;
  const done=()=>{
    if(gotF&&gotT&&gotH&&S.status==='loading'){
      if(!(S.household&&S.household.setupDone)&&!S.funds.length){S.wz=newWizard('new');S.status='setup'}else S.status='ready';
      S.enterNext=true; render(); return;
    }
    if(S.status==='ready'||S.status==='setup')renderSoon();
  };
  const onErr=e=>{if(e&&e.code==='permission-denied'){stopWatching();S.status='onboard';render();toast('Нет доступа к этому бюджету. Присоединитесь заново по коду.')}};
  unsubs.push(DB.watchCol('funds',list=>{S.funds=list.sort((a,b)=>(+a.order||0)-(+b.order||0)||(a.createdAt||0)-(b.createdAt||0));gotF=true;done()},onErr));
  unsubs.push(DB.watchCol('tx',list=>{S.tx=list.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||0)-(a.createdAt||0));gotT=true;done()},onErr));
  unsubs.push(DB.watchCol('wishes',list=>{S.wishes=list.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));done()},()=>{}));
  unsubs.push(DB.watchCol('members',list=>{S.members={};for(const m of list)S.members[m.id]=m.name||'';S.names={...S.members,[S.uid]:'вы'};done()},()=>{}));
  unsubs.push(DB.watchHousehold(h=>{S.household=h;gotH=true;done()},()=>{gotH=true;done()}));
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
