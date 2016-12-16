import * as Cycle from '@cycle/xstream-run';

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";
import dropRepeats from "xstream/extra/dropRepeats";
import delay from "xstream/extra/delay";

import * as View from "../Driver/ViewDriver";

import {adapter, fromEvent, fromPromise, timeout, runEff} from "duxca.lib.js/lib/XStream";
import {loadMediaStream, load_video} from "duxca.lib.js/lib/Media";

import {logger, elogger, createVideoClippedStream} from "../Util/util";
import {FishEyeProps} from "../Util/ViewUtil";


export interface Sources {
  View: View.Sinks;
}

export interface Sinks {
  View: View.Sources;
}

export const REC_FPS = 20;

export function main(sources: Sources): Sinks {
  const {start$, stop$, deviceConstraints$, fisheyeProps$} = sources.View;

  // state

  // start 系列

  let [left, top, radius] = [0,0,0];
  runEff(fisheyeProps$.map((o)=>{
    left = o.left;
    top = o.top;
    radius = o.radius;
  }))

  const context$ = start$
    .compose(sampleCombine(deviceConstraints$))
    .map(([_, {width, height, audioinput, videoinput}])=>{
      const opt = {
        audio: {deviceId: {exact: audioinput} },
        video: {deviceId: {exact: videoinput},
                width: {min: width},
                height: {min: height} } };
      logger(`use option: ${JSON.stringify(opt, null, "  ")}`);
      return fromPromise((async ()=>{
        const stream = await loadMediaStream(opt);
        logger("got MediaStream");
        const cap = await createVideoClippedStream(stream, REC_FPS);
        logger("got captureStream");
        return cap;
      })(), elogger(new Error));
    })
    .flatten()
    .map((o)=>{
      const {stream, cstream, clip, video, ctx} = o;

      // 録画すべきメディアストリームを作成
      const rec_stream: MediaStream = new (window["MediaStream"] || window["webkitMediaStream"])();
      stream.getAudioTracks().forEach((track)=>{ rec_stream.addTrack(track); }); // 音声はそのまま録画
      cstream.getVideoTracks().forEach((track)=>{ rec_stream.addTrack(track); }); // ビデオはクリッピングしたものを録画
      logger("new MediaStream created");

      // 録画設定
      const rec = new MediaRecorder(rec_stream, {"mimeType": 'video/webm; codecs="vp8, opus"'});
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev)=>{
        chunks.push(ev.data);
      };
      logger("got MediaRecorder");

      // 録画開始
      const startTime = Date.now();
      const tid = setInterval(_loop, 1000/REC_FPS);
      _loop();
      video.play();
      rec.start();
      logger(`startTime: ${startTime}`);
      $(ctx.canvas).appendTo("body");

      return {stop, flush, startTime};

      function stop(){
        clearInterval(tid);
        $(ctx.canvas).remove();
        video.pause();
        rec.ondataavailable = undefined;
        rec.stop();
        stream.getTracks().map((track)=>{ track.stop(); });
        cstream.getTracks().map((track)=>{ track.stop(); });
        rec_stream.getTracks().map((track)=>{ track.stop(); });
        logger(`stopped. duration: ${Date.now() - startTime}ms`);
      }
      function flush(){
        return chunks.splice(0, chunks.length);
      }
      function _loop(){
        clip(left, top, radius);
      }
    });

  const upload$ = xs.merge(
    start$.mapTo(true),
    stop$.mapTo(false) )
    .startWith(false)
    .map((a)=> a ? xs.periodic(1000*5) : xs.never())
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






