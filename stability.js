/* Durable client state, authenticated conversations and safe release updates. */
(() => {
 'use strict';
 const account=String(user?.id||'guest'),key=name=>'anis-stable:'+account+':'+name;
 let savedThread;try{savedThread=localStorage.getItem(key('thread'));}catch{}
 const state=window.anisStability={activeChatId:savedThread||'legacy',threads:[],restoring:true,historyLoading:false,historyLoaded:false,historyError:null,uploading:0,region:null};
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
 const readableAccountError=readableMediaError;
 readableMediaError=error=>error?.status===402&&/аниум/i.test(error?.message||'')?error.message:readableAccountError(error);
 window.addEventListener('online',()=>{void resumeMediaProjects();void loadHistory();});

 // IndexedDB stores originals and completed files, not just temporary object URLs.
 let databasePromise,persistTimer;
 function database(){return databasePromise??=new Promise((resolve,reject)=>{
  if(!window.indexedDB)return reject(Error('Хранилище недоступно'));
  let settled=false;const timer=setTimeout(()=>finish(Error('Хранилище пока недоступно')),2500),req=indexedDB.open('anis-stability-v1',1);
  function finish(error){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(req.result);}
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('records'))req.result.createObjectStore('records');};
  req.onsuccess=()=>{if(settled){req.result.close();return;}req.result.onversionchange=()=>{req.result.close();databasePromise=null;};finish();};req.onerror=()=>finish(req.error);req.onblocked=()=>finish(Error('Хранилище занято'));
 }).catch(error=>{databasePromise=null;throw error;});}
 async function dbRecord(name,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('records',value===undefined?'readonly':'readwrite'),req=value===undefined?tx.objectStore('records').get(key(name)):tx.objectStore('records').put(value,key(name));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Не удалось сохранить'));});}
 function storageWarning(){state.storageUnavailable=true;}
 const metadataPersist=persistStudioProjects;
 const projectRecordCache=new WeakMap();
 function projectRecord(p){
  const {media,loading,...rest}=p,row={...rest,hasSource:!!p.sourceFile||!!p.hasSource,hasIdentity:!!p.identityFile||!!p.hasIdentity,mediaBlob:media?.blob||p.mediaBlob};
  const previous=projectRecordCache.get(p),names=Object.keys(row);
  if(previous&&names.length===Object.keys(previous).length&&names.every(name=>previous[name]===row[name]))return previous;
  projectRecordCache.set(p,row);return row;
 }
 function mergeProjectRecords(previous,incoming){
  const records=new Map();for(const row of [...(Array.isArray(previous)?previous:[]),...(Array.isArray(incoming)?incoming:[])]){
   if(!row?.id||!['image','video'].includes(row.kind))continue;
   const p={...records.get(row.id)};for(const [name,value]of Object.entries(row))if(value!==undefined&&value!==null)p[name]=value;
   if(p.mediaBlob)p.status='completed';records.set(p.id,p);
  }return [...records.values()];
 }
 let durableSavePromise,savedDurableRows;
 async function saveDurable(){
  if(state.restoring)return false;
  if(durableSavePromise)return durableSavePromise.then(saved=>saved?saveDurable():false);
  const rows=[...studioProjects.values()].map(projectRecord);
  if(savedDurableRows&&rows.length===savedDurableRows.length&&rows.every((row,index)=>row===savedDurableRows[index]))return true;
  durableSavePromise=(async()=>{
   try{const db=await database();await new Promise((resolve,reject)=>{
    const tx=db.transaction('records','readwrite'),records=tx.objectStore('records'),request=records.get(key('projects'));
    request.onsuccess=()=>records.put(mergeProjectRecords(request.result,rows),key('projects'));
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Не удалось сохранить'));
   });savedDurableRows=rows;return true;}catch{storageWarning();return false;}
  })();
  try{return await durableSavePromise;}finally{durableSavePromise=null;}
 }
 persistStudioProjects=function(){if(state.restoring)return;metadataPersist();clearTimeout(persistTimer);persistTimer=setTimeout(()=>void saveDurable(),180);};
 const draftIds=['messageInput','imagePrompt','videoPrompt','projectAgentIdea','imageQuality','videoQuality','imageRatio','videoRatio','duration'];
 const studioPromptEditedAt={...(read('drafts',null)?.promptEditedAt||{})};
 const studioSourceEditedAt={...(read('drafts',null)?.sourceEditedAt||{})};
 function saveDrafts(){const values={};for(const id of draftIds)if($(id))values[id]=id==='messageInput'&&anonymous?'':$(id).value;write('drafts',{values,view:currentView,promptEditedAt:{...studioPromptEditedAt},sourceEditedAt:{...studioSourceEditedAt}});}
 function consumeStudioDraft(snapshot){
  if(!snapshot.consumeDraft)return;
  const image=snapshot.kind==='image',prompt=$(snapshot.kind+'Prompt'),source=image?studioImageFile:studioVideoFile;
  // A user may already have started another idea while the project was being saved.
  if(prompt.value.trim()!==snapshot.prompt.trim()||source&&source!==(snapshot.regionOriginalFile||snapshot.sourceFile||null)||!image&&studioVideoIdentityFile!==(snapshot.identityFile||null))return;
  prompt.value='';
  if(image)clearStudioPhoto(true);else{clearStudioVideo(true);clearVideoIdentity();}
  saveDrafts();void saveFileDrafts().catch(storageWarning);
 }
 function clearSubmittedPromptDrafts(){
  let changed=false;
  for(const kind of ['image','video']){
   const field=$(kind+'Prompt'),source=kind==='image'?studioImageFile:studioVideoFile;
   if(!field.value.trim()&&!source)continue;
   const sent=[...studioProjects.values()].some(p=>p.kind===kind&&p.consumeDraft&&(!field.value.trim()||p.prompt?.trim()===field.value.trim())&&(p.created||0)>=(studioPromptEditedAt[kind]||0)&&(p.created||0)>=(studioSourceEditedAt[kind]||0)&&(!source||fileStamp(source)===(p.submittedSourceStamp||fileStamp(p.regionOriginalFile||p.sourceFile)))&&(kind!=='video'||!studioVideoIdentityFile||fileStamp(studioVideoIdentityFile)===(p.submittedIdentityStamp||fileStamp(p.identityFile))));
   if(sent){field.value='';if(kind==='image')clearStudioPhoto(true);else{clearStudioVideo(true);clearVideoIdentity();}changed=true;}
  }
  if(changed)saveDrafts();
 }
 const draftFileBytes=new WeakMap();let fileDraftSaveQueue=Promise.resolve();
 function packDraftFile(file){
  if(!file)return Promise.resolve(null);
  if(!draftFileBytes.has(file))draftFileBytes.set(file,file.arrayBuffer().then(bytes=>{
   if(!bytes.byteLength||bytes.byteLength!==file.size)throw Error('Не удалось прочитать исходный файл целиком.');
   return {bytes,type:file.type,name:file.name||'reference',lastModified:file.lastModified||Date.now()};
  }).catch(error=>{draftFileBytes.delete(file);throw error;}));
  return draftFileBytes.get(file);
 }
 async function restoreDraftFile(record){
  if(!record)return null;
  const data=record instanceof Blob?await packDraftFile(record):record;
  if(!(data.bytes instanceof ArrayBuffer)||!data.bytes.byteLength)throw Error('Сохранённый исходный файл недоступен.');
  const file=new File([data.bytes],data.name||'reference',{type:data.type||'',lastModified:data.lastModified||Date.now()});
  draftFileBytes.set(file,Promise.resolve(data));return file;
 }
 async function saveFileDrafts(){
  if(state.restoring||state.fileDraftsLoading)return;
  const files=[studioImageFile,studioVideoFile,studioVideoIdentityFile],region=state.region;
  const save=fileDraftSaveQueue.catch(()=>{}).then(async()=>{
   const [image,video,identity]=await Promise.all(files.map(packDraftFile));
   await dbRecord('files',{image,video,identity,region});
  });fileDraftSaveQueue=save;return save;
 }
 document.addEventListener('input',event=>{const kind=event.target.id==='imagePrompt'?'image':event.target.id==='videoPrompt'?'video':null;if(kind)studioPromptEditedAt[kind]=Math.max(Date.now(),(studioPromptEditedAt[kind]||0)+1);if(draftIds.includes(event.target.id))saveDrafts();});
 document.addEventListener('change',event=>{if(draftIds.includes(event.target.id))saveDrafts();});
 for(const name of ['setStudioPhoto','setStudioVideo','setVideoIdentity','clearVideoIdentity','clearStudioPhoto','clearStudioVideo']){
  // Named declarations in the original classic script are window functions.
  const original=window[name];if(typeof original!=='function')continue;
  window[name]=function(...args){const result=original(...args);if(result!==false&&!state.restoring&&!state.fileDraftsLoading&&['setStudioPhoto','setStudioVideo','setVideoIdentity'].includes(name)){const kind=name==='setStudioPhoto'?'image':'video';studioSourceEditedAt[kind]=Date.now();saveDrafts();}if(name==='setStudioPhoto'||name==='clearStudioPhoto'){state.region=null;updateRegionButton();if(name==='setStudioPhoto'&&result!==false&&studioImageFile)void prepareStudioImage(studioImageFile);}if(name==='setStudioPhoto'&&result!==false&&state.regionAfterUpload){state.regionAfterUpload=false;queueMicrotask(()=>void openRegion());}if(!state.restoring)void saveFileDrafts().catch(storageWarning);return result;};
 }
 window.addEventListener('pagehide',()=>{saveDrafts();persistStudioProjects();void saveDurable();void saveFileDrafts().catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){saveDrafts();void saveDurable();}else void resumeMediaProjects();});

 const createOriginal=createStudioVariant;
 let lastCreation={fingerprint:'',time:0,id:null},creationLock=false;
 const fileStamp=f=>f?[f.name,f.size,f.lastModified].join(':'):'';
 function fingerprint(s){return JSON.stringify([s.groupId,s.kind,s.prompt.trim(),s.quality,s.ratio,s.duration,fileStamp(s.regionOriginalFile||s.sourceFile),fileStamp(s.identityFile),s.region?.points]);}
 createStudioVariant=async function(snapshot){
  if(snapshot.consumeDraft)snapshot={...snapshot,submittedSourceStamp:fileStamp(snapshot.regionOriginalFile||snapshot.sourceFile),submittedIdentityStamp:fileStamp(snapshot.identityFile)};
  const stamp=fingerprint(snapshot),now=Date.now();
  if(creationLock||lastCreation.fingerprint===stamp&&now-lastCreation.time<2500){if(lastCreation.id)openProjectRoom(lastCreation.id);return;}
  creationLock=true;lastCreation={fingerprint:stamp,time:now,id:null};
  try{
   if(snapshot.prompt.trim().length>=3&&snapshot.prompt.trim().length<=1200){
    let quote;try{quote=await mediaJSON({action:'media-quote',kind:snapshot.kind,quality:snapshot.quality,duration:snapshot.duration});}catch(error){toast(readableMediaError(error));return;}
    if(quote.enabled){const text='Создать '+(snapshot.kind==='video'?'видео':'фото')+' за '+quote.amount+' аниумов? При подтверждённой ошибке создания сумма вернётся на баланс.';const confirmed=typeof tg!=='undefined'&&tg?.showConfirm?await new Promise(resolve=>tg.showConfirm(text,resolve)):window.confirm(text);if(!confirmed)return;snapshot={...snapshot,acceptedPrice:quote.amount};}
   }
   if(snapshot.kind==='video'&&['qhd','uhd'].includes(snapshot.quality)&&snapshot.sourceFile?.type.startsWith('video/')){const source=await window.anisMediaQuality.inspectVideo(snapshot.sourceFile);if(source.duration>10.1){toast('Для 2K и 4K добавь видео до 10 секунд. Можно сначала обрезать ролик.');return;}}
   // Original creator adds the ID synchronously. Pump is held until the snapshot is committed.
   const held=projectPumpBusy,existing=new Set(studioProjects.keys());projectPumpBusy=true;
   try{await createOriginal(snapshot);if(!existing.has(selectedStudioProject)&&studioProjects.has(selectedStudioProject))lastCreation.id=selectedStudioProject;}finally{projectPumpBusy=held;}
   if(lastCreation.id){await saveDurable();consumeStudioDraft(snapshot);void pumpStudioQueue();}
  }finally{creationLock=false;if(!lastCreation.id)lastCreation={fingerprint:'',time:0,id:null};}
 };
 const launchOriginal=launchStudioProject;
 launchStudioProject=async function(p){
  if((p.hasSource&&!p.sourceFile)||(p.hasIdentity&&!p.identityFile)){p.status='unknown';p.error='Исходник не сохранился на этом устройстве. Добавь его снова, не создавая новый заказ.';renderProjectRoom();return;}
  await saveDurable();
  try{return await launchOriginal(p);}finally{void saveDurable();}
 };
 projectStatusLabel=p=>p.loading?(p.kind==='video'?'Видео':'Фото')+' готово · подготавливаем сохранение':({queued:'Ждём свободное место',submitting:p.sourceFile?'Загружаем твои материалы':'Отправляем описание',creating:'Подтверждаем приём заказа',pending:'Задание принято · ждём очередь ИИ',processing:p.kind==='video'?'ИИ создаёт твоё видео':p.sourceFile?'ИИ редактирует твоё фото':'ИИ создаёт твоё фото',completed:'Готово · можно сохранить',failed:'Не удалось создать',unknown:'Нужно проверить готовность'})[p.status]||'Проверяем проект';
 const renderRoomOriginal=renderProjectRoom;
 const variantsText=n=>n+' '+(n%10===1&&n%100!==11?'вариант':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'варианта':'вариантов');
 const studioNav=document.querySelector('#bottomNav [data-tab="studio"]'),studioNavIcon=studioNav.querySelector('span');
 studioNavIcon.classList.add('studio-nav-icon');studioNavIcon.append(el('i',{className:'studio-nav-progress','aria-hidden':'true'}));
 const studioReadyBadge=el('i',{className:'studio-nav-ready-badge','aria-hidden':'true'});studioReadyBadge.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 8 2.5 2.5L12 5"/></svg>';studioNav.append(studioReadyBadge);
 const seenStudioResults=new Set(read('studio-seen-results',[]));
 function completedStudioResults(){return [...studioProjects.values()].filter(p=>!p.removedFromVariants&&p.status==='completed'&&!p.loading&&(p.media||p.resultUrl));}
 function acknowledgeStudioResults(){let changed=false;for(const p of completedStudioResults())if(!seenStudioResults.has(p.id)){seenStudioResults.add(p.id);changed=true;}if(changed)write('studio-seen-results',[...seenStudioResults].slice(-500));}
 state.ackStudioResults=()=>{acknowledgeStudioResults();updateProjectDock();};
 state.updateStudioIndicator=function(){
  const projects=[...studioProjects.values()],active=projects.filter(p=>!PROJECT_TERMINAL.includes(p.status)&&!(p.removedFromVariants&&p.status==='queued')).length;
  if(['studio','video','templates','ready'].includes(currentView)&&!state.restoring)acknowledgeStudioResults();
  const unseen=completedStudioResults().some(p=>!seenStudioResults.has(p.id));
  studioNav.classList.toggle('studio-nav-working',active>0);studioNav.classList.toggle('studio-nav-ready',unseen);
  studioNav.setAttribute('aria-label',active?'Студия. Идёт создание'+(unseen?'. Есть готовый результат':''):unseen?'Студия. Новый результат готов':'Студия');
  studioNav.title=active?'Создание продолжается':unseen?'Результат готов':'Студия';
  state.renderStudioSectionProgress?.(projects);
  state.renderStudioNavProgress?.(projects);
  state.renderRoomProgress?.(studioProjects.get(selectedStudioProject));
  if(currentView==='ready')renderReadyProjects();
  document.querySelectorAll('[data-studio-projects]').forEach(b=>{b.hidden=!projects.length;b.textContent=active?'Мои проекты · в работе '+active:'Мои проекты';});
 };
 const previewUrls=new Map();
 function studioProjectProgress(project){
  // Creation is finished even when the ready file has not been opened on this device.
  if(project.status==='completed')return 1;
  return {queued:.03,submitting:.12,creating:.22,pending:.32,processing:.62,unknown:.32,failed:0,cancelled:0}[project.status]||0;
 }
 const studioNavTracks=new Map(),studioNavTracked=new Map(),studioNavFinishing=new Map();
 for(const kind of ['image','video']){
  const track=el('span',{className:'studio-nav-job-track','data-kind':kind,'aria-hidden':'true',hidden:true}),fill=el('i');track.append(fill);studioNavIcon.append(track);studioNavTracks.set(kind,{track,fill});
 }
 state.renderStudioNavProgress=function(projects){
  const running=projects.filter(p=>!PROJECT_TERMINAL.includes(p.status)&&!(p.removedFromVariants&&p.status==='queued'));
  let rows=0,progress=1;
  for(const [kind,ui]of studioNavTracks){
   const project=running.filter(p=>p.kind===kind).sort((a,b)=>(b.created||0)-(a.created||0))[0];
   if(project){studioNavTracked.set(kind,project.id);studioNavFinishing.delete(kind);}
   let tracked=studioProjects.get(studioNavTracked.get(kind));
   const readable=tracked?.media?.file?.size>0||!!(kind==='video'?tracked?.posterDataUrl:tracked?.previewDataUrl);
   if(tracked?.status==='completed'&&readable&&!studioNavFinishing.has(kind)){
    const id=tracked.id;studioNavFinishing.set(kind,id);
    // Let the 100% fill finish before restoring the Studio icon.
    setTimeout(()=>{if(studioNavFinishing.get(kind)!==id)return;studioNavFinishing.delete(kind);studioNavTracked.delete(kind);state.updateStudioIndicator?.();},900);
   }else if(tracked&&PROJECT_TERMINAL.includes(tracked.status)&&tracked.status!=='completed'){
    studioNavTracked.delete(kind);studioNavFinishing.delete(kind);tracked=null;
   }
   ui.track.hidden=!tracked;if(!tracked)continue;rows++;
   const value=tracked.status==='completed'&&!readable? .9:studioProjectProgress(tracked);
   progress=Math.min(progress,value);ui.fill.style.width=(value*100)+'%';
   ui.track.title=(kind==='image'?'Фото':'Видео')+' · '+projectStatusLabel(tracked);
  }
  studioNav.classList.toggle('studio-nav-working',rows>0);
  studioNavIcon.style.setProperty('--studio-progress',(rows?progress*100:0)+'%');
  studioNav.classList.toggle('studio-nav-dual-progress',rows===2);
 };
 state.renderRoomProgress=function(project){
  if(!project)return;
  let steps=$('anisProjectSteps');if(!steps){steps=el('div',{id:'anisProjectSteps',className:'anis-steps'});for(let i=0;i<4;i++)steps.append(el('span'));$('projectStageStatus').after(steps);}
  steps.removeAttribute('aria-hidden');steps.setAttribute('role','progressbar');steps.setAttribute('aria-label','Этапы создания '+(project.kind==='video'?'видео':'фото'));steps.setAttribute('aria-valuetext',projectStatusLabel(project));
  const progress=studioProjectProgress(project);
  [...steps.children].forEach((node,index)=>{const part=Math.min(100,Math.max(0,(progress*4-index)*100));node.style.setProperty('--segment-progress',part+'%');node.classList.toggle('done',part===100);});
 };
 // Retain an in-progress work card in each creation section, even with its room minimized.
 const studioSectionProgress=new Map();
 for(const [kind,view]of [['image','studio'],['video','video']]){
  const panel=button('',()=>{
   const project=studioProjects.get(panel.dataset.projectId);if(!project)return;
   openProjectRoom(project.id);
   if(project.kind==='image'&&project.status==='completed'&&!project.media&&project.resultUrl)void loadStudioProjectResult(project);
  });
  panel.id=kind+'CreationProgress';panel.className='studio-job-progress';panel.hidden=true;
  const icon=el('span',{className:'studio-job-progress-icon','aria-hidden':'true'}),copy=el('span',{className:'studio-job-progress-copy'}),title=el('strong'),status=el('span',{className:'studio-job-progress-status',role:'status','aria-live':'polite'}),prompt=el('small'),arrow=el('span',{className:'studio-job-progress-arrow','aria-hidden':'true'},'↗'),track=el('span',{className:'studio-job-progress-track','aria-hidden':'true'});
  track.append(el('i'));copy.append(title,status,prompt);panel.append(icon,copy,arrow,track);
  $('view-'+view).querySelector('.studio-heading').after(panel);
  studioSectionProgress.set(kind,{panel,icon,title,status,prompt,lastKey:''});
 }
 state.renderStudioSectionProgress=function(projects){
  for(const [kind,ui]of studioSectionProgress){
   const own=projects.filter(p=>p.kind===kind&&!p.removedFromVariants).sort((a,b)=>(b.created||0)-(a.created||0)||(b.order||0)-(a.order||0));
   const running=own.filter(p=>!PROJECT_TERMINAL.includes(p.status)),project=running.find(p=>p.id===selectedStudioProject)||running[0]||own[0];
   ui.panel.hidden=!project;if(!project)continue;
   const busy=running.includes(project),key=[project.id,project.status,!!project.loading,!!project.media?.file,running.length,project.prompt,project.error].join('|');
   if(key===ui.lastKey)continue;ui.lastKey=key;
   const subject=kind==='image'?'Фото':'Видео';
   ui.panel.dataset.projectId=project.id;ui.panel.dataset.status=project.status;
   ui.panel.classList.toggle('is-working',busy);ui.panel.classList.toggle('is-ready',project.status==='completed');
   ui.title.textContent=busy?(running.length>1?'В работе: '+running.length+' '+subject.toLowerCase():subject+' в работе'):project.status==='completed'?subject+' готово':subject+' · проверь результат';
   ui.status.textContent=projectStatusLabel(project);
   ui.prompt.textContent=project.prompt||'Открыть текущий проект';
   ui.icon.textContent=busy?'':project.status==='completed'?'✓':'!';
   ui.panel.querySelector('.studio-job-progress-track i').style.width=(studioProjectProgress(project)*100)+'%';
   ui.panel.setAttribute('aria-label',ui.title.textContent+'. '+ui.status.textContent+'. Открыть проект');
  }
 };
 // Keep the native values used by generation, drafts and format help; cards are their visible controls.
 const settingCardSync=[];
 for(const id of ['imageQuality','imageRatio','videoQuality','videoRatio','duration']){
  const select=$(id),panel=select.parentElement,quality=id.endsWith('Quality'),ratio=id.endsWith('Ratio'),rail=el('div',{className:'studio-setting-cards',role:'group','aria-label':quality?(id.startsWith('image')?'Качество фото':'Качество видео'):ratio?'Формат':'Длительность'});
  panel.classList.add('studio-setting-panel');panel.classList.toggle('quality-panel',quality);select.closest('.media-settings').classList.add('studio-card-settings');select.hidden=true;
  const thumbnail='quality-mountains-v1.webp';
  for(const [index,option] of [...select.options].entries()){
   const choice=button('',()=>{if(select.disabled)return;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));});choice.className='studio-setting-card';choice.dataset.value=option.value;
   if(quality){const image=el('img',{src:thumbnail,alt:'',loading:'lazy',decoding:'async'});image.className='quality-sample quality-sample-'+index;choice.append(image);}
   else if(ratio)choice.append(el('i',{className:'setting-ratio-shape','data-ratio':option.value,'aria-hidden':'true'}));
   else choice.append(el('i',{className:'setting-duration-icon','aria-hidden':'true'},'▷'));
   const [title,detail]=option.textContent.split(' · ');choice.append(el('strong',{},title));if(detail)choice.append(el('small',{},detail));rail.append(choice);
  }
   const sync=()=>{for(const card of rail.children){const option=[...select.options].find(o=>o.value===card.dataset.value);card.setAttribute('aria-pressed',String(card.dataset.value===select.value));card.disabled=select.disabled||!!option?.disabled;}};
  select.addEventListener('change',sync);new MutationObserver(sync).observe(select,{attributes:true,attributeFilter:['disabled']});panel.append(rail);settingCardSync.push(sync);sync();
 }
 const videoQualityNote=el('p',{className:'studio-tool-hint',id:'videoQualityNote'});$('videoQuality').parentElement.append(videoQualityNote);
 function syncQualityFormats(){
  const square=$('videoRatio').value==='1:1';for(const option of $('videoQuality').options)option.disabled=square&&['qhd','uhd'].includes(option.value);
  if($('videoQuality').selectedOptions[0]?.disabled)$('videoQuality').value='fhd';
  videoQualityNote.textContent=square?'Для 2K и 4K выбери широкий или вертикальный формат.':$('videoQuality').value==='qhd'?'2K подготавливается из исходного видео 4K при сохранении.':$('videoQuality').value==='uhd'?'Исходное видео 4K. Для референса используй ролик до 10 секунд.':'Full HD · 1080p.';
  settingCardSync.forEach(sync=>sync());
 }
 $('videoRatio').addEventListener('change',syncQualityFormats);$('videoQuality').addEventListener('change',syncQualityFormats);syncQualityFormats();
 const formatHelpOriginal=applyFormatHelp;applyFormatHelp=function(...args){const result=formatHelpOriginal(...args);settingCardSync.forEach(sync=>sync());saveDrafts();return result;};
 const room=$('mediaResultDialog'),roomHeader=room.querySelector('header'),roomTitle=$('mediaResultTitle');roomHeader.after(roomTitle);
 function syncRoomSafeTop(){
  const contentTop=Number(tg?.contentSafeAreaInset?.top)||0,safeTop=Number(tg?.safeAreaInset?.top)||0;
  const viewportTop=window.visualViewport?.offsetTop||0;
  room.style.setProperty('--room-safe-top',Math.max(0,viewportTop+contentTop+safeTop+8)+'px');
 }
 window.visualViewport?.addEventListener('scroll',syncRoomSafeTop);window.visualViewport?.addEventListener('resize',syncRoomSafeTop);tg?.onEvent?.('contentSafeAreaChanged',syncRoomSafeTop);tg?.onEvent?.('safeAreaChanged',syncRoomSafeTop);syncRoomSafeTop();
 const openRoomOriginal=openProjectRoom;
 openProjectRoom=function(...args){
  const wasOpen=room.open;syncRoomSafeTop();if(!wasOpen)room.classList.remove('room-edge-sheet');
  const result=openRoomOriginal(...args);
  if(!wasOpen&&room.open&&window.matchMedia('(max-width:760px)').matches){
   room.style.setProperty('--room-sheet-top',Math.max(0,room.getBoundingClientRect().top)+'px');room.classList.add('room-edge-sheet');
  }
  return result;
 };
 const variantPanel=el('section',{className:'room-variants','aria-label':'Варианты проекта'}),variantHeading=room.querySelector('.project-variants-heading');variantHeading.before(variantPanel);variantPanel.append(variantHeading,$('projectVariantCards'));
 const variantDeleteDialog=dialog('variantDeleteDialog','Удалить вариант?'),variantDeleteText=el('p'),variantDeleteActions=el('div',{className:'anis-toolbar'});
 let variantToDelete=null,deleteWholeWork=false;
 const cancelVariantDelete=button('Отмена',()=>variantDeleteDialog.close()),confirmVariantDelete=button('Удалить',()=>{
  const item=variantToDelete,whole=deleteWholeWork;variantDeleteDialog.close();if(item&&!item.removedFromVariants)removeVariant(item,whole);
 },true);
 cancelVariantDelete.id='variantDeleteCancel';confirmVariantDelete.id='variantDeleteConfirm';variantDeleteText.id='variantDeleteDescription';
 variantDeleteDialog.setAttribute('aria-labelledby','variantDeleteTitle');variantDeleteDialog.querySelector('h2').id='variantDeleteTitle';variantDeleteDialog.setAttribute('aria-describedby',variantDeleteText.id);
 variantDeleteActions.append(cancelVariantDelete,confirmVariantDelete);variantDeleteDialog.append(variantDeleteText,variantDeleteActions);
 variantDeleteDialog.addEventListener('close',()=>{if(!variantDeleteDialog.open)variantToDelete=null;});
 function requestVariantDeletion(item,whole=false){
  if(variantDeleteDialog.open)return;variantToDelete=item;deleteWholeWork=whole;
  $('variantDeleteTitle').textContent=whole?'Удалить работу?':'Удалить вариант?';
  variantDeleteText.textContent=projectLabel(item)+(whole?' будет удалён из готовых работ вместе с вариантами.':' будет удалён из списка вариантов.')+(['submitting','creating','pending','processing','unknown'].includes(item.status)?' Удаление карточки не отменяет отправленный запрос.':'')+(item.billing?.state==='reserved'?' Аниумы останутся в резерве до подтверждения результата.':'');
  variantDeleteDialog.showModal();cancelVariantDelete.focus({preventScroll:true});
 }
 state.requestWorkDeletion=item=>requestVariantDeletion(item,true);
 function removeVariant(item,whole=false){
  const removed=whole?projectFamily(item):[item];for(const p of removed)p.removedFromVariants=true;
  const remaining=projectFamily(item);
  if(removed.some(p=>selectedStudioProject===p.id))selectedStudioProject=remaining.at(-1)?.id||null;
  workroomRenderKey='';persistStudioProjects();void saveDurable();
  if(selectedStudioProject)renderProjectRoom();else closeGeneratedMedia();
  updateProjectDock();
  document.querySelector('.variant-removal-notice')?.remove();
  const notice=el('div',{className:'variant-removal-notice',role:'status'});
  const ongoing=['submitting','creating','pending','processing'].includes(item.status);
  notice.append(el('span',{},ongoing?'Вариант убран. Создание продолжится.':'Вариант удалён из списка.'),button('Отменить',()=>{
   for(const p of removed)p.removedFromVariants=false;notice.remove();persistStudioProjects();void saveDurable();openProjectRoom(item.id);updateProjectDock();void pumpStudioQueue();
  }));
  (room.open?room:document.body).append(notice);setTimeout(()=>notice.remove(),3000);
 }
 function previewSource(p){
  if(p.kind==='video'&&p.posterDataUrl)return {url:p.posterDataUrl,type:'img'};
  if(p.kind==='image'&&p.previewDataUrl)return {url:p.previewDataUrl,type:'img'};
  if(p.media?.url)return {url:p.media.url,type:p.kind==='video'?'video':'img'};
  if(p.status==='completed')return p.resultUrl&&!p.region?{url:p.resultUrl,type:p.kind==='video'?'video':'img'}:null;
  const blob=p.previewBlob||p.sourceFile;if(!blob||!/^image\/|^video\//.test(blob.type))return null;
  const old=previewUrls.get(p.id);if(old?.blob===blob)return old;
  if(old)URL.revokeObjectURL(old.url);const item={blob,url:URL.createObjectURL(blob),type:blob.type.startsWith('video/')?'video':'img'};previewUrls.set(p.id,item);return item;
 }
 function previewElement(source){const n=el(source.type,{src:source.url});if(source.type==='video'){n.muted=true;n.playsInline=true;n.preload='metadata';n.onloadedmetadata=()=>{if(n.duration>0)n.currentTime=Math.min(.1,n.duration/2);};}else{n.alt='';n.loading='lazy';n.decoding='async';}return n;}
 function addWorkingPreview(host,p,mini=false){
  const source=previewSource(p);host.classList.add('project-reveal-loading');if(source){const image=previewElement(source);image.className='project-blurred-preview';host.prepend(image);}else host.classList.add('project-abstract-preview');
  const layer=el('div',{className:'project-reveal-overlay'}),spinner=el('span',{className:'project-reveal-spinner','aria-hidden':'true'});layer.append(spinner);if(!mini)layer.append(el('strong',{},projectStatusLabel(p)),el('small',{},'Можно свернуть и вернуться позже'));host.append(layer);
 }
 renderProjectRoom=function(){
  renderRoomOriginal();const p=studioProjects.get(selectedStudioProject);if(!p)return;
  room.dataset.status=p.status;
  const family=projectFamily(p),stage=$('mediaResultPreview');
  if(!p.loading)stage.querySelectorAll('.project-file-progress').forEach(note=>note.remove());
  else if(stage.querySelector('img,video')&&!stage.querySelector('.project-file-progress')){const note=el('span',{className:'project-file-progress','data-project-id':p.id},'Загружаем оригинал…');stage.append(note);}
  $('projectVariantCount').textContent=variantsText(family.length);
  if(!PROJECT_TERMINAL.includes(p.status)){
   const revealKey=p.id+':'+p.status;if(stage.dataset.revealKey!==revealKey){stage.replaceChildren();stage.classList.remove('project-abstract-preview');addWorkingPreview(stage,p);stage.dataset.revealKey=revealKey;}
  }else{stage.classList.remove('project-reveal-loading','project-abstract-preview');delete stage.dataset.revealKey;}
  const cards=$('projectVariantCards');cards.replaceChildren();
  for(const item of family){
   const card=button('',()=>{openProjectRoom(item.id);if(item.kind==='image'&&item.status==='completed'&&!item.media&&item.resultUrl)void loadStudioProjectResult(item);});card.className='project-variant-card';card.classList.toggle('selected',item.id===p.id);card.setAttribute('aria-label',projectLabel(item)+' · '+projectStatusLabel(item));
   const visual=el('div',{className:'project-variant-visual'}),source=previewSource(item);
   if(item.status==='completed'&&source&&(item.kind!=='video'||item.posterDataUrl))visual.append(previewElement(source));else if(!PROJECT_TERMINAL.includes(item.status))addWorkingPreview(visual,item,true);else visual.append(el('span',{},item.kind==='video'?'▷':item.status==='completed'?'✓':'!'));
   if(item.kind==='video')visual.append(el('b',{className:'project-video-tag'},'▷'));card.append(visual,el('small',{},projectLabel(item)));
   const tile=el('div',{className:'project-variant-item','data-variant-id':item.id}),remove=button('',event=>{event.stopPropagation();requestVariantDeletion(item);});
   remove.className='variant-remove';remove.title='Удалить вариант';remove.setAttribute('aria-label','Удалить '+projectLabel(item));
   remove.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m5 5 6 6M11 5l-6 6"/></svg>';
   tile.append(card,remove);cards.append(tile);
  }
  const addIdea=button('+',()=>$('projectAgentIdea').focus({preventScroll:false}));addIdea.className='project-variant-add';addIdea.setAttribute('aria-label','Добавить идею для нового варианта');cards.append(addIdea);
  $('mediaResultTitle').textContent=projectLabel(p)+(p.status==='completed'?' готово':p.status==='failed'?' · ошибка':p.status==='unknown'?' · проверка':' · в работе');
  if(p.status==='completed')$('mediaResultHelp').textContent=(p.outputWidth&&p.outputHeight?p.outputWidth+'×'+p.outputHeight+' пикс. · ':'')+(p.resolutionWarning||'Фото и видео открываются с предпросмотром. На iPhone: «Сохранить» → «Сохранить изображение» или «Сохранить видео» в системном меню.');
  state.renderRoomProgress(p);
  $('anisProjectExpiry')?.remove();
  const note=$('mediaResultDialog').lastElementChild;if(note?.textContent==='Сохрани результат: файл в сервисе доступен 7 дней.')note.hidden=true;
  const issue=projectIssueCopy(p);stage.classList.toggle('project-status-result',!!issue);
  if(issue){
   const issueKey=[p.id,p.status,p.error,p.billing?.state].join('|');
   if(stage.dataset.issueKey!==issueKey||!stage.querySelector('.project-issue-panel')){stage.dataset.issueKey=issueKey;const panel=el('div',{className:'project-issue-panel'});panel.append(el('strong',{},issue.title),el('p',{},issue.reason));const billing=projectBillingLabel(p);if(billing)panel.append(el('small',{className:'ready-billing-status'},billing));panel.append(button(p.status==='unknown'?'Проверить статус':'Изменить запрос',()=>{if(p.status==='unknown')void recoverProject(p);else{const controls=window.anisProjectActions.createControls(p,{deleteOnly:true});controls.querySelector('[data-action="revise"]')?.click();}}));stage.replaceChildren(panel);}
  }else delete stage.dataset.issueKey;
  if(/проект\s+не найден/i.test(p.error||'')){$('mediaResultPreview').replaceChildren();$('mediaResultTitle').textContent=projectLabel(p);$('projectStageStatus').textContent='';}
 };
 function projectIssueCopy(project){
  if(!['failed','cancelled','unknown'].includes(project.status))return null;
  const subject=project.kind==='video'?'Видео':'Фото',error=String(project.error||'');
  if(project.status==='unknown')return {title:'Уточняем результат…',reason:'Результат пока не подтверждён. Повторно запускать не нужно.'};
  const reason=/недостаточно аниумов/i.test(error)?'На балансе недостаточно аниумов. Запрос не отправлен.':/баланс|недостаточно средств|API.ключ|недоступен/i.test(error)?'Сервис создания временно недоступен.':/описани|параметр|формат|файл не поддерживается|слишком большой/i.test(error)?'Не удалось обработать исходник или настройки. Измени запрос.':'Сервис сообщил об ошибке. Точная причина пока не уточнена.';
  return {title:project.status==='cancelled'?'Создание отменено':subject+' не создано',reason};
 }
 function projectBillingLabel(project){const b=project.billing;return !b?null:b.state==='refunded'?'Аниумы возвращены на баланс':b.state==='not_charged'?'Аниумы не списаны':b.state==='reserved'?'Аниумы в резерве до подтверждения результата':null;}
 const readyView=el('section',{id:'view-ready',className:'view photo-studio'}),readyHeading=el('div',{className:'studio-heading'}),readyHeadingCopy=el('div'),readyGrid=el('div',{id:'studioReadyList',className:'studio-template-list studio-ready-list'});
 readyHeadingCopy.append(el('h1',{className:'page-title'},'Твои готовые работы'),el('p',{className:'subtitle'},'Фото, видео и новые варианты — всё в одном месте.'));readyHeading.append(readyHeadingCopy);readyView.append(readyHeading,readyGrid);$('view-templates').after(readyView);
 const originalOpenStudioView=openView;
 openView=function(name){originalOpenStudioView(name);const tabs=$('mediaProjectSwitcher'),ready=currentView==='ready';tabs.classList.toggle('ready-selected',ready);if(ready){tabs.hidden=false;tabs.classList.remove('video-selected','templates-selected');tabs.querySelectorAll('[data-media-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mediaTab==='ready')));studioNav.classList.add('active');state.ackStudioResults();renderReadyProjects();window.anisProjectActions.refreshGallery?.();if(!state.restoring&&!state.historyLoading&&(!state.historyLoaded||state.historyError))void resumeMediaProjects();requestAnimationFrame(moveGlider);}};
 state.openReadyProjects=()=>openView('ready');
 let readyRenderKey='';
 // A single non-modal prompt bubble lives outside the clipped gallery tiles.
 let readyPromptBubble,readyPromptAnchor,readyPromptCloseTimer;
 function closeReadyPrompt(restoreFocus=false){
  const anchor=readyPromptAnchor;readyPromptAnchor=null;
  anchor?.setAttribute('aria-expanded','false');
  if(!readyPromptBubble)return;
  readyPromptBubble.classList.remove('is-visible');
  clearTimeout(readyPromptCloseTimer);
  readyPromptCloseTimer=setTimeout(()=>{if(!readyPromptAnchor)readyPromptBubble.hidden=true;},180);
  if(restoreFocus&&anchor?.isConnected)anchor.focus({preventScroll:true});
 }
 function showReadyPrompt(anchor,prompt){
  if(readyPromptAnchor===anchor){closeReadyPrompt(true);return;}
  closeReadyPrompt();clearTimeout(readyPromptCloseTimer);
  if(!readyPromptBubble){
   readyPromptBubble=el('section',{id:'readyPromptBubble',className:'ready-prompt-bubble',role:'dialog','aria-modal':'false','aria-labelledby':'readyPromptTitle',tabIndex:-1});
   const heading=el('header');heading.append(el('strong',{id:'readyPromptTitle'},'Запрос'),button('×',()=>closeReadyPrompt(true)));
   heading.lastChild.setAttribute('aria-label','Закрыть запрос');
   readyPromptBubble.append(heading,el('p'));document.body.append(readyPromptBubble);
  }
  readyPromptAnchor=anchor;anchor.setAttribute('aria-expanded','true');
  readyPromptBubble.querySelector('p').textContent=prompt||'Запрос не сохранён';
  readyPromptBubble.classList.remove('is-visible');readyPromptBubble.hidden=false;
  const rect=anchor.getBoundingClientRect(),viewport=window.visualViewport;
  const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight;
  readyPromptBubble.style.maxWidth=Math.max(0,width-24)+'px';
  readyPromptBubble.style.maxHeight=Math.max(0,Math.min(240,height-24))+'px';
  const bounds=readyPromptBubble.getBoundingClientRect();
  readyPromptBubble.style.left=Math.max(left+12,Math.min(rect.left,left+width-bounds.width-12))+'px';
  const above=rect.top-bounds.height-8;
  readyPromptBubble.style.top=Math.max(top+12,Math.min(above>=top+12?above:rect.bottom+8,top+height-bounds.height-12))+'px';
  readyPromptBubble.focus({preventScroll:true});
  requestAnimationFrame(()=>{if(readyPromptAnchor===anchor)readyPromptBubble.classList.add('is-visible');});
 }
 document.addEventListener('pointerdown',event=>{if(readyPromptAnchor&&!readyPromptBubble.contains(event.target)&&!readyPromptAnchor.contains(event.target))closeReadyPrompt();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&readyPromptAnchor){event.preventDefault();event.stopPropagation();closeReadyPrompt(true);}},true);
 document.addEventListener('scroll',event=>{if(readyPromptAnchor&&!readyPromptBubble.contains(event.target))closeReadyPrompt();},true);
 window.addEventListener('resize',()=>closeReadyPrompt());
 window.visualViewport?.addEventListener('resize',()=>closeReadyPrompt());
 function readyPromptControl(prompt){
  const control=button('',event=>{event.stopPropagation();showReadyPrompt(control,prompt);});
  control.className='ready-prompt-toggle';control.setAttribute('aria-label','Посмотреть запрос');control.setAttribute('aria-controls','readyPromptBubble');control.setAttribute('aria-expanded','false');control.setAttribute('aria-haspopup','dialog');
  control.innerHTML='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path class="prompt-icon-body" d="M25 10c0-4-4-6-10-6S4 7 4 14c0 4 2 7 5 8l-2 6 8-5c7 0 12-3 12-9"/><path class="prompt-icon-lines" d="M10 10h10M10 14h8M10 18h5"/><path class="prompt-icon-spark" d="m26 2 1.5 4.5L32 8l-4.5 1.5L26 14l-1.5-4.5L20 8l4.5-1.5Z"/></svg>';
  return control;
 }
 function renderReadyProjects(){
  const projects=[...studioProjects.values()].filter(p=>!p.removedFromVariants).sort((a,b)=>(a.created||0)-(b.created||0)||(a.order||0)-(b.order||0)),key=[state.restoring,state.historyLoading,state.historyLoaded,state.historyError,...projects.map(p=>[p.id,p.groupId,p.status,p.loading,p.error,p.previewDataUrl?'preview':p.posterDataUrl?'poster':previewSource(p)?.url,p.prompt,p.billing?.state,p.billing?.amount].join(':'))].join('|');if(readyGrid.childElementCount&&key===readyRenderKey)return;readyRenderKey=key;
  const existing=new Map([...readyGrid.querySelectorAll('.studio-ready-project')].map(card=>[card.dataset.projectId,card])),next=[];
  const groups=new Map();for(const p of projects){const id=p.groupId||p.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);}
  for(const family of [...groups.values()].reverse()){
   const first=family[0],last=family.at(-1),display=[...family].reverse().find(p=>p.status==='completed'&&(p.media||p.resultUrl))||last;
   const cardKey=[display.id,display.status,last.status,!!last.loading,first.prompt,family.length,display.previewDataUrl||display.posterDataUrl||'',display.billing?.state,display.billing?.amount,display.error].join('|'),old=existing.get(display.id);
   if(old?.dataset.renderKey===cardKey){next.push(old);continue;}
   const card=el('article',{className:'studio-template-card studio-ready-card studio-ready-project','data-project-id':display.id});
   card.dataset.renderKey=cardKey;
   const issue=projectIssueCopy(display);card.classList.toggle('studio-ready-status-card',!!issue);if(issue)card.dataset.issueStatus=display.status;
   const preview=button('',()=>{openProjectRoom(display.id);if(display.kind==='image'&&display.status==='completed'&&!display.media&&display.resultUrl)void loadStudioProjectResult(display);});preview.className='studio-ready-preview';preview.setAttribute('aria-label','Открыть '+(display.kind==='video'?'видео':'фото')+' · '+(first.prompt||'Мой проект').slice(0,110));
   const source=previewSource(display);if(display.status==='completed'&&source&&(display.previewDataUrl||display.posterDataUrl))preview.append(previewElement(source));else if(!PROJECT_TERMINAL.includes(display.status))addWorkingPreview(preview,display,true);else if(!issue)preview.append(el('i',{className:'studio-ready-placeholder','aria-hidden':'true'},first.kind==='video'?'▷':'✦'));
   const copy=el('span',{className:'studio-ready-copy'});
   if(issue)copy.append(el('small',{},first.kind==='video'?'Видео':'Фото'),el('strong',{},issue.title),el('span',{className:'ready-issue-reason'},issue.reason),el('small',{className:'ready-issue-prompt'},(first.prompt||'Мой проект').slice(0,110)));
   else copy.append(el('small',{},(first.kind==='video'?'Видео':'Фото')+' · '+projectStatusLabel(last)+(family.length>1?' · '+variantsText(family.length):'')),el('strong',{},(first.prompt||'Мой проект').slice(0,110)));
   if(issue||display.status!=='completed')preview.append(copy);
   preview.append(el('b',{'aria-hidden':'true'},issue?'↗':first.kind==='video'?'▷':'↗'));if(issue)preview.setAttribute('aria-label',issue.title+'. '+issue.reason+'. Открыть работу');card.append(preview);
   if(issue||display.status==='completed')card.append(readyPromptControl(display.prompt||first.prompt));
   const billing=issue&&projectBillingLabel(display);if(billing)copy.append(el('small',{className:'ready-billing-status'},billing));
   if(display.status==='completed'&&source)card.append(window.anisProjectActions.createControls(display));
   else if(PROJECT_TERMINAL.includes(display.status)){
    const actions=window.anisProjectActions.createControls(display,{deleteOnly:true});actions.classList.add('ready-project-corner-actions');card.append(actions);
   }
   next.push(card);
  }
  if(state.restoring||state.historyLoading){const note=el('p',{className:'note ready-history-status',role:'status'},'Загружаем твои работы…');next.unshift(note);}
  else if(state.historyError){const note=el('div',{className:'studio-ready-empty ready-history-status',role:'status'});note.append(el('p',{},state.historyError),button('Загрузить работы',()=>void resumeMediaProjects()));next.unshift(note);}
  else if(!groups.size){const empty=el('div',{className:'studio-ready-empty'});empty.append(el('strong',{},'Здесь будут твои фото и видео'),el('p',{},'Создай первую работу — она появится здесь.'),button('Создать фото',()=>openView('studio'),true));next.push(empty);}
  for(const child of [...readyGrid.children])if(!next.includes(child))child.remove();for(const [index,child]of next.entries())if(readyGrid.children[index]!==child)readyGrid.insertBefore(child,readyGrid.children[index]||null);
 }
 const resultLoads=new WeakMap();
 loadStudioProjectResult=function(p){
  if(resultLoads.has(p))return resultLoads.get(p);
  if(p.media?.file?.size)return Promise.resolve(p.media);
  // Register before rendering: room and gallery renders can request this same file.
  const task=Promise.resolve().then(async()=>{
   p.loading=true;if(selectedStudioProject===p.id&&room.open)renderProjectRoom();else updateProjectDock();
   try{
    const downloaded=await window.anisProjectActions.downloadMediaBlob(p);
    let blob=downloaded;
    if(p.region){if(!p.regionOriginalFile)throw Error('Чтобы собрать результат без изменения остального фото, нужен оригинал с этого устройства. Не создавай заказ заново.');blob=await compositeRegion(p,blob);}
    // Publish the decoded file immediately; saving to storage must not hold up previews.
    p.media=mediaFromBlob(p.kind,blob);p.mediaBlob=blob;p.error=null;generatedMedia[p.kind]=p.media;
    p.resolutionPending=!!window.anisMediaQuality?.presets?.[p.quality];
    if(selectedStudioProject===p.id&&room.open)renderProjectRoom();else updateProjectDock();
    void window.anisProjectActions.ensureProjectPreview(p).then(()=>{updateProjectDock();persistStudioProjects();}).catch(error=>{p.previewError=error.message;updateProjectDock();});
    generatedMedia[p.kind]=p.media;invalidateUsageStats();persistStudioProjects();
    if(selectedStudioProject===p.id)room.querySelector('.anis-inline-error')?.remove();
    return p.media;
   }catch(error){p.error=p.region?readableMediaError(error):(p.kind==='image'?'Фото':'Видео')+' готово, но файл не загрузился. Повтори загрузку — новый заказ не создаётся.';}
   finally{p.loading=false;resultLoads.delete(p);if(selectedStudioProject===p.id&&room.open)renderProjectRoom();else updateProjectDock();if(!p.media&&selectedStudioProject===p.id&&room.open)queueMicrotask(()=>window.anisProjectActions.showLoadError(p));}
  });resultLoads.set(p,task);return task;
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
  if(state.restoring)return Promise.resolve();
  if(!initData||!user){state.historyError='Открой ANIS AI через бота в Telegram, чтобы загрузить свои работы.';updateProjectDock();return Promise.resolve();}
  return resumePromise??=(async()=>{
   state.historyLoading=true;state.historyError=null;updateProjectDock();
   const kinds=['image','video'],results=await Promise.allSettled(kinds.map(kind=>mediaJSON({action:'media-history',kind},15000)));
   let failure;for(const [index,result]of results.entries()){
    if(result.status==='rejected'){failure=result.reason;continue;}
    const kind=kinds[index],rows=result.value.items||[];
    for(const row of [...rows].reverse()){
     if(!row.jobId)continue;
     let p=studioProjects.get(row.jobId);if(!p){p={id:row.jobId,kind,order:++projectCounter,created:Date.parse(row.createdAt?.replace(' ','T')+'Z')||Date.now(),prompt:row.prompt,quality:row.quality,ratio:row.ratio,duration:row.duration};studioProjects.set(p.id,p);}
     Object.assign(p,{groupId:row.groupId||p.groupId||p.id,status:p.media?'completed':row.status,resultUrl:row.url||p.resultUrl,expiresAt:row.expiresAt||p.expiresAt,error:row.error,region:p.region||row.region,billing:row.billing||p.billing});
    }
   }
   try{await window.anisProjectActions.restorePreviews([...studioProjects.values()]);}catch{}state.historyLoading=false;state.historyLoaded=!failure;
   if(failure)state.historyError=failure.status===401?'Не удалось подтвердить вход. Закрой приложение и открой его через бота ANIS AI.':'Не удалось загрузить все работы. Проверь соединение и попробуй ещё раз.';
   for(const p of studioProjects.values())if(['submitting','creating','pending','processing','unknown'].includes(p.status))void recoverProject(p);
   void pumpStudioQueue();updateProjectDock();window.anisProjectActions.refreshGallery();persistStudioProjects();
  })().finally(()=>resumePromise=null);
 };

 // Scrolling from the landing content into messages is also entering the chat.
 function syncChatScrollNavigation(){
  const chat=currentView==='chat',inConversation=isChatConversationVisible();
  if(inConversation)chatOpenedThisSession=true;
  $('homePrivacyBar').classList.toggle('hidden',!chat);
  $('homePrivacyBar').classList.toggle('chat-privacy-bar',inConversation);
  $('collapseChatButton').classList.toggle('hidden',!inConversation);
  $('returnToChatButton').classList.toggle('hidden',!(chat&&showWelcome&&returnToChatAvailable&&!inConversation));
 }
 const welcomeUpdateOriginal=updateWelcome;
 updateWelcome=function(){welcomeUpdateOriginal();syncChatScrollNavigation();requestAnimationFrame(syncChatScrollNavigation);};
 $('collapseChatButton').querySelector('span').textContent='Свернуть чат';
 let chatNavigationFrame=0;
 function scheduleChatScrollNavigation(){cancelAnimationFrame(chatNavigationFrame);chatNavigationFrame=requestAnimationFrame(syncChatScrollNavigation);}
 $('app').addEventListener('scroll',scheduleChatScrollNavigation,{passive:true});window.addEventListener('resize',scheduleChatScrollNavigation);window.visualViewport?.addEventListener('resize',scheduleChatScrollNavigation);

 // Each normal conversation has its own server context and per-account cache.
 // Conversation data stays intact; the main screen owns chat navigation again.
 const threadSelect=el('select');
 function chatLocked(){return busy||recording||openingMic||transcribing||orbVoiceActive;}
 function renderThreads(){threadSelect.replaceChildren();const rows=state.threads.length?state.threads:[{id:'legacy',title:'Первый чат'}];for(const t of rows)threadSelect.append(el('option',{value:t.id},t.title));threadSelect.value=state.activeChatId;}
 async function refreshThreads(){if(!initData||!user)return;const data=await mediaJSON({action:'chat-thread-list'});state.threads=data.threads||[];write('threads',state.threads);if(!state.threads.some(t=>t.id===state.activeChatId))state.activeChatId='legacy';renderThreads();}
 saveCache=function(){write('chat:'+state.activeChatId,cleanHistory(normalHistory));};
 loadHistory=async function(){
  if(!initData||!user||anonymous||busy||historyLoading)return;
  const id=state.activeChatId;historyLoading=true;
  try{const data=await api({action:'history',threadId:id},20000);if(!Array.isArray(data.messages))throw Error('Не удалось прочитать историю. Попробуй ещё раз.');if(id===state.activeChatId&&!busy){if(data.messages.length||!normalHistory.length)normalHistory=cleanHistory(data.messages);saveCache();historyLoaded=true;updateWelcome();if(!anonymous)renderChat();}}
  catch(error){explain(error,()=>loadHistory(),'Загрузить разговор');}finally{historyLoading=false;}
 };
 async function switchThread(id){
  if(chatLocked()||historyLoading){threadSelect.value=state.activeChatId;toast('Сначала заверши текущее действие.');return;}
  saveCache();state.activeChatId=id;localStorage.setItem(key('thread'),id);threadSelect.value=id;
  if(anonymous)toggleAnonymous();normalHistory=cleanHistory(read('chat:'+id,[]));historyLoaded=false;showWelcome=!normalHistory.length;renderChat();void loadHistory();
 }
 threadSelect.onchange=()=>void switchThread(threadSelect.value);
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
 state.regionButton=button('',()=>{document.activeElement?.blur();if(studioImageFile)void openRegion();else pickStudioPhoto(true);});
 state.regionButton.id='imagePromptPencil';state.regionButton.className='media-prompt-pencil';state.regionButton.title='Карандаш — выделить область';state.regionButton.setAttribute('aria-label','Карандаш — выделить область');state.regionButton.setAttribute('aria-haspopup','dialog');
 state.regionButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></svg>';$('imagePromptMic').before(state.regionButton);
 $('imageFile').addEventListener('cancel',()=>{state.regionAfterUpload=false;});

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
 function updateRegionButton(){if(!state.regionButton)return;state.regionButton.disabled=$('makeImage').disabled;state.regionButton.title=state.region?'Карандаш — изменить выделение':'Карандаш — выделить область';state.regionButton.setAttribute('aria-label',state.regionButton.title);state.regionButton.classList.toggle('anis-region-active',!!state.region);}
 async function imageFor(file){const url=URL.createObjectURL(file),img=new Image();try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Не удалось открыть фото.'));img.src=url;});return img;}finally{URL.revokeObjectURL(url);}}
 async function openRegion(){if(!studioImageFile)return toast('Сначала добавь фото.');try{regionImage=await imageFor(studioImageFile);const scale=Math.min(1,1200/Math.max(regionImage.naturalWidth,regionImage.naturalHeight));regionCanvas.width=Math.round(regionImage.naturalWidth*scale);regionCanvas.height=Math.round(regionImage.naturalHeight*scale);regionPoints=state.region?.points.map(p=>({...p}))||[];drawRegion();regionDialog.showModal();}catch(error){explain(error);}}
 async function cropRegion(file,region){const img=await imageFor(file),b=region.bounds,c=document.createElement('canvas');c.width=Math.max(1,Math.round(b.w*img.naturalWidth));c.height=Math.max(1,Math.round(b.h*img.naturalHeight));c.getContext('2d').drawImage(img,b.x*img.naturalWidth,b.y*img.naturalHeight,b.w*img.naturalWidth,b.h*img.naturalHeight,0,0,c.width,c.height);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw Error('Не удалось подготовить выделение.');return new File([blob],'selected-area.png',{type:'image/png'});}
 async function compositeRegion(p,blob){const original=await imageFor(p.regionOriginalFile),changed=await imageFor(blob),c=document.createElement('canvas');c.width=original.naturalWidth;c.height=original.naturalHeight;const ctx=c.getContext('2d'),r=p.region,b=r.bounds||{x:Math.min(...r.points.map(q=>q.x)),y:Math.min(...r.points.map(q=>q.y))};if(!b.w||!b.h)throw Error('Не удалось восстановить выделение. Открой проект на исходном устройстве.');ctx.drawImage(original,0,0);ctx.save();ctx.beginPath();r.points.forEach((q,i)=>ctx[i?'lineTo':'moveTo'](q.x*c.width,q.y*c.height));ctx.closePath();ctx.clip();ctx.drawImage(changed,b.x*c.width,b.y*c.height,b.w*c.width,b.h*c.height);ctx.restore();const result=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!result)throw Error('Не удалось собрать фото.');return result;}
 const generateOriginal=generateMedia;
 generateMedia=async function(kind){
  if(kind!=='image'||!state.region)return generateOriginal(kind);
  if(mediaVoiceTask)return toast('Сначала заверши голосовой ввод.');
  const original=studioImageFile,region=structuredClone(state.region),prompt=$('imagePrompt').value.trim();if(prompt.length<3)return toast('Напиши, что изменить в выделенной области.');
  try{const crop=await cropRegion(original,region);return createStudioVariant({kind:'image',consumeDraft:true,prompt,providerPrompt:prompt.length<1100?'Измени только этот фрагмент по описанию. Сохрани композицию и положение объектов: '+prompt:prompt,sourceFile:crop,regionOriginalFile:original,region,quality:$('imageQuality').value,ratio:$('imageRatio').value});}catch(error){explain(error);}
 };

 // A reachable action bar follows the actual visual viewport above the phone keyboard.
 const keyboardBar=el('div',{id:'studioKeyboardBar',hidden:true}),keyboardDone=button('✓',finishStudioIdea);
 keyboardDone.setAttribute('aria-label','Закрыть клавиатуру');keyboardDone.title='Готово';
 keyboardBar.append(keyboardDone);document.body.append(keyboardBar);
 let studioViewportHeight=window.innerHeight,studioKeyboardFrame=0,studioRevealPending=false,studioVisibleHeight=0,pinnedStudioPrompt=null,pendingStudioSettings=null;
 function unpinStudioPrompt(){
  if(!pinnedStudioPrompt)return;const {box,placeholder,style}=pinnedStudioPrompt;box.classList.remove('studio-prompt-pinned');box.style.cssText=style;placeholder.remove();pinnedStudioPrompt=null;
 }
 function finishStudioIdea(){
  const field=document.activeElement;
  if(['imagePrompt','videoPrompt'].includes(field?.id))pendingStudioSettings={view:field.id==='imagePrompt'?'studio':'video',height:Math.max(studioViewportHeight,window.innerHeight),expires:Date.now()+2500};
  field?.blur();for(const delay of [0,180,360,700])setTimeout(()=>scheduleStudioKeyboard(),delay);
 }
 function revealStudioSettings(){
  const pending=pendingStudioSettings;if(!pending)return;
  if(currentView!==pending.view||Date.now()>pending.expires){pendingStudioSettings=null;return;}
  const viewport=window.visualViewport,visible=viewport?.height||window.innerHeight;
  if(visible<pending.height-80)return;
  const settings=$('view-'+pending.view).querySelector('.media-settings'),scroller=$('app');if(!settings)return;
  pendingStudioSettings=null;
  scroller.scrollTo({top:Math.max(0,scroller.scrollTop+settings.getBoundingClientRect().top-scroller.getBoundingClientRect().top-16),behavior:'smooth'});
 }
 function pinStudioPrompt(field,top,bottom,visibleHeight){
  const box=field.closest('.studio-prompt-box,.project-agent');if(!box)return;
  if(pinnedStudioPrompt?.box!==box){
   unpinStudioPrompt();const rect=box.getBoundingClientRect(),placeholder=el('div',{className:'studio-prompt-placeholder'}),computed=getComputedStyle(box);
   placeholder.style.height=(rect.height+parseFloat(computed.marginTop||0)+parseFloat(computed.marginBottom||0))+'px';box.before(placeholder);
   pinnedStudioPrompt={box,placeholder,style:box.style.cssText,left:rect.left,width:rect.width};box.classList.add('studio-prompt-pinned');
  }
  box.style.left=pinnedStudioPrompt.left+'px';box.style.width=pinnedStudioPrompt.width+'px';box.style.maxHeight=Math.max(100,visibleHeight-80)+'px';
  const height=box.getBoundingClientRect().height,promptTop=Math.max(top+56,bottom-height-8);box.style.top=promptTop+'px';keyboardBar.style.top=Math.max(top+6,promptTop-48)+'px';
 }
 function keyboardLayout(reveal=false){
  const field=document.activeElement,v=window.visualViewport,focused=['imagePrompt','videoPrompt','projectAgentIdea'].includes(field?.id);
  const keyboardHost=focused?field.closest('dialog[open]')||document.body:document.body;if(keyboardBar.parentElement!==keyboardHost)keyboardHost.append(keyboardBar);
  document.body.classList.toggle('studio-typing',focused);
  if(!focused){unpinStudioPrompt();revealStudioSettings();if(!pendingStudioSettings)studioViewportHeight=window.innerHeight;studioVisibleHeight=0;keyboardBar.hidden=true;document.body.classList.remove('project-agent-typing');document.documentElement.style.removeProperty('--studio-keyboard-inset');document.documentElement.style.removeProperty('--studio-visible-height');document.documentElement.style.removeProperty('--studio-visible-bottom');requestAnimationFrame(moveGlider);return;}
  const top=v?.offsetTop||0,visibleHeight=Math.min(v?.height||window.innerHeight,tg?.viewportHeight||window.innerHeight),bottom=top+visibleHeight;
  const inset=Math.max(0,studioViewportHeight-visibleHeight,window.innerHeight-bottom);
  document.documentElement.style.setProperty('--studio-keyboard-inset',inset+'px');
  document.documentElement.style.setProperty('--studio-visible-height',visibleHeight+'px');
  document.documentElement.style.setProperty('--studio-visible-bottom',bottom+'px');
  document.body.classList.toggle('project-agent-typing',field.id==='projectAgentIdea'&&room.open&&inset>=80);
  keyboardBar.hidden=inset<80;
  keyboardBar.style.top=(bottom-52)+'px';
  if(inset>=80){pinStudioPrompt(field,top,bottom,visibleHeight);return;}
  unpinStudioPrompt();
  const resized=Math.abs(visibleHeight-studioVisibleHeight)>8;studioVisibleHeight=visibleHeight;
  // Viewport panning follows the caret on iOS; it must not trigger another scroll.
  if(!reveal&&!resized)return;
  const box=field.closest('.studio-prompt-box,.project-agent')||field,rect=box.getBoundingClientRect(),fieldRect=field.getBoundingClientRect();
  if(inset<80)return;
  const upper=field.id==='projectAgentIdea'?Math.max(top+16,room.getBoundingClientRect().top+roomHeader.getBoundingClientRect().height+16):top+16,lower=bottom-16,available=Math.max(80,lower-upper),target=rect.height<=available?rect:fieldRect;
  // An already visible prompt stays exactly where the user placed it.
  let delta=0;
  if(target.top<upper)delta=target.top-upper;
  else if(target.bottom>lower)delta=target.bottom-lower;
  if(Math.abs(delta)>8){const scroller=field.closest('dialog[open]')||$('app');scroller?.scrollBy({top:delta,behavior:'instant'});}
 }
 function scheduleStudioKeyboard(reveal=false){studioRevealPending=studioRevealPending||reveal===true;cancelAnimationFrame(studioKeyboardFrame);studioKeyboardFrame=requestAnimationFrame(()=>{const pending=studioRevealPending;studioRevealPending=false;keyboardLayout(pending);});}
 document.addEventListener('focusin',()=>{scheduleStudioKeyboard(true);setTimeout(()=>scheduleStudioKeyboard(true),250);setTimeout(()=>scheduleStudioKeyboard(true),500);});document.addEventListener('focusout',()=>setTimeout(scheduleStudioKeyboard,0));window.visualViewport?.addEventListener('resize',scheduleStudioKeyboard);window.visualViewport?.addEventListener('scroll',()=>scheduleStudioKeyboard());window.addEventListener('resize',scheduleStudioKeyboard);tg?.onEvent?.('viewportChanged',()=>scheduleStudioKeyboard());
 // Hidden navigation has zero-sized buttons; never collapse its selection into a border sliver.
 const originalMoveGlider=moveGlider;
 moveGlider=function(){const active=$('bottomNav')?.querySelector('button.active');if(active?.getBoundingClientRect().width>0)originalMoveGlider();};
 window.removeEventListener('resize',originalMoveGlider);window.addEventListener('resize',moveGlider);
 if(typeof ResizeObserver==='function')new ResizeObserver(()=>requestAnimationFrame(moveGlider)).observe($('bottomNav'));
 // Keep focus until click: otherwise blur would hide the action before pointerup.
 keyboardBar.addEventListener('pointerdown',e=>e.preventDefault());

 // Version checks are cheap and never reload while a user is composing or uploading.
 let nextVersion=null,updating=false,releaseCheckPromise=null,releaseApplyTimer=0,releaseBackoffUntil=0;
 const updateHandoffKey=key('update-handoff');
 function safeToUpdate(){
  const focused=document.activeElement,tag=focused?.tagName;
  const editing=focused?.isContentEditable||tag==='TEXTAREA'||tag==='SELECT'||tag==='INPUT'&&!['button','submit','checkbox','radio','range','file','hidden'].includes(focused.type);
  return !document.hidden&&navigator.onLine!==false&&!state.restoring&&!state.fileDraftsLoading&&!state.historyLoading&&!historyLoading&&!creationLock&&
   ![...studioProjects.values()].some(p=>['submitting','creating'].includes(p.status)||p.loading)&&
   !busy&&!recording&&!openingMic&&!transcribing&&!orbVoiceActive&&!mediaVoiceTask&&!stagedMediaAttachment&&
   !(anonymous&&(anonymousHistory.length||$('messageInput').value.trim()))&&
   !document.querySelector('dialog[open],.ready-project-action[aria-busy="true"]')&&!editing;
 }
 function takeUpdateHandoff(){
  try{const raw=sessionStorage.getItem(updateHandoffKey);sessionStorage.removeItem(updateHandoffKey);const data=JSON.parse(raw||'null');
   return data&&data.version===document.querySelector('meta[name="anis-build"]')?.content&&data.expiresAt>Date.now()&&data.expiresAt<Date.now()+120000?data:null;
  }catch{return null;}
 }
 async function applyRelease(){
  if(updating||!nextVersion||Date.now()<releaseBackoffUntil||!safeToUpdate())return;
  updating=true;
  try{
   saveDrafts();
   const saved=read('drafts',null),expected={};for(const id of draftIds)if($(id))expected[id]=id==='messageInput'&&anonymous?'':$(id).value;
   if(!saved||JSON.stringify(saved.values)!==JSON.stringify(expected))throw Error('Черновик ещё не сохранён');
   const hasFiles=!!(studioImageFile||studioVideoFile||studioVideoIdentityFile);
   try{await saveFileDrafts();}catch(error){if(hasFiles)throw error;}
   const durable=await saveDurable();
   if(!durable&&[...studioProjects.values()].some(p=>p.sourceFile||p.identityFile||p.regionOriginalFile||p.media?.blob||p.mediaBlob))throw Error('Файлы ещё не сохранены');
   // The user may start a new action while IndexedDB commits the snapshot.
   if(!safeToUpdate()){updating=false;return;}
   const handoff={version:nextVersion,expiresAt:Date.now()+60000,view:currentView,showWelcome,newestFirstChat,returnToChatAvailable,chatOpenedThisSession,anonymous,scrollTop:$('app').scrollTop};
   const serialized=JSON.stringify(handoff);sessionStorage.setItem(updateHandoffKey,serialized);
   if(sessionStorage.getItem(updateHandoffKey)!==serialized)throw Error('Не удалось сохранить состояние');
   const url=new URL(location.href);url.searchParams.set('v',nextVersion);location.replace(url.href);
  }catch{updating=false;releaseBackoffUntil=Date.now()+15000;storageWarning();}
 }
 function scheduleReleaseApply(){if(!nextVersion||updating)return;clearTimeout(releaseApplyTimer);releaseApplyTimer=setTimeout(()=>void applyRelease(),150);}
 function checkRelease(){
  if(document.hidden||navigator.onLine===false)return Promise.resolve();
  return releaseCheckPromise??=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
   try{const response=await fetch('/release.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});if(!response.ok)return;
    const data=await response.json(),current=document.querySelector('meta[name="anis-build"]')?.content;
    if(/^[a-f0-9]{12,64}$/.test(data.version)){nextVersion=data.version===current?null:data.version;scheduleReleaseApply();}
   }catch{}finally{clearTimeout(timer);}
  })().finally(()=>releaseCheckPromise=null);
 }
 const controlsUpdateBeforeRelease=updateControls;
 updateControls=function(...args){const result=controlsUpdateBeforeRelease(...args);scheduleReleaseApply();return result;};
 document.addEventListener('focusout',scheduleReleaseApply);document.addEventListener('close',scheduleReleaseApply,true);
 window.addEventListener('focus',()=>{scheduleReleaseApply();void checkRelease();});window.addEventListener('online',()=>{scheduleReleaseApply();void checkRelease();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){scheduleReleaseApply();void checkRelease();}});
 setInterval(()=>void checkRelease(),15000);
 setInterval(()=>{if(nextVersion&&!updating)void applyRelease();},1000);

 async function start(){
  const updateHandoff=takeUpdateHandoff();
  const drafts=read('drafts',null);if(drafts)for(const [id,value]of Object.entries(drafts.values||{}))if($(id))$(id).value=id.endsWith('Quality')?({fast:'fhd',high:id==='imageQuality'?'qhd':'fhd',max:'uhd'}[value]||value):value;
  syncQualityFormats();
  let rows=[];for(const name of [studioProjectKey()+':backup',studioProjectKey()])try{rows=mergeProjectRecords(rows,JSON.parse(localStorage.getItem(name)||'[]'));}catch{storageWarning();}
  const restoreRows=records=>{for(const row of mergeProjectRecords(records,[...studioProjects.values()].map(projectRecord))){const p={...row};if(p.mediaBlob){p.media=studioProjects.get(p.id)?.media||mediaFromBlob(p.kind,p.mediaBlob);Object.assign(p.media,{width:p.outputWidth,height:p.outputHeight,warning:p.resolutionWarning});}studioProjects.set(p.id,p);projectCounter=Math.max(projectCounter,p.order||0);}};
  restoreRows(rows);
  try{rows=mergeProjectRecords(await dbRecord('projects'),rows);restoreRows(rows);}catch{storageWarning();}
  state.restoring=false;updateRegionButton();updateProjectDock();
  persistStudioProjects();
  state.fileDraftsLoading=true;
  let fileDraftsRestored=false;
  void dbRecord('files').then(async files=>{if(!files)return;const [image,video,identity]=await Promise.all([files.image,files.video,files.identity].map(restoreDraftFile));if(image&&!studioImageFile)setStudioPhoto(image);if(video&&!studioVideoFile)setStudioVideo(video);if(identity&&!studioVideoIdentityFile)setVideoIdentity(identity);state.region=state.region||files.region||null;updateRegionButton();fileDraftsRestored=true;}).catch(storageWarning).finally(()=>{state.fileDraftsLoading=false;clearSubmittedPromptDrafts();if(fileDraftsRestored)void saveFileDrafts().catch(storageWarning);scheduleReleaseApply();});
  state.threads=read('threads',[]);renderThreads();normalHistory=cleanHistory(read('chat:'+state.activeChatId,normalHistory));renderChat();
  // Restore draft contents, never the previously open screen.
  if(updateHandoff){
   // Only an automatic update resumes its screen; a normal launch still opens home.
   anonymous=!!updateHandoff.anonymous;$('anonToggle').classList.toggle('on',anonymous);$('anonToggle').setAttribute('aria-checked',String(anonymous));$('modeText').textContent=anonymous?'История не сохраняется':'История сохраняется';
   showWelcome=!!updateHandoff.showWelcome;newestFirstChat=!!updateHandoff.newestFirstChat;returnToChatAvailable=!!updateHandoff.returnToChatAvailable;chatOpenedThisSession=!!updateHandoff.chatOpenedThisSession;
   if(['chat','studio','video','templates','ready','profile','history','statistics','balance'].includes(updateHandoff.view))openView(updateHandoff.view);
   requestAnimationFrame(()=>{$('app').scrollTop=Math.max(0,Number(updateHandoff.scrollTop)||0);});
  }
  void refreshThreads().catch(()=>{}).then(()=>loadHistory());
  if(initData&&user)void mediaJSON({action:'notification-get'}).then(data=>notifyToggle.checked=data.enabled).catch(()=>{});
  void resumeMediaProjects();void checkRelease();
 }
 void start();
 window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  document.activeElement?.blur();document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  showWelcome=true;chatOpenedThisSession=false;returnToChatAvailable=false;newestFirstChat=true;openView('home');
 });
})();


