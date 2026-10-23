import * as DB from './fb.js';
import { seed as SEED } from './seed.js';
import { ic } from './icons.js';

const KINDS = {
  percent:{label:'Процент с дохода', short:'%'},
  monthly:{label:'Платёж каждый месяц', short:'в месяц'},
  goal:{label:'Накопить сумму', short:'цель'},
  debt:{label:'Погасить долг', short:'долг'},
  reward:{label:'Награды: % от денег сверх плана', short:'награды'},
  rest:{label:'Всё, что осталось', short:'остаток'}
};
const KIND_UI = {monthly:'Платёж в месяц',percent:'% с дохода',rest:'Весь остаток',goal:'🎯 Накопить сумму',debt:'💳 Погасить долг'};
const KIND_HINT = {
  monthly:'Каждый месяц фонд забирает из доходов фиксированную сумму и останавливается, когда набрал её. Для квартиры, еды, связи, кружков.',
  percent:'С каждого поступления фонд сразу берёт свой процент, сколько бы ни пришло. Для налога и подушки безопасности.',
  rest:'Забирает всё, что осталось после остальных фондов. Ставьте его последним в очереди.',
  goal:'Фонд копит до нужной суммы. Когда цель набрана, он перестаёт забирать деньги и они идут дальше по очереди.',
  debt:'Фонд получает деньги и гасит ими долг. Когда долг закрыт, фонд больше ничего не забирает, а вам положен бонус на награду.'
};
const PREP = ['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
const NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

const WEEK = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];

const S = { uid:null, hid:null, myName:'', pendingName:'', members:{}, household:null, authMode:'login', gateErr:'', canWrite:true, status:'loading', funds:[], tx:[], wishes:[], confirmFund:null, tab:'now', histMonth:curMonth(), names:{}, debtEdit:false };

/* ---------- иконки фондов ---------- */
const EMOJI = ['🏠','💡','🛒','🍎','🚗','⛽','📱','🌐','🏊','👶','🎓','💊','🧾','💳','🤝','🏦','🛟','🎁','🎯','✈️','🎉','🐾','👕','📺','🔧','💰','📚','🌿','🏡','☕','🎮','❤️'];
const GUESS = [[/налог/i,'🧾'],[/квартир|аренд|ипотек|жиль/i,'🏠'],[/коммун|свет|газ|вод[аы]/i,'💡'],[/ед[аы]\b|продукт|еда/i,'🛒'],[/машин|авто|бензин|транспорт/i,'🚗'],
  [/связь|интернет|телефон/i,'📱'],[/бассейн|спорт/i,'🏊'],[/сад|кружк|дет|школ/i,'👶'],[/учёб|учеб|курс|образов/i,'🎓'],[/лекарств|здоров|врач|аптек/i,'💊'],
  [/кредитк|кредит|займ|рассроч/i,'💳'],[/друг|долг/i,'🤝'],[/подушк|резерв/i,'🛟'],[/наград|радост/i,'🎁'],[/накоплен|сбереж/i,'🏦'],[/отпуск|путешеств|переезд|зеланд/i,'✈️'],
  [/подписк/i,'📺'],[/инвест|акци|бирж/i,'📈'],[/земл|участ/i,'🌿'],[/покупка:/i,'🎯'],[/одежд/i,'👕'],[/живот|кот|собак/i,'🐾']];
const KIND_EMOJI = {percent:'🧾',monthly:'💰',goal:'🎯',debt:'💳',reward:'🎁',rest:'🏦'};
function fundEmoji(f){if(!f)return '•';if(f.icon)return f.icon;const g=GUESS.find(([re])=>re.test(f.name||''));return g?g[1]:(KIND_EMOJI[f.kind]||'💰')}
function fundIcon(f,cls=''){if(!f||f==='_free')return `<span class="fi k-free ${cls}" aria-hidden="true">🪙</span>`;return `<span class="fi k-${f.kind} ${cls}" aria-hidden="true">${fundEmoji(f)}</span>`}
function fundById(id){return S.funds.find(x=>x.id===id)}

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
function stats(skip){
  const m=curMonth(), st={}; let incomeM=0, spentM=0;
  const get=id=>st[id]||(st[id]={alloc:0,allocM:0,spent:0,spentM:0});
  for(const t of S.tx){
    if(skip&&t.id===skip) continue;
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
function plan(amount,taxable,skip){
  const {get}=stats(skip); let rem=amount; const rows=[];
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
  const planned=totalMonthly+sum(dl.map(d=>Math.max(0,d.perMonth)));
  const progress=planned>0?Math.max(0,Math.min(1,(planned-stillNet)/planned)):null;
  return {get,funds,mi,incomeM,spentM,needMonthly,totalMonthly,pct,dl,stillNet,stillGross,free,planned,progress};
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
  const monthlyNoDay=funds.filter(f=>f.kind==='monthly'&&!(+f.payDay));
  if(monthlyNoDay.length&&monthlyNoDay.length===funds.filter(f=>f.kind==='monthly').length) out.push({tone:'info',title:'Укажите дни платежей',text:'Откройте ежемесячный фонд и впишите день оплаты. На главной появятся ближайшие платежи, а напоминания можно добавить в календарь телефона.',act:{label:'Открыть фонды',act:'go-funds'}});
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
  if(openDebt&&!F.known) lines.push('Укажите обычный доход семьи в меню → Семья, и я посчитаю, на сколько покупка сдвигает долги.');
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
  if(S.status!=='loading') document.body.dataset.ready='1';
  document.querySelector('nav.tabs').hidden=S.status!=='ready';
  $('#setBtn').hidden=S.status!=='ready';
  if(S.status==='setup'){if(main.dataset.view!=='setup'||S.enterNext){S.enterNext=false;drawWizard()}return}
  if(S.status!=='ready'){main.dataset.view='gate';renderGate(main);return}
  let html='';
  if(!S.canWrite) html+=`<div class="ro">У вас доступ только для просмотра. Чтобы вносить записи, владелец должен выдать права на изменение.</div>`;
  if(S.tab==='now') html+=renderNow();
  else if(S.tab==='funds') html+=renderFunds();
  else if(S.tab==='debts') html+=renderDebts();
  else html+=renderHist();
  main.innerHTML=html; main.dataset.view=S.tab;
  main.classList.remove('enter');
  if(S.enterNext){S.enterNext=false;void main.offsetWidth;main.classList.add('enter');countUp(main)}
  moveTabInd();
  resolveNames();
  if(S.sheetRefresh&&!$('#sheet').hidden)S.sheetRefresh();
  checkCelebrations();
  maybeTour();
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
  root.querySelectorAll('.ring .val').forEach(c=>{const full=c.getAttribute('stroke-dasharray');c.style.strokeDashoffset=full;void c.getBoundingClientRect();requestAnimationFrame(()=>{c.style.strokeDashoffset=c.dataset.off})});
}
let rT; function renderSoon(){clearTimeout(rT);rT=setTimeout(render,30)}
function emptyFunds(){
  return `<div class="empty"><h2>Фондов пока нет</h2><p class="muted small">Фонд — это конверт для денег: налоги, квартира, кредитка, подушка. Добавьте первый, и каждый доход будет раскладываться по ним автоматически.</p>${S.canWrite?`<button class="btn primary" data-act="new-fund">${ic('plus')}Добавить фонд</button>`:''}</div>`;
}
function ringSvg(p,done){
  const r=36,c=2*Math.PI*r,off=c*(1-p);
  return `<div class="ring" role="img" aria-label="План месяца выполнен на ${Math.round(p*100)}%"><svg viewBox="0 0 84 84" aria-hidden="true"><circle class="track" cx="42" cy="42" r="${r}" fill="none" stroke-width="8"/><circle class="val" cx="42" cy="42" r="${r}" fill="none" stroke-width="8" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" data-off="${off.toFixed(2)}"/></svg><b>${done?ic('check'):Math.round(p*100)+'%'}</b></div>`;
}
function renderNow(){
  if(!activeFunds().length) return emptyFunds();
  const P=monthPicture(); const mi=P.mi; const done=P.stillNet<=0.5;
  let h=`<section class="hero"><div class="hero-main">${P.progress!==null?ringSvg(done?1:P.progress,done):''}<div>`;
  if(!done){
    h+=`<div class="eyebrow">Ещё нужно заработать в ${PREP[mi]}</div><div class="fig" data-count="${Math.round(P.stillGross)}">${fmt(P.stillGross)}</div>
    <div class="note">${P.progress!==null?`План ${GEN[mi]} закрыт на ${Math.round(P.progress*100)}%. `:''}Эта сумма закроет платежи${P.dl.length?' и план по срокам':''}${P.pct?`, с учётом ${nf.format(P.pct)}% в процентные фонды`:''}.</div>`;
  } else {
    h+=`<div class="eyebrow">${NOM[mi]}</div><div class="fig ok">План месяца выполнен</div><div class="note">Дальше доход пойдёт в накопления по очереди фондов.</div>`;
  }
  h+=`</div></div><div class="hero-split"><div class="kv"><div class="k">Доход в ${PREP[mi]}</div><div class="v">${fmt(P.incomeM)}</div></div><div class="kv"><div class="k">Траты в ${PREP[mi]}</div><div class="v">${fmt(P.spentM)}</div></div></div></section>`;
  const dsum=debtSummary();
  if(dsum) h+=`<button class="goal-chip" data-tab-go="debts"><span class="gi">${ic('trending-down')}</span><span><b>${esc(dsum.title)}</b><span class="note">${esc(dsum.sub)}</span></span>${ic('chevron-right','chev')}</button>`;
  if(S.canWrite) h+=`<div class="btn-row"><button class="btn primary" data-act="open-income">Пришли деньги</button><button class="btn ghost" data-act="open-expense">Потратили</button><button class="btn ghost wide" data-act="new-wish">Хочу купить…</button></div>`;
  h+=paymentsBlock();
  const T=tips(P); T.splice(Math.min(1,T.length),0,...wishTips());
  if(T.length) h+=`<section class="block"><h2>Что делать сейчас</h2><div class="tips">${T.map(t=>`<div class="tip ${t.tone}"><span class="dot"></span><div><b>${esc(t.title)}</b><span class="muted small">${esc(t.text)}</span>${t.act&&(S.canWrite||t.act.act==='go-funds')?`<div class="opt-act"><button class="btn sm ghost" data-act="${t.act.act}" ${t.act.id?`data-id="${esc(t.act.id)}"`:''}>${esc(t.act.label)}</button></div>`:''}</div></div>`).join('')}</div></section>`;
  if(S.wishes.length) h+=`<section class="block"><h2>Хочу купить</h2><div class="list">${S.wishes.map(w=>{const fc=wishForecast(w);return `<button class="row wish" data-act="edit-wish" data-id="${esc(w.id)}" ${S.canWrite?'':'disabled'}><span class="row-main"><span class="name">${esc(w.name||'Без названия')}</span><span class="amt">${fmt(w.price)}</span></span>${wishWho(w)}<span>${fc?`<span class="chip v-${fc.tone}">${esc(fc.text)}</span>${fc.how&&!fc.now?`<span class="note"> ${esc(fc.how)}</span>`:''}`:''}</span></button>`}).join('')}</div></section>`;
  h+=`<section class="block"><div class="sec-head"><h2>Фонды</h2><button class="btn sm ghost" data-tab-go="funds">Настроить</button></div><div class="list river">${activeFunds().map(f=>fundRowNow(f,P.get,mi)).join('')}</div></section>`;
  return h;
}
function fundRowNow(f,get,mi){
  const s=fstate(f,get), v=+f.value||0; let right='',sub='',pc=null;
  if(f.kind==='monthly'){const cov=Math.max(0,v-s.need);pc=v?cov/v:1;right=`${fmt(cov)} из ${fmt(v)}`;sub=`в фонде <span class="${s.balance<0?'neg':''}">${fmt(s.balance)}</span> · потрачено в ${PREP[mi]} ${fmt(s.spentM)}`+(+f.payDay?` · платёж ${Math.round(+f.payDay)}‑го`:'')}
  else if(f.kind==='goal'){pc=v?s.balance/v:0;right=`${fmt(s.balance)} из ${fmt(v)}`;sub=s.balance<v-0.5?`осталось ${fmt(v-s.balance)}`+(+f.cap?` · по ${fmt(f.cap)} в месяц`:'')+(f.deadline?` · до ${dateLabel(f.deadline)}`:''):'цель достигнута'}
  else if(f.kind==='reward'){right=`<span class="${s.balance<0?'neg':''}">${fmt(s.balance)}</span>`;sub=`${nf.format(v)}% от денег сверх обязательных платежей · на покупки для себя`}
  else if(f.kind==='debt'){pc=v?s.paid/v:1;right=s.remaining>0?`осталось ${fmt(s.remaining)}`:'закрыт';sub=`погашено ${fmt(s.paid)} из ${fmt(v)}`+(+f.rate?` · ${nf2.format(+f.rate)}% годовых`:'')+(f.deadline?` · до ${dateLabel(f.deadline)}`:'')}
  else if(f.kind==='percent'){right=`<span class="${s.balance<0?'neg':''}">${fmt(s.balance)}</span>`;sub=`${nf.format(v)}% ${f.taxOnly?'с облагаемых доходов':'с каждого дохода'}`}
  else {right=`<span class="${s.balance<0?'neg':''}">${fmt(s.balance)}</span>`;sub='получает всё, что осталось'}
  return `<button class="frow k-${f.kind}" data-act="edit-fund" data-id="${esc(f.id)}" ${S.canWrite?'':'disabled'}>${fundIcon(f)}<span class="fb"><span class="row-main"><span class="name">${esc(f.name)}</span><span class="amt">${right}</span></span>${pc!==null?`<span class="bar"><i style="width:${Math.max(0,Math.min(100,pc*100)).toFixed(1)}%"></i></span>`:''}<span class="note">${sub}</span></span></button>`;
}

/* ближайшие платежи */
function paymentsBlock(){
  const L=upcoming(7); if(!L.length) return '';
  return `<section class="block"><div class="sec-head"><h2>Ближайшие платежи</h2><button class="btn sm ghost" data-act="ics">${ic('calendar-plus')}В календарь</button></div><div class="list">${L.map(p=>{
    const st=p.paidNow?'<span class="chip v-good">оплачено</span>':p.enough===null?'':p.enough?'<span class="chip v-good">в фонде хватает</span>':`<span class="chip v-warn">в фонде не хватает ${fmt(p.short)}</span>`;
    return `<div class="pay ${p.overdue?'overdue':''}">${fundIcon(p.f,'sm')}<div class="pb"><div class="pn">${esc(p.f.name)}</div><div class="note"><span class="when">${esc(p.when)}</span></div><div>${st}</div></div><div class="pr"><span class="pa">${p.amount>0?fmt(p.amount):''}</span>${S.canWrite&&!p.paidNow?`<button class="btn sm ghost" data-act="pay" data-id="${esc(p.f.id)}" data-amt="${Math.round(p.amount||0)}">Оплатил</button>`:''}</div></div>`}).join('')}</div></section>`;
}

/* ---------- вкладка «Фонды» ---------- */
function renderFunds(){
  const funds=activeFunds();
  let h=`<section class="block"><h2>Очередь фондов</h2><p class="note">Каждый доход стекает по фондам сверху вниз. Фонд забирает сумму, которой ему не хватает, остаток уходит следующему. Порядок меняется перетаскиванием за ручку справа.</p></section>`;
  if(!funds.length) return h+emptyFunds();
  const {get}=stats();
  h+=`<div class="list river" id="fundList">${funds.map((f,i)=>{
    const s=fstate(f,get), v=+f.value||0;
    const val=f.kind==='percent'||f.kind==='reward'?`${nf.format(v)}%`:f.kind==='rest'?'':fmt(v)+(f.kind==='monthly'?' в месяц':'')+(+f.cap?` · по ${fmt(f.cap)} в месяц`:'');
    const st=[f.kind==='debt'?`осталось ${fmt(s.remaining)}`:`в фонде ${fmt(s.balance)}`];
    if(f.deadline) st.push(`до ${dateLabel(f.deadline)}`);
    if(+f.payDay) st.push(`платёж ${Math.round(+f.payDay)}‑го`);
    if(f.kind==='debt'&&+f.rate) st.push(`${nf2.format(+f.rate)}%`);
    return `<div class="fund k-${f.kind}" data-id="${esc(f.id)}">${fundIcon(f)}
      <button class="body" data-act="edit-fund" data-id="${esc(f.id)}" ${S.canWrite?'':'disabled'}><span class="name">${esc(f.name)}</span><span class="note"><span class="chip kind">${KINDS[f.kind]?.label||f.kind}</span>${val}</span><span class="note">${st.join(' · ')}</span></button>
      ${S.canWrite?`<button class="grip" data-id="${esc(f.id)}" aria-label="Перетащить «${esc(f.name)}». Стрелки вверх и вниз меняют позицию, сейчас ${i+1} из ${funds.length}">${ic('grip-vertical')}</button><button class="del" data-act="ask-del-fund" data-id="${esc(f.id)}" aria-label="Удалить фонд «${esc(f.name)}»">${ic('trash')}</button>`:'<span></span><span></span>'}
      ${S.confirmFund===f.id?`<div class="confirm"><span>Удалить «${esc(f.name)}»?${f.kind!=='debt'&&s.balance>0.5?` В нём лежит ${fmt(s.balance)}, эти деньги перейдут в «Без фонда».`:''} Записи в истории останутся.</span><span class="confirm-btns"><button class="btn sm danger" data-act="del-fund" data-id="${esc(f.id)}">Удалить</button><button class="btn sm ghost" data-act="cancel-del">Отмена</button></span></div>`:''}
    </div>`}).join('')}</div>`;
  if(S.canWrite) h+=`<button class="btn primary" data-act="new-fund">${ic('plus')}Добавить фонд</button>`;
  return h;
}

/* ---------- вкладка «Долги» ---------- */
function renderDebts(){
  const all=debtList(); const open=all.filter(d=>d.bal>0.5);
  if(!all.length) return `<section class="block"><h2>План погашения</h2></section><div class="empty"><h2>Долгов в фондах нет</h2><p class="muted small">Добавьте фонд «Погасить долг»: кредитку, займ, долг другу. Здесь появится план погашения и дата, когда семья будет свободна от долгов.</p>${S.canWrite?`<button class="btn primary" data-act="new-debt">${ic('plus')}Добавить долг</button>`:''}</div>`;
  if(!open.length) return `<section class="hero"><div class="eyebrow">Долги</div><div class="fig ok">Все долги закрыты</div><div class="note">Свободные деньги идут в цели и накопления.</div></section><div class="list river">${all.map((d,i)=>debtRow(d,i,null)).join('')}</div>`;
  const strat=stratOf(); const B=debtBudget(); const res={}; for(const k of Object.keys(STRATS)) res[k]=simulate(k,B.v);
  const r=res[strat]; const total=sum(open.map(d=>d.bal));
  let h=`<section class="hero"><div class="eyebrow">Жизнь без долгов</div>`;
  if(r.noBudget) h+=`<div class="fig ok">Нужен бюджет на долги</div><div class="note">${B.known===false?'Укажите обычный доход семьи в меню, или задайте сумму на долги вручную ниже.':'После обязательных платежей денег на долги не остаётся. Задайте сумму вручную ниже.'}</div>`;
  else if(r.stuck) h+=`<div class="fig ok">Не гасится</div><div class="note">При ${fmt(B.v)} в месяц проценты больше платежей. Увеличьте сумму на долги.</div>`;
  else h+=`<div class="fig">через ${esc(durationWord(r.months))}</div><div class="note">${esc(cap(monthIn(r.months)))}${r.interest>=1?` · переплата по процентам ≈ ${fmt(r.interest)}`:''}</div>`;
  h+=`<div class="hero-split"><div class="kv"><div class="k">Осталось погасить</div><div class="v">${fmt(total)}</div></div><div class="kv"><div class="k">На долги в месяц</div><div class="v">${fmt(B.v)}</div></div></div></section>`;
  if(r.short) h+=`<div class="tip bad"><span class="dot"></span><div><b>Не хватает на минимальные платежи</b><span class="muted small">Минимальные платежи по долгам ${fmt(r.mins)} в месяц, а на долги остаётся ${fmt(B.v)}.</span></div></div>`;
  // бюджет
  h+=`<section class="card"><div class="sec-head"><h3>Сколько в месяц идёт на долги</h3>${S.canWrite&&!S.debtEdit?'<button class="btn sm ghost" data-act="debt-budget-edit">Изменить</button>':''}</div>`;
  if(S.debtEdit) h+=`<div class="inline-edit"><input id="dbIn" inputmode="decimal" value="${B.v?nf.format(B.v):''}" aria-label="Сумма на долги в месяц, ₽"><button class="btn sm primary" data-act="debt-budget-save">Сохранить</button></div>${B.auto?'':'<button class="link left" data-act="debt-budget-auto">Считать автоматически</button>'}`;
  else h+=`<p class="note">${B.auto?(B.known?'Считается сам: обычный доход минус налоги, обязательные платежи и награды. Цели выше долгов в очереди могут забирать часть этой суммы.':'Укажите обычный доход семьи в меню, и сумма посчитается сама.'):'Задано вручную.'}</p>`;
  h+=`</section>`;
  // стратегии
  const ok=k=>!res[k].noBudget&&!res[k].stuck;
  const valid=Object.keys(STRATS).filter(ok);
  let best=null; if(valid.length>1){const mi=Math.min(...valid.map(k=>res[k].interest));const mx=Math.max(...valid.map(k=>res[k].interest));if(mx-mi>=100)best=valid.find(k=>res[k].interest===mi)}
  h+=`<section class="block"><h2>Стратегия</h2><div class="list strat">${Object.keys(STRATS).map(k=>`<button class="strat-row" data-act="strat" data-k="${k}" aria-pressed="${k===strat}" ${S.canWrite?'':'disabled'}><span class="sn">${STRATS[k].name}${best===k?' <span class="chip v-good">выгоднее всего</span>':''}</span><span class="sv">${ok(k)?esc(cap(monthIn(res[k].months))):'—'}</span><span class="sd">${STRATS[k].desc}${ok(k)&&res[k].interest>=1?` Переплата ≈ ${fmt(res[k].interest)}.`:''}</span></button>`).join('')}</div>`;
  const queueOrder=open.map(d=>d.f.id); const want=orderDebts(open,strat).map(d=>d.f.id);
  if(strat!=='custom'&&S.canWrite&&queueOrder.join()!==want.join()) h+=`<div class="tip info"><span class="dot"></span><div><b>Очередь фондов стоит по-другому</b><span class="muted small">Свободные деньги идут в долги в порядке фондов. Выставить долги в очереди по стратегии «${STRATS[strat].name}»?</span><div class="opt-act"><button class="btn sm primary" data-act="apply-strat">Выставить порядок</button></div></div></div>`;
  const noRate=open.filter(d=>!(d.rate>0)&&!d.f.rateSet).length;
  if(noRate) h+=`<p class="note">У ${noRate} ${plural(noRate,'долга','долгов','долгов')} не указана ставка, в расчёте они беспроцентные. Нажмите на долг, чтобы вписать ставку и минимальный платёж.</p>`;
  h+=`</section>`;
  // список в порядке погашения
  const ord=(r.order||want).map(id=>open.find(d=>d.f.id===id)).filter(Boolean);
  const closed=all.filter(d=>d.bal<=0.5);
  h+=`<section class="block"><h2>Порядок погашения</h2><div class="list river">${ord.map((d,i)=>debtRow(d,i,r)).join('')}${closed.map(d=>debtRow(d,-1,null)).join('')}</div></section>`;
  return h;
}
function debtRow(d,i,r){
  const s=fstate(d.f,stats().get), v=+d.f.value||0, pc=v?s.paid/v:1;
  const parts=[];
  if(d.bal<=0.5) parts.push('закрыт');
  else{
    parts.push(d.rate>0?`${nf2.format(d.rate)}% годовых`:d.f.rateSet?'без процентов':'<span class="chip v-warn">укажите ставку</span>');
    if(d.min>0) parts.push(`мин. ${fmt(d.min)}`);
    if(+d.f.payDay) parts.push(`платёж ${Math.round(+d.f.payDay)}‑го`);
    if(r&&r.at&&r.at[d.f.id]&&!r.stuck) parts.push(`закроется ${monthIn(r.at[d.f.id])}`);
  }
  return `<button class="frow k-debt" data-act="edit-fund" data-id="${esc(d.f.id)}" ${S.canWrite?'':'disabled'}>${fundIcon(d.f)}<span class="fb"><span class="row-main"><span class="name">${i>=0?`${i+1}. `:''}${esc(d.f.name)}</span><span class="amt">${d.bal>0.5?fmt(d.bal):'0 ₽'}</span></span><span class="bar"><i style="width:${Math.max(0,Math.min(100,pc*100)).toFixed(1)}%"></i></span><span class="note">${parts.join(' · ')}</span></span></button>`;
}

/* ---------- вкладка «История» ---------- */
function avatar(uid){
  if(!uid) return ''; const ids=Object.keys(S.members).sort(); const i=Math.max(0,ids.indexOf(uid))%3; const n=(S.members[uid]||'').trim();
  return n?`<span class="av a${i}" aria-hidden="true">${esc(n[0].toUpperCase())}</span>`:'';
}
function wishWho(w){const n=(S.members[w.by]||'').trim();return n?`<span class="who">${avatar(w.by)}Добавил: ${esc(n)}</span>`:''}
function dayHead(s){
  const [y,m,d]=s.split('-').map(Number); const dt=new Date(y,m-1,d); const t=today(); const yd=isoD(new Date(Date.now()-864e5));
  return s===t?'Сегодня':s===yd?'Вчера':`${d} ${GEN[m-1]}, ${WEEK[dt.getDay()]}`;
}
function renderHist(){
  const m=S.histMonth; const list=S.tx.filter(t=>t.month===m);
  const inc=sum(list.filter(t=>t.type==='income').map(t=>+t.amount||0));
  const exp=sum(list.filter(t=>t.type==='expense').map(t=>+t.amount||0));
  let h=`<div class="month-sw"><button data-act="hm" data-d="-1" aria-label="Предыдущий месяц">${ic('chevron-left')}</button><span class="lbl">${monthLabel(m)}</span><button data-act="hm" data-d="1" aria-label="Следующий месяц" ${m>=curMonth()?'disabled':''}>${ic('chevron-right')}</button></div>
  <section class="hero"><div class="hero-split" style="margin:0;padding:0;border:0"><div class="kv"><div class="k">Доходы</div><div class="v">${fmt(inc)}</div></div><div class="kv"><div class="k">Траты</div><div class="v">${fmt(exp)}</div></div></div></section>`;
  if(!list.length) return h+`<div class="empty"><h2>В этом месяце записей нет</h2><p class="muted small">Доходы и траты, которые вы внесёте, появятся здесь с разбивкой по фондам.</p></div>`;
  let lastDay=''; let rows='';
  for(const t of list){
    if(t.date!==lastDay){lastDay=t.date;rows+=`<div class="day-h">${esc(dayHead(t.date||today()))}</div>`}
    rows+=txRow(t);
  }
  return h+`<div class="list">${rows}</div>`;
}
function txRow(t){
  const isIn=t.type==='income', isTr=t.type==='transfer';
  const title=t.note||(isIn?'Доход':isTr?'Перевод между фондами':fundName(t.fundId));
  const who=t.by?`${avatar(t.by)}<span data-who="${esc(t.by)}">${esc(S.names[t.by]||'')}</span>`:'';
  const sub=[isTr?`из «${fundName(t.from)}»`:isIn?'':(t.note?fundName(t.fundId):''), (!isIn&&!isTr&&t.from&&t.from!==t.fundId)?`из «${fundName(t.from)}»`:''].filter(Boolean).map(esc).join(' · ');
  const icon=isIn?`<span class="fi sm k-monthly" aria-hidden="true">💵</span>`:isTr?`<span class="fi sm k-rest" aria-hidden="true">🔀</span>`:fundIcon(fundById(t.fundId)||{kind:'rest',name:''},'sm');
  let body='';
  if(isIn||isTr) body+=Object.entries(t.alloc||{}).filter(([,a])=>a>0).map(([fid,a])=>`<div class="alloc-line"><span>${isTr?'→ ':''}${esc(fundName(fid))}</span><span>${fmt(a)}</span></div>`).join('');
  if(isIn&&t.taxable===false) body+=`<div class="note">Без налога</div>`;
  if(S.canWrite) body+=`<div class="tx-acts">${isTr?'':`<button class="btn sm ghost" data-act="edit-tx" data-id="${esc(t.id)}">${ic('pencil')}Изменить</button>`}<button class="btn sm danger" data-act="del-tx" data-id="${esc(t.id)}">${ic('trash')}Удалить</button></div>`;
  const amt=isIn?`+${fmt(t.amount)}`:isTr?fmt(t.amount):`−${fmt(t.amount)}`;
  return `<details class="tx"><summary>${icon}<span class="t-main"><span class="t-title">${esc(title)}</span><br><span class="note">${sub}${sub&&who?' · ':''}${who}</span></span><span class="t-amt ${isIn?'in':''}">${amt}</span></summary><div class="tx-body">${body}</div></details>`;
}
function resolveNames(){document.querySelectorAll('[data-who]').forEach(el=>{el.textContent=S.names[el.dataset.who]||''})}

/* ---------- sheets ---------- */
let sheetT;
function openSheet(html,onMount){
  clearTimeout(sheetT); $('#scrim').classList.remove('closing');
  const sh=$('#sheet'); sh.classList.remove('closing'); sh.innerHTML=`<div class="wrap">${html}</div>`; sh.hidden=false; $('#scrim').hidden=false; sh.scrollTop=0;
  onMount&&onMount(sh); const f=sh.querySelector('input.big,input'); f&&!f.dataset.nofocus&&setTimeout(()=>f.focus(),60);
}
/* Шторка над клавиатурой iPhone: держим её в видимой области и не даём полю ввода уехать за край */
function fitSheet(){
  const sh=$('#sheet'), vv=window.visualViewport; if(!sh||sh.hidden||!vv) return;
  const kb=Math.max(0,Math.round(innerHeight-vv.height-vv.offsetTop));
  if(kb>60){sh.style.bottom=kb+'px';sh.style.maxHeight=Math.round(vv.height-8)+'px'}else{sh.style.bottom='';sh.style.maxHeight=''}
  const a=document.activeElement;
  if(kb>60&&a&&sh.contains(a)&&a.tagName==='INPUT'){const r=a.getBoundingClientRect(),b=sh.getBoundingClientRect();
    if(r.top<b.top+8||r.bottom>b.bottom-8) sh.scrollTop+=r.top-b.top-56}
}
const PTR={down:false};
document.addEventListener('pointerdown',()=>PTR.down=true,true);['pointerup','pointercancel'].forEach(t=>document.addEventListener(t,()=>setTimeout(()=>PTR.down=false,0),true));
if(window.visualViewport){visualViewport.addEventListener('resize',fitSheet);visualViewport.addEventListener('scroll',fitSheet)}
document.addEventListener('focusin',e=>{if(e.target.closest&&e.target.closest('#sheet'))setTimeout(fitSheet,320)});
function closeSheet(){
  S.sheetRefresh=null; const sh=$('#sheet'), sc=$('#scrim'); if(sh.hidden)return;
  const done=()=>{sh.classList.remove('closing');sc.classList.remove('closing');sh.style.bottom='';sh.style.maxHeight='';sh.hidden=true;sc.hidden=true;sh.innerHTML=''};
  if(calm()){done();return}
  sh.classList.add('closing');sc.classList.add('closing');clearTimeout(sheetT);sheetT=setTimeout(done,180);
}
function sheetHead(t){return `<div class="sheet-head"><h2>${t}</h2><button class="x" data-act="close" aria-label="Закрыть">${ic('x')}</button></div>`}
function typeSeg(active){return `<div class="seg"><button data-act="open-income" aria-pressed="${active==='income'}">Доход</button><button data-act="open-expense" aria-pressed="${active==='expense'}">Трата</button></div>`}

function openIncome(mode,tx){
  const isFree=mode==='free', isEdit=!!tx, skip=isEdit?tx.id:null;
  const freeBal=isFree?Math.round(monthPicture().free):0;
  const amt0=isFree?nf.format(freeBal):isEdit?nf.format(tx.amount):'';
  openSheet(`${sheetHead(isEdit?'Изменить доход':isFree?'Разложить деньги без фонда':'Пришли деньги')}${isFree?`<p class="note">Без фонда лежит ${fmt(freeBal)}. Они разойдутся по очереди фондов, налог с них не берётся.</p>`:isEdit?'':typeSeg('income')}
  <div class="field"><label for="inAmt">Сумма</label><input class="big" id="inAmt" inputmode="decimal" placeholder="0 ₽" autocomplete="off" value="${amt0}"></div>
  <div class="grid2"><div class="field"><label for="inDate">Дата</label><input type="date" id="inDate" value="${esc(isEdit?tx.date:today())}"></div><div class="field"><label for="inNote">${isFree?'Комментарий':'Откуда'}</label><input id="inNote" placeholder="${isFree?'Необязательно':'Ученики, декретные…'}" value="${esc(isEdit?tx.note||'':'')}"></div></div>
  <label class="check" ${isFree?'hidden':''}><input type="checkbox" id="inTax" ${isFree?'':isEdit?(tx.taxable===false?'':'checked'):'checked'}> Облагается налогом</label>
  <div id="planBox"></div>
  <div class="err" id="inErr"></div>
  <button class="btn primary" id="inSave">${isEdit?'Сохранить изменения':'Записать и разложить'}</button>`, ()=>{
    // base — полная раскладка редактируемой записи; edited — ручные правки поверх подсказки
    let base=null, edited=null, pourT;
    if(isEdit){base={};for(const [k,v] of Object.entries(tx.alloc||{})) if(k!=='_free') base[k]=Math.round(+v||0)}
    const draw=()=>{
      const amt=Math.round(parseAmt($('#inAmt').value)); const box=$('#planBox');
      if(amt<=0){box.innerHTML=`<p class="note">Введите сумму, и здесь появится, сколько положить в каждый фонд.</p>`;return}
      const p=plan(amt,$('#inTax').checked,skip);
      box.innerHTML=`<div class="eyebrow" style="margin-bottom:8px">Как разложить</div><div class="plan river">${p.rows.map(r=>{
        const v=base?(base[r.f.id]||0):edited&&edited[r.f.id]!==undefined?edited[r.f.id]:r.give;
        return `<div class="plan-row k-${r.f.kind} ${v>0?'':'zero'}">${fundIcon(r.f,'sm')}<span class="n">${esc(r.f.name)}<small>${KINDS[r.f.kind]?.label||''}</small></span><input id="pa-${esc(r.f.id)}" data-fid="${esc(r.f.id)}" data-nofocus="1" inputmode="decimal" value="${v?nf.format(v):''}" placeholder="0" aria-label="${esc(r.f.name)}, ₽"></div>`}).join('')}
        <div class="plan-foot" id="planFoot"></div></div>`;
      foot();
      box.querySelectorAll('input[data-fid]').forEach(inp=>inp.addEventListener('input',()=>{const v=Math.round(parseAmt(inp.value));if(base)base[inp.dataset.fid]=v;else{edited=edited||{};edited[inp.dataset.fid]=v}inp.closest('.plan-row').classList.toggle('zero',!(v>0));foot()}));
    };
    const pour=()=>{if(calm())return;let i=0;document.querySelectorAll('#planBox .plan-row').forEach(r=>{if(!r.classList.contains('zero')){r.style.animationDelay=(i++*60)+'ms';r.classList.add('fill')}})};
    const collect=()=>{const a={};document.querySelectorAll('#planBox input[data-fid]').forEach(i=>{const v=Math.round(parseAmt(i.value));if(v>0)a[i.dataset.fid]=v});return a};
    const foot=()=>{const amt=Math.round(parseAmt($('#inAmt').value));const used=sum(Object.values(collect()));const rest=amt-used;
      $('#planFoot').innerHTML=`<span>Разложено ${fmt(used)} из ${fmt(amt)}</span><span class="${rest<0?'neg':''}">${rest>0?'без фонда '+fmt(rest):rest<0?'больше суммы на '+fmt(-rest):'всё распределено'}</span>`;
      $('#inSave').disabled=rest<0;};
    $('#inAmt').addEventListener('input',()=>{base=null;edited=null;draw();clearTimeout(pourT);pourT=setTimeout(pour,450)});
    $('#inTax').addEventListener('change',()=>{base=null;edited=null;draw();pour()});
    draw(); if(!isEdit) pour();
    $('#inSave').addEventListener('click',async()=>{
      const amt=Math.round(parseAmt($('#inAmt').value)); if(amt<=0){$('#inErr').textContent='Введите сумму больше нуля.';return}
      const alloc=collect(); const rest=amt-sum(Object.values(alloc)); if(rest<0)return;
      const date=$('#inDate').value||today(); const note=$('#inNote').value.trim();
      if(isFree){
        if(amt>freeBal){$('#inErr').textContent=`Без фонда лежит только ${fmt(freeBal)}.`;return}
        const moved=sum(Object.values(alloc)); if(moved<=0){$('#inErr').textContent='Укажите, сколько положить хотя бы в один фонд.';return}
        await write(async()=>{await DB.add('tx',{type:'transfer',from:'_free',alloc,amount:moved,date,month:date.slice(0,7),note,by:S.uid||null,createdAt:Date.now()})},'Деньги разложены по фондам');
        return;
      }
      if(rest>0)alloc._free=(alloc._free||0)+rest;
      const data={amount:amt,date,month:date.slice(0,7),note,taxable:$('#inTax').checked,alloc};
      if(isEdit) await write(async()=>{await DB.update('tx',tx.id,data)},'Доход изменён');
      else await write(async()=>{await DB.add('tx',{type:'income',...data,by:S.uid||null,createdAt:Date.now()})},'Доход записан и разложен по фондам');
    });
  });
}
function openExpense(tx,preset){
  const isEdit=!!tx, skip=isEdit?tx.id:null; preset=preset||{};
  const {get}=stats(skip); const funds=activeFunds();
  const free=fstate({id:'_free',kind:'goal',value:0},get).balance;
  const srcOpts=funds.filter(f=>f.kind!=='debt').map(f=>({id:f.id,name:f.name,bal:fstate(f,get).balance}));
  if(free>0.5||(isEdit&&tx.from==='_free'))srcOpts.push({id:'_free',name:'Без фонда',bal:free});
  const catSel=isEdit?tx.fundId:(preset.fundId||'');
  const catList=funds.slice(); if(isEdit&&!catList.some(f=>f.id===tx.fundId)){const g=fundById(tx.fundId);if(g)catList.push(g)}
  const srcSel=isEdit&&tx.from&&tx.from!==tx.fundId?tx.from:'';
  const amt0=isEdit?nf.format(tx.amount):preset.amount>0?nf.format(preset.amount):'';
  openSheet(`${sheetHead(isEdit?'Изменить трату':preset.fundId?'Записать платёж':'Потратили')}${isEdit||preset.fundId?'':typeSeg('expense')}
  <div class="field"><label for="exAmt">Сумма</label><input class="big" id="exAmt" inputmode="decimal" placeholder="0 ₽" autocomplete="off" value="${amt0}"></div>
  <div class="field"><label for="exCat">На что потратили</label><select id="exCat">${catList.map(f=>`<option value="${esc(f.id)}" ${f.id===catSel?'selected':''}>${esc(fundEmoji(f))} ${esc(f.name)}</option>`).join('')}</select></div>
  <div class="field"><label for="exSrc">Из какого фонда взяли деньги</label><select id="exSrc"><option value="">Из этого же фонда</option>${srcOpts.map(o=>`<option value="${esc(o.id)}" ${o.id===srcSel?'selected':''}>${esc(o.name)} · ${fmt(o.bal)}</option>`).join('')}</select></div>
  <div class="grid2"><div class="field"><label for="exDate">Дата</label><input type="date" id="exDate" value="${esc(isEdit?tx.date:today())}"></div><div class="field"><label for="exNote">Комментарий</label><input id="exNote" placeholder="Необязательно" value="${esc(isEdit?tx.note||'':preset.note||'')}"></div></div>
  <div class="note" id="exHint"></div><div class="err" id="exErr"></div>
  <button class="btn primary" id="exSave">${isEdit?'Сохранить изменения':'Записать трату'}</button>`, ()=>{
    const hint=()=>{
      const cat=catList.find(f=>f.id===$('#exCat').value); const srcId=$('#exSrc').value||(cat&&cat.id); const a=Math.round(parseAmt($('#exAmt').value));
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
      const cat=catList.find(f=>f.id===fundId);
      if(cat&&cat.kind==='debt'&&!$('#exSrc').value){$('#exErr').textContent='Выберите, из какого фонда взяли деньги на платёж.';return}
      const from=$('#exSrc').value||fundId; const date=$('#exDate').value||today();
      const data={amount:amt,fundId,from,date,month:date.slice(0,7),note:$('#exNote').value.trim()};
      if(isEdit) await write(async()=>{await DB.update('tx',tx.id,data)},'Трата изменена');
      else await write(async()=>{await DB.add('tx',{type:'expense',...data,by:S.uid||null,createdAt:Date.now()})},'Трата записана');
    });
  });
}
function openFund(f,kindPreset){
  const isNew=!f; f=f||{kind:kindPreset||'monthly',name:'',value:'',taxOnly:true};
  const {get}=stats(); const s=isNew?{balance:0,remaining:0,moved:0,paid:0}:fstate(f,get);
  const cur=f.kind==='debt'?s.remaining:s.balance;
  let icon=f.icon||'';
  openSheet(`${sheetHead(isNew?(f.kind==='debt'?'Новый долг':'Новый фонд'):'Фонд')}
  <div class="field"><label for="fName">Название</label><input id="fName" value="${esc(f.name)}" placeholder="${f.kind==='debt'?'Например, Кредитка':'Например, Квартира'}"></div>
  <div class="field"><span class="lbl">Иконка <span class="muted" id="fIcoNote"></span></span><div class="emojis" id="fIco">${EMOJI.map(e=>`<button type="button" data-e="${e}" aria-pressed="${icon===e}" aria-label="Иконка ${e}">${e}</button>`).join('')}</div></div>
  <input type="hidden" id="fKind" value="${esc(f.kind)}">
  <div class="field"><span class="lbl">Как фонд забирает деньги</span>
    <div class="seg three kind-seg" id="fKindOps">${['monthly','percent','rest'].map(k=>`<button type="button" data-k="${k}" aria-pressed="${f.kind===k}">${KIND_UI[k]}</button>`).join('')}</div>
    <span class="lbl kind-or">Или у фонда есть цель</span>
    <div class="kind-tags" id="fKindTags">${['goal','debt'].map(k=>`<button type="button" class="kind-tag" data-k="${k}" aria-pressed="${f.kind===k}">${KIND_UI[k]}</button>`).join('')}</div>
    <button type="button" class="kind-reward" data-k="reward" aria-pressed="${f.kind==='reward'}"><span class="kr-ico">🎁</span><span class="kr-txt"><b>Фонд наград</b><span>Деньги на покупки для себя из того, что осталось сверх плана</span></span></button>
    <div class="kind-hint" id="fKindHint"></div>
  </div>
  <div class="field" id="fValBox"><label for="fVal" id="fValLbl"></label><input id="fVal" inputmode="decimal" value="${f.value!==''&&f.value!=null&&f.kind!=='debt'?nf.format(f.value):''}"></div>
  <label class="check" id="fTaxBox"><input type="checkbox" id="fTax" ${f.taxOnly?'checked':''}> Только с доходов, облагаемых налогом</label>
  <div class="field" id="fCapBox"><label for="fCap">Не больше в месяц, ₽ (необязательно)</label><input id="fCap" inputmode="decimal" value="${+f.cap?nf.format(f.cap):''}"><span class="note">Цель будет забирать из каждого месяца не больше этой суммы, остальное пойдёт дальше по очереди.</span></div>
  <div class="grid2" id="fDebtBox"><div class="field"><label for="fRate">Ставка, % годовых</label><input id="fRate" inputmode="decimal" placeholder="Например, 29,9" value="${+f.rate?nf2.format(f.rate):f.rateSet?'0':''}"></div><div class="field"><label for="fMin">Мин. платёж, ₽</label><input id="fMin" inputmode="decimal" placeholder="0" value="${+f.minPay?nf.format(f.minPay):''}"></div></div>
  <div class="grid2"><div class="field" id="fDayBox"><label for="fDay">День платежа</label><input id="fDay" type="number" inputmode="numeric" min="1" max="31" placeholder="1–31" value="${+f.payDay?Math.round(+f.payDay):''}"></div>
  <div class="field" id="fDlBox"><label for="fDl">Срок (необязательно)</label><input type="date" id="fDl" value="${esc(f.deadline||'')}"></div></div>
  <div class="field" id="fCurBox"><label for="fCur" id="fCurLbl"></label><input id="fCur" inputmode="decimal" value="${isNew&&f.kind!=='debt'?'':(isNew?'':nf.format(cur))}"><span class="note" id="fCurNote"></span></div>
  <div class="err" id="fErr"></div>
  <button class="btn primary" id="fSave">${isNew?(f.kind==='debt'?'Добавить долг':'Добавить фонд'):'Сохранить'}</button>
  ${isNew?'':`<button class="btn danger" id="fDel">${ic('trash')}Удалить фонд</button>`}`, ()=>{
    const icoNote=()=>{$('#fIcoNote').textContent=icon?'':`· сейчас ${fundEmoji({name:$('#fName').value,kind:$('#fKind').value})}, подобрана по названию`};
    $('#fIco').addEventListener('click',e=>{const b=e.target.closest('[data-e]');if(!b)return;icon=icon===b.dataset.e?'':b.dataset.e;$('#fIco').querySelectorAll('[data-e]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.e===icon)));icoNote()});
    $('#fName').addEventListener('input',icoNote);
    const pick=e=>{const b=e.target.closest('[data-k]');if(!b)return;$('#fKind').value=b.dataset.k;sync()};
    ['#fKindOps','#fKindTags'].forEach(s=>$(s).addEventListener('click',pick));$('.kind-reward').addEventListener('click',pick);
    const rewardHint=()=>{
      const pct=parseAmt($('#fVal').value)||REWARD_DEFAULT; const F=monthFlow(monthPicture());
      const ex=F.known&&F.base>0?`<p>При вашем обычном доходе сверх плана остаётся около ${fmt(F.base)} в месяц. ${nf.format(pct)}% от них — примерно <b>${fmt(F.base*pct/100)}</b> в месяц на награды.</p>`
        :`<p>Например: пришло 300 000 ₽, налог и обязательные платежи забрали 220 000 ₽. Сверх плана осталось 80 000 ₽, и ${nf.format(pct)}% от них, ${fmt(80000*pct/100)}, уйдут в награды.</p>`;
      return `<p><b>Как это работает.</b> Сначала из дохода берутся налог и обязательные платежи. Всё, что осталось сверху, это деньги сверх плана. Фонд наград забирает от них свой процент, остальное идёт на долги и накопления.</p>${ex}<p>Тратьте эти деньги на себя без чувства вины: так проще не сорваться и держать план по долгам. А за каждый закрытый долг положен отдельный бонус на покупку: ${BONUS_PCT}% от его суммы.</p>`;
    };
    const sync=()=>{const k=$('#fKind').value;
      document.querySelectorAll('#fKindOps [data-k],#fKindTags [data-k],.kind-reward').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.k===k)));
      $('#fKindHint').innerHTML=k==='reward'?rewardHint():`<p>${KIND_HINT[k]||''}</p>`;
      $('#fKindHint').classList.toggle('reward',k==='reward');
      $('#fValBox').hidden=k==='rest'||k==='debt';
      $('#fValLbl').textContent=k==='percent'?'Процент от дохода':k==='reward'?'Какой процент от денег сверх плана откладывать':k==='monthly'?'Сумма в месяц, ₽':'Цель, ₽';
      $('#fCapBox').hidden=k!=='goal';
      $('#fTaxBox').hidden=k!=='percent';
      $('#fDebtBox').hidden=k!=='debt';
      $('#fDayBox').hidden=!(k==='monthly'||k==='debt');
      $('#fDlBox').hidden=!(k==='goal'||k==='debt');
      $('#fCurLbl').textContent=k==='debt'?'Сколько осталось погасить, ₽':'Сколько сейчас лежит в фонде, ₽';
      $('#fCurNote').textContent=k==='debt'?'Укажите текущий остаток. Позже его можно поправить, если банк начислил проценты.':'Если деньги уже отложены, укажите сумму. Иначе оставьте пустым.';
      icoNote();
    };
    $('#fVal').addEventListener('input',()=>{if($('#fKind').value==='reward')$('#fKindHint').innerHTML=rewardHint()});sync();
    $('#fSave').addEventListener('click',async()=>{
      const name=$('#fName').value.trim(); const kind=$('#fKind').value;
      if(!name){$('#fErr').textContent='Дайте фонду название.';return}
      const val=parseAmt($('#fVal').value); const curIn=parseAmt($('#fCur').value);
      if((kind==='monthly'||kind==='goal')&&val<=0){$('#fErr').textContent='Укажите сумму больше нуля.';return}
      if((kind==='percent'||kind==='reward')&&(val<=0||val>100)){$('#fErr').textContent='Процент должен быть от 1 до 100.';return}
      if(kind==='debt'&&curIn<=0&&isNew){$('#fErr').textContent='Укажите сумму долга.';return}
      const day=Math.round(parseAmt($('#fDay').value));
      if($('#fDay').value.trim()&&(day<1||day>31)){$('#fErr').textContent='День платежа — число от 1 до 31.';return}
      const rate=parseAmt($('#fRate').value);
      if(kind==='debt'&&(rate<0||rate>200)){$('#fErr').textContent='Ставка выглядит странно: укажите процент годовых, например 29,9.';return}
      const data={name,kind,icon,taxOnly:kind==='percent'?$('#fTax').checked:false,deadline:(kind==='goal'||kind==='debt')?($('#fDl').value||''):'',cap:kind==='goal'?Math.round(parseAmt($('#fCap').value)):0,
        payDay:(kind==='monthly'||kind==='debt')&&day>=1&&day<=31?day:0,rate:kind==='debt'?Math.round(rate*100)/100:0,rateSet:kind==='debt'&&$('#fRate').value.trim()!=='',minPay:kind==='debt'?Math.round(parseAmt($('#fMin').value)):0};
      const moved=isNew?0:(s.moved||0); const paid=isNew?0:(s.paid||0);
      if(kind==='debt'){data.value=Math.round(curIn+paid);data.start=0}
      else {data.value=kind==='rest'?0:val;data.start=Math.round(curIn-moved)}
      await write(async()=>{
        if(isNew){data.order=(activeFunds().reduce((m,x)=>Math.max(m,+x.order||0),0))+1;data.createdAt=Date.now();await DB.add('funds',data)}
        else await DB.update('funds',f.id,data);
      },isNew?(kind==='debt'?'Долг добавлен':'Фонд добавлен'):'Фонд сохранён');
    });
    const del=$('#fDel'); if(del) del.addEventListener('click',()=>deleteFund(f));
  });
}
async function deleteFund(f){
  const s=fstate(f,stats().get); let trId=null;
  try{
    if(f.kind!=='debt'&&s.balance>0.5){const a=Math.round(s.balance);trId=await DB.add('tx',{type:'transfer',from:f.id,alloc:{_free:a},amount:a,date:today(),month:curMonth(),note:`Фонд «${f.name}» удалён`,by:S.uid||null,createdAt:Date.now()})}
    await DB.update('funds',f.id,{archived:true});
    closeSheet(); S.confirmFund=null; render();
    toast('Фонд удалён, записи остались',{label:'Вернуть',fn:async()=>{try{await DB.update('funds',f.id,{archived:false});if(trId)await DB.del('tx',trId);toast('Фонд возвращён')}catch(e){toast('Не получилось вернуть фонд.')}}});
  }catch(e){toast('Не получилось удалить фонд.')}
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
  ${isNew?'':(w.by&&S.members[w.by]?`<div class="note">Добавил: ${esc(S.members[w.by])}</div>`:'')}<div class="field"><label for="wName">Что</label><input id="wName" value="${esc(w.name)}" placeholder="Кроссовки, планшет, ремонт…"></div>
  <div class="field"><label for="wPrice">Цена</label><input class="big" id="wPrice" inputmode="decimal" placeholder="0 ₽" autocomplete="off" value="${w.price?nf.format(w.price):''}"></div>
  <div class="field"><label for="wFund">Из какого фонда хотите платить</label><select id="wFund">${fundOpts}</select></div>
  <div id="wVerdict" class="wish-box"></div><div class="err" id="wErr"></div>
  <button class="btn ghost" id="wSave">${isNew?'Отложить в список':'Сохранить изменения'}</button>
  ${isNew?'':'<button class="btn danger" id="wDel">Убрать из списка</button>'}`, ()=>{
    let v=null;
    const price=()=>Math.round(parseAmt($('#wPrice').value));
    const name=()=>$('#wName').value.trim();
    // пока открыта клавиатура, показываем одну короткую строку: большой блок выталкивал поле цены за край экрана
    const typing=()=>{const a=document.activeElement;return !!a&&(a.id==='wPrice'||a.id==='wName')};
    const draw=()=>{if(!$('#wVerdict'))return;v=analyzeWish(price(),$('#wFund').value,w.id||'');
      $('#wVerdict').innerHTML=typing()&&v?`<div class="verdict mini ${v.tone}"><b>${esc(v.title)}</b><span class="muted small">Варианты появятся, когда закончите ввод</span></div>`:wishBox(v);fitSheet()};
    $('#wPrice').addEventListener('input',()=>{$('#wErr').textContent='';draw()});$('#wFund').addEventListener('change',draw);draw();
    ['wPrice','wName'].forEach(id=>{$('#'+id).addEventListener('focus',draw);$('#'+id).addEventListener('blur',()=>{const go=()=>PTR.down?setTimeout(go,50):setTimeout(draw,60);go()})});
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
async function persistOrder(list){
  try{for(let k=0;k<list.length;k++){if((+list[k].order||0)!==k+1) await DB.update('funds',list[k].id,{order:k+1})}}
  catch(e){toast('Не получилось изменить порядок.')}
}
async function moveFund(id,d){
  const list=activeFunds().slice(); const i=list.findIndex(f=>f.id===id); const j=i+d; if(i<0||j<0||j>=list.length)return;
  [list[i],list[j]]=[list[j],list[i]];
  await persistOrder(list);
}
async function deleteTx(id){
  const t=S.tx.find(x=>x.id===id); if(!t)return; const {id:_,...data}=t;
  try{
    await DB.del('tx',id);
    toast('Запись удалена',{label:'Вернуть',fn:async()=>{try{await DB.set('tx',id,data);toast('Запись возвращена')}catch(e){toast('Не получилось вернуть запись.')}}});
  }catch(e){toast('Не получилось удалить запись.')}
}
let toastT;
function toast(t,action){
  const el=$('#toast'); el.innerHTML=''; const s=document.createElement('span'); s.textContent=t; el.appendChild(s);
  if(action){const b=document.createElement('button');b.type='button';b.innerHTML=ic('undo-2')+esc(action.label);b.addEventListener('click',()=>{el.hidden=true;clearTimeout(toastT);action.fn()});el.appendChild(b)}
  el.hidden=false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true,action?6000:2600);
}

/* ---------- помощники ---------- */
const nf2 = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const cap = s => s?s[0].toUpperCase()+s.slice(1):s;
function isoD(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function dim(y,m){return new Date(y,m+1,0).getDate()}
function dueIn(y,m,day){const d=new Date(y,m,1);return new Date(d.getFullYear(),d.getMonth(),Math.min(day,dim(d.getFullYear(),d.getMonth())))}
function durationWord(k){const y=Math.floor(k/12),m=k%12;const ys=y?`${y} ${plural(y,'год','года','лет')}`:'';const ms=m?`${m} ${plural(m,'месяц','месяца','месяцев')}`:'';return [ys,ms].filter(Boolean).join(' ')||'меньше месяца'}
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};

/* ---------- регулярные платежи ---------- */
function upcoming(days=7){
  const {get}=stats(); const now=new Date(); const t0=new Date(now.getFullYear(),now.getMonth(),now.getDate()); const out=[];
  for(const f of activeFunds()){
    const day=Math.round(+f.payDay||0); if(!(day>=1&&day<=31)||!(f.kind==='monthly'||f.kind==='debt')) continue;
    const s=fstate(f,get), v=+f.value||0, mp=+f.minPay||0;
    if(f.kind==='debt'&&s.remaining<=0.5) continue;
    const paidNow=f.kind==='monthly'?(v>0&&s.spentM>=v-0.5):(mp>0?s.allocM>=mp-0.5:s.allocM>0.5);
    const thisDue=dueIn(t0.getFullYear(),t0.getMonth(),day);
    let due,amount,enough=null,short=0,overdue=false;
    if(!paidNow){
      due=thisDue; overdue=thisDue<t0;
      amount=f.kind==='monthly'?Math.max(0,v-s.spentM):Math.min(s.remaining,Math.max(0,mp-s.allocM));
      if(f.kind==='monthly'){enough=s.balance>=amount-0.5;short=Math.max(0,amount-s.balance)}
    } else {
      if(thisDue>=t0) continue; // уже оплачен в этом месяце до срока
      due=dueIn(t0.getFullYear(),t0.getMonth()+1,day);
      amount=f.kind==='monthly'?v:Math.min(s.remaining,mp);
      if(f.kind==='monthly'){enough=s.balance>=v-0.5;short=Math.max(0,v-s.balance)}
    }
    const dd=Math.round((due-t0)/864e5);
    if(!overdue&&dd>days) continue;
    const dl=dateLabel(isoD(due));
    const when=overdue?`срок был ${dl}`:dd===0?'сегодня':dd===1?`завтра, ${dl}`:`через ${dd} ${plural(dd,'день','дня','дней')}, ${dl}`;
    out.push({f,due,dd,overdue,amount,enough,short,when,paidNow:false});
  }
  return out.sort((a,b)=>(b.overdue-a.overdue)||a.dd-b.dd);
}
function icsEsc(s){return String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n')}
function icsFold(line){
  const enc=new TextEncoder(); if(enc.encode(line).length<=75) return line;
  const parts=[]; let cur='', n=0;
  for(const ch of line){const b=enc.encode(ch).length;const lim=parts.length?74:75;if(n+b>lim){parts.push(cur);cur='';n=0}cur+=ch;n+=b}
  parts.push(cur); return parts.join('\r\n ');
}
function exportICS(){
  const fs=activeFunds().filter(f=>(f.kind==='monthly'||f.kind==='debt')&&+f.payDay>=1);
  if(!fs.length){toast('Сначала укажите день платежа у фондов');return}
  const now=new Date(), t0=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
  const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Potok//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Поток: платежи'];
  for(const f of fs){
    const day=Math.min(31,Math.round(+f.payDay)); let first=dueIn(t0.getFullYear(),t0.getMonth(),day); if(first<t0) first=dueIn(t0.getFullYear(),t0.getMonth()+1,day);
    const rr=day<=28?`FREQ=MONTHLY;BYMONTHDAY=${day}`:`FREQ=MONTHLY;BYMONTHDAY=${Array.from({length:day-27},(_,i)=>28+i).join(',')};BYSETPOS=-1`;
    const amt=f.kind==='monthly'?(+f.value||0):(+f.minPay||0);
    const title=`Платёж: ${f.name}${amt?` — ${nf.format(amt)} ₽`:''}`;
    L.push('BEGIN:VEVENT',`UID:ff-${f.id}@potok`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${isoD(first).replace(/-/g,'')}`,`RRULE:${rr}`,
      `SUMMARY:${icsEsc(title)}`,`DESCRIPTION:${icsEsc('После оплаты нажмите «Оплатил» в приложении «Поток».')}`,'TRANSP:TRANSPARENT',
      'BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${icsEsc('Завтра '+title.toLowerCase())}`,'TRIGGER:-PT15H','END:VALARM','END:VEVENT');
  }
  L.push('END:VCALENDAR');
  saveFile('platezhi-potok.ics','text/calendar;charset=utf-8',L.map(icsFold).join('\r\n')+'\r\n',{calendar:true});
}

/* ---------- экспорт ---------- */
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
async function saveFile(name,mime,text,opt={}){
  const blob=new Blob([text],{type:mime});
  if(opt.calendar&&isIOS()){const url=URL.createObjectURL(blob);location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);return}
  if(isIOS()&&navigator.canShare){try{const file=new File([blob],name,{type:mime.split(';')[0]});if(navigator.canShare({files:[file]})){await navigator.share({files:[file]});return}}catch(e){if(e&&e.name==='AbortError')return}}
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},2000); toast(opt.calendar?'Файл календаря сохранён: откройте его, чтобы добавить напоминания':'Файл сохранён');
}
function exportCSV(){
  const q=v=>{v=String(v??'');return /[";\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const head=['Дата','Тип','Сумма','Фонд','Из фонда','Комментарий','Кто','Раскладка по фондам'];
  const rows=S.tx.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(t=>{
    const type=t.type==='income'?'Доход':t.type==='expense'?'Трата':'Перевод';
    const fund=t.type==='expense'?fundName(t.fundId):'';
    const from=t.type==='expense'?(t.from&&t.from!==t.fundId?fundName(t.from):''):t.type==='transfer'?fundName(t.from):'';
    const alloc=Object.entries(t.alloc||{}).filter(([,a])=>a>0).map(([k,a])=>`${fundName(k)}: ${Math.round(a)}`).join(', ');
    return [t.date,type,Math.round(+t.amount||0),fund,from,t.note||'',S.members[t.by]||'',alloc].map(q).join(';');
  });
  saveFile(`potok-zapisi-${today()}.csv`,'text/csv;charset=utf-8','\ufeff'+[head.join(';'),...rows].join('\r\n')+'\r\n');
}
function exportJSON(){
  const h=S.household||{};
  const data={app:'family-funds',format:2,exportedAt:new Date().toISOString(),household:{expectedIncome:h.expectedIncome||0,debtStrategy:h.debtStrategy||'custom',debtBudget:h.debtBudget||0},members:S.members,funds:S.funds,tx:S.tx,wishes:S.wishes};
  saveFile(`potok-kopiya-${today()}.json`,'application/json',JSON.stringify(data,null,2));
}

/* ---------- план погашения долгов ---------- */
const STRATS={
  avalanche:{name:'Лавина',desc:'Сначала долг с самой высокой ставкой: меньше всего переплата.'},
  snowball:{name:'Снежный ком',desc:'Сначала самый маленький остаток: быстрее первые закрытые долги.'},
  custom:{name:'Своя очередь',desc:'В порядке фондов в очереди.'}
};
const stratOf=()=>(S.household&&STRATS[S.household.debtStrategy])?S.household.debtStrategy:'custom';
function debtList(){const {get}=stats();return activeFunds().filter(f=>f.kind==='debt').map(f=>({f,bal:fstate(f,get).remaining,rate:Math.max(0,+f.rate||0),min:Math.max(0,+f.minPay||0)}))}
function orderDebts(list,strat){const L=list.slice();if(strat==='avalanche')L.sort((a,b)=>b.rate-a.rate||a.bal-b.bal);else if(strat==='snowball')L.sort((a,b)=>a.bal-b.bal||b.rate-a.rate);return L}
function debtBudget(){
  const o=+(S.household&&S.household.debtBudget)||0; if(o>0) return {v:o,auto:false,known:true};
  const F=monthFlow(monthPicture()); return {v:Math.max(0,Math.round(F.free)),auto:true,known:F.known};
}
function simulate(strat,budget,list){
  const live=orderDebts((list||debtList()).filter(d=>d.bal>0.5),strat).map(d=>({...d}));
  if(!live.length) return {none:true};
  const total=sum(live.map(d=>d.bal)), mins=sum(live.map(d=>d.min));
  if(!(budget>0)) return {noBudget:true,total,mins};
  let m=0,interest=0,prev=Infinity; const at={};
  while(live.some(d=>d.bal>0.5)&&m<600){
    m++;
    for(const d of live) if(d.bal>0.5){const i=d.bal*d.rate/1200;d.bal+=i;interest+=i}
    let pool=budget;
    for(const d of live) if(d.bal>0.5){const p=Math.min(d.min,d.bal,pool);d.bal-=p;pool-=p}
    for(const d of live){if(pool<=0)break;if(d.bal>0.5){const p=Math.min(d.bal,pool);d.bal-=p;pool-=p}}
    for(const d of live) if(d.bal<=0.5&&!at[d.f.id]) at[d.f.id]=m;
    const left=sum(live.map(d=>Math.max(0,d.bal))); if(m>24&&left>=prev-0.5){m=600;break} prev=left;
  }
  return {months:m,interest,at,stuck:m>=600,short:budget<mins-0.5,total,mins,order:live.map(d=>d.f.id)};
}
function debtSummary(){
  const open=debtList().filter(d=>d.bal>0.5); if(!open.length) return null;
  const B=debtBudget(); const r=simulate(stratOf(),B.v); const total=sum(open.map(d=>d.bal));
  if(r.noBudget||r.stuck) return {title:'План погашения долгов',sub:`Осталось ${fmt(total)} · задайте сумму на долги`};
  return {title:`Без долгов через ${durationWord(r.months)}`,sub:`${cap(monthIn(r.months))} · осталось ${fmt(total)}`};
}
async function applyStrategy(strat){
  const list=activeFunds().slice(); const slots=[]; list.forEach((f,i)=>{if(f.kind==='debt')slots.push(i)});
  const ordered=orderDebts(debtList(),strat).map(d=>d.f);
  slots.forEach((s,k)=>{list[s]=ordered[k]});
  await persistOrder(list); toast(`Долги в очереди выставлены: ${STRATS[strat].name.toLowerCase()}`);
}

/* ---------- праздник за закрытый долг и цель ---------- */
let celeQ=[], celeOn=false;
function checkCelebrations(){
  if(!S.hid||S.status!=='ready') return;
  const {get}=stats(); const initKey='ff-cel-init:'+S.hid; const first=!LS.get(initKey);
  for(const f of activeFunds()){
    const v=+f.value||0; if(!(v>0)) continue;
    const hit=(f.kind==='debt'&&fstate(f,get).remaining<=0.5)||(f.kind==='goal'&&!f.wishId&&fstate(f,get).balance>=v-0.5);
    if(!hit) continue;
    const k='ff-cel:'+S.hid+':'+f.id; if(LS.get(k)) continue; LS.set(k,'1');
    if(!first&&!celeQ.includes(f.id)) celeQ.push(f.id);
  }
  if(first) LS.set(initKey,'1');
  if(!celeOn&&celeQ.length) setTimeout(()=>{if(!celeOn&&celeQ.length)showCelebration(celeQ.shift())},400);
}
function showCelebration(fid){
  const f=fundById(fid); if(!f) return;
  celeOn=true; closeSheet(); const el=$('#cele'); const debt=f.kind==='debt'; const v=+f.value||0;
  const months=f.createdAt?Math.round((Date.now()-f.createdAt)/(30.44*864e5)):0;
  const B=debt?Math.round(v*BONUS_PCT/100)-(+f.bonusUsed||0):0;
  el.innerHTML=`<canvas aria-hidden="true"></canvas><div class="ce-in"><div class="ce-emoji" aria-hidden="true">${fundEmoji(f)}</div><div class="stamp">${debt?'ПОГАШЕНО':'НАКОПЛЕНО'}</div>
    <h2 class="ce-title" id="ceTitle">${debt?`Долг «${esc(f.name)}» закрыт`:`Цель «${esc(f.name)}» собрана`}</h2>
    <p class="ce-sub">${debt?`Вы погасили ${fmt(v)}`:`В фонде ${fmt(v)}`}${months>=1?` за ${monthsWord(months)}`:''}.${debt?' Этот фонд больше не забирает деньги из доходов.':''}</p>
    ${B>=500?`<p class="ce-sub">Награда за закрытие: до <b>${fmt(B)}</b> можно потратить на себя.</p>`:''}
    <div class="ce-btns">${B>=500&&S.canWrite?`<button class="btn reward" data-act="cele-reward">${ic('party-popper')}Потратить награду</button>`:''}<button class="btn primary" data-act="cele-close">Ура!</button></div></div>`;
  el.hidden=false; confetti(el.querySelector('canvas'));
  setTimeout(()=>el.querySelector('[data-act="cele-close"]')?.focus(),120);
}
function closeCelebration(){const el=$('#cele');el.hidden=true;el.innerHTML='';celeOn=false;if(celeQ.length)setTimeout(()=>showCelebration(celeQ.shift()),300)}
function confetti(cv){
  if(!cv||calm()) return;
  const dpr=Math.min(2,devicePixelRatio||1), W=cv.clientWidth, H=cv.clientHeight; cv.width=W*dpr; cv.height=H*dpr; const g=cv.getContext('2d'); g.scale(dpr,dpr);
  const cs=getComputedStyle(document.documentElement); const cols=['--accent','--reward','--goal','--debt','--accent-2'].map(v=>cs.getPropertyValue(v).trim()||'#1D5FA6');
  const P=Array.from({length:120},()=>({x:W/2+(Math.random()-.5)*80,y:H*.3,vx:(Math.random()-.5)*10,vy:-Math.random()*10-4,s:5+Math.random()*5,r:Math.random()*6,vr:(Math.random()-.5)*.3,c:cols[Math.floor(Math.random()*cols.length)]}));
  const t0=performance.now();
  const step=t=>{const k=(t-t0)/1000; g.clearRect(0,0,W,H);
    for(const p of P){p.vy+=.28;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;g.save();g.translate(p.x,p.y);g.rotate(p.r);g.globalAlpha=Math.max(0,1-k/2.4);g.fillStyle=p.c;g.fillRect(-p.s/2,-p.s/3,p.s,p.s*.66);g.restore()}
    if(k<2.4&&cv.isConnected) requestAnimationFrame(step); else g.clearRect(0,0,W,H)};
  requestAnimationFrame(step);
}

/* ---------- тема ---------- */
const THEME_COL={light:'#F1F6FA',dark:'#0A1520'};
const curTheme=()=>{const t=LS.get('ff-theme');return t==='light'||t==='dark'?t:'auto'};
function setTheme(t){
  const metas=document.querySelectorAll('meta[name=theme-color]');
  if(t==='auto'){LS.del('ff-theme');delete document.documentElement.dataset.theme;if(metas[0])metas[0].content=THEME_COL.light;if(metas[1])metas[1].content=THEME_COL.dark}
  else{LS.set('ff-theme',t);document.documentElement.dataset.theme=t;metas.forEach(m=>m.content=THEME_COL[t])}
}

/* ---------- перетаскивание фондов ---------- */
let drag=null;
document.addEventListener('pointerdown',e=>{
  const h=e.target.closest('.fund .grip'); if(!h||!S.canWrite||e.button>0) return;
  const row=h.closest('.fund'), list=row.parentElement, rows=[...list.querySelectorAll(':scope > .fund')];
  e.preventDefault(); try{h.setPointerCapture(e.pointerId)}catch(err){}
  drag={h,row,rows,from:rows.indexOf(row),to:rows.indexOf(row),y0:e.clientY,hgt:row.offsetHeight,pid:e.pointerId};
  row.classList.add('dragging'); rows.forEach(r=>{if(r!==row)r.classList.add('shift')});
  document.body.classList.add('is-dragging'); getSelection()?.removeAllRanges();
  if(navigator.vibrate) navigator.vibrate(8);
});
document.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.pid) return;
  const dy=e.clientY-drag.y0; drag.row.style.transform=`translateY(${dy}px)`;
  let to=drag.from, acc=0;
  if(dy>0){for(let i=drag.from+1;i<drag.rows.length;i++){acc+=drag.rows[i].offsetHeight;if(dy>acc-drag.rows[i].offsetHeight/2)to=i;else break}}
  else{for(let i=drag.from-1;i>=0;i--){acc+=drag.rows[i].offsetHeight;if(-dy>acc-drag.rows[i].offsetHeight/2)to=i;else break}}
  drag.to=to;
  drag.rows.forEach((r,i)=>{if(r===drag.row)return;let s=0;if(drag.from<to&&i>drag.from&&i<=to)s=-drag.hgt;else if(to<drag.from&&i>=to&&i<drag.from)s=drag.hgt;r.style.transform=s?`translateY(${s}px)`:''});
});
function endDrag(e){
  if(!drag||(e&&e.pointerId!==drag.pid)) return;
  const {row,rows,from,to}=drag; drag=null;
  document.body.classList.remove('is-dragging');
  rows.forEach(r=>{r.style.transform='';r.classList.remove('shift','dragging')});
  if(to!==from){const list=activeFunds().slice();const [m]=list.splice(from,1);list.splice(to,0,m);
    const el=row.parentElement; const node=rows[from]; el.insertBefore(node,to>from?rows[to].nextSibling:rows[to]);
    persistOrder(list);}
}
document.addEventListener('mousedown',e=>{if(e.target.closest&&e.target.closest('.fund .grip'))e.preventDefault()});
document.addEventListener('pointerup',endDrag); document.addEventListener('pointercancel',endDrag);
document.addEventListener('keydown',e=>{
  const g=e.target.closest&&e.target.closest('.fund .grip'); if(!g) return;
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const id=g.dataset.id;moveFund(id,e.key==='ArrowUp'?-1:1).then(()=>setTimeout(()=>document.querySelector(`.fund .grip[data-id="${CSS.escape(id)}"]`)?.focus(),80))}
});

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const th=e.target.closest('[data-theme-set]'); if(th){setTheme(th.dataset.themeSet);document.querySelectorAll('[data-theme-set]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeSet===curTheme())));return}
  const tab=e.target.closest('[data-tab]'); if(tab){if(S.tab!==tab.dataset.tab)S.enterNext=true;S.tab=tab.dataset.tab;S.debtEdit=false;render();window.scrollTo(0,0);return}
  const go=e.target.closest('[data-tab-go]'); if(go){S.tab=go.dataset.tabGo;S.enterNext=true;render();window.scrollTo(0,0);return}
  if(e.target.id==='scrim'){closeSheet();return}
  const a=e.target.closest('[data-act]'); if(!a)return;
  const act=a.dataset.act;
  if(await onGateAction(act,a))return;
  if(act==='tour'){closeSheet();LS.del(tourKey());if(TR)tourEnd();LS.del(tourKey());S.tab='now';S.enterNext=true;render();window.scrollTo(0,0);return}
  if(act==='wz-restart'){closeSheet();S.wz=newWizard(activeFunds().length?'existing':'new');S.status='setup';S.enterNext=true;render();window.scrollTo(0,0);return}
  if(await wzAction(act,a))return;
  if(act==='close')closeSheet();
  else if(act==='open-income'){if(S.canWrite)openIncome()}
  else if(act==='open-expense'){if(S.canWrite)openExpense()}
  else if(act==='new-fund')openFund(null);
  else if(act==='new-debt')openFund(null,'debt');
  else if(act==='edit-fund'){const f=fundById(a.dataset.id);if(f&&S.canWrite)openFund(f)}
  else if(act==='ask-del-fund'){S.confirmFund=a.dataset.id;render()}
  else if(act==='cancel-del'){S.confirmFund=null;render()}
  else if(act==='del-fund'){const f=fundById(a.dataset.id);if(f){a.disabled=true;deleteFund(f)}}
  else if(act==='distribute-free'){if(S.canWrite)openIncome('free')}
  else if(act==='new-wish'){if(S.canWrite)openWish(null)}
  else if(act==='edit-wish'){const w=S.wishes.find(x=>x.id===a.dataset.id);if(w&&S.canWrite)openWish(w)}
  else if(act==='hm'){S.histMonth=shiftMonth(S.histMonth,+a.dataset.d);S.enterNext=true;render()}
  else if(act==='edit-tx'){const t=S.tx.find(x=>x.id===a.dataset.id);if(t&&S.canWrite){if(t.type==='income')openIncome(null,t);else if(t.type==='expense')openExpense(t)}}
  else if(act==='del-tx'){if(S.canWrite)deleteTx(a.dataset.id)}
  else if(act==='go-funds'){S.tab='funds';S.enterNext=true;render();window.scrollTo(0,0)}
  else if(act==='pay'){const f=fundById(a.dataset.id);if(f&&S.canWrite)openExpense(null,{fundId:f.id,amount:+a.dataset.amt||0})}
  else if(act==='ics')exportICS();
  else if(act==='export-csv')exportCSV();
  else if(act==='export-json')exportJSON();
  else if(act==='strat'){const k=a.dataset.k;if(STRATS[k]&&S.canWrite){if(S.household)S.household.debtStrategy=k;render();DB.setHousehold({debtStrategy:k})}}
  else if(act==='apply-strat'){if(S.canWrite){a.disabled=true;await applyStrategy(stratOf())}}
  else if(act==='debt-budget-edit'){S.debtEdit=true;render();setTimeout(()=>$('#dbIn')?.focus(),30)}
  else if(act==='debt-budget-save'){const n=Math.round(parseAmt($('#dbIn').value));if(!(n>0)){toast('Введите сумму больше нуля');return}S.debtEdit=false;if(S.household)S.household.debtBudget=n;render();DB.setHousehold({debtBudget:n});toast('Сумма на долги сохранена')}
  else if(act==='debt-budget-auto'){S.debtEdit=false;if(S.household)S.household.debtBudget=0;render();DB.setHousehold({debtBudget:0});toast('Сумма на долги считается автоматически')}
  else if(act==='cele-close')closeCelebration();
  else if(act==='cele-reward'){closeCelebration();if(S.canWrite)openWish(null)}
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(!$('#cele').hidden){closeCelebration();return}
  if(!$('#sheet').hidden)closeSheet();
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='dbIn'){e.preventDefault();document.querySelector('[data-act="debt-budget-save"]')?.click()}});

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

/* ---------- пошаговая настройка ----------
   Первый вход: 4 шага (доход → фонды → план → семья), потом подсказки на главной.
   «Пройти настройку заново» из меню: короткий режим, фонды не меняются. */
const KIND_SHORT={percent:'процент',monthly:'каждый месяц',reward:'награды',debt:'долг',goal:'цель',rest:'остаток'};
const WZ_KINDS={
  monthly:{t:'Платёж в месяц',e:'🔁',s:'Одна и та же сумма каждый месяц',
    why:'Для расходов, которые повторяются каждый месяц: жильё, еда, связь, кружки. Фонд забирает из доходов свою сумму и останавливается, остальное течёт дальше.',
    ex:'квартира 40 000 ₽. Первые 40 000 ₽ месяца уходят сюда, следующие идут в другие фонды.',
    ph:'В месяц',sfx:'₽',tpl:['Квартира или аренда','Ипотека','Коммуналка','Еда','Связь и интернет','Транспорт, бензин','Платёж по кредиту','Детский сад, кружки','Подписки','Лекарства']},
  percent:{t:'% с дохода',e:'📊',s:'Доля от каждого поступления',
    why:'С каждого поступления фонд берёт свой процент, сколько бы ни пришло. Удобно, когда доход плавает: заработали больше, больше и отложили.',
    ex:'инвестиции 10%. Пришло 200 000 ₽, и 20 000 ₽ сразу ушли в фонд.',
    ph:'С дохода',sfx:'%',tpl:['Инвестиции','Подушка безопасности','Образование','Благотворительность']},
  goal:{t:'Накопить сумму',e:'🎯',s:'Копит до нужной суммы',
    why:'Копит до нужной суммы и выключается. Как только цель собрана, деньги идут следующим фондам.',
    ex:'подушка 100 000 ₽. Наберётся за несколько месяцев и перестанет забирать деньги.',
    ph:'Цель',sfx:'₽',tpl:['Подушка безопасности','Отпуск','Переезд','Ремонт','Машина','Подарки']},
  debt:{t:'Погасить долг',e:'💳',s:'Гасит долг свободными деньгами',
    why:`Получает свободные деньги и гасит ими долг. Когда долг закрыт, фонд выключается, а семье положена награда: ${BONUS_PCT}% от суммы долга на что-то приятное.`,
    ex:'кредитка 60 000 ₽ под 30%. Укажите остаток и ставку, и план покажет, когда она закроется.',
    ph:'Остаток',sfx:'₽',tpl:['Кредитка','Потребкредит','Рассрочка','Долг другу','Долг за учёбу']}
};
const WZ_NAMES={income:'Доход',funds:'Фонды',plan:'План',invite:'Семья'};
function newWizard(mode){
  const income=+(S.household&&S.household.expectedIncome)?String(S.household.expectedIncome):'';
  if(mode!=='new') return {mode,step:0,income,wishes:[{name:'',price:''}],busy:false};
  return {mode,step:0,income,tax:{on:false,pct:'6'},
    funds:[{name:'Квартира или аренда',kind:'monthly',amount:'',rate:''}],
    kind:'monthly',reward:{on:true,pct:String(REWARD_DEFAULT)},strat:'avalanche',saved:false,sent:false,busy:false};
}
const wzSteps=()=>S.wz.mode==='new'?['income','funds','plan','invite']:['intro','income','queue','wishes','finish'];
const nA=x=>Math.round(parseAmt(x));
const wzValid=r=>r.name.trim()&&parseAmt(r.amount)>0;
function wzFunds(){
  const z=S.wz; if(z.mode!=='new') return activeFunds();
  const rows=z.funds.map((r,i)=>({r,i})).filter(({r})=>wzValid(r)); const of=k=>rows.filter(({r})=>r.kind===k);
  const L=[];
  if(z.tax.on&&parseAmt(z.tax.pct)>0) L.push({id:'d-tax',name:'Налоги',kind:'percent',value:parseAmt(z.tax.pct),taxOnly:true});
  of('percent').forEach(({r,i})=>L.push({id:'d-f'+i,name:r.name.trim(),kind:'percent',value:Math.min(100,parseAmt(r.amount))}));
  of('monthly').forEach(({r,i})=>L.push({id:'d-f'+i,name:r.name.trim(),kind:'monthly',value:nA(r.amount)}));
  if(z.reward.on&&parseAmt(z.reward.pct)>0) L.push({id:'d-rw',name:'Награды',kind:'reward',value:parseAmt(z.reward.pct)});
  of('goal').forEach(({r,i})=>L.push({id:'d-f'+i,name:r.name.trim(),kind:'goal',value:nA(r.amount)}));
  const debts=of('debt').map(({r,i})=>{const rate=Math.max(0,parseAmt(r.rate));return {f:{id:'d-f'+i,name:r.name.trim(),kind:'debt',value:nA(r.amount),rate,rateSet:String(r.rate||'').trim()!==''},bal:nA(r.amount),rate,min:0}});
  orderDebts(debts,z.strat).forEach(d=>L.push(d.f));
  L.push({id:'d-rest',name:'Накопления',kind:'rest',value:0});
  return L;
}
const wzDebts=()=>wzFunds().filter(f=>f.kind==='debt').map(f=>({f,bal:+f.value||0,rate:+f.rate||0,min:0}));
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
function splitHtml(M){
  if(!M.inc) return '<p class="note">Укажите доход семьи, чтобы увидеть разбивку.</p>';
  const rows=simSplit(M.funds,M.inc);
  const sub=(f,give)=>{const v=+f.value||0;
    if(f.kind==='percent') return f.taxOnly?`налог · ${nf.format(v)}%`:`${nf.format(v)}% с каждого дохода`;
    if(f.kind==='monthly') return 'каждый месяц';
    if(f.kind==='reward') return `награды · ${nf.format(v)}% сверх обязательных платежей`;
    if(f.kind==='rest') return 'всё, что осталось';
    const what=f.kind==='debt'?`долг ${fmt(v)}`:`цель ${fmt(v)}`;
    const k=M.eta[f.id]; const when=k!=null?(f.kind==='debt'?' · закроется ':' · наберётся ')+whenTxt(k):'';
    return what+(give?when:' · ждёт, пока заполнятся фонды выше');
  };
  return `<div class="list wz-split">${rows.map(({f,give})=>`<div class="srow k-${f.kind}">${fundIcon(f,'sm')}<div class="sb"><div class="row-main"><span class="name">${esc(f.name)}</span><span class="amt ${give?'':'muted'}">${fmt(give)}</span></div><div class="note">${esc(sub(f,give))}</div></div></div>`).join('')}</div>
    ${M.base<0?'<p class="err">Обязательные платежи больше дохода: проверьте суммы.</p>':''}`;
}

function wzRow(list,i,r,fields){
  return `<div class="wz-row" data-row="${list}-${i}">${fields.map(([key,ph,type])=>`<input data-wz-list="${list}" data-i="${i}" data-field="${key}" ${type==='num'?'inputmode="decimal"':type==='date'?'type="date"':''} placeholder="${ph}" value="${esc(r[key]||'')}" aria-label="${ph}" class="${type==='num'?'num':type==='date'?'date':''}">`).join('')}<button class="x sm" data-act="wz-del" data-list="${list}" data-i="${i}" aria-label="Удалить строку">${ic('x')}</button><div class="wz-eta note" data-eta="${list}-${i}"></div></div>`;
}
function wzFundRow(r,i){
  const K=WZ_KINDS[r.kind]||WZ_KINDS.monthly;
  return `<div class="wzf k-${r.kind}" data-row="funds-${i}">
    <span class="fi sm" data-emo="${i}" aria-hidden="true">${fundEmoji({name:r.name,kind:r.kind})}</span>
    <input class="wzf-name" data-wz-list="funds" data-i="${i}" data-field="name" placeholder="Название" value="${esc(r.name)}" aria-label="Название фонда">
    <button class="x sm" data-act="wz-del" data-list="funds" data-i="${i}" aria-label="Удалить «${esc(r.name||'фонд')}»">${ic('x')}</button>
    <select class="wzf-kind" data-wz-list="funds" data-i="${i}" data-field="kind" aria-label="Как фонд забирает деньги">${Object.entries(WZ_KINDS).map(([k,v])=>`<option value="${k}" ${r.kind===k?'selected':''}>${v.t}</option>`).join('')}</select>
    <label class="wzf-amt"><input class="num" data-wz-list="funds" data-i="${i}" data-field="amount" inputmode="decimal" placeholder="${K.ph}" value="${esc(r.amount)}" aria-label="${K.t}: ${K.ph.toLowerCase()}"><span class="sfx" aria-hidden="true">${K.sfx}</span></label>
    ${r.kind==='debt'?`<label class="wzf-rate"><span>Ставка, % годовых</span><input class="num" data-wz-list="funds" data-i="${i}" data-field="rate" inputmode="decimal" placeholder="если знаете" value="${esc(r.rate)}"></label>`:''}
    <div class="wz-eta note" data-eta="funds-${i}"></div>
  </div>`;
}
function wzBody(id){
  const z=S.wz, fresh=z.mode==='new';
  if(id==='intro') return `<h2 class="gate-h">Настройка заново</h2><p class="muted">Проверим доход семьи, посмотрим, как он делится по вашим фондам, и добавим желания. Фонды и записи не изменятся.</p>`;
  if(id==='income') return fresh?`<h2 class="gate-h">Сколько семья получает в месяц</h2>
    <p class="muted small">По доходу посчитаем, сколько остаётся после обязательных платежей и когда закроются цели и долги. Настройка займёт около трёх минут, всё можно поменять потом.</p>
    <div class="field"><label for="wzInc">Доход семьи в месяц, ₽</label><input class="big" id="wzInc" data-wz="income" inputmode="decimal" placeholder="Например, 300 000" value="${esc(z.income)}"></div>
    <div class="hint">Сложите все регулярные доходы: зарплаты, подработки, пособия. Если доход плавает, берите средний или чуть ниже: план с запасом надёжнее.</div>
    <label class="check"><input type="checkbox" data-wz="tax.on" ${z.tax.on?'checked':''}> Налог с дохода плачу сам (самозанятый, ИП)</label>
    <div class="field" id="wzTaxBox" ${z.tax.on?'':'hidden'}><label for="wzTaxPct">Ставка налога, %</label><input id="wzTaxPct" data-wz="tax.pct" inputmode="decimal" value="${esc(z.tax.pct)}"><span class="note">Налог будет сам откладываться в отдельный фонд с каждого дохода. С зарплаты налог уже удержал работодатель, для неё галочка не нужна.</span></div>`
    :`<h2 class="gate-h">Доход семьи</h2>
    <div class="hint">Сложите все регулярные доходы за месяц: зарплаты, подработки, пособия. Если доход плавает, берите средний или чуть ниже: план с запасом надёжнее.</div>
    <div class="field"><label for="wzInc">Сколько семья получает в месяц, ₽</label><input class="big" id="wzInc" data-wz="income" inputmode="decimal" placeholder="Например, 300 000" value="${esc(z.income)}"></div>`;
  if(id==='funds'){const K=WZ_KINDS[z.kind]; const used=new Set(z.funds.map(r=>r.name.trim()));
    return `<h2 class="gate-h">Фонды</h2>
    <p class="muted small">Фонд — это конверт под одну задачу: квартира, еда, подушка, кредитка. Каждый доход сам разложится по фондам, вам останется записывать траты.</p>
    <div class="eyebrow">Как фонд забирает деньги</div>
    <div class="kgrid" role="group" aria-label="Типы фондов">${Object.entries(WZ_KINDS).map(([k,v])=>`<button class="kcard k-${k}" data-act="wz-kind" data-k="${k}" aria-pressed="${z.kind===k}"><span class="kc-e" aria-hidden="true">${v.e}</span><b>${v.t}</b><span class="kc-s">${v.s}</span></button>`).join('')}</div>
    <div class="kmore k-${z.kind}"><p>${K.why}</p><p><b>Например,</b> ${K.ex}</p>
      <div class="chips">${K.tpl.filter(t=>!used.has(t)).map(t=>`<button class="chip-btn" data-act="wz-tpl" data-name="${esc(t)}">+ ${esc(t)}</button>`).join('')}<button class="chip-btn own" data-act="wz-add">+ Свой фонд</button></div></div>
    <div class="eyebrow">Ваши фонды${z.funds.length?` · ${z.funds.length}`:''}</div>
    <div class="wz-list">${z.funds.length?z.funds.map((r,i)=>wzFundRow(r,i)).join(''):'<p class="note">Пока пусто. Выберите тип выше и нажмите на подходящий шаблон.</p>'}</div>`;}
  if(id==='plan'){const nd=z.funds.filter(r=>r.kind==='debt'&&wzValid(r)).length;
    return `<h2 class="gate-h">Ваш план</h2>
    <p class="muted small">Так обычный месячный доход растечётся по фондам: сверху вниз, каждый берёт своё, остаток идёт дальше.</p>
    <div id="wzSum"></div>
    ${nd>=2?`<section class="block"><h2>Какой долг гасить первым</h2><div class="list strat" id="wzStrat"></div><p class="note" id="wzStratNote"></p></section>`:''}
    <section class="card rw"><label class="check"><input type="checkbox" data-wz="reward.on" ${z.reward.on?'checked':''}> <b>Откладывать на награды</b></label>
      <p class="note">Без радостей сложно долго держать режим экономии. Небольшая доля денег сверх обязательных платежей уходит на покупки для себя без чувства вины.</p>
      <div class="field" id="wzRwBox" ${z.reward.on?'':'hidden'}><label for="wzRw">Процент от денег сверх обязательных платежей</label><input id="wzRw" data-wz="reward.pct" inputmode="decimal" value="${esc(z.reward.pct)}"></div>
      <div class="note" id="wzRwLive"></div></section>
    <section class="block"><h2>Как растечётся доход</h2><div id="wzSplit"></div><p class="note">Порядок и суммы потом меняются во вкладке «Фонды».</p></section>`;}
  if(id==='invite'){const code=S.household&&S.household.inviteCode||'';
    return `<h2 class="gate-h">Пригласите семью</h2>
    <p class="muted small">Бюджет общий: доход или трату, которую внесёт один из вас, второй увидит сразу. Пересказывать, кто сколько потратил, больше не придётся.</p>
    ${code?`<div class="field"><span class="lbl">Код приглашения</span><div class="code" id="wzCode">${esc(code)}</div></div>
    <div class="btn-row"><button class="btn primary wide" data-act="wz-share">${ic('send')}Отправить приглашение</button><button class="btn ghost wide" data-act="wz-copy">${ic('copy')}Скопировать код</button></div>`
    :'<div class="hint">Код появится через пару секунд. Его всегда можно найти в меню ☰ → «Семья».</div>'}
    <div class="eyebrow">Что сделает второй человек</div>
    <div class="flow">${[['Откроет ссылку','она придёт вместе с кодом'],['Зарегистрируется','почта и пароль'],['Выберет «Присоединиться по коду»','и увидит ваш общий бюджет']].map(([a,b],i)=>`<div class="flow-step"><span class="flow-n">${i+1}</span><div><b>${a}</b><span class="note">${b}</span></div></div>`).join('')}</div>`;}
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
  const z=S.wz; const id=wzSteps()[z.step]; const M=wzMetrics(); const box=$('#wzLive'); const fresh=z.mode==='new';
  const setEta=(key,html)=>{const el=document.querySelector(`[data-eta="${key}"]`);if(el)el.innerHTML=html};
  let h='';
  if(id==='income'&&M.inc>0){
    if(!fresh) h=`<div class="live">После налога остаётся <b>${fmt(M.inc*(1-M.pct/100))}</b> в месяц.</div>`;
    else if(z.tax.on&&parseAmt(z.tax.pct)>0) h=`<div class="live">После налога остаётся <b>${fmt(M.inc*(1-parseAmt(z.tax.pct)/100))}</b> в месяц.</div>`;
  }
  if(id==='funds'){
    const tax=z.tax.on?parseAmt(z.tax.pct):0, otherPct=M.pct-tax;
    const parts=[tax>0?'налога':'',otherPct>0?'процентных фондов':'',M.monthly>0?'платежей':''].filter(Boolean);
    if(M.inc) h=`<div class="live ${M.base<0?'bad':''}">${M.monthly?`Платежи каждый месяц: <b>${fmt(M.monthly)}</b>.<br>`:''}${M.base>=0?`${parts.length?`После ${parts.join(', ').replace(/, ([^,]*)$/,' и $1')} остаётся`:'Свободно'} <b>${fmt(M.base)}</b> в месяц на цели, долги и накопления.`:`Платежи больше дохода на ${fmt(-M.base)}. Проверьте суммы или доход.`}</div>`;
    const after=M.inc*(1-M.pct/100);
    z.funds.forEach((r,i)=>{const v=parseAmt(r.amount); let t='';
      if(i===0&&z.funds.length===1&&!(v>0)) t='Впишите сумму. Не ваш случай — удалите крестиком и выберите шаблоны выше.';
      else if(v>0&&M.inc){const k=M.eta['d-f'+i];
        if(r.kind==='monthly'&&after>0) t=`${Math.round(v/M.inc*100)}% дохода`;
        else if(r.kind==='percent') t=v>100?'Процент должен быть не больше 100':`≈ ${fmt(M.inc*v/100)} с обычного месячного дохода`;
        else if(r.kind==='goal') t=`Наберётся ${whenTxt(k)}`;
        else if(r.kind==='debt') t=`Закроется ${whenTxt(k)} · награда ${fmt(v*BONUS_PCT/100)}`;
      }
      setEta('funds-'+i,esc(t));
    });
  }
  if(id==='plan'){
    const sumEl=$('#wzSum');
    if(sumEl){
      const debts=M.funds.filter(f=>f.kind==='debt'), goals=M.funds.filter(f=>f.kind==='goal');
      const tiles=[['Сверх обязательных платежей',M.base>0?fmt(M.base)+' в месяц':'0 ₽']];
      if(goals.length){const g=goals[0];tiles.push([g.name,M.eta[g.id]!=null?'наберётся '+whenTxt(M.eta[g.id]):'пока не копится'])}
      if(debts.length){const last=Math.max(...debts.map(d=>M.eta[d.id]??Infinity));tiles.push(['Без долгов',isFinite(last)?whenTxt(last):'когда появятся свободные деньги'])}
      else if(!goals.length) tiles.push(['В накопления',fmt(M.free)+' в месяц']);
      sumEl.innerHTML=M.inc?`<div class="wz-sum">${tiles.map(([k,v])=>`<div class="sr"><span class="k">${esc(k)}</span><b class="v">${esc(v)}</b></div>`).join('')}</div>`:'';
    }
    const sp=$('#wzSplit'); if(sp) sp.innerHTML=splitHtml(M);
    const st=$('#wzStrat');
    if(st){
      const list=wzDebts(), res={}; for(const k of Object.keys(STRATS)) res[k]=simulate(k,M.free,list);
      const ok=k=>!res[k].noBudget&&!res[k].stuck&&!res[k].none;
      const valid=Object.keys(STRATS).filter(ok); let best=null;
      if(valid.length>1){const mi=Math.min(...valid.map(k=>res[k].interest)),mx=Math.max(...valid.map(k=>res[k].interest));if(mx-mi>=100)best=valid.find(k=>res[k].interest===mi)}
      const desc={...Object.fromEntries(Object.entries(STRATS).map(([k,v])=>[k,v.desc])),custom:'В том порядке, в котором вы добавили долги.'};
      const first=k=>{const o=orderDebts(list,k)[0];return o?` Первым закроется «${o.f.name}».`:''};
      st.innerHTML=Object.keys(STRATS).map(k=>`<button class="strat-row" data-act="wz-strat" data-k="${k}" aria-pressed="${k===z.strat}"><span class="sn">${STRATS[k].name}${best===k?' <span class="chip v-good">выгоднее всего</span>':''}</span><span class="sv">${ok(k)&&res[k].interest>=1?`переплата ≈ ${fmt(res[k].interest)}`:''}</span><span class="sd">${esc(desc[k]+first(k))}</span></button>`).join('');
      const noRate=list.filter(d=>!d.f.rateSet).length;
      const nt=$('#wzStratNote'); if(nt) nt.textContent=noRate?`У ${noRate} ${plural(noRate,'долга','долгов','долгов')} не указана ставка, поэтому переплата посчитана неточно. Ставку можно вписать на прошлом шаге или позже, нажав на долг.`:'';
    }
    const rw=$('#wzRwLive'); if(rw) rw.innerHTML=z.reward.on&&M.perReward>0?`Это около <b>${fmt(M.perReward)}</b> в месяц.`:'';
  }
  if(id==='wishes'){
    h=M.perReward>0?`<div class="live">В фонд наград пойдёт около <b>${fmt(M.perReward)}</b> в месяц.</div>`:`<div class="live">Сроки по желаниям считаются по фонду наград. Включите его из карточки любого желания на главной.</div>`;
    let acc=0; z.wishes.forEach((r,i)=>{const p=nA(r.price);if(!(p>0)||!M.perReward){setEta('wishes-'+i,'');return}acc+=p;const k=Math.ceil(acc/M.perReward);setEta('wishes-'+i,`Можно купить ${whenTxt(k)} из фонда наград`)});
  }
  if(id==='queue'||id==='finish'){
    const el=$('#wzSplit'); if(el) el.innerHTML=splitHtml(M);
    if(id==='finish'){const n=S.wz.wishes.filter(r=>r.name.trim()&&nA(r.price)>0).length;h=n?`<div class="live">Желаний в списке: ${n}. Сроки по ним появятся на главной.</div>`:''}
  }
  if(box) box.innerHTML=h;
}
function drawWizard(anim=true){
  const z=S.wz; const steps=wzSteps(); const id=steps[z.step]; const main=$('#main'); const fresh=z.mode==='new';
  const last=z.step===steps.length-1;
  main.dataset.view='setup';
  let foot;
  if(id==='invite') foot=`<span></span><button class="btn ${z.sent?'primary':'ghost'}" data-act="wz-finish">${z.sent?'Готово, в приложение':'Пригласить позже'}</button>`;
  else foot=`${z.step>0?'<button class="btn ghost" data-act="wz-back">Назад</button>':'<span></span>'}<button class="btn primary" data-act="wz-next" ${z.busy?'disabled':''}>${id==='intro'?'Начать':id==='plan'?(z.busy?'Сохраняем…':'Всё верно, дальше'):last?'Начать пользоваться':'Дальше'}</button>`;
  main.innerHTML=`<section class="wz">
    <div class="wz-top"><span class="eyebrow">Шаг ${z.step+1} из ${steps.length}${fresh?` · ${WZ_NAMES[id]}`:''}</span><div class="wz-prog"><i style="width:${((z.step+1)/steps.length*100).toFixed(1)}%"></i></div></div>
    <div class="wz-body">${wzBody(id)}</div>
    <div id="wzLive"></div>
    <div class="err" id="wzErr"></div>
    <div class="wz-foot">${foot}</div>
    ${z.step===0?`<div class="gate-links"><button class="link" data-act="wz-skip">${fresh?'Пропустить, настрою сам':'Закрыть'}</button></div>`:''}
  </section>`;
  if(anim){main.classList.remove('enter');void main.offsetWidth;main.classList.add('enter')}
  wzLive();
}
function wzSet(path,val){const z=S.wz;const p=path.split('.');if(p.length===2)z[p[0]][p[1]]=val;else z[p[0]]=val}
document.addEventListener('input',e=>{
  if(S.status!=='setup'||!S.wz)return; const t=e.target;
  if(t.dataset.wz){wzSet(t.dataset.wz,t.type==='checkbox'?t.checked:t.value);
    if(t.dataset.wz==='tax.on'){const b=$('#wzTaxBox');if(b)b.hidden=!t.checked}
    if(t.dataset.wz==='reward.on'){const b=$('#wzRwBox');if(b)b.hidden=!t.checked}
    wzLive();return}
  if(t.dataset.wzList){const row=S.wz[t.dataset.wzList][+t.dataset.i]; row[t.dataset.field]=t.value;
    if(t.dataset.field==='kind'){S.wz.kind=t.value;drawWizard(false);return}
    if(t.dataset.wzList==='funds'&&t.dataset.field==='name'){const em=document.querySelector(`[data-emo="${t.dataset.i}"]`);if(em)em.textContent=fundEmoji({name:row.name,kind:row.kind})}
    wzLive()}
});
document.addEventListener('focusout',e=>{
  if(S.status!=='setup'||!S.wz)return; const t=e.target;
  const isAmt=t.id==='wzInc'||(t.dataset.wzList==='funds'&&t.dataset.field==='amount'&&S.wz.funds[+t.dataset.i]?.kind!=='percent');
  if(!isAmt)return; const n=parseAmt(t.value); if(n>0){t.value=nf.format(n);if(t.id==='wzInc')S.wz.income=t.value;else S.wz.funds[+t.dataset.i].amount=t.value}
});
function inviteText(code){const url=location.origin+location.pathname;return `Присоединяйся к нашему семейному бюджету в «Потоке». Открой ${url}, зарегистрируйся, выбери «Присоединиться по коду» и введи код ${code}`}
async function copyText(t,okMsg){try{await navigator.clipboard.writeText(t);toast(okMsg);return true}catch(e){toast('Не получилось скопировать. Выделите код и скопируйте вручную.');return false}}
async function shareInvite(code){
  if(!code) return false; const text=inviteText(code);
  if(navigator.share){try{await navigator.share({title:'Поток: семейный бюджет',text});return true}catch(e){if(e&&e.name==='AbortError')return false}}
  return copyText(text,'Приглашение скопировано, отправьте его в мессенджере');
}
async function wzAction(act,a){
  const z=S.wz; if(!z) return false; const steps=wzSteps(); const id=steps[z.step]; const fresh=z.mode==='new';
  const focusLast=(sel)=>{const r=document.querySelectorAll(sel);r[r.length-1]?.focus()};
  if(act==='wz-kind'){z.kind=a.dataset.k;drawWizard(false);return true}
  if(act==='wz-add'){
    if(fresh&&id==='funds'){z.funds.push({name:'',kind:z.kind,amount:'',rate:''});drawWizard(false);focusLast('[data-wz-list="funds"][data-field="name"]');return true}
    const L=a.dataset.list;z[L].push({name:'',price:''});drawWizard(false);focusLast(`[data-wz-list="${L}"][data-field="name"]`);return true}
  if(act==='wz-del'){z[a.dataset.list].splice(+a.dataset.i,1);drawWizard(false);return true}
  if(act==='wz-tpl'){z.funds.push({name:a.dataset.name,kind:z.kind,amount:'',rate:''});drawWizard(false);focusLast('[data-wz-list="funds"][data-field="amount"]');return true}
  if(act==='wz-strat'){if(STRATS[a.dataset.k]){z.strat=a.dataset.k;wzLive()}return true}
  if(act==='wz-share'){const ok=await shareInvite(S.household&&S.household.inviteCode);if(ok&&S.wz){S.wz.sent=true;drawWizard(false)}return true}
  if(act==='wz-copy'){const c=S.household&&S.household.inviteCode;if(c&&await copyText(c,'Код скопирован')&&S.wz){S.wz.sent=true;drawWizard(false)}return true}
  if(act==='wz-finish'){S.wz=null;S.status='ready';S.tab='now';S.enterNext=true;render();window.scrollTo(0,0);return true}
  if(act==='wz-back'){if(z.saved&&id==='invite')return true;z.step=Math.max(0,z.step-1);drawWizard();window.scrollTo(0,0);return true}
  if(act==='wz-skip'){
    if(fresh) DB.setHousehold({setupDone:true});
    S.wz=null;S.status='ready';S.enterNext=true;render();return true}
  if(act==='wz-next'){
    const err=t=>{$('#wzErr').textContent=t;return true};
    if(id==='income'&&!(nA(z.income)>0)) return err('Укажите доход семьи в месяц, по нему строится весь план.');
    if(id==='income'&&fresh&&z.tax.on&&!(parseAmt(z.tax.pct)>0&&parseAmt(z.tax.pct)<100)) return err('Укажите ставку налога, например 6.');
    if(id==='funds'){
      const noAmt=z.funds.find(r=>r.name.trim()&&!(parseAmt(r.amount)>0)); if(noAmt) return err(`Укажите сумму для «${noAmt.name.trim()}» или удалите его.`);
      if(z.funds.some(r=>!r.name.trim()&&parseAmt(r.amount)>0)) return err('У одного из фондов нет названия.');
      const badP=z.funds.find(r=>r.kind==='percent'&&parseAmt(r.amount)>100); if(badP) return err(`У «${badP.name.trim()}» процент больше 100.`);
      const badR=z.funds.find(r=>r.kind==='debt'&&(parseAmt(r.rate)<0||parseAmt(r.rate)>200)); if(badR) return err(`Ставка у «${badR.name.trim()}» выглядит странно: укажите процент годовых, например 29,9.`);
      if(!z.funds.some(wzValid)) return err('Добавьте хотя бы один фонд, например квартиру или еду.');
      z.funds=z.funds.filter(r=>r.name.trim()||parseAmt(r.amount)>0);
      if(!z.funds.some(r=>r.kind==='debt')||z.funds.filter(r=>r.kind==='debt').length<2) z.strat=z.funds.some(r=>r.kind==='debt'&&String(r.rate||'').trim())?'avalanche':'custom';
    }
    if(id==='plan'&&z.reward.on&&!(parseAmt(z.reward.pct)>0&&parseAmt(z.reward.pct)<=100)) return err('Процент на награды должен быть от 1 до 100. Или снимите галочку.');
    if(fresh&&id==='plan'){
      z.busy=true;drawWizard(false);
      try{
        const at=Date.now();
        await DB.setHousehold({expectedIncome:nA(z.income),setupDone:true,debtStrategy:z.strat});
        if(S.household){S.household.expectedIncome=nA(z.income);S.household.setupDone=true;S.household.debtStrategy=z.strat}
        wzFunds().forEach((f,i)=>DB.add('funds',{name:f.name,kind:f.kind,value:f.value,icon:'',start:0,taxOnly:!!f.taxOnly,deadline:'',cap:0,payDay:0,
          rate:f.kind==='debt'?Math.round((+f.rate||0)*100)/100:0,rateSet:f.kind==='debt'&&!!f.rateSet,minPay:0,order:i+1,createdAt:at+i}));
        z.busy=false;z.saved=true;z.step++;drawWizard();window.scrollTo(0,0);toast('План сохранён');
      }catch(e){z.busy=false;drawWizard(false);$('#wzErr').textContent='Не получилось сохранить. Проверьте интернет и попробуйте ещё раз.'}
      return true;
    }
    if(z.step<steps.length-1){z.step++;drawWizard();window.scrollTo(0,0);return true}
    // короткий режим «заново»: сохраняем доход и желания
    z.busy=true;drawWizard(false);
    try{
      const at=Date.now();
      await DB.setHousehold({expectedIncome:nA(z.income),setupDone:true});
      if(S.household){S.household.expectedIncome=nA(z.income);S.household.setupDone=true}
      z.wishes.filter(r=>r.name.trim()&&nA(r.price)>0).forEach((r,i)=>DB.add('wishes',{name:r.name.trim(),price:nA(r.price),fundId:'',by:S.uid||null,createdAt:at+100+i}));
      S.wz=null;S.status='ready';S.tab='now';S.enterNext=true;render();window.scrollTo(0,0);toast('Бюджет настроен');
    }catch(err){z.busy=false;drawWizard(false);$('#wzErr').textContent='Не получилось сохранить. Проверьте интернет и попробуйте ещё раз.'}
    return true;
  }
  return false;
}

/* ---------- подсказки на главной ----------
   Показываются один раз на устройстве: после настройки, тому, кто вошёл по коду,
   и всем, кто уже пользуется. Повтор: меню ☰ → «Показать подсказки». */
const TOUR=[
  {sel:'main .hero',t:'Главное за месяц',d:'Сколько ещё нужно заработать, чтобы закрыть все платежи по плану. Кольцо показывает, на сколько план уже выполнен.'},
  {sel:'main [data-act="open-income"]',t:'Пришли деньги',d:'Зарплата, подработка, пособие: жмите сюда. Деньги сами разложатся по фондам в порядке очереди.'},
  {sel:'main [data-act="open-expense"]',t:'Потратили',d:'Запишите трату и выберите фонд, из которого ушли деньги. Остаток в фонде пересчитается сам.'},
  {sel:'main [data-act="new-wish"]',t:'Хочу купить',d:'Добавьте желание, и приложение подскажет, когда покупка не помешает плану.'},
  {sel:'nav.tabs .wrap',t:'Разделы',d:'«Фонды» — очередь и настройки фондов. «Долги» — план погашения и стратегия. «История» — все записи по месяцам.'},
  {sel:'#setBtn',t:'Меню',d:'Код приглашения для семьи, обычный доход, тема и напоминания о платежах в календарь телефона.'}
];
const tourKey=()=>'ff-tour:'+(S.uid||'');
let TR=null, tourWait=false;
function maybeTour(){
  if(TR||tourWait||S.status!=='ready'||S.tab!=='now'||!activeFunds().length||LS.get(tourKey())) return;
  tourWait=true;
  const go=()=>{
    if(S.status!=='ready'||S.tab!=='now'||LS.get(tourKey())||TR){tourWait=false;return}
    if(document.getElementById('splash')||!$('#sheet').hidden||!$('#cele').hidden){setTimeout(go,500);return}
    tourWait=false; startTour();
  };
  setTimeout(go,900);
}
const visible=el=>el&&el.getClientRects().length>0;
function startTour(){
  const steps=TOUR.filter(s=>visible(document.querySelector(s.sel)));
  if(!steps.length) return;
  TR={steps,i:0,back:document.activeElement};
  const el=document.createElement('div'); el.id='tour'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); el.setAttribute('aria-labelledby','tourT');
  el.innerHTML='<div class="tr-hole noanim"></div><div class="tr-tip"><span class="tr-arrow"></span><div class="tr-in"></div></div>';
  document.body.appendChild(el);
  tourShow();
}
function tourShow(){
  const st=TR.steps[TR.i]; const target=document.querySelector(st.sel);
  if(!visible(target)){tourNext();return}
  const n=TR.steps.length, last=TR.i===n-1;
  $('#tour .tr-in').innerHTML=`<div class="eyebrow">${TR.i+1} из ${n}</div><h3 id="tourT">${esc(st.t)}</h3><p>${esc(st.d)}</p><div class="tr-btns">${last?'<span></span>':'<button class="link" data-tour="skip">Пропустить</button>'}<button class="btn primary sm" data-tour="next">${last?'Понятно':'Дальше'}</button></div>`;
  const tip=$('#tour .tr-tip'); tip.classList.remove('show');
  const fixed=!!target.closest('nav.tabs,header.top');
  if(!fixed){const r=target.getBoundingClientRect();const top=$('header.top').getBoundingClientRect().bottom;const bottom=innerHeight-($('nav.tabs').getBoundingClientRect().height||0);
    if(r.top<top+12||r.bottom>bottom-12-180) target.scrollIntoView({block:'center',behavior:calm()?'auto':'smooth'})}
  setTimeout(()=>{if(!TR)return;tourPlace();tip.classList.add('show');$('#tour [data-tour="next"]')?.focus({preventScroll:true})},fixed||calm()?30:380);
}
function tourPlace(){
  if(!TR) return; const st=TR.steps[TR.i]; const target=document.querySelector(st.sel); if(!visible(target)) return;
  const r=target.getBoundingClientRect(), pad=6, hole=$('#tour .tr-hole'), tip=$('#tour .tr-tip');
  const rad=parseFloat(getComputedStyle(target).borderTopLeftRadius)||12;
  Object.assign(hole.style,{left:(r.left-pad)+'px',top:(r.top-pad)+'px',width:(r.width+pad*2)+'px',height:(r.height+pad*2)+'px',borderRadius:(rad+pad)+'px'});
  if(hole.classList.contains('noanim'))requestAnimationFrame(()=>requestAnimationFrame(()=>hole.classList.remove('noanim')));
  const W=Math.min(340,innerWidth-32); tip.style.width=W+'px';
  const H=tip.offsetHeight; const cx=r.left+r.width/2;
  const left=Math.max(16,Math.min(innerWidth-16-W,cx-W/2));
  const below=innerHeight-r.bottom-pad, above=r.top-pad;
  const down=below>=H+20||below>=above;
  tip.style.left=left+'px'; tip.style.top=(down?r.bottom+pad+12:r.top-pad-12-H)+'px';
  tip.classList.toggle('up',!down);
  tip.querySelector('.tr-arrow').style.left=Math.max(18,Math.min(W-18,cx-left))+'px';
}
function tourNext(){if(!TR)return;TR.i++;if(TR.i>=TR.steps.length){tourEnd();return}tourShow()}
function tourEnd(){LS.set(tourKey(),'1');const back=TR&&TR.back;$('#tour')?.remove();TR=null;window.scrollTo({top:0,behavior:calm()?'auto':'smooth'});if(back&&back.focus)try{back.focus({preventScroll:true})}catch(e){}}
let tourRaf=0; const tourRe=()=>{if(!TR)return;cancelAnimationFrame(tourRaf);tourRaf=requestAnimationFrame(tourPlace)};
addEventListener('resize',tourRe); addEventListener('scroll',tourRe,{passive:true});
document.addEventListener('click',e=>{
  if(!TR||!e.target.closest('#tour'))return; e.preventDefault(); e.stopImmediatePropagation();
  const b=e.target.closest('[data-tour]'); if(b&&b.dataset.tour==='skip'){tourEnd();return}
  if(b||!e.target.closest('.tr-tip')) tourNext();
},true);
document.addEventListener('keydown',e=>{if(!TR)return;if(e.key==='Escape'){e.stopImmediatePropagation();tourEnd()}else if(e.key==='ArrowRight'){tourNext()}},true);

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
  <div class="btn-row"><button class="btn primary wide" id="sShare">${ic('send')}Отправить приглашение</button><button class="btn ghost" id="sCopy">Скопировать</button><button class="btn ghost" id="sNew">Новый код</button></div></div>
  <div class="field"><label>Участники</label><div class="list">${ids.map(id=>`<div class="row"><div class="row-main"><span class="name">${esc(S.members[id]||'Без имени')}</span><span class="note">${id===S.uid?'вы':''}</span></div></div>`).join('')}</div></div>
  <div class="field"><label for="sName">Ваше имя</label><input id="sName" data-nofocus="1" value="${esc(S.members[S.uid]||S.myName||'')}"></div>
  <button class="btn ghost" id="sSaveName">Сохранить имя</button>
  <div class="field"><label for="sInc">Обычный доход семьи в месяц, ₽</label><input id="sInc" inputmode="decimal" value="${S.household&&+S.household.expectedIncome?nf.format(S.household.expectedIncome):''}"><span class="note">По нему считается, на сколько покупки сдвигают закрытие долгов и когда накопится цель.</span></div>
  <button class="btn ghost" id="sSaveInc">Сохранить доход</button>
  <div class="field"><span class="lbl">Тема</span><div class="seg three">${[['auto','monitor-smartphone','Авто'],['light','sun','Светлая'],['dark','moon','Тёмная']].map(([k,i,l])=>`<button type="button" data-theme-set="${k}" aria-pressed="${curTheme()===k}">${ic(i)}${l}</button>`).join('')}</div><span class="note">«Авто» следует за настройкой телефона.</span></div>
  <div class="field"><span class="lbl">Напоминания</span><button class="btn ghost" data-act="ics">${ic('calendar-plus')}Платежи в календарь телефона</button><span class="note">Каждый платёж с указанным днём станет ежемесячным событием с напоминанием накануне. Если поменяете дни или суммы, добавьте файл заново.</span></div>
  <div class="field"><span class="lbl">Данные</span><div class="btn-row"><button class="btn ghost" data-act="export-csv">${ic('file-spreadsheet')}Записи в CSV</button><button class="btn ghost" data-act="export-json">${ic('file-braces')}Копия JSON</button></div><span class="note">CSV открывается в Excel и Google Таблицах. JSON — полная копия бюджета на случай сбоя или переезда.</span></div>
  <button class="btn ghost" data-act="tour">${ic('lightbulb')}Показать подсказки</button>
  <button class="btn ghost" data-act="wz-restart">Пройти настройку заново</button>
  <div class="err" id="sErr"></div>
  <button class="btn danger" data-act="logout">Выйти из аккаунта</button>`,()=>{
    $('#sShare').addEventListener('click',()=>shareInvite($('#sCode').textContent.trim()));
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

document.querySelectorAll('[data-ic]').forEach(el=>{el.outerHTML=ic(el.dataset.ic)});
$('#setBtn').innerHTML=ic('menu');
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
