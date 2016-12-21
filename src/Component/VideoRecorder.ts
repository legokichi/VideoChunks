import * as Cycle from '@cycle/xstream-run';

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";
import dropRepeats from "xstream/extra/dropRepeats";
import delay from "xstream/extra/delay";

import * as $ from "jquery";

import {EventEmitter} from "events";

import {dump} from "duxca.lib.js/lib/Algorithm";
import {loadMediaStream, loadVideo} from "duxca.lib.js/lib/Media";
import {adapter, fromEvent, fromPromise, timeout, runEff} from "duxca.lib.js/lib/XStream";
import {on} from "duxca.lib.js/lib/XStream2JQuery";

import * as CV from "../Component/ClippedVideo";
import * as RD from "../Driver/RecorderDriver";

import {deviceConstraintsSettingView, DeviceConstraints} from "../Util/ViewUtil";
import {fisheyeSettingView, FishEyeProps} from "../Util/ViewUtil";
import {logger, elogger} from "../Util/util";


export function run($container: JQuery){
  Cycle.run(adapter(Component.main), {
    View: View.makeDriver($container),
  });
}

export module Component {

  export interface Sources {
    View: View.Sinks;
  }

  export interface Sinks {
    View: View.Sources;
  }

  export function main(sources: Sources): Sinks {
    const {start$, stop$, deviceConstraints$, fisheyeProps$} = sources.View;

    // state

    // start 系列
    const {ended$: props$, state$} = RD.main({start$, stop$, deviceConstraints$, fisheyeProps$});
    

    return {
      View: {props$, state$},
    };
  }
}



export module View {

  export interface Sources {
    props$: Stream<{ videoURL: string; startTime: number; }>;
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
    const {props$, state$: _state$} = sources;
    const state$ = _state$.startWith("paused");

    // parameter

    const element = document.createElement("div");
    const DevSetView = deviceConstraintsSettingView();
    const fishSetView = fisheyeSettingView();
    const fisheyeProps$ = fishSetView.fisheyeProps$.map((a)=>{
      logger("fisheyeProps: "+dump(a, 1));
      return a;
    });
    runEff(
      props$
        .map(({videoURL})=>{
          const video = document.createElement("video");
          video.src = videoURL;
          $(video).appendTo("body");
        })
    );
    //const props$ = xs.create<CV.View.Props>();
    //const CVM = CV.View.main({props$});

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
        $newLens
      ),
      $("<fieldset />").append(
        $("<legend />").html("log"),
        $log.css({width: "100%", height: "30em"})
      )
    );

    //CVM.element$.map((element)=>{ $element.append(element); })
    //{videoURL, startTime, pastTime, fisheye, storate: localStorage}}

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
      $("#left").val(370).trigger("input");
      $("#top").val(6).trigger("input");
      $("#radius").val(882).trigger("input");
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

}