const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const code=fs.readFileSync('worker.js','utf8'),html=fs.readFileSync('index.html','utf8');
const quiet={log(){},warn(){},error(){}};
function worker(extra={}){const c=vm.createContext({console:quiet,crypto:webcrypto,URL,Request,Response,Headers,FormData,File,Blob,TextEncoder,TextDecoder,ReadableStream,TransformStream,AbortController,Uint8Array,btoa,atob,setTimeout,clearTimeout,...extra});vm.runInContext(code.replace('export default {','globalThis.handler={'),c);return c;}
const run=(c,s)=>vm.runInContext(s,c),tick=()=>new Promise(setImmediate);
const request=body=>new Request('https://api.test/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 // Existing owned conversations do not need another INSERT on each turn.
 let writes=0;const c=worker();c.db={prepare(){return{bind(){return this},first:async()=>({id:'legacy'}),run:async()=>{writes++}}}};
 assert.equal(await run(c,"requireChatThread(db,'user','legacy')"),'legacy');assert.equal(writes,0);
 // Unchanged provider states avoid redundant database writes.
 let updates=0;c.env={DB:{prepare(){return{bind(){return this},run:async()=>{updates++}}}}};c.row={id:'job',user_id:'user',kind:'image',status:'processing'};
 await run(c,"updatePremiumJob(env,row,{status:'processing'})");assert.equal(updates,0);
 await run(c,"updatePremiumJob(env,row,{status:'pending'})");assert.equal(updates,1);
 // The first-token deadline includes time already spent waiting for headers.
 let now=0;const timers=[],sse=()=>new Response('data: {"choices":[{"delta":{"content":"Быстро"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
 class ClockDate extends Date{static now(){return now;}}
 const stream=worker({Date:ClockDate,setTimeout(fn,ms){timers.push(ms);return timers.length},clearTimeout(){},fetch:async()=>{now=6000;return sse()}});
 stream.env={POLZA_API_KEY:'test-only'};const opened=await run(stream,"openPreferredAIStream([],env,'normal')");assert.deepEqual(timers,[8000,2000]);await opened.response.body.cancel();
 // Streamed text is delivered while the provider is still generating, not after completion.
 let upstream;const work=[];const encoder=new TextEncoder(),live=new Response(new ReadableStream({start(controller){upstream=controller;controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Первый текст"}}]}\n\n'))}}));
 const streaming=worker();streaming.upstream=live;streaming.options={anonymous:true,started:Date.now()};streaming.ctx={waitUntil:p=>work.push(p)};
 const reply=run(streaming,"makeStreamResponse({response:upstream,controller:new AbortController()},options,{},ctx)"),reader=reply.body.getReader(),decoder=new TextDecoder();
 assert.match(decoder.decode((await reader.read()).value),/"type":"start"/);assert.match(decoder.decode((await reader.read()).value),/Первый текст/);
 upstream.enqueue(encoder.encode('data: [DONE]\n\n'));upstream.close();let ending='';for(;;){const part=await reader.read();if(part.done)break;ending+=decoder.decode(part.value)}await Promise.all(work);assert.match(ending,/"type":"done"/);
 // Voice requests retain the same model and token cap, with clear spoken instructions.
 let providerBody;const voice=worker({fetch:async(url,options)=>{providerBody=JSON.parse(options.body);return Response.json({choices:[{message:{content:'Короткий и точный ответ.'}}]})}});
 run(voice,"verifyTelegram=async()=> 'test-user'");const voiceResponse=await voice.handler.fetch(request({action:'anonymous',message:'Привет',voice:true}),{POLZA_API_KEY:'test-only'},{});
 assert.equal(voiceResponse.status,200);assert.equal(providerBody.model,'openai/gpt-4o-mini');assert.equal(providerBody.max_tokens,900);assert.match(providerBody.messages[0].content,/2–4 коротких/);
 // Audio transcription returns before non-critical usage accounting completes.
 let finishUsage;const tasks=[];const speech=worker({fetch:async()=>Response.json({text:'Проверка голоса'})});run(speech,"verifyTelegram=async()=> 'test-user'");
 const db={prepare(){return{bind(){return this},run(){return new Promise(resolve=>{finishUsage=resolve})}}}};
 const form=new FormData();form.append('action','transcribe');form.append('file',new File(['audio'],'voice.webm',{type:'audio/webm'}));
 const response=await Promise.race([speech.handler.fetch(new Request('https://api.test/',{method:'POST',body:form}),{DB:db,POLLINATIONS_API_KEY:'test-only'},{waitUntil:p=>tasks.push(p)}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Usage accounting blocked transcription')),100))]);
 assert.equal((await response.json()).text,'Проверка голоса');assert.equal(tasks.length,1);finishUsage({meta:{changes:1}});await Promise.all(tasks);
 // History and idempotency reservation run together; a failed history read still cleans up its reservation.
 let finishHistory,finishReservation;const events=[];let failHistory=false;
 const chat=worker({fetch:async()=>Response.json({choices:[{message:{content:'Ответ'}}]})});run(chat,"verifyTelegram=async()=> 'test-user'");
 const chatDB={prepare(sql){return{bind(){return this},first:async()=>({id:'legacy'}),all(){events.push('history');return new Promise((resolve,reject)=>{finishHistory=()=>failHistory?reject(Error('history failure')):resolve({results:[]})})},run(){if(sql.includes('INSERT OR IGNORE INTO chat_requests')){events.push('reserve');return new Promise(resolve=>{finishReservation=()=>resolve({meta:{changes:1}})})}if(sql.includes('DELETE FROM chat_requests'))events.push('cleanup');return Promise.resolve({meta:{changes:1}})}}},batch:async()=>[]};
 const chatEnv={DB:chatDB,POLZA_API_KEY:'test-only'};
 let task=chat.handler.fetch(request({message:'Вопрос',requestId:'speed-request-01'}),chatEnv,{});await tick();assert.ok(events.includes('history')&&events.includes('reserve'));finishReservation();finishHistory();assert.equal((await task).status,200);
 failHistory=true;task=chat.handler.fetch(request({message:'Вопрос',requestId:'speed-request-02'}),chatEnv,{});await tick();finishHistory();finishReservation();assert.equal((await task).status,503);assert.ok(events.includes('cleanup'));
 // Foreground polling uses the fast end of the provider's documented ranges.
 const a=html.indexOf('function studioPollDelay('),b=html.indexOf('async function watchMediaJob(',a),visibility=new EventTarget();visibility.hidden=true;
 const polling=vm.createContext({document:visibility,setTimeout,clearTimeout,Promise});run(polling,html.slice(a,b));assert.equal(run(polling,"studioPollDelay('image')"),3000);assert.equal(run(polling,"studioPollDelay('video')"),5000);assert.equal(run(polling,"studioPollDelay('video',0,true)"),10000);
 let woke=false;const wake=run(polling,'waitForMediaPoll(10000)').then(()=>woke=true);visibility.hidden=false;visibility.dispatchEvent(new Event('visibilitychange'));await wake;assert.equal(woke,true);
 // Compress the same immutable upload only once, including concurrent agent variants.
 let decodes=0,draws=0;class ImageMock{constructor(){this.naturalWidth=4000;this.naturalHeight=3000}set src(value){decodes++;queueMicrotask(()=>this.onload())}}
 const upload=vm.createContext({WeakMap,File,Blob,Promise,Math,Image:ImageMock,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},document:{createElement:()=>({getContext:()=>({fillRect(){},drawImage(){draws++}}),toBlob:callback=>callback(new Blob(['small'],{type:'image/jpeg'}))})}});
 const start=html.indexOf('const preparedStudioImageCache='),end=html.indexOf('const mediaMicIgnoreUntil=',start);run(upload,html.slice(start,end));upload.file={type:'image/jpeg',size:4*1024*1024};const files=await Promise.all([run(upload,'prepareStudioImage(file)'),run(upload,'prepareStudioImage(file)')]);assert.equal(decodes,1);assert.equal(draws,1);assert.equal(files[0],files[1]);
 // Ordinary word pauses remain recordable; completion is 600 ms earlier than before.
 let callback,stopped=0,rms=.03;const nodes={style:{setProperty(){}}};const meter=vm.createContext({Float32Array,Math,performance:{now:()=>0},recording:true,orbVoiceActive:true,microphoneStream:{},voiceHeard:false,voiceAnalyser:null,voiceSourceNode:null,voiceFrame:0,recorder:{state:'recording',stop(){stopped++}},voiceAudioContext:{createAnalyser:()=>({getFloatTimeDomainData:s=>s.fill(rms)}),createMediaStreamSource:()=>({connect(){}})},$:()=>nodes,paintVoiceAssistantWave(){},setVoiceChatStatus(){},requestAnimationFrame:fn=>{callback=fn;return 1}});
 const meterStart=html.indexOf('function startVoiceMeter(){'),meterEnd=html.indexOf('function continueVoiceAfterReply(',meterStart);run(meter,html.slice(meterStart,meterEnd));run(meter,'startVoiceMeter()');callback(200);rms=0;callback(1300);assert.equal(stopped,0);callback(1401);assert.equal(stopped,1);
 console.log('PASS: chat query concurrency and cleanup; single first-token deadline; voice clarity and nonblocking transcription; media polling and wakeup; cached image preparation; 1200 ms speech-end detection. No paid API requests.');
})().catch(error=>{console.error(error);process.exitCode=1});
