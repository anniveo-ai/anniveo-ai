const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/stability.js','utf8');
const block=source.slice(source.indexOf(' let nextVersion='),source.indexOf('\n async function start(){'));
function fixture(){
 const timers=new Map(),intervals=[],events={},storage=new Map(),reloads=[],elements={messageInput:{value:'draft'},app:{scrollTop:123}};
 let counter=0,snapshot=null,fetches=0;
 const c={URL,AbortController,Date,JSON,Promise,Map,navigator:{onLine:true},state:{},historyLoading:false,creationLock:false,studioProjects:new Map(),busy:false,recording:false,openingMic:false,transcribing:false,orbVoiceActive:false,mediaVoiceTask:null,stagedMediaAttachment:null,anonymous:false,anonymousHistory:[],studioImageFile:null,studioVideoFile:null,studioVideoIdentityFile:null,currentView:'studio',showWelcome:false,newestFirstChat:true,returnToChatAvailable:true,chatOpenedThisSession:true,draftIds:['messageInput'],key:x=>'account:'+x,$:id=>elements[id],updateControls(){},storageWarning(){c.warning=true;},
 document:{hidden:false,activeElement:null,querySelector:s=>s.startsWith('meta')?{content:'a'.repeat(40)}:null,addEventListener:(n,fn)=>events[n]=fn},window:{addEventListener:(n,fn)=>events[n]=fn},
 sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 location:{href:'https://example.org/?keep=1',replace:u=>reloads.push(u)},
 saveDrafts(){snapshot={values:{messageInput:c.anonymous?'':elements.messageInput.value}};},read:()=>snapshot,saveFileDrafts:async()=>{},saveDurable:async()=>true,
 fetch:async()=>{fetches++;return {ok:true,json:async()=>({version:'b'.repeat(40)})};},
 setTimeout:(fn,ms)=>{const id=++counter;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>intervals.push({fn,ms})};
 vm.createContext(c);vm.runInContext(block+'\nthis.api={checkRelease,applyRelease,safeToUpdate,takeUpdateHandoff};',c);
 return {c,events,storage,reloads,intervals,timers,elements,fetches:()=>fetches,flush:async()=>{for(const [id,t]of [...timers])if(t.ms===150){timers.delete(id);await t.fn();}for(let i=0;i<10;i++)await Promise.resolve();}};
}
(async()=>{
 let f=fixture();assert.deepEqual(f.intervals.map(x=>x.ms),[15000,1000]);
 f.c.busy=true;await f.c.api.checkRelease();await f.flush();assert.equal(f.reloads.length,0);
 f.c.busy=false;f.c.updateControls();await f.flush();assert.equal(f.reloads.length,1);assert.equal(f.fetches(),1);assert.match(f.reloads[0],/keep=1&v=b/);
 let handoff=JSON.parse(f.storage.get('account:update-handoff'));assert.equal(handoff.view,'studio');assert.equal(handoff.scrollTop,123);assert.equal(handoff.messageInput,undefined);
 for(const name of ['busy','recording','openingMic','transcribing','orbVoiceActive','creationLock','mediaVoiceTask','stagedMediaAttachment','historyLoading']){f=fixture();f.c[name]=true;assert.equal(f.c.api.safeToUpdate(),false,name);}
 for(const name of ['restoring','fileDraftsLoading','historyLoading']){f=fixture();f.c.state[name]=true;assert.equal(f.c.api.safeToUpdate(),false,name);}
 f=fixture();f.c.document.activeElement={tagName:'TEXTAREA'};await f.c.api.checkRelease();await f.flush();assert.equal(f.reloads.length,0);f.c.document.activeElement=null;f.events.focusout();await f.flush();assert.equal(f.reloads.length,1);
 f=fixture();f.c.document.activeElement={tagName:'INPUT',type:'checkbox'};assert.equal(f.c.api.safeToUpdate(),true);
 f.c.anonymous=true;f.c.anonymousHistory.push({content:'private'});assert.equal(f.c.api.safeToUpdate(),false);
 f=fixture();f.c.saveDrafts=()=>{};await f.c.api.checkRelease();await f.flush();assert.equal(f.reloads.length,0);assert.equal(f.c.warning,true);
 f=fixture();f.c.studioImageFile={name:'source.png'};f.c.saveFileDrafts=async()=>{throw Error('quota');};await f.c.api.checkRelease();await f.flush();assert.equal(f.reloads.length,0);
 f=fixture();f.c.studioProjects.set('1',{sourceFile:{}});f.c.saveDurable=async()=>false;await f.c.api.checkRelease();await f.flush();assert.equal(f.reloads.length,0);
 f=fixture();f.c.saveDurable=async()=>{f.c.busy=true;return true;};await f.c.api.checkRelease();await f.flush();assert.equal(f.reloads.length,0);f.c.saveDurable=async()=>true;f.c.busy=false;await f.intervals[1].fn();await f.flush();assert.equal(f.reloads.length,1);
 f=fixture();await Promise.all([f.c.api.checkRelease(),f.c.api.checkRelease()]);assert.equal(f.fetches(),1);assert.equal([...f.timers.values()].some(t=>t.ms===8000),false);
 f=fixture();f.c.document.hidden=true;await f.c.api.checkRelease();assert.equal(f.fetches(),0);f.c.document.hidden=false;f.c.navigator.onLine=false;await f.c.api.checkRelease();assert.equal(f.fetches(),0);
 for(const [version,expiry,valid]of [['a'.repeat(40),Date.now()+60000,true],['b'.repeat(40),Date.now()+60000,false],['a'.repeat(40),Date.now()-1,false]]){f=fixture();f.storage.set('account:update-handoff',JSON.stringify({version,expiresAt:expiry}));assert.equal(!!f.c.api.takeUpdateHandoff(),valid);assert.equal(f.storage.size,0);}
 assert.match(source,/state\.fileDraftsLoading=true/);assert.match(source,/Only an automatic update resumes its screen/);
 console.log('PASS: auto-update scheduling, activity guards, draft/file failure protection, race, deduplication and one-shot handoff');
})().catch(e=>{console.error(e);process.exitCode=1;});
