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
import {on, touchstart, touchmove, touchend} from "duxca.lib.js/lib/XStream2JQuery";

import {PerspectiveCamera} from "../Util/PerspectiveCamera";
import {getInputStreamWithStorage} from "../Util/ViewUtil";

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
      pastTime: 0,
      fov:  { pitch: Math.PI*1/8, yaw: 0 },
      rect: { centerX: 1259, centerY: 887, radius: 879 },
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
      videoURL: URLString;
      startTime: UNIXTime;
      pastTime: Second;
      fov: { pitch: Radian; yaw: Radian; };
      rect: { centerX: Pixel; centerY: Pixel; radius: Pixel; };
      storage: Storage;
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
    const $centerX     = $("<input />").attr({type: "number", name: "centerX", id: "centerX"}).val(300);
    const $centerY     = $("<input />").attr({type: "number", name: "centerY", id: "centerY"}).val(0);
    const $radius      = $("<input />").attr({type: "number", name: "radius",  id: "radius"}).val(875);
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
      .map(([video, {pastTime}])=>{
        video.currentTime = pastTime; // 初期シーク位置
        return fromPromise<HTMLVideoElement>(EV.fromEvent(video, "seeked").then(()=> video));
      }).flatten();

    // レンダラ
    const renderer$  = video$
      .map((video)=>{
        const {videoWidth, videoHeight} = video;

        video.controls = true; // for debug
        video.loop = true; // for debug
        video.play(); // for debug
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

      // 初期値
      runEff(
        props$
          .map(({fov: {pitch, yaw}})=>{
            cam.setCameraPose(pitch, yaw);
          })
      );
    })();

    (()=>{
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
      // 初期値
      cam.camera.zoom = Number($zoom.val());
      cam.camera.updateProjectionMatrix();
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

    // シークバー
    runEff(xs.merge(
      // seekstart
      touchstart($seek)
        .compose(sampleCombine(video$))
        .map(([_, video])=>{ video.pause(); }),
      // seekend
      touchend($seek)
        .compose(sampleCombine(video$))
        .map(([_, video])=>{ video.play(); }),
      // seeking
      on($seek, "input")
        .compose(sampleCombine(video$))
        .map(([a, video])=>{
          const range = Number($seek.val());
          video.currentTime = video.duration * range;
        }),
      // playing
      frame$
        .compose(sampleCombine(video$)) // シーク反映
        .map(([_, video])=>{ $seek.val(video.currentTime/video.duration); }),
    ));

    // 経過時間
    runEff(
      frame$
        .compose(sampleCombine(video$, props$))
        .map(([_, video, {startTime}])=>{
          const virtualTime = startTime + video.currentTime * 1000;
          $virtualTime.html(formatDate(new Date(virtualTime), "YYYY MM/DD hh:mm:ss"));
        })
    );
    

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
        const centerX$ = getInputStreamWithStorage<number>(localStorage, $centerX, "centerX", "input");
        const centerY$ = getInputStreamWithStorage<number>(localStorage, $centerY, "centerY", "input");
        const radius$  = getInputStreamWithStorage<number>(localStorage, $radius,  "radius",  "input");
        return xs.combine(centerX$, centerY$, radius$)
          .map(([centerX, centerY, radius])=> ({centerX, centerY, radius}) );
      })();

      runEff(
        xs.combine(xs.merge(frame$, fromEvent(emitter, "render")), renderer$, fisheyeProps$)
          .map(([_, renderer, {centerX, centerY, radius}])=>{ renderer(centerX, centerY, radius); })
      );

      // 初期値設定
      runEff(
        props$
          .map(({rect: {centerX, centerY, radius}})=>{
            $centerX.val(centerX).trigger("input");
            $centerY.val(centerY).trigger("input");
            $radius.val(radius).trigger("input");
          })
      );
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

