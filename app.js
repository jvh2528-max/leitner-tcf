const DB_NAME='leitner_tcf_db';
const DB_VERSION=1;
const STORE='cards';
const intervals={1:1,2:2,3:4,4:7,5:15};
let db, reviewQueue=[], reviewIndex=0, answerVisible=false;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains(STORE)){
        const s=d.createObjectStore(STORE,{keyPath:'id'});
        s.createIndex('box','box',{unique:false});
        s.createIndex('nextReview','nextReview',{unique:false});
      }
    };
    req.onsuccess=e=>{db=e.target.result;resolve(db)};
    req.onerror=()=>reject(req.error);
  });
}
function store(mode='readonly'){return db.transaction(STORE,mode).objectStore(STORE)}
function getAllCards(){return new Promise((res,rej)=>{const r=store().getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function putCard(card){return new Promise((res,rej)=>{const r=store('readwrite').put(card);r.onsuccess=()=>res(card);r.onerror=()=>rej(r.error)})}
function deleteCard(id){return new Promise((res,rej)=>{const r=store('readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function dateOnly(d=new Date()){const x=new Date(d);x.setHours(0,0,0,0);return x}
function addDays(date,days){const d=new Date(date);d.setDate(d.getDate()+days);d.setHours(0,0,0,0);return d.toISOString()}
function isDue(card){return new Date(card.nextReview)<=new Date()}
function formatDateCA(dateValue){
  const d = new Date(dateValue);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1600);
}

function switchPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
}

async function refresh(){
  const cards=await getAllCards();
  const due=cards.filter(isDue);
  const reviewedToday=cards.filter(c=>c.lastReviewed && dateOnly(c.lastReviewed).getTime()===dateOnly().getTime());

  document.getElementById('dueCount').textContent=due.length;
  document.getElementById('totalCount').textContent=`${cards.length} کارت`;
  document.getElementById('streakCount').textContent=reviewedToday.length;

  const names=['','تازه‌ها','در حال یادگیری','رو به پیشرفت','نزدیک تسلط','تسلط'];
  const nextLabels={1:'امروز',2:'۲ روز دیگر',3:'۴ روز دیگر',4:'۷ روز دیگر',5:'۱۵ روز دیگر'};

  const boxes=document.getElementById('boxes'); boxes.innerHTML='';
  for(let b=1;b<=5;b++){
    const list=cards.filter(c=>c.box===b), d=list.filter(isDue).length;
    const el=document.createElement('button');
    el.className=`box-row b${b}`;
    el.innerHTML=`
      <div class="box-badge">${b}</div>
      <div class="box-main">
        <div class="box-title">${names[b]}</div>
        <div class="box-meta">${list.length} کارت</div>
      </div>
      <div class="box-side">
        <div class="lbl">مرور بعدی</div>
        <div class="cal">▣</div>
        <div class="val">${d>0?'امروز':nextLabels[b]}</div>
      </div>`;
    el.onclick=()=>openCards(b);
    boxes.appendChild(el);
  }

  // Review page
  document.getElementById('reviewDueCount').textContent = due.length;
  document.getElementById('reviewedTodayCount').textContent = reviewedToday.length;
  document.getElementById('todayDateLabel').textContent = formatDateCA(new Date());
  document.getElementById('reviewSummaryText').textContent = due.length
    ? `امروز ${due.length} کارت آماده مرور داری.`
    : 'فعلاً کارتی برای مرور نداری.';

  const reviewBoxesList = document.getElementById('reviewBoxesList');
  reviewBoxesList.innerHTML = '';
  for(let b=1;b<=5;b++){
    const dueInBox = cards.filter(c=>c.box===b && isDue(c)).length;
    const row=document.createElement('div');
    row.className='review-row';
    row.innerHTML = `
      <div>
        <div class="row-title">خانه ${b}</div>
        <div class="row-meta">${names[b]}</div>
      </div>
      <div class="row-right">
        <div class="count-pill">${dueInBox}</div>
        <button ${dueInBox===0?'disabled':''}>مرور</button>
      </div>
    `;
    if(dueInBox>0){
      row.querySelector('button').onclick=()=>startReview(b);
    } else {
      row.querySelector('button').style.opacity='.45';
    }
    reviewBoxesList.appendChild(row);
  }

  const upcomingList = document.getElementById('upcomingList');
  upcomingList.innerHTML = '';
  const upcoming = cards.filter(c=>!isDue(c)).sort((a,b)=>new Date(a.nextReview)-new Date(b.nextReview)).slice(0,5);
  if(!upcoming.length){
    upcomingList.innerHTML = '<div class="upcoming-row"><div class="row-title">آیتمی وجود ندارد</div></div>';
  } else {
    upcoming.forEach(c=>{
      const row=document.createElement('div');
      row.className='upcoming-row';
      row.innerHTML = `
        <div>
          <div class="row-title">${escapeHtml(c.back)}</div>
          <div class="row-meta">${escapeHtml(c.front)}</div>
        </div>
        <div class="count-pill">${formatDateCA(c.nextReview)}</div>
      `;
      upcomingList.appendChild(row);
    });
  }

  // Stats page
  const total = cards.length;
  const mastered = cards.filter(c=>c.box===5).length;
  const correct = cards.reduce((n,c)=>n+(c.correctCount||0),0);
  const wrong = cards.reduce((n,c)=>n+(c.wrongCount||0),0);
  const success = correct+wrong ? Math.round((correct/(correct+wrong))*100) : 0;

  document.getElementById('statsTotal').textContent = total;
  document.getElementById('statsMastered').textContent = mastered;
  document.getElementById('statsCorrect').textContent = correct;
  document.getElementById('statsWrong').textContent = wrong;
  document.getElementById('statsReviewedToday').textContent = reviewedToday.length;
  document.getElementById('statsSuccess').textContent = `${success}%`;

  const statsBoxes = document.getElementById('statsBoxes');
  statsBoxes.innerHTML = '';
  for(let b=1;b<=5;b++){
    const count = cards.filter(c=>c.box===b).length;
    const row = document.createElement('div');
    row.className='stats-row';
    row.innerHTML = `
      <div class="row-title">خانه ${b}</div>
      <div class="count-pill">${count}</div>
    `;
    statsBoxes.appendChild(row);
  }

  const masteryPercent = total ? Math.round((mastered/total)*100) : 0;
  document.getElementById('masteryPercent').textContent = `${masteryPercent}%`;
  document.getElementById('masteryBar').style.width = `${masteryPercent}%`;
}

async function addCard(){
  const back=document.getElementById('backInput').value.trim();
  const front=document.getElementById('frontInput').value.trim();
  if(!front||!back)return false;
  const now=new Date().toISOString();
  await putCard({
    id:crypto.randomUUID(), front, back,
    example:document.getElementById('exampleInput').value.trim(),
    topic:document.getElementById('topicInput').value.trim(),
    box:1, createdAt:now, updatedAt:now, lastReviewed:null,
    nextReview:dateOnly().toISOString(), correctCount:0, wrongCount:0
  });
  document.getElementById('addForm').reset();
  toast('کارت به خانه ۱ اضافه شد');
  await refresh();
  return true;
}

async function startReview(boxFilter=null){
  let cards=(await getAllCards()).filter(isDue);
  if(boxFilter) cards=cards.filter(c=>c.box===boxFilter);
  reviewQueue=cards.sort((a,b)=>new Date(a.nextReview)-new Date(b.nextReview));
  reviewIndex=0;
  if(!reviewQueue.length){toast('کارت آماده مرور نداری');return}
  document.getElementById('reviewDialog').showModal();
  renderReview();
}

function renderReview(){
  if(reviewIndex>=reviewQueue.length){
    document.getElementById('reviewDialog').close();
    toast('مرور امروز تمام شد 🎉');
    refresh();
    return;
  }
  answerVisible=false;
  const c=reviewQueue[reviewIndex];
  document.getElementById('reviewProgress').textContent=`${reviewIndex+1} / ${reviewQueue.length}`;
  document.getElementById('currentBoxBadge').textContent=`خانه ${c.box}`;
  document.getElementById('reviewTopic').textContent=c.topic||'';
  document.getElementById('reviewBack').textContent=c.back;
  document.getElementById('reviewFront').textContent=c.front;
  document.getElementById('reviewExample').textContent=c.example||'';
  document.getElementById('answerArea').classList.add('hidden');
  document.getElementById('gradeControls').classList.add('hidden');
  document.getElementById('revealControls').classList.remove('hidden');
  document.getElementById('tapHint').classList.remove('hidden');
}
function reveal(){
  if(answerVisible)return;
  answerVisible=true;
  document.getElementById('answerArea').classList.remove('hidden');
  document.getElementById('gradeControls').classList.remove('hidden');
  document.getElementById('revealControls').classList.add('hidden');
  document.getElementById('tapHint').classList.add('hidden');
}
async function grade(known){
  const c={...reviewQueue[reviewIndex]}, oldBox=c.box;
  c.lastReviewed=new Date().toISOString();
  c.updatedAt=c.lastReviewed;
  if(known){c.correctCount=(c.correctCount||0)+1;c.box=Math.min(5,c.box+1)}
  else{c.wrongCount=(c.wrongCount||0)+1;c.box=1}
  c.nextReview=addDays(new Date(), intervals[c.box]);
  await putCard(c);
  toast(known ? (oldBox===5 ? 'در خانه ۵ ماند ✅' : `رفت خانه ${c.box} ✅`) : 'برگشت خانه ۱ ↩');
  reviewIndex++;
  renderReview();
}

async function openCards(boxFilter=null){
  const cards=await getAllCards();
  const list=boxFilter?cards.filter(c=>c.box===boxFilter):cards;
  document.getElementById('cardsTitle').textContent=boxFilter?`کارت‌های خانه ${boxFilter}`:'همه کارت‌ها';
  const wrap=document.getElementById('cardsList');wrap.innerHTML='';
  if(!list.length) wrap.innerHTML='<p style="color:#72798b">کارتی وجود ندارد.</p>';

  list.sort((a,b)=>a.box-b.box||a.front.localeCompare(b.front)).forEach(c=>{
    const div=document.createElement('div');div.className='list-card';
    div.innerHTML=`
      <div class="meta">خانه ${c.box} · مرور بعدی: ${formatDateCA(c.nextReview)}</div>
      <div class="fa-side">${escapeHtml(c.back)}</div>
      <div class="fr-side">${escapeHtml(c.front)}</div>
      <div class="list-actions">
        <button class="small-btn" data-review="${c.id}">مرور همین کارت</button>
        <button class="small-btn" data-delete="${c.id}">حذف</button>
      </div>`;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll('[data-review]').forEach(btn=>btn.onclick=async()=>{
    const c=(await getAllCards()).find(x=>x.id===btn.dataset.review);
    reviewQueue=[c];reviewIndex=0;
    document.getElementById('cardsDialog').close();
    document.getElementById('reviewDialog').showModal();
    renderReview();
  });
  wrap.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{
    if(confirm('این کارت حذف شود؟')){
      await deleteCard(btn.dataset.delete);
      await refresh();
      openCards(boxFilter);
    }
  });
  document.getElementById('cardsDialog').showModal();
}

function escapeHtml(s=''){
  return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
async function backup(){
  const cards=await getAllCards();
  const payload={app:'Leitner TCF',schemaVersion:1,exportedAt:new Date().toISOString(),cards};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`leitner-tcf-backup-${formatDateCA(new Date())}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}
async function restore(file){
  try{
    const obj=JSON.parse(await file.text());
    if(!Array.isArray(obj.cards)) throw new Error('invalid');
    for(const c of obj.cards) await putCard(c);
    toast(`${obj.cards.length} کارت بازیابی شد`);
    await refresh();
  }catch{
    alert('فایل پشتیبان معتبر نیست.');
  }
}

document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.onclick=()=>switchPage(btn.dataset.page);
});
document.getElementById('addCardBtn').onclick=()=>document.getElementById('addDialog').showModal();
document.getElementById('saveCardBtn').onclick=async e=>{e.preventDefault(); if(await addCard()) document.getElementById('addDialog').close()};
document.getElementById('startReviewBtn').onclick=()=>startReview();
document.getElementById('reviewPageStartBtn').onclick=()=>startReview();
document.getElementById('revealBtn').onclick=reveal;
document.getElementById('reviewCard').onclick=reveal;
document.getElementById('knowBtn').onclick=()=>grade(true);
document.getElementById('dontKnowBtn').onclick=()=>grade(false);
document.getElementById('closeReviewBtn').onclick=()=>document.getElementById('reviewDialog').close();
document.getElementById('allCardsBtn').onclick=()=>openCards();
document.getElementById('closeCardsBtn').onclick=()=>document.getElementById('cardsDialog').close();
document.getElementById('backupBtn').onclick=backup;
document.getElementById('restoreInput').onchange=e=>{if(e.target.files[0]) restore(e.target.files[0]); e.target.value='';};

(async()=>{
  await openDB();
  await refresh();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
