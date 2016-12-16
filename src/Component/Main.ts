import * as Cycle from '@cycle/xstream-run';

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";
import dropRepeats from "xstream/extra/dropRepeats";
import delay from "xstream/extra/delay";

import * as View from "../Driver/ViewDriver";

import {adapter, fromEvent, xsasync, fromPromise} from "duxca.lib.js/lib/XStream";
import {loadMediaStream, load_video} from "duxca.lib.js/lib/Media";

import {logger, elogger} from "../Util/util";



export interface Sources {
  View: View.Sinks;
}

export interface Sinks {
  View: View.Sources;
}

export function main(sources: Sources): Sinks {
  const {start$, stop$, deviceConstraints$} = sources.View;

  // state

  // start 系列

  const context$ = start$
    .compose(sampleCombine(deviceConstraints$))
    .map(([_, {width, height, audioinput, videoinput}])=>{
      const opt = {
        audio: {deviceId: {exact: audioinput} },
        video: {deviceId: {exact: videoinput},
                width: {min: width},
                height: {min: height} } };
      logger(`use option: ${JSON.stringify(opt, null, "  ")}`);
      return fromPromise(loadMediaStream(opt), elogger(new Error));
    })
    .flatten()
    .map((stream)=>{
      logger("got MediaStream");
      const rec = new MediaRecorder(stream, {"mimeType": 'video/webm; codecs="vp8, opus"'});
      logger("got MediaRecorder");
      rec.start();
      type BlobEvent = MessageEvent;
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev)=>{
        chunks.push(ev.data);
      };
      const startTime = Date.now();
      logger(`startTime: ${startTime}`);
      return {stop, flush, startTime};
      function stop(){
        rec.ondataavailable = undefined;
        rec.stop();
        stream
          .getTracks()
          .map((track)=>{ track.stop(); });
      }
      function flush(){
        return chunks.splice(0, chunks.length);
      }
    });

  const upload$ = xs.merge(
    start$.mapTo(true),
    stop$.mapTo(false) )
    .startWith(false)
    .map((a)=> a ? xs.periodic(1000*60) : xs.never())
    .flatten();
  const flush$ = xs.merge(upload$, stop$);

  // flush 系列
  const url$ = context$
    .map(({flush})=> // initial blob をセットするために nest する
      flush$
        .map((_)=>{
          logger(`raise flush`);
          const chunks = flush();
          const blob = new Blob(chunks, { 'type' : 'video/webm' });
          return blob;
        })
        .fold((a, b)=> new Blob([a, b], { 'type' : 'video/webm' }), new Blob())
        .filter((blob)=> blob.size > 256) // 少なくとも EBML のヘッダが含まれているであろうサイズ
        .map((a)=>{ logger(`merge chunks (size:${a.size/1024/1024}MB)`); return a; })
        .fold((a, b)=> (URL.revokeObjectURL(a), URL.createObjectURL(b)), "")
        .filter((url)=> url.length > 0) // fold 初期値対策
        .map((a)=>{ logger(`get temporary url (${a})`); return a; }) )
    .flatten();

  // stop 系列
  const result$ = stop$
    .compose(delay(0)) // 最後の url$ を取得
    .compose(sampleCombine(context$, url$))
    .map(([_, {stop, startTime}, url])=>{
      stop();
      logger(`stop streams and recording`);
      logger(`result (${JSON.stringify({startTime, url})})`);
      return {startTime, url};
    });
  const act$ = result$
    .map(({url, startTime})=>{return {videoURL: url, startTime}; });


  const state$ = <Stream<"recording"|"paused">>xs.merge(
    context$.mapTo("recording"),
    result$.mapTo("paused")
  );

  return {
    View: {act$, state$},
  };
}


export function run($container: JQuery){
  Cycle.run(adapter(main), {
    View: View.makeDriver($container),
  });
}






