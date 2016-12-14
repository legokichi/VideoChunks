import * as Cycle from '@cycle/xstream-run';

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";
import dropRepeats from "xstream/extra/dropRepeats";
import delay from "xstream/extra/delay";

import * as View from "../Driver/ViewDriver";

import {fetchBlob} from "duxca.lib.js/lib/Ajax";
import {adapter, fromEvent, reconnect} from "duxca.lib.js/lib/XStream";
import {loadMediaStream, load_video} from "duxca.lib.js/lib/Media";

import {logger} from "../Util/util";

export interface Sources {
  View: View.Sinks;
}

export interface Sinks {
  View: View.Sources;
}

export function main(sources: Sources): Sinks {
  const {start$, stop$, deviceIds$, fisheye$} = sources.View;

  // state

  // start 系列
  const mediaStream$ = start$.debug("kadpok")
    .compose(sampleCombine(deviceIds$))
    .map(([_, {width, height, audioinput, videoinput}])=> ({
        audio: {deviceId: {exact: audioinput} },
        video: {deviceId: {exact: videoinput},
                width: {min: width},
                height: {min: height} } }) )
    .map((opt)=>{ logger(`use option: ${JSON.stringify(opt, null, "  ")}`); return opt; })
    .map((opt)=> navigator.mediaDevices.getUserMedia(opt))
    .map(xs.fromPromise).flatten()
    .map((a)=>{ logger("got MediaStream"); return <MediaStream>a; });
  const recorder$ = mediaStream$
    .map((stream)=> new MediaRecorder(stream, {"mimeType": 'video/webm; codecs="vp8, opus"'}) )
    .map((a)=>{ logger("got MediaRecorder"); return a; })
  const chunks$ = recorder$
    .map((rec)=>{
      rec.start();
      type BlobEvent = MessageEvent;
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev)=>{
        chunks.push(ev.data);
      };
      return chunks;
    });
  const startTime$ = chunks$.map(Date.now.bind(Date))
    .map((a)=>{ logger(`startTime: ${a}`); return a; });
  
  
  const upload$ = xs.merge(
    start$.mapTo(true),
    stop$.mapTo(false) )
    .map((a)=> a ? xs.periodic(1000*60) : xs.never())
    .compose(reconnect);
  const flush$ = xs.merge(upload$, stop$);

  // flush 系列
  const url$ = chunks$
    .map((chunks)=> // initial blob をセットするために nest する
      flush$
        .map((a)=>{ logger(`raise flush`); return a; })
        .map((_)=> chunks.splice(0, chunks.length) ) // flush
        .map((chunks)=> new Blob(chunks, { 'type' : 'video/webm' }) )
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
    .compose(sampleCombine(mediaStream$, recorder$, url$, startTime$))
    .map(([_, stream, rec, url, startTime])=>{
      rec.ondataavailable = undefined;
      rec.stop();
      stream
        .getTracks()
        .map((track)=>{ track.stop(); });
      return {startTime, url};
    })
    .map((a)=>{ logger(`stop streams and recording`); return a; })
    .map((a)=>{ logger(`result (${JSON.stringify(a)})`); return a; });
  const video$ = result$
    .map(({url})=> load_video(url, true))
    .map(xs.fromPromise).flatten()
    .map((a)=>{ logger(`video loaded`); return a; })
    .replaceError((err)=>{ logger(err, new Error); return xs.never(); });

  return {
    View: {video$},
  };
}


export function run($container: JQuery){
  Cycle.run(adapter(main), {
    View: View.makeDriver($container),
  });
}








