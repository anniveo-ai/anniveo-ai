/* Preview-only controls. Never included in the production tree. */
(() => {
 const bar=document.createElement('div');bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9000;display:flex;gap:4px;background:#201729;padding:5px';
 const add=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.style.cssText='font-size:10px;padding:8px;color:white;background:#59347a;border-radius:8px;border:0';b.onclick=fn;bar.append(b);};
 let ready=false;
 async function sample(id){if(!ready){const blob=await (await fetch('/orb20-real.webp')).blob(),file=new File([blob],'preview.webp',{type:'image/webp'});studioProjects.clear();
  for(const p of [{id:'qa-photo',groupId:'qa-photo',kind:'image',status:'processing',order:1,prompt:'Первый проект',sourceFile:file},{id:'qa-photo-ready',groupId:'qa-photo',kind:'image',status:'completed',order:2,prompt:'Первый проект · мягкий свет',media:mediaFromBlob('image',blob)},{id:'qa-photo-agent',groupId:'qa-photo',kind:'image',status:'processing',order:3,prompt:'Первый проект · вечерний свет',previewBlob:blob},{id:'qa-video',groupId:'qa-video',kind:'video',status:'processing',order:4,prompt:'Отдельное видео',sourceFile:file}])studioProjects.set(p.id,{...p,created:Date.now()});ready=true;}openProjectRoom(id);}
 add('Проект + агент',()=>void sample('qa-photo-agent'));add('Другое видео',()=>void sample('qa-video'));add('Микрофон',()=>{openView('studio');mediaVoiceTask={kind:'image',phase:'opening'};syncMediaMic();});document.body.append(bar);
})();
