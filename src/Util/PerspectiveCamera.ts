import * as THREE from "three";

import {load_video} from "duxca.lib.js/lib/Media";
import {logger} from "./util";

export class PerspectiveCamera {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  meshes: THREE.Mesh[];
  texis: THREE.Texture[];
  local: THREE.Object3D;
  controls: any;

  constructor(){
    this.renderer = new THREE.WebGLRenderer();
    //this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.canvas = this.renderer.domElement;
    this.scene = new THREE.Scene();

    // 画角, アスペクト比、視程近距離、視程遠距離
    this.camera = new THREE.PerspectiveCamera( 30, 4 / 3, 1, 10000 );

    this.local = new THREE.Object3D();
    this.meshes = [];
    this.texis = [];

    this.local.position.z = 0;
    this.camera.position.z = 0.01;

    this.scene.add(this.camera);
    this.scene.add(this.local);

    window["camera"] = this;
  }

  getRendererFromVideo(video: HTMLVideoElement) {
    const {scene, camera, renderer} = this;

    const size = Math.min(video.videoWidth, video.videoHeight);
    for(var i=0; size > Math.pow(2, i); i++); // 2^n の大きさを得る
    const pow = Math.pow(2, i); // 解像度 // i+1 オーバーサンプリングして解像度をより高く

    const {ctx, clip} = clipRect(video, 0, 0, size/2, pow);

    //document.body.appendChild(video); // for debug
    //document.body.appendChild(ctx.canvas); // for debug
    
    const tex = new THREE.Texture(ctx.canvas);
    const mesh = createFisheyeMesh(tex);

    this.unload(); // 以前のパノラマを消す

    this.local.add(mesh);

    this.meshes.push(mesh);
    this.texis.push(tex);

    return function draw(left: number, top: number, radius: number){
      clip(left, top, radius);
      tex.needsUpdate = true;
      renderer.render(scene, camera);
    }
  }

  setCanvasSize(w: number, h: number): void {
    // 現在のレンダラを現在のピクセルサイズに最適化する
    this.renderer.setSize(w, h)
    // カメラのアス比も設定
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  getCanvasSize(): {width: number, height: number} {
    return this.renderer.getSize();
  }

  setCameraPose(pitch: number, yaw: number): void {
    const {camera, local} = this;
  
    camera.rotation.x = pitch;
    local.rotation.y = yaw;
  }
  getCameraPose(): {pitch: number, yaw: number} {
    const {camera, local} = this;
    const {x: pitch} = camera.rotation;
    const {y: yaw} = local.rotation;
    return {pitch, yaw};
  }

  unload(): void {
    // 以前のリソースを消す
    this.meshes.forEach((mesh)=>{
      this.local.remove( mesh );
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this.texis.forEach((tex)=>{
      tex.dispose();
    });
    this.meshes = [];
    this.texis = [];
  }
}


export function createFisheyeMesh(fisheye_texture: THREE.Texture): THREE.Mesh { // 正方形テクスチャを仮定
  const MESH_N = 64;
  // SphereGeometry(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength)
  const sphere = new THREE.SphereGeometry(1000, MESH_N, MESH_N, 0, Math.PI);
  const {vertices, faces, faceVertexUvs} = sphere;
  const radius = sphere.boundingSphere.radius;
  // 半球の正射影をとる
  faces.forEach((face, i)=>{
    const {a, b, c} = face;
    faceVertexUvs[0][i] = [a, b, c].map((id)=>{
      const {x, y} = vertices[id];
      return new THREE.Vector2(
        (x+radius)/(2*radius),
        (y+radius)/(2*radius));
    });
  });
  const mat = new THREE.MeshBasicMaterial( { color: 0xFFFFFF, map: fisheye_texture, side: THREE.BackSide } );
  const mesh = new THREE.Mesh(sphere, mat);
  mesh.rotation.x = Math.PI*3/2; // 北緯側の半球になるように回転
  return mesh;
}


export function clipRect(
  video: HTMLVideoElement,
  left=0,
  top=0,
  radius=Math.min(video.videoWidth, video.videoHeight)/2,
  targetWidth?: number
): {
    clip: (left: number, top: number, radius: number)=>void,
    ctx: CanvasRenderingContext2D
  } {
  const cnv = document.createElement("canvas");
  const ctx = <CanvasRenderingContext2D>cnv.getContext("2d");
  const {videoWidth, videoHeight} = video;
  let [sx, sy, sw, sh, dx, dy, dw, dh] = [0,0,0,0,0,0,0,0];
  logger(`source video size${videoWidth}x${videoHeight}`);
  update(left, top, radius);
  //document.body.appendChild(video); // for debug
  //document.body.appendChild(cnv); // for debug
  let [l, t, r] = [left, top, radius];　// メモ化用の引数キャッシュ
  return {ctx, clip};
  function clip(left: number, top: number, radius: number){
    if(l !== left || t !== top || r !== radius){ // どれかひとつでも以前と異なっていたら
      update(left, top, radius);
      [l, t, r] = [left, top, radius];
    }else{
      cnv.width = cnv.width;
    }
    ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  function update(left: number, top: number, radius: number){
    // side-effect function
    const o = calc(left, top, radius, targetWidth);
    //　構造化代入は再代入に使えない！
    sx = o.sx;
    sy = o.sy;
    sw = o.sw;
    sh = o.sh;
    dx = o.dx;
    dy = o.dy;
    dw = o.dw;
    dh = o.dh;
    cnv.width = dw;
    cnv.height = dh;
  }
  function calc(left: number, top: number, radius: number, targetWidth?: number){
    // pure function
    const clippedWidth  = radius*2; // 
    const clippedHeight = radius*2; 
    logger(`clipped size${clippedWidth}x${clippedHeight}, (${left},${top})`);
    let pow = clippedHeight;
    if(targetWidth != null){
      pow = targetWidth;
      //for(var i=0; clippedHeight > Math.pow(2, i); i++); // 2^n の大きさを得る
      //pow = Math.pow(2, i); // 解像度 // i+1 オーバーサンプリングして解像度をより高く
    }
    let sx = left;
    let sw = clippedWidth;
    let sy = top;
    let sh = clippedHeight;
    let dx = 0;
    let dy = 0;
    let dw = pow;
    let dh = pow; // 縮小先の大きさ
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
    logger(`target fisheye size: ${dw}x${dh}`);
    return {sx, sy, sw, sh, dx, dy, dw, dh};
  }
}


