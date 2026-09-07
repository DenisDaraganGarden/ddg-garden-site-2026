import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { buildCloudNoise } from './cloudNoise';
import { volumeFragment, volumeVertex, shadowVolumeFragment } from './cloudVolumeShaders';
import CloudLightShafts from './CloudLightShafts';
import CloudBackdrop from './CloudBackdrop';
import {createCloudGpuTimer} from './gpuCloudTimer';

const EXTENT = 24000;
const PROFILE = {
  low: { ratio: .4, steps: 24, noise: 64, shadow: 256, hz: 6 },
  balanced: { ratio: .55, steps: 40, noise: 64, shadow: 384, hz: 10 },
  high: { ratio: .75, steps: 64, noise: 96, shadow: 512, hz: 12 },
};
const clamp = THREE.MathUtils.clamp;

function makeUniforms(noise) {
  return {
    uNoise: { value: noise.volume }, uWeather: { value: noise.weather },
    uWind: { value: new THREE.Vector2() }, uCoverage: { value: .65 }, uDensity: { value: 1 },
    uAltitude: { value: 1400 }, uHeight: { value: 2200 }, uScale: { value: 1 }, uLightSteps: { value: 3 },
    uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
    uAmbient: { value: new THREE.Color() }, uHazeColor: { value: new THREE.Color() },
    uHaze: { value: .3 }, uDay: { value: 1 }, uSteps: { value: 40 },
    uInvProjection: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
    uCamera: { value: new THREE.Vector3() }, uResolution: { value: new THREE.Vector2() },
    uOrigin: { value: new THREE.Vector2() }, uExtent: { value: EXTENT },
    uSoftness: { value: .3 },
  };
}
function screenGeometry() {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  return geometry;
}
const compositeFragment = /* glsl */`
  uniform sampler2D uCloudColor;
  uniform vec2 uCloudTexel;
  varying vec2 vUv;
  void main() {
    vec4 cloud=texture2D(uCloudColor,vUv)*4.;
    cloud+=texture2D(uCloudColor,vUv+vec2(uCloudTexel.x,0.));
    cloud+=texture2D(uCloudColor,vUv-vec2(uCloudTexel.x,0.));
    cloud+=texture2D(uCloudColor,vUv+vec2(0.,uCloudTexel.y));
    cloud+=texture2D(uCloudColor,vUv-vec2(0.,uCloudTexel.y));
    cloud*=.125;
    gl_FragColor=vec4(cloud.rgb/max(cloud.a,.0001),cloud.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <premultiplied_alpha_fragment>
  }
`;

const blurFragment = /* glsl */`
  uniform sampler2D uSource; uniform vec2 uBlurStep; varying vec2 vUv;
  void main(){
    float t=texture2D(uSource,vUv).r*.227027;
    t+=(texture2D(uSource,vUv+uBlurStep*1.384615).r+texture2D(uSource,vUv-uBlurStep*1.384615).r)*.316216;
    t+=(texture2D(uSource,vUv+uBlurStep*3.230769).r+texture2D(uSource,vUv-uBlurStep*3.230769).r)*.070270;
    gl_FragColor=vec4(vec3(t),1.);
  }
`;
function createResources(noise, profile) {
  const geometry=screenGeometry();
  const uniforms=makeUniforms(noise);
  const volumeTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false,stencilBuffer:false});
  const shadowTarget=new THREE.WebGLRenderTarget(profile.shadow,profile.shadow,{depthBuffer:false,stencilBuffer:false});
  volumeTarget.texture.name='cloud-volume-half-resolution';
  volumeTarget.texture.colorSpace=THREE.NoColorSpace;
  shadowTarget.texture.name='cloud-direct-transmission';
  const shadowRaw=shadowTarget.clone(),shadowBlur=shadowTarget.clone();
  const blurUniforms={uSource:{value:shadowRaw.texture},uBlurStep:{value:new THREE.Vector2()}};
  const blurMaterial=new THREE.ShaderMaterial({uniforms:blurUniforms,vertexShader:volumeVertex,fragmentShader:blurFragment,depthTest:false,depthWrite:false});
  const blurScene=new THREE.Scene();blurScene.add(new THREE.Mesh(geometry,blurMaterial));
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:volumeVertex,fragmentShader:volumeFragment,depthTest:false,depthWrite:false});
  const shadowMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:volumeVertex,fragmentShader:shadowVolumeFragment,depthTest:false,depthWrite:false});
  const volumeScene=new THREE.Scene(); volumeScene.add(new THREE.Mesh(geometry,material));
  const shadowScene=new THREE.Scene(); shadowScene.add(new THREE.Mesh(geometry,shadowMaterial));
  const composite=new THREE.ShaderMaterial({uniforms:{uCloudColor:{value:volumeTarget.texture},uCloudTexel:{value:new THREE.Vector2(1,1)}},vertexShader:volumeVertex,
    fragmentShader:compositeFragment,transparent:true,premultipliedAlpha:true,depthTest:false,depthWrite:false,toneMapped:true});
  return { geometry, uniforms, volumeTarget,shadowTarget,shadowRaw,shadowBlur,blurUniforms,blurScene,volumeScene,shadowScene,composite,camera:new THREE.Camera(),
    descriptor:{texture:shadowTarget.texture,origin:uniforms.uOrigin.value,extent:EXTENT},
    dispose(){ geometry.dispose();material.dispose();shadowMaterial.dispose();composite.dispose();volumeTarget.dispose();shadowTarget.dispose();shadowRaw.dispose();shadowBlur.dispose();blurMaterial.dispose(); } };
}

function CloudRuntime({noise,settings,lighting,onStats,onShadow,paused,bakeMs,motion}) {
  const {gl,camera,size,invalidate}=useThree();
  useEffect(()=>{const fov=camera.fov;camera.fov=50;camera.updateProjectionMatrix();invalidate();return()=>{camera.fov=fov;camera.updateProjectionMatrix();};},[camera,invalidate]);
  const profile=PROFILE[settings.quality] ?? PROFILE.balanced;
  const resources=useMemo(()=>createResources(noise,profile),[noise,profile]);
  const timer=useMemo(()=>createCloudGpuTimer(gl),[gl]);
  useEffect(()=>()=>timer.dispose(),[timer]);
  const state=useRef({lastBake:-1,frames:0,report:0,viewport:new THREE.Vector4(),scissor:new THREE.Vector4()});
  useEffect(()=>{onShadow?.(resources.descriptor);invalidate();return()=>{onShadow?.(null);resources.dispose();};},[resources,onShadow,invalidate]);
  useEffect(()=>{
    resources.volumeTarget.setSize(Math.max(160,Math.round(size.width*profile.ratio)),Math.max(120,Math.round(size.height*profile.ratio)));
    resources.composite.uniforms.uCloudTexel.value.set(1/resources.volumeTarget.width,1/resources.volumeTarget.height);
    invalidate();
  },[resources,size,profile,invalidate]);
  useEffect(()=>{invalidate();},[settings,lighting,paused,invalidate]);

  useFrame((_,rawDelta)=>{
    const rendered=state.current.rendered ?? {calls:0,triangles:0};
    const s=state.current,u=resources.uniforms,m=motion.current;
    s.offscreenCalls=1;
    const dt=paused||document.hidden ? 0 : Math.min(.05,Math.max(0,rawDelta));
    m.elapsed+=dt;
    const heading=THREE.MathUtils.degToRad(settings.windDirection);
    m.offset.x+=Math.sin(heading)*settings.windSpeed*dt;
    m.offset.y-=Math.cos(heading)*settings.windSpeed*dt;
    u.uWind.value.copy(m.offset);
    u.uCoverage.value=settings.enabled ? settings.coverage : 0;
    u.uDensity.value=settings.density;
    u.uAltitude.value=settings.altitude;
    u.uHeight.value=settings.height*2400;
    u.uScale.value=settings.scale;u.uLightSteps.value=settings.quality==='low'?2:settings.quality==='high'?4:3;
    u.uSun.value.fromArray(lighting.sky.keyDirection);
    const elevation=lighting.sky.sunElevationDeg;
    const day=clamp((elevation+5)/15,.006,1),warm=clamp((16-elevation)/20,0,1);
    u.uSunColor.value.fromArray(lighting.key.colorLinear);
    u.uSunColor.value.multiplyScalar(1.7/Math.max(.5,u.uSunColor.value.r,u.uSunColor.value.g,u.uSunColor.value.b));
    u.uAmbient.value.setRGB(.28+warm*.12,.43-warm*.12,.72-warm*.12).multiplyScalar(.015+day*.65);
    u.uHazeColor.value.setRGB(.4+warm*.24,.57-warm*.15,.75-warm*.32).multiplyScalar(.015+day*.85);
    u.uHaze.value=settings.haze;u.uDay.value=day;u.uSteps.value=profile.steps;u.uSoftness.value=settings.shadowSoftness;
    u.uCamera.value.copy(camera.position);u.uInvProjection.value.copy(camera.projectionMatrixInverse);u.uInvView.value.copy(camera.matrixWorld);
    u.uResolution.value.set(resources.volumeTarget.width,resources.volumeTarget.height);
    const target=gl.getRenderTarget(),autoClear=gl.autoClear,scissorTest=gl.getScissorTest();
    gl.getViewport(s.viewport);gl.getScissor(s.scissor);
    timer.poll();timer.begin();
    try {
      gl.autoClear=true;gl.setScissorTest(false);
      if(m.elapsed-s.lastBake>=1/profile.hz||s.settings!==settings||s.lighting!==lighting){
        s.offscreenCalls+=3;
        s.lastBake=m.elapsed;s.settings=settings;s.lighting=lighting;
        gl.setRenderTarget(resources.shadowRaw);gl.render(resources.shadowScene,resources.camera);
        const radius=(.25+settings.shadowSoftness*3.)/profile.shadow;
        resources.blurUniforms.uSource.value=resources.shadowRaw.texture;resources.blurUniforms.uBlurStep.value.set(radius,0);
        gl.setRenderTarget(resources.shadowBlur);gl.render(resources.blurScene,resources.camera);
        resources.blurUniforms.uSource.value=resources.shadowBlur.texture;resources.blurUniforms.uBlurStep.value.set(0,radius);
        gl.setRenderTarget(resources.shadowTarget);gl.render(resources.blurScene,resources.camera);
      }
      gl.setRenderTarget(resources.volumeTarget);gl.render(resources.volumeScene,resources.camera);
    } finally {
      timer.end();
      gl.setRenderTarget(target);gl.setViewport(s.viewport);gl.setScissor(s.scissor);gl.setScissorTest(scissorTest);gl.autoClear=autoClear;
    }
    s.frames++;const now=performance.now();
    if(now-s.report>900){
      const fps=s.report ? s.frames*1000/(now-s.report) : 0;s.report=now;s.frames=0;
      onStats?.({...rendered,calls:rendered.calls,triangles:rendered.triangles,fps,bakeMs,gpuMs:timer.value,ready:true,clouds:1,
        textureMB:(noise.bytes+resources.volumeTarget.width*resources.volumeTarget.height*8+profile.shadow**2*12)/1048576});
    }
    gl.domElement.dataset.cloudWind=`${m.offset.x.toFixed(2)},${m.offset.y.toFixed(2)}`;
    gl.domElement.dataset.cloudResolution=`${resources.volumeTarget.width}×${resources.volumeTarget.height} / ${profile.steps}`;
  },-2);
  const afterMainRender=(renderer)=>{const r=renderer.info.render;state.current.rendered={calls:r.calls+state.current.offscreenCalls,triangles:r.triangles+state.current.offscreenCalls};};
  return <><CloudBackdrop uniforms={resources.uniforms}/><mesh geometry={resources.geometry} material={resources.composite} frustumCulled={false} renderOrder={6} dispose={null} onAfterRender={afterMainRender}/><CloudLightShafts settings={settings} lighting={lighting} shadow={resources.descriptor} onAfterRender={afterMainRender}/></>;
}

export default function PainterlyClouds(props) {
  const {settings}=props;const [baked,setBaked]=useState(null);
  const motion=useRef({elapsed:0,offset:new THREE.Vector2()});
  const size=(PROFILE[settings.quality]??PROFILE.balanced).noise;
  const key=`${settings.seed}/${size}`;
  useEffect(()=>{
    const controller=new AbortController();let asset=null;const started=performance.now();
    buildCloudNoise({seed:settings.seed,size,signal:controller.signal}).then((noise)=>{
      if(controller.signal.aborted){noise.dispose();return;}asset=noise;
      setBaked({noise,bakeMs:performance.now()-started,key});
    }).catch((error)=>{if(error.name!=='AbortError')console.error('Cloud noise bake failed',error);});
    return()=>{controller.abort();asset?.dispose();};
  },[settings.seed,size,key]);
  if(!baked||baked.key!==key)return null;
  return <CloudRuntime key={baked.key} {...props} noise={baked.noise} bakeMs={baked.bakeMs} motion={motion}/>;
}
