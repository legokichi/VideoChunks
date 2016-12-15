import xs, {Stream} from 'xstream';
import {load_video} from "duxca.lib.js/lib/Media";
import {getMediaStreamVideo} from "duxca.lib.js/lib/Media";
import {fromEvent} from "duxca.lib.js/lib/Event";
import {load_image, copy, createCanvas, cnvToBlob} from "duxca.lib.js/lib/Canvas";
import {CanvasRenderer} from "duxca.lib.js/lib/CanvasRenderer";
import {findMax} from "duxca.lib.js/lib/Statistics";
import {EventEmitter} from "events";

export async function createThumbnail(video: HTMLVideoElement, currentTime: number): Promise<Blob> {
  if(currentTime > video.duration){
    return Promise.reject<Blob>(new Error("currentTime is out of video duration"));
  }
  video.currentTime = currentTime;
  await fromEvent<Event>(video, "seeked");
  const cnv = copy(video);
  const blob = await cnvToBlob(cnv, "image/jpeg", 0.8);
  return blob;
}

export function logger(str: string|Error, err?: Error){
  if(str instanceof Error){
    return logger(str.message +"\n"+ str.stack, err);
  }
  if(err != null && err.stack != null){
    err.stack.split("\n").slice(1,2)
    .forEach((match)=>{ 
      const _match = match.trim();
      console.log(str, _match);
      $("#log").append(`${str} ${_match}\n`);
    });
  }else{
    console.log(str);
    $("#log").append(`${str}\n`);
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
  use_pow=false,
  centerX=video.videoWidth/2,
  centerY=video.videoHeight/2,
  radius=Math.min(centerX, centerY)
): {
    clip: (centerX: number, centerY: number, radius: number)=>void,
    ctx: CanvasRenderingContext2D
  } {
  const cnv = document.createElement("canvas");
  const ctx = <CanvasRenderingContext2D>cnv.getContext("2d");
  const {videoWidth, videoHeight} = video;
  let [sx, sy, sw, sh, dx, dy, dw, dh] = [0,0,0,0,0,0,0,0];
  logger(`source video size${videoWidth}x${videoHeight}`);
  update(centerX, centerY, radius);
  //document.body.appendChild(video); // for debug
  //document.body.appendChild(cnv); // for debug
  let [cX, cY, r] = [centerX, centerY, radius];　// メモ化用の引数キャッシュ
  return {ctx, clip};
  function clip(centerX: number, centerY: number, radius: number){
    if(cX !== centerX || cY !== centerY || r !== radius){ // どれかひとつでも以前と異なっていたら
      update(centerX, centerY, radius);
      [cX, cY, r] = [centerX, centerY, radius];
    }else{
      cnv.width = cnv.width;
    }
    ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  function update(centerX: number, centerY: number, radius: number){
    // side-effect function
    const o = calc(centerX, centerY, radius, use_pow);
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
  function calc(centerX: number, centerY: number, radius: number, use_pow=false){
    // pure function
    const clippedWidth  = radius*2; // 
    const clippedHeight = radius*2; 
    const left = centerX - radius;
    const top  = centerY - radius;
    logger(`clipped size${clippedWidth}x${clippedHeight}, (${left},${top})`);
    let pow = clippedHeight;
    if(use_pow){
      for(var i=0; clippedHeight > Math.pow(2, i); i++); // 2^n の大きさを得る
      pow = Math.pow(2, i); // 解像度 // i+1 オーバーサンプリングして解像度をより高く
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

