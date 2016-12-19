import * as Cycle from '@cycle/xstream-run';

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";
import dropRepeats from "xstream/extra/dropRepeats";
import delay from "xstream/extra/delay";

import * as View from "../Driver/ViewDriver";

import {adapter, fromEvent, fromPromise, timeout, runEff} from "duxca.lib.js/lib/XStream";
import {loadMediaStream, load_video} from "duxca.lib.js/lib/Media";

import {logger, elogger} from "../Util/util";
import {FishEyeProps} from "../Util/ViewUtil";
import * as RD from "../Driver/RecorderDriver";


export interface Sources {
  View: View.Sinks;
}

export interface Sinks {
  View: View.Sources;
}

export const REC_FPS = 15;

export function main(sources: Sources): Sinks {
  const {start$, stop$, deviceConstraints$} = sources.View;

  // state

  // start 系列
  const {ended$: act$, state$} = RD.main({start$, stop$, deviceConstraints$});
  

  return {
    View: {act$, state$},
  };
}


export function run($container: JQuery){
  Cycle.run(adapter(main), {
    View: View.makeDriver($container),
  });
}






