/* Agreed prices, safe rounding, video metadata and authenticated quote contract. No provider calls. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{videoFile}=require('./media-test-helpers.cjs');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('worker.js','utf8').split('export default')[0],ctx);
const quote=(body,source)=>{ctx.body=body;ctx.source=source;return vm.runInContext('mediaPrice({},body,source)',ctx);};
const photos=[
 ['google/gemini-3.1-flash-lite-image',['img-auto'],[2]],['google/gemini-nano-banana-2.1',['img-1k','img-2k','img-4k'],[2,3,4]],
 ['google/gemini-3.1-flash-image-preview',['img-1k','img-2k','img-4k'],[3,5,7]],['google/gemini-3-pro-image-preview',['img-1k','img-2k','img-4k'],[8,8,11]],
 ['google/gemini-2.5-flash-image',['img-auto'],[2]],...['openai/gpt-image-2.5-flare','openai/gpt-image-2.5-sunburst','openai/gpt-5.4-image-2'].map(m=>[m,['img-1k','img-2k','img-4k'],[3,4,7]]),
 ['openai/gpt-image-1.5',['img-medium','img-high'],[2,10]],['bytedance/seedream-5-lite',['img-2k','img-3k'],[3,3]],['seedream/5-pro-text-to-image',['img-1k','img-2k'],[3,6]],
 ['bytedance/seedream-4.5',['img-2k','img-4k'],[3,3]],['bytedance/seedream-4',['img-1k','img-2k','img-4k'],[2,2,2]],['black-forest-labs/flux.2-flex',['img-1k','img-2k'],[8,14]],['black-forest-labs/flux.2-pro',['img-1k','img-2k'],[3,4]]
];
const videos=[
 ['grok-imagine-video-1-5',['480p','720p'],10,[10,17]],['bytedance/seedance-2-mini',['480p','720p'],10,[15,31]],['bytedance/seedance-2-5',['480p','720p'],10,[106,238]],
 ['bytedance/seedance-2-fast',['480p','720p'],10,[59,125]],['bytedance/seedance-2',['480p','720p','1080p'],10,[72,155,386]],
 ['bytedance/seedance-1.5-pro',['480p','720p','1080p'],4,[3,6,13]],['bytedance/seedance-1.5-pro',['480p','720p','1080p'],8,[6,12,26]],['bytedance/seedance-1.5-pro',['480p','720p','1080p'],12,[8,18,38]],
 ['kling/v2.6',['native'],5,[24]],['kling/v2.6',['native'],10,[47]],['kling/v3',['std','pro','4K'],10,[56,68,252]],
 ['wan/2.5',['720p','1080p'],5,[26,42]],['wan/2.5',['720p','1080p'],10,[51,84]],
 ['wan/2.6',['720p','1080p'],5,[30,44]],['wan/2.6',['720p','1080p'],10,[59,88]],['wan/2.6',['720p','1080p'],15,[88,133]],
 ['gemini-omni-video',['720p','1080p','4k'],4,[20,20,40]],['gemini-omni-video',['720p','1080p','4k'],6,[26,26,42]],['gemini-omni-video',['720p','1080p','4k'],8,[28,28,46]],['gemini-omni-video',['720p','1080p','4k'],10,[34,34,54]]
];
module.exports={photos,videos};
if(require.main===module)(async()=>{
 let checked=0;
 for(const [model,qualities,prices]of photos)for(let i=0;i<qualities.length;i++)for(const source of [{type:''},{type:'image/jpeg'}]){
  const p=quote({kind:'image',model,quality:qualities[i],ratio:model==='openai/gpt-image-1.5'?'2:3':'9:16'},source);assert.equal(p.amount,prices[i],model+' '+qualities[i]);assert.equal(p.enabled,true);assert.equal(p.provider.only.join(','),'mie');assert.equal(p.provider.allow_fallbacks,false);assert.ok(Object.values(p.provider.max_price)[0]>0);checked++;
 }
 for(const [model,qualities,duration,prices]of videos)for(let i=0;i<qualities.length;i++){
  const p=quote({kind:'video',model,quality:qualities[i],ratio:model==='wan/2.6'?'source':'16:9',duration});assert.equal(p.amount,prices[i],model+' '+qualities[i]+' '+duration);assert.ok(p.provider.max_price.request>0||p.provider.max_price.video_per_second>0);checked++;
 }
 for(const [model,qualities,prices]of [['bytedance/seedance-2-mini',['480p','720p'],[19,38]],['bytedance/seedance-2-5',['480p','720p'],[129,288]],['bytedance/seedance-2-fast',['480p','720p'],[59,125]],['bytedance/seedance-2',['480p','720p','1080p'],[87,189,469]],['gemini-omni-video',['720p','1080p','4k'],[54,54,65]]])for(let i=0;i<qualities.length;i++)assert.equal(quote({kind:'video',model,quality:qualities[i],ratio:'16:9',duration:10},{type:'video/mp4',duration:10}).amount,prices[i]);
 for(const [model,prices]of [['kling/v2.6-motion-control',[47,76]],['kling/v3-motion-control',[79,107]]])for(let i=0;i<2;i++){
  const b={kind:'video',model,quality:['720p','1080p'][i],ratio:'source',duration:0};assert.equal(quote(b,{type:'video/mp4',duration:10}).amount,prices[i]);assert.equal(quote(b).requiresVideo,true);assert.throws(()=>quote(b,{type:'video/mp4',duration:99}),/до 15 секунд/);
 }
 assert.equal(quote({kind:'video',model:'bytedance/seedance-2-5',quality:'480p',duration:26,ratio:'16:9'}).amount,275,'exact integer boundary must not overcharge by one');
 assert.equal(quote({kind:'image',model:'auto',quality:'fhd',ratio:'1:1',prompt:'Море'}).amount,5);
 assert.equal(quote({kind:'image',model:'auto',quality:'fhd',ratio:'1:1',prompt:'Добавь текст'}).amount,8,'Auto quotes the actual prompt-selected model');
 assert.equal(quote({kind:'image',model:'auto',quality:'qhd',ratio:'1:1',prompt:'Море'}).amount,11);
 assert.equal(quote({kind:'video',model:'auto',quality:'uhd',ratio:'16:9',duration:8}).amount,46);
 assert.throws(()=>quote({kind:'image',model:'openai/gpt-image-2.5-flare',quality:'img-4k',ratio:'1:1'}),/4K/);
 for(const ext of ['mp4','mov','webm']){ctx.file=new File([fs.readFileSync('test-fixtures/billing-10_1s.'+ext)],'video.'+ext,{type:ext==='webm'?'video/webm':'video/mp4'});assert.equal(await vm.runInContext('billingVideoDuration(file)',ctx),10.1);}
 for(const version of [0,1]){ctx.file=videoFile(10.125,version);assert.equal(await vm.runInContext('billingVideoDuration(file)',ctx),10.125);}
 ctx.file=new File(['unreadable video'],'fake.mp4',{type:'video/mp4'});await assert.rejects(vm.runInContext('billingVideoDuration(file)',ctx),/Не удалось определить/);
 const fractional=quote({kind:'video',model:'kling/v2.6-motion-control',quality:'720p',ratio:'source',duration:0},{type:'video/mp4',duration:10.1});assert.equal(fractional.billableSeconds,11);assert.equal(fractional.amount,51,'motion cost rounds the inspected source duration up to the next second');
 console.log('PASS:',checked,'photo/video price anchors, all 28 models, editing premiums, fixed-price video, Auto, exact rounding, strict provider budgets, MP4/MOV/WebM metadata and Motion Control seconds. No paid requests.');
})().catch(e=>{console.error(e);process.exitCode=1});
