import * as $ from "jquery";

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";

import {EventEmitter} from "events";


import {load_video} from "duxca.lib.js/lib/Media";
import {fromEvent, fromPromise, timeout, runEff, fromMediaElement} from "duxca.lib.js/lib/XStream";
import {on, touchstart, touchmove, touchend} from "duxca.lib.js/lib/XStream2JQuery";
import {getEventPosition} from "duxca.lib.js/lib/Event";

import {PerspectiveCamera} from "./PerspectiveCamera";

import {logger, elogger} from "../Util/util";

export type JSONString = string;
export interface JSONStorage {
  getItem(key: string): JSONString | null;
  setItem(key: string, data: JSONString): void;
}

export function getInputStreamWithStorage
<T>(Storage: JSONStorage, $elm: JQuery, key: string, event="input"): Stream<T> {
  const val = Storage.getItem(key);
  const default_str = val !== null ? val : ""+$elm.val();
  const default_prim = <T>JSON.parse(default_str);
  $elm.val(default_str);
  const ev$ = on($elm, event)
    .map((ev)=>{
      const str = ""+$(ev.target).val();
      Storage.setItem(key, str);
      try{
        return <T>JSON.parse(str);  
      }catch(err){
        return default_prim;
      }
    })
    .startWith(default_prim);
  return ev$;
}

export function getCombinedInputStreamWithStorage
<T>(Storage: JSONStorage, o: {[P in keyof T]: JQuery}): Stream<T> {
  const opt$ = < {[P in keyof T]: Stream<T[P]>}>{};
  Object.keys(o).forEach((key: keyof T)=>{
    const $elm = o[key];
    const ev$ = getInputStreamWithStorage<any>(Storage, $elm, key);
    opt$[key] = ev$;
  });
  const keys = <(keyof T)[]>Object.keys(opt$);
  const opts$ = keys.map((key: keyof T)=> opt$[key]);
  const vals$: Stream<T[keyof T][]> = xs.combine.apply(xs, opts$);
  const ret$ = vals$.map((vals)=>
    keys.reduce((o, key, i)=> (o[key] = vals[i], o), <T>{}) );
  return ret$;
}

export function getCombinedSelectStreamWithStorage
<T extends {[key: string]: {$: JQuery, opt: {[id: string]: string}}}>
(Storage: JSONStorage, o: T): Stream<{[P in keyof T]: keyof T[P]["opt"]}> {
  const opt$ = < {[P in keyof T]: Stream<keyof T[P]["opt"]>}>{};
  Object.keys(o).forEach((key: keyof T)=>{
    const $elm = o[key].$;
    const opts = o[key].opt;
    const ids = Object.keys(opts);
    $elm.empty(); // 以前の状態を DOM から削除
    if(ids.length === 0){
      opt$[key] = xs.never(); 
    }else{
      const $flag = $(document.createDocumentFragment());
      ids.forEach((id)=>{
        const label = opts[id];
        $("<option />")
          .val(id)
          .html(label)
          .appendTo($flag);
      });
      $elm.append($flag);
      const couho = Storage.getItem(key); // 以前の起動時の値が使えそうなら使う
      const default_id = couho !== null ? couho : ids[0];
      $elm.val(default_id); // デフォルト値を DOM に反映
      // イベントストリームに登録
      const ev$ = on($elm,  "change")
        .map((ev)=> ""+$(ev.target).val() ) // val は id
        .startWith(default_id)
        .map((id)=>{
          Storage.setItem(key, id); // 変化したら書き込み
          return id;
        });
      opt$[key] = ev$;
    }
  });
  const keys = <(keyof T)[]>Object.keys(opt$);
  const opts$ = keys.map((key: keyof T)=> opt$[key]);
  const vals$: Stream<string[]> = xs.combine.apply(xs, opts$);
  const ret$ = vals$.map((vals)=>
    keys.reduce((o, key, i)=> (o[key] = vals[i], o), <{[P in keyof T]: keyof T[P]["opt"]}>{}) );
  return ret$;
}


export interface DeviceConstraints {
  audioinput: string;
  audiooutput: string;
  videoinput: string;
  width: number;
  height: number;
}
export function deviceConstraintsSettingView(width=300, height=300): {deviceConstraints$: Stream<DeviceConstraints>, element: Node} {
  const element = document.createDocumentFragment();
  const $audioinput = $("<select />").attr({name: "audioinput", id: "audioinput"});
  const $audiooutput = $("<select />").attr({name: "audiooutput", id: "audiooutput"});
  const $videoinput = $("<select />").attr({name: "videoinput", id: "videoinput"});
  const $camWidth = $("<input />").attr({type: "number", name: "camWidth", id: "camWidth"}).val(width);
  const $camHeight = $("<input />").attr({type: "number", name: "camHeight", id: "camHeight"}).val(height);
  const $flag = $(element);
  $flag.append(
    $("<label />").html("audioinput: ").append($audioinput), $("<br />"),
    $("<label />").html("audiooutput: ").append($audiooutput), $("<br />"),
    $("<label />").html("videoinput: ").append($videoinput), $("<br />"),
    $("<label />").html("width: ").append($camWidth), $("<br />"),
    $("<label />").html("height: ").append($camHeight), $("<br />"),
  );

  const devices$ = <Stream<MediaDeviceInfo[]>>xs.fromPromise(navigator.mediaDevices.enumerateDevices());

  const deviceIds$ = devices$.map((devices)=>{
    const $devices = {
      audioinput:  {$: $audioinput,  opt: createLabel(devices, "audioinput")},
      audiooutput: {$: $audiooutput, opt: createLabel(devices, "audiooutput")},
      videoinput:  {$: $videoinput,  opt: createLabel(devices, "videoinput")},
    };
    return getCombinedSelectStreamWithStorage(localStorage, $devices);
  }).flatten();

  const size$ = (function() {
    type CamSize = { width: number;    height: number;    };
    const $size  = { width: $camWidth, height: $camHeight };
    return getCombinedInputStreamWithStorage<CamSize>(localStorage, $size);
  })();

  const deviceConstraints$ = xs.combine(deviceIds$, size$).map(([a, b])=> ({...a, ...b}));

  return {element, deviceConstraints$};

  function createLabel(devices: MediaDeviceInfo[], kind: string): { [deviceId: string]: string } {
    return devices
      .filter(({kind:a})=> kind === a)
      .reduce<{[key:string]:string}>((o, {deviceId, label})=>(o[deviceId]=label, o), {});
  }
}


export interface FishEyeProps {
  left: number;
  top: number;
  radius: number;
}

export function fisheyeSettingView(): { fisheyeProps$: Stream<FishEyeProps>, element: Node } {
  const element = document.createDocumentFragment();
  const $left = $("<input />").attr({type: "number", name: "left", id: "left"}).val(300);
  const $top = $("<input />").attr({type: "number", name: "top", id: "top"}).val(300);
  const $radius = $("<input />").attr({type: "number", name: "radius", id: "radius"}).val(300);
  const $flag = $(element);
  $flag.append(
    $("<label />").html("left: ").append($left), $("<br />"),
    $("<label />").html("top: ").append($top), $("<br />"),
    $("<label />").html("radius: ").append($radius), $("<br />"),
  );
  const fisheyeProps$ = (function() {
    const $fisheye   = { left: $left,  top: $top,   radius: $radius };
    return getCombinedInputStreamWithStorage<FishEyeProps>(localStorage, $fisheye)
  })();
  return {element, fisheyeProps$};
}


export function clippedVideoView(fps: number, src$: Stream<string>, fisheyeProps$: Stream<FishEyeProps>): { element: Node } {
  const element = document.createElement("div");
  const cam     = new PerspectiveCamera();

  // view  
  const $element = $(element);
  const $canvas = $(cam.canvas);
  const $display = $("<div />").addClass("display");
  const $button = $("<button />").addClass("button").html("toggle");
  const $virtualTime = $("<time />").addClass("virtualTime").html("0");
  const $range = $("<input />").addClass("range").attr({type: "range", value: 0, min: 0, max: 1, step: 1/1000});
  const $zoom = $("<input />").addClass("zoom").attr({type: "range", value: 0.5, min: 0.5, max: 2, step: 1/1000});

  $element.append(
    $display.append(
      cam.canvas
    ),
    $button,
    $range,
    $zoom
  );
  cam.setCanvasSize(400, 300);
  const pose = cam.getCameraPose();
  pose.pitch = Math.PI*1/8;
  cam.setCameraPose(pose.pitch, pose.yaw);

  // intent
  const video$ = src$
    .take(1)
    .map((videoURL)=> fromPromise(load_video(videoURL, true), elogger(new Error)) )
    .flatten();

  const renderer$  = video$
    .map((video)=> cam.getRendererFromVideo(video) );

  // ビデオ状態
  const videoSt$ = video$
    .map((video)=> fromMediaElement(video) );
  const state$ = videoSt$
    .map((o)=> o.state$)
    .flatten();

  const emitter = new EventEmitter();


  runEff( // 再生・一時停止トグル
    on($button, "click")
      .compose(sampleCombine(video$))
      .map(([_, video])=>{
        if(video.paused){ video.play(); }
        else{ video.pause(); }
      })
  );

  // レンダリング頻度
  const frame$    = xs.merge(
    state$.filter((a)=> a === "play").mapTo(fps),
    state$.filter((a)=> a !== "play").mapTo(-1), )
    .startWith(-1)
    .map((period)=> timeout(period) )
    .flatten();

  // ドラッグ
  const touchstart$ = touchstart($canvas).map(getEventPosition);
  const touchmove$  = touchmove($canvas).map(getEventPosition);
  const touchend$   = touchend($canvas).map(getEventPosition);

  // ドラッグ状態
  const dragging$ = xs.merge(
    touchstart$.mapTo(true),
    touchend$.mapTo(false)
  ).startWith(false);

  // ドラッグのデルタ
  const deltaPos$ = touchstart$
    .map((startPos)=>
      touchmove$
        .compose(sampleCombine(dragging$))
        .filter(([_, flag])=> flag)
        .fold((a: any, [b, startPos])=> ({
            deltaX: (<any>b).screenX - a.prev.screenX,
            deltaY: (<any>b).screenY - a.prev.screenY,
            prev: b,
        }), {deltaX:0, deltaY: 0, prev: startPos})
        .map(({deltaX, deltaY})=> ({deltaX, deltaY}) ) )
    .flatten();

  // ドラッグによるカメラ位置
  runEff(
    deltaPos$
      .map(({deltaX, deltaY})=>{
        const {pitch, yaw} = cam.getCameraPose();
        const alpha = 0.01;
        let   _pitch = pitch + alpha * deltaY;
        const _yaw   = yaw   + alpha * deltaX * -1;
        if(_pitch < Math.PI*1/8){ _pitch = Math.PI*1/8; }
        if(_pitch > (Math.PI/2)*7/8){ _pitch = (Math.PI/2)*7/8; }
        cam.setCameraPose(_pitch, _yaw);
        emitter.emit("render");
      })
  );

  // ズーム
  runEff(
    on($zoom, "input")
      .map(()=>{
        const scale = Number($zoom.val());
        cam.camera.zoom = scale;
        cam.camera.updateProjectionMatrix();
        emitter.emit("render");
      })
  );

  // シークバー
  runEff(xs.merge(
    touchstart($range)
      .compose(sampleCombine(video$))
      .map(([_, video])=>{ video.pause(); }),
    touchend($range)
      .compose(sampleCombine(video$))
      .map(([_, video])=>{ video.play(); }),
    on($range, "input")
      .compose(sampleCombine(video$))
      .map(([a, video])=>{
        const range = Number($range.val());
        video.currentTime = video.duration * range;
      }),
    frame$
      .compose(sampleCombine(video$)) // シーク反映
      .map(([_, video])=>{ $range.val(video.currentTime/video.duration); }),
  ));

  
  runEff(xs.merge(
    xs.combine(xs.merge(frame$, fromEvent(emitter, "render")), renderer$, fisheyeProps$) // レンダリングするタイミング
      .map(([_, renderer, {left, top, radius}])=>{ renderer(left, top, radius); }),
  ));
  
  runEff(
    video$
      .map((video)=>{
        video.controls = true;
        video.loop = true;
        video.play();
        //document.body.appendChild(video); // for debug
      })
  );

  return {element};
}