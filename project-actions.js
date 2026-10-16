/* Actions always retain the project they belong to, including while a file loads. */
(() => {
  'use strict';
  const node=(tag,props={},text)=>{const n=document.createElement(tag);Object.assign(n,props);if(text!==undefined)n.textContent=text;return n;};
  const icons={
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    edit:'<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',
    enhance:'<path d="m4 20 11-11 3 3L7 23ZM14 3v4m-2-2h4M21 14v4m-2-2h4M19 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/>',
    crop:'<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>',
    similar:'<rect x="3" y="8" width="13" height="13" rx="3"/><path d="M8 5V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1M8 11l2 3 3 1"/>'
  };
  function control(text,fn,className=''){const b=node('button',{type:'button',className},text);b.onclick=fn;return b;}
  function download(item){const link=node('a',{href:item.url,download:item.file.name});document.body.append(link);link.click();link.remove();}
  const exportsInProgress=new WeakMap();
  async function getMedia(project){
    if(!project.media&&project.resultUrl){await loadStudioProjectResult(project);if(!project.media&&project.loadingPromise)await project.loadingPromise;}
    if(!project.media?.file)throw Error(project.error||'Не удалось открыть результат. Попробуй ещё раз.');
    if(project.resolutionPending&&window.anisMediaQuality){
      let exporting=exportsInProgress.get(project);
      if(!exporting){exporting=(async()=>{
        const result=await window.anisMediaQuality.prepare(project,project.media.blob,{convertVideo:true});
        project.resolutionWarning=result.warning;project.resolutionPending=!!result.pending;
        if(result.pending){showMedia(project.media,project.kind);throw Error(result.warning);}
        const old=project.media.url;project.media=mediaFromBlob(project.kind,result.blob);project.mediaBlob=result.blob;project.outputWidth=result.width;project.outputHeight=result.height;Object.assign(project.media,{width:result.width,height:result.height,warning:result.warning});if(old?.startsWith('blob:'))URL.revokeObjectURL(old);persistStudioProjects();updateProjectDock();
      })();exportsInProgress.set(project,exporting);}
      try{await exporting;}finally{exportsInProgress.delete(project);}
    }
    return project.media;
  }
  async function normalizeBlob(kind,blob){
    if(!blob.size)throw Error('Готовый файл пока пуст. Проверь позже.');
    const bytes=new Uint8Array(await blob.slice(0,32).arrayBuffer()),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
    let type='';
    if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)type='image/jpeg';
    else if(bytes[0]===0x89&&ascii(1,4)==='PNG')type='image/png';
    else if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')type='image/webp';
    else if(ascii(0,3)==='GIF')type='image/gif';
    else if(ascii(4,8)==='ftyp')type=ascii(8,12)==='qt  '?'video/quicktime':'video/mp4';
    else if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)type='video/webm';
    if(!type||!type.startsWith(kind==='image'?'image/':'video/'))throw Error('Сервис ещё не отдал корректное '+(kind==='image'?'фото':'видео')+'. Проверь готовность позже.');
    return blob.type===type?blob:new Blob([blob],{type});
  }

  const viewer=node('dialog',{id:'readyMediaViewer',className:'anis-dialog ready-media-viewer'}),viewerHeader=node('header'),viewerTitle=node('h2'),viewerStage=node('div',{className:'ready-media-stage'}),viewerNote=node('p',{className:'note'}),viewerActions=node('div',{className:'ready-viewer-actions'});
  viewer.setAttribute('aria-label','Просмотр готового фото или видео');
  viewerHeader.append(viewerTitle,control('×',()=>viewer.close(),'room-close'));viewerHeader.lastChild.setAttribute('aria-label','Закрыть просмотр');
  viewer.append(viewerHeader,viewerStage,viewerActions,viewerNote);document.body.append(viewer);
  viewer.addEventListener('close',()=>{viewerStage.querySelector('video')?.pause();viewerStage.replaceChildren();});
  function showMedia(item,kind){
    viewerStage.querySelector('video')?.pause();viewerStage.replaceChildren();viewerActions.replaceChildren();viewerTitle.textContent=kind==='video'?'Твоё видео':'Твоё фото';
    const media=node(kind==='video'?'video':'img',{src:item.url});
    if(kind==='video'){media.controls=true;media.playsInline=false;media.preload='metadata';}else media.alt='Готовое фото ANIS AI';
    viewerStage.append(media);
    viewerNote.textContent=kind==='video'?'Нажми воспроизведение, чтобы посмотреть видео. Сохранение в «Фото» — через системное меню «Поделиться».':'Удерживай фото, чтобы открыть меню сохранения. Также можно сохранить его через «Поделиться».';
    if(item.width&&item.height)viewerNote.textContent=item.width+'×'+item.height+' пикс. · '+(item.warning||viewerNote.textContent);
    if(navigator.share&&navigator.canShare?.({files:[item.file]}))viewerActions.append(control('Сохранить в Фото',()=>void saveMedia(item,kind),'anis-button primary'));
    viewerActions.append(control('Скачать .'+item.file.name.split('.').at(-1),()=>download(item),'anis-button'));
    if(!viewer.open)viewer.showModal();
  }
  async function saveMedia(item,kind){
    if(navigator.share&&navigator.canShare?.({files:[item.file]})){
      try{await navigator.share({files:[item.file],title:kind==='video'?'Видео ANIS AI':'Фото ANIS AI'});return;}
      catch(error){if(error.name==='AbortError')return;}
    }
    showMedia(item,kind);
  }
  function selectValue(id,value){const select=$(id);if(id.endsWith('Quality')&&![...select.options].some(o=>o.value===String(value)))value={fast:'fhd',high:id==='imageQuality'?'qhd':'fhd',max:'uhd'}[value]||value;if([...select.options].some(o=>o.value===String(value)&&!o.disabled))select.value=String(value);select.dispatchEvent(new Event('change',{bubbles:true}));}
  function prepareAction(project,item,action){
    if($('mediaResultDialog').open)closeGeneratedMedia();
    const kind=project.kind;openView(kind==='video'?'video':'studio');
    if(kind==='video'){clearVideoIdentity();if(setStudioVideo(item.file)===false)return;}else if(setStudioPhoto(item.file)===false)return;
    selectValue(kind+'Ratio',project.ratio||(kind==='video'?'16:9':'1:1'));
    selectValue(kind+'Quality',action==='enhance'?(kind==='video'&&project.ratio==='1:1'?'fhd':'uhd'):(project.quality||'fhd'));
    if(kind==='video')selectValue('duration',project.duration||4);
    const subject=kind==='video'?'видео':'фото',prompt=$(kind+'Prompt');
    prompt.value=action==='enhance'?'Улучши качество этого '+subject+'. Сохрани лица, композицию, цвета и все важные детали. Добавь естественную чёткость'+(kind==='video'?', плавность и стабильность движения.':', аккуратно убери шум.'):
      action==='similar'?((project.prompt||'Создай похожее '+subject)+'. Новый вариант по этому референсу: сохрани стиль и настроение, предложи немного другую композицию.').slice(0,1200):'';
    prompt.dispatchEvent(new Event('input',{bubbles:true}));
    if(action==='edit')prompt.focus();
    toast(action==='edit'?'Опиши, что изменить.':kind==='video'?'Всё готово. Нажми «Создать видео».':'Всё готово. Нажми «Создать фото».');
  }
  function createControls(project){
    const rail=node('div',{className:'ready-project-actions'});rail.setAttribute('role','group');rail.setAttribute('aria-label','Действия с '+(project.kind==='video'?'видео':'фото'));rail.dataset.projectId=project.id;
    for(const [action,label]of [['download','Скачать'],['edit','Изменить'],['enhance','Улучшить'],['crop','Обрезать'],['similar','Создать похожее']]){
      const b=control('',async()=>{
        b.disabled=true;b.setAttribute('aria-busy','true');
        try{const item=await getMedia(project);if(action==='download')await saveMedia(item,project.kind);else if(action==='crop')await openCrop(project,item);else prepareAction(project,item,action);}
        catch(error){if(error.name!=='AbortError')toast(error.message||'Не удалось открыть действие.');}
        finally{b.disabled=false;b.removeAttribute('aria-busy');}
      },'ready-project-action ready-action-'+action);
      b.dataset.action=action;b.setAttribute('aria-label',label+(project.kind==='video'?' видео':' фото'));b.title=label;
      b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[action]+'</svg>';
      b.append(node('span',{},label));b.disabled=!!project.loading;rail.append(b);
    }
    return rail;
  }

  const cropDialog=node('dialog',{id:'readyCropDialog',className:'anis-dialog ready-crop-dialog'}),cropHeader=node('header'),cropTitle=node('h2'),cropStage=node('div',{className:'ready-crop-stage'}),cropFields=node('div',{className:'ready-crop-fields'}),cropStatus=node('p',{className:'note'}),cropSave=control('Сохранить обрезку',()=>void saveCrop(),'anis-button primary');
  cropStatus.setAttribute('role','status');cropDialog.setAttribute('aria-label','Обрезка готовой работы');
  cropHeader.append(cropTitle,control('×',()=>cropDialog.close(),'room-close'));cropHeader.lastChild.setAttribute('aria-label','Отменить обрезку');
  cropDialog.append(cropHeader,cropStage,cropFields,cropStatus,cropSave);document.body.append(cropDialog);
  let cropState=null;
  cropDialog.addEventListener('close',()=>{cropState?.controller.abort();cropState?.video?.pause();cropStage.replaceChildren();cropState=null;});
  function slider(label,min,max,value,step,onInput){
    const row=node('label'),copy=node('span',{},label),output=node('output'),input=node('input',{type:'range',min:String(min),max:String(max),value:String(value),step:String(step)});
    copy.append(output);row.append(copy,input);input.setAttribute('aria-label',label);input.oninput=()=>onInput(Number(input.value),input,output);cropFields.append(row);return {input,output};
  }
  function redrawCrop(){
    const s=cropState;if(!s?.image)return;
    const w=s.image.naturalWidth,h=s.image.naturalHeight,r=s.ratio,cw=Math.min(w,h*r),ch=cw/r;
    s.bounds={x:(w-cw)*s.x,y:(h-ch)*s.y,w:cw,h:ch};s.canvas.width=Math.round(cw);s.canvas.height=Math.round(ch);
    s.canvas.getContext('2d').drawImage(s.image,s.bounds.x,s.bounds.y,cw,ch,0,0,s.canvas.width,s.canvas.height);
  }
  async function openCrop(project,item){
    if(cropDialog.open)return;
    const s=cropState={project,item,controller:new AbortController(),x:.5,y:.5,ratio:1,exporting:false};cropStage.replaceChildren();cropFields.replaceChildren();cropSave.disabled=true;cropStatus.textContent='Открываем исходник…';cropTitle.textContent=project.kind==='video'?'Обрезать видео':'Обрезать фото';cropDialog.showModal();
    try{
      if(project.kind==='image'){
        s.image=new Image();s.image.src=item.url;await s.image.decode();if(cropState!==s)return;
        s.canvas=node('canvas');cropStage.append(s.canvas);const formats=node('div',{className:'ready-crop-formats',role:'group'});formats.setAttribute('aria-label','Формат обрезки');
        for(const [label,ratio]of [['1:1',1],['9:16',9/16],['16:9',16/9]]){const b=control(label,()=>{s.ratio=ratio;for(const n of formats.children)n.setAttribute('aria-pressed',String(n===b));redrawCrop();},'anis-button');b.setAttribute('aria-pressed',String(ratio===1));formats.append(b);}cropFields.append(formats);
        slider('По горизонтали',0,1,.5,.01,value=>{s.x=value;redrawCrop();});slider('По вертикали',0,1,.5,.01,value=>{s.y=value;redrawCrop();});redrawCrop();
      }else{
        const video=s.video=node('video',{src:item.url,controls:true,playsInline:true,preload:'auto'});cropStage.append(video);
        await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Не удалось открыть это видео.'));s.controller.signal.addEventListener('abort',()=>reject(new DOMException('Отменено','AbortError')),{once:true});});if(cropState!==s)return;
        if(!Number.isFinite(video.duration)||video.duration<=.1)throw Error('Не удалось прочитать длительность видео.');
        if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream||!(window.AudioContext||window.webkitAudioContext))throw Error('Этот браузер не поддерживает сохранение обрезанного видео. Открой приложение в Safari или Chrome.');
        s.start=0;s.end=video.duration;
        const start=slider('Начало',0,video.duration-.1,0,.1,(value,input)=>{s.start=Math.min(value,s.end-.1);input.value=String(s.start);start.output.textContent=s.start.toFixed(1)+' с';video.currentTime=s.start;});
        const end=slider('Конец',.1,video.duration,video.duration,.1,(value,input)=>{s.end=Math.max(value,s.start+.1);input.value=String(s.end);end.output.textContent=s.end.toFixed(1)+' с';video.currentTime=Math.max(s.start,s.end-.1);});start.output.textContent='0.0 с';end.output.textContent=s.end.toFixed(1)+' с';
      }
      cropStatus.textContent='Сохраним отдельный вариант. Оригинал останется в готовых работах.';cropSave.disabled=false;
    }catch(error){if(error.name!=='AbortError'&&cropState===s)cropStatus.textContent=error.message;}
  }
  async function trimVideo(s){
    const video=s.video,canvas=node('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const painter=canvas.getContext('2d');
    const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('Формат сохранения видео не поддерживается в этом браузере.');
    const audio=new (window.AudioContext||window.webkitAudioContext)();let stream,source,recorder,frame,timer;const chunks=[];
    try{
      await audio.resume();source=audio.createMediaElementSource(video);const destination=audio.createMediaStreamDestination();source.connect(destination);video.muted=false;video.pause();
      if(Math.abs(video.currentTime-s.start)>.01)await new Promise((resolve,reject)=>{video.addEventListener('seeked',resolve,{once:true});video.addEventListener('error',()=>reject(Error('Не удалось перейти к началу фрагмента.')),{once:true});video.currentTime=s.start;});
      if(s.controller.signal.aborted)throw new DOMException('Отменено','AbortError');
      painter.drawImage(video,0,0,canvas.width,canvas.height);stream=canvas.captureStream(30);for(const track of destination.stream.getAudioTracks())stream.addTrack(track);
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.min(8000000,Math.max(2000000,canvas.width*canvas.height*5))});
      const blob=await new Promise((resolve,reject)=>{
        let finished=false;
        const stop=()=>{if(finished)return;finished=true;video.pause();if(recorder.state!=='inactive')recorder.stop();};
        const fail=error=>{stop();reject(error);};
        recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onerror=()=>fail(Error('Не удалось сохранить обрезку. Попробуй ещё раз.'));
        recorder.onstop=()=>{const result=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});result.size?resolve(result):reject(Error('Не удалось сохранить фрагмент.'));};
        s.controller.signal.addEventListener('abort',()=>fail(new DOMException('Отменено','AbortError')),{once:true});
        video.onended=stop;
        const draw=()=>{painter.drawImage(video,0,0,canvas.width,canvas.height);cropStatus.textContent='Сохраняем видео… '+Math.min(100,Math.round((video.currentTime-s.start)/(s.end-s.start)*100))+'%';if(video.currentTime>=s.end-.025||video.ended)stop();else frame=requestAnimationFrame(draw);};
        timer=setTimeout(()=>fail(Error('Сохранение прервалось. Держи приложение открытым во время обрезки.')),(s.end-s.start)*2500+15000);
        recorder.start(200);video.play().then(draw).catch(fail);
      });
      return blob;
    }finally{cancelAnimationFrame(frame);clearTimeout(timer);video.pause();if(recorder?.state&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(t=>t.stop());source?.disconnect();void audio.close();}
  }
  async function saveCrop(){
    const s=cropState;if(!s||s.exporting)return;s.exporting=true;cropSave.disabled=true;for(const input of cropFields.querySelectorAll('input,button'))input.disabled=true;
    try{
      const blob=s.project.kind==='video'?await trimVideo(s):await new Promise(resolve=>s.canvas.toBlob(resolve,'image/png'));
      if(!blob?.size)throw Error('Не удалось сохранить обрезку.');if(cropState!==s||s.controller.signal.aborted)return;
      const media=mediaFromBlob(s.project.kind,blob),p={id:crypto.randomUUID(),groupId:s.project.groupId||s.project.id,kind:s.project.kind,status:'completed',created:Date.now(),order:++projectCounter,prompt:(s.project.prompt||'Моя работа')+' · обрезка',quality:s.project.quality||'fast',ratio:s.project.kind==='image'?(s.ratio===1?'1:1':s.ratio<1?'9:16':'16:9'):s.project.ratio,duration:s.project.kind==='video'?Math.round((s.end-s.start)*10)/10:undefined,media,mediaBlob:blob,sourceFile:media.file};
      studioProjects.set(p.id,p);persistStudioProjects();cropDialog.close();openProjectRoom(p.id);toast('Обрезка сохранена отдельным вариантом.');
    }catch(error){if(error.name!=='AbortError'){if(s.project.kind==='video')cropDialog.close();toast(error.message);}}
    finally{if(cropState===s){s.exporting=false;cropSave.disabled=false;for(const input of cropFields.querySelectorAll('input,button'))input.disabled=false;}}
  }
  // Restore ready results automatically when opening a project, including after app restart.
  const pendingPreviews=new WeakSet();
  const originalRoomRender=window.renderProjectRoom;
  if(typeof originalRoomRender==='function'){
    window.renderProjectRoom=function(...args){
      const result=originalRoomRender.apply(this,args);
      const project=studioProjects.get(selectedStudioProject);
      if(!project||project.status!=='completed'||project.media||!project.resultUrl)return result;
      const stage=document.getElementById('mediaResultPreview');
      if(!stage||pendingPreviews.has(project))return result;
      pendingPreviews.add(project);
      const showLoading=()=>{
        if(selectedStudioProject!==project.id||project.media)return;
        stage.replaceChildren();
        const status=node('div',{className:'project-creation-scene'},project.kind==='video'?'Открываем готовое видео…':'Открываем готовое фото…');
        stage.append(status);
      };
      showLoading();
      Promise.resolve(loadStudioProjectResult(project)).catch(error=>{
        if(selectedStudioProject!==project.id)return;
        stage.replaceChildren();
        const retry=control('Повторить загрузку',()=>{
          pendingPreviews.delete(project);
          window.renderProjectRoom();
        },'project-load-result');
        stage.append(node('p',{className:'note'},error?.message||'Не удалось открыть файл.'),retry);
      }).finally(()=>pendingPreviews.delete(project));
      return result;
    };
  }
  // Recover thumbnails in the Ready gallery without regenerating projects.
  const galleryLoads=new Set();
  function repairReadyGallery(){
    const grid=document.querySelector('.studio-ready-grid, #readyProjects, #readyGrid');
    const cards=grid?grid.querySelectorAll('[data-project-id]'):document.querySelectorAll('.studio-ready-project[data-project-id]');
    for(const card of cards){
      const id=card.dataset.projectId,project=studioProjects.get(id);
      if(!project||project.status!=='completed'||project.media||!project.resultUrl||galleryLoads.has(id))continue;
      const preview=card.querySelector('.studio-ready-preview');
      if(!preview)continue;
      const media=preview.querySelector('img,video');
      if(media&&media.complete&&media.naturalWidth>0)continue;
      const start=()=>{
        if(galleryLoads.has(id)||project.media)return;
        galleryLoads.add(id);
        Promise.resolve(loadStudioProjectResult(project)).catch(()=>{}).finally(()=>{
          galleryLoads.delete(id);
          const current=document.querySelector('.studio-ready-project[data-project-id="'+CSS.escape(id)+'"] .studio-ready-preview');
          if(current&&project.media?.url){
            const previous=current.querySelector('img,video');
            const next=document.createElement(project.kind==='video'?'video':'img');
            next.src=project.media.url;
            if(project.kind==='video'){next.muted=true;next.playsInline=true;next.preload='metadata';}
            if(previous)previous.replaceWith(next);else current.prepend(next);
          }
        });
      };
      if(media){media.addEventListener('error',start,{once:true});if(media.tagName==='IMG'&&media.complete&&!media.naturalWidth)start();}
      else start();
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const grid=document.querySelector('#readyGrid, #readyProjects, .studio-ready-grid');
    if(grid){new MutationObserver(()=>repairReadyGallery()).observe(grid,{childList:true,subtree:false});repairReadyGallery();}
  });
  window.anisProjectActions={createControls,normalizeBlob,saveMedia,showMedia,getMedia};
})();

