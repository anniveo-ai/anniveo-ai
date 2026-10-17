/* Live Polza video models, verified 2026-10-17. Keep settings in sync with worker.js. */
(()=>{
 'use strict';
 const settings={"bytedance/seedance-2-mini":{"qualities":{"480p":"480p","720p":"720p"},"durations":[4,5,6,7,8,9,10,11,12,13,14,15],"ratios":["16:9","9:16","1:1"],"video":true,"identity":true,"audio":"generate_audio"},"bytedance/seedance-2-5":{"qualities":{"480p":"480p","720p":"720p"},"durations":[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30],"ratios":["16:9","9:16","1:1"],"video":true,"identity":true,"audio":"generate_audio","numericDuration":true},"bytedance/seedance-2-fast":{"qualities":{"480p":"480p","720p":"720p"},"durations":[4,5,6,7,8,9,10,11,12,13,14,15],"ratios":["16:9","9:16","1:1"],"video":true,"identity":true,"audio":"generate_audio","numericDuration":true},"bytedance/seedance-2":{"qualities":{"480p":"480p","720p":"720p","1080p":"1080p"},"durations":[4,5,6,7,8,9,10,11,12,13,14,15],"ratios":["16:9","9:16","1:1"],"video":true,"identity":true,"audio":"generate_audio","numericDuration":true},"bytedance/seedance-1.5-pro":{"qualities":{"480p":"480p","720p":"720p","1080p":"1080p"},"durations":[4,8,12],"ratios":["16:9","9:16","1:1"],"audio":"generate_audio"},"grok-imagine-video-1-5":{"qualities":{"480p":"480p","720p":"720p"},"durations":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"ratios":["16:9","9:16","1:1"]},"kling/v2.6":{"qualities":{"native":null},"durations":[5,10],"ratios":["16:9","9:16","1:1"],"audio":"sound","promptMax":1000},"kling/v3":{"qualities":{"std":"std","pro":"pro","4K":"4K"},"durations":[3,4,5,6,7,8,9,10,11,12,13,14,15],"ratios":["16:9","9:16","1:1"],"mode":true,"audio":"sound"},"kling/v2.6-motion-control":{"qualities":{"720p":"720p","1080p":"1080p"},"durations":[0],"ratios":["source"],"video":true,"identity":true,"motion":true,"mode":true},"kling/v3-motion-control":{"qualities":{"720p":"720p","1080p":"1080p"},"durations":[0],"ratios":["source"],"video":true,"identity":true,"motion":true,"mode":true},"wan/2.5":{"qualities":{"720p":"720p","1080p":"1080p"},"durations":[5,10],"ratios":["16:9","9:16","1:1"],"promptMax":800},"wan/2.6":{"qualities":{"720p":"720p","1080p":"1080p"},"durations":[5,10,15],"ratios":["source"],"omitRatio":true},"gemini-omni-video":{"qualities":{"720p":"720p","1080p":"1080p","4k":"4k"},"durations":[4,6,8,10],"ratios":["16:9","9:16"],"video":true,"identity":true}};
 const entries=[
  ['auto','Авто','Популярные','✦','ANIS AI подберёт модель под выбранное качество.'],
  ['grok-imagine-video-1-5','Grok Video 1.5','xAI','◉','Короткие видео по описанию или фото. До 720p и 15 секунд.'],
  ['bytedance/seedance-2-mini','Seedance 2 Mini','ByteDance','▥','Видео по описанию, фото или ролику. До 720p и 15 секунд.'],
  ['bytedance/seedance-2-5','Seedance 2.5','ByteDance','▥','Создание и изменение видео с референсами. До 720p и 30 секунд.'],
  ['kling/v3','Kling 3','Kling','◈','Режимы Standard, Pro и 4K. По описанию или первому кадру.'],
  ['bytedance/seedance-2-fast','Seedance 2 Fast','ByteDance','▥','Ускоренная генерация по описанию, фото или видео. До 720p.'],
  ['bytedance/seedance-2','Seedance 2','ByteDance','▥','Генерация и изменение роликов. До 1080p и 15 секунд.'],
  ['bytedance/seedance-1.5-pro','Seedance V1.5 Pro','ByteDance','▥','По описанию или фото. 480p–1080p, 4, 8 или 12 секунд.'],
  ['kling/v2.6','Kling 2.6','Kling','◈','По описанию или фото. 5 или 10 секунд. Качество задаёт модель.'],
  ['kling/v2.6-motion-control','Kling 2.6 Motion Control','Kling','◈','Перенос движения: добавь видео и отдельное фото персонажа.'],
  ['kling/v3-motion-control','Kling 3 Motion Control','Kling','◈','Перенос движения из видео на персонажа с фотографии.'],
  ['wan/2.5','Wan 2.5','Alibaba','✧','По описанию или фото. 720p / 1080p, 5 или 10 секунд.'],
  ['wan/2.6','Wan 2.6','Alibaba','✧','По описанию или фото. 720p / 1080p, 5, 10 или 15 секунд. Формат задаёт модель или фото.'],
  ['gemini-omni-video','Gemini Omni Video','Google','G','Создание и изменение видео. 720p, 1080p и 4K.']
 ];
 const models=entries.map(([id,name,vendor,icon,description])=>({id,name,vendor,icon,description,settings:settings[id]}));
 const view=document.getElementById('view-video'),fields=view?.querySelector('.media-settings');if(!fields)return;
 const $=id=>document.getElementById(id),node=(tag,props={},text)=>{const n=document.createElement(tag);Object.assign(n,props);if(text!==undefined)n.textContent=text;return n;};
 const panel=node('section',{className:'image-model-picker video-model-picker'});panel.setAttribute('aria-label','Выбор нейросети для видео');
 const heading=node('div',{className:'image-model-heading'}),title=node('h3',{},'Выбор нейросети');
 const help=node('button',{type:'button',className:'image-model-help'},'?');help.setAttribute('aria-label','О выборе видеомодели');help.setAttribute('aria-expanded','false');
 const helpText=node('p',{className:'image-model-help-text',hidden:true},'Качество и длительность зависят от модели. Для изменения готового видео подойдут Seedance и Авто. Motion Control требует ролик с движением и фото персонажа. При использовании фото Kling берёт формат из первого кадра.');
 help.onclick=()=>{helpText.hidden=!helpText.hidden;help.setAttribute('aria-expanded',String(!helpText.hidden));};
 const searchButton=node('button',{type:'button',className:'image-model-search-toggle'});searchButton.setAttribute('aria-label','Поиск видеомодели');searchButton.setAttribute('aria-expanded','false');searchButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
 const search=node('input',{type:'search',className:'image-model-search',placeholder:'Найти видеомодель',hidden:true});search.setAttribute('aria-label','Название видеомодели');
 searchButton.onclick=()=>{search.hidden=!search.hidden;searchButton.setAttribute('aria-expanded',String(!search.hidden));if(!search.hidden)search.focus();else{search.value='';render();}};
 const select=node('select',{id:'videoModel',hidden:true});select.setAttribute('aria-label','Нейросеть для видео');
 for(const m of models)select.append(node('option',{value:m.id},m.name));
 const tabs=node('div',{className:'image-model-tabs',role:'group'});tabs.setAttribute('aria-label','Разработчик видеомодели');
 const rail=node('div',{className:'image-model-rail',role:'group'});rail.setAttribute('aria-label','Модели для видео');
 const caption=node('p',{className:'image-model-caption'});caption.setAttribute('aria-live','polite');
 let category='Популярные';
 const qualityLabels={fhd:'1080p · Full HD',qhd:'2K · 1440p',uhd:'4K · 2160p','480p':'480p · SD','720p':'720p · HD','1080p':'1080p · Full HD',std:'Standard · Обычное',pro:'Pro · Высокое','4K':'4K · Ультравысокое','4k':'4K · 2160p',native:'Авто · По модели'};
 function addOptions(field,values){for(const [value,label]of Object.entries(values))if(![...field.options].some(o=>o.value===value))field.append(node('option',{value},label));}
 addOptions($('videoQuality'),qualityLabels);
 addOptions($('videoRatio'),{source:'Авто · По исходнику'});
 addOptions($('duration'),Object.fromEntries([[0,'По видео · Исходная длина'],...Array.from({length:30},(_,i)=>[i+1,(i+1)+' с'])]));
 const motion=node('div',{className:'video-motion-source',hidden:true}),faceInput=node('input',{type:'file',accept:'image/jpeg,image/png,image/webp',hidden:true});
 const faceButton=node('button',{type:'button',className:'studio-replace-file'},'Добавить фото персонажа'),faceName=node('small'),faceClear=node('button',{type:'button',className:'image-model-help'},'×');
 faceButton.onclick=()=>faceInput.click();faceClear.setAttribute('aria-label','Убрать фото персонажа');
 const face=()=>typeof studioVideoIdentityFile!=='undefined'?studioVideoIdentityFile:null;
 function syncFace(){faceName.textContent=face()?.name||'Фото персонажа + ролик с движением';faceClear.hidden=!face();}
 faceInput.onchange=()=>{const f=faceInput.files?.[0];if(f){if(window.setVideoIdentity(f)===false)window.toast?.('Выбери фото JPEG, PNG или WebP до 10 МБ.');syncFace();}faceInput.value='';};
 faceClear.onclick=()=>{window.clearVideoIdentity();syncFace();};motion.append(faceButton,faceClear,faceName,faceInput);
 const supported=(field,allowed,fallback)=>{for(const option of field.options){const enabled=allowed.includes(option.value);option.hidden=!enabled;option.disabled=!enabled;}if(!allowed.includes(field.value))field.value=allowed.includes(fallback)?fallback:allowed[0];};
 function syncSettings(){
  if(!models.some(m=>m.id===select.value))select.value='auto';
  const cfg=settings[select.value],square=$('videoRatio').value==='1:1';
  supported($('videoQuality'),cfg?Object.keys(cfg.qualities):square?['fhd']:['fhd','qhd','uhd'],'720p');
  supported($('videoRatio'),cfg?cfg.ratios:['16:9','9:16','1:1'],'16:9');
  supported($('duration'),cfg?cfg.durations.map(String):['4','6','8'],'4');
  $('videoPrompt').maxLength=cfg?.promptMax||1200;
  motion.hidden=!cfg?.motion&&!face();faceButton.disabled=select.disabled;faceClear.disabled=select.disabled;syncFace();
  const note=$('videoQualityNote');if(note)note.textContent=cfg?.motion?'Длительность и кадр берутся из исходного ролика. Добавь видео до 15 секунд и фото персонажа.':cfg?select.value==='kling/v3'?'Standard и Pro — режимы качества Kling. При фото формат берётся из первого кадра.':select.value==='kling/v2.6'?'Разрешение задаёт Kling. При фото формат берётся из первого кадра.':select.value==='wan/2.6'?'Формат задаёт модель или исходное фото.':$('videoQuality').selectedOptions[0]?.textContent||'':square?'Для 2K и 4K выбери широкий или вертикальный формат.':$('videoQuality').value==='qhd'?'2K подготавливается из исходного видео 4K при сохранении.':$('videoQuality').value==='uhd'?'Исходное видео 4K. Для референса используй ролик до 10 секунд.':'Full HD · 1080p.';
 }
 function render(){
  if(!models.some(m=>m.id===select.value))select.value='auto';
  for(const tab of tabs.children){tab.setAttribute('aria-pressed',String(category===tab.textContent));tab.disabled=select.disabled;}
  rail.replaceChildren();const query=search.value.trim().toLocaleLowerCase('ru');
  const filtered=models.filter(m=>(category==='Популярные'||m.vendor===category)&&(m.name+' '+m.vendor).toLocaleLowerCase('ru').includes(query));
  for(const m of filtered){const card=node('button',{type:'button',className:'image-model-card',disabled:select.disabled});card.setAttribute('aria-pressed',String(m.id===select.value));card.setAttribute('aria-label',m.name+'. '+m.description);card.append(node('span',{className:'image-model-logo'},m.icon),node('span',{className:'image-model-name'},m.name),node('span',{className:'image-model-check'},'✓'));card.onclick=()=>{if(select.disabled)return;select.value=m.id;select.dispatchEvent(new Event('change',{bubbles:true}));};rail.append(card);}
  if(!filtered.length)rail.append(node('p',{className:'image-model-empty'},'Ничего не найдено'));
  const m=models.find(m=>m.id===select.value);caption.textContent='Выбрана: '+m.name+' — '+m.description;syncSettings();
 }
 for(const name of ['Популярные','Kling','Google','ByteDance','xAI','Alibaba']){const tab=node('button',{type:'button'},name);tab.onclick=()=>{category=name;render();};tabs.append(tab);}
 search.addEventListener('input',render);select.addEventListener('change',render);
 heading.append(title,help,searchButton);panel.append(heading,helpText,search,tabs,select,rail,caption,motion);fields.before(panel);
 const busy=()=>{select.disabled=$('videoQuality').disabled;render();};new MutationObserver(busy).observe($('videoQuality'),{attributes:true,attributeFilter:['disabled']});
 function applyModel(value,{quality,ratio,duration}={}){select.value=models.some(m=>m.id===value)?value:'auto';syncSettings();for(const [id,v]of [['videoQuality',quality],['videoRatio',ratio],['duration',duration]])if(v!==undefined&&[...$(id).options].some(o=>!o.disabled&&o.value===String(v)))$(id).value=String(v);select.dispatchEvent(new Event('change',{bubbles:true}));}
 async function validate(snapshot){
  const cfg=settings[snapshot.model];if(!cfg)return;
  // Existing Auto jobs keep their provider ID together with the original quality codes.
  if(['fhd','qhd','uhd','fast','high'].includes(snapshot.quality)&&['bytedance/seedance-2','bytedance/seedance-2-fast','gemini-omni-video'].includes(snapshot.model))return;
  if(!Object.hasOwn(cfg.qualities,snapshot.quality)||!cfg.ratios.includes(snapshot.ratio)||!cfg.durations.includes(Number(snapshot.duration)))throw Error('Выбери доступные настройки этой видеомодели.');
  if(snapshot.prompt.length>(cfg.promptMax||1200))throw Error('Сократи описание до '+(cfg.promptMax||1200)+' символов для этой модели.');
  const video=snapshot.sourceFile?.type?.startsWith('video/');
  if(video&&!cfg.video)throw Error('Эта модель принимает описание или фото. Для изменения видео выбери Seedance или Авто.');
  if(snapshot.identityFile&&!cfg.identity)throw Error('Убери дополнительное фото персонажа. Для этой модели фото добавляется в основное поле.');
  if(cfg.motion&&(!video||!snapshot.identityFile))throw Error('Добавь ролик с движением и отдельное фото персонажа.');
  if(video&&window.anisMediaQuality?.inspectVideo){const meta=await window.anisMediaQuality.inspectVideo(snapshot.sourceFile);const max=snapshot.model==='bytedance/seedance-2-5'?30:snapshot.model==='gemini-omni-video'?10:15;if(!Number.isFinite(meta.duration)||meta.duration<=0||meta.duration>max+.1)throw Error('Для этой модели добавь исходное видео до '+max+' секунд.');}
 }
 window.anisVideoModels={models,settings,sync:render,syncSettings,select:applyModel,validate,forEnhancement(project){const cfg=settings[project.model],keep=cfg?.video&&!cfg.motion,nativeQuality=({fhd:'1080p',fast:'480p',high:'720p',qhd:'4k',uhd:'4k'})[project.quality]||project.quality,quality=keep?nativeQuality:project.quality==='uhd'||project.quality==='4K'||project.quality==='4k'?'uhd':'fhd';applyModel(keep?project.model:'auto',{quality,ratio:project.ratio,duration:project.duration});}};
 render();
})();
