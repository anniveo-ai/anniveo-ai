/* Inject into an isolated guest browser. No creation requests or paid generations. */
(async()=>{
 const report={checks:[]},wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,name,details)=>{report.checks.push({name,pass:!!ok,details});if(!ok)throw Error(name);};
 try{
  for(let n=0;n<200&&(!window.anisProjectActions||!window.anisStability||window.anisStability.restoring);n++)await wait(50);
  const photo={id:'qa-photo',kind:'image',status:'processing',prompt:'Тест фото',order:1,created:Date.now()},video={id:'qa-video',kind:'video',status:'pending',prompt:'Тест видео',order:2,created:Date.now()+1};
  studioProjects.set(photo.id,photo);studioProjects.set(video.id,video);updateProjectDock();
  openView('video');openProjectRoom(video.id);closeGeneratedMedia();openView('history');openView('video');
  check(!document.getElementById('videoCreationProgress').hidden&&!document.getElementById('mediaResultDialog').open,'Ongoing video remains visible after navigation');
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
  report.pass=true;
 }catch(error){report.pass=false;report.error=error.stack||String(error);}
 const pre=document.createElement('pre');pre.id='qa-report';pre.textContent=JSON.stringify(report);document.body.prepend(pre);
})();
