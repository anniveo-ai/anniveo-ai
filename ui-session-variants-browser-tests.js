/* Browser Rendering harness. appHTML is the release HTML with local scripts inlined. */
async function runAnisUIRegression(appHTML){
 const output=document.createElement('pre');output.id='ui-regression-report';
 const frame=document.createElement('iframe');frame.style.cssText='width:390px;height:844px;border:0';
 document.body.replaceChildren(output,frame);
 const checks=[],ids=[],prefix='ui-qa-'+Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 let w,d;
 const check=(name,ok,details)=>{checks.push({name,ok:!!ok,details});};
 const hidden=id=>d.getElementById(id).classList.contains('hidden');
 async function boot(){
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture load timeout')),18000);frame.onload=()=>{clearTimeout(timer);resolve();};frame.srcdoc=appHTML;});
  w=frame.contentWindow;d=w.document;
  for(let i=0;i<100&&(!w.anisStability||w.anisStability.restoring);i++)await wait(40);
  if(!w.anisStability||w.anisStability.restoring)throw Error('Fixture restoration timeout');
 }
 try{
  localStorage.setItem('anis-stable:guest:drafts',JSON.stringify({view:'studio',values:{imagePrompt:'Сохранённая идея'}}));
  await boot();
  check('Saved studio view never replaces home on entry',w.eval('currentView')==='chat'&&!hidden('welcome'));
  check('Prompt drafts remain intact',d.getElementById('imagePrompt').value==='Сохранённая идея');
  w.eval("normalHistory=Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:'Сообщение '+i+' '+('Текст диалога. '.repeat(15))}));showWelcome=false;renderChat()");
  w.collapseChat();await wait(40);
  const app=d.getElementById('app');app.scrollTop+=d.getElementById('welcome').getBoundingClientRect().bottom-80;await wait(60);
  check('Scroll entry reaches conversation',!hidden('collapseChatButton')&&w.isChatConversationVisible());
  d.getElementById('anonToggle').click();await wait(40);
  check('Incognito stays in scrolled conversation',hidden('welcome')&&!hidden('collapseChatButton')&&d.getElementById('messages').childElementCount===0);
  d.getElementById('anonToggle').click();await wait(40);
  check('Switching back restores normal conversation without home',hidden('welcome')&&d.getElementById('messages').childElementCount===20);
  w.collapseChat();d.getElementById('anonToggle').click();await wait(40);
  check('A toggle actually on home still stays home',!hidden('welcome')&&!hidden('returnToChatButton'));
  for(const kind of ['image','video']){
   const a=prefix+'-'+kind+'-a',b=prefix+'-'+kind+'-b';ids.push({a,b});
   w.eval(`for(const [id,order]of [[${JSON.stringify(a)},1],[${JSON.stringify(b)},2]])studioProjects.set(id,{id,groupId:${JSON.stringify(a)},kind:${JSON.stringify(kind)},status:'processing',prompt:'Проверка варианта',order,created:Date.now(),sourceFile:new File(['keep'],'original.png',{type:'image/png'})})`);
   for(const width of [320,390]){
    frame.style.width=width+'px';await wait(40);w.openProjectRoom(a);await wait(40);
    const room=d.getElementById('mediaResultDialog'),r=room.getBoundingClientRect(),top=parseFloat(room.style.getPropertyValue('--room-sheet-top'));
    room.classList.remove('room-edge-sheet');const originalTop=room.getBoundingClientRect().top;room.classList.add('room-edge-sheet');
    check(kind+' room reaches left/right/bottom at '+width,r.left===0&&Math.abs(r.right-width)<1&&Math.abs(r.bottom-844)<1,{left:r.left,right:r.right,bottom:r.bottom});
    check(kind+' room keeps its original top at '+width,Math.abs(r.top-top)<1&&Math.abs(r.top-originalTop)<1,{top:r.top,originalTop});
    check(kind+' has independent, non-nested delete buttons',room.querySelectorAll('.variant-remove').length===2&&!room.querySelector('button button'));
    w.closeGeneratedMedia();
   }
   w.openProjectRoom(a);await wait(30);
   const originalViewport=Object.getOwnPropertyDescriptor(w,'visualViewport'),keyboardViewport=new w.EventTarget();
   Object.assign(keyboardViewport,{height:844,offsetTop:0});Object.defineProperty(w,'visualViewport',{configurable:true,value:keyboardViewport});
   const agent=d.getElementById('projectAgentIdea'),workroom=d.getElementById('mediaResultDialog');
   agent.focus({preventScroll:true});keyboardViewport.height=460;w.dispatchEvent(new w.Event('resize'));await wait(650);
   const agentRect=agent.getBoundingClientRect(),agentPanel=agent.closest('.project-agent').getBoundingClientRect();
   check(kind+' agent input is visible above keyboard',agentRect.top>=workroom.getBoundingClientRect().top&&agentRect.bottom<=460,{top:agentRect.top,bottom:agentRect.bottom});
   check(kind+' agent action stays above keyboard',agentPanel.bottom<=460,{bottom:agentPanel.bottom});
   const typingScroll=workroom.scrollTop;for(const letter of ['а','б','в']){agent.value+=letter;agent.dispatchEvent(new w.Event('input',{bubbles:true}));await wait(30);}
   check(kind+' agent does not jump with each letter',Math.abs(workroom.scrollTop-typingScroll)<2);
   agent.blur();keyboardViewport.height=844;w.dispatchEvent(new w.Event('resize'));await wait(60);
   check(kind+' workroom returns to full height after keyboard closes',Math.abs(workroom.getBoundingClientRect().bottom-844)<1);
   if(originalViewport)Object.defineProperty(w,'visualViewport',originalViewport);else delete w.visualViewport;
   const requestRemove=id=>d.querySelector('[data-variant-id="'+id+'"] .variant-remove').click();
   requestRemove(b);await wait(30);
   check(kind+' deletion requires confirmation',d.getElementById('variantDeleteDialog').open&&!!d.querySelector('[data-variant-id="'+b+'"]')&&!d.querySelector('.variant-removal-notice'));
   d.getElementById('variantDeleteCancel').click();await wait(30);
   check(kind+' cancelling keeps the variant',!!d.querySelector('[data-variant-id="'+b+'"]')&&!d.querySelector('.variant-removal-notice'));
   requestRemove(b);d.getElementById('variantDeleteDialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));d.getElementById('variantDeleteDialog').close();await wait(30);
   check(kind+' dismissing confirmation keeps the variant',!!d.querySelector('[data-variant-id="'+b+'"]'));
   const remove=id=>{requestRemove(id);d.getElementById('variantDeleteConfirm').click();};
   remove(b);await wait(30);
   check(kind+' non-selected variant removes without changing selection',w.eval('selectedStudioProject')===a&&!d.querySelector('[data-variant-id="'+b+'"]'));
   d.querySelector('.variant-removal-notice button').click();await wait(30);
   check(kind+' undo restores its own variant',!!d.querySelector('[data-variant-id="'+b+'"]')&&w.eval('selectedStudioProject')===b);
   remove(b);remove(a);await wait(30);
   check(kind+' deleting the final variant closes safely',!d.getElementById('mediaResultDialog').open);
   d.querySelector('.variant-removal-notice button').click();await wait(30);
   check(kind+' final-variant undo preserves original file',d.getElementById('mediaResultDialog').open&&w.eval(`studioProjects.get(${JSON.stringify(a)}).sourceFile.size`)===4);
   w.closeGeneratedMedia();
  }
  const resultId=prefix+'-result',resultURL='https://example.invalid/qa-result.png';
  const canvas=d.createElement('canvas');canvas.width=16;canvas.height=16;canvas.getContext('2d').fillRect(0,0,16,16);const imageBlob=await new Promise(resolve=>canvas.toBlob(resolve));
  const realFetch=w.fetch,realSave=w.anisProjectActions.saveMedia;let downloads=0,releaseDownload;
  const downloadGate=new Promise(resolve=>releaseDownload=resolve);
  w.fetch=async(url,...args)=>{if(url!==resultURL)return realFetch(url,...args);downloads++;if(downloads===1)throw new w.TypeError('Network interrupted');await downloadGate;return new w.Response(imageBlob,{headers:{'Content-Type':'image/png'}});};
  w.eval(`studioProjects.set(${JSON.stringify(resultId)},{id:${JSON.stringify(resultId)},kind:'image',status:'completed',quality:'fhd',prompt:'Готовое фото',resultUrl:${JSON.stringify(resultURL)},created:Date.now()});`);
  w.openProjectRoom(resultId);await wait(30);
  const resultStage=d.getElementById('mediaResultPreview');
  check('Completed photo previews immediately before download',resultStage.querySelector('img')?.src===resultURL&&!resultStage.querySelector('.project-load-result'));
  check('Save action is available with photo preview',!d.getElementById('projectReadyActions').hidden);
  check('Workroom has only the right minimize button',!d.querySelector('#mediaResultDialog>header>.room-close')&&!!d.querySelector('#mediaResultDialog>header>.project-minimize'));
  check('Minimize header stays reachable on scroll',w.getComputedStyle(d.querySelector('#mediaResultDialog>header')).position==='sticky');
  const resultProject=w.eval(`studioProjects.get(${JSON.stringify(resultId)})`),firstLoad=w.loadStudioProjectResult(resultProject),sharedLoad=w.loadStudioProjectResult(resultProject);
  check('Concurrent result downloads share one promise',firstLoad===sharedLoad);
  let savedFile;w.anisProjectActions.saveMedia=async item=>{savedFile=item.file;};const saving=w.saveGeneratedMedia();
  await wait(750);check('Interrupted download retries existing result',downloads===2&&!savedFile);
  releaseDownload();await firstLoad;await saving;await wait(100);
  check('Save waits for the original project photo',savedFile?.type==='image/png'&&savedFile.size>0);
  check('Downloaded photo replaces remote preview',resultStage.querySelector('img')?.src.startsWith('blob:')&&!!resultProject.media);
  check('Successful result clears obsolete errors',!resultProject.error&&!d.querySelector('#mediaResultDialog .anis-inline-error'));
  w.fetch=realFetch;w.anisProjectActions.saveMedia=realSave;w.closeGeneratedMedia();
  w.eval(`for(const p of studioProjects.values())p.status='failed';studioProjects.set(${JSON.stringify(prefix+'-queued')},{id:${JSON.stringify(prefix+'-queued')},kind:'image',status:'queued',removedFromVariants:true});window.qaLaunchCount=0;window.qaOriginalLaunch=launchStudioProject;launchStudioProject=async()=>{window.qaLaunchCount++;}`);
  await w.pumpStudioQueue();check('Removed unsubmitted variants never incur a new generation',w.qaLaunchCount===0);w.launchStudioProject=w.qaOriginalLaunch;
  w.openView('video');w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await wait(30);
  check('Restoring a cached page returns home',w.eval('currentView')==='chat'&&!hidden('welcome')&&hidden('returnToChatButton'));
  w.openView('profile');w.dispatchEvent(new w.Event('pagehide'));await wait(250);
  await boot();
  check('Reload from profile opens home',w.eval('currentView')==='chat'&&!hidden('welcome'));
  for(const {a,b}of ids)check('Deletion stays removed after restart: '+b,w.eval(`studioProjects.get(${JSON.stringify(b)})?.removedFromVariants===true&&!projectFamily(studioProjects.get(${JSON.stringify(a)})).some(p=>p.id===${JSON.stringify(b)})`));
  output.textContent=JSON.stringify({ok:checks.every(c=>c.ok),checks});
 }catch(error){output.textContent=JSON.stringify({ok:false,error:String(error),stack:error.stack,checks});}
 output.dataset.done='yes';
}
