import * as $ from "jquery";

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";
import dropRepeats from "xstream/extra/dropRepeats";
import delay from "xstream/extra/delay";

import {EventEmitter} from "events";

import {on} from "duxca.lib.js/lib/XStream2JQuery";
import {runEff, timeout} from "duxca.lib.js/lib/XStream";
import {loadMediaStream, load_video} from "duxca.lib.js/lib/Media";
import {fromPromise} from "duxca.lib.js/lib/XStream";
import {dump} from "duxca.lib.js/lib/Algorithm";

import {REC_FPS} from "../Component/Main";

import {deviceConstraintsSettingView, DeviceConstraints} from "../Util/ViewUtil";

import {clippedVideoView} from "../Util/ViewUtil";

import {logger, elogger} from "../Util/util";


export interface Sources {
  start$: Stream<void>;
  stop$: Stream<void>;
  deviceConstraints$: Stream<DeviceConstraints>;
}

export interface Sinks {
  state$: Stream<"recording"|"paused">;
  ended$: Stream<{ videoURL: string; startTime: number; }>;
}

export function main(sources: Sources): Sinks {
  const {start$, stop$, deviceConstraints$} = sources;

  // 「録画中」というコンテキスト
  const context$ = start$
    .compose(sampleCombine(deviceConstraints$))
    .map(([_, o])=> fromPromise(createRecordContext(o), elogger(new Error)) )
    .flatten();

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

  // 録画設定
  const rec = new MediaRecorder(raw_stream, {mimeType: 'video/webm; codecs="vp8, opus"'});
  rec.videoBitsPerSecond
  const chunks: Blob[] = [];
  rec.ondataavailable = (ev)=>{ chunks.push(ev.data); };
  logger("got MediaRecorder");
  
  // 追記対象
  let blob = new Blob([],  { 'type' : 'video/webm' });

  // 録画開始
  const startTime = Date.now();
  const tid = setInterval(flush, 1000*10);
  rec.start();
  logger(`REC_FPS: ${REC_FPS}`);
  logger(`startTime: ${startTime}`);

  // $(ctx.canvas).appendTo("body"); // for debug;  

  const ret = {stop, startTime, stopTime: Infinity, videoURL: URL.createObjectURL(blob)};
  return ret;

  function stop(){
    flush();

    const stopTime = Date.now();
    clearInterval(tid);
    rec.ondataavailable = undefined;
    rec.stop();
    raw_stream.getTracks().map((track)=>{ track.stop(); });

    ret.stopTime = stopTime;
    
    logger(`stopped. duration: ${stopTime - startTime}ms`);
    logger(`stopTime: ${stopTime}`);
    logger(`result (${JSON.stringify({startTime, videoURL: ret.videoURL})})`);

    // $(ctx.canvas).remove(); // for debug
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
}

