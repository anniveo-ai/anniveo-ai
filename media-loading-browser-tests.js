/* Isolated guest QA. Harness supplies a short H.264 clip as window.__qaVideoFixture. */
(async()=>{
 const report={checks:[]},wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,name,details)=>{report.checks.push({name,pass:!!ok,details});if(!ok)throw Error(name);};
 try{
  while(!window.anisStability||window.anisStability.restoring)await wait(25);
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;const context=canvas.getContext('2d'),gradient=context.createLinearGradient(0,0,1200,900);gradient.addColorStop(0,'#ab55dd');gradient.addColorStop(1,'#116688');context.fillStyle=gradient;context.fillRect(0,0,1200,900);const full=await new Promise(r=>canvas.toBlob(r,'image/png'));
  const mini=document.createElement('canvas');mini.width=160;mini.height=120;mini.getContext('2d').drawImage(canvas,0,0,160,120);const thumbnail=mini.toDataURL('image/webp',.7),originalFetch=window.fetch;let fullRequests=0,release;
  window.fetch=(url,options)=>{if(String(url).startsWith('https://media.test/')){fullRequests++;return new Promise(resolve=>release=()=>resolve(new Response(full,{headers:{'Content-Type':'image/png','Content-Length':String(full.size)}})));}return originalFetch(url,options);};
  const jobs=Array.from({length:20},(_,i)=>({id:'loading-image-'+i,kind:'image',status:'completed',quality:'fhd',ratio:'16:9',created:1000+i,order:i+1,prompt:'Проверка '+i,previewDataUrl:thumbnail,resultUrl:'https://media.test/'+i+'.png'}));for(const p of jobs)studioProjects.set(p.id,p);
  const video={id:'loading-video',kind:'video',status:'completed',quality:'qhd',ratio:'16:9',created:2000,order:21,prompt:'Проверка видео',posterDataUrl:thumbnail,resultUrl:window.__qaVideoFixture};studioProjects.set(video.id,video);openView('ready');await wait(250);
  check(fullRequests===0,'Opening 21 cached cards downloads no full originals');check(document.querySelectorAll('#studioReadyList video').length===0,'Gallery uses static video posters rather than video players');
  const unaffected=document.querySelector('.studio-ready-project[data-project-id="loading-image-18"]'),oldImage=unaffected.querySelector('img');jobs[0].loading=true;updateProjectDock();jobs[0].loading=false;updateProjectDock();
  check(unaffected===document.querySelector('.studio-ready-project[data-project-id="loading-image-18"]')&&oldImage===unaffected.querySelector('img'),'Updating one work retains other card and image DOM nodes');
  const selected=jobs[19];document.querySelector('.studio-ready-project[data-project-id="'+selected.id+'"] .studio-ready-preview').click();await wait(100);
  const shown=document.querySelector('#mediaResultPreview img');check(shown?.naturalWidth===160&&!selected.media&&fullRequests===1,'Thumbnail is visible while one original downloads');
  const prepare=window.anisMediaQuality.prepare;let conversions=0;window.anisMediaQuality.prepare=async()=>{conversions++;return new Promise(()=>{});};release();for(let i=0;i<100&&!selected.media?.file;i++)await wait(25);await wait(100);
  check(!!selected.media?.file&&!selected.loading&&conversions===0,'Original becomes usable without waiting for export resizing');window.anisMediaQuality.prepare=prepare;closeGeneratedMedia();
  openProjectRoom(video.id);let player=document.querySelector('#mediaResultPreview video');for(let i=0;i<100&&player.readyState<2;i++)await wait(25);player.muted=true;player.playbackRate=2;await player.play();await wait(250);const before=player.currentTime;
  const videoBlob=await (await originalFetch(window.__qaVideoFixture)).blob();video.media=mediaFromBlob('video',videoBlob);video.mediaBlob=videoBlob;renderProjectRoom();await wait(150);
  check(player===document.querySelector('#mediaResultPreview video')&&!player.paused&&player.currentTime>=before,'Receiving the original does not replace or reset playing video');
  jobs[1].loading=true;updateProjectDock();jobs[1].loading=false;updateProjectDock();check(player===document.querySelector('#mediaResultPreview video')&&!player.paused,'Other project updates do not interrupt video');
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Video did not reach the end')),8000);player.addEventListener('ended',()=>{clearTimeout(timer);resolve();},{once:true});});check(player.ended,'Video plays all the way to its final frame');
  report.pass=true;
 }catch(error){report.pass=false;report.error=error.stack||String(error);}
 const pre=document.createElement('pre');pre.id='qa-loading-report';pre.textContent=JSON.stringify(report);document.body.prepend(pre);
})();
