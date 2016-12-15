/// <reference path="../decls/globals.d.ts" />

import * as $ from "jquery";

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";
import dropRepeats from "xstream/extra/dropRepeats";
import delay from "xstream/extra/delay";

import {EventEmitter} from "events";

import {on} from "duxca.lib.js/lib/XStream2JQuery";
import {runEff, timeout} from "duxca.lib.js/lib/XStream";

import {logger, getStorage, clipRect} from "../Util/util";

export interface Sources {
  video$: Stream<HTMLVideoElement>;
}

export interface Sinks {
  element$: Stream<HTMLElement>;
  start$: Stream<void>;
  stop$: Stream<void>;
  deviceIds$: Stream<{ audioinput: string , audiooutput: string , videoinput: string, width: number, height: number  }>;
  fisheye$: Stream<{ centerX: number , centerY: number, radius: number}>;
}

export function main(sources: Sources): Sinks {
  const {video$} = sources;

  // parameter

  const element = document.createElement("div");
  const Storage = getStorage(); // local storage 
  
  // view

  const $element = $(element);
  const $toggle = $("<button />").html("toggle");
  const $audioinput = $("<select />").attr({name: "audioinput", id: "audioinput"});
  const $audiooutput = $("<select />").attr({name: "audiooutput", id: "audiooutput"});
  const $videoinput = $("<select />").attr({name: "videoinput", id: "videoinput"});
  const $camWidth = $("<input />").attr({type: "number", name: "camWidth", id: "camWidth"}).val(300);
  const $camHeight = $("<input />").attr({type: "number", name: "camHeight", id: "camHeight"}).val(300);
  const $centerX = $("<input />").attr({type: "number", name: "centerX", id: "centerX"}).val(300);
  const $centerY = $("<input />").attr({type: "number", name: "centerY", id: "centerY"}).val(300);
  const $radius = $("<input />").attr({type: "number", name: "radius", id: "radius"}).val(300);
  const $state = $("<span />").attr({id: "state"});
  const $log = $("<textarea />").attr({id: "log"});
  const $newLens = $("<button/ >").html("新レンズ")

  $element.append(
    $toggle,
    $("<fieldset />").append(
      $("<legend />").html("settings"),
      $("<label />").html("state: ").append($state), $("<br />"),
      $("<fieldset />").append(
        $("<legend />").html("user media"),
        $("<label />").html("audioinput: ").append($audioinput), $("<br />"),
        $("<label />").html("audiooutput: ").append($audiooutput), $("<br />"),
        $("<label />").html("videoinput: ").append($videoinput), $("<br />"),
        $("<label />").html("width: ").append($camWidth), $("<br />"),
        $("<label />").html("height: ").append($camHeight), $("<br />"),
      ),
      $("<fieldset />").append(
        $("<legend />").html("fisheye"),
        $("<label />").html("centerX: ").append($centerX), $("<br />"),
        $("<label />").html("centerY: ").append($centerY), $("<br />"),
        $("<label />").html("radius: ").append($radius), $("<br />"),
        $newLens
      )
    ),
    $("<fieldset />").append(
      $("<legend />").html("log"),
      $log.css({width: "100%", height: "30em"})
    )
  );

  // util
  $log.on("click", ($ev)=>{
    if( $ev.offsetY - $log.height()/2 > 0){
      $log.scrollTop($log.scrollTop() + 100);
    }else{
      $log.scrollTop($log.scrollTop() - 100);
    }
  });

  $newLens.click(()=>{
    $camWidth.val(2592).trigger("input");
    $camHeight.val(1944).trigger("input");
    $centerX.val(1259).trigger("input");
    $centerY.val(890).trigger("input");
    $radius.val(884).trigger("input");
  });
  

  // intent

  const _flag$ = on($toggle, "click").fold((a)=> !a, false);
  const state$ = xs.merge(
    _flag$.filter((a)=>  a).mapTo("recording"),
    _flag$.filter((a)=> !a).mapTo("paused")
  ).startWith("paused").compose(dropRepeats());

  const start$ = state$.filter((a)=> a === "recording").map(()=>{ logger("start clicked"); });
  const stop$  = state$.filter((a)=> a === "paused"   ).map(()=>{ logger("stop clicked"); });
  
  const devices$ = <Stream<MediaDeviceInfo[]>>xs.fromPromise(navigator.mediaDevices.enumerateDevices());

  const deviceIds$ = devices$.map((devices)=>{
    const $devices = {
      audioinput:  $audioinput,
      audiooutput: $audiooutput,
      videoinput:  $videoinput
    };
    logger(`devices: ${JSON.stringify(devices, null, "  ")}`);
    const deviceId$ = Object.keys($devices).map((kind)=>{ // このループは audioinput|audiooutput|videoinput の場合の3回のみ発生
      $devices[kind].empty(); // 以前の状態を DOM から削除
      const kindDevs = devices.filter(({kind: a})=> kind === a); // audioinput|audiooutput|videoinput のうちどれか
      if(kindDevs.length === 0){ return <Stream<string>>xs.never(); } // audioinput|audiooutput|videoinput 存在しないなら何もしない
      // その device を DOM へ挿入
      const $opts = kindDevs 
        .map(({deviceId, groupId, label})=>
          $("<option />")
            .val(deviceId)
            .html(label) );
      $.prototype.append.apply($devices[kind], $opts);
      // デフォルト値の設定
      let _default = kindDevs[0].deviceId;
      const couho = Storage.get(kind, _default);
      // 以前の起動時の値が使えそうなら使う
      if(devices.some(({deviceId})=> deviceId === couho)){
        _default = couho;
      }
      $devices[kind].val(_default); // デフォルト値を DOM に反映
      // イベントストリームに登録
      return on($devices[kind],  "change")
        .map((ev)=> <string>$(ev.target).val() ) // val は deviceId
        .startWith(_default)
        .map((deviceId)=>{
          logger(`change deviceId (${deviceId})`);
          Storage.set(kind, deviceId);
          return deviceId;
        });
    });

    const $size = {
      camWidth:  $camWidth,
      camHeight: $camHeight
    };
    const opts$ = Object.keys($size).map((key)=>{
      // デフォルト値の設定
      const _default = Number(Storage.get(key, $size[key].val()));
      $size[key].val(_default);
      return on($size[key], "input")
        .map((ev)=>{
          const val = Number($(ev.target).val());
          Storage.set(key, ""+val);
          return val;
        })
        .startWith(_default);
    });
    const arr = Array.prototype.concat.call([], deviceId$, opts$);
    const deviceIds$ = (<Stream<[string, string, string, number, number]>>xs.combine.apply(xs, arr))
      .map(([a, b, c, d, e])=> ({audioinput: a, audiooutput: b, videoinput: c, width: d, height: e}));
    return deviceIds$;
  }).flatten();

  const fisheye$ = (()=>{
    const $fisheye = {
      centerX:  $centerX,
      centerY: $centerY,
      radius:  $radius
    };
    const opts$ = Object.keys($fisheye).map((key)=>{
      // デフォルト値の設定
      const _default = Number(Storage.get(key, $fisheye[key].val()));
      $fisheye[key].val(_default);
      return on($fisheye[key], "input")
        .map((ev)=>{
          const val = Number($(ev.target).val());
          Storage.set(key, ""+val);
          return val;
        })
        .startWith(_default);
    });
    return (<Stream<[number, number, number]>>xs.combine.apply(xs, opts$))
      .map(([centerX, centerY, radius])=> ({centerX, centerY, radius}) );
  })();

  // action

  runEff(state$.map((state)=>{
    $state.html(state);
  }));



  runEff(video$.map((video)=>{
    video.controls = true;
    const {clip, ctx} = clipRect(video);
    $(ctx.canvas).appendTo("body"); // for debug
    $(video).appendTo("body"); // for debug
    const eff$ = timeout(1000)
      .compose(sampleCombine(fisheye$))
      .map(([_, {centerX, centerY, radius}])=>{ clip(centerX, centerY, radius); });
    return eff$;
  }).flatten());


  const element$ = xs.of(element);

  return {element$, start$, stop$, deviceIds$, fisheye$};
}

export function makeDriver($container: JQuery) {
  return function(outgoing$: Stream<Sources>): Sinks {
    const sink$ = outgoing$.map(main);
    const element$ = sink$.map((o)=> o.element$).flatten();
    const start$ = sink$.map((o)=> o.start$).flatten();
    const stop$ = sink$.map((o)=> o.stop$).flatten();
    const deviceIds$ = sink$.map((o)=> o.deviceIds$).flatten();
    const fisheye$ = sink$.map((o)=> o.fisheye$).flatten();
    runEff(element$.map((element)=>{
      $container.append(element);
    }));
    return {element$, start$, stop$, deviceIds$, fisheye$};
  };
}

function createStyle(id: string): string {
  return `
  `;
}