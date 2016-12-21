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

export interface Props {
  blobToURL(blob: Blob, prevURL?: ResourceURI): ResourceURI;
  deviceConstraints: DeviceConstraints;
  fps: number;
}

export interface Sources {
  start$: Stream<Props>;
  stop$: Stream<void>;
}

export type UNIXTime = number;
export type ResourceURI = string;

export interface Sinks {
  state$: Stream<"recording"|"paused">;
  ended$: Stream<{ videoURL: ResourceURI; startTime: UNIXTime; stopTime: UNIXTime; fps: number; }>;
}

export function main(sources: Sources): Sinks {
  const {start$, stop$} = sources;

  // 「録画中」というコンテキスト
  const context$ = start$
    .map(({deviceConstraints, fps, blobToURL})=> fromPromise(createRecordContext(deviceConstraints, fps, blobToURL), elogger(new Error)) )
    .flatten();
  
  // stop 系列
  const ended$ = stop$
    .compose(sampleCombine(context$))
    .map(([_, o])=>{
      o.stop();
      const {startTime, stopTime, videoURL, fps} = o;
      return {startTime, stopTime, videoURL, fps};
    });

  const state$ = <Stream<"recording"|"paused">>xs.merge(
    context$.mapTo("recording"),
    ended$.mapTo("paused")
  );

  return {ended$, state$};
}




export async function createRecordContext(dc: DeviceConstraints, fps: number, blobToURL: (blob: Blob, prevURL?: string)=> string){
  const {width, height, audioinput, videoinput} = dc;
  const opt = {
    audio: {deviceId: {exact: audioinput} },
    video: {deviceId: {exact: videoinput},
            frameRate: { min: fps-5, ideal: fps, max: fps+5 },
            width: {min: width},
            height: {min: height} } };
  logger(`use option: ${JSON.stringify(opt, null, "  ")}`);

  const raw_stream = await loadMediaStream(opt);
  logger("got MediaStream");

  // 録画設定
  const rec = new MediaRecorder(raw_stream, {mimeType: 'video/webm; codecs="vp8, opus"'});

  const chunks: Blob[] = [];
  rec.ondataavailable = (ev)=>{ chunks.push(ev.data); };
  logger("got MediaRecorder");
  
  // 追記対象
  let blob = new Blob([],  { 'type' : 'video/webm' });

  // 録画開始
  const startTime = Date.now();
  const tid = setInterval(flush, 1000*10);
  rec.start();
  logger(`REC_FPS: ${fps}`);
  logger(`startTime: ${startTime}`);

  const ret = {stop, startTime, stopTime: Infinity, videoURL: blobToURL(blob), centerX: 0, centerY: 0, radius: 300, fps};

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
  }

  function flush(){
    const _chunks = chunks.splice(0, chunks.length); // バッファから flush

    logger(`flushed: ${_chunks.length}`);

    blob = new Blob([blob].concat(_chunks), { 'type' : 'video/webm' }); // flush したものを追記

    ret.videoURL = blobToURL(blob, ret.videoURL); // resource url 更新

    logger(`current size (${blob.size/1024/1024}MB)`);
    logger(`get temporary url (${ret.videoURL})`);
  }
}

