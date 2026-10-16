const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const actions=fs.readFileSync('project-actions.js','utf8'),html=fs.readFileSync('index.html','utf8');
const file=new File(['video'],'video.mp4',{type:'video/mp4'}),item={file,url:'blob:original',exportJobId:'owned'};
function environment(){
 const counts={share:0,prepared:0,native:0,opened:0,download:0},buttons=[],note={textContent:''};
 const context=vm.createContext({navigator:{userAgent:'iPhone',share:async()=>{counts.share++}},window:{anisProjectActions:{prepareDownload:async()=>{counts.prepared++;return {url:'https://api.test/media-download/private',filename:'video.mp4'}}},Telegram:{WebApp:{openLink(){counts.opened++}}}},shareable:()=>true,telegramDownloads:()=>({downloadFile(data,callback){counts.native++;callback(true)}}),showMedia(){},viewerNote:note,viewerActions:{querySelector:()=>null,append:b=>buttons.push(b)},control:(text,onclick)=>({text,onclick}),mediaDeadline:p=>p,download(){counts.download++},Error});
 vm.runInContext(actions.slice(actions.indexOf('  async function saveMedia('),actions.indexOf('  function saveProject(')),context);context.item=item;
 return {context,counts,buttons,note,save:()=>vm.runInContext("saveMedia(item,'video')",context)};
}
(async()=>{
 let e=environment();await e.save();assert.equal(e.counts.share,1);assert.equal(e.counts.prepared,0,'system save opens before export/link preparation');
 e=environment();e.context.navigator.share=async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'})};await e.save();assert.equal(e.counts.native,0,'cancelling Share must not start a second download');
 e=environment();e.context.shareable=()=>false;e.context.telegramDownloads=()=>({downloadFile(){throw Error('unavailable')}});await e.save();assert.match(e.note.textContent,/не открыл/);assert.equal(e.buttons.length,1);e.buttons[0].onclick();assert.equal(e.counts.opened,1,'native download failure leaves a working HTTPS save button');
 e=environment();e.context.shareable=()=>false;await e.save();assert.equal(e.counts.native,1);assert.match(e.note.textContent,/запрошено/);
 e=environment();e.context.shareable=()=>false;e.context.telegramDownloads=()=>null;await e.save();assert.equal(e.counts.download,1,'mobile without Share/native bridge still gets an actual download');
 // Both Ready gallery downloads and the long result button use saveProject.
 const node={focus(){this.focused=true},closest(){return {scrollIntoView(){node.scrolled=true}}}},project={id:'owned',kind:'video'};let saved,opened;
 const ctx=vm.createContext({studioProjects:new Map([[project.id,project]]),selectedStudioProject:project.id,window:{anisProjectActions:{saveProject:p=>saved=p}},$:()=>node,openProjectRoom:id=>opened=id});
 for(const name of ['saveGeneratedMedia','editGeneratedMedia'])vm.runInContext(html.split('\n').find(line=>line.startsWith('function '+name+'(')),ctx);
 vm.runInContext('saveGeneratedMedia();editGeneratedMedia()',ctx);assert.equal(saved,project);assert.equal(opened,project.id);assert.equal(node.focused,true);assert.equal(node.scrolled,true);
 assert.ok(actions.includes("if(action==='download'){await saveProject(project);return;}"));
 console.log('PASS: synchronous system Save, cancellation, native HTTPS fallback, mobile download, unified gallery/result saving and video edit opens the same agent.');
})().catch(error=>{console.error(error);process.exitCode=1});
