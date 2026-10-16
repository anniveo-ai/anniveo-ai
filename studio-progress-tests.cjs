const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('stability.js','utf8'),nodes=new Map();
function node(tag='div',props={}){
 const classes=new Set(),n={tag,children:[],dataset:{},attrs:{},hidden:false,textContent:'',style:{setProperty(k,v){this[k]=v}},classList:{add(c){classes.add(c)},remove(c){classes.delete(c)},toggle(c,on){on?classes.add(c):classes.delete(c)},contains(c){return classes.has(c)}},append(...children){this.children.push(...children)},after(child){this.next=child},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},querySelector(){const find=n=>n.tag==='i'?n:n.children.map(find).find(Boolean);return find(this)}};
 let id;Object.defineProperty(n,'id',{get(){return id},set(v){id=v;nodes.set(v,n)}});Object.assign(n,props);return n;
}
const heading=node(),projects=new Map(),opened=[];
for(const id of ['view-studio','view-video'])nodes.set(id,{querySelector:()=>heading});
nodes.set('projectStageStatus',node());
const state={},nav=node(),context=vm.createContext({Map,Object,Math,PROJECT_TERMINAL:['completed','failed','unknown'],state,studioProjects:projects,studioNav:nav,studioNavIcon:node(),selectedStudioProject:null,$:id=>nodes.get(id),el:node,button:(text,fn)=>node('button',{onclick:fn}),openProjectRoom:id=>opened.push(id),loadStudioProjectResult(){throw Error('Unexpected load')},projectStatusLabel:p=>p.loading?'Загружаем файл':p.status});
vm.runInContext(source.slice(source.indexOf(' function studioProjectProgress('),source.indexOf(' // Keep the native values used by generation')),context);
const render=()=>{state.renderStudioSectionProgress([...projects.values()]);state.renderStudioNavProgress([...projects.values()]);};
render();assert.equal(nodes.get('imageCreationProgress').hidden,true);assert.equal(nodes.get('videoCreationProgress').hidden,true);
const image={id:'photo',kind:'image',status:'processing',prompt:'Белый фон',created:1},video={id:'video',kind:'video',status:'pending',prompt:'Плавный пролёт',created:2};projects.set(image.id,image);projects.set(video.id,video);render();
for(const kind of ['image','video'])assert.equal(nodes.get(kind+'CreationProgress').hidden,false);
assert.equal(nav.classList.contains('studio-nav-dual-progress'),true);
assert.equal(vm.runInContext("studioNavTracks.get('image').fill.style.width",context),'62%');assert.equal(vm.runInContext("studioNavTracks.get('video').fill.style.width",context),'32%');
nodes.get('videoCreationProgress').onclick();assert.deepEqual(opened,['video'],'reopens same work, does not generate again');
video.status='completed';video.loading=true;state.renderRoomProgress(video);render();assert.equal(vm.runInContext("studioNavTracks.get('video').fill.style.width",context),'90%');assert.notEqual(nodes.get('anisProjectSteps').children.at(-1).style['--segment-progress'],'100%','generation done is not file download done');
video.loading=false;video.media={file:{}};render();assert.equal(vm.runInContext("studioNavTracks.get('video').fill.style.width",context),'100%');assert.equal(nav.classList.contains('studio-nav-dual-progress'),true,'completed video stays visible while photo works');
image.status='completed';image.media={file:{}};render();assert.equal(nav.classList.contains('studio-nav-dual-progress'),false);assert.equal(vm.runInContext("studioNavTracks.get('video').track.hidden",context),true);assert.match(nodes.get('videoCreationProgress').attrs['aria-label'],/готово/);
state.renderRoomProgress(video);assert.ok(nodes.get('anisProjectSteps').children.every(n=>n.style['--segment-progress']==='100%'));
assert.deepEqual(opened,['video'],'background updates never force a modal open');
console.log('PASS: persistent section cards, independent photo/video strips, reopen same job, no premature completion and no forced popups.');
