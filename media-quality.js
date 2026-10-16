/* Export actual pixels from sufficiently large originals; never upscale a low-resolution result. */
(() => {
 'use strict';
 const presets={fhd:{label:'1080p',edge:1920},qhd:{label:'2K',edge:2560},uhd:{label:'4K',edge:3840}};
 function dimensions(quality,ratio){const edge=presets[quality]?.edge;if(!edge)return null;return ratio==='1:1'?{width:edge,height:edge}:ratio==='9:16'?{width:edge*9/16,height:edge}:{width:edge,height:edge*9/16};}
 function load(node,event){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Не удалось прочитать размер файла.')),20000);node.addEventListener(event,()=>{clearTimeout(timer);resolve();},{once:true});node.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Этот файл не удалось открыть.'));},{once:true});});}
 async function inspectVideo(blob){const url=URL.createObjectURL(blob),video=document.createElement('video');video.preload='metadata';video.muted=true;video.playsInline=true;try{const ready=load(video,'loadedmetadata');video.src=url;await ready;return {width:video.videoWidth,height:video.videoHeight,duration:video.duration};}finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}}
 async function resizeVideo(blob,target,audioStart){
  if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)throw Error('Подготовка 2K недоступна в этом браузере. Исходное видео 4K сохранено.');
  const Audio=window.AudioContext||window.webkitAudioContext,nativeCapture=!Audio&&typeof HTMLVideoElement.prototype.captureStream==='function',formats=typeof HTMLVideoElement.prototype.captureStream==='function'?['video/webm;codecs=vp8,opus','video/webm','video/mp4']:['video/mp4;codecs=avc1.640033,mp4a.40.2','video/mp4','video/webm'];
  const mime=formats.find(type=>MediaRecorder.isTypeSupported(type));
  if(!mime)throw Error('Этот браузер не поддерживает сохранение видео 2K. Исходник 4K сохранён.');
  if(!nativeCapture&&!Audio)throw Error('Не удалось сохранить звуковую дорожку. Исходное видео 4K сохранено.');
  const audio=nativeCapture?null:audioStart?.audio||new Audio(),resumed=audio?(audioStart?.ready||audio.resume()):Promise.resolve(),url=URL.createObjectURL(blob),video=document.createElement('video'),canvas=document.createElement('canvas');
  canvas.width=target.width;canvas.height=target.height;canvas.style.cssText='position:fixed;left:2px;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none';document.body.append(canvas);const painter=canvas.getContext('2d'),chunks=[];let stream,recorder,source,sourceStream,silence,frame,timer;
  video.playsInline=true;video.muted=true;video.preload='auto';video.style.cssText='position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none';document.body.append(video);
  try{
   const ready=load(video,'loadedmetadata');video.src=url;await ready;
   if(video.readyState<2)await load(video,'loadeddata');
   await Promise.race([resumed,new Promise((_,reject)=>setTimeout(()=>reject(Error('Нажми «Скачать» ещё раз, чтобы подготовить видео со звуком.')),1500))]);
   if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Не удалось прочитать длительность. Исходник 4K сохранён.');
   let audioTracks;
   if(nativeCapture){sourceStream=video.captureStream();audioTracks=sourceStream.getAudioTracks();}
   else{const destination=audio.createMediaStreamDestination();source=audio.createMediaElementSource(video);source.connect(destination);silence=audio.createConstantSource();silence.offset.value=0;silence.connect(destination);silence.start();video.muted=false;audioTracks=destination.stream.getAudioTracks();}
   if(video.currentTime>.001)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Не удалось перейти к началу видео.')),5000);video.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});video.currentTime=0;});
   painter.drawImage(video,0,0,canvas.width,canvas.height);stream=canvas.captureStream(0);for(const track of audioTracks)stream.addTrack(track);
   recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.min(16000000,Math.max(6000000,target.width*target.height*2.5))});
   const result=await new Promise((resolve,reject)=>{
    let stopped=false;
    function stop(){if(stopped)return;stopped=true;video.pause();clearTimeout(frame);if(recorder.state!=='inactive')recorder.stop();}
    function fail(error){stop();reject(error);}
    recorder.onstart=()=>{void video.play().catch(fail);};
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.onerror=()=>fail(Error('Не удалось подготовить 2K. Исходное видео 4K сохранено.'));
    recorder.onstop=()=>{const file=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});file.size?resolve(file):reject(Error('Файл 2K пуст. Исходник 4K сохранён.'));};
    video.onended=()=>{painter.drawImage(video,0,0,canvas.width,canvas.height);stream.getVideoTracks()[0]?.requestFrame?.();setTimeout(stop,200);};video.onerror=()=>fail(Error('Подготовка видео прервалась. Исходник 4K сохранён.'));
    function draw(){if(stopped)return;painter.drawImage(video,0,0,canvas.width,canvas.height);stream.getVideoTracks()[0]?.requestFrame?.();if(!video.requestVideoFrameCallback&&!video.ended)frame=setTimeout(draw,33);}
    if(video.requestVideoFrameCallback){const paintFrame=()=>{if(stopped)return;painter.drawImage(video,0,0,canvas.width,canvas.height);stream.getVideoTracks()[0]?.requestFrame?.();if(!video.ended)video.requestVideoFrameCallback(paintFrame);};video.requestVideoFrameCallback(paintFrame);}
    timer=setTimeout(()=>fail(Error('Держи приложение открытым во время подготовки 2K. Исходное видео 4K сохранено.')),video.duration*3000+15000);
    recorder.start(200);draw();
   });
   const actual=await inspectVideo(result);if(actual.width!==target.width||actual.height!==target.height)throw Error('Браузер не сохранил нужный размер. Исходное видео 4K сохранено.');
   return result;
  }finally{clearTimeout(timer);clearTimeout(frame);video.pause();if(recorder?.state&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(track=>track.stop());sourceStream?.getTracks().forEach(track=>track.stop());source?.disconnect();silence?.stop();silence?.disconnect();if(audio)void audio.close();video.removeAttribute('src');video.load();video.remove();canvas.remove();URL.revokeObjectURL(url);}
 }
 async function prepare(project,blob,{convertVideo=false}={}){
  const preset=presets[project.quality];if(!preset)return {blob};
  const target=dimensions(project.quality,project.ratio);let original,audioStart;
  try{
   if(project.kind==='video'&&convertVideo){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){const audio=new Audio(),ready=audio.resume();void ready.catch(()=>{});audioStart={audio,ready};}}
   if(project.kind==='video'){
    original=await inspectVideo(blob);
    if(original.width<target.width||original.height<target.height)return {blob,...original,warning:'Сервис вернул '+original.width+'×'+original.height+' вместо '+target.width+'×'+target.height+'. Сохранён исходный файл.'};
    if(original.width===target.width&&original.height===target.height)return {blob,...original};
    if(!convertVideo)return {blob,...original,pending:true,warning:'Исходник 4K сохранён. Кнопка «Скачать» подготовит видео 2K; держи приложение открытым.'};
    return {blob:await resizeVideo(blob,target,audioStart),...target};
   }
   const url=URL.createObjectURL(blob),image=new Image();
   try{
    const ready=load(image,'load');image.src=url;await ready;original={width:image.naturalWidth,height:image.naturalHeight};
    // Region edits retain the source composition and aspect ratio.
    if(project.region){target.width=original.width>=original.height?preset.edge:Math.round(preset.edge*original.width/original.height);target.height=original.height>=original.width?preset.edge:Math.round(preset.edge*original.height/original.width);}
    if(original.width<target.width||original.height<target.height)return {blob,...original,warning:'Сервис вернул '+original.width+'×'+original.height+' вместо '+target.width+'×'+target.height+'. Сохранён исходный файл.'};
    if(original.width===target.width&&original.height===target.height)return {blob,...original};
    const canvas=document.createElement('canvas');canvas.width=target.width;canvas.height=target.height;const ctx=canvas.getContext('2d'),scale=Math.max(target.width/original.width,target.height/original.height),w=original.width*scale,h=original.height*scale;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,(target.width-w)/2,(target.height-h)/2,w,h);
    const type=['image/jpeg','image/webp'].includes(blob.type)?blob.type:'image/png';
    const resized=await new Promise(resolve=>canvas.toBlob(resolve,type,.96));if(!resized)throw Error('Не удалось подготовить размер фото.');return {blob:resized,...target};
   }finally{URL.revokeObjectURL(url);}
  }catch(error){return {blob,...original,warning:error.message,pending:project.kind==='video'&&project.quality==='qhd'};}
  finally{if(audioStart&&audioStart.audio.state!=='closed')void audioStart.audio.close();}
 }
 window.anisMediaQuality={presets,dimensions,inspectVideo,prepare};
})();
