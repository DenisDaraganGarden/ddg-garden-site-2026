import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Art-directed clear atmosphere for comparing cloud shapes. It shares the
// solved solar direction/colour, but does not replace the product's sky LUT.
export default function CloudBackdrop({uniforms}) {
  const geometry=useMemo(()=>{
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));return g;
  },[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  const material=useMemo(()=>new THREE.ShaderMaterial({uniforms,depthWrite:false,depthTest:true,toneMapped:true,
      vertexShader:`varying vec2 vUv; void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,1.,1.);}`,
      fragmentShader:`
        varying vec2 vUv; uniform mat4 uInvProjection;uniform mat4 uInvView;
        uniform vec3 uSun;uniform vec3 uSunColor;uniform float uDay;uniform float uHaze;
        void main(){
          vec4 view=uInvProjection*vec4(vUv*2.-1.,1.,1.);
          vec3 ray=normalize(mat3(uInvView)*(view.xyz/view.w));
          float warm=1.-smoothstep(.02,.28,uSun.y);
          float h=pow(clamp(ray.y,0.,1.),.38);
          vec3 zenith=mix(vec3(.021,.14,.34),vec3(.075,.055,.18),warm);
          vec3 horizon=mix(vec3(.38,.57,.73),vec3(.7,.31,.16),warm);
          vec3 sky=mix(horizon,zenith,h);
          float sun=max(0.,dot(ray,normalize(uSun)));
          sky+=uSunColor*pow(sun,18.)*(.04+warm*.09);
          sky+=uSunColor*smoothstep(.99994,.99996,sun)*8.;
          sky*=max(.004,uDay);
          gl_FragColor=vec4(sky,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`}),[uniforms]);
  useEffect(()=>()=>material.dispose(),[material]);
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} dispose={null}/>;
}
