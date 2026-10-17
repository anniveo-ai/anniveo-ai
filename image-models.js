/* Photo models use the existing authenticated studio creation pipeline. */
(()=>{
 'use strict';
 const models=[
  {id:'auto',name:'Авто',vendor:'Популярные',icon:'✦',description:'ANIS AI подберёт модель под описание и качество.'},
  {id:'google/gemini-3.1-flash-image-preview',name:'Nano Banana 2',vendor:'Google',icon:'G',description:'Генерация и редактирование фото с поддержкой разрешения до 4K.'},
  {id:'google/gemini-3-pro-image-preview',name:'Nano Banana Pro',vendor:'Google',icon:'G',description:'Для сложных композиций, надписей и детальной работы с фото.'},
  {id:'bytedance/seedream-4.5',name:'Seedream 4.5',vendor:'ByteDance',icon:'▥',description:'Генерация и редактирование изображений от ByteDance. Исходник 2K или 4K.'}
 ];
 const settings=document.querySelector('#view-studio .media-settings');if(!settings)return;
 const node=(tag,props={},text)=>{const n=document.createElement(tag);Object.assign(n,props);if(text!==undefined)n.textContent=text;return n;};
 const panel=node('section',{className:'image-model-picker'});panel.setAttribute('aria-label','Выбор нейросети для фото');
 const heading=node('div',{className:'image-model-heading'}),title=node('h3',{},'Выбор нейросети');
 const help=node('button',{type:'button',className:'image-model-help',textContent:'?'});help.setAttribute('aria-label','О выборе нейросети');help.setAttribute('aria-expanded','false');
 const helpText=node('p',{className:'image-model-help-text',hidden:true},'Выбранная модель создаёт или редактирует фото. «Авто» сохраняет привычный подбор ANIS AI. Стоимость генерации у моделей может отличаться.');
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
  const current=models.find(m=>m.id===select.value);caption.textContent='Выбрана: '+current.name+' — '+current.description;
 }
 for(const name of ['Популярные','Google','ByteDance']){const tab=node('button',{type:'button'},name);tab.onclick=()=>{category=name;render();};tabs.append(tab);}
 search.addEventListener('input',render);select.addEventListener('change',render);
 panel.append(heading,helpText,search,tabs,select,rail,caption);settings.before(panel);
 const busy=()=>{select.disabled=!!document.getElementById('imageQuality').disabled;render();};
 new MutationObserver(busy).observe(document.getElementById('imageQuality'),{attributes:true,attributeFilter:['disabled']});
 window.anisImageModels={models:models.map(m=>({...m})),sync:render,select(value){select.value=models.some(m=>m.id===value)?value:'auto';select.dispatchEvent(new Event('change',{bubbles:true}));}};
 render();
})();
