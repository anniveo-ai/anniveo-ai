const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');
const raw=new DatabaseSync(':memory:');
raw.exec("CREATE TABLE chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,role TEXT,content TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE chat_requests(user_id TEXT,request_id TEXT,status TEXT,reply TEXT,PRIMARY KEY(user_id,request_id));CREATE TABLE usage_events(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
raw.exec(fs.readFileSync('media-jobs.sql','utf8'));raw.exec(fs.readFileSync('stability-migration.sql','utf8'));
raw.exec(fs.readFileSync('project-groups.sql','utf8'));
const db={prepare(sql){const stmt={bind(...p){stmt.params=p;return stmt;},async first(){return raw.prepare(sql).get(...(stmt.params||[]))||null},async all(){return {results:raw.prepare(sql).all(...(stmt.params||[]))}},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...(stmt.params||[])).changes)}}}};return stmt;},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};
const context=vm.createContext({console,crypto:webcrypto,URL,Request,Response,Headers,FormData,File,Blob,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,Uint8Array,btoa,atob});
vm.runInContext(fs.readFileSync('worker.js','utf8').replace('export default {','globalThis.handler={'),context);context.env={DB:db,POLZA_API_KEY:'configured-test-value'};context.DB=db;
const run=s=>vm.runInContext(s,context);
(async()=>{
 await run("requireChatThread(DB,'one','legacy')");
 const thread=await run("handleChatThreadAction(DB,'one',{action:'chat-thread-create',title:'Работа'})");context.thread=thread;
 await assert.rejects(run("requireChatThread(DB,'two',thread.id)"),/не найден/);
 raw.prepare("INSERT INTO chat_requests VALUES('one','first','processing',NULL)").run();
 await run("saveConversation(DB,'one','first','Учёба','Ответ про учёбу','legacy')");
 raw.prepare("INSERT INTO chat_requests VALUES('one','second','processing',NULL)").run();
 await run("saveConversation(DB,'one','second','Работа','Ответ про работу',thread.id)");
 const work=await run("getHistory(DB,'one',40,thread.id)"),study=await run("getHistory(DB,'one',40,'legacy')");
 assert.deepEqual(Array.from(work,m=>m.content),['Работа','Ответ про работу']);assert.deepEqual(Array.from(study,m=>m.content),['Учёба','Ответ про учёбу']);assert.equal((await run("getHistory(DB,'two',40,thread.id)")).length,0);
 await run("handleChatThreadAction(DB,'one',{action:'chat-thread-rename',threadId:thread.id,title:'Мой проект'})");assert.equal((await run("handleChatThreadAction(DB,'one',{action:'chat-thread-list'})")).threads.find(t=>t.id===thread.id).title,'Мой проект');
 assert.equal((await run("readNotificationPreference(DB,'one')")).enabled,false);
 context.notices=[];run("telegramPaymentAPI=async(env,method,payload)=>{notices.push({method,payload});return {ok:true}};");
 raw.prepare("INSERT INTO media_jobs(id,user_id,kind,model,status) VALUES('test-notice','one','image','test','completed')").run();context.row=raw.prepare("SELECT * FROM media_jobs WHERE id='test-notice'").get();
 await run('notifyReadyMedia(env,row)');assert.equal(context.notices.length,0);
 await run("setNotificationPreference(DB,'one',true)");await Promise.all([run('notifyReadyMedia(env,row)'),run('notifyReadyMedia(env,row)')]);assert.equal(context.notices.length,1);assert.equal(context.notices[0].payload.chat_id,'one');assert.ok(context.notices[0].payload.reply_markup.inline_keyboard[0][0].web_app.url.endsWith('?project=test-notice'));
 // Exercise the actual authenticated handlers with test-only auth and AI stubs.
 run("verifyTelegram=async()=> 'one';askPreferredAI=async messages=>{globalThis.lastMessages=messages;return 'Тестовый ответ'};");
 async function request(body){context.requestBody=body;const response=await run("handler.fetch(new Request('https://test.invalid/',{method:'POST',body:JSON.stringify({...requestBody,initData:'test-only'})}),env,{waitUntil(){}})");return {status:response.status,body:await response.json()};}
 assert.equal((await request({action:'history',threadId:thread.id})).body.messages[0].content,'Работа');
 assert.equal((await request({action:'chat',threadId:thread.id,message:'Ещё вопрос',requestId:'thread-request-001'})).body.reply,'Тестовый ответ');
 assert.ok(context.lastMessages.some(m=>m.content==='Работа'));assert.ok(!context.lastMessages.some(m=>m.content==='Учёба'));
 assert.equal((await request({action:'prompt-improve',kind:'image',prompt:'Фото в машине',details:'Вечер, кабриолет'})).body.prompt,'Тестовый ответ');
 // Canvas compositing must retain original pixels away from the selected boundary.
 const {createCanvas,loadImage}=require('@napi-rs/canvas'),original=createCanvas(100,100),changed=createCanvas(50,50);original.getContext('2d').fillStyle='red';original.getContext('2d').fillRect(0,0,100,100);changed.getContext('2d').fillStyle='white';changed.getContext('2d').fillRect(0,0,50,50);
 const client=fs.readFileSync('stability.js','utf8'),start=client.indexOf('async function compositeRegion('),end=client.indexOf('\n const generateOriginal',start);
 const canvasContext=vm.createContext({imageFor:async file=>{const img=await loadImage(Buffer.from(await file.arrayBuffer()));img.naturalWidth=img.width;img.naturalHeight=img.height;return img;},document:{createElement(){const c=createCanvas(1,1);c.toBlob=callback=>callback(new Blob([c.toBuffer('image/png')],{type:'image/png'}));return c;}},Error,Promise});vm.runInContext(client.slice(start,end),canvasContext);
 canvasContext.project={regionOriginalFile:new Blob([original.toBuffer('image/png')]),region:{points:[{x:.25,y:.25},{x:.75,y:.25},{x:.75,y:.75},{x:.25,y:.75}],bounds:{x:.25,y:.25,w:.5,h:.5}}};canvasContext.blob=new Blob([changed.toBuffer('image/png')]);const result=await vm.runInContext('compositeRegion(project,blob)',canvasContext),img=await loadImage(Buffer.from(await result.arrayBuffer())),check=createCanvas(100,100);check.getContext('2d').drawImage(img,0,0);const pixel=(x,y)=>Array.from(check.getContext('2d').getImageData(x,y,1,1).data);assert.deepEqual(pixel(5,5),[255,0,0,255]);assert.deepEqual(pixel(50,50),[255,255,255,255]);
 const fingerprintStart=client.indexOf(' function fingerprint('),fingerprintEnd=client.indexOf('\n createStudioVariant=',fingerprintStart),fingerCtx=vm.createContext({fileStamp:f=>f?[f.name,f.size,f.lastModified].join(':'):''});vm.runInContext(client.slice(fingerprintStart,fingerprintEnd),fingerCtx);fingerCtx.a={kind:'image',prompt:'Белая куртка',sourceFile:{name:'crop',size:1,lastModified:1},regionOriginalFile:{name:'original',size:5,lastModified:99},region:{points:[1,2,3]}};fingerCtx.b={...fingerCtx.a,sourceFile:{name:'crop',size:1,lastModified:999}};assert.equal(vm.runInContext('fingerprint(a)',fingerCtx),vm.runInContext('fingerprint(b)',fingerCtx));
 // Two simultaneous button events must produce one durable ID before any send.
 const creationStart=client.indexOf(' createStudioVariant=async function('),creationEnd=client.indexOf('\n const launchOriginal=',creationStart),events=[],projects=new Map();let selected=null,pumping=false,locked=false,last={fingerprint:'',time:0,id:null};
 const queueContext=vm.createContext({Date,JSON,Promise,studioProjects:projects,consumeStudioDraft:()=>events.push('draft-consumed'),fingerprint:s=>JSON.stringify(s),openProjectRoom:id=>events.push('open:'+id),createOriginal:async s=>{selected='same-order';projects.set(selected,s);events.push('reserved');},saveDurable:async()=>{events.push('saved');return true;},pumpStudioQueue:()=>{events.push('send');}});
 vm.runInContext("let creationLock=false,lastCreation={fingerprint:'',time:0,id:null},projectPumpBusy=false,selectedStudioProject=null;createOriginal=async s=>{selectedStudioProject='same-order';};let createStudioVariant;",queueContext);
 queueContext.createOriginal=async s=>{vm.runInContext("selectedStudioProject='same-order'",queueContext);projects.set('same-order',s);events.push('reserved');};vm.runInContext(client.slice(creationStart,creationEnd),queueContext);queueContext.snapshot={kind:'image',prompt:'Пейзаж'};
 queueContext.$=()=>null;queueContext.mediaJSON=async()=>({enabled:false,amount:0});
 await Promise.all([vm.runInContext('createStudioVariant(snapshot)',queueContext),vm.runInContext('createStudioVariant(snapshot)',queueContext)]);assert.equal(events.filter(e=>e==='reserved').length,1);assert.equal(events.filter(e=>e==='send').length,1);assert.ok(events.indexOf('saved')<events.indexOf('send'));
 console.log('PASS: separate owned threads and AI context, persistence, opt-in notifications exactly once, authenticated routes, prompt draft, selected-area compositing, duplicate button events saved before send');
})().catch(error=>{console.error(error);process.exitCode=1});
