/* Provider payload and wallet tests. All provider requests are mocked. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {fund,accept,videoFile}=require('./media-test-helpers.cjs');
const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE chat_messages(id INTEGER PRIMARY KEY,user_id TEXT,role TEXT,content TEXT,created_at TEXT)');for(const file of ['media-jobs.sql','payments.sql','stability-migration.sql','project-groups.sql','media-billing.sql'])raw.exec(fs.readFileSync(file,'utf8'));raw.exec('CREATE TABLE usage_events(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT)');
const db={prepare(sql){const make=p=>({bind(...args){return make(args)},async first(){return raw.prepare(sql).get(...p)||null},async all(){return {results:raw.prepare(sql).all(...p)}},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...p).changes)}}}});return make([])}};
const calls=[],context=vm.createContext({URL,Uint8Array,AbortController,setTimeout,clearTimeout,Response,btoa,fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({id:'provider-'+calls.length,status:'pending'});}});
vm.runInContext(fs.readFileSync('worker.js','utf8').split('export default')[0]+';globalThis.catalog=VIDEO_MODEL_SETTINGS',context);context.env={DB:db,POLZA_API_KEY:'mock'};
const run=s=>vm.runInContext(s,context),settings=JSON.parse(JSON.stringify(context.catalog)),photo=new File(['reference'],'face.png',{type:'image/png'}),video=videoFile(10);let seq=0;
const body=(model,quality,cfg)=>({kind:'video',model,quality,ratio:cfg.ratios[0],duration:cfg.durations.at(-1),prompt:'Плавное движение камеры',requestId:'video-model-test-'+String(++seq).padStart(6,'0')});
const create=async(b,file=null,identity=null)=>{context.body=b;context.owner='user-'+(++seq);context.file=file;context.identity=identity;fund(raw,context.owner);try{context.body=await accept(context,b,file);}catch{}return run('createPremiumMedia(env,owner,body,file,identity)');};
(async()=>{
 for(const [model,cfg]of Object.entries(settings))for(const quality of Object.keys(cfg.qualities)){
  const b=body(model,quality,cfg),job=await create(b,cfg.motion?video:photo,cfg.motion?photo:null),sent=calls.at(-1),before=calls.length;
  assert.equal(sent.model,model);assert.equal(job.model,model);assert.equal(job.duration,b.duration);assert.ok(sent.input.images[0].data.startsWith('data:image/png;base64,'));
  if(cfg.motion){assert.equal(sent.input.duration,undefined);assert.equal(sent.input.aspect_ratio,undefined);assert.equal(sent.input.character_orientation,'video');assert.ok(sent.input.videos[0].data.startsWith('data:video/mp4;base64,'));}
  else{assert.equal(sent.input.duration,cfg.numericDuration?b.duration:String(b.duration));assert.equal(sent.input.aspect_ratio,cfg.omitRatio?undefined:b.ratio);}
  if(cfg.mode){assert.equal(sent.input.mode,cfg.qualities[quality]);assert.equal(sent.input.resolution,undefined);}else if(quality==='native'){assert.equal(sent.input.resolution,undefined);assert.equal(sent.input.mode,undefined);}else assert.equal(sent.input.resolution,cfg.qualities[quality]);
  if(cfg.audio)assert.equal(sent.input[cfg.audio],false);else assert.equal(sent.input.generate_audio,undefined);
  await run('createPremiumMedia(env,owner,body,file,identity)');assert.equal(calls.length,before,'duplicate IDs never submit twice');
  const history=await run("getMediaHistory(env.DB,owner,'video')");assert.equal(history.items[0].model,model);assert.equal(history.items[0].duration,b.duration);
 }
 let before=calls.length;
 for(const [model,cfg]of Object.entries(settings)){
  const q=Object.keys(cfg.qualities)[0],b=body(model,q,cfg);
  await assert.rejects(create({...b,duration:100},cfg.motion?video:null,cfg.motion?photo:null),/длительность/);
  await assert.rejects(create({...b,quality:'not-supported'}),/качество/);
  await assert.rejects(create({...b,ratio:'2:3'}),/формат/);
  if(cfg.motion)await assert.rejects(create(b,video),/отдельное фото/);
  else if(!cfg.video)await assert.rejects(create(b,video),/описание или фото/);
 }
 assert.equal(calls.length,before,'invalid settings and sources stop before provider');
 for(const model of ['kling/v2.5-turbo','bytedance/seedance-1-pro','wan/turbo','google/veo3','arbitrary/expensive'])await assert.rejects(create({kind:'video',model,quality:'720p',duration:5,ratio:'16:9',prompt:'Рассвет над морем',requestId:'blocked-model-0000001'}),/доступную модель/);
 await assert.rejects(create(body('wan/2.5','720p',settings['wan/2.5']),photo,photo),/дополнительное фото/);
 await assert.rejects(create({...body('wan/2.5','720p',settings['wan/2.5']),prompt:'а'.repeat(801)}),/800/);
 assert.equal(calls.length,before);
 context.body={kind:'video',model:'wan/2.5',quality:'720p',duration:5};assert.equal(run('mediaPrice(env,body).amount'),26,'explicit model uses its own approved tariff');
 context.body=await accept(context,body('wan/2.5','720p',settings['wan/2.5']));await assert.rejects(run("createPremiumMedia(env,'empty',body,null)"),/Недостаточно аниумов/);assert.equal(calls.length,before,'wallet protects new models');
 assert.equal(run('mediaPrice(env,body).amount'),51);
 context.body={kind:'video',model:'bytedance/seedance-2-fast',quality:'fhd',ratio:'16:9'};assert.throws(()=>run('choosePremiumMedia(body,null)'),/качество/,'explicit model never switches silently');
 console.log('PASS: 13 real video model routes, every quality, native parameters, motion files, history, source validation, duration/ratio limits, unavailable model rejection, idempotence and model-specific wallet tariffs. No paid requests.');
})().catch(error=>{console.error(error);process.exitCode=1;});
