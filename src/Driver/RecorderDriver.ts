import * as $ from "jquery";

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";
import dropRepeats from "xstream/extra/dropRepeats";
import delay from "xstream/extra/delay";

import {EventEmitter} from "events";

import {on} from "duxca.lib.js/lib/XStream2JQuery";
import {runEff, timeout} from "duxca.lib.js/lib/XStream";
import {loadMediaStream, loadVideo, getVideoFromMediaStream} from "duxca.lib.js/lib/Media";
import {fromPromise} from "duxca.lib.js/lib/XStream";
import {dump} from "duxca.lib.js/lib/Algorithm";

import {deviceConstraintsSettingView, DeviceConstraints, FishEyeProps} from "../Util/ViewUtil";

import {logger, elogger} from "../Util/util";

export const REC_FPS = 15;

export interface Sources {
  start$: Stream<void>;
  stop$: Stream<void>;
  deviceConstraints$: Stream<DeviceConstraints>;
  //fisheyeProps$: Stream<FishEyeProps>;
}

export interface Sinks {
  state$: Stream<"recording"|"paused">;
  ended$: Stream<{ videoURL: string; startTime: number; }>;
}

export function main(sources: Sources): Sinks {
  const {start$, stop$, deviceConstraints$/*, fisheyeProps$*/} = sources;

  // 「録画中」というコンテキスト
  const context$ = start$
    .compose(sampleCombine(deviceConstraints$))
    .map(([_, o])=> fromPromise(createRecordContext(o), elogger(new Error)) )
    .flatten();

  /*runEff(
    xs.combine(fisheyeProps$, context$)
      .map(([o, ctx])=>{
        ctx.centerX = o.left + o.radius;
        ctx.centerY = o.top + o.radius;
        ctx.radius = o.radius;
      })
  );*/

  // 録画中の注目点変更
  

  // stop 系列
  const ended$ = stop$
    .compose(delay(0)) // 最後の url$ を取得
    .compose(sampleCombine(context$))
    .map(([_, o])=>{
      o.stop();
      const {startTime, stopTime, videoURL} = o;
      return {startTime, stopTime, videoURL};
    });

  const state$ = <Stream<"recording"|"paused">>xs.merge(
    context$.mapTo("recording"),
    ended$.mapTo("paused")
  );

  return {ended$, state$};
}




export async function createRecordContext(dc: DeviceConstraints){
  const {width, height, audioinput, videoinput} = dc;
  const opt = {
    audio: {deviceId: {exact: audioinput} },
    video: {deviceId: {exact: videoinput},
            frameRate: { min: REC_FPS-5, ideal: REC_FPS, max: REC_FPS+5 },
            width: {min: width},
            height: {min: height} } };
  logger(`use option: ${JSON.stringify(opt, null, "  ")}`);

  const raw_stream = await loadMediaStream(opt);
  logger("got MediaStream");

  //const video = await getVideoFromMediaStream(raw_stream);

  //const ctx = <CanvasRenderingContext2D>document.createElement("canvas").getContext("2d");
  //const cnv_stream = ctx.canvas.captureStream(REC_FPS);
  //logger("got captureStream");

  // 録画すべきメディアストリームを作成
  //const rec_stream: MediaStream = new (window["MediaStream"] || window["webkitMediaStream"])();
  //raw_stream.getAudioTracks().forEach((track)=>{ rec_stream.addTrack(track); }); // 音声はそのまま録画
  //cnv_stream.getVideoTracks().forEach((track)=>{ rec_stream.addTrack(track); }); // ビデオはクリッピングしたものを録画
  logger("new MediaStream created");

  // 録画設定
  const rec = new MediaRecorder(/*rec_stream*/raw_stream, {mimeType: 'video/webm; codecs="vp8, opus"'});

  const chunks: Blob[] = [];
  rec.ondataavailable = (ev)=>{ chunks.push(ev.data); };
  logger("got MediaRecorder");
  
  // 追記対象
  let blob = new Blob([],  { 'type' : 'video/webm' });

  // 録画開始
  const startTime = Date.now();
  const tid = setInterval(flush, 1000*10);
  //const tid2 = setInterval(_loop, 1000/REC_FPS);
  rec.start();
  //video.play();
  logger(`REC_FPS: ${REC_FPS}`);
  logger(`startTime: ${startTime}`);

  //$(ctx.canvas).appendTo("body").css({visibility: "hidden", width: "0px" });

  const ret = {stop, startTime, stopTime: Infinity, videoURL: URL.createObjectURL(blob), centerX: 0, centerY: 0, radius: 300};

  return ret;

  function stop(){
    flush();

    const stopTime = Date.now();

    clearInterval(tid);
    //clearInterval(tid2);

    rec.ondataavailable = undefined;
    rec.stop();
    //video.pause();
    raw_stream.getTracks().map((track)=>{ track.stop(); });

    ret.stopTime = stopTime;
    
    logger(`stopped. duration: ${stopTime - startTime}ms`);
    logger(`stopTime: ${stopTime}`);
    logger(`result (${JSON.stringify({startTime, videoURL: ret.videoURL})})`);

    //$(ctx.canvas).remove(); // for debug
  }

  function flush(){
    const _chunks = chunks.splice(0, chunks.length); // バッファから flush

    logger(`flushed: ${_chunks.length}`);

    blob = new Blob([blob].concat(_chunks), { 'type' : 'video/webm' }); // flush したものを追記

    URL.revokeObjectURL(ret.videoURL);
    ret.videoURL = URL.createObjectURL(blob); // resource url 更新(MK2 追記APIがあれば必要ない)

    logger(`current size (${blob.size/1024/1024}MB)`);
    logger(`get temporary url (${ret.videoURL})`);
  }
  function _loop(){
    clip(ret.centerX, ret.centerY, ret.radius);
  }
  function clip(centerX: number, centerY: number, radius: number){
    const clippedWidth  = radius*2;
    const clippedHeight = radius*2;
    const left = centerX - radius;
    const top  = centerY - radius;
    let [sx, sy] = [left, top];
    let [sw, sh] = [clippedWidth, clippedHeight];
    let [dx, dy] = [0, 0];
    let [dw, dh] = [sw, sh]; // 縮小先の大きさ
    // ネガティブマージン 対応
    if(left < 0){
      sx = 0;
      sw = clippedWidth - left;
      dx = -left*dw/clippedWidth;
      dw = sw*dw/clippedWidth;
    }
    if(top < 0){
      sy = 0;
      sh = clippedHeight - top;
      dy = -top*dh/clippedHeight;
      dh = sh*dh/clippedHeight;
    }
    //ctx.canvas.width  = dw;
    //ctx.canvas.height = dh;
    //ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}

