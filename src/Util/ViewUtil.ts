import * as $ from "jquery";

import xs, {Stream} from 'xstream';

import {on} from "duxca.lib.js/lib/XStream2JQuery";



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