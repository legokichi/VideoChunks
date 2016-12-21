import * as $ from "jquery";

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";

import {EventEmitter} from "events";


import {load_video} from "duxca.lib.js/lib/Media";
import {fromEvent, fromPromise, timeout, runEff, fromMediaElement} from "duxca.lib.js/lib/XStream";
import {on, touchstart, touchmove, touchend} from "duxca.lib.js/lib/XStream2JQuery";
import {getCombinedSelectStreamWithStorage, getCombinedInputStreamWithStorage, getInputStreamWithStorage} from "duxca.lib.js/lib/XStream2JQuery";
import {getEventPosition} from "duxca.lib.js/lib/Event";

import {PerspectiveCamera} from "./PerspectiveCamera";

import {logger, elogger} from "../Util/util";




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


