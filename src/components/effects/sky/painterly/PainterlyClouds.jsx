import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { buildCloudNoise } from './cloudNoise';
import { volumeFragment, volumeVertex, shadowVolumeFragment } from './cloudVolumeShaders';
import CloudLightShafts from './CloudLightShafts';
import { createCloudGpuTimer } from './gpuCloudTimer';
import { getRenderTargetCapabilities } from '../../renderTargetCapabilities';
import LightningBolt from './LightningBolt';
import { advanceLightning, createLightningState, takeThunder } from './lightning';

const EXTENT = 24000;
const PROFILE = {
  low: { ratio: .4, steps: 24, noise: 64, shadow: 256, hz: 6, atlas: 256 },
  balanced: { ratio: .55, steps: 40, noise: 64, shadow: 384, hz: 10, atlas: 512 },
  high: { ratio: .75, steps: 64, noise: 96, shadow: 512, hz: 12, atlas: 768 },
  // Full-resolution buffer, fine steps inside cloud and six sun taps: for a
  // still frame or a strong GPU, not a promise of frame rate.
  ultra: { ratio: 1, steps: 96, noise: 96, shadow: 768, hz: 15, atlas: 1024 },
};
const clamp = THREE.MathUtils.clamp;
// Linear radiance of a stroke inside the volume: bluish white, well above the
// sun so the interior around the channel reads as lit from within.
const FLASH_COLOR = new THREE.Color(0.8, 0.86, 1).multiplyScalar(5);
// Irradiance the same stroke puts on ground, water and plants, in the units of
// the key light's scene intensity: a strike a kilometre away lights the shore
// for a frame about as hard as a noon sun.
const FLASH_SCENE_COLOR = new THREE.Color(0.8, 0.86, 1).multiplyScalar(3);
const skyVertex = /* glsl */`
  varying vec2 vUv;
  void main() { vUv=position.xy*.5+.5; gl_Position=vec4(position.xy,1.,1.); }
`;
const compositeFragment = /* glsl */`
  uniform sampler2D uCloudColor;
  uniform vec2 uCloudTexel;
  varying vec2 vUv;
  void main() {
    vec3 color=texture2D(uCloudColor,vUv).rgb*4.;
    color+=texture2D(uCloudColor,vUv+vec2(uCloudTexel.x,0.)).rgb;
    color+=texture2D(uCloudColor,vUv-vec2(uCloudTexel.x,0.)).rgb;
    color+=texture2D(uCloudColor,vUv+vec2(0.,uCloudTexel.y)).rgb;
    color+=texture2D(uCloudColor,vUv-vec2(0.,uCloudTexel.y)).rgb;
    gl_FragColor=vec4(color*.125,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
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

function createResources(noise, profile, product, colorType) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  const uniforms = {
    uNoise: { value: noise.volume }, uWeather: { value: noise.weather },
    uWind: { value: new THREE.Vector2() }, uCoverage: { value: .65 }, uDensity: { value: 1 },
    uAltitude: { value: 1400 }, uHeight: { value: 2400 }, uScale: { value: 1 }, uLightSteps: { value: 3 },
    uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
    uAmbient: { value: new THREE.Color() }, uHazeColor: { value: new THREE.Color() },
    uHaze: { value: .3 }, uDay: { value: 1 }, uSteps: { value: 40 },
    uInvProjection: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
    uCamera: { value: new THREE.Vector3() }, uResolution: { value: new THREE.Vector2() },
    uOrigin: { value: new THREE.Vector2() }, uExtent: { value: EXTENT }, uSoftness: { value: .3 },
    uRadianceGain: { value: 1 }, uDiscVisible: { value: 1 }, uDiscCosRadius: { value: .99995 },
    uStorm: { value: 0 }, uRain: { value: 0 }, uTime: { value: 0 }, uRainInView: { value: 1 },
    uRainCells: { value: .5 }, uRainDark: { value: .6 }, uFineStep: { value: 1 }, uMoonGate: { value: 0 },
    uFlash: { value: 0 }, uFlashPos: { value: new THREE.Vector3(0, 1800, -4000) }, uFlashColor: { value: FLASH_COLOR.clone() },
    uMoonDirection: { value: new THREE.Vector3(0, -1, 0) }, uMoonSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uMoonRadiance: { value: new THREE.Color(0, 0, 0) }, uMoonCosRadius: { value: Math.cos(.26 * Math.PI / 180) },
    uStarAxis: { value: new THREE.Vector3(1, 0, 0) }, uStarRotation: { value: 0 }, uStars: { value: 0 }, uNight: { value: 0 },
  };
  const target = (w,h,type=THREE.UnsignedByteType) => new THREE.WebGLRenderTarget(w,h,{type,depthBuffer:false,stencilBuffer:false,generateMipmaps:false});
  const volumeTarget=target(1,1,colorType);
  const shadowTarget=target(profile.shadow,profile.shadow), shadowRaw=shadowTarget.clone(), shadowBlur=shadowTarget.clone();
  volumeTarget.texture.name='cloud-volume-half-resolution';
  shadowTarget.texture.name='cloud-direct-transmission';
  const pass=(fragmentShader,passUniforms=uniforms,defines={})=>{
    const material=new THREE.ShaderMaterial({uniforms:passUniforms,defines,vertexShader:volumeVertex,fragmentShader,depthTest:false,depthWrite:false,toneMapped:false});
    const scene=new THREE.Scene();scene.add(new THREE.Mesh(geometry,material));
    return {material,scene};
  };
  const volume=pass(volumeFragment),shadow=pass(shadowVolumeFragment);
  const blurUniforms={uSource:{value:shadowRaw.texture},uBlurStep:{value:new THREE.Vector2()}};
  const blur=pass(blurFragment,blurUniforms);
  const atlasTarget=product ? target(profile.atlas,profile.atlas/2,colorType) : null;
  if(atlasTarget){
    atlasTarget.texture.name='cloud-water-sky';
    atlasTarget.texture.mapping=THREE.EquirectangularReflectionMapping;
    atlasTarget.texture.colorSpace=THREE.LinearSRGBColorSpace;
    atlasTarget.texture.wrapS=THREE.RepeatWrapping;
  }
  const atlas=product ? pass(volumeFragment,uniforms,{CLOUD_SKY_ATLAS:1}) : null;
  const composite=new THREE.ShaderMaterial({uniforms:{uCloudColor:{value:volumeTarget.texture},uCloudTexel:{value:new THREE.Vector2(1,1)}},
    vertexShader:skyVertex,fragmentShader:compositeFragment,depthTest:true,depthWrite:false,toneMapped:true});
  return {
    geometry,uniforms,volumeTarget,shadowTarget,shadowRaw,shadowBlur,blurUniforms,blur,volume,shadow,atlasTarget,atlas,composite,camera:new THREE.Camera(),
    descriptor:{texture:shadowTarget.texture,origin:uniforms.uOrigin.value,extent:EXTENT,sun:uniforms.uSun.value,strength:0,enabled:false,
      altitude:1400,height:2400,skyTexture:null,skyTexel:new THREE.Vector2(1/profile.atlas,2/profile.atlas),environment:null,
      flash:0,flashPosition:uniforms.uFlashPos.value,flashColor:FLASH_SCENE_COLOR,
      weather:noise.weather,wind:uniforms.uWind.value,weatherPeriod:18000,rain:0,rainCells:.5,storm:0,rainInPost:false,rainDrops:.6,rainDropSize:1},
    dispose(){
      geometry.dispose();composite.dispose();
      for(const p of [volume,shadow,blur,atlas])p?.material.dispose();
      for(const t of [volumeTarget,shadowTarget,shadowRaw,shadowBlur,atlasTarget])t?.dispose();
    },
  };
}

// Every offscreen pass restores the host viewport, including its scissor and
// clear state. No cloud pass owns the scene camera or changes an authored lens.
function offscreen(gl, state, draw) {
  const target=gl.getRenderTarget(),autoClear=gl.autoClear,scissorTest=gl.getScissorTest();
  gl.getViewport(state.viewport);gl.getScissor(state.scissor);
  try { gl.autoClear=true;gl.setScissorTest(false);draw(); }
  finally { gl.setRenderTarget(target);gl.setViewport(state.viewport);gl.setScissor(state.scissor);gl.setScissorTest(scissorTest);gl.autoClear=autoClear; }
}

// Strikes land in the strongest weather cells around the camera: the weather
// map is CPU data, so the same field that towers on screen picks the channel.
const FORWARD=new THREE.Vector3();
function pickStrikeTarget(rng,noise,u,camera) {
  const data=noise.weather.image.data,size=256,period=Math.max(18000*u.uScale.value,1);
  // Three strikes in four land ahead of the camera: the spectacle is for the
  // viewer, and a strike behind still lights the scene through the receivers.
  camera.getWorldDirection(FORWARD);
  const yaw=Math.atan2(FORWARD.z,FORWARD.x);
  let best=null,score=-1;
  for(let i=0;i<10;i+=1){
    const angle=rng()<.75?yaw+(rng()-.5)*Math.PI*.8:rng()*Math.PI*2,radius=1800+rng()*6500;
    const x=camera.position.x+Math.cos(angle)*radius,z=camera.position.z+Math.sin(angle)*radius;
    const uvx=((x+u.uWind.value.x)/period)%1,uvz=((z+u.uWind.value.y)/period)%1;
    const px=Math.floor(((uvx+1)%1)*size),pz=Math.floor(((uvz+1)%1)*size);
    const index=(pz*size+px)*4,macro=data[index]/255,tower=data[index+1]/255;
    const value=macro*(.4+tower*.6)+rng()*.08;
    if(value>score){score=value;best={x,z};}
  }
  const base=u.uAltitude.value,height=u.uHeight.value;
  // Cloud-to-ground about half the time; the rest poke out of the base only.
  const toGround=rng()<.55;
  return {x:best.x,z:best.z,top:base+height*(.25+rng()*.2),bottom:toGround?0:base-150-rng()*300};
}

function CloudRuntime({noise,settings,lighting,onStats,onShadow,paused,bakeMs,motion,product=false,visible=true,discVisible=true,sunPower=1,environmentEnabled=false,onStrike,strikeRequest=0}) {
  const {gl,camera,size,invalidate}=useThree();
  const lightning=useMemo(()=>createLightningState(settings.seed),[settings.seed]);
  const bolt=useRef(null),handledStrike=useRef(0);
  // "Strike now" also works while paused: the forced strike advances the storm
  // clock to the flash peak and renders that one frame, so a stroke can be
  // frozen for a look or a screenshot. Each request fires once, even if the
  // state is recreated for a new seed.
  useEffect(()=>{if(strikeRequest>handledStrike.current){handledStrike.current=strikeRequest;lightning.force=true;invalidate();}},[invalidate,lightning,strikeRequest]);
  const profile=PROFILE[settings.quality] ?? PROFILE.balanced;
  const supportsHdr=useMemo(()=>getRenderTargetCapabilities(gl).post.halfFloatDepthStencil,[gl]);
  const colorType=supportsHdr?THREE.HalfFloatType:THREE.UnsignedByteType;
  const resources=useMemo(()=>createResources(noise,profile,product,colorType),[noise,profile,product,colorType]);
  const timer=useMemo(()=>createCloudGpuTimer(gl),[gl]);
  const pmrem=useMemo(()=>product && supportsHdr ? new THREE.PMREMGenerator(gl) : null,[gl,product,supportsHdr]);
  const state=useRef({lastBake:-1,lastEnvironment:-100,frames:0,report:0,viewport:new THREE.Vector4(),scissor:new THREE.Vector4()});
  useEffect(()=>()=>timer.dispose(),[timer]);
  useEffect(()=>()=>pmrem?.dispose(),[pmrem]);
  useEffect(()=>()=>resources.descriptor.environmentTarget?.dispose(),[resources]);
  useEffect(()=>()=>{for(const key of ['ddgClouds','cloudWind','cloudResolution','ddgLightning','ddgStorm'])delete gl.domElement.dataset[key];},[gl]);
  useEffect(()=>{onShadow?.(resources.descriptor);invalidate();return()=>{onShadow?.(null);resources.dispose();};},[resources,onShadow,invalidate]);
  useEffect(()=>{
    resources.volumeTarget.setSize(Math.max(160,Math.round(size.width*profile.ratio)),Math.max(120,Math.round(size.height*profile.ratio)));
    resources.composite.uniforms.uCloudTexel.value.set(1/resources.volumeTarget.width,1/resources.volumeTarget.height);
    invalidate();
  },[resources,size,profile,invalidate]);
  useEffect(()=>{invalidate();},[settings,lighting,paused,visible,discVisible,sunPower,environmentEnabled,invalidate]);

  useFrame((_,rawDelta)=>{
    if(document.hidden)return;
    const s=state.current,u=resources.uniforms,m=motion.current,d=resources.descriptor;
    s.offscreenCalls=0;
    const dt=paused||!_.clock.running ? 0 : Math.min(.05,Math.max(0,rawDelta));
    m.elapsed+=dt;
    const heading=THREE.MathUtils.degToRad(settings.windDirection);
    m.offset.x+=Math.sin(heading)*settings.windSpeed*dt;
    m.offset.y-=Math.cos(heading)*settings.windSpeed*dt;
    u.uWind.value.copy(m.offset);
    u.uCoverage.value=settings.enabled ? settings.coverage : 0;
    u.uDensity.value=settings.density;u.uAltitude.value=settings.altitude;u.uHeight.value=settings.height*2400;
    u.uScale.value=settings.scale;u.uLightSteps.value=settings.quality==='low'?2:settings.quality==='ultra'?6:settings.quality==='high'?4:3;
    u.uFineStep.value=settings.quality==='high'||settings.quality==='ultra'?.5:1;
    u.uSun.value.fromArray(lighting.sky.keyDirection).normalize();
    const elevation=lighting.sky.sunElevationDeg;
    const day=clamp((elevation+5)/15,.006,1),warm=clamp((16-elevation)/20,0,1);
    // A storm deck is lit by a sun it mostly hides and by a greyer sky: the
    // beam and the skylight both dim, and the rain cells darken further below.
    const storm=settings.storm??0;
    u.uSunColor.value.fromArray(lighting.key.colorLinear);
    u.uSunColor.value.multiplyScalar(1.7*Math.max(0,sunPower)/Math.max(.5,u.uSunColor.value.r,u.uSunColor.value.g,u.uSunColor.value.b)*(1-.7*storm));
    u.uAmbient.value.setRGB(.28+warm*.12,.43-warm*.12,.72-warm*.12).multiplyScalar((.015+day*.65)*(1-.5*storm));
    u.uHazeColor.value.setRGB(.4+warm*.24,.57-warm*.15,.75-warm*.32).multiplyScalar((.015+day*.85)*(1-.5*storm));
    u.uHaze.value=settings.haze;u.uDay.value=day;u.uSteps.value=profile.steps;u.uSoftness.value=settings.shadowSoftness;
    u.uStorm.value=settings.storm??0;u.uRain.value=settings.quality==='low'?0:(settings.rain??0);u.uTime.value=m.elapsed;
    u.uRainCells.value=settings.rainCells??.5;u.uRainDark.value=settings.rainDarkness??.6;
    // The product post pass draws the rain with scene depth (over sea and
    // land); this pass then keeps it only for the water atlas and the lab.
    u.uRainInView.value=d.rainInPost?0:1;
    d.weatherPeriod=18000*settings.scale;d.rain=u.uRain.value;d.rainCells=u.uRainCells.value;d.storm=u.uStorm.value;
    d.rainDrops=settings.rainDrops??.6;d.rainDropSize=settings.rainDropSize??1;
    const sky=lighting.sky;
    // Moonlight on the clouds: the key is the moon at night, so the same direct
    // term runs, gated by how much moon there is instead of by the day.
    u.uMoonGate.value=(sky.night??0)*(sky.moonIllumination??0)*(sky.moonBrightness??1)*.09;
    u.uMoonDirection.value.fromArray(sky.moonDirection??[0,-1,0]).normalize();
    u.uMoonSunDirection.value.fromArray(sky.sunDirection??[0,1,0]).normalize();
    u.uMoonRadiance.value.fromArray(sky.moonDiscRadiance??[0,0,0]).multiplyScalar(discVisible?1:0);
    u.uMoonCosRadius.value=sky.moonCosRadius??Math.cos(.26*Math.PI/180);
    u.uStarAxis.value.fromArray(sky.starAxis??[1,0,0]).normalize();u.uStarRotation.value=sky.starRotation??0;
    u.uStars.value=sky.starsIntensity??1;u.uNight.value=sky.night??0;
    // Lightning: the state machine runs on the same paused-aware clock; the
    // bolt mesh, the in-cloud glow and the receivers' flash all read one value.
    advanceLightning(lightning,dt||(lightning.force?.012:0),{lightning:settings.lightning??0,listener:camera.position,pickTarget:rng=>pickStrikeTarget(rng,noise,u,camera)});
    const strike=lightning.strike;
    if(strike){u.uFlashPos.value.set(strike.x,strike.top,strike.z);}
    u.uFlash.value=lightning.flash;
    d.flash=lightning.flash;d.flashPosition=u.uFlashPos.value;
    bolt.current?.sync(lightning);
    for(const clap of takeThunder(lightning))onStrike?.(clap);
    // A live stroke keeps a demand-driven frameloop drawing; a paused clock
    // holds the stroke still and must not spin the loop.
    if(dt>0&&(lightning.flash>0.0005||lightning.strokes.length))invalidate();
    u.uRadianceGain.value=product ? lighting.environment.exposure/.64 : 1;
    u.uDiscVisible.value=discVisible?1:0;u.uDiscCosRadius.value=product ? lighting.sky.keyCosRadius : .99995;
    d.strength=settings.shadowStrength;d.altitude=settings.altitude;d.height=u.uHeight.value;
    // Recenter only on large camera excursions, on the same frame as the map.
    // Ordinary scene motion keeps stable world texels and does not swim shadows.
    const moved=Math.hypot(camera.position.x-u.uOrigin.value.x,camera.position.z-u.uOrigin.value.y)>EXTENT*.18;
    const changed=s.settings!==settings||s.lighting!==lighting||s.visible!==visible||s.sunPower!==sunPower||s.environmentEnabled!==environmentEnabled;
    timer.poll();
    // The shadow map has no flash term and keeps its own cadence. A live stroke
    // re-bakes only the atlas every frame, so the water sees the flash rather
    // than a 100 ms old sky; the cached PMREM skips those frames so a flash is
    // never held as the environment for four seconds.
    const flashing=lightning.flash>0.002;
    const bakeShadow=m.elapsed-s.lastBake>=1/profile.hz||changed||moved;
    if(bakeShadow||flashing){
      if(bakeShadow){s.lastBake=m.elapsed;s.settings=settings;s.lighting=lighting;s.visible=visible;s.sunPower=sunPower;s.environmentEnabled=environmentEnabled;}
      if(moved)u.uOrigin.value.set(Math.round(camera.position.x/1000)*1000,Math.round(camera.position.z/1000)*1000);
      offscreen(gl,s,()=>{
        if(bakeShadow){
          gl.setRenderTarget(resources.shadowRaw);gl.render(resources.shadow.scene,resources.camera);
          const radius=(.25+settings.shadowSoftness*3.)/profile.shadow;
          resources.blurUniforms.uSource.value=resources.shadowRaw.texture;resources.blurUniforms.uBlurStep.value.set(radius,0);
          gl.setRenderTarget(resources.shadowBlur);gl.render(resources.blur.scene,resources.camera);
          resources.blurUniforms.uSource.value=resources.shadowBlur.texture;resources.blurUniforms.uBlurStep.value.set(0,radius);
          gl.setRenderTarget(resources.shadowTarget);gl.render(resources.blur.scene,resources.camera);
          s.offscreenCalls+=3;
        }
        if(resources.atlasTarget){
          u.uCamera.value.set(camera.position.x,0,camera.position.z);
          u.uSteps.value=Math.min(profile.steps,40);
          u.uResolution.value.set(resources.atlasTarget.width,resources.atlasTarget.height);
          gl.setRenderTarget(resources.atlasTarget);gl.render(resources.atlas.scene,resources.camera);
          d.skyTexture=visible?resources.atlasTarget.texture:null;
          s.offscreenCalls++;
          // A small cached PMREM follows weather slowly. Reuse its target and
          // never push generated pixels back to the CPU or into authored state.
          if(pmrem&&environmentEnabled&&(!d.environment||((changed||m.elapsed-s.lastEnvironment>4)&&!flashing))){
            d.environmentTarget=pmrem.fromEquirectangular(resources.atlasTarget.texture,d.environmentTarget??null);
            d.environment=d.environmentTarget.texture;
            s.lastEnvironment=m.elapsed;
          }
        }
        d.enabled=settings.enabled;
      });
    }
    gl.domElement.dataset.cloudWind=`${m.offset.x.toFixed(2)},${m.offset.y.toFixed(2)}`;
  },-4);

  // ScenePostProcessing owns the final draw at priority 1; .5 lets us sample
  // the final camera after its rig and the water captures. The lab uses the
  // normal r3f draw and therefore a negative priority.
  useFrame(()=>{
    const s=state.current,u=resources.uniforms;
    if(!visible||document.hidden)return;
    camera.updateMatrixWorld(true);
    u.uCamera.value.copy(camera.position);u.uInvProjection.value.copy(camera.projectionMatrixInverse);u.uInvView.value.copy(camera.matrixWorld);
    u.uResolution.value.set(resources.volumeTarget.width,resources.volumeTarget.height);u.uSteps.value=profile.steps;
    timer.begin();
    try {offscreen(gl,s,()=>{gl.setRenderTarget(resources.volumeTarget);gl.render(resources.volume.scene,resources.camera);});}
    finally {timer.end();}
    s.offscreenCalls++;s.frames++;
    const now=performance.now();
    if(now-s.report>900){
      const fps=s.report?s.frames*1000/(now-s.report):0;s.report=now;s.frames=0;
      const rendered=s.rendered??{calls:0,triangles:0};
      onStats?.({...rendered,fps,bakeMs,gpuMs:timer.value,ready:true,clouds:1,
        textureMB:(noise.bytes+resources.volumeTarget.width*resources.volumeTarget.height*8+profile.shadow**2*12+(resources.atlasTarget?profile.atlas**2*4:0))/1048576});
    }
    gl.domElement.dataset.cloudResolution=`${resources.volumeTarget.width}×${resources.volumeTarget.height} / ${profile.steps}`;
    gl.domElement.dataset.ddgClouds=product?JSON.stringify({quality:settings.quality,ready:true,atlas:profile.atlas,shadow:profile.shadow,steps:profile.steps,gpuMs:timer.value,storm:u.uStorm.value,strikes:lightning.strikes,flash:Number(lightning.flash.toFixed(3))}):'lab';
    gl.domElement.dataset.ddgLightning=`${lightning.strikes}/${lightning.flash.toFixed(3)}`;
    gl.domElement.dataset.ddgStorm=`${u.uStorm.value}/${u.uRain.value}/${u.uFlash.value.toFixed(3)}`;
  },product?.5:-.5);
  const afterMainRender=renderer=>{const r=renderer.info.render;state.current.rendered={calls:r.calls+state.current.offscreenCalls,triangles:r.triangles+state.current.offscreenCalls};};
  return <group name="painterly-sky" visible={visible}>
    <mesh geometry={resources.geometry} material={resources.composite} frustumCulled={false} renderOrder={3} dispose={null} onAfterRender={afterMainRender}/>
    {(settings.lightning??0)>0||strikeRequest>0?<LightningBolt ref={bolt} onAfterRender={afterMainRender}/>:null}
    {!product&&<CloudLightShafts settings={settings} lighting={lighting} shadow={resources.descriptor} onAfterRender={afterMainRender}/>}
  </group>;
}

export default function PainterlyClouds(props) {
  const {settings}=props;const [baked,setBaked]=useState(null);
  const motion=useRef({elapsed:0,offset:new THREE.Vector2()});
  const size=(PROFILE[settings.quality]??PROFILE.balanced).noise;
  const key=`${settings.seed}/${size}`;
  useEffect(()=>{
    const controller=new AbortController();let asset=null;const started=performance.now();
    buildCloudNoise({seed:settings.seed,size,signal:controller.signal}).then(noise=>{
      if(controller.signal.aborted){noise.dispose();return;}asset=noise;
      setBaked({noise,bakeMs:performance.now()-started,key});
    }).catch(error=>{if(error.name!=='AbortError')console.error('Cloud noise bake failed',error);});
    return()=>{controller.abort();asset?.dispose();};
  },[settings.seed,size,key]);
  if(!baked||baked.key!==key)return null;
  return <CloudRuntime key={baked.key} {...props} noise={baked.noise} bakeMs={baked.bakeMs} motion={motion}/>;
}
