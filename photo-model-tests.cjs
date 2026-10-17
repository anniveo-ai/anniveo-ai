/* Native photo payloads, references and billing. The provider is mocked. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE chat_messages(id INTEGER PRIMARY KEY,user_id TEXT,role TEXT,content TEXT,created_at TEXT)');for(const file of ['media-jobs.sql','payments.sql','stability-migration.sql','project-groups.sql','media-billing.sql'])raw.exec(fs.readFileSync(file,'utf8'));raw.exec('CREATE TABLE usage_events(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT)');
const db={prepare(sql){const make=p=>({bind(...args){return make(args)},async first(){return raw.prepare(sql).get(...p)||null},async all(){return {results:raw.prepare(sql).all(...p)}},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...p).changes)}}}});return make([])}};
const calls=[],context=vm.createContext({URL,Uint8Array,AbortController,setTimeout,clearTimeout,Response,btoa,fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({id:'provider-'+calls.length,status:'pending'});}});
vm.runInContext(fs.readFileSync('worker.js','utf8').split('export default')[0]+';globalThis.catalog=PHOTO_MODEL_SETTINGS',context);context.env={DB:db,POLZA_API_KEY:'mock'};
const run=s=>vm.runInContext(s,context),settings=JSON.parse(JSON.stringify(context.catalog)),photo=new File(['reference'],'source.png',{type:'image/png'});let seq=0;
const create=async(b,file=null)=>{context.body={...b,kind:'image',prompt:b.prompt||'Сделай вечерний свет',requestId:'photo-model-test-'+String(++seq).padStart(6,'0')};context.owner='user-'+seq;context.file=file;return run('createPremiumMedia(env,owner,body,file)');};
(async()=>{
 assert.equal(Object.keys(settings).length,15);
 for(const [model,cfg]of Object.entries(settings)){
  for(const [quality,value]of Object.entries(cfg.qualities)){
   const ratio=cfg.squareNo4K&&quality==='img-4k'?'9:16':cfg.ratios[0];
   const job=await create({model,quality,ratio},photo),sent=calls.at(-1),before=calls.length;
   assert.equal(job.model,model);assert.equal(job.quality,quality);assert.equal(sent.model,model);assert.equal(sent.input.aspect_ratio,ratio);assert.equal(sent.input.images[0].data,'data:image/png;base64,cmVmZXJlbmNl');
   if(cfg.parameter)assert.equal(sent.input[cfg.parameter],value);else{assert.equal(sent.input.quality,undefined);assert.equal(sent.input.image_resolution,undefined);}
   if(cfg.parameter==='quality')assert.equal(sent.input.image_resolution,undefined);else assert.equal(sent.input.quality,undefined);
   assert.equal(sent.input.output_format,cfg.outputFormat?'png':undefined);
   await run('createPremiumMedia(env,owner,body,file)');assert.equal(calls.length,before,'repeated click cannot start a second paid request');
   const history=await run("getMediaHistory(env.DB,owner,'image')");assert.equal(history.items[0].model,model);assert.equal(history.items[0].quality,quality);
  }
  const quality=Object.keys(cfg.qualities)[0];await create({model,quality,ratio:cfg.ratios[0]});assert.equal(calls.at(-1).input.images,undefined,'text generation does not invent a source');
 }
 const before=calls.length;
 for(const [model,cfg]of Object.entries(settings)){
  const quality=Object.keys(cfg.qualities)[0];await assert.rejects(create({model,quality:'not-supported',ratio:cfg.ratios[0]}),/качество/);await assert.rejects(create({model,quality,ratio:'8:1'}),/формат/);
  if(cfg.squareNo4K)await assert.rejects(create({model,quality:'img-4k',ratio:'1:1'}),/4K/);
 }
 for(const model of ['black-forest-labs/flux.2-flex','black-forest-labs/flux.2-pro','bytedance/seedream-5-lite','seedream/5-pro-text-to-image'])await assert.rejects(create({model,quality:'img-4k',ratio:'9:16'}),/качество/);
 await assert.rejects(create({model:'openai/gpt-image-1.5',quality:'img-high',ratio:'9:16'}),/формат/);await create({model:'openai/gpt-image-1.5',quality:'img-high',ratio:'2:3'},photo);assert.equal(calls.at(-1).input.quality,'high');assert.equal(calls.at(-1).input.aspect_ratio,'2:3');
 assert.equal(calls.length,before+1,'invalid native settings stop before the provider');
 context.env.MEDIA_PRICES_JSON=JSON.stringify({'image:img-1k:0':1,'openai/gpt-image-2.5-flare:image:img-1k:0':50});context.body={kind:'image',model:'black-forest-labs/flux.2-pro',quality:'img-1k'};assert.throws(()=>run('mediaPrice(env,body)'),/тариф пока не задан/,'new models cannot inherit a generic tariff');
 const paidBefore=calls.length;await assert.rejects(create({model:'openai/gpt-image-2.5-flare',quality:'img-1k',ratio:'1:1',acceptedPrice:50}),/Недостаточно аниумов/);assert.equal(calls.length,paidBefore,'new image models cannot bypass the wallet');
 delete context.env.MEDIA_PRICES_JSON;
 console.log('PASS: 15 native photo routes, all qualities, text and source-photo generation, model/history retention, format and square-4K restrictions, no invented parameters, idempotence and model-specific wallet protection. No paid requests.');
})().catch(error=>{console.error(error);process.exitCode=1;});
