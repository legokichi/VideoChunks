import * as $ from "jquery";

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";
import dropRepeats from "xstream/extra/dropRepeats";
import delay from "xstream/extra/delay";

import {EventEmitter} from "events";

import {on} from "duxca.lib.js/lib/XStream2JQuery";
import {runEff, timeout} from "duxca.lib.js/lib/XStream";
import {load_video} from "duxca.lib.js/lib/Media";
import {load_image} from "duxca.lib.js/lib/Canvas";
import {adapter, fromEvent, fromPromise} from "duxca.lib.js/lib/XStream";
import {dump} from "duxca.lib.js/lib/Algorithm";

import {logger, elogger, getStorage, clipRect, getThumbnails, createLabel} from "../Util/util";
import {getInputStreamWithStorage, getCombinedSelectStreamWithStorage, getCombinedInputStreamWithStorage} from "../Util/ViewUtil";



export interface Sources {
  act$: Stream<{ videoURL: string; startTime: number; }>;
  state$: Stream<"recording"|"paused">;
}

export interface Sinks {
  element$: Stream<HTMLElement>;
  start$: Stream<void>;
  stop$: Stream<void>;
  deviceConstraints$: Stream<{ audioinput: string, audiooutput: string, videoinput: string, width: number, height: number }>;
}

export function main(sources: Sources): Sinks {
  const {act$, state$: _state$} = sources;
  const state$ = _state$.startWith("paused");
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
  const $left = $("<input />").attr({type: "number", name: "left", id: "left"}).val(300);
  const $top = $("<input />").attr({type: "number", name: "top", id: "top"}).val(300);
  const $radius = $("<input />").attr({type: "number", name: "radius", id: "radius"}).val(300);
  const $state = $("<span />").attr({id: "state"});
  const $log = $("<textarea />").attr({id: "log"});
  const $newLens = $("<button/ >").html("新レンズ");

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
        $("<label />").html("left: ").append($left), $("<br />"),
        $("<label />").html("top: ").append($top), $("<br />"),
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
    $left.val(379).trigger("input");
    $top.val(10).trigger("input");
    $radius.val(879).trigger("input");
  });
  

  // intent

  const toggle$ = on($toggle, "click");
  const start$ = toggle$.compose(sampleCombine(state$)).filter(([_,a])=> a === "paused"   ).map(()=>{ logger("start clicked"); });
  const stop$  = toggle$.compose(sampleCombine(state$)).filter(([_,a])=> a === "recording").map(()=>{ logger("stop clicked"); });
  
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
    return getCombinedInputStreamWithStorage<CamSize>(localStorage, $size).map((a)=>{
      logger("size: "+dump(a, 1));
      return a;
    });
  })();

  const deviceConstraints$ = xs.combine(deviceIds$, size$).map(([a, b])=> ({...a, ...b}));

  const fisheye$ = (function() {
    type FishEyeProp = { left: number; top: number; radius: number; };
    const $fisheye   = { left: $left,  top: $top,   radius: $radius };
    return getCombinedInputStreamWithStorage<FishEyeProp>(localStorage, $fisheye).map((a)=>{
      logger("fisheye: "+dump(a, 1));
      return a;
    });
  })();


  // action

  runEff(state$.map((state)=>{
    $state.html(state);
  }));

  const frame$ = xs.combine(timeout(1000), fisheye$).map(([_, a])=> a);

  runEff(
    act$
      .map(({videoURL})=> fromPromise(load_video(videoURL, true), elogger(new Error)) )
      .flatten()
      .map((video)=>{
        video.controls = true;
        video.loop = true;
        video.play();
        const {clip, ctx} = clipRect(video);
        $(ctx.canvas).appendTo("body"); // for debug
        $(video).appendTo("body"); // for debug
        return frame$.map(({left, top, radius})=>{ clip(left, top, radius); });
      })
      .flatten()
  );
/*
    return fromPromise((async ()=>{
      
      const thumbnailBlobs = await getThumbnails(video, 1);
      thumbnailBlobs
        .map(URL.createObjectURL.bind(URL))
        .map(load_image)
        .map((a)=>
          a.then((a)=>
            $(a).appendTo("body") ) );
      return eff$;

*/
  


  const element$ = xs.of(element);

  return {element$, start$, stop$, deviceConstraints$};
}

export function makeDriver($container: JQuery) {
  return function(outgoing$: Stream<Sources>): Sinks {
    const sink$ = outgoing$.map(main);
    const element$ = sink$.map((o)=> o.element$).flatten();
    const start$ = sink$.map((o)=> o.start$).flatten();
    const stop$ = sink$.map((o)=> o.stop$).flatten();
    const deviceConstraints$ = sink$.map((o)=> o.deviceConstraints$).flatten();
    runEff(element$.map((element)=>{
      $container.append(element);
    }));
    return {element$, start$, stop$, deviceConstraints$};
  };
}

function createStyle(id: string): string {
  return `
  `;
}

