const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const actions=fs.readFileSync('project-actions.js','utf8'),html=fs.readFileSync('index.html','utf8');
const confirm=actions.slice(actions.indexOf('  async function confirmEnhancement('),actions.indexOf('  function enhancementReturnControl('));
const generate=html.slice(html.indexOf('async function generateMedia(kind)'),html.indexOf('async function addAgentVariant()'));
async function check(kind,change,cancel=false){
 const fields={imageQuality:{value:'fhd'},videoQuality:{value:'fhd'},imageRatio:{value:'1:1'},videoRatio:{value:'16:9'},duration:{value:'4'},imagePrompt:{value:''},videoPrompt:{value:''}};
 const ids=kind==='video'?['videoQuality','videoRatio','duration']:['imageQuality','imageRatio'];
 const original={id:'original',kind,groupId:'family'},projects=new Map([[original.id,original]]),source={name:'original',size:1};let returned=0,requests=0,selection;
 const session={kind,project:original,ids,initial:ids.map(id=>fields[id].value),create:{disabled:false},back:{disabled:false},toolbar:{remove(){this.removed=true}},listeners:[]};
 fields[change].value=change==='duration'?'8':change.endsWith('Ratio')?'9:16':'uhd';
 const context=vm.createContext({session,Set,studioProjects:projects,mediaVoiceTask:null,$:id=>fields[id],studioImageFile:source,studioVideoFile:source,studioVideoIdentityFile:null,window:{anisProjectActions:{enhancementVariant:()=>({groupId:'family'}),enhancementPrompt:()=> 'Улучши качество'}},enhancementVariant:()=>({groupId:'family'}),enhancementReturn(){returned++},toast(message){throw Error(message)},createStudioVariant:async snapshot=>{requests++;selection=snapshot;await Promise.resolve();if(!cancel)projects.set('new',{id:'new',...snapshot});}});
 vm.runInContext('let enhancementSession=session;'+confirm+generate,context);
 const first=vm.runInContext('confirmEnhancement(session)',context),second=vm.runInContext('confirmEnhancement(session)',context);await Promise.all([first,second]);
 if(change.endsWith('Ratio')){assert.equal(requests,0);assert.equal(returned,2);return;}
 assert.equal(requests,1,'repeated confirmation must not create duplicate variants');assert.equal(selection.groupId,'family');assert.equal(selection.sourceFile,source);assert.equal(selection.quality,fields[kind+'Quality'].value);if(kind==='video')assert.equal(selection.duration,Number(fields.duration.value));
 assert.equal(fields[kind+'Prompt'].value,'');assert.equal(session.back.disabled,false);
 assert.equal(!!session.toolbar.removed,!cancel,'a cancelled price confirmation keeps the settings open');assert.equal(projects.has('original'),true);
}
(async()=>{await check('image','imageQuality');await check('video','videoQuality');await check('video','duration');await check('image','imageRatio');await check('video','videoQuality',true);console.log('PASS: image/video quality and duration create one grouped variant through the standard creator, preserve originals, respect cancellation, and format alone never starts generation. No paid requests.');})().catch(error=>{console.error(error);process.exitCode=1});
