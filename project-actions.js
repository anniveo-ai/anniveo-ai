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
  async function retryResult(project){
    project=studioProjects.get(project.id)||project;
    if(project.loading){await loadStudioProjectResult(project);if(!project.media?.file)throw Error(project.error||'Файл пока не удалось загрузить. Можно повторить.');return project.media;}
    if(project.media?.url?.startsWith('blob:'))URL.revokeObjectURL(project.media.url);
    project.media=null;project.mediaBlob=null;project.previewDataUrl=null;project.error=null;
    await loadStudioProjectResult(project);
    if(!project.media?.file)throw Error(project.error||'Файл пока не удалось загрузить. Можно повторить.');
    return project.media;
  }
  function showLoadError(project){
    if(selectedStudioProject!==project.id)return;
    const stage=document.getElementById('mediaResultPreview');if(!stage)return;
    const retry=control('Повторить загрузку',async()=>{
      retry.disabled=true;retry.textContent='Загружаем…';
      try{await retryResult(project);workroomRenderKey='';renderProjectRoom();}
      catch(error){project.error=error.message;showLoadError(project);}
      finally{retry.disabled=false;}
    },'project-load-result');
    stage.replaceChildren(node('p',{className:'note'},project.error||'Не удалось открыть готовый файл.'),retry);
  }
  const exportsInProgress=new WeakMap();
  async function getMedia(project){
    if(project.loading||!project.media&&project.resultUrl){await loadStudioProjectResult(project);if(!project.media&&project.loadingPromise)await project.loadingPromise;}
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
  const imagePreviews=new WeakMap();
  function ensureImagePreview(project){
    if(project.kind!=='image'||project.previewDataUrl)return Promise.resolve(project.previewDataUrl);
    if(imagePreviews.has(project))return imagePreviews.get(project);
    const blob=project.media?.blob||project.mediaBlob;
    if(!blob?.size)return Promise.resolve(null);
    // A byte-backed image also survives WKWebView object-URL invalidation.
    const task=new Promise((resolve,reject)=>{
      const reader=new FileReader(),timer=setTimeout(()=>{reader.abort();reject(Error('Не удалось прочитать фото.'));},10000);reader.onload=()=>{clearTimeout(timer);resolve(String(reader.result));};reader.onerror=()=>{clearTimeout(timer);reject(reader.error||Error('Не удалось прочитать фото.'));};reader.readAsDataURL(blob);
    }).then(async url=>{
      // Only the screen preview is reduced; the export keeps its original pixels.
      try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);url=canvas.toDataURL('image/webp',.9);}catch{}
      project.previewDataUrl=url;return url;
    }).finally(()=>imagePreviews.delete(project));
    imagePreviews.set(project,task);return task;
  }
  function resultPreview(project){
    const media=node(project.kind==='video'?'video':'img');media.className='project-result-media';
    media.addEventListener(project.kind==='video'?'loadeddata':'load',()=>{media.dataset.ready='true';media.parentElement?.querySelector('.project-load-result')?.remove();},{once:true});
    if(project.kind==='video'){media.controls=true;media.playsInline=true;media.preload='metadata';}
    else{media.alt='Готовое фото';media.decoding='async';}
    media.src=project.previewDataUrl||project.media?.url||project.resultUrl;
    if(project.kind==='image'&&!project.previewDataUrl&&project.media?.blob){
      void ensureImagePreview(project).then(url=>{if(url&&media.isConnected)media.src=url;}).catch(()=>{});
    }
    media.addEventListener('error',()=>{
      if(!media.isConnected)return;
      project.error='Готовый файл не открылся. Повтори загрузку — новый заказ не создаётся.';showLoadError(project);
    },{once:true});
    return media;
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
    if(kind==='image'){
      const reader=new FileReader();reader.onload=()=>{if(media.isConnected)media.src=String(reader.result);};reader.readAsDataURL(item.file);
    }
    viewerNote.textContent=kind==='video'?'Нажми воспроизведение, чтобы посмотреть видео. Сохранение в «Фото» — через системное меню «Поделиться».':'Удерживай фото, чтобы открыть меню сохранения. Также можно сохранить его через «Поделиться».';
    if(item.width&&item.height)viewerNote.textContent=item.width+'×'+item.height+' пикс. · '+(item.warning||viewerNote.textContent);
    if(navigator.share&&navigator.canShare?.({files:[item.file]}))viewerActions.append(control('Сохранить в Фото',()=>void saveMedia(item,kind),'anis-button primary'));
    viewerActions.append(control('Скачать .'+item.file.name.split('.').at(-1),()=>download(item),'anis-button'));
    if(!viewer.open)viewer.showModal();
  }
  async function saveMedia(item,kind){
    if(navigator.share&&navigator.canShare?.({files:[item.file]})){
      try{await navigator.share({files:[item.file],title:kind==='video'?'Видео ANIS AI':'Фото ANIS AI'});return;}
      catch(error){if(error.name==='AbortError')return;showMedia(item,kind);viewerNote.textContent='Файл готов. Нажми «Сохранить в Фото» ещё раз, чтобы открыть системное меню. Для фото также доступно сохранение долгим нажатием.';return;}
    }
    const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent||'');
    if(!mobile){download(item);return;}
    showMedia(item,kind);
  }
  function saveProject(project){
    // Call native Share inside the original click, before any asynchronous download.
    if(project.media?.file&&!project.loading&&!project.resolutionPending)return window.anisProjectActions.saveMedia(project.media,project.kind);
    viewerTitle.textContent=project.kind==='video'?'Подготавливаем видео':'Подготавливаем фото';viewerStage.replaceChildren();viewerActions.replaceChildren();viewerNote.textContent='Загружаем готовый файл. Новый заказ не создаётся.';if(!viewer.open)viewer.showModal();
    return getMedia(project).then(item=>showMedia(item,project.kind)).catch(error=>{
      viewerNote.textContent=error.message;viewerActions.replaceChildren(control('Повторить загрузку',()=>{
        viewerActions.replaceChildren();viewerNote.textContent='Загружаем…';
        void retryResult(project).then(()=>saveProject(project)).catch(next=>{viewerNote.textContent=next.message;viewerActions.replaceChildren(control('Повторить',()=>void saveProject(project),'anis-button'));});
      },'anis-button primary'));
    });
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
        try{if(action==='download'){await saveProject(project);return;}const item=await getMedia(project);if(action==='crop')await openCrop(project,item);else prepareAction(project,item,action);}
        catch(error){if(error.name!=='AbortError')toast(error.message||'Не удалось открыть действие.');}
        finally{b.disabled=false;b.removeAttribute('aria-busy');}
      },'ready-project-action ready-action-'+action);
      b.dataset.action=action;b.setAttribute('aria-label',label+(project.kind==='video'?' видео':' фото'));b.title=label;
      b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[action]+'</svg>';
      b.append(node('span',{},label));rail.append(b);
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
  // Automatically load completed projects once. Explicit clicks can retry failures.
  const originalRoomRender=window.renderProjectRoom,pendingRooms=new WeakSet(),roomAttempts=new WeakSet();
  if(typeof originalRoomRender==='function')window.renderProjectRoom=function(...args){
    const result=originalRoomRender.apply(this,args),project=studioProjects.get(selectedStudioProject);
    if(!document.getElementById('mediaResultDialog')?.open||!project||project.status!=='completed'||project.media||!project.resultUrl||pendingRooms.has(project)||roomAttempts.has(project))return result;
    pendingRooms.add(project);roomAttempts.add(project);
    Promise.resolve().then(()=>loadStudioProjectResult(project)).finally(()=>{pendingRooms.delete(project);if(!project.media)showLoadError(project);});
    return result;
  };
  // Visible results load through our API and are retained as local blobs. Rendering
  // must not restart all the full-size downloads or create an infinite retry loop.
  const galleryLoads=new Set(),galleryAttempts=new Map(),galleryQueue=[];
  function pumpGallery(){
    while(currentView==='ready'&&!document.getElementById('mediaResultDialog')?.open&&galleryLoads.size<1&&galleryQueue.length){
      const project=galleryQueue.shift();if(project.media||galleryLoads.has(project.id))continue;
      const card=document.querySelector('.studio-ready-project[data-project-id=\"'+CSS.escape(project.id)+'\"]');if(!card||!nearViewport(card)){galleryAttempts.delete(project.id);continue;}
      galleryLoads.add(project.id);
      Promise.resolve().then(()=>loadStudioProjectResult(project)).finally(()=>{galleryLoads.delete(project.id);repairReadyGallery();pumpGallery();});
    }
  }
  function nearViewport(card){const rect=card.getBoundingClientRect();return rect.bottom>=-250&&rect.top<=window.innerHeight+250;}
  function repairReadyGallery(){
    const grid=document.getElementById('studioReadyList');if(!grid)return;
    for(const card of grid.querySelectorAll('.studio-ready-project[data-project-id]')){
      const project=studioProjects.get(card.dataset.projectId),preview=card.querySelector('.studio-ready-preview');
      if(!project||project.status!=='completed'||!preview)continue;
      if(project.previewDataUrl||project.media?.url){
        const url=project.previewDataUrl||project.media.url;
        const media=preview.querySelector('img,video');
        if(media?.getAttribute('src')!==url){const next=node(project.kind==='video'?'video':'img',{src:url});if(project.kind==='video'){next.muted=true;next.playsInline=true;next.preload='metadata';}else next.alt='Готовое фото';if(media)media.replaceWith(next);else preview.prepend(next);}
        preview.querySelector('.ready-preview-status')?.remove();continue;
      }
      if(!project.resultUrl)continue;
      let status=preview.querySelector('.ready-preview-status');
      if(!status){status=node('span',{className:'ready-preview-status',role:'status'});preview.prepend(status);}
      status.textContent=project.error&&!project.loading?'Нажми, чтобы загрузить':'Загружаем '+(project.kind==='video'?'видео…':'фото…');
      if(nearViewport(card)&&!galleryLoads.has(project.id)&&galleryAttempts.get(project.id)!==project.resultUrl){galleryAttempts.set(project.id,project.resultUrl);galleryQueue.push(project);}
    }
    pumpGallery();
  }
  let galleryFrame=0;
  function scheduleGallery(){cancelAnimationFrame(galleryFrame);galleryFrame=requestAnimationFrame(repairReadyGallery);}
  document.getElementById('app')?.addEventListener('scroll',scheduleGallery,{passive:true});window.addEventListener('resize',scheduleGallery);document.getElementById('mediaResultDialog')?.addEventListener('close',scheduleGallery);
  function observeGallery(){const grid=document.getElementById('studioReadyList');if(grid){new MutationObserver(repairReadyGallery).observe(grid,{childList:true});repairReadyGallery();}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observeGallery,{once:true});else observeGallery();
  window.anisProjectActions={createControls,normalizeBlob,saveMedia,saveProject,showMedia,getMedia,retryResult,showLoadError,ensureImagePreview,resultPreview,refreshGallery:scheduleGallery};
})();

