const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const token='local-test-only',params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123})});
const signed=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();
params.set('hash',crypto.createHmac('sha256',secret).update(signed).digest('hex'));
let providerCalls=0,chatCalls=0,newMediaCalls=0,writes=0;
const db={prepare(){return {bind(){return this},async run(){writes++;return {meta:{changes:1}}}}}};
const ctx=vm.createContext({crypto:crypto.webcrypto,URL,URLSearchParams,Response,Request,Headers,FormData,TextEncoder,TextDecoder,Uint8Array,AbortController,AbortSignal,setTimeout,clearTimeout,Date,console,fetch:async url=>{
 providerCalls++;
 if(url.endsWith('/audio/speech'))return new Response('mock-audio',{headers:{'Content-Type':'audio/mpeg'}});
 if(url.endsWith('/audio/transcriptions'))return Response.json({text:'Проверка голоса'});
 throw Error('Unexpected provider request');
}});
vm.runInContext(fs.readFileSync('worker.js','utf8').replace('export default','globalThis.worker='),ctx);
ctx.env={DB:db,TELEGRAM_BOT_TOKEN:token,POLLINATIONS_API_KEY:'local-mock',POLZA_API_KEY:'local-mock'};
ctx.chatReply=async()=>{chatCalls++;return 'mock reply'};
ctx.createMedia=async()=>{newMediaCalls++;return {status:'processing',jobId:'mock-job'}};
vm.runInContext('askPreferredAI=chatReply;createPremiumMedia=createMedia;requireChatThread=async()=>"legacy";getHistory=async()=>[];saveConversation=async()=>{}',ctx);
async function request(action,multipart=false,authenticated=true,extra={}){
 if(multipart){const form=new FormData();form.set('action',action);if(authenticated)form.set('initData',params.toString());form.set('file',new File(['mock-bytes'],'test.webm',{type:'audio/webm'}));ctx.request=new Request('https://test.invalid/',{method:'POST',body:form});}
 else ctx.request=new Request('https://test.invalid/',{method:'POST',body:JSON.stringify({action,...extra,...(authenticated?{initData:params.toString()}:{})})});
 return vm.runInContext('worker.fetch(request,env,{waitUntil(){}})',ctx);
}
(async()=>{
 for(const multipart of [false,true])for(const action of ['image','image-edit','video']){
  const response=await request(action,multipart);assert.equal(response.status,410);assert.equal((await response.json()).code,'LEGACY_MEDIA_DISABLED');
 }
 assert.equal(providerCalls,0,'retired routes never reach any provider');assert.equal(writes,0,'blocked commands do not alter jobs, wallets or usage');
 assert.equal((await request('video',false,false)).status,401,'authentication remains enforced');
 for(const action of ['chat','anonymous']){const response=await request(action,false,true,{message:'Привет',requestId:'test-request-123',voice:true});assert.equal(response.status,200);assert.equal((await response.json()).reply,'mock reply');}
 assert.equal(chatCalls,2,'normal chat and voice conversation still reach the answer service');
 assert.equal((await request('speak',false,true,{text:'Привет'})).status,200);
 assert.equal((await request('transcribe',true)).status,200);assert.equal(providerCalls,2,'speech recognition and speech synthesis remain connected');
 for(const multipart of [false,true])assert.equal((await request('media-create',multipart)).status,200);
 assert.equal(newMediaCalls,2,'current image/video generation dispatch is unchanged');
 console.log('PASS: six retired JSON/multipart routes blocked with no provider calls or data writes; auth, chat, voice, transcription and current media-create preserved. No real network requests.');
})().catch(error=>{console.error(error);process.exitCode=1});
