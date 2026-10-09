import * as THREE from 'three';

// The same periodic, procedural field drives colour, per-scale roughness and
// relief. Hardware mipmaps and anisotropy retain detail at grazing angles.
let leatherMaps, maxAnisotropy=1;
export function configureLeatherFiltering(value) { maxAnisotropy=value; }
function proceduralLeatherMaps() {
  if(leatherMaps) return leatherMaps;
  const size=1024, cells=32, heights=new Float32Array(size*size), field=new Uint8Array(size*size*4), normals=new Uint8Array(size*size*4);
  const wrap=n=>(n%cells+cells)%cells;
  const random=(x,y,salt=0)=>{let n=Math.imul(wrap(x)+11,374761393)^Math.imul(wrap(y)+19,668265263)^salt;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const px=(x+.5)*cells/size,py=(y+.5)*cells*.78/size,cx=Math.floor(px),cy=Math.floor(py/.78);
    let distance=10,seed=.5;
    for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++) {
      const a=cx+i,b=cy+j;
      const dx=(px-(a+.5+(wrap(b)%2)*.5)-(random(a,b)-.5)*.09)/.52;
      const dy=(py-(b+.5)*.78-(random(a,b,713)-.5)*.09)/(.78*.60);
      const d=Math.pow(Math.pow(Math.abs(dx),1.55)+Math.pow(Math.abs(dy),1.55),1/1.55);
      if(d<distance){distance=d;seed=random(a,b,2137);}
    }
    const t=THREE.MathUtils.clamp((distance-.68)/.31,0,1),height=1-t*t*(3-2*t),n=y*size+x;
    heights[n]=height;field[n*4]=Math.round(height*255);field[n*4+1]=Math.round(seed*255);field[n*4+2]=0;field[n*4+3]=255;
  }
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const dx=(heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size])*.5*size/cells*.05;
    const dy=(heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x])*.5*size/(cells*.78)*.05;
    const length=Math.hypot(dx,dy,1),n=(y*size+x)*4;
    normals[n]=Math.round((.5-dx/length*.5)*255);normals[n+1]=Math.round((.5-dy/length*.5)*255);normals[n+2]=Math.round((.5+.5/length)*255);normals[n+3]=255;
  }
  const texture=data=>{const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.anisotropy=maxAnisotropy;t.needsUpdate=true;return t;};
  return leatherMaps={field:texture(field),normal:texture(normals)};
}
const noise = /* glsl */`
vec2 leatherHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy);
}
float leatherNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(leatherHash(i).x, leatherHash(i+vec2(1.,0.)).x, f.x),
    mix(leatherHash(i+vec2(0.,1.)).x, leatherHash(i+1.).x, f.x), f.y);
}
`;
const surface = /* glsl */`
varying vec3 vLeatherPoint;
varying vec3 vLeatherNormal;
uniform sampler2D uEmblem,uLeatherField,uLeatherNormal;
uniform float uScaleSize, uScaleRelief, uLeatherPatches, uLeatherWear, uEmbossDepth, uCoverEdgeWear;
uniform float uGlossVariation, uMatteShare, uLeatherSeed, uEmbossGloss;
uniform float uLeatherScaleCrush,uLeatherScaleCrushSize,uLeatherScaleCrushSeed;
uniform float uLeatherScratches,uLeatherScratchDensity,uLeatherScratchLength,uLeatherScratchWidth,uLeatherScratchDepth,uLeatherScratchSeed;
${noise}
float leatherScratch(vec2 p) {
  float pitch=max(12.,uLeatherScratchLength),aa=max(length(fwidth(p))*.35,.001),result=0.;
  vec2 cell=floor(p/pitch);
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++) {
    vec2 id=cell+vec2(float(i),float(j)),h=leatherHash(id+uLeatherScratchSeed*11.7);
    vec2 center=(id+.15+h*.7)*pitch;
    float angle=h.y*6.283185,cs=cos(angle),sn=sin(angle);
    vec2 d=p-center,q=vec2(d.x*cs+d.y*sn,-d.x*sn+d.y*cs);
    float halfLength=uLeatherScratchLength*(.22+h.x*.28);
    float distance=length(vec2(max(abs(q.x)-halfLength,0.),q.y));
    float mark=1.-smoothstep(uLeatherScratchWidth*.25,uLeatherScratchWidth*.5+aa,distance);
    result=max(result,mark*step(h.x,uLeatherScratchDensity));
  }
  return result*uLeatherScratches;
}
// Broad, continuously filtered pressure zones.  These live in millimetres and
// are evaluated in the same triplanar physical space as the scale maps, so a
// zone remains fixed to the cover while the camera or lid moves.  Two smooth
// frequencies keep the transitions organic without introducing a block grid
// or shimmer under anisotropic filtering.
float leatherScaleCrush(vec2 p) {
  float span=max(12.,uLeatherScaleCrushSize);
  vec2 seed=vec2(uLeatherScaleCrushSeed*3.71,uLeatherScaleCrushSeed*7.13);
  float broad=leatherNoise(p/span+seed);
  float contour=leatherNoise(p/(span*.43)+seed*1.91);
  float pressure=broad*.68+contour*.32;
  return smoothstep(.50,.76,pressure)*uLeatherScaleCrush;
}
vec3 leatherRelief(vec3 p, vec3 n, float height, float face) {
  vec3 dx=dFdx(p), dy=dFdy(p), rx=cross(dy,n), ry=cross(n,dx);
  float determinant=dot(dx,rx)*face;
  return normalize(max(abs(determinant),1.e-12)*n-sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry));
}
vec3 leatherNormalAt(vec3 n,vec2 uv,vec3 mapNormal,float strength) {
  vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
  vec2 sx=dFdx(uv),sy=dFdy(uv);
  vec3 rx=cross(dy,n),ry=cross(n,dx),t=rx*sx.x+ry*sy.x,b=rx*sx.y+ry*sy.y;
  float scale=inversesqrt(max(max(dot(t,t),dot(b,b)),1.e-14));
  // A nearly tangent projection has no stable tangent frame; its triplanar
  // weight tends to zero. Keep its contribution finite before blending.
  return normalize(n*max(mapNormal.z,.1)+(t*mapNormal.x+b*mapNormal.y)*scale*strength);
}
vec3 leatherMappedNormal(vec3 n,vec3 weights,vec2 uvX,vec2 uvY,vec2 uvZ,float strength) {
  vec3 a=texture2D(uLeatherNormal,uvX).xyz*2.-1.,b=texture2D(uLeatherNormal,uvY).xyz*2.-1.,c=texture2D(uLeatherNormal,uvZ).xyz*2.-1.;
  return normalize(leatherNormalAt(n,uvX,a,strength)*weights.x+leatherNormalAt(n,uvY,b,strength)*weights.y+leatherNormalAt(n,uvZ,c,strength)*weights.z);
}
`;

export async function loadEmblem() {
  const image = new Image(); image.src = './assets/ouroboros-emboss.svg'; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,1024,1024);
  ctx.drawImage(image,22,28,980,968);
  const pixels = ctx.getImageData(0,0,1024,1024);
  for (let i=0;i<pixels.data.length;i+=4) pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255-pixels.data[i];
  ctx.putImageData(pixels,0,0);
  // Small radiused stamp edges, rather than a painted, razor-edged decal.
  const softened = document.createElement('canvas'); softened.width=softened.height=1024;
  const sc=softened.getContext('2d'); sc.filter='blur(1.2px)'; sc.drawImage(canvas,0,0);
  const texture=new THREE.CanvasTexture(softened); texture.anisotropy=maxAnisotropy;
  return texture;
}

export function createCoverMaterial(settings, emblem, stamped = false) {
  const material=new THREE.MeshPhysicalMaterial({color:0x111112,roughness:.48,metalness:0,ior:1.48,clearcoat:.22,clearcoatRoughness:.35});
  const maps=proceduralLeatherMaps();
  const uniforms={uLeatherField:{value:maps.field},uLeatherNormal:{value:maps.normal},uEmblem:{value:emblem},uScaleSize:{value:settings.leatherScale},uScaleRelief:{value:settings.leatherRelief},uLeatherPatches:{value:settings.leatherPatches},uLeatherWear:{value:settings.leatherWear},uCoverEdgeWear:{value:settings.coverEdgeWear},uEmbossDepth:{value:stamped?settings.embossDepth:0},uGlossVariation:{value:settings.leatherGlossVariation},uMatteShare:{value:settings.leatherMatteShare},uLeatherSeed:{value:settings.leatherSeed},uEmbossGloss:{value:settings.embossGloss},uLeatherScaleCrush:{value:settings.leatherScaleCrush??.32},uLeatherScaleCrushSize:{value:settings.leatherScaleCrushSize??48},uLeatherScaleCrushSeed:{value:settings.leatherScaleCrushSeed??23},uLeatherScratches:{value:settings.leatherScratches},uLeatherScratchDensity:{value:settings.leatherScratchDensity},uLeatherScratchLength:{value:settings.leatherScratchLength},uLeatherScratchWidth:{value:settings.leatherScratchWidth},uLeatherScratchDepth:{value:settings.leatherScratchDepth},uLeatherScratchSeed:{value:settings.leatherScratchSeed}};
  material.userData.leather={uniforms,stamped};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLeatherPoint; varying vec3 vLeatherNormal;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvLeatherPoint=position*100.; vLeatherNormal=normal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+surface)
      .replace('#include <color_fragment>',/* glsl */`#include <color_fragment>
        vec3 leatherWeights=pow(abs(vLeatherNormal),vec3(8.));leatherWeights/=max(dot(leatherWeights,vec3(1.)),.0001);
        vec2 leatherShift=mod(vec2(uLeatherSeed*7.,uLeatherSeed*13.),32.)/32.;
        vec2 tile=vec2(32.,24.96)*uScaleSize;
        vec2 uvX=vLeatherPoint.zy/tile+leatherShift,uvY=vLeatherPoint.xz/tile+leatherShift,uvZ=vLeatherPoint.xy/tile+leatherShift;
        vec2 scaleField=texture2D(uLeatherField,uvX).rg*leatherWeights.x+texture2D(uLeatherField,uvY).rg*leatherWeights.y+texture2D(uLeatherField,uvZ).rg*leatherWeights.z;
        float scaleRoughness=(uMatteShare-scaleField.y)*.84*uGlossVariation;
        vec2 leatherP=vLeatherPoint.zy*leatherWeights.x+vLeatherPoint.xz*leatherWeights.y+vLeatherPoint.xy*leatherWeights.z;
        float crushedScales=leatherScaleCrush(leatherP);
        float patina=leatherNoise(leatherP/19.+14.9)*.65+leatherNoise(leatherP/5.8+83.7)*.35;
        float border=max(abs(vLeatherPoint.x)/140.,abs(vLeatherPoint.z)/158.);
        float edgeGrain=leatherNoise(leatherP/.72)*.6+leatherNoise(leatherP/3.1)*.4;
        float wornEdge=smoothstep(.965-edgeGrain*.025,1.,border)*uCoverEdgeWear;
        float rubbed=clamp(uLeatherWear*(smoothstep(.89,1.,border)*.25+leatherNoise(leatherP/11.)*.15)+wornEdge*.85,0.,1.);
        vec2 emblemUV=vec2(vLeatherPoint.x,-vLeatherPoint.z)/136.+.5;
        float emblem=texture2D(uEmblem,clamp(emblemUV,0.,1.)).r*step(0.,emblemUV.x)*step(emblemUV.x,1.)*step(0.,emblemUV.y)*step(emblemUV.y,1.)*smoothstep(.8,.99,abs(vLeatherNormal.y))*step(.00001,uEmbossDepth);
        float scratch=leatherScratch(vLeatherPoint.zy)*leatherWeights.x+leatherScratch(vLeatherPoint.xz)*leatherWeights.y+leatherScratch(vLeatherPoint.xy)*leatherWeights.z;
        scratch*=1.-emblem;
        float leatherHeight=-emblem*uEmbossDepth/100.-scratch*uLeatherScratchDepth/100.;
        // Compressed zones lose their micro-relief; the untouched skin gets a
        // restrained lift, making the cover read as locally pressed rather
        // than uniformly softened.  The emblem continues to bypass all scale
        // treatment and keeps its independent material response.
        float crushRelief=mix(1.+uLeatherScaleCrush*.16,.12,crushedScales);
        float normalStrength=(uScaleRelief/.05)/uScaleSize*(1.-rubbed*.8)*(1.-emblem)*crushRelief;
        diffuseColor.rgb*=mix(.80+scaleField.y*.35+patina*uLeatherPatches*.6+rubbed*1.3,1.,emblem);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.055,.052,.047),wornEdge*.65);
        diffuseColor.rgb*=1.-emblem*.16;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.07,.066,.060),scratch*.55);
      `)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=mix(clamp(roughnessFactor+(patina-.5)*uLeatherPatches*.42+(1.-scaleField.x)*.12-rubbed*.18+scaleRoughness+crushedScales*.055+scratch*.2,.06,.98),mix(.92,.08,uEmbossGloss),emblem);`)
      .replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoatRoughness=mix(clamp(material.clearcoatRoughness+scaleRoughness,.04,.98),mix(.7,.06,uEmbossGloss),emblem);\nmaterial.clearcoat=mix(material.clearcoat*(1.-max(scaleRoughness,0.)*.6),mix(.1,.6,uEmbossGloss),emblem);\n#endif`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\nnormal=leatherMappedNormal(normal,leatherWeights,uvX,uvY,uvZ,normalStrength);normal=leatherRelief(-vViewPosition,normal,leatherHeight,faceDirection);`)
      .replace('#include <clearcoat_normal_fragment_maps>',`#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\nclearcoatNormal=leatherMappedNormal(clearcoatNormal,leatherWeights,uvX,uvY,uvZ,normalStrength*.7);clearcoatNormal=leatherRelief(-vViewPosition,clearcoatNormal,leatherHeight*.7,faceDirection);\n#endif`);
  };
  material.customProgramCacheKey=()=> 'snake-leather-anisotropic-crushed-scales-v4';
  updateCoverMaterial(material,settings); return material;
}

export function updateCoverMaterial(material,settings) {
  const {uniforms,stamped}=material.userData.leather;
  uniforms.uScaleSize.value=settings.leatherScale; uniforms.uScaleRelief.value=settings.leatherRelief;
  uniforms.uLeatherPatches.value=settings.leatherPatches; uniforms.uLeatherWear.value=settings.leatherWear;
  uniforms.uCoverEdgeWear.value=settings.coverEdgeWear;
  uniforms.uGlossVariation.value=settings.leatherGlossVariation;uniforms.uMatteShare.value=settings.leatherMatteShare;uniforms.uLeatherSeed.value=settings.leatherSeed;
  uniforms.uEmbossDepth.value=stamped?settings.embossDepth:0;
  uniforms.uEmbossGloss.value=settings.embossGloss;
  uniforms.uLeatherScaleCrush.value=settings.leatherScaleCrush??.32;
  uniforms.uLeatherScaleCrushSize.value=settings.leatherScaleCrushSize??48;
  uniforms.uLeatherScaleCrushSeed.value=settings.leatherScaleCrushSeed??23;
  for(const name of ['Scratches','ScratchDensity','ScratchLength','ScratchWidth','ScratchDepth','ScratchSeed']) uniforms['uLeather'+name].value=settings['leather'+name];
  material.roughness=THREE.MathUtils.lerp(.82,.22,settings.leatherGloss);
  material.clearcoatRoughness=THREE.MathUtils.lerp(.48,.16,settings.leatherGloss);
}

export function createCutMaterial(settings,atlas) {
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.91,side:THREE.DoubleSide,map:atlas});
  const uniforms={uEdgeWear:{value:settings.edgeWear},uEdgeFibres:{value:settings.edgeFibres}};
  material.userData.cutUniforms=uniforms;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCutPoint;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvCutPoint=position*100.;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vCutPoint; uniform float uEdgeWear,uEdgeFibres;\n${noise}`)
      .replace('#include <map_fragment>',/* glsl */`#include <map_fragment>
        float sheetSeed=floor(vCutPoint.y/.38)*19.7;
        vec2 cutP=vec2(vCutPoint.x+vCutPoint.z,vCutPoint.y);
        float cutAA=max(length(fwidth(cutP)),.001);
        float fibrePitch=max(.28,cutAA*1.5);
        float fibres=(leatherNoise(cutP/vec2(fibrePitch,.15)+sheetSeed)-.5)*uEdgeFibres;
        float weather=leatherNoise(cutP/3.7+sheetSeed)*uEdgeWear;
        float exposed=clamp(.08+uEdgeFibres*(.55+fibres*.5)+weather*.28,0.,.95);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.94),exposed);
        diffuseColor.rgb*=1.-weather*.1;
      `)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+fibres*.25+weather*.08,.6,1.);');
  };
  material.customProgramCacheKey=()=> 'printed-cut-fibres-v3'; return material;
}
