import xs, {Stream} from 'xstream';


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

export function runEff(eff$: Stream<any>): void {
  eff$.addListener({
    next:     ()=>{},//console.info.bind(console, "next"),
    complete: ()=>{ /*console.warn("runEff: complete");*/ },
    error:    (err: any)=>{ setTimeout(()=>{ throw err; }, 0); }
  });
}

export function rangeRadius(width: number, height: number, centerX: number, centerY: number, radius: number): number[] {
  /*
  (width, height) の大きさの矩形上の円 (cx,cy,r) に含まれる矩形上の座標(x,y)と矩形行列上のインデックス番号を返す
  */
  const ids: number[] = [];
  for(let x=0; x<width; x++){
    for(let y=0; y<height; y++){
      const lx = x - centerX; // 中心からの座標
      const ly = y - centerY;  // 中心からの座標
      if(lx*lx + ly*ly < radius*radius){ // 範囲内
        const id = x + y * width;
        ids.push(id);
      }
    }
  }
  return ids;
}

export function exp(imgdata: ImageData, centerX: number, centerY: number, radius: number): number {
  const {data} = imgdata;
  const {width, height} = imgdata;
  const ids = rangeRadius(width, height, centerX, centerY, radius);
  const sum = ids.reduce((acc, id)=> acc + data[id*4] + data[id*4+1] + data[id*4+2], 0); // r + g + b 、輝度の合計
  const ave = sum/ids.length/3; // 平均輝度
  return ave;
}


import {getMediaStreamVideo} from "duxca.lib.js/lib/Media";
import {load_image, copy, createCanvas} from "duxca.lib.js/lib/Canvas";
import {CanvasRenderer} from "duxca.lib.js/lib/CanvasRenderer";
import {findMax} from "duxca.lib.js/lib/Statistics";

async function diff(){
  const cnv = await load_image("vlcsnap-2016-12-14-15h16m15s615.png").then(copy);
  const ctx = <CanvasRenderingContext2D>cnv.getContext("2d");
  const imgdata = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const {data} = imgdata;
  const {width, height} = imgdata;
  let radius = Math.min(width, height)/2;
  let centerX = width/2;
  let centerY = height/2;
  let alpha = 100;
  let ave = exp(imgdata, centerX, centerY, radius); // ave を最大化したい
  // 偏微分
  for(let i=0; i<30; i++){
    const df_dx = ave - exp(imgdata, centerX+1, centerY, radius); // ave > exp => df_dx は負 => 
    const df_dy = ave - exp(imgdata, centerX, centerY+1, radius);
    const df_dr = ave - exp(imgdata, centerX, centerY, radius+1); // df_dr が負なら  
    centerX += alpha * -df_dx;
    centerY += alpha * -df_dy;
    radius  += alpha * -df_dr;
    let newave = exp(imgdata, centerX, centerY, radius);
    // 1250 x 907 理想の値
    console.log(i, "score(ゼロに近いほど良い、負になったらまずい): ", newave - ave, centerX, centerY, radius);
    ave = newave;
  }
}
/*
getMediaStreamVideo({
        audio: false,
        video: {deviceId: {exact: "44aec2b9b05773942db92df94e46b67bef9e110020d3a686c657e4296fb3d164"},
                width: {min: 2592},
                height: {min: 1944} } }).then((video)=>{
  video.controls = true;
  video.play();
  const calib = new Calibration(video.videoWidth, video.videoHeight);
  function _loop(){
    calib.detect(video);
    requestAnimationFrame(_loop);
  }
  _loop();
});
*/
export class Calibration {
  cnv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  vrend: CanvasRenderer;
  hrend: CanvasRenderer;
  constructor(width: number, height: number){
    this.cnv = createCanvas(width, height);
    this.ctx = <CanvasRenderingContext2D>this.cnv.getContext("2d");
    this.vrend = new CanvasRenderer(width, 100);
    this.hrend = new CanvasRenderer(height, 100);
    document.body.appendChild(this.vrend.element);
    document.body.appendChild(this.hrend.element);
    document.body.appendChild(this.cnv);
    this.ctx.strokeStyle = "#00FF00";
  }
  detect(src: HTMLImageElement|HTMLCanvasElement|HTMLVideoElement){
    this.ctx.drawImage(src, 0, 0);
    const imgdata = this.ctx.getImageData(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    const {data} = imgdata;
    const {width, height} = imgdata;
    const downSample = 4;
    const resultV = Calibration.scanVertical(width, height, data, downSample);
    const resultH = Calibration.scanHorizontal(width, height, data, downSample);
    this.vrend.clear();
    this.hrend.clear();
    this.vrend.drawSignal(<Float32Array><any>resultV.aves, true, true);
    this.hrend.drawSignal(<Float32Array><any>resultH.aves, true, true);
    this.vrend.drawColLine(resultV.index*downSample);
    this.hrend.drawColLine(resultH.index*downSample);
    this.ctx.arc(resultV.index*downSample, resultH.index*downSample, 900, 0, 2*Math.PI);
    this.ctx.stroke();
  }
  static scanHorizontal(width: number, height: number, data: Uint8ClampedArray, downSample=1){
    const aves: number[] = [];
    for(let y=0; y<height; y+=downSample){
      const offset = y * width;
      let sum = 0;
      for(let x=0; x<width; x+=downSample){
        const id = x + offset;
        sum += (data[id*4] + data[id*4+1] + data[id*4+2])/3;
      }
      let ave = sum/width;
      aves.push(ave);
    }
    const [max, index] = findMax(aves);
    return {aves, max, index};
  }
  static scanVertical(width: number, height: number, data: Uint8ClampedArray, downSample=1){
    const aves: number[] = [];
    for(let x=0; x<width; x+=downSample){
      let sum = 0;
      for(let y=0; y<height; y+=downSample){
        const id = y * width + x;
        sum += (data[id*4] + data[id*4+1] + data[id*4+2])/3;
      }
      let ave = sum/height;
      aves.push(ave);
    }
    const [max, index] = findMax(aves);
    return {aves, max, index};
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




export function clipRect(video: HTMLVideoElement, centerX: number, centerY: number, radius: number): {
    clip: ()=>void,
    ctx: CanvasRenderingContext2D
    set: (centerX: number, centerY: number, radius: number)=> void
  } {
  const cnv = document.createElement("canvas");
  const ctx = <CanvasRenderingContext2D>cnv.getContext("2d");
  const {videoWidth, videoHeight} = video;
  logger(`source video size${videoWidth}x${videoHeight}`);
  let {sx, sy, sw, sh, dx, dy, dw, dh} = calc(centerX, centerY, radius);
  logger(`fisheye size: ${dw}x${dh}`);
  [cnv.width, cnv.height] = [dw, dh];
  //document.body.appendChild(video); // for debug
  //document.body.appendChild(cnv); // for debug
  return {ctx, clip, set};
  function set(centerX: number, centerY: number, radius: number){
    const o = calc(centerX, centerY, radius);
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
  function clip(){
    cnv.width = cnv.width;
    ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  function calc(centerX: number, centerY: number, radius: number){
    const clippedWidth  = radius*2; // 
    const clippedHeight = radius*2; 
    const left = centerX - radius;
    const top  = centerY - radius;
    logger(`clipped size${clippedWidth}x${clippedHeight}, (${left},${top})`);
    for(var i=0; clippedHeight > Math.pow(2, i); i++); // 2^n の大きさを得る
    const pow = Math.pow(2, i); // 解像度 // i+1 オーバーサンプリングして解像度をより高く
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
    console.info({sx, sy, sw, sh, dx, dy, dw, dh})
    return {sx, sy, sw, sh, dx, dy, dw, dh};
  }
}