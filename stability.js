/* Durable client state, authenticated conversations and safe release updates. */
(() => {
 'use strict';
 const account=String(user?.id||'guest'),key=name=>'anis-stable:'+account+':'+name;
 const state=window.anisStability={activeChatId:localStorage.getItem(key('thread'))||'legacy',threads:[],restoring:true,uploading:0,region:null};
 const read=(name,fallback)=>{try{return JSON.parse(localStorage.getItem(key(name)))??fallback;}catch{return fallback;}};
 const write=(name,value)=>{try{localStorage.setItem(key(name),JSON.stringify(value));}catch{}};
 const el=(tag,props={},text)=>{const n=document.createElement(tag);for(const [k,v]of Object.entries(props)){if(k.includes('-')||k==='role')n.setAttribute(k,v);else n[k]=v;}if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn,primary=false)=>{const b=el('button',{type:'button',className:'anis-button'+(primary?' primary':'')},text);b.onclick=fn;return b;};
 function dialog(id,title){const d=el('dialog',{id,className:'anis-dialog'}),h=el('header');h.append(el('h2',{},title),button('×',()=>d.close()));d.append(h);document.body.append(d);return d;}
 function explain(error,retry,label='Повторить'){
  if(error?.status===404&&/проект.*не найден/i.test(error?.message||''))return;
  const host=document.querySelector('dialog[open]')||$('view-'+currentView);if(!host)return;
  let note=host.querySelector('.anis-inline-error');if(!note){note=el('div',{className:'anis-inline-error',role:'status'});host.append(note);}note.replaceChildren(el('p',{},readableMediaError(error)));
  if(retry)note.append(button(label,()=>{note.remove();void retry();}));
 }
 readableMediaError=error=>!navigator.onLine?'Нет интернета. Уже отправленный проект не нужно заказывать заново.':error?.status===401?'Открой приложение заново через бота ANIS AI в Telegram.':error?.status===429?'Сервис занят. Подожди немного и проверь готовность.':error?.status===402?'У сервиса ИИ закончились средства. Мы сохранили задание; обратись в поддержку.':error?.name==='AbortError'||error instanceof TypeError||/load failed|failed to fetch|networkerror/i.test(error?.message||'')?'Соединение прервалось. Проверь уже отправленное задание — новый заказ не создан.':error?.message||'Не удалось выполнить действие. Попробуй позже.';
 window.addEventListener('online',()=>{void resumeMediaProjects();});

 // IndexedDB stores originals and completed files, not just temporary object URLs.
 let databasePromise,persistTimer;
 function database(){return databasePromise??=new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(Error('Хранилище недоступно'));const req=indexedDB.open('anis-stability-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('records');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 async function dbRecord(name,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('records',value===undefined?'readonly':'readwrite'),req=value===undefined?tx.objectStore('records').get(key(name)):tx.objectStore('records').put(value,key(name));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Не удалось сохранить'));});}
 function storageWarning(){state.storageUnavailable=true;}
 const metadataPersist=persistStudioProjects;
 function projectRecord(p){const {media,loading,...row}=p;return {...row,hasSource:!!p.sourceFile||!!p.hasSource,hasIdentity:!!p.identityFile||!!p.hasIdentity,mediaBlob:media?.blob||p.mediaBlob};}
 async function saveDurable(){try{await dbRecord('projects',[...studioProjects.values()].map(projectRecord));return true;}catch{storageWarning();return false;}}
 persistStudioProjects=function(){metadataPersist();clearTimeout(persistTimer);if(!state.restoring)persistTimer=setTimeout(()=>void saveDurable(),180);};
 const draftIds=['messageInput','imagePrompt','videoPrompt','projectAgentIdea','imageQuality','videoQuality','imageRatio','videoRatio','duration'];
 function saveDrafts(){const values={};for(const id of draftIds)if($(id))values[id]=$(id).value;write('drafts',{values,view:currentView});}
 async function saveFileDrafts(){await dbRecord('files',{image:studioImageFile,video:studioVideoFile,identity:studioVideoIdentityFile,region:state.region});}
 document.addEventListener('input',event=>{if(draftIds.includes(event.target.id))saveDrafts();});
 document.addEventListener('change',event=>{if(draftIds.includes(event.target.id))saveDrafts();});
 for(const name of ['setStudioPhoto','setStudioVideo','setVideoIdentity','clearVideoIdentity','clearStudioPhoto','clearStudioVideo']){
  // Named declarations in the original classic script are window functions.
  const original=window[name];if(typeof original!=='function')continue;
  window[name]=function(...args){const result=original(...args);if(name==='setStudioPhoto'||name==='clearStudioPhoto'){state.region=null;updateRegionButton();}if(!state.restoring)void saveFileDrafts().catch(storageWarning);return result;};
 }
 window.addEventListener('pagehide',()=>{saveDrafts();metadataPersist();void saveDurable();void saveFileDrafts().catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){saveDrafts();void saveDurable();}else void resumeMediaProjects();});

 const createOriginal=createStudioVariant;
 let lastCreation={fingerprint:'',time:0,id:null},creationLock=false;
 const fileStamp=f=>f?[f.name,f.size,f.lastModified].join(':'):'';
 function fingerprint(s){return JSON.stringify([s.groupId,s.kind,s.prompt.trim(),s.quality,s.ratio,s.duration,fileStamp(s.regionOriginalFile||s.sourceFile),fileStamp(s.identityFile),s.region?.points]);}
 createStudioVariant=async function(snapshot){
  const stamp=fingerprint(snapshot),now=Date.now();
  if(creationLock||lastCreation.fingerprint===stamp&&now-lastCreation.time<2500){if(lastCreation.id)openProjectRoom(lastCreation.id);return;}
  creationLock=true;lastCreation={fingerprint:stamp,time:now,id:null};
  try{
   // Original creator adds the ID synchronously. Pump is held until the snapshot is committed.
   const held=projectPumpBusy;projectPumpBusy=true;
   try{await createOriginal(snapshot);lastCreation.id=selectedStudioProject;}finally{projectPumpBusy=held;}
   if(lastCreation.id){await saveDurable();void pumpStudioQueue();}
  }finally{creationLock=false;}
 };
 const launchOriginal=launchStudioProject;
 launchStudioProject=async function(p){
  if((p.hasSource&&!p.sourceFile)||(p.hasIdentity&&!p.identityFile)){p.status='unknown';p.error='Исходник не сохранился на этом устройстве. Добавь его снова, не создавая новый заказ.';renderProjectRoom();return;}
  await saveDurable();
  try{return await launchOriginal(p);}finally{void saveDurable();}
 };
 projectStatusLabel=p=>p.loading?'Загружаем готовый файл':({queued:'Ждём свободное место',submitting:p.sourceFile?'Загружаем твои материалы':'Отправляем описание',creating:'Подтверждаем приём заказа',pending:'Задание принято · ждём очередь ИИ',processing:p.kind==='video'?'ИИ создаёт твоё видео':p.sourceFile?'ИИ редактирует твоё фото':'ИИ создаёт твоё фото',completed:'Готово · можно сохранить',failed:'Не удалось создать',unknown:'Нужно проверить готовность'})[p.status]||'Проверяем проект';
 const renderRoomOriginal=renderProjectRoom;
 const variantsText=n=>n+' '+(n%10===1&&n%100!==11?'вариант':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'варианта':'вариантов');
 const studioNav=document.querySelector('#bottomNav [data-tab="studio"]'),studioNavIcon=studioNav.querySelector('span');
 studioNavIcon.classList.add('studio-nav-icon');studioNavIcon.append(el('i',{className:'studio-nav-progress','aria-hidden':'true'}));
 const studioReadyBadge=el('i',{className:'studio-nav-ready-badge','aria-hidden':'true'});studioReadyBadge.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 8 2.5 2.5L12 5"/></svg>';studioNav.append(studioReadyBadge);
 const seenStudioResults=new Set(read('studio-seen-results',[]));
 function completedStudioResults(){return [...studioProjects.values()].filter(p=>p.status==='completed'&&!p.loading&&(p.media||p.resultUrl));}
 function acknowledgeStudioResults(){let changed=false;for(const p of completedStudioResults())if(!seenStudioResults.has(p.id)){seenStudioResults.add(p.id);changed=true;}if(changed)write('studio-seen-results',[...seenStudioResults].slice(-500));}
 state.ackStudioResults=()=>{acknowledgeStudioResults();updateProjectDock();};
 state.updateStudioIndicator=function(){
  const projects=[...studioProjects.values()],active=projects.filter(p=>!PROJECT_TERMINAL.includes(p.status)||p.loading).length;
  if(['studio','video','templates'].includes(currentView)&&!state.restoring)acknowledgeStudioResults();
  const unseen=completedStudioResults().some(p=>!seenStudioResults.has(p.id));
  studioNav.classList.toggle('studio-nav-working',active>0);studioNav.classList.toggle('studio-nav-ready',unseen);
  studioNav.setAttribute('aria-label',active?'Студия. Идёт создание'+(unseen?'. Есть готовый результат':''):unseen?'Студия. Новый результат готов':'Студия');
  studioNav.title=active?'Создание продолжается':unseen?'Результат готов':'Студия';
  document.querySelectorAll('[data-studio-projects]').forEach(b=>{b.hidden=!projects.length;b.textContent=active?'Мои проекты · в работе '+active:'Мои проекты';});
 };
 const previewUrls=new Map();
 function previewSource(p){
  if(p.media?.url)return {url:p.media.url,type:p.kind==='video'?'video':'img'};
  if(p.status==='completed')return p.resultUrl&&!p.region?{url:p.resultUrl,type:p.kind==='video'?'video':'img'}:null;
  const blob=p.previewBlob||p.sourceFile;if(!blob||!/^image\/|^video\//.test(blob.type))return null;
  const old=previewUrls.get(p.id);if(old?.blob===blob)return old;
  if(old)URL.revokeObjectURL(old.url);const item={blob,url:URL.createObjectURL(blob),type:blob.type.startsWith('video/')?'video':'img'};previewUrls.set(p.id,item);return item;
 }
 function previewElement(source){const n=el(source.type,{src:source.url});if(source.type==='video'){n.muted=true;n.playsInline=true;n.preload='metadata';n.onloadedmetadata=()=>{if(n.duration>0)n.currentTime=Math.min(.1,n.duration/2);};}else n.alt='';return n;}
 function addWorkingPreview(host,p,mini=false){
  const source=previewSource(p);host.classList.add('project-reveal-loading');if(source){const image=previewElement(source);image.className='project-blurred-preview';host.prepend(image);}else host.classList.add('project-abstract-preview');
  const layer=el('div',{className:'project-reveal-overlay'}),spinner=el('span',{className:'project-reveal-spinner','aria-hidden':'true'});layer.append(spinner);if(!mini)layer.append(el('strong',{},projectStatusLabel(p)),el('small',{},'Можно свернуть и вернуться позже'));host.append(layer);
 }
 renderProjectRoom=function(){
  renderRoomOriginal();const p=studioProjects.get(selectedStudioProject);if(!p)return;
  const family=projectFamily(p),stage=$('mediaResultPreview');
  $('projectVariantCount').textContent=variantsText(family.length);
  if(!PROJECT_TERMINAL.includes(p.status)){
   const revealKey=p.id+':'+p.status;if(stage.dataset.revealKey!==revealKey){stage.replaceChildren();stage.classList.remove('project-abstract-preview');addWorkingPreview(stage,p);stage.dataset.revealKey=revealKey;}
  }else{stage.classList.remove('project-reveal-loading','project-abstract-preview');delete stage.dataset.revealKey;}
  const cards=$('projectVariantCards');cards.replaceChildren();
  for(const item of family){
   const card=button('',()=>{openProjectRoom(item.id);if(item.status==='completed'&&!item.media&&item.resultUrl)void loadStudioProjectResult(item);});card.className='project-variant-card';card.classList.toggle('selected',item.id===p.id);card.setAttribute('aria-label',projectLabel(item)+' · '+projectStatusLabel(item));
   const visual=el('div',{className:'project-variant-visual'}),source=previewSource(item);
   if(item.status==='completed'&&source)visual.append(previewElement(source));else if(!PROJECT_TERMINAL.includes(item.status))addWorkingPreview(visual,item,true);else visual.append(el('span',{},item.status==='completed'?'✓':'!'));
   if(item.kind==='video')visual.append(el('b',{className:'project-video-tag'},'▷'));card.append(visual,el('small',{},projectLabel(item)));cards.append(card);
  }
  $('mediaResultTitle').textContent=projectLabel(p)+(p.status==='completed'?' готово':p.status==='failed'?' · ошибка':p.status==='unknown'?' · проверка':' · в работе');
  let steps=$('anisProjectSteps');if(!steps){steps=el('div',{id:'anisProjectSteps',className:'anis-steps','aria-hidden':'true'});for(let i=0;i<4;i++)steps.append(el('span'));$('projectStageStatus').after(steps);}
  const step=p.status==='completed'?4:p.loading?3:['pending','processing'].includes(p.status)?2:['submitting','creating'].includes(p.status)?1:0;
  [...steps.children].forEach((n,i)=>n.classList.toggle('done',i<step));
  $('anisProjectExpiry')?.remove();
  const note=$('mediaResultDialog').lastElementChild;if(note?.textContent==='Сохрани результат: файл в сервисе доступен 7 дней.')note.hidden=true;
  if(['unknown','failed'].includes(p.status)){
   const action=$('mediaResultPreview').querySelector('button');if(action){action.textContent=p.status==='failed'?'Вернуться к описанию':'Проверить готовность';action.onclick=()=>{if(p.status==='failed'){closeGeneratedMedia();openView(p.kind==='image'?'studio':'video');$(p.kind+'Prompt').value=p.prompt||'';}else void recoverProject(p);};}
  }
  if(/проект\s+не найден/i.test(p.error||'')){$('mediaResultPreview').replaceChildren();$('mediaResultTitle').textContent=projectLabel(p);$('projectStageStatus').textContent='';}
 };
 const projectList=dialog('anisProjectList','Мои проекты'),projectListBody=el('div',{className:'project-group-list'});projectList.append(projectListBody);
 function openProjectList(){
  projectListBody.replaceChildren();const groups=new Map();for(const p of studioProjects.values()){const id=p.groupId||p.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);}
  for(const family of [...groups.values()].reverse()){
   const first=family[0],last=family.at(-1),row=button('',()=>{projectList.close();openProjectRoom(last.id);});row.className='project-group-row';
   const picture=el('div',{className:'project-group-picture'}),source=previewSource([...family].reverse().find(p=>p.media)||first);if(source)picture.append(previewElement(source));else picture.textContent=first.kind==='video'?'▷':'✦';
   const copy=el('span');copy.append(el('strong',{},(first.kind==='video'?'Видео':'Фото')+' · '+(first.prompt||'Мой проект').slice(0,65)),el('small',{},variantsText(family.length)+' · '+projectStatusLabel(last)));row.append(picture,copy,el('span',{},'↗'));projectListBody.append(row);
  }
  if(!groups.size)projectListBody.append(el('p',{},'Здесь появятся твои проекты.'));projectList.showModal();
 }
 for(const view of ['studio','video','templates']){const toolbar=el('div',{className:'anis-toolbar studio-projects-toolbar'}),entry=button('Мои проекты',openProjectList);entry.dataset.studioProjects='true';entry.hidden=true;toolbar.append(entry);$('view-'+view).prepend(toolbar);}
 loadStudioProjectResult=async function(p){
  if(p.loading)return;p.loading=true;renderProjectRoom();
  try{
   const response=await fetch(p.resultUrl,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('Готовый файл пока недоступен. Нажми «Открыть готовый файл» ещё раз.');
   let blob=await response.blob();if(!blob.size||!blob.type.startsWith(p.kind==='image'?'image/':'video/'))throw Error('Сервис ещё не отдал готовый файл. Проверь позже.');
   if(p.region){if(!p.regionOriginalFile)throw Error('Чтобы собрать результат без изменения остального фото, нужен оригинал с этого устройства. Не создавай заказ заново.');blob=await compositeRegion(p,blob);}
   p.media=mediaFromBlob(p.kind,blob);p.mediaBlob=blob;generatedMedia[p.kind]=p.media;invalidateUsageStats();await saveDurable();
  }catch(error){p.error=readableMediaError(error);if(selectedStudioProject===p.id&&$('mediaResultDialog').open)explain(error,()=>loadStudioProjectResult(p),'Открыть готовый файл');}
  finally{p.loading=false;workroomRenderKey='';renderProjectRoom();}
 };
 async function recoverProject(p){
  if(projectWatchers.has(p.id))return;
  try{
   const data=await mediaJSON({action:'media-status',jobId:p.id});Object.assign(p,{expiresAt:data.expiresAt});void watchMediaJob(p.kind,p.id,data);
  }catch(error){
   if(error.status===404&&(!p.hasSource||p.sourceFile)&&(!p.hasIdentity||p.identityFile)){p.status='queued';renderProjectRoom();void pumpStudioQueue();}
   else{p.status='unknown';p.error=readableMediaError(error);renderProjectRoom();}
  }
 }
 let resumePromise;
 resumeMediaProjects=function(){
  if(!initData||!user||state.restoring)return Promise.resolve();
  return resumePromise??=(async()=>{
   for(const kind of ['image','video']){
    try{const data=await mediaJSON({action:'media-history',kind});for(const row of data.items||[]){
     let p=studioProjects.get(row.jobId);if(!p){p={id:row.jobId,kind,order:++projectCounter,created:Date.parse(row.createdAt?.replace(' ','T')+'Z')||Date.now(),prompt:row.prompt,quality:row.quality,ratio:row.ratio,duration:row.duration};studioProjects.set(p.id,p);}
     Object.assign(p,{groupId:row.groupId||p.groupId||p.id,status:row.status,resultUrl:row.url,expiresAt:row.expiresAt,error:row.error,region:p.region||row.region});
    }}catch(error){if(!navigator.onLine)break;console.warn('Project history unavailable');}
   }
   for(const p of studioProjects.values())if(['submitting','creating','pending','processing','unknown'].includes(p.status))void recoverProject(p);
   void pumpStudioQueue();updateProjectDock();persistStudioProjects();
   const requested=new URL(location.href).searchParams.get('project');if(requested&&studioProjects.has(requested)){openProjectRoom(requested);const p=studioProjects.get(requested);if(p.status==='completed'&&!p.media&&p.resultUrl)void loadStudioProjectResult(p);}
  })().finally(()=>resumePromise=null);
 };

 // Each normal conversation has its own server context and per-account cache.
 const threadBar=el('div',{className:'anis-toolbar'}),threadSelect=el('select',{'aria-label':'Выбрать разговор',title:'Выбрать разговор'});
 threadBar.append(threadSelect,button('＋ Новый чат',()=>openThreadDialog(false)),button('Переименовать',()=>openThreadDialog(true)));$('view-chat').prepend(threadBar);
 const threadDialog=dialog('anisThreadDialog','Отдельный разговор'),threadName=el('input',{maxLength:80,placeholder:'Например: Учёба'}),threadNote=el('p',{},'У каждого разговора своя история. Учёба, работа и личное не смешиваются.');
 let renaming=false;const threadSubmit=button('Создать чат',async()=>{
  if(!threadName.value.trim())return threadName.focus();threadSubmit.disabled=true;
  try{const data=await mediaJSON({action:renaming?'chat-thread-rename':'chat-thread-create',threadId:state.activeChatId,title:threadName.value.trim()});threadDialog.close();await refreshThreads();if(!renaming)await switchThread(data.id);}catch(error){explain(error,()=>threadSubmit.click());}finally{threadSubmit.disabled=false;}
 },true);threadDialog.append(threadNote,threadName,threadSubmit);
 function chatLocked(){return busy||recording||openingMic||transcribing||orbVoiceActive;}
 function openThreadDialog(rename){if(chatLocked())return toast('Сначала заверши текущий ответ или голосовой ввод.');renaming=rename;threadName.value=rename?state.threads.find(t=>t.id===state.activeChatId)?.title||'':'';threadSubmit.textContent=rename?'Сохранить название':'Создать чат';threadDialog.showModal();threadName.focus();}
 function renderThreads(){threadSelect.replaceChildren();const rows=state.threads.length?state.threads:[{id:'legacy',title:'Первый чат'}];for(const t of rows)threadSelect.append(el('option',{value:t.id},t.title));threadSelect.value=state.activeChatId;}
 async function refreshThreads(){if(!initData||!user)return;const data=await mediaJSON({action:'chat-thread-list'});state.threads=data.threads||[];write('threads',state.threads);if(!state.threads.some(t=>t.id===state.activeChatId))state.activeChatId='legacy';renderThreads();}
 saveCache=function(){write('chat:'+state.activeChatId,cleanHistory(normalHistory));};
 loadHistory=async function(){
  if(!initData||!user||anonymous||busy||historyLoading)return;
  const id=state.activeChatId;historyLoading=true;
  try{const data=await api({action:'history',threadId:id},20000);if(id===state.activeChatId&&!busy){normalHistory=cleanHistory(data.messages);saveCache();historyLoaded=true;updateWelcome();if(!anonymous&&!showWelcome)renderChat();}}
  catch(error){explain(error,()=>loadHistory(),'Загрузить разговор');}finally{historyLoading=false;}
 };
 async function switchThread(id){
  if(chatLocked()||historyLoading){threadSelect.value=state.activeChatId;toast('Сначала заверши текущее действие.');return;}
  saveCache();state.activeChatId=id;localStorage.setItem(key('thread'),id);threadSelect.value=id;
  if(anonymous)toggleAnonymous();normalHistory=cleanHistory(read('chat:'+id,[]));historyLoaded=false;showWelcome=!normalHistory.length;renderChat();void loadHistory();
 }
 threadSelect.onchange=()=>void switchThread(threadSelect.value);
 const historyThreads=button('Мои разговоры',()=>{openView('chat');threadSelect.focus();});$('historyList').before(historyThreads);
 state.decorateMediaHistoryCard=function(card,row){
   let p=studioProjects.get(row.jobId);
   if(!p){p={id:row.jobId,groupId:row.groupId||row.jobId,kind:row.kind,status:row.status,prompt:row.prompt,quality:row.quality,ratio:row.ratio,duration:row.duration,created:Date.parse(row.createdAt?.replace(' ','T')+'Z')||Date.now(),expiresAt:row.expiresAt,resultUrl:row.url,region:row.region,order:++projectCounter};studioProjects.set(p.id,p);}
   const caption=card.querySelector('small');if(caption&&row.status==='completed')caption.textContent=p?.media?'Готово · сохранено на этом устройстве':row.expired?'Срок хранения у сервиса истёк':'Готово · доступно до '+new Date(row.expiresAt).toLocaleDateString('ru-RU');
   if(p){card.disabled=row.expired&&!p.media;card.onclick=()=>{openProjectRoom(p.id);if(p.status==='completed'&&!p.media&&p.resultUrl)void loadStudioProjectResult(p);else if(!['completed','failed'].includes(p.status))void recoverProject(p);};}
 };

 // Ready notifications are off by default and require the user's explicit toggle.
 const notifyLabel=el('label',{className:'anis-notify'}),notifyToggle=el('input',{type:'checkbox'});
 notifyLabel.append(notifyToggle,el('span',{},'Сообщать в Telegram, когда фото или видео готово'));$('profile-support')?.before(notifyLabel);
 if(!notifyLabel.isConnected)$('view-profile').append(notifyLabel);
 notifyToggle.onchange=async()=>{
  const enabled=notifyToggle.checked;notifyToggle.disabled=true;
  try{
   if(enabled&&typeof tg?.requestWriteAccess==='function'){const allowed=await new Promise(resolve=>tg.requestWriteAccess(resolve));if(!allowed)throw Error('Разреши боту отправлять сообщения, чтобы получать результаты.');}
   await mediaJSON({action:'notification-set',enabled});toast(enabled?'Сообщим, когда результат будет готов.':'Уведомления выключены.');
  }catch(error){notifyToggle.checked=!enabled;explain(error,()=>{openView('profile');notifyToggle.focus();},'Открыть настройки');}finally{notifyToggle.disabled=false;}
 };
 const profilePanelOriginal=showProfilePanel;
 showProfilePanel=function(kind){
  profilePanelOriginal(kind);if(kind!=='pro')return;
  const body=$('profileDialogBody');body.replaceChildren();
  body.append(el('p',{},'PRO — подписка на 30 дней. Перед покупкой здесь будет точно указано, сколько фото и видео входит, какие доступны качество и длительность, а также полная стоимость.'),el('p',{},'Сейчас условия согласовываются. Подписка не активна, деньги не списываются. Обычное создание фото и видео остаётся доступным без PRO.'),button('Что планируется',()=>{const list=el('p',{},'Пакет генераций на месяц · высокое качество фото · видео из фото · понятный счётчик оставшихся генераций. Количество и цена будут опубликованы до начала продаж.');body.append(list);}));
 };

 // The helper proposes a draft only. It never starts a paid generation.
 const helper=dialog('anisPromptHelper','Давай уточним идею'),helperIdea=el('textarea',{maxLength:1200,'aria-label':'Твоя идея'}),helperDetails=el('textarea',{maxLength:800,'aria-label':'Место, свет, стиль и движение',placeholder:'Например: чёрный кабриолет, вечерний свет, город на фоне'}),helperOutput=el('textarea',{maxLength:1200,'aria-label':'Готовое описание — можно изменить',hidden:true});
 let helperKind='image';helper.append(el('label',{},'Твоя идея'),helperIdea,el('label',{},'Что важно: место, свет, стиль'+'. Для видео — ещё движение.'),helperDetails);
 const improveButton=button('Подготовить описание',async()=>{
  improveButton.disabled=true;improveButton.textContent='Уточняем идею…';
  try{const data=await mediaJSON({action:'prompt-improve',kind:helperKind,prompt:helperIdea.value,details:helperDetails.value});helperOutput.value=data.prompt;helperOutput.hidden=false;useDescription.hidden=false;}
  catch(error){explain(error,()=>improveButton.click(),'Попробовать ещё раз');}finally{improveButton.disabled=false;improveButton.textContent='Подготовить описание';}
 },true);
 const useDescription=button('Использовать описание',()=>{$(helperKind+'Prompt').value=helperOutput.value;saveDrafts();helper.close();$(helperKind+'Prompt').focus();},true);useDescription.hidden=true;
 helper.append(improveButton,helperOutput,useDescription,el('p',{},'Проверь и поправь описание. Создание начнётся только после нажатия «Создать» в студии.'));
 for(const kind of ['image','video']){const tools=el('div',{className:'anis-toolbar'});tools.append(button('✦ Уточнить идею',()=>{helperKind=kind;helperIdea.value=$(kind+'Prompt').value;helperOutput.hidden=true;useDescription.hidden=true;helper.showModal();}));if(kind==='image'){state.regionButton=button('◌ Выделить область',()=>void openRegion());tools.append(state.regionButton);}$(kind+'Prompt').closest('.studio-prompt-box').before(tools);}

 // Freehand selection: only the crop is edited; the original is composited outside the polygon.
 const regionDialog=dialog('anisRegionDialog','Что изменить на фото?'),regionCanvas=el('canvas',{id:'regionCanvas'});let regionImage=null,regionPoints=[],drawing=false;
 regionDialog.append(el('p',{},'Обведи пальцем нужную часть. Всё за пределами выделения останется оригинальным. Оригинал хранится на этом устройстве.'),regionCanvas);
 function drawRegion(){if(!regionImage)return;const ctx=regionCanvas.getContext('2d');ctx.drawImage(regionImage,0,0,regionCanvas.width,regionCanvas.height);if(regionPoints.length){ctx.beginPath();regionPoints.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*regionCanvas.width,p.y*regionCanvas.height));if(!drawing)ctx.closePath();ctx.fillStyle='#ae60ec44';ctx.fill();ctx.strokeStyle='#d5a2ff';ctx.lineWidth=3;ctx.stroke();}}
 function regionPoint(e){const rect=regionCanvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};}
 regionCanvas.onpointerdown=e=>{drawing=true;regionPoints=[regionPoint(e)];regionCanvas.setPointerCapture(e.pointerId);drawRegion();};
 regionCanvas.onpointermove=e=>{if(!drawing)return;if(regionPoints.length<300)regionPoints.push(regionPoint(e));drawRegion();};
 regionCanvas.onpointerup=()=>{drawing=false;drawRegion();};regionCanvas.onpointercancel=()=>{drawing=false;regionPoints=[];drawRegion();};
 const regionActions=el('div',{className:'anis-toolbar'});regionActions.append(button('Сбросить',()=>{regionPoints=[];state.region=null;drawRegion();updateRegionButton();}),button('Готово',()=>{
  if(regionPoints.length<3)return toast('Обведи область замкнутой линией.');const xs=regionPoints.map(p=>p.x),ys=regionPoints.map(p=>p.y),bounds={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  if(bounds.w<.015||bounds.h<.015)return toast('Выдели область чуть крупнее.');state.region={points:regionPoints.map(p=>({...p})),bounds};updateRegionButton();void saveFileDrafts().catch(storageWarning);regionDialog.close();toast('Теперь напиши, что изменить внутри выделения.');
 },true));regionDialog.append(regionActions);
 function updateRegionButton(){if(!state.regionButton)return;state.regionButton.disabled=!studioImageFile;state.regionButton.textContent=state.region?'◉ Область выбрана':'◌ Выделить область';state.regionButton.classList.toggle('anis-region-active',!!state.region);}
 async function imageFor(file){const url=URL.createObjectURL(file),img=new Image();try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Не удалось открыть фото.'));img.src=url;});return img;}finally{URL.revokeObjectURL(url);}}
 async function openRegion(){if(!studioImageFile)return toast('Сначала добавь фото.');try{regionImage=await imageFor(studioImageFile);const scale=Math.min(1,1200/Math.max(regionImage.naturalWidth,regionImage.naturalHeight));regionCanvas.width=Math.round(regionImage.naturalWidth*scale);regionCanvas.height=Math.round(regionImage.naturalHeight*scale);regionPoints=state.region?.points.map(p=>({...p}))||[];drawRegion();regionDialog.showModal();}catch(error){explain(error);}}
 async function cropRegion(file,region){const img=await imageFor(file),b=region.bounds,c=document.createElement('canvas');c.width=Math.max(1,Math.round(b.w*img.naturalWidth));c.height=Math.max(1,Math.round(b.h*img.naturalHeight));c.getContext('2d').drawImage(img,b.x*img.naturalWidth,b.y*img.naturalHeight,b.w*img.naturalWidth,b.h*img.naturalHeight,0,0,c.width,c.height);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw Error('Не удалось подготовить выделение.');return new File([blob],'selected-area.png',{type:'image/png'});}
 async function compositeRegion(p,blob){const original=await imageFor(p.regionOriginalFile),changed=await imageFor(blob),c=document.createElement('canvas');c.width=original.naturalWidth;c.height=original.naturalHeight;const ctx=c.getContext('2d'),r=p.region,b=r.bounds||{x:Math.min(...r.points.map(q=>q.x)),y:Math.min(...r.points.map(q=>q.y))};if(!b.w||!b.h)throw Error('Не удалось восстановить выделение. Открой проект на исходном устройстве.');ctx.drawImage(original,0,0);ctx.save();ctx.beginPath();r.points.forEach((q,i)=>ctx[i?'lineTo':'moveTo'](q.x*c.width,q.y*c.height));ctx.closePath();ctx.clip();ctx.drawImage(changed,b.x*c.width,b.y*c.height,b.w*c.width,b.h*c.height);ctx.restore();const result=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!result)throw Error('Не удалось собрать фото.');return result;}
 const generateOriginal=generateMedia;
 generateMedia=async function(kind){
  if(kind!=='image'||!state.region)return generateOriginal(kind);
  if(mediaVoiceTask)return toast('Сначала заверши голосовой ввод.');
  const original=studioImageFile,region=structuredClone(state.region),prompt=$('imagePrompt').value.trim();if(prompt.length<3)return toast('Напиши, что изменить в выделенной области.');
  try{const crop=await cropRegion(original,region);return createStudioVariant({kind:'image',prompt,providerPrompt:prompt.length<1100?'Измени только этот фрагмент по описанию. Сохрани композицию и положение объектов: '+prompt:prompt,sourceFile:crop,regionOriginalFile:original,region,quality:$('imageQuality').value,ratio:$('imageRatio').value});}catch(error){explain(error);}
 };

 // A reachable action bar follows the actual visual viewport above the phone keyboard.
 const keyboardBar=el('div',{id:'studioKeyboardBar',hidden:true}),keyboardCreate=button('Создать',()=>{const target=document.activeElement?.id;if(target==='projectAgentIdea')void addAgentVariant();else void generateMedia(target==='videoPrompt'?'video':'image');},true);
 keyboardBar.append(keyboardCreate,button('Готово',()=>document.activeElement?.blur()));document.body.append(keyboardBar);
 function keyboardLayout(){const id=document.activeElement?.id,v=window.visualViewport,focused=['imagePrompt','videoPrompt','projectAgentIdea'].includes(id);keyboardBar.hidden=!focused||!!v&&window.innerHeight-v.height<100;if(!keyboardBar.hidden){keyboardBar.style.top=((v?.offsetTop||0)+(v?.height||innerHeight)-58)+'px';keyboardCreate.textContent=id==='projectAgentIdea'?'Добавить вариант':id==='videoPrompt'?'Создать видео':'Создать фото';}}
 document.addEventListener('focusin',()=>{keyboardLayout();setTimeout(keyboardLayout,250);});document.addEventListener('focusout',()=>setTimeout(keyboardLayout,0));window.visualViewport?.addEventListener('resize',keyboardLayout);window.visualViewport?.addEventListener('scroll',keyboardLayout);
 // Keep focus until click: otherwise blur would hide the action before pointerup.
 keyboardBar.addEventListener('pointerdown',e=>e.preventDefault());

 // Version checks are cheap and never reload while a user is composing or uploading.
 let nextVersion=null,updating=false;
 function safeToUpdate(){return !state.restoring&&![...studioProjects.values()].some(p=>['submitting','creating'].includes(p.status))&&!busy&&!recording&&!openingMic&&!transcribing&&!mediaVoiceTask&&!stagedMediaAttachment&&!document.querySelector('dialog[open]')&&!['TEXTAREA','INPUT','SELECT'].includes(document.activeElement?.tagName);}
 async function applyRelease(){if(updating||!nextVersion||!safeToUpdate())return;updating=true;saveDrafts();try{if(studioImageFile||studioVideoFile||studioVideoIdentityFile)await saveFileDrafts();await saveDurable();const url=new URL(location.href);url.searchParams.set('v',nextVersion);location.replace(url.href);}catch{updating=false;storageWarning();}}
 async function checkRelease(){try{const response=await fetch('/release.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)return;const data=await response.json(),current=document.querySelector('meta[name="anis-build"]')?.content;if(/^[a-f0-9]{12,64}$/.test(data.version)&&data.version!==current){nextVersion=data.version;if(safeToUpdate())void applyRelease();}}catch{}}
 window.addEventListener('focus',()=>void checkRelease());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkRelease();});setInterval(()=>void checkRelease(),60000);

 async function start(){
  const drafts=read('drafts',null);if(drafts)for(const [id,value]of Object.entries(drafts.values||{}))if($(id))$(id).value=value;
  try{
   const rows=await dbRecord('projects')||JSON.parse(localStorage.getItem(studioProjectKey())||'[]');for(const row of rows){if(!row.id||!['image','video'].includes(row.kind))continue;const p={...row};if(p.mediaBlob)p.media=mediaFromBlob(p.kind,p.mediaBlob);studioProjects.set(p.id,p);projectCounter=Math.max(projectCounter,p.order||0);}
   const files=await dbRecord('files');if(files){if(files.image)setStudioPhoto(files.image);if(files.video)setStudioVideo(files.video);if(files.identity)setVideoIdentity(files.identity);state.region=files.region||null;}
  }catch{storageWarning();}
  state.restoring=false;updateRegionButton();updateProjectDock();
  state.threads=read('threads',[]);renderThreads();normalHistory=cleanHistory(read('chat:'+state.activeChatId,normalHistory));renderChat();
  if(drafts?.view&&['chat','studio','video','profile','history','statistics','templates'].includes(drafts.view))openView(drafts.view);
  void refreshThreads().then(()=>loadHistory()).catch(()=>{});
  if(initData&&user)void mediaJSON({action:'notification-get'}).then(data=>notifyToggle.checked=data.enabled).catch(()=>{});
  void resumeMediaProjects();void checkRelease();
 }
 void start();
})();
