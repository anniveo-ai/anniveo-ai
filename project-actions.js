/* Actions always retain the project they belong to, including while a file loads. */
(() => {
  'use strict';
  const node=(tag,props={},text)=>{const n=document.createElement(tag);Object.assign(n,props);if(text!==undefined)n.textContent=text;return n;};
  const icons={
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    edit:'<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',
    enhance:'<path d="m4 20 11-11 3 3L7 23ZM14 3v4m-2-2h4M21 14v4m-2-2h4M19 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/>',
    crop:'<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>',
    delete:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
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
    project.media.exportJobId=project.exportJobId||project.id;return project.media;
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
  async function getMedia(project,{forExport=false}={}){
    if(project.loading||!project.media&&project.resultUrl){await loadStudioProjectResult(project);if(!project.media&&project.loadingPromise)await project.loadingPromise;}
    if(!project.media?.file)throw Error(project.error||'Не удалось открыть результат. Попробуй ещё раз.');
    if(forExport&&project.resolutionPending&&window.anisMediaQuality){
      let exporting=exportsInProgress.get(project);
      if(!exporting){exporting=(async()=>{
        const result=await window.anisMediaQuality.prepare(project,project.media.blob,{convertVideo:true});
        project.resolutionWarning=result.warning;project.resolutionPending=false;
        if(result.pending){Object.assign(project.media,{warning:result.warning,width:result.width,height:result.height});return;}
        const old=project.media.url;project.media=mediaFromBlob(project.kind,result.blob);project.mediaBlob=result.blob;project.outputWidth=result.width;project.outputHeight=result.height;Object.assign(project.media,{width:result.width,height:result.height,warning:result.warning});if(old?.startsWith('blob:'))URL.revokeObjectURL(old);persistStudioProjects();updateProjectDock();
      })();exportsInProgress.set(project,exporting);}
      try{await exporting;}finally{exportsInProgress.delete(project);}
    }
    project.media.exportJobId=project.exportJobId||project.id;return project.media;
  }
  const imagePreviews=new WeakMap();
  function mediaDeadline(promise,ms,message){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(message)),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)});});}
  async function downloadMediaBlob(project){
    const proxy={url:API_URL,options:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'media-file',jobId:project.id,initData})}},direct={url:project.resultUrl},routes=initData?[proxy,direct,proxy]:[direct,direct];
    let lastError;
    for(const route of routes){
      const controller=new AbortController();let idle,total,reader;
      const touch=()=>{clearTimeout(idle);idle=setTimeout(()=>controller.abort(),20000);};
      try{
        touch();total=setTimeout(()=>controller.abort(),120000);
        const response=await fetch(route.url,{...route.options,signal:controller.signal});if(!response.ok){await response.body?.cancel();const error=Error('Файл временно недоступен (HTTP '+response.status+').');error.status=response.status;throw error;}
        const expected=Number(response.headers.get('Content-Length'))||0;let loaded=0;const chunks=[];reader=response.body?.getReader();
        if(!reader)return await normalizeBlob(project.kind,await response.blob());
        for(;;){touch();const {done,value}=await mediaDeadline(reader.read(),22000,'Загрузка остановилась.');if(done)break;chunks.push(value);loaded+=value.byteLength;project.downloadedBytes=loaded;project.downloadTotalBytes=expected;const progress=document.querySelector('.project-file-progress[data-project-id="'+CSS.escape(project.id)+'"]');if(progress)progress.textContent=expected?'Загружаем файл · '+Math.min(99,Math.round(loaded/expected*100))+'%':'Загружаем файл · '+(loaded/1048576).toFixed(1)+' МБ';}
        if(expected&&!response.headers.get('Content-Encoding')&&loaded!==expected)throw Error('Файл загрузился не целиком. Повторяем загрузку.');
        return await normalizeBlob(project.kind,new Blob(chunks,{type:response.headers.get('Content-Type')||''}));
      }catch(error){lastError=error;if([401,403].includes(error.status)&&route===direct)break;}
      finally{clearTimeout(idle);clearTimeout(total);controller.abort();try{void reader?.cancel().catch(()=>{});}catch{}}
    }
    throw lastError||Error('Не удалось загрузить файл.');
  }
  async function restorePreviews(projects){
    if(!initData)return;
    const pending=projects.filter(p=>p.status==='completed'&&!(p.kind==='video'?p.posterDataUrl:p.previewDataUrl));
    for(let i=0;i<pending.length;i+=24){
      const batch=pending.slice(i,i+24),data=await mediaJSON({action:'media-previews',ids:batch.map(p=>p.id)},20000);
      for(const row of data.items||[]){const project=studioProjects.get(row.jobId);if(project&&/^data:image\/(webp|jpeg|png);base64,/.test(row.dataUrl))project[project.kind==='video'?'posterDataUrl':'previewDataUrl']=row.dataUrl;}
    }
  }
  const uploadedPreviews=new WeakSet();
  async function storePreview(project,dataUrl){
    if(!initData||uploadedPreviews.has(project)||project.exportJobId)return;
    uploadedPreviews.add(project);
    try{const file=await (await fetch(dataUrl)).blob();if(file.size>256*1024)return;const form=new FormData();form.append('action','media-preview');form.append('initData',initData);form.append('jobId',project.id);form.append('file',file,'preview.webp');const response=await fetch(API_URL,{method:'POST',body:form,signal:AbortSignal.timeout(15000)});if(!response.ok)uploadedPreviews.delete(project);}catch{uploadedPreviews.delete(project);}
  }
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
      const image=new Image();image.src=url;await mediaDeadline(image.decode(),10000,'Фото не удалось открыть.');const scale=Math.min(1,640/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);url=canvas.toDataURL('image/webp',.78);canvas.width=canvas.height=1;image.src='';
      project.previewDataUrl=url;void storePreview(project,url);return url;
    }).finally(()=>imagePreviews.delete(project));
    imagePreviews.set(project,task);return task;
  }
  const videoPreviews=new WeakMap();
  function ensureVideoPoster(project){
    if(project.posterDataUrl)return Promise.resolve(project.posterDataUrl);if(videoPreviews.has(project))return videoPreviews.get(project);
    const blob=project.media?.blob||project.mediaBlob;if(!blob&&!project.resultUrl)return Promise.resolve(null);
    const task=(async()=>{const video=node('video',{muted:true,playsInline:true,preload:'auto'}),url=blob?URL.createObjectURL(blob):project.resultUrl;video.crossOrigin='anonymous';video.style.cssText='position:fixed;width:2px;height:2px;opacity:.01;pointer-events:none';
      try{document.body.append(video);const ready=new Promise((resolve,reject)=>{video.addEventListener('loadeddata',resolve,{once:true});video.addEventListener('error',()=>reject(Error('Кадр видео пока не загрузился.')),{once:true});});video.src=url;video.load();void video.play().catch(()=>{});await mediaDeadline(ready,18000,'Кадр видео загружается дольше обычного.');const scale=Math.min(1,720/Math.max(video.videoWidth,video.videoHeight)),canvas=node('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const preview=canvas.toDataURL('image/webp',.8);canvas.width=canvas.height=1;project.posterDataUrl=preview;void storePreview(project,preview);return preview;}
      finally{video.pause();video.removeAttribute('src');video.load();video.remove();if(blob)URL.revokeObjectURL(url);}
    })().finally(()=>videoPreviews.delete(project));videoPreviews.set(project,task);return task;
  }
  const ensureProjectPreview=project=>project.kind==='video'?ensureVideoPoster(project):ensureImagePreview(project);
  const playbackLinks=new WeakMap();
  async function playbackSource(project){
    if(!initData||!project.resultUrl||project.exportJobId&&project.exportJobId!==project.id)return project.media?.url||project.resultUrl;
    const cached=playbackLinks.get(project);if(cached&&cached.expires>Date.now()+60000)return cached.url;
    const data=await mediaJSON({action:'media-playback',jobId:project.id},10000);if(new URL(data.url).origin!==new URL(API_URL).origin)throw Error('Некорректный адрес видео.');playbackLinks.set(project,data);return data.url;
  }
  function attachVideoPlayback(media,project){
    let timer,lastTime=0,lastAdvance=Date.now(),wanted=false,recovering=false,recovered=false;
    const note=text=>{if(!media.isConnected)return;let n=media.parentElement?.querySelector('.project-file-progress');if(!n){n=node('span',{className:'project-file-progress'});n.dataset.projectId=project.id;media.parentElement?.append(n);}n.textContent=text;};
    const recover=async()=>{
      if(recovering||recovered||!media.isConnected)return;recovering=true;recovered=true;clearInterval(timer);note('Загружаем видео целиком для просмотра…');
      const time=media.currentTime||0,resume=wanted;
      try{await loadStudioProjectResult(project);if(!project.media?.file)throw Error(project.error||'Не удалось загрузить видео.');if(!media.isConnected)return;media.src=project.media.url;media.addEventListener('loadedmetadata',()=>{if(time>0&&time<media.duration)media.currentTime=time;},{once:true});media.load();if(resume)void media.play().catch(()=>{note('Видео загружено. Нажми Play.');});}
      catch(error){project.error=error.message;if(media.isConnected)showLoadError(project);}
      finally{recovering=false;}
    };
    const monitor=()=>{clearInterval(timer);lastAdvance=Date.now();timer=setInterval(()=>{if(!media.isConnected||media.ended){clearInterval(timer);return;}if(media.currentTime>lastTime+.05){lastTime=media.currentTime;lastAdvance=Date.now();}if(wanted&&!media.ended&&Date.now()-lastAdvance>8000)void recover();},1000);};
    media.addEventListener('play',()=>{wanted=true;monitor();});
    media.addEventListener('pause',()=>{wanted=false;if(!recovering)clearInterval(timer);});
    media.addEventListener('playing',()=>{lastAdvance=Date.now();media.parentElement?.querySelector('.project-file-progress')?.remove();});
    media.addEventListener('waiting',()=>{if(wanted)note('Буферизация видео…');});
    media.addEventListener('ended',()=>{clearInterval(timer);media.parentElement?.querySelector('.project-file-progress')?.remove();});
    media.addEventListener('error',()=>{if(!recovered){void recover();}else if(media.isConnected){project.error='Видео не удалось воспроизвести. Повтори загрузку файла.';showLoadError(project);}});
    // Obtain an authenticated range-capable URL before loading a remote video.
    queueMicrotask(()=>{void playbackSource(project).then(source=>{if(!media.isConnected||recovering||recovered)return;if(source){media.src=source;media.load();}}).catch(()=>{if(media.isConnected&&!recovering&&!recovered){media.src=project.media?.url||project.resultUrl;media.load();}});});
  }
  function resultPreview(project){
    const media=node(project.kind==='video'?'video':'img');media.className='project-result-media';
    media.dataset.projectId=project.id;
    const ready=()=>{media.dataset.ready='true';media.parentElement?.querySelector('.project-load-result')?.remove();};
    media.addEventListener(project.kind==='video'?'loadeddata':'load',ready,{once:true});
    if(project.kind==='video'){media.controls=true;media.playsInline=true;media.preload='auto';if(project.posterDataUrl){media.poster=project.posterDataUrl;media.dataset.ready='true';}media.addEventListener('loadedmetadata',ready,{once:true});}
    else{media.alt='Готовое фото';media.decoding='async';}
    const source=project.media?.url||(project.kind==='image'?project.previewDataUrl:null);if(project.kind==='video')attachVideoPlayback(media,project);else if(source)media.src=source;
    if(project.loading)queueMicrotask(()=>{if(!media.isConnected||!project.loading)return;const note=node('span',{className:'project-file-progress'},'Загружаем оригинал…');note.dataset.projectId=project.id;media.parentElement?.append(note);});
    if(project.kind==='image'&&!project.previewDataUrl&&project.media?.blob){
      void ensureImagePreview(project).then(url=>{if(url&&media.isConnected)media.src=url;}).catch(()=>{});
    }
    let repaired=false;
    media.addEventListener('error',()=>{
      if(!media.isConnected||project.kind==='video')return;
      if(!repaired&&project.media?.file){repaired=true;if(project.kind==='image'){void ensureImagePreview(project).then(url=>{if(media.isConnected&&url)media.src=url;}).catch(()=>showLoadError(project));return;}project.media.url=URL.createObjectURL(project.media.file);media.src=project.media.url;media.load();return;}
      project.error='Готовый файл не открылся. Повтори загрузку — новый заказ не создаётся.';showLoadError(project);
    });
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
  const nativeDownloads=new WeakMap();
  function telegramDownloads(){const bridge=window.Telegram?.WebApp||(typeof tg!=='undefined'?tg:null);return typeof bridge?.downloadFile==='function'&&bridge.isVersionAtLeast?.('8.0')?bridge:null;}
  function shareable(item){try{return !!(navigator.share&&navigator.canShare?.({files:[item.file]}));}catch{return false;}}
  function prepareDownload(item){
    const cached=nativeDownloads.get(item.file);if(cached&&cached.expires>Date.now()+60000)return cached.promise;
    const promise=(async()=>{
      if(!initData||!item.exportJobId)throw Error('Для скачивания открой работу через Telegram.');
      const form=new FormData();form.append('action','media-export');form.append('initData',initData);form.append('jobId',item.exportJobId);form.append('file',item.file,item.file.name);
      const response=await fetch(API_URL,{method:'POST',body:form,signal:AbortSignal.timeout(90000)}),data=await response.json();if(!response.ok)throw Error(data.error||'Не удалось подготовить скачивание.');
      if(new URL(data.url).origin!==new URL(API_URL).origin)throw Error('Некорректная ссылка скачивания.');
      nativeDownloads.set(item.file,{promise:Promise.resolve(data),expires:data.expires});return data;
    })().catch(error=>{nativeDownloads.delete(item.file);throw error;});
    nativeDownloads.set(item.file,{promise,expires:Date.now()+25*60*1000});return promise;
  }
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
    if(shareable(item))viewerActions.append(control('Поделиться · сохранить в Фото',()=>{void navigator.share({files:[item.file],title:kind==='video'?'Видео ANIS AI':'Фото ANIS AI'}).catch(error=>{if(error.name!=='AbortError')viewerNote.textContent='Системное меню недоступно. Используй «Скачать», либо удерживай фото для сохранения.';});},'anis-button'));
    viewerActions.append(control('Скачать .'+item.file.name.split('.').at(-1),()=>void saveMedia(item,kind),'anis-button primary'));
    if(!viewer.open)viewer.showModal();
  }
  async function saveMedia(item,kind){
    if(telegramDownloads()&&item.exportJobId){
      showMedia(item,kind);viewerNote.textContent='Подготавливаем скачивание файла…';
      try{const data=await window.anisProjectActions.prepareDownload(item);viewerNote.textContent='Подтверди скачивание в окне Telegram.';telegramDownloads().downloadFile({url:data.url,file_name:data.filename},accepted=>{viewerNote.textContent=accepted?'Скачивание началось. Файл можно открыть в загрузках Telegram.':'Скачивание отменено. Нажми «Скачать», чтобы повторить.';});}
      catch(error){viewerNote.textContent=error.message+' Можно сохранить фото долгим нажатием или через «Поделиться».';}
      return;
    }
    if(shareable(item)){
      try{await navigator.share({files:[item.file],title:kind==='video'?'Видео ANIS AI':'Фото ANIS AI'});return;}
      catch(error){if(error.name==='AbortError')return;showMedia(item,kind);viewerNote.textContent='Файл готов. Нажми «Поделиться · сохранить в Фото», чтобы открыть системное меню. Для фото также доступно сохранение долгим нажатием.';return;}
    }
    const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent||'');
    if(!mobile){download(item);return;}
    showMedia(item,kind);
  }
  function saveProject(project){
    // Call native Share inside the original click, before any asynchronous download.
    if(project.media?.file&&!project.loading&&!project.resolutionPending){project.media.exportJobId=project.exportJobId||project.id;return window.anisProjectActions.saveMedia(project.media,project.kind);}
    viewerTitle.textContent=project.kind==='video'?'Подготавливаем видео':'Подготавливаем фото';viewerStage.replaceChildren();viewerActions.replaceChildren();viewerNote.textContent='Загружаем готовый файл. Новый заказ не создаётся.';if(!viewer.open)viewer.showModal();
    return getMedia(project,{forExport:true}).then(item=>telegramDownloads()?saveMedia(item,project.kind):showMedia(item,project.kind)).catch(error=>{
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
    selectValue(kind+'Quality',project.quality||'fhd');
    if(kind==='video')selectValue('duration',project.duration||4);
    const subject=kind==='video'?'видео':'фото',prompt=$(kind+'Prompt');
    prompt.value=action==='enhance'?'Улучши качество этого '+subject+'. Сохрани лица, композицию, цвета и все важные детали. Добавь естественную чёткость'+(kind==='video'?', плавность и стабильность движения.':', аккуратно убери шум.'):
      action==='similar'?((project.prompt||'Создай похожее '+subject)+'. Новый вариант по этому референсу: сохрани стиль и настроение, предложи немного другую композицию.').slice(0,1200):'';
    prompt.dispatchEvent(new Event('input',{bubbles:true}));
    if(action==='enhance'){
      const settings=$(kind+'Quality').closest('.media-settings'),scroller=$('app');
      scroller.scrollTo({top:Math.max(0,scroller.scrollTop+settings.getBoundingClientRect().top-scroller.getBoundingClientRect().top-16),behavior:'instant'});
      return;
    }
    toast(kind==='video'?'Всё готово. Нажми «Создать видео».':'Всё готово. Нажми «Создать фото».');
  }
  function createControls(project,{deleteOnly=false}={}){
    const rail=node('div',{className:'ready-project-actions'});rail.setAttribute('role','group');rail.setAttribute('aria-label','Действия с '+(project.kind==='video'?'видео':'фото'));rail.dataset.projectId=project.id;
    for(const [action,label]of (deleteOnly?(['failed','cancelled'].includes(project.status)?[['delete','Удалить'],['revise','Изменить запрос']]:[['delete','Удалить']]):[['download','Скачать'],['edit','Изменить'],['enhance','Улучшить'],['crop','Обрезать'],['delete','Удалить'],['similar','Создать похожее']])){
      const b=control('',async()=>{
        if(action==='delete'){window.anisStability.requestWorkDeletion(project);return;}
        if(action==='revise'){closeGeneratedMedia();const kind=project.kind;openView(kind==='video'?'video':'studio');if(project.sourceFile)(kind==='video'?setStudioVideo:setStudioPhoto)(project.sourceFile);if(kind==='video'&&project.identityFile)setVideoIdentity(project.identityFile);const idea=$(kind+'Prompt');idea.value=project.prompt||'';idea.dispatchEvent(new Event('input',{bubbles:true}));idea.focus({preventScroll:true});if(project.hasSource&&!project.sourceFile)toast('Добавь исходный файл заново. Новый заказ ещё не создан.');return;}
        b.disabled=true;b.setAttribute('aria-busy','true');
        try{if(action==='download'){await saveProject(project);return;}if(action==='edit'){openProjectRoom(project.id);const idea=$('projectAgentIdea');idea.focus({preventScroll:true});idea.closest('.project-agent').scrollIntoView({block:'center',behavior:'smooth'});return;}if(action==='crop'){await openCrop(project);return;}const item=await getMedia(project);prepareAction(project,item,action);}
        catch(error){if(error.name!=='AbortError')toast(error.message||'Не удалось открыть действие.');}
        finally{b.disabled=false;b.removeAttribute('aria-busy');}
      },'ready-project-action ready-action-'+action);
      b.dataset.action=action;b.setAttribute('aria-label',label+(project.kind==='video'?' видео':' фото'));b.title=label;
      b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[action==='revise'?'edit':action]+'</svg>';
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
    const w=s.image.naturalWidth,h=s.image.naturalHeight,r=s.ratio,cw=Math.min(w,h*r)/s.zoom,ch=cw/r,scale=Math.min(1,1024/Math.max(cw,ch));
    s.bounds={x:(w-cw)*s.x,y:(h-ch)*s.y,w:cw,h:ch};s.canvas.width=Math.max(1,Math.round(cw*scale));s.canvas.height=Math.max(1,Math.round(ch*scale));
    s.canvas.getContext('2d').drawImage(s.image,s.bounds.x,s.bounds.y,cw,ch,0,0,s.canvas.width,s.canvas.height);
  }
  async function openCrop(project,item,retry=false){
    if(cropDialog.open&&!retry)return;cropState?.controller.abort();
    const s=cropState={project,item,controller:new AbortController(),x:.5,y:.5,zoom:1,ratio:1,exporting:false};cropStage.replaceChildren();cropFields.replaceChildren();cropSave.disabled=true;cropStatus.textContent='Открываем исходник…';cropTitle.textContent=project.kind==='video'?'Обрезать видео':'Обрезать фото';if(!cropDialog.open)cropDialog.showModal();
    try{
      item=item||await getMedia(studioProjects.get(project.id)||project);if(cropState!==s)return;s.item=item;
      if(project.kind==='image'){
        s.image=new Image();s.image.src=item.url;await s.image.decode();if(cropState!==s)return;
        s.canvas=node('canvas');cropStage.append(s.canvas);const formats=node('div',{className:'ready-crop-formats',role:'group'});formats.setAttribute('aria-label','Формат обрезки');
        for(const [label,ratio]of [['1:1',1],['9:16',9/16],['16:9',16/9]]){const b=control(label,()=>{s.ratio=ratio;for(const n of formats.children)n.setAttribute('aria-pressed',String(n===b));redrawCrop();},'anis-button');b.setAttribute('aria-pressed',String(ratio===1));formats.append(b);}cropFields.append(formats);
        slider('Приблизить',1,4,1,.05,(value,input,output)=>{s.zoom=value;output.textContent=value.toFixed(1)+'×';redrawCrop();});
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
    }catch(error){if(error.name!=='AbortError'&&cropState===s){cropStatus.textContent=error.message;cropStage.replaceChildren(control('Повторить загрузку',()=>void openCrop(project,null,true),'anis-button'));}}
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
      let blob;
      if(s.project.kind==='video')blob=await trimVideo(s);else{const output=node('canvas'),b=s.bounds;output.width=Math.max(1,Math.round(b.w));output.height=Math.max(1,Math.round(b.h));output.getContext('2d').drawImage(s.image,b.x,b.y,b.w,b.h,0,0,output.width,output.height);blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));}
      if(!blob?.size)throw Error('Не удалось сохранить обрезку.');if(cropState!==s||s.controller.signal.aborted)return;
      const media=mediaFromBlob(s.project.kind,blob),p={id:crypto.randomUUID(),groupId:s.project.groupId||s.project.id,kind:s.project.kind,status:'completed',created:Date.now(),order:++projectCounter,prompt:(s.project.prompt||'Моя работа')+' · обрезка',quality:s.project.quality||'fast',ratio:s.project.kind==='image'?(s.ratio===1?'1:1':s.ratio<1?'9:16':'16:9'):s.project.ratio,duration:s.project.kind==='video'?Math.round((s.end-s.start)*10)/10:undefined,media,mediaBlob:blob,sourceFile:media.file};
      p.exportJobId=s.project.exportJobId||s.project.id;media.exportJobId=p.exportJobId;studioProjects.set(p.id,p);persistStudioProjects();cropDialog.close();openProjectRoom(p.id);if(telegramDownloads())void saveMedia(media,p.kind);else showMedia(media,p.kind);
    }catch(error){if(error.name!=='AbortError'){if(s.project.kind==='video')cropDialog.close();toast(error.message);}}
    finally{if(cropState===s){s.exporting=false;cropSave.disabled=false;for(const input of cropFields.querySelectorAll('input,button'))input.disabled=false;}}
  }
  // Automatically load completed projects once. Explicit clicks can retry failures.
  const originalRoomRender=window.renderProjectRoom,pendingRooms=new WeakSet(),roomAttempts=new WeakSet();
  if(typeof originalRoomRender==='function')window.renderProjectRoom=function(...args){
    const result=originalRoomRender.apply(this,args),project=studioProjects.get(selectedStudioProject);
    if(!document.getElementById('mediaResultDialog')?.open||!project||project.kind==='video'||project.status!=='completed'||project.media||!project.resultUrl||pendingRooms.has(project)||roomAttempts.has(project))return result;
    pendingRooms.add(project);roomAttempts.add(project);
    Promise.resolve().then(()=>loadStudioProjectResult(project)).finally(()=>{pendingRooms.delete(project);if(!project.media)showLoadError(project);});
    return result;
  };
  // Visible results load through our API and are retained as local blobs. Rendering
  // must not restart all the full-size downloads or create an infinite retry loop.
  const galleryLoads=new Set(),galleryAttempts=new Map(),galleryQueue=[];
  function pumpGallery(){
    while(currentView==='ready'&&!window.anisStability?.historyLoading&&!document.getElementById('mediaResultDialog')?.open&&galleryLoads.size<2&&galleryQueue.length){
      const project=galleryQueue.shift();if((project.kind==='video'?project.posterDataUrl:project.previewDataUrl)||galleryLoads.has(project.id))continue;
      const card=document.querySelector('.studio-ready-project[data-project-id=\"'+CSS.escape(project.id)+'\"]');if(!card||!nearViewport(card)){galleryAttempts.delete(project.id);continue;}
      galleryLoads.add(project.id);
      Promise.resolve().then(async()=>{if(project.kind==='image'&&!project.media)await loadStudioProjectResult(project);await ensureProjectPreview(project);}).catch(error=>{project.previewError=error.message;}).finally(()=>{galleryLoads.delete(project.id);const attempt=galleryAttempts.get(project.id);if(attempt&&attempt.count<3){attempt.next=Date.now()+attempt.count*3000;setTimeout(scheduleGallery,attempt.count*3000+50);}repairReadyGallery();pumpGallery();});
    }
  }
  function nearViewport(card){const rect=card.getBoundingClientRect();return rect.bottom>=-250&&rect.top<=window.innerHeight+250;}
  function repairReadyGallery(){
    const grid=document.getElementById('studioReadyList');if(!grid)return;
    for(const card of grid.querySelectorAll('.studio-ready-project[data-project-id]')){
      const project=studioProjects.get(card.dataset.projectId),preview=card.querySelector('.studio-ready-preview');
      if(!project||project.status!=='completed'||!preview)continue;
      const thumbnail=project.kind==='video'?project.posterDataUrl:project.previewDataUrl;
      if(thumbnail){
        const url=thumbnail;
        const media=preview.querySelector('img,video');
        if(media?.getAttribute('src')!==url){const next=node('img',{src:url,loading:'lazy',decoding:'async',alt:project.kind==='video'?'Кадр готового видео':'Готовое фото'});if(media)media.replaceWith(next);else preview.prepend(next);}
        preview.querySelector('.ready-preview-status')?.remove();continue;
      }
      if(!project.resultUrl&&!project.media?.file)continue;
      let status=preview.querySelector('.ready-preview-status');
      if(!status){status=node('span',{className:'ready-preview-status',role:'status'});preview.prepend(status);}
      status.textContent=(project.error||project.previewError)&&!project.loading?'Нажми, чтобы открыть':'Открываем '+(project.kind==='video'?'кадр видео…':'фото…');
      const old=galleryAttempts.get(project.id),attempt=old?.url===project.resultUrl?old:{url:project.resultUrl,count:0,next:0};
      if(nearViewport(card)&&!galleryLoads.has(project.id)&&attempt.count<3&&Date.now()>=attempt.next&&!galleryQueue.includes(project)){attempt.count++;galleryAttempts.set(project.id,attempt);galleryQueue.push(project);}
    }
    pumpGallery();
  }
  let galleryFrame=0;
  function scheduleGallery(){cancelAnimationFrame(galleryFrame);galleryFrame=requestAnimationFrame(repairReadyGallery);}
  document.getElementById('app')?.addEventListener('scroll',scheduleGallery,{passive:true});window.addEventListener('resize',scheduleGallery);document.getElementById('mediaResultDialog')?.addEventListener('close',scheduleGallery);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){galleryAttempts.clear();scheduleGallery();}});window.addEventListener('online',()=>{galleryAttempts.clear();scheduleGallery();});
  function observeGallery(){const grid=document.getElementById('studioReadyList');if(grid){new MutationObserver(repairReadyGallery).observe(grid,{childList:true});repairReadyGallery();}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observeGallery,{once:true});else observeGallery();
  window.anisProjectActions={createControls,normalizeBlob,saveMedia,saveProject,showMedia,getMedia,prepareDownload,retryResult,showLoadError,ensureImagePreview,ensureProjectPreview,downloadMediaBlob,restorePreviews,resultPreview,refreshGallery:scheduleGallery};
})();

