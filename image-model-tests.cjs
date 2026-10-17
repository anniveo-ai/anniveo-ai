const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE chat_messages(id INTEGER PRIMARY KEY,user_id TEXT,role TEXT,content TEXT,created_at TEXT)');for(const file of ['media-jobs.sql','payments.sql','stability-migration.sql','project-groups.sql','media-billing.sql'])raw.exec(fs.readFileSync(file,'utf8'));raw.exec('CREATE TABLE usage_events(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT)');
const db={prepare(sql){const make=p=>({bind(...args){return make(args)},async first(){return raw.prepare(sql).get(...p)||null},async all(){return {results:raw.prepare(sql).all(...p)}},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...p).changes)}}}});return make([])}};
const calls=[],context=vm.createContext({URL,Uint8Array,AbortController,setTimeout,clearTimeout,Response,btoa,fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({id:'provider-'+calls.length,status:'pending'});}});
vm.runInContext(fs.readFileSync('worker.js','utf8').split('export default')[0],context);context.env={DB:db,POLZA_API_KEY:'mock'};
const run=s=>vm.runInContext(s,context),models=['google/gemini-3.1-flash-image-preview','google/gemini-3-pro-image-preview','bytedance/seedream-4.5'];
(async()=>{
 let n=0;for(const model of models)for(const [quality,ratio,resolution]of [['fhd','9:16','2K'],['qhd','1:1','4K'],['uhd','16:9','4K']]){
  context.body={kind:'image',model,quality,ratio,prompt:'Надпись на фото, вечерний свет',requestId:'model-picker-test-'+String(++n).padStart(6,'0')};context.owner='user-'+n;
  context.file=new File(['reference'],'photo.png',{type:'image/png'});
  const ready=await run('createPremiumMedia(env,owner,body,file)'),sent=calls.at(-1);assert.equal(sent.model,model);assert.equal(ready.model,model);assert.equal(sent.input.aspect_ratio,ratio);assert.ok(sent.input.images[0].data.startsWith('data:image/png;base64,'));
  if(model==='bytedance/seedream-4.5'){assert.equal(sent.input.quality,resolution==='4K'?'high':'basic');assert.equal(sent.input.image_resolution,undefined);assert.equal(sent.input.output_format,undefined);}else assert.equal(sent.input.image_resolution,resolution);
  const count=calls.length;await run('createPremiumMedia(env,owner,body,file)');assert.equal(calls.length,count,'one paid request per ID');
  const history=await run("getMediaHistory(env.DB,owner,'image')");assert.equal(history.items[0].model,model);
 }
 for(const model of ['other/expensive-model','bytedance/seedance-2']){context.body={kind:'image',model,quality:'fhd'};assert.throws(()=>run('choosePremiumMedia(body,null)'),/доступную модель/);}
 context.body={kind:'image',model:'auto',quality:'fhd',ratio:'9:16',prompt:'Море'};assert.equal(run('choosePremiumMedia(body,null).model'),models[0]);context.body.prompt='Надпись';assert.equal(run('choosePremiumMedia(body,null).model'),models[1]);
 context.body={kind:'video',model:models[0],quality:'fhd',ratio:'16:9'};assert.equal(run('choosePremiumMedia(body,null).model'),'bytedance/seedance-2');
 context.env.MEDIA_PRICES_JSON=JSON.stringify({'image:fhd:0':30});context.body={kind:'image',model:models[2],quality:'fhd',ratio:'1:1',prompt:'Вечерний свет',requestId:'model-no-wallet-00001',acceptedPrice:30};const count=calls.length;await assert.rejects(run("createPremiumMedia(env,'empty-wallet',body,null)"),/Недостаточно аниумов/);assert.equal(calls.length,count,'new models do not bypass wallet');
 console.log('PASS: all three explicit models, native provider parameters, reference images, history, idempotency, auto compatibility, video isolation and wallet protection. No paid requests.');
})().catch(e=>{console.error(e);process.exitCode=1;});
