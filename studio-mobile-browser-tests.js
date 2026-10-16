/* Inject into an isolated guest browser. No creation requests or paid generations. */
(async()=>{
 const report={checks:[]},wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,name,details)=>{report.checks.push({name,pass:!!ok,details});if(!ok)throw Error(name);};
 try{
  for(let n=0;n<200&&(!window.anisProjectActions||!window.anisStability||window.anisStability.restoring);n++)await wait(50);
  const photo={id:'qa-photo',kind:'image',status:'processing',prompt:'Тест фото',order:1,created:Date.now()},video={id:'qa-video',kind:'video',status:'pending',prompt:'Тест видео',order:2,created:Date.now()+1};
  studioProjects.set(photo.id,photo);studioProjects.set(video.id,video);updateProjectDock();
  openView('video');openProjectRoom(video.id);closeGeneratedMedia();openView('history');openView('video');
  check(!document.getElementById('videoCreationProgress').hidden&&!document.getElementById('mediaResultDialog').open,'Ongoing video remains visible after navigation');
  check(document.getElementById('voiceStatus').textContent==='Нажми на шар и скажи, что нужно','Navigation immediately restores idle voice hint without completed-chat flash');
  check([...document.querySelectorAll('.studio-nav-job-track')].filter(n=>!n.hidden).length===2,'Separate photo and video navigation tracks');
  document.getElementById('videoCreationProgress').click();check(selectedStudioProject===video.id&&document.getElementById('mediaResultDialog').open,'Reopens the same ongoing job');closeGeneratedMedia();
  const actualViewport=window.visualViewport,fakeViewport={height:420,offsetTop:0};
  Object.defineProperty(window,'visualViewport',{configurable:true,value:fakeViewport});
  for(const [view,id]of [['studio','imagePrompt'],['video','videoPrompt']]){
   fakeViewport.height=844;openView(view);await wait(100);const field=document.getElementById(id);field.value='Тестовая идея';field.focus({preventScroll:true});fakeViewport.height=420;window.dispatchEvent(new Event('resize'));await wait(600);
   const box=field.closest('.studio-prompt-box'),rect=box.getBoundingClientRect();
   check(box.classList.contains('studio-prompt-pinned')&&Math.abs(rect.bottom-412)<3,'Prompt immediately above keyboard: '+view,{top:rect.top,bottom:rect.bottom});
   document.querySelector('#studioKeyboardBar button').click();fakeViewport.height=844;window.dispatchEvent(new Event('resize'));await wait(850);
   const settings=document.querySelector('#view-'+view+' .media-settings').getBoundingClientRect(),appRect=document.getElementById('app').getBoundingClientRect();
   check(document.activeElement!==field&&!box.classList.contains('studio-prompt-pinned')&&settings.top>=appRect.top-2&&settings.bottom<844,'Checkmark reveals format and quality settings: '+view,{top:settings.top,bottom:settings.bottom,appTop:appRect.top});
  }
  Object.defineProperty(window,'visualViewport',{configurable:true,value:actualViewport});
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.getContext('2d').fillRect(0,0,64,64);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
  const originalFetch=window.fetch;let downloads=0;
  window.fetch=(url,options)=>{if(String(url)==='https://example.test/qa-result.png'){downloads++;return Promise.resolve(downloads===1?new Response('',{status:503}):new Response(blob,{status:200,headers:{'Content-Type':'image/png'}}));}return originalFetch(url,options);};
  photo.status='completed';photo.resultUrl='https://example.test/qa-result.png';openProjectRoom(photo.id);await loadStudioProjectResult(photo);await wait(100);
  const retry=document.querySelector('#mediaResultPreview .project-load-result');check(!!retry&&!photo.media,'Failed file exposes retry button');retry.click();
  for(let n=0;n<200&&!photo.media?.file;n++)await wait(50);await wait(150);
  check(downloads===2&&!!photo.media?.file&&studioProjects.get(photo.id)===photo,'Retry reloads the file without another generation',{downloads});
  const shown=document.querySelector('#mediaResultPreview img');check(!!shown&&getComputedStyle(shown).objectFit==='contain','Whole photo fits the preview frame');
  const shared=[];Object.defineProperty(navigator,'share',{configurable:true,value:data=>{shared.push(data);return Promise.resolve();}});Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  const saving=saveGeneratedMedia();check(shared.length===1,'Native save is called synchronously inside original gesture');await saving;
  check(shared[0].files[0]===photo.media.file,'Save uses export file rather than preview');
  closeGeneratedMedia();openView('ready');
  const rail=window.anisProjectActions.createControls(photo);document.body.append(rail);rail.querySelector('[data-action="edit"]').click();await wait(350);
  check(selectedStudioProject===photo.id&&document.getElementById('mediaResultDialog').open&&document.activeElement===document.getElementById('projectAgentIdea'),'Edit opens the selected result agent');
  Object.defineProperty(window,'visualViewport',{configurable:true,value:fakeViewport});fakeViewport.height=420;window.dispatchEvent(new Event('resize'));await wait(650);
  const agent=document.getElementById('projectAgentIdea').closest('.project-agent'),agentRect=agent.getBoundingClientRect(),done=document.querySelector('#studioKeyboardBar button');
  check(agent.classList.contains('studio-prompt-pinned')&&Math.abs(agentRect.bottom-412)<3,'Agent sits immediately above keyboard',{top:agentRect.top,bottom:agentRect.bottom});
  const doneRect=done.getBoundingClientRect();check(document.elementFromPoint(doneRect.left+doneRect.width/2,doneRect.top+doneRect.height/2)===done,'Agent keyboard checkmark is reachable inside modal');
  done.click();fakeViewport.height=844;window.dispatchEvent(new Event('resize'));await wait(750);check(!agent.classList.contains('studio-prompt-pinned')&&document.activeElement!==document.getElementById('projectAgentIdea'),'Agent restores after closing keyboard');
  Object.defineProperty(window,'visualViewport',{configurable:true,value:actualViewport});closeGeneratedMedia();
  const originalToast=toast,enhanceToasts=[];toast=text=>enhanceToasts.push(text);
  for(const kind of ['image','video']){
   const target={...photo,id:'enhance-'+kind,kind,quality:'fhd',ratio:'16:9',media:photo.media};studioProjects.set(target.id,target);const actions=window.anisProjectActions.createControls(target);document.body.append(actions);await actions.querySelector('[data-action="enhance"]').onclick();
   const quality=document.getElementById(kind+'Quality'),panel=quality.closest('.studio-setting-panel'),rect=panel.getBoundingClientRect();
   const settings=quality.closest('.media-settings').getBoundingClientRect();
   check(currentView===(kind==='image'?'studio':'video')&&!document.getElementById('mediaResultDialog').open&&settings.top>=-2&&settings.bottom<844&&quality.value==='fhd'&&document.activeElement!==document.getElementById('projectAgentIdea'),'Enhance reveals all quality, format and duration settings: '+kind,{top:settings.top,bottom:settings.bottom});actions.remove();
  }
  toast=originalToast;check(enhanceToasts.length===0,'Enhance instantly scrolls to existing settings without a popup');
  rail.remove();
  const source=new File([blob],'reference.png',{type:'image/png'});
  for(const [view,setter,stageId,replaceId,fileId]of [['studio',setStudioPhoto,'studioUploadStage','studioReplacePhoto','imageFile'],['video',setStudioVideo,'videoUploadStage','studioReplaceVideo','videoFile']]){
   openView(view);setter(source);await wait(100);const stage=document.getElementById(stageId),rect=stage.getBoundingClientRect(),preview=stage.querySelector('img.studio-photo-preview:not([hidden])'),replace=document.getElementById(replaceId);
   check(Math.abs(rect.width-rect.height)<2&&getComputedStyle(preview).objectFit==='contain'&&getComputedStyle(stage.querySelector('.studio-upload-content')).display==='none','Square source preview shows the whole image: '+view,{width:rect.width,height:rect.height});
   let picked=0;const input=document.getElementById(fileId),originalClick=input.click;input.click=()=>picked++;replace.click();input.click=originalClick;
   check(!replace.hidden&&picked===1&&replace.textContent.includes('Заменить фото'),'Separate replacement button opens file picker: '+view);
  }
  setStudioVideo(new File([blob],'clip.mp4',{type:'video/mp4'}));check(document.getElementById('studioReplaceVideoLabel').textContent==='Заменить видео','Video replacement is labeled for video');clearStudioVideo();clearStudioPhoto();
  check(document.getElementById('studioReplacePhoto').hidden&&document.getElementById('studioReplaceVideo').hidden,'Replacement controls hide when source is cleared');
  const actualTelegram=window.Telegram,actualPrepare=window.anisProjectActions.prepareDownload,downloadsRequested=[],exportedFiles=[];
  window.Telegram={WebApp:{isVersionAtLeast:()=>true,downloadFile:(params,callback)=>{downloadsRequested.push(params);callback(true);}}};
  window.anisProjectActions.prepareDownload=async item=>{exportedFiles.push(item.file);return {url:'https://example.test/prepared-file.png',filename:'anis-photo.png'};};
  openProjectRoom(photo.id);await saveGeneratedMedia();check(downloadsRequested.length===1&&exportedFiles[0]===photo.media.file,'Result Save invokes Telegram native HTTPS download with export file');document.getElementById('readyMediaViewer').close();
  const downloadRail=window.anisProjectActions.createControls(photo);document.body.append(downloadRail);await downloadRail.querySelector('[data-action="download"]').onclick();check(downloadsRequested.length===2,'Ready gallery Download invokes Telegram native download');document.getElementById('readyMediaViewer').close();
  const cropping=downloadRail.querySelector('[data-action="crop"]').onclick();check(document.getElementById('readyCropDialog').open,'Crop dialog opens immediately before asynchronous preparation');await cropping;
  const cropDialog=document.getElementById('readyCropDialog'),zoom=cropDialog.querySelector('input[aria-label="Приблизить"]');check(!!zoom&&!cropDialog.querySelector(':scope>button').disabled,'Crop image is decoded and save is enabled');zoom.value='2';zoom.dispatchEvent(new Event('input',{bubbles:true}));
  const oldIds=new Set(studioProjects.keys()),originalFile=photo.media.file;cropDialog.querySelector(':scope>button').click();let cropped;
  for(let n=0;n<200;n++){cropped=[...studioProjects.values()].find(p=>!oldIds.has(p.id));if(cropped&&downloadsRequested.length===3)break;await wait(50);}
  check(!!cropped?.media?.file&&photo.media.file===originalFile&&cropped.exportJobId===photo.id,'Crop saves a separate result and preserves the original');
  const cropImage=new Image();cropImage.src=cropped.media.url;await cropImage.decode();check(cropImage.naturalWidth===32&&cropImage.naturalHeight===32,'Zoomed crop exports the selected full-resolution pixels',{width:cropImage.naturalWidth,height:cropImage.naturalHeight});
  check(downloadsRequested.length===3&&exportedFiles[2]===cropped.media.file,'Crop Save downloads the cropped file through Telegram');downloadRail.remove();window.Telegram=actualTelegram;window.anisProjectActions.prepareDownload=actualPrepare;
  report.pass=true;
 }catch(error){report.pass=false;report.error=error.stack||String(error);}
 const pre=document.createElement('pre');pre.id='qa-report';pre.textContent=JSON.stringify(report);document.body.prepend(pre);
})();
