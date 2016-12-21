import * as Cycle from '@cycle/xstream-run';

import xs, {Stream} from 'xstream';
import sampleCombine from "xstream/extra/sampleCombine";
import dropRepeats from "xstream/extra/dropRepeats";
import delay from "xstream/extra/delay";

import * as $ from "jquery";

import {EventEmitter} from "events";

import {gensym} from "duxca.lib.js/lib/Algorithm";
import {getEventPosition} from "duxca.lib.js/lib/Event";
import * as EV from "duxca.lib.js/lib/Event";
import {loadVideo} from "duxca.lib.js/lib/Media";
import {formatDate} from "duxca.lib.js/lib/Time";
import {adapter, fromPromise, timeout, runEff, fromMediaElement, fromEvent} from "duxca.lib.js/lib/XStream";
import {on, touchstart, touchmove, touchend, getInputStreamWithStorage, JSONStorage, getItem} from "duxca.lib.js/lib/XStream2JQuery";

import {PerspectiveCamera} from "../Util/PerspectiveCamera";


/*
<object data="images/wave.swf" width="400" height="300">
<p>ご覧の環境では、object要素がサポートされていないようです。embed要素で表示します。</p>
<embed src="images/wave.swf">
</object>
*/

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
    const {} = sources.View;

    // storage だけ渡せばよくね？
    const props$ = xs.of({
      videoURL: "01eb2a76-072c-4195-8c26-a71646b08d2f.webm", //"80eab061-a9b2-49cb-8996-88783a7bc0f8.webm",
      startTime: 1482131209071,
      pastTime: 60,
      fisheye: { centerX: 1259, centerY: 887, radius: 879 },
      storage: localStorage,
    });
    return {
      View: { props$ },
    };
  }
}

export module View {
  export type URLString = string;
  export type UNIXTime  = number;
  export type Second    = number;
  export type Radian    = number;
  export type Pixel     = number;
  export interface Sources {
    props$: Stream<{
      videoURL: URLString; // 固定値
      startTime: UNIXTime; // 固定値
      pastTime: Second; // 優先度: storage = form > props$
      fisheye: { // 優先度: storage = form > props$
        centerX: number;
        centerY: number;
        radius: number;
      };
      storage: JSONStorage;
      /*
      JSONStorage は
      {
        fov?: {pitch: number; yaw: number};
        zoom?: number;
        pastTime?: Second;
        fisheyeProps: ...
      } をもつべきである
      */
    }>;
  }

  export interface Sinks {
    element$: Stream<HTMLElement>;
  }

  export function main(sources: Sources): Sinks {
    const { props$ } = sources;

    const id      = gensym();
    const element = document.createElement("div");
    const cam     = new PerspectiveCamera();
    const FPS     = 15;

    // view  
    const $element     = $(element).attr("id", id);
    const $canvas      = $(cam.canvas).addClass("perspectiveView");
    const $playbtn     = $("<button />").addClass("playbtn").html("toggle");
    const $virtualTime = $("<time />").addClass("virtualTime").html("0");
    const $seek        = $("<input />").addClass("seek").attr({type: "range", min: 0, max: 1, step: 1/1000}).val(0);
    const $zoom        = $("<input />").addClass("zoom").attr({type: "range", min: 0.25, max: 2, step: 1/1000}).val(0.5);
    const $centerX     = $("<input />").attr({type: "number", name: "centerX", id: "centerX"}).val(0);
    const $centerY     = $("<input />").attr({type: "number", name: "centerY", id: "centerY"}).val(0);
    const $radius      = $("<input />").attr({type: "number", name: "radius",  id: "radius"}).val(0);
    const $style       = $("<style />").html(`
      body {
        margin: 0px;
      }
      #${id} > .perspectiveView {
        display: block;
        position: absolute;
        top: 0px;
        left: 0px;
      }
      #${id} .controls {
        display: inline-block;
        position: absolute;
        top: 0px;
        left: 0px;
        user-select: none;
        pointer-events: none;
      }
      #${id} .controls button,
      #${id} .controls input {
        pointer-events: initial;
      }
    `);

    $element.append(
      $style,
      cam.canvas,
      $("<div />").addClass("controls").append(
        $playbtn,
        $("<br />"),
        $("<label />").html("virtualTime: ").append($virtualTime), $("<br />"),
        $("<label />").html("seek: ").append($seek), $("<br />"),
        $("<label />").html("zoom: ").append($zoom), $("<br />"),
        $("<label />").html("centerX: ").append($centerX), $("<br />"),
        $("<label />").html("centerY: ").append($centerY), $("<br />"),
        $("<label />").html("radius: ").append($radius), $("<br />"),
      )
    );
    
    // intent

    // ビデオ要素
    const video$ = props$
      .map(({videoURL})=> fromPromise(loadVideo(videoURL, true)) )
      .flatten()
      .compose(sampleCombine(props$))
      .map(([video, {pastTime, storage}])=>{
        video.currentTime = getItem(storage, "pastTime", Number.isFinite, pastTime); // 初期シーク位置
        $seek.val(video.currentTime/video.duration); // 初期位置を反映
        return fromPromise<HTMLVideoElement>(EV.fromEvent(video, "seeked").then(()=> video));
      }).flatten();

    // レンダラ
    const renderer$  = video$
      .map((video)=>{
        const {videoWidth, videoHeight} = video;

        video.controls = true; // for debug
        //video.loop = true; // for debug
        //video.play(); // for debug
        //$(video).appendTo(".controls"); // for debug

        const size = Math.min(videoWidth, videoHeight);
        for(var i=0; size > Math.pow(2, i); i++); // 2^n の大きさを得る
        const pow = Math.pow(2, i); // ターゲット解像度

        const ctx = <CanvasRenderingContext2D>document.createElement("canvas").getContext("2d");

        // 魚眼プレビュー
        $(ctx.canvas)
          .width("200px")
          .appendTo(".controls");

        const draw = cam.getRenderer(ctx);

        return function renderer(centerX: number, centerY: number, radius: number){
          const clippedWidth  = radius*2;
          const clippedHeight = radius*2;
          const left = centerX - radius;
          const top  = centerY - radius;
          let [sx, sy] = [left, top];
          let [sw, sh] = [clippedWidth, clippedHeight];
          let [dx, dy] = [0, 0];
          let [dw, dh] = [pow, pow]; // 縮小先の大きさ
          // ネガティブマージン 対応
          if(left < 0){
            sx = 0;
            sw = clippedWidth - left;
            dx = -left*pow/clippedWidth;
            dw = sw*pow/clippedWidth;
          }
          if(top < 0){
            sy = 0;
            sh = clippedHeight - top;
            dy = -top*pow/clippedHeight;
            dh = sh*pow/clippedHeight;
          }
          // 2^nな縮拡先の大きさ
          ctx.canvas.width  = pow;
          ctx.canvas.height = pow;
          ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
          draw();
        }
      });

    // 動画の状態
    const {state$} = (()=>{
      const videoSt$ = video$
        .map((video)=> fromMediaElement(video) );
      const state$ = videoSt$
        .map((o)=> o.state$)
        .flatten();
      return {state$};
    })();
    
    // レンダリング頻度
    const frame$    = xs.merge(
      state$.filter((a)=> a === "play").mapTo(FPS),
      state$.filter((a)=> a !== "play").mapTo(-1), )
      .startWith(-1)
      .map((period)=> timeout(period) )
      .flatten();

    // emit(render) で force rendering
    const emitter = new EventEmitter();


    // action
    runEff(
      state$
        .map((state)=>{ $playbtn.html(state); })
    );
    

    (()=>{
      // 注視点変更
      const touchstart$ = touchstart($canvas).map(getEventPosition);
      const touchmove$  = touchmove($canvas).map(getEventPosition);
      const touchend$   = touchend($(window)).map(getEventPosition);

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
      // 現在のあるべき姿勢
      const fov$ = xs.merge(
        deltaPos$
          .map(({deltaX, deltaY})=>{
            const {pitch, yaw} = cam.getCameraPose();
            const alpha = 0.01;
            let   _pitch = pitch + alpha * deltaY;
            const _yaw   = yaw   + alpha * deltaX * -1;
            if(_pitch < Math.PI*1/8){ _pitch = Math.PI*1/8; }
            if(_pitch > (Math.PI/2)*7/8){ _pitch = (Math.PI/2)*7/8; }
            return {pitch: _pitch, yaw: _yaw};
          }),
        props$.map(({storage})=>
          getItem<{pitch:number,yaw:number}>(storage, "fov",
            ({pitch, yaw})=> Number.isFinite(pitch+yaw),
            {pitch: Math.PI*1/8, yaw: 0}) ) // 初期値をストレージから探し、なければデフォルト値
      );
      runEff(
        fov$
          .compose(sampleCombine(props$))
          .map(([{pitch, yaw}, {storage}])=>{
            storage.setItem("fov", JSON.stringify({pitch, yaw})); // ストレージに保存
            cam.setCameraPose(pitch, yaw);
            emitter.emit("render");
          })
      );
    })();

    (()=>{
      // ズーム
      const scale$ = xs.merge(
        on($zoom, "input").map(()=> Number($zoom.val()) ), // form 値
        props$
          .map(({storage})=> getItem(storage, "zoom", Number.isFinite, Number($zoom.val())) ) // 初期値をストレージから探し、なければフォーム値
          .map((scale)=> ($zoom.val(scale), scale) ) // 値をフォームに反映
      );
      runEff(
        scale$
          .compose(sampleCombine(props$))
          .map(([scale, {storage}])=>{
            storage.setItem("zoom", JSON.stringify(scale)); // ストレージに保存
            cam.setZoom(scale); // ビューに反映
            emitter.emit("render");
          })
      );
    })();

    // 再生・一時停止トグル
    runEff(
      on($playbtn, "click")
        .compose(sampleCombine(video$))
        .map(([_, video])=>{
          if(video.paused){ video.play(); }
          else{ video.pause(); }
        })
    );

    const startState$ = touchstart($seek)
      .compose(sampleCombine(video$))
      .map(([_, video])=> video.paused );

    // シークバー
    runEff(xs.merge(
      // seekstart
      startState$
        .compose(sampleCombine(video$))
        .map(([state, video])=>{ video.pause(); }),
      // seekend
      touchend($seek)
        .compose(sampleCombine(startState$, video$))
        .map(([_, paused, video])=>{ if(!paused) video.play(); }),
      // seeking
      on($seek, "input")
        .compose(sampleCombine(video$, props$))
        .map(([a, video, {storage}])=>{
          const range = Number($seek.val());
          video.currentTime = video.duration * range;
          EV.fromEvent(video, "seeked").then(()=>{
            emitter.emit("render");
          });
        }),
      // playing
      frame$
        .compose(sampleCombine(video$)) // シーク反映
        .map(([_, video])=>{ $seek.val(video.currentTime/video.duration); }),
    ));

    (()=>{
      // リサイズ
      runEff(
        on($(window), "resize")
          .map(()=>{ cam.setCanvasSize(window.innerWidth, window.innerHeight); })
      );
      // 初期値
      cam.setCanvasSize(window.innerWidth, window.innerHeight);
    })();

    // レンダリング
    (()=>{

      // 表示位置調整
      const fisheyeProps$ = (function() {
        const centerX$ = props$.map(({fisheye: {centerX}, storage})=> getInputStreamWithStorage<number>(storage, $centerX.val(centerX), "centerX", "input") ).flatten();
        const centerY$ = props$.map(({fisheye: {centerY}, storage})=> getInputStreamWithStorage<number>(storage, $centerY.val(centerY), "centerY", "input") ).flatten();
        const radius$  = props$.map(({fisheye: {radius }, storage})=> getInputStreamWithStorage<number>(storage, $radius.val(radius),   "radius",  "input") ).flatten();
        return xs.combine(centerX$, centerY$, radius$)
          .map(([centerX, centerY, radius])=> ({centerX, centerY, radius}) );
      })();

      runEff(
        xs.combine(
          xs.merge(
            frame$,
            fromEvent(emitter, "render"),
            xs.of("初回レンダリング")
          ),
          renderer$,
          fisheyeProps$,
          video$,
          props$
        )
          .map(([_, renderer, {centerX, centerY, radius}, video, {startTime, storage}])=>{
            renderer(centerX, centerY, radius);
            // 時間
            const virtualTime = startTime + video.currentTime * 1000;
            $virtualTime.html(formatDate(new Date(virtualTime), "YYYY MM/DD hh:mm:ss"));
            const pastTime = video.currentTime;
            storage.setItem("pastTime", JSON.stringify(pastTime));
          })
      );

      // 初期値は storage の中
    })();

    const element$ = xs.of(element);
    return {element$};
  }

  export function makeDriver($container: JQuery) {
    return function(outgoing$: Stream<Sources>): Sinks {
      const sink$ = outgoing$.map(main);
      const element$ = sink$.map((o)=> o.element$).flatten();
      runEff(element$.map((element)=>{
        $container.append(element);
      }));
      return {element$};
    };
  }
}

