/* Isolated browser + mocked authenticated API. Never calls a real AI provider or payment API. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {photos,videos}=require('./media-tariff-tests.cjs');
const serverContext=vm.createContext({});vm.runInContext(fs.readFileSync('worker.js','utf8').split('export default')[0],serverContext);
const price=b=>{serverContext.body=b;return JSON.parse(JSON.stringify(vm.runInContext('publicMediaPrice(mediaPrice({},body))',serverContext)));};
const root=process.cwd(),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.json':'application/json','.mp4':'video/mp4'};
const host=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname,file=path.join(root,name==='/'?'index.html':name);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');const data=fs.createReadStream(file);data.on('error',()=>{res.statusCode=404;res.end();});data.pipe(res);});
let browser;
(async()=>{
 await new Promise(r=>host.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({...(process.env.ANIS_TEST_BROWSER?{executablePath:process.env.ANIS_TEST_BROWSER}:{}),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}),page=await context.newPage();
 const errors=[],creates=[];let balance=100000,slowQuality=null;
 page.on('pageerror',e=>errors.push(e.stack));
 await page.route('https://telegram.org/js/telegram-web-app.js',r=>r.fulfill({contentType:'text/javascript',body:`window.qaConfirmations=[];window.Telegram={WebApp:{initData:'qa-session',initDataUnsafe:{user:{id:987654321,first_name:'QA'}},version:'9.0',platform:'ios',viewportHeight:844,viewportStableHeight:844,ready(){},expand(){},enableClosingConfirmation(){},disableClosingConfirmation(){},disableVerticalSwipes(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},offEvent(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}},showConfirm(t,cb){window.qaConfirmations.push(t);cb(true);}}};`}));
 await page.route('https://anniveo-ai-api.yaylaevismail.workers.dev/**',async r=>{
  let b;try{b=r.request().postDataJSON();}catch{}if(!b)return r.fulfill({json:{}});let value={};
  if(b.action==='media-quote'){
   if(b.quality===slowQuality)await new Promise(resolve=>setTimeout(resolve,350));
   try{value={...price(b),balance};}catch(e){return r.fulfill({status:400,json:{error:e.message}});}
  }else if(b.action==='wallet')value={balance,purchased:100000,spent:0,reserved:0,orders:[]};
  else if(b.action==='media-create'){creates.push(b);value={jobId:b.requestId,kind:b.kind,model:b.acceptedModel,status:'pending',billing:{state:'reserved',amount:b.acceptedPrice,currency:'ANI'}};}
  else if(b.action==='media-status')value={jobId:b.jobId,status:'pending'};
  else if(b.action==='media-config')value={premium:true};else if(b.action==='media-history')value={items:[]};else if(b.action==='chat-thread-list')value={threads:[{id:'legacy',title:'Первый чат'}]};else if(b.action==='usage-stats')value={period:'7',series:[],totals:{questions:0}};else if(b.action==='notification-get')value={enabled:false};
  return r.fulfill({json:value});
 });
 await page.goto('http://127.0.0.1:'+host.address().port+'/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.anisMediaPricing&&!window.anisStability.restoring);await page.locator('#splash').waitFor({state:'hidden'});
 const expectPrice=async(kind,n)=>page.waitForFunction(({kind,n})=>{const b=document.getElementById(kind==='image'?'makeImage':'makeVideo');return b.getAttribute('aria-disabled')==='false'&&b.querySelector('.media-create-price-value').textContent.replace(/\s/g,'')===String(n);},{kind,n});
 const selectPhoto=async(model,quality,amount)=>{await page.evaluate(({model,quality})=>window.anisImageModels.select(model,{quality,ratio:model==='openai/gpt-image-1.5'?'2:3':'9:16'}),{model,quality});await expectPrice('image',amount);};
 const selectVideo=async(model,quality,duration,amount)=>{await page.evaluate(({model,quality,duration})=>window.anisVideoModels.select(model,{quality,duration,ratio:model==='wan/2.6'||model.includes('motion-control')?'source':'16:9'}),{model,quality,duration});await expectPrice('video',amount);};
 const nav=await page.locator('#bottomNav').boundingBox();await page.evaluate(()=>openView('studio'));await expectPrice('image',5);
 let footer=await page.locator('#mediaCreateDock').boundingBox();assert.equal(footer.width,nav.width);assert.equal(footer.height,nav.height);assert.equal(footer.y,nav.y);
 assert.equal(await page.locator('#bottomNav').isVisible(),false);assert.equal(await page.locator('.studio-prompt-box #makeImage, .studio-prompt-box #makeVideo').count(),0);assert.equal(await page.locator('#makeImage').count(),1);
 assert.equal(await page.locator('#makeImage .media-create-price img').evaluate(img=>img.complete&&img.naturalWidth>0&&img.getAttribute('src')==='anium-coin-v1.webp'),true,'reuse the actual wallet coin');
 let selections=0;for(const [model,qualities,prices]of photos)for(let i=0;i<qualities.length;i++){await selectPhoto(model,qualities[i],prices[i]);selections++;}
 await page.evaluate(()=>{window.anisImageModels.select('auto',{quality:'fhd',ratio:'1:1'});document.getElementById('imagePrompt').value='Море';document.getElementById('imagePrompt').dispatchEvent(new Event('input',{bubbles:true}));});await expectPrice('image',5);
 await page.locator('#imagePrompt').fill('Добавь красивый текст');await expectPrice('image',8);await page.locator('#imagePrompt').blur();
 await page.evaluate(()=>window.anisImageModels.select('google/gemini-3-pro-image-preview',{quality:'img-1k',ratio:'9:16'}));await expectPrice('image',8);
 slowQuality='img-4k';await page.evaluate(()=>window.anisImageModels.select('google/gemini-3-pro-image-preview',{quality:'img-4k',ratio:'9:16'}));await page.waitForTimeout(50);await selectPhoto('google/gemini-3-pro-image-preview','img-1k',8);await page.waitForTimeout(450);await expectPrice('image',8);slowQuality=null;
 await page.evaluate(()=>openView('video'));for(const [model,qualities,duration,prices]of videos)for(let i=0;i<qualities.length;i++){await selectVideo(model,qualities[i],duration,prices[i]);selections++;}
 await selectVideo('bytedance/seedance-2-mini','720p',10,31);
 const clip=fs.readFileSync('test-fixtures/billing-10_1s.mp4').toString('base64');
 await page.evaluate(clip=>{const bytes=Uint8Array.from(atob(clip),c=>c.charCodeAt(0));setStudioVideo(new File([bytes],'reference.mp4',{type:'video/mp4'}));},clip);await expectPrice('video',38);
 await selectVideo('bytedance/seedance-2-mini','480p',10,19);
 await page.evaluate(()=>{clearStudioVideo(true);window.anisVideoModels.select('kling/v2.6-motion-control',{quality:'720p',ratio:'source',duration:0});});
 await page.waitForFunction(()=>document.getElementById('makeVideo').getAttribute('aria-disabled')==='true'&&document.getElementById('makeVideo').textContent.includes('—'));
 assert.equal(await page.locator('#makeVideo').evaluate(button=>button.disabled),false,'a missing price must not lock the source upload');
 await page.evaluate(clip=>{const bytes=Uint8Array.from(atob(clip),c=>c.charCodeAt(0));setStudioVideo(new File([bytes],'motion.mp4',{type:'video/mp4'}));},clip);await expectPrice('video',51);
 await selectVideo('kling/v3-motion-control','1080p',0,117);
 await page.evaluate(()=>clearStudioVideo(true));
 for(const view of ['templates','ready','history','profile','balance','home']){await page.evaluate(view=>openView(view),view);assert.equal(await page.locator('#mediaCreateDock').isVisible(),false,view);assert.equal(await page.locator('#bottomNav').isVisible(),true,view);}
 for(const width of [320,390,430,800]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>openView('home'));const original=await page.locator('#bottomNav').boundingBox();await page.evaluate(()=>openView('video'));await selectVideo('bytedance/seedance-2','1080p',15,578);
  const box=await page.locator('#mediaCreateDock').boundingBox();assert.equal(box.width,original.width,'navigation width '+width);assert.equal(box.height,original.height,'navigation height '+width);
  assert.equal(await page.locator('#makeVideo').evaluate(b=>b.scrollWidth<=b.clientWidth),true,'no clipped price at '+width);
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{applyAppTheme('dark');openView('studio');});await selectPhoto('google/gemini-3.1-flash-image-preview','img-2k',5);await page.locator('#imagePrompt').fill('Сделай вечерний свет');await expectPrice('image',5);await page.locator('#imagePrompt').blur();
 const output=process.env.ANIS_TEST_SCREENSHOTS;if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'photo-dark.png')});await page.evaluate(()=>{applyAppTheme('light');openView('video');});await selectVideo('bytedance/seedance-2-mini','720p',10,31);await page.screenshot({path:path.join(output,'video-light.png')});await page.evaluate(()=>{applyAppTheme('dark');openView('studio');});}
 balance=0;await page.locator('#makeImage').click();await page.waitForTimeout(200);assert.equal(creates.length,0,'empty balance cannot create a queued or paid request');
 balance=100000;await page.evaluate(()=>{document.getElementById('makeImage').click();document.getElementById('makeImage').click();});await page.waitForFunction(()=>[...studioProjects.values()].some(p=>p.status==='pending'));assert.equal(creates.length,1,'double click produces one creation');assert.equal(creates[0].acceptedPrice,5);assert.equal(creates[0].acceptedModel,'google/gemini-3.1-flash-image-preview');assert.equal(creates[0].acceptedTariff,'ani-20261017-v1');assert.equal(await page.evaluate(()=>window.qaConfirmations.length),0,'the visible price on the clicked form is the confirmation');
 await page.evaluate(()=>closeGeneratedMedia());await page.locator('.media-create-home').click();assert.equal(await page.locator('#bottomNav').isVisible(),true);assert.equal(await page.locator('#mediaCreateDock').isVisible(),false);
 assert.deepEqual(errors,[]);console.log('PASS:',selections,'model/quality price selections, prompt-dependent Auto, stale response protection, video source premiums, Motion Control, all navigation screens, 320–800px sizing, actual coin, light/dark themes, insufficient funds and duplicate-click consent. No paid requests.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();host.closeAllConnections();await new Promise(r=>host.close(r));});
