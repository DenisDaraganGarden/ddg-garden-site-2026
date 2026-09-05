import * as THREE from 'three';
import {PLANT_FIELD_GLSL,ecologyUniforms,updateEcologyUniforms,plantDrynessAt} from '../src/plants/plantEcology.js';

export function checkPlantEcologyGpu(renderer,near,leafAtlas,impostor,check){
 const uniforms=ecologyUniforms(),settings={dryness:.48,patchContrast:1,crownVariation:.8,patchScale:5,fieldSeed:71};
 updateEcologyUniforms(uniforms,settings);
 const positions=Array.from({length:384},(_,i)=>[(i%24)*.63-8,Math.floor(i/24)*.09,(i%17)*.77-7]);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions.flat(),3));geometry.setAttribute('probe',new THREE.Float32BufferAttribute(positions.map((_,i)=>i),1));
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:PLANT_FIELD_GLSL+'\nattribute float probe;varying float vDry;void main(){vDry=plantDrynessAt(position,.63);gl_Position=vec4((probe+.5)/384.0*2.0-1.0,0,0,1);gl_PointSize=1.0;}',fragmentShader:'varying float vDry;void main(){gl_FragColor=vec4(vDry,0,0,1);}',depthTest:false});
 const scene=new THREE.Scene();scene.add(new THREE.Points(geometry,material));
 const rt=new THREE.WebGLRenderTarget(384,1,{type:THREE.FloatType,depthBuffer:false}),pixels=new Float32Array(384*4);
 renderer.setRenderTarget(rt);renderer.render(scene,new THREE.Camera());renderer.readRenderTargetPixels(rt,0,0,384,1,pixels);
 let fieldError=0;positions.forEach((p,i)=>{fieldError=Math.max(fieldError,Math.abs(pixels[i*4]-plantDrynessAt(...p,settings,.63)));});
 check(fieldError<.0005,`ecology CPU and GPU agree in metre space (${fieldError}; first ${pixels[0]} / ${plantDrynessAt(...positions[0],settings,.63)})`);
 geometry.dispose();material.dispose();rt.dispose();
 // Render the actual leaf positions and compare with the stored distant atlas.
 // This catches wrong projection bounds, DPR, yaw, coverage and mip decoding.
 const root=new THREE.Vector3(13,5,-24),yaw=1.2,scale=.83;
 const fieldMaterial=isLeaf=>new THREE.ShaderMaterial({uniforms:{...uniforms,uLeaf:{value:isLeaf?1:0},uMap:{value:leafAtlas.color.texture},uRoot:{value:root}},side:isLeaf?THREE.DoubleSide:THREE.FrontSide,
 vertexShader:'varying vec3 vRest;varying vec2 vLeafUv;void main(){vRest=position;vLeafUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1);}',
 fragmentShader:PLANT_FIELD_GLSL+`\nuniform sampler2D uMap;uniform float uLeaf;uniform vec3 uRoot;varying vec3 vRest;varying vec2 vLeafUv;void main(){if(uLeaf>.5&&texture2D(uMap,vec2(vLeafUv.x,vLeafUv.y*.5)).a<.43)discard;vec3 p=uRoot+vec3(vRest.x*${Math.cos(yaw)}+vRest.z*${Math.sin(yaw)},vRest.y,-vRest.x*${Math.sin(yaw)}+vRest.z*${Math.cos(yaw)})*${scale};gl_FragColor=vec4(plantDrynessAt(p,.63),uLeaf,0,1);}`});
 const bark=fieldMaterial(false),leaf=fieldMaterial(true),directScene=new THREE.Scene();directScene.add(new THREE.Mesh(near.bark,bark),new THREE.Mesh(near.leaf,leaf));
 const camera=new THREE.OrthographicCamera(-impostor.width/2,impostor.width/2,impostor.height/2,-impostor.height/2,.01,20);camera.position.copy(impostor.center).add(new THREE.Vector3(0,0,6));camera.lookAt(impostor.center);camera.updateMatrixWorld();
 const direct=new THREE.WebGLRenderTarget(256,256),mask=new Uint8Array(256*256*4),metadata=new Uint8Array(impostor.position.width*impostor.position.height*4);
 let count=0,square=0,maximum=0;const views=[],errors=[];
 renderer.readRenderTargetPixels(impostor.position,0,0,impostor.position.width,impostor.position.height,metadata);
 for(const view of [0,3,8,19]){
  const beforeCount=count,beforeSquare=square;let viewMax=0;
  const angle=(view%8)*Math.PI/4,elevation=Math.floor(view/8)*Math.PI/4;
  camera.position.set(impostor.center.x+Math.sin(angle)*Math.cos(elevation)*6,impostor.center.y+Math.sin(elevation)*6,impostor.center.z+Math.cos(angle)*Math.cos(elevation)*6);
  camera.up.set(-Math.sin(angle)*Math.sin(elevation),Math.cos(elevation),-Math.cos(angle)*Math.sin(elevation));camera.lookAt(impostor.center);camera.updateMatrixWorld();
  renderer.setRenderTarget(direct);renderer.setClearColor(0,0);renderer.render(directScene,camera);renderer.readRenderTargetPixels(direct,0,0,256,256,mask);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   const a=(y*256+x)*4,b=((y+Math.floor(view/4)*256)*1024+x+(view%4)*256)*4;if(mask[a+1]<250||metadata[b+3]<250)continue;
   const local=new THREE.Vector3(metadata[b]/255,metadata[b+1]/255,metadata[b+2]/255).multiply(impostor.size).add(impostor.min).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).multiplyScalar(scale).add(root);
   const error=Math.abs(mask[a]/255-plantDrynessAt(local.x,local.y,local.z,settings,.63));errors.push(error);square+=error*error;maximum=Math.max(maximum,error);viewMax=Math.max(viewMax,error);count++;
  }
  views.push({view,count:count-beforeCount,rms:Math.sqrt((square-beforeSquare)/(count-beforeCount)),maximum:viewMax});
 }
 // Separate subpixel occlusion-edge outliers from the field itself: rendering
 // into a translated atlas tile can resolve a tied leaf differently at an edge.
 const rms=Math.sqrt(square/count),p995=errors.sort((a,b)=>a-b)[Math.floor(errors.length*.995)];
 check(count>3000,'distant ecology checks thousands of actual leaf pixels');
 check(rms<.003&&p995<.008,`distant LOD preserves the original spatial dryness gradient (RMS ${rms}, p99.5 ${p995})`);
 bark.dispose();leaf.dispose();direct.dispose();renderer.setRenderTarget(null);
 return {samples:positions.length,fieldError,atlasViews:4,atlasLeafPixels:count,atlasRms:rms,atlasMax:maximum,atlasP995:p995,views};
}
