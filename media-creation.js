/* Creation footer. Prices come from the same authenticated server quote used for billing. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),dock=document.createElement('div');
 dock.id='mediaCreateDock';dock.hidden=true;dock.setAttribute('aria-label','Создание фото или видео');
 const back=document.createElement('button');back.type='button';back.className='media-create-home';back.setAttribute('aria-label','Вернуться в главное меню');back.title='Главное меню';
 back.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
 back.onclick=()=>openView('home');dock.append(back);
 const states=new Map(),cache=new Map(),fileIds=new WeakMap(),durations=new WeakMap();let fileCounter=0;
 const fileId=file=>{if(!file)return 0;if(!fileIds.has(file))fileIds.set(file,++fileCounter);return fileIds.get(file);};
 const key=s=>JSON.stringify([s.kind,s.model||'auto',s.quality,s.ratio,s.duration??0,s.providerPrompt||s.prompt||'',fileId(s.sourceFile)]);
 const coinWord=n=>n%10===1&&n%100!==11?'аниум':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'аниума':'аниумов';
 function snapshot(kind){
  return {kind,consumeDraft:true,model:$(kind==='image'?'imageModel':'videoModel')?.value||'auto',quality:$(kind+'Quality').value,ratio:$(kind+'Ratio').value,duration:kind==='video'?Number($('duration').value):undefined,prompt:$(kind+'Prompt').value.trim()||window.anisProjectActions?.enhancementPrompt?.(kind)||'',sourceFile:kind==='image'?studioImageFile:studioVideoFile};
 }
 async function quoteSnapshot(s,{fresh=false}={}){
  const k=key(s),saved=cache.get(k);if(!fresh&&saved&&Date.now()-saved.time<60000)return saved.quote;
  let sourceDuration=0;
  if(s.sourceFile?.type.startsWith('video/')&&window.anisVideoModels?.settings[s.model]?.motion){
   if(!durations.has(s.sourceFile))durations.set(s.sourceFile,window.anisMediaQuality.inspectVideo(s.sourceFile).catch(error=>{durations.delete(s.sourceFile);throw error;}));
   sourceDuration=(await durations.get(s.sourceFile)).duration;
  }
  const quote=await mediaJSON({action:'media-quote',kind:s.kind,model:s.model||'auto',quality:s.quality,ratio:s.ratio,duration:s.duration,prompt:s.providerPrompt||s.prompt||'',sourceType:s.sourceFile?.type||'',sourceDuration},15000);
  if(!quote.enabled||!quote.requiresVideo&&(!Number.isSafeInteger(quote.amount)||quote.amount<=0))throw Error('Стоимость пока недоступна. Повтори попытку.');
  cache.set(k,{time:Date.now(),quote});if(cache.size>80)cache.delete(cache.keys().next().value);return quote;
 }
 function render(state,phase,quote=null,message=''){
  state.phase=phase;state.quote=quote;state.message=message;
  const automatic=snapshot(state.kind).model==='auto',models=(state.kind==='image'?window.anisImageModels:window.anisVideoModels)?.models;
  const model=models?.find(model=>model.id===quote?.model);
  state.autoModel.hidden=!automatic;
  state.autoModel.textContent=automatic?(model?'Модель: '+model.name:phase==='loading'?'Подбираем модель…':'Модель пока недоступна'):'';
  state.button.classList.toggle('price-pending',phase==='loading');state.button.setAttribute('aria-disabled',String(phase!=='ready'));
  state.price.textContent=phase==='ready'?quote.amount.toLocaleString('ru-RU'):phase==='loading'?'…':'—';
  state.button.setAttribute('aria-label',(state.kind==='image'?'Создать фото':'Создать видео')+(phase==='ready'?', '+quote.amount+' '+coinWord(quote.amount):phase==='needs-video'?', добавь видео для расчёта':', стоимость рассчитывается'));
  state.button.title=message||(quote?.billableSeconds&&window.anisVideoModels?.settings[snapshot(state.kind).model]?.motion?'Стоимость за '+quote.billableSeconds+' сек. исходного видео':'');
 }
 async function update(kind,fresh=false){
  const state=states.get(kind);if(!state)return;clearTimeout(state.timer);
  const s=snapshot(kind),k=key(s),epoch=++state.epoch;state.key=k;
  render(state,'loading');
  try{
   const q=await quoteSnapshot(s,{fresh});if(epoch!==state.epoch||key(snapshot(kind))!==k)return;
   render(state,q.requiresVideo?'needs-video':'ready',q,q.requiresVideo?'Добавь видео и фото персонажа, чтобы рассчитать стоимость.':'');
  }catch(error){if(epoch===state.epoch&&key(snapshot(kind))===k)render(state,'error',null,readableMediaError(error));}
 }
 function schedule(kind,delay=100){
  const state=states.get(kind);if(!state)return;clearTimeout(state.timer);state.epoch++;state.key=key(snapshot(kind));render(state,'loading');state.timer=setTimeout(()=>void update(kind),delay);
 }
 for(const kind of ['image','video']){
  const button=$(kind==='image'?'makeImage':'makeVideo'),label=$(kind==='image'?'studioCreateLabel':'videoCreateLabel');
  const badge=document.createElement('span');badge.className='media-create-price';badge.setAttribute('aria-live','polite');badge.setAttribute('aria-atomic','true');
  const coin=document.createElement('img');coin.src='anium-coin-v1.webp';coin.width=28;coin.height=28;coin.alt='';coin.setAttribute('aria-hidden','true');
  const value=document.createElement('span');value.className='media-create-price-value';value.textContent='…';badge.append(coin,value);
  button.replaceChildren(label,badge);button.hidden=true;dock.append(button);
  const autoModel=document.createElement('p');autoModel.id=kind+'AutoModel';autoModel.className='media-auto-model';autoModel.hidden=true;autoModel.setAttribute('role','status');autoModel.setAttribute('aria-live','polite');
  document.querySelector('#view-'+(kind==='image'?'studio':'video')+' .media-settings').insertAdjacentElement('afterend',autoModel);
  const state={kind,button,price:value,autoModel,epoch:0,phase:'loading',quote:null};states.set(kind,state);
  button.addEventListener('click',event=>{
   if(state.phase==='ready')return;
   event.preventDefault();event.stopImmediatePropagation();
   toast(state.message||'Рассчитываем стоимость. Подожди немного.');if(state.phase==='error')void update(kind,true);
  },true);
 }
 document.body.append(dock);
 function sync(){
  const kind=currentView==='studio'?'image':currentView==='video'?'video':null;
  document.body.classList.toggle('media-creation-active',!!kind);dock.hidden=!kind;
  for(const [name,state]of states)state.button.hidden=name!==kind;
  if(kind){const state=states.get(kind);if(state.key!==key(snapshot(kind))||!state.quote)schedule(kind,0);}
 }
 const originalOpenView=openView;openView=function(...args){const result=originalOpenView(...args);sync();return result;};
 document.addEventListener('change',event=>{const id=event.target.id;if(['imageModel','imageQuality','imageRatio'].includes(id))schedule('image',0);if(['videoModel','videoQuality','videoRatio','duration'].includes(id))schedule('video',0);});
 document.addEventListener('input',event=>{if(event.target.id==='imagePrompt')schedule('image',300);if(event.target.id==='videoPrompt')schedule('video',300);});
 for(const [name,kind]of [['setStudioPhoto','image'],['clearStudioPhoto','image'],['setStudioVideo','video'],['clearStudioVideo','video']]){
  const original=window[name];window[name]=function(...args){const result=original(...args);schedule(kind,80);return result;};
 }
 window.addEventListener('focus',()=>{const kind=currentView==='studio'?'image':currentView==='video'?'video':null;if(kind)void update(kind,true);});
 window.anisMediaPricing={quoteSnapshot,sync,refresh:kind=>update(kind,true),displayed(s,q){const state=states.get(s.kind);return !!s.consumeDraft&&state?.phase==='ready'&&state.key===key(s)&&state.quote.amount===q.amount&&state.quote.version===q.version&&state.quote.model===q.model;}};
 sync();
})();
