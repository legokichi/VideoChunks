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
import {fromPromise} from "duxca.lib.js/lib/XStream";
import {dump} from "duxca.lib.js/lib/Algorithm";

import {logger, elogger, clipRect} from "../Util/util";
import {deviceConstraintsSettingView, DeviceConstraints} from "../Util/ViewUtil";
import {fisheyeSettingView, FishEyeProps} from "../Util/ViewUtil";



export interface Sources {
  act$: Stream<{ videoURL: string; startTime: number; }>;
  state$: Stream<"recording"|"paused">;
}

export interface Sinks {
  element$: Stream<HTMLElement>;
  start$: Stream<void>;
  stop$: Stream<void>;
  deviceConstraints$: Stream<DeviceConstraints>;
  fisheyeProps$: Stream<FishEyeProps>;
}

export function main(sources: Sources): Sinks {
  const {act$, state$: _state$} = sources;
  const state$ = _state$.startWith("paused");

  // parameter

  const element = document.createElement("div");
  const DevSetView = deviceConstraintsSettingView();
  const fishSetView = fisheyeSettingView();


  // view
  
  const $element = $(element);
  const $toggle = $("<button />").html("toggle");
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
        DevSetView.element
      ),
      $("<fieldset />").append(
        $("<legend />").html("fisheye"),
        fishSetView.element,
      ),
      $newLens,
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
    $("#camWidth").val(2592).trigger("input");
    $("#camHeight").val(1944).trigger("input");
    $("#left").val(379).trigger("input");
    $("#top").val(10).trigger("input");
    $("#radius").val(879).trigger("input");
  });
  

  // intent

  const toggle$ = on($toggle, "click");
  const start$ = toggle$.compose(sampleCombine(state$)).filter(([_,a])=> a === "paused"   ).map(()=>{ logger("start clicked"); });
  const stop$  = toggle$.compose(sampleCombine(state$)).filter(([_,a])=> a === "recording").map(()=>{ logger("stop clicked"); });
  
  const deviceConstraints$ = DevSetView.deviceConstraints$.map((a)=>{
    logger("deviceConstraints: "+dump(a, 1));
    return a;
  });
  const fisheyeProps$ = fishSetView.fisheyeProps$.map((a)=>{
    logger("fisheyeProps: "+dump(a, 1));
    return a;
  });
  

  // action

  runEff(state$.map((state)=>{
    $state.html(state);
  }));

  runEff(
    act$
      .map(({videoURL})=> fromPromise(load_video(videoURL, true), elogger(new Error)) )
      .flatten()
      .map((video)=>{
        video.controls = true;
        video.loop = true;
        video.play();
        $(video).appendTo("body"); // for debug
      })
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

  return {element$, start$, stop$, deviceConstraints$, fisheyeProps$};
}

export function makeDriver($container: JQuery) {
  return function(outgoing$: Stream<Sources>): Sinks {
    const sink$ = outgoing$.map(main);
    const element$ = sink$.map((o)=> o.element$).flatten();
    const start$ = sink$.map((o)=> o.start$).flatten();
    const stop$ = sink$.map((o)=> o.stop$).flatten();
    const deviceConstraints$ = sink$.map((o)=> o.deviceConstraints$).flatten();
    const fisheyeProps$ = sink$.map((o)=> o.fisheyeProps$).flatten();
    runEff(element$.map((element)=>{
      $container.append(element);
    }));
    return {element$, start$, stop$, deviceConstraints$, fisheyeProps$};
  };
}

function createStyle(id: string): string {
  return `
  `;
}


