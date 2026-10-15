const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('let usageLoadVersion=0;'),html.indexOf('function renderUsageChart'));
const storage=new Map(),nodes=new Map(),rendered=[];
let calls=0,complete;
const fixture={days:30,series:Array.from({length:30},(_,i)=>({date:new Date(Date.now()-(29-i)*86400000).toISOString().slice(0,10),questions:i===29?2:i===0?10:0,media:{image:i===0?5:0,video:0,voice:i===29?1:0}}))};
function contextFor(userId){
 const context=vm.createContext({Date,console,window:{addEventListener(){}},initData:'test-data',user:{id:userId},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  $:id=>{if(!nodes.has(id))nodes.set(id,{replaceChildren(){}});return nodes.get(id)},
  api:()=>{calls++;return new Promise((resolve,reject)=>complete={resolve,reject})},
  capture:snapshot=>rendered.push(snapshot)});
 vm.runInContext(source,context);
 vm.runInContext('renderUsageData=snapshot=>capture(usageForPeriod(snapshot,usagePeriod));',context);
 return code=>vm.runInContext(code,context);
}
(async()=>{
 const run=contextFor(1);
 const p1=run('loadUsageStats()'),p2=run('loadUsageStats()');
 assert.equal(calls,1,'overlapping opens share one request');complete.resolve(fixture);await Promise.all([p1,p2]);
 assert.equal(rendered.at(-1).questions,2,'seven-day slice excludes old counts');
 assert.equal(rendered.at(-1).media.image,0);assert.equal(rendered.at(-1).media.voice,1);
 await run('loadUsageStats({value:30})');assert.equal(calls,1,'period change uses loaded 30-day snapshot');assert.equal(rendered.at(-1).questions,12);
 const reload=contextFor(1);await reload('loadUsageStats()');assert.equal(calls,1,'same account restores persisted data without waiting');
 run('invalidateUsageStats()');const before=rendered.length;const refreshing=run('loadUsageStats()');
 assert.equal(rendered.length,before+1,'stale snapshot renders synchronously while network is pending');
 assert.equal(calls,2);complete.reject(Error('offline'));await refreshing;
 assert.equal(rendered.at(-1).questions,12,'network failure preserves displayed data');
 assert.match(nodes.get('usageNote').textContent,/Сохранённые данные/);
 const other=contextFor(2);const isolated=other('loadUsageStats()');assert.equal(calls,3,'other account cannot reuse account 1 cache');complete.resolve(fixture);await isolated;
 const beforeAll=calls,allPending=run("loadUsageStats({value:'all'})");
 assert.equal(calls,beforeAll+1,'all-time uses its own scoped request');
 const allFixture={...fixture,period:'all',granularity:'day',days:30,questions:12,activeDays:2,streak:1,media:{image:5,video:0,voice:1}};
 complete.resolve(allFixture);await allPending;
 assert.equal(rendered.at(-1).period,'all');assert.equal(rendered.at(-1).questions,12);
 await run("loadUsageStats({value:'all'})");assert.equal(calls,beforeAll+1,'repeat all-time view uses cached lifetime result');
 const beforeRecent=calls,back=run("loadUsageStats({value:7})");assert.equal(rendered.at(-1).questions,2,'switch back shows cached recent data synchronously');
 if(calls>beforeRecent)complete.resolve(fixture);await back;
 console.log('PASS: request deduplication, synchronous cached display, persistent account isolation, local 7/30-day totals, invalidation and offline preservation');
})().catch(error=>{console.error(error);process.exitCode=1});
