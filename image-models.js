/* Photo models use the existing authenticated studio creation pipeline. */
(()=>{
 'use strict';
 const modelSettings={"google/gemini-3.1-flash-image-preview":{"qualities":{"img-1k":"1K","img-2k":"2K","img-4k":"4K"},"ratios":["1:1","9:16","16:9"],"parameter":"image_resolution","outputFormat":true,"legacy":true},"google/gemini-3-pro-image-preview":{"qualities":{"img-1k":"1K","img-2k":"2K","img-4k":"4K"},"ratios":["1:1","9:16","16:9"],"parameter":"image_resolution","outputFormat":true,"legacy":true},"bytedance/seedream-4.5":{"qualities":{"img-2k":"basic","img-4k":"high"},"ratios":["1:1","9:16","16:9"],"parameter":"quality","legacy":true},"google/gemini-3.1-flash-lite-image":{"qualities":{"img-auto":null},"ratios":["1:1","9:16","16:9"]},"google/gemini-nano-banana-2.1":{"qualities":{"img-1k":"1K","img-2k":"2K","img-4k":"4K"},"ratios":["1:1","9:16","16:9"],"parameter":"image_resolution","outputFormat":true},"google/gemini-2.5-flash-image":{"qualities":{"img-auto":null},"ratios":["1:1","9:16","16:9"]},"openai/gpt-image-2.5-flare":{"qualities":{"img-1k":"1K","img-2k":"2K","img-4k":"4K"},"ratios":["1:1","9:16","16:9"],"parameter":"image_resolution","squareNo4K":true},"openai/gpt-image-2.5-sunburst":{"qualities":{"img-1k":"1K","img-2k":"2K","img-4k":"4K"},"ratios":["1:1","9:16","16:9"],"parameter":"image_resolution","squareNo4K":true},"openai/gpt-5.4-image-2":{"qualities":{"img-1k":"1K","img-2k":"2K","img-4k":"4K"},"ratios":["1:1","9:16","16:9"],"parameter":"image_resolution","squareNo4K":true},"openai/gpt-image-1.5":{"qualities":{"img-medium":"medium","img-high":"high"},"ratios":["1:1","2:3","3:2"],"parameter":"quality"},"bytedance/seedream-5-lite":{"qualities":{"img-2k":"basic","img-3k":"high"},"ratios":["1:1","9:16","16:9"],"parameter":"quality"},"seedream/5-pro-text-to-image":{"qualities":{"img-1k":"basic","img-2k":"high"},"ratios":["1:1","9:16","16:9"],"parameter":"quality","outputFormat":true},"bytedance/seedream-4":{"qualities":{"img-1k":"1K","img-2k":"2K","img-4k":"4K"},"ratios":["1:1","9:16","16:9"],"parameter":"image_resolution"},"black-forest-labs/flux.2-flex":{"qualities":{"img-1k":"1K","img-2k":"2K"},"ratios":["1:1","9:16","16:9"],"parameter":"image_resolution"},"black-forest-labs/flux.2-pro":{"qualities":{"img-1k":"1K","img-2k":"2K"},"ratios":["1:1","9:16","16:9"],"parameter":"image_resolution"}};
 const models=[
  {id:'auto',name:'Авто',vendor:'Популярные',icon:'✦',description:'ANIS AI подберёт модель под описание и качество.'},
  {id:'google/gemini-3.1-flash-lite-image',name:'Nano Banana 2 Lite',vendor:'Google',icon:'G',description:'Создание и редактирование фото. Разрешение задаёт модель.'},
  {id:'google/gemini-nano-banana-2.1',name:'Nano Banana 2.1',vendor:'Google',icon:'G',description:'Создание и редактирование изображений. 1K, 2K и 4K.'},
  {id:'google/gemini-3.1-flash-image-preview',name:'Nano Banana 2',vendor:'Google',icon:'G',description:'Создание и редактирование фото. 1K, 2K и 4K.'},
  {id:'google/gemini-3-pro-image-preview',name:'Nano Banana Pro',vendor:'Google',icon:'G',description:'Для сложных композиций, надписей и детальной работы с фото. До 4K.'},
  {id:'google/gemini-2.5-flash-image',name:'Nano Banana',vendor:'Google',icon:'G',description:'Базовая модель для создания и редактирования фото. Размер задаёт модель.'},
  {id:'openai/gpt-image-2.5-flare',name:'GPT Image 2.5 Flare',vendor:'OpenAI',icon:'◎',description:'Генерация и редактирование фото. До 4K; для квадрата — до 2K.'},
  {id:'openai/gpt-image-2.5-sunburst',name:'GPT Image 2.5 Sunburst',vendor:'OpenAI',icon:'◎',description:'Ещё один вариант GPT Image 2.5. До 4K; для квадрата — до 2K.'},
  {id:'openai/gpt-5.4-image-2',name:'GPT Image 2',vendor:'OpenAI',icon:'◎',description:'GPT-5.4 Image 2: создание и правка изображений. До 4K; квадрат — до 2K.'},
  {id:'openai/gpt-image-1.5',name:'GPT Image 1.5',vendor:'OpenAI',icon:'◎',description:'Создание и правка фото. Качество Medium / High, форматы 1:1, 2:3 и 3:2.'},
  {id:'bytedance/seedream-5-lite',name:'Seedream 5 Lite',vendor:'ByteDance',icon:'▥',description:'Генерация и редактирование изображений. Исходник 2K или 3K.'},
  {id:'seedream/5-pro-text-to-image',name:'Seedream 5 Pro',vendor:'ByteDance',icon:'▥',description:'Создание и редактирование изображений. Исходник 1K или 2K.'},
  {id:'bytedance/seedream-4.5',name:'Seedream 4.5',vendor:'ByteDance',icon:'▥',description:'Генерация и редактирование изображений от ByteDance. Исходник 2K или 4K.'},
  {id:'bytedance/seedream-4',name:'Seedream 4.0',vendor:'ByteDance',icon:'▥',description:'Создание и редактирование изображений. 1K, 2K и 4K.'},
  {id:'black-forest-labs/flux.2-flex',name:'Flux 2 Flex',vendor:'Flux',icon:'◬',description:'Генерация и редактирование изображений. Разрешение 1K или 2K.'},
  {id:'black-forest-labs/flux.2-pro',name:'Flux 2 Pro',vendor:'Flux',icon:'◬',description:'Создание и редактирование детальных изображений. 1K или 2K.'}
 ];
 const settings=document.querySelector('#view-studio .media-settings');if(!settings)return;
 const $=id=>document.getElementById(id),node=(tag,props={},text)=>{const n=document.createElement(tag);Object.assign(n,props);if(text!==undefined)n.textContent=text;return n;};
 const panel=node('section',{className:'image-model-picker'});panel.setAttribute('aria-label','Выбор нейросети для фото');
 const heading=node('div',{className:'image-model-heading'}),title=node('h3',{},'Выбор нейросети');
 const help=node('button',{type:'button',className:'image-model-help',textContent:'?'});help.setAttribute('aria-label','О выборе нейросети');help.setAttribute('aria-expanded','false');
 const helpText=node('p',{className:'image-model-help-text',hidden:true},'Выбранная модель создаёт или редактирует фото. Качество и форматы зависят от модели. «Авто» сохраняет привычный подбор ANIS AI. Стоимость генерации у моделей может отличаться.');
 help.onclick=()=>{helpText.hidden=!helpText.hidden;help.setAttribute('aria-expanded',String(!helpText.hidden));};
 const searchButton=node('button',{type:'button',className:'image-model-search-toggle'});searchButton.setAttribute('aria-label','Поиск нейросети');searchButton.setAttribute('aria-expanded','false');
 searchButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
 heading.append(title,help,searchButton);
 const search=node('input',{type:'search',className:'image-model-search',placeholder:'Найти нейросеть',hidden:true});search.setAttribute('aria-label','Название нейросети');
 searchButton.onclick=()=>{search.hidden=!search.hidden;searchButton.setAttribute('aria-expanded',String(!search.hidden));if(!search.hidden)search.focus();else{search.value='';render();}};
 const select=node('select',{id:'imageModel',hidden:true});select.setAttribute('aria-label','Нейросеть для фото');
 for(const m of models)select.append(node('option',{value:m.id},m.name));
 const tabs=node('div',{className:'image-model-tabs',role:'group'});tabs.setAttribute('aria-label','Разработчик нейросети');
 const rail=node('div',{className:'image-model-rail',role:'group'});rail.setAttribute('aria-label','Модели для фото');
 const caption=node('p',{className:'image-model-caption'});caption.setAttribute('aria-live','polite');
 let category='Популярные';
 function addOptions(field,values){if(field)for(const [value,label]of Object.entries(values))if(![...field.options].some(o=>o.value===value))field.append(node('option',{value},label));}
 addOptions($('imageQuality'),{'img-1k':'1K · Исходник','img-2k':'2K · Исходник','img-3k':'3K · Исходник','img-4k':'4K · Исходник','img-medium':'Medium · Сбалансированное','img-high':'High · Детальное','img-auto':'Авто · По модели'});
 addOptions($('imageRatio'),{'2:3':'Вертикальный · 2:3','3:2':'Широкий · 3:2'});
 const note=node('p',{className:'studio-tool-hint',id:'imageModelQualityNote'});$('imageQuality').parentElement.append(note);
 const allowedOptions=(field,allowed,fallback)=>{if(!field)return;for(const option of field.options){const enabled=allowed.includes(option.value);option.hidden=!enabled;option.disabled=!enabled;}if(!allowed.includes(field.value))field.value=allowed.includes(fallback)?fallback:allowed[0];};
 function nativeQuality(quality,ratio,cfg){if(!cfg?.legacy||String(quality).startsWith('img-'))return quality;const resolution=({fast:'1k',high:'2k',max:'4k'})[quality]||(quality==='uhd'||quality==='qhd'&&ratio==='1:1'?'4k':'2k');return 'img-'+resolution;}
 function syncSettings(){
  if(!models.some(m=>m.id===select.value))select.value='auto';
  const cfg=modelSettings[select.value],quality=$('imageQuality'),ratio=$('imageRatio');if(!quality||!ratio)return;
  allowedOptions(ratio,cfg?cfg.ratios:['1:1','9:16','16:9'],'1:1');
  const allowed=cfg?Object.keys(cfg.qualities).filter(q=>!(cfg.squareNo4K&&ratio.value==='1:1'&&q==='img-4k')):['fhd','qhd','uhd'];
  if(cfg)quality.value=nativeQuality(quality.value,ratio.value,cfg);
  allowedOptions(quality,allowed,'img-2k');
  note.hidden=!cfg;note.textContent=cfg?.squareNo4K?'4K доступен для вертикального и широкого формата. Для квадрата — до 2K.':select.value==='openai/gpt-image-1.5'?'Medium и High — режимы детализации. Размер результата задаёт модель.':Object.keys(cfg?.qualities||{}).includes('img-auto')?'Сохраняем исходный размер, который вернула модель.':'Сохраняем исходное разрешение выбранной модели.';
 }
 function render(){
  if(!models.some(m=>m.id===select.value))select.value='auto';
  for(const tab of tabs.children){tab.setAttribute('aria-pressed',String(category===tab.textContent));tab.disabled=select.disabled;}
  rail.replaceChildren();
  const query=search.value.trim().toLocaleLowerCase('ru');
  const filtered=models.filter(m=>(category==='Популярные'||m.vendor===category)&&(m.name+' '+m.vendor).toLocaleLowerCase('ru').includes(query));
  for(const m of filtered){
   const card=node('button',{type:'button',className:'image-model-card',disabled:select.disabled});card.setAttribute('aria-pressed',String(m.id===select.value));card.setAttribute('aria-label',m.name+'. '+m.description);
   card.append(node('span',{className:'image-model-logo'},m.icon),node('span',{className:'image-model-name'},m.name),node('span',{className:'image-model-check'},'✓'));
   card.onclick=()=>{if(select.disabled)return;select.value=m.id;select.dispatchEvent(new Event('change',{bubbles:true}));};rail.append(card);
  }
  if(!filtered.length)rail.append(node('p',{className:'image-model-empty'},'Ничего не найдено'));
  const current=models.find(m=>m.id===select.value);caption.textContent='Выбрана: '+current.name+' — '+current.description;syncSettings();
 }
 for(const name of ['Популярные','Google','OpenAI','ByteDance','Flux']){const tab=node('button',{type:'button'},name);tab.onclick=()=>{category=name;render();};tabs.append(tab);}
 search.addEventListener('input',render);select.addEventListener('change',render);$('imageRatio')?.addEventListener('change',syncSettings);$('imageQuality').addEventListener('change',syncSettings);
 panel.append(heading,helpText,search,tabs,select,rail,caption);settings.before(panel);
 const busy=()=>{select.disabled=!!$('imageQuality').disabled;render();};
 new MutationObserver(busy).observe($('imageQuality'),{attributes:true,attributeFilter:['disabled']});
 function applyModel(value,{quality,ratio}={}){select.value=models.some(m=>m.id===value)?value:'auto';if(ratio!==undefined&&$('imageRatio'))$('imageRatio').value=ratio;if(quality!==undefined)$('imageQuality').value=quality;render();select.dispatchEvent(new Event('change',{bubbles:true}));}
 function validate(snapshot){const cfg=modelSettings[snapshot.model];if(!cfg)return;if(cfg.legacy&&['fhd','qhd','uhd','fast','high','max'].includes(snapshot.quality))return;if(!Object.hasOwn(cfg.qualities,snapshot.quality))throw Error('Выбери доступное качество для этой фотомодели.');if(!cfg.ratios.includes(snapshot.ratio))throw Error('Выбери доступный формат для этой фотомодели.');if(cfg.squareNo4K&&snapshot.ratio==='1:1'&&snapshot.quality==='img-4k')throw Error('Для этой модели 4K доступен в вертикальном или широком формате.');}
 window.anisImageModels={models:models.map(m=>({...m})),settings:modelSettings,sync:render,syncSettings,select:applyModel,validate};
 render();
})();
