/* Telegram profile reads are mocked; no real bot credentials or user messages. */
const assert=require('node:assert/strict'),{createFixture}=require('./control-tests.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l5kAAAAASUVORK5CYII=','base64');
(async()=>{
 const f=createFixture(),id='444555666';await f.call({action:'control-session',sessionId:'profile-owner-session-fixture'});
 f.raw.prepare("INSERT INTO control_users(user_id,first_seen,last_seen) VALUES(?,'2024-01-01 12:00:00','2024-01-02 12:00:00')").run(id);
 const baseline=f.raw.prepare('SELECT first_seen,last_seen FROM control_users WHERE user_id=?').get(id),calls=[];let mode='photo';
 f.ctx.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):{};calls.push({url,body});
  if(mode==='down')return Response.json({ok:false},{status:503});
  if(url.endsWith('/getChat'))return Response.json({ok:true,result:{id:mode==='wrong-id'?999:Number(body.chat_id),type:'private',first_name:String(body.chat_id)===id?'Анна':f.owner.first_name,last_name:'Иванова',username:String(body.chat_id)===id?'anna':f.owner.username,...(mode==='photo'||mode==='bad-path'?{photo:{small_file_id:'avatar-test-file-id'}}:{})}});
  if(url.endsWith('/getFile'))return Response.json({ok:true,result:{file_path:mode==='bad-path'?'https://wrong.example/secret.jpg':'photos/avatar.png',file_size:png.length}});
  if(url.includes('/file/bot'))return new Response(png,{headers:{'Content-Type':'image/png'}});
  throw Error('Unexpected network call');
 };
 assert.equal((await f.call({action:'control-users',period:'all'},f.guest)).status,403);assert.equal(calls.length,0,'outsiders cannot request cached or live profiles');
 let response=await f.call({action:'control-users',period:'all'}),text=await response.text(),data=JSON.parse(text),row=data.items.find(x=>x.user_id===id);
 assert.equal(response.status,200);assert.equal(row.first_name,'Анна');assert.match(row.photo_url,/^data:image\/png;base64,/);assert.equal(row.profile_status,'ready');
 assert.ok(!text.includes('local-test-token-only'));assert.ok(!text.includes('avatar-test-file-id'));assert.ok(!text.includes('/file/bot'));
 assert.deepEqual(f.raw.prepare('SELECT first_seen,last_seen FROM control_users WHERE user_id=?').get(id),baseline,'profile hydration must not create fake visits');
 const before=calls.length;await f.call({action:'control-users',period:'all'});assert.equal(calls.length,before,'profiles and image bytes are cached');
 f.raw.exec('UPDATE control_profile_cache SET next_check_at=0');mode='no-photo';data=await(await f.call({action:'control-users',period:'all'})).json();row=data.items.find(x=>x.user_id===id);assert.equal(row.photo_url,'','a removed or unavailable Telegram photo must not show a stale cached avatar');assert.equal(row.profile_status,'no_photo');
 f.raw.exec('UPDATE control_profile_cache SET next_check_at=0');mode='down';data=await(await f.call({action:'control-users',period:'all'})).json();assert.equal(data.items.find(x=>x.user_id===id).first_name,'Анна','Telegram failure must not wipe a known name');const afterDown=calls.length;await f.call({action:'control-users',period:'all'});assert.equal(calls.length,afterDown,'failed lookups have a retry backoff');
 f.raw.exec('UPDATE control_profile_cache SET next_check_at=0');mode='wrong-id';await f.call({action:'control-users',period:'all'});assert.equal(f.raw.prepare('SELECT first_name FROM control_users WHERE user_id=?').get(id).first_name,'Анна','mismatched Telegram identity cannot overwrite a profile');
 f.raw.exec('UPDATE control_profile_cache SET next_check_at=0');mode='bad-path';const beforeBad=calls.filter(x=>x.url.includes('/file/bot')).length;await f.call({action:'control-users',period:'all'});assert.equal(calls.filter(x=>x.url.includes('/file/bot')).length,beforeBad,'untrusted file paths cannot be fetched');
 f.ctx.svg='image/svg+xml';f.ctx.bytes=png;assert.equal(f.run('controlProfileImage(svg,bytes)'),'','only safe raster image MIME types can be returned');
 f.ctx.tooLarge=new Response(new Uint8Array(131073));assert.equal(await f.run('controlProfileRead(tooLarge,131072)'),null,'streamed avatar size is bounded even without Content-Length');
 f.ctx.tooLargeHeader=new Response('x',{headers:{'Content-Length':'131073'}});assert.equal(await f.run('controlProfileRead(tooLargeHeader,131072)'),null,'advertised oversize bodies are not buffered');
 assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM chat_messages').get().n,0);assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM media_jobs').get().n,0);assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM payment_receipts').get().n,0);
 console.log('PASS: owner-only Telegram profile hydration, cached inline avatars, no bot token/file URL disclosure, no fake visits, removed-photo privacy, retry backoff, wrong-ID/path protection and bounded raster downloads. No real Telegram/AI/payment calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
