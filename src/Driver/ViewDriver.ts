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

import {REC_FPS} from "../Component/Main";

import {logger, elogger} from "../Util/util";
import {deviceConstraintsSettingView, DeviceConstraints} from "../Util/ViewUtil";
import {fisheyeSettingView, FishEyeProps} from "../Util/ViewUtil";
import {clippedVideoView} from "../Util/ViewUtil";


export interface Sources {
  act$: Stream<{ videoURL: string; startTime: number; }>;
  state$: Stream<"recording"|"paused">;
}

export interface Sinks {
  element$: Stream<HTMLElement>;
  start$: Stream<void>;
  stop$: Stream<void>;
  deviceConstraints$: Stream<DeviceConstraints>;
}

export function main(sources: Sources): Sinks {
  const {act$, state$: _state$} = sources;
  const state$ = _state$.startWith("paused");

  // parameter

  const element = document.createElement("div");
  const DevSetView = deviceConstraintsSettingView();
  const fishSetView = fisheyeSettingView();
  const fisheyeProps$ = fishSetView.fisheyeProps$.map((a)=>{
    logger("fisheyeProps: "+dump(a, 1));
    return a;
  });
  const CVV = clippedVideoView(REC_FPS, act$.map((o)=> o.videoURL), fisheyeProps$);

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
      CVV.element
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


  // action

  runEff(state$.map((state)=>{
    $state.html(state);
  }));



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


