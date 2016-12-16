
import {EventEmitter} from "events";

import {dump} from "duxca.lib.js/lib/Algorithm";
import {getThumbnail, getVideoFromMediaStream} from "duxca.lib.js/lib/Media";
import {createVideoCanvasRenderer} from "duxca.lib.js/lib/Canvas";



export function getThumbnails(video: HTMLVideoElement, period: number): Promise<Blob[]> {
  const times: number[] = [];
  if( ! Number.isFinite(video.duration) ){
    return Promise.reject<Blob[]>(new Error("video duration is not finite"));
  }
  for(let currentTime=0; currentTime < video.duration; currentTime+=period){
    times.push(currentTime);
  }
  const thumbs = times
    .map((currentTime)=> (lst: Blob[])=> getThumbnail(video, currentTime).then((blob)=> lst.concat(blob) )  )
    .reduce<Promise<Blob[]>>((prm, genPrm)=> prm.then(genPrm), Promise.resolve([]));
  return thumbs;
}


export function elogger(err: Error){
  return (a: string|Error)=>{
    logger(a, err);
  };
}

export function logger(str: string|Error, err?: Error){
  if(err != null && err.stack != null){
    err.stack.split("\n").slice(1,2)
    .forEach((match)=>{ 
      const lineInfo = match.trim();
      log(str, lineInfo);
    });
  }else{
    log(str);
  }
  function log(obj: any, lineInfo?: string){
    let str = " ";
    if(typeof obj === "object"){
      try{
        str = ` ${dump(obj, 2)} `;
      }catch(err){}
    }
    if(typeof lineInfo === "string"){
      console.log(obj, lineInfo);
      $("#log").append(`${obj}${str}${lineInfo}\n`);
    }else{
      console.log(obj);
      $("#log").append(`${obj}${str}\n`);
    }
  }
}


export function getStorage(){
  return {
    get: <T>(key: string, _default: string): string => { return localStorage[key] != null ? localStorage[key] : _default; },
    set: <T>(key: string, value: string)=>{ localStorage[key] = value; },
    keys: ()=>{
      const results: string[] = [];
      for (let i=0; i<localStorage.length; i++){
          results.push(<string>localStorage.getItem(<string>localStorage.key(i)));
      }
      return results;
    }
  };
}

export function clipRect(
  video: HTMLVideoElement,
  left=0,
  top=0,
  radius=Math.min(video.videoWidth, video.videoHeight)/2,
  targetWidth?: number
): {
    clip: (left: number, top: number, radius: number)=>void,
    ctx: CanvasRenderingContext2D
  } {
  const cnv = document.createElement("canvas");
  const ctx = <CanvasRenderingContext2D>cnv.getContext("2d");
  const {videoWidth, videoHeight} = video;
  let [sx, sy, sw, sh, dx, dy, dw, dh] = [0,0,0,0,0,0,0,0];
  logger(`source video size${videoWidth}x${videoHeight}`);
  update(left, top, radius);
  //document.body.appendChild(video); // for debug
  //document.body.appendChild(cnv); // for debug
  let [l, t, r] = [left, top, radius];　// メモ化用の引数キャッシュ
  return {ctx, clip};
  function clip(left: number, top: number, radius: number){
    if(l !== left || t !== top || r !== radius){ // どれかひとつでも以前と異なっていたら
      update(left, top, radius);
      [l, t, r] = [left, top, radius];
    }else{
      cnv.width = cnv.width;
    }
    ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  function update(left: number, top: number, radius: number){
    // side-effect function
    const o = calc(left, top, radius, targetWidth);
    //　構造化代入は再代入に使えない！
    sx = o.sx;
    sy = o.sy;
    sw = o.sw;
    sh = o.sh;
    dx = o.dx;
    dy = o.dy;
    dw = o.dw;
    dh = o.dh;
    cnv.width = dw;
    cnv.height = dh;
  }
  function calc(left: number, top: number, radius: number, targetWidth?: number){
    // pure function
    const clippedWidth  = radius*2; // 
    const clippedHeight = radius*2; 
    logger(`clipped size${clippedWidth}x${clippedHeight}, (${left},${top})`);
    let pow = clippedHeight;
    if(targetWidth != null){
      pow = targetWidth;
      //for(var i=0; clippedHeight > Math.pow(2, i); i++); // 2^n の大きさを得る
      //pow = Math.pow(2, i); // 解像度 // i+1 オーバーサンプリングして解像度をより高く
    }
    let sx = left;
    let sw = clippedWidth;
    let sy = top;
    let sh = clippedHeight;
    let dx = 0;
    let dy = 0;
    let dw = pow;
    let dh = pow; // 縮小先の大きさ
    if(left < 0){
      sx = 0;
      sw = clippedWidth - left;
      dx = -left*pow/clippedWidth;
      dw = sw*pow/clippedWidth;
    }
    if(top < 0){
      sy = 0;
      sh = clippedHeight - top;
      dy = -top*pow/clippedHeight;
      dh = sh*pow/clippedHeight;
    }
    logger(`target fisheye size: ${dw}x${dh}`);
    return {sx, sy, sw, sh, dx, dy, dw, dh};
  }
}



export async function createVideoClippedStream(stream: MediaStream, fps=30) {
  const video = await getVideoFromMediaStream(stream);
  const {ctx, clip} = clipRect(video);
  const cnv = ctx.canvas;
  const cstream = cnv.captureStream(fps);
  return {cstream, ctx, clip, video, stream};
}