const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const nodes=new Map(),requests=[],toasts=[],revoked=[];
let id=0;
function node(){return{value:'',disabled:false,hidden:false,textContent:'',children:[],attrs:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this[k]},replaceChildren(...children){this.children=children},append(...children){this.children.push(...children)},click(){},showModal(){this.open=true},close(){this.open=false},querySelector(){return null},focus(){},remove(){}}}
const getNode=key=>{if(!nodes.has(key))nodes.set(key,node());return nodes.get(key)};
getNode('imageModel').value='google/gemini-3.1-flash-image-preview';getNode('imageRatio').value='1:1';
const tools=['improve','background','style','details'].map(key=>({...node(),dataset:{studioTool:key}}));
const ctx=vm.createContext({console,Blob,File,FormData,Response,AbortController,AbortSignal,setTimeout,clearTimeout,atob,Uint8Array,crypto:require('node:crypto').webcrypto,URL,
 navigator:{},recording:false,openingMic:false,transcribing:false,MediaRecorder:function(){},localStorage:{getItem(){return null},setItem(){},removeItem(){}},window:{},
 $:getNode,initData:'test',user:{id:123},tg:null,API_URL:'https://example.test',
 URL:{createObjectURL:()=>`blob:test-${++id}`,revokeObjectURL:url=>revoked.push(url)},
 document:{querySelectorAll:()=>tools,createElement:()=>node(),body:node()},toast:t=>toasts.push(t),invalidateUsageStats(){},
 fetch:async(url,options)=>{if(url==='https://cdn.test/image.png')return new Response(new Blob(['image'],{type:'image/png'}));requests.push(options);return Response.json({status:'completed',url:'https://cdn.test/image.png'})}
});
const source=html.slice(html.indexOf('let studioImageFile=null;'),html.indexOf('/* КЛАВИАТУРА IPHONE */'));
vm.runInContext(source,ctx);const run=code=>vm.runInContext(code,ctx);
(async()=>{
 const file=new File(['example-photo'],'photo.png',{type:'image/png'});ctx.photo=file;
 assert.equal(run('setStudioPhoto(photo)'),true);assert.equal(getNode('imageModel').value,'google/gemini-3.1-flash-image-preview');assert.equal(getNode('imageModel').disabled,false);
 run("selectStudioTool('improve')");assert.equal(tools[0].attrs['aria-pressed'],'true');
 getNode('imagePrompt').value='Сделай свет теплее';
 await run("generateMedia('image')");
 const edit=requests.at(-1).body;assert.ok(edit instanceof FormData);assert.equal(edit.get('action'),'media-create');assert.equal(edit.get('model'),'google/gemini-3.1-flash-image-preview');
 assert.equal(edit.get('file').name,'photo.png');assert.match(edit.get('prompt'),/Сделай свет теплее/);assert.match(edit.get('prompt'),/Сохрани внешность/);
 assert.equal(getNode('makeImage').disabled,false);assert.equal(getNode('studioUploadButton').disabled,false);
 assert.equal(getNode('imageModel').disabled,false,'premium editing model remains selectable');
 run('clearStudioPhoto()');assert.equal(getNode('imageModel').value,'google/gemini-3.1-flash-image-preview');assert.equal(getNode('imageModel').disabled,false);assert.equal(getNode('studioPhotoPreview').hidden,true);assert.ok(revoked.length>=1);
 getNode('imagePrompt').value='Горы на рассвете';run("selectStudioTool('style')");await run("generateMedia('image')");
 const creation=JSON.parse(requests.at(-1).body);assert.equal(creation.action,'media-create');assert.equal(creation.model,'google/gemini-3.1-flash-image-preview');assert.match(creation.prompt,/Горы на рассвете/);
 run("selectStudioTool('background')");const before=requests.length;await run("generateMedia('image')");assert.equal(requests.length,before,'photo-specific tools cannot send empty reference');assert.match(toasts.at(-1),/Добавь фото/);
 ctx.invalid={type:'image/svg+xml',size:10,name:'not-supported.svg'};assert.equal(run('setStudioPhoto(invalid)'),false);
 ctx.tooLarge={type:'image/png',size:21*1024*1024,name:'big.png'};assert.equal(run('setStudioPhoto(tooLarge)'),false);
 assert.equal((html.match(/id="view-studio"/g)||[]).length,1);assert.equal((html.match(/id="imageFile"/g)||[]).length,1);
 assert.equal(getNode('mediaResultDialog').open,true);assert.equal(getNode('imageResult').children[0].textContent,'Открыть готовый результат ↗');
 let resolvePermission,stopped=0;ctx.navigator.mediaDevices={getUserMedia:()=>new Promise(r=>resolvePermission=r)};
 const opening=run("toggleMediaDictation('image')");run('cancelMediaDictation()');resolvePermission({getTracks:()=>[{stop(){stopped++}}]});await opening;assert.equal(stopped,1,'late microphone permission cannot reopen recording');assert.equal(run('mediaVoiceTask'),null);
 console.log('PASS: preview lifecycle, editing reference upload, tool + user instructions, model restoration, creation routing, invalid file rejection and unique controls');
})().catch(error=>{console.error(error);process.exitCode=1});
