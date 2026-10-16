const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('project-actions.js','utf8'),section=source.slice(source.indexOf('  const playbackLinks='),source.indexOf('  function resultPreview('));
let now=0,tick,downloads=0,errors=0;
const note={dataset:{},textContent:''},project={id:'video',kind:'video',resultUrl:'https://s3.polza.ai/video.mp4'};
class Media extends EventTarget{isConnected=true;currentTime=0;ended=false;src='';parentElement={querySelector:()=>null,append(){}};load(){}play(){return Promise.resolve();}}
const media=new Media(),context=vm.createContext({WeakMap,Date:{now:()=>now},URL,initData:'signed',API_URL:'https://api.test/',mediaJSON:async()=>({url:'https://api.test/media-playback/private',expires:9999999}),queueMicrotask,setInterval:fn=>(tick=fn,1),clearInterval(){},node:()=>note,loadStudioProjectResult:async p=>{downloads++;p.media={url:'blob:complete-video',file:new File(['video'],'v.mp4')};},showLoadError:()=>errors++});
context.media=media;context.project=project;vm.runInContext(section+';attachVideoPlayback(media,project)',context);
(async()=>{
 await new Promise(setImmediate);assert.equal(media.src,'https://api.test/media-playback/private','native player uses authenticated range-capable URL');
 media.dispatchEvent(new Event('play'));now=9001;tick();await new Promise(setImmediate);
 assert.equal(downloads,1,'stalled playback automatically downloads complete file');assert.equal(media.src,'blob:complete-video','same video element switches to verified local bytes');
 now=19000;tick();await new Promise(setImmediate);assert.equal(downloads,1,'recovery is bounded, no repeated downloads');assert.equal(errors,0);
 console.log('PASS: range playback URL, stalled video recovery after 8 seconds, preserved element and bounded full-file fallback.');
})().catch(e=>{console.error(e);process.exitCode=1});
