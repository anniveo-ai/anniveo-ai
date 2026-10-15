const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const raw=new DatabaseSync(':memory:');
raw.exec('CREATE TABLE chat_messages(user_id TEXT,role TEXT,content TEXT,created_at TEXT);');
raw.exec(fs.readFileSync('usage.sql','utf8'));
const db={async batch(statements){return Promise.all(statements.map(s=>s.all()));},prepare(sql){return{bind(...params){return{async all(){return{results:raw.prepare(sql).all(...params)}}}}}}};
const insert=raw.prepare('INSERT INTO chat_messages VALUES(?,?,?,?)');
for(const [u,r,t] of [
 ['one','user','2026-10-14 22:30:00'],['one','assistant','2026-10-14 22:31:00'],
 ['one','user','2026-10-15 05:00:00'],['one','user','2026-10-14 19:30:00'],
 ['other','user','2026-10-15 05:00:00'],['one','user','2026-09-01 00:00:00']
])insert.run(u,r,'not read by analytics',t);
raw.prepare('INSERT INTO usage_events VALUES(?,?,?,?)').run('e1','one','image','2026-10-15 05:00:00');
raw.prepare('INSERT INTO usage_events VALUES(?,?,?,?)').run('e2','other','video','2026-10-15 05:00:00');
const context=vm.createContext({console,crypto:require('node:crypto').webcrypto,TextEncoder,Response});
const code=fs.readFileSync('worker.js','utf8');vm.runInContext(code.slice(0,code.indexOf('export default')),context);context.db=db;
const run=code=>vm.runInContext(code,context);
(async()=>{
 const now=Date.parse('2026-10-15T08:00:00Z');context.now=now;
 const data=await run("getUsageStats(db,'one',7,240,now)");
 assert.equal(data.questions,3);assert.equal(data.activeDays,2);assert.equal(data.streak,2);
 assert.equal(data.series.length,7);assert.equal(data.series.at(-1).date,'2026-10-15');
 assert.equal(data.series.at(-1).questions,2);assert.equal(data.series.at(-2).questions,1);
 assert.equal(data.media.image,1);assert.equal(data.media.video,0);
 const empty=await run("getUsageStats(db,'nobody',30,240,now)");
 assert.equal(empty.series.length,30);assert.equal(empty.questions,0);assert.equal(empty.activeDays,0);assert.equal(empty.streak,0);
 const utc=await run("getUsageStats(db,'one',7,9999,now)");assert.equal(utc.series.at(-1).questions,1);
 console.log('PASS: account isolation, user messages only, local-day boundary, 7/30 days, empty days, media counters and invalid offset');
})().catch(error=>{console.error(error);process.exitCode=1});
