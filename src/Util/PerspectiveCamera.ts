import * as THREE from "three";

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
    //this.camera.position.x = 2000; // for debug
    //this.camera.rotation.y = Math.PI/2; // for debug

    this.scene.add(this.camera);
    this.scene.add(this.local);

    window["camera"] = this;
  }

  getRenderer(ctx: CanvasRenderingContext2D) {
    const {scene, camera, renderer} = this;
    
    const tex = new THREE.Texture(ctx.canvas);
    const mesh = createFisheyeMesh(tex);

    this.unload(); // 以前のパノラマを消す

    this.local.add(mesh);

    this.meshes.push(mesh);
    this.texis.push(tex);

    return function draw(){
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
  const sphere = new THREE.SphereGeometry(1000, MESH_N, MESH_N, Math.PI, Math.PI);
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
  mesh.rotation.x = Math.PI*1/2; // 北緯側の半球になるように回転
  return mesh;
}

