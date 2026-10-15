/* Isolated preview controls: local samples, no paid or authenticated requests. */
(() => {const bar=document.createElement('div');bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9000;display:flex;gap:5px;background:#201729;padding:5px';let blob;
 const add=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.style.cssText='font-size:10px;padding:8px;color:white;background:#59347a;border-radius:8px;border:0';b.onclick=fn;bar.append(b);};
 add('Начать работу',async()=>{blob=await(await fetch('/orb20-real.webp')).blob();studioProjects.clear();studioProjects.set('nav-sample',{id:'nav-sample',groupId:'nav-sample',kind:'image',status:'processing',prompt:'Пример проекта',created:Date.now(),order:1});openView('chat');updateProjectDock();});
 add('Готово',()=>{const p=studioProjects.get('nav-sample');if(p){p.status='completed';p.media=mediaFromBlob('image',blob);updateProjectDock();persistStudioProjects();}});document.body.append(bar);
})();
