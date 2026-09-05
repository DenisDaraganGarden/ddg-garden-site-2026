import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {bakeLeafAtlas,bakePlantImpostor,makeImpostorMaterial} from '../src/plants/plantAtlases.js';
import {makeOleaster,makeBranchGeometry,makeLeafGeometry} from '../src/plants/oleasterModel.js';
import {PLANT_WIND_GLSL,plantUniforms,updatePlantUniforms} from '../src/plants/plantMaterials.js';

const result={passed:false,checks:{},files:{},previews:[]};
const check=(ok,name)=>{if(!ok)throw Error(name);result.checks[name]=true;};
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(512,512);renderer.setClearColor('#f5f4f0',0);
function read(rt){const pixels=new Uint8Array(rt.width*rt.height*4);renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,pixels);return pixels;}
function hash(bytes){let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619);return h>>>0;}
function canvasFrom(rt,srgb=false){
 const pixels=read(rt),canvas=document.createElement('canvas');canvas.width=rt.width;canvas.height=rt.height;
 const ctx=canvas.getContext('2d'),data=ctx.createImageData(rt.width,rt.height),lut=Array.from({length:256},(_,v)=>Math.round(255*THREE.MathUtils.clamp(v/255<=.0031308?v/255*12.92:1.055*(v/255)**(1/2.4)-.055,0,1)));
 for(let y=0;y<rt.height;y++)for(let x=0;x<rt.width;x++){const a=(y*rt.width+x)*4,b=((rt.height-y-1)*rt.width+x)*4;for(let c=0;c<4;c++)data.data[b+c]=srgb&&c<3?lut[pixels[a+c]]:pixels[a+c];}
 ctx.putImageData(data,0,0);return canvas;
}
function base64(buffer){let s='';const a=new Uint8Array(buffer);for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);}
function windContracts(){
 const geometry=new THREE.BufferGeometry(),positions=[.2,.8,.1,.2,.8,.1,.25,.88,.1,0,0,0];
 for(const [key,values,size]of [['position',positions,3],['leafPivot',[0,0,0,.2,.8,.1,.2,.8,.1,0,0,0],3],['leafAxis',[1,0,0,1,0,0,1,0,0,1,0,0],3],['leafWeight',[0,0,1,0],1],['phase',[0,5.2,5.2,2],1],['plantExposure',[1,1,1,1],1],['probe',[0,1,2,3],1]])geometry.setAttribute(key,new THREE.Float32BufferAttribute(values,size));
 const uniforms=plantUniforms(),material=new THREE.ShaderMaterial({uniforms,vertexShader:PLANT_WIND_GLSL+'\nattribute float probe;varying vec3 vPoint;void main(){vPoint=plantWindPoint(position);gl_Position=vec4(probe*.5-.75,0,0,1);gl_PointSize=1.0;}',fragmentShader:'varying vec3 vPoint;void main(){gl_FragColor=vec4(vPoint,1);}',depthTest:false});
 const scene=new THREE.Scene();scene.add(new THREE.Points(geometry,material));const rt=new THREE.WebGLRenderTarget(4,1,{type:THREE.FloatType,depthBuffer:false}),out=new Float32Array(16),camera=new THREE.Camera();
 let maxGap=0,tipMotion=0;
 for(const seconds of [0,1.7,9,127]){
  updatePlantUniforms(uniforms,{wind:14,windBearing:290,flutter:1,dryness:.2,translucency:.65},seconds);
  renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,4,1,out);
  maxGap=Math.max(maxGap,Math.hypot(out[0]-out[4],out[1]-out[5],out[2]-out[6]));tipMotion=Math.max(tipMotion,Math.hypot(out[8]-.25,out[9]-.88,out[10]-.1));
  check(Math.hypot(out[12],out[13],out[14])<1e-7,'root stays fixed in wind');check(out.every(Number.isFinite),'finite GPU wind');
 }
 check(maxGap<2e-6,'leaf and branch attachment survives wind');check(tipMotion>.01,'live uniform edits move the leaf');result.wind={maxGap,tipMotion};
 geometry.dispose();material.dispose();rt.dispose();
}
function plainGeometry(g){const c=g.clone();for(const key of Object.keys(c.attributes))if(!['position','normal','uv','color'].includes(key))c.deleteAttribute(key);return c;}
function exportLeaves(g){
 const front=plainGeometry(g),back=plainGeometry(g);
 for(const [part,row]of [[front,0],[back,1]]){for(let i=0;i<part.attributes.uv.count;i++)part.attributes.uv.setY(i,part.attributes.uv.getY(i)*.5+row*.5);}
 for(let i=0;i<back.index.count;i+=3){const a=back.index.getX(i);back.index.setX(i,back.index.getX(i+2));back.index.setX(i+2,a);}
 for(let i=0;i<back.attributes.normal.array.length;i++)back.attributes.normal.array[i]*=-1;
 const merged=mergeGeometries([front,back]);front.dispose();back.dispose();return merged;
}
function renderPreview(scene,camera,name){
 const rt=new THREE.WebGLRenderTarget(512,512);renderer.setRenderTarget(rt);renderer.setClearColor('#f5f4f0',1);renderer.render(scene,camera);
 const data=canvasFrom(rt,true).toDataURL('image/png');rt.dispose();result.previews.push({name,data});const img=new Image();img.alt=name;img.src=data;document.body.appendChild(img);
}
try{
 const source=await new THREE.TextureLoader().loadAsync('/textures/plants/oleaster-source.png');source.colorSpace=THREE.SRGBColorSpace;
 const atlas=bakeLeafAtlas(renderer,source),model=makeOleaster(),near={bark:makeBranchGeometry(model),leaf:makeLeafGeometry(model)};
 const pixels=read(atlas.color),normalPixels=read(atlas.normal);let occupied=0;
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]>128)occupied++;check(pixels[i+3]===normalPixels[i+3],'colour and normal share the opacity silhouette');}
 check(occupied/(1024*1024)>.5&&occupied/(1024*1024)<.65,'cutout coverage excludes the generated background');
 check(pixels[3]===0,'atlas corners are transparent');result.alphaCoverage=occupied/(1024*1024);
 const hashes=[],bakes=[];
 for(const dpr of [1,1.5,2]){
  renderer.setPixelRatio(dpr);const baked=bakePlantImpostor(renderer,model,near,atlas);bakes.push(baked);hashes.push(hash(read(baked.color)));
  const p=read(baked.color);for(let cell=0;cell<8;cell++){let n=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(p[(((cell>>2)*256+y)*1024+(cell%4)*256+x)*4+3]>128)n++;check(n>3000&&n<30000,`view ${cell} has a bounded plant silhouette`);}
 }
 check(hashes.every(h=>h===hashes[0]),'impostor bake is identical at DPR 1, 1.5 and 2');result.dprHashes=hashes;
 windContracts();
 const camera=new THREE.PerspectiveCamera(32,1,.02,300);camera.position.set(2.8,1.7,3.5);camera.lookAt(0,.7,0);
 const far=bakes[0],farGeometry=new THREE.PlaneGeometry(far.width,far.height,1,4);farGeometry.translate(0,far.center.y,0);farGeometry.setAttribute('plantExposure',new THREE.InstancedBufferAttribute(new Float32Array([1]),1));
 const farMaterial=makeImpostorMaterial(far),farMesh=new THREE.InstancedMesh(farGeometry,farMaterial,1);farMesh.setMatrixAt(0,new THREE.Matrix4());farMesh.setColorAt(0,new THREE.Color(1,1,1));
 const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#ffffff','#6a6754',1.1));const sun=new THREE.DirectionalLight('#ffffff',2);sun.position.set(3,4,5);scene.add(sun,farMesh);
 const probeRT=new THREE.WebGLRenderTarget(256,256);renderer.setRenderTarget(probeRT);renderer.setClearColor(0,0);renderer.render(scene,camera);const probe=read(probeRT);let green=0,count=0;for(let i=0;i<probe.length;i+=4)if(probe[i+3]>128){green+=probe[i+1];count++;}
 check(count>1000&&green/count>25,'far material remains lit without a vertex-colour attribute');result.farMeanGreen=green/count;probeRT.dispose();renderPreview(scene,camera,'Distant projection enlarged for inspection');scene.remove(farMesh);
 const albedoCanvas=canvasFrom(atlas.color,true),normalCanvas=canvasFrom(atlas.normal),albedo=new THREE.CanvasTexture(albedoCanvas),normal=new THREE.CanvasTexture(normalCanvas);albedo.colorSpace=THREE.SRGBColorSpace;
 result.files['leaf-albedo.png']=albedoCanvas.toDataURL('image/png').split(',')[1];result.files['leaf-normal.png']=normalCanvas.toDataURL('image/png').split(',')[1];
 const variants=[];
 for(const lod of [0,1]){
  const bark=makeBranchGeometry(model,lod),leaf=makeLeafGeometry(model,lod),group=new THREE.Group();group.name='Elaeagnus angustifolia';group.userData={units:'metres',up:'+Y',north:'-Z',seed:model.settings.seed,authoring:'src/plants/oleasterModel.js'};
  group.add(new THREE.Mesh(plainGeometry(bark),new THREE.MeshStandardMaterial({color:'#685b44',roughness:.95,vertexColors:true})),new THREE.Mesh(exportLeaves(leaf),new THREE.MeshStandardMaterial({map:albedo,normalMap:normal,normalScale:new THREE.Vector2(.22,.22),roughness:.73,alphaTest:.43,vertexColors:true})));
  const binary=await new GLTFExporter().parseAsync(group,{binary:true});result.files[`oleaster-lod${lod}.glb`]=base64(binary);
  const loaded=await new GLTFLoader().parseAsync(binary,'');const bounds=new THREE.Box3().setFromObject(loaded.scene);check(Math.abs(bounds.max.y-near.leaf.boundingBox.max.y)<.001,`GLB ${lod} restores physical height`);
  let triangles=0;loaded.scene.traverse(o=>{if(o.isMesh)triangles+=o.geometry.index.count/3;});variants.push({lod,runtimeTriangles:(bark.index.count+leaf.index.count)/3,exportTriangles:triangles,bytes:binary.byteLength});
  scene.add(loaded.scene);renderPreview(scene,camera,`GLB LOD ${lod} round trip`);scene.remove(loaded.scene);
  for(const root of [group,loaded.scene])root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});bark.dispose();leaf.dispose();
 }
 result.manifest={id:'oleaster',version:1,units:'metres',up:'+Y',north:'-Z',east:'+X',root:[0,0,0],seed:model.settings.seed,settings:model.settings,leaves:model.leaves.length,branches:model.branches.length,bounds:{min:near.bark.boundingBox.clone().union(near.leaf.boundingBox).min.toArray(),max:near.bark.boundingBox.clone().union(near.leaf.boundingBox).max.toArray()},variants,distant:{runtimeTriangles:8,views:8,atlas:[1024,512]},generator:'node scripts/generate-oleaster.mjs',authoring:'src/plants/oleasterModel.js',material:'RGBA colour + tangent normal; explicit front/back in GLB. Runtime adds wind, bark grain and leaf translucency.'};
 albedo.dispose();normal.dispose();for(const b of bakes)b.dispose();farGeometry.dispose();farMaterial.dispose();near.bark.dispose();near.leaf.dispose();atlas.dispose();source.dispose();result.passed=true;
}catch(error){result.error=error.stack;}finally{renderer.dispose();window.plantGpuResult=result;document.querySelector('#result').textContent=JSON.stringify({...result,files:Object.keys(result.files),previews:result.previews.map(p=>p.name)},null,2);}
