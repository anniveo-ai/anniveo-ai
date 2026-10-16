const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const client=fs.readFileSync('stability.js','utf8'),worker=fs.readFileSync('worker.js','utf8');
const section=client.slice(client.indexOf(' const resultLoads=new WeakMap();'),client.indexOf(' async function recoverProject(p)'));
(async()=>{
 let downloads=0,renders=0,release;
 const blob=new Blob(['photo'],{type:'image/png'}),p={id:'owned',kind:'image',resultUrl:'https://s3.polza.ai/photo.png'};
 const context=vm.createContext({Promise,WeakMap,AbortSignal,Error,JSON,initData:'telegram-test',API_URL:'https://api.test/',fetch:async(url,options)=>{downloads++;assert.equal(JSON.parse(options.body).action,'media-file');await new Promise(r=>release=r);return new Response(blob);},renderProjectRoom(){renders++;if(renders===1)vm.runInContext('loadStudioProjectResult(project)',context);},window:{anisProjectActions:{normalizeBlob:async(kind,b)=>b,ensureImagePreview:async()=>null},anisMediaQuality:{prepare:async(project,b)=>({blob:b})}},mediaFromBlob:(kind,b)=>({blob:b,url:'blob:ready',file:new File([b],'ready.png',{type:b.type})}),generatedMedia:{},updateProjectDock(){},invalidateUsageStats(){},persistStudioProjects(){},saveDurable:()=>new Promise(()=>{}),selectedStudioProject:null,workroomRenderKey:'',URL});
 context.project=p;vm.runInContext(section,context);
 context.selectedStudioProject=p.id;context.room={open:true,querySelector:()=>null};context.window.anisProjectActions.ensureProjectPreview=async()=>null;context.window.anisProjectActions.downloadMediaBlob=async project=>{const response=await context.fetch('https://api.test/',{body:JSON.stringify({action:'media-file',jobId:project.id})});return response.blob();};
 const a=vm.runInContext('loadStudioProjectResult(project)',context),b=vm.runInContext('loadStudioProjectResult(project)',context);
 assert.equal(a,b,'concurrent loading shares a promise before render');await new Promise(setImmediate);assert.equal(downloads,1,'reentrant render does not duplicate download');release();await a;
 assert.ok(p.media.file);assert.equal(p.loading,false);await vm.runInContext('loadStudioProjectResult(project)',context);assert.equal(downloads,1,'cached files do not download again');
 // The on-screen image is byte-backed; making it must not change the export file.
 const actions=fs.readFileSync('project-actions.js','utf8');
 const previewCode=actions.slice(actions.indexOf('  const imagePreviews='),actions.indexOf('  function resultPreview('));
 let reads=0;
 class Reader{readAsDataURL(file){reads++;file.arrayBuffer().then(bytes=>{this.result='data:'+file.type+';base64,'+Buffer.from(bytes).toString('base64');this.onload();});}}
 const previewContext=vm.createContext({WeakMap,WeakSet,Promise,initData:'',FileReader:Reader,setTimeout,clearTimeout,Error,String,Image:class{naturalWidth=64;naturalHeight=64;decode(){return Promise.resolve();}},document:{createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/webp;base64,cGhvdG8='})}});
 previewContext.project={kind:'image',media:{blob,file:new File([blob],'export.png',{type:blob.type})}};
 vm.runInContext(previewCode,previewContext);const exportFile=previewContext.project.media.file;
 const previews=await Promise.all([vm.runInContext('ensureImagePreview(project)',previewContext),vm.runInContext('ensureImagePreview(project)',previewContext)]);
 assert.equal(reads,1);assert.equal(previews[0],'data:image/webp;base64,cGhvdG8=');assert.equal(previewContext.project.media.file,exportFile);assert.equal(await exportFile.text(),'photo');
 let owner='owner',fetched=0;
 const server=vm.createContext({URL,Response,AbortSignal,Error,fetch:async(url,options)=>{fetched++;assert.equal(options.redirect,'error');return new Response(blob,{headers:{'Content-Type':'image/png'}});}});
 vm.runInContext(worker.slice(worker.indexOf('async function serveMediaFile('),worker.indexOf('async function recordMediaUsage')),server);
 server.env={DB:{prepare(sql){assert.match(sql,/id=\? AND user_id=\?/);return {bind(id,user){return {first:async()=>user===owner?{status:'completed',kind:'image',result_url:'https://s3.polza.ai/f/result.png'}:null};}}}}};
 const response=await vm.runInContext("serveMediaFile(env,'owner','owned',{'Access-Control-Allow-Origin':'https://anniveo-ai.pages.dev'})",server);assert.equal(response.headers.get('Content-Type'),'image/png');assert.equal(await response.text(),'photo');
 await assert.rejects(vm.runInContext("serveMediaFile(env,'other','owned',{})",server),/не найдена/);assert.equal(fetched,1,'unowned job cannot trigger a download');
 console.log('PASS: shared reentrant downloads, immediate cached media despite stalled persistence, authenticated streaming and account isolation.');
})().catch(e=>{console.error(e);process.exitCode=1});
