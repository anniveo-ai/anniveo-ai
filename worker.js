async function requireChatThread(db,userId,requested){
 const id=String(requested||'legacy');
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw Error('Выбери разговор из списка.');
 const row=await db.prepare('SELECT id,title FROM chat_threads WHERE user_id=? AND id=?').bind(userId,id).first();
 if(!row&&id==='legacy'){await db.prepare("INSERT OR IGNORE INTO chat_threads(user_id,id,title) VALUES(?,'legacy','Первый чат')").bind(userId).run();return id;}
 if(!row){const e=Error('Разговор не найден. Выбери другой чат.');e.status=404;throw e;}return id;
}
async function handleChatThreadAction(db,userId,body){
 await requireChatThread(db,userId,'legacy');
 if(body.action==='chat-thread-create'){
  const id=crypto.randomUUID(),title=String(body.title||'Новый чат').trim().slice(0,80)||'Новый чат';
  await db.prepare('INSERT INTO chat_threads(user_id,id,title) VALUES(?,?,?)').bind(userId,id,title).run();return {id,title};
 }
 if(body.action==='chat-thread-rename'){
  const id=await requireChatThread(db,userId,body.threadId),title=String(body.title||'').trim().slice(0,80);if(!title)throw Error('Напиши название разговора.');
  await db.prepare("UPDATE chat_threads SET title=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(title,userId,id).run();return {id,title};
 }
 const result=await db.prepare("SELECT t.id,t.title,t.updated_at,(SELECT COUNT(*) FROM chat_messages m WHERE m.user_id=t.user_id AND m.thread_id=t.id) AS messages FROM chat_threads t WHERE t.user_id=? ORDER BY t.updated_at DESC,t.id LIMIT 100").bind(userId).all();return {threads:result.results||[]};
}
async function readNotificationPreference(db,userId){
 const row=await db.prepare('SELECT notify_media FROM user_preferences WHERE user_id=?').bind(userId).first();return {enabled:!!row?.notify_media};
}
async function setNotificationPreference(db,userId,enabled){
 if(typeof enabled!=='boolean')throw Error('Выбери, нужны ли уведомления.');
 await db.prepare("INSERT INTO user_preferences(user_id,notify_media) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET notify_media=excluded.notify_media,updated_at=CURRENT_TIMESTAMP").bind(userId,enabled?1:0).run();return {enabled};
}
async function notifyReadyMedia(env,row){
 const reserved=await env.DB.prepare("UPDATE media_jobs SET notify_sent=1 WHERE id=? AND user_id=? AND status='completed' AND notify_sent=0 AND EXISTS(SELECT 1 FROM user_preferences WHERE user_id=? AND notify_media=1)").bind(row.id,row.user_id,row.user_id).run();
 if(!reserved.meta?.changes)return;
 try{await telegramPaymentAPI(env,'sendMessage',{chat_id:row.user_id,text:(row.kind==='video'?'Твоё видео готово':'Твоё фото готово')+' ✨\nОткрой ANIS AI, чтобы посмотреть и сохранить результат.',reply_markup:{inline_keyboard:[[{text:'Открыть результат',web_app:{url:'https://anniveo-ai-app.pages.dev/?project='+encodeURIComponent(row.id)}}]]}});}
 catch{console.error('Ready notification could not be confirmed',{jobId:row.id});}
}
async function processMediaNotifications(env){
 if(!env.DB||!env.POLZA_API_KEY||!env.TELEGRAM_BOT_TOKEN)return;
 const pending=await env.DB.prepare("SELECT j.* FROM media_jobs j JOIN user_preferences p ON p.user_id=j.user_id AND p.notify_media=1 WHERE j.notify_sent=0 AND j.status IN ('pending','processing','completed') AND j.created_at>datetime('now','-7 days') ORDER BY j.created_at LIMIT 8").all();
 const rows=pending.results||[];
 for(let i=0;i<rows.length;i+=2)await Promise.allSettled(rows.slice(i,i+2).map(async row=>{
  try{if(row.status!=='completed'){const data=await polzaMediaRequest(env,'/'+encodeURIComponent(row.provider_id));await updatePremiumJob(env,row,data);if(data.status!=='completed')return;}await notifyReadyMedia(env,row);}catch{console.error('Background project check failed',{jobId:row.id});}
 }));
}
async function improveCreationPrompt(env,body){
 const text=String(body.prompt||'').trim(),kind=body.kind==='video'?'видео':'фото';if(text.length<3||text.length>1200)throw Error('Напиши идею: от 3 до 1200 символов.');
 const detail=String(body.details||'').trim().slice(0,800);
 const prompt=await askPreferredAI([{role:'system',content:'Помоги составить запрос для создания '+kind+'. Сохрани замысел человека. Уточни композицию, свет и атмосферу, но не выдумывай личные факты и не добавляй бренды. Если приложено фото, попроси сохранить внешность. Для видео добавь естественное движение и стабильность деталей. Верни только готовое описание на русском, без заголовка и кавычек, не длиннее 1100 символов.'},{role:'user',content:text+(detail?'\nПожелания: '+detail:'')}],env,'prompt-helper');
 if(!prompt||prompt.length>1200)throw Error('Описание получилось слишком длинным. Попробуй уточнить идею короче.');return {prompt};
}
const PREMIUM_MEDIA_MODELS=Object.freeze({
 'google/gemini-3.1-flash-image-preview':{kind:'image',resolution:'1K'},
 'google/gemini-3-pro-image-preview':{kind:'image',resolution:'2K'},
 'bytedance/seedance-2-fast':{kind:'video',resolution:'720p'},
 'bytedance/seedance-2':{kind:'video',resolution:'720p'},
 'gemini-omni-video':{kind:'video',resolution:'4k'}
});
function premiumError(status){return status===402?'На балансе сервиса ИИ недостаточно средств. Пополни баланс Polza.':status===401||status===403?'Платный сервис ИИ недоступен: проверь доступ API-ключа.':status===429?'Сервис ИИ занят. Подожди немного.':'Сервис ИИ не смог обработать запрос. Повтори позже.';}
async function polzaMediaRequest(env,path,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{
  const response=await fetch('https://polza.ai/api/v1/media'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+env.POLZA_API_KEY,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
  if(!response.ok){await response.body?.cancel();const error=Error(premiumError(response.status));error.status=response.status===402?402:502;throw error;}
  return await response.json();
 }finally{clearTimeout(timer);}
}
function publicMediaJob(row){return {jobId:row.id,groupId:row.group_id||row.id,kind:row.kind,status:row.status,prompt:row.prompt||'',quality:row.quality||'fast',ratio:row.ratio||'1:1',duration:row.duration||4,createdAt:row.created_at||null,expiresAt:row.created_at?new Date(Date.parse(row.created_at.replace(' ','T')+'Z')+7*86400000).toISOString():null,region:row.region_json?JSON.parse(row.region_json):null,...(row.status==='completed'?{url:row.result_url}:{}),...(row.error?{error:row.error}:{})};}
function providerResultUrl(data){const value=data?.data?.url||data?.data?.[0]?.url||data?.output?.url;try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}}
async function updatePremiumJob(env,row,data){
 const status=['pending','processing','completed','failed','cancelled'].includes(data.status)?data.status:'processing';
 const url=status==='completed'?providerResultUrl(data):null;
 if(status==='completed'&&!url)throw Error('Сервис не вернул файл результата. Проверь готовность позже.');
 const error=status==='failed'||status==='cancelled'?'Сервис не завершил генерацию. Попробуй другой запрос.':null;
 if(status!==row.status||url!==(row.result_url||null)||error!==(row.error||null))await env.DB.prepare('UPDATE media_jobs SET status=?,result_url=?,error=? WHERE id=? AND user_id=?').bind(status,url,error,row.id,row.user_id).run();
 if(status==='completed')await env.DB.prepare('INSERT OR IGNORE INTO usage_events(id,user_id,kind) VALUES(?,?,?)').bind('media:'+row.id,row.user_id,row.kind).run();
 return publicMediaJob({...row,status,result_url:url,error});
}
function choosePremiumMedia(body,file){
 const kind=body.kind,quality=body.quality;
 if(quality===undefined)return {model:String(body.model||''),resolution:null};
 if(kind==='image'){
  if(['fhd','qhd','uhd'].includes(quality)){
   const resolution=quality==='uhd'||quality==='qhd'&&body.ratio==='1:1'?'4K':'2K';
   return {model:resolution==='4K'||/текст|надпис|логотип|шрифт|инфограф|text|logo|typography/i.test(String(body.prompt||''))?'google/gemini-3-pro-image-preview':'google/gemini-3.1-flash-image-preview',resolution};
  }
  if(!['fast','high','max'].includes(quality))throw Error('Выбери качество фото.');
  const complex=!!file||/текст|надпис|логотип|шрифт|портрет|идентич|сохрани|дизайн|инфограф|text|logo|portrait/i.test(String(body.prompt||''));
  return {model:quality==='max'||quality==='high'&&complex?'google/gemini-3-pro-image-preview':'google/gemini-3.1-flash-image-preview',resolution:{fast:'1K',high:'2K',max:'4K'}[quality]};
 }
 if(kind==='video'){
  if(quality==='fhd')return {model:'bytedance/seedance-2',resolution:'1080p'};
  if(['qhd','uhd'].includes(quality)){
   if(!['16:9','9:16'].includes(body.ratio))throw Error('Для видео 2K и 4K выбери широкий или вертикальный формат.');
   return {model:'gemini-omni-video',resolution:'4k'};
  }
  if(!['fast','high'].includes(quality))throw Error('Выбери качество видео.');
  return {model:quality==='high'?'bytedance/seedance-2':'bytedance/seedance-2-fast',resolution:quality==='high'?'720p':'480p'};
 }
 throw Error('Выбери фото или видео.');
}
async function getMediaHistory(db,userId,kind){
 if(!['image','video'].includes(kind))throw Error('Выбери фото или видео.');
 const result=await db.prepare('SELECT * FROM media_jobs WHERE user_id=? AND kind=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(userId,kind).all();
 return {items:(result.results||[]).map(row=>{const expired=Date.now()-Date.parse(row.created_at.replace(' ','T')+'Z')>7*86400000;const data=publicMediaJob(row);if(expired)delete data.url;return {...data,expired};})};
}
async function createPremiumMedia(env,userId,body,file,identityFile=null){
 if(!env.POLZA_API_KEY||!env.DB)throw Error('Платный сервис ИИ пока недоступен.');
 const selection=choosePremiumMedia(body,file),model=selection.model,config=PREMIUM_MEDIA_MODELS[model],kind=body.kind;
 if(!config||config.kind!==kind)throw Error('Выбери доступную модель фото или видео.');
 const prompt=String(body.prompt||'').trim(),ratio=String(body.ratio||'1:1'),id=String(body.requestId||'');
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw Error('Неверный номер запроса.');
 if(prompt.length<3||prompt.length>1200)throw Error('Описание должно содержать от 3 до 1200 символов.');
 if(!['1:1','9:16','16:9'].includes(ratio))throw Error('Выбери формат изображения.');
 const duration=Number(body.duration||4);if(kind==='video'&&![4,6,8].includes(duration))throw Error('Выбери длительность видео.');
 if(file&&(typeof file==='string'||!file.size||file.size>(kind==='image'?20:25)*1024*1024||!(kind==='image'?['image/jpeg','image/png','image/webp']:['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']).includes(file.type)))throw Error('Файл не поддерживается или слишком большой.');
 if(identityFile&&(kind!=='video'||typeof identityFile==='string'||!identityFile.size||identityFile.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(identityFile.type)))throw Error('Добавь фото лица JPEG, PNG или WebP до 10 МБ.');
 if((file?.size||0)+(identityFile?.size||0)>25*1024*1024)throw Error('Общий размер файлов — до 25 МБ.');
 const existing=await env.DB.prepare('SELECT * FROM media_jobs WHERE id=? AND user_id=?').bind(id,userId).first();
 if(existing)return publicMediaJob(existing);
 const groupId=String(body.groupId||id);
 if(groupId!==id){const root=await env.DB.prepare('SELECT * FROM media_jobs WHERE id=? AND user_id=?').bind(groupId,userId).first();if(!root||root.kind!==kind)throw Error('Исходный проект не найден. Открой его в своих проектах.');}
 // Reserve before the paid request. Repeated clicks never create another provider job.
 const reserve=await env.DB.prepare("INSERT OR IGNORE INTO media_jobs(id,user_id,kind,model,status) SELECT ?,?,?,?,'creating' WHERE (SELECT COUNT(*) FROM media_jobs WHERE user_id=? AND status IN ('creating','pending','processing') AND created_at>datetime('now','-1 day'))<2").bind(id,userId,kind,model,userId).run();
 if(!reserve.meta?.changes){const row=await env.DB.prepare('SELECT * FROM media_jobs WHERE id=? AND user_id=?').bind(id,userId).first();if(row)return publicMediaJob(row);throw Error('Уже обрабатываются два проекта. Дождись готовности.');}
 const row={id,user_id:userId,kind,model,status:'creating',group_id:groupId};
 try{
  await env.DB.prepare('UPDATE media_jobs SET group_id=? WHERE id=? AND user_id=?').bind(groupId,id,userId).run();
  let region=null;
  if(body.region){try{region=typeof body.region==='string'?JSON.parse(body.region):body.region;}catch{throw Error('Заново выдели область фотографии.');}if(kind!=='image'||!Array.isArray(region.points)||region.points.length<3||region.points.length>300||region.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))throw Error('Заново выдели область фотографии.');}
  if(region){const points=region.points.map(p=>({x:p.x,y:p.y})),xs=points.map(p=>p.x),ys=points.map(p=>p.y),bounds={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};if(bounds.w<.015||bounds.h<.015)throw Error('Выдели область чуть крупнее.');region={points,bounds};}
  row.prompt=prompt;row.quality=String(body.quality||'fast');row.ratio=ratio;row.duration=duration;row.region_json=region?JSON.stringify(region):null;
  await env.DB.prepare('UPDATE media_jobs SET prompt=?,quality=?,ratio=?,duration=?,region_json=? WHERE id=? AND user_id=?').bind(prompt,row.quality,ratio,duration,row.region_json,id,userId).run();
  const input={prompt,aspect_ratio:ratio};
  if(kind==='image'){input.image_resolution=selection.resolution||config.resolution;input.output_format=file?.type==='image/png'||/прозрач|transparent|alpha|\bpng\b|без фона|удали(?:ть)? фон|убери фон/i.test(prompt)?'png':'jpeg';}
  else{input.duration=String(duration);input.resolution=selection.resolution||config.resolution;if(model!=='gemini-omni-video')input.generate_audio=false;}
  if(file){const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));input[file.type.startsWith('image/')?'images':'videos']=[{type:'base64',data:'data:'+file.type+';base64,'+btoa(binary)}];}
  if(identityFile){const bytes=new Uint8Array(await identityFile.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));input.images=[...(input.images||[]),{type:'base64',data:'data:'+identityFile.type+';base64,'+btoa(binary)}];}
  const data=await polzaMediaRequest(env,'',{model,input,async:true,user:'anis-'+userId});
  if(typeof data.id!=='string'||!/^[\w-]{1,200}$/.test(data.id))throw Error('Сервис не подтвердил номер проекта.');
  await env.DB.prepare('UPDATE media_jobs SET provider_id=? WHERE id=? AND user_id=?').bind(data.id,id,userId).run();
  return await updatePremiumJob(env,row,data);
 }catch(error){
  // A network timeout can occur after the provider accepted a paid request. Never retry it automatically.
  const message=error.name==='AbortError'||error instanceof TypeError?'Не удалось подтвердить создание. Новый платный запрос автоматически не отправлен. Проверь историю Polza.':error.message;
  await env.DB.prepare("UPDATE media_jobs SET status='failed',error=? WHERE id=? AND user_id=?").bind(message,id,userId).run();
  error.message=message;throw error;
 }
}
async function readPremiumMedia(env,userId,id){
 const row=await env.DB.prepare('SELECT * FROM media_jobs WHERE id=? AND user_id=?').bind(String(id||''),userId).first();
 if(!row){const error=Error('Проект не найден. Можно создать новый.');error.status=404;throw error;}
 if(['completed','failed','cancelled'].includes(row.status))return publicMediaJob(row);
 if(!row.provider_id)return {...publicMediaJob(row),error:'Подтверждаем создание проекта. Не запускай его повторно.'};
 const data=await polzaMediaRequest(env,'/'+encodeURIComponent(row.provider_id));return updatePremiumJob(env,row,data);
}

// Fetch only an authenticated user's stored result, never a client-supplied URL.
async function serveMediaFile(env,userId,jobId,headers){
 const row=await env.DB.prepare('SELECT kind,status,result_url FROM media_jobs WHERE id=? AND user_id=?').bind(String(jobId||''),userId).first();
 if(!row){const error=Error('Работа не найдена.');error.status=404;throw error;}
 if(row.status!=='completed'||!row.result_url){const error=Error('Файл ещё не готов.');error.status=409;throw error;}
 const url=new URL(row.result_url);
 if(url.origin!=='https://s3.polza.ai'||url.username||url.password)throw Error('Адрес результата не поддерживается.');
 const response=await fetch(url.href,{redirect:'error',signal:AbortSignal.timeout(90000),cf:{cacheEverything:true,cacheTtlByStatus:{'200-299':86400,'400-599':-1}}});
 if(!response.ok){await response.body?.cancel();const error=Error('Не удалось загрузить готовый файл. Попробуй ещё раз.');error.status=502;throw error;}
 const type=response.headers.get('Content-Type')||'application/octet-stream';
 if(!/^(image|video)\//i.test(type)&&!/^application\/octet-stream/i.test(type)){await response.body?.cancel();throw Error('Сервис вернул некорректный файл.');}
 return new Response(response.body,{headers:{...headers,'Content-Type':type,'X-Content-Type-Options':'nosniff'}});
}

async function recordMediaUsage(db,userId,kind){
  if(!db)return;
  try{await db.prepare('INSERT INTO usage_events(id,user_id,kind) VALUES(?,?,?)').bind(crypto.randomUUID(),userId,kind).run();}
  catch{console.error('Usage event could not be recorded',{kind});}
}

async function getUsageStats(db, userId, requestedDays, requestedOffset, nowMs = Date.now()) {
  const allTime=requestedDays==='all';
  const requestedPeriod=Number(requestedDays)===30?30:7;
  const parsedOffset=Number(requestedOffset);
  const offset=Number.isInteger(parsedOffset)&&Math.abs(parsedOffset)<=840?parsedOffset:0;
  const dayMs=86400000;
  const todayLocal=Math.floor((nowMs+offset*60000)/dayMs)*dayMs;
  let startLocal=todayLocal-(requestedPeriod-1)*dayMs;
  const startUTC=allTime?'0001-01-01 00:00:00':new Date(startLocal-offset*60000).toISOString().slice(0,19).replace('T',' ');
  const endUTC=new Date(todayLocal+dayMs-offset*60000).toISOString().slice(0,19).replace('T',' ');
  const [rows,events]=await db.batch([
    db.prepare("SELECT date(created_at, ?) AS day, COUNT(*) AS questions FROM chat_messages WHERE user_id=? AND role='user' AND created_at>=? AND created_at<? GROUP BY day ORDER BY day")
      .bind(offset+' minutes',userId,startUTC,endUTC),
    db.prepare("SELECT date(created_at, ?) AS day,kind,COUNT(*) AS count FROM usage_events WHERE user_id=? AND created_at>=? AND created_at<? GROUP BY day,kind")
      .bind(offset+' minutes',userId,startUTC,endUTC)
  ]);
  const counts=new Map((rows.results||[]).filter(row=>row.day).map(row=>[row.day,Number(row.questions)]));
  const media={image:0,video:0,voice:0},mediaByDay=new Map();
  for(const row of events.results||[]){
    if(!row.day||!Object.hasOwn(media,row.kind))continue;
    media[row.kind]+=Number(row.count);
    if(!mediaByDay.has(row.day))mediaByDay.set(row.day,{image:0,video:0,voice:0});
    mediaByDay.get(row.day)[row.kind]=Number(row.count);
  }
  if(allTime){
    const dates=[...counts.keys(),...mediaByDay.keys()].sort();
    startLocal=dates.length?Math.min(todayLocal,Date.parse(dates[0]+'T00:00:00Z')):todayLocal;
  }
  const days=Math.round((todayLocal-startLocal)/dayMs)+1;
  // Bound chart and table size without truncating lifetime totals.
  const bucketDays=allTime?Math.max(1,Math.ceil(days/30)):1;
  const series=Array.from({length:Math.ceil(days/bucketDays)},(_,i)=>{
    const start=startLocal+i*bucketDays*dayMs,end=Math.min(todayLocal,start+(bucketDays-1)*dayMs);
    return {date:new Date(start).toISOString().slice(0,10),endDate:new Date(end).toISOString().slice(0,10),questions:0,media:{image:0,video:0,voice:0}};
  });
  const bucketFor=date=>Math.floor((Date.parse(date+'T00:00:00Z')-startLocal)/dayMs/bucketDays);
  for(const [date,questions] of counts){const bucket=series[bucketFor(date)];if(bucket)bucket.questions+=questions;}
  for(const [date,values] of mediaByDay){const bucket=series[bucketFor(date)];if(bucket)for(const kind of Object.keys(media))bucket.media[kind]+=values[kind];}
  let streak=0,day=todayLocal;
  if(!counts.get(new Date(day).toISOString().slice(0,10)))day-=dayMs;
  for(;day>=startLocal&&counts.get(new Date(day).toISOString().slice(0,10));day-=dayMs)streak++;
  return {period:allTime?'all':requestedPeriod,days,granularity:bucketDays>1?'range':'day',series,media,questions:[...counts.values()].reduce((n,c)=>n+c,0),activeDays:counts.size,streak};
}

// Server-owned prices; never accept coin quantities or prices from the client.
const STAR_PACKS = Object.freeze([
  { id: 'coins100', coins: 100, stars: 99 },
  { id: 'coins500', coins: 500, stars: 499 },
  { id: 'coins1000', coins: 1000, stars: 999 }
]);
const PAYMENT_WEBHOOK_URL = 'https://anniveo-ai-api.yaylaevismail.workers.dev/telegram/payments';

async function telegramPaymentAPI(env, method, data = {}) {
  const response = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data), signal: AbortSignal.timeout(7000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error('Telegram payment API failed: ' + method);
  return result.result;
}

async function paymentWebhookSecret(env) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.TELEGRAM_BOT_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode('ANNIVEO payment webhook v1')));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function readWallet(db, userId) {
  const balance = await db.prepare('SELECT COALESCE(SUM(CASE WHEN COALESCE(r.refunded_at,f.refunded_at) IS NULL THEN r.coins ELSE 0 END),0) AS balance FROM payment_receipts r LEFT JOIN payment_refunds f ON f.charge_id=r.charge_id AND f.order_id=r.order_id WHERE r.user_id=?').bind(userId).first();
  const history = await db.prepare('SELECT r.order_id,r.coins,r.stars,r.paid_at,COALESCE(r.refunded_at,f.refunded_at) AS refunded_at FROM payment_receipts r LEFT JOIN payment_refunds f ON f.charge_id=r.charge_id AND f.order_id=r.order_id WHERE r.user_id=? ORDER BY r.paid_at DESC LIMIT 30').bind(userId).all();
  return { balance: Number(balance.balance), packs: STAR_PACKS, history: history.results };
}

async function createWalletInvoice(env, userId, packId) {
  const pack = STAR_PACKS.find(p => p.id === packId);
  if (!pack) return { error: 'Выбери пакет Аниумов', status: 400 };
  const webhook = await telegramPaymentAPI(env, 'getWebhookInfo');
  if (webhook.url !== PAYMENT_WEBHOOK_URL) return { error: 'Приём платежей временно недоступен. Напиши в поддержку.', status: 503 };
  const now = Math.floor(Date.now() / 1000);
  // Limit accidental double taps without trusting browser state.
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM payment_orders WHERE user_id=? AND created_at>?').bind(userId, now - 60).first();
  if (recent.n >= 5) return { error: 'Подожди минуту перед новым счётом', status: 429 };
  const id = 'av1_' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO payment_orders(id,user_id,coins,stars,created_at,expires_at) VALUES(?,?,?,?,?,?)')
    .bind(id, userId, pack.coins, pack.stars, now, now + 1800).run();
  const url = await telegramPaymentAPI(env, 'createInvoiceLink', {
    title: 'Аниумы: ' + pack.coins, description: 'Пополнение баланса ANIS AI. Пакет «Аниумы»: ' + pack.coins + '. Поддержка: @ISMAILCHIIK.',
    payload: id, provider_token: '', currency: 'XTR', prices: [{ label: 'Аниумы: ' + pack.coins, amount: pack.stars }]
  });
  return { url, orderId: id, coins: pack.coins, stars: pack.stars };
}

async function handlePaymentUpdate(update, env) {
  const db = env.DB;
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const order = await db.prepare('SELECT * FROM payment_orders WHERE id=?').bind(q.invoice_payload).first();
    let ok = !!order && order.user_id === String(q.from.id) && q.currency === 'XTR' && q.total_amount === order.stars && order.expires_at > Date.now()/1000 && order.status !== 'paid';
    if (ok) {
      const reserve = await db.prepare("UPDATE payment_orders SET precheckout_id=?,status='checking' WHERE id=? AND (precheckout_id IS NULL OR precheckout_id=?) AND status!='paid'")
        .bind(q.id, order.id, q.id).run();
      ok = reserve.meta.changes === 1;
    }
    await telegramPaymentAPI(env, 'answerPreCheckoutQuery', {
      pre_checkout_query_id: q.id, ok,
      ...(!ok ? { error_message: 'Счёт уже использован или устарел. Открой баланс и создай новый.' } : {})
    });
    return;
  }
  const message = update.message;
  if (!message) return;
  const payment = message.successful_payment;
  if (payment) {
    const order = await db.prepare('SELECT * FROM payment_orders WHERE id=?').bind(payment.invoice_payload).first();
    if (!order || order.user_id !== String(message.from?.id) || payment.currency !== 'XTR' || payment.total_amount !== order.stars || !payment.telegram_payment_charge_id) {
      console.error('Rejected mismatched payment update', { updateId: update.update_id });
      return;
    }
    // One atomic batch. Unique charge AND unique order prevent repeat crediting.
    await db.batch([
      db.prepare('INSERT INTO payment_receipts(charge_id,order_id,user_id,coins,stars,paid_at) VALUES(?,?,?,?,?,?) ON CONFLICT(charge_id) DO NOTHING')
        .bind(payment.telegram_payment_charge_id, order.id, order.user_id, order.coins, order.stars, message.date || Math.floor(Date.now()/1000)),
      db.prepare("UPDATE payment_orders SET status='paid' WHERE id=?").bind(order.id)
    ]);
    return;
  }
  const refund = message.refunded_payment;
  if (refund && refund.currency === 'XTR') {
    // Refunds may arrive before the successful-payment retry; retain them independently.
    await db.prepare('INSERT INTO payment_refunds(charge_id,order_id,refunded_at) SELECT ?,id,? FROM payment_orders WHERE id=? AND stars=? ON CONFLICT(charge_id) DO NOTHING')
      .bind(refund.telegram_payment_charge_id, message.date || Math.floor(Date.now()/1000), refund.invoice_payload, refund.total_amount).run();
    return;
  }
  if (/^\/paysupport(?:@\w+)?(?:\s|$)/i.test(message.text || '') && message.chat?.type === 'private') {
    await telegramPaymentAPI(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: 'Помощь с оплатой ANIS AI: @ISMAILCHIIK. Пришли номер заказа из истории баланса и описание проблемы. Не присылай пароли или коды. По вопросам возврата также напиши в поддержку.'
    });
  }
}

async function handlePaymentWebhook(request, env) {
  const expected = await paymentWebhookSecret(env);
  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  let diff = supplied.length ^ expected.length;
  for (let i=0;i<expected.length;i++) diff |= expected.charCodeAt(i) ^ (supplied.charCodeAt(i)||0);
  if (diff || request.method !== 'POST') return new Response('Forbidden', { status: 403 });
  try {
    await handlePaymentUpdate(await request.json(), env);
    return Response.json({ ok: true });
  } catch {
    console.error('Payment webhook processing failed');
    return Response.json({ ok: false }, { status: 500 }); // Telegram retries; never acknowledge an uncommitted credit.
  }
}



const json = (data, status, headers) =>
  new Response(JSON.stringify(data), {
    status,
    headers
  });

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function verifyTelegram(initData, token) {
  if (!initData || !token) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));

  if (
    !hash ||
    !authDate ||
    Math.abs(Date.now() / 1000 - authDate) > 86400
  ) return null;

  if (!/^[a-f0-9]{64}$/i.test(hash)) return null;

  const dataCheck = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  const encoder = new TextEncoder();

  const secret = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const secretBytes = await crypto.subtle.sign(
    "HMAC",
    secret,
    encoder.encode(token)
  );

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(dataCheck)
    )
  );

  const expected = Array.from(signature)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  const actual = hash.toLowerCase();
  let mismatch = 0;

  for (let i = 0; i < 64; i++) {
    mismatch |=
      expected.charCodeAt(i) ^
      actual.charCodeAt(i);
  }

  if (mismatch !== 0) return null;

  try {
    const user = JSON.parse(
      params.get("user") || "null"
    );

    return user &&
      Number.isSafeInteger(user.id) &&
      user.id > 0
      ? String(user.id)
      : null;
  } catch {
    return null;
  }
}

function cleanHistory(items, limit = 12) {
  if (!Array.isArray(items)) return [];

  return items
    .slice(-limit)
    .filter(item =>
      item &&
      ["user", "assistant"].includes(item.role) &&
      typeof item.content === "string" &&
      item.content.length <= 4000
    )
    .map(item => ({
      role: item.role,
      content: item.content
    }));
}

async function getHistory(db, userId, limit = 40, threadId = 'legacy') {
  const rows = await db.prepare(
    "SELECT role, content FROM chat_messages " +
    "WHERE user_id = ? AND thread_id = ? ORDER BY id DESC LIMIT ?"
  ).bind(userId, threadId, limit).all();

  return (rows.results || []).reverse();
}

async function saveConversation(
  db,
  userId,
  requestId,
  message,
  answer,
  threadId = 'legacy'
) {
  await db.batch([
    db.prepare(
      "INSERT INTO chat_messages " +
      "(user_id, role, content, thread_id) " +
      "VALUES (?, 'user', ?, ?)"
    ).bind(userId, message, threadId),

    db.prepare(
      "INSERT INTO chat_messages " +
      "(user_id, role, content, thread_id) " +
      "VALUES (?, 'assistant', ?, ?)"
    ).bind(userId, answer, threadId),

    db.prepare("UPDATE chat_threads SET updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(userId,threadId),

    db.prepare(
      "UPDATE chat_requests " +
      "SET status = 'done', reply = ? " +
      "WHERE user_id = ? AND request_id = ?"
    ).bind(answer, userId, requestId)
  ]);
}

async function cleanupRequest(
  db,
  userId,
  requestId
) {
  if (!db || !userId || !requestId) return;

  try {
    await db.prepare(
      "DELETE FROM chat_requests " +
      "WHERE user_id = ? " +
      "AND request_id = ? " +
      "AND status = 'processing'"
    ).bind(userId, requestId).run();
  } catch (error) {
    console.error(
      "ANIS AI cleanup error",
      error.message
    );
  }
}

function isRetryable(error) {
  return (
    error.retryable ||
    error.name === "AbortError" ||
    error instanceof TypeError
  );
}

// При исчерпании баланса Polza переключаем запросы на Pollinations
// и на 5 минут пропускаем Polza, чтобы не тратить время на заведомо неудачные вызовы.
let polzaCooldownUntil = 0;
const POLZA_MODEL = "openai/gpt-4o-mini";
const POLZA_TIMEOUT_MS = 8000;
const POLLINATIONS_TIMEOUT_MS = 18000;
const POLLINATIONS_STREAM_TIMEOUT_MS = 18000;
const STREAM_FIRST_TOKEN_TIMEOUT_MS = 8000;
const STREAM_IDLE_TIMEOUT_MS = 25000;

function polzaAvailable(env) {
  return !!env.POLZA_API_KEY && Date.now() >= polzaCooldownUntil;
}

async function fetchPolza(messages, env, streaming, controller) {
  const response = await fetch("https://polza.ai/api/v1/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: "Bearer " + env.POLZA_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: POLZA_MODEL,
      messages,
      max_tokens: 900,
      stream: streaming
    })
  });

  if (!response.ok) {
    const status = response.status;
    await response.body?.cancel();
    if ([401, 402, 403, 404].includes(status)) {
      polzaCooldownUntil = Date.now() + 5 * 60 * 1000;
    } else if (status === 429) {
      polzaCooldownUntil = Date.now() + 30 * 1000;
    }
    throw new Error("Polza HTTP " + status);
  }

  return response;
}

async function askPreferredAI(messages, env, mode) {
  if (polzaAvailable(env)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POLZA_TIMEOUT_MS);

    try {
      const response = await fetchPolza(messages, env, false, controller);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (typeof content !== "string" || !content.trim()) {
        throw new Error("Polza вернула пустой ответ");
      }

      return content.trim();
    } catch (error) {
      controller.abort();
      console.warn("Polza недоступна; переключаюсь на Pollinations", {
        mode,
        message: error.message
      });
    } finally {
      clearTimeout(timer);
    }
  }

  if (!env.POLLINATIONS_API_KEY) {
    throw new Error("Нет ключа Pollinations для резервного ответа");
  }

  return askAI(messages, env.POLLINATIONS_API_KEY, mode);
}


async function primeAIStream(response, controller, timeoutMs) {
  const reader = response.body.getReader();
  const queued = [];
  const decoder = new TextDecoder();
  let buffer = "";
  let firstTokenSeen = false;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const hasToken = eventText => {
    const lines = eventText
      .split("\n")
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart());
    if (!lines.length) return false;
    const raw = lines.join("\n").trim();
    if (!raw || raw === "[DONE]") return false;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return false;
    }
    if (data.error || data.choices?.[0]?.finish_reason === "error") {
      const error = data.error;
      throw new Error(
        (typeof error === "string" ? error : error?.message) ||
        "Провайдер завершил поток с ошибкой"
      );
    }
    const token = data.choices?.[0]?.delta?.content;
    return (typeof token === "string" && token.length > 0) ||
      (Array.isArray(token) && token.some(part => part?.type === "text" && part.text));
  };

  try {
    while (!firstTokenSeen) {
      const { done, value } = await reader.read();
      if (done) break;
      queued.push(value);
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const eventText = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (hasToken(eventText)) {
          firstTokenSeen = true;
          break;
        }
      }
    }

    if (!firstTokenSeen) throw new Error("Поток завершился до первого токена");

    const replay = new ReadableStream({
      async pull(target) {
        if (queued.length) {
          target.enqueue(queued.shift());
          return;
        }
        const { done, value } = await reader.read();
        if (done) {
          target.close();
          try { reader.releaseLock(); } catch {}
          return;
        }
        target.enqueue(value);
      },
      async cancel(reason) {
        controller.abort();
        try { await reader.cancel(reason); } catch {}
      }
    });

    return new Response(replay, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (error) {
    controller.abort();
    try { await reader.cancel(); } catch {}
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function openPreferredAIStream(messages, env, mode) {
  if (polzaAvailable(env)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POLZA_TIMEOUT_MS);

    try {
      const started = Date.now();
      const response = await fetchPolza(messages, env, true, controller);

      if (
        !response.body ||
        !(response.headers.get("content-type") || "").includes("text/event-stream")
      ) {
        throw new Error("Polza не поддержала потоковый ответ");
      }

      clearTimeout(timer);
      const primedResponse = await primeAIStream(
        response,
        controller,
        Math.max(1,STREAM_FIRST_TOKEN_TIMEOUT_MS-(Date.now()-started))
      );
      return { response: primedResponse, controller, attempt: 1, started };
    } catch (error) {
      controller.abort();
      console.warn("Поток Polza недоступен; переключаюсь на Pollinations", {
        mode,
        message: error.message
      });
    } finally {
      clearTimeout(timer);
    }
  }

  if (!env.POLLINATIONS_API_KEY) {
    throw new Error("Нет ключа Pollinations для резервного ответа");
  }

  return openAIStream(messages, env.POLLINATIONS_API_KEY, mode);
}

async function fetchAI(
  messages,
  apiKey,
  mode,
  streaming,
  controller
) {
  const response = await fetch(
    "https://gen.pollinations.ai/v1/chat/completions",
    {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-5.4-nano",
        messages,
        max_tokens: 900,
        stream: streaming
      })
    }
  );

  if (!response.ok) {
    await response.body?.cancel();
    const error = new Error(
      "Pollinations HTTP " + response.status
    );

    error.retryable =
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500;

    throw error;
  }

  return response;
}

async function askAI(messages, apiKey, mode) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      POLLINATIONS_TIMEOUT_MS
    );

    try {
      console.log("ANIS AI request", {
        mode,
        attempt,
        messageCount: messages.length,
        streaming: false
      });

      const response = await fetchAI(
        messages,
        apiKey,
        mode,
        false,
        controller
      );

      const data = await response.json();
      const answer =
        data.choices?.[0]?.message?.content;

      if (
        typeof answer !== "string" ||
        !answer.trim()
      ) {
        throw new Error("ИИ вернул пустой ответ");
      }

      console.log("ANIS AI success", {
        mode,
        attempt,
        durationMs: Date.now() - started
      });

      return answer.trim();

    } catch (error) {
      lastError = error;

      console.error("ANIS AI failure", {
        mode,
        attempt,
        durationMs: Date.now() - started,
        errorName: error.name,
        errorMessage: error.message
      });

      if (!isRetryable(error) || attempt === 2) {
        throw error;
      }

      await sleep(300);

    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ||
    new Error("Сервис ИИ недоступен");
}

// Открывает потоковый запрос к нейросети.
// Повторная попытка возможна до начала
// передачи ответа пользователю.
async function openAIStream(
  messages,
  apiKey,
  mode
) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const started = Date.now();

    // Ограничиваем ожидание первых данных.
    const timer = setTimeout(
      () => controller.abort(),
      POLLINATIONS_TIMEOUT_MS
    );

    try {
      console.log("ANIS AI request", {
        mode,
        attempt,
        messageCount: messages.length,
        streaming: true
      });

      const response = await fetchAI(
        messages,
        apiKey,
        mode,
        true,
        controller
      );

      if (!response.body) {
        throw new Error(
          "Pollinations не вернул поток"
        );
      }

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("text/event-stream")) {
        throw new Error(
          "Pollinations не поддержал потоковый ответ"
        );
      }

      clearTimeout(timer);
      const primedResponse = await primeAIStream(
        response,
        controller,
        Math.max(1,Math.min(STREAM_FIRST_TOKEN_TIMEOUT_MS,POLLINATIONS_TIMEOUT_MS-(Date.now()-started)))
      );

      return {
        response: primedResponse,
        controller,
        attempt,
        started
      };

    } catch (error) {
      clearTimeout(timer);
      controller.abort();
      lastError = error;

      console.error("ANIS AI failure", {
        mode,
        attempt,
        durationMs: Date.now() - started,
        errorName: error.name,
        errorMessage: error.message,
        streaming: true
      });

      if (!isRetryable(error) || attempt === 2) {
        throw error;
      }

      await sleep(300);
    }
  }

  throw lastError ||
    new Error("Сервис ИИ недоступен");
}

// Читает SSE-события от Pollinations AI.
async function readAIStream(
  response,
  onToken,
  controller
) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let answer = "";
  let completed = false;

  // Таймер бездействия между порциями данных.
  let timer;

  const resetTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => controller.abort(),
      STREAM_IDLE_TIMEOUT_MS
    );
  };

  const processEvent = eventText => {
    const dataLines = eventText
      .split("\n")
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart());

    if (!dataLines.length) return;

    const raw = dataLines.join("\n").trim();

    if (raw === "[DONE]") {
      completed = true;
      return;
    }

    if (!raw) return;

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.error) {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : data.error.message ||
            "Ошибка потоковой генерации"
      );
    }

    const choice = data.choices?.[0];

    let token = choice?.delta?.content;

    if (Array.isArray(token)) {
      token = token
        .filter(part => part?.type === "text")
        .map(part => part.text || "")
        .join("");
    }

    if (typeof token === "string" && token) {
      answer += token;
      onToken(token);
    }
  };

  try {
    resetTimer();

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      resetTimer();

      buffer += decoder
        .decode(value, { stream: true })
        .replace(/\r\n/g, "\n");

      let boundary;

      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const eventText = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        processEvent(eventText);
      }

      if (completed) break;
    }

    buffer += decoder.decode();

    if (buffer.trim() && !completed) {
      processEvent(buffer);
    }

    if (!answer.trim()) {
      throw new Error(
        "ИИ вернул пустой потоковый ответ"
      );
    }

    if (!completed) {
      throw new Error(
        "Поток ответа завершился преждевременно"
      );
    }

    return answer.trim();

  } finally {
    clearTimeout(timer);

    try {
      await reader.cancel();
    } catch {
      // Поток уже мог завершиться.
    }

    try {
      reader.releaseLock();
    } catch {
      // Блокировка уже снята.
    }
  }
}

function makeStreamResponse(
  aiStream,
  options,
  headers,
  ctx
) {
  const encoder = new TextEncoder();

  const streamHeaders = {
    ...headers,
    "Content-Type":
      "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
    "Cache-Control": "no-cache, no-transform"
  };

  const {
    anonymous,
    db,
    userId,
    requestId,
    message,
    started,
    threadId
  } = options;

  const output = new TransformStream();
  const writer = output.writable.getWriter();

  const send = async data => {
    await writer.write(
      encoder.encode(
        "data: " + JSON.stringify(data) + "\n\n"
      )
    );
  };

  const task = (async () => {
    let saved = false;
    let answer = "";
    let pendingTokens = [];

    const flushTokens = async () => {
      if (!pendingTokens.length) return;

      const tokens = pendingTokens;
      pendingTokens = [];

      for (const token of tokens) {
        await send({
          type: "token",
          content: token
        });
      }
    };

    try {
      await send({ type: "start" });

      const aiStarted = Date.now();

      // Чтение нейросети и отправка текста
      // происходят одновременно.
      const tokenWrites = [];

      answer = await readAIStream(
        aiStream.response,
        token => {
          const write = send({
            type: "token",
            content: token
          });

          tokenWrites.push(write);
        },
        aiStream.controller
      );

      await Promise.all(tokenWrites);

      if (!anonymous) {
        await saveConversation(
          db,
          userId,
          requestId,
          message,
          answer,
          threadId
        );

        saved = true;
      }

      const totalDuration = Date.now() - started;

      console.log("ANIS AI completed", {
        mode: anonymous ? "anonymous" : "normal",
        aiDurationMs: Date.now() - aiStarted,
        totalDurationMs: totalDuration,
        saved,
        streaming: true
      });

      await send({
        type: "done",
        reply: answer,
        durationMs: totalDuration
      });

    } catch (error) {
      console.error("ANIS AI stream error", {
        name: error.name,
        message: error.message,
        durationMs: Date.now() - started
      });

      if (!anonymous && !saved) {
        await cleanupRequest(
          db,
          userId,
          requestId
        );
      }

      try {
        await send({
          type: "error",
          error:
            "Ошибка генерации ответа. " +
            "Попробуй ещё раз."
        });
      } catch {
        // Клиент мог закрыть соединение.
      }

    } finally {
      aiStream.controller.abort();

      try {
        await writer.close();
      } catch {
        // Соединение могло быть закрыто.
      }
    }
  })();

  // Позволяет Cloudflare завершить работу,
  // даже если клиент временно отключился.
  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
  }

  return new Response(output.readable, {
    status: 200,
    headers: streamHeaders
  });
}


function mediaSize(ratio, image = false) {
  const sizes = image
    ? { "1:1":"1024x1024", "9:16":"1024x1792", "16:9":"1792x1024" }
    : {};
  return sizes[ratio] || "1024x1024";
}

function mediaErrorMessage(status) {
  if (status === 402) return "Закончился баланс генерации Pollinations";
  if (status === 401 || status === 403) return "Сервис генерации не принял ключ. Проверь подключение Pollinations";
  if (status === 429) return "Слишком много запросов. Подожди немного и попробуй снова";
  if (status >= 500) return "Сервис генерации временно недоступен. Попробуй ещё раз";
  return "Не удалось выполнить запрос к сервису генерации";
}

async function uploadReferenceVideo(file, apiKey, signal) {
  const upload = new FormData();
  upload.append("file", file, file.name || "reference-video.mp4");
  const response = await fetch("https://media.pollinations.ai/upload", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body: upload,
    signal
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Не удалось загрузить исходное видео для обработки");
  }
  const data = await response.json();
  if (typeof data.url !== "string" || !data.url.startsWith("https://media.pollinations.ai/")) {
    throw new Error("Сервис не вернул ссылку на исходное видео");
  }
  return data.url;
}

async function proxyImageEdit(form, apiKey) {
  const file = form.get("file");
  const prompt = String(form.get("prompt") || "").trim();
  const requestedModel = String(form.get("model") || "kontext");
  const model = requestedModel === "flux" ? "kontext" : requestedModel;
  const ratio = String(form.get("ratio") || "1:1");
  if (!file || typeof file === "string" || !file.size || !file.type.startsWith("image/")) {
    return { error: "Добавь фото в формате JPEG, PNG или WebP" };
  }
  if (file.size > 20 * 1024 * 1024) return { error: "Фото должно быть меньше 20 МБ" };
  if (!prompt || prompt.length > 1200) return { error: "Напиши, что изменить на фото (до 1200 символов)" };
  if (!["kontext", "gptimage", "seedream5"].includes(model)) {
    return { error: "Выбери модель, которая поддерживает редактирование фото" };
  }

  const upload = new FormData();
  upload.append("image", file, file.name || "photo.png");
  upload.append("prompt", prompt);
  upload.append("model", model);
  upload.append("size", mediaSize(ratio, true));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150000);
  try {
    const response = await fetch("https://gen.pollinations.ai/v1/images/edits", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
      body: upload,
      signal: controller.signal
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status, error: mediaErrorMessage(response.status) };
    }
    return { response };
  } finally {
    clearTimeout(timer);
  }
}

async function proxyVideo(form, apiKey) {
  const prompt = String(form.get("prompt") || "").trim();
  const requestedModel = String(form.get("model") || "bytedance/seedance-2.5");
  const ratio = String(form.get("ratio") || "16:9");
  const duration = Number(form.get("duration") || 4);
  const file = form.get("file");
  const hasReferenceVideo = file && typeof file !== "string" && file.size > 0;
  const model = hasReferenceVideo ? "bytedance/seedance-2.5" : requestedModel;
  const allowedModels = [
    "bytedance/seedance-2.5",
    "google/veo-3.1-fast",
    "bytedance/seedance-2.0-fast",
    "alibaba/wan-2.2-fast"
  ];
  if (!prompt || prompt.length > 1200) return { error: "Опиши видео (до 1200 символов)" };
  if (!allowedModels.includes(model)) return { error: "Выбрана неизвестная модель видео" };
  if (![4, 6, 8].includes(duration)) return { error: "Выбери длительность 4, 6 или 8 секунд" };
  if (file && typeof file !== "string" && file.size) {
    if (!file.type.startsWith("video/")) return { error: "Загрузи видеофайл" };
    if (file.size > 25 * 1024 * 1024) return { error: "Видео должно быть меньше 25 МБ" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 295000);
  try {
    let referenceUrl = "";
    if (file && typeof file !== "string" && file.size) {
      referenceUrl = await uploadReferenceVideo(file, apiKey, controller.signal);
    }
    const params = new URLSearchParams({
      model,
      duration: String(duration),
      aspectRatio: ratio
    });
    if (referenceUrl) params.set("reference_videos", referenceUrl);
    const endpoint = "https://gen.pollinations.ai/video/" +
      encodeURIComponent(prompt) + "?" + params.toString();
    const response = await fetch(endpoint, {
      headers: { Authorization: "Bearer " + apiKey },
      signal: controller.signal
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status, error: mediaErrorMessage(response.status) };
    }
    return { response };
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async scheduled(controller,env,ctx){ctx.waitUntil(processMediaNotifications(env));},
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/telegram/payments") return handlePaymentWebhook(request, env);
    const headers = {
      "Access-Control-Allow-Origin":
        (["https://anniveo-ai-app.pages.dev","https://anniveo-ai.pages.dev"].includes(request.headers.get('Origin'))?request.headers.get('Origin'):"https://anniveo-ai-app.pages.dev"),
      "Vary":"Origin",
      "Access-Control-Allow-Methods":
        "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type",
      "Content-Type":
        "application/json; charset=utf-8",
      "Access-Control-Max-Age": "600",
      "Cache-Control": "no-store"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "POST") {
      return json(
        { status: "ANIS AI работает" },
        200,
        headers
      );
    }

    const started = Date.now();

    let db = null;
    let userId = null;
    let requestId = null;
    let ownsRequest = false;
    let saved = false;

    try {
      if((request.headers.get("content-type")||"").includes("multipart/form-data")){
        const length=Number(request.headers.get("content-length")||0);
        if(length>26*1024*1024) return json({error:"Файл слишком большой (максимум 25 МБ)"},413,headers);
        const form=await request.formData();
        const voiceUser=await verifyTelegram(String(form.get("initData")||""),env.TELEGRAM_BOT_TOKEN);
        if(!voiceUser) return json({error:"Открой ANIS AI через Telegram"},401,headers);
        const multipartAction=String(form.get("action")||"");
        if(multipartAction==="media-create"){
          try{return json(await createPremiumMedia(env,voiceUser,Object.fromEntries(form),form.get('file'),form.get('identityFile')),200,headers);}
          catch(error){return json({error:error.message},error.status||400,headers);}
        }
        if(!env.POLLINATIONS_API_KEY) return json({error:"Ключ ИИ не настроен"},503,headers);
        const file=form.get("file");
        if(multipartAction==="image-edit"||multipartAction==="video"){
          const mediaUser=await verifyTelegram(String(form.get("initData")||""),env.TELEGRAM_BOT_TOKEN);
          if(!mediaUser) return json({error:"Открой ANIS AI через Telegram"},401,headers);
          if(multipartAction==="image-edit"&&(!file||typeof file==="string"||!file.size)) return json({error:"Добавь фото для изменения"},400,headers);
          const result=multipartAction==="image-edit"
            ?await proxyImageEdit(form,env.POLLINATIONS_API_KEY)
            :await proxyVideo(form,env.POLLINATIONS_API_KEY);
          if(result.error) return json({error:result.error},result.status||400,headers);
          const upstream=result.response;
          if(upstream.ok) await recordMediaUsage(env.DB,mediaUser,multipartAction==="video"?"video":"image");
          const mediaHeaders=new Headers(headers);
          mediaHeaders.set("Content-Type",multipartAction==="image-edit"
            ?"application/json; charset=utf-8"
            :(upstream.headers.get("content-type")||"video/mp4"));
          mediaHeaders.set("Cache-Control","no-store");
          return new Response(upstream.body,{status:upstream.status,headers:mediaHeaders});
        }
        if(multipartAction!=="transcribe") return json({error:"Неизвестное действие"},400,headers);
        if(!file||typeof file==="string"||!file.size||file.size>20*1024*1024){
          return json({error:"Запись пустая или слишком большая"},400,headers);
        }
        const upload=new FormData();
        upload.append("file",file,file.name||"voice.webm");
        upload.append("model","openai/whisper-large-v3");
        upload.append("language","ru");
        upload.append("prompt","ANIS AI.");
        upload.append("response_format","json");
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),60000);
        try{
          const response=await fetch("https://gen.pollinations.ai/v1/audio/transcriptions",{
            method:"POST",headers:{Authorization:"Bearer "+env.POLLINATIONS_API_KEY},
            body:upload,signal:controller.signal
          });
          if(!response.ok){
            await response.body?.cancel();
            console.error("ANIS AI transcription failed",{providerStatus:response.status});
            return json({error:response.status===403
              ?"Голосовой режим пока не подключён"
              :response.status===402
                ?"Закончился лимит сервиса распознавания речи"
                :"Не удалось распознать речь. Попробуй ещё раз"},
              response.status===403?403:response.status===402?402:502,headers);
          }
          const data=await response.json();
          const text=typeof data.text==="string"?data.text.trim():"";
          if(!text) return json({error:"Речь не распознана. Попробуй ещё раз"},422,headers);
          const usage=recordMediaUsage(env.DB,voiceUser,"voice");
          if(ctx?.waitUntil)ctx.waitUntil(usage);else await usage;
          return json({text},200,headers);
        }finally{clearTimeout(timer);}
      }

      const body = await request.json();
      const action = body.action || "chat";

      userId = await verifyTelegram(
        String(body.initData || ""),
        env.TELEGRAM_BOT_TOKEN
      );

      if (!userId) {
        return json(
          {
            error:
              "Открой ANIS AI через Telegram"
          },
          401,
          headers
        );
      }

      if(['chat-thread-list','chat-thread-create','chat-thread-rename','notification-get','notification-set','prompt-improve'].includes(action)){
        if(!env.DB)return json({error:'Сервис временно недоступен. Попробуй позже.'},503,headers);
        try{
          const data=action.startsWith('chat-thread-')?await handleChatThreadAction(env.DB,userId,body):action==='notification-get'?await readNotificationPreference(env.DB,userId):action==='notification-set'?await setNotificationPreference(env.DB,userId,body.enabled):await improveCreationPrompt(env,body);
          return json(data,200,headers);
        }catch(error){return json({error:error.message},error.status||400,headers);}
      }
      if(action==='media-file'){
        if(!env.DB)return json({error:'Файлы временно недоступны'},503,headers);
        try{return await serveMediaFile(env,userId,body.jobId,headers);}
        catch(error){return json({error:error.message},error.status||502,headers);}
      }
      if(action==="media-history"){
        if(!env.DB)return json({error:'История временно недоступна'},503,headers);
        try{return json(await getMediaHistory(env.DB,userId,body.kind),200,headers);}catch(error){return json({error:error.message},400,headers);}
      }
      if(action==="media-config")return json({premium:!!env.POLZA_API_KEY},200,headers);
      if(action==="media-status"||action==="media-create"){
        try{return json(action==="media-status"?await readPremiumMedia(env,userId,body.jobId):await createPremiumMedia(env,userId,body,null),200,headers);}
        catch(error){return json({error:error.message},error.status||400,headers);}
      }
      if (action === "usage-stats") {
        if (!env.DB) return json({error:"Статистика временно недоступна"},503,headers);
        return json(await getUsageStats(env.DB,userId,body.days,body.utcOffsetMinutes),200,headers);
      }
      if (action === "wallet") return json(await readWallet(env.DB, userId), 200, headers);
      if (action === "wallet-invoice") {
        const result = await createWalletInvoice(env, userId, String(body.packId || ""));
        return json(result, result.status || 200, headers);
      }

      if (action === "speak") {
        if (!env.POLLINATIONS_API_KEY) {
          return json({ error: "Голосовой сервис не подключён" }, 503, headers);
        }
        const text = String(body.text || "").trim();
        if (!text || text.length > 3000) {
          return json({ error: "Текст для озвучки должен быть от 1 до 3000 символов" }, 400, headers);
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch("https://gen.pollinations.ai/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + env.POLLINATIONS_API_KEY,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "tts-1",
              input: text,
              voice: "shimmer",
              response_format: "mp3"
            }),
            signal: controller.signal
          });
          if (!response.ok) {
            await response.body?.cancel();
            console.error("ANIS AI speech failed", { providerStatus: response.status });
            return json({ error: "Не удалось озвучить ответ" }, 502, headers);
          }
          const audioHeaders = new Headers(headers);
          audioHeaders.set("Content-Type", response.headers.get("content-type") || "audio/mpeg");
          return new Response(response.body, { status: 200, headers: audioHeaders });
        } finally {
          clearTimeout(timer);
        }
      }

      if (action === "image") {
        if (!env.POLLINATIONS_API_KEY) return json({error:"Ключ ИИ не настроен"},503,headers);
        const prompt=String(body.prompt||"").trim();
        const model=String(body.model||"flux");
        const ratio=String(body.ratio||"1:1");
        if(!prompt||prompt.length>1200) return json({error:"Опиши изображение (до 1200 символов)"},400,headers);
        if(!["flux","gptimage","seedream5","kontext"].includes(model)) return json({error:"Выбрана неизвестная модель изображения"},400,headers);
        const response=await fetch("https://gen.pollinations.ai/v1/images/generations",{
          method:"POST",
          headers:{Authorization:"Bearer "+env.POLLINATIONS_API_KEY,"Content-Type":"application/json"},
          body:JSON.stringify({model,prompt,size:mediaSize(ratio,true),response_format:"b64_json"})
        });
        if(!response.ok){
          await response.body?.cancel();
          return json({error:mediaErrorMessage(response.status)},response.status===402?402:502,headers);
        }
        await recordMediaUsage(env.DB,userId,"image");
        return new Response(response.body,{status:200,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});
      }

      if (action === "video") {
        if (!env.POLLINATIONS_API_KEY) return json({error:"Ключ ИИ не настроен"},503,headers);
        const videoForm=new FormData();
        for(const key of ["prompt","model","ratio","duration"]) videoForm.set(key,String(body[key]??""));
        const result=await proxyVideo(videoForm,env.POLLINATIONS_API_KEY);
        if(result.error) return json({error:result.error},result.status||400,headers);
        if(result.response.ok) await recordMediaUsage(env.DB,userId,"video");
        const mediaHeaders=new Headers(headers);
        mediaHeaders.set("Content-Type",result.response.headers.get("content-type")||"video/mp4");
        return new Response(result.response.body,{status:result.response.status,headers:mediaHeaders});
      }

      if (action === "history") {
        if (!env.DB) {
          return json(
            {
              error:
                "База данных не подключена"
            },
            503,
            headers
          );
        }

        const messages = await getHistory(
          env.DB,
          userId,
          40,
          await requireChatThread(env.DB,userId,body.threadId)
        );

        return json(
          { messages },
          200,
          headers
        );
      }

      const anonymous = action === "anonymous";

      if (!anonymous && action !== "chat") {
        return json(
          { error: "Неизвестное действие" },
          400,
          headers
        );
      }

      if (!anonymous && !env.DB) {
        return json(
          {
            error:
              "База данных не подключена"
          },
          503,
          headers
        );
      }

      if (!env.POLLINATIONS_API_KEY && !env.POLZA_API_KEY) {
        return json(
          { error: "Ключ ИИ не настроен" },
          503,
          headers
        );
      }

      const message = String(
        body.message || ""
      ).trim();

      if (!message || message.length > 4000) {
        return json(
          {
            error:
              "Недопустимая длина сообщения"
          },
          400,
          headers
        );
      }

      // Потоковый режим включается только
      // если интерфейс явно передал stream: true.
      const streaming = body.stream === true;

      let history = [];
      const threadId=anonymous?'legacy':await requireChatThread(env.DB,userId,body.threadId);

      if (anonymous) {
        history = cleanHistory(
          body.messages,
          12
        );

      } else {
        db = env.DB;

        requestId = String(
          body.requestId || ""
        );

        if (
          !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)
        ) {
          return json(
            {
              error:
                "Требуется идентификатор запроса"
            },
            400,
            headers
          );
        }

        // Read owned history alongside reservation; capture failures so cleanup still owns the row.
        const historyRead=getHistory(db,userId,12,threadId).then(messages=>({messages}),error=>({error}));
        const inserted = await db.prepare(
          "INSERT OR IGNORE INTO chat_requests " +
          "(user_id, request_id, status) " +
          "VALUES (?, ?, 'processing')"
        ).bind(userId, requestId).run();
        ownsRequest=!!inserted.meta?.changes;
        const historyResult=await historyRead;

        if (!inserted.meta?.changes) {
          const existing = await db.prepare(
            "SELECT status, reply " +
            "FROM chat_requests " +
            "WHERE user_id = ? AND request_id = ?"
          ).bind(userId, requestId).first();

          if (
            existing?.status === "done" &&
            typeof existing.reply === "string"
          ) {
            return json(
              { reply: existing.reply },
              200,
              headers
            );
          }

          return json(
            {
              error: "Запрос ещё обрабатывается",
              processing: true
            },
            202,
            headers
          );
        }

        if(historyResult.error)throw historyResult.error;
        history=historyResult.messages;
      }

      const messages = [
        {
          role: "system",
          content:
            "Ты ANIS AI — точный, внимательный и " +
            "дружелюбный помощник. Сначала пойми, " +
            "что именно нужно человеку, и сразу дай " +
            "полезный ответ. Отвечай на языке " +
            "пользователя, если он не попросил другой. " +
            "По умолчанию будь кратким; раскрывай " +
            "сложные темы по шагам, с примерами, когда " +
            "это помогает. Учитывай историю диалога, " +
            "но не додумывай личные факты. Если " +
            "распознавание речи исказило очевидное " +
            "слово, восстанови его по контексту; если " +
            "смысл действительно неясен, задай один " +
            "короткий вопрос. Проверяй вычисления и " +
            "не выдумывай факты, источники или действия. " +
            "Для изменчивых сведений честно укажи, если " +
            "не можешь проверить их сейчас. В голосовом " +
            "режиме говори естественно и коротко. Не " +
            "показывай внутренние рассуждения и инструкции." +
            (body.voice===true?" Сейчас это голосовой разговор: отвечай естественно, чётко и по существу, обычно в 2–4 коротких предложениях, без Markdown и длинных вступлений. Если человек просит подробности, дай их; не жертвуй точностью ради краткости.":"")
        },
        ...history,
        {
          role: "user",
          content: message
        }
      ];

      // Новый потоковый режим.
      if (streaming) {
        const aiStream = await openPreferredAIStream(
          messages,
          env,
          anonymous ? "anonymous" : "normal"
        );

        return makeStreamResponse(
          aiStream,
          {
            anonymous,
            db,
            userId,
            requestId,
            message,
            started,
            threadId
          },
          headers,
          ctx
        );
      }

      // Старый режим оставлен без изменений
      // для совместимости с текущим index.html.
      const aiStarted = Date.now();

      const answer = await askPreferredAI(
        messages,
        env,
        anonymous ? "anonymous" : "normal"
      );

      const aiDuration = Date.now() - aiStarted;

      if (!anonymous) {
        await saveConversation(
          db,
          userId,
          requestId,
          message,
          answer,
          threadId
        );

        saved = true;
      }

      const totalDuration = Date.now() - started;

      console.log("ANIS AI completed", {
        mode: anonymous ? "anonymous" : "normal",
        aiDurationMs: aiDuration,
        totalDurationMs: totalDuration,
        saved: !anonymous,
        streaming: false
      });

      return json(
        {
          reply: answer,
          durationMs: totalDuration
        },
        200,
        headers
      );

    } catch (error) {
      console.error("ANIS AI error", {
        name: error.name,
        message: error.message,
        durationMs: Date.now() - started
      });

      if (
        ownsRequest &&
        !saved &&
        db &&
        userId &&
        requestId
      ) {
        await cleanupRequest(
          db,
          userId,
          requestId
        );
      }

      return json(
        {
          error:
            "Временная ошибка сервера. " +
            "Попробуй ещё раз."
        },
        503,
        headers
      );
    }
  }
};

