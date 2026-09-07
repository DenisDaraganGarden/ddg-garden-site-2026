import * as THREE from 'three';

// WebGL2 RGB-tap adaptation of AMD FSR 1 EASU/RCAS (32-bit path).
// https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/a21ffb8f6c13233ba336352bdff293894c706575/ffx-fsr/ffx_fsr1.h
// Uses ordinary filtered texture fetches at texel centres instead of textureGather,
// and guarded exact reciprocals instead of platform-specific bit approximations.
//
// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

export const UPSCALE_SCALES = Object.freeze({ ultra: 1 / 1.3, quality: 1 / 1.5, balanced: 1 / 1.7 });
export function getSpatialUpscaleSize(width, height, requestedScale) {
  // A narrow letterboxed phone frame may already have fewer than 240 vertical
  // pixels. Further reduction loses thin foliage before any filter can see it.
  const floor = Math.min(1, 240 / Math.max(1, Math.min(width, height)));
  const scale = Math.min(1, Math.max(0.5, floor, Number.isFinite(requestedScale) ? requestedScale : 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export const upscaleVertexShader = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
export const easuFragmentShader = `
varying vec2 vUv;
uniform sampler2D uInput;
uniform vec2 uInputSize;
float lum(vec3 c){return c.g+0.5*(c.r+c.b);}
vec3 load(vec2 p){return texture2D(uInput,(clamp(p,vec2(0.0),uInputSize-1.0)+0.5)/uInputSize).rgb;}
void direction(inout vec2 dir,inout float len,float w,float a,float b,float c,float d,float e){
 vec2 delta=vec2(d-b,e-a);
 vec2 extent=max(abs(vec2(d-c,e-c)),abs(vec2(c-b,c-a)));
 vec2 l=clamp(abs(delta)/max(extent,vec2(0.00001)),0.0,1.0);
 dir+=delta*w;len+=dot(l,l)*w;
}
void tap(inout vec3 color,inout float weight,vec2 offset,vec2 dir,vec2 len,float lobe,float clipPoint,vec3 c){
 vec2 v=vec2(dot(offset,dir),dot(offset,vec2(-dir.y,dir.x)))*len;
 float d2=min(dot(v,v),clipPoint);
 float b=0.4*d2-1.0,a=lobe*d2-1.0;
 float w=(1.5625*b*b-0.5625)*a*a;
 color+=c*w;weight+=w;
}
void main(){
 vec2 position=vUv*uInputSize-0.5,base=floor(position),p=fract(position);
 vec3 b=load(base+vec2(0,-1)),c=load(base+vec2(1,-1));
 vec3 e=load(base+vec2(-1,0)),f=load(base),g=load(base+vec2(1,0)),h=load(base+vec2(2,0));
 vec3 i=load(base+vec2(-1,1)),j=load(base+vec2(0,1)),k=load(base+vec2(1,1)),l=load(base+vec2(2,1));
 vec3 n=load(base+vec2(0,2)),o=load(base+vec2(1,2));
 vec2 dir=vec2(0.0);float len=0.0;
 direction(dir,len,(1.0-p.x)*(1.0-p.y),lum(b),lum(e),lum(f),lum(g),lum(j));
 direction(dir,len,p.x*(1.0-p.y),lum(c),lum(f),lum(g),lum(h),lum(k));
 direction(dir,len,(1.0-p.x)*p.y,lum(f),lum(i),lum(j),lum(k),lum(n));
 direction(dir,len,p.x*p.y,lum(g),lum(j),lum(k),lum(l),lum(o));
 float norm=dot(dir,dir);dir=norm<1.0/32768.0?vec2(1,0):dir*inversesqrt(norm);
 len*=0.5;len*=len;
 float stretch=dot(dir,dir)/max(max(abs(dir.x),abs(dir.y)),0.00001);
 vec2 lengths=vec2(1.0+(stretch-1.0)*len,1.0-0.5*len);
 float lobe=0.5+(0.21-0.5)*len,clipPoint=1.0/lobe;
 vec3 color=vec3(0);float weight=0.0;
 tap(color,weight,vec2(0,-1)-p,dir,lengths,lobe,clipPoint,b);
 tap(color,weight,vec2(1,-1)-p,dir,lengths,lobe,clipPoint,c);
 tap(color,weight,vec2(-1,1)-p,dir,lengths,lobe,clipPoint,i);
 tap(color,weight,vec2(0,1)-p,dir,lengths,lobe,clipPoint,j);
 tap(color,weight,vec2(0,0)-p,dir,lengths,lobe,clipPoint,f);
 tap(color,weight,vec2(-1,0)-p,dir,lengths,lobe,clipPoint,e);
 tap(color,weight,vec2(1,1)-p,dir,lengths,lobe,clipPoint,k);
 tap(color,weight,vec2(2,1)-p,dir,lengths,lobe,clipPoint,l);
 tap(color,weight,vec2(2,0)-p,dir,lengths,lobe,clipPoint,h);
 tap(color,weight,vec2(1,0)-p,dir,lengths,lobe,clipPoint,g);
 tap(color,weight,vec2(1,2)-p,dir,lengths,lobe,clipPoint,o);
 tap(color,weight,vec2(0,2)-p,dir,lengths,lobe,clipPoint,n);
 vec3 minimum=min(min(f,g),min(j,k)),maximum=max(max(f,g),max(j,k));
 gl_FragColor=vec4(clamp(color/max(weight,0.00001),minimum,maximum),1.0);
}`;

export const rcasShaderChunk = `
vec3 ddgRcas(sampler2D source,vec2 uv,vec2 size,float strength){
 vec2 px=1.0/max(size,vec2(1.0));
 vec3 b=texture2D(source,uv-vec2(0,px.y)).rgb,d=texture2D(source,uv-vec2(px.x,0)).rgb;
 vec3 e=texture2D(source,uv).rgb,f=texture2D(source,uv+vec2(px.x,0)).rgb,h=texture2D(source,uv+vec2(0,px.y)).rgb;
 vec3 mn=min(min(b,d),min(f,h)),mx=max(max(b,d),max(f,h));
 vec3 hitMin=min(mn,e)/max(4.0*mx,vec3(0.00001));
 vec3 hitMax=(1.0-max(mx,e))/min(4.0*mn-4.0,vec3(-0.00001));
 vec3 channel=max(-hitMin,hitMax);
 float lobe=max(-0.1875,min(max(max(channel.r,channel.g),channel.b),0.0))*clamp(strength,0.0,1.0);
 return clamp((lobe*(b+d+f+h)+e)/(4.0*lobe+1.0),0.0,1.0);
}
vec3 ddgSrgbEncode(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
vec3 ddgSrgbDecode(vec3 c){return mix(c/12.92,pow(max((c+0.055)/1.055,vec3(0)),vec3(2.4)),step(vec3(0.04045),c));}
`;

export function createSpatialUpscaler() {
  const makeTarget = name => {
    const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false, type: THREE.UnsignedByteType });
    // These values are already display encoded. No automatic decode at sampling.
    target.texture.colorSpace = THREE.NoColorSpace; target.texture.name = name;
    return target;
  };
  const input = makeTarget('fsr1-graded-input'), output = makeTarget('fsr1-easu-output');
  const uniforms = { uInput: { value: input.texture }, uInputSize: { value: new THREE.Vector2(1, 1) } };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: upscaleVertexShader, fragmentShader: easuFragmentShader, depthTest: false, depthWrite: false, toneMapped: false });
  const scene = new THREE.Scene(), geometry = new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(geometry, material));
  return { input, output, scene, uniforms,
    resize(width, height, outputWidth, outputHeight) {
      if (input.width !== width || input.height !== height) input.setSize(width, height);
      if (output.width !== outputWidth || output.height !== outputHeight) output.setSize(outputWidth, outputHeight);
      uniforms.uInputSize.value.set(width, height);
    },
    dispose() { input.dispose(); output.dispose(); material.dispose(); geometry.dispose(); },
  };
}
